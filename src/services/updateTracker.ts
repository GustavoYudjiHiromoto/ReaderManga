import { MangaUpdateInfo } from '../types/manga.js';
import { HistoryService } from './history.js';
import { MangaApi } from './api.js';
import { filterChaptersByLanguage, getPreferredLanguage } from '../utils/languagePreference.js';

const UPDATES_KEY = 'manga_reader_updates_v1';
const SEEN_IN_FEED_KEY = 'manga_reader_updates_feed_seen_v1';
const AUTO_RADAR_ENABLED_KEY = 'mr_updates_auto_radar_v1';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos de cache para não sobrecarregar as fontes
const NON_FORCED_ITEM_SKIP_MS = 30 * 60 * 1000; // 30 minutos de skip por obra em checagens automáticas
const ACTIVITY_SAMPLE_THROTTLE_MS = 1000; // Atualiza timestamp de interação no máximo 1x/segundo
const DEFAULT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // Para polling após 15 min sem interação
const DEFAULT_POLL_INTERVAL_MS = 30 * 60 * 1000; // Intervalo entre ciclos em segundo plano
const DEFAULT_DEBOUNCE_MS = 2500; // Debounce para navegação / bursts de eventos
const DEFAULT_IDLE_SETTLE_MS = 2000; // Aguarda pausa curta de interação antes de iniciar check automático
const DEFAULT_MIN_THROTTLE_MS = 5 * 60 * 1000; // Mínimo de 5 min entre verificações automáticas
const DEFAULT_IDLE_CALLBACK_TIMEOUT_MS = 2000;

export const BACKGROUND_ELIGIBLE_VIEWS = new Set(['home', 'catalog', 'favorites', 'updates']);

export interface RadarTimingConfig {
  inactivityTimeoutMs: number;
  pollIntervalMs: number;
  debounceMs: number;
  idleSettleMs: number;
  minThrottleMs: number;
  idleCallbackTimeoutMs: number;
}

