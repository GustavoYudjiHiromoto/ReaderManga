import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  getDocs,
  getDoc,
  writeBatch,
  Unsubscribe
} from 'firebase/firestore';
import {
  signInWithPopup,
  signOut,
  User,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase.js';
import { HistoryService } from './history.js';
import { FavoriteManga, ReadingProgress, IgnoredManga, LibraryCategory } from '../types/manga.js';
import { TrackerService } from './trackerService.js';

export function sanitizeDocId(rawId: string): string {
  if (!rawId) return 'unknown';
  const clean = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return clean.slice(0, 120) || 'item';
}

const VALID_CATEGORIES = new Set<LibraryCategory>([
  'reading',
  'completed',
  'plan_to_read',
  'on_hold',
  'dropped'
]);

function normalizeCategory(cat: any): LibraryCategory {
  return VALID_CATEGORIES.has(cat) ? cat : 'reading';
}

function toEpochMs(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (val && typeof (val as any).toMillis === 'function') {
    const ms = (val as any).toMillis();
    if (Number.isFinite(ms)) return ms;
  }
  return fallback;
}

function buildFavoriteFirestorePayload(fav: FavoriteManga): Record<string, any> | null {
  const safeMangaId = String(fav.mangaId || '').trim().slice(0, 256);
  if (!safeMangaId) return null;

  const payload: Record<string, any> = {
    mangaId: safeMangaId,
    title: String(fav.title || 'Mangá Salvo').slice(0, 512),
    userCategory: normalizeCategory(fav.userCategory),
    updatedAt: new Date(toEpochMs(fav.updatedAt, Date.now())).toISOString()
  };

  if (fav.coverUrl && typeof fav.coverUrl === 'string') {
    payload.coverUrl = fav.coverUrl.slice(0, 2048);
  }
  if (fav.sourceName && typeof fav.sourceName === 'string') {
    payload.sourceName = fav.sourceName.slice(0, 64);
  }
  if (fav.sourceId && typeof fav.sourceId === 'string') {
    payload.sourceId = fav.sourceId.slice(0, 64);
  }
  if (typeof fav.userScore === 'number' && Number.isFinite(fav.userScore)) {
    payload.userScore = Math.max(0, Math.min(10, fav.userScore));
  }
  if (fav.userNotes && typeof fav.userNotes === 'string') {
    payload.userNotes = fav.userNotes.slice(0, 2048);
  }
  if (Array.isArray(fav.customCollections) && fav.customCollections.length > 0) {
    const cleanCols = fav.customCollections
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      .slice(0, 50);
    if (cleanCols.length > 0) {
      payload.customCollections = cleanCols;
    }
  }
  return payload;
}

function buildHistoryFirestorePayload(hist: ReadingProgress): Record<string, any> | null {
  const safeMangaId = String(hist.mangaId || '').trim().slice(0, 256);
  const safeChapterId = String(hist.chapterId || '').trim().slice(0, 256);
  if (!safeMangaId || !safeChapterId) return null;

  const payload: Record<string, any> = {
    mangaId: safeMangaId,
    chapterId: safeChapterId,
    pageNumber: typeof hist.pageNumber === 'number' && Number.isFinite(hist.pageNumber)
      ? Math.max(0, Math.round(hist.pageNumber))
      : 1,
    updatedAt: new Date(toEpochMs(hist.updatedAt, Date.now())).toISOString()
  };

  if (hist.mangaTitle && typeof hist.mangaTitle === 'string') {
    payload.mangaTitle = hist.mangaTitle.slice(0, 512);
  }
  if (hist.mangaCover && typeof hist.mangaCover === 'string') {
    payload.mangaCover = hist.mangaCover.slice(0, 2048);
  }
  if (hist.chapterNumber !== undefined && hist.chapterNumber !== null && String(hist.chapterNumber).trim()) {
    payload.chapterNumber = String(hist.chapterNumber).slice(0, 64);
  }
  if (hist.chapterTitle && typeof hist.chapterTitle === 'string') {
    payload.chapterTitle = hist.chapterTitle.slice(0, 256);
  }
  if (typeof hist.totalPages === 'number' && Number.isFinite(hist.totalPages) && hist.totalPages >= 0) {
    payload.totalPages = Math.round(hist.totalPages);
  }
  if (typeof hist.scrollRatio === 'number' && Number.isFinite(hist.scrollRatio)) {
    payload.scrollRatio = Math.max(0, Math.min(1, hist.scrollRatio));
  }
  if (hist.sourceId && typeof hist.sourceId === 'string') {
    payload.sourceId = hist.sourceId.slice(0, 64);
  }
  return payload;
}

async function commitBatchedWrites(
  ops: Array<{ ref: ReturnType<typeof doc>; data: Record<string, any>; path: string }>
): Promise<void> {
  if (ops.length === 0) return;
  const BATCH_LIMIT = 400;
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach(op => batch.set(op.ref, op.data, { merge: true }));
    try {
      await batch.commit();
    } catch (err) {
      // Fallback to individual writes so one rejected document cannot block the remaining items
      let firstErr: unknown = err;
      for (const op of chunk) {
        try {
          await setDoc(op.ref, op.data, { merge: true });
        } catch (singleErr) {
          if (!firstErr) firstErr = singleErr;
          console.warn(`Firestore write failed for ${op.path}`, singleErr);
        }
      }
      if (chunk.length === 1 && firstErr) {
        handleFirestoreError(firstErr, OperationType.WRITE, chunk[0].path);
      }
    }
  }
}

