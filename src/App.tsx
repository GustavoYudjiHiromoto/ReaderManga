import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.js';
import { Footer } from './components/Footer.js';
import { HistoryDrawer } from './components/HistoryDrawer.js';
import { HomePage } from './pages/HomePage.js';
import { SearchPage } from './pages/SearchPage.js';
import { MangaDetailPage } from './pages/MangaDetailPage.js';
import { ReaderPage } from './pages/ReaderPage.js';
import { ApiDocPage } from './pages/ApiDocPage.js';
import { HistoryService } from './services/history.js';
import { ReadingProgress } from './types/manga.js';

type TabType = 'home' | 'catalog' | 'search' | 'api' | 'detail' | 'reader';

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('home');
  const [selectedMangaId, setSelectedMangaId] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [searchInitialQuery, setSearchInitialQuery] = useState<string>('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ReadingProgress[]>([]);

  useEffect(() => {
    refreshHistory();
  }, [currentTab]);

  const refreshHistory = () => {
    setHistory(HistoryService.getHistory());
  };

  const handleSelectManga = (mangaId: string) => {
    setSelectedMangaId(mangaId);
    setCurrentTab('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReadChapter = (mangaId: string, chapterId: string) => {
    setSelectedMangaId(mangaId);
    setSelectedChapterId(chapterId);
    setCurrentTab('reader');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigate = (tab: 'home' | 'catalog' | 'search' | 'api') => {
    if (tab === 'catalog') {
      setCurrentTab('home');
      setTimeout(() => {
        const el = document.getElementById('catalog-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 50);
      return;
    }
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        />
      )}

      {/* Main Content Areas */}
      <main className="flex-1">
        {currentTab === 'home' && (
          <HomePage
            onSelectManga={handleSelectManga}
            onReadChapter={handleReadChapter}
            onNavigateToSearch={(query) => {
              setSearchInitialQuery(query || '');
              setCurrentTab('search');
            }}
          />
        )}

        {currentTab === 'search' && (
          <SearchPage
            initialQuery={searchInitialQuery}
            onSelectManga={handleSelectManga}
            onReadChapter={handleReadChapter}
          />
        )}

        {currentTab === 'detail' && selectedMangaId && (
          <MangaDetailPage
            mangaId={selectedMangaId}
            onBack={() => setCurrentTab('home')}
            onReadChapter={handleReadChapter}
          />
        )}

        {currentTab === 'reader' && selectedMangaId && selectedChapterId && (
          <ReaderPage
            mangaId={selectedMangaId}
            chapterId={selectedChapterId}
            onBackToManga={() => setCurrentTab('detail')}
            onChangeChapter={(newChapterId) => {
              setSelectedChapterId(newChapterId);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

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
