import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Layers,
  Star,
  ExternalLink,
  Bookmark,
  Share2,
  Clock,
  ArrowUpDown,
  Search,
  CheckCircle2,
  Sparkles,
  Info,
  ChevronDown,
  Download,
  HardDriveDownload,
  Loader2,
  Check,
  CheckCheck,
  Eye,
  EyeOff,
  Edit3,
  X,
  Sliders,
  LayoutList,
  LayoutGrid,
  Folder,
  Globe,
  BookmarkX,
  Compass,
  Maximize2,
  ZoomIn
} from 'lucide-react';
import { Manga, Chapter, FavoriteManga, LibraryCategory, MangaUpdateInfo } from '../types/manga.js';
import { MangaApi } from '../services/api.js';
import { HistoryService } from '../services/history.js';
import { OfflineCacheService } from '../services/offlineCache.js';
import { UpdateTrackerService } from '../services/updateTracker.js';
import { TrackerService, TrackerMediaMapping } from '../services/trackerService.js';
import {
  RecommendationService,
  SimilarMangaMatch,
  SimilarityCategory,
  DetectedTropeTag
} from '../services/recommendationService.js';
import { TrackersModal } from '../components/TrackersModal.js';
import { TrackerStatusBadge } from '../components/TrackerStatusBadge.js';
import { BatchDownloadModal } from '../components/BatchDownloadModal.js';
import { CategorySelectionModal } from '../components/CategorySelectionModal.js';
import { MangaCard } from '../components/MangaCard.js';
import { RecommendationLoadingState } from '../components/RecommendationLoadingState.js';
import {
  getPreferredLanguage,
  matchesLanguageFilter,
  subscribePreferredLanguage
} from '../utils/languagePreference.js';

interface MangaDetailPageProps {
  mangaId: string;
  onBack: () => void;
  onReadChapter: (mangaId: string, chapterId: string) => void;
  onSelectManga?: (mangaId: string) => void;
  onNavigateToSearch?: (query?: string, genre?: string) => void;
}