export type SyncStatus = 'offline' | 'idle' | 'syncing' | 'synced' | 'error';

type SyncListener = () => void;
const syncListeners = new Set<SyncListener>();

let currentStatus: SyncStatus = 'offline';
let lastSyncedTime: Date | null = null;
let syncErrorMessage: string | null = null;
let activeUnsubscribers: Unsubscribe[] = [];
let isApplyingRemoteChange = false;
let inFlightSyncPromise: Promise<void> | null = null;
let inFlightSyncUserId: string | null = null;

const REMOVED_FAV_TOMBSTONES_KEY = 'manga_reader_removed_fav_tombstones_v1';
const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOMBSTONE_RACE_GRACE_MS = 15 * 1000;
const knownDocIdsByMangaId = new Map<string, Set<string>>();
const pendingDeletesInFlight = new Set<string>();
let cachedRemovedTombstones: Record<string, number> | null = null;
let lastStatusNotifiedAt = 0;

function readRemovedFavoriteTombstones(): Record<string, number> {
  if (cachedRemovedTombstones) return cachedRemovedTombstones;
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(REMOVED_FAV_TOMBSTONES_KEY);
    if (!raw) {
      cachedRemovedTombstones = {};
      return cachedRemovedTombstones;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      cachedRemovedTombstones = {};
      return cachedRemovedTombstones;
    }
    const now = Date.now();
    const cleaned: Record<string, number> = {};
    for (const [id, ts] of Object.entries(parsed)) {
      if (typeof id === 'string' && typeof ts === 'number' && Number.isFinite(ts) && now - ts < TOMBSTONE_TTL_MS) {
        cleaned[id] = ts;
      }
    }
    cachedRemovedTombstones = cleaned;
    return cleaned;
  } catch {
    return {};
  }
}

function writeRemovedFavoriteTombstones(map: Record<string, number>): void {
  const entries = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 500);
  const trimmed = Object.fromEntries(entries);
  cachedRemovedTombstones = trimmed;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(REMOVED_FAV_TOMBSTONES_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore quota errors
  }
}

function markFavoriteRemovedLocally(mangaId: string): void {
  if (!mangaId) return;
  const map = { ...readRemovedFavoriteTombstones() };
  map[mangaId] = Date.now();
  writeRemovedFavoriteTombstones(map);
}

function clearFavoriteRemovedLocally(mangaId: string): void {
  if (!mangaId) return;
  const map = readRemovedFavoriteTombstones();
  if (mangaId in map) {
    const next = { ...map };
    delete next[mangaId];
    writeRemovedFavoriteTombstones(next);
  }
}

function isTombstonedFavorite(mangaId: string, cloudUpdatedAtMs: number, tombstones?: Record<string, number>): boolean {
  if (pendingDeletesInFlight.has(mangaId)) return true;
  const map = tombstones || readRemovedFavoriteTombstones();
  const removedAt = map[mangaId];
  if (!removedAt) return false;
  // Treat any cloud doc whose update wasn't strictly created well after deletion as stale/resurrected
  return cloudUpdatedAtMs <= removedAt + TOMBSTONE_RACE_GRACE_MS;
}

function recordCloudDocId(mangaId: string, docId: string): void {
  if (!mangaId || !docId) return;
  let set = knownDocIdsByMangaId.get(mangaId);
  if (!set) {
    set = new Set<string>();
    knownDocIdsByMangaId.set(mangaId, set);
  }
  set.add(docId);
}

function stringArraysEqual(a?: string[], b?: string[]): boolean {
  const lenA = a?.length || 0;
  const lenB = b?.length || 0;
  if (lenA !== lenB) return false;
  for (let i = 0; i < lenA; i++) {
    if (a![i] !== b![i]) return false;
  }
  return true;
}

function notifySyncSubscribers() {
  syncListeners.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.warn('Sync listener error', e);
    }
  });
}

function setSyncStatus(status: SyncStatus, err: string | null = null) {
  const prevStatus = currentStatus;
  currentStatus = status;
  if (status === 'synced') {
    lastSyncedTime = new Date();
    syncErrorMessage = null;
    const now = Date.now();
    if (prevStatus === 'synced' && now - lastStatusNotifiedAt < 10000) {
      return;
    }
    lastStatusNotifiedAt = now;
  } else if (status === 'error') {
    syncErrorMessage = err;
    lastStatusNotifiedAt = Date.now();
  } else {
    lastStatusNotifiedAt = Date.now();
  }
  notifySyncSubscribers();
}

