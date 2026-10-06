import React, { useState, useEffect } from 'react';
import { BookOpen, Sparkles, Flame, Clock, Search, ArrowRight, Star, RefreshCw } from 'lucide-react';
import { Manga, MangaSourceInfo } from '../types/manga.js';
import { MangaCard } from '../components/MangaCard.js';
import { MangaApi } from '../services/api.js';
import { HistoryService } from '../services/history.js';
import { ReadingProgress } from '../types/manga.js';

interface HomePageProps {
  onSelectManga: (mangaId: string) => void;
  onReadChapter: (mangaId: string, chapterId: string) => void;
  onNavigateToSearch: (initialQuery?: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onSelectManga,
  onReadChapter,
  onNavigateToSearch
}) => {
  const [featuredManga, setFeaturedManga] = useState<Manga[]>([]);
  const [catalogManga, setCatalogManga] = useState<Manga[]>([]);
  const [sources, setSources] = useState<MangaSourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [history, setHistory] = useState<ReadingProgress[]>([]);

  useEffect(() => {
    loadData();
    setHistory(HistoryService.getHistory());
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [featured, initialSearch, sourcesList] = await Promise.all([
        MangaApi.getFeatured(),
        MangaApi.search('', { limit: 24 }),
        MangaApi.getSources()
      ]);
      setFeaturedManga(featured);
      setCatalogManga(initialSearch.data || featured);
      setSources(sourcesList);
    } catch (err) {
      console.error('Failed to load manga:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSourceChange = async (source: string) => {
    setSelectedSource(source);
    setLoading(true);
    try {
      const res = await MangaApi.search('', {
        source: source === 'all' ? undefined : source,
        genre: selectedGenre === 'all' ? undefined : selectedGenre,
        limit: 24
      });
      setCatalogManga(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenreChange = async (genre: string) => {
    setSelectedGenre(genre);
    setLoading(true);
    try {
      const res = await MangaApi.search('', {
        source: selectedSource === 'all' ? undefined : selectedSource,
        genre: genre === 'all' ? undefined : genre,
        limit: 24
      });
      setCatalogManga(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleHeroQuickRead = async (manga: Manga) => {
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

  // Dominant spotlight manga
  const heroManga = featuredManga[0];

  const GENRES = ['all', 'Ação', 'Fantasia', 'Comédia', 'Aventura', 'Drama', 'Sobrenatural', 'Histórico'];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20">
      {/* 1. Hero Spotlight Section */}
      {heroManga && (
        <section className="relative overflow-hidden border-b border-zinc-800/80 bg-zinc-900/40">
          <div className="absolute inset-0 z-0">
            <img
              src={heroManga.coverUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover object-center opacity-15 blur-2xl scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/70 to-transparent" />
          </div>

          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 md:py-16">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              {/* Cover visual anchor */}
              <div className="md:col-span-4 lg:col-span-3 flex justify-center md:justify-start">
                <div
                  onClick={() => onSelectManga(heroManga.id)}
                  className="group relative w-56 sm:w-64 aspect-[3/4] rounded-xl overflow-hidden shadow-2xl border border-zinc-700/60 cursor-pointer transform hover:-translate-y-1 transition-transform duration-300"
                >
                  <img
                    src={heroManga.coverUrl}
                    alt={heroManga.title}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <BookOpen className="h-4 w-4 text-rose-400" /> Ver Detalhes
                    </span>
                  </div>
                </div>
              </div>

              {/* Editorial Info */}
              <div className="md:col-span-8 lg:col-span-9 flex flex-col justify-center">
                {/* Clean unboxed editorial metadata */}
                <div className="flex items-center gap-2 text-xs font-medium text-rose-400 mb-2.5">
                  <span className="tracking-wide uppercase font-semibold">Destaque da Temporada</span>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span className="text-zinc-400">{heroManga.sources[0]?.sourceName || 'MangaReader'}</span>
                  {heroManga.rating && (
                    <>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className="flex items-center gap-1 text-amber-300 font-mono tabular-nums">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {heroManga.rating.toFixed(1)}
                      </span>
                    </>
                  )}
                </div>

                <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-3 text-balance">
                  {heroManga.title}
                </h1>

                {/* Alt title and author */}
                <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400 mb-4">
                  <span>{heroManga.authors.join(', ')}</span>
                  {heroManga.publicationInfo.releaseYear && (
                    <>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className="font-mono tabular-nums">{heroManga.publicationInfo.releaseYear}</span>
                    </>
                  )}
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span className="capitalize">{heroManga.status === 'ongoing' ? 'Em Lançamento' : 'Completo'}</span>
                </div>

                {/* Synopsis */}
                <p className="text-sm sm:text-base text-zinc-300 line-clamp-3 max-w-3xl leading-relaxed mb-6 font-light">
                  {heroManga.synopsis}
                </p>

                {/* Unboxed genre tags */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mb-7">
                  <span className="text-zinc-500">Gêneros:</span>
                  <span>{heroManga.genres.join(' · ')}</span>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => handleHeroQuickRead(heroManga)}
                    className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2 shadow-lg shadow-rose-950/50 cursor-pointer"
                  >
                    <BookOpen className="h-4 w-4" />
                    <span>Iniciar Leitura (Capítulo 1)</span>
                  </button>

                  <button
                    onClick={() => onSelectManga(heroManga.id)}
                    className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white rounded-lg font-medium text-sm border border-zinc-700/80 transition-colors cursor-pointer"
                  >
                    Ver Informações e Capítulos
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-10 space-y-12">
        {/* 2. Continuar Lendo (Recent Reading Shelf) */}
        {history.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-rose-400" />
                <h2 className="text-lg font-semibold text-zinc-100">Continuar Lendo</h2>
              </div>
              <span className="text-xs text-zinc-500">Salvo automaticamente</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {history.slice(0, 3).map((item) => {
                const percent = item.totalPages > 0 ? Math.round((item.pageNumber / item.totalPages) * 100) : 0;
                return (
                  <div
                    key={item.mangaId}
                    onClick={() => onReadChapter(item.mangaId, item.chapterId)}
                    className="group flex gap-4 p-3 bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800 rounded-xl cursor-pointer transition-all hover:border-zinc-700"
                  >
                    <img
                      src={item.mangaCover}
                      alt={item.mangaTitle}
                      referrerPolicy="no-referrer"
                      className="w-16 h-22 object-cover rounded-lg shrink-0 bg-zinc-950"
                    />
                    <div className="flex flex-1 flex-col justify-between overflow-hidden">
                      <div>
                        <h4 className="font-semibold text-sm text-zinc-200 line-clamp-1 group-hover:text-rose-400 transition-colors">
                          {item.mangaTitle}
                        </h4>
                        <p className="text-xs text-zinc-400 mt-1">
                          Capítulo <span className="font-mono text-zinc-200 tabular-nums">{item.chapterNumber}</span>
                        </p>
                        <p className="text-[11px] text-zinc-500 font-mono tabular-nums mt-0.5">
                          Página {item.pageNumber} de {item.totalPages} ({percent}%)
                        </p>
                      </div>

                      <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden mt-2">
                        <div
                          className="bg-rose-500 h-1 rounded-full transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 3. Catalog Explorer with Multi-Source & Genre Filtering */}
        <section>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80 mb-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-100">Explorar Catálogo</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Mangás disponíveis integrando fontes abertas e locais
              </p>
            </div>

            {/* Source Segmented Control */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800">
              <button
                onClick={() => handleSourceChange('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  selectedSource === 'all'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Todas as Fontes
              </button>
              {sources.map(src => {
                const isSelected = selectedSource === src.id;
                const isMock = src.type === 'mock';
                return (
                  <button
                    key={src.id}
                    onClick={() => handleSourceChange(src.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-800 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>{src.name}</span>
                    <span
                      className={`text-[9px] uppercase px-1 py-0.5 rounded font-mono ${
                        isMock
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {isMock ? 'Demo' : 'Live'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Genre Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-4 scrollbar-none text-xs">
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => handleGenreChange(g)}
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

          {/* Manga Grid */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <RefreshCw className="h-7 w-7 animate-spin text-rose-500 mb-3" />
              <p className="text-sm">Carregando catálogo de mangás...</p>
            </div>
          ) : catalogManga.length === 0 ? (
            <div className="text-center py-16 text-zinc-500 bg-zinc-900/30 rounded-xl border border-zinc-800/60">
              <BookOpen className="h-10 w-10 mx-auto mb-3 text-zinc-600" />
              <p className="text-sm">Nenhum mangá encontrado com esses filtros.</p>
              <button
                onClick={() => {
                  setSelectedSource('all');
                  setSelectedGenre('all');
                  loadData();
                }}
                className="mt-3 text-xs text-rose-400 hover:underline cursor-pointer"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
              {catalogManga.map((manga) => (
                <MangaCard
                  key={manga.id}
                  manga={manga}
                  onSelect={onSelectManga}
                  onQuickRead={() => handleHeroQuickRead(manga)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
