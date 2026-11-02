import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, Filter, BookOpen, RefreshCw, Layers, ArrowRight, Shield, ShieldAlert, Check, Dices, Plus, SlidersHorizontal, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { Manga, MangaSourceInfo } from '../types/manga.js';
import { MangaCard } from '../components/MangaCard.js';
import { MangaApi } from '../services/api.js';

interface SearchPageProps {
  initialQuery?: string;
  onSelectManga: (mangaId: string) => void;
  onReadChapter: (mangaId: string, chapterId: string) => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({
  initialQuery = '',
  onSelectManga,
  onReadChapter
}) => {
  const getUrlParam = (key: string, fallback = '') => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const val = sp.get(key);
      if (val !== null) return val;
    }
    return fallback;
  };

  const [query, setQuery] = useState(() => getUrlParam('q', initialQuery));
  const [results, setResults] = useState<Manga[]>([]);
  const [sources, setSources] = useState<MangaSourceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedSource, setSelectedSource] = useState<string>(() => getUrlParam('source', 'all'));
  const [selectedStatus, setSelectedStatus] = useState<string>(() => getUrlParam('status', 'all'));
  const [includedGenres, setIncludedGenres] = useState<string[]>(() => {
    const gs = getUrlParam('genres', '');
    const g = getUrlParam('genre', '');
    if (gs) return gs.split(',').filter(Boolean);
    if (g && g !== 'all') return [g];
    return [];
  });
  const [excludedGenres, setExcludedGenres] = useState<string[]>(() => {
    const eg = getUrlParam('excludedGenres', '');
    return eg ? eg.split(',').filter(Boolean) : [];
  });
  const [safeSearch, setSafeSearch] = useState<boolean>(() => getUrlParam('safe', '1') === '1');
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(() => getUrlParam('available', '0') === '1');
  const [sourcesQueried, setSourcesQueried] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    MangaApi.getSources().then(setSources).catch(console.error);
    const startQ = getUrlParam('q', initialQuery);
    const startSrc = getUrlParam('source', 'all');
    const startStatus = getUrlParam('status', 'all');
    const startInc = getUrlParam('genres', '') ? getUrlParam('genres', '').split(',').filter(Boolean) : (getUrlParam('genre', '') && getUrlParam('genre', '') !== 'all' ? [getUrlParam('genre', '')] : []);
    const startExc = getUrlParam('excludedGenres', '') ? getUrlParam('excludedGenres', '').split(',').filter(Boolean) : [];
    const startSafe = getUrlParam('safe', '1') === '1';
    const startAvail = getUrlParam('available', '0') === '1';
    executeSearch(startQ, startSrc, startInc, startExc, startStatus, startSafe, startAvail);
  }, []);

  useEffect(() => {
    if (initialQuery && initialQuery !== query) {
      setQuery(initialQuery);
      executeSearch(initialQuery, selectedSource, includedGenres, excludedGenres, selectedStatus, safeSearch, onlyAvailable);
    }
  }, [initialQuery]);

  const executeSearch = async (
    searchQuery: string,
    source = selectedSource,
    incGenres = includedGenres,
    excGenres = excludedGenres,
    stat = selectedStatus,
    isSafe = safeSearch,
    availOnly = onlyAvailable
  ) => {
    setLoading(true);
    setHasSearched(true);
    setSearchPage(1);
    setHasMore(true);

    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/search')) {
      const sp = new URLSearchParams();
      if (searchQuery.trim()) sp.set('q', searchQuery.trim());
      if (source && source !== 'all') sp.set('source', source);
      if (stat && stat !== 'all') sp.set('status', stat);
      if (incGenres.length > 0) sp.set('genres', incGenres.join(','));
      if (excGenres.length > 0) sp.set('excludedGenres', excGenres.join(','));
      if (!isSafe) sp.set('safe', '0');
      if (availOnly) sp.set('available', '1');
      const newUrl = sp.toString() ? `/search?${sp.toString()}` : '/search';
      window.history.replaceState({ ...window.history.state, view: 'search' }, '', newUrl);
    }

    try {
      const res = await MangaApi.search(searchQuery, {
        source: source === 'all' ? undefined : source,
        genre: incGenres.length > 0 ? incGenres[0] : undefined,
        genres: incGenres,
        status: stat === 'all' ? undefined : stat,
        limit: 36,
        page: 1,
        includeAdult: !isSafe,
        onlyAvailable: availOnly
      });
      let data = res.data || [];

      // Post-filtering for multi-genre inclusion, exclusion, and status
      if (incGenres.length > 0) {
        data = data.filter(m => {
          if (!m.genres || m.genres.length === 0) return true;
          const mgLower = m.genres.map(g => g.toLowerCase());
          return incGenres.every(ig => mgLower.some(g => g.includes(ig.toLowerCase()) || ig.toLowerCase().includes(g)));
        });
      }
      if (excGenres.length > 0) {
        data = data.filter(m => {
          if (!m.genres || m.genres.length === 0) return true;
          const mgLower = m.genres.map(g => g.toLowerCase());
          return !excGenres.some(eg => mgLower.some(g => g.includes(eg.toLowerCase()) || eg.toLowerCase().includes(g)));
        });
      }
      if (stat !== 'all') {
        data = data.filter(m => !m.status || m.status === stat);
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
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = searchPage + 1;
    try {
      const res = await MangaApi.search(query, {
        source: selectedSource === 'all' ? undefined : selectedSource,
        genre: includedGenres.length > 0 ? includedGenres[0] : undefined,
        genres: includedGenres,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        limit: 24,
        page: nextPage,
        includeAdult: !safeSearch,
        onlyAvailable: onlyAvailable
      });
      let newItems = res.data || [];

      if (includedGenres.length > 0) {
        newItems = newItems.filter(m => {
          if (!m.genres || m.genres.length === 0) return true;
          const mgLower = m.genres.map(g => g.toLowerCase());
          return includedGenres.every(ig => mgLower.some(g => g.includes(ig.toLowerCase()) || ig.toLowerCase().includes(g)));
        });
      }
      if (excludedGenres.length > 0) {
        newItems = newItems.filter(m => {
          if (!m.genres || m.genres.length === 0) return true;
          const mgLower = m.genres.map(g => g.toLowerCase());
          return !excludedGenres.some(eg => mgLower.some(g => g.includes(eg.toLowerCase()) || eg.toLowerCase().includes(g)));
        });
      }
      if (selectedStatus !== 'all') {
        newItems = newItems.filter(m => !m.status || m.status === selectedStatus);
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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query, selectedSource, includedGenres, excludedGenres, selectedStatus, safeSearch, onlyAvailable);
  };

  const handleClear = () => {
    setQuery('');
    executeSearch('', selectedSource, includedGenres, excludedGenres, selectedStatus, safeSearch, onlyAvailable);
  };

  const handleSourceSelect = (source: string) => {
    setSelectedSource(source);
    executeSearch(query, source, includedGenres, excludedGenres, selectedStatus, safeSearch, onlyAvailable);
  };

  const handleStatusSelect = (stat: string) => {
    setSelectedStatus(stat);
    executeSearch(query, selectedSource, includedGenres, excludedGenres, stat, safeSearch, onlyAvailable);
  };

  const handleGenreCycle = (genre: string) => {
    let nextInc = [...includedGenres];
    let nextExc = [...excludedGenres];

    if (nextInc.includes(genre)) {
      // 1st click was Included -> 2nd click becomes Excluded
      nextInc = nextInc.filter(g => g !== genre);
      nextExc.push(genre);
    } else if (nextExc.includes(genre)) {
      // 2nd click was Excluded -> 3rd click becomes Neutral
      nextExc = nextExc.filter(g => g !== genre);
    } else {
      // Was neutral -> 1st click becomes Included
      nextInc.push(genre);
    }

    setIncludedGenres(nextInc);
    setExcludedGenres(nextExc);
    executeSearch(query, selectedSource, nextInc, nextExc, selectedStatus, safeSearch, onlyAvailable);
  };

  const handleClearGenres = () => {
    setIncludedGenres([]);
    setExcludedGenres([]);
    executeSearch(query, selectedSource, [], [], selectedStatus, safeSearch, onlyAvailable);
  };

  const toggleSafeSearch = () => {
    const nextSafe = !safeSearch;
    setSafeSearch(nextSafe);
    executeSearch(query, selectedSource, includedGenres, excludedGenres, selectedStatus, nextSafe, onlyAvailable);
  };

  const toggleOnlyAvailable = () => {
    const nextAvail = !onlyAvailable;
    setOnlyAvailable(nextAvail);
    executeSearch(query, selectedSource, includedGenres, excludedGenres, selectedStatus, safeSearch, nextAvail);
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

  const POPULAR_SEARCH_TERMS = ['Frieren', 'Chainsaw Man', 'One-Punch Man', 'Solo Leveling', 'Berserk', 'Spy x Family', 'Jujutsu', 'One Piece'];
  const ALL_GENRES = [
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
    'Esportes',
    'Isekai',
    'Psicológico'
  ];

  const [showFilters, setShowFilters] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedSource !== 'all') count++;
    if (selectedStatus !== 'all') count++;
    if (!safeSearch) count++;
    if (onlyAvailable) count++;
    count += includedGenres.length;
    count += excludedGenres.length;
    return count;
  }, [selectedSource, selectedStatus, safeSearch, onlyAvailable, includedGenres, excludedGenres]);

  const handleClearAllFilters = () => {
    setSelectedSource('all');
    setSelectedStatus('all');
    setSafeSearch(true);
    setOnlyAvailable(false);
    setIncludedGenres([]);
    setExcludedGenres([]);
    executeSearch(query, 'all', [], [], 'all', true, false);
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
              Consulte títulos em tempo real em todas as fontes conectadas
            </p>
          </div>

          {/* Clean Streamlined Search & Actions Bar */}
          <div className="max-w-2xl mx-auto space-y-3">
            <form onSubmit={handleSearchSubmit} className="relative flex items-center">
              <Search className="absolute left-4 h-5 w-5 text-zinc-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Digite o título, autor ou palavra-chave..."
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

            {/* Streamlined Secondary Action Strip (Filtros + Surpreenda-me) */}
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
                  title="Configurar filtros de fonte, status, gênero e conteúdo"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Filtros</span>
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
                    className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Remover todos os filtros aplicados"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Limpar</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleRandomManga}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/30 hover:border-amber-500/60 bg-zinc-900/90 text-amber-300 hover:text-amber-200 text-xs font-medium transition-all cursor-pointer shadow-sm"
                title="Sortear uma obra aleatória"
              >
                <Dices className="h-3.5 w-3.5 text-amber-400" />
                <span>Surpreenda-me</span>
              </button>
            </div>

            {/* Suggestions */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1 px-1">
              <span className="text-zinc-500 text-[11px]">Sugestões:</span>
              {POPULAR_SEARCH_TERMS.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => {
                    setQuery(term);
                    executeSearch(term);
                  }}
                  className="px-2 py-0.5 rounded-md text-zinc-400 hover:text-rose-300 hover:bg-zinc-900 transition-colors cursor-pointer text-[11px]"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          {/* Expandable Organized Filter Panel */}
          {showFilters && (
            <div className="mt-6 max-w-3xl mx-auto p-5 rounded-2xl bg-zinc-950/95 border border-zinc-800 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-rose-400" />
                  <span className="font-semibold text-sm text-zinc-100">Filtros Avançados</span>
                </div>
                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 cursor-pointer font-medium"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Redefinir Filtros</span>
                  </button>
                )}
              </div>

              {/* 1. Provedor / Fonte */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">Provedor / Fonte:</span>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => handleSourceSelect('all')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer border ${
                      selectedSource === 'all'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-medium'
                        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                    }`}
                  >
                    Todas as Fontes
                  </button>
                  {sources.map((src) => {
                    const isSelected = selectedSource === src.id;
                    return (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => handleSourceSelect(src.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer border ${
                          isSelected
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-medium'
                            : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                        }`}
                      >
                        <span>{src.name}</span>
                        <span className="text-[9px] uppercase px-1 py-0.2 rounded font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          Live
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Status & Content Toggles Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-900">
                {/* Status */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-400">Status da Obra:</span>
                  <div className="flex items-center gap-1.5 text-xs">
                    {[
                      { id: 'all', label: 'Todos' },
                      { id: 'ongoing', label: 'Em Andamento' },
                      { id: 'completed', label: 'Concluído' }
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => handleStatusSelect(st.id)}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer border ${
                          selectedStatus === st.id
                            ? 'bg-zinc-800 text-rose-400 font-semibold border-rose-500/40'
                            : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content Preferences */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-400">Preferências:</span>
                  <div className="flex items-center gap-2 text-xs">
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
                          <Shield className="h-3.5 w-3.5 text-emerald-400" />
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
                    >
                      <BookOpen className="h-3.5 w-3.5 text-zinc-400" />
                      <span>{onlyAvailable ? 'Apenas com Capítulos' : 'Todos'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Combined Genres Shelf */}
              <div className="space-y-2 pt-2 border-t border-zinc-900">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-zinc-300">Gêneros Combinados:</span>
                    <span className="text-zinc-500 text-[11px] hidden sm:inline">
                      (1x <span className="text-emerald-400 font-medium">Incluir +</span>, 2x <span className="text-rose-400 font-medium">Excluir -</span>, 3x limpar)
                    </span>
                  </div>
                  {(includedGenres.length > 0 || excludedGenres.length > 0) && (
                    <button
                      type="button"
                      onClick={handleClearGenres}
                      className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      Limpar Gêneros
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {ALL_GENRES.map((g) => {
                    const isIncluded = includedGenres.includes(g);
                    const isExcluded = excludedGenres.includes(g);

                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => handleGenreCycle(g)}
                        className={`flex items-center gap-1 px-2.5 py-1.2 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                          isIncluded
                            ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 shadow-sm'
                            : isExcluded
                            ? 'bg-rose-950/40 border-rose-600/70 text-rose-300 line-through decoration-rose-500 shadow-sm'
                            : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        {isIncluded && <Plus className="h-3 w-3 text-emerald-400 shrink-0" />}
                        {isExcluded && <X className="h-3 w-3 text-rose-400 shrink-0" />}
                        <span>{g}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Panel Footer */}
              <div className="flex items-center justify-end pt-3 border-t border-zinc-850">
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
                >
                  Concluir Filtros
                </button>
              </div>
            </div>
          )}

          {/* Active Filter Chips Bar (Visible when panel is closed and filters are active) */}
          {!showFilters && activeFiltersCount > 0 && (
            <div className="mt-4 max-w-2xl mx-auto flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs">
              <span className="text-zinc-500 text-[11px] font-medium">Filtros Ativos:</span>
              
              {selectedSource !== 'all' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700/60 text-[11px]">
                  <span>Fonte: {selectedSource}</span>
                  <button type="button" onClick={() => handleSourceSelect('all')} className="hover:text-rose-400 cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {selectedStatus !== 'all' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700/60 text-[11px]">
                  <span>Status: {selectedStatus === 'ongoing' ? 'Em Andamento' : 'Concluído'}</span>
                  <button type="button" onClick={() => handleStatusSelect('all')} className="hover:text-rose-400 cursor-pointer">
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

              {onlyAvailable && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700/60 text-[11px]">
                  <span>Apenas com Capítulos</span>
                  <button type="button" onClick={toggleOnlyAvailable} className="hover:text-rose-400 cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {includedGenres.map(g => (
                <span key={g} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/50 text-emerald-300 border border-emerald-600/40 text-[11px]">
                  <span>+{g}</span>
                  <button type="button" onClick={() => handleGenreCycle(g)} className="hover:text-white cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}

              {excludedGenres.map(g => (
                <span key={g} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/50 text-rose-300 border border-rose-600/40 text-[11px]">
                  <span>-{g}</span>
                  <button type="button" onClick={() => handleGenreCycle(g)} className="hover:text-white cursor-pointer">
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
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80 mb-6 text-xs text-zinc-400">
          <div>
            {loading ? (
              <span>Consultando provedores...</span>
            ) : (
              <span>
                <strong className="text-zinc-200 font-mono tabular-nums">{results.length}</strong>{' '}
                {results.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}
                {query ? ` para "${query}"` : ''}
              </span>
            )}
          </div>
          {sourcesQueried.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-zinc-500">
              <span>Fontes consultadas:</span>
              <span className="text-zinc-400">{sourcesQueried.join(', ')}</span>
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
              Tente pesquisar por outro título, autor em inglês/japonês, ou troque a fonte selecionada.
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

            {hasMore && results.length > 0 && (
              <div className="mt-10 flex justify-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white rounded-lg text-xs font-semibold border border-zinc-700/80 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
                >
                  {loadingMore ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-rose-500" />
                      <span>Carregando mais resultados...</span>
                    </>
                  ) : (
                    <>
                      <span>Carregar Mais Resultados</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