export const FirebaseSyncService = {
  subscribe(listener: SyncListener): () => void {
    syncListeners.add(listener);
    return () => {
      syncListeners.delete(listener);
    };
  },

  getStatus(): { status: SyncStatus; lastSynced: Date | null; error: string | null } {
    return {
      status: currentStatus,
      lastSynced: lastSyncedTime,
      error: syncErrorMessage
    };
  },

  getCurrentUser(): User | null {
    return auth.currentUser;
  },

  async loginWithGoogle(): Promise<User | null> {
    try {
      setSyncStatus('syncing');
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        const userPayload = {
          uid: user.uid,
          email: (user.email || '').slice(0, 256),
          displayName: (user.displayName || user.email?.split('@')[0] || 'Leitor').slice(0, 128),
          photoURL: (user.photoURL || '').slice(0, 1024),
          updatedAt: new Date().toISOString()
        };
        try {
          await setDoc(userDocRef, userPayload, { merge: true });
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`);
        }
        await this.syncAllData(user.uid);
      }
      return user;
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      setSyncStatus('error', error?.message || 'Falha ao autenticar com o Google.');
      throw error;
    }
  },

  async logout(): Promise<void> {
    try {
      this.stopRealtimeSync();
      await signOut(auth);
      setSyncStatus('offline');
    } catch (error: any) {
      console.error('Logout Error:', error);
      throw error;
    }
  },

  stopRealtimeSync() {
    activeUnsubscribers.forEach(unsub => {
      try {
        unsub();
      } catch (e) {
        console.warn('Error unsubscribing', e);
      }
    });
    activeUnsubscribers = [];
  },

  /**
   * Performs a two-way merge between localStorage and Firestore:
   * 1. Fetches cloud collections in parallel.
   * 2. Immediately merges & hydrates localStorage + notifies React UI so new tabs see cloud data right away.
   * 3. Batches only new/updated local deltas back to Firestore.
   * 4. Attaches real-time onSnapshot listeners for continuous multi-tab/multi-device sync.
   */
  async syncAllData(userId: string): Promise<void> {
    if (!userId) return;
    if (inFlightSyncPromise && inFlightSyncUserId === userId) {
      return inFlightSyncPromise;
    }

    const runSync = async () => {
      setSyncStatus('syncing');

      try {
        const favoritesCol = collection(db, 'users', userId, 'favorites');
        const historyCol = collection(db, 'users', userId, 'history');
        const syncDocRef = doc(db, 'users', userId, 'library', 'sync');

        let cloudFavSnap;
        let cloudHistSnap;
        let cloudSyncDoc;

        try {
          cloudFavSnap = await getDocs(favoritesCol);
        } catch (e) {
          handleFirestoreError(e, OperationType.LIST, `users/${userId}/favorites`);
        }

        try {
          cloudHistSnap = await getDocs(historyCol);
        } catch (e) {
          handleFirestoreError(e, OperationType.LIST, `users/${userId}/history`);
        }

        try {
          cloudSyncDoc = await getDoc(syncDocRef);
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, `users/${userId}/library/sync`);
        }

        // 1. Merge Favorites (Cloud <-> Local), honoring local deletion/merge tombstones
        const tombstones = readRemovedFavoriteTombstones();
        const cloudFavs = new Map<string, FavoriteManga>();
        const staleCloudDeletes: Array<Promise<void>> = [];

        cloudFavSnap.forEach(docSnap => {
          const d = docSnap.data() as any;
          if (d && d.mangaId) {
            recordCloudDocId(d.mangaId, docSnap.id);
            const cloudTime = toEpochMs(d.updatedAt, 0);
            if (isTombstonedFavorite(d.mangaId, cloudTime, tombstones)) {
              staleCloudDeletes.push(deleteDoc(docSnap.ref).catch(() => {}));
              return;
            }
            if (d.mangaId in tombstones && cloudTime > tombstones[d.mangaId] + TOMBSTONE_RACE_GRACE_MS) {
              clearFavoriteRemovedLocally(d.mangaId);
            }
            cloudFavs.set(d.mangaId, {
              mangaId: d.mangaId,
              title: d.title || 'Mangá Salvo',
              coverUrl: d.coverUrl || '',
              sourceName: d.sourceName || 'MangaReader',
              sourceId: d.sourceId,
              userCategory: normalizeCategory(d.userCategory),
              userScore: typeof d.userScore === 'number' ? d.userScore : undefined,
              userNotes: typeof d.userNotes === 'string' ? d.userNotes : undefined,
              customCollections: Array.isArray(d.customCollections) ? d.customCollections : [],
              updatedAt: toEpochMs(d.updatedAt, Date.now())
            });
          }
        });

        const localFavs = HistoryService.getFavorites();
        const localById = new Map(localFavs.map(f => [f.mangaId, f]));
        const mergedFavsMap = new Map<string, FavoriteManga>(cloudFavs);
        const favOpsToUpload: Array<{ ref: ReturnType<typeof doc>; data: Record<string, any>; path: string }> = [];

        localFavs.forEach(f => {
          const localTime = toEpochMs(f.updatedAt, 0);
          if (isTombstonedFavorite(f.mangaId, localTime, tombstones)) {
            return;
          }
          const existing = mergedFavsMap.get(f.mangaId);
          if (!existing) {
            const normalizedLocal: FavoriteManga = {
              ...f,
              userCategory: normalizeCategory(f.userCategory),
              updatedAt: localTime || Date.now()
            };
            mergedFavsMap.set(f.mangaId, normalizedLocal);
            const payload = buildFavoriteFirestorePayload(normalizedLocal);
            if (payload) {
              const docId = sanitizeDocId(f.mangaId);
              favOpsToUpload.push({
                ref: doc(db, 'users', userId, 'favorites', docId),
                data: payload,
                path: `users/${userId}/favorites/${docId}`
              });
            }
          } else {
            const cloudTime = toEpochMs(existing.updatedAt, 0);
            const localIsNewer = localTime > cloudTime;
            const newer = localTime >= cloudTime ? f : existing;
            const mergedCols = Array.from(
              new Set([...(existing.customCollections || []), ...(f.customCollections || [])])
            );
            const mergedFav: FavoriteManga = {
              ...existing,
              ...f,
              coverUrl: f.coverUrl || existing.coverUrl || '',
              userCategory: normalizeCategory(newer.userCategory),
              userScore: localIsNewer
                ? (f.userScore !== undefined ? f.userScore : existing.userScore)
                : (existing.userScore !== undefined ? existing.userScore : f.userScore),
              userNotes: localIsNewer
                ? (f.userNotes !== undefined ? f.userNotes : existing.userNotes)
                : (existing.userNotes !== undefined ? existing.userNotes : f.userNotes),
              customCollections: mergedCols,
              updatedAt: Math.max(localTime, cloudTime) || Date.now()
            };
            mergedFavsMap.set(f.mangaId, mergedFav);

            // Upload only if local has newer changes or extra collections/fields missing in cloud
            const colsChanged = mergedCols.length > (existing.customCollections?.length || 0);
            if (localIsNewer || colsChanged) {
              const payload = buildFavoriteFirestorePayload(mergedFav);
              if (payload) {
                const docId = sanitizeDocId(mergedFav.mangaId);
                favOpsToUpload.push({
                  ref: doc(db, 'users', userId, 'favorites', docId),
                  data: payload,
                  path: `users/${userId}/favorites/${docId}`
                });
              }
            }
          }
        });

        const hydratedFavs = Array.from(mergedFavsMap.values()).map(fav => {
          const prev = localById.get(fav.mangaId);
          return {
            ...fav,
            altTitles: fav.altTitles?.length ? fav.altTitles : prev?.altTitles,
            authors: fav.authors?.length ? fav.authors : prev?.authors,
            genres: fav.genres?.length ? fav.genres : prev?.genres,
            rating: fav.rating ?? prev?.rating,
            status: fav.status || prev?.status,
            synopsis: fav.synopsis || prev?.synopsis
          };
        });

        if (staleCloudDeletes.length > 0) {
          Promise.all(staleCloudDeletes).catch(() => {});
        }

        // 2. Merge History / Reading Progress (Cloud <-> Local)
        const cloudHistory = new Map<string, ReadingProgress>();
        cloudHistSnap.forEach(docSnap => {
          const d = docSnap.data() as any;
          if (d && d.mangaId && d.chapterId) {
            cloudHistory.set(d.mangaId, {
              mangaId: d.mangaId,
              mangaTitle: d.mangaTitle,
              mangaCover: d.mangaCover,
              chapterId: d.chapterId,
              chapterNumber: d.chapterNumber,
              chapterTitle: d.chapterTitle,
              pageNumber: typeof d.pageNumber === 'number' ? d.pageNumber : 1,
              totalPages: d.totalPages,
              scrollRatio: d.scrollRatio,
              sourceId: d.sourceId,
              updatedAt: toEpochMs(d.updatedAt, Date.now())
            });
          }
        });

        const localHistory = HistoryService.getHistory();
        const mergedHistMap = new Map<string, ReadingProgress>(cloudHistory);
        const histOpsToUpload: Array<{ ref: ReturnType<typeof doc>; data: Record<string, any>; path: string }> = [];

        localHistory.forEach(h => {
          const existing = mergedHistMap.get(h.mangaId);
          const localTime = toEpochMs(h.updatedAt, 0);
          const cloudTime = existing ? toEpochMs(existing.updatedAt, 0) : -1;
          if (!existing || localTime > cloudTime) {
            const normalizedHist: ReadingProgress = {
              ...h,
              updatedAt: localTime || Date.now()
            };
            mergedHistMap.set(h.mangaId, normalizedHist);
            const payload = buildHistoryFirestorePayload(normalizedHist);
            if (payload) {
              const docId = sanitizeDocId(normalizedHist.mangaId);
              histOpsToUpload.push({
                ref: doc(db, 'users', userId, 'history', docId),
                data: payload,
                path: `users/${userId}/history/${docId}`
              });
            }
          }
        });

        const sortedHistory = Array.from(mergedHistMap.values())
          .sort((a, b) => toEpochMs(b.updatedAt, 0) - toEpochMs(a.updatedAt, 0))
          .slice(0, 50);

        // 3. Merge Consolidated Library State (read chapters, collections, ignored, reading time)
        const cloudSyncData = cloudSyncDoc.exists() ? cloudSyncDoc.data() : null;

        const localReadChapters = HistoryService.getReadChapters();
        const cloudReadChapters: string[] = Array.isArray(cloudSyncData?.readChapters)
          ? cloudSyncData.readChapters.filter((id: any): id is string => typeof id === 'string' && id.length > 0)
          : [];
        const mergedReadChapters = Array.from(new Set([...localReadChapters, ...cloudReadChapters])).slice(0, 4500);

        const localCollections = HistoryService.getCustomCollections();
        const cloudCollections: string[] = Array.isArray(cloudSyncData?.customCollections)
          ? cloudSyncData.customCollections.filter((c: any): c is string => typeof c === 'string' && c.trim().length > 0)
          : [];
        const mergedCollections = Array.from(new Set([...localCollections, ...cloudCollections])).slice(0, 90);

        const localIgnored = HistoryService.getIgnoredMangas();
        const cloudIgnoredIds: string[] = Array.isArray(cloudSyncData?.ignoredMangaIds)
          ? cloudSyncData.ignoredMangaIds.filter((id: any): id is string => typeof id === 'string' && id.length > 0)
          : [];
        const ignoredMap = new Map<string, IgnoredManga>();
        localIgnored.forEach(item => ignoredMap.set(item.mangaId, item));
        cloudIgnoredIds.forEach(id => {
          if (!ignoredMap.has(id)) {
            ignoredMap.set(id, {
              mangaId: id,
              title: id.replace(/^mr_[^_]+_/, '').replace(/[-_]/g, ' ') || 'Obra Dispensada',
              dismissedAt: Date.now()
            });
          }
        });
        const mergedIgnoredList = Array.from(ignoredMap.values()).slice(0, 3000);
        const mergedIgnoredIds = mergedIgnoredList.map(i => i.mangaId);

        const localSec = HistoryService.getStoredSeconds();
        const cloudSec = typeof cloudSyncData?.totalSecondsSpent === 'number' ? cloudSyncData.totalSecondsSpent : 0;
        const mergedSec = Math.max(localSec, cloudSec);

        // Apply merged cloud+local data to localStorage & notify React UI IMMEDIATELY
        isApplyingRemoteChange = true;
        try {
          localStorage.setItem('manga_reader_bookmarks_v1', JSON.stringify(hydratedFavs));
          localStorage.setItem('manga_reader_history_v1', JSON.stringify(sortedHistory));
          localStorage.setItem('manga_reader_read_chapters_v1', JSON.stringify(mergedReadChapters));
          localStorage.setItem('manga_reader_custom_collections_v1', JSON.stringify(mergedCollections));
          localStorage.setItem('manga_reader_ignored_v1', JSON.stringify(mergedIgnoredList));
          localStorage.setItem('manga_reader_reading_stats_v1', JSON.stringify({
            totalSeconds: mergedSec,
            lastReadDate: cloudSyncData?.lastReadDate || new Date().toISOString()
          }));
        } finally {
          isApplyingRemoteChange = false;
        }
        HistoryService.notifyExternalSync();

        // Push local deltas to Firestore in fast batches
        await commitBatchedWrites([...favOpsToUpload, ...histOpsToUpload]);

        const needsSyncDocWrite =
          !cloudSyncDoc.exists() ||
          mergedReadChapters.length !== cloudReadChapters.length ||
          mergedCollections.length !== cloudCollections.length ||
          mergedIgnoredIds.length !== cloudIgnoredIds.length ||
          mergedSec > cloudSec;

        if (needsSyncDocWrite) {
          const syncPayload = {
            readChapters: mergedReadChapters,
            customCollections: mergedCollections,
            ignoredMangaIds: mergedIgnoredIds,
            totalSecondsSpent: mergedSec,
            lastReadDate: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          try {
            await setDoc(syncDocRef, syncPayload, { merge: true });
          } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, `users/${userId}/library/sync`);
          }
        }

        // Attach real-time listeners once initial merge completes
        this.attachRealtimeListeners(userId);

        setSyncStatus('synced');
      } catch (err: any) {
        console.error('Error during initial sync:', err);
        setSyncStatus('error', err?.message || 'Erro na sincronização em nuvem.');
      }
    };

    inFlightSyncUserId = userId;
    inFlightSyncPromise = runSync().finally(() => {
      inFlightSyncPromise = null;
      inFlightSyncUserId = null;
    });
    return inFlightSyncPromise;
  },

  /**
   * Sets up real-time onSnapshot listeners so any changes made on another tab/device
   * immediately update localStorage and notify HistoryService subscribers.
   */
  attachRealtimeListeners(userId: string) {
    this.stopRealtimeSync();

    // 1. Favorites listener
    const favoritesCol = collection(db, 'users', userId, 'favorites');
    const unsubFav = onSnapshot(
      favoritesCol,
      (snapshot) => {
        if (isApplyingRemoteChange || snapshot.metadata.hasPendingWrites) return;
        const tombstones = readRemovedFavoriteTombstones();
        const localFavs = HistoryService.getFavorites();
        const localById = new Map(localFavs.map(f => [f.mangaId, f]));
        const favorites: FavoriteManga[] = [];
        const changedIds: string[] = [];
        const seenRemoteIds = new Set<string>();

        snapshot.forEach(docSnap => {
          const d = docSnap.data();
          if (d && d.mangaId) {
            recordCloudDocId(d.mangaId, docSnap.id);
            const cloudTime = toEpochMs(d.updatedAt, 0);
            if (isTombstonedFavorite(d.mangaId, cloudTime, tombstones)) {
              if (!pendingDeletesInFlight.has(d.mangaId)) {
                deleteDoc(docSnap.ref).catch(() => {});
              }
              return;
            }
            if (d.mangaId in tombstones && cloudTime > tombstones[d.mangaId] + TOMBSTONE_RACE_GRACE_MS) {
              clearFavoriteRemovedLocally(d.mangaId);
            }
            const prev = localById.get(d.mangaId);
            const nextEntry: FavoriteManga = {
              mangaId: d.mangaId,
              title: d.title || 'Mangá Salvo',
              coverUrl: d.coverUrl || '',
              sourceName: d.sourceName || 'MangaReader',
              sourceId: d.sourceId,
              userCategory: normalizeCategory(d.userCategory),
              userScore: typeof d.userScore === 'number' ? d.userScore : undefined,
              userNotes: typeof d.userNotes === 'string' ? d.userNotes : undefined,
              customCollections: Array.isArray(d.customCollections) ? d.customCollections : [],
              altTitles: prev?.altTitles,
              authors: prev?.authors,
              genres: prev?.genres,
              rating: prev?.rating,
              status: prev?.status,
              synopsis: prev?.synopsis,
              updatedAt: toEpochMs(d.updatedAt, Date.now())
            };
            seenRemoteIds.add(d.mangaId);
            if (
              !prev ||
              prev.title !== nextEntry.title ||
              prev.coverUrl !== nextEntry.coverUrl ||
              normalizeCategory(prev.userCategory) !== nextEntry.userCategory ||
              prev.userScore !== nextEntry.userScore ||
              (prev.userNotes || '') !== (nextEntry.userNotes || '') ||
              !stringArraysEqual(prev.customCollections, nextEntry.customCollections)
            ) {
              changedIds.push(d.mangaId);
            }
            favorites.push(nextEntry);
          }
        });

        for (const prev of localFavs) {
          if (!seenRemoteIds.has(prev.mangaId)) {
            changedIds.push(prev.mangaId);
          }
        }

        if (changedIds.length === 0) {
          setSyncStatus('synced');
          return;
        }

        isApplyingRemoteChange = true;
        try {
          localStorage.setItem('manga_reader_bookmarks_v1', JSON.stringify(favorites));
        } finally {
          isApplyingRemoteChange = false;
        }
        HistoryService.notifyExternalSync('favorites', changedIds);
        setSyncStatus('synced');
      },
      (error) => {
        setSyncStatus('error', error?.message || 'Erro ao escutar favoritos na nuvem.');
        handleFirestoreError(error, OperationType.GET, `users/${userId}/favorites`);
      }
    );
    activeUnsubscribers.push(unsubFav);

    // 2. History listener
    const historyCol = collection(db, 'users', userId, 'history');
    const unsubHist = onSnapshot(
      historyCol,
      (snapshot) => {
        if (isApplyingRemoteChange || snapshot.metadata.hasPendingWrites) return;
        const history: ReadingProgress[] = [];
        snapshot.forEach(docSnap => {
          const d = docSnap.data();
          if (d && d.mangaId && d.chapterId) {
            history.push({
              mangaId: d.mangaId,
              mangaTitle: d.mangaTitle,
              mangaCover: d.mangaCover,
              chapterId: d.chapterId,
              chapterNumber: d.chapterNumber,
              chapterTitle: d.chapterTitle,
              pageNumber: d.pageNumber || 1,
              totalPages: d.totalPages,
              scrollRatio: d.scrollRatio,
              sourceId: d.sourceId,
              updatedAt: toEpochMs(d.updatedAt, Date.now())
            });
          }
        });

        const sorted = history.sort((a, b) => toEpochMs(b.updatedAt, 0) - toEpochMs(a.updatedAt, 0)).slice(0, 50);
        const localHist = HistoryService.getHistory();
        const localById = new Map(localHist.map(h => [h.mangaId, h]));
        const changedIds: string[] = [];
        const seenIds = new Set<string>();

        for (const item of sorted) {
          seenIds.add(item.mangaId);
          const prev = localById.get(item.mangaId);
          if (
            !prev ||
            prev.chapterId !== item.chapterId ||
            prev.pageNumber !== item.pageNumber ||
            Math.abs((prev.updatedAt || 0) - (item.updatedAt || 0)) > 1000
          ) {
            changedIds.push(item.mangaId);
          }
        }
        for (const prev of localHist) {
          if (!seenIds.has(prev.mangaId)) {
            changedIds.push(prev.mangaId);
          }
        }

        if (changedIds.length === 0) {
          setSyncStatus('synced');
          return;
        }

        isApplyingRemoteChange = true;
        try {
          localStorage.setItem('manga_reader_history_v1', JSON.stringify(sorted));
        } finally {
          isApplyingRemoteChange = false;
        }
        HistoryService.notifyExternalSync('history', changedIds);
        setSyncStatus('synced');
      },
      (error) => {
        setSyncStatus('error', error?.message || 'Erro ao escutar histórico na nuvem.');
        handleFirestoreError(error, OperationType.GET, `users/${userId}/history`);
      }
    );
    activeUnsubscribers.push(unsubHist);

    // 3. Consolidated Library State listener (read chapters, custom collections & ignored)
    const syncDocRef = doc(db, 'users', userId, 'library', 'sync');
    const unsubSync = onSnapshot(
      syncDocRef,
      (docSnap) => {
        if (isApplyingRemoteChange || docSnap.metadata.hasPendingWrites) return;
        if (docSnap.exists()) {
          const data = docSnap.data();
          const changedTopics: Array<'readChapters' | 'collections' | 'ignored' | 'stats'> = [];
          isApplyingRemoteChange = true;
          try {
            if (Array.isArray(data.readChapters)) {
              const prevRead = HistoryService.getReadChapters();
              if (!stringArraysEqual(prevRead, data.readChapters)) {
                localStorage.setItem('manga_reader_read_chapters_v1', JSON.stringify(data.readChapters));
                changedTopics.push('readChapters');
              }
            }
            if (Array.isArray(data.customCollections)) {
              const prevCols = HistoryService.getCustomCollections();
              if (!stringArraysEqual(prevCols, data.customCollections)) {
                localStorage.setItem('manga_reader_custom_collections_v1', JSON.stringify(data.customCollections));
                changedTopics.push('collections');
              }
            }
            if (Array.isArray(data.ignoredMangaIds)) {
              const currentIgnored = HistoryService.getIgnoredMangas();
              const prevIds = currentIgnored.map(i => i.mangaId);
              const nextIds = data.ignoredMangaIds.filter((id: any): id is string => typeof id === 'string' && id.length > 0);
              if (!stringArraysEqual(prevIds, nextIds)) {
                const currentMap = new Map(currentIgnored.map(i => [i.mangaId, i]));
                const nextIgnored: IgnoredManga[] = nextIds.map((id: string) => currentMap.get(id) || {
                  mangaId: id,
                  title: id.replace(/^mr_[^_]+_/, '').replace(/[-_]/g, ' ') || 'Obra Dispensada',
                  dismissedAt: Date.now()
                });
                localStorage.setItem('manga_reader_ignored_v1', JSON.stringify(nextIgnored));
                changedTopics.push('ignored');
              }
            }
            if (typeof data.totalSecondsSpent === 'number') {
              const prevSec = HistoryService.getStoredSeconds();
              if (data.totalSecondsSpent !== prevSec) {
                localStorage.setItem('manga_reader_reading_stats_v1', JSON.stringify({
                  totalSeconds: data.totalSecondsSpent,
                  lastReadDate: data.lastReadDate || new Date().toISOString()
                }));
                changedTopics.push('stats');
              }
            }
          } finally {
            isApplyingRemoteChange = false;
          }

          if (changedTopics.length === 0) {
            setSyncStatus('synced');
            return;
          }

          HistoryService.notifyExternalSync(
            changedTopics,
            changedTopics.includes('ignored') ? '*' : []
          );
          setSyncStatus('synced');
        }
      },
      (error) => {
        setSyncStatus('error', error?.message || 'Erro ao escutar estado da biblioteca na nuvem.');
        handleFirestoreError(error, OperationType.GET, `users/${userId}/library/sync`);
      }
    );
    activeUnsubscribers.push(unsubSync);
  },

  /**
   * Pushes a single favorite update or creation to Firestore in real-time
   */
  async pushFavorite(favorite: FavoriteManga): Promise<void> {
    if (favorite?.mangaId) {
      clearFavoriteRemovedLocally(favorite.mangaId);
      pendingDeletesInFlight.delete(favorite.mangaId);
    }
    const user = auth.currentUser;
    if (!user || isApplyingRemoteChange) return;
    const payload = buildFavoriteFirestorePayload(favorite);
    if (!payload) return;

    const docId = sanitizeDocId(favorite.mangaId);
    recordCloudDocId(favorite.mangaId, docId);
    const ref = doc(db, 'users', user.uid, 'favorites', docId);
    try {
      await setDoc(ref, payload, { merge: true });
    } catch (e) {
      console.warn('Failed to push favorite to cloud', e);
    }
  },

  /**
   * Removes a favorite document from Firestore in real-time (including any mismatched legacy docIds)
   */
  async removeFavorite(mangaId: string): Promise<void> {
    if (!mangaId) return;
    markFavoriteRemovedLocally(mangaId);
    pendingDeletesInFlight.add(mangaId);

    const user = auth.currentUser;
    if (!user || isApplyingRemoteChange) {
      pendingDeletesInFlight.delete(mangaId);
      return;
    }

    const docIdsToDelete = new Set<string>([sanitizeDocId(mangaId)]);
    const knownIds = knownDocIdsByMangaId.get(mangaId);
    if (knownIds) {
      knownIds.forEach(id => docIdsToDelete.add(id));
    }

    try {
      await Promise.all(
        Array.from(docIdsToDelete).map(docId =>
          deleteDoc(doc(db, 'users', user.uid, 'favorites', docId))
        )
      );
      knownDocIdsByMangaId.delete(mangaId);
    } catch (e) {
      console.warn('Failed to remove favorite from cloud', e);
    } finally {
      pendingDeletesInFlight.delete(mangaId);
    }
  },

  /**
   * Pushes reading progress to Firestore
   */
  async pushReadingProgress(progress: ReadingProgress): Promise<void> {
    const user = auth.currentUser;
    if (!user || isApplyingRemoteChange) return;
    const payload = buildHistoryFirestorePayload(progress);
    if (!payload) return;

    const docId = sanitizeDocId(progress.mangaId);
    const ref = doc(db, 'users', user.uid, 'history', docId);
    try {
      await setDoc(ref, payload, { merge: true });
    } catch (e) {
      console.warn('Failed to push progress to cloud', e);
    }
  },

  /**
   * Pushes updated library metadata (read chapters, custom collections, ignored, stats) to Firestore
   */
  async pushLibraryState(): Promise<void> {
    const user = auth.currentUser;
    if (!user || isApplyingRemoteChange) return;
    const ref = doc(db, 'users', user.uid, 'library', 'sync');
    try {
      const payload = {
        readChapters: HistoryService.getReadChapters().filter(Boolean).slice(0, 4500),
        customCollections: HistoryService.getCustomCollections().filter(Boolean).slice(0, 90),
        ignoredMangaIds: HistoryService.getIgnoredMangas().map(i => i.mangaId).filter(Boolean).slice(0, 3000),
        totalSecondsSpent: HistoryService.getStoredSeconds(),
        lastReadDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(ref, payload, { merge: true });
    } catch (e) {
      console.warn('Failed to push library state to cloud', e);
    }
  }
};

let libraryStatePushTimer: ReturnType<typeof setTimeout> | null = null;
let hasPendingLibraryStatePush = false;
const progressPushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingProgressByManga = new Map<string, ReadingProgress>();

function scheduleReadingProgressPush(progress: ReadingProgress) {
  if (!auth.currentUser || isApplyingRemoteChange || !progress?.mangaId) return;
  pendingProgressByManga.set(progress.mangaId, progress);
  const existing = progressPushTimers.get(progress.mangaId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    progressPushTimers.delete(progress.mangaId);
    const latest = pendingProgressByManga.get(progress.mangaId);
    pendingProgressByManga.delete(progress.mangaId);
    if (latest) {
      FirebaseSyncService.pushReadingProgress(latest);
    }
  }, 1500);
  progressPushTimers.set(progress.mangaId, timer);
}

function flushPendingProgressPushes() {
  progressPushTimers.forEach(timer => clearTimeout(timer));
  progressPushTimers.clear();
  if (pendingProgressByManga.size === 0) return;
  const items = Array.from(pendingProgressByManga.values());
  pendingProgressByManga.clear();
  items.forEach(item => {
    FirebaseSyncService.pushReadingProgress(item);
  });
}

function scheduleLibraryStatePush() {
  if (!auth.currentUser || isApplyingRemoteChange) return;
  hasPendingLibraryStatePush = true;
  if (libraryStatePushTimer) clearTimeout(libraryStatePushTimer);
  libraryStatePushTimer = setTimeout(() => {
    libraryStatePushTimer = null;
    if (hasPendingLibraryStatePush) {
      hasPendingLibraryStatePush = false;
      FirebaseSyncService.pushLibraryState();
    }
  }, 1200);
}

function flushPendingLibraryStatePush() {
  if (libraryStatePushTimer) {
    clearTimeout(libraryStatePushTimer);
    libraryStatePushTimer = null;
  }
  if (hasPendingLibraryStatePush) {
    hasPendingLibraryStatePush = false;
    FirebaseSyncService.pushLibraryState();
  }
}

// Register sync bridge with HistoryService
HistoryService.setSyncBridge({
  onProgressSaved: (prog) => {
    scheduleReadingProgressPush(prog);
    TrackerService.scrobbleChapter(prog.mangaId, prog.mangaTitle, prog.chapterNumber).catch(() => {});
  },
  onFavoriteUpdated: (fav) => {
    FirebaseSyncService.pushFavorite(fav);
    TrackerService.updateTrackerStatus(fav.mangaId, fav.title, fav.userCategory || 'reading', fav.userScore).catch(() => {});
  },
  onFavoriteRemoved: (mangaId) => {
    FirebaseSyncService.removeFavorite(mangaId);
  },
  onLibraryStateChanged: () => {
    scheduleLibraryStatePush();
  },
  onBulkImported: () => {
    flushPendingProgressPushes();
    flushPendingLibraryStatePush();
    const user = FirebaseSyncService.getCurrentUser();
    if (user) {
      FirebaseSyncService.syncAllData(user.uid);
    }
  }
});

// Monitor Auth State and automatically initialize/teardown sync
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!event.key || event.key === REMOVED_FAV_TOMBSTONES_KEY) {
      cachedRemovedTombstones = null;
    }
  });
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingProgressPushes();
      flushPendingLibraryStatePush();
    }
  });
  window.addEventListener('pagehide', () => {
    flushPendingProgressPushes();
    flushPendingLibraryStatePush();
  });

  onAuthStateChanged(auth, (user) => {
    if (user) {
      FirebaseSyncService.syncAllData(user.uid);
    } else {
      FirebaseSyncService.stopRealtimeSync();
      setSyncStatus('offline');
    }
  });
}