export const MangaDetailPage: React.FC<MangaDetailPageProps> = ({
  mangaId,
  onBack,
  onReadChapter,
  onSelectManga,
  onNavigateToSearch
}) => {
  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [similarMatches, setSimilarMatches] = useState<SimilarMangaMatch[]>([]);
  const [similarMeta, setSimilarMeta] = useState<{
    corePremise?: string;
    microTropes: string[];
    anilistTags: string[];
    detectedTags: DetectedTropeTag[];
    aiPowered: boolean;
  }>({ microTropes: [], anilistTags: [], detectedTags: [], aiPowered: false });
  const [selectedFocusTags, setSelectedFocusTags] = useState<string[]>([]);
  const [customFocusInput, setCustomFocusInput] = useState('');
  const [appliedFocusQuery, setAppliedFocusQuery] = useState('');
  const [similarCategoryFilter, setSimilarCategoryFilter] = useState<'all' | SimilarityCategory>('all');
  const [hideSavedInSimilar, setHideSavedInSimilar] = useState(true);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [chaptersError, setChaptersError] = useState<string | null>(null);
  const [chapterOrder, setChapterOrder] = useState<'asc' | 'desc'>('asc');
  const [chapterSearch, setChapterSearch] = useState('');
  const [deduplicate, setDeduplicate] = useState(true);
  const [selectedLang, setSelectedLang] = useState<string>(() => getPreferredLanguage());

  useEffect(() => {
    return subscribePreferredLanguage((lang) => {
      setSelectedLang(lang);
    });
  }, []);
  const [expandedVariantsChapterId, setExpandedVariantsChapterId] = useState<string | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isIgnored, setIsIgnored] = useState(false);
  const [favoriteData, setFavoriteData] = useState<FavoriteManga | null>(null);
  const [readChapters, setReadChapters] = useState<string[]>([]);
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [modalScore, setModalScore] = useState<number>(10);
  const [modalNotes, setModalNotes] = useState<string>('');
  const [showFullSynopsis, setShowFullSynopsis] = useState(false);
  const [copied, setCopied] = useState(false);
  const [coverSrc, setCoverSrc] = useState('');
  const [coverError, setCoverError] = useState(false);
  const [savedOfflineChapterIds, setSavedOfflineChapterIds] = useState<string[]>(() => OfflineCacheService.getSavedChapterIds());
  const [cachingOfflineIds, setCachingOfflineIds] = useState<Record<string, boolean>>({});
  const [showBatchDownloadModal, setShowBatchDownloadModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<MangaUpdateInfo | undefined>(() => UpdateTrackerService.getUpdateForManga(mangaId));
  const [trackerMapping, setTrackerMapping] = useState<TrackerMediaMapping | undefined>(() => TrackerService.getMapping(mangaId));
  const [showTrackersModal, setShowTrackersModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [chapterViewMode, setChapterViewMode] = useState<'list' | 'grid'>('list');
  const [expandAllChapters, setExpandAllChapters] = useState(false);
  const [showCoverLightbox, setShowCoverLightbox] = useState(false);
  const similarSectionRef = useRef<HTMLElement>(null);

  const scrollToSimilar = () => {
    similarSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (manga?.coverUrl) {
      setCoverSrc(manga.coverUrl);
      setCoverError(false);
    }
  }, [manga?.coverUrl]);

  const handleCoverError = () => {
    if (coverSrc && !coverSrc.startsWith('/api/proxy/image') && coverSrc.startsWith('http')) {
      setCoverSrc(`/api/proxy/image?url=${encodeURIComponent(coverSrc)}`);
    } else {
      setCoverError(true);
    }
  };

  useEffect(() => {
    setSelectedFocusTags([]);
    setCustomFocusInput('');
    setAppliedFocusQuery('');
    setExpandAllChapters(false);
    setSimilarMatches([]);
    setSimilarMeta({ microTropes: [], anilistTags: [], detectedTags: [], aiPowered: false });
    loadMangaDetails();
    const fav = HistoryService.getFavorites().find(f => f.mangaId === mangaId) || null;
    setIsBookmarked(Boolean(fav));
    setIsIgnored(HistoryService.isIgnored(mangaId));
    setFavoriteData(fav);
    setReadChapters(HistoryService.getReadChapters());
    setSavedOfflineChapterIds(OfflineCacheService.getSavedChapterIds());
    setUpdateInfo(UpdateTrackerService.getUpdateForManga(mangaId));
    setTrackerMapping(TrackerService.getMapping(mangaId));

    const unsubscribe = HistoryService.subscribe(() => {
      const updatedFav = HistoryService.getFavorites().find(f => f.mangaId === mangaId) || null;
      setIsBookmarked(Boolean(updatedFav));
      setIsIgnored(HistoryService.isIgnored(mangaId));
      setFavoriteData(updatedFav);
      setReadChapters(HistoryService.getReadChapters());
    });

    const unsubscribeUpdates = UpdateTrackerService.subscribe(() => {
      setUpdateInfo(UpdateTrackerService.getUpdateForManga(mangaId));
    });

    const unsubscribeOffline = OfflineCacheService.subscribe(() => {
      setSavedOfflineChapterIds(OfflineCacheService.getSavedChapterIds());
    });

    const unsubscribeTrackers = TrackerService.subscribe(() => {
      setTrackerMapping(TrackerService.getMapping(mangaId));
    });

    return () => {
      unsubscribe();
      unsubscribeUpdates();
      unsubscribeOffline();
      unsubscribeTrackers();
    };
  }, [mangaId]);

  const loadChapters = async (isDeduplicated = deduplicate) => {
    setChaptersLoading(true);
    setChaptersError(null);
    try {
      const chaptersData = await MangaApi.getChapters(mangaId, { order: chapterOrder, deduplicate: isDeduplicated });
      setChapters(chaptersData);
    } catch (err) {
      console.warn('Failed to load chapters online, checking offline cache:', err);
      const offlineChapters = OfflineCacheService.getSavedChaptersForManga(mangaId);
      if (offlineChapters.length > 0) {
        setChapters(offlineChapters.map(oc => ({
          id: oc.chapterId,
          mangaId: oc.mangaId,
          chapterNumber: oc.chapterNumber,
          title: oc.chapterTitle,
          pagesCount: oc.pageCount,
          language: 'pt-br',
          sourceId: 'offline',
          externalChapterId: oc.chapterId
        })));
        setChaptersError(null);
      } else {
        setChaptersError((err as Error).message || 'Erro ao carregar capítulos da fonte.');
        setChapters([]);
      }
    } finally {
      setChaptersLoading(false);
    }
  };

  const loadRecommendations = async (
    targetManga: Manga,
    focusTags: string[] = [],
    focusQuery: string = ''
  ) => {
    setLoadingRecommendations(true);
    setSimilarCategoryFilter('all');
    try {
      const detailed = await RecommendationService.getSimilarMangasDetailed(targetManga, {
        hideLibrary: false,
        limit: 18,
        focusTags,
        focusQuery
      });
      setSimilarMatches(detailed.matches);
      setSimilarMeta(prev => ({
        corePremise: detailed.corePremise,
        microTropes: detailed.microTropes || [],
        anilistTags: detailed.anilistTags || [],
        detectedTags:
          detailed.detectedTags && detailed.detectedTags.length > 0
            ? detailed.detectedTags
            : prev.detectedTags,
        aiPowered: detailed.aiPowered
      }));
    } catch (err) {
      console.warn('Failed to load similar manga matches:', err);
      setSimilarMatches([]);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const handleToggleFocusTag = (tag: string) => {
    if (!manga || loadingRecommendations) return;
    const exists = selectedFocusTags.some(t => t.toLowerCase() === tag.toLowerCase());
    const nextTags = exists
      ? selectedFocusTags.filter(t => t.toLowerCase() !== tag.toLowerCase())
      : [...selectedFocusTags, tag].slice(0, 4);
    setSelectedFocusTags(nextTags);
    loadRecommendations(manga, nextTags, appliedFocusQuery);
  };

  const handleApplyCustomFocus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manga || loadingRecommendations) return;
    const trimmed = customFocusInput.trim();
    setAppliedFocusQuery(trimmed);
    loadRecommendations(manga, selectedFocusTags, trimmed);
  };

  const handleResetFocus = () => {
    if (!manga || loadingRecommendations) return;
    setSelectedFocusTags([]);
    setCustomFocusInput('');
    setAppliedFocusQuery('');
    loadRecommendations(manga, [], '');
  };

  const loadMangaDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const mangaData = await MangaApi.getMangaDetails(mangaId);
      setManga(mangaData);
      RecommendationService.rememberMangaMetadata(mangaData);
      loadRecommendations(mangaData);
    } catch (err) {
      console.warn('Failed to load manga details online, checking offline cache:', err);
      const offlineChapters = OfflineCacheService.getSavedChaptersForManga(mangaId);
      if (offlineChapters.length > 0) {
        setManga({
          id: mangaId,
          title: offlineChapters[0].mangaTitle,
          coverUrl: offlineChapters[0].mangaCover,
          altTitles: [],
          synopsis: 'Obra visualizada no modo offline com capítulos salvos no armazenamento local.',
          authors: ['Offline'],
          artists: [],
          genres: ['Offline'],
          status: 'ongoing',
          publicationInfo: {},
          updatedAt: new Date(offlineChapters[0].savedAt).toISOString(),
          sources: [
            {
              sourceId: 'offline',
              sourceName: 'Cache Offline',
              externalId: mangaId
            }
          ]
        });
        setError(null);
      } else {
        setError((err as Error).message || 'Erro ao carregar detalhes do mangá.');
      }
    } finally {
      setLoading(false);
    }

    loadChapters();
  };

  const handleToggleOfflineSaveChapter = async (e: React.MouseEvent, chapter: Chapter) => {
    e.stopPropagation();
    if (cachingOfflineIds[chapter.id]) return;

    const isSaved = savedOfflineChapterIds.includes(chapter.id);
    if (isSaved) {
      await OfflineCacheService.removeChapter(chapter.id);
    } else {
      setCachingOfflineIds(prev => ({ ...prev, [chapter.id]: true }));
      try {
        const pages = await MangaApi.getChapterPages(chapter.id);
        await OfflineCacheService.cacheChapter(chapter.id, pages, {
          mangaId: manga?.id || mangaId,
          mangaTitle: manga?.title || 'Mangá',
          mangaCover: manga?.coverUrl || '',
          chapterNumber: chapter.chapterNumber,
          chapterTitle: chapter.title
        });
      } catch (err) {
        console.error('Failed to cache chapter offline:', err);
      } finally {
        setCachingOfflineIds(prev => ({ ...prev, [chapter.id]: false }));
      }
    }
  };

  const toggleSort = () => {
    const newOrder = chapterOrder === 'asc' ? 'desc' : 'asc';
    setChapterOrder(newOrder);
    setChapters(prev => [...prev].reverse());
  };

  const handleChapterClick = (chapterId: string) => {
    UpdateTrackerService.markMangaUpdateAsSeen(mangaId);
    onReadChapter(mangaId, chapterId);
  };

  const toggleDeduplication = () => {
    const next = !deduplicate;
    setDeduplicate(next);
    loadChapters(next);
  };

  const handleBookmarkToggle = () => {
    if (!manga) return;
    const newState = HistoryService.toggleBookmark({
      mangaId: manga.id,
      title: manga.title,
      coverUrl: manga.coverUrl,
      sourceName: manga.sources[0]?.sourceName,
      sourceId: manga.sources[0]?.sourceId,
      rating: manga.rating,
      authors: manga.authors,
      genres: manga.genres,
      status: manga.status,
      synopsis: manga.synopsis,
      altTitles: manga.altTitles
    });
    if (newState && isIgnored) {
      HistoryService.unignoreManga(manga.id);
      setIsIgnored(false);
    }
    setIsBookmarked(newState);
  };

  const handleToggleIgnore = () => {
    if (!manga) return;
    const nextIgnored = HistoryService.toggleIgnoreManga({
      mangaId: manga.id,
      title: manga.title,
      coverUrl: manga.coverUrl,
      sourceId: manga.sources?.[0]?.sourceId,
      sourceName: manga.sources?.[0]?.sourceName
    });
    setIsIgnored(nextIgnored);
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCategoryChange = (category: LibraryCategory) => {
    HistoryService.updateFavoriteCategory(mangaId, category);
  };

  const handleSaveScore = () => {
    HistoryService.updateFavoriteScore(mangaId, modalScore, modalNotes);
    setShowScoreModal(false);
  };

  const handleToggleChapterRead = (e: React.MouseEvent, chapterId: string) => {
    e.stopPropagation();
    if (readChapters.includes(chapterId)) {
      HistoryService.unmarkChapterAsRead(chapterId);
    } else {
      HistoryService.markChapterAsRead(chapterId);
    }
  };

  const handleMarkUpTo = (e: React.MouseEvent, chapterId: string) => {
    e.stopPropagation();
    HistoryService.markChaptersUpTo(chapterId, chapters);
  };

  const handleMarkAllRead = () => {
    HistoryService.markAllChaptersAsRead(chapters);
  };

  const handleUnmarkAllRead = () => {
    HistoryService.unmarkAllChapters(chapters);
  };

  const readingProgress = HistoryService.getProgress(mangaId);

  // Statistics
  const totalChaptersCount = chapters.length;
  const readChaptersCount = chapters.filter(c => readChapters.includes(c.id)).length;
  const unreadChaptersCount = Math.max(0, totalChaptersCount - readChaptersCount);
  const readPercentage = totalChaptersCount > 0 ? Math.round((readChaptersCount / totalChaptersCount) * 100) : 0;

  // Unique languages among loaded chapters
  const availableLanguages = Array.from(new Set(chapters.map(c => (c.language || 'en').toLowerCase()).filter(Boolean)));

  const matchesLanguage = (lang?: string, filter: string = 'all') => {
    return matchesLanguageFilter(lang, filter);
  };

  // Check if current filter produces zero chapters while chapters exist
  const rawLanguageMatches = chapters.filter(c => matchesLanguage(c.language, selectedLang));
  const effectiveLangFilter = (rawLanguageMatches.length === 0 && chapters.length > 0 && selectedLang !== 'all') ? 'all' : selectedLang;
  const isFallbackToAll = effectiveLangFilter === 'all' && selectedLang !== 'all' && chapters.length > 0;

  // Filtered chapters
  const filteredChapters = chapters.filter(c => {
    const isRead = readChapters.includes(c.id);
    if (readFilter === 'unread' && isRead) return false;
    if (readFilter === 'read' && !isRead) return false;
    if (!matchesLanguage(c.language, effectiveLangFilter)) return false;
    if (!chapterSearch) return true;
    const q = chapterSearch.toLowerCase();
    return (
      c.chapterNumber.includes(q) ||
      (c.title && c.title.toLowerCase().includes(q)) ||
      (c.scanlationGroup && c.scanlationGroup.toLowerCase().includes(q))
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" />
          <p className="text-sm">Carregando detalhes do mangá...</p>
        </div>
      </div>
    );
  }

  if (error || !manga) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center text-zinc-400">
        <p className="text-base font-semibold text-zinc-200 mb-2">{error || 'Mangá não encontrado'}</p>
        <p className="text-xs text-zinc-500 mb-6">Não foi possível carregar os dados desta obra na fonte consultada.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
        >
          Voltar ao Catálogo
        </button>
      </div>
    );
  }

  const primarySource = manga.sources[0];
  const langMatchedForStart = chapters.filter(c => matchesLanguage(c.language, effectiveLangFilter));
  const startPool = langMatchedForStart.length > 0 ? langMatchedForStart : chapters;
  const firstChapter = startPool.length > 0 ? (chapterOrder === 'asc' ? startPool[0] : startPool[startPool.length - 1]) : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-24 md:pb-28">
      {/* Background Banner with dynamic blur */}
      <div className="relative h-56 sm:h-80 md:h-96 w-full overflow-hidden border-b border-zinc-800/80">
        <img
          src={coverSrc || manga.coverUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={handleCoverError}
          className="h-full w-full object-cover opacity-20 blur-2xl scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-transparent" />
        
        {/* Navigation bar above backdrop */}
        <div className="absolute top-4 sm:top-6 left-3 sm:left-8 z-10">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 sm:px-3.5 py-2 bg-zinc-900/80 hover:bg-zinc-900 backdrop-blur-md border border-zinc-700/60 rounded-lg text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar</span>
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 -mt-28 sm:-mt-44 md:-mt-52 relative z-10">
        {/* Header Block: Cover + Title + Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-8 items-start">
          
          {/* Left Column: Cover & Primary Action Controls */}
          <div className="md:col-span-4 lg:col-span-3 flex flex-col items-center md:items-start">
            <div
              onClick={() => (coverSrc || manga.coverUrl) && setShowCoverLightbox(true)}
              className="group/cover relative w-44 xs:w-52 sm:w-64 aspect-[3/4] rounded-xl overflow-hidden shadow-2xl border border-zinc-700/80 bg-zinc-900 shrink-0 cursor-pointer transition-transform duration-200 hover:scale-[1.02]"
              title="Clique para expandir a capa em tela cheia"
            >
              {!coverError && (coverSrc || manga.coverUrl) ? (
                <>
                  <img
                    src={coverSrc || manga.coverUrl}
                    alt={manga.title}
                    referrerPolicy="no-referrer"
                    onError={handleCoverError}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover/cover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <span className="px-3 py-1.5 rounded-xl bg-zinc-950/90 text-white text-xs font-semibold flex items-center gap-1.5 border border-zinc-700 shadow-xl backdrop-blur-md">
                      <Maximize2 className="h-3.5 w-3.5 text-rose-400" />
                      Expandir Capa
                    </span>
                  </div>
                </>
              ) : (
                <div className="relative h-full w-full flex flex-col justify-between p-4 sm:p-5 overflow-hidden bg-gradient-to-br from-zinc-900 via-rose-950/20 to-zinc-950">
                  <div className="absolute -right-3 -bottom-4 text-7xl sm:text-8xl font-serif font-black text-white/[0.04] select-none pointer-events-none">
                    漫画
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 uppercase tracking-widest border-b border-zinc-800/60 pb-2">
                    <span>VOL. 1</span>
                    <span>MANGA</span>
                  </div>
                  <div className="my-auto py-4 text-center">
                    <div className="mx-auto w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-3 shadow-inner">
                      <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <h3 className="font-serif font-bold text-sm text-zinc-100 line-clamp-3 leading-snug px-2">
                      {manga.title}
                    </h3>
                  </div>
                  <div className="pt-2 border-t border-zinc-800/60 text-center">
                    <span className="text-[10px] font-medium text-rose-300/80 uppercase tracking-wider">
                      {manga.genres?.[0] || 'Obra'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="w-full max-w-[16rem] sm:w-64 mt-4 space-y-2.5">
              {updateInfo?.hasNew && (
                <button
                  onClick={() => handleChapterClick(updateInfo.latestChapterId)}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/80 transition-all cursor-pointer animate-pulse"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Ler Novo Cap. {updateInfo.latestChapterNumber}</span>
                </button>
              )}

              {readingProgress ? (
                <button
                  onClick={() => handleChapterClick(readingProgress.chapterId)}
                  className={`w-full py-2.5 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    updateInfo?.hasNew
                      ? 'bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border border-zinc-700'
                      : 'bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white shadow-lg shadow-rose-950/60'
                  }`}
                >
                  <Clock className="h-4 w-4" />
                  <span>Continuar Cap. {readingProgress.chapterNumber} (Pág. {readingProgress.pageNumber})</span>
                </button>
              ) : firstChapter ? (
                <button
                  onClick={() => handleChapterClick(firstChapter.id)}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/60 transition-colors cursor-pointer"
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Começar a Ler (Cap. {firstChapter.chapterNumber})</span>
                </button>
              ) : (
                <div className="w-full py-2.5 px-3 rounded-lg bg-zinc-900/80 border border-zinc-800 text-center text-xs text-zinc-400 font-light">
                  Nenhum capítulo legível neste provedor no momento
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleBookmarkToggle}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-95 ${
                    isBookmarked
                      ? 'bg-rose-600 border-rose-500 text-white shadow-rose-950/60'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-200 hover:text-white'
                  }`}
                  title={isBookmarked ? 'Remover dos Favoritos' : 'Salvar na Biblioteca'}
                >
                  <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-white' : ''}`} />
                  <span>{isBookmarked ? 'Salvo na Biblioteca' : 'Salvar na Biblioteca'}</span>
                </button>

                <button
                  onClick={() => setShowCategoryModal(true)}
                  className="px-3 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                  title="Gerenciar Categorias (Mihon)"
                >
                  <Folder className="h-3.5 w-3.5 text-rose-400" />
                  <span className="text-[11px]">Categorias</span>
                </button>

                <button
                  onClick={handleShare}
                  className="px-3 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  title="Copiar link"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Botão Dispensar ("Não vou ler") — oculta das buscas sem salvar nos favoritos */}
              {(!isBookmarked || isIgnored) && (
                <button
                  type="button"
                  onClick={handleToggleIgnore}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-medium border flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    isIgnored
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                      : 'bg-zinc-900/70 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={isIgnored ? 'Esta obra está oculta das buscas. Clique para restaurar.' : 'Marcar como "não vou ler" para ocultar das pesquisas sem favoritar'}
                >
                  {isIgnored ? <Eye className="h-3.5 w-3.5 text-emerald-400" /> : <EyeOff className="h-3.5 w-3.5" />}
                  <span>{isIgnored ? 'Dispensado das Buscas (Restaurar)' : 'Não vou ler (Ocultar das buscas)'}</span>
                </button>
              )}

              {/* Badges de Categorias Personalizadas (Mihon) */}
              {isBookmarked && favoriteData?.customCollections && favoriteData.customCollections.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {favoriteData.customCollections.map((col) => (
                    <button
                      key={col}
                      onClick={() => setShowCategoryModal(true)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:border-rose-400 cursor-pointer transition-colors"
                      title="Alterar categorias"
                    >
                      <Folder className="h-2.5 w-2.5 text-rose-400" />
                      <span>{col}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Status and Rating controls (when bookmarked) */}
              {isBookmarked && (
                <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 text-[11px] font-medium">Status</span>
                    <select
                      value={favoriteData?.userCategory || 'reading'}
                      onChange={(e) => handleCategoryChange(e.target.value as LibraryCategory)}
                      className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-rose-300 font-semibold focus:outline-none focus:border-rose-500 cursor-pointer"
                    >
                      <option value="reading">Lendo</option>
                      <option value="plan_to_read">Quero Ler</option>
                      <option value="completed">Completo</option>
                      <option value="on_hold">Pausado</option>
                      <option value="dropped">Abandonado</option>
                    </select>
                  </div>

                  <button
                    onClick={() => {
                      setModalScore(favoriteData?.userScore || 10);
                      setModalNotes(favoriteData?.userNotes || '');
                      setShowScoreModal(true);
                    }}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/40 text-xs font-medium text-zinc-300 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Star className={`h-3.5 w-3.5 ${favoriteData?.userScore ? 'fill-amber-400 text-amber-400' : 'text-zinc-500'}`} />
                      <span>{favoriteData?.userScore ? `Minha Nota: ${favoriteData.userScore}/10` : 'Avaliar obra'}</span>
                    </span>
                    <Edit3 className="h-3 w-3 text-zinc-500" />
                  </button>
                </div>
              )}

              {/* Rastreamento & Vínculos (AniList & MyAnimeList) */}
              <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="font-semibold text-zinc-300 flex items-center gap-1">
                    <Sliders className="h-3 w-3 text-sky-400" />
                    Rastreamento
                  </span>
                  <button
                    onClick={() => setShowTrackersModal(true)}
                    className="text-sky-400 hover:underline cursor-pointer"
                  >
                    {trackerMapping?.anilistId || trackerMapping?.malId ? 'Alterar' : 'Vincular'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {trackerMapping?.anilistId ? (
                    <a
                      href={`https://anilist.co/manga/${trackerMapping.anilistId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-950/40 border border-sky-800/60 text-[10px] font-medium text-sky-300 hover:bg-sky-900/50 transition-colors"
                      title="Abrir página oficial no AniList"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                      AniList #{trackerMapping.anilistId}
                      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-500">
                      AniList: Não vinculado
                    </span>
                  )}

                  {trackerMapping?.malId ? (
                    <a
                      href={`https://myanimelist.net/manga/${trackerMapping.malId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-950/40 border border-blue-800/60 text-[10px] font-medium text-blue-300 hover:bg-blue-900/50 transition-colors"
                      title="Abrir página oficial no MyAnimeList"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                      MAL #{trackerMapping.malId}
                      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-500">
                      MAL: Não vinculado
                    </span>
                  )}
                </div>
              </div>

              {copied && (
                <p className="text-[11px] text-emerald-400 text-center">Link copiado para a área de transferência!</p>
              )}
            </div>
          </div>

          {/* Right Column: Editorial Metadata & Description */}
          <div className="md:col-span-8 lg:col-span-9 flex flex-col justify-start pt-2">
            
            {/* Unboxed Metadata Header */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mb-2">
              <span className="font-semibold text-rose-400">
                {manga.status === 'ongoing' ? 'Em Lançamento' : manga.status === 'completed' ? 'Completo' : 'Em Hiato'}
              </span>
              {manga.publicationInfo?.demographic && manga.publicationInfo.demographic.toLowerCase() !== 'demografia' && (
                <>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span className="capitalize">{manga.publicationInfo.demographic}</span>
                </>
              )}
              {manga.publicationInfo.releaseYear && (
                <>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span className="font-mono tabular-nums">{manga.publicationInfo.releaseYear}</span>
                </>
              )}
              {manga.rating && (
                <>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span className="flex items-center gap-1 text-amber-300 font-mono tabular-nums">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {manga.rating.toFixed(1)} / 10
                  </span>
                </>
              )}
              {manga.isAdult && (
                <>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span className="bg-rose-500/15 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold">
                    +18 Conteúdo Adulto
                  </span>
                </>
              )}
              {manga.hasAvailableChapters === false && (
                <>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] font-medium">
                    Apenas Catálogo
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 mb-2">
              <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white text-balance">
                {manga.title}
              </h1>
              <TrackerStatusBadge
                mangaId={mangaId}
                mangaTitle={manga.title}
                size="md"
                showLabel={true}
                onOpenTrackers={() => setShowTrackersModal(true)}
              />
            </div>

            {/* Alternative Titles */}
            {manga.altTitles.length > 0 && (
              <div className="text-xs text-zinc-400 mb-4 flex flex-wrap gap-x-2">
                <span className="text-zinc-500">Títulos alternativos:</span>
                <span>{manga.altTitles.slice(0, 3).join(' / ')}</span>
              </div>
            )}

            {/* Creators & Publication Specs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 mb-5 sm:mb-6 text-xs">
              <div>
                <span className="text-zinc-500 block mb-0.5">Autor</span>
                <button
                  type="button"
                  onClick={() => onNavigateToSearch?.(manga.authors.join(' '))}
                  className="font-medium text-zinc-200 hover:text-rose-400 transition-colors text-left line-clamp-1 cursor-pointer"
                  title="Pesquisar outras obras deste autor"
                >
                  {manga.authors.join(', ')}
                </button>
              </div>
              <div>
                <span className="text-zinc-500 block mb-0.5">Artista</span>
                <button
                  type="button"
                  onClick={() => onNavigateToSearch?.(manga.artists.join(' '))}
                  className="font-medium text-zinc-200 hover:text-rose-400 transition-colors text-left line-clamp-1 cursor-pointer"
                  title="Pesquisar outras obras deste artista"
                >
                  {manga.artists.join(', ')}
                </button>
              </div>
              <div>
                <span className="text-zinc-500 block mb-0.5">Revista / Veículo</span>
                <span className="font-medium text-zinc-200 line-clamp-1">{manga.publicationInfo.magazine || 'N/A'}</span>
              </div>
              <div>
                <span className="text-zinc-500 block mb-0.5">Origem</span>
                <span className="font-medium text-zinc-200 line-clamp-1">{manga.publicationInfo.country || 'JP'}</span>
              </div>
            </div>

            {/* Clickable Genres Tags */}
            <div className="flex flex-wrap items-center gap-1.5 mb-6">
              <span className="text-xs text-zinc-500 mr-1">Gêneros:</span>
              {manga.genres.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => onNavigateToSearch?.('', g)}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900/80 hover:bg-rose-950/30 text-zinc-300 hover:text-rose-400 border border-zinc-800 hover:border-rose-500/30 text-xs font-medium transition-all cursor-pointer shadow-sm"
                  title={`Ver catálogo filtrado por ${g}`}
                >
                  #{g}
                </button>
              ))}
            </div>

            {/* Synopsis */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-200 mb-2">Sinopse</h3>
              <p className={`text-sm text-zinc-300 leading-relaxed font-light ${!showFullSynopsis && 'line-clamp-4'}`}>
                {manga.synopsis}
              </p>
              {manga.synopsis.length > 250 && (
                <button
                  onClick={() => setShowFullSynopsis(!showFullSynopsis)}
                  className="mt-2 text-xs text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                >
                  {showFullSynopsis ? 'Mostrar menos' : 'Ler sinopse completa...'}
                </button>
              )}
            </div>

            {/* Internal Domain & Multi-Source Identification Block (Explicitly fulfilling Sections 5, 7, 8) */}
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/70 text-xs">
              <div className="flex items-center gap-2 text-zinc-400 font-semibold mb-2">
                <Info className="h-4 w-4 text-rose-400" />
                <span>Arquitetura de Dados & Desacoplamento de Fontes</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-zinc-400">
                <div>
                  <span className="text-zinc-500 block">ID Interno MangaReader:</span>
                  <code className="text-zinc-200 font-mono text-[11px] bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 inline-block mt-0.5">
                    {manga.id}
                  </code>
                </div>
                <div>
                  <span className="text-zinc-500 block">Provedor de Origem:</span>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span className="text-zinc-300 font-medium">
                      {primarySource?.sourceName || primarySource?.sourceId}
                    </span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      Live API
                    </span>
                    <span className="text-zinc-500 font-mono text-[11px]">
                      (extId: {primarySource?.externalId})
                    </span>
                    {primarySource?.url && (
                      <a
                        href={primarySource.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-rose-400 hover:text-rose-300"
                        title="Ver no provedor oficial externo"
                      >
                        <ExternalLink className="h-3 w-3 inline" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Multi-Source Switcher if consolidated across multiple providers */}
              {manga.sources.length > 1 && onSelectManga && (
                <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex flex-wrap items-center gap-2">
                  <span className="text-zinc-500 text-[11px]">Fontes conectadas para esta obra:</span>
                  {manga.sources.map(s => {
                    const targetInternalId = `mr_${s.sourceId}_${s.externalId}`;
                    const isCurrent = targetInternalId === manga.id;
                    return (
                      <button
                        key={s.sourceId + s.externalId}
                        disabled={isCurrent}
                        onClick={() => onSelectManga(targetInternalId)}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors border ${
                          isCurrent
                            ? 'bg-zinc-800 text-emerald-400 border-emerald-500/40 cursor-default'
                            : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-800 cursor-pointer'
                        }`}
                      >
                        <span>{s.sourceName || s.sourceId}</span>
                        {isCurrent && <span className="ml-1 text-[9px] opacity-75">(ativa)</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Chapters Section */}
        <section className="mt-14 pt-8 border-t border-zinc-800">
          {/* New Chapter Release Alert Banner */}
          {updateInfo?.hasNew && (
            <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-rose-950/40 via-zinc-900/70 to-zinc-900/40 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-lg animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">
                    Novo capítulo disponível: <span className="text-rose-400 font-mono">Capítulo {updateInfo.latestChapterNumber}</span>
                  </p>
                  <p className="text-zinc-400 text-xs mt-0.5">
                    {updateInfo.lastReadNumber ? `Você leu até o capítulo ${updateInfo.lastReadNumber}. Aproveite o novo lançamento!` : 'Nova atualização sincronizada diretamente dos provedores ao vivo.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleChapterClick(updateInfo.latestChapterId)}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors shrink-0 cursor-pointer shadow-md shadow-rose-950/40 flex items-center justify-center gap-1.5"
              >
                <span>Ler Novo Capítulo</span>
                <span>→</span>
              </button>
            </div>
          )}

          {/* Live Provider status indicator */}
          {primarySource?.sourceId === 'comick' && (
            <div className="mb-6 p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                <strong>Obra do Comick (Ao Vivo):</strong> capítulos conectados diretamente à CDN e integrados com fallback automático via MangaDex.
              </span>
            </div>
          )}

          {primarySource?.sourceId === 'weebcentral' && (
            <div className="mb-6 p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                <strong>Obra do WeebCentral (Ao Vivo):</strong> scans de alta resolução conectados diretamente à CDN sem restrições de licenciamento.
              </span>
            </div>
          )}

          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                  <span>Capítulos Disponíveis</span>
                  <span className="text-xs font-normal text-zinc-400 font-mono tabular-nums">
                    ({filteredChapters.length}{filteredChapters.length !== chapters.length ? ` de ${chapters.length}` : ''})
                  </span>
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Selecione um capítulo para iniciar a leitura imediata
                </p>
              </div>

              {/* Filter and Sort controls */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-52">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Filtrar capítulo ou scan..."
                    value={chapterSearch}
                    onChange={(e) => setChapterSearch(e.target.value)}
                    className="pl-8 pr-3 py-2 sm:py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-rose-500 w-full"
                  />
                </div>

                <button
                  onClick={toggleDeduplication}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                    deduplicate
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={
                    deduplicate
                      ? 'Agrupamento ativo: scanlations e clones são unificados em versões'
                      : 'Modo expandido: todos os uploads avulsos são exibidos'
                  }
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>{deduplicate ? 'Agrupado' : 'Todas as Versões'}</span>
                </button>

                <button
                  onClick={toggleSort}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
                  title="Inverter ordem"
                >
                  <ArrowUpDown className="h-3.5 w-3.5 text-rose-400" />
                  <span>{chapterOrder === 'asc' ? '1 → Fim' : 'Fim → 1'}</span>
                </button>

                {/* Batch Download Button */}
                <button
                  onClick={() => setShowBatchDownloadModal(true)}
                  disabled={chapters.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/40 rounded-lg text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                  title="Baixar múltiplos capítulos para leitura offline em lote"
                >
                  <HardDriveDownload className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Baixar em Lote</span>
                  <span className="sm:hidden">Lote</span>
                </button>

                {/* View Mode Switcher (List vs Grid) */}
                <div className="flex items-center rounded-lg bg-zinc-900 border border-zinc-800 p-0.5" role="group" aria-label="Modo de visualização dos capítulos">
                  <button
                    type="button"
                    onClick={() => setChapterViewMode('list')}
                    className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                      chapterViewMode === 'list'
                        ? 'bg-zinc-800 text-rose-400 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-200'
                    }`}
                    title="Visualização em Lista Detalhada com scans e páginas"
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setChapterViewMode('grid')}
                    className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                      chapterViewMode === 'grid'
                        ? 'bg-zinc-800 text-rose-400 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-200'
                    }`}
                    title="Visualização em Grade Numérica (ideal para obras com muitos capítulos)"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                </div>

                {(loadingRecommendations || similarMatches.length > 0) && (
                  <button
                    type="button"
                    onClick={scrollToSimilar}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-xs font-medium text-amber-300 hover:text-amber-200 transition-colors cursor-pointer"
                    title="Ir direto para as recomendações similares abaixo dos capítulos"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    <span>Similares</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Reading Progress Overview Bar */}
            {totalChaptersCount > 0 && (
              <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-zinc-300 font-medium flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-rose-400" />
                      <span>Progresso de Leitura:</span>
                      <strong className="text-white font-mono">{readChaptersCount}</strong> de <strong className="text-white font-mono">{totalChaptersCount}</strong> capítulos ({readPercentage}%)
                    </span>
                    <span className="text-zinc-500 font-mono text-[11px]">{unreadChaptersCount} restantes</span>
                  </div>
                  <div className="h-2 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/80">
                    <div
                      className="h-full bg-gradient-to-r from-rose-500 via-rose-400 to-emerald-400 rounded-full transition-all duration-300"
                      style={{ width: `${readPercentage}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 hover:border-emerald-500/40 text-[11px] font-medium text-zinc-300 hover:text-emerald-300 transition-colors cursor-pointer flex items-center gap-1"
                    title="Marcar todos os capítulos deste mangá como lidos"
                  >
                    <CheckCheck className="h-3 w-3 text-emerald-400" />
                    <span>Marcar todos</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleUnmarkAllRead}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 hover:border-rose-500/40 text-[11px] font-medium text-zinc-400 hover:text-rose-300 transition-colors cursor-pointer"
                    title="Remover marcação de lido de todos os capítulos"
                  >
                    <span>Desmarcar todos</span>
                  </button>
                </div>
              </div>
            )}

            {/* Read status & Language filter pills */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-zinc-850">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-zinc-400 mr-1">Status:</span>
                <button
                  onClick={() => setReadFilter('all')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    readFilter === 'all'
                      ? 'bg-zinc-800 text-rose-400 border border-rose-500/30 font-semibold'
                      : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                  }`}
                >
                  Todos ({totalChaptersCount})
                </button>
                <button
                  onClick={() => setReadFilter('unread')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    readFilter === 'unread'
                      ? 'bg-zinc-800 text-rose-400 border border-rose-500/30 font-semibold'
                      : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                  }`}
                >
                  Não Lidos ({unreadChaptersCount})
                </button>
                <button
                  onClick={() => setReadFilter('read')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    readFilter === 'read'
                      ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/30 font-semibold'
                      : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                  }`}
                >
                  Lidos ({readChaptersCount})
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-zinc-400 mr-1 flex items-center gap-1">
                  <Globe className="h-3 w-3 text-rose-400" />
                  <span>Idioma:</span>
                </span>
                <button
                  onClick={() => setSelectedLang('all')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    effectiveLangFilter === 'all' && selectedLang === 'all'
                      ? 'bg-zinc-800 text-rose-400 border border-rose-500/30 font-semibold'
                      : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                  }`}
                >
                  Todos ({chapters.length})
                </button>
                <button
                  onClick={() => setSelectedLang('pt-br,en')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    selectedLang === 'pt-br,en'
                      ? 'bg-zinc-800 text-rose-400 border border-rose-500/30 font-semibold'
                      : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                  }`}
                  title="Filtrar capítulos em Português e Inglês"
                >
                  PT-BR + EN
                </button>
                <button
                  onClick={() => setSelectedLang('pt-br')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    selectedLang === 'pt-br' || selectedLang === 'pt'
                      ? 'bg-zinc-800 text-rose-400 border border-rose-500/30 font-semibold'
                      : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                  }`}
                  title="Filtrar capítulos em Português"
                >
                  PT-BR ({chapters.filter(c => matchesLanguage(c.language, 'pt-br')).length})
                </button>
                <button
                  onClick={() => setSelectedLang('en')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    selectedLang === 'en'
                      ? 'bg-zinc-800 text-rose-400 border border-rose-500/30 font-semibold'
                      : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                  }`}
                  title="Filtrar capítulos em Inglês"
                >
                  EN ({chapters.filter(c => matchesLanguage(c.language, 'en')).length})
                </button>
                {availableLanguages.filter(l => l !== 'pt-br' && l !== 'pt' && l !== 'en' && l !== 'default').map((lang) => {
                  const count = chapters.filter(c => (c.language || '').toLowerCase() === lang).length;
                  return (
                    <button
                      key={lang}
                      onClick={() => setSelectedLang(lang)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase transition-colors cursor-pointer ${
                        selectedLang === lang
                          ? 'bg-zinc-800 text-rose-400 border border-rose-500/30 font-semibold'
                          : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                      }`}
                    >
                      {lang} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Fallback notice if user preference yielded 0 chapters */}
            {isFallbackToAll && (
              <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 text-xs text-amber-300 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>
                    Nenhum capítulo encontrado no seu idioma preferido (<strong>{selectedLang.toUpperCase()}</strong>). Exibindo capítulos em outros idiomas disponíveis.
                  </span>
                </div>
                <button
                  onClick={() => setSelectedLang('all')}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded text-[11px] font-medium shrink-0 cursor-pointer"
                >
                  Ver Todos
                </button>
              </div>
            )}
          </div>

          {/* Chapters List */}
          {chaptersLoading ? (
            <div className="p-8 text-center text-zinc-500 bg-zinc-900/30 rounded-xl border border-zinc-800/60 flex flex-col items-center justify-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" />
              <p className="text-xs">
                Consultando capítulos no provedor externo...
              </p>
            </div>
          ) : chaptersError ? (
            <div className="p-8 text-center text-zinc-400 bg-zinc-900/40 rounded-xl border border-rose-900/40 flex flex-col items-center justify-center gap-2">
              <p className="text-sm font-medium text-rose-300">
                Não foi possível carregar os capítulos do provedor externo
              </p>
              <p className="text-xs text-zinc-500 max-w-md">{chaptersError}</p>
              <button
                onClick={() => loadChapters()}
                className="mt-2 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : filteredChapters.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 bg-zinc-900/40 rounded-xl border border-zinc-800/80 max-w-xl mx-auto">
              <BookOpen className="h-10 w-10 mx-auto mb-3 text-zinc-600" />
              <p className="text-base font-semibold text-zinc-200 mb-1">
                {chapterSearch
                  ? 'Nenhum capítulo encontrado correspondente à busca.'
                  : 'Nenhum capítulo disponível para leitura nesta fonte.'}
              </p>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                {chapterSearch
                  ? 'Tente pesquisar por outro número ou limpe o campo de busca.'
                  : 'Esta obra está registrada com metadados no catálogo, mas não há capítulos hospedados para leitura online no momento.'}
              </p>
              {manga.sources.length > 1 && onSelectManga && (
                <div className="mt-5 pt-4 border-t border-zinc-800/80">
                  <p className="text-xs text-zinc-300 font-medium mb-2.5">
                    Esta obra também está cadastrada em outros provedores:
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {manga.sources
                      .filter(s => `mr_${s.sourceId}_${s.externalId}` !== manga.id)
                      .map(s => (
                        <button
                          key={s.sourceId + s.externalId}
                          onClick={() => onSelectManga(`mr_${s.sourceId}_${s.externalId}`)}
                          className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-md"
                        >
                          Ver no {s.sourceName || s.sourceId}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div
                className={
                  filteredChapters.length > 24 && !expandAllChapters
                    ? 'max-h-[540px] overflow-y-auto pr-1.5 rounded-2xl border border-zinc-800/70 bg-zinc-950/30 p-2.5 sm:p-3'
                    : ''
                }
              >
                {chapterViewMode === 'grid' ? (
            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-4 border-b border-zinc-800/60 text-xs text-zinc-400">
                <span className="font-sans">Selecione o número do capítulo para iniciar a leitura imediata</span>
                <div className="flex items-center gap-3.5 text-[11px] font-sans">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-500/50"></span> Lido</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-rose-500/20 border border-rose-500/50"></span> Em Leitura</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-zinc-800 border border-zinc-700"></span> Não Lido</span>
                </div>
              </div>
              <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1.5 sm:gap-2">
                {filteredChapters.map((chapter) => {
                  const isRead = readChapters.includes(chapter.id);
                  const isCurrentRead = readingProgress?.chapterId === chapter.id;
                  const isNew = updateInfo?.latestChapterId === chapter.id;
                  const isSavedOffline = savedOfflineChapterIds.includes(chapter.id);

                  return (
                    <button
                      key={chapter.id}
                      onClick={() => handleChapterClick(chapter.id)}
                      title={`Capítulo ${chapter.chapterNumber}${chapter.title ? ` - ${chapter.title}` : ''} (${chapter.scanlationGroup || 'Scan'})`}
                      className={`relative flex flex-col items-center justify-center py-2.5 px-2 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer border group hover:-translate-y-0.5 ${
                        isCurrentRead
                          ? 'bg-rose-950/40 border-rose-500 text-white shadow-md shadow-rose-950/40 ring-1 ring-rose-500/50'
                          : isRead
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400 hover:border-emerald-500/60 hover:bg-emerald-950/30'
                          : 'bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        {isRead && <Check className="h-3 w-3 text-emerald-400 shrink-0" />}
                        <span className="tabular-nums font-bold">c.{chapter.chapterNumber}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 truncate max-w-[80px] font-sans mt-0.5">
                        {chapter.scanlationGroup || chapter.language.toUpperCase()}
                      </span>
                      {isNew && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 border border-zinc-950 animate-pulse" title="Novo Capítulo" />
                      )}
                      {isSavedOffline && (
                        <span className="absolute bottom-1 right-1 text-emerald-400 text-[9px]" title="Salvo Offline">
                          ↓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredChapters.map((chapter) => {
                const isRead = readChapters.includes(chapter.id);
                const isCurrentRead = readingProgress?.chapterId === chapter.id;
                const hasVariants = Boolean(chapter.variants && chapter.variants.length > 0);
                const isExpanded = expandedVariantsChapterId === chapter.id;

                return (
                  <div
                    key={chapter.id}
                    className={`group flex flex-col p-3 sm:p-3.5 rounded-xl border transition-all ${
                      isCurrentRead
                        ? 'bg-rose-950/20 border-rose-800/60'
                        : isRead
                        ? 'bg-zinc-950/50 border-zinc-800/60 opacity-85 hover:opacity-100'
                        : 'bg-zinc-900/60 hover:bg-zinc-900/90 border-zinc-800/80 hover:border-zinc-700'
                    }`}
                  >
                    <div
                      onClick={() => handleChapterClick(chapter.id)}
                      className="flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 overflow-hidden">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-mono font-medium tabular-nums transition-colors ${
                          isRead
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-400'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-300 group-hover:border-rose-500/50 group-hover:text-rose-400'
                        }`}>
                          {chapter.chapterNumber}
                        </div>

                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                            <span className="font-semibold text-xs text-zinc-200 line-clamp-1 group-hover:text-rose-400 transition-colors">
                              Capítulo {chapter.chapterNumber}
                              {chapter.title && ` - ${chapter.title}`}
                            </span>

                            {isRead && (
                              <span className="text-[10px] bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-0.5 font-medium shrink-0">
                                <Check className="h-2.5 w-2.5" />
                                <span>Lido</span>
                              </span>
                            )}

                            {chapter.scanlationGroup && (
                              <span className="text-[10px] bg-zinc-800/90 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700/60 font-mono truncate max-w-[120px] sm:max-w-none">
                                {chapter.scanlationGroup}
                              </span>
                            )}

                            {chapter.edition && chapter.edition !== 'standard' && (
                              <span className="text-[10px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 uppercase font-mono font-medium">
                                {chapter.edition}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] text-zinc-400 mt-1 truncate">
                            {chapter.releaseDate && <span>{chapter.releaseDate}</span>}
                            {chapter.pagesCount && (
                              <>
                                <span aria-hidden="true" className="text-zinc-600">·</span>
                                <span className="font-mono tabular-nums">{chapter.pagesCount} págs</span>
                              </>
                            )}
                            <span aria-hidden="true" className="text-zinc-600">·</span>
                            <span className="uppercase text-[10px] text-zinc-400 font-mono">{chapter.language}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                        {isCurrentRead && (
                          <span className="hidden sm:inline-block text-[11px] font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">
                            Em Leitura
                          </span>
                        )}

                        {/* Toggle Read Single Chapter Button */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleChapterRead(e, chapter.id)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isRead
                              ? 'text-emerald-400 bg-emerald-500/10 hover:bg-zinc-800'
                              : 'text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800'
                          }`}
                          title={isRead ? 'Capítulo lido (clique para marcar como não lido)' : 'Marcar capítulo como lido'}
                        >
                          <CheckCircle2 className={`h-4 w-4 ${isRead ? 'fill-emerald-500/20' : ''}`} />
                        </button>

                        {/* Mark Up To Here Button */}
                        <button
                          type="button"
                          onClick={(e) => handleMarkUpTo(e, chapter.id)}
                          className="flex items-center gap-1 px-2 py-1.5 sm:py-1 rounded-md text-[10px] font-medium bg-zinc-850 hover:bg-emerald-950/50 text-zinc-400 hover:text-emerald-300 border border-zinc-750 hover:border-emerald-500/40 transition-colors cursor-pointer"
                          title={`Marcar o Capítulo ${chapter.chapterNumber} e todos os anteriores como lidos`}
                        >
                          <CheckCheck className="h-3.5 w-3.5 sm:h-3 sm:w-3 text-emerald-400" />
                          <span className="hidden sm:inline">Até aqui</span>
                        </button>

                        {hasVariants && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedVariantsChapterId(isExpanded ? null : chapter.id);
                            }}
                            className="flex items-center gap-1 px-2 py-1.5 sm:py-1 rounded-md text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-colors cursor-pointer"
                            title="Alternar versões/scans deste capítulo"
                          >
                            <Layers className="h-3 w-3" />
                            <span>+{chapter.variants!.length}</span>
                            <ChevronDown className={`h-2.5 w-2.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        )}

                        {/* Offline PWA Cache Button */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleOfflineSaveChapter(e, chapter)}
                          disabled={Boolean(cachingOfflineIds[chapter.id])}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            savedOfflineChapterIds.includes(chapter.id)
                              ? 'text-emerald-400 bg-emerald-500/10 hover:bg-rose-500/10 hover:text-rose-400'
                              : 'text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800'
                          }`}
                          title={
                            savedOfflineChapterIds.includes(chapter.id)
                              ? 'Salvo offline no Cache do PWA (Clique para remover)'
                              : 'Salvar no Cache do PWA para leitura 100% offline'
                          }
                        >
                          {cachingOfflineIds[chapter.id] ? (
                            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                          ) : (
                            <HardDriveDownload className={`h-4 w-4 ${savedOfflineChapterIds.includes(chapter.id) ? 'fill-emerald-500/20' : ''}`} />
                          )}
                        </button>

                        {/* Download CBZ */}
                        <a
                          href={`/api/chapters/${encodeURIComponent(chapter.id)}/download?format=cbz`}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="hidden sm:inline-flex px-1.5 py-0.5 text-zinc-400 hover:text-rose-400 text-[10px] font-mono border border-zinc-800 hover:border-rose-500/30 rounded transition-colors"
                          title="Baixar capítulo em formato ComicBook (.cbz)"
                        >
                          CBZ
                        </a>

                        {/* Download PDF */}
                        <a
                          href={`/api/chapters/${encodeURIComponent(chapter.id)}/download?format=pdf`}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="hidden sm:inline-flex px-1.5 py-0.5 text-zinc-400 hover:text-rose-400 text-[10px] font-mono border border-zinc-800 hover:border-rose-500/30 rounded transition-colors"
                          title="Baixar capítulo em documento PDF"
                        >
                          PDF
                        </a>

                        <button
                          type="button"
                          className="hidden sm:inline-flex p-1.5 text-zinc-500 group-hover:text-rose-400 transition-colors"
                          title="Ler agora"
                        >
                          <BookOpen className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Expandable variants list */}
                    {hasVariants && isExpanded && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-3 pt-3 border-t border-zinc-800/80 space-y-1.5 animate-in fade-in duration-150"
                      >
                        <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 mb-1">
                          <span>Versões disponíveis para o Capítulo {chapter.chapterNumber}:</span>
                        </div>

                        {/* Primary variant */}
                        <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/60 text-xs">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold uppercase">
                              Padrão
                            </span>
                            <span className="text-zinc-200 font-medium truncate">
                              {chapter.scanlationGroup || chapter.sourceId}
                            </span>
                            {chapter.pagesCount && (
                              <span className="text-[10px] text-zinc-500 font-mono">
                                ({chapter.pagesCount} págs)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`/api/chapters/${encodeURIComponent(chapter.id)}/download?format=cbz`}
                              download
                              onClick={(e) => e.stopPropagation()}
                              className="p-1 text-zinc-500 hover:text-rose-400 transition-colors"
                              title="Baixar versão padrão (.cbz)"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                            <button
                              onClick={() => handleChapterClick(chapter.id)}
                              className="px-2.5 py-1 bg-zinc-800 hover:bg-rose-600 text-zinc-200 hover:text-white rounded text-[11px] font-medium transition-colors cursor-pointer"
                            >
                              Ler
                            </button>
                          </div>
                        </div>

                        {/* Other variants */}
                        {chapter.variants!.map((v) => (
                          <div
                            key={v.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 border border-zinc-800/40 text-xs hover:border-zinc-700/70 transition-colors"
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium uppercase">
                                {v.sourceName || v.sourceId}
                              </span>
                              <span className="text-zinc-300 font-medium truncate">
                                {v.scanlationGroup || v.title || 'Versão Alternativa'}
                              </span>
                              {v.pagesCount && (
                                <span className="text-[10px] text-zinc-500 font-mono">
                                  ({v.pagesCount} págs)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <a
                                href={`/api/chapters/${encodeURIComponent(v.id)}/download?format=cbz`}
                                download
                                onClick={(e) => e.stopPropagation()}
                                className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 hover:text-rose-400 border border-zinc-800 hover:border-rose-500/30 rounded transition-colors"
                                title="Baixar esta versão (.cbz)"
                              >
                                CBZ
                              </a>
                              <a
                                href={`/api/chapters/${encodeURIComponent(v.id)}/download?format=pdf`}
                                download
                                onClick={(e) => e.stopPropagation()}
                                className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 hover:text-rose-400 border border-zinc-800 hover:border-rose-500/30 rounded transition-colors"
                                title="Baixar esta versão (.pdf)"
                              >
                                PDF
                              </a>
                              <button
                                onClick={() => handleChapterClick(v.id)}
                                className="px-2.5 py-1 bg-zinc-800 hover:bg-rose-600 text-zinc-200 hover:text-white rounded text-[11px] font-medium transition-colors cursor-pointer"
                              >
                                Ler
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
              </div>

              {filteredChapters.length > 24 && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-900/50 border border-zinc-800/70 text-xs text-zinc-400">
                  <span>
                    {expandAllChapters
                      ? `Exibindo todos os ${filteredChapters.length} capítulos expandidos`
                      : `Lista compactada em painel rolável (${filteredChapters.length} capítulos) para facilitar a navegação`}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandAllChapters(prev => !prev)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/70 text-[11px] font-medium text-zinc-200 transition-colors cursor-pointer"
                    >
                      {expandAllChapters ? 'Recolher altura' : 'Expandir lista completa'}
                    </button>
                    {(loadingRecommendations || similarMatches.length > 0) && (
                      <button
                        type="button"
                        onClick={scrollToSimilar}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-[11px] font-medium text-amber-300 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>Ver Similares</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Similar & Recommended Manga Section (Hybrid AI + MangaUpdates + AniList + Focus Steering) */}
        {(loadingRecommendations || similarMatches.length > 0 || selectedFocusTags.length > 0 || Boolean(appliedFocusQuery)) && (
          <section ref={similarSectionRef} className="mt-14 pt-8 border-t border-zinc-800 scroll-mt-20">
            {loadingRecommendations && similarMatches.length === 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-400 shrink-0" />
                  <h3 className="text-xl font-bold tracking-tight text-zinc-100">
                    Se você curtiu este, leia também...
                  </h3>
                </div>
                <RecommendationLoadingState
                  title={
                    selectedFocusTags.length > 0 || appliedFocusQuery
                      ? 'Buscando obras pelo foco selecionado...'
                      : 'Analisando sinopse, tropos e tags da comunidade...'
                  }
                  subtitle={
                    selectedFocusTags.length > 0 || appliedFocusQuery
                      ? `Foco: ${[...selectedFocusTags, appliedFocusQuery].filter(Boolean).join(', ')}`
                      : 'Consultando MangaUpdates, AniList e fontes ao vivo'
                  }
                  accent="amber"
                  cardCount={6}
                />
              </div>
            ) : (() => {
              const libraryFiltered = hideSavedInSimilar
                ? similarMatches.filter(m => !m.isInLibrary)
                : similarMatches;
              const hiddenSavedCount = similarMatches.length - libraryFiltered.length;

              const twinCount = libraryFiltered.filter(m => m.category === 'twin_premise').length;
              const dynamicCount = libraryFiltered.filter(m => m.category === 'same_dynamic').length;
              const vibeCount = libraryFiltered.filter(m => !m.category || m.category === 'same_vibe').length;

              const displayed = similarCategoryFilter === 'all'
                ? libraryFiltered
                : libraryFiltered.filter(m => (m.category || 'same_vibe') === similarCategoryFilter);

              const categoryTabs: Array<{ id: 'all' | SimilarityCategory; label: string; count: number; desc: string }> = [
                { id: 'all', label: 'Todos', count: libraryFiltered.length, desc: 'Todas as obras semelhantes' },
                { id: 'twin_premise', label: 'Premissa Gêmea', count: twinCount, desc: 'Mesma situação/gancho de enredo' },
                { id: 'same_dynamic', label: 'Mesma Dinâmica', count: dynamicCount, desc: 'Relação ou arquétipo parecido' },
                { id: 'same_vibe', label: 'Mesmo Clima', count: vibeCount, desc: 'Tom e gênero afim' }
              ];

              const CATEGORY_BADGE_MAP: Record<SimilarityCategory, { label: string; cls: string }> = {
                twin_premise: { label: 'Premissa Gêmea', cls: 'text-rose-300 bg-rose-500/15 border-rose-500/30' },
                same_dynamic: { label: 'Mesma Dinâmica', cls: 'text-amber-300 bg-amber-500/15 border-amber-500/30' },
                same_vibe: { label: 'Mesmo Clima', cls: 'text-sky-300 bg-sky-500/15 border-sky-500/30' }
              };

              const focusChipOptions: DetectedTropeTag[] =
                similarMeta.detectedTags.length > 0
                  ? similarMeta.detectedTags
                  : similarMeta.anilistTags.map(t => ({ tag: t, source: 'anilist' as const }));
              const hasActiveFocus = selectedFocusTags.length > 0 || Boolean(appliedFocusQuery);

              return (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                    <div className="min-w-0">
                      <h3 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2 flex-wrap">
                        <Sparkles className="h-5 w-5 text-amber-400 shrink-0" />
                        <span>Se você curtiu este, leia também...</span>
                        {similarMeta.aiPowered && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            IA Semântica
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-1">
                        {similarMeta.corePremise
                          ? similarMeta.corePremise
                          : 'Obras irmãs com afinidade temática, arquétipo de personagens e tropos compartilhados'}
                      </p>
                      {similarMeta.microTropes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {similarMeta.microTropes.slice(0, 4).map(trope => (
                            <span
                              key={trope}
                              className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300 font-medium"
                            >
                              # {trope}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Discovery Mode toggle */}
                      <button
                        type="button"
                        onClick={() => setHideSavedInSimilar(prev => !prev)}
                        className={`px-3 py-1.5 min-h-[38px] rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
                          hideSavedInSimilar
                            ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                            : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        }`}
                        title={
                          hideSavedInSimilar
                            ? 'Ocultando obras da sua biblioteca. Clique para ver obras parecidas que você já leu ou salvou.'
                            : 'Exibindo também obras parecidas da sua biblioteca'
                        }
                      >
                        {hideSavedInSimilar ? (
                          <>
                            <BookmarkX className="h-3.5 w-3.5 text-rose-400" />
                            <span>Apenas Inéditos</span>
                            {hiddenSavedCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-200 text-[10px] font-mono tabular-nums">
                                +{hiddenSavedCount} lidos
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <Bookmark className="h-3.5 w-3.5 text-emerald-400" />
                            <span>Incluindo Já Lidos ({similarMatches.filter(m => m.isInLibrary).length})</span>
                          </>
                        )}
                      </button>

                      {/* Explore more in search */}
                      {onNavigateToSearch && manga?.genres && manga.genres.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onNavigateToSearch(undefined, manga.genres[0])}
                          className="px-3 py-1.5 min-h-[38px] rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                          title={`Ver mais obras de ${manga.genres[0]} na busca`}
                        >
                          <Compass className="h-3.5 w-3.5 text-rose-400" />
                          <span className="hidden sm:inline">Explorar {manga.genres[0]}</span>
                          <span className="sm:hidden">Mais</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Interactive Similarity Focus Steering Bar */}
                  <div className="mb-4 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
                        <Sliders className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                        <span>Direcionar foco desta obra</span>
                        <span className="text-zinc-500 font-normal hidden sm:inline">
                          — escolha o que você mais quer repetir (tipo de personagem, situação ou trope)
                        </span>
                      </div>
                      {hasActiveFocus && (
                        <button
                          type="button"
                          onClick={handleResetFocus}
                          disabled={loadingRecommendations}
                          className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                          <span>Limpar foco</span>
                        </button>
                      )}
                    </div>

                    {focusChipOptions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {focusChipOptions.slice(0, 10).map(item => {
                          const isSelected = selectedFocusTags.some(
                            t => t.toLowerCase() === item.tag.toLowerCase()
                          );
                          return (
                            <button
                              key={`${item.source}-${item.tag}`}
                              type="button"
                              onClick={() => handleToggleFocusTag(item.tag)}
                              disabled={loadingRecommendations}
                              title={`Focar recomendações em "${item.tag}" (${item.source})`}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-1.5 ${
                                isSelected
                                  ? 'bg-rose-500/15 border-rose-500/45 text-rose-200'
                                  : 'bg-zinc-950/70 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white'
                              }`}
                            >
                              <span>{item.tag}</span>
                              {item.votes && item.source === 'mangaupdates' && (
                                <span className="text-[9px] text-zinc-500 font-mono tabular-nums">
                                  {item.votes}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <form onSubmit={handleApplyCustomFocus} className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={customFocusInput}
                          onChange={(e) => setCustomFocusInput(e.target.value)}
                          placeholder="Foco livre: ex. tall girl, muscle mommy, size difference, dívida..."
                          className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-rose-500/50"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loadingRecommendations || (!customFocusInput.trim() && !appliedFocusQuery)}
                        className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-100 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        Aplicar foco
                      </button>
                    </form>
                  </div>

                  {loadingRecommendations && (
                    <RecommendationLoadingState
                      compact
                      title="Recalculando obras pelo foco selecionado..."
                      subtitle={
                        hasActiveFocus
                          ? `Buscando: ${[...selectedFocusTags, appliedFocusQuery].filter(Boolean).join(', ')}`
                          : 'Atualizando recomendações'
                      }
                      accent="amber"
                    />
                  )}

                  {/* Category Tabs */}
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-2 mb-5">
                    {categoryTabs.map(tab => {
                      const active = similarCategoryFilter === tab.id;
                      if (tab.id !== 'all' && tab.count === 0) return null;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setSimilarCategoryFilter(tab.id)}
                          title={tab.desc}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 border ${
                            active
                              ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-sm'
                              : 'bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <span>{tab.label}</span>
                          <span className="px-1.5 py-0.2 rounded bg-zinc-950/70 text-[10px] font-mono tabular-nums text-zinc-300">
                            {tab.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {displayed.length > 0 ? (
                    <div className="manga-cover-grid">
                      {displayed.map((item) => {
                        const catBadge = CATEGORY_BADGE_MAP[item.category || 'same_vibe'];
                        return (
                          <div
                            key={item.manga.id}
                            onClick={() => {
                              onSelectManga?.(item.manga.id);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="manga-card-interactive group relative flex flex-col min-w-0 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-rose-500/40 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 shadow-sm hover:shadow-xl"
                          >
                            <div className="aspect-[3/4] w-full overflow-hidden bg-zinc-950 relative">
                              {item.manga.coverUrl ? (
                                <img
                                  src={item.manga.coverUrl}
                                  alt={item.manga.title}
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center p-3 text-center bg-zinc-900 text-zinc-400 text-xs">
                                  {item.manga.title}
                                </div>
                              )}

                              {/* Similarity Score Badge */}
                              <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 flex items-center gap-1 bg-zinc-950/90 backdrop-blur-md px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border border-zinc-800 shadow-md tabular-nums">
                                <span className={item.similarityScore >= 82 ? 'text-emerald-400' : 'text-amber-400'}>
                                  ★ {item.similarityScore}%
                                </span>
                                <span className="hidden xs:inline text-[9px] text-zinc-400 font-normal">similar</span>
                              </div>

                              {/* Saved badge if in library and filter is off */}
                              {item.isInLibrary && (
                                <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 px-1.5 py-0.5 rounded bg-zinc-950/85 backdrop-blur-md text-[9px] text-emerald-300 border border-emerald-500/35 font-medium">
                                  Já lido
                                </div>
                              )}
                            </div>

                            <div className="p-2.5 sm:p-3 flex flex-1 flex-col justify-between min-w-0">
                              <div className="min-w-0">
                                <div className="mb-1 flex items-center gap-1 flex-wrap">
                                  <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold ${catBadge.cls}`}>
                                    {catBadge.label}
                                  </span>
                                </div>
                                <h4 className="font-semibold text-xs sm:text-[13px] text-zinc-100 group-hover:text-rose-400 transition-colors line-clamp-2 leading-snug">
                                  {item.manga.title}
                                </h4>
                                <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                                  {item.isSameAuthor ? (
                                    <span className="text-indigo-400 font-medium">Do mesmo autor</span>
                                  ) : (
                                    item.manga.authors?.[0] || item.manga.sources?.[0]?.sourceName || 'MangaReader'
                                  )}
                                </p>
                              </div>

                              <div className="pt-1.5 sm:pt-2 border-t border-zinc-800/60 mt-1.5 sm:mt-2 space-y-1">
                                {item.matchExplanation ? (
                                  <p className="text-[10px] text-amber-300/90 font-medium line-clamp-2 leading-snug">
                                    {item.matchExplanation}
                                  </p>
                                ) : null}
                                {item.sharedGenres.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {item.sharedGenres.slice(0, 2).map(g => (
                                      <span key={g} className="px-1.5 py-0.2 rounded bg-zinc-800/80 text-zinc-300 text-[9px] truncate max-w-[110px]">
                                        {g}
                                      </span>
                                    ))}
                                  </div>
                                ) : !item.matchExplanation ? (
                                  <span className="text-[10px] text-zinc-400">Recomendação afim</span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 px-4 rounded-xl bg-zinc-900/40 border border-dashed border-zinc-800">
                      <Bookmark className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                      <p className="text-sm font-medium text-zinc-300">
                        Todas as obras irmãs já estão salvas na sua biblioteca!
                      </p>
                      <p className="text-xs text-zinc-500 mt-1 mb-3">
                        Desative o filtro para rever as obras semelhantes que você já conhece.
                      </p>
                      <button
                        type="button"
                        onClick={() => setHideSavedInSimilar(false)}
                        className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
                      >
                        Exibir Todas as Obras Irmãs
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </section>
        )}
      </div>

      {/* Batch Download Modal for Offline Caching */}
      {manga && (
        <BatchDownloadModal
          isOpen={showBatchDownloadModal}
          onClose={() => setShowBatchDownloadModal(false)}
          manga={manga}
          chapters={chapters}
          readChapterIds={readChapters}
          savedChapterIds={savedOfflineChapterIds}
        />
      )}

      {/* Modal for User Rating & Personal Notes */}
      {showScoreModal && manga && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setShowScoreModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl text-zinc-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
                <h3 className="text-sm font-bold text-white line-clamp-1">
                  Avaliar: {manga.title}
                </h3>
              </div>
              <button
                onClick={() => setShowScoreModal(false)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-2">
                  Sua Nota (1 a 10):{' '}
                  <span className="font-mono text-amber-400 font-bold text-sm">
                    {modalScore} / 10
                  </span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={modalScore}
                  onChange={(e) => setModalScore(parseInt(e.target.value, 10))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Notas Pessoais (Opcional):
                </label>
                <textarea
                  rows={3}
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder="Ex: Parei no arco do torneio, animação muito fiel..."
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setShowScoreModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveScore}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-md shadow-rose-950/40 cursor-pointer"
              >
                Salvar Avaliação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* External Trackers Modal (AniList & MAL) */}
      <TrackersModal
        isOpen={showTrackersModal}
        onClose={() => setShowTrackersModal(false)}
        activeMangaId={mangaId}
        activeMangaTitle={manga?.title}
      />

      {/* Mihon-style Category Selection Modal */}
      <CategorySelectionModal
        isOpen={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          const fav = HistoryService.getFavorites().find(f => f.mangaId === mangaId) || null;
          setFavoriteData(fav);
          setIsBookmarked(Boolean(fav));
        }}
        manga={manga ? {
          id: manga.id,
          title: manga.title,
          coverUrl: manga.coverUrl,
          sourceName: manga.sources?.[0]?.sourceName,
          sourceId: manga.sources?.[0]?.sourceId,
          rating: manga.rating,
          authors: manga.authors,
          genres: manga.genres,
          status: manga.status,
        } : null}
      />

      {/* Full-screen Cover Image Lightbox Modal */}
      {showCoverLightbox && (coverSrc || manga?.coverUrl) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setShowCoverLightbox(false)}
        >
          <div
            className="relative max-w-xl w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowCoverLightbox(false)}
              className="absolute -top-12 right-0 p-2 text-zinc-400 hover:text-white rounded-full bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer border border-zinc-700"
              title="Fechar (Esc)"
            >
              <X className="h-5 w-5" />
            </button>

            <img
              src={coverSrc || manga?.coverUrl}
              alt={manga?.title || 'Capa do mangá'}
              referrerPolicy="no-referrer"
              className="max-h-[82vh] w-auto object-contain rounded-2xl shadow-2xl border border-zinc-800 bg-zinc-950"
            />

            <div className="mt-3 flex items-center justify-between w-full px-2 text-xs text-zinc-300">
              <span className="font-semibold line-clamp-1">{manga?.title}</span>
              <a
                href={coverSrc || manga?.coverUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-rose-400 hover:text-rose-300 flex items-center gap-1 underline"
              >
                Abrir em resolução original <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