const radarConfig: RadarTimingConfig = {
  inactivityTimeoutMs: DEFAULT_INACTIVITY_TIMEOUT_MS,
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  debounceMs: DEFAULT_DEBOUNCE_MS,
  idleSettleMs: DEFAULT_IDLE_SETTLE_MS,
  minThrottleMs: DEFAULT_MIN_THROTTLE_MS,
  idleCallbackTimeoutMs: DEFAULT_IDLE_CALLBACK_TIMEOUT_MS
};

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
    } else if (event.key === AUTO_RADAR_ENABLED_KEY) {
      if (event.newValue === 'true') {
        startBackgroundTimers();
      } else {
        stopBackgroundTimers(true);
      }
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
let isCurrentCheckManual = false;
let checkProgress: string | null = null;
let cancelRequested = false;

let activeView = 'home';
let radarInitialized = false;
let lastInteractionAt = Date.now();
let lastActivitySampleAt = 0;
let lastBackgroundCheckAt = 0;
let isPollingActive = false;
let stoppedByInactivity = false;

let debounceTimerId: ReturnType<typeof setTimeout> | null = null;
let idleTaskHandle: { type: 'idle' | 'timeout'; id: number | ReturnType<typeof setTimeout> } | null = null;
let bgPollTimerId: ReturnType<typeof setInterval> | null = null;
let inactivityWatchdogId: ReturnType<typeof setTimeout> | null = null;

const NOTIFICATIONS_ENABLED_KEY = 'mr_notifications_enabled';

function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function isViewEligibleForBackground(view = activeView): boolean {
  return BACKGROUND_ELIGIBLE_VIEWS.has(view);
}

function clearPendingBackgroundCheck() {
  if (debounceTimerId) {
    clearTimeout(debounceTimerId);
    debounceTimerId = null;
  }
  if (idleTaskHandle) {
    if (
      idleTaskHandle.type === 'idle' &&
      typeof window !== 'undefined' &&
      typeof (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback === 'function'
    ) {
      (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
        idleTaskHandle.id as number
      );
    } else {
      clearTimeout(idleTaskHandle.id as ReturnType<typeof setTimeout>);
    }
    idleTaskHandle = null;
  }
}

function clearInactivityWatchdog() {
  if (inactivityWatchdogId) {
    clearTimeout(inactivityWatchdogId);
    inactivityWatchdogId = null;
  }
}

function cancelUnforcedBackgroundCheck() {
  if (isChecking && !isCurrentCheckManual) {
    cancelRequested = true;
    checkProgress = null;
  }
}

function stopBackgroundTimers(abortActiveBackground = false) {
  clearPendingBackgroundCheck();
  clearInactivityWatchdog();
  if (bgPollTimerId) {
    clearInterval(bgPollTimerId);
    bgPollTimerId = null;
  }
  isPollingActive = false;
  if (abortActiveBackground) {
    cancelUnforcedBackgroundCheck();
  }
}

function scheduleInactivityWatchdog() {
  clearInactivityWatchdog();
  if (!radarInitialized || !UpdateTrackerService.isAutoRadarEnabled() || isPageHidden()) {
    return;
  }
  const elapsed = Math.max(0, Date.now() - lastInteractionAt);
  const remaining = Math.max(25, radarConfig.inactivityTimeoutMs - elapsed);
  inactivityWatchdogId = setTimeout(() => {
    inactivityWatchdogId = null;
    if (!UpdateTrackerService.isUserInteracting()) {
      stoppedByInactivity = true;
      stopBackgroundTimers(true);
      notifyListeners();
    } else {
      scheduleInactivityWatchdog();
    }
  }, remaining);
}

function dispatchWhenIdle(callback: () => void) {
  clearPendingBackgroundCheck();
  const win = typeof window !== 'undefined'
    ? (window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      })
    : null;

  if (win && typeof win.requestIdleCallback === 'function') {
    const id = win.requestIdleCallback(
      () => {
        idleTaskHandle = null;
        callback();
      },
      { timeout: radarConfig.idleCallbackTimeoutMs }
    );
    idleTaskHandle = { type: 'idle', id };
  } else {
    const id = setTimeout(() => {
      idleTaskHandle = null;
      callback();
    }, 0);
    idleTaskHandle = { type: 'timeout', id };
  }
}

function scheduleDebouncedBackgroundCheck(delayMs = radarConfig.debounceMs): boolean {
  if (!radarInitialized || !UpdateTrackerService.isAutoRadarEnabled()) return false;
  if (!isViewEligibleForBackground()) return false;
  if (!UpdateTrackerService.isUserInteracting()) return false;
  if (isChecking) return false;

  const now = Date.now();
  if (lastBackgroundCheckAt > 0 && now - lastBackgroundCheckAt < radarConfig.minThrottleMs) {
    return false;
  }

  clearPendingBackgroundCheck();
  const effectiveDelay = Math.max(0, delayMs);

  debounceTimerId = setTimeout(() => {
    debounceTimerId = null;
    if (!radarInitialized || !UpdateTrackerService.isAutoRadarEnabled()) return;
    if (!isViewEligibleForBackground()) return;
    if (!UpdateTrackerService.isUserInteracting()) {
      stoppedByInactivity = true;
      stopBackgroundTimers(true);
      return;
    }
    if (isChecking) return;

    const currentNow = Date.now();
    if (lastBackgroundCheckAt > 0 && currentNow - lastBackgroundCheckAt < radarConfig.minThrottleMs) {
      return;
    }

    // Se o usuário acabou de interagir em alta frequência, espera estabilizar (idle curto) antes de disparar
    const sinceInteraction = currentNow - lastInteractionAt;
    if (radarConfig.idleSettleMs > 0 && sinceInteraction < radarConfig.idleSettleMs) {
      scheduleDebouncedBackgroundCheck(radarConfig.idleSettleMs - sinceInteraction);
      return;
    }

    dispatchWhenIdle(() => {
      if (!radarInitialized || !UpdateTrackerService.isAutoRadarEnabled()) return;
      if (!isViewEligibleForBackground() || !UpdateTrackerService.isUserInteracting() || isChecking) return;
      const fireNow = Date.now();
      if (lastBackgroundCheckAt > 0 && fireNow - lastBackgroundCheckAt < radarConfig.minThrottleMs) return;
      lastBackgroundCheckAt = fireNow;
      UpdateTrackerService.checkUpdates(false).catch(() => {});
    });
  }, effectiveDelay);

  return true;
}

function startBackgroundTimers() {
  if (!radarInitialized) return;
  stopBackgroundTimers(false);
  if (!UpdateTrackerService.isAutoRadarEnabled()) return;
  if (!UpdateTrackerService.isUserInteracting()) {
    stoppedByInactivity = true;
    return;
  }
  if (!isViewEligibleForBackground()) {
    return;
  }

  stoppedByInactivity = false;
  isPollingActive = true;
  scheduleInactivityWatchdog();

  // Agenda verificação inicial com debounce + espera de ociosidade
  scheduleDebouncedBackgroundCheck(radarConfig.debounceMs);

  // Agenda intervalo recorrente somente enquanto houver interação recente e view elegível
  bgPollTimerId = setInterval(() => {
    if (!radarInitialized || !UpdateTrackerService.isAutoRadarEnabled()) {
      stopBackgroundTimers(true);
      return;
    }
    if (!UpdateTrackerService.isUserInteracting()) {
      stoppedByInactivity = true;
      stopBackgroundTimers(true);
      notifyListeners();
      return;
    }
    if (!isViewEligibleForBackground()) {
      return;
    }
    scheduleDebouncedBackgroundCheck(radarConfig.debounceMs);
  }, radarConfig.pollIntervalMs);
}

export const UpdateTrackerService = {
  isAutoRadarEnabled(): boolean {
    try {
      return localStorage.getItem(AUTO_RADAR_ENABLED_KEY) === 'true';
    } catch {
      return false;
    }
  },

  setAutoRadarEnabled(enabled: boolean): void {
    try {
      localStorage.setItem(AUTO_RADAR_ENABLED_KEY, enabled ? 'true' : 'false');
    } catch {}
    if (enabled) {
      this.recordUserInteraction();
      startBackgroundTimers();
    } else {
      stoppedByInactivity = false;
      stopBackgroundTimers(true);
    }
    notifyListeners();
  },

  setActiveView(view: string): void {
    const normalized = (view || 'home').toLowerCase().trim() || 'home';
    const prevView = activeView;
    activeView = normalized;
    this.recordUserInteraction();

    if (!isViewEligibleForBackground(normalized)) {
      stopBackgroundTimers(true);
      return;
    }

    if (radarInitialized && this.isAutoRadarEnabled()) {
      if (!isPollingActive) {
        startBackgroundTimers();
      } else if (prevView !== normalized) {
        scheduleDebouncedBackgroundCheck(radarConfig.debounceMs);
      }
    }
  },

  getActiveView(): string {
    return activeView;
  },

  recordUserInteraction(timestamp = Date.now()): void {
    lastInteractionAt = timestamp;
    if (radarInitialized && this.isAutoRadarEnabled() && !isPageHidden()) {
      if (stoppedByInactivity && isViewEligibleForBackground()) {
        stoppedByInactivity = false;
        startBackgroundTimers();
      } else if (isPollingActive && !inactivityWatchdogId) {
        scheduleInactivityWatchdog();
      }
    }
  },

  isUserInteracting(now = Date.now()): boolean {
    if (isPageHidden()) return false;
    return now - lastInteractionAt < radarConfig.inactivityTimeoutMs;
  },

  isBackgroundPollingActive(): boolean {
    return isPollingActive;
  },

  requestBackgroundCheck(_reason: 'navigation' | 'idle' | 'interval' | 'resume' = 'idle'): boolean {
    return scheduleDebouncedBackgroundCheck(radarConfig.debounceMs);
  },

  getRadarStatus() {
    return {
      activeView,
      isPollingActive,
      isUserInteracting: this.isUserInteracting(),
      stoppedByInactivity,
      lastBackgroundCheckAt,
      lastInteractionAt,
      hasPendingDebounce: Boolean(debounceTimerId || idleTaskHandle)
    };
  },

  configureRadarTiming(partial: Partial<RadarTimingConfig>): void {
    Object.assign(radarConfig, partial);
    if (isPollingActive) {
      scheduleInactivityWatchdog();
    }
  },

  resetRadarStateForTests(): void {
    stopBackgroundTimers(true);
    radarConfig.inactivityTimeoutMs = DEFAULT_INACTIVITY_TIMEOUT_MS;
    radarConfig.pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
    radarConfig.debounceMs = DEFAULT_DEBOUNCE_MS;
    radarConfig.idleSettleMs = DEFAULT_IDLE_SETTLE_MS;
    radarConfig.minThrottleMs = DEFAULT_MIN_THROTTLE_MS;
    radarConfig.idleCallbackTimeoutMs = DEFAULT_IDLE_CALLBACK_TIMEOUT_MS;
    activeView = 'home';
    radarInitialized = false;
    lastInteractionAt = Date.now();
    lastActivitySampleAt = 0;
    lastBackgroundCheckAt = 0;
    stoppedByInactivity = false;
    isChecking = false;
    isCurrentCheckManual = false;
    cancelRequested = false;
    checkProgress = null;
    cachedUpdates = null;
    cachedSeenInFeed = null;
  },

  cancelCheck(): void {
    if (!isChecking) return;
    cancelRequested = true;
    checkProgress = 'Cancelando verificação...';
    notifyListeners();
  },

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
    let count = 0;
    for (const u of Object.values(all)) {
      if (u?.hasNew && HistoryService.isBookmarked(u.mangaId) && !HistoryService.isChapterRead(u.latestChapterId)) {
        count++;
      }
    }
    return count;
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
        HistoryService.isBookmarked(u.mangaId) &&
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
        if (u?.mangaId && u?.latestChapterId && HistoryService.isBookmarked(u.mangaId)) {
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

      if (Object.keys(prevSeen).length !== Object.keys(nextSeen).length) {
        changed = true;
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
    return Object.values(all).filter(
      u => u?.hasNew && HistoryService.isBookmarked(u.mangaId) && !HistoryService.isChapterRead(u.latestChapterId)
    );
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

  removeTrackedUpdates(mangaIds: string[]): boolean {
    if (!mangaIds || mangaIds.length === 0) return false;
    try {
      const removeSet = new Set(mangaIds.filter(Boolean));
      if (removeSet.size === 0) return false;
      const stored = this.getStoredUpdates();
      const seenMap = getSeenInFeedMap();
      let updatesChanged = false;
      let seenChanged = false;
      const nextUpdates: Record<string, MangaUpdateInfo> = { ...stored };
      const nextSeen: Record<string, string> = { ...seenMap };

      for (const id of removeSet) {
        if (id in nextUpdates) {
          delete nextUpdates[id];
          updatesChanged = true;
        }
        if (id in nextSeen) {
          delete nextSeen[id];
          seenChanged = true;
        }
      }

      if (updatesChanged) {
        localStorage.setItem(UPDATES_KEY, JSON.stringify(nextUpdates));
        cachedUpdates = nextUpdates;
      }
      if (seenChanged) {
        localStorage.setItem(SEEN_IN_FEED_KEY, JSON.stringify(nextSeen));
        cachedSeenInFeed = nextSeen;
      }
      if (updatesChanged || seenChanged) {
        notifyListeners();
      }
      return updatesChanged || seenChanged;
    } catch (e) {
      console.warn('Failed to remove tracked updates', e);
      return false;
    }
  },

  migrateMangaUpdate(sourceMangaId: string, targetMangaId: string): void {
    if (!sourceMangaId || !targetMangaId || sourceMangaId === targetMangaId) return;
    try {
      const stored = this.getStoredUpdates();
      const seenMap = getSeenInFeedMap();
      const sourceUpdate = stored[sourceMangaId];
      const targetUpdate = stored[targetMangaId];
      const nextUpdates: Record<string, MangaUpdateInfo> = { ...stored };
      const nextSeen: Record<string, string> = { ...seenMap };
      let changed = false;

      if (sourceUpdate) {
        const sourceNum = parseFloat(sourceUpdate.latestChapterNumber || '0');
        const targetNum = targetUpdate ? parseFloat(targetUpdate.latestChapterNumber || '0') : -Infinity;
        const sourceIsNewer =
          !targetUpdate ||
          (!isNaN(sourceNum) && !isNaN(targetNum) && sourceNum > targetNum) ||
          (sourceNum === targetNum && (sourceUpdate.checkedAt || 0) > (targetUpdate?.checkedAt || 0));

        if (sourceIsNewer) {
          const progress = HistoryService.getProgress(targetMangaId);
          const progressNum = progress?.chapterNumber ? parseFloat(progress.chapterNumber) : NaN;
          let hasNew = Boolean(sourceUpdate.hasNew);
          if (HistoryService.isChapterRead(sourceUpdate.latestChapterId)) {
            hasNew = false;
          } else if (!isNaN(progressNum) && !isNaN(sourceNum)) {
            hasNew = sourceNum > progressNum;
          }
          nextUpdates[targetMangaId] = {
            ...sourceUpdate,
            mangaId: targetMangaId,
            hasNew,
            lastReadNumber: progress?.chapterNumber || targetUpdate?.lastReadNumber || sourceUpdate.lastReadNumber
          };
          if (seenMap[sourceMangaId] && !nextSeen[targetMangaId]) {
            nextSeen[targetMangaId] = seenMap[sourceMangaId];
          }
        }
        delete nextUpdates[sourceMangaId];
        changed = true;
      }

      if (sourceMangaId in nextSeen) {
        delete nextSeen[sourceMangaId];
        changed = true;
      }

      if (changed) {
        localStorage.setItem(UPDATES_KEY, JSON.stringify(nextUpdates));
        cachedUpdates = nextUpdates;
        localStorage.setItem(SEEN_IN_FEED_KEY, JSON.stringify(nextSeen));
        cachedSeenInFeed = nextSeen;
        notifyListeners();
      }
    } catch (e) {
      console.warn('Failed to migrate tracked update', e);
    }
  },

  pruneOrphanedUpdates(): boolean {
    try {
      const stored = this.getStoredUpdates();
      const seenMap = getSeenInFeedMap();
      const orphanSet = new Set<string>();
      for (const id of Object.keys(stored)) {
        if (!HistoryService.isBookmarked(id)) orphanSet.add(id);
      }
      for (const id of Object.keys(seenMap)) {
        if (!HistoryService.isBookmarked(id)) orphanSet.add(id);
      }
      if (orphanSet.size === 0) return false;
      return this.removeTrackedUpdates(Array.from(orphanSet));
    } catch {
      return false;
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
      this.pruneOrphanedUpdates();
      return { count: 0, updates: {} };
    }

    const currentUpdates = this.getStoredUpdates();
    const now = Date.now();

    // Se não for forçado, checar se a maioria ainda está dentro do TTL do cache
    if (!force) {
      const updatesValues = Object.values(currentUpdates);
      const allRecent = favorites.every(f => {
        if (f.userCategory === 'completed' || f.userCategory === 'dropped') return true;
        const u = currentUpdates[f.mangaId];
        return u && (now - u.checkedAt) < CACHE_TTL_MS;
      });
      if (allRecent && updatesValues.length > 0) {
        this.pruneOrphanedUpdates();
        return { count: this.getUnreadUpdatesCount(), updates: this.getStoredUpdates() };
      }
    }

    isChecking = true;
    isCurrentCheckManual = force;
    cancelRequested = false;
    if (!force) {
      lastBackgroundCheckAt = Date.now();
    }
    checkProgress = 'Iniciando radar de lançamentos...';
    onProgress?.(checkProgress);
    notifyListeners();

    const favIdSet = new Set(favorites.map(f => f.mangaId));
    const newUpdates: Record<string, MangaUpdateInfo> = {};
    for (const [id, info] of Object.entries(currentUpdates)) {
      if (favIdSet.has(id) && info) {
        newUpdates[id] = info;
      }
    }
    const readChapters = new Set(HistoryService.getReadChapters());
    const preferredLang = getPreferredLanguage();

    // Smart skip upfront for non-forced checks
    const targets = favorites.filter(fav => {
      const existing = currentUpdates[fav.mangaId];
      if (!force) {
        if (fav.userCategory === 'completed' || fav.userCategory === 'dropped') {
          if (existing && readChapters.has(existing.latestChapterId)) {
            newUpdates[fav.mangaId] = { ...existing, hasNew: false };
          }
          return false;
        }
        if (existing && (now - existing.checkedAt < NON_FORCED_ITEM_SKIP_MS)) {
          if (readChapters.has(existing.latestChapterId)) {
            newUpdates[fav.mangaId] = { ...existing, hasNew: false };
          }
          return false;
        }
      }
      return true;
    });

    let completedCount = 0;
    const totalCount = targets.length;
    let nextIdx = 0;
    const CONCURRENCY = Math.min(5, Math.max(1, totalCount));
    let lastUiNotifyAt = 0;

    const persistProgress = () => {
      try {
        localStorage.setItem(UPDATES_KEY, JSON.stringify(newUpdates));
        cachedUpdates = { ...newUpdates };
      } catch {}
    };

    const worker = async () => {
      while (!cancelRequested) {
        const idx = nextIdx++;
        if (idx >= totalCount) break;
        const fav = targets[idx];
        const existing = currentUpdates[fav.mangaId];

        if (!cancelRequested) {
          const nowTick = Date.now();
          const statusMsg = `Verificando ${completedCount + 1}/${totalCount}: ${fav.title.slice(0, 18)}...`;
          checkProgress = statusMsg;
          onProgress?.(statusMsg);
          if (nowTick - lastUiNotifyAt >= 120) {
            lastUiNotifyAt = nowTick;
            notifyListeners();
          }
        }

        try {
          const rawChapters = await MangaApi.getChapters(fav.mangaId, {
            order: 'desc',
            deduplicate: true,
            title: fav.title,
            altTitles: fav.altTitles
          });

          if (cancelRequested) break;

          const { chapters } = filterChaptersByLanguage(rawChapters, preferredLang);
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
              checkedAt: Date.now()
            };
          }
        } catch (err) {
          console.warn(`Radar: Falha ao obter capítulos de ${fav.mangaId}:`, err);
        } finally {
          completedCount++;
          if (completedCount % 20 === 0) {
            persistProgress();
          }
        }
      }
    };

    try {
      if (totalCount > 0) {
        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      }
      persistProgress();
      this.pruneOrphanedUpdates();
    } finally {
      isChecking = false;
      isCurrentCheckManual = false;
      checkProgress = null;
      cancelRequested = false;
      notifyListeners();
    }

    return {
      count: this.getUnreadUpdatesCount(),
      updates: newUpdates
    };
  },

  /**
   * Inicializa o radar em segundo plano com monitoramento de interação,
   * debounce/throttle e parada automática quando o usuário está ausente/inativo.
   */
  initBackgroundRadar(): () => void {
    radarInitialized = true;
    lastInteractionAt = Date.now();

    let lastHistoryRef = HistoryService.getHistory();
    let lastReadRef = HistoryService.getReadChapters();
    let lastFavoritesRef = HistoryService.getFavorites();
    let historyCleanupTimer: ReturnType<typeof setTimeout> | null = null;

    // Prune any pre-existing orphaned entries from deleted/merged favorites cleanly on startup
    this.pruneOrphanedUpdates();

    // Coalesce high-frequency HistoryService updates so burst writes don't thrash storage/UI
    const flushHistorySync = () => {
      historyCleanupTimer = null;
      const history = HistoryService.getHistory();
      const readList = HistoryService.getReadChapters();
      const favList = HistoryService.getFavorites();

      if (favList !== lastFavoritesRef) {
        lastFavoritesRef = favList;
        this.pruneOrphanedUpdates();
      }

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
    };

    const unsubHistory = HistoryService.subscribe(() => {
      if (historyCleanupTimer) {
        clearTimeout(historyCleanupTimer);
      }
      historyCleanupTimer = setTimeout(flushHistorySync, 200);
    }, ['favorites', 'history', 'readChapters']);

    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastActivitySampleAt < ACTIVITY_SAMPLE_THROTTLE_MS) {
        return;
      }
      lastActivitySampleAt = now;
      this.recordUserInteraction(now);
    };

    const handleVisibilityChange = () => {
      if (isPageHidden()) {
        stoppedByInactivity = true;
        stopBackgroundTimers(true);
        notifyListeners();
      } else {
        lastActivitySampleAt = Date.now();
        this.recordUserInteraction(lastActivitySampleAt);
      }
    };

    const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove'] as const;
    if (typeof window !== 'undefined') {
      for (const evt of activityEvents) {
        window.addEventListener(evt, handleUserActivity, { passive: true });
      }
      window.addEventListener('focus', handleVisibilityChange);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    if (this.isAutoRadarEnabled()) {
      startBackgroundTimers();
    }

    return () => {
      radarInitialized = false;
      if (historyCleanupTimer) {
        clearTimeout(historyCleanupTimer);
        historyCleanupTimer = null;
      }
      unsubHistory();
      stopBackgroundTimers(true);
      if (typeof window !== 'undefined') {
        for (const evt of activityEvents) {
          window.removeEventListener(evt, handleUserActivity);
        }
        window.removeEventListener('focus', handleVisibilityChange);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }
};
