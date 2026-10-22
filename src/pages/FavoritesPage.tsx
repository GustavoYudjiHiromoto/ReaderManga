import React, { useState, useEffect, useRef } from 'react';
import {
  Bookmark,
  BookOpen,
  Trash2,
  ArrowRight,
  Sparkles,
  Heart,
  Download,
  Upload,
  AlertCircle,
  Check,
  Search,
  RefreshCw,
  Filter,
  ArrowUpDown,
  Bell,
  Clock,
  X,
  Star,
  Tag,
  Edit3,
  HardDriveDownload
} from 'lucide-react';
import { FavoriteManga, Manga, ReadingProgress, LibraryCategory } from '../types/manga.js';
import { HistoryService } from '../services/history.js';
import { MangaCard } from '../components/MangaCard.js';
import { MangaApi } from '../services/api.js';
import { ReadingStatsSummary } from '../components/ReadingStatsSummary.js';
import { OfflineCacheService } from '../services/offlineCache.js';
import { PageBookmarksModal } from '../components/PageBookmarksModal.js';

interface FavoritesPageProps {
  onSelectManga: (mangaId: string) => void;
  onReadChapter?: (mangaId: string, chapterId: string) => void;
  onNavigateToCatalog: () => void;
  onOpenDownloads?: () => void;
}

interface UpdateInfo {
  latestChapterId: string;
  latestChapterNumber: string;
  hasNew: boolean;
  lastReadNumber?: string;
}

const CATEGORY_LABELS: Record<LibraryCategory, { label: string; color: string; badgeBg: string }> = {
  reading: { label: 'Lendo', color: 'text-rose-400', badgeBg: 'bg-rose-500/10 border-rose-500/30' },
  plan_to_read: { label: 'Quero Ler', color: 'text-sky-400', badgeBg: 'bg-sky-500/10 border-sky-500/30' },
  completed: { label: 'Completo', color: 'text-emerald-400', badgeBg: 'bg-emerald-500/10 border-emerald-500/30' },
  on_hold: { label: 'Pausado', color: 'text-amber-400', badgeBg: 'bg-amber-500/10 border-amber-500/30' },
  dropped: { label: 'Abandonado', color: 'text-zinc-500', badgeBg: 'bg-zinc-800/40 border-zinc-700/30' }
};

