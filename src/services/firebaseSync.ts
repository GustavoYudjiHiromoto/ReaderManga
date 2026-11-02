import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  getDocs,
  getDoc,
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
import { FavoriteManga, ReadingProgress } from '../types/manga.js';
import { TrackerService } from './trackerService.js';

export function sanitizeDocId(rawId: string): string {
  if (!rawId) return 'unknown';
  const clean = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return clean.slice(0, 120) || 'item';
}

export type SyncStatus = 'offline' | 'idle' | 'syncing' | 'synced' | 'error';

type SyncListener = () => void;
const syncListeners = new Set<SyncListener>();

let currentStatus: SyncStatus = 'offline';
let lastSyncedTime: Date | null = null;
let syncErrorMessage: string | null = null;
let activeUnsubscribers: Unsubscribe[] = [];
let isApplyingRemoteChange = false;

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
        // Save/Update user profile
        const userDocRef = doc(db, 'users', user.uid);
        const userPayload = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || user.email?.split('@')[0] || 'Leitor',
          photoURL: user.photoURL || '',
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
      // Detach Firestore snapshot listeners
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
   * Performs an initial two-way merge between local storage and Firestore:
   * 1. Fetches cloud data.
   * 2. Merges with local data (no data lost on either side).
   * 3. Pushes merged result back to cloud.
   * 4. Attaches onSnapshot real-time listeners for continuous multi-device sync.
   */
  async syncAllData(userId: string): Promise<void> {
    if (!userId) return;
    setSyncStatus('syncing');

    try {
      // 1. Sync Favorites
      const favoritesCol = collection(db, 'users', userId, 'favorites');
      let cloudFavSnap;
      try {
        cloudFavSnap = await getDocs(favoritesCol);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, `users/${userId}/favorites`);
      }

      const cloudFavs = new Map<string, FavoriteManga>();
      cloudFavSnap.forEach(docSnap => {
        const d = docSnap.data() as FavoriteManga;
        if (d && d.mangaId) {
          cloudFavs.set(d.mangaId, d);
        }
      });

      const localFavs = HistoryService.getFavorites();
      const mergedFavsMap = new Map<string, FavoriteManga>(cloudFavs);

      // Merge local favorites into map
      localFavs.forEach(f => {
        const existing = mergedFavsMap.get(f.mangaId);
        if (!existing) {
          mergedFavsMap.set(f.mangaId, f);
        } else {
          // Keep newest or richer record
          const newer = (f.updatedAt || 0) >= (existing.updatedAt || 0) ? f : existing;
          mergedFavsMap.set(f.mangaId, {
            ...existing,
            ...f,
            userCategory: newer.userCategory,
            userScore: f.userScore !== undefined ? f.userScore : existing.userScore,
            userNotes: f.userNotes !== undefined ? f.userNotes : existing.userNotes,
            customCollections: Array.from(new Set([...(existing.customCollections || []), ...(f.customCollections || [])])),
            updatedAt: Math.max(f.updatedAt || 0, existing.updatedAt || 0)
          });
        }
      });

      // Upload merged favorites to cloud
      for (const fav of mergedFavsMap.values()) {
        const docId = sanitizeDocId(fav.mangaId);
        const ref = doc(db, 'users', userId, 'favorites', docId);
        const cleanPayload: Record<string, any> = {
          mangaId: fav.mangaId,
          title: fav.title.slice(0, 510),
          userCategory: fav.userCategory || 'reading',
          updatedAt: new Date(fav.updatedAt || Date.now()).toISOString()
        };
        if (fav.coverUrl) cleanPayload.coverUrl = fav.coverUrl.slice(0, 2040);
        if (fav.sourceName) cleanPayload.sourceName = fav.sourceName.slice(0, 60);
        if (fav.sourceId) cleanPayload.sourceId = fav.sourceId.slice(0, 60);
        if (typeof fav.userScore === 'number') cleanPayload.userScore = fav.userScore;
        if (fav.userNotes) cleanPayload.userNotes = fav.userNotes.slice(0, 2040);
        if (Array.isArray(fav.customCollections) && fav.customCollections.length > 0) {
          cleanPayload.customCollections = fav.customCollections.slice(0, 50);
        }

        try {
          await setDoc(ref, cleanPayload, { merge: true });
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `users/${userId}/favorites/${docId}`);
        }
      }

      // Update local storage without re-triggering duplicate uploads
      isApplyingRemoteChange = true;
      try {
        localStorage.setItem('manga_reader_bookmarks_v1', JSON.stringify(Array.from(mergedFavsMap.values())));
      } finally {
        isApplyingRemoteChange = false;
      }

      // 2. Sync History / Reading Progress
      const historyCol = collection(db, 'users', userId, 'history');
      let cloudHistSnap;
      try {
        cloudHistSnap = await getDocs(historyCol);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, `users/${userId}/history`);
      }

      const cloudHistory = new Map<string, ReadingProgress>();
      cloudHistSnap.forEach(docSnap => {
        const d = docSnap.data() as ReadingProgress;
        if (d && d.mangaId) {
          cloudHistory.set(d.mangaId, d);
        }
      });

      const localHistory = HistoryService.getHistory();
      const mergedHistMap = new Map<string, ReadingProgress>(cloudHistory);

      localHistory.forEach(h => {
        const existing = mergedHistMap.get(h.mangaId);
        if (!existing || (h.updatedAt || 0) > (existing.updatedAt || 0)) {
          mergedHistMap.set(h.mangaId, h);
        }
      });

      for (const hist of mergedHistMap.values()) {
        const docId = sanitizeDocId(hist.mangaId);
        const ref = doc(db, 'users', userId, 'history', docId);
        const cleanPayload: Record<string, any> = {
          mangaId: hist.mangaId,
          chapterId: hist.chapterId,
          pageNumber: hist.pageNumber || 1,
          updatedAt: new Date(hist.updatedAt || Date.now()).toISOString()
        };
        if (hist.mangaTitle) cleanPayload.mangaTitle = hist.mangaTitle.slice(0, 510);
        if (hist.mangaCover) cleanPayload.mangaCover = hist.mangaCover.slice(0, 2040);
        if (hist.chapterNumber) cleanPayload.chapterNumber = String(hist.chapterNumber).slice(0, 60);
        if (hist.chapterTitle) cleanPayload.chapterTitle = hist.chapterTitle.slice(0, 250);
        if (typeof hist.totalPages === 'number') cleanPayload.totalPages = hist.totalPages;
        if (typeof hist.scrollRatio === 'number') cleanPayload.scrollRatio = Math.max(0, Math.min(1, hist.scrollRatio));
        if (hist.sourceId) cleanPayload.sourceId = hist.sourceId.slice(0, 60);

        try {
          await setDoc(ref, cleanPayload, { merge: true });
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `users/${userId}/history/${docId}`);
        }
      }

      isApplyingRemoteChange = true;
      try {
        const sortedHistory = Array.from(mergedHistMap.values())
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
          .slice(0, 50);
        localStorage.setItem('manga_reader_history_v1', JSON.stringify(sortedHistory));
      } finally {
        isApplyingRemoteChange = false;
      }

      // 3. Sync Consolidated Library State (read chapters, custom collections, stats)
      const syncDocRef = doc(db, 'users', userId, 'library', 'sync');
      let cloudSyncDoc;
      try {
        cloudSyncDoc = await getDoc(syncDocRef);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, `users/${userId}/library/sync`);
      }

      const cloudSyncData = cloudSyncDoc.exists() ? cloudSyncDoc.data() : null;

      const localReadChapters = HistoryService.getReadChapters();
      const cloudReadChapters: string[] = Array.isArray(cloudSyncData?.readChapters) ? cloudSyncData.readChapters : [];
      const mergedReadChapters = Array.from(new Set([...localReadChapters, ...cloudReadChapters])).slice(0, 4500);

      const localCollections = HistoryService.getCustomCollections();
      const cloudCollections: string[] = Array.isArray(cloudSyncData?.customCollections) ? cloudSyncData.customCollections : [];
      const mergedCollections = Array.from(new Set([...localCollections, ...cloudCollections])).slice(0, 90);

      const localSec = HistoryService.getStoredSeconds();
      const cloudSec = typeof cloudSyncData?.totalSecondsSpent === 'number' ? cloudSyncData.totalSecondsSpent : 0;
      const mergedSec = Math.max(localSec, cloudSec);

      const syncPayload = {
        readChapters: mergedReadChapters,
        customCollections: mergedCollections,
        totalSecondsSpent: mergedSec,
        lastReadDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      try {
        await setDoc(syncDocRef, syncPayload, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `users/${userId}/library/sync`);
      }

      isApplyingRemoteChange = true;
      try {
        localStorage.setItem('manga_reader_read_chapters_v1', JSON.stringify(mergedReadChapters));
        localStorage.setItem('manga_reader_custom_collections_v1', JSON.stringify(mergedCollections));
        localStorage.setItem('manga_reader_reading_stats_v1', JSON.stringify({
          totalSeconds: mergedSec,
          lastReadDate: new Date().toISOString()
        }));
      } finally {
        isApplyingRemoteChange = false;
      }

      // Setup continuous real-time listeners for updates across devices
      this.attachRealtimeListeners(userId);

      setSyncStatus('synced');
    } catch (err: any) {
      console.error('Error during initial sync:', err);
      setSyncStatus('error', err?.message || 'Erro na sincronização em nuvem.');
    }
  },

  /**
   * Sets up real-time onSnapshot listeners so any changes made on another tab/device
   * immediately update the local client and UI.
   */
  attachRealtimeListeners(userId: string) {
    this.stopRealtimeSync();

    // 1. Favorites listener
    const favoritesCol = collection(db, 'users', userId, 'favorites');
    const unsubFav = onSnapshot(
      favoritesCol,
      (snapshot) => {
        if (isApplyingRemoteChange) return;
        const favorites: FavoriteManga[] = [];
        snapshot.forEach(docSnap => {
          const d = docSnap.data();
          if (d && d.mangaId) {
            favorites.push({
              mangaId: d.mangaId,
              title: d.title || 'Mangá Salvo',
              coverUrl: d.coverUrl || '',
              sourceName: d.sourceName || 'MangaReader',
              sourceId: d.sourceId,
              userCategory: d.userCategory || 'reading',
              userScore: typeof d.userScore === 'number' ? d.userScore : undefined,
              userNotes: typeof d.userNotes === 'string' ? d.userNotes : undefined,
              customCollections: Array.isArray(d.customCollections) ? d.customCollections : [],
              updatedAt: d.updatedAt ? new Date(d.updatedAt).getTime() : Date.now()
            });
          }
        });

        isApplyingRemoteChange = true;
        try {
          localStorage.setItem('manga_reader_bookmarks_v1', JSON.stringify(favorites));
          // Trigger local history listeners so UI immediately re-renders
          window.dispatchEvent(new Event('storage'));
        } finally {
          isApplyingRemoteChange = false;
        }
        setSyncStatus('synced');
      },
      (error) => {
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
              updatedAt: d.updatedAt ? new Date(d.updatedAt).getTime() : Date.now()
            });
          }
        });

        isApplyingRemoteChange = true;
        try {
          const sorted = history.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 50);
          localStorage.setItem('manga_reader_history_v1', JSON.stringify(sorted));
          window.dispatchEvent(new Event('storage'));
        } finally {
          isApplyingRemoteChange = false;
        }
        setSyncStatus('synced');
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${userId}/history`);
      }
    );
    activeUnsubscribers.push(unsubHist);

    // 3. Consolidated Library State listener (read chapters & custom collections)
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
            if (typeof data.totalSecondsSpent === 'number') {
              localStorage.setItem('manga_reader_reading_stats_v1', JSON.stringify({
                totalSeconds: data.totalSecondsSpent,
                lastReadDate: data.lastReadDate || new Date().toISOString()
              }));
            }
            window.dispatchEvent(new Event('storage'));
          } finally {
            isApplyingRemoteChange = false;
          }
          setSyncStatus('synced');
        }
      },
      (error) => {
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
    try {
      const docId = sanitizeDocId(favorite.mangaId);
      const ref = doc(db, 'users', user.uid, 'favorites', docId);
      const payload: Record<string, any> = {
        mangaId: favorite.mangaId,
        title: favorite.title.slice(0, 510),
        userCategory: favorite.userCategory || 'reading',
        updatedAt: new Date().toISOString()
      };
      if (favorite.coverUrl) payload.coverUrl = favorite.coverUrl.slice(0, 2040);
      if (favorite.sourceName) payload.sourceName = favorite.sourceName.slice(0, 60);
      if (favorite.sourceId) payload.sourceId = favorite.sourceId.slice(0, 60);
      if (typeof favorite.userScore === 'number') payload.userScore = favorite.userScore;
      if (favorite.userNotes) payload.userNotes = favorite.userNotes.slice(0, 2040);
      if (Array.isArray(favorite.customCollections) && favorite.customCollections.length > 0) {
        payload.customCollections = favorite.customCollections.slice(0, 50);
      }

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
    try {
      const docId = sanitizeDocId(mangaId);
      const ref = doc(db, 'users', user.uid, 'favorites', docId);
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
    try {
      const docId = sanitizeDocId(progress.mangaId);
      const ref = doc(db, 'users', user.uid, 'history', docId);
      const payload: Record<string, any> = {
        mangaId: progress.mangaId,
        chapterId: progress.chapterId,
        pageNumber: progress.pageNumber || 1,
        updatedAt: new Date().toISOString()
      };
      if (progress.mangaTitle) payload.mangaTitle = progress.mangaTitle.slice(0, 510);
      if (progress.mangaCover) payload.mangaCover = progress.mangaCover.slice(0, 2040);
      if (progress.chapterNumber) payload.chapterNumber = String(progress.chapterNumber).slice(0, 60);
      if (progress.chapterTitle) payload.chapterTitle = progress.chapterTitle.slice(0, 250);
      if (typeof progress.totalPages === 'number') payload.totalPages = progress.totalPages;
      if (typeof progress.scrollRatio === 'number') payload.scrollRatio = Math.max(0, Math.min(1, progress.scrollRatio));
      if (progress.sourceId) payload.sourceId = progress.sourceId.slice(0, 60);

      await setDoc(ref, payload, { merge: true });
    } catch (e) {
      console.warn('Failed to push progress to cloud', e);
    }
  },

  /**
   * Pushes updated library metadata (read chapters, custom collections, stats) to Firestore
   */
  async pushLibraryState(): Promise<void> {
    const user = auth.currentUser;
    if (!user || isApplyingRemoteChange) return;
    try {
      const ref = doc(db, 'users', user.uid, 'library', 'sync');
      const payload = {
        readChapters: HistoryService.getReadChapters().slice(0, 4500),
        customCollections: HistoryService.getCustomCollections().slice(0, 90),
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
