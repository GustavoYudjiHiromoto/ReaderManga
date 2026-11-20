import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from './components/Navbar.js';
import { Footer } from './components/Footer.js';
import { HistoryDrawer } from './components/HistoryDrawer.js';
import { DownloadsModal } from './components/DownloadsModal.js';
import { OfflineIndicator } from './components/OfflineIndicator.js';
import { HomePage } from './pages/HomePage.js';
import { SearchPage } from './pages/SearchPage.js';
import { MangaDetailPage } from './pages/MangaDetailPage.js';
import { ReaderPage } from './pages/ReaderPage.js';
import { ApiDocPage } from './pages/ApiDocPage.js';
import { FavoritesPage } from './pages/FavoritesPage.js';
import { UpdatesPage } from './pages/UpdatesPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { HistoryService } from './services/history.js';
import { OfflineCacheService } from './services/offlineCache.js';
import { UpdateTrackerService } from './services/updateTracker.js';
import { TrackerService } from './services/trackerService.js';
import { TrackerBackgroundService } from './services/trackerBackgroundService.js';
import { TrackersModal } from './components/TrackersModal.js';
import { ExtensionsModal } from './components/ExtensionsModal.js';
import { FeedbackModal } from './components/FeedbackModal.js';
import { ExtensionService } from './services/extensionService.js';
import { ReadingProgress, FavoriteManga } from './types/manga.js';

function areKeepAlivePropsEqual<T extends { isActive?: boolean }>(prev: T, next: T): boolean {
  if (!prev.isActive && !next.isActive) return true;
  const keys = Object.keys(prev) as Array<keyof T>;
  if (keys.length !== Object.keys(next).length) return false;
  for (const k of keys) {
    if (!Object.is(prev[k], next[k])) return false;
  }
  return true;
}

const MemoHomePage = React.memo(HomePage, areKeepAlivePropsEqual);
const MemoSearchPage = React.memo(SearchPage, areKeepAlivePropsEqual);
const MemoFavoritesPage = React.memo(FavoritesPage, areKeepAlivePropsEqual);

type TabType = 'home' | 'catalog' | 'search' | 'updates' | 'favorites' | 'api' | 'detail' | 'reader' | 'profile';
type OriginType = 'search' | 'catalog' | 'updates' | 'favorites' | 'home' | 'profile';

