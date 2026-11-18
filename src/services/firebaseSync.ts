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
  currentStatus = status;
  if (status === 'synced') {
    lastSyncedTime = new Date();
    syncErrorMessage = null;
  } else if (status === 'error') {
    syncErrorMessage = err;
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

        // 1. Merge Favorites (Cloud <-> Local)
        const cloudFavs = new Map<string, FavoriteManga>();
        cloudFavSnap.forEach(docSnap => {
          const d = docSnap.data() as any;
          if (d && d.mangaId) {
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
          const existing = mergedFavsMap.get(f.mangaId);
          const localTime = toEpochMs(f.updatedAt, 0);
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
        if (isApplyingRemoteChange) return;
        const localById = new Map(HistoryService.getFavorites().map(f => [f.mangaId, f]));
        const favorites: FavoriteManga[] = [];
        snapshot.forEach(docSnap => {
          const d = docSnap.data();
          if (d && d.mangaId) {
            const prev = localById.get(d.mangaId);
            favorites.push({
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
            });
          }
        });

        isApplyingRemoteChange = true;
        try {
          localStorage.setItem('manga_reader_bookmarks_v1', JSON.stringify(favorites));
        } finally {
          isApplyingRemoteChange = false;
        }
        HistoryService.notifyExternalSync();
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
        if (isApplyingRemoteChange) return;
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

        isApplyingRemoteChange = true;
        try {
          const sorted = history.sort((a, b) => toEpochMs(b.updatedAt, 0) - toEpochMs(a.updatedAt, 0)).slice(0, 50);
          localStorage.setItem('manga_reader_history_v1', JSON.stringify(sorted));
        } finally {
          isApplyingRemoteChange = false;
        }
        HistoryService.notifyExternalSync();
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
        if (isApplyingRemoteChange) return;
        if (docSnap.exists()) {
          const data = docSnap.data();
          isApplyingRemoteChange = true;
          try {
            if (Array.isArray(data.readChapters)) {
              localStorage.setItem('manga_reader_read_chapters_v1', JSON.stringify(data.readChapters));
            }
            if (Array.isArray(data.customCollections)) {
              localStorage.setItem('manga_reader_custom_collections_v1', JSON.stringify(data.customCollections));
            }
            if (Array.isArray(data.ignoredMangaIds)) {
              const currentIgnored = HistoryService.getIgnoredMangas();
              const currentMap = new Map(currentIgnored.map(i => [i.mangaId, i]));
              const nextIgnored: IgnoredManga[] = data.ignoredMangaIds
                .filter((id: any) => typeof id === 'string' && id)
                .map((id: string) => currentMap.get(id) || {
                  mangaId: id,
                  title: id.replace(/^mr_[^_]+_/, '').replace(/[-_]/g, ' ') || 'Obra Dispensada',
                  dismissedAt: Date.now()
                });
              localStorage.setItem('manga_reader_ignored_v1', JSON.stringify(nextIgnored));
            }
            if (typeof data.totalSecondsSpent === 'number') {
              localStorage.setItem('manga_reader_reading_stats_v1', JSON.stringify({
                totalSeconds: data.totalSecondsSpent,
                lastReadDate: data.lastReadDate || new Date().toISOString()
              }));
            }
          } finally {
            isApplyingRemoteChange = false;
          }
          HistoryService.notifyExternalSync();
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
    const user = auth.currentUser;
    if (!user || isApplyingRemoteChange) return;
    const payload = buildFavoriteFirestorePayload(favorite);
    if (!payload) return;

    const docId = sanitizeDocId(favorite.mangaId);
    const ref = doc(db, 'users', user.uid, 'favorites', docId);
    try {
      await setDoc(ref, payload, { merge: true });
    } catch (e) {
      console.warn('Failed to push favorite to cloud', e);
    }
  },

  /**
   * Removes a favorite document from Firestore in real-time
   */
  async removeFavorite(mangaId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || isApplyingRemoteChange) return;
    const docId = sanitizeDocId(mangaId);
    const ref = doc(db, 'users', user.uid, 'favorites', docId);
    try {
      await deleteDoc(ref);
    } catch (e) {
      console.warn('Failed to remove favorite from cloud', e);
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

// Register sync bridge with HistoryService
HistoryService.setSyncBridge({
  onProgressSaved: (prog) => {
    FirebaseSyncService.pushReadingProgress(prog);
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
    FirebaseSyncService.pushLibraryState();
  },
  onBulkImported: () => {
    const user = FirebaseSyncService.getCurrentUser();
    if (user) {
      FirebaseSyncService.syncAllData(user.uid);
    }
  }
});

// Monitor Auth State and automatically initialize/teardown sync
if (typeof window !== 'undefined') {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      FirebaseSyncService.syncAllData(user.uid);
    } else {
      FirebaseSyncService.stopRealtimeSync();
      setSyncStatus('offline');
    }
  });
}
