import React, { useState, useEffect } from 'react';
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
  Info
} from 'lucide-react';
import { Manga, Chapter } from '../types/manga.js';
import { MangaApi } from '../services/api.js';
import { HistoryService } from '../services/history.js';

interface MangaDetailPageProps {
  mangaId: string;
  onBack: () => void;
  onReadChapter: (mangaId: string, chapterId: string) => void;
  onSelectManga?: (mangaId: string) => void;
}

export const MangaDetailPage: React.FC<MangaDetailPageProps> = ({
  mangaId,
  onBack,
  onReadChapter,
  onSelectManga
}) => {
  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [chaptersError, setChaptersError] = useState<string | null>(null);
  const [chapterOrder, setChapterOrder] = useState<'asc' | 'desc'>('asc');
  const [chapterSearch, setChapterSearch] = useState('');
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showFullSynopsis, setShowFullSynopsis] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadMangaDetails();
    setIsBookmarked(HistoryService.isBookmarked(mangaId));
  }, [mangaId]);

  const loadChapters = async () => {
    setChaptersLoading(true);
    setChaptersError(null);
    try {
      const chaptersData = await MangaApi.getChapters(mangaId, { order: chapterOrder });
      setChapters(chaptersData);
    } catch (err) {
      console.error(err);
      setChaptersError((err as Error).message || 'Erro ao carregar capítulos da fonte.');
      setChapters([]);
    } finally {
      setChaptersLoading(false);
    }
  };

  const loadMangaDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const mangaData = await MangaApi.getMangaDetails(mangaId);
      setManga(mangaData);
    } catch (err) {
      console.error(err);
      setError((err as Error).message || 'Erro ao carregar detalhes do mangá.');
    } finally {
      setLoading(false);
    }

    loadChapters();
  };

  const toggleSort = () => {
    const newOrder = chapterOrder === 'asc' ? 'desc' : 'asc';
    setChapterOrder(newOrder);
    setChapters(prev => [...prev].reverse());
  };

  const handleBookmarkToggle = () => {
    const newState = HistoryService.toggleBookmark(mangaId);
    setIsBookmarked(newState);
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const readingProgress = HistoryService.getProgress(mangaId);

  // Filtered chapters
  const filteredChapters = chapters.filter(c => {
    if (!chapterSearch) return true;
    const q = chapterSearch.toLowerCase();
    return c.chapterNumber.includes(q) || (c.title && c.title.toLowerCase().includes(q));
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
  const isMock = manga.id.includes('_mock_') || primarySource?.sourceId === 'mock';
  const firstChapter = chapters.length > 0 ? (chapterOrder === 'asc' ? chapters[0] : chapters[chapters.length - 1]) : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-28">
      {/* Background Banner with dynamic blur */}
      <div className="relative h-72 sm:h-96 w-full overflow-hidden border-b border-zinc-800/80">
        <img
          src={manga.coverUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover opacity-20 blur-2xl scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-transparent" />
        
        {/* Navigation bar above backdrop */}
        <div className="absolute top-6 left-4 sm:left-8 z-10">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900/80 hover:bg-zinc-900 backdrop-blur-md border border-zinc-700/60 rounded-lg text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar</span>
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 -mt-40 sm:-mt-52 relative z-10">
        {/* Header Block: Cover + Title + Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Cover & Primary Action Controls */}
          <div className="md:col-span-4 lg:col-span-3 flex flex-col items-center md:items-start">
            <div className="w-56 sm:w-64 aspect-[3/4] rounded-xl overflow-hidden shadow-2xl border border-zinc-700/80 bg-zinc-900 shrink-0">
              <img
                src={manga.coverUrl}
                alt={manga.title}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>

            {/* Quick Action Buttons */}
            <div className="w-56 sm:w-64 mt-4 space-y-2.5">
              {readingProgress ? (
                <button
                  onClick={() => onReadChapter(manga.id, readingProgress.chapterId)}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/60 transition-colors cursor-pointer"
                >
                  <Clock className="h-4 w-4" />
                  <span>Continuar Cap. {readingProgress.chapterNumber}</span>
                </button>
              ) : firstChapter ? (
                <button
                  onClick={() => onReadChapter(manga.id, firstChapter.id)}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/60 transition-colors cursor-pointer"
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Ler Capítulo {firstChapter.chapterNumber}</span>
                </button>
              ) : null}

              <div className="flex gap-2">
                <button
                  onClick={handleBookmarkToggle}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isBookmarked
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <Bookmark className={`h-3.5 w-3.5 ${isBookmarked ? 'fill-rose-400' : ''}`} />
                  <span>{isBookmarked ? 'Salvo' : 'Favoritar'}</span>
                </button>

                <button
                  onClick={handleShare}
                  className="px-3 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  title="Copiar link"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </button>
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
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>{manga.publicationInfo.demographic || 'Demografia'}</span>
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
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-white mb-2 text-balance">
              {manga.title}
            </h1>

            {/* Alternative Titles */}
            {manga.altTitles.length > 0 && (
              <div className="text-xs text-zinc-400 mb-4 flex flex-wrap gap-x-2">
                <span className="text-zinc-500">Títulos alternativos:</span>
                <span>{manga.altTitles.slice(0, 3).join(' / ')}</span>
              </div>
            )}

            {/* Creators & Publication Specs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 mb-6 text-xs">
              <div>
                <span className="text-zinc-500 block mb-0.5">Autor</span>
                <span className="font-medium text-zinc-200 line-clamp-1">{manga.authors.join(', ')}</span>
              </div>
              <div>
                <span className="text-zinc-500 block mb-0.5">Artista</span>
                <span className="font-medium text-zinc-200 line-clamp-1">{manga.artists.join(', ')}</span>
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

            {/* Unboxed Genres list */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300 mb-6">
              <span className="text-zinc-500">Gêneros:</span>
              <span className="font-medium text-zinc-300">
                {manga.genres.join(' · ')}
              </span>
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
                      {isMock ? 'Mock Manga (Demonstração Local)' : (primarySource?.sourceName || primarySource?.sourceId)}
                    </span>
                    <span
                      className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-semibold ${
                        isMock
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {isMock ? 'Mock / Demo' : 'Live API'}
                    </span>
                    <span className="text-zinc-500 font-mono text-[11px]">
                      (extId: {primarySource?.externalId})
                    </span>
                    {!isMock && primarySource?.url && (
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
            </div>

          </div>
        </div>

        {/* Chapters Section */}
        <section className="mt-14 pt-8 border-t border-zinc-800">
          {/* Mock Catalog Notification & Quick Switcher */}
          {isMock && (
            <div className="mb-6 p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200">
              <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-4">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-amber-300 text-sm mb-1">
                    <Info className="h-4 w-4" />
                    <span>Catálogo de Demonstração (Mock Local)</span>
                  </div>
                  <p className="text-zinc-300 leading-relaxed">
                    Esta versão contém apenas <strong>capítulos e páginas de demonstração (placeholders)</strong> para testes locais.
                    Para ler a obra completa com páginas oficiais e fallback integrado, abra a versão dos provedores ao vivo (Comick / MangaDex).
                  </p>
                </div>
                {manga.id === 'mr_mock_berserk' && onSelectManga && (
                  <button
                    onClick={() => onSelectManga('mr_comick_udwf1dTf')}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-medium text-xs whitespace-nowrap transition-colors cursor-pointer shrink-0 shadow-lg flex items-center gap-1.5"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Abrir Berserk Oficial (Comick)</span>
                  </button>
                )}
                {manga.id === 'mr_mock_solo-leveling' && onSelectManga && (
                  <button
                    onClick={() => onSelectManga('mr_comick_71gMd0vF')}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-medium text-xs whitespace-nowrap transition-colors cursor-pointer shrink-0 shadow-lg flex items-center gap-1.5"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Abrir Solo Leveling Oficial (Comick)</span>
                  </button>
                )}
                {manga.id === 'mr_mock_one-piece' && onSelectManga && (
                  <button
                    onClick={() => onSelectManga('mr_comick_CzcseUMi')}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-medium text-xs whitespace-nowrap transition-colors cursor-pointer shrink-0 shadow-lg flex items-center gap-1.5"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Abrir One Piece Oficial (Comick)</span>
                  </button>
                )}
                {manga.id === 'mr_mock_frieren-journey' && onSelectManga && (
                  <button
                    onClick={() => onSelectManga('mr_comick_0FiLFYD1')}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-medium text-xs whitespace-nowrap transition-colors cursor-pointer shrink-0 shadow-lg flex items-center gap-1.5"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Abrir Frieren Oficial (Comick)</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Live Provider status indicator */}
          {!isMock && primarySource?.sourceId === 'comick' && (
            <div className="mb-6 p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                <strong>Obra do Comick (Ao Vivo):</strong> capítulos conectados diretamente à CDN e integrados com fallback automático via MangaDex.
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                <span>Capítulos Disponíveis</span>
                <span className="text-xs font-normal text-zinc-400 font-mono tabular-nums">
                  ({chapters.length})
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Selecione um capítulo para iniciar a leitura imediata
              </p>
            </div>

            {/* Filter and Sort controls */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filtrar capítulo..."
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <button
                onClick={toggleSort}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
                title="Inverter ordem"
              >
                <ArrowUpDown className="h-3.5 w-3.5 text-rose-400" />
                <span>{chapterOrder === 'asc' ? '1 → Fim' : 'Fim → 1'}</span>
              </button>
            </div>
          </div>

          {/* Chapters List */}
          {chaptersLoading ? (
            <div className="p-8 text-center text-zinc-500 bg-zinc-900/30 rounded-xl border border-zinc-800/60 flex flex-col items-center justify-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" />
              <p className="text-xs">
                {isMock ? 'Carregando capítulos do catálogo de demonstração...' : 'Consultando capítulos no provedor externo...'}
              </p>
            </div>
          ) : chaptersError ? (
            <div className="p-8 text-center text-zinc-400 bg-zinc-900/40 rounded-xl border border-rose-900/40 flex flex-col items-center justify-center gap-2">
              <p className="text-sm font-medium text-rose-300">
                {isMock ? 'Não foi possível carregar os capítulos do catálogo mock' : 'Não foi possível carregar os capítulos do provedor externo'}
              </p>
              <p className="text-xs text-zinc-500 max-w-md">{chaptersError}</p>
              <button
                onClick={loadChapters}
                className="mt-2 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : filteredChapters.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 bg-zinc-900/30 rounded-xl border border-zinc-800/60">
              <p className="text-sm">
                {chapterSearch
                  ? 'Nenhum capítulo encontrado correspondente à busca.'
                  : 'Nenhum capítulo disponível nesta obra.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredChapters.map((chapter) => {
                const isCurrentRead = readingProgress?.chapterId === chapter.id;

                return (
                  <div
                    key={chapter.id}
                    onClick={() => onReadChapter(manga.id, chapter.id)}
                    className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isCurrentRead
                        ? 'bg-rose-950/20 border-rose-800/60 hover:bg-rose-950/30'
                        : 'bg-zinc-900/60 hover:bg-zinc-900 border-zinc-800/80 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono font-medium text-zinc-300 tabular-nums group-hover:border-rose-500/50 group-hover:text-rose-400 transition-colors">
                        {chapter.chapterNumber}
                      </div>

                      <div className="overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-zinc-200 line-clamp-1 group-hover:text-rose-400 transition-colors">
                            Capítulo {chapter.chapterNumber}
                            {chapter.title && ` - ${chapter.title}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                          {chapter.releaseDate && <span>{chapter.releaseDate}</span>}
                          {chapter.pagesCount && (
                            <>
                              <span aria-hidden="true" className="text-zinc-600">·</span>
                              <span className="font-mono tabular-nums">{chapter.pagesCount} páginas</span>
                            </>
                          )}
                          <span aria-hidden="true" className="text-zinc-600">·</span>
                          <span className="uppercase text-[10px] text-zinc-400">{chapter.language}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isCurrentRead && (
                        <span className="text-[11px] font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">
                          Em Leitura
                        </span>
                      )}
                      <button className="p-1.5 text-zinc-500 group-hover:text-rose-400 transition-colors">
                        <BookOpen className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
