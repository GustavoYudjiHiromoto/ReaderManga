import { ReadingProgress, FavoriteManga } from '../types/manga.js';

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
  }
};

