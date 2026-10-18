import { MangaPage } from '../types/manga';

const CACHE_NAME = 'mangareader-offline-pages';

export const OfflineCacheService = {
  /**
   * Check if Cache API is supported in this browser
   */
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'caches' in window;
  },

  /**
   * Pre-caches all pages of a chapter in CacheStorage for 100% offline viewing
   */
  async cacheChapter(chapterId: string, pages: MangaPage[]): Promise<{ cached: number; total: number }> {
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

      // Record chapterId in localStorage manifest
      const saved = this.getSavedChapterIds();
      if (!saved.includes(chapterId)) {
        saved.push(chapterId);
        localStorage.setItem('mr_offline_chapters', JSON.stringify(saved));
      }

      return { cached: successCount, total: pages.length };
    } catch (err) {
      console.warn('[OfflineCache] Failed to cache chapter:', err);
      return { cached: 0, total: pages.length };
    }
  },

  /**
   * Check if a chapter was marked as offline-saved
   */
  isChapterSaved(chapterId: string): boolean {
    const saved = this.getSavedChapterIds();
    return saved.includes(chapterId);
  },

  /**
   * Get list of saved chapter IDs
   */
  getSavedChapterIds(): string[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem('mr_offline_chapters') || '[]');
    } catch {
      return [];
    }
  },

  /**
   * Remove a chapter from the offline cache
   */
  async removeChapter(chapterId: string, pages?: MangaPage[]): Promise<void> {
    if (pages && this.isSupported()) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(
          pages.map(p => cache.delete(new Request(p.imageUrl, { mode: 'cors' })))
        );
      } catch (err) {
        console.warn('[OfflineCache] Failed to delete cache keys:', err);
      }
    }

    const saved = this.getSavedChapterIds().filter(id => id !== chapterId);
    localStorage.setItem('mr_offline_chapters', JSON.stringify(saved));
  }
};
