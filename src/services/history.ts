import { ReadingProgress } from '../types/manga.js';

const STORAGE_KEY = 'manga_reader_history_v1';
const BOOKMARKS_KEY = 'manga_reader_bookmarks_v1';

export const HistoryService = {
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
    } catch (e) {
      console.warn('Failed to save reading history', e);
    }
  },

  removeHistory(mangaId: string): void {
    try {
      const list = this.getHistory().filter(item => item.mangaId !== mangaId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to remove reading history', e);
    }
  },

  getBookmarks(): string[] {
    try {
      const data = localStorage.getItem(BOOKMARKS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  toggleBookmark(mangaId: string): boolean {
    try {
      const bookmarks = this.getBookmarks();
      const exists = bookmarks.includes(mangaId);
      const updated = exists ? bookmarks.filter(id => id !== mangaId) : [...bookmarks, mangaId];
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
      return !exists;
    } catch {
      return false;
    }
  },

  isBookmarked(mangaId: string): boolean {
    return this.getBookmarks().includes(mangaId);
  }
};
