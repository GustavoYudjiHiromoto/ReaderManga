import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Sparkles,
  Flame,
  Clock,
  Search,
  ArrowRight,
  Star,
  RefreshCw,
  Dices,
  ChevronRight,
  ChevronLeft,
  Compass,
  Zap,
  Skull,
  Smile,
  Globe2,
  Bookmark,
  BookmarkX,
  Blocks,
  Dna
} from 'lucide-react';
import { Manga, MangaSourceInfo, ReadingProgress, FavoriteManga, IgnoredManga, MangaUpdateInfo } from '../types/manga.js';
import { MangaApi } from '../services/api.js';
import { HistoryService } from '../services/history.js';
import { UpdateTrackerService } from '../services/updateTracker.js';
import { ExtensionService } from '../services/extensionService.js';
import { RecommendationService, ReaderDNA, RecommendationMatch } from '../services/recommendationService.js';
import { subscribePreferredLanguage } from '../utils/languagePreference.js';
import { RecommendationLoadingState } from '../components/RecommendationLoadingState.js';
import {
  isMangaInFavorites,
  isMangaInIgnored,
  pickOracleCandidate
} from '../utils/libraryFilters.js';

interface HomePageProps {
  onSelectManga: (mangaId: string, fromCatalog?: boolean) => void;
  onReadChapter: (mangaId: string, chapterId: string) => void;
  onNavigateToSearch: (initialQuery?: string) => void;
  history?: ReadingProgress[];
  onOpenHistory?: () => void;
}

type VibeCategory = 'all' | 'dark' | 'action' | 'comedy' | 'fantasy' | 'mind';

interface ThematicCollection {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  genres: string[];
}

const COLLECTIONS: ThematicCollection[] = [
  {
    id: 'seinen',
    title: 'Seinen & Fantasia Sombria',
    subtitle: 'Narrativas densas, dilemas morais e arte visceral',
    icon: '🗡️',
    genres: ['Seinen', 'Horror', 'Psychological', 'Mature', 'Tragedy']
  },
  {
    id: 'shounen',
    title: 'Ação & Shounen Épico',
    subtitle: 'Batalhas coreografadas, superação e adrenalina',
    icon: '⚡',
    genres: ['Action', 'Adventure', 'Shounen', 'Supernatural']
  },
  {
    id: 'manhwa',
    title: 'Webtoons & Manhwas em Cores',
    subtitle: 'Leitura vertical fluida, sistemas de níveis e fantasia',
    icon: '🎨',
    genres: ['Fantasy', 'Action', 'Isekai', 'Supernatural']
  },
  {
    id: 'completed',
    title: 'Obras Concluídas para Maratonar',
    subtitle: 'Histórias completas do início ao desfecho',
    icon: '🏆',
    genres: ['Drama', 'Mystery', 'Psychological', 'Completed']
  }
];

const VIBE_OPTIONS: Array<{ id: VibeCategory; label: string; icon: any; query: string }> = [
  { id: 'dark', label: 'Sombrio & Visceral', icon: Skull, query: 'Horror' },
  { id: 'action', label: 'Ação Frenética', icon: Zap, query: 'Action' },
  { id: 'fantasy', label: 'Mundos de Fantasia', icon: Sparkles, query: 'Fantasy' },
  { id: 'comedy', label: 'Rir & Descontrair', icon: Smile, query: 'Comedy' },
  { id: 'mind', label: 'Mistério & Enigma', icon: Compass, query: 'Mystery' }
];

