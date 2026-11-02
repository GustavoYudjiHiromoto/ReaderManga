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
  Bookmark
} from 'lucide-react';
import { Manga, MangaSourceInfo, ReadingProgress, FavoriteManga, MangaUpdateInfo } from '../types/manga.js';
import { MangaApi } from '../services/api.js';
import { HistoryService } from '../services/history.js';
import { UpdateTrackerService } from '../services/updateTracker.js';

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
  const [updatesMap, setUpdatesMap] = useState<Record<string, MangaUpdateInfo>>(() => UpdateTrackerService.getStoredUpdates());
  const [coverErrors, setCoverErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadInitialData();
    const unsubHistory = HistoryService.subscribe(() => {
      setLocalHistory(HistoryService.getHistory());
      setFavorites(HistoryService.getFavorites());
    });
    const unsubUpdates = UpdateTrackerService.subscribe(() => {
      setUpdatesMap(UpdateTrackerService.getStoredUpdates());
    });
    return () => {
      unsubHistory();
      unsubUpdates();
    };
  }, []);

  const activeHistory = propHistory || localHistory;

  const mangasWithUpdates = useMemo(() => {
    return UpdateTrackerService.getMangasWithUpdates();
  }, [updatesMap, favorites]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [featured, sourcesList] = await Promise.all([
        MangaApi.getFeatured(),
        MangaApi.getSources()
      ]);
      setFeaturedManga(featured);
      setSources(sourcesList);

      // Preload the first thematic collection
      loadCollection('seinen', featured);
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
      // First check if current featured has matches
      const matchedFromFeatured = currentFeatured.filter(m =>
        m.genres.some(g => targetColl.genres.some(tg => g.toLowerCase().includes(tg.toLowerCase())))
      );

      if (matchedFromFeatured.length >= 6) {
        setCollectionItems(matchedFromFeatured.slice(0, 8));
      } else {
        // Query live search for this collection theme
        const searchRes = await MangaApi.search(targetColl.genres[0], { limit: 10, onlyAvailable: true });
        const combined = [...matchedFromFeatured, ...(searchRes.data || [])];
        const deduplicated = Array.from(new Map(combined.map(m => [m.id, m])).values());
        setCollectionItems(deduplicated.slice(0, 8));
      }
    } catch (err) {
      console.warn('Failed to load collection:', err);
    } finally {
      setLoadingCollection(false);
    }
  };

  // Top spotlight mangas (curated 4 titles)
  const spotlightList = useMemo(() => {
    if (featuredManga.length === 0) return [];
    return featuredManga
      .filter(m => m.hasAvailableChapters !== false && !m.isAdult)
      .slice(0, 4);
  }, [featuredManga]);

  const currentHero = spotlightList[heroIndex] || featuredManga[0];

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

  const handleRollVibe = async (vibeId: VibeCategory) => {
    setSelectedVibe(vibeId);
    setIsRollingVibe(true);
    const vibe = VIBE_OPTIONS.find(v => v.id === vibeId);

    try {
      // Find matching items from featured or search
      let candidates: Manga[] = [];
      if (vibe) {
        candidates = featuredManga.filter(m =>
          m.genres.some(g => g.toLowerCase().includes(vibe.query.toLowerCase())) && !m.isAdult
        );
      }

      if (candidates.length < 3 && vibe) {
        const searchRes = await MangaApi.search(vibe.query, { limit: 12, onlyAvailable: true });
        candidates = searchRes.data.filter(m => !m.isAdult);
      }

      if (candidates.length === 0) {
        candidates = featuredManga.filter(m => !m.isAdult);
      }

      const randomManga = candidates[Math.floor(Math.random() * candidates.length)];
      setVibeResult(randomManga || null);
    } catch {
      if (featuredManga.length > 0) {
        setVibeResult(featuredManga[0]);
      }
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

          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 md:py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              
              {/* Left Column: Cover Anchor with Volume Styling */}
              <div className="lg:col-span-4 flex flex-col items-center lg:items-start">
                <div
                  onClick={() => onSelectManga(currentHero.id)}
                  className="group relative w-60 sm:w-64 aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900 cursor-pointer transform hover:-translate-y-1.5 transition-all duration-300"
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
                    <div className="relative h-full w-full flex flex-col justify-between p-5 bg-gradient-to-br from-zinc-900 via-rose-950/30 to-zinc-950">
                      <div className="text-8xl font-serif font-black text-white/[0.04] absolute -right-2 -bottom-4 select-none">
                        漫画
                      </div>
                      <div className="flex justify-between text-[11px] font-mono text-zinc-500 border-b border-zinc-800/80 pb-2">
                        <span>DESTAQUE</span>
                        <span>MANGA</span>
                      </div>
                      <div className="my-auto py-2 text-center">
                        <BookOpen className="h-8 w-8 text-rose-400 mx-auto mb-2" />
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
              <div className="lg:col-span-8 flex flex-col justify-center text-center lg:text-left">
                {/* Quiet unboxed metadata */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 text-xs text-rose-400 font-medium mb-3">
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

                <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-4 text-balance leading-tight">
                  {currentHero.title}
                </h1>

                {/* Author & Status */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 text-sm text-zinc-400 mb-5">
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
                <p className="text-sm sm:text-base text-zinc-300 line-clamp-3 leading-relaxed mb-6 font-light max-w-2xl mx-auto lg:mx-0">
                  {currentHero.synopsis || 'Sinopse disponível na página de detalhes da obra.'}
                </p>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-8">
                  <button
                    onClick={() => handleHeroRead(currentHero)}
                    className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-medium text-sm transition-all flex items-center gap-2 shadow-lg shadow-rose-950/60 cursor-pointer active:scale-95"
                  >
                    <BookOpen className="h-4 w-4" />
                    <span>
                      {HistoryService.getProgress(currentHero.id) ? 'Continuar Leitura' : 'Iniciar Leitura (Cap. 1)'}
                    </span>
                  </button>

                  <button
                    onClick={() => onSelectManga(currentHero.id)}
                    className="px-5 py-2.5 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 hover:text-white rounded-xl font-medium text-sm border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
                  >
                    Ver Capítulos & Detalhes
                  </button>
                </div>

                {/* Quick Spotlight Switcher Tabs */}
                {spotlightList.length > 1 && (
                  <div className="pt-4 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 scrollbar-none">
                      <span className="text-xs text-zinc-400 font-medium mr-1 hidden sm:inline">
                        Destaques:
                      </span>
                      {spotlightList.map((spot, idx) => (
                        <button
                          key={spot.id}
                          onClick={() => setHeroIndex(idx)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer truncate max-w-[140px] sm:max-w-[170px] ${
                            idx === heroIndex
                              ? 'bg-zinc-800 text-white border border-rose-500/40 shadow-sm'
                              : 'bg-zinc-900/60 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80'
                          }`}
                        >
                          {spot.title}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={handleHeroPrev}
                        aria-label="Destaque anterior"
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={handleHeroNext}
                        aria-label="Próximo destaque"
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
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

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-12 space-y-16">
        
        {/* =========================================================================
            RADAR DE LANÇAMENTOS (NOVOS CAPÍTULOS DISPONÍVEIS)
        ========================================================================= */}
        {mangasWithUpdates.length > 0 && (
          <section className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-950/25 via-zinc-900/60 to-zinc-900/30 border border-rose-500/30 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-rose-500/20 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">Radar de Lançamentos</h2>
                    <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold tracking-wider uppercase">
                      {mangasWithUpdates.length} Novo{mangasWithUpdates.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">Novos capítulos chegaram para as obras da sua biblioteca</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {mangasWithUpdates.map((update) => {
                const fav = favorites.find(f => f.mangaId === update.mangaId);
                if (!fav) return null;
                return (
                  <div
                    key={update.mangaId}
                    onClick={() => {
                      UpdateTrackerService.markMangaUpdateAsSeen(update.mangaId);
                      if (onReadChapter) {
                        onReadChapter(update.mangaId, update.latestChapterId);
                      } else {
                        onSelectManga(update.mangaId);
                      }
                    }}
                    className="group flex items-center gap-3 p-2.5 rounded-xl bg-zinc-950/80 hover:bg-zinc-900/90 border border-zinc-800/80 hover:border-rose-500/50 transition-all cursor-pointer shadow-md"
                  >
                    <img
                      src={fav.coverUrl || '/icon.svg'}
                      alt={fav.title}
                      className="w-12 h-16 object-cover rounded-lg shrink-0 bg-zinc-900 border border-zinc-800"
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-semibold text-zinc-200 group-hover:text-rose-300 truncate">
                        {fav.title}
                      </span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-[10px] font-bold">
                          Cap. {update.latestChapterNumber}
                        </span>
                        {update.lastReadNumber && (
                          <span className="text-[10px] text-zinc-500 font-mono truncate">
                            (leu: {update.lastReadNumber})
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-rose-400 font-medium mt-1 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                        Ler agora →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

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
                  <span>Histórico completo ({activeHistory.length})</span>
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
                    className="group relative flex gap-3.5 p-3.5 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-rose-500/30 rounded-xl cursor-pointer transition-all duration-200 shadow-sm hover:shadow-lg"
                  >
                    <img
                      src={item.mangaCover}
                      alt={item.mangaTitle}
                      referrerPolicy="no-referrer"
                      className="w-16 h-22 object-cover rounded-lg shrink-0 bg-zinc-950 border border-zinc-800"
                    />

                    <div className="flex flex-1 flex-col justify-between overflow-hidden">
                      <div>
                        <h4 className="font-semibold text-sm text-zinc-100 line-clamp-1 group-hover:text-rose-400 transition-colors">
                          {item.mangaTitle}
                        </h4>
                        <div className="flex items-center justify-between gap-1 text-xs text-zinc-400 mt-1">
                          <div className="flex items-center gap-1">
                            <span>Capítulo</span>
                            <span className="font-mono text-zinc-200 font-semibold tabular-nums">
                              {item.chapterNumber}
                            </span>
                          </div>
                          {updatesMap[item.mangaId]?.hasNew && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-[9px] font-bold animate-pulse">
                              <Sparkles className="h-2.5 w-2.5" />
                              Novo Cap. {updatesMap[item.mangaId]?.latestChapterNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 font-mono tabular-nums mt-0.5">
                          Página {item.pageNumber} de {item.totalPages} ({percent}%)
                        </p>
                      </div>

                      <div>
                        <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-rose-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {collectionItems.map((manga) => (
                <div
                  key={manga.id}
                  onClick={() => onSelectManga(manga.id)}
                  className="group relative flex flex-col bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 shadow-sm hover:shadow-xl"
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
                      <div className="absolute top-2 right-2 flex items-center gap-1 bg-zinc-950/90 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-300 border border-zinc-800">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span>{manga.rating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-3 flex flex-1 flex-col justify-between">
                    <div>
                      <h4 className="font-semibold text-xs text-zinc-100 group-hover:text-rose-400 transition-colors line-clamp-1">
                        {manga.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                        {manga.authors?.[0] || manga.sources[0]?.sourceName || 'MangaReader'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-2 border-t border-zinc-800/60 mt-2">
                      <span className="truncate max-w-[85px]">{manga.genres[0] || 'Obra'}</span>
                      <span className="text-rose-400 font-medium group-hover:translate-x-0.5 transition-transform">
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
        <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900/90 via-zinc-900/40 to-zinc-950 p-6 sm:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Column: Vibe Selector */}
            <div className="lg:col-span-6">
              <div className="flex items-center gap-2 mb-2">
                <Dices className="h-5 w-5 text-amber-400" />
                <span className="text-xs uppercase tracking-widest text-amber-400 font-semibold">
                  Oráculo da Leitura
                </span>
              </div>

              <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-white mb-3">
                Qual é a sua vibe de leitura hoje?
              </h2>

              <p className="text-xs sm:text-sm text-zinc-400 mb-6 font-light leading-relaxed">
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
                      className={`p-3 rounded-xl border text-xs font-medium text-left transition-all flex flex-col gap-1.5 cursor-pointer ${
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
                <div className="w-full max-w-md p-4 sm:p-5 rounded-2xl bg-zinc-950 border border-zinc-800 flex gap-4 items-center shadow-xl animate-in fade-in zoom-in-95 duration-200">
                  <div className="w-24 sm:w-28 aspect-[3/4] rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-zinc-800">
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
                      <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-mono mb-1">
                        <span>RECOMENDAÇÃO SORTEADA</span>
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

            <button
              onClick={() => onNavigateToSearch()}
              className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 hover:text-white rounded-xl font-medium transition-colors cursor-pointer w-fit"
            >
              <Search className="h-3.5 w-3.5 text-rose-400" />
              <span>Abrir Pesquisa Completa com Filtros</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Sources Status Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-8">
            {sources.map(src => (
              <div
                key={src.id}
                className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800 flex items-center justify-between gap-3"
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
                <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Ativo
                </span>
              </div>
            ))}
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
