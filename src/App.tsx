import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar.js';
import { Footer } from './components/Footer.js';
import { HistoryDrawer } from './components/HistoryDrawer.js';
import { HomePage } from './pages/HomePage.js';
import { SearchPage } from './pages/SearchPage.js';
import { MangaDetailPage } from './pages/MangaDetailPage.js';
import { ReaderPage } from './pages/ReaderPage.js';
import { ApiDocPage } from './pages/ApiDocPage.js';
import { FavoritesPage } from './pages/FavoritesPage.js';
import { HistoryService } from './services/history.js';
import { ReadingProgress, FavoriteManga } from './types/manga.js';

type TabType = 'home' | 'catalog' | 'search' | 'favorites' | 'api' | 'detail' | 'reader';
type OriginType = 'search' | 'catalog' | 'favorites' | 'home';

interface ParsedRoute {
  tab: TabType;
  mangaId?: string;
  chapterId?: string;
  query?: string;
}

function parseLocation(): ParsedRoute {
  if (typeof window === 'undefined') {
    return { tab: 'home' };
  }

  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const searchParams = new URLSearchParams(window.location.search);

  if (pathname.startsWith('/read/')) {
    const parts = pathname.substring('/read/'.length).split('/');
    if (parts.length >= 2) {
      return {
        tab: 'reader',
        mangaId: decodeURIComponent(parts[0]),
        chapterId: decodeURIComponent(parts.slice(1).join('/'))
      };
    }
  }

  if (pathname.startsWith('/manga/')) {
    const mangaId = decodeURIComponent(pathname.substring('/manga/'.length));
    if (mangaId) {
      return { tab: 'detail', mangaId };
    }
  }

  if (pathname === '/search') {
    return { tab: 'search', query: searchParams.get('q') || '' };
  }

  if (pathname === '/catalog') {
    return { tab: 'catalog' };
  }

  if (pathname === '/favorites' || pathname === '/library') {
    return { tab: 'favorites' };
  }

  if (pathname === '/api' || pathname === '/api-docs') {
    return { tab: 'api' };
  }

  return { tab: 'home' };
}

