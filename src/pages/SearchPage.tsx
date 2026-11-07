import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, Filter, BookOpen, RefreshCw, Dices, SlidersHorizontal, ChevronDown, ChevronUp, RotateCcw, Check, Sparkles, Globe2, Users, Clock, ShieldCheck, ShieldAlert, Blocks } from 'lucide-react';
import { Manga } from '../types/manga.js';
import { MangaApi } from '../services/api.js';
import { MangaCard } from '../components/MangaCard.js';
import { ExtensionService } from '../services/extensionService.js';

interface SearchPageProps {
  onSelectManga: (mangaId: string) => void;
  onReadChapter?: (mangaId: string, chapterId: string) => void;
  initialQuery?: string;
}

export const GENRE_TRANSLATIONS: Record<string, string[]> = {
  // Tropes & Subgêneros Específicos
  'overpower (op)': [
    'overpower', 'overpowered', 'op protagonist', 'cheat skill', 'cheat ability',
    'apelão', 'strongest', 'unrivaled', 'invincible', 'max level', 'saikyou',
    'peerless', 'godlike', 'overpowered protagonist', 'cheat', 'unmatched'
  ],
  'yandere': ['yandere', 'stalker', 'obsessive', 'possessive', 'yandere girlfriend'],
  'tomboy': ['tomboy', 'garota moleca', 'moleca', 'boyish'],
  'construção de vila': ['village building', 'kingdom building', 'city building', 'nation building', 'territory', 'construção de vila', 'reino', 'settlement', 'estate developer', 'fief', 'território', 'construcao de vila'],
  'fazenda / agricultura': ['farming', 'fazenda', 'agricultura', 'slow life', 'vida calma', 'vida lenta', 'agriculture', 'harvest', 'farm life'],
  'vilã (villainess)': ['villainess', 'vilã', 'vila', 'antagonista', 'villain'],
  'reencarnação': ['reincarnation', 'reencarnação', 'transmigration', 'reborn', 'reencarnado', 'isekai'],
  'regressão / tempo': ['time travel', 'regression', 'regressor', 'viagem no tempo', 'retorno', 'loop', 'timeline', 'regressão', 'regressao'],
  'dungeon / sistema': ['dungeon', 'system', 'sistema', 'portais', 'hunter', 'leveling', 'ranker', 'tower', 'awakening'],
  'cultivação / murim': ['cultivation', 'cultivo', 'murim', 'wuxia', 'xianxia', 'martial arts', 'artes marciais', 'qi', 'sect'],
  'domador de monstros': ['monster tamer', 'tamer', 'domador', 'monster pet', 'beast tamer', 'monster', 'pet'],
  'vingança': ['revenge', 'vingança', 'betrayal', 'traição', 'retribution', 'avenger'],
  'romance colegial': ['school life', 'school romance', 'colegial', 'escolar', 'student', 'high school'],
  'harem invertido': ['reverse harem', 'harem invertido'],
  'psicológico': ['psychological', 'psicológico', 'psicologico'],
  'sobrevivência': ['survival', 'sobrevivência', 'sobrevivencia', 'death game'],
  'isekai': ['isekai', 'another world', 'outro mundo', 'summoned', 'transported'],

  // Gêneros Clássicos
  'ação': ['action', 'ação', 'acao'],
  'fantasia': ['fantasy', 'fantasia', 'magic', 'magia'],
  'comédia': ['comedy', 'comédia', 'comedia', 'funny'],
  'aventura': ['adventure', 'aventura', 'quest'],
  'drama': ['drama'],
  'sobrenatural': ['supernatural', 'sobrenatural'],
  'histórico': ['historical', 'histórico', 'historico'],
  'horror': ['horror', 'terror'],
  'sci-fi': ['sci-fi', 'sci fi', 'science fiction', 'ficção científica'],
  'romance': ['romance', 'love'],
  'mistério': ['mystery', 'mistério', 'misterio'],
  'slice of life': ['slice of life', 'cotidiano'],
  'esportes': ['sports', 'esportes', 'esporte']
};

