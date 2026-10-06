import React, { useState, useEffect } from 'react';
import { Search, X, Filter, BookOpen, RefreshCw, Layers } from 'lucide-react';
import { Manga } from '../types/manga.js';
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
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [sourcesQueried, setSourcesQueried] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    executeSearch(initialQuery);
  }, [initialQuery]);

  const executeSearch = async (searchQuery: string, source = selectedSource, genre = selectedGenre) => {
    setLoading(true);
    setHasSearched(true);
    try {
      const res = await MangaApi.search(searchQuery, {
        source: source === 'all' ? undefined : source,
        genre: genre === 'all' ? undefined : genre,
        limit: 30
      });
      setResults(res.data || []);
      setSourcesQueried(res.sourcesQueried || []);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query);
  };

  const handleClear = () => {
    setQuery('');
    executeSearch('', selectedSource, selectedGenre);
  };

  const handleSourceSelect = (source: string) => {
    setSelectedSource(source);
    executeSearch(query, source, selectedGenre);
  };

  const handleGenreSelect = (genre: string) => {
    setSelectedGenre(genre);
    executeSearch(query, selectedSource, genre);
  };

  const POPULAR_SEARCH_TERMS = ['Frieren', 'Chainsaw Man', 'One-Punch Man', 'Solo Leveling', 'Berserk', 'Spy x Family', 'Jujutsu', 'One Piece'];
  const GENRES = ['all', 'Ação', 'Fantasia', 'Comédia', 'Aventura', 'Drama', 'Sobrenatural', 'Histórico', 'Horror', 'Sci-Fi'];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-24">
      {/* Search Header Container */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/40 py-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center mb-6">
            <h1 className="font-serif text-3xl font-bold tracking-tight text-white">
              Pesquisar Mangás
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Consulte títulos em tempo real em todas as fontes conectadas
            </p>
          </div>

          {/* Search Input Bar */}
          <form onSubmit={handleSearchSubmit} className="relative max-w-2xl mx-auto">
            <div className="relative flex items-center">
              <Search className="absolute left-4 h-5 w-5 text-zinc-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Digite o título, autor ou palavra-chave..."
                className="w-full pl-12 pr-24 py-3.5 bg-zinc-900/90 border border-zinc-700/80 focus:border-rose-500 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 shadow-inner focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-14 p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="submit"
                className="absolute right-2 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Buscar
              </button>
            </div>
          </form>

          {/* Source and Quick Filters */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800 text-xs">
              <button
                onClick={() => handleSourceSelect('all')}
                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  selectedSource === 'all' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Todas as Fontes
              </button>
              <button
                onClick={() => handleSourceSelect('openmanga')}
                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  selectedSource === 'openmanga' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                OpenManga (Curado)
              </button>
              <button
                onClick={() => handleSourceSelect('mangadex')}
                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  selectedSource === 'mangadex' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                MangaDex (Live API)
              </button>
            </div>
          </div>

          {/* Quick Suggestions */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="text-zinc-500">Sugestões:</span>
            {POPULAR_SEARCH_TERMS.map((term) => (
              <button
                key={term}
                onClick={() => {
                  setQuery(term);
                  executeSearch(term);
                }}
                className="text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer underline decoration-zinc-800 hover:decoration-rose-400"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Results Container */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-8">
        {/* Genre Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-4 scrollbar-none text-xs mb-6">
          {GENRES.map((g) => (
            <button
              key={g}
              onClick={() => handleGenreSelect(g)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer border ${
                selectedGenre === g
                  ? 'bg-rose-500/10 border-rose-500/40 text-rose-300 font-medium'
                  : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              {g === 'all' ? 'Todos os Gêneros' : g}
            </button>
          ))}
        </div>

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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
            {results.map((manga) => (
              <MangaCard
                key={manga.id}
                manga={manga}
                onSelect={onSelectManga}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