export const HomePage: React.FC<HomePageProps> = ({
  onSelectManga,
  onReadChapter,
  onNavigateToSearch,
  history: propHistory,
  onOpenHistory
}) => {
  const [featuredManga, setFeaturedManga] = useState<Manga[]>([]);
  const [sources, setSources] = useState<MangaSourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);
  const [activeCollectionId, setActiveCollectionId] = useState<string>('seinen');
  const [collectionItems, setCollectionItems] = useState<Manga[]>([]);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [selectedVibe, setSelectedVibe] = useState<VibeCategory>('dark');
  const [vibeResult, setVibeResult] = useState<Manga | null>(null);
  const [isRollingVibe, setIsRollingVibe] = useState(false);
  const [localHistory, setLocalHistory] = useState<ReadingProgress[]>(() => HistoryService.getHistory());
  const [favorites, setFavorites] = useState<FavoriteManga[]>(() => HistoryService.getFavorites());
  const [ignoredList, setIgnoredList] = useState<IgnoredManga[]>(() => HistoryService.getIgnoredMangas());
  const [updatesMap, setUpdatesMap] = useState<Record<string, MangaUpdateInfo>>(() => UpdateTrackerService.getStoredUpdates());
  const [coverErrors, setCoverErrors] = useState<Record<string, boolean>>({});
  const [readerDNA, setReaderDNA] = useState<ReaderDNA>(() => RecommendationService.calculateReaderDNA());
  const [personalizedRecs, setPersonalizedRecs] = useState<RecommendationMatch[]>([]);
  const [personalizedMeta, setPersonalizedMeta] = useState<{ aiPowered: boolean; profileSummary?: string }>({ aiPowered: false });
  const [loadingPersonalized, setLoadingPersonalized] = useState(false);
  const [hideLibraryPersonalized, setHideLibraryPersonalized] = useState(true);

  useEffect(() => {
    loadInitialData();
    let lastFavsRef = HistoryService.getFavorites();
    let lastHistRef = HistoryService.getHistory();
    const unsubHistory = HistoryService.subscribe(() => {
      const nextHist = HistoryService.getHistory();
      const nextFavs = HistoryService.getFavorites();
      const nextIgnored = HistoryService.getIgnoredMangas();
      setLocalHistory(prev => (prev === nextHist ? prev : nextHist));
      setFavorites(prev => (prev === nextFavs ? prev : nextFavs));
      setIgnoredList(prev => (prev === nextIgnored ? prev : nextIgnored));
      setVibeResult(prev => (prev && isMangaInIgnored(prev, nextIgnored) ? null : prev));
      if (nextFavs !== lastFavsRef || nextHist !== lastHistRef) {
        lastFavsRef = nextFavs;
        lastHistRef = nextHist;
        setReaderDNA(RecommendationService.calculateReaderDNA());
      }
    });
    const unsubUpdates = UpdateTrackerService.subscribe(() => {
      setUpdatesMap(UpdateTrackerService.getStoredUpdates());
    });
    const unsubExtensions = ExtensionService.subscribe(() => {
      loadInitialData();
    });
    const unsubLang = subscribePreferredLanguage(() => {
      loadPersonalizedRecommendations(hideLibraryPersonalized);
    });
    return () => {
      unsubHistory();
      unsubUpdates();
      unsubExtensions();
      unsubLang();
    };
  }, []);

  const activeHistory = propHistory || localHistory;

  const loadPersonalizedRecommendations = async (hideLib = hideLibraryPersonalized) => {
    setLoadingPersonalized(true);
    try {
      const detailed = await RecommendationService.getPersonalizedRecommendationsDetailed({
        hideLibrary: hideLib,
        limit: 12
      });
      setPersonalizedRecs(detailed.matches);
      setPersonalizedMeta({
        aiPowered: detailed.aiPowered,
        profileSummary: detailed.profileSummary
      });
    } catch (err) {
      console.warn('Failed to load personalized recommendations', err);
      setPersonalizedRecs([]);
    } finally {
      setLoadingPersonalized(false);
    }
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const activeSources = ExtensionService.getEnabledSourceIds();
      const [featured, sourcesList] = await Promise.all([
        MangaApi.getFeatured({ sources: activeSources }),
        MangaApi.getSources()
      ]);
      setFeaturedManga(featured);
      setSources(sourcesList);

      // Preload the first thematic collection
      loadCollection('seinen', featured);

      // Load personalized recommendations
      loadPersonalizedRecommendations(hideLibraryPersonalized);
    } catch (err) {
      console.error('Failed to load home page data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCollection = async (collectionId: string, currentFeatured: Manga[] = featuredManga) => {
    setActiveCollectionId(collectionId);
    const targetColl = COLLECTIONS.find(c => c.id === collectionId);
    if (!targetColl) return;

    setLoadingCollection(true);
    try {
      const currentIgnored = HistoryService.getIgnoredMangas();
      // First check if current featured has matches (excluding hidden/ignored works)
      const matchedFromFeatured = currentFeatured.filter(
        m =>
          !isMangaInIgnored(m, currentIgnored) &&
          m.genres.some(g => targetColl.genres.some(tg => g.toLowerCase().includes(tg.toLowerCase())))
      );

      if (matchedFromFeatured.length >= 6) {
        setCollectionItems(matchedFromFeatured.slice(0, 8));
      } else {
        // Query live search for this collection theme
        const searchRes = await MangaApi.search('', { genre: targetColl.genres[0], limit: 14, onlyAvailable: true });
        const combined = [
          ...matchedFromFeatured,
          ...(searchRes.data || []).filter(m => !isMangaInIgnored(m, currentIgnored))
        ];
        const deduplicated = Array.from(new Map(combined.map(m => [m.id, m])).values());
        setCollectionItems(deduplicated.slice(0, 8));
      }
    } catch (err) {
      console.warn('Failed to load collection:', err);
    } finally {
      setLoadingCollection(false);
    }
  };

  // Top spotlight mangas (curated 4 titles, excluding hidden/ignored)
  const spotlightList = useMemo(() => {
    if (featuredManga.length === 0) return [];
    return featuredManga
      .filter(m => m.hasAvailableChapters !== false && !m.isAdult && !isMangaInIgnored(m, ignoredList))
      .slice(0, 4);
  }, [featuredManga, ignoredList]);

  const currentHero = spotlightList[heroIndex] || spotlightList[0];

  const handleHeroNext = () => {
    if (spotlightList.length === 0) return;
    setHeroIndex((prev) => (prev + 1) % spotlightList.length);
  };

  const handleHeroPrev = () => {
    if (spotlightList.length === 0) return;
    setHeroIndex((prev) => (prev - 1 + spotlightList.length) % spotlightList.length);
  };

  const handleHeroRead = async (manga: Manga) => {
    const progress = HistoryService.getProgress(manga.id);
    if (progress) {
      onReadChapter(manga.id, progress.chapterId);
      return;
    }
    try {
      const chapters = await MangaApi.getChapters(manga.id, { order: 'asc' });
      if (chapters.length > 0) {
        onReadChapter(manga.id, chapters[0].id);
      } else {
        onSelectManga(manga.id);
      }
    } catch {
      onSelectManga(manga.id);
    }
  };

  const isAlreadySaved = (manga: Manga): boolean => {
    return isMangaInFavorites(manga, favorites);
  };

  const handleRollVibe = async (vibeId: VibeCategory) => {
    setSelectedVibe(vibeId);
    setIsRollingVibe(true);
    const vibe = VIBE_OPTIONS.find(v => v.id === vibeId);
    const latestFavorites = HistoryService.getFavorites();
    const latestIgnored = HistoryService.getIgnoredMangas();
    const lastId = vibeResult?.id;

    try {
      const candidateMap = new Map<string, Manga>();
      const addValidCandidates = (list: Manga[]) => {
        for (const m of list) {
          if (m && m.id && !m.isAdult && !isMangaInIgnored(m, latestIgnored) && !candidateMap.has(m.id)) {
            candidateMap.set(m.id, m);
          }
        }
      };

      if (vibe) {
        addValidCandidates(
          featuredManga.filter(m =>
            m.genres.some(g => g.toLowerCase().includes(vibe.query.toLowerCase()))
          )
        );
      }

      const countUnsaved = () =>
        Array.from(candidateMap.values()).filter(m => !isMangaInFavorites(m, latestFavorites)).length;

      // Search by genre (not as title keyword) when pool of unseen/unsaved works is small
      if (countUnsaved() < 5 && vibe) {
        const page1Res = await MangaApi.search('', { genre: vibe.query, limit: 24, page: 1, onlyAvailable: true });
        addValidCandidates(page1Res.data || []);
      }

      if (countUnsaved() < 2 && vibe) {
        const page2Res = await MangaApi.search('', { genre: vibe.query, limit: 24, page: 2, onlyAvailable: true });
        addValidCandidates(page2Res.data || []);
      }

      if (countUnsaved() === 0) {
        addValidCandidates(featuredManga);
      }

      const chosen = pickOracleCandidate(
        Array.from(candidateMap.values()),
        latestFavorites,
        latestIgnored,
        lastId
      );
      setVibeResult(chosen);
    } catch {
      const fallbackChosen = pickOracleCandidate(featuredManga, latestFavorites, latestIgnored, lastId);
      setVibeResult(fallbackChosen);
    } finally {
      setIsRollingVibe(false);
    }
  };

  const markCoverError = (id: string) => {
    setCoverErrors(prev => ({ ...prev, [id]: true }));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-24 selection:bg-rose-500 selection:text-white">
      {/* =========================================================================
          1. HERO MAGAZINE SPOTLIGHT
      ========================================================================= */}
      {currentHero && (
        <section className="relative overflow-hidden border-b border-zinc-800/80 bg-zinc-950">
          {/* Ambient Blurred Backdrop */}
          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            {!coverErrors[`hero_${currentHero.id}`] && currentHero.coverUrl ? (
              <img
                src={currentHero.coverUrl}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => markCoverError(`hero_${currentHero.id}`)}
                className="h-full w-full object-cover object-center opacity-20 blur-3xl scale-110 transition-opacity duration-700"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/70 to-transparent" />
          </div>

          <div className="relative z-10 mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-6 sm:py-10 md:py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 lg:gap-12 items-center">
              
              {/* Left Column: Cover Anchor with Volume Styling */}
              <div className="lg:col-span-4 flex flex-col items-center lg:items-start">
                <div
                  onClick={() => onSelectManga(currentHero.id)}
                  className="manga-card-interactive group relative w-44 xs:w-52 sm:w-60 md:w-64 aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900 cursor-pointer transform transition-all duration-300"
                >
                  {!coverErrors[`hero_${currentHero.id}`] && currentHero.coverUrl ? (
                    <img
                      src={currentHero.coverUrl}
                      alt={currentHero.title}
                      referrerPolicy="no-referrer"
                      onError={() => markCoverError(`hero_${currentHero.id}`)}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="relative h-full w-full flex flex-col justify-between p-4 sm:p-5 bg-gradient-to-br from-zinc-900 via-rose-950/30 to-zinc-950">
                      <div className="text-7xl sm:text-8xl font-serif font-black text-white/[0.04] absolute -right-2 -bottom-4 select-none">
                        漫画
                      </div>
                      <div className="flex justify-between text-[11px] font-mono text-zinc-500 border-b border-zinc-800/80 pb-2">
                        <span>DESTAQUE</span>
                        <span>MANGA</span>
                      </div>
                      <div className="my-auto py-2 text-center">
                        <BookOpen className="h-7 w-7 sm:h-8 sm:w-8 text-rose-400 mx-auto mb-2" />
                        <h4 className="font-serif font-bold text-sm text-zinc-100 line-clamp-3">
                          {currentHero.title}
                        </h4>
                      </div>
                      <div className="text-[10px] text-zinc-400 text-center border-t border-zinc-800/60 pt-2">
                        {currentHero.genres[0] || 'MangaReader'}
                      </div>
                    </div>
                  )}

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <BookOpen className="h-4 w-4 text-rose-400" /> Ver Sinopse & Capítulos
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Editorial Typography & Actions */}
              <div className="lg:col-span-8 flex flex-col justify-center text-center lg:text-left min-w-0">
                {/* Quiet unboxed metadata */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-2 gap-y-1 text-xs text-rose-400 font-medium mb-2.5 sm:mb-3">
                  <span className="uppercase tracking-widest text-[11px] font-semibold">
                    Destaque Editorial #{heroIndex + 1}
                  </span>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span className="text-zinc-400">
                    {currentHero.sources[0]?.sourceName || 'MangaReader'}
                  </span>
                  {currentHero.rating && (
                    <>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className="flex items-center gap-1 text-amber-300 font-mono tabular-nums">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {currentHero.rating.toFixed(1)}
                      </span>
                    </>
                  )}
                  {currentHero.publicationInfo?.releaseYear && (
                    <>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className="text-zinc-400 font-mono tabular-nums">
                        {currentHero.publicationInfo.releaseYear}
                      </span>
                    </>
                  )}
                </div>

                <h1 className="font-serif text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-3 sm:mb-4 text-balance leading-tight">
                  {currentHero.title}
                </h1>

                {/* Author & Status */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-2 gap-y-1 text-xs sm:text-sm text-zinc-400 mb-4 sm:mb-5">
                  <span className="font-medium text-zinc-300">
                    {currentHero.authors.join(', ') || 'Autor Desconhecido'}
                  </span>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span className="capitalize">
                    {currentHero.status === 'ongoing' ? 'Em Lançamento' : 'Obra Concluída'}
                  </span>
                  {currentHero.genres && currentHero.genres.length > 0 && (
                    <>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className="text-zinc-400">
                        {currentHero.genres.slice(0, 3).join(', ')}
                      </span>
                    </>
                  )}
                </div>

                {/* Synopsis snippet */}
                <p className="text-xs sm:text-base text-zinc-300 line-clamp-3 leading-relaxed mb-5 sm:mb-6 font-light max-w-2xl mx-auto lg:mx-0">
                  {currentHero.synopsis || 'Sinopse disponível na página de detalhes da obra.'}
                </p>

                {/* Primary Action Buttons */}
                <div className="flex flex-col xs:flex-row sm:flex-wrap items-stretch xs:items-center justify-center lg:justify-start gap-2.5 sm:gap-3 mb-6 sm:mb-8">
                  <button
                    onClick={() => handleHeroRead(currentHero)}
                    className="px-5 sm:px-6 py-2.5 min-h-[42px] bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-950/60 cursor-pointer active:scale-95"
                  >
                    <BookOpen className="h-4 w-4 shrink-0" />
                    <span>
                      {HistoryService.getProgress(currentHero.id) ? 'Continuar Leitura' : 'Iniciar Leitura (Cap. 1)'}
                    </span>
                  </button>

                  <button
                    onClick={() => onSelectManga(currentHero.id)}
                    className="px-5 py-2.5 min-h-[42px] bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 hover:text-white rounded-xl font-medium text-sm border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer flex items-center justify-center"
                  >
                    Ver Capítulos & Detalhes
                  </button>
                </div>

                {/* Quick Spotlight Switcher Tabs */}
                {spotlightList.length > 1 && (
                  <div className="pt-4 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto max-w-full pb-1 no-scrollbar">
                      <span className="text-xs text-zinc-400 font-medium mr-1 hidden sm:inline shrink-0">
                        Destaques:
                      </span>
                      {spotlightList.map((spot, idx) => (
                        <button
                          key={spot.id}
                          onClick={() => setHeroIndex(idx)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer truncate max-w-[125px] sm:max-w-[170px] shrink-0 ${
                            idx === heroIndex
                              ? 'bg-zinc-800 text-white border border-rose-500/40 shadow-sm'
                              : 'bg-zinc-900/60 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80'
                          }`}
                        >
                          {spot.title}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={handleHeroPrev}
                        aria-label="Destaque anterior"
                        className="p-2 sm:p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={handleHeroNext}
                        aria-label="Próximo destaque"
                        className="p-2 sm:p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 mt-8 sm:mt-12 space-y-10 sm:space-y-14">

        {/* =========================================================================
            2. MESA DO LEITOR (CONTINUAR LENDO - RECENT READING SHELF)
        ========================================================================= */}
        {activeHistory.length > 0 ? (
          <section>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-6">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-100 tracking-tight">Mesa do Leitor</h2>
                  <p className="text-xs text-zinc-400">Continue exatamente de onde você parou</p>
                </div>
              </div>

              {onOpenHistory && (
                <button
                  onClick={onOpenHistory}
                  className="text-xs text-rose-400 hover:text-rose-300 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>Histórico completo</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeHistory.slice(0, 3).map((item) => {
                const percent = item.totalPages > 0 ? Math.round((item.pageNumber / item.totalPages) * 100) : 0;
                return (
                  <div
                    key={item.mangaId}
                    onClick={() => onReadChapter(item.mangaId, item.chapterId)}
                    className="group relative flex flex-col gap-3 p-3.5 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-rose-500/30 rounded-xl cursor-pointer transition-all duration-200 shadow-sm hover:shadow-lg"
                  >
                    <div className="flex gap-3.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectManga(item.mangaId);
                        }}
                        title="Abrir página da obra"
                        className="shrink-0 cursor-pointer rounded-lg overflow-hidden border border-zinc-800 hover:border-rose-500/50 transition-colors"
                      >
                        <img
                          src={item.mangaCover}
                          alt={item.mangaTitle}
                          referrerPolicy="no-referrer"
                          className="w-16 h-22 object-cover bg-zinc-950"
                        />
                      </button>

                      <div className="flex flex-1 flex-col justify-between overflow-hidden min-w-0">
                        <div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectManga(item.mangaId);
                            }}
                            title="Abrir página da obra"
                            className="text-left font-semibold text-sm text-zinc-100 line-clamp-1 hover:text-rose-400 transition-colors cursor-pointer block w-full"
                          >
                            {item.mangaTitle}
                          </button>
                          <div className="flex items-center justify-between gap-1 text-xs text-zinc-400 mt-1">
                            <div className="flex items-center gap-1">
                              <span>Capítulo</span>
                              <span className="font-mono text-zinc-200 font-semibold tabular-nums">
                                {item.chapterNumber}
                              </span>
                            </div>
                            {updatesMap[item.mangaId]?.hasNew && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-[9px] font-bold tabular-nums">
                                <Sparkles className="h-2.5 w-2.5" />
                                Novo Cap. {updatesMap[item.mangaId]?.latestChapterNumber}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-400 font-mono tabular-nums mt-0.5">
                            Página {item.pageNumber} de {item.totalPages} ({percent}%)
                          </p>
                        </div>

                        <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden mt-2">
                          <div
                            className="bg-rose-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/70">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReadChapter(item.mangaId, item.chapterId);
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-[11px] font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <BookOpen className="h-3 w-3 shrink-0" />
                        <span>Continuar Cap. {item.chapterNumber}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectManga(item.mangaId);
                        }}
                        className="py-1.5 px-2.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700/70 text-[11px] font-medium transition-colors cursor-pointer shrink-0"
                        title="Ver sinopse, lista de capítulos e similares"
                      >
                        Página da Obra
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* =========================================================================
            DNA DO LEITOR & RECOMENDAÇÕES PERSONALIZADAS (IDEIA 1)
        ========================================================================= */}
        <section className="p-3.5 sm:p-6 rounded-2xl bg-gradient-to-br from-zinc-900/90 via-zinc-900/50 to-zinc-950 border border-zinc-800 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-4 border-b border-zinc-800 mb-4 sm:mb-5">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2 flex-wrap">
                  <span>Recomendados Para o Seu Perfil</span>
                  {readerDNA.topGenres.length > 0 && (
                    <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-medium">
                      <Dna className="h-3 w-3" />
                      {readerDNA.dominantMood}
                    </span>
                  )}
                  {personalizedMeta.aiPowered && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      IA Semântica
                    </span>
                  )}
                </h2>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                {personalizedMeta.profileSummary
                  ? personalizedMeta.profileSummary
                  : 'Sugestões geradas sob medida calculando a afinidade com os gêneros, tropos e obras que você mais consome'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Discovery Mode Toggle */}
              <button
                type="button"
                onClick={() => {
                  const nextVal = !hideLibraryPersonalized;
                  setHideLibraryPersonalized(nextVal);
                  loadPersonalizedRecommendations(nextVal);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
                  hideLibraryPersonalized
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
                title={hideLibraryPersonalized ? 'Ocultando mangás da sua biblioteca' : 'Clique para ocultar mangás já favoritados'}
              >
                {hideLibraryPersonalized ? (
                  <>
                    <BookmarkX className="h-3.5 w-3.5 text-rose-400" />
                    <span>Apenas Inéditos</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="h-3.5 w-3.5" />
                    <span>Ocultar Biblioteca</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => loadPersonalizedRecommendations(hideLibraryPersonalized)}
                disabled={loadingPersonalized}
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Recalcular recomendações"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingPersonalized ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* DNA Stats Strip */}
          {readerDNA.topGenres.length > 0 ? (
            <div className="mb-6 p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-zinc-400 font-medium flex items-center gap-1 text-[11px]">
                  <Dna className="h-3.5 w-3.5 text-amber-400" />
                  Seu DNA de Leitura:
                </span>
                {readerDNA.topGenres.slice(0, 4).map((g) => (
                  <span
                    key={g.name}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-750 text-zinc-200 text-[11px]"
                  >
                    <span className="font-medium">{g.name}</span>
                    <span className="text-[10px] text-amber-400 font-mono font-bold">{g.percentage}%</span>
                  </span>
                ))}
              </div>

              {readerDNA.sampleInspirations.length > 0 && (
                <div className="text-[11px] text-zinc-500 truncate max-w-full">
                  <span className="text-zinc-400">Inspirado em:</span>{' '}
                  <span className="italic text-zinc-300">{readerDNA.sampleInspirations.slice(0, 2).join(', ')}</span>
                </div>
              )}
            </div>
          ) : null}

          {/* Recommendations Content */}
          {loadingPersonalized ? (
            <RecommendationLoadingState
              title="Mapeando seu DNA de leitura e analisando sinopses..."
              subtitle="Selecionando obras alinhadas ao seu gosto"
              accent="amber"
              cardCount={6}
            />
          ) : personalizedRecs.length > 0 ? (
            <div className="manga-cover-grid">
              {personalizedRecs.map((match) => (
                <div
                  key={match.manga.id}
                  onClick={() => onSelectManga(match.manga.id)}
                  className="manga-card-interactive group relative flex flex-col min-w-0 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800/80 hover:border-amber-500/40 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 shadow-sm hover:shadow-xl"
                >
                  <div className="aspect-[3/4] w-full overflow-hidden bg-zinc-950 relative">
                    {!coverErrors[match.manga.id] && match.manga.coverUrl ? (
                      <img
                        src={match.manga.coverUrl}
                        alt={match.manga.title}
                        referrerPolicy="no-referrer"
                        onError={() => markCoverError(match.manga.id)}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center p-3 text-center bg-zinc-900 text-zinc-400 text-xs">
                        {match.manga.title}
                      </div>
                    )}

                    {/* Affinity Score Badge */}
                    <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 flex items-center gap-1 bg-zinc-950/90 backdrop-blur-md px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border border-zinc-800 shadow-md">
                      <span className={match.affinityScore >= 85 ? 'text-emerald-400' : 'text-amber-400'}>
                        ★ {match.affinityScore}%
                      </span>
                      <span className="hidden xs:inline text-[9px] text-zinc-400 font-normal">afinidade</span>
                    </div>

                    {match.isInLibrary && (
                      <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 px-1.5 py-0.5 rounded bg-zinc-950/80 backdrop-blur-md text-[9px] text-rose-300 border border-rose-500/30">
                        Salvo
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 sm:p-3 flex flex-1 flex-col justify-between min-w-0">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-xs sm:text-[13px] text-zinc-100 group-hover:text-amber-300 transition-colors line-clamp-2 leading-snug">
                        {match.manga.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                        {match.manga.authors?.[0] || match.manga.sources[0]?.sourceName || 'MangaReader'}
                      </p>
                    </div>

                    <div className="pt-1.5 sm:pt-2 border-t border-zinc-800/60 mt-1.5 sm:mt-2">
                      <p className="text-[10px] text-amber-300/90 font-medium line-clamp-2 leading-snug">
                        {match.matchReasons[0] || 'Baseado nas suas preferências'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : readerDNA.totalAnalyzed === 0 ? (
            <div className="text-center py-10 px-4 rounded-xl bg-zinc-950/40 border border-dashed border-zinc-800">
              <Dna className="h-8 w-8 text-amber-500/60 mx-auto mb-2" />
              <h4 className="text-sm font-semibold text-zinc-200">Seu DNA de Leitura será ativado em breve</h4>
              <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                Favorite suas obras preferidas ou leia alguns capítulos. Nosso motor inteligente analisará seus gêneros favoritos e criará uma prateleira personalizada sob medida para você!
              </p>
              <button
                type="button"
                onClick={() => onNavigateToSearch()}
                className="mt-4 px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Explorar Catálogo Agora
              </button>
            </div>
          ) : (
            <div className="text-center py-8 text-zinc-500">
              <p className="text-xs">Nenhuma recomendação inédita encontrada no momento.</p>
              <button
                type="button"
                onClick={() => {
                  setHideLibraryPersonalized(false);
                  loadPersonalizedRecommendations(false);
                }}
                className="mt-2 text-xs text-amber-400 hover:underline cursor-pointer"
              >
                Exibir obras recomendadas mesmo se já estiverem na biblioteca
              </button>
            </div>
          )}
        </section>

        {/* =========================================================================
            3. TRILHAS TEMÁTICAS & COLEÇÕES EDITORIAIS
        ========================================================================= */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-rose-400" />
                <h2 className="text-xl font-bold tracking-tight text-zinc-100">
                  Trilhas & Seleções Editoriais
                </h2>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Explore universos agrupados por tom, gênero e experiência de leitura
              </p>
            </div>

            {/* Collection Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
              {COLLECTIONS.map(coll => {
                const isActive = coll.id === activeCollectionId;
                return (
                  <button
                    key={coll.id}
                    onClick={() => loadCollection(coll.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40 shadow-sm'
                        : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                    }`}
                  >
                    <span>{coll.icon}</span>
                    <span>{coll.title.split('&')[0].trim()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collection Showcase Grid */}
          {loadingCollection ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <RefreshCw className="h-6 w-6 animate-spin text-rose-500 mb-2.5" />
              <p className="text-xs">Carregando trilha temática...</p>
            </div>
          ) : collectionItems.length > 0 ? (
            <div className="manga-cover-grid">
              {collectionItems.map((manga) => (
                <div
                  key={manga.id}
                  onClick={() => onSelectManga(manga.id)}
                  className="manga-card-interactive group relative flex flex-col min-w-0 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 shadow-sm hover:shadow-xl"
                >
                  <div className="aspect-[3/4] w-full overflow-hidden bg-zinc-950 relative">
                    {!coverErrors[manga.id] && manga.coverUrl ? (
                      <img
                        src={manga.coverUrl}
                        alt={manga.title}
                        referrerPolicy="no-referrer"
                        onError={() => markCoverError(manga.id)}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="relative h-full w-full flex flex-col justify-between p-3 bg-gradient-to-br from-zinc-900 via-rose-950/20 to-zinc-950">
                        <div className="text-5xl font-serif font-black text-white/[0.04] absolute -right-2 -bottom-2 select-none">
                          漫画
                        </div>
                        <span className="text-[9px] font-mono text-zinc-500">VOL. 1</span>
                        <div className="text-center py-2">
                          <BookOpen className="h-5 w-5 text-rose-400 mx-auto mb-1.5" />
                          <p className="font-serif font-bold text-xs text-zinc-200 line-clamp-2 px-1">
                            {manga.title}
                          </p>
                        </div>
                        <span className="text-[8px] text-zinc-500 text-center uppercase">Manga</span>
                      </div>
                    )}

                    {/* Gradient scrim */}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                    {/* Rating badge */}
                    {manga.rating && (
                      <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 flex items-center gap-1 bg-zinc-950/90 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-300 border border-zinc-800">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span>{manga.rating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 sm:p-3 flex flex-1 flex-col justify-between min-w-0">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-xs sm:text-[13px] text-zinc-100 group-hover:text-rose-400 transition-colors line-clamp-2 leading-snug">
                        {manga.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                        {manga.authors?.[0] || manga.sources[0]?.sourceName || 'MangaReader'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1.5 sm:pt-2 border-t border-zinc-800/60 mt-1.5 sm:mt-2 gap-1">
                      <span className="truncate">{manga.genres[0] || 'Obra'}</span>
                      <span className="text-rose-400 font-medium group-hover:translate-x-0.5 transition-transform shrink-0">
                        Ler →
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-zinc-500 bg-zinc-900/30 rounded-xl border border-zinc-800/60">
              <BookOpen className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
              <p className="text-xs">Nenhum mangá encontrado nesta trilha no momento.</p>
            </div>
          )}
        </section>

        {/* =========================================================================
            4. ROLETA DE DESCOBERTA POR VIBE / HUMOR (SURPREENDA-ME INTERATIVO)
        ========================================================================= */}
        <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900/90 via-zinc-900/40 to-zinc-950 p-4 sm:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
            
            {/* Left Column: Vibe Selector */}
            <div className="lg:col-span-6">
              <div className="flex items-center gap-2 mb-2">
                <Dices className="h-5 w-5 text-amber-400" />
                <span className="text-xs uppercase tracking-widest text-amber-400 font-semibold">
                  Oráculo da Leitura
                </span>
              </div>

              <h2 className="font-serif text-xl sm:text-3xl font-bold tracking-tight text-white mb-2 sm:mb-3">
                Qual é a sua vibe de leitura hoje?
              </h2>

              <p className="text-xs sm:text-sm text-zinc-400 mb-5 sm:mb-6 font-light leading-relaxed">
                Escolha o tom desejado e receba uma recomendação instantânea sorteada diretamente das nossas fontes ao vivo.
              </p>

              {/* Vibe Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VIBE_OPTIONS.map(vibe => {
                  const Icon = vibe.icon;
                  const isSelected = selectedVibe === vibe.id;
                  return (
                    <button
                      key={vibe.id}
                      onClick={() => handleRollVibe(vibe.id)}
                      disabled={isRollingVibe}
                      className={`p-2.5 sm:p-3 rounded-xl border text-xs font-medium text-left transition-all flex flex-col gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-md'
                          : 'bg-zinc-950/60 hover:bg-zinc-800/80 border-zinc-800 text-zinc-300 hover:text-white'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-amber-400' : 'text-zinc-400'}`} />
                      <span>{vibe.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Revealed Result Card */}
            <div className="lg:col-span-6 flex justify-center lg:justify-end">
              {vibeResult ? (
                <div className="w-full max-w-md p-3.5 sm:p-5 rounded-2xl bg-zinc-950 border border-zinc-800 flex gap-3.5 sm:gap-4 items-center shadow-xl animate-in fade-in zoom-in-95 duration-200">
                  <div className="w-20 xs:w-24 sm:w-28 aspect-[3/4] rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-zinc-800">
                    {!coverErrors[`vibe_${vibeResult.id}`] && vibeResult.coverUrl ? (
                      <img
                        src={vibeResult.coverUrl}
                        alt={vibeResult.title}
                        referrerPolicy="no-referrer"
                        onError={() => markCoverError(`vibe_${vibeResult.id}`)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center p-2 text-center bg-zinc-900 text-zinc-400 text-[10px]">
                        {vibeResult.title}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col justify-between overflow-hidden">
                    <div>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono mb-1">
                        <span className="text-amber-400">RECOMENDAÇÃO</span>
                        <span className="text-zinc-600">·</span>
                        {isAlreadySaved(vibeResult) ? (
                          <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 text-[9px]">
                            Na sua biblioteca
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-semibold">
                            Nova descoberta
                          </span>
                        )}
                      </div>
                      <h3 className="font-serif font-bold text-base text-zinc-100 line-clamp-1">
                        {vibeResult.title}
                      </h3>
                      <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 font-light">
                        {vibeResult.synopsis || 'Sinopse disponível na página de detalhes.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-zinc-800/80">
                      <button
                        onClick={() => onSelectManga(vibeResult.id)}
                        className="flex-1 py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-lg transition-colors cursor-pointer text-center"
                      >
                        Ver Obra
                      </button>
                      <button
                        onClick={() => handleRollVibe(selectedVibe)}
                        className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors cursor-pointer"
                        title="Sortear outro"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-md p-8 rounded-2xl bg-zinc-950/40 border border-dashed border-zinc-800 text-center text-zinc-500">
                  <Dices className="h-8 w-8 mx-auto mb-2 text-zinc-600 animate-bounce" />
                  <p className="text-xs">Clique em qualquer humor ao lado para sortear uma obra recomendada</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* =========================================================================
            5. PORTAL RÁPIDO DE EXPLORAÇÃO & FONTES AO VIVO
        ========================================================================= */}
        <section id="catalog-section" className="pt-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-emerald-400" />
                <h2 className="text-xl font-bold tracking-tight text-zinc-100">
                  Rede Federada de Fontes
                </h2>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                4 provedores conectados em tempo real com failover automático
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('open-extensions-modal'));
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs text-rose-300 hover:text-rose-200 rounded-xl font-medium transition-colors cursor-pointer"
                title="Configurar quais repositórios de mangá estão ativos"
              >
                <Blocks className="h-3.5 w-3.5 text-rose-400" />
                <span>Gerenciar Extensões</span>
              </button>

              <button
                onClick={() => onNavigateToSearch()}
                className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 hover:text-white rounded-xl font-medium transition-colors cursor-pointer w-fit"
              >
                <Search className="h-3.5 w-3.5 text-rose-400" />
                <span>Abrir Pesquisa com Filtros</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Sources Status Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-8">
            {sources.map(src => {
              const isEnabled = ExtensionService.isSourceEnabled(src.id);
              return (
                <div
                  key={src.id}
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('open-extensions-modal'));
                    }
                  }}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                    isEnabled
                      ? 'bg-zinc-900/50 hover:bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 shadow-sm'
                      : 'bg-zinc-950/40 border-zinc-850/60 opacity-60 hover:opacity-80'
                  }`}
                  title="Clique para gerenciar esta extensão"
                >
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200">{src.name}</h4>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {src.id === 'mangadex' ? 'Comunidade Global & Scans' :
                       src.id === 'comick' ? 'Agregador Multi-Idioma' :
                       src.id === 'weebcentral' ? 'Scans Rápidos em Alta Definição' :
                       'Catálogo Clássico & Shounen'}
                    </p>
                  </div>
                  {isEnabled ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Ativa
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 bg-zinc-800/60 border border-zinc-750 px-2 py-0.5 rounded-full shrink-0">
                      Desativada
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Genre Links */}
          <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-zinc-200 block">Atalhos por Gênero:</span>
              <p className="text-[11px] text-zinc-500">Busque diretamente pelo seu estilo predileto</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {['Ação', 'Fantasia', 'Comédia', 'Seinen', 'Shounen', 'Romance', 'Mistério', 'Sci-Fi'].map(g => (
                <button
                  key={g}
                  onClick={() => onNavigateToSearch(g)}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-rose-500/40 text-xs text-zinc-300 hover:text-rose-300 rounded-lg transition-colors cursor-pointer"
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};
