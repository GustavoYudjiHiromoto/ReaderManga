import { TrackerService, TrackerMediaMapping } from './trackerService.js';
import { HistoryService } from './history.js';
import { FavoriteManga, ReadingProgress } from '../types/manga.js';

const BG_TRACKER_SYNC_ENABLED_KEY = 'manga_reader_bg_tracker_sync_enabled';
const BG_TRACKER_SYNC_INTERVAL_KEY = 'manga_reader_bg_tracker_sync_interval_mins';
const BG_TRACKER_LAST_SYNC_KEY = 'manga_reader_bg_tracker_last_sync_info';

export interface TrackerSyncStats {
  timestamp: number;
  totalChecked: number;
  syncedCount: number;
  errorsCount: number;
  alreadySyncedCount: number;
  details: string[];
}

export interface TrackerBackgroundServiceState {
  isSyncing: boolean;
  isEnabled: boolean;
  intervalMinutes: number;
  lastSyncStats: TrackerSyncStats | null;
  lastSyncTimestamp: number | null;
  currentSyncMangaTitle: string | null;
}

type TrackerBackgroundListener = () => void;
const listeners = new Set<TrackerBackgroundListener>();

function notifyListeners() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.warn('Tracker background sync listener error', e);
    }
  });
}

let isSyncing = false;
let currentSyncMangaTitle: string | null = null;
let bgTimerId: any = null;
let debounceTimerId: any = null;

