import { MangaPage } from '../types/manga.js';

export interface SavedOfflineChapter {
  chapterId: string;
  chapterNumber: string;
  chapterTitle?: string;
  mangaId: string;
  mangaTitle: string;
  mangaCover: string;
  pageCount: number;
  savedAt: number;
  pages: MangaPage[];
}

const CACHE_NAME = 'mangareader-offline-pages';
const MANIFEST_KEY = 'mr_offline_manifest_v2';
const LEGACY_KEY = 'mr_offline_chapters';

type OfflineListener = () => void;
const listeners = new Set<OfflineListener>();

const notifyListeners = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('[OfflineCache] Listener error:', e);
    }
  });
};

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === MANIFEST_KEY || e.key === LEGACY_KEY) {
      notifyListeners();
    }
  });
}

export const OfflineCacheService = {
  /**
   * Subscribe to offline cache changes
   */
  subscribe(listener: OfflineListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Check if Cache API is supported in this browser
   */
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'caches' in window;
  },

  /**
   * Get all offline saved chapter records
   */
  getAllSavedChapters(): SavedOfflineChapter[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(MANIFEST_KEY);
      if (!raw) {
        // Fallback check legacy IDs
        const legacyRaw = localStorage.getItem(LEGACY_KEY);
        if (!legacyRaw) return [];
        const legacyIds: string[] = JSON.parse(legacyRaw);
        return legacyIds.map(id => ({
          chapterId: id,
          chapterNumber: '?',
          mangaId: 'unknown',
          mangaTitle: 'Capítulo em Cache',
          mangaCover: '',
          pageCount: 0,
          savedAt: Date.now(),
          pages: []
        }));
      }
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  /**
   * Get single offline saved chapter record
   */
  getOfflineChapter(chapterId: string): SavedOfflineChapter | null {
    const list = this.getAllSavedChapters();
    return list.find(item => item.chapterId === chapterId) || null;
  },

  /**
   * Get all saved chapters for a specific manga
   */
  getSavedChaptersForManga(mangaId: string): SavedOfflineChapter[] {
    const list = this.getAllSavedChapters();
    return list.filter(item => item.mangaId === mangaId);
  },

  /**
   * Check if a chapter is saved offline
   */
  isChapterSaved(chapterId: string): boolean {
    const list = this.getAllSavedChapters();
    if (list.some(item => item.chapterId === chapterId)) return true;
    const legacy = this.getSavedChapterIds();
    return legacy.includes(chapterId);
  },

  /**
   * Get list of saved chapter IDs (for backward compatibility)
   */
  getSavedChapterIds(): string[] {
    const list = this.getAllSavedChapters();
    if (list.length > 0) {
      return list.map(item => item.chapterId);
    }
    if (typeof localStorage === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    } catch {
      return [];
    }
  },

  /**
   * Pre-caches all pages of a chapter in CacheStorage and records metadata in manifest
   */
  async cacheChapter(
    chapterId: string,
    pages: MangaPage[],
    meta?: {
      mangaId?: string;
      mangaTitle?: string;
      mangaCover?: string;
      chapterNumber?: string;
      chapterTitle?: string;
    }
  ): Promise<{ cached: number; total: number }> {
    if (!this.isSupported() || pages.length === 0) {
      return { cached: 0, total: pages.length };
    }

    try {
      const cache = await caches.open(CACHE_NAME);
      let successCount = 0;

      // Cache all pages in parallel batches
      const batchSize = 4;
      for (let i = 0; i < pages.length; i += batchSize) {
        const batch = pages.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (page) => {
            try {
              const req = new Request(page.imageUrl, { mode: 'cors' });
              const existing = await cache.match(req);
              if (!existing) {
                const res = await fetch(req);
                if (res.ok) {
                  await cache.put(req, res);
                  successCount++;
                }
              } else {
                successCount++;
              }
            } catch {
              // Silently catch individual network failures
            }
          })
        );
      }

      // Update manifest
      const existingList = this.getAllSavedChapters().filter(c => c.chapterId !== chapterId);
      const newRecord: SavedOfflineChapter = {
        chapterId,
        chapterNumber: meta?.chapterNumber || '1',
        chapterTitle: meta?.chapterTitle,
        mangaId: meta?.mangaId || 'unknown',
        mangaTitle: meta?.mangaTitle || 'Mangá',
        mangaCover: meta?.mangaCover || '',
        pageCount: pages.length,
        savedAt: Date.now(),
        pages
      };

      existingList.unshift(newRecord);
      localStorage.setItem(MANIFEST_KEY, JSON.stringify(existingList));

      // Keep legacy key in sync
      const ids = existingList.map(c => c.chapterId);
      localStorage.setItem(LEGACY_KEY, JSON.stringify(ids));

      notifyListeners();
      return { cached: successCount, total: pages.length };
    } catch (err) {
      console.warn('[OfflineCache] Failed to cache chapter:', err);
      return { cached: 0, total: pages.length };
    }
  },

  /**
   * Remove a chapter from the offline cache
   */
  async removeChapter(chapterId: string, pages?: MangaPage[]): Promise<void> {
    const list = this.getAllSavedChapters();
    const target = list.find(c => c.chapterId === chapterId);
    const pagesToDelete = pages || target?.pages || [];

    if (pagesToDelete.length > 0 && this.isSupported()) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(
          pagesToDelete.map(p => cache.delete(new Request(p.imageUrl, { mode: 'cors' })))
        );
      } catch (err) {
        console.warn('[OfflineCache] Failed to delete cache keys:', err);
      }
    }

    const updated = list.filter(c => c.chapterId !== chapterId);
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(updated));

    const ids = updated.map(c => c.chapterId);
    localStorage.setItem(LEGACY_KEY, JSON.stringify(ids));

    notifyListeners();
  },

  /**
   * Clear all offline data and delete cache storage
   */
  async clearAllOfflineData(): Promise<void> {
    if (this.isSupported()) {
      try {
        await caches.delete(CACHE_NAME);
      } catch (err) {
        console.warn('[OfflineCache] Failed to delete cache container:', err);
      }
    }
    localStorage.removeItem(MANIFEST_KEY);
    localStorage.removeItem(LEGACY_KEY);
    notifyListeners();
  },

  /**
   * Estimate total storage used by offline chapters
   */
  async estimateStorageUsage(): Promise<{ count: number; totalPages: number; estimatedMb: number }> {
    const chapters = this.getAllSavedChapters();
    const totalPages = chapters.reduce((sum, ch) => sum + (ch.pageCount || 0), 0);
    // Typical manga web page is ~350 KB compressed webp/jpeg
    const estimatedMb = Math.round((totalPages * 0.35) * 10) / 10;
    return {
      count: chapters.length,
      totalPages,
      estimatedMb
    };
  }
};