export default function App() {
  const initialRoute = parseLocation();
  const [currentTab, setCurrentTab] = useState<TabType>(initialRoute.tab);
  const [selectedMangaId, setSelectedMangaId] = useState<string | null>(initialRoute.mangaId || null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(initialRoute.chapterId || null);
  const [searchInitialQuery, setSearchInitialQuery] = useState<string>(initialRoute.query || '');
  const [mangaDetailOrigin, setMangaDetailOrigin] = useState<OriginType>('home');
  const [inAppHistoryDepth, setInAppHistoryDepth] = useState<number>(0);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ReadingProgress[]>(() => HistoryService.getHistory());
  const [favorites, setFavorites] = useState<FavoriteManga[]>(() => HistoryService.getFavorites());

  // Scroll to catalog section helper
  const scrollToCatalog = () => {
    setTimeout(() => {
      const el = document.getElementById('catalog-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  // Initial setup & popstate listener for browser back/forward buttons
  useEffect(() => {
    refreshHistory();

    // Subscribe to reactive HistoryService changes (reading progress, bookmarks added/removed)
    const unsubscribeHistory = HistoryService.subscribe(() => {
      setHistory(HistoryService.getHistory());
      setFavorites(HistoryService.getFavorites());
    });

    // Set initial state in browser history if not present
    if (!window.history.state) {
      window.history.replaceState(
        {
          tab: initialRoute.tab,
          mangaId: initialRoute.mangaId,
          chapterId: initialRoute.chapterId,
          depth: 0
        },
        '',
        window.location.href
      );
    }

    if (initialRoute.tab === 'catalog') {
      scrollToCatalog();
    }

    const handlePopState = (event: PopStateEvent) => {
      const route = parseLocation();
      const state = event.state;

      setCurrentTab(route.tab === 'catalog' ? 'home' : route.tab);
      if (route.mangaId) setSelectedMangaId(route.mangaId);
      if (route.chapterId) setSelectedChapterId(route.chapterId);
      if (route.query) setSearchInitialQuery(route.query);

      if (state && typeof state.depth === 'number') {
        setInAppHistoryDepth(state.depth);
      } else {
        setInAppHistoryDepth(prev => Math.max(0, prev - 1));
      }

      if (state?.origin) {
        setMangaDetailOrigin(state.origin);
      }

      if (route.tab === 'catalog' || window.location.pathname === '/catalog') {
        scrollToCatalog();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      unsubscribeHistory();
    };
  }, []);

  const refreshHistory = () => {
    setHistory(HistoryService.getHistory());
    setFavorites(HistoryService.getFavorites());
  };

  const handleSelectManga = (mangaId: string, origin: OriginType = 'home') => {
    setSelectedMangaId(mangaId);
    setMangaDetailOrigin(origin);
    setCurrentTab('detail');

    const nextDepth = inAppHistoryDepth + 1;
    setInAppHistoryDepth(nextDepth);

    const url = `/manga/${encodeURIComponent(mangaId)}`;
    window.history.pushState(
      { tab: 'detail', mangaId, origin, depth: nextDepth },
      '',
      url
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReadChapter = (mangaId: string, chapterId: string) => {
    setSelectedMangaId(mangaId);
    setSelectedChapterId(chapterId);
    setCurrentTab('reader');

    const nextDepth = inAppHistoryDepth + 1;
    setInAppHistoryDepth(nextDepth);

    const url = `/read/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    window.history.pushState(
      { tab: 'reader', mangaId, chapterId, origin: mangaDetailOrigin, depth: nextDepth },
      '',
      url
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackFromDetail = () => {
    // If there is prior in-app history, use natural browser back
    if (inAppHistoryDepth > 0) {
      window.history.back();
      return;
    }

    // Otherwise, use fallback based on origin or home
    if (mangaDetailOrigin === 'search') {
      handleNavigate('search');
    } else if (mangaDetailOrigin === 'catalog') {
      handleNavigate('catalog');
    } else if (mangaDetailOrigin === 'favorites') {
      handleNavigate('favorites');
    } else {
      handleNavigate('home');
    }
  };

  const handleBackFromReader = () => {
    // From reader, return to details of the current manga
    if (inAppHistoryDepth > 0 && window.history.state?.tab === 'reader') {
      window.history.back();
      return;
    }

    if (selectedMangaId) {
      handleSelectManga(selectedMangaId, mangaDetailOrigin);
    } else {
      handleNavigate('home');
    }
  };

  const handleNavigate = (tab: 'home' | 'catalog' | 'search' | 'favorites' | 'api') => {
    const nextDepth = inAppHistoryDepth + 1;
    setInAppHistoryDepth(nextDepth);

    if (tab === 'catalog') {
      setCurrentTab('home');
      window.history.pushState({ tab: 'catalog', depth: nextDepth }, '', '/catalog');
      scrollToCatalog();
      return;
    }

    if (tab === 'home') {
      setCurrentTab('home');
      window.history.pushState({ tab: 'home', depth: nextDepth }, '', '/');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (tab === 'search') {
      setCurrentTab('search');
      const searchUrl = searchInitialQuery ? `/search?q=${encodeURIComponent(searchInitialQuery)}` : '/search';
      window.history.pushState({ tab: 'search', depth: nextDepth }, '', searchUrl);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (tab === 'favorites') {
      setCurrentTab('favorites');
      window.history.pushState({ tab: 'favorites', depth: nextDepth }, '', '/favorites');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (tab === 'api') {
      setCurrentTab('api');
      window.history.pushState({ tab: 'api', depth: nextDepth }, '', '/api-docs');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
  };

  const handleResumeProgress = (item: ReadingProgress) => {
    handleReadChapter(item.mangaId, item.chapterId);
  };

  const handleRemoveHistory = (mangaId: string) => {
    HistoryService.removeHistory(mangaId);
    refreshHistory();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top Bar Navigation is hidden during immersive Reader mode */}
      {currentTab !== 'reader' && (
        <Navbar
          currentTab={currentTab}
          onNavigate={handleNavigate}
          onOpenHistory={() => setIsHistoryOpen(true)}
          historyCount={history.length}
          favoritesCount={favorites.length}
        />
      )}

      {/* Main Content Areas */}
      <main className="flex-1">
        {/* Home & Catalog: Preserved in DOM to retain scroll & state */}
        <div className={currentTab === 'home' || currentTab === 'catalog' ? 'block' : 'hidden'}>
          <HomePage
            history={history}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onSelectManga={(mangaId, fromCatalog) => handleSelectManga(mangaId, fromCatalog ? 'catalog' : 'home')}
            onReadChapter={handleReadChapter}
            onNavigateToSearch={(query) => {
              setSearchInitialQuery(query || '');
              handleNavigate('search');
            }}
          />
        </div>

        {/* Search View: Preserved in DOM so query, filters, pagination and scroll are never lost */}
        <div className={currentTab === 'search' ? 'block' : 'hidden'}>
          <SearchPage
            initialQuery={searchInitialQuery}
            onSelectManga={(mangaId) => handleSelectManga(mangaId, 'search')}
            onReadChapter={handleReadChapter}
          />
        </div>

        {/* Favorites View: Preserved in DOM to retain scroll & fast view */}
        <div className={currentTab === 'favorites' ? 'block' : 'hidden'}>
          <FavoritesPage
            onSelectManga={(mangaId) => handleSelectManga(mangaId, 'favorites')}
            onReadChapter={handleReadChapter}
            onNavigateToCatalog={() => handleNavigate('catalog')}
          />
        </div>

        {/* Detail View */}
        {currentTab === 'detail' && selectedMangaId && (
          <MangaDetailPage
            mangaId={selectedMangaId}
            onBack={handleBackFromDetail}
            onReadChapter={handleReadChapter}
            onSelectManga={(id) => handleSelectManga(id, mangaDetailOrigin)}
          />
        )}

        {/* Reader View */}
        {currentTab === 'reader' && selectedMangaId && selectedChapterId && (
          <ReaderPage
            mangaId={selectedMangaId}
            chapterId={selectedChapterId}
            onBackToManga={handleBackFromReader}
            onChangeChapter={(newChapterId) => {
              setSelectedChapterId(newChapterId);
              const newUrl = `/read/${encodeURIComponent(selectedMangaId)}/${encodeURIComponent(newChapterId)}`;
              window.history.replaceState(
                { ...window.history.state, chapterId: newChapterId },
                '',
                newUrl
              );
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* API Docs View */}
        {currentTab === 'api' && <ApiDocPage />}
      </main>

      {/* Footer is hidden during Reader mode for total immersion */}
      {currentTab !== 'reader' && (
        <Footer onOpenApi={() => handleNavigate('api')} />
      )}

      {/* Slide-over Reading History Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onResume={handleResumeProgress}
        onRemove={handleRemoveHistory}
      />
    </div>
  );
}
