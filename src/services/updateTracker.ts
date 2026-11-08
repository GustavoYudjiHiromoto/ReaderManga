import { MangaUpdateInfo } from '../types/manga.js';
import { HistoryService } from './history.js';
import { MangaApi } from './api.js';

const UPDATES_KEY = 'manga_reader_updates_v1';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos de cache para não sobrecarregar as fontes

type UpdateListener = () => void;
const listeners = new Set<UpdateListener>();

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
    if (event.key === UPDATES_KEY) {
      notifyListeners();
    }
  });
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
    try {
      const data = localStorage.getItem(UPDATES_KEY);
      if (!data) return {};
      const parsed = JSON.parse(data);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
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

  markMangaUpdateAsSeen(mangaId: string): void {
    try {
      const all = this.getStoredUpdates();
      if (all[mangaId] && all[mangaId].hasNew) {
        all[mangaId] = {
          ...all[mangaId],
          hasNew: false
        };
        localStorage.setItem(UPDATES_KEY, JSON.stringify(all));
        notifyListeners();
      }
    } catch (e) {
      console.warn('Failed to mark update as seen', e);
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
          const chapters = await MangaApi.getChapters(fav.mangaId, { order: 'desc', deduplicate: true });
          if (chapters.length > 0) {
            const latest = chapters[0];
            const progress = HistoryService.getProgress(fav.mangaId);

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

            newUpdates[fav.mangaId] = {
              mangaId: fav.mangaId,
              latestChapterId: latest.id,
              latestChapterNumber: latest.chapterNumber,
              latestChapterTitle: latest.title,
              hasNew,
              lastReadNumber: progress?.chapterNumber,
              checkedAt: now
            };
          }
        } catch (err) {
          console.warn(`Radar: Falha ao obter capítulos de ${fav.mangaId}:`, err);
        }
      }

      localStorage.setItem(UPDATES_KEY, JSON.stringify(newUpdates));
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

    // Auto-limpeza ao ler capítulos
    const unsubHistory = HistoryService.subscribe(() => {
      const history = HistoryService.getHistory();
      const readChapters = new Set(HistoryService.getReadChapters());
      const stored = this.getStoredUpdates();
      let changed = false;

      Object.values(stored).forEach(u => {
        if (u.hasNew && (readChapters.has(u.latestChapterId) || history.some(h => h.chapterId === u.latestChapterId))) {
          stored[u.mangaId] = { ...u, hasNew: false };
          changed = true;
        }
      });

      if (changed) {
        localStorage.setItem(UPDATES_KEY, JSON.stringify(stored));
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