export const FavoritesPage: React.FC<FavoritesPageProps> = ({
  onSelectManga,
  onReadChapter,
  onNavigateToCatalog,
  onOpenDownloads
}) => {
  const [favorites, setFavorites] = useState<FavoriteManga[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [offlineChaptersCount, setOfflineChaptersCount] = useState<number>(() => OfflineCacheService.getAllSavedChapters().length);
  const [pageBookmarksCount, setPageBookmarksCount] = useState<number>(() => HistoryService.getPageBookmarks().length);
  const [showBookmarksModal, setShowBookmarksModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search, filter, category & sort states
  const [selectedCategory, setSelectedCategory] = useState<'all' | LibraryCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState('all');
  const [sortBy, setSortBy] = useState<'recent' | 'title-asc' | 'title-desc' | 'score-desc'>('recent');
  const [filterOnlyUnread, setFilterOnlyUnread] = useState(false);

  // Score & Notes Modal state
  const [editingScoreManga, setEditingScoreManga] = useState<FavoriteManga | null>(null);
  const [modalScore, setModalScore] = useState<number>(10);
  const [modalNotes, setModalNotes] = useState<string>('');

  // Live update tracker state
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateCheckProgress, setUpdateCheckProgress] = useState<string | null>(null);
  const [updatesMap, setUpdatesMap] = useState<Record<string, UpdateInfo>>({});

  useEffect(() => {
    // Initial load
    setFavorites(HistoryService.getFavorites());
    setOfflineChaptersCount(OfflineCacheService.getAllSavedChapters().length);
    setPageBookmarksCount(HistoryService.getPageBookmarks().length);

    // Subscribe to real-time changes
    const unsubscribeHistory = HistoryService.subscribe(() => {
      setFavorites(HistoryService.getFavorites());
      setPageBookmarksCount(HistoryService.getPageBookmarks().length);
    });

    const unsubscribeOffline = OfflineCacheService.subscribe(() => {
      setOfflineChaptersCount(OfflineCacheService.getAllSavedChapters().length);
    });

    return () => {
      unsubscribeHistory();
      unsubscribeOffline();
    };
  }, []);

  const handleExport = () => {
    HistoryService.downloadBackupFile();
    setNotification({
      type: 'success',
      message: 'Backup da biblioteca exportado com sucesso!'
    });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleExportTachiyomi = () => {
    HistoryService.downloadTachiyomiBackupFile();
    setNotification({
      type: 'success',
      message: 'Backup formatado para Tachiyomi e Mihon exportado com sucesso!'
    });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = HistoryService.importBackup(content);
      if (res.success) {
        setNotification({
          type: 'success',
          message: `Restauração concluída! ${res.favoritesAdded} novo(s) favorito(s) e ${res.historyAdded} histórico(s) mesclados.`
        });
      } else {
        setNotification({
          type: 'error',
          message: res.message || 'Falha ao importar o arquivo de backup.'
        });
      }
      setTimeout(() => setNotification(null), 5000);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleRemove = (e: React.MouseEvent, mangaId: string) => {
    e.stopPropagation();
    HistoryService.removeFavorite(mangaId);
  };

  const handleChangeCategory = (mangaId: string, category: LibraryCategory) => {
    HistoryService.updateFavoriteCategory(mangaId, category);
  };

  const openScoreModal = (e: React.MouseEvent, fav: FavoriteManga) => {
    e.stopPropagation();
    setEditingScoreManga(fav);
    setModalScore(fav.userScore || 10);
    setModalNotes(fav.userNotes || '');
  };

  const handleSaveScoreModal = () => {
    if (!editingScoreManga) return;
    HistoryService.updateFavoriteScore(editingScoreManga.mangaId, modalScore, modalNotes);
    setEditingScoreManga(null);
    setNotification({
      type: 'success',
      message: `Avaliação e notas salvas para ${editingScoreManga.title}!`
    });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleQuickRead = async (mangaId: string) => {
    // If an unread chapter was found via update tracker, prioritize reading it
    const update = updatesMap[mangaId];
    if (update?.hasNew && update.latestChapterId && onReadChapter) {
      onReadChapter(mangaId, update.latestChapterId);
      return;
    }

    // If progress exists, resume from saved chapter
    const progress = HistoryService.getProgress(mangaId);
    if (progress && onReadChapter) {
      onReadChapter(mangaId, progress.chapterId);
      return;
    }

    try {
      const chapters = await MangaApi.getChapters(mangaId, { order: 'asc' });
      if (chapters.length > 0 && onReadChapter) {
        onReadChapter(mangaId, chapters[0].id);
      } else {
        onSelectManga(mangaId);
      }
    } catch {
      onSelectManga(mangaId);
    }
  };

  const handleCheckUpdates = async () => {
    if (isCheckingUpdates || favorites.length === 0) return;
    setIsCheckingUpdates(true);
    setUpdateCheckProgress('Iniciando verificação...');

    const newUpdates: Record<string, UpdateInfo> = {};
    let newCount = 0;

    for (let i = 0; i < favorites.length; i++) {
      const fav = favorites[i];
      setUpdateCheckProgress(`Verificando ${i + 1}/${favorites.length}: ${fav.title.slice(0, 18)}...`);

      try {
        const chapters = await MangaApi.getChapters(fav.mangaId, { order: 'desc', deduplicate: true });
        if (chapters.length > 0) {
          const latest = chapters[0];
          const progress = HistoryService.getProgress(fav.mangaId);

          let hasNew = false;
          if (progress) {
            const lastNum = parseFloat(progress.chapterNumber);
            const latestNum = parseFloat(latest.chapterNumber);
            if (!isNaN(lastNum) && !isNaN(latestNum)) {
              hasNew = latestNum > lastNum;
            } else {
              hasNew = progress.chapterId !== latest.id;
            }
          } else {
            hasNew = false;
          }

          if (hasNew) newCount++;

          newUpdates[fav.mangaId] = {
            latestChapterId: latest.id,
            latestChapterNumber: latest.chapterNumber,
            hasNew,
            lastReadNumber: progress?.chapterNumber
          };
        }
      } catch (err) {
        console.warn(`Failed to check updates for ${fav.mangaId}:`, err);
      }
    }

    setUpdatesMap(newUpdates);
    setIsCheckingUpdates(false);
    setUpdateCheckProgress(null);

    if (newCount > 0) {
      setNotification({
        type: 'success',
        message: `${newCount} ${newCount === 1 ? 'obra possui capítulos novos' : 'obras possuem capítulos novos'} para leitura!`
      });
    } else {
      setNotification({
        type: 'success',
        message: 'Todas as suas obras favoritas estão em dia!'
      });
    }
    setTimeout(() => setNotification(null), 5000);
  };

  // Convert FavoriteManga to lightweight Manga for MangaCard rendering without API calls
  const mapFavoriteToManga = (fav: FavoriteManga): Manga => {
    return {
      id: fav.mangaId,
      title: fav.title,
      altTitles: [],
      coverUrl: fav.coverUrl,
      synopsis: '',
      authors: fav.authors && fav.authors.length > 0 ? fav.authors : ['Coleção'],
      artists: [],
      genres: fav.genres && fav.genres.length > 0 ? fav.genres : ['Favorito'],
      status: fav.status || 'ongoing',
      publicationInfo: {},
      sources: [
        {
          sourceId: fav.sourceId || (
            fav.mangaId.includes('mangadex') ? 'mangadex' :
            fav.mangaId.includes('comick') ? 'comick' :
            fav.mangaId.includes('weebcentral') ? 'weebcentral' :
            fav.mangaId.includes('mangapill') ? 'mangapill' : 'unknown'
          ),
          externalId: '',
          sourceName: fav.sourceName || (
            fav.mangaId.includes('mangadex') ? 'MangaDex' :
            fav.mangaId.includes('comick') ? 'Comick' :
            fav.mangaId.includes('weebcentral') ? 'WeebCentral' :
            fav.mangaId.includes('mangapill') ? 'MangaPill' : 'Manga'
          )
        }
      ],
      rating: fav.rating,
      updatedAt: new Date(fav.updatedAt).toISOString()
    };
  };

  // Category counts
  const categoryCounts = {
    all: favorites.length,
    reading: favorites.filter(f => (f.userCategory || 'reading') === 'reading').length,
    plan_to_read: favorites.filter(f => f.userCategory === 'plan_to_read').length,
    completed: favorites.filter(f => f.userCategory === 'completed').length,
    on_hold: favorites.filter(f => f.userCategory === 'on_hold').length,
    dropped: favorites.filter(f => f.userCategory === 'dropped').length
  };

  // Filter & sort logic
  const filteredFavorites = favorites
    .filter((fav) => {
      // Category filter
      if (selectedCategory !== 'all') {
        const cat = fav.userCategory || 'reading';
        if (cat !== selectedCategory) return false;
      }
      // Search term
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (!fav.title.toLowerCase().includes(q)) return false;
      }
      // Source filter
      if (selectedSource !== 'all') {
        const source = fav.sourceId || (
          fav.mangaId.includes('mangadex') ? 'mangadex' :
          fav.mangaId.includes('comick') ? 'comick' :
          fav.mangaId.includes('weebcentral') ? 'weebcentral' :
          fav.mangaId.includes('mangapill') ? 'mangapill' : ''
        );
        if (source !== selectedSource) return false;
      }
      // Unread only filter
      if (filterOnlyUnread) {
        if (!updatesMap[fav.mangaId]?.hasNew) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'title-asc') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'title-desc') {
        return b.title.localeCompare(a.title);
      }
      if (sortBy === 'score-desc') {
        return (b.userScore || 0) - (a.userScore || 0);
      }
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

  const unreadCount = Object.values(updatesMap).filter(u => u.hasNew).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <Bookmark className="h-5 w-5 fill-rose-500/30" />
              </div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Minha Biblioteca
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400">
              Suas obras favoritas salvas localmente para acesso rápido, organização por status e acompanhamento
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Check for New Chapters Button */}
            <button
              onClick={handleCheckUpdates}
              disabled={isCheckingUpdates || favorites.length === 0}
              title="Consultar os provedores ao vivo para verificar se há novos capítulos disponíveis"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-950/40 transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
              <span>{isCheckingUpdates ? 'Verificando...' : 'Verificar Atualizações'}</span>
            </button>

            {/* Hidden file input for restore */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json,application/json"
              className="hidden"
            />

            {/* Export Backup Button */}
            <button
              onClick={handleExport}
              title="Exportar backup completo (MangaReader JSON)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 hover:text-white font-medium transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-rose-400" />
              <span className="hidden sm:inline">Exportar JSON</span>
              <span className="sm:hidden">JSON</span>
            </button>

            {/* Export Tachiyomi / Mihon Button */}
            <button
              onClick={handleExportTachiyomi}
              title="Exportar biblioteca em formato compatível com Tachiyomi e Mihon"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/40 text-xs text-amber-300 hover:text-amber-200 font-medium transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden sm:inline">Tachiyomi/Mihon</span>
              <span className="sm:hidden">Mihon</span>
            </button>

            {/* Import Backup Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Importar e mesclar backup de biblioteca (MangaReader ou Tachiyomi/Mihon)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/40 text-xs text-zinc-300 hover:text-white font-medium transition-colors cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Restaurar</span>
            </button>

            {/* Downloads Offline Button */}
            {onOpenDownloads && (
              <button
                onClick={onOpenDownloads}
                title="Ver e gerenciar capítulos salvos para leitura offline"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 hover:text-white font-medium transition-colors cursor-pointer"
              >
                <HardDriveDownload className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Offline</span>
                {offlineChaptersCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono tabular-nums">
                    {offlineChaptersCount}
                  </span>
                )}
              </button>
            )}

            {/* Page Bookmarks Button */}
            <button
              onClick={() => setShowBookmarksModal(true)}
              title="Ver todas as páginas marcadas na leitura"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 hover:text-white font-medium transition-colors cursor-pointer"
            >
              <Bookmark className="h-3.5 w-3.5 text-rose-400" />
              <span className="hidden sm:inline">Marcadores</span>
              {pageBookmarksCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono tabular-nums">
                  {pageBookmarksCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Checking Updates Progress Banner */}
        {isCheckingUpdates && updateCheckProgress && (
          <div className="mb-6 p-3 rounded-xl bg-zinc-900/90 border border-rose-500/30 flex items-center gap-3 text-xs text-zinc-200 animate-pulse">
            <RefreshCw className="h-4 w-4 text-rose-500 animate-spin shrink-0" />
            <span>{updateCheckProgress}</span>
          </div>
        )}

        {/* Notification Banner */}
        {notification && (
          <div className={`mb-6 p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs animate-in fade-in duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-200'
          }`}>
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? (
                <Check className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Reading Stats Summary Dashboard */}
        <ReadingStatsSummary favoritesCount={favorites.length} />

        {/* Category Navigation Tabs (AniList / MAL Style) */}
        {favorites.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-zinc-800/80 pb-3">
            {[
              { id: 'all', label: 'Todos', count: categoryCounts.all },
              { id: 'reading', label: 'Lendo', count: categoryCounts.reading },
              { id: 'plan_to_read', label: 'Quero Ler', count: categoryCounts.plan_to_read },
              { id: 'completed', label: 'Completos', count: categoryCounts.completed },
              { id: 'on_hold', label: 'Pausados', count: categoryCounts.on_hold },
              { id: 'dropped', label: 'Abandonados', count: categoryCounts.dropped }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  selectedCategory === tab.id
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40'
                    : 'bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums ${
                  selectedCategory === tab.id ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Filter & Search Toolbar (Only when library has items) */}
        {favorites.length > 0 && (
          <div className="mb-6 space-y-3.5 p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/70">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              
              {/* Search bar within Favorites */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar por título nos favoritos..."
                  className="w-full pl-9 pr-8 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-rose-500/60"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Sort Selector */}
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <span className="text-xs text-zinc-500 font-medium hidden sm:inline">Ordenar:</span>
                <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300">
                  <ArrowUpDown className="h-3.5 w-3.5 text-zinc-500" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
                  >
                    <option value="recent">Mais Recentes</option>
                    <option value="title-asc">Título (A-Z)</option>
                    <option value="title-desc">Título (Z-A)</option>
                    <option value="score-desc">Melhor Avaliação</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Source Filter Pills & Unread Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/60 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-zinc-500 font-medium mr-1">Fonte:</span>
                {[
                  { id: 'all', label: 'Todas' },
                  { id: 'mangadex', label: 'MangaDex' },
                  { id: 'comick', label: 'Comick' },
                  { id: 'weebcentral', label: 'WeebCentral' },
                  { id: 'mangapill', label: 'MangaPill' }
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSource(s.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                      selectedSource === s.id
                        ? 'bg-rose-600 text-white'
                        : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Unread toggle pill */}
              {unreadCount > 0 && (
                <button
                  onClick={() => setFilterOnlyUnread(!filterOnlyUnread)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    filterOnlyUnread
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-sm shadow-rose-950/40'
                      : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-400 border border-zinc-800'
                  }`}
                >
                  <Sparkles className="h-3 w-3 text-rose-400" />
                  <span>Apenas com novos capítulos ({unreadCount})</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-zinc-900/30 rounded-2xl border border-zinc-800/60 max-w-2xl mx-auto my-8">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 mb-4 shadow-inner">
              <Bookmark className="h-8 w-8 text-zinc-500" />
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-zinc-200 mb-2">
              Sua biblioteca está vazia
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-md mb-6 leading-relaxed">
              Você ainda não adicionou nenhum mangá aos seus favoritos. Ao explorar obras, clique no botão &quot;Favoritar&quot; para guardá-las aqui e acompanhar novos capítulos.
            </p>
            <button
              onClick={onNavigateToCatalog}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg shadow-rose-950/50 transition-all cursor-pointer"
            >
              <BookOpen className="h-4 w-4" />
              <span>Explorar Catálogo de Mangás</span>
            </button>
          </div>
        ) : filteredFavorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-zinc-900/20 rounded-2xl border border-zinc-800/40 my-6">
            <Search className="h-8 w-8 text-zinc-600 mb-2" />
            <h3 className="text-sm font-semibold text-zinc-300">Nenhuma obra encontrada nesta categoria/filtro</h3>
            <p className="text-xs text-zinc-500 mt-1">Tente selecionar outra aba de status ou limpar o termo de pesquisa.</p>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSearchQuery('');
                setSelectedSource('all');
                setFilterOnlyUnread(false);
              }}
              className="mt-4 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium cursor-pointer"
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          /* Favorites Grid */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
            {filteredFavorites.map((fav) => {
              const updateInfo = updatesMap[fav.mangaId];
              const progress = HistoryService.getProgress(fav.mangaId);
              const currentCat = fav.userCategory || 'reading';
              const catMeta = CATEGORY_LABELS[currentCat] || CATEGORY_LABELS.reading;

              return (
                <div key={fav.mangaId} className="group relative flex flex-col">
                  <div className="relative">
                    <MangaCard
                      manga={mapFavoriteToManga(fav)}
                      onSelect={onSelectManga}
                      onQuickRead={handleQuickRead}
                    />
                    
                    {/* Floating New Chapter Badge */}
                    {updateInfo?.hasNew && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onReadChapter) {
                            onReadChapter(fav.mangaId, updateInfo.latestChapterId);
                          } else {
                            onSelectManga(fav.mangaId);
                          }
                        }}
                        className="absolute top-2 left-2 z-20 flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold shadow-lg shadow-rose-950/80 animate-pulse hover:bg-rose-500 transition-colors cursor-pointer"
                        title={`Novo capítulo disponível: Cap. ${updateInfo.latestChapterNumber}. Clique para ler!`}
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>Novo Cap. {updateInfo.latestChapterNumber}</span>
                      </button>
                    )}

                    {/* Floating User Rating Badge */}
                    {fav.userScore ? (
                      <button
                        onClick={(e) => openScoreModal(e, fav)}
                        title="Ver ou editar avaliação pessoal"
                        className="absolute bottom-2 left-2 z-20 flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-950/90 border border-amber-500/50 text-amber-400 text-[10px] font-bold shadow-lg backdrop-blur-sm cursor-pointer hover:border-amber-400"
                      >
                        <Star className="h-3 w-3 fill-amber-400" />
                        <span>{fav.userScore}/10</span>
                      </button>
                    ) : (
                      <button
                        onClick={(e) => openScoreModal(e, fav)}
                        title="Avaliar esta obra (1-10 estrelas)"
                        className="absolute bottom-2 left-2 z-20 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-400 text-[10px] opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm cursor-pointer hover:text-amber-400 hover:border-amber-500/50"
                      >
                        <Star className="h-3 w-3" />
                        <span>Avaliar</span>
                      </button>
                    )}

                    {/* Remove button badge */}
                    <button
                      onClick={(e) => handleRemove(e, fav.mangaId)}
                      title="Remover dos favoritos"
                      className="absolute top-2 right-2 z-20 p-1.5 rounded-lg bg-zinc-950/80 hover:bg-rose-950/90 text-zinc-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-500/50 opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer shadow-md backdrop-blur-sm"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Category Status & Progress underneath card */}
                  <div className="mt-2 flex flex-col gap-1 px-0.5">
                    <div className="flex items-center justify-between gap-1">
                      {/* Category Selector Pill */}
                      <select
                        value={currentCat}
                        onChange={(e) => handleChangeCategory(fav.mangaId, e.target.value as LibraryCategory)}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${catMeta.badgeBg} ${catMeta.color} bg-zinc-950 cursor-pointer focus:outline-none`}
                        title="Alterar status de leitura"
                      >
                        <option value="reading" className="bg-zinc-900 text-rose-300">Lendo</option>
                        <option value="plan_to_read" className="bg-zinc-900 text-sky-300">Quero Ler</option>
                        <option value="completed" className="bg-zinc-900 text-emerald-300">Completo</option>
                        <option value="on_hold" className="bg-zinc-900 text-amber-300">Pausado</option>
                        <option value="dropped" className="bg-zinc-900 text-zinc-400">Abandonado</option>
                      </select>

                      {/* Edit score icon */}
                      <button
                        onClick={(e) => openScoreModal(e, fav)}
                        title="Adicionar nota ou avaliação"
                        className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 cursor-pointer"
                      >
                        <Edit3 className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Reading Progress Chapter */}
                    {progress && (
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5 text-rose-400/80" />
                          Lido: Cap. {progress.chapterNumber}
                        </span>
                        {updateInfo?.latestChapterNumber && (
                          <span className="text-zinc-500">
                            Recente: {updateInfo.latestChapterNumber}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal for User Rating & Notes */}
        {editingScoreManga && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
                  <h3 className="text-sm font-bold text-white line-clamp-1">
                    Avaliar: {editingScoreManga.title}
                  </h3>
                </div>
                <button
                  onClick={() => setEditingScoreManga(null)}
                  className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {/* Score slider or buttons (1 to 10) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-zinc-400 font-medium">Nota Pessoal</label>
                    <span className="text-sm font-extrabold text-amber-400 font-mono">
                      ⭐ {modalScore} / 10
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={modalScore}
                    onChange={(e) => setModalScore(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-1">
                    <span>1 (Ruim)</span>
                    <span>5 (Médio)</span>
                    <span>10 (Obra-prima)</span>
                  </div>
                </div>

                {/* Notes input */}
                <div>
                  <label className="text-xs text-zinc-400 font-medium block mb-1.5">
                    Anotações Pessoais (Opcional)
                  </label>
                  <textarea
                    rows={3}
                    value={modalNotes}
                    onChange={(e) => setModalNotes(e.target.value)}
                    placeholder="Ex: Arte impressionante no arco atual, reler volume 3..."
                    className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
                <button
                  onClick={() => setEditingScoreManga(null)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveScoreModal}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold shadow-md shadow-amber-950/50 transition-colors cursor-pointer"
                >
                  Salvar Avaliação
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal for Page Bookmarks & Snapshots */}
        <PageBookmarksModal
          isOpen={showBookmarksModal}
          onClose={() => setShowBookmarksModal(false)}
          onJumpToPage={(mangaId, chapterId) => {
            if (onReadChapter) {
              onReadChapter(mangaId, chapterId);
            } else {
              onSelectManga(mangaId);
            }
          }}
        />
      </div>
    </div>
  );
};
