import { MangaUpdateInfo } from '../types/manga.js';
import { HistoryService } from './history.js';
import { MangaApi } from './api.js';
import { filterChaptersByLanguage, getPreferredLanguage } from '../utils/languagePreference.js';

const UPDATES_KEY = 'manga_reader_updates_v1';
const SEEN_IN_FEED_KEY = 'manga_reader_updates_feed_seen_v1';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos de cache para não sobrecarregar as fontes

type UpdateListener = () => void;
const listeners = new Set<UpdateListener>();

let cachedUpdates: Record<string, MangaUpdateInfo> | null = null;
let cachedSeenInFeed: Record<string, string> | null = null;

function notifyListeners() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.warn('Update tracker listener error', e);
    }
  });
}

// Sincronização entre abas
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!event.key || event.key === UPDATES_KEY) {
      cachedUpdates = null;
      notifyListeners();
    } else if (event.key === SEEN_IN_FEED_KEY) {
      cachedSeenInFeed = null;
      notifyListeners();
    }
  });
}

function getSeenInFeedMap(): Record<string, string> {
  if (cachedSeenInFeed) return cachedSeenInFeed;
  try {
    const raw = localStorage.getItem(SEEN_IN_FEED_KEY);
    if (!raw) {
      cachedSeenInFeed = {};
      return cachedSeenInFeed;
    }
    const parsed = JSON.parse(raw);
    cachedSeenInFeed = typeof parsed === 'object' && parsed !== null ? parsed : {};
    return cachedSeenInFeed!;
  } catch {
    return {};
  }
}

let isChecking = false;
let checkProgress: string | null = null;
let bgTimerId: any = null;
const NOTIFICATIONS_ENABLED_KEY = 'mr_notifications_enabled';

