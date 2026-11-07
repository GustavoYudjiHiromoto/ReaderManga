import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Cloud,
  Check,
  AlertCircle,
  RefreshCw,
  LogOut,
  Sparkles,
  BookOpen,
  Clock,
  Flame,
  Award,
  Layers,
  Sliders,
  Bookmark,
  HardDriveDownload,
  Download,
  Upload,
  Settings,
  ArrowRight,
  ExternalLink,
  Shield,
  ShieldAlert,
  ChevronRight,
  Eye,
  SlidersHorizontal,
  FolderDown,
  FileSpreadsheet,
  Globe,
  Volume2,
  Smartphone,
  CheckCircle2,
  Boxes
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { HistoryService } from '../services/history.js';
import { AnalyticsService, AnalyticsSummary } from '../services/analyticsService.js';
import { TrackerService, TrackerAccount } from '../services/trackerService.js';
import { TrackerBackgroundService, TrackerBackgroundServiceState } from '../services/trackerBackgroundService.js';
import { OfflineCacheService } from '../services/offlineCache.js';
import { ExtensionService } from '../services/extensionService.js';
import { FavoriteManga, ReadingProgress } from '../types/manga.js';
import { ReadingStatsSummary } from '../components/ReadingStatsSummary.js';
import { TrackersModal } from '../components/TrackersModal.js';
import { PWAInstallButton } from '../components/PWAInstallButton.js';

type ReaderMode = 'webtoon' | 'single' | 'double';
type PageFit = 'width' | 'height' | 'original';
type ReadingDirection = 'rtl' | 'ltr';

interface ProfilePageProps {
  onNavigateToCatalog: () => void;
  onNavigateToSearch: (query?: string, genre?: string) => void;
  onSelectManga: (mangaId: string) => void;
  onReadChapter?: (mangaId: string, chapterId: string) => void;
  onOpenDownloads?: () => void;
  onOpenExtensions?: () => void;
}

type ProfileTab = 'overview' | 'trackers' | 'preferences' | 'data';

