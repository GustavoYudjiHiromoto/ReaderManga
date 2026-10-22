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
  Check,
  AlertCircle,
  RotateCcw,
  Download,
  HardDriveDownload,
  Play,
  Pause,
  FastForward,
  HelpCircle,
  Bookmark,
  BookmarkCheck,
  X
} from 'lucide-react';
import { Manga, Chapter, MangaPage } from '../types/manga.js';
import { MangaApi } from '../services/api.js';
import { HistoryService } from '../services/history.js';
import { OfflineCacheService } from '../services/offlineCache.js';
import { KeyboardShortcutsModal } from '../components/KeyboardShortcutsModal.js';
import { PageBookmarksModal } from '../components/PageBookmarksModal.js';

interface ReaderPageProps {
  mangaId: string;
  chapterId: string;
  onBackToManga: () => void;
  onChangeChapter: (newChapterId: string) => void;
}

type ReaderMode = 'webtoon' | 'single' | 'double';
type ReaderTheme = 'dark' | 'black' | 'sepia' | 'light';
type PageFit = 'width' | 'height' | 'original';
type ReadingDirection = 'rtl' | 'ltr';

interface ReaderPageImageProps {
  pageNumber: number;
  imageUrl: string;
  className?: string;
  alt?: string;
  loading?: 'eager' | 'lazy';
  onLoad?: () => void;
}

