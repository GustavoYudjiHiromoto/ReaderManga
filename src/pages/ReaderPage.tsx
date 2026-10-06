import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Settings,
  BookOpen,
  LayoutList,
  Columns,
  Sun,
  Moon,
  Eye,
  RefreshCw,
  Sliders,
  Check
} from 'lucide-react';
import { Manga, Chapter, MangaPage } from '../types/manga.js';
import { MangaApi } from '../services/api.js';
import { HistoryService } from '../services/history.js';

interface ReaderPageProps {
  mangaId: string;
  chapterId: string;
  onBackToManga: () => void;
  onChangeChapter: (newChapterId: string) => void;
}

type ReaderMode = 'webtoon' | 'single' | 'double';
type ReaderTheme = 'dark' | 'black' | 'sepia' | 'light';
type PageFit = 'width' | 'height' | 'original';

export const ReaderPage: React.FC<ReaderPageProps> = ({
  mangaId,
  chapterId,
  onBackToManga,
  onChangeChapter
}) => {
  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [pages, setPages] = useState<MangaPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Settings
  const [readerMode, setReaderMode] = useState<ReaderMode>('webtoon');
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('dark');
  const [pageFit, setPageFit] = useState<PageFit>('width');
  const [showSettings, setShowSettings] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Container refs for scroll spy
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Load Manga, Chapter list, and Pages
  useEffect(() => {
    loadReaderData();
  }, [mangaId, chapterId]);

  const loadReaderData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [mangaData, chaptersData, pagesData] = await Promise.all([
        MangaApi.getMangaDetails(mangaId),
        MangaApi.getChapters(mangaId, { order: 'asc' }),
        MangaApi.getChapterPages(chapterId)
      ]);

      setManga(mangaData);
      setChapters(chaptersData);
      setPages(pagesData);

      const foundChapter = chaptersData.find(c => c.id === chapterId);
      setCurrentChapter(foundChapter || null);

      // Check saved progress
      const saved = HistoryService.getProgress(mangaId);
      if (saved && saved.chapterId === chapterId && saved.pageNumber <= pagesData.length) {
        setCurrentPageIndex(Math.max(0, saved.pageNumber - 1));
      } else {
        setCurrentPageIndex(0);
      }
    } catch (err) {
      console.error('Failed to load reader data:', err);
      setError((err as Error).message || 'Não foi possível carregar as páginas do capítulo.');
    } finally {
      setLoading(false);
    }
  };

  // Save progress on page change
  useEffect(() => {
    if (manga && currentChapter && pages.length > 0) {
      HistoryService.saveProgress({
        mangaId: manga.id,
        mangaTitle: manga.title,
        mangaCover: manga.coverUrl,
        chapterId: currentChapter.id,
        chapterNumber: currentChapter.chapterNumber,
        chapterTitle: currentChapter.title,
        pageNumber: currentPageIndex + 1,
        totalPages: pages.length
      });
    }
  }, [currentPageIndex, manga, currentChapter, pages]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        goToNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        goToPrevPage();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'Escape') {
        setShowSettings(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPageIndex, pages.length, readerMode]);

  // Next / Previous chapter helpers
  const currentChapterIndex = chapters.findIndex(c => c.id === chapterId);
  const prevChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1 ? chapters[currentChapterIndex + 1] : null;

  const goToNextPage = () => {
    if (readerMode === 'webtoon') {
      window.scrollBy({ top: window.innerHeight * 0.75, behavior: 'smooth' });
    } else if (readerMode === 'single') {
      if (currentPageIndex < pages.length - 1) {
        setCurrentPageIndex(prev => prev + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (nextChapter) {
        onChangeChapter(nextChapter.id);
      }
    } else if (readerMode === 'double') {
      if (currentPageIndex < pages.length - 2) {
        setCurrentPageIndex(prev => prev + 2);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (nextChapter) {
        onChangeChapter(nextChapter.id);
      }
    }
  };

  const goToPrevPage = () => {
    if (readerMode === 'webtoon') {
      window.scrollBy({ top: -window.innerHeight * 0.75, behavior: 'smooth' });
    } else if (readerMode === 'single') {
      if (currentPageIndex > 0) {
        setCurrentPageIndex(prev => prev - 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (prevChapter) {
        onChangeChapter(prevChapter.id);
      }
    } else if (readerMode === 'double') {
      if (currentPageIndex > 1) {
        setCurrentPageIndex(prev => prev - 2);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (prevChapter) {
        onChangeChapter(prevChapter.id);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Scroll spy for webtoon mode
  useEffect(() => {
    if (readerMode !== 'webtoon') return;

    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight / 3;
      pageRefs.current.forEach((el, index) => {
        if (!el) return;
        const top = el.offsetTop;
        const height = el.offsetHeight;
        if (scrollPosition >= top && scrollPosition < top + height) {
          setCurrentPageIndex(index);
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [readerMode, pages]);

  // Themes mapping
  const themeClasses: Record<ReaderTheme, string> = {
    dark: 'bg-zinc-950 text-zinc-100',
    black: 'bg-black text-zinc-200',
    sepia: 'bg-[#1e1c19] text-[#e8dfcf]',
    light: 'bg-zinc-100 text-zinc-900'
  };

  const toolbarThemeClasses: Record<ReaderTheme, string> = {
    dark: 'bg-zinc-900/90 border-zinc-800 text-zinc-200',
    black: 'bg-zinc-950/90 border-zinc-900 text-zinc-200',
    sepia: 'bg-[#282521]/90 border-[#38332c] text-[#e8dfcf]',
    light: 'bg-white/90 border-zinc-200 text-zinc-800'
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${themeClasses[readerTheme]}`}>
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-rose-500" />
          <p className="text-sm">Carregando páginas do capítulo...</p>
          <span className="text-xs text-zinc-500">Normalizando dados do provedor</span>
        </div>
      </div>
    );
  }

  if (error || pages.length === 0) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 text-center ${themeClasses[readerTheme]}`}>
        <BookOpen className="h-10 w-10 text-rose-500 mb-3" />
        <h2 className="text-lg font-bold text-zinc-200 mb-1">Não foi possível carregar as páginas</h2>
        <p className="text-xs text-zinc-400 max-w-md mb-6">
          {error || 'O provedor externo não retornou imagens para este capítulo.'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onBackToManga}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
          >
            Voltar ao Mangá
          </button>
          <button
            onClick={loadReaderData}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-medium transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-200 ${themeClasses[readerTheme]} select-none`}>
      {/* 1. Top Reading Toolbar */}
      <header
        className={`sticky top-0 z-50 transition-transform duration-200 border-b backdrop-blur-md ${toolbarThemeClasses[readerTheme]} ${
          showUi ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-6">
          
          {/* Back button & Manga Title */}
          <div className="flex items-center gap-3 overflow-hidden">
            <button
              onClick={onBackToManga}
              className="p-1.5 hover:bg-zinc-800/60 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Voltar aos detalhes do mangá"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div className="overflow-hidden">
              <h2 className="font-semibold text-xs sm:text-sm line-clamp-1">{manga?.title}</h2>
              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="font-mono tabular-nums">
                  Capítulo {currentChapter?.chapterNumber}
                </span>
                {currentChapter?.title && (
                  <>
                    <span aria-hidden="true" className="text-zinc-600">·</span>
                    <span className="line-clamp-1">{currentChapter.title}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quick Chapter Selector */}
          <div className="hidden md:flex items-center gap-2">
            <select
              value={chapterId}
              onChange={(e) => onChangeChapter(e.target.value)}
              className="px-3 py-1 bg-zinc-950/80 border border-zinc-800 rounded-lg text-xs font-mono tabular-nums focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  Capítulo {ch.chapterNumber} {ch.title ? `- ${ch.title}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Controls: Mode, Theme, Fullscreen */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Mode Switcher */}
            <div className="flex items-center p-0.5 bg-zinc-950/80 border border-zinc-800 rounded-lg">
              <button
                onClick={() => setReaderMode('webtoon')}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  readerMode === 'webtoon' ? 'bg-zinc-800 text-rose-400' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Modo Cascata Vertical (Webtoon)"
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                onClick={() => setReaderMode('single')}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  readerMode === 'single' ? 'bg-zinc-800 text-rose-400' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Modo Página Única"
              >
                <BookOpen className="h-4 w-4" />
              </button>
              <button
                onClick={() => setReaderMode('double')}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  readerMode === 'double' ? 'bg-zinc-800 text-rose-400' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Modo Página Dupla"
              >
                <Columns className="h-4 w-4" />
              </button>
            </div>

            {/* Settings Dropdown Toggle */}
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 hover:bg-zinc-800/60 rounded-lg transition-colors cursor-pointer text-zinc-300"
                title="Ajustes de visualização"
              >
                <Settings className="h-4 w-4" />
              </button>

              {/* Settings Panel */}
              {showSettings && (
                <div className="absolute right-0 top-12 w-64 p-4 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl z-50 text-xs space-y-4">
                  <div>
                    <span className="text-zinc-400 font-medium block mb-2">Tema de Leitura</span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['dark', 'black', 'sepia', 'light'] as ReaderTheme[]).map((theme) => (
                        <button
                          key={theme}
                          onClick={() => setReaderTheme(theme)}
                          className={`py-1.5 text-center capitalize rounded border transition-colors cursor-pointer text-[11px] ${
                            readerTheme === theme
                              ? 'border-rose-500 bg-rose-500/20 text-rose-300'
                              : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                          }`}
                        >
                          {theme === 'black' ? 'AMOLED' : theme}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-zinc-400 font-medium block mb-2">Ajuste de Imagem</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={() => setPageFit('width')}
                        className={`py-1 text-center rounded border transition-colors cursor-pointer text-[11px] ${
                          pageFit === 'width' ? 'border-rose-500 bg-rose-500/20 text-rose-300' : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                        }`}
                      >
                        Largura
                      </button>
                      <button
                        onClick={() => setPageFit('height')}
                        className={`py-1 text-center rounded border transition-colors cursor-pointer text-[11px] ${
                          pageFit === 'height' ? 'border-rose-500 bg-rose-500/20 text-rose-300' : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                        }`}
                      >
                        Altura
                      </button>
                      <button
                        onClick={() => setPageFit('original')}
                        className={`py-1 text-center rounded border transition-colors cursor-pointer text-[11px] ${
                          pageFit === 'original' ? 'border-rose-500 bg-rose-500/20 text-rose-300' : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                        }`}
                      >
                        Real
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-800 flex justify-between text-[11px] text-zinc-500">
                    <span>Atalhos: ← → (Passar pág)</span>
                    <span>F (Tela cheia)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-zinc-800/60 rounded-lg transition-colors cursor-pointer text-zinc-300"
              title="Alternar tela cheia"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* 2. Reader Body */}
      <main
        onClick={() => setShowUi(prev => !prev)}
        className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center p-2 sm:p-4"
      >
        {/* Webtoon / Vertical Cascade Mode */}
        {readerMode === 'webtoon' && (
          <div ref={pagesContainerRef} className="w-full flex flex-col items-center max-w-4xl space-y-1">
            {pages.map((page, idx) => (
              <div
                key={idx}
                ref={(el) => {
                  pageRefs.current[idx] = el;
                }}
                className="relative flex justify-center w-full min-h-[400px] bg-zinc-900/20"
              >
                <img
                  src={page.imageUrl}
                  alt={`Página ${page.pageNumber}`}
                  referrerPolicy="no-referrer"
                  className={`block object-contain transition-all ${
                    pageFit === 'width' ? 'w-full' : pageFit === 'height' ? 'h-screen' : 'max-w-full'
                  }`}
                  loading={idx < 3 ? 'eager' : 'lazy'}
                />
              </div>
            ))}
          </div>
        )}

        {/* Single Page Mode */}
        {readerMode === 'single' && (
          <div className="relative w-full flex flex-col items-center justify-center max-w-5xl py-4">
            <div
              className={`flex items-center justify-center relative cursor-pointer ${
                pageFit === 'height' ? 'h-[85vh]' : 'w-full'
              }`}
            >
              <img
                src={pages[currentPageIndex]?.imageUrl}
                alt={`Página ${currentPageIndex + 1}`}
                referrerPolicy="no-referrer"
                className={`object-contain transition-all shadow-2xl ${
                  pageFit === 'height' ? 'h-full max-w-full' : 'max-h-[90vh] w-auto max-w-full'
                }`}
              />

              {/* Click zones for easy flipping on touch or mouse */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrevPage();
                }}
                className="absolute left-0 inset-y-0 w-1/3 cursor-w-resize"
                title="Página Anterior (ou tecla ←)"
              />
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  goToNextPage();
                }}
                className="absolute right-0 inset-y-0 w-1/3 cursor-e-resize"
                title="Próxima Página (ou tecla →)"
              />
            </div>
          </div>
        )}

        {/* Double Page Spread Mode */}
        {readerMode === 'double' && (
          <div className="relative w-full flex items-center justify-center max-w-7xl py-4">
            <div className="grid grid-cols-2 gap-2 max-h-[88vh] items-center">
              {/* Right page (Manga reading right to left) */}
              <div className="flex justify-end h-full">
                {pages[currentPageIndex + 1] ? (
                  <img
                    src={pages[currentPageIndex + 1].imageUrl}
                    alt={`Página ${currentPageIndex + 2}`}
                    referrerPolicy="no-referrer"
                    className="max-h-[85vh] w-auto object-contain"
                  />
                ) : (
                  <div className="h-full w-40 bg-zinc-900/30 flex items-center justify-center text-xs text-zinc-600">
                    Fim do capítulo
                  </div>
                )}
              </div>

              {/* Left page */}
              <div className="flex justify-start h-full">
                <img
                  src={pages[currentPageIndex]?.imageUrl}
                  alt={`Página ${currentPageIndex + 1}`}
                  referrerPolicy="no-referrer"
                  className="max-h-[85vh] w-auto object-contain"
                />
              </div>
            </div>

            {/* Click navigation overlays */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                goToPrevPage();
              }}
              className="absolute left-0 inset-y-0 w-1/4 cursor-w-resize"
            />
            <div
              onClick={(e) => {
                e.stopPropagation();
                goToNextPage();
              }}
              className="absolute right-0 inset-y-0 w-1/4 cursor-e-resize"
            />
          </div>
        )}

        {/* End of chapter banner */}
        <div className="w-full max-w-md my-16 p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center">
          <BookOpen className="h-8 w-8 text-rose-500 mx-auto mb-2" />
          <h3 className="font-semibold text-sm text-zinc-200">
            Fim do Capítulo {currentChapter?.chapterNumber}
          </h3>
          <p className="text-xs text-zinc-400 mt-1 mb-5">
            {nextChapter ? `Próximo: Capítulo ${nextChapter.chapterNumber}` : 'Você está no capítulo mais recente!'}
          </p>

          <div className="flex justify-center gap-3">
            {prevChapter && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onChangeChapter(prevChapter.id);
                }}
                className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
              >
                ← Capítulo Anterior
              </button>
            )}

            {nextChapter ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onChangeChapter(nextChapter.id);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Próximo Capítulo →
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onBackToManga();
                }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
              >
                Voltar à Página da Obra
              </button>
            )}
          </div>
        </div>
      </main>

      {/* 3. Floating Bottom Navigation Bar */}
      <footer
        className={`fixed bottom-4 inset-x-0 z-50 mx-auto max-w-lg transition-transform duration-200 ${
          showUi ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0'
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-full bg-zinc-950/90 border border-zinc-800 shadow-2xl backdrop-blur-md text-xs">
          {/* Prev Chapter */}
          <button
            onClick={goToPrevPage}
            disabled={currentPageIndex === 0 && !prevChapter}
            className="flex items-center gap-1 px-2.5 py-1 text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Página ou capítulo anterior"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          {/* Page Counter & Slider */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
              Pág. <strong className="text-zinc-200">{currentPageIndex + 1}</strong> / {pages.length}
            </span>

            {/* Quick slider */}
            <input
              type="range"
              min={0}
              max={pages.length - 1}
              value={currentPageIndex}
              onChange={(e) => {
                const targetIdx = parseInt(e.target.value, 10);
                setCurrentPageIndex(targetIdx);
                if (readerMode === 'webtoon' && pageRefs.current[targetIdx]) {
                  pageRefs.current[targetIdx]?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="w-20 sm:w-28 accent-rose-500 cursor-pointer"
            />
          </div>

          {/* Next Chapter */}
          <button
            onClick={goToNextPage}
            disabled={currentPageIndex >= pages.length - 1 && !nextChapter}
            className="flex items-center gap-1 px-2.5 py-1 text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Próxima página ou capítulo"
          >
            <span className="hidden sm:inline">Próxima</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </div>
  );
};