export const SPECIFIC_TROPES = [
  { id: 'Isekai', label: 'Isekai', highlight: true },
  { id: 'Overpower (OP)', label: 'Overpower (OP)', highlight: true },
  { id: 'Yandere', label: 'Yandere', highlight: true },
  { id: 'Tomboy', label: 'Tomboy', highlight: true },
  { id: 'Construção de Vila', label: 'Construção de Vila / Reino', highlight: true },
  { id: 'Fazenda / Agricultura', label: 'Fazenda / Agricultura', highlight: true },
  { id: 'Vilã (Villainess)', label: 'Vilã (Villainess)', highlight: true },
  { id: 'Reencarnação', label: 'Reencarnação' },
  { id: 'Regressão / Tempo', label: 'Regressão / Tempo' },
  { id: 'Dungeon / Sistema', label: 'Dungeon / Sistema' },
  { id: 'Cultivação / Murim', label: 'Cultivação / Murim' },
  { id: 'Domador de Monstros', label: 'Domador de Monstros' },
  { id: 'Vingança', label: 'Vingança' },
  { id: 'Romance Colegial', label: 'Romance Colegial' },
  { id: 'Harem Invertido', label: 'Harem Invertido' },
  { id: 'Psicológico', label: 'Psicológico' },
  { id: 'Sobrevivência', label: 'Sobrevivência' }
];

export const CLASSIC_GENRES = [
  'Ação',
  'Fantasia',
  'Comédia',
  'Aventura',
  'Drama',
  'Sobrenatural',
  'Histórico',
  'Horror',
  'Sci-Fi',
  'Romance',
  'Mistério',
  'Slice of Life',
  'Esportes'
];

export function getMangaType(manga: Manga): 'manga' | 'manhwa' | 'manhua' | 'comic' {
  const country = (manga.publicationInfo?.country || '').toLowerCase();
  const genres = (manga.genres || []).map(g => g.toLowerCase());

  if (country === 'kr' || country === 'coreia' || country === 'korea' || country === 'south korea' || genres.includes('manhwa')) {
    return 'manhwa';
  }
  if (country === 'cn' || country === 'china' || country === 'zh' || country === 'taiwan' || genres.includes('manhua')) {
    return 'manhua';
  }
  if (country === 'us' || country === 'en' || country === 'estados unidos' || genres.includes('comic') || genres.includes('webtoon') || genres.includes('western')) {
    return 'comic';
  }
  return 'manga';
}

export function getMangaDemographic(manga: Manga): string | undefined {
  if (manga.publicationInfo?.demographic) {
    const d = manga.publicationInfo.demographic.toLowerCase();
    if (d.includes('shounen') || d.includes('shonen')) return 'shounen';
    if (d.includes('shoujo') || d.includes('shojo')) return 'shoujo';
    if (d.includes('seinen')) return 'seinen';
    if (d.includes('josei')) return 'josei';
    return d;
  }
  const genres = (manga.genres || []).map(g => g.toLowerCase());
  if (genres.some(g => g.includes('shounen') || g.includes('shonen'))) return 'shounen';
  if (genres.some(g => g.includes('shoujo') || g.includes('shojo'))) return 'shoujo';
  if (genres.some(g => g.includes('seinen'))) return 'seinen';
  if (genres.some(g => g.includes('josei'))) return 'josei';
  return undefined;
}

export function matchGenre(mangaOrGenres: Manga | string[] | undefined, filterGenre: string): boolean {
  if (!mangaOrGenres) return true;
  const targetLower = filterGenre.toLowerCase().trim();
  const synonyms = GENRE_TRANSLATIONS[targetLower] || [targetLower];

  let genresLower: string[] = [];
  let titleLower = '';
  let synopsisLower = '';

  if (Array.isArray(mangaOrGenres)) {
    genresLower = mangaOrGenres.map(g => g.toLowerCase());
  } else {
    genresLower = (mangaOrGenres.genres || []).map(g => g.toLowerCase());
    titleLower = (mangaOrGenres.title || '').toLowerCase();
    synopsisLower = (mangaOrGenres.synopsis || '').toLowerCase();
    const alts = (mangaOrGenres.altTitles || []).map(a => a.toLowerCase());
    titleLower += ' ' + alts.join(' ');
  }

  return synonyms.some(syn => {
    const s = syn.toLowerCase();
    if (genresLower.some(g => g.includes(s) || s.includes(g))) return true;
    if (titleLower && titleLower.includes(s)) return true;
    if (synopsisLower && synopsisLower.includes(s)) return true;
    return false;
  });
}