const ReaderPageImage: React.FC<ReaderPageImageProps> = ({
  pageNumber,
  imageUrl,
  className = '',
  alt,
  loading = 'lazy',
  onLoad
}) => {
  const [currentSrc, setCurrentSrc] = useState(imageUrl);
  const [attempt, setAttempt] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setCurrentSrc(imageUrl);
    setAttempt(0);
    setRetryKey(0);
    setStatus('loading');
  }, [imageUrl]);

  // Check if browser already has image completed in cache upon mount or src change
  useEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setStatus('loaded');
      onLoad?.();
    }
  }, [currentSrc, retryKey]);

  const handleError = () => {
    // Attempt 1: If URL is from mangadex.network volunteer node, try official uploads.mangadex.org CDN
    if (attempt === 0 && currentSrc.includes('mangadex.network')) {
      const uploadFallback = currentSrc.replace(/https:\/\/[^/]+\.mangadex\.network/, 'https://uploads.mangadex.org');
      if (uploadFallback !== currentSrc) {
        setAttempt(1);
        setCurrentSrc(uploadFallback);
        setStatus('loading');
        return;
      }
    }

    // Attempt 2: Try through local backend image proxy with appropriate CDN referrers
    if (attempt <= 1 && !currentSrc.startsWith('/api/proxy/image')) {
      setAttempt(2);
      setCurrentSrc(`/api/proxy/image?url=${encodeURIComponent(currentSrc)}`);
      setStatus('loading');
      return;
    }

    // Final failure: show clear, understandable error state on this specific page
    setStatus('error');
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStatus('loading');
    setAttempt(0);
    setRetryKey(prev => prev + 1);
    // Add cache buster parameter to force a fresh network request instead of reusing a failed/aborted cache entry
    const separator = imageUrl.includes('?') ? '&' : '?';
    setCurrentSrc(`${imageUrl}${separator}_retry=${Date.now()}`);
  };

  return (
    <div className="relative flex flex-col items-center justify-center w-full min-h-[320px]">
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/40 rounded-lg text-zinc-500 py-16 z-10 pointer-events-none">
          <RefreshCw className="h-6 w-6 animate-spin text-zinc-400 mb-2" />
          <span className="text-xs">Carregando página {pageNumber}...</span>
        </div>
      )}

      {status === 'error' ? (
        <div className="flex flex-col items-center justify-center p-8 my-6 rounded-xl bg-zinc-900/90 border border-zinc-800 text-center max-w-md w-full shadow-lg z-20">
          <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
          <h4 className="text-sm font-semibold text-zinc-200 mb-1">
            Falha ao carregar a página {pageNumber}
          </h4>
          <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
            O servidor da fonte externa não entregou a imagem para esta página ou o scan está temporariamente indisponível.
          </p>
          <button
            onClick={handleRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Tentar recarregar página
          </button>
        </div>
      ) : (
        <img
          key={`${imageUrl}_${retryKey}`}
          ref={imgRef}
          src={currentSrc}
          alt={alt || `Página ${pageNumber}`}
          referrerPolicy="no-referrer"
          className={`${className} ${status === 'loading' ? 'opacity-0' : 'opacity-100 transition-opacity duration-200'}`}
          loading={loading}
          onLoad={() => {
            setStatus('loaded');
            onLoad?.();
          }}
          onError={handleError}
        />
      )}
    </div>
  );
};

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
  const [readingDirection, setReadingDirection] = useState<ReadingDirection>('rtl');
  const [showSettings, setShowSettings] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isOfflineSaved, setIsOfflineSaved] = useState(false);
  const [cachingOffline, setCachingOffline] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showBookmarksModal, setShowBookmarksModal] = useState(false);
  const [isCurrentPageBookmarked, setIsCurrentPageBookmarked] = useState(false);
  const [showBookmarkNoteDialog, setShowBookmarkNoteDialog] = useState(false);
  const [bookmarkNoteInput, setBookmarkNoteInput] = useState('');
  const [bookmarkToast, setBookmarkToast] = useState<string | null>(null);

  // Ergonomic Controls: Autoscroll, Webtoon Gap & Visual Comfort
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(2); // 1 to 6
  const [webtoonGap, setWebtoonGap] = useState<number>(0); // 0, 8, 16, 24, 32
  const [brightness, setBrightness] = useState<number>(100); // 60 to 100
  const [nightLight, setNightLight] = useState<number>(0); // 0 to 40

  // Container refs for scroll spy
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Autoscroll continuous animation loop
  useEffect(() => {
    if (!isAutoScrolling || readerMode !== 'webtoon') return;

    let animationFrameId: number;
    const scrollStep = () => {
      const step = autoScrollSpeed * 0.75;
      window.scrollBy({ top: step, behavior: 'instant' as any });

      if ((window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 50)) {
        setIsAutoScrolling(false);
        return;
      }
      animationFrameId = requestAnimationFrame(scrollStep);
    };

    animationFrameId = requestAnimationFrame(scrollStep);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isAutoScrolling, autoScrollSpeed, readerMode]);

  // Pause autoscroll on manual user interaction
  useEffect(() => {
    const handleManualScroll = (e: Event) => {
      if (isAutoScrolling && e.isTrusted) {
        setIsAutoScrolling(false);
      }
    };

    window.addEventListener('wheel', handleManualScroll, { passive: true });
    window.addEventListener('touchstart', handleManualScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleManualScroll);
      window.removeEventListener('touchstart', handleManualScroll);
    };
  }, [isAutoScrolling]);

  // Intelligent prefetching: pre-load upcoming 3 pages into browser cache
  useEffect(() => {
    if (!pages || pages.length === 0) return;
    const prefetchLimit = 3;
    for (let i = 1; i <= prefetchLimit; i++) {
      const idx = currentPageIndex + i;
      if (idx < pages.length && pages[idx]?.imageUrl) {
        const img = new Image();
        img.src = pages[idx].imageUrl;
      }
    }
  }, [currentPageIndex, pages]);

  // Load Manga, Chapter list, and Pages
  useEffect(() => {
    setIsOfflineSaved(OfflineCacheService.isChapterSaved(chapterId));
    loadReaderData();
  }, [mangaId, chapterId]);

  const handleToggleOfflineSave = async () => {
    if (cachingOffline) return;
    if (isOfflineSaved) {
      await OfflineCacheService.removeChapter(chapterId, pages);
      setIsOfflineSaved(false);
    } else {
      setCachingOffline(true);
      await OfflineCacheService.cacheChapter(chapterId, pages, {
        mangaId: manga?.id || mangaId,
        mangaTitle: manga?.title || 'Mangá',
        mangaCover: manga?.coverUrl || '',
        chapterNumber: currentChapter?.chapterNumber || '1',
        chapterTitle: currentChapter?.title
      });
      setCachingOffline(false);
      setIsOfflineSaved(true);
    }
  };

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

      let foundChapter = chaptersData.find(c => c.id === chapterId);
      if (!foundChapter) {
        foundChapter = chaptersData.find(c => c.variants?.some(v => v.id === chapterId));
      }
      setCurrentChapter(foundChapter || null);

      // Check saved progress
      const saved = HistoryService.getProgress(mangaId);
      if (saved && saved.chapterId === chapterId && saved.pageNumber <= pagesData.length) {
        setCurrentPageIndex(Math.max(0, saved.pageNumber - 1));
      } else {
        setCurrentPageIndex(0);
      }
    } catch (err) {
      console.warn('Network request failed, checking offline cache fallback:', err);
      const offlineItem = OfflineCacheService.getOfflineChapter(chapterId);
      if (offlineItem && offlineItem.pages && offlineItem.pages.length > 0) {
        const fallbackManga: Manga = {
          id: offlineItem.mangaId,
          title: offlineItem.mangaTitle,
          coverUrl: offlineItem.mangaCover,
          altTitles: [],
          synopsis: 'Lendo a partir do cache local salvo para leitura offline.',
          authors: [],
          artists: [],
          genres: ['Offline'],
          status: 'ongoing',
          publicationInfo: {},
          updatedAt: new Date(offlineItem.savedAt).toISOString(),
          sources: []
        };
        const fallbackChapter: Chapter = {
          id: offlineItem.chapterId,
          mangaId: offlineItem.mangaId,
          chapterNumber: offlineItem.chapterNumber,
          title: offlineItem.chapterTitle,
          language: 'pt-br',
          sourceId: 'offline',
          externalChapterId: offlineItem.chapterId,
          pagesCount: offlineItem.pageCount
        };
        setManga(fallbackManga);
        setChapters([fallbackChapter]);
        setCurrentChapter(fallbackChapter);
        setPages(offlineItem.pages);
        setIsOfflineSaved(true);
        setError(null);
        return;
      }
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

  // Active reading time tracking while reader tab is in focus
  useEffect(() => {
    let lastTick = Date.now();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const now = Date.now();
        const diffSeconds = Math.round((now - lastTick) / 1000);
        if (diffSeconds > 0 && diffSeconds <= 30) {
          HistoryService.addReadingTime(diffSeconds);
        }
        lastTick = now;
      } else {
        lastTick = Date.now();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Track if current page has bookmark
  useEffect(() => {
    if (!currentChapter) return;
    const pageNum = currentPageIndex + 1;
    setIsCurrentPageBookmarked(HistoryService.isPageBookmarked(currentChapter.id, pageNum));

    const unsubscribe = HistoryService.subscribe(() => {
      setIsCurrentPageBookmarked(HistoryService.isPageBookmarked(currentChapter.id, pageNum));
    });
    return unsubscribe;
  }, [currentChapter, currentPageIndex]);

  const showToast = (msg: string) => {
    setBookmarkToast(msg);
    setTimeout(() => setBookmarkToast(null), 3000);
  };

  const handleToggleBookmark = () => {
    if (!manga || !currentChapter || pages.length === 0) return;
    const pageNum = currentPageIndex + 1;
    if (isCurrentPageBookmarked) {
      HistoryService.removePageBookmarkByPage(currentChapter.id, pageNum);
      showToast(`Marcador removido da página ${pageNum}`);
    } else {
      setShowBookmarkNoteDialog(true);
      setBookmarkNoteInput('');
    }
  };

  const handleConfirmBookmarkWithNote = () => {
    if (!manga || !currentChapter || pages.length === 0) return;
    const pageNum = currentPageIndex + 1;
    const curPage = pages[currentPageIndex];
    HistoryService.addPageBookmark({
      mangaId: manga.id,
      mangaTitle: manga.title,
      mangaCover: manga.coverUrl,
      chapterId: currentChapter.id,
      chapterNumber: currentChapter.chapterNumber,
      chapterTitle: currentChapter.title,
      pageNumber: pageNum,
      imageUrl: curPage?.imageUrl || manga.coverUrl,
      note: bookmarkNoteInput.trim() || undefined
    });
    setShowBookmarkNoteDialog(false);
    showToast(`Página ${pageNum} marcada com sucesso!`);
  };

  // Keyboard navigation respecting reading direction
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
        return;
      }
      if (e.key === 'b' || e.key === 'B') {
        handleToggleBookmark();
        return;
      }
      if (e.key === 'a' || e.key === 'A') {
        if (readerMode === 'webtoon') {
          setIsAutoScrolling(prev => !prev);
          return;
        }
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        setShowShortcutsModal(prev => !prev);
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        setShowUi(prev => !prev);
        return;
      }
      if (e.key === 'Escape') {
        setShowSettings(false);
        setShowShortcutsModal(false);
        setShowBookmarksModal(false);
        setShowBookmarkNoteDialog(false);
        return;
      }

      if (readerMode === 'webtoon') {
        if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ArrowRight') {
          goToNextPage();
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'ArrowLeft') {
          goToPrevPage();
        }
      } else {
        if (readingDirection === 'rtl') {
          // Japanese manga reading: ArrowLeft advances page, ArrowRight goes back
          if (e.key === 'ArrowLeft' || e.key === 'PageDown') {
            goToNextPage();
          } else if (e.key === 'ArrowRight' || e.key === 'PageUp') {
            goToPrevPage();
          }
        } else {
          // Western reading: ArrowRight advances page, ArrowLeft goes back
          if (e.key === 'ArrowRight' || e.key === 'PageDown') {
            goToNextPage();
          } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
            goToPrevPage();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPageIndex, pages.length, readerMode, readingDirection]);

  // Next / Previous chapter helpers
  const currentChapterIndex = chapters.findIndex(c => c.id === chapterId || c.variants?.some(v => v.id === chapterId));
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
        <h2 className="text-lg font-bold text-zinc-200 mb-1">
          {error ? 'Não foi possível carregar as páginas' : 'Capítulo indisponível na fonte externa'}
        </h2>
        <p className="text-xs text-zinc-400 max-w-md mb-6 leading-relaxed">
          {error || 'O provedor externo não retornou imagens para este capítulo (nem na fonte principal nem no serviço de fallback). Tente selecionar outro capítulo ou outra fonte.'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onBackToManga}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            Voltar ao Mangá
          </button>
          <button
            onClick={loadReaderData}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
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
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-xs sm:text-sm line-clamp-1">{manga?.title}</h2>
              </div>
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
              value={currentChapter?.id || chapterId}
              onChange={(e) => onChangeChapter(e.target.value)}
              className="px-3 py-1 bg-zinc-950/80 border border-zinc-800 rounded-lg text-xs font-mono tabular-nums focus:outline-none focus:border-rose-500 cursor-pointer text-zinc-200"
            >
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  Capítulo {ch.chapterNumber} {ch.title ? `- ${ch.title}` : ''}
                </option>
              ))}
            </select>

            {/* Quick Variant Switcher */}
            {currentChapter?.variants && currentChapter.variants.length > 0 && (
              <div className="flex items-center gap-1.5 bg-zinc-950/80 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs">
                <span className="text-[11px] text-zinc-500 font-medium">Versão:</span>
                <select
                  value={chapterId}
                  onChange={(e) => onChangeChapter(e.target.value)}
                  className="bg-transparent text-xs text-rose-300 font-medium focus:outline-none cursor-pointer"
                >
                  <option value={currentChapter.id}>
                    {currentChapter.scanlationGroup || currentChapter.sourceId} (Padrão)
                  </option>
                  {currentChapter.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.sourceName || v.sourceId} {v.scanlationGroup ? `· ${v.scanlationGroup}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
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

            {/* Quick Autoscroll Action (Webtoon mode) */}
            {readerMode === 'webtoon' && (
              <button
                onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                className={`p-1.5 sm:px-2.5 sm:py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                  isAutoScrolling
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-950/60'
                    : 'bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white'
                }`}
                title="Alternar rolagem automática mãos-livres (Atalho: tecla A)"
              >
                {isAutoScrolling ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 text-rose-400" />}
                <span className="hidden sm:inline">{isAutoScrolling ? 'Pausar' : 'Autoscroll'}</span>
                <span className="font-mono text-[10px] text-rose-300">{autoScrollSpeed}x</span>
              </button>
            )}

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
                <div className="absolute right-0 top-12 w-64 p-4 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl z-50 text-xs space-y-4 max-h-[85vh] overflow-y-auto">
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

                  {/* Webtoon Ergonomics: Autoscroll & Spacing */}
                  {readerMode === 'webtoon' && (
                    <div className="pt-2 border-t border-zinc-800 space-y-3">
                      <div>
                        <span className="text-zinc-400 font-medium block mb-2">Rolagem Automática (Autoscroll)</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                            className={`flex-1 py-1.5 px-2.5 rounded-lg border font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-[11px] ${
                              isAutoScrolling
                                ? 'bg-rose-600 border-rose-500 text-white'
                                : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:text-white'
                            }`}
                          >
                            {isAutoScrolling ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 text-rose-400" />}
                            <span>{isAutoScrolling ? 'Pausar (A)' : 'Iniciar (A)'}</span>
                          </button>
                          <div className="flex items-center gap-0.5 bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
                            {[1, 2, 3, 4, 5].map(spd => (
                              <button
                                key={spd}
                                onClick={() => setAutoScrollSpeed(spd)}
                                className={`w-5 h-5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                                  autoScrollSpeed === spd ? 'bg-rose-500 text-white' : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                {spd}x
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div>
                        <span className="text-zinc-400 font-medium block mb-1.5">Espaçamento entre Páginas</span>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { label: '0px', val: 0 },
                            { label: '8px', val: 8 },
                            { label: '16px', val: 16 },
                            { label: '32px', val: 32 }
                          ].map(item => (
                            <button
                              key={item.val}
                              onClick={() => setWebtoonGap(item.val)}
                              className={`py-1 text-center rounded border transition-colors cursor-pointer text-[11px] font-mono ${
                                webtoonGap === item.val
                                  ? 'border-rose-500 bg-rose-500/20 text-rose-300'
                                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Visual Comfort: Brightness & Night Light Filter */}
                  <div className="pt-2 border-t border-zinc-800 space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-zinc-400 font-medium">Brilho da Imagem</span>
                        <span className="text-zinc-500 font-mono text-[10px]">{brightness}%</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="100"
                        step="5"
                        value={brightness}
                        onChange={(e) => setBrightness(Number(e.target.value))}
                        className="w-full accent-rose-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-zinc-400 font-medium">Luz Noturna (Anti-Fadiga)</span>
                        <span className="text-amber-400 font-mono text-[10px]">{nightLight}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        step="5"
                        value={nightLight}
                        onChange={(e) => setNightLight(Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  {readerMode !== 'webtoon' && (
                    <div>
                      <span className="text-zinc-400 font-medium block mb-2">Direção de Leitura</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => setReadingDirection('rtl')}
                          className={`py-1 text-center rounded border transition-colors cursor-pointer text-[11px] ${
                            readingDirection === 'rtl'
                              ? 'border-rose-500 bg-rose-500/20 text-rose-300'
                              : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                          }`}
                        >
                          Mangá (Dir → Esq)
                        </button>
                        <button
                          onClick={() => setReadingDirection('ltr')}
                          className={`py-1 text-center rounded border transition-colors cursor-pointer text-[11px] ${
                            readingDirection === 'ltr'
                              ? 'border-rose-500 bg-rose-500/20 text-rose-300'
                              : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                          }`}
                        >
                          Ocidental (Esq → Dir)
                        </button>
                      </div>
                    </div>
                  )}

                  {currentChapter?.variants && currentChapter.variants.length > 0 && (
                    <div className="pt-2 border-t border-zinc-800">
                      <span className="text-zinc-400 font-medium block mb-2">Versão / Scanlation</span>
                      <select
                        value={chapterId}
                        onChange={(e) => onChangeChapter(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-rose-500 cursor-pointer"
                      >
                        <option value={currentChapter.id}>
                          {currentChapter.scanlationGroup || currentChapter.sourceId} (Padrão)
                        </option>
                        {currentChapter.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.sourceName || v.sourceId} {v.scanlationGroup ? `· ${v.scanlationGroup}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Offline Download & Cache Options */}
                  <div className="pt-2 border-t border-zinc-800 space-y-2">
                    <span className="text-zinc-400 font-medium block mb-1">Baixar Capítulo</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <a
                        href={`/api/chapters/${encodeURIComponent(chapterId)}/download?format=cbz`}
                        download
                        className="flex items-center justify-center gap-1 w-full py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-rose-600 text-zinc-200 hover:text-white transition-colors text-[11px] font-medium cursor-pointer text-center"
                        title="Baixar em formato ComicBook (.cbz) para leitores de quadrinhos"
                      >
                        <Download className="h-3 w-3" />
                        <span>Baixar .CBZ</span>
                      </a>
                      <a
                        href={`/api/chapters/${encodeURIComponent(chapterId)}/download?format=pdf`}
                        download
                        className="flex items-center justify-center gap-1 w-full py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-rose-600 text-zinc-200 hover:text-white transition-colors text-[11px] font-medium cursor-pointer text-center"
                        title="Baixar em formato PDF de alta resolução"
                      >
                        <Download className="h-3 w-3" />
                        <span>Baixar .PDF</span>
                      </a>
                    </div>

                    <button
                      onClick={handleToggleOfflineSave}
                      disabled={cachingOffline}
                      className={`flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg border transition-colors text-xs font-medium cursor-pointer ${
                        isOfflineSaved
                          ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300 hover:bg-rose-950/40 hover:border-rose-600/40 hover:text-rose-300'
                          : 'bg-zinc-800/90 hover:bg-zinc-700/90 border-zinc-700/60 text-zinc-200'
                      }`}
                    >
                      {cachingOffline ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-rose-400" />
                          <span>Salvando páginas no app...</span>
                        </>
                      ) : isOfflineSaved ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Salvo Offline (Remover)</span>
                        </>
                      ) : (
                        <>
                          <HardDriveDownload className="h-3.5 w-3.5 text-rose-400" />
                          <span>Salvar no App (Offline)</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="pt-2 border-t border-zinc-800 flex justify-between text-[11px] text-zinc-500">
                    <span>Atalhos: A (Autoscroll) · F (Tela Cheia)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Download Chapter Actions */}
            <div className="flex items-center gap-1 bg-zinc-950/80 border border-zinc-800 rounded-lg p-0.5 text-[10px] font-mono">
              <a
                href={`/api/chapters/${encodeURIComponent(chapterId)}/download?format=cbz`}
                download
                className="px-1.5 py-0.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded transition-colors"
                title="Baixar capítulo em formato ComicBook (.cbz)"
              >
                CBZ
              </a>
              <span className="text-zinc-700">|</span>
              <a
                href={`/api/chapters/${encodeURIComponent(chapterId)}/download?format=pdf`}
                download
                className="px-1.5 py-0.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded transition-colors"
                title="Baixar capítulo em documento PDF"
              >
                PDF
              </a>
            </div>

            {/* Bookmark Current Page */}
            <button
              onClick={handleToggleBookmark}
              className={`p-2 hover:bg-zinc-800/60 rounded-lg transition-colors cursor-pointer ${
                isCurrentPageBookmarked
                  ? 'text-rose-400'
                  : 'text-zinc-300 hover:text-rose-400'
              }`}
              title={
                isCurrentPageBookmarked
                  ? 'Página marcada! Clique para remover'
                  : 'Marcar esta página (Atalho: tecla B)'
              }
            >
              <Bookmark className={`h-4 w-4 ${isCurrentPageBookmarked ? 'fill-rose-500 text-rose-500' : ''}`} />
            </button>

            {/* View All Saved Bookmarks */}
            <button
              onClick={() => setShowBookmarksModal(true)}
              className="p-2 hover:bg-zinc-800/60 rounded-lg transition-colors cursor-pointer text-zinc-300 hover:text-rose-400"
              title="Ver todas as páginas marcadas"
            >
              <BookmarkCheck className="h-4 w-4" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-zinc-800/60 rounded-lg transition-colors cursor-pointer text-zinc-300"
              title="Alternar tela cheia"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            {/* Keyboard Shortcuts Help */}
            <button
              onClick={() => setShowShortcutsModal(true)}
              className="p-2 hover:bg-zinc-800/60 rounded-lg transition-colors cursor-pointer text-zinc-300 hover:text-rose-400"
              title="Atalhos de Teclado e Guia de Controles (Atalho: tecla ?)"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Floating Autoscroll Control Bar */}
      {isAutoScrolling && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-zinc-900/95 border border-rose-500/50 shadow-2xl backdrop-blur-md text-xs"
        >
          <div className="flex items-center gap-1.5 font-semibold text-white">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span className="text-[11px]">Rolagem</span>
            <span className="font-mono text-rose-300 font-bold">{autoScrollSpeed}x</span>
          </div>

          <div className="flex items-center gap-1 border-l border-zinc-700/80 pl-2">
            <button
              onClick={() => setAutoScrollSpeed(s => Math.max(1, s - 1))}
              className="w-5 h-5 rounded flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs cursor-pointer"
              title="Diminuir velocidade"
            >
              -
            </button>
            <button
              onClick={() => setAutoScrollSpeed(s => Math.min(6, s + 1))}
              className="w-5 h-5 rounded flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs cursor-pointer"
              title="Aumentar velocidade"
            >
              +
            </button>
          </div>

          <button
            onClick={() => setIsAutoScrolling(false)}
            className="ml-1 px-2.5 py-1 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] transition-colors cursor-pointer"
          >
            Pausar (A)
          </button>
        </div>
      )}

      {/* 2. Reader Body */}
      <main
        onClick={() => setShowUi(prev => !prev)}
        style={{
          filter: (brightness !== 100 || nightLight !== 0) ? `brightness(${brightness}%) sepia(${nightLight}%)` : undefined
        }}
        className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center p-2 sm:p-4 transition-[filter] duration-200"
      >
        {/* Webtoon / Vertical Cascade Mode */}
        {readerMode === 'webtoon' && (
          <div
            ref={pagesContainerRef}
            style={{ gap: `${webtoonGap}px` }}
            className="w-full flex flex-col items-center max-w-4xl"
          >
            {pages.map((page, idx) => (
              <div
                key={idx}
                ref={(el) => {
                  pageRefs.current[idx] = el;
                }}
                className="relative flex justify-center w-full"
              >
                <ReaderPageImage
                  pageNumber={page.pageNumber}
                  imageUrl={page.imageUrl}
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
              {pages[currentPageIndex] && (
                <ReaderPageImage
                  key={`single_${currentPageIndex}_${pages[currentPageIndex].imageUrl}`}
                  pageNumber={currentPageIndex + 1}
                  imageUrl={pages[currentPageIndex].imageUrl}
                  className={`object-contain transition-all shadow-2xl ${
                    pageFit === 'height' ? 'h-full max-w-full' : 'max-h-[90vh] w-auto max-w-full'
                  }`}
                  loading="eager"
                />
              )}

              {/* Click zones for easy flipping on touch or mouse */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  readingDirection === 'rtl' ? goToNextPage() : goToPrevPage();
                }}
                className="absolute left-0 inset-y-0 w-1/3 cursor-w-resize"
                title={readingDirection === 'rtl' ? 'Avançar (Direção Mangá RTL - tecla ←)' : 'Página Anterior (tecla ←)'}
              />
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  readingDirection === 'rtl' ? goToPrevPage() : goToNextPage();
                }}
                className="absolute right-0 inset-y-0 w-1/3 cursor-e-resize"
                title={readingDirection === 'rtl' ? 'Página Anterior (Direção Mangá RTL - tecla →)' : 'Próxima Página (tecla →)'}
              />
            </div>
          </div>
        )}

        {/* Double Page Spread Mode */}
        {readerMode === 'double' && (
          <div className="relative w-full flex items-center justify-center max-w-7xl py-4">
            <div className="grid grid-cols-2 gap-2 max-h-[88vh] items-center">
              {/* First Column: in RTL this is the higher page (left), in LTR this is the lower page (left) */}
              <div className="flex justify-end h-full">
                {readingDirection === 'rtl' ? (
                  pages[currentPageIndex + 1] ? (
                    <ReaderPageImage
                      key={`double_left_${currentPageIndex + 1}_${pages[currentPageIndex + 1].imageUrl}`}
                      pageNumber={currentPageIndex + 2}
                      imageUrl={pages[currentPageIndex + 1].imageUrl}
                      className="max-h-[85vh] w-auto object-contain"
                      loading="eager"
                    />
                  ) : (
                    <div className="h-full w-40 bg-zinc-900/30 flex items-center justify-center text-xs text-zinc-600">
                      Fim do capítulo
                    </div>
                  )
                ) : (
                  pages[currentPageIndex] && (
                    <ReaderPageImage
                      key={`double_left_${currentPageIndex}_${pages[currentPageIndex].imageUrl}`}
                      pageNumber={currentPageIndex + 1}
                      imageUrl={pages[currentPageIndex].imageUrl}
                      className="max-h-[85vh] w-auto object-contain"
                      loading="eager"
                    />
                  )
                )}
              </div>

              {/* Second Column: in RTL this is current page (right), in LTR this is next page (right) */}
              <div className="flex justify-start h-full">
                {readingDirection === 'rtl' ? (
                  pages[currentPageIndex] && (
                    <ReaderPageImage
                      key={`double_right_${currentPageIndex}_${pages[currentPageIndex].imageUrl}`}
                      pageNumber={currentPageIndex + 1}
                      imageUrl={pages[currentPageIndex].imageUrl}
                      className="max-h-[85vh] w-auto object-contain"
                      loading="eager"
                    />
                  )
                ) : (
                  pages[currentPageIndex + 1] ? (
                    <ReaderPageImage
                      key={`double_right_${currentPageIndex + 1}_${pages[currentPageIndex + 1].imageUrl}`}
                      pageNumber={currentPageIndex + 2}
                      imageUrl={pages[currentPageIndex + 1].imageUrl}
                      className="max-h-[85vh] w-auto object-contain"
                      loading="eager"
                    />
                  ) : (
                    <div className="h-full w-40 bg-zinc-900/30 flex items-center justify-center text-xs text-zinc-600">
                      Fim do capítulo
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Click navigation overlays */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                readingDirection === 'rtl' ? goToNextPage() : goToPrevPage();
              }}
              className="absolute left-0 inset-y-0 w-1/4 cursor-w-resize"
              title={readingDirection === 'rtl' ? 'Avançar (RTL)' : 'Voltar (LTR)'}
            />
            <div
              onClick={(e) => {
                e.stopPropagation();
                readingDirection === 'rtl' ? goToPrevPage() : goToNextPage();
              }}
              className="absolute right-0 inset-y-0 w-1/4 cursor-e-resize"
              title={readingDirection === 'rtl' ? 'Voltar (RTL)' : 'Avançar (LTR)'}
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
              className="w-16 sm:w-28 accent-rose-500 cursor-pointer"
            />

            {/* Quick Bookmark Page button */}
            <button
              onClick={handleToggleBookmark}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                isCurrentPageBookmarked
                  ? 'text-rose-400 bg-rose-500/20'
                  : 'text-zinc-400 hover:text-rose-400 hover:bg-zinc-800'
              }`}
              title={isCurrentPageBookmarked ? 'Remover marcador da página atual' : 'Marcar página atual (Atalho: B)'}
            >
              <Bookmark className={`h-3.5 w-3.5 ${isCurrentPageBookmarked ? 'fill-rose-500 text-rose-500' : ''}`} />
            </button>
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

      {/* Bookmark notification toast */}
      {bookmarkToast && (
        <div className="fixed top-20 inset-x-0 mx-auto w-fit z-50 px-4 py-2 bg-zinc-900 border border-rose-500/40 text-rose-300 text-xs rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in duration-200">
          <Bookmark className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
          <span>{bookmarkToast}</span>
        </div>
      )}

      {/* Bookmark Note Dialog */}
      {showBookmarkNoteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setShowBookmarkNoteDialog(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl text-zinc-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-rose-400 fill-rose-500/20" />
                <h3 className="text-sm font-bold text-white">
                  Marcar Página {currentPageIndex + 1}
                </h3>
              </div>
              <button
                onClick={() => setShowBookmarkNoteDialog(false)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="py-3">
              <label className="block text-xs text-zinc-400 mb-1.5">
                Anotação ou citação (Opcional):
              </label>
              <input
                type="text"
                autoFocus
                value={bookmarkNoteInput}
                onChange={(e) => setBookmarkNoteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmBookmarkWithNote();
                }}
                placeholder="Ex: Cena épica, revelação importante..."
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowBookmarkNoteDialog(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmBookmarkWithNote}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors cursor-pointer shadow-md shadow-rose-950/40"
              >
                Salvar Marcador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
        readingDirection={readingDirection}
        readerMode={readerMode}
      />

      {/* Page Bookmarks & Snapshots Modal */}
      <PageBookmarksModal
        isOpen={showBookmarksModal}
        onClose={() => setShowBookmarksModal(false)}
        currentMangaId={manga?.id}
        onJumpToPage={(targetMangaId, targetChapterId, targetPageNum) => {
          if (targetChapterId === chapterId) {
            const idx = targetPageNum - 1;
            setCurrentPageIndex(idx);
            if (readerMode === 'webtoon' && pageRefs.current[idx]) {
              pageRefs.current[idx]?.scrollIntoView({ behavior: 'smooth' });
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          } else {
            onChangeChapter(targetChapterId);
          }
        }}
      />
    </div>
  );
};
