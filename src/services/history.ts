import { ReadingProgress, FavoriteManga, LibraryBackup } from '../types/manga.js';

const STORAGE_KEY = 'manga_reader_history_v1';
const BOOKMARKS_KEY = 'manga_reader_bookmarks_v1';

type HistoryListener = () => void;
const listeners = new Set<HistoryListener>();

function notifyListeners() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.warn('History listener error', e);
    }
  });
}

// Listen to changes across tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === BOOKMARKS_KEY) {
      notifyListeners();
    }
  });
}

export const HistoryService = {
  subscribe(listener: HistoryListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getHistory(): ReadingProgress[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  getProgress(mangaId: string): ReadingProgress | undefined {
    const list = this.getHistory();
    return list.find(item => item.mangaId === mangaId);
  },

  saveProgress(progress: Omit<ReadingProgress, 'updatedAt'>): void {
    try {
      const list = this.getHistory();
      const filtered = list.filter(item => item.mangaId !== progress.mangaId);
      const updated: ReadingProgress = {
        ...progress,
        updatedAt: Date.now()
      };
      // Keep most recent 20 items
      const newList = [updated, ...filtered].slice(0, 20);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
      notifyListeners();
    } catch (e) {
      console.warn('Failed to save reading history', e);
    }
  },

  removeHistory(mangaId: string): void {
    try {
      const list = this.getHistory().filter(item => item.mangaId !== mangaId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      notifyListeners();
    } catch (e) {
      console.warn('Failed to remove reading history', e);
    }
  },

  /**
   * Returns list of rich favorites, seamlessly migrating legacy string[] format
   * without losing any previously saved IDs.
   */
  getFavorites(): FavoriteManga[] {
    try {
      const data = localStorage.getItem(BOOKMARKS_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];

      let hasLegacyStrings = false;
      const historyList = this.getHistory();

      const normalized: FavoriteManga[] = parsed.map((item: any) => {
        if (typeof item === 'string') {
          hasLegacyStrings = true;
          const hist = historyList.find(h => h.mangaId === item);
          const sourceName = item.includes('mangadex') ? 'MangaDex' :
                             item.includes('comick') ? 'Comick' :
                             item.includes('weebcentral') ? 'WeebCentral' :
                             item.includes('guya') ? 'Guya/Cubari' : 'MangaReader';
          return {
            mangaId: item,
            title: hist?.mangaTitle || item.replace(/^mr_[^_]+_/, '').replace(/[-_]/g, ' ') || 'Mangá Salvo',
            coverUrl: hist?.mangaCover || '',
            sourceName,
            updatedAt: Date.now()
          };
        }
        return {
          mangaId: item.mangaId || item.id,
          title: item.title || 'Mangá Salvo',
          coverUrl: item.coverUrl || '',
          sourceName: item.sourceName || 'MangaReader',
          sourceId: item.sourceId,
          rating: item.rating,
          authors: item.authors || [],
          genres: item.genres || [],
          status: item.status,
          updatedAt: item.updatedAt || Date.now()
        };
      });

      const valid = normalized.filter(f => Boolean(f.mangaId));

      // Rewrite localStorage if legacy strings were migrated
      if (hasLegacyStrings) {
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(valid));
      }

      return valid;
    } catch {
      return [];
    }
  },

  /**
   * Backward-compatible array of IDs for components still expecting string[]
   */
  getBookmarks(): string[] {
    return this.getFavorites().map(f => f.mangaId);
  },

  toggleBookmark(mangaOrId: string | (Partial<FavoriteManga> & { mangaId: string })): boolean {
    try {
      const mangaId = typeof mangaOrId === 'string' ? mangaOrId : mangaOrId.mangaId;
      const favorites = this.getFavorites();
      const exists = favorites.some(f => f.mangaId === mangaId);

      let updated: FavoriteManga[];
      if (exists) {
        updated = favorites.filter(f => f.mangaId !== mangaId);
      } else {
        const newFav: FavoriteManga = typeof mangaOrId === 'string' ? {
          mangaId,
          title: 'Mangá Salvo',
          coverUrl: '',
          sourceName: 'MangaReader',
          updatedAt: Date.now()
        } : {
          mangaId,
          title: mangaOrId.title || 'Mangá Salvo',
          coverUrl: mangaOrId.coverUrl || '',
          sourceName: mangaOrId.sourceName || 'MangaReader',
          sourceId: mangaOrId.sourceId,
          rating: mangaOrId.rating,
          authors: mangaOrId.authors || [],
          genres: mangaOrId.genres || [],
          status: mangaOrId.status,
          updatedAt: Date.now()
        };
        updated = [newFav, ...favorites];
      }

      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
      notifyListeners();
      return !exists;
    } catch {
      return false;
    }
  },

  removeFavorite(mangaId: string): void {
    try {
      const favorites = this.getFavorites().filter(f => f.mangaId !== mangaId);
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(favorites));
      notifyListeners();
    } catch (e) {
      console.warn('Failed to remove favorite', e);
    }
  },

  isBookmarked(mangaId: string): boolean {
    return this.getFavorites().some(f => f.mangaId === mangaId);
  },

  /**
   * Export all user data (favorites + reading history) as a structured backup object
   */
  createBackup(): LibraryBackup {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: 'MangaReader',
      favorites: this.getFavorites(),
      history: this.getHistory()
    };
  },

  /**
   * Triggers browser download of backup JSON file
   */
  downloadBackupFile(): void {
    if (typeof window === 'undefined') return;
    const backup = this.createBackup();
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `mangareader-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Restores/merges library backup from JSON string or object
   */
  importBackup(backupInput: string | Record<string, any>): {
    success: boolean;
    favoritesAdded: number;
    historyAdded: number;
    totalFavorites: number;
    totalHistory: number;
    message?: string;
  } {
    try {
      const data = typeof backupInput === 'string' ? JSON.parse(backupInput) : backupInput;
      if (!data || typeof data !== 'object') {
        throw new Error('Arquivo de backup inválido ou corrompido.');
      }

      // Extract raw favorites & history
      let importedFavorites: FavoriteManga[] = [];
      let importedHistory: ReadingProgress[] = [];

      if (Array.isArray(data.favorites)) {
        importedFavorites = data.favorites;
      } else if (Array.isArray(data.bookmarks)) {
        importedFavorites = data.bookmarks.map((b: any) =>
          typeof b === 'string' ? { mangaId: b, title: 'Mangá Salvo', coverUrl: '', updatedAt: Date.now() } : b
        );
      } else if (Array.isArray(data)) {
        // Direct array of favorites or history
        if (data.length > 0 && ('chapterId' in data[0])) {
          importedHistory = data;
        } else {
          importedFavorites = data;
        }
      }

      if (Array.isArray(data.history)) {
        importedHistory = data.history;
      }

      // Merge Favorites without duplicates
      const currentFavorites = this.getFavorites();
      const favMap = new Map<string, FavoriteManga>();
      currentFavorites.forEach(f => favMap.set(f.mangaId, f));

      let favAdded = 0;
      importedFavorites.forEach(f => {
        if (!f || !f.mangaId) return;
        if (!favMap.has(f.mangaId)) {
          favAdded++;
        }
        // Preserve richest info or latest
        const existing = favMap.get(f.mangaId);
        favMap.set(f.mangaId, {
          mangaId: f.mangaId,
          title: f.title || existing?.title || 'Mangá Salvo',
          coverUrl: f.coverUrl || existing?.coverUrl || '',
          sourceName: f.sourceName || existing?.sourceName || 'MangaReader',
          sourceId: f.sourceId || existing?.sourceId,
          rating: f.rating || existing?.rating,
          authors: f.authors || existing?.authors || [],
          genres: f.genres || existing?.genres || [],
          status: f.status || existing?.status,
          updatedAt: Math.max(f.updatedAt || 0, existing?.updatedAt || 0) || Date.now()
        });
      });

      const mergedFavorites = Array.from(favMap.values());
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(mergedFavorites));

      // Merge Reading History
      const currentHistory = this.getHistory();
      const histMap = new Map<string, ReadingProgress>();
      currentHistory.forEach(h => histMap.set(h.mangaId, h));

      let histAdded = 0;
      importedHistory.forEach(h => {
        if (!h || !h.mangaId || !h.chapterId) return;
        const existing = histMap.get(h.mangaId);
        if (!existing) {
          histAdded++;
          histMap.set(h.mangaId, h);
        } else if ((h.updatedAt || 0) > (existing.updatedAt || 0)) {
          histMap.set(h.mangaId, h);
        }
      });

      const mergedHistory = Array.from(histMap.values())
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 50);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedHistory));
      notifyListeners();

      return {
        success: true,
        favoritesAdded: favAdded,
        historyAdded: histAdded,
        totalFavorites: mergedFavorites.length,
        totalHistory: mergedHistory.length
      };
    } catch (err) {
      return {
        success: false,
        favoritesAdded: 0,
        historyAdded: 0,
        totalFavorites: this.getFavorites().length,
        totalHistory: this.getHistory().length,
        message: (err as Error).message || 'Falha ao processar arquivo de restauração.'
      };
    }
  }
};

