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
  HardDriveDownload,
  Folder,
  FolderPlus,
  Plus,
  Cloud,
  Sliders,
  LayoutGrid,
  LayoutList,
  MoreHorizontal,
  ChevronDown,
  CheckSquare,
  Square
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { TrackersModal } from '../components/TrackersModal.js';
import { FavoriteManga, Manga, ReadingProgress, LibraryCategory, MangaUpdateInfo } from '../types/manga.js';
import { HistoryService } from '../services/history.js';
import { MangaCard } from '../components/MangaCard.js';
import { MangaApi } from '../services/api.js';
import { OfflineCacheService } from '../services/offlineCache.js';
import { PageBookmarksModal } from '../components/PageBookmarksModal.js';
import { UpdateTrackerService } from '../services/updateTracker.js';
import { TrackerStatusBadge } from '../components/TrackerStatusBadge.js';
import { CategorySelectionModal } from '../components/CategorySelectionModal.js';
import { parseTachibk } from '../services/tachibkService.js';
import { BackupProgressModal, BackupProgressState } from '../components/BackupProgressModal.js';

interface FavoritesPageProps {
  onSelectManga: (mangaId: string) => void;
  onReadChapter?: (mangaId: string, chapterId: string) => void;
  onNavigateToCatalog: () => void;
  onOpenDownloads?: () => void;
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
  const { user, syncStatus, lastSynced, loginWithGoogle, syncNow } = useAuth();
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteManga[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [offlineChaptersCount, setOfflineChaptersCount] = useState<number>(() => OfflineCacheService.getAllSavedChapters().length);
  const [pageBookmarksCount, setPageBookmarksCount] = useState<number>(() => HistoryService.getPageBookmarks().length);
  const [showBookmarksModal, setShowBookmarksModal] = useState(false);
  const [showTrackersModal, setShowTrackersModal] = useState(false);
  const [selectedTrackerManga, setSelectedTrackerManga] = useState<{ id?: string; title?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showLibraryMenu, setShowLibraryMenu] = useState(false);
  const libraryMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (libraryMenuRef.current && !libraryMenuRef.current.contains(e.target as Node)) {
        setShowLibraryMenu(false);
      }
    };
    if (showLibraryMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showLibraryMenu]);

  // Search, filter, category & sort states
  const [selectedCategory, setSelectedCategory] = useState<'all' | LibraryCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState('all');
  const [sortBy, setSortBy] = useState<'recent' | 'title-asc' | 'title-desc' | 'score-desc'>('recent');
  const [filterOnlyUnread, setFilterOnlyUnread] = useState(false);
  const [libraryViewMode, setLibraryViewMode] = useState<'grid' | 'list'>('grid');

  // Batch Selection & Bulk Management states
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedMangaIds, setSelectedMangaIds] = useState<string[]>([]);
  const [showBatchCategoryModal, setShowBatchCategoryModal] = useState(false);
  const [showBatchCollectionModal, setShowBatchCollectionModal] = useState(false);
  const [batchCollectionTarget, setBatchCollectionTarget] = useState('');
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  // Score & Notes Modal state
  const [editingScoreManga, setEditingScoreManga] = useState<FavoriteManga | null>(null);
  const [modalScore, setModalScore] = useState<number>(10);
  const [modalNotes, setModalNotes] = useState<string>('');

  // Custom Collections state
  const [customCollections, setCustomCollections] = useState<string[]>(() => HistoryService.getCustomCollections());
  const [selectedCustomCollection, setSelectedCustomCollection] = useState<string | null>(null);
  const [showNewCollectionModal, setShowNewCollectionModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [managingCollectionsManga, setManagingCollectionsManga] = useState<FavoriteManga | null>(null);
  const [backupProgress, setBackupProgress] = useState<BackupProgressState>({
    isOpen: false,
    stage: 'reading',
    stageLabel: '',
    percent: 0
  });

  // Live update tracker state
  const [isCheckingUpdates, setIsCheckingUpdates] = useState<boolean>(() => UpdateTrackerService.isChecking());
  const [updateCheckProgress, setUpdateCheckProgress] = useState<string | null>(() => UpdateTrackerService.getProgress());
  const [updatesMap, setUpdatesMap] = useState<Record<string, MangaUpdateInfo>>(() => UpdateTrackerService.getStoredUpdates());
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => UpdateTrackerService.isNotificationsEnabled());

  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      UpdateTrackerService.setNotificationsEnabled(false);
      setNotificationsEnabled(false);
      setNotification({
        type: 'success',
        message: 'Notificações de novos capítulos desativadas.'
      });
    } else {
      const granted = await UpdateTrackerService.requestNotificationPermission();
      setNotificationsEnabled(granted);
      if (granted) {
        setNotification({
          type: 'success',
          message: '🔔 Notificações ativadas! Você será avisado quando houver novos capítulos.'
        });
      } else {
        setNotification({
          type: 'error',
          message: 'Permissão de notificação negada no navegador. Permita nas configurações de site do navegador.'
        });
      }
    }
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    // Initial load
    setFavorites(HistoryService.getFavorites());
    setCustomCollections(HistoryService.getCustomCollections());
    setOfflineChaptersCount(OfflineCacheService.getAllSavedChapters().length);
    setPageBookmarksCount(HistoryService.getPageBookmarks().length);
    setUpdatesMap(UpdateTrackerService.getStoredUpdates());

    // Subscribe to real-time changes
    const unsubscribeHistory = HistoryService.subscribe(() => {
      setFavorites(HistoryService.getFavorites());
      setCustomCollections(HistoryService.getCustomCollections());
      setPageBookmarksCount(HistoryService.getPageBookmarks().length);
    });

    const unsubscribeUpdates = UpdateTrackerService.subscribe(() => {
      setUpdatesMap(UpdateTrackerService.getStoredUpdates());
      setIsCheckingUpdates(UpdateTrackerService.isChecking());
      setUpdateCheckProgress(UpdateTrackerService.getProgress());
      setNotificationsEnabled(UpdateTrackerService.isNotificationsEnabled());
    });

    const unsubscribeOffline = OfflineCacheService.subscribe(() => {
      setOfflineChaptersCount(OfflineCacheService.getAllSavedChapters().length);
    });

    return () => {
      unsubscribeHistory();
      unsubscribeUpdates();
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isTachibk = file.name.endsWith('.tachibk') || file.name.endsWith('.proto.gz') || file.type.includes('gzip');

    setBackupProgress({
      isOpen: true,
      stage: 'reading',
      stageLabel: isTachibk ? 'Iniciando leitura do backup Mihon (.tachibk)...' : 'Lendo arquivo de backup JSON...',
      percent: 5,
      fileName: file.name,
      isTachibk,
      resultSummary: null,
      error: null
    });

    try {
      if (isTachibk) {
        const parsed = await parseTachibk(file, (info) => {
          setBackupProgress(prev => ({
            ...prev,
            stage: info.stage,
            stageLabel: info.stageLabel,
            percent: info.percent,
            currentItem: info.currentItem,
            currentCount: info.currentCount,
            totalCount: info.totalCount
          }));
        });

        setBackupProgress(prev => ({
          ...prev,
          stage: 'merging',
          stageLabel: 'Mesclando favoritos, capítulos lidos e categorias...',
          percent: 85
        }));

        await new Promise(r => setTimeout(r, 120));

        const res = HistoryService.importBackup(parsed as any);

        if (res.success) {
          setBackupProgress(prev => ({
            ...prev,
            stage: 'completed',
            stageLabel: 'Restauração concluída com sucesso!',
            percent: 100,
            resultSummary: {
              favoritesAdded: res.favoritesAdded,
              historyAdded: res.historyAdded,
              totalFavorites: res.totalFavorites,
              totalHistory: res.totalHistory,
              categoriesAdded: res.categoriesAdded
            }
          }));
          setFavorites(HistoryService.getFavorites());
          setCustomCollections(HistoryService.getCustomCollections());
        } else {
          setBackupProgress(prev => ({
            ...prev,
            stage: 'error',
            stageLabel: 'Erro ao importar',
            error: res.message || 'Falha ao importar o arquivo .tachibk.'
          }));
        }
      } else {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            setBackupProgress(prev => ({
              ...prev,
              stage: 'decoding',
              stageLabel: 'Validando estrutura JSON da biblioteca...',
              percent: 50
            }));

            await new Promise(r => setTimeout(r, 150));

            const content = event.target?.result as string;
            setBackupProgress(prev => ({
              ...prev,
              stage: 'merging',
              stageLabel: 'Mesclando dados da biblioteca...',
              percent: 85
            }));

            await new Promise(r => setTimeout(r, 150));

            const res = HistoryService.importBackup(content);
            if (res.success) {
              setBackupProgress(prev => ({
                ...prev,
                stage: 'completed',
                stageLabel: 'Restauração concluída com sucesso!',
                percent: 100,
                resultSummary: {
                  favoritesAdded: res.favoritesAdded,
                  historyAdded: res.historyAdded,
                  totalFavorites: res.totalFavorites,
                  totalHistory: res.totalHistory,
                  categoriesAdded: res.categoriesAdded
                }
              }));
              setFavorites(HistoryService.getFavorites());
              setCustomCollections(HistoryService.getCustomCollections());
            } else {
              setBackupProgress(prev => ({
                ...prev,
                stage: 'error',
                stageLabel: 'Falha na validação',
                error: res.message || 'Falha ao importar o arquivo de backup.'
              }));
            }
          } catch (err: any) {
            setBackupProgress(prev => ({
              ...prev,
              stage: 'error',
              stageLabel: 'Erro de leitura',
              error: err?.message || 'Arquivo JSON inválido ou corrompido.'
            }));
          }
        };
        reader.readAsText(file);
      }
    } catch (err: any) {
      setBackupProgress(prev => ({
        ...prev,
        stage: 'error',
        stageLabel: 'Erro no processamento',
        error: err?.message || 'Não foi possível processar o arquivo de backup.'
      }));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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

  const handleCreateCollection = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = newCollectionName.trim();
    if (!name) return;
    const ok = HistoryService.createCustomCollection(name);
    if (ok) {
      setCustomCollections(HistoryService.getCustomCollections());
      setSelectedCustomCollection(name);
      setNewCollectionName('');
      setShowNewCollectionModal(false);
      setNotification({
        type: 'success',
        message: `Pasta "${name}" criada com sucesso!`
      });
    } else {
      setNotification({
        type: 'error',
        message: `A pasta "${name}" já existe ou tem nome inválido.`
      });
    }
    setTimeout(() => setNotification(null), 3500);
  };

  const handleDeleteCollection = (collectionName: string) => {
    HistoryService.deleteCustomCollection(collectionName);
    setCustomCollections(HistoryService.getCustomCollections());
    if (selectedCustomCollection === collectionName) {
      setSelectedCustomCollection(null);
    }
    setNotification({
      type: 'success',
      message: `Pasta "${collectionName}" removida da biblioteca.`
    });
    setTimeout(() => setNotification(null), 3500);
  };

  const handleToggleMangaCollection = (mangaId: string, collectionName: string) => {
    HistoryService.toggleMangaInCollection(mangaId, collectionName);
    setFavorites(HistoryService.getFavorites());
    if (managingCollectionsManga && managingCollectionsManga.mangaId === mangaId) {
      const updated = HistoryService.getFavorites().find(f => f.mangaId === mangaId) || null;
      setManagingCollectionsManga(updated);
    }
  };

  const handleQuickRead = async (mangaId: string) => {
    // If an unread chapter was found via update tracker, prioritize reading it
    const update = updatesMap[mangaId];
    if (update?.hasNew && update.latestChapterId && onReadChapter) {
      UpdateTrackerService.markMangaUpdateAsSeen(mangaId);
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
    try {
      const res = await UpdateTrackerService.checkUpdates(true, (msg) => {
        setUpdateCheckProgress(msg);
      });
      setUpdatesMap(res.updates);
      if (res.count > 0) {
        setNotification({
          type: 'success',
          message: `${res.count} ${res.count === 1 ? 'obra possui novos capítulos' : 'obras possuem novos capítulos'} para leitura!`
        });
      } else {
        setNotification({
          type: 'success',
          message: 'Todas as suas obras favoritas estão em dia com os lançamentos!'
        });
      }
    } catch {
      setNotification({
        type: 'error',
        message: 'Não foi possível verificar atualizações no momento.'
      });
    } finally {
      setIsCheckingUpdates(false);
      setUpdateCheckProgress(null);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  // Batch Selection Handlers
  const handleToggleBatchSelect = (mangaId: string) => {
    setSelectedMangaIds(prev =>
      prev.includes(mangaId) ? prev.filter(id => id !== mangaId) : [...prev, mangaId]
    );
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredFavorites.map(f => f.mangaId);
    setSelectedMangaIds(allFilteredIds);
  };

  const handleClearBatchSelect = () => {
    setSelectedMangaIds([]);
  };

  const handleApplyBatchCategory = (cat: LibraryCategory) => {
    if (selectedMangaIds.length === 0) return;
    HistoryService.batchUpdateCategory(selectedMangaIds, cat);
    setFavorites(HistoryService.getFavorites());
    setShowBatchCategoryModal(false);
    setNotification({
      type: 'success',
      message: `${selectedMangaIds.length} obra(s) movida(s) para "${CATEGORY_LABELS[cat].label}" com sucesso!`
    });
    setSelectedMangaIds([]);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleApplyBatchCollection = (colName: string) => {
    if (selectedMangaIds.length === 0 || !colName.trim()) return;
    HistoryService.batchAddCollections(selectedMangaIds, [colName.trim()]);
    setFavorites(HistoryService.getFavorites());
    setCustomCollections(HistoryService.getCustomCollections());
    setShowBatchCollectionModal(false);
    setBatchCollectionTarget('');
    setNotification({
      type: 'success',
      message: `${selectedMangaIds.length} obra(s) adicionada(s) à pasta/categoria "${colName}"!`
    });
    setSelectedMangaIds([]);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleConfirmBatchRemove = () => {
    if (selectedMangaIds.length === 0) return;
    const count = selectedMangaIds.length;
    HistoryService.batchRemoveFavorites(selectedMangaIds);
    setFavorites(HistoryService.getFavorites());
    setShowBatchDeleteConfirm(false);
    setSelectedMangaIds([]);
    setNotification({
      type: 'success',
      message: `${count} obra(s) removida(s) dos favoritos.`
    });
    setTimeout(() => setNotification(null), 3500);
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
      // Custom Collection filter
      if (selectedCustomCollection) {
        if (!fav.customCollections || !fav.customCollections.includes(selectedCustomCollection)) {
          return false;
        }
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

          {/* Consolidated Header Action Toolbar */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Hidden file input for restore (.tachibk / .proto.gz / .json) */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".tachibk,.proto.gz,.json,application/json,application/gzip,application/octet-stream"
              className="hidden"
            />

            {/* 1. Primary Action: Check for Updates */}
            <button
              onClick={handleCheckUpdates}
              disabled={isCheckingUpdates || favorites.length === 0}
              title="Consultar os provedores ao vivo para verificar se há novos capítulos disponíveis"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-950/40 transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isCheckingUpdates ? 'Verificando...' : 'Verificar Atualizações'}</span>
              <span className="sm:hidden">{isCheckingUpdates ? '...' : 'Atualizações'}</span>
            </button>

            {/* 2. Quick Offline Access Button */}
            {onOpenDownloads && (
              <button
                onClick={onOpenDownloads}
                title="Ver e gerenciar capítulos salvos para leitura offline"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 hover:text-white font-medium transition-colors cursor-pointer"
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

            {/* 3. Consolidated Dropdown: "Gerenciar Biblioteca" */}
            <div className="relative" ref={libraryMenuRef}>
              <button
                onClick={() => setShowLibraryMenu(!showLibraryMenu)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  showLibraryMenu
                    ? 'bg-zinc-800 text-white border-zinc-700 shadow-lg'
                    : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-800'
                }`}
                title="Mais opções da biblioteca (backup, rastreadores e marcadores)"
              >
                <MoreHorizontal className="h-4 w-4 text-zinc-400" />
                <span className="hidden sm:inline">Gerenciar</span>
                <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform duration-200 ${showLibraryMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu Popover */}
              {showLibraryMenu && (
                <div className="absolute right-0 top-11 w-64 rounded-2xl bg-zinc-950/95 border border-zinc-800 shadow-2xl p-2 z-50 text-xs backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                  {/* Section: Sincronização & Rastreamento */}
                  <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-850">
                    Integrações & Alertas
                  </div>
                  <div className="py-1 space-y-0.5">
                    <button
                      onClick={() => {
                        setShowLibraryMenu(false);
                        setShowTrackersModal(true);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Sliders className="h-3.5 w-3.5 text-sky-400" />
                        <span>AniList & MyAnimeList</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500">Auto-sync</span>
                    </button>

                    <button
                      onClick={() => {
                        handleToggleNotifications();
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Bell className={`h-3.5 w-3.5 ${notificationsEnabled ? 'text-emerald-400' : 'text-zinc-400'}`} />
                        <span>Notificações de Lançamentos</span>
                      </div>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${notificationsEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-850 text-zinc-500'}`}>
                        {notificationsEnabled ? 'Ativo' : 'Ativar'}
                      </span>
                    </button>
                  </div>

                  {/* Section: Leitura & Marcadores */}
                  <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-t border-zinc-850 pt-2">
                    Leitura & Marcadores
                  </div>
                  <div className="py-1 space-y-0.5">
                    <button
                      onClick={() => {
                        setShowLibraryMenu(false);
                        setShowBookmarksModal(true);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Bookmark className="h-3.5 w-3.5 text-rose-400" />
                        <span>Páginas Marcadas</span>
                      </div>
                      {pageBookmarksCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono">
                          {pageBookmarksCount}
                        </span>
                      )}
                    </button>

                    {onOpenDownloads && (
                      <button
                        onClick={() => {
                          setShowLibraryMenu(false);
                          onOpenDownloads();
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2">
                          <HardDriveDownload className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Capítulos Offline</span>
                        </div>
                        {offlineChaptersCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                            {offlineChaptersCount}
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Section: Backup & Dados */}
                  <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-t border-zinc-850 pt-2">
                    Backup & Transferência
                  </div>
                  <div className="py-1 space-y-0.5">
                    <button
                      onClick={() => {
                        setShowLibraryMenu(false);
                        handleExport();
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Download className="h-3.5 w-3.5 text-rose-400" />
                        <span>Exportar Backup (JSON)</span>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setShowLibraryMenu(false);
                        handleExportTachiyomi();
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-amber-300 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Download className="h-3.5 w-3.5 text-amber-400" />
                        <span>Exportar Tachiyomi/Mihon</span>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setShowLibraryMenu(false);
                        fileInputRef.current?.click();
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-emerald-300 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Upload className="h-3.5 w-3.5 text-emerald-400" />
                        <div>
                          <div className="font-medium text-zinc-200">Restaurar Backup</div>
                          <div className="text-[10px] text-zinc-500">Mihon (.tachibk) ou MangaReader (.json)</div>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
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

        {/* Cloud Sync Status Bar */}
        <div className="mb-6 p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg border shrink-0 ${
              user
                ? syncStatus === 'error'
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
              <Cloud className="h-4 w-4" />
            </div>
            <div>
              {user ? (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-100">
                      Sincronização em Nuvem Ativa
                    </span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      Em tempo real
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Conectado com <span className="text-zinc-300 font-medium">{user.email}</span>. Obras favoritas, coleções e capítulos lidos estão sincronizados entre seus dispositivos.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-100">
                      Sincronização entre Dispositivos
                    </span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                      Modo Local
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Faça login com o Google para manter seu progresso de leitura, coleções e notas atualizadas no celular, tablet e computador.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {user ? (
              <button
                onClick={async () => {
                  try {
                    setIsSyncingCloud(true);
                    await syncNow();
                    setNotification({
                      type: 'success',
                      message: 'Sincronização com o Firestore concluída com sucesso!'
                    });
                    setTimeout(() => setNotification(null), 3000);
                  } finally {
                    setIsSyncingCloud(false);
                  }
                }}
                disabled={isSyncingCloud || syncStatus === 'syncing'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncingCloud || syncStatus === 'syncing' ? 'animate-spin text-blue-400' : 'text-zinc-400'}`} />
                <span>{isSyncingCloud || syncStatus === 'syncing' ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
              </button>
            ) : (
              <button
                onClick={async () => {
                  try {
                    await loginWithGoogle();
                    setNotification({
                      type: 'success',
                      message: 'Conta do Google vinculada e biblioteca sincronizada!'
                    });
                    setTimeout(() => setNotification(null), 4000);
                  } catch (e: any) {
                    setNotification({
                      type: 'error',
                      message: e?.message || 'Falha ao autenticar com o Google.'
                    });
                    setTimeout(() => setNotification(null), 4000);
                  }
                }}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-950/40 transition-all cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#FFFFFF"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#FFFFFF"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FFFFFF"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#FFFFFF"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Conectar com Google</span>
              </button>
            )}
          </div>
        </div>

        {/* Category Navigation Tabs (AniList / MAL Style) */}
        {favorites.length > 0 && (
          <div id="library-collection-tabs" className="mb-6 flex flex-wrap items-center gap-2 border-b border-zinc-800/80 pb-3">
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

        {/* Custom Collections / Pastas Personalizadas Bar */}
        {favorites.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2 pb-3 border-b border-zinc-850 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-400 font-medium mr-1">
              <Folder className="h-3.5 w-3.5 text-rose-400" />
              <span>Pastas:</span>
            </div>

            <button
              onClick={() => setSelectedCustomCollection(null)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                selectedCustomCollection === null
                  ? 'bg-zinc-800 text-white border-zinc-700 font-semibold'
                  : 'bg-zinc-950/60 hover:bg-zinc-900 text-zinc-400 border-zinc-800'
              }`}
            >
              Todas ({favorites.length})
            </button>

            {customCollections.map((colName) => {
              const count = favorites.filter(f => f.customCollections?.includes(colName)).length;
              const isSelected = selectedCustomCollection === colName;
              return (
                <div key={colName} className="flex items-center">
                  <button
                    onClick={() => setSelectedCustomCollection(isSelected ? null : colName)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-l-lg text-xs font-medium transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-semibold shadow-sm shadow-rose-950/30'
                        : 'bg-zinc-950/60 hover:bg-zinc-900 text-zinc-400 border-zinc-800'
                    }`}
                  >
                    <Folder className="h-3 w-3 text-rose-400" />
                    <span>{colName}</span>
                    <span className="text-[10px] font-mono text-zinc-500 tabular-nums">({count})</span>
                  </button>
                  <button
                    onClick={() => handleDeleteCollection(colName)}
                    title={`Excluir pasta "${colName}"`}
                    className={`p-1 rounded-r-lg text-zinc-500 hover:text-rose-400 transition-colors border-y border-r cursor-pointer ${
                      isSelected ? 'border-rose-500/50 bg-rose-500/10' : 'border-zinc-800 bg-zinc-950/60 hover:bg-zinc-900'
                    }`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}

            <button
              onClick={() => setShowNewCollectionModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-dashed border-zinc-700 hover:border-rose-500/50 text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Criar nova pasta personalizada para organizar obras"
            >
              <Plus className="h-3 w-3 text-rose-400" />
              <span>Nova Pasta</span>
            </button>
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

                {/* Grid / List Layout Switcher */}
                <div className="flex items-center rounded-lg bg-zinc-950 border border-zinc-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => setLibraryViewMode('grid')}
                    className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                      libraryViewMode === 'grid'
                        ? 'bg-zinc-800 text-rose-400 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    title="Visualização em Grade de Capas"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLibraryViewMode('list')}
                    className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                      libraryViewMode === 'list'
                        ? 'bg-zinc-800 text-rose-400 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    title="Visualização em Lista / Tabela Detalhada"
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Batch Select Mode Toggle Button */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !isBatchMode;
                    setIsBatchMode(next);
                    if (!next) setSelectedMangaIds([]);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                    isBatchMode
                      ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-950/40 font-semibold'
                      : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border-zinc-800 hover:text-white'
                  }`}
                  title={isBatchMode ? 'Sair do modo de seleção em lote' : 'Ativar seleção em lote para alterar categorias, pastas ou remover obras'}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span>{isBatchMode ? 'Modo Lote Ativo' : 'Editar em Lote'}</span>
                </button>
              </div>
            </div>

            {/* Batch Controls Strip (Active when isBatchMode is true) */}
            {isBatchMode && (
              <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 text-xs animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-rose-300 flex items-center gap-1.5">
                    <CheckSquare className="h-4 w-4 text-rose-400" />
                    <span>Seleção em Lote:</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 border border-rose-500/30 font-mono text-[11px] font-bold">
                    {selectedMangaIds.length} selecionada(s)
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleSelectAllFiltered}
                    className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    Selecionar Todos ({filteredFavorites.length})
                  </button>
                  {selectedMangaIds.length > 0 && (
                    <button
                      onClick={handleClearBatchSelect}
                      className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      Desmarcar Todos
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsBatchMode(false);
                      setSelectedMangaIds([]);
                    }}
                    className="px-2.5 py-1 rounded bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/40 text-rose-200 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            )}

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
        ) : libraryViewMode === 'list' ? (
          /* Favorites Detailed List / Table View */
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden shadow-xl mb-8">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-950/70 text-zinc-400 font-medium text-[11px]">
                    {isBatchMode && (
                      <th className="py-3 px-3 w-10 text-center">
                        <button
                          type="button"
                          onClick={selectedMangaIds.length === filteredFavorites.length && filteredFavorites.length > 0 ? handleClearBatchSelect : handleSelectAllFiltered}
                          className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                          title={selectedMangaIds.length === filteredFavorites.length ? 'Desmarcar todos' : 'Selecionar todos'}
                        >
                          {selectedMangaIds.length === filteredFavorites.length && filteredFavorites.length > 0 ? (
                            <CheckSquare className="h-4 w-4 text-rose-500" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </th>
                    )}
                    <th className="py-3 px-4">Obra</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Progresso</th>
                    <th className="py-3 px-3">Avaliação</th>
                    <th className="py-3 px-3">Rastreamento</th>
                    <th className="py-3 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {filteredFavorites.map((fav) => {
                    const updateInfo = updatesMap[fav.mangaId];
                    const progress = HistoryService.getProgress(fav.mangaId);
                    const currentCat = fav.userCategory || 'reading';
                    const isSelected = selectedMangaIds.includes(fav.mangaId);

                    return (
                      <tr
                        key={fav.mangaId}
                        onClick={() => isBatchMode ? handleToggleBatchSelect(fav.mangaId) : onSelectManga(fav.mangaId)}
                        className={`group transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-rose-950/25 hover:bg-rose-950/35'
                            : 'hover:bg-zinc-850/50'
                        }`}
                      >
                        {isBatchMode && (
                          <td className="py-3 px-3 text-center" onClick={(e) => { e.stopPropagation(); handleToggleBatchSelect(fav.mangaId); }}>
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-rose-500 inline-block" />
                            ) : (
                              <Square className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 inline-block" />
                            )}
                          </td>
                        )}
                        {/* Cover + Title + Authors */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-14 rounded-lg overflow-hidden bg-zinc-950 shrink-0 border border-zinc-800">
                              <img
                                src={fav.coverUrl}
                                alt={fav.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                loading="lazy"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-zinc-100 group-hover:text-rose-400 transition-colors line-clamp-1">
                                  {fav.title}
                                </span>
                                {updateInfo?.hasNew && (
                                  <span className="shrink-0 px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9px] font-bold font-mono">
                                    Novo c.{updateInfo.latestChapterNumber}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
                                {fav.authors?.join(', ') || 'Autor'}
                              </p>
                              {fav.customCollections && fav.customCollections.length > 0 && (
                                <div className="flex items-center gap-1 mt-1">
                                  {fav.customCollections.slice(0, 2).map(c => (
                                    <span key={c} className="text-[9px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-1.5 py-0.2 rounded font-sans">
                                      📁 {c}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Status Category */}
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={currentCat}
                            onChange={(e) => handleChangeCategory(fav.mangaId, e.target.value as LibraryCategory)}
                            className="bg-zinc-950/80 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-200 focus:outline-none focus:border-rose-500 cursor-pointer"
                          >
                            <option value="reading">Lendo</option>
                            <option value="plan_to_read">Quero Ler</option>
                            <option value="completed">Completo</option>
                            <option value="on_hold">Pausado</option>
                            <option value="dropped">Abandonado</option>
                          </select>
                        </td>

                        {/* Reading Progress */}
                        <td className="py-3 px-3">
                          <div className="font-mono tabular-nums">
                            {progress?.chapterNumber ? (
                              <span className="text-rose-400 font-semibold">
                                Cap. {progress.chapterNumber}
                              </span>
                            ) : (
                              <span className="text-zinc-500">Não iniciado</span>
                            )}
                            {updateInfo?.latestChapterNumber && (
                              <div className="text-[10px] text-zinc-500">
                                Total: {updateInfo.latestChapterNumber}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* User Rating Score */}
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => openScoreModal(e, fav)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-950/80 border border-zinc-800 hover:border-amber-500/50 text-xs text-amber-400 font-mono cursor-pointer"
                          >
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            <span>{fav.userScore ? `${fav.userScore}/10` : 'Avaliar'}</span>
                          </button>
                        </td>

                        {/* External Tracker Badge */}
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <TrackerStatusBadge
                            mangaId={fav.mangaId}
                            mangaTitle={fav.title}
                            size="sm"
                            showLabel={true}
                            onOpenTrackers={(id?: string, title?: string) => {
                              setSelectedTrackerManga({ id: id || fav.mangaId, title: title || fav.title });
                              setShowTrackersModal(true);
                            }}
                          />
                        </td>

                        {/* Quick Actions */}
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setManagingCollectionsManga(fav)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                              title="Gerenciar Categorias (Mihon)"
                            >
                              <Folder className="h-3.5 w-3.5 text-rose-400" />
                            </button>

                            <button
                              onClick={() => handleQuickRead(fav.mangaId)}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                              title="Continuar leitura"
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Ler</span>
                            </button>

                            <button
                              onClick={(e) => handleRemove(e, fav.mangaId)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                              title="Remover dos favoritos"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Favorites Grid */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
            {filteredFavorites.map((fav) => {
              const updateInfo = updatesMap[fav.mangaId];
              const progress = HistoryService.getProgress(fav.mangaId);
              const currentCat = fav.userCategory || 'reading';
              const catMeta = CATEGORY_LABELS[currentCat] || CATEGORY_LABELS.reading;
              const isSelected = selectedMangaIds.includes(fav.mangaId);

              return (
                <div
                  key={fav.mangaId}
                  onClick={isBatchMode ? () => handleToggleBatchSelect(fav.mangaId) : undefined}
                  className={`group relative flex flex-col rounded-xl transition-all ${
                    isBatchMode
                      ? isSelected
                        ? 'ring-2 ring-rose-500 shadow-lg shadow-rose-950/40 bg-rose-950/15 p-1 cursor-pointer'
                        : 'hover:ring-1 hover:ring-zinc-650 cursor-pointer p-1'
                      : ''
                  }`}
                >
                  <div className="relative">
                    {/* Batch Checkbox Indicator */}
                    {isBatchMode && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleBatchSelect(fav.mangaId);
                        }}
                        className="absolute top-2 left-2 z-30 p-1.5 rounded-lg bg-zinc-950/95 border border-zinc-700 shadow-xl backdrop-blur-md cursor-pointer transition-transform hover:scale-110"
                        title={isSelected ? 'Desmarcar obra' : 'Selecionar obra'}
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-rose-500 fill-rose-500/20" />
                        ) : (
                          <Square className="h-4 w-4 text-zinc-400" />
                        )}
                      </button>
                    )}

                    <MangaCard
                      manga={mapFavoriteToManga(fav)}
                      onSelect={isBatchMode ? () => handleToggleBatchSelect(fav.mangaId) : onSelectManga}
                      onQuickRead={isBatchMode ? undefined : handleQuickRead}
                      showTrackerStatus={!isBatchMode}
                      onOpenTrackers={(id, title) => {
                        setSelectedTrackerManga({ id: id || fav.mangaId, title: title || fav.title });
                        setShowTrackersModal(true);
                      }}
                    />
                    
                    {/* Floating New Chapter Badge */}
                    {updateInfo?.hasNew && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          UpdateTrackerService.markMangaUpdateAsSeen(fav.mangaId);
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

                      <div className="flex items-center gap-1">
                        {/* Manage folders icon */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setManagingCollectionsManga(fav);
                          }}
                          title="Gerenciar pastas desta obra"
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            fav.customCollections && fav.customCollections.length > 0
                              ? 'text-rose-400 hover:text-rose-300 bg-rose-500/10'
                              : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
                          }`}
                        >
                          <FolderPlus className="h-3 w-3" />
                        </button>

                        {/* Edit score icon */}
                        <button
                          onClick={(e) => openScoreModal(e, fav)}
                          title="Adicionar nota ou avaliação"
                          className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 cursor-pointer"
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Custom Collection Badges */}
                    {fav.customCollections && fav.customCollections.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 my-0.5">
                        {fav.customCollections.map(col => (
                          <span
                            key={col}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomCollection(col);
                            }}
                            className="px-1.5 py-0.2 rounded text-[9px] bg-zinc-800 text-rose-300 border border-rose-500/20 font-medium truncate max-w-[100px] cursor-pointer hover:border-rose-500/50"
                            title={`Filtrar pela pasta "${col}"`}
                          >
                            📁 {col}
                          </span>
                        ))}
                      </div>
                    )}

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
        {/* Modal for Creating New Custom Collection */}
        {showNewCollectionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl text-zinc-100">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
                <div className="flex items-center gap-2">
                  <Folder className="h-5 w-5 text-rose-500" />
                  <h3 className="text-sm font-bold text-white">Nova Pasta Personalizada</h3>
                </div>
                <button
                  onClick={() => setShowNewCollectionModal(false)}
                  className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateCollection} className="py-4 space-y-3">
                <div>
                  <label className="text-xs text-zinc-300 font-medium block mb-1.5">
                    Nome da Pasta / Coleção
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="Ex: Favoritos do Ano, Obras Curtas, Para Reler..."
                    className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewCollectionModal(false)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!newCollectionName.trim()}
                    className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-950/40 disabled:opacity-50 cursor-pointer"
                  >
                    Criar Pasta
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Mihon-style Category Selection Modal */}
        {managingCollectionsManga && (
          <CategorySelectionModal
            isOpen={Boolean(managingCollectionsManga)}
            onClose={() => setManagingCollectionsManga(null)}
            manga={{
              id: managingCollectionsManga.mangaId,
              title: managingCollectionsManga.title,
              coverUrl: managingCollectionsManga.coverUrl,
              sourceName: managingCollectionsManga.sourceName,
              sourceId: managingCollectionsManga.sourceId,
              rating: managingCollectionsManga.rating,
              authors: managingCollectionsManga.authors,
              genres: managingCollectionsManga.genres,
              status: managingCollectionsManga.status,
            }}
          />
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

        {/* Modal for External Trackers (AniList & MyAnimeList) */}
        <TrackersModal
          isOpen={showTrackersModal}
          onClose={() => {
            setShowTrackersModal(false);
            setSelectedTrackerManga(null);
          }}
          activeMangaId={selectedTrackerManga?.id}
          activeMangaTitle={selectedTrackerManga?.title}
        />

        {/* Floating Bulk Action Bar */}
        {isBatchMode && selectedMangaIds.length > 0 && (
          <aside
            aria-label="Ações em lote para obras selecionadas"
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-2xl bg-zinc-950/95 border border-zinc-700/80 p-3 sm:p-4 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-bottom-5 duration-200"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-xs text-zinc-200 font-medium">
                <strong className="text-white font-mono text-sm">{selectedMangaIds.length}</strong> {selectedMangaIds.length === 1 ? 'obra selecionada' : 'obras selecionadas'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Batch Category Changer */}
              <button
                type="button"
                onClick={() => setShowBatchCategoryModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-200 hover:text-white transition-colors cursor-pointer"
                title="Mover obras selecionadas para outra categoria de status"
              >
                <Tag className="h-3.5 w-3.5 text-rose-400" />
                <span>Alterar Status</span>
              </button>

              {/* Batch Custom Collection / Folder Changer */}
              <button
                type="button"
                onClick={() => setShowBatchCollectionModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-200 hover:text-white transition-colors cursor-pointer"
                title="Adicionar obras selecionadas a uma pasta/coleção personalizada"
              >
                <FolderPlus className="h-3.5 w-3.5 text-sky-400" />
                <span>Adicionar a Pasta</span>
              </button>

              {/* Batch Delete from Favorites */}
              <button
                type="button"
                onClick={() => setShowBatchDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-xs font-semibold text-rose-300 hover:text-white transition-colors cursor-pointer"
                title="Remover obras selecionadas da biblioteca de favoritos"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                <span>Remover</span>
              </button>

              {/* Clear selection */}
              <button
                type="button"
                onClick={handleClearBatchSelect}
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                title="Limpar seleção"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </aside>
        )}

        {/* Modal: Batch Category / Status Change */}
        {showBatchCategoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-rose-400" />
                  <h3 className="text-sm font-bold text-white">
                    Alterar Status em Lote
                  </h3>
                </div>
                <button
                  onClick={() => setShowBatchCategoryModal(false)}
                  className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-zinc-400 mt-3 mb-4">
                Selecione o novo status de leitura para as <strong>{selectedMangaIds.length}</strong> obras selecionadas:
              </p>

              <div className="space-y-2">
                {(Object.keys(CATEGORY_LABELS) as LibraryCategory[]).map((catKey) => {
                  const meta = CATEGORY_LABELS[catKey];
                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => handleApplyBatchCategory(catKey)}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all text-xs cursor-pointer text-left group"
                    >
                      <span className={`font-semibold ${meta.color} group-hover:brightness-110`}>
                        {meta.label}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-zinc-500 group-hover:text-white transition-colors" />
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setShowBatchCategoryModal(false)}
                className="mt-5 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Modal: Batch Custom Collection / Folder Add */}
        {showBatchCollectionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <FolderPlus className="h-4 w-4 text-sky-400" />
                  <h3 className="text-sm font-bold text-white">
                    Adicionar a Pasta em Lote
                  </h3>
                </div>
                <button
                  onClick={() => setShowBatchCollectionModal(false)}
                  className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-zinc-400 mt-3 mb-3">
                Adicione as <strong>{selectedMangaIds.length}</strong> obras selecionadas a uma pasta ou crie uma nova:
              </p>

              {/* Create new collection input */}
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="text"
                  placeholder="Nova pasta (ex: Romance, Fantasia)..."
                  value={batchCollectionTarget}
                  onChange={(e) => setBatchCollectionTarget(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyBatchCollection(batchCollectionTarget);
                    }
                  }}
                  className="flex-1 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  disabled={!batchCollectionTarget.trim()}
                  onClick={() => handleApplyBatchCollection(batchCollectionTarget)}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0"
                >
                  Adicionar
                </button>
              </div>

              {/* Existing Collections List */}
              {customCollections.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  <span className="text-[11px] font-semibold text-zinc-400 block mb-1">
                    Pastas Existentes:
                  </span>
                  {customCollections.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => handleApplyBatchCollection(col)}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800 hover:border-sky-500/40 text-xs text-zinc-200 cursor-pointer transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Folder className="h-3.5 w-3.5 text-sky-400" />
                        <span>{col}</span>
                      </div>
                      <Plus className="h-3.5 w-3.5 text-zinc-500" />
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowBatchCollectionModal(false)}
                className="mt-5 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Modal: Confirm Batch Delete */}
        {showBatchDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-rose-900/40 p-6 shadow-2xl text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 text-rose-400 mb-3">
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <Trash2 className="h-5 w-5 text-rose-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Remover dos Favoritos?
                  </h3>
                  <span className="text-[11px] text-zinc-400">
                    Ação em lote na biblioteca
                  </span>
                </div>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed my-3">
                Tem certeza de que deseja remover <strong>{selectedMangaIds.length}</strong> obra(s) dos seus favoritos? Esta ação desfavoritará as obras selecionadas.
              </p>

              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setShowBatchDeleteConfirm(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBatchRemove}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-950/40 transition-colors cursor-pointer"
                >
                  Sim, Remover {selectedMangaIds.length} Obras
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Backup & Restore Progress with real-time feedback */}
        <BackupProgressModal
          progress={backupProgress}
          onClose={() => setBackupProgress(prev => ({ ...prev, isOpen: false }))}
        />
      </div>
    </div>
  );
};