export const SearchPage: React.FC<SearchPageProps> = ({ onSelectManga, initialQuery = '' }) => {
  const getUrlParam = (key: string, fallback: string = '') => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const val = sp.get(key);
      if (val !== null) return val;
    }
    return fallback;
  };

  const [query, setQuery] = useState(() => getUrlParam('q', initialQuery));
  const [results, setResults] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Filters state
  const [selectedStatus, setSelectedStatus] = useState<string>(() => getUrlParam('status', 'all'));
  const [selectedDemographic, setSelectedDemographic] = useState<string>(() => getUrlParam('demographic', 'all'));
  const [selectedType, setSelectedType] = useState<string>(() => getUrlParam('type', 'all'));
  const [selectedSource, setSelectedSource] = useState<string>(() => getUrlParam('source', 'all'));
  const [includedGenres, setIncludedGenres] = useState<string[]>(() => {
    const gs = getUrlParam('genres', '');
    const g = getUrlParam('genre', '');
    if (gs) return gs.split(',').filter(Boolean);
    if (g && g !== 'all') return [g];
    return [];
  });
  const [safeSearch, setSafeSearch] = useState<boolean>(() => getUrlParam('safe', '1') === '1');
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(() => getUrlParam('available', '1') !== '0');

  const [sourcesQueried, setSourcesQueried] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const observerRef = useRef<HTMLDivElement | null>(null);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedStatus !== 'all') count++;
    if (selectedDemographic !== 'all') count++;
    if (selectedType !== 'all') count++;
    if (selectedSource !== 'all') count++;
    if (!safeSearch) count++;
    if (!onlyAvailable) count++; // Counted if user explicitly disables filtering of catalog-only manga
    count += includedGenres.length;
    return count;
  }, [selectedStatus, selectedDemographic, selectedType, selectedSource, safeSearch, onlyAvailable, includedGenres]);

  useEffect(() => {
    const startQ = getUrlParam('q', initialQuery);
    const startStatus = getUrlParam('status', 'all');
    const startDemo = getUrlParam('demographic', 'all');
    const startType = getUrlParam('type', 'all');
    const startSrc = getUrlParam('source', 'all');
    const startInc = getUrlParam('genres', '')
      ? getUrlParam('genres', '').split(',').filter(Boolean)
      : (getUrlParam('genre', '') && getUrlParam('genre', '') !== 'all' ? [getUrlParam('genre', '')] : []);
    const startSafe = getUrlParam('safe', '1') === '1';
    const startAvail = getUrlParam('available', '1') !== '0';

    executeSearch(startQ, startInc, startStatus, startDemo, startType, startSafe, startAvail, startSrc);
  }, []);

  // Subscribe to extension toggles in modal to automatically refresh active sources
  useEffect(() => {
    const unsub = ExtensionService.subscribe(() => {
      executeSearch(query, includedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource);
    });
    return unsub;
  }, [query, includedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource]);

  useEffect(() => {
    if (initialQuery && initialQuery !== query) {
      setQuery(initialQuery);
      executeSearch(initialQuery, includedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource);
    }
  }, [initialQuery]);

  const executeSearch = async (
    searchQuery: string,
    incGenres = includedGenres,
    stat = selectedStatus,
    demo = selectedDemographic,
    typ = selectedType,
    isSafe = safeSearch,
    availOnly = onlyAvailable,
    src = selectedSource
  ) => {
    setLoading(true);
    setSearchPage(1);
    setHasMore(true);

    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/search')) {
      const sp = new URLSearchParams();
      if (searchQuery.trim()) sp.set('q', searchQuery.trim());
      if (stat && stat !== 'all') sp.set('status', stat);
      if (demo && demo !== 'all') sp.set('demographic', demo);
      if (typ && typ !== 'all') sp.set('type', typ);
      if (src && src !== 'all') sp.set('source', src);
      if (incGenres.length > 0) sp.set('genres', incGenres.join(','));
      if (!isSafe) sp.set('safe', '0');
      if (!availOnly) sp.set('available', '0');
      const newUrl = sp.toString() ? `/search?${sp.toString()}` : '/search';
      window.history.replaceState({ ...window.history.state, view: 'search' }, '', newUrl);
    }

    try {
      // Map primary genre to English for provider APIs
      const primaryGenreEnglish = incGenres.length > 0
        ? (GENRE_TRANSLATIONS[incGenres[0].toLowerCase()]?.[0] || incGenres[0])
        : undefined;

      const activeSources = src !== 'all' ? [src] : ExtensionService.getEnabledSourceIds();

      const res = await MangaApi.search(searchQuery, {
        source: src !== 'all' ? src : undefined,
        sources: activeSources,
        genre: primaryGenreEnglish,
        genres: incGenres,
        demographic: demo === 'all' ? undefined : demo,
        type: typ === 'all' ? undefined : typ,
        status: stat === 'all' ? undefined : stat,
        limit: 36,
        page: 1,
        includeAdult: !isSafe,
        onlyAvailable: availOnly
      });

      let data = res.data || [];

      // Filter by genres accurately (checking both tags and synopsis/title for specific tropes)
      if (incGenres.length > 0) {
        data = data.filter(m => incGenres.every(ig => matchGenre(m, ig)));
      }

      // Filter by status
      if (stat !== 'all') {
        data = data.filter(m => m.status === stat);
      }

      // Filter by demographic
      if (demo !== 'all') {
        data = data.filter(m => getMangaDemographic(m) === demo);
      }

      // Filter by type / format
      if (typ !== 'all') {
        data = data.filter(m => getMangaType(m) === typ);
      }

      setResults(data);
      setSourcesQueried(res.sourcesQueried || []);
      if (data.length < 24) {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    const nextPage = searchPage + 1;
    try {
      const primaryGenreEnglish = includedGenres.length > 0
        ? (GENRE_TRANSLATIONS[includedGenres[0].toLowerCase()]?.[0] || includedGenres[0])
        : undefined;

      const activeSources = selectedSource !== 'all' ? [selectedSource] : ExtensionService.getEnabledSourceIds();

      const res = await MangaApi.search(query, {
        source: selectedSource !== 'all' ? selectedSource : undefined,
        sources: activeSources,
        genre: primaryGenreEnglish,
        genres: includedGenres,
        demographic: selectedDemographic === 'all' ? undefined : selectedDemographic,
        type: selectedType === 'all' ? undefined : selectedType,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        limit: 24,
        page: nextPage,
        includeAdult: !safeSearch,
        onlyAvailable: onlyAvailable
      });

      let newItems = res.data || [];

      if (includedGenres.length > 0) {
        newItems = newItems.filter(m => includedGenres.every(ig => matchGenre(m, ig)));
      }
      if (selectedStatus !== 'all') {
        newItems = newItems.filter(m => m.status === selectedStatus);
      }
      if (selectedDemographic !== 'all') {
        newItems = newItems.filter(m => getMangaDemographic(m) === selectedDemographic);
      }
      if (selectedType !== 'all') {
        newItems = newItems.filter(m => getMangaType(m) === selectedType);
      }

      if (newItems.length === 0 || newItems.length < 24) {
        setHasMore(false);
      }
      setResults(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const filteredNew = newItems.filter(m => !existingIds.has(m.id));
        return [...prev, ...filteredNew];
      });
      setSearchPage(nextPage);
    } catch (err) {
      console.error('Failed to load more search results:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  // IntersectionObserver for seamless Infinite Scroll
  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const target = observerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading && results.length > 0) {
          handleLoadMore();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, results.length, searchPage]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query, includedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable);
  };

  const handleClear = () => {
    setQuery('');
    executeSearch('', includedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable);
  };

  const handleStatusSelect = (stat: string) => {
    const nextStat = selectedStatus === stat ? 'all' : stat;
    setSelectedStatus(nextStat);
    executeSearch(query, includedGenres, nextStat, selectedDemographic, selectedType, safeSearch, onlyAvailable);
  };

  const handleDemographicSelect = (demo: string) => {
    const nextDemo = selectedDemographic === demo ? 'all' : demo;
    setSelectedDemographic(nextDemo);
    executeSearch(query, includedGenres, selectedStatus, nextDemo, selectedType, safeSearch, onlyAvailable);
  };

  const handleTypeSelect = (typ: string) => {
    const nextType = selectedType === typ ? 'all' : typ;
    setSelectedType(nextType);
    executeSearch(query, includedGenres, selectedStatus, selectedDemographic, nextType, safeSearch, onlyAvailable, selectedSource);
  };

  const handleSourceSelect = (src: string) => {
    const nextSrc = selectedSource === src ? 'all' : src;
    setSelectedSource(nextSrc);
    executeSearch(query, includedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, nextSrc);
  };

  // 2-state toggle: click 1 = select, click 2 = deselect
  const handleGenreToggle = (genreId: string) => {
    let nextInc: string[];
    if (includedGenres.includes(genreId)) {
      nextInc = includedGenres.filter(g => g !== genreId);
    } else {
      nextInc = [...includedGenres, genreId];
    }
    setIncludedGenres(nextInc);
    executeSearch(query, nextInc, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource);
  };

  const handleClearGenres = () => {
    setIncludedGenres([]);
    executeSearch(query, [], selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource);
  };

  const toggleSafeSearch = () => {
    const nextSafe = !safeSearch;
    setSafeSearch(nextSafe);
    executeSearch(query, includedGenres, selectedStatus, selectedDemographic, selectedType, nextSafe, onlyAvailable, selectedSource);
  };

  const toggleOnlyAvailable = () => {
    const nextAvail = !onlyAvailable;
    setOnlyAvailable(nextAvail);
    executeSearch(query, includedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, nextAvail, selectedSource);
  };

  const handleClearAllFilters = () => {
    setSelectedStatus('all');
    setSelectedDemographic('all');
    setSelectedType('all');
    setSelectedSource('all');
    setSafeSearch(true);
    setOnlyAvailable(true);
    setIncludedGenres([]);
    executeSearch(query, [], 'all', 'all', 'all', true, true, 'all');
  };

  const handleRandomManga = async () => {
    try {
      const pool = results.length > 0 ? results : (await MangaApi.getFeatured());
      if (pool.length === 0) return;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      onSelectManga(chosen.id);
    } catch (err) {
      console.warn('Failed to pick random manga:', err);
    }
  };

  const POPULAR_SEARCH_TERMS = ['Solo Leveling', 'Frieren', 'Chainsaw Man', 'One Piece', 'Berserk', 'Spy x Family', 'Jujutsu Kaisen', 'Oshi no Ko'];

  const STATUS_OPTIONS = [
    { id: 'all', label: 'Todos' },
    { id: 'ongoing', label: 'Em Andamento' },
    { id: 'completed', label: 'Concluído' },
    { id: 'hiatus', label: 'Hiato' },
    { id: 'cancelled', label: 'Cancelado' }
  ];

  const DEMOGRAPHIC_OPTIONS = [
    { id: 'all', label: 'Todas' },
    { id: 'shounen', label: 'Shounen' },
    { id: 'shoujo', label: 'Shoujo' },
    { id: 'seinen', label: 'Seinen' },
    { id: 'josei', label: 'Josei' }
  ];

  const TYPE_OPTIONS = [
    { id: 'all', label: 'Todos' },
    { id: 'manga', label: 'Mangá (JP)' },
    { id: 'manhwa', label: 'Manhwa (KR)' },
    { id: 'manhua', label: 'Manhua (CN)' },
    { id: 'comic', label: 'Comics / Webtoon' }
  ];

  const SOURCE_OPTIONS = [
    { id: 'all', label: 'Todas as Extensões Ativas' },
    { id: 'mangadex', label: 'MangaDex (Oficial)' },
    { id: 'comick', label: 'Comick' },
    { id: 'weebcentral', label: 'WeebCentral' },
    { id: 'mangapill', label: 'MangaPill' },
    { id: 'mangafire', label: 'MangaFire' },
    { id: 'mangaball', label: 'MangaBall' }
  ];

  const statusLabel = (st: string) => {
    const found = STATUS_OPTIONS.find(o => o.id === st);
    return found ? found.label : st;
  };

  const demographicLabel = (dm: string) => {
    const found = DEMOGRAPHIC_OPTIONS.find(o => o.id === dm);
    return found ? found.label : dm;
  };

  const typeLabel = (tp: string) => {
    const found = TYPE_OPTIONS.find(o => o.id === tp);
    return found ? found.label : tp;
  };

  const sourceLabel = (src: string) => {
    const found = SOURCE_OPTIONS.find(o => o.id === src);
    return found ? found.label : src;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-24">
      {/* Search Header Container */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/40 py-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center mb-6">
            <h1 className="font-serif text-3xl font-bold tracking-tight text-white">
              Pesquisar Mangás
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Catálogo completo com filtros por demografia, formato, status e subgêneros
            </p>
          </div>

          {/* Search Box */}
          <div className="max-w-2xl mx-auto space-y-3">
            <form onSubmit={handleSearchSubmit} className="relative flex items-center">
              <Search className="absolute left-4 h-5 w-5 text-zinc-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Título, autor, ou palavra-chave (ex: overpowered, vilã, yandere)..."
                className="w-full pl-12 pr-28 py-3.5 bg-zinc-900/90 border border-zinc-700/80 focus:border-rose-500 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 shadow-inner focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-20 p-1 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
                  title="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="submit"
                className="absolute right-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-sm"
              >
                Buscar
              </button>
            </form>

            {/* Filter Toggle & Quick Actions */}
            <div className="flex items-center justify-between text-xs px-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer font-medium ${
                    showFilters || activeFiltersCount > 0
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-sm'
                      : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                  }`}
                  title="Configurar filtros específicos"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Filtros Específicos</span>
                  {activeFiltersCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-500/30 text-rose-200 text-[10px] font-mono">
                      {activeFiltersCount}
                    </span>
                  )}
                  {showFilters ? <ChevronUp className="h-3.5 w-3.5 ml-0.5 text-zinc-400" /> : <ChevronDown className="h-3.5 w-3.5 ml-0.5 text-zinc-400" />}
                </button>

                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer text-xs"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleRandomManga}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-all cursor-pointer"
                title="Sortear um mangá aleatório para ler agora"
              >
                <Dices className="h-3.5 w-3.5 text-rose-400" />
                <span>Surpreenda-me</span>
              </button>
            </div>

            {/* Quick Keyword Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 text-xs text-zinc-400">
              <span className="text-[11px] text-zinc-500 shrink-0">Sugestões:</span>
              {POPULAR_SEARCH_TERMS.map(term => (
                <button
                  key={term}
                  type="button"
                  onClick={() => {
                    setQuery(term);
                    executeSearch(term, includedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable);
                  }}
                  className="px-2.5 py-1 rounded-md bg-zinc-900/60 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800/80 shrink-0 transition-colors cursor-pointer text-[11px]"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          {/* Expandable Filter Panel */}
          {showFilters && (
            <div className="mt-6 max-w-3xl mx-auto p-5 sm:p-6 rounded-2xl bg-zinc-950/95 border border-zinc-800 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-rose-400" />
                  <span className="font-semibold text-sm text-zinc-100">Filtros Avançados & Categorias</span>
                </div>
                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 cursor-pointer font-medium"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Redefinir Tudo</span>
                  </button>
                )}
              </div>

              {/* 1. Demografia & Formato / Origem */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Demografia */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                    <Users className="h-3.5 w-3.5 text-rose-400" />
                    <span>Demografia (Público-Alvo):</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {DEMOGRAPHIC_OPTIONS.map((dm) => (
                      <button
                        key={dm.id}
                        type="button"
                        onClick={() => handleDemographicSelect(dm.id)}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer border ${
                          selectedDemographic === dm.id
                            ? 'bg-rose-500/20 text-rose-300 font-semibold border-rose-500/40 shadow-sm'
                            : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                        }`}
                      >
                        {dm.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Formato / Tipo */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                    <Globe2 className="h-3.5 w-3.5 text-rose-400" />
                    <span>Formato / Origem:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {TYPE_OPTIONS.map((tp) => (
                      <button
                        key={tp.id}
                        type="button"
                        onClick={() => handleTypeSelect(tp.id)}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer border ${
                          selectedType === tp.id
                            ? 'bg-rose-500/20 text-rose-300 font-semibold border-rose-500/40 shadow-sm'
                            : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                        }`}
                      >
                        {tp.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 2. Status da Obra & Preferências */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-zinc-850">
                {/* Status da Obra */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                    <Clock className="h-3.5 w-3.5 text-rose-400" />
                    <span>Status da Obra:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {STATUS_OPTIONS.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => handleStatusSelect(st.id)}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer border ${
                          selectedStatus === st.id
                            ? 'bg-rose-500/20 text-rose-300 font-semibold border-rose-500/40 shadow-sm'
                            : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preferências */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-300">Preferências de Conteúdo:</span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={toggleSafeSearch}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        safeSearch
                          ? 'bg-emerald-950/30 text-emerald-300 border-emerald-600/40 hover:bg-emerald-950/50'
                          : 'bg-rose-950/40 text-rose-300 border-rose-600/50 hover:bg-rose-950/60'
                      }`}
                    >
                      {safeSearch ? (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Filtro +18: Ativo</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
                          <span>Exibindo +18</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={toggleOnlyAvailable}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        onlyAvailable
                          ? 'bg-rose-950/40 text-rose-300 border-rose-600/50 hover:bg-rose-950/60'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                      title={onlyAvailable ? "Mostrando apenas mangás com capítulos disponíveis para ler" : "Mostrando todas as obras, incluindo itens de catálogo sem capítulos"}
                    >
                      <BookOpen className={`h-3.5 w-3.5 ${onlyAvailable ? 'text-rose-400' : 'text-zinc-400'}`} />
                      <span>{onlyAvailable ? 'Apenas com Capítulos' : 'Incluir sem Capítulos'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Extensão / Repositório de Origem */}
              <div className="space-y-2 pt-3 border-t border-zinc-850">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-zinc-300">
                    <Blocks className="h-3.5 w-3.5 text-rose-400" />
                    <span>Filtrar por Extensão / Repositório:</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('open-extensions-modal'));
                      }
                    }}
                    className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 transition-colors cursor-pointer font-medium"
                    title="Configurar quais repositórios estão ativos ou desativados"
                  >
                    <Blocks className="h-3 w-3" />
                    <span>Gerenciar Extensões</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 text-xs">
                  {SOURCE_OPTIONS.map((so) => (
                    <button
                      key={so.id}
                      type="button"
                      onClick={() => handleSourceSelect(so.id)}
                      className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer border ${
                        selectedSource === so.id
                          ? 'bg-rose-500/20 text-rose-300 font-semibold border-rose-500/40 shadow-sm'
                          : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                      }`}
                    >
                      {so.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Subgêneros & Tropes Específicos (Yandere, Tomboy, Isekai Village Building, Overpower, etc.) */}
              <div className="space-y-2 pt-3 border-t border-zinc-850">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-rose-300">
                    <Sparkles className="h-3.5 w-3.5 text-rose-400" />
                    <span>Subgêneros & Tropes Populares:</span>
                  </div>
                  {includedGenres.some(g => SPECIFIC_TROPES.some(t => t.id === g)) && (
                    <button
                      type="button"
                      onClick={() => {
                        const remaining = includedGenres.filter(g => !SPECIFIC_TROPES.some(t => t.id === g));
                        setIncludedGenres(remaining);
                        executeSearch(query, remaining, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable);
                      }}
                      className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      Limpar Tropes
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {SPECIFIC_TROPES.map((trope) => {
                    const isSelected = includedGenres.includes(trope.id);
                    return (
                      <button
                        key={trope.id}
                        type="button"
                        onClick={() => handleGenreToggle(trope.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-rose-500/25 border-rose-500/70 text-rose-200 font-semibold shadow-sm'
                            : trope.highlight
                            ? 'bg-zinc-900/90 border-zinc-700/80 text-zinc-300 hover:text-rose-300 hover:border-rose-500/50'
                            : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 text-rose-400 shrink-0" />}
                        <span>{trope.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Gêneros Clássicos */}
              <div className="space-y-2 pt-3 border-t border-zinc-850">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-400">Gêneros Tradicionais:</span>
                  {includedGenres.some(g => CLASSIC_GENRES.includes(g)) && (
                    <button
                      type="button"
                      onClick={() => {
                        const remaining = includedGenres.filter(g => !CLASSIC_GENRES.includes(g));
                        setIncludedGenres(remaining);
                        executeSearch(query, remaining, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable);
                      }}
                      className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      Limpar Tradicionais
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {CLASSIC_GENRES.map((g) => {
                    const isSelected = includedGenres.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => handleGenreToggle(g)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-rose-500/20 border-rose-500/60 text-rose-200 font-semibold shadow-sm'
                            : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 text-rose-400 shrink-0" />}
                        <span>{g}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Panel Footer */}
              <div className="flex items-center justify-end pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
                >
                  Concluir
                </button>
              </div>
            </div>
          )}

          {/* Active Filter Chips Bar */}
          {!showFilters && activeFiltersCount > 0 && (
            <div className="mt-4 max-w-2xl mx-auto flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs">
              <span className="text-zinc-500 text-[11px] font-medium">Filtros Ativos:</span>

              {selectedDemographic !== 'all' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700/60 text-[11px]">
                  <span>Demografia: {demographicLabel(selectedDemographic)}</span>
                  <button type="button" onClick={() => handleDemographicSelect('all')} className="hover:text-rose-400 cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {selectedType !== 'all' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700/60 text-[11px]">
                  <span>Formato: {typeLabel(selectedType)}</span>
                  <button type="button" onClick={() => handleTypeSelect('all')} className="hover:text-rose-400 cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {selectedStatus !== 'all' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700/60 text-[11px]">
                  <span>Status: {statusLabel(selectedStatus)}</span>
                  <button type="button" onClick={() => handleStatusSelect('all')} className="hover:text-rose-400 cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {selectedSource !== 'all' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-rose-300 border border-rose-500/30 text-[11px]">
                  <span>Fonte: {sourceLabel(selectedSource)}</span>
                  <button type="button" onClick={() => handleSourceSelect('all')} className="hover:text-white cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {!safeSearch && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/40 text-rose-300 border border-rose-600/40 text-[11px]">
                  <span>+18 Ativo</span>
                  <button type="button" onClick={toggleSafeSearch} className="hover:text-white cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {!onlyAvailable && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/40 text-amber-300 border border-amber-600/40 text-[11px]">
                  <span>Inclui Catálogo Sem Capítulos</span>
                  <button type="button" onClick={toggleOnlyAvailable} className="hover:text-white cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {includedGenres.map(g => (
                <span key={g} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/40 text-rose-300 border border-rose-600/40 text-[11px]">
                  <span>{g}</span>
                  <button type="button" onClick={() => handleGenreToggle(g)} className="hover:text-white cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}

              <button
                type="button"
                onClick={handleClearAllFilters}
                className="ml-auto text-[11px] text-rose-400 hover:text-rose-300 underline cursor-pointer"
              >
                Limpar tudo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Results Container */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-8">
        {/* Results Metadata */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800/80 mb-6 gap-3 text-xs text-zinc-400">
          <div>
            {loading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-rose-400" />
                <span>Consultando repositórios ativos...</span>
              </span>
            ) : (
              <span>
                <strong className="text-zinc-200 font-mono tabular-nums">{results.length}</strong>{' '}
                {results.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}
                {query ? ` para "${query}"` : ''}
              </span>
            )}
          </div>
          {sourcesQueried.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
              <span className="hidden sm:inline">Fontes consultadas:</span>
              <div className="flex flex-wrap items-center gap-1">
                {sourcesQueried.map(s => (
                  <span key={s} className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[10px]">
                    {s}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('open-extensions-modal'));
                  }
                }}
                className="text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1 cursor-pointer font-medium text-[11px] ml-1"
                title="Abrir gerenciador de extensões"
              >
                <Blocks className="h-3 w-3" />
                <span>Gerenciar</span>
              </button>
            </div>
          )}
        </div>

        {/* Results Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <RefreshCw className="h-7 w-7 animate-spin text-rose-500 mb-3" />
            <p className="text-sm">Buscando mangás nas fontes integradas...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 bg-zinc-900/30 rounded-xl border border-zinc-800/60 max-w-xl mx-auto">
            <BookOpen className="h-10 w-10 mx-auto mb-3 text-zinc-600" />
            <h3 className="text-base font-semibold text-zinc-300">Nenhum mangá encontrado</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              Tente pesquisar por outro título, autor, ou alterne os filtros de demografia, status e gênero.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
              {results.map((manga) => (
                <MangaCard
                  key={manga.id}
                  manga={manga}
                  onSelect={onSelectManga}
                />
              ))}
            </div>

            {/* Seamless Infinite Scroll Sentinel */}
            <div ref={observerRef} className="py-10 flex flex-col items-center justify-center min-h-[60px]">
              {loadingMore && (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <RefreshCw className="h-4 w-4 animate-spin text-rose-500" />
                  <span>Carregando mais mangás automaticamente...</span>
                </div>
              )}
              {!hasMore && results.length > 0 && (
                <p className="text-xs text-zinc-600">
                  Fim dos resultados da busca ({results.length} obras carregadas)
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