export const UpdateTrackerService = {
  isNotificationsSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  },

  isNotificationsEnabled(): boolean {
    if (!this.isNotificationsSupported()) return false;
    try {
      const stored = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
      return stored === 'true' && Notification.permission === 'granted';
    } catch {
      return false;
    }
  },

  async requestNotificationPermission(): Promise<boolean> {
    if (!this.isNotificationsSupported()) return false;
    try {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, granted ? 'true' : 'false');
      notifyListeners();
      return granted;
    } catch (e) {
      console.warn('Error requesting notification permission', e);
      return false;
    }
  },

  setNotificationsEnabled(enabled: boolean): void {
    try {
      localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? 'true' : 'false');
      notifyListeners();
    } catch {}
  },

  subscribe(listener: UpdateListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getStoredUpdates(): Record<string, MangaUpdateInfo> {
    if (cachedUpdates) return cachedUpdates;
    try {
      const data = localStorage.getItem(UPDATES_KEY);
      if (!data) {
        cachedUpdates = {};
        return cachedUpdates;
      }
      const parsed = JSON.parse(data);
      cachedUpdates = typeof parsed === 'object' && parsed !== null ? parsed : {};
      return cachedUpdates!;
    } catch {
      return {};
    }
  },

  getUpdateForManga(mangaId: string): MangaUpdateInfo | undefined {
    const all = this.getStoredUpdates();
    return all[mangaId];
  },

  getUnreadUpdatesCount(): number {
    const all = this.getStoredUpdates();
    const readChapters = new Set(HistoryService.getReadChapters());
    return Object.values(all).filter(u => u.hasNew && !readChapters.has(u.latestChapterId)).length;
  },

  /**
   * Unseen badge count (works like unread message notifications):
   * resets to 0 when user opens Lançamentos, and increments again only
   * when new chapters (different latestChapterId) are detected later.
   */
  getUnseenBadgeCount(): number {
    const all = this.getStoredUpdates();
    const seenMap = getSeenInFeedMap();
    let count = 0;
    for (const u of Object.values(all)) {
      if (
        u?.hasNew &&
        u.latestChapterId &&
        !HistoryService.isChapterRead(u.latestChapterId) &&
        seenMap[u.mangaId] !== u.latestChapterId
      ) {
        count++;
      }
    }
    return count;
  },

  /**
   * Marks currently listed new releases as acknowledged in the Lançamentos feed,
   * clearing the navbar counter without hiding the chapters inside UpdatesPage.
   */
  acknowledgeFeedUpdates(): void {
    try {
      const all = this.getStoredUpdates();
      const prevSeen = getSeenInFeedMap();
      let changed = false;
      const nextSeen: Record<string, string> = {};

      for (const u of Object.values(all)) {
        if (u?.mangaId && u?.latestChapterId) {
          if (u.hasNew && !HistoryService.isChapterRead(u.latestChapterId)) {
            nextSeen[u.mangaId] = u.latestChapterId;
            if (prevSeen[u.mangaId] !== u.latestChapterId) {
              changed = true;
            }
          } else if (prevSeen[u.mangaId] === u.latestChapterId) {
            nextSeen[u.mangaId] = u.latestChapterId;
          }
        }
      }

      if (changed) {
        localStorage.setItem(SEEN_IN_FEED_KEY, JSON.stringify(nextSeen));
        cachedSeenInFeed = nextSeen;
        notifyListeners();
      }
    } catch (e) {
      console.warn('Failed to acknowledge feed updates', e);
    }
  },

  getMangasWithUpdates(): MangaUpdateInfo[] {
    const all = this.getStoredUpdates();
    const readChapters = new Set(HistoryService.getReadChapters());
    return Object.values(all).filter(u => u.hasNew && !readChapters.has(u.latestChapterId));
  },

  isChecking(): boolean {
    return isChecking;
  },

  getProgress(): string | null {
    return checkProgress;
  },

  getAllTrackedUpdates(): MangaUpdateInfo[] {
    const all = this.getStoredUpdates();
    return Object.values(all).sort((a, b) => (b.checkedAt || 0) - (a.checkedAt || 0));
  },

  markMangaUpdateAsSeen(mangaId: string): void {
    try {
      const all = this.getStoredUpdates();
      if (all[mangaId] && all[mangaId].hasNew) {
        const nextAll = {
          ...all,
          [mangaId]: {
            ...all[mangaId],
            hasNew: false
          }
        };
        localStorage.setItem(UPDATES_KEY, JSON.stringify(nextAll));
        cachedUpdates = nextAll;
        notifyListeners();
      }
    } catch (e) {
      console.warn('Failed to mark update as seen', e);
    }
  },

  markAllUpdatesAsSeen(): void {
    try {
      const all = this.getStoredUpdates();
      let changed = false;
      const nextAll: Record<string, MangaUpdateInfo> = { ...all };
      Object.keys(nextAll).forEach(mangaId => {
        if (nextAll[mangaId]?.hasNew) {
          nextAll[mangaId] = { ...nextAll[mangaId], hasNew: false };
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem(UPDATES_KEY, JSON.stringify(nextAll));
        cachedUpdates = nextAll;
        notifyListeners();
      }
    } catch (e) {
      console.warn('Failed to mark all updates as seen', e);
    }
  },

  async checkUpdates(force = false, onProgress?: (msg: string) => void): Promise<{
    count: number;
    updates: Record<string, MangaUpdateInfo>;
  }> {
    if (isChecking) {
      return { count: this.getUnreadUpdatesCount(), updates: this.getStoredUpdates() };
    }

    const favorites = HistoryService.getFavorites();
    if (favorites.length === 0) {
      return { count: 0, updates: {} };
    }

    const currentUpdates = this.getStoredUpdates();
    const now = Date.now();

    // Se não for forçado, checar se a maioria ainda está dentro do TTL do cache
    if (!force) {
      const updatesValues = Object.values(currentUpdates);
      const allRecent = favorites.every(f => {
        const u = currentUpdates[f.mangaId];
        return u && (now - u.checkedAt) < CACHE_TTL_MS;
      });
      if (allRecent && updatesValues.length > 0) {
        return { count: this.getUnreadUpdatesCount(), updates: currentUpdates };
      }
    }

    isChecking = true;
    checkProgress = 'Iniciando radar de lançamentos...';
    onProgress?.(checkProgress);
    notifyListeners();

    const newUpdates: Record<string, MangaUpdateInfo> = { ...currentUpdates };
    const readChapters = new Set(HistoryService.getReadChapters());

    try {
      for (let i = 0; i < favorites.length; i++) {
        const fav = favorites[i];
        const statusMsg = `Verificando ${i + 1}/${favorites.length}: ${fav.title.slice(0, 18)}...`;
        checkProgress = statusMsg;
        onProgress?.(statusMsg);
        notifyListeners();

        // Se checado recentemente (< 5 min) e não for force, reaproveita
        const existing = currentUpdates[fav.mangaId];
        if (!force && existing && (now - existing.checkedAt < 5 * 60 * 1000)) {
          // Apenas revalida se o usuário leu recentemente
          if (readChapters.has(existing.latestChapterId)) {
            newUpdates[fav.mangaId] = { ...existing, hasNew: false };
          }
          continue;
        }

        try {
          let rawChapters = await MangaApi.getChapters(fav.mangaId, {
            order: 'desc',
            deduplicate: true,
            title: fav.title,
            altTitles: fav.altTitles
          });

          if ((!rawChapters || rawChapters.length === 0) && fav.title) {
            rawChapters = await MangaApi.getChapters(fav.mangaId, {
              order: 'desc',
              deduplicate: true,
              title: fav.title,
              altTitles: fav.altTitles,
              forceFederate: true
            });
          }

          const { chapters } = filterChaptersByLanguage(rawChapters, getPreferredLanguage());
          if (chapters.length > 0) {
            const sorted = [...chapters].sort((a, b) => {
              const nA = parseFloat(a.chapterNumber);
              const nB = parseFloat(b.chapterNumber);
              if (!isNaN(nA) && !isNaN(nB) && nA !== nB) return nB - nA;
              return b.chapterNumber.localeCompare(a.chapterNumber, undefined, { numeric: true });
            });
            const latest = sorted[0];
            const progress = HistoryService.getProgress(fav.mangaId);
            const primarySourceId =
              fav.sourceId || (fav.mangaId.startsWith('mr_') ? fav.mangaId.split('_')[1] : '');
            const chapterSourceId = latest.sourceId;
            const chapterSourceName =
              latest.variants?.find(v => v.sourceId === latest.sourceId)?.sourceName ||
              latest.variants?.[0]?.sourceName ||
              latest.sourceId;
            const failoverUsed = Boolean(
              primarySourceId && chapterSourceId && chapterSourceId !== primarySourceId
            );

            let hasNew = false;
            if (!readChapters.has(latest.id)) {
              if (progress) {
                const lastNum = parseFloat(progress.chapterNumber);
                const latestNum = parseFloat(latest.chapterNumber);
                if (!isNaN(lastNum) && !isNaN(latestNum)) {
                  hasNew = latestNum > lastNum;
                } else {
                  hasNew = progress.chapterId !== latest.id;
                }
              } else if (fav.userCategory === 'reading') {
                // Se está marcado como lendo mas sem progresso no dispositivo
                hasNew = true;
              }
            }

            const isFreshDiscovery = hasNew && (!existing || !existing.hasNew || existing.latestChapterId !== latest.id);
            if (isFreshDiscovery && this.isNotificationsEnabled() && typeof Notification !== 'undefined') {
              try {
                new Notification(`Novo Capítulo de ${fav.title}! 📖`, {
                  body: `Capítulo ${latest.chapterNumber}${latest.title ? ` - ${latest.title}` : ''} já está disponível!`,
                  icon: fav.coverUrl || undefined,
                  tag: `manga-update-${fav.mangaId}-${latest.id}`
                });
              } catch (e) {
                console.warn('Falha ao emitir notificação web:', e);
              }
            }

            const sameLatest = existing && existing.latestChapterId === latest.id;
            const discoveredAt = sameLatest && existing.discoveredAt
              ? existing.discoveredAt
              : (sameLatest && existing.checkedAt ? existing.checkedAt : now);

            newUpdates[fav.mangaId] = {
              mangaId: fav.mangaId,
              latestChapterId: latest.id,
              latestChapterNumber: latest.chapterNumber,
              latestChapterTitle: latest.title,
              releaseDate: latest.releaseDate || existing?.releaseDate,
              chapterSourceId,
              chapterSourceName,
              failoverUsed,
              hasNew,
              lastReadNumber: progress?.chapterNumber,
              discoveredAt,
              checkedAt: now
            };
          }
        } catch (err) {
          console.warn(`Radar: Falha ao obter capítulos de ${fav.mangaId}:`, err);
        }
      }

      localStorage.setItem(UPDATES_KEY, JSON.stringify(newUpdates));
      cachedUpdates = newUpdates;
    } finally {
      isChecking = false;
      checkProgress = null;
      notifyListeners();
    }

    return {
      count: this.getUnreadUpdatesCount(),
      updates: newUpdates
    };
  },

  /**
   * Inicializa o radar silencioso em segundo plano.
   * Roda 3 segundos após o carregamento e depois periodicamente a cada 30 minutos.
   */
  initBackgroundRadar(): () => void {
    if (typeof window === 'undefined') return () => {};

    let lastHistoryRef = HistoryService.getHistory();
    let lastReadRef = HistoryService.getReadChapters();

    // Auto-limpeza ao ler capítulos (ignora eventos de favoritos/dispensados que não afetam leitura)
    const unsubHistory = HistoryService.subscribe(() => {
      const history = HistoryService.getHistory();
      const readList = HistoryService.getReadChapters();
      if (history === lastHistoryRef && readList === lastReadRef) {
        return;
      }
      lastHistoryRef = history;
      lastReadRef = readList;

      const stored = this.getStoredUpdates();
      let changed = false;
      let nextStored: Record<string, MangaUpdateInfo> | null = null;

      Object.values(stored).forEach(u => {
        if (
          u.hasNew &&
          (HistoryService.isChapterRead(u.latestChapterId) || history.some(h => h.chapterId === u.latestChapterId))
        ) {
          if (!nextStored) nextStored = { ...stored };
          nextStored[u.mangaId] = { ...u, hasNew: false };
          changed = true;
        }
      });

      if (changed && nextStored) {
        localStorage.setItem(UPDATES_KEY, JSON.stringify(nextStored));
        cachedUpdates = nextStored;
        notifyListeners();
      }
    });

    // Dispara a checagem inicial não-bloqueante
    const initialTimer = setTimeout(() => {
      this.checkUpdates(false).catch(() => {});
    }, 3500);

    // Agenda intervalo recorrente
    bgTimerId = setInterval(() => {
      this.checkUpdates(false).catch(() => {});
    }, 30 * 60 * 1000);

    return () => {
      unsubHistory();
      clearTimeout(initialTimer);
      if (bgTimerId) clearInterval(bgTimerId);
    };
  }
};
