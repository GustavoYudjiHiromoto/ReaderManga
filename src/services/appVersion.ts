export interface BuildVersionInfo {
  version: string;
  buildId: string;
  buildTime: string;
}

export type AppUpdateStatus = 'idle' | 'checking' | 'latest' | 'update_available' | 'error';

export interface AppVersionSnapshot {
  client: BuildVersionInfo;
  server: BuildVersionInfo | null;
  status: AppUpdateStatus;
  hasWaitingWorker: boolean;
  lastCheckedAt: number | null;
  isApplying: boolean;
}

export const CLIENT_BUILD_INFO: BuildVersionInfo = {
  version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',
  buildId: typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev',
  buildTime: typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : ''
};

export function formatShortBuildLabel(info?: BuildVersionInfo | null): string {
  if (!info) return '—';
  const baseVersion = `v${info.version || '1.0.0'}`;
  if (info.buildTime) {
    const dt = new Date(info.buildTime);
    if (!Number.isNaN(dt.getTime())) {
      const formatted = dt.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${baseVersion} · ${formatted}`;
    }
  }
  const suffix = info.buildId?.includes('+') ? info.buildId.split('+')[1] : info.buildId;
  return suffix ? `${baseVersion} (${suffix})` : baseVersion;
}

export function formatExactBuildCode(info?: BuildVersionInfo | null): string {
  if (!info) return '—';
  return info.buildId || `v${info.version}`;
}

let snapshot: AppVersionSnapshot = {
  client: CLIENT_BUILD_INFO,
  server: null,
  status: 'idle',
  hasWaitingWorker: false,
  lastCheckedAt: null,
  isApplying: false
};

const listeners = new Set<() => void>();
let inFlightCheck: Promise<AppVersionSnapshot> | null = null;
let swListenersAttached = false;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function updateSnapshot(patch: Partial<AppVersionSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

export function getAppVersionSnapshot(): AppVersionSnapshot {
  return snapshot;
}

export function subscribeAppVersion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function attachServiceWorkerListeners(): void {
  if (swListenersAttached || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  swListenersAttached = true;

  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      if (reg.waiting) {
        updateSnapshot({ hasWaitingWorker: true, status: 'update_available' });
      }
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            updateSnapshot({ hasWaitingWorker: true, status: 'update_available' });
          }
        });
      });
    }
  }).catch(() => {});
}

export async function checkForAppUpdate(force = false): Promise<AppVersionSnapshot> {
  if (typeof window === 'undefined') return snapshot;
  attachServiceWorkerListeners();

  // Passive checks respect a 30-second cooldown
  if (!force && snapshot.lastCheckedAt && Date.now() - snapshot.lastCheckedAt < 30_000 && snapshot.server) {
    return snapshot;
  }

  if (inFlightCheck) return inFlightCheck;

  updateSnapshot({ status: 'checking' });

  inFlightCheck = (async () => {
    let hasWaitingWorker = snapshot.hasWaitingWorker;

    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
        for (const reg of registrations) {
          await reg.update().catch(() => {});
          if (reg.waiting) {
            hasWaitingWorker = true;
          }
        }
      }

      const res = await fetch(`/api/version?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      const serverInfo: BuildVersionInfo | null = json?.data?.version
        ? {
            version: String(json.data.version),
            buildId: String(json.data.buildId || json.data.version),
            buildTime: String(json.data.buildTime || '')
          }
        : null;

      const buildMismatch = Boolean(
        serverInfo &&
        CLIENT_BUILD_INFO.buildId !== 'dev' &&
        serverInfo.buildId &&
        serverInfo.buildId !== CLIENT_BUILD_INFO.buildId
      );

      const isUpdateReady = hasWaitingWorker || buildMismatch;

      updateSnapshot({
        server: serverInfo,
        hasWaitingWorker,
        status: isUpdateReady ? 'update_available' : 'latest',
        lastCheckedAt: Date.now()
      });
    } catch {
      updateSnapshot({
        hasWaitingWorker,
        status: hasWaitingWorker ? 'update_available' : 'error',
        lastCheckedAt: Date.now()
      });
    } finally {
      inFlightCheck = null;
    }

    return snapshot;
  })();

  return inFlightCheck;
}

export async function applyAppUpdateAndReload(): Promise<void> {
  if (typeof window === 'undefined') return;
  updateSnapshot({ isApplying: true });

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
      for (const reg of registrations) {
        await reg.update().catch(() => {});
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    }

    // Remove static app-shell caches only; preserve offline downloaded chapters (`mangareader-offline-*`)
    if ('caches' in window) {
      const cacheKeys = await caches.keys().catch(() => [] as string[]);
      await Promise.all(
        cacheKeys
          .filter(key => !key.startsWith('mangareader-offline-'))
          .map(key => caches.delete(key).catch(() => false))
      );
    }
  } finally {
    window.location.reload();
  }
}
