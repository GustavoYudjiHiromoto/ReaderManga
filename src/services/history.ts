import { ReadingProgress, FavoriteManga, LibraryBackup, ReadingStats, LibraryCategory, PageBookmark } from '../types/manga.js';

const STORAGE_KEY = 'manga_reader_history_v1';
const BOOKMARKS_KEY = 'manga_reader_bookmarks_v1';
const STATS_KEY = 'manga_reader_reading_stats_v1';
const READ_CHAPTERS_KEY = 'manga_reader_read_chapters_v1';
const PAGE_BOOKMARKS_KEY = 'manga_reader_page_bookmarks_v1';

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

function formatReadingTime(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '0 min';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    if (minutes > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes} min`;
  }
  return `${totalSeconds}s`;
}

// Listen to changes across tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (
      event.key === STORAGE_KEY ||
      event.key === BOOKMARKS_KEY ||
      event.key === STATS_KEY ||
      event.key === READ_CHAPTERS_KEY ||
      event.key === PAGE_BOOKMARKS_KEY
    ) {
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

  getReadChapters(): string[] {
    try {
      const data = localStorage.getItem(READ_CHAPTERS_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  markChapterAsRead(chapterId: string): void {
    if (!chapterId) return;
    try {
      const list = this.getReadChapters();
      if (!list.includes(chapterId)) {
        list.push(chapterId);
        localStorage.setItem(READ_CHAPTERS_KEY, JSON.stringify(list));
        notifyListeners();
      }
    } catch (e) {
      console.warn('Failed to mark chapter as read', e);
    }
  },

  unmarkChapterAsRead(chapterId: string): void {
    if (!chapterId) return;
    try {
      const list = this.getReadChapters().filter(id => id !== chapterId);
      localStorage.setItem(READ_CHAPTERS_KEY, JSON.stringify(list));
      notifyListeners();
    } catch (e) {
      console.warn('Failed to unmark chapter as read', e);
    }
  },

  markMultipleChaptersAsRead(chapterIds: string[]): void {
    if (!chapterIds || chapterIds.length === 0) return;
    try {
      const current = this.getReadChapters();
      const set = new Set([...current, ...chapterIds]);
      localStorage.setItem(READ_CHAPTERS_KEY, JSON.stringify(Array.from(set)));
      notifyListeners();
    } catch (e) {
      console.warn('Failed to mark multiple chapters as read', e);
    }
  },

  unmarkMultipleChaptersAsRead(chapterIds: string[]): void {
    if (!chapterIds || chapterIds.length === 0) return;
    try {
      const toRemove = new Set(chapterIds);
      const list = this.getReadChapters().filter(id => !toRemove.has(id));
      localStorage.setItem(READ_CHAPTERS_KEY, JSON.stringify(list));
      notifyListeners();
    } catch (e) {
      console.warn('Failed to unmark multiple chapters as read', e);
    }
  },

  isChapterRead(chapterId: string): boolean {
    if (!chapterId) return false;
    return this.getReadChapters().includes(chapterId);
  },

  addReadingTime(seconds: number): void {
    if (!seconds || seconds <= 0) return;
    try {
      const current = this.getStoredSeconds();
      const next = current + Math.round(seconds);
      const payload = {
        totalSeconds: next,
        lastReadDate: new Date().toISOString()
      };
      localStorage.setItem(STATS_KEY, JSON.stringify(payload));
      notifyListeners();
    } catch (e) {
      console.warn('Failed to add reading time', e);
    }
  },

  getStoredSeconds(): number {
    try {
      const data = localStorage.getItem(STATS_KEY);
      if (!data) return 0;
      const parsed = JSON.parse(data);
      if (typeof parsed === 'number') return parsed;
      if (parsed && typeof parsed.totalSeconds === 'number') return parsed.totalSeconds;
      return 0;
    } catch {
      return 0;
    }
  },

  getReadingStats(): ReadingStats {
    const history = this.getHistory();
    const readChapters = this.getReadChapters();

    // Unique chapters: readChapters array + chapters in history
    const chaptersSet = new Set<string>();
    readChapters.forEach(id => chaptersSet.add(id));
    history.forEach(h => {
      if (h.chapterId) chaptersSet.add(h.chapterId);
    });

    // Unique mangas touched
    const mangasSet = new Set<string>(history.map(h => h.mangaId));

    // Total pages read across history
    const totalPagesRead = history.reduce((sum, h) => sum + (h.pageNumber || 0), 0);

    // Stored active time (in seconds)
    const trackedSeconds = this.getStoredSeconds();

    // Baseline estimation if user has history records but tracked active seconds is still 0
    // (e.g. ~45 seconds per page read or ~4 minutes per chapter)
    const estimatedSeconds = Math.max(
      totalPagesRead * 45,
      chaptersSet.size * 240
    );

    const effectiveSeconds = Math.max(trackedSeconds, estimatedSeconds);
    const totalMinutesSpent = Math.round(effectiveSeconds / 60);

    let lastReadDate: string | undefined;
    try {
      const data = localStorage.getItem(STATS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        lastReadDate = parsed?.lastReadDate;
      }
    } catch {
      // ignore
    }

    if (!lastReadDate && history.length > 0) {
      lastReadDate = new Date(Math.max(...history.map(h => h.updatedAt || 0))).toISOString();
    }

    return {
      totalChaptersRead: chaptersSet.size,
      totalSecondsSpent: effectiveSeconds,
      totalMinutesSpent,
      formattedTimeSpent: formatReadingTime(effectiveSeconds),
      uniqueMangasRead: mangasSet.size,
      totalPagesRead,
      lastReadDate
    };
  },

  saveProgress(progress: Omit<ReadingProgress, 'updatedAt'>): void {
    try {
      const list = this.getHistory();
      const filtered = list.filter(item => item.mangaId !== progress.mangaId);
      const updated: ReadingProgress = {
        ...progress,
        updatedAt: Date.now()
      };
      // Keep most recent 50 items
      const newList = [updated, ...filtered].slice(0, 50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));

      // Mark chapter in read set
      if (progress.chapterId) {
        this.markChapterAsRead(progress.chapterId);
      }

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
                             item.includes('mangapill') ? 'MangaPill' : 'MangaReader';
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
          userCategory: item.userCategory || 'reading',
          userScore: typeof item.userScore === 'number' ? item.userScore : undefined,
          userNotes: typeof item.userNotes === 'string' ? item.userNotes : undefined,
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
          userCategory: 'reading',
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
          userCategory: mangaOrId.userCategory || 'reading',
          userScore: mangaOrId.userScore,
          userNotes: mangaOrId.userNotes,
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

  updateFavoriteCategory(mangaId: string, category: LibraryCategory): void {
    try {
      const favorites = this.getFavorites();
      const updated = favorites.map(fav =>
        fav.mangaId === mangaId ? { ...fav, userCategory: category, updatedAt: Date.now() } : fav
      );
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
      notifyListeners();
    } catch (e) {
      console.warn('Failed to update favorite category', e);
    }
  },

  updateFavoriteScore(mangaId: string, score?: number, notes?: string): void {
    try {
      const favorites = this.getFavorites();
      const updated = favorites.map(fav =>
        fav.mangaId === mangaId ? {
          ...fav,
          userScore: score,
          userNotes: notes !== undefined ? notes : fav.userNotes,
          updatedAt: Date.now()
        } : fav
      );
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
      notifyListeners();
    } catch (e) {
      console.warn('Failed to update favorite score', e);
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
   * Page-level bookmarks & highlights
   */
  getPageBookmarks(): PageBookmark[] {
    try {
      const data = localStorage.getItem(PAGE_BOOKMARKS_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  getPageBookmarksForManga(mangaId: string): PageBookmark[] {
    return this.getPageBookmarks().filter(b => b.mangaId === mangaId);
  },

  isPageBookmarked(chapterId: string, pageNumber: number): boolean {
    return this.getPageBookmarks().some(b => b.chapterId === chapterId && b.pageNumber === pageNumber);
  },

  getPageBookmark(chapterId: string, pageNumber: number): PageBookmark | undefined {
    return this.getPageBookmarks().find(b => b.chapterId === chapterId && b.pageNumber === pageNumber);
  },

  addPageBookmark(bookmark: Omit<PageBookmark, 'id' | 'createdAt'>): PageBookmark {
    const list = this.getPageBookmarks();
    const existingIndex = list.findIndex(b => b.chapterId === bookmark.chapterId && b.pageNumber === bookmark.pageNumber);
    const newBookmark: PageBookmark = {
      ...bookmark,
      id: existingIndex >= 0 ? list[existingIndex].id : `bm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: existingIndex >= 0 ? list[existingIndex].createdAt : Date.now()
    };

    let updatedList: PageBookmark[];
    if (existingIndex >= 0) {
      updatedList = [...list];
      updatedList[existingIndex] = newBookmark;
    } else {
      updatedList = [newBookmark, ...list];
    }

    try {
      localStorage.setItem(PAGE_BOOKMARKS_KEY, JSON.stringify(updatedList));
      notifyListeners();
    } catch (e) {
      console.warn('Failed to save page bookmark', e);
    }
    return newBookmark;
  },

  removePageBookmark(bookmarkId: string): void {
    const list = this.getPageBookmarks().filter(b => b.id !== bookmarkId);
    try {
      localStorage.setItem(PAGE_BOOKMARKS_KEY, JSON.stringify(list));
      notifyListeners();
    } catch (e) {
      console.warn('Failed to remove page bookmark', e);
    }
  },

  removePageBookmarkByPage(chapterId: string, pageNumber: number): void {
    const list = this.getPageBookmarks().filter(b => !(b.chapterId === chapterId && b.pageNumber === pageNumber));
    try {
      localStorage.setItem(PAGE_BOOKMARKS_KEY, JSON.stringify(list));
      notifyListeners();
    } catch (e) {
      console.warn('Failed to remove page bookmark', e);
    }
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
      history: this.getHistory(),
      stats: this.getReadingStats(),
      readChapters: this.getReadChapters(),
      pageBookmarks: this.getPageBookmarks()
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
   * Generates a standard Tachiyomi / Mihon v2 compatible backup structure
   */
  createTachiyomiBackup(): object {
    const favorites = this.getFavorites();
    const mangas = favorites.map(fav => {
      const categoryName = 
        fav.userCategory === 'reading' ? 'Lendo' :
        fav.userCategory === 'completed' ? 'Completo' :
        fav.userCategory === 'plan_to_read' ? 'Quero Ler' :
        fav.userCategory === 'on_hold' ? 'Pausado' :
        fav.userCategory === 'dropped' ? 'Abandonado' : 'Favoritos';

      return {
        source: fav.sourceId === 'mangadex' ? 1 : 2,
        url: `/manga/${fav.mangaId}`,
        title: fav.title,
        artist: fav.authors?.[0] || '',
        author: fav.authors?.[0] || '',
        description: fav.userNotes || '',
        genre: fav.genres || [],
        status: fav.status === 'completed' ? 2 : 1,
        thumbnailUrl: fav.coverUrl,
        favorite: true,
        categories: [categoryName],
        viewer: 1,
        chapters: []
      };
    });

    return {
      version: 2,
      mangas,
      categories: [
        { name: 'Lendo', order: 0 },
        { name: 'Quero Ler', order: 1 },
        { name: 'Completo', order: 2 },
        { name: 'Pausado', order: 3 },
        { name: 'Abandonado', order: 4 }
      ]
    };
  },

  /**
   * Triggers browser download of Tachiyomi / Mihon JSON backup file
   */
  downloadTachiyomiBackupFile(): void {
    if (typeof window === 'undefined') return;
    const backup = this.createTachiyomiBackup();
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `tachiyomi-mihon-backup-${dateStr}.json`;
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
      } else if (Array.isArray(data.mangas)) {
        // Tachiyomi / Mihon v2 backup format
        data.mangas.forEach((tm: any) => {
          if (!tm || !tm.title) return;
          const cleanTitle = tm.title;
          const id = tm.url
            ? tm.url.replace(/^\/manga\//, '')
            : `mr_tachiyomi_${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

          let cat: LibraryCategory = 'reading';
          if (Array.isArray(tm.categories) && tm.categories.length > 0) {
            const catStr = String(tm.categories[0]).toLowerCase();
            if (catStr.includes('complet')) cat = 'completed';
            else if (catStr.includes('plan') || catStr.includes('quero')) cat = 'plan_to_read';
            else if (catStr.includes('hold') || catStr.includes('paus')) cat = 'on_hold';
            else if (catStr.includes('drop') || catStr.includes('abandon')) cat = 'dropped';
          }

          importedFavorites.push({
            mangaId: id,
            title: cleanTitle,
            coverUrl: tm.thumbnailUrl || tm.thumbnail_url || '',
            authors: tm.author ? [tm.author] : [],
            genres: Array.isArray(tm.genre) ? tm.genre : [],
            userCategory: cat,
            userNotes: tm.description || undefined,
            status: tm.status === 2 ? 'completed' : 'ongoing',
            sourceName: 'Tachiyomi/Mihon',
            updatedAt: Date.now()
          });

          if (Array.isArray(tm.chapters)) {
            tm.chapters.forEach((ch: any) => {
              if (ch.read && ch.url) {
                const chId = ch.url.replace(/^\/chapter\//, '');
                if (chId) this.markChapterAsRead(chId);
              }
            });
          }
        });
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
          userCategory: f.userCategory || existing?.userCategory || 'reading',
          userScore: typeof f.userScore === 'number' ? f.userScore : existing?.userScore,
          userNotes: typeof f.userNotes === 'string' ? f.userNotes : existing?.userNotes,
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

      // Merge Read Chapters if present
      if (Array.isArray(data.readChapters)) {
        const currentRead = this.getReadChapters();
        const set = new Set([...currentRead, ...data.readChapters]);
        localStorage.setItem(READ_CHAPTERS_KEY, JSON.stringify(Array.from(set)));
      }

      // Merge Stats if present
      if (data.stats && typeof data.stats.totalSecondsSpent === 'number') {
        const currentSec = this.getStoredSeconds();
        if (data.stats.totalSecondsSpent > currentSec) {
          localStorage.setItem(STATS_KEY, JSON.stringify({
            totalSeconds: data.stats.totalSecondsSpent,
            lastReadDate: data.stats.lastReadDate || new Date().toISOString()
          }));
        }
      }

      // Merge Page Bookmarks if present
      if (Array.isArray(data.pageBookmarks)) {
        const currentBms = this.getPageBookmarks();
        const bmMap = new Map<string, PageBookmark>();
        currentBms.forEach(b => bmMap.set(`${b.chapterId}_${b.pageNumber}`, b));
        data.pageBookmarks.forEach((b: PageBookmark) => {
          if (b && b.chapterId && typeof b.pageNumber === 'number') {
            bmMap.set(`${b.chapterId}_${b.pageNumber}`, b);
          }
        });
        localStorage.setItem(PAGE_BOOKMARKS_KEY, JSON.stringify(Array.from(bmMap.values())));
      }

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