export const ProfilePage: React.FC<ProfilePageProps> = ({
  onNavigateToCatalog,
  onNavigateToSearch,
  onSelectManga,
  onReadChapter,
  onOpenDownloads,
  onOpenExtensions
}) => {
  const { user, loading: authLoading, syncStatus, lastSynced, syncError, loginWithGoogle, logout, syncNow } = useAuth();
  
  // Active Profile Section Tab
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');

  // Core App Data States
  const [favorites, setFavorites] = useState<FavoriteManga[]>(() => HistoryService.getFavorites());
  const [history, setHistory] = useState<ReadingProgress[]>(() => HistoryService.getHistory());
  const [bookmarksCount, setBookmarksCount] = useState<number>(() => HistoryService.getPageBookmarks().length);
  const [offlineCount, setOfflineCount] = useState<number>(() => OfflineCacheService.getAllSavedChapters().length);
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary>(() => AnalyticsService.getAnalyticsSummary());
  const [enabledSources, setEnabledSources] = useState<string[]>(() => ExtensionService.getEnabledSourceIds());

  // Tracker Accounts & Background Service States
  const [anilistAccount, setAnilistAccount] = useState<TrackerAccount>(() => TrackerService.getAniListAccount());
  const [malAccount, setMalAccount] = useState<TrackerAccount>(() => TrackerService.getMalAccount());
  const [bgServiceState, setBgServiceState] = useState<TrackerBackgroundServiceState>(() => TrackerBackgroundService.getState());
  const [showTrackersModal, setShowTrackersModal] = useState(false);
  const [isSyncingTrackers, setIsSyncingTrackers] = useState(false);

  // Auth & Cloud Sync manual trigger state
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // File input ref for JSON restore
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreStatus, setRestoreStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Reading & Reader Preferences States (persisted directly to localStorage)
  const [defaultReaderMode, setDefaultReaderMode] = useState<ReaderMode>(() => {
    try {
      return (localStorage.getItem('mr_reader_mode') as ReaderMode) || 'webtoon';
    } catch {
      return 'webtoon';
    }
  });

  const [defaultPageFit, setDefaultPageFit] = useState<PageFit>(() => {
    try {
      return (localStorage.getItem('mr_reader_page_fit') as PageFit) || 'width';
    } catch {
      return 'width';
    }
  });

  const [defaultReadingDirection, setDefaultReadingDirection] = useState<ReadingDirection>(() => {
    try {
      return (localStorage.getItem('mr_reader_direction') as ReadingDirection) || 'rtl';
    } catch {
      return 'rtl';
    }
  });

  const [defaultContinuousScroll, setDefaultContinuousScroll] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mr_reader_continuous_scroll') !== 'false';
    } catch {
      return true;
    }
  });

  const [defaultSafeSearch, setDefaultSafeSearch] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mr_default_safe_search') !== 'false';
    } catch {
      return true;
    }
  });

  const [preferredLanguage, setPreferredLanguage] = useState<string>(() => {
    try {
      return localStorage.getItem('mr_preferred_language') || 'pt-br,en';
    } catch {
      return 'pt-br,en';
    }
  });

  const [volumeNav, setVolumeNav] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mr_reader_volume_nav') !== 'false';
    } catch {
      return true;
    }
  });

  const [saveToast, setSaveToast] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 3000);
  };

  // Subscriptions to live changes
  useEffect(() => {
    const unsubHistory = HistoryService.subscribe(() => {
      setFavorites(HistoryService.getFavorites());
      setHistory(HistoryService.getHistory());
      setBookmarksCount(HistoryService.getPageBookmarks().length);
      setAnalyticsSummary(AnalyticsService.getAnalyticsSummary());
    });

    const unsubTrackers = TrackerService.subscribe(() => {
      setAnilistAccount(TrackerService.getAniListAccount());
      setMalAccount(TrackerService.getMalAccount());
    });

    const unsubBgTrackers = TrackerBackgroundService.subscribe(() => {
      setBgServiceState(TrackerBackgroundService.getState());
    });

    const unsubOffline = OfflineCacheService.subscribe(() => {
      setOfflineCount(OfflineCacheService.getAllSavedChapters().length);
    });

    const unsubExtensions = ExtensionService.subscribe(() => {
      setEnabledSources(ExtensionService.getEnabledSourceIds());
    });

    return () => {
      unsubHistory();
      unsubTrackers();
      unsubBgTrackers();
      unsubOffline();
      unsubExtensions();
    };
  }, []);

  // Update preferences helper
  const handleUpdatePreference = <T,>(key: string, value: T, setter: (val: T) => void, label: string) => {
    setter(value);
    try {
      localStorage.setItem(key, String(value));
      triggerToast(`Preferência atualizada: ${label}`);
    } catch (e) {
      console.warn('Failed to save preference to localStorage', e);
    }
  };

  // Google Sync handler
  const handleCloudSync = async () => {
    try {
      setIsSyncingCloud(true);
      await syncNow();
      triggerToast('Sincronização em nuvem concluída com sucesso!');
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setIsSyncingCloud(false), 500);
    }
  };

  const handleLogin = async () => {
    try {
      setIsLoggingIn(true);
      await loginWithGoogle();
      triggerToast('Login com Google realizado com sucesso!');
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Tracker Background Sync Now trigger
  const handleManualTrackerSync = async () => {
    try {
      setIsSyncingTrackers(true);
      await TrackerBackgroundService.syncAllPending(true);
      triggerToast('Progresso verificado e sincronizado com os trackers!');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncingTrackers(false);
    }
  };

  // File restore handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const result = HistoryService.importBackup(content);
      if (result.success) {
        setRestoreStatus({
          type: 'success',
          message: `Backup restaurado! ${result.favoritesAdded} favoritos e ${result.historyAdded} históricos carregados.`
        });
      } else {
        setRestoreStatus({
          type: 'error',
          message: result.message || 'Erro ao processar o arquivo de backup.'
        });
      }
      setTimeout(() => setRestoreStatus(null), 5000);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Library status counts
  const readingCount = favorites.filter(f => f.userCategory === 'reading').length;
  const completedCount = favorites.filter(f => f.userCategory === 'completed').length;
  const planToReadCount = favorites.filter(f => f.userCategory === 'plan_to_read').length;

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Ainda não sincronizado';
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 10) return 'Agora mesmo';
    if (diffSec < 60) return `Há ${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Há ${diffMin} min`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-24 font-sans">
      {/* Toast Notification */}
      {saveToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 border border-emerald-500/40 text-emerald-300 text-xs shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* Hero Profile Banner */}
      <div className="border-b border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 via-zinc-950 to-zinc-950 pt-10 pb-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* User Identity info */}
            <div className="flex items-center gap-4 sm:gap-5">
              <div className="relative">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Avatar'}
                    className="h-20 w-20 rounded-2xl object-cover border-2 border-zinc-700/80 shadow-xl shadow-black/50"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-2xl bg-gradient-to-tr from-rose-600 to-rose-400 text-white border-2 border-rose-400/40 flex items-center justify-center font-serif text-2xl font-bold shadow-xl shadow-rose-950/40">
                    {user?.displayName ? user.displayName.slice(0, 1).toUpperCase() : user?.email?.slice(0, 1).toUpperCase() || <User className="h-9 w-9" />}
                  </div>
                )}

                {/* Cloud indicator dot */}
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-950 border-2 border-zinc-900">
                  {syncStatus === 'syncing' || isSyncingCloud ? (
                    <RefreshCw className="h-3 w-3 animate-spin text-blue-400" />
                  ) : user ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
                  )}
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    {user?.displayName || 'Leitor MangaReader'}
                  </h1>
                  {user && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-medium font-mono">
                      Google Cloud
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-400 flex items-center gap-2">
                  <span>{user?.email || 'Modo Visitante Local (Dados salvos neste navegador)'}</span>
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  {user ? (
                    <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                      <Cloud className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Sincronizado: <strong className="text-zinc-200 font-mono">{formatLastSync(lastSynced)}</strong></span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-zinc-500 text-[11px]">
                      <Cloud className="h-3.5 w-3.5 text-zinc-600" />
                      <span>Conecte o Google para salvar sua biblioteca na nuvem</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions (Cloud Sync & Google Auth) */}
            <div className="flex flex-wrap items-center gap-2.5">
              {user ? (
                <>
                  <button
                    onClick={handleCloudSync}
                    disabled={isSyncingCloud || syncStatus === 'syncing'}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-750 border border-zinc-700/80 transition-all cursor-pointer shadow-md disabled:opacity-50"
                    title="Forçar sincronização de favoritos e histórico com o Firestore"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncingCloud || syncStatus === 'syncing' ? 'animate-spin text-rose-400' : 'text-zinc-400'}`} />
                    <span>{isSyncingCloud || syncStatus === 'syncing' ? 'Sincronizando...' : 'Sincronizar Nuvem'}</span>
                  </button>

                  <button
                    onClick={async () => {
                      await logout();
                      triggerToast('Conta desconectada.');
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors cursor-pointer"
                    title="Desconectar da conta Google"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sair</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-all cursor-pointer shadow-lg shadow-rose-950/40 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isLoggingIn ? (
                    <RefreshCw className="h-4 w-4 animate-spin text-white" />
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path fill="#ffffff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#ffffff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#ffffff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#ffffff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                  )}
                  <span>Entrar com o Google</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
            <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Biblioteca</span>
                <BookOpen className="h-4 w-4 text-rose-400" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono text-white tabular-nums">{favorites.length}</span>
                <span className="text-[11px] text-zinc-500 font-sans">obras</span>
              </div>
              <div className="mt-1 text-[10px] text-zinc-500 truncate">
                {readingCount} lendo • {completedCount} completos
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Capítulos Lidos</span>
                <Check className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono text-white tabular-nums">{history.length}</span>
                <span className="text-[11px] text-zinc-500 font-sans">concluídos</span>
              </div>
              <div className="mt-1 text-[10px] text-zinc-500 truncate">
                Progresso em tempo real
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Tempo de Leitura</span>
                <Clock className="h-4 w-4 text-amber-400" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono text-white tabular-nums">
                  {analyticsSummary.totalHours30d > 0 ? analyticsSummary.totalHours30d : (history.length * 0.15).toFixed(1)}h
                </span>
                <span className="text-[11px] text-zinc-500 font-sans">estimadas</span>
              </div>
              <div className="mt-1 text-[10px] text-zinc-500 truncate">
                Últimos 30 dias
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Ofensiva de Leitura</span>
                <Flame className="h-4 w-4 text-rose-500" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono text-white tabular-nums">
                  {analyticsSummary.readingStreakDays > 0 ? analyticsSummary.readingStreakDays : (history.length > 0 ? 1 : 0)}
                </span>
                <span className="text-[11px] text-zinc-500 font-sans">dia(s)</span>
              </div>
              <div className="mt-1 text-[10px] text-zinc-500 truncate">
                {analyticsSummary.readingStreakDays > 1 ? 'Sequência ativa!' : 'Leia hoje para manter'}
              </div>
            </div>
          </div>

          {/* Section Navigation Tabs */}
          <div className="flex items-center gap-2 mt-8 border-b border-zinc-800 overflow-x-auto no-scrollbar pb-px text-xs font-medium">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'border-rose-500 text-rose-400 font-semibold'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Estatísticas & Analytics</span>
            </button>

            <button
              onClick={() => setActiveTab('trackers')}
              className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'trackers'
                  ? 'border-rose-500 text-rose-400 font-semibold'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>AniList & MyAnimeList</span>
              {(anilistAccount.connected || malAccount.connected) && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('preferences')}
              className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'preferences'
                  ? 'border-rose-500 text-rose-400 font-semibold'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Preferências de Leitura</span>
            </button>

            <button
              onClick={() => setActiveTab('data')}
              className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'data'
                  ? 'border-rose-500 text-rose-400 font-semibold'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Backups & Armazenamento</span>
            </button>
          </div>

        </div>
      </div>

      {/* Main Content Sections Container */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-8">

        {/* TAB 1: OVERVIEW & READING ANALYTICS */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-150">
            {/* Complete Reading Stats Summary & Analytics Dashboard */}
            <ReadingStatsSummary
              favoritesCount={favorites.length}
              onExploreGenre={(g) => onNavigateToSearch(undefined, g)}
              defaultOpenAnalytics={true}
            />

            {/* Recently Read Mangas Shelf */}
            {history.length > 0 && (
              <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-rose-400" />
                    <h3 className="text-sm font-semibold text-zinc-100">Mangás Lidos Recentemente</h3>
                  </div>
                  <span className="text-xs text-zinc-500 font-mono">{history.length} capítulos registrados</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {history.slice(0, 6).map((prog) => (
                    <div
                      key={prog.mangaId}
                      className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/70 border border-zinc-850 hover:border-zinc-700 transition-all group"
                    >
                      <div
                        onClick={() => onSelectManga(prog.mangaId)}
                        className="min-w-0 flex-1 cursor-pointer"
                      >
                        <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-rose-400 truncate transition-colors">
                          {prog.mangaTitle || 'Obra sem título'}
                        </h4>
                        <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                          Capítulo {prog.chapterNumber || prog.chapterId}
                        </p>
                      </div>

                      {onReadChapter && (
                        <button
                          onClick={() => onReadChapter(prog.mangaId, prog.chapterId)}
                          className="ml-2 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-rose-600 text-zinc-300 hover:text-white text-[11px] font-medium transition-colors cursor-pointer shrink-0"
                          title="Continuar leitura deste capítulo"
                        >
                          Ler
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TRACKERS (ANILIST & MYANIMELIST) */}
        {activeTab === 'trackers' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Header info */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-850">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sliders className="h-5 w-5 text-sky-400" />
                    Rastreamento de Progresso Externo
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Vincule suas contas de catálogo para sincronizar capítulos lidos automaticamente enquanto aproveita suas leituras.
                  </p>
                </div>

                <button
                  onClick={() => setShowTrackersModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md shadow-sky-950/40 transition-all cursor-pointer shrink-0"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Gerenciar Contas & Vínculos</span>
                </button>
              </div>

              {/* Service Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                {/* AniList Card */}
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/90 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-[#02A9FF]/15 border border-[#02A9FF]/30 flex items-center justify-center font-bold text-[#02A9FF] text-xs">
                        AL
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-zinc-100">AniList</h4>
                        <span className="text-[10px] text-zinc-500">API GraphQL</span>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium font-mono ${
                      anilistAccount.connected
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {anilistAccount.connected ? 'Conectado' : 'Desconectado'}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-400">
                    {anilistAccount.connected ? (
                      <div className="space-y-1">
                        <p>Usuário: <strong className="text-zinc-200">@{anilistAccount.username || 'usuário'}</strong></p>
                        <p className="text-[11px] text-zinc-500">Auto-scrobble: {anilistAccount.autoScrobble ? 'Ativado' : 'Desativado'}</p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-500">
                        Insira seu token pessoal do AniList para atualizar seu status de leitura automaticamente.
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-zinc-850 flex items-center justify-between">
                    <button
                      onClick={() => setShowTrackersModal(true)}
                      className="text-xs text-sky-400 hover:text-sky-300 transition-colors cursor-pointer font-medium"
                    >
                      {anilistAccount.connected ? 'Configurações de Vínculo' : 'Conectar ao AniList'}
                    </button>
                    {anilistAccount.connected && (
                      <button
                        onClick={() => {
                          TrackerService.disconnectAniList();
                          triggerToast('AniList desconectado.');
                        }}
                        className="text-xs text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                      >
                        Desconectar
                      </button>
                    )}
                  </div>
                </div>

                {/* MyAnimeList Card */}
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/90 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-[#2E51A2]/15 border border-[#2E51A2]/30 flex items-center justify-center font-bold text-[#2E51A2] text-xs">
                        MAL
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-zinc-100">MyAnimeList</h4>
                        <span className="text-[10px] text-zinc-500">OAuth2 REST API</span>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium font-mono ${
                      malAccount.connected
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {malAccount.connected ? 'Conectado' : 'Desconectado'}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-400">
                    {malAccount.connected ? (
                      <div className="space-y-1">
                        <p>Usuário: <strong className="text-zinc-200">@{malAccount.username || 'usuário'}</strong></p>
                        <p className="text-[11px] text-zinc-500">Auto-scrobble: {malAccount.autoScrobble ? 'Ativado' : 'Desativado'}</p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-500">
                        Vincule sua conta do MyAnimeList para sincronizar seus volumes e capítulos lidos.
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-zinc-850 flex items-center justify-between">
                    <button
                      onClick={() => setShowTrackersModal(true)}
                      className="text-xs text-sky-400 hover:text-sky-300 transition-colors cursor-pointer font-medium"
                    >
                      {malAccount.connected ? 'Configurações de Vínculo' : 'Conectar ao MAL'}
                    </button>
                    {malAccount.connected && (
                      <button
                        onClick={() => {
                          TrackerService.disconnectMal();
                          triggerToast('MyAnimeList desconectado.');
                        }}
                        className="text-xs text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                      >
                        Desconectar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Background Sync Worker Settings */}
              <div className="mt-6 pt-5 border-t border-zinc-850">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-200">Sincronizador em Segundo Plano:</span>
                      <span className={`px-2 py-0.2 rounded-full text-[10px] font-mono ${
                        bgServiceState.isEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        {bgServiceState.isEnabled ? 'Ativo' : 'Pausado'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Verifica periodicamente o histórico local e envia o progresso para o AniList e MAL sem atrasos.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        const next = !bgServiceState.isEnabled;
                        TrackerBackgroundService.setEnabled(next);
                        triggerToast(next ? 'Sincronizador em segundo plano ativado' : 'Sincronizador em segundo plano pausado');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                        bgServiceState.isEnabled
                          ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                          : 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500'
                      }`}
                    >
                      {bgServiceState.isEnabled ? 'Pausar Serviço' : 'Ativar Serviço'}
                    </button>

                    <button
                      onClick={handleManualTrackerSync}
                      disabled={isSyncingTrackers || bgServiceState.isSyncing}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-all cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${isSyncingTrackers || bgServiceState.isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncingTrackers || bgServiceState.isSyncing ? 'Verificando...' : 'Sincronizar Agora'}</span>
                    </button>
                  </div>
                </div>

                {/* Last sync telemetry box */}
                {bgServiceState.lastSyncStats && (
                  <div className="mt-4 p-3 rounded-xl bg-zinc-950/50 border border-zinc-850 text-xs text-zinc-400 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500">Última checagem em segundo plano:</span>
                      <span className="font-mono text-zinc-300">
                        {new Date(bgServiceState.lastSyncStats.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
                      <span>Checados: <strong className="text-zinc-200">{bgServiceState.lastSyncStats.totalChecked}</strong></span>
                      <span>Atualizados: <strong className="text-emerald-400">{bgServiceState.lastSyncStats.syncedCount}</strong></span>
                      <span>Em dia: <strong className="text-zinc-400">{bgServiceState.lastSyncStats.alreadySyncedCount}</strong></span>
                      {bgServiceState.lastSyncStats.errorsCount > 0 && (
                        <span>Falhas: <strong className="text-rose-400">{bgServiceState.lastSyncStats.errorsCount}</strong></span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: READING & SEARCH PREFERENCES */}
        {activeTab === 'preferences' && (
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-6 animate-in fade-in duration-150">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="h-5 w-5 text-rose-400" />
                Preferências Padrão do Leitor
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Configure como as páginas de mangá devem abrir automaticamente ao iniciar uma nova leitura.
              </p>
            </div>

            {/* 1. Modo de Leitura */}
            <div className="space-y-2 pt-4 border-t border-zinc-850">
              <label className="text-xs font-semibold text-zinc-200 block">Modo Padrão de Exibição:</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { id: 'webtoon', label: 'Cascata Vertical (Webtoon)', desc: 'Leitura contínua em coluna, ideal para manhwas e mobile' },
                  { id: 'single', label: 'Página Única', desc: 'Uma página por vez com controles laterais de avanço' },
                  { id: 'double', label: 'Página Dupla', desc: 'Duas páginas lado a lado simulando livro aberto' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleUpdatePreference('mr_reader_mode', item.id as ReaderMode, setDefaultReaderMode, item.label)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      defaultReaderMode === item.id
                        ? 'bg-rose-500/15 border-rose-500/60 text-white shadow-md shadow-rose-950/20'
                        : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-semibold text-xs flex items-center justify-between">
                      <span>{item.label}</span>
                      {defaultReaderMode === item.id && <Check className="h-3.5 w-3.5 text-rose-400" />}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Direção de Leitura & Ajuste de Imagem */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-zinc-850">
              {/* Direção */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-200 block">Direção Padrão de Virada de Página:</label>
                <div className="flex items-center gap-2 text-xs">
                  {[
                    { id: 'rtl', label: 'Direita para Esquerda (Mangá)' },
                    { id: 'ltr', label: 'Esquerda para Direita (Ocidental)' }
                  ].map((d) => (
                    <button
                      key={d.id}
                      onClick={() => handleUpdatePreference('mr_reader_direction', d.id as ReadingDirection, setDefaultReadingDirection, d.label)}
                      className={`flex-1 p-2.5 rounded-xl border transition-all text-center cursor-pointer ${
                        defaultReadingDirection === d.id
                          ? 'bg-rose-500/15 border-rose-500/50 text-rose-300 font-semibold'
                          : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ajuste de Imagem */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-200 block">Ajuste de Imagem:</label>
                <div className="flex items-center gap-2 text-xs">
                  {[
                    { id: 'width', label: 'Ajustar Largura' },
                    { id: 'height', label: 'Ajustar Altura' },
                    { id: 'original', label: 'Original' }
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => handleUpdatePreference('mr_reader_page_fit', f.id as PageFit, setDefaultPageFit, f.label)}
                      className={`flex-1 p-2.5 rounded-xl border transition-all text-center cursor-pointer ${
                        defaultPageFit === f.id
                          ? 'bg-rose-500/15 border-rose-500/50 text-rose-300 font-semibold'
                          : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Idioma Preferido dos Capítulos */}
            <div className="pt-4 border-t border-zinc-850 space-y-2">
              <label className="text-xs font-semibold text-zinc-200 block flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-rose-400" />
                <span>Idioma Preferido dos Capítulos:</span>
              </label>
              <p className="text-[11px] text-zinc-400">
                Filtra automaticamente as listas de capítulos nos detalhes das obras e no leitor. Se uma obra não possuir capítulos no seu idioma preferido, todas as línguas serão exibidas como fallback.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs pt-1">
                {[
                  { id: 'pt-br,en', label: 'PT-BR + Inglês', tag: 'Recomendado', desc: 'Prioriza português e mantém scans em inglês disponíveis' },
                  { id: 'pt-br', label: 'Apenas Português', tag: 'PT-BR', desc: 'Filtra exclusivamente traduções em português brasileiro' },
                  { id: 'en', label: 'Apenas Inglês', tag: 'EN', desc: 'Filtra apenas capítulos e scans em inglês' },
                  { id: 'all', label: 'Todos os Idiomas', tag: 'Global', desc: 'Exibe capítulos em qualquer idioma disponível' }
                ].map((l) => (
                  <button
                    key={l.id}
                    onClick={() => handleUpdatePreference('mr_preferred_language', l.id, setPreferredLanguage, l.label)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      preferredLanguage === l.id
                        ? 'bg-rose-500/15 border-rose-500/60 text-white shadow-sm shadow-rose-950/20'
                        : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold text-xs mb-1">
                      <span>{l.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                        preferredLanguage === l.id ? 'bg-rose-500 text-white' : 'bg-zinc-850 text-zinc-400'
                      }`}>
                        {l.tag}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500">{l.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Navegação por Teclas de Volume no Celular */}
            <div className="pt-4 border-t border-zinc-850 space-y-2">
              <label className="text-xs font-semibold text-zinc-200 block flex items-center gap-1.5">
                <Volume2 className="h-4 w-4 text-sky-400" />
                <span>Navegação por Teclas de Volume (Mobile):</span>
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800 gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                    <Smartphone className="h-4 w-4 text-sky-400" />
                    <span>Virar páginas com botões de volume físicos</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 max-w-xl">
                    No celular ou tablet, use os botões de <strong>Aumentar Volume</strong> (voltar página/rolar para cima) e <strong>Diminuir Volume</strong> (avançar página/rolar para baixo) para ler sem precisar encostar na tela.
                  </p>
                </div>

                <button
                  onClick={() => {
                    const next = !volumeNav;
                    handleUpdatePreference('mr_reader_volume_nav', next, setVolumeNav, next ? 'Teclas de Volume Ativadas' : 'Teclas de Volume Desativadas');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border self-start sm:self-center shrink-0 ${
                    volumeNav
                      ? 'bg-sky-950/40 text-sky-300 border-sky-600/40'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-700'
                  }`}
                >
                  {volumeNav ? 'Ativado (Volume Nav)' : 'Desativado'}
                </button>
              </div>
            </div>

            {/* 5. Safe Search & Filtro de Conteúdo Adulto */}
            <div className="pt-4 border-t border-zinc-850 space-y-2">
              <label className="text-xs font-semibold text-zinc-200 block">Filtro de Pesquisa e Conteúdo:</label>
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                    {defaultSafeSearch ? (
                      <Shield className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-rose-400" />
                    )}
                    <span>Filtro Seguro de Conteúdo Adulto (+18)</span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    {defaultSafeSearch
                      ? 'Obras com conteúdo adulto/hentai são ocultadas por padrão nas buscas do catálogo.'
                      : 'Obras com classificação adulta (+18) serão exibidas normalmente nos resultados de busca.'}
                  </p>
                </div>

                <button
                  onClick={() => {
                    const next = !defaultSafeSearch;
                    handleUpdatePreference('mr_default_safe_search', next, setDefaultSafeSearch, next ? 'Filtro +18 Ativo' : 'Filtro +18 Desativado');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                    defaultSafeSearch
                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-600/40'
                      : 'bg-rose-950/40 text-rose-300 border-rose-600/50'
                  }`}
                >
                  {defaultSafeSearch ? 'Ativado (Seguro)' : 'Desativado (Exibindo +18)'}
                </button>
              </div>
            </div>

            {/* 6. PWA Installation & App Nativo */}
            <div className="pt-4 border-t border-zinc-850 space-y-2">
              <label className="text-xs font-semibold text-zinc-200 block flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-rose-400" />
                <span>Aplicativo Nativo (Instalação PWA):</span>
              </label>
              <div className="p-4 rounded-xl bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-zinc-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-white">Instalar MangaReader no Dispositivo</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40">
                      PWA Offline
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 max-w-xl">
                    Instale como aplicativo nativo no Android, iOS, Windows ou macOS. Funciona em tela cheia imersiva sem as barras do navegador, com suporte a cache de capítulos offline e inicialização instantânea.
                  </p>
                </div>

                <div className="shrink-0">
                  <PWAInstallButton />
                </div>
              </div>
            </div>

            {/* 7. Extensões & Repositórios de Mangá */}
            <div className="pt-4 border-t border-zinc-850 space-y-2">
              <label className="text-xs font-semibold text-zinc-200 block flex items-center gap-1.5">
                <Boxes className="h-4 w-4 text-rose-400" />
                <span>Extensões & Repositórios Ativos:</span>
              </label>
              <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-white">Fontes Federadas ({enabledSources.length}/6 ativas)</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Multi-repositório
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 max-w-xl">
                    Configure a ordem de prioridade de busca, ative ou desative extensões (MangaDex, Comick, WeebCentral, MangaPill, MangaFire, MangaBall) e teste a latência de rede das fontes.
                  </p>
                </div>

                <button
                  onClick={() => {
                    if (onOpenExtensions) {
                      onOpenExtensions();
                    } else {
                      window.dispatchEvent(new CustomEvent('open-extensions-modal'));
                    }
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-950/40 transition-all cursor-pointer shrink-0"
                >
                  <Boxes className="h-3.5 w-3.5" />
                  <span>Gerenciar Extensões</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: BACKUPS, MIHON & OFFLINE STORAGE */}
        {activeTab === 'data' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Hidden file input for restore */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json,application/json"
              className="hidden"
            />

            {/* Restore notification banner */}
            {restoreStatus && (
              <div className={`p-4 rounded-xl border text-xs flex items-center gap-2 ${
                restoreStatus.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
              }`}>
                {restoreStatus.type === 'success' ? <Check className="h-4 w-4 text-emerald-400" /> : <AlertCircle className="h-4 w-4 text-rose-400" />}
                <span>{restoreStatus.message}</span>
              </div>
            )}

            {/* Backups & Portability Card */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-6">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FolderDown className="h-5 w-5 text-rose-400" />
                  Backup e Portabilidade da Biblioteca
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Exporte seus favoritos, notas, histórico e marcadores para um arquivo ou restaure um backup anterior.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Export JSON */}
                <button
                  onClick={() => {
                    HistoryService.downloadBackupFile();
                    triggerToast('Arquivo JSON gerado e baixado!');
                  }}
                  className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800 hover:border-zinc-700 text-left transition-all cursor-pointer group"
                >
                  <div className="p-2 w-fit rounded-lg bg-rose-500/10 text-rose-400 mb-2 group-hover:scale-105 transition-transform">
                    <Download className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-bold text-zinc-100">Exportar Backup JSON</h4>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Arquivo oficial com todos os favoritos, categorias, histórico e notas de páginas.
                  </p>
                </button>

                {/* Export Mihon / Tachiyomi */}
                <button
                  onClick={() => {
                    HistoryService.downloadTachiyomiBackupFile();
                    triggerToast('Arquivo de migração Tachiyomi/Mihon baixado!');
                  }}
                  className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800 hover:border-zinc-700 text-left transition-all cursor-pointer group"
                >
                  <div className="p-2 w-fit rounded-lg bg-sky-500/10 text-sky-400 mb-2 group-hover:scale-105 transition-transform">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-bold text-zinc-100">Tachiyomi / Mihon</h4>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Migre sua lista para aplicativos Android compatíveis com formato padrão.
                  </p>
                </button>

                {/* Restore Backup */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800 hover:border-zinc-700 text-left transition-all cursor-pointer group"
                >
                  <div className="p-2 w-fit rounded-lg bg-emerald-500/10 text-emerald-400 mb-2 group-hover:scale-105 transition-transform">
                    <Upload className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-bold text-zinc-100">Restaurar Backup</h4>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Carregue um arquivo JSON gerado anteriormente para restaurar sua biblioteca.
                  </p>
                </button>
              </div>
            </div>

            {/* Offline Storage Card */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-850">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <HardDriveDownload className="h-5 w-5 text-emerald-400" />
                    Armazenamento Local & Offline
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Capítulos salvos para leitura sem conexão com a internet através do cache do navegador.
                  </p>
                </div>

                {onOpenDownloads && (
                  <button
                    onClick={onOpenDownloads}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-white text-xs font-semibold border border-zinc-700 transition-colors cursor-pointer shrink-0"
                  >
                    <span>Gerenciar Downloads ({offlineCount})</span>
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                  </button>
                )}
              </div>

              <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-850 flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <span className="text-zinc-300 font-medium">Capítulos Baixados em Cache:</span>
                  <p className="text-[11px] text-zinc-500">
                    {offlineCount > 0
                      ? `${offlineCount} capítulo(s) disponível(is) para leitura totalmente offline.`
                      : 'Nenhum capítulo salvo offline no momento.'}
                  </p>
                </div>

                <span className="text-base font-bold font-mono text-emerald-400 tabular-nums">
                  {offlineCount}
                </span>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Trackers Modal if user wants granular matching */}
      {showTrackersModal && (
        <TrackersModal
          isOpen={showTrackersModal}
          onClose={() => setShowTrackersModal(false)}
        />
      )}
    </div>
  );
};