interface ParsedRoute {
  tab: TabType;
  mangaId?: string;
  chapterId?: string;
  query?: string;
  source?: string;
  mode?: 'popular' | 'latest' | 'search';
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
    const rawMode = searchParams.get('mode');
    const parsedMode = rawMode === 'latest' || rawMode === 'popular' || rawMode === 'search' ? rawMode : undefined;
    return {
      tab: 'search',
      query: searchParams.get('q') || '',
      source: searchParams.get('source') || undefined,
      mode: parsedMode
    };
  }

  if (pathname === '/catalog') {
    return { tab: 'catalog' };
  }

  if (pathname === '/favorites' || pathname === '/library') {
    return { tab: 'favorites' };
  }

  if (pathname === '/updates' || pathname === '/lancamentos') {
    return { tab: 'updates' };
  }

  if (pathname === '/profile') {
    return { tab: 'profile' };
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
  const [searchBrowseSignal, setSearchBrowseSignal] = useState<{
    sourceId: string;
    mode: 'popular' | 'latest' | 'search';
    nonce: number;
  } | null>(() =>
    initialRoute.source
      ? { sourceId: initialRoute.source, mode: initialRoute.mode || 'popular', nonce: 0 }
      : null
  );
  const [mangaDetailOrigin, setMangaDetailOrigin] = useState<OriginType>('home');
  const [inAppHistoryDepth, setInAppHistoryDepth] = useState<number>(0);

  const inAppHistoryDepthRef = useRef<number>(0);
  inAppHistoryDepthRef.current = inAppHistoryDepth;
  const mangaDetailOriginRef = useRef<OriginType>('home');
  mangaDetailOriginRef.current = mangaDetailOrigin;
  const selectedMangaIdRef = useRef<string | null>(selectedMangaId);
  selectedMangaIdRef.current = selectedMangaId;
  const searchInitialQueryRef = useRef<string>(searchInitialQuery);
  searchInitialQueryRef.current = searchInitialQuery;
  const backNavigationLockRef = useRef<number>(0);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDownloadsOpen, setIsDownloadsOpen] = useState(false);
  const [isTrackersOpen, setIsTrackersOpen] = useState(false);
  const [isExtensionsOpen, setIsExtensionsOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackContext, setFeedbackContext] = useState<{ url?: string; mangaContext?: string } | null>(null);
  const [enabledSourcesCount, setEnabledSourcesCount] = useState<number>(() => ExtensionService.getEnabledSourceIds().length);
  const [totalSourcesCount, setTotalSourcesCount] = useState<number>(() => Object.keys(ExtensionService.getConfigs()).length || 6);
  const [trackersModalManga, setTrackersModalManga] = useState<{ id?: string; title?: string } | null>(null);
  const [history, setHistory] = useState<ReadingProgress[]>(() => HistoryService.getHistory());
  const [favorites, setFavorites] = useState<FavoriteManga[]>(() => HistoryService.getFavorites());
  const [offlineCount, setOfflineCount] = useState<number>(() => OfflineCacheService.getSavedChapterIds().length);
  const [unreadUpdatesCount, setUnreadUpdatesCount] = useState<number>(() => UpdateTrackerService.getUnseenBadgeCount());
  const [trackersCount, setTrackersCount] = useState<number>(() => {
    const ani = TrackerService.getAniListAccount().connected ? 1 : 0;
    const mal = TrackerService.getMalAccount().connected ? 1 : 0;
    return ani + mal;
  });

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
    // Initialize silent background radar for new chapters
    const cleanupRadar = UpdateTrackerService.initBackgroundRadar();

    // Initialize background sync service for AniList & MyAnimeList
    const cleanupTrackerSync = TrackerBackgroundService.initBackgroundSync();

    // Subscribe to reactive HistoryService changes (reading progress, bookmarks added/removed)
    const unsubscribeHistory = HistoryService.subscribe(() => {
      const nextHist = HistoryService.getHistory();
      const nextFavs = HistoryService.getFavorites();
      const nextUnread = UpdateTrackerService.getUnseenBadgeCount();
      setHistory(prev => (prev === nextHist ? prev : nextHist));
      setFavorites(prev => (prev === nextFavs ? prev : nextFavs));
      setUnreadUpdatesCount(prev => (prev === nextUnread ? prev : nextUnread));
    }, ['history', 'favorites', 'readChapters']);

    // Subscribe to update tracker changes
    const unsubscribeUpdates = UpdateTrackerService.subscribe(() => {
      setUnreadUpdatesCount(UpdateTrackerService.getUnseenBadgeCount());
    });

    // Subscribe to offline cache changes
    const unsubscribeOffline = OfflineCacheService.subscribe(() => {
      setOfflineCount(OfflineCacheService.getSavedChapterIds().length);
    });

    // Subscribe to tracker changes
    const unsubscribeTrackers = TrackerService.subscribe(() => {
      const ani = TrackerService.getAniListAccount().connected ? 1 : 0;
      const mal = TrackerService.getMalAccount().connected ? 1 : 0;
      setTrackersCount(ani + mal);
    });

    // Subscribe to extension changes & sync dynamic sources count
    ExtensionService.getSourcesMeta().then(list => {
      if (Array.isArray(list) && list.length > 0) {
        setTotalSourcesCount(list.length);
        setEnabledSourcesCount(ExtensionService.getEnabledSourceIds().length);
      }
    }).catch(() => {});

    const unsubscribeExtensions = ExtensionService.subscribe(() => {
      setEnabledSourcesCount(ExtensionService.getEnabledSourceIds().length);
      setTotalSourcesCount(Object.keys(ExtensionService.getConfigs()).length || 6);
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
      backNavigationLockRef.current = 0;
      const route = parseLocation();
      const state = event.state;

      setCurrentTab(route.tab === 'catalog' ? 'home' : route.tab);
      if (route.mangaId) setSelectedMangaId(route.mangaId);
      if (route.chapterId) setSelectedChapterId(route.chapterId);
      if (route.tab === 'search' && route.query) setSearchInitialQuery(route.query);

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

    const handleOpenTrackersModal = (e: Event) => {
      const customEvent = e as CustomEvent<{ mangaId?: string; mangaTitle?: string }>;
      if (customEvent.detail) {
        setTrackersModalManga({ id: customEvent.detail.mangaId, title: customEvent.detail.mangaTitle });
      }
      setIsTrackersOpen(true);
    };

    const handleOpenExtensionsModal = () => {
      setIsExtensionsOpen(true);
    };

    const handleOpenFeedbackModal = (e: Event) => {
      const customEvent = e as CustomEvent<{ url?: string; mangaContext?: string }>;
      setFeedbackContext(customEvent.detail || null);
      setIsFeedbackOpen(true);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('open-trackers-modal', handleOpenTrackersModal);
    window.addEventListener('open-extensions-modal', handleOpenExtensionsModal);
    window.addEventListener('open-feedback-modal', handleOpenFeedbackModal);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('open-trackers-modal', handleOpenTrackersModal);
      window.removeEventListener('open-extensions-modal', handleOpenExtensionsModal);
      window.removeEventListener('open-feedback-modal', handleOpenFeedbackModal);
      cleanupRadar();
      cleanupTrackerSync();
      unsubscribeHistory();
      unsubscribeUpdates();
      unsubscribeOffline();
      unsubscribeTrackers();
      unsubscribeExtensions();
    };
  }, []);

  const refreshHistory = () => {
    setHistory(HistoryService.getHistory());
    setFavorites(HistoryService.getFavorites());
  };

  const handleSelectManga = useCallback((mangaId: string, origin: OriginType = 'home') => {
    setSelectedMangaId(mangaId);
    setMangaDetailOrigin(origin);
    setCurrentTab('detail');

    const nextDepth = inAppHistoryDepthRef.current + 1;
    inAppHistoryDepthRef.current = nextDepth;
    setInAppHistoryDepth(nextDepth);

    const url = `/manga/${encodeURIComponent(mangaId)}`;
    window.history.pushState(
      { tab: 'detail', mangaId, origin, depth: nextDepth },
      '',
      url
    );
    window.scrollTo(0, 0);
  }, []);

  const handleReadChapter = useCallback((mangaId: string, chapterId: string) => {
    setSelectedMangaId(mangaId);
    setSelectedChapterId(chapterId);
    setCurrentTab('reader');

    const nextDepth = inAppHistoryDepthRef.current + 1;
    inAppHistoryDepthRef.current = nextDepth;
    setInAppHistoryDepth(nextDepth);

    const url = `/read/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    window.history.pushState(
      { tab: 'reader', mangaId, chapterId, origin: mangaDetailOriginRef.current, depth: nextDepth },
      '',
      url
    );
    window.scrollTo(0, 0);
  }, []);

  const handleNavigate = useCallback((tab: 'home' | 'catalog' | 'search' | 'updates' | 'favorites' | 'api' | 'profile') => {
    const nextDepth = inAppHistoryDepthRef.current + 1;
    inAppHistoryDepthRef.current = nextDepth;
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
      window.scrollTo(0, 0);
      return;
    }

    if (tab === 'search') {
      setCurrentTab('search');
      const curSearchQ = searchInitialQueryRef.current;
      const searchUrl = curSearchQ ? `/search?q=${encodeURIComponent(curSearchQ)}` : '/search';
      window.history.pushState({ tab: 'search', depth: nextDepth }, '', searchUrl);
      window.scrollTo(0, 0);
      return;
    }

    if (tab === 'updates') {
      setCurrentTab('updates');
      window.history.pushState({ tab: 'updates', depth: nextDepth }, '', '/updates');
      window.scrollTo(0, 0);
      return;
    }

    if (tab === 'favorites') {
      setCurrentTab('favorites');
      window.history.pushState({ tab: 'favorites', depth: nextDepth }, '', '/favorites');
      window.scrollTo(0, 0);
      return;
    }

    if (tab === 'profile') {
      setCurrentTab('profile');
      window.history.pushState({ tab: 'profile', depth: nextDepth }, '', '/profile');
      window.scrollTo(0, 0);
      return;
    }

    if (tab === 'api') {
      setCurrentTab('api');
      window.history.pushState({ tab: 'api', depth: nextDepth }, '', '/api-docs');
      window.scrollTo(0, 0);
      return;
    }
  }, []);

  const handleBackFromDetail = useCallback(() => {
    const now = Date.now();
    if (backNavigationLockRef.current && now - backNavigationLockRef.current < 700) {
      return;
    }

    const currentState = window.history.state;
    const currentDepth = typeof currentState?.depth === 'number' ? currentState.depth : inAppHistoryDepthRef.current;

    // Only pop browser history when the active entry actually belongs to 'detail' inside this app session
    if (currentDepth > 0 && currentState?.tab === 'detail') {
      backNavigationLockRef.current = now;
      window.history.back();
      return;
    }

    // Fallback based on origin or home without overshooting past depth 0
    const origin = mangaDetailOriginRef.current;
    if (origin === 'search') {
      handleNavigate('search');
    } else if (origin === 'catalog') {
      handleNavigate('catalog');
    } else if (origin === 'updates') {
      handleNavigate('updates');
    } else if (origin === 'favorites') {
      handleNavigate('favorites');
    } else {
      handleNavigate('home');
    }
  }, [handleNavigate]);

  const handleBackFromReader = useCallback(() => {
    const now = Date.now();
    if (backNavigationLockRef.current && now - backNavigationLockRef.current < 700) {
      return;
    }

    const currentState = window.history.state;
    const currentDepth = typeof currentState?.depth === 'number' ? currentState.depth : inAppHistoryDepthRef.current;

    // Only pop browser history ONCE when the active entry actually belongs to 'reader'
    if (currentDepth > 0 && currentState?.tab === 'reader') {
      backNavigationLockRef.current = now;
      window.history.back();
      return;
    }

    if (selectedMangaIdRef.current) {
      handleSelectManga(selectedMangaIdRef.current, mangaDetailOriginRef.current);
    } else {
      handleNavigate('home');
    }
  }, [handleSelectManga, handleNavigate]);

  const handleOpenHistory = useCallback(() => setIsHistoryOpen(true), []);
  const handleOpenDownloads = useCallback(() => setIsDownloadsOpen(true), []);
  const handleOpenTrackers = useCallback(() => setIsTrackersOpen(true), []);
  const handleOpenExtensions = useCallback(() => setIsExtensionsOpen(true), []);
  const handleOpenFeedback = useCallback(() => {
    setFeedbackContext(null);
    setIsFeedbackOpen(true);
  }, []);
  const handleSelectMangaFromHome = useCallback(
    (mangaId: string, fromCatalog?: boolean) => handleSelectManga(mangaId, fromCatalog ? 'catalog' : 'home'),
    [handleSelectManga]
  );
  const handleSelectMangaFromSearch = useCallback(
    (mangaId: string) => handleSelectManga(mangaId, 'search'),
    [handleSelectManga]
  );
  const handleSelectMangaFromFavorites = useCallback(
    (mangaId: string) => handleSelectManga(mangaId, 'favorites'),
    [handleSelectManga]
  );
  const handleNavigateToSearchFromHome = useCallback(
    (query?: string) => {
      setSearchInitialQuery(query || '');
      handleNavigate('search');
    },
    [handleNavigate]
  );
  const handleNavigateToCatalogFromFavorites = useCallback(() => handleNavigate('catalog'), [handleNavigate]);

  const handleCloseHistory = useCallback(() => setIsHistoryOpen(false), []);
  const handleCloseDownloads = useCallback(() => setIsDownloadsOpen(false), []);
  const handleCloseExtensions = useCallback(() => setIsExtensionsOpen(false), []);
  const handleSelectMangaFromDrawer = useCallback(
    (mangaId: string) => handleSelectManga(mangaId, 'home'),
    [handleSelectManga]
  );

  const handleResumeProgress = useCallback((item: ReadingProgress) => {
    handleReadChapter(item.mangaId, item.chapterId);
  }, [handleReadChapter]);

  const handleRemoveHistory = useCallback((mangaId: string) => {
    HistoryService.removeHistory(mangaId);
    setHistory(HistoryService.getHistory());
    setFavorites(HistoryService.getFavorites());
  }, []);

  const handleExploreSource = useCallback((sourceId: string) => {
    const nextDepth = inAppHistoryDepthRef.current + 1;
    inAppHistoryDepthRef.current = nextDepth;
    setInAppHistoryDepth(nextDepth);
    setSearchInitialQuery('');
    setSearchBrowseSignal({ sourceId, mode: 'popular', nonce: Date.now() });
    setCurrentTab('search');
    window.history.pushState(
      { tab: 'search', source: sourceId, depth: nextDepth },
      '',
      `/search?source=${encodeURIComponent(sourceId)}&mode=popular`
    );
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top Bar Navigation is hidden during immersive Reader mode */}
      {currentTab !== 'reader' && (
        <Navbar
          currentTab={currentTab}
          onNavigate={handleNavigate}
          onOpenHistory={handleOpenHistory}
          onOpenDownloads={handleOpenDownloads}
          onOpenTrackers={handleOpenTrackers}
          onOpenExtensions={handleOpenExtensions}
          onOpenFeedback={handleOpenFeedback}
          historyCount={history.length}
          favoritesCount={favorites.length}
          offlineCount={offlineCount}
          unreadUpdatesCount={unreadUpdatesCount}
          trackersCount={trackersCount}
          enabledSourcesCount={enabledSourcesCount}
          totalSourcesCount={totalSourcesCount}
        />
      )}

      {/* Main Content Areas */}
      <main className={`flex-1 min-w-0 ${currentTab !== 'reader' ? 'pb-16 md:pb-0' : ''}`}>
        {/* Home & Catalog: Preserved in DOM to retain scroll & state */}
        <div className={currentTab === 'home' || currentTab === 'catalog' ? 'block' : 'hidden'}>
          <MemoHomePage
            isActive={currentTab === 'home' || currentTab === 'catalog'}
            history={history}
            onOpenHistory={handleOpenHistory}
            onSelectManga={handleSelectMangaFromHome}
            onReadChapter={handleReadChapter}
            onNavigateToSearch={handleNavigateToSearchFromHome}
          />
        </div>

        {/* Search View: Preserved in DOM so query, filters, pagination and scroll are never lost */}
        <div className={currentTab === 'search' ? 'block' : 'hidden'}>
          <MemoSearchPage
            isActive={currentTab === 'search'}
            initialQuery={searchInitialQuery}
            browseSignal={searchBrowseSignal}
            onSelectManga={handleSelectMangaFromSearch}
            onReadChapter={handleReadChapter}
          />
        </div>

        {/* Updates / Lançamentos View */}
        {currentTab === 'updates' && (
          <UpdatesPage
            onSelectManga={(mangaId) => handleSelectManga(mangaId, 'updates')}
            onReadChapter={handleReadChapter}
            onNavigateToSearch={() => handleNavigate('search')}
            onNavigateToFavorites={() => handleNavigate('favorites')}
          />
        )}

        {/* Favorites View: Preserved in DOM to retain scroll & fast view */}
        <div className={currentTab === 'favorites' ? 'block' : 'hidden'}>
          <MemoFavoritesPage
            isActive={currentTab === 'favorites'}
            onSelectManga={handleSelectMangaFromFavorites}
            onReadChapter={handleReadChapter}
            onNavigateToCatalog={handleNavigateToCatalogFromFavorites}
            onOpenDownloads={handleOpenDownloads}
          />
        </div>

        {/* Detail View */}
        {currentTab === 'detail' && selectedMangaId && (
          <MangaDetailPage
            mangaId={selectedMangaId}
            onBack={handleBackFromDetail}
            onReadChapter={handleReadChapter}
            onSelectManga={(id) => handleSelectManga(id, mangaDetailOrigin)}
            onNavigateToSearch={(query, genre) => {
              if (genre) {
                setSearchInitialQuery('');
                window.history.pushState(
                  { tab: 'search', depth: inAppHistoryDepth + 1 },
                  '',
                  `/search?genre=${encodeURIComponent(genre)}`
                );
                setCurrentTab('search');
              } else {
                setSearchInitialQuery(query || '');
                handleNavigate('search');
              }
            }}
          />
        )}

        {/* Reader View */}
        {currentTab === 'reader' && selectedMangaId && selectedChapterId && (
          <ReaderPage
            mangaId={selectedMangaId}
            chapterId={selectedChapterId}
            onBackToManga={handleBackFromReader}
            onOpenMangaDetail={() => handleSelectManga(selectedMangaId, mangaDetailOrigin)}
            onChangeChapter={(newChapterId) => {
              setSelectedChapterId(newChapterId);
              const newUrl = `/read/${encodeURIComponent(selectedMangaId)}/${encodeURIComponent(newChapterId)}`;
              window.history.replaceState(
                { ...window.history.state, chapterId: newChapterId },
                '',
                newUrl
              );
              window.scrollTo(0, 0);
            }}
          />
        )}

        {/* Profile View */}
        {currentTab === 'profile' && (
          <ProfilePage
            onNavigateToCatalog={() => handleNavigate('catalog')}
            onNavigateToSearch={(query, genre) => {
              if (genre) {
                setSearchInitialQuery('');
                window.history.pushState(
                  { tab: 'search', depth: inAppHistoryDepth + 1 },
                  '',
                  `/search?genre=${encodeURIComponent(genre)}`
                );
                setCurrentTab('search');
              } else {
                setSearchInitialQuery(query || '');
                handleNavigate('search');
              }
            }}
            onSelectManga={(mangaId) => handleSelectManga(mangaId, 'profile')}
            onReadChapter={handleReadChapter}
            onOpenDownloads={() => setIsDownloadsOpen(true)}
            onOpenExtensions={() => setIsExtensionsOpen(true)}
            onOpenFeedback={() => {
              setFeedbackContext(null);
              setIsFeedbackOpen(true);
            }}
          />
        )}

        {/* API Docs View */}
        {currentTab === 'api' && <ApiDocPage />}
      </main>

      {/* Footer is hidden during Reader mode for total immersion */}
      {currentTab !== 'reader' && (
        <Footer
          onOpenApi={() => handleNavigate('api')}
          onOpenFeedback={() => {
            setFeedbackContext(null);
            setIsFeedbackOpen(true);
          }}
        />
      )}

      {/* Slide-over Reading History Drawer (only mounted when opened to skip idle grouping) */}
      {isHistoryOpen && (
        <HistoryDrawer
          isOpen={isHistoryOpen}
          onClose={handleCloseHistory}
          history={history}
          onResume={handleResumeProgress}
          onSelectManga={handleSelectMangaFromDrawer}
          onRemove={handleRemoveHistory}
        />
      )}

      {/* Offline Downloads & Cache Storage Modal */}
      <DownloadsModal
        isOpen={isDownloadsOpen}
        onClose={handleCloseDownloads}
        onReadChapter={handleReadChapter}
        onNavigateToCatalog={handleNavigateToCatalogFromFavorites}
      />

      {/* External Trackers (AniList & MyAnimeList) Modal */}
      <TrackersModal
        isOpen={isTrackersOpen}
        onClose={() => {
          setIsTrackersOpen(false);
          setTrackersModalManga(null);
        }}
        activeMangaId={trackersModalManga?.id || selectedMangaId || undefined}
        activeMangaTitle={trackersModalManga?.title}
      />

      {/* Extensions & Repositories Manager Modal */}
      <ExtensionsModal
        isOpen={isExtensionsOpen}
        onClose={handleCloseExtensions}
        onExploreSource={handleExploreSource}
      />

      {/* User Feedback & Bug Report Modal */}
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => {
          setIsFeedbackOpen(false);
          setFeedbackContext(null);
        }}
        contextUrl={feedbackContext?.url}
        mangaContext={
          feedbackContext?.mangaContext ||
          (selectedMangaId ? `Obra ativa: ${selectedMangaId}${selectedChapterId ? ` | Cap: ${selectedChapterId}` : ''}` : undefined)
        }
      />

      {/* Floating Offline Notification */}
      <OfflineIndicator />
    </div>
  );
}