function loadStoredStats(): TrackerSyncStats | null {
  try {
    const raw = localStorage.getItem(BG_TRACKER_LAST_SYNC_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadStoredEnabled(): boolean {
  try {
    const raw = localStorage.getItem(BG_TRACKER_SYNC_ENABLED_KEY);
    return raw !== null ? JSON.parse(raw) : true;
  } catch {
    return true;
  }
}

function loadStoredInterval(): number {
  try {
    const raw = localStorage.getItem(BG_TRACKER_SYNC_INTERVAL_KEY);
    const parsed = raw ? parseInt(raw, 10) : 5;
    return isNaN(parsed) || parsed < 1 ? 5 : parsed;
  } catch {
    return 5;
  }
}

export const TrackerBackgroundService = {
  subscribe(listener: TrackerBackgroundListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getState(): TrackerBackgroundServiceState {
    const stats = loadStoredStats();
    return {
      isSyncing,
      isEnabled: loadStoredEnabled(),
      intervalMinutes: loadStoredInterval(),
      lastSyncStats: stats,
      lastSyncTimestamp: stats?.timestamp || null,
      currentSyncMangaTitle
    };
  },

  setEnabled(enabled: boolean): void {
    try {
      localStorage.setItem(BG_TRACKER_SYNC_ENABLED_KEY, JSON.stringify(enabled));
      notifyListeners();
      if (enabled) {
        this.restartTimer();
      } else if (bgTimerId) {
        clearInterval(bgTimerId);
        bgTimerId = null;
      }
    } catch (e) {
      console.warn('Failed to save background sync enabled flag', e);
    }
  },

  setIntervalMinutes(mins: number): void {
    const safeMins = Math.max(1, Math.min(60, Math.round(mins)));
    try {
      localStorage.setItem(BG_TRACKER_SYNC_INTERVAL_KEY, JSON.stringify(safeMins));
      notifyListeners();
      this.restartTimer();
    } catch (e) {
      console.warn('Failed to save background sync interval', e);
    }
  },

  restartTimer(): void {
    if (bgTimerId) {
      clearInterval(bgTimerId);
      bgTimerId = null;
    }
    const enabled = loadStoredEnabled();
    if (!enabled || typeof window === 'undefined') return;

    const intervalMs = loadStoredInterval() * 60 * 1000;
    bgTimerId = setInterval(() => {
      this.syncAllPending(false).catch(() => {});
    }, intervalMs);
  },

  /**
   * Performs reconciliation across all local reading progress and library items.
   * Compares the latest local chapter/status with AniList and MyAnimeList mappings
   * and dispatches updates for any manga that is out-of-date or in error state.
   */
  async syncAllPending(force = false): Promise<TrackerSyncStats> {
    if (isSyncing) {
      const stats = loadStoredStats() || {
        timestamp: Date.now(),
        totalChecked: 0,
        syncedCount: 0,
        errorsCount: 0,
        alreadySyncedCount: 0,
        details: ['Sincronização já em execução.']
      };
      return stats;
    }

    const anilistAcc = TrackerService.getAniListAccount();
    const malAcc = TrackerService.getMalAccount();

    if (!anilistAcc.connected && !malAcc.connected) {
      const emptyStats: TrackerSyncStats = {
        timestamp: Date.now(),
        totalChecked: 0,
        syncedCount: 0,
        errorsCount: 0,
        alreadySyncedCount: 0,
        details: ['Nenhuma conta externa conectada (AniList/MAL).']
      };
      return emptyStats;
    }

    isSyncing = true;
    notifyListeners();

    const stats: TrackerSyncStats = {
      timestamp: Date.now(),
      totalChecked: 0,
      syncedCount: 0,
      errorsCount: 0,
      alreadySyncedCount: 0,
      details: []
    };

    try {
      // 1. Gather all candidates (history items, favorites, and existing mappings)
      const mappings = TrackerService.getMappings();
      const history = HistoryService.getHistory();
      const favorites = HistoryService.getFavorites();

      interface CandidateManga {
        mangaId: string;
        title: string;
        chapterNumber?: string;
        category?: any;
        score?: number;
      }

      const candidateMap = new Map<string, CandidateManga>();

      // Load mapped mangas
      Object.entries(mappings).forEach(([mId, mapping]) => {
        if (mapping.anilistId || mapping.malId) {
          candidateMap.set(mId, {
            mangaId: mId,
            title: mapping.anilistTitle || mapping.malTitle || mId,
            chapterNumber: mapping.lastScrobbledChapter
          });
        }
      });

      // Augment from history
      history.forEach((h: ReadingProgress) => {
        if (!h.mangaId) return;
        const existing = candidateMap.get(h.mangaId);
        const candidateChapter = h.chapterNumber;
        if (existing) {
          existing.title = existing.title || h.mangaTitle;
          const currNum = parseFloat(existing.chapterNumber || '0');
          const nextNum = parseFloat(candidateChapter || '0');
          if (nextNum > currNum) {
            existing.chapterNumber = candidateChapter;
          }
        } else {
          candidateMap.set(h.mangaId, {
            mangaId: h.mangaId,
            title: h.mangaTitle,
            chapterNumber: candidateChapter
          });
        }
      });

      // Augment from favorites
      favorites.forEach((f: FavoriteManga) => {
        if (!f.mangaId) return;
        const existing = candidateMap.get(f.mangaId);
        if (existing) {
          existing.title = existing.title || f.title;
          existing.category = f.userCategory;
          existing.score = f.userScore;
        } else {
          candidateMap.set(f.mangaId, {
            mangaId: f.mangaId,
            title: f.title,
            category: f.userCategory,
            score: f.userScore
          });
        }
      });

      const candidates = Array.from(candidateMap.values());
      stats.totalChecked = candidates.length;

      // 2. Iterate and evaluate each candidate
      for (const item of candidates) {
        const mapping = TrackerService.getMapping(item.mangaId);
        // Only process items that are linked to at least one external service
        if (!mapping || (!mapping.anilistId && !mapping.malId)) {
          continue;
        }

        currentSyncMangaTitle = item.title;
        notifyListeners();

        // Determine current local chapter
        const progress = HistoryService.getProgress(item.mangaId);
        const rawChapter = progress?.chapterNumber || item.chapterNumber;
        const parsedChapter = rawChapter ? Math.floor(parseFloat(rawChapter)) : 0;
        const lastScrobbled = mapping.lastScrobbledChapter ? Math.floor(parseFloat(mapping.lastScrobbledChapter)) : 0;

        const hasError = mapping.anilistStatus === 'error' || mapping.malStatus === 'error';
        const isProgressBehind = parsedChapter > 0 && parsedChapter > lastScrobbled;
        const shouldSyncProgress = isProgressBehind || (force && parsedChapter > 0) || (hasError && parsedChapter > 0);

        let didWork = false;

        // Sync reading chapter progress
        if (shouldSyncProgress) {
          try {
            const scrobbleRes = await TrackerService.scrobbleChapter(
              item.mangaId,
              item.title,
              String(parsedChapter),
              force || hasError
            );

            if (scrobbleRes.anilistError || scrobbleRes.malError) {
              stats.errorsCount++;
              stats.details.push(
                `Aviso em "${item.title}": ${scrobbleRes.anilistError || scrobbleRes.malError}`
              );
            } else if (scrobbleRes.anilistSuccess || scrobbleRes.malSuccess) {
              stats.syncedCount++;
              stats.details.push(`Cap. ${parsedChapter} enviado para "${item.title}".`);
              didWork = true;
            }
          } catch (err: any) {
            stats.errorsCount++;
            stats.details.push(`Falha ao sincronizar cap. de "${item.title}": ${err?.message || err}`);
          }
        }

        // Sync status/score if favorite exists
        const fav = favorites.find(f => f.mangaId === item.mangaId);
        if (fav && (force || hasError || didWork)) {
          try {
            await TrackerService.updateTrackerStatus(
              item.mangaId,
              item.title,
              fav.userCategory || 'reading',
              fav.userScore
            );
          } catch (err: any) {
            console.warn(`Failed status update for ${item.title}`, err);
          }
        }

        if (!didWork && !shouldSyncProgress) {
          stats.alreadySyncedCount++;
        }

        // Polite delay between tracker API calls to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      stats.timestamp = Date.now();
      try {
        localStorage.setItem(BG_TRACKER_LAST_SYNC_KEY, JSON.stringify(stats));
      } catch (e) {
        console.warn('Failed to store sync stats', e);
      }
    } catch (globalErr: any) {
      console.warn('Global tracker background sync error', globalErr);
      stats.errorsCount++;
      stats.details.push(`Erro geral: ${globalErr?.message || globalErr}`);
    } finally {
      isSyncing = false;
      currentSyncMangaTitle = null;
      notifyListeners();
    }

    return stats;
  },

  /**
   * Initializes background scheduler, online listener, visibility listener,
   * and auto-sync on local reading changes.
   */
  initBackgroundSync(): () => void {
    if (typeof window === 'undefined') return () => {};

    // 1. Initial delayed sync after app boots
    const initialTimer = setTimeout(() => {
      if (loadStoredEnabled()) {
        this.syncAllPending(false).catch(() => {});
      }
    }, 4500);

    // 2. Setup periodic interval
    this.restartTimer();

    // 3. Online event listener - flush pending scrobbles as soon as network reconnects
    const handleOnline = () => {
      if (loadStoredEnabled()) {
        this.syncAllPending(false).catch(() => {});
      }
    };
    window.addEventListener('online', handleOnline);

    // 4. Tab visibility change - check when returning to tab
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && loadStoredEnabled()) {
        const stats = loadStoredStats();
        const minsAgo = stats ? (Date.now() - stats.timestamp) / 60000 : Infinity;
        if (minsAgo > loadStoredInterval()) {
          this.syncAllPending(false).catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // 5. Reactive History listener with debounce: if user reads in another tab or finishes a chapter,
    // trigger a background reconciliation after 10 seconds of inactivity
    const unsubHistory = HistoryService.subscribe(() => {
      if (!loadStoredEnabled()) return;
      if (debounceTimerId) clearTimeout(debounceTimerId);
      debounceTimerId = setTimeout(() => {
        this.syncAllPending(false).catch(() => {});
      }, 10000);
    });

    return () => {
      clearTimeout(initialTimer);
      if (debounceTimerId) clearTimeout(debounceTimerId);
      if (bgTimerId) {
        clearInterval(bgTimerId);
        bgTimerId = null;
      }
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubHistory();
    };
  }
};
