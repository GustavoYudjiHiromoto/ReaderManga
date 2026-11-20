import { ReadingProgress, FavoriteManga, LibraryBackup, ReadingStats, LibraryCategory, PageBookmark, Chapter, IgnoredManga } from '../types/manga.js';
import { decodeHtmlEntities } from '../utils/htmlEntities.js';

const STORAGE_KEY = 'manga_reader_history_v1';
const BOOKMARKS_KEY = 'manga_reader_bookmarks_v1';
const STATS_KEY = 'manga_reader_reading_stats_v1';
const READ_CHAPTERS_KEY = 'manga_reader_read_chapters_v1';
const PAGE_BOOKMARKS_KEY = 'manga_reader_page_bookmarks_v1';
const CUSTOM_COLLECTIONS_KEY = 'manga_reader_custom_collections_v1';
const IGNORED_KEY = 'manga_reader_ignored_v1';

export type HistoryTopic =
  | 'history'
  | 'favorites'
  | 'readChapters'
  | 'ignored'
  | 'collections'
  | 'pageBookmarks'
  | 'stats'
  | 'all';

type HistoryListener = () => void;
const listenerSubscriptions = new Map<HistoryListener, Set<HistoryTopic> | null>();
const mangaListeners = new Map<string, Set<HistoryListener>>();

export interface HistorySyncBridge {
  onProgressSaved?: (progress: ReadingProgress) => void;
  onFavoriteUpdated?: (fav: FavoriteManga) => void;
  onFavoriteRemoved?: (mangaId: string) => void;
  onLibraryStateChanged?: () => void;
  onBulkImported?: () => void;
}

let syncBridge: HistorySyncBridge | null = null;

// In-memory parsed caches + O(1) lookup structures to avoid repeated JSON.parse across hundreds of MangaCards
let cachedHistory: ReadingProgress[] | null = null;
let cachedHistoryMap: Map<string, ReadingProgress> | null = null;
let cachedFavorites: FavoriteManga[] | null = null;
let cachedFavoritesSet: Set<string> | null = null;
let cachedFavoritesMap: Map<string, FavoriteManga> | null = null;
let cachedReadChapters: string[] | null = null;
let cachedReadChaptersSet: Set<string> | null = null;
let cachedIgnored: IgnoredManga[] | null = null;
let cachedIgnoredSet: Set<string> | null = null;
let cachedCustomCollections: string[] | null = null;
let cachedPageBookmarks: PageBookmark[] | null = null;
let cachedStats: { totalSeconds: number; lastReadDate?: string } | null = null;

function compactStringList(list: unknown, maxItems: number, maxLen = 120): string[] | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const decoded = raw.includes('&') ? decodeHtmlEntities(raw) : raw.trim();
    const trimmed = decoded.slice(0, maxLen).trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= maxItems) break;
  }
  return out.length > 0 ? out : undefined;
}

function hasArrayEntityOrOverflow(list: unknown, maxItems: number): boolean {
  if (!Array.isArray(list)) return false;
  if (list.length > maxItems) return true;
  return list.some(item => typeof item === 'string' && item.includes('&') && decodeHtmlEntities(item) !== item.trim());
}

function compactFavoriteForStorage(fav: FavoriteManga): FavoriteManga {
  const cleanTitle = typeof fav.title === 'string' && fav.title.includes('&') ? decodeHtmlEntities(fav.title) : fav.title;
  const rawSynopsis = typeof fav.synopsis === 'string'
    ? (fav.synopsis.includes('&') ? decodeHtmlEntities(fav.synopsis) : fav.synopsis.trim())
    : undefined;
  const trimmedSynopsis =
    rawSynopsis && rawSynopsis.length > 280 ? `${rawSynopsis.slice(0, 277).trimEnd()}...` : rawSynopsis;
  const compactAlts = compactStringList(fav.altTitles, 12, 160);
  const compactGenres = compactStringList(fav.genres, 12, 64);
  const compactAuthors = compactStringList(fav.authors, 5, 100);

  const needsCompact =
    cleanTitle !== fav.title ||
    (typeof fav.synopsis === 'string' && fav.synopsis !== trimmedSynopsis) ||
    hasArrayEntityOrOverflow(fav.altTitles, 12) ||
    hasArrayEntityOrOverflow(fav.genres, 12) ||
    hasArrayEntityOrOverflow(fav.authors, 5);

  if (!needsCompact) return fav;

  return {
    ...fav,
    title: cleanTitle,
    synopsis: trimmedSynopsis,
    altTitles: compactAlts,
    genres: compactGenres || [],
    authors: compactAuthors || []
  };
}

function setHistoryCache(list: ReadingProgress[]) {
  cachedHistory = list;
  const map = new Map<string, ReadingProgress>();
  for (const item of list) {
    if (item?.mangaId) map.set(item.mangaId, item);
  }
  cachedHistoryMap = map;
}

function setFavoritesCache(list: FavoriteManga[]) {
  cachedFavorites = list;
  const set = new Set<string>();
  const map = new Map<string, FavoriteManga>();
  for (const item of list) {
    if (item?.mangaId) {
      set.add(item.mangaId);
      map.set(item.mangaId, item);
    }
  }
  cachedFavoritesSet = set;
  cachedFavoritesMap = map;
}

function setReadChaptersCache(list: string[]) {
  cachedReadChapters = list;
  cachedReadChaptersSet = new Set(list);
}

function setIgnoredCache(list: IgnoredManga[]) {
  cachedIgnored = list;
  const set = new Set<string>();
  for (const item of list) {
    if (item?.mangaId) set.add(item.mangaId);
  }
  cachedIgnoredSet = set;
}

function invalidateCacheForKey(key: string | null) {
  if (!key || key === STORAGE_KEY) {
    cachedHistory = null;
    cachedHistoryMap = null;
  }
  if (!key || key === BOOKMARKS_KEY) {
    cachedFavorites = null;
    cachedFavoritesSet = null;
    cachedFavoritesMap = null;
  }
  if (!key || key === READ_CHAPTERS_KEY) {
    cachedReadChapters = null;
    cachedReadChaptersSet = null;
  }
  if (!key || key === IGNORED_KEY) {
    cachedIgnored = null;
    cachedIgnoredSet = null;
  }
  if (!key || key === CUSTOM_COLLECTIONS_KEY) {
    cachedCustomCollections = null;
  }
  if (!key || key === PAGE_BOOKMARKS_KEY) {
    cachedPageBookmarks = null;
  }
  if (!key || key === STATS_KEY) {
    cachedStats = null;
  }
}

function loadStatsFromStorage(): { totalSeconds: number; lastReadDate?: string } {
  if (cachedStats) return cachedStats;
  try {
    const data = localStorage.getItem(STATS_KEY);
    if (!data) {
      cachedStats = { totalSeconds: 0 };
      return cachedStats;
    }
    const parsed = JSON.parse(data);
    if (typeof parsed === 'number') {
      cachedStats = { totalSeconds: parsed };
    } else if (parsed && typeof parsed === 'object') {
      cachedStats = {
        totalSeconds: typeof parsed.totalSeconds === 'number' ? parsed.totalSeconds : 0,
        lastReadDate: typeof parsed.lastReadDate === 'string' ? parsed.lastReadDate : undefined
      };
    } else {
      cachedStats = { totalSeconds: 0 };
    }
    return cachedStats;
  } catch {
    return { totalSeconds: 0 };
  }
}

function notifyListeners(
  topics: HistoryTopic | HistoryTopic[] = 'all',
  targetMangaIds: string | string[] = '*'
) {
  const topicList = Array.isArray(topics) ? topics : [topics];
  const isAllTopics = topicList.includes('all');

  listenerSubscriptions.forEach((subTopics, fn) => {
    if (!isAllTopics && subTopics !== null) {
      let matches = false;
      for (const t of topicList) {
        if (subTopics.has(t)) {
          matches = true;
          break;
        }
      }
      if (!matches) return;
    }
    try {
      fn();
    } catch (e) {
      console.warn('History listener error', e);
    }
  });

  if (mangaListeners.size > 0) {
    if (targetMangaIds === '*') {
      mangaListeners.forEach(set => {
        set.forEach(fn => {
          try {
            fn();
          } catch (e) {
            console.warn('Manga history listener error', e);
          }
        });
      });
    } else {
      const ids = Array.isArray(targetMangaIds) ? targetMangaIds : [targetMangaIds];
      for (const id of ids) {
        const set = mangaListeners.get(id);
        if (set) {
          set.forEach(fn => {
            try {
              fn();
            } catch (e) {
              console.warn('Manga history listener error', e);
            }
          });
        }
      }
    }
  }
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
      !event.key ||
      event.key === STORAGE_KEY ||
      event.key === BOOKMARKS_KEY ||
      event.key === STATS_KEY ||
      event.key === READ_CHAPTERS_KEY ||
      event.key === PAGE_BOOKMARKS_KEY ||
      event.key === CUSTOM_COLLECTIONS_KEY ||
      event.key === IGNORED_KEY
    ) {
      invalidateCacheForKey(event.key);
      const topic: HistoryTopic =
        event.key === STORAGE_KEY ? 'history' :
        event.key === BOOKMARKS_KEY ? 'favorites' :
        event.key === READ_CHAPTERS_KEY ? 'readChapters' :
        event.key === IGNORED_KEY ? 'ignored' :
        event.key === CUSTOM_COLLECTIONS_KEY ? 'collections' :
        event.key === PAGE_BOOKMARKS_KEY ? 'pageBookmarks' :
        event.key === STATS_KEY ? 'stats' : 'all';
      notifyListeners(topic, topic === 'all' || topic === 'favorites' || topic === 'history' || topic === 'ignored' ? '*' : []);
    }
  });
}

export const HistoryService = {
  setSyncBridge(bridge: HistorySyncBridge) {
    syncBridge = bridge;
  },

  notifyExternalSync(
    topics: HistoryTopic | HistoryTopic[] = 'all',
    targetMangaIds: string | string[] = '*'
  ): void {
    const topicList = Array.isArray(topics) ? topics : [topics];
    if (topicList.includes('all')) {
      invalidateCacheForKey(null);
      notifyListeners('all', targetMangaIds);
      return;
    }

    for (const topic of topicList) {
      if (topic === 'history') invalidateCacheForKey(STORAGE_KEY);
      else if (topic === 'favorites') invalidateCacheForKey(BOOKMARKS_KEY);
      else if (topic === 'readChapters') invalidateCacheForKey(READ_CHAPTERS_KEY);
      else if (topic === 'ignored') invalidateCacheForKey(IGNORED_KEY);
      else if (topic === 'collections') invalidateCacheForKey(CUSTOM_COLLECTIONS_KEY);
      else if (topic === 'pageBookmarks') invalidateCacheForKey(PAGE_BOOKMARKS_KEY);
      else if (topic === 'stats') invalidateCacheForKey(STATS_KEY);
    }
    notifyListeners(topicList, targetMangaIds);
  },

  subscribe(listener: HistoryListener, topics?: HistoryTopic[]): () => void {
    const topicSet =
      !topics || topics.length === 0 || topics.includes('all') ? null : new Set<HistoryTopic>(topics);
    listenerSubscriptions.set(listener, topicSet);
    return () => {
      listenerSubscriptions.delete(listener);
    };
  },

  subscribeManga(mangaId: string, listener: HistoryListener): () => void {
    if (!mangaId) return () => {};
    let set = mangaListeners.get(mangaId);
    if (!set) {
      set = new Set();
      mangaListeners.set(mangaId, set);
    }
    set.add(listener);
    return () => {
      const current = mangaListeners.get(mangaId);
      if (current) {
        current.delete(listener);
        if (current.size === 0) {
          mangaListeners.delete(mangaId);
        }
      }
    };
  },

  getHistory(): ReadingProgress[] {
    if (cachedHistory) return cachedHistory;
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) {
        setHistoryCache([]);
        return cachedHistory!;
      }
      const parsed = JSON.parse(data);
      const rawList = Array.isArray(parsed) ? parsed : [];
      let historyNeedsRewrite = false;
      const list: ReadingProgress[] = rawList.map((item: ReadingProgress) => {
        if (!item) return item;
        const cleanMangaTitle = typeof item.mangaTitle === 'string' && item.mangaTitle.includes('&')
          ? decodeHtmlEntities(item.mangaTitle)
          : item.mangaTitle;
        const cleanChapterTitle = typeof item.chapterTitle === 'string' && item.chapterTitle.includes('&')
          ? decodeHtmlEntities(item.chapterTitle)
          : item.chapterTitle;
        if (cleanMangaTitle !== item.mangaTitle || cleanChapterTitle !== item.chapterTitle) {
          historyNeedsRewrite = true;
          return { ...item, mangaTitle: cleanMangaTitle, chapterTitle: cleanChapterTitle };
        }
        return item;
      });
      if (historyNeedsRewrite) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch {
          // ignore quota warnings on passive read cleanup
        }
      }
      setHistoryCache(list);
      return cachedHistory!;
    } catch {
      return [];
    }
  },

  getProgress(mangaId: string): ReadingProgress | undefined {
    if (!mangaId) return undefined;
    if (!cachedHistoryMap) {
      this.getHistory();
    }
    return cachedHistoryMap?.get(mangaId);
  },

  getReadChapters(): string[] {
    if (cachedReadChapters) return cachedReadChapters;
    try {
      const data = localStorage.getItem(READ_CHAPTERS_KEY);
      if (!data) {
        setReadChaptersCache([]);
        return cachedReadChapters!;
      }
      const parsed = JSON.parse(data);
      const list = Array.isArray(parsed) ? parsed : [];
      setReadChaptersCache(list);
      return cachedReadChapters!;
    } catch {
      return [];
    }
  },

  markChapterAsRead(chapterId: string): void {
    if (!chapterId) return;
    try {
      const list = this.getReadChapters();
      if (!cachedReadChaptersSet?.has(chapterId)) {
        const next = [...list, chapterId];
        localStorage.setItem(READ_CHAPTERS_KEY, JSON.stringify(next));
        setReadChaptersCache(next);
        notifyListeners('readChapters', []);
        syncBridge?.onLibraryStateChanged?.();
      }
    } catch (e) {
      console.warn('Failed to mark chapter as read', e);
    }
  },

  unmarkChapterAsRead(chapterId: string): void {
    if (!chapterId) return;
    try {
      const current = this.getReadChapters();
      if (!cachedReadChaptersSet?.has(chapterId)) return;
      const list = current.filter(id => id !== chapterId);
      localStorage.setItem(READ_CHAPTERS_KEY, JSON.stringify(list));
      setReadChaptersCache(list);
      notifyListeners('readChapters', []);
      syncBridge?.onLibraryStateChanged?.();
    } catch (e) {
      console.warn('Failed to unmark chapter as read', e);
    }
  },

  markMultipleChaptersAsRead(chapterIds: string[]): void {
    if (!chapterIds || chapterIds.length === 0) return;
    try {
      const current = this.getReadChapters();
      const set = new Set([...current, ...chapterIds]);
      if (set.size === current.length) return;
      const next = Array.from(set);
      localStorage.setItem(READ_CHAPTERS_KEY, JSON.stringify(next));
      setReadChaptersCache(next);
      notifyListeners('readChapters', []);
      syncBridge?.onLibraryStateChanged?.();
    } catch (e) {
      console.warn('Failed to mark multiple chapters as read', e);
    }
  },

  unmarkMultipleChaptersAsRead(chapterIds: string[]): void {
    if (!chapterIds || chapterIds.length === 0) return;
    try {
      const toRemove = new Set(chapterIds);
      const current = this.getReadChapters();
      const list = current.filter(id => !toRemove.has(id));
      if (list.length === current.length) return;
      localStorage.setItem(READ_CHAPTERS_KEY, JSON.stringify(list));
      setReadChaptersCache(list);
      notifyListeners('readChapters', []);
      syncBridge?.onLibraryStateChanged?.();
    } catch (e) {
      console.warn('Failed to unmark multiple chapters as read', e);
    }
  },

  markChaptersUpTo(chapterId: string, allChapters: Chapter[]): void {
    const targetChapter = allChapters.find(c => c.id === chapterId || c.variants?.some(v => v.id === chapterId));
    if (!targetChapter) {
      this.markChapterAsRead(chapterId);
      return;
    }
    const targetNum = parseFloat(targetChapter.chapterNumber);
    const idsToMark: string[] = [];
    allChapters.forEach(c => {
      const num = parseFloat(c.chapterNumber);
      if (!isNaN(num) && !isNaN(targetNum)) {
        if (num <= targetNum) {
          idsToMark.push(c.id);
          c.variants?.forEach(v => idsToMark.push(v.id));
        }
      } else if (c.id === chapterId) {
        idsToMark.push(c.id);
      }
    });
    this.markMultipleChaptersAsRead(idsToMark);
  },

  markAllChaptersAsRead(chapters: Chapter[]): void {
    const ids: string[] = [];
    chapters.forEach(c => {
      ids.push(c.id);
      c.variants?.forEach(v => ids.push(v.id));
    });
    this.markMultipleChaptersAsRead(ids);
  },

  unmarkAllChapters(chapters: Chapter[]): void {
    const ids: string[] = [];
    chapters.forEach(c => {
      ids.push(c.id);
      c.variants?.forEach(v => ids.push(v.id));
    });
    this.unmarkMultipleChaptersAsRead(ids);
  },

  isChapterRead(chapterId: string): boolean {
    if (!chapterId) return false;
    if (!cachedReadChaptersSet) {
      this.getReadChapters();
    }
    return cachedReadChaptersSet?.has(chapterId) || false;
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
      cachedStats = payload;
      notifyListeners('stats', []);
    } catch (e) {
      console.warn('Failed to add reading time', e);
    }
  },

  getStoredSeconds(): number {
    return loadStatsFromStorage().totalSeconds;
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
    const statsData = loadStatsFromStorage();
    const trackedSeconds = statsData.totalSeconds;

    // Baseline estimation if user has history records but tracked active seconds is still 0
    // (e.g. ~45 seconds per page read or ~4 minutes per chapter)
    const estimatedSeconds = Math.max(
      totalPagesRead * 45,
      chaptersSet.size * 240
    );

    const effectiveSeconds = Math.max(trackedSeconds, estimatedSeconds);
    const totalMinutesSpent = Math.round(effectiveSeconds / 60);

    let lastReadDate = statsData.lastReadDate;

    if (!lastReadDate && history.length > 0) {
      let maxUpdated = 0;
      for (const h of history) {
        if ((h.updatedAt || 0) > maxUpdated) maxUpdated = h.updatedAt || 0;
      }
      lastReadDate = new Date(maxUpdated).toISOString();
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
        mangaTitle: typeof progress.mangaTitle === 'string' && progress.mangaTitle.includes('&')
          ? decodeHtmlEntities(progress.mangaTitle)
          : progress.mangaTitle,
        chapterTitle: typeof progress.chapterTitle === 'string' && progress.chapterTitle.includes('&')
          ? decodeHtmlEntities(progress.chapterTitle)
          : progress.chapterTitle,
        updatedAt: Date.now()
      };
      // Keep most recent 50 items
      const newList = [updated, ...filtered].slice(0, 50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
      setHistoryCache(newList);

      // Mark chapter in read set cleanly without double-notifying listeners
      let addedReadChapter = false;
      if (progress.chapterId) {
        const readList = this.getReadChapters();
        if (!cachedReadChaptersSet?.has(progress.chapterId)) {
          const nextRead = [...readList, progress.chapterId];
          localStorage.setItem(READ_CHAPTERS_KEY, JSON.stringify(nextRead));
          setReadChaptersCache(nextRead);
          addedReadChapter = true;
        }
      }

      notifyListeners(addedReadChapter ? ['history', 'readChapters'] : 'history', progress.mangaId);
      syncBridge?.onProgressSaved?.(updated);
      syncBridge?.onLibraryStateChanged?.();
    } catch (e) {
      console.warn('Failed to save reading history', e);
    }
  },

  removeHistory(mangaId: string): void {
    try {
      const list = this.getHistory().filter(item => item.mangaId !== mangaId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      setHistoryCache(list);
      notifyListeners('history', mangaId);
    } catch (e) {
      console.warn('Failed to remove reading history', e);
    }
  },

  /**
   * Returns list of rich favorites, seamlessly migrating legacy string[] format
   * without losing any previously saved IDs.
   */
  getFavorites(): FavoriteManga[] {
    if (cachedFavorites) return cachedFavorites;
    try {
      const data = localStorage.getItem(BOOKMARKS_KEY);
      if (!data) {
        setFavoritesCache([]);
        return cachedFavorites!;
      }
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) {
        setFavoritesCache([]);
        return cachedFavorites!;
      }

      let needsRewrite = false;
      let historyMap: Map<string, ReadingProgress> | null = null;

      const normalized: FavoriteManga[] = parsed.map((item: any) => {
        if (typeof item === 'string') {
          needsRewrite = true;
          if (!historyMap) {
            this.getHistory();
            historyMap = cachedHistoryMap;
          }
          const hist = historyMap?.get(item);
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
        const rawEntry: FavoriteManga = {
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
          customCollections: Array.isArray(item.customCollections) ? item.customCollections : undefined,
          synopsis: typeof item.synopsis === 'string' ? item.synopsis : undefined,
          altTitles: Array.isArray(item.altTitles) ? item.altTitles : undefined,
          updatedAt: item.updatedAt || Date.now()
        };
        const compacted = compactFavoriteForStorage(rawEntry);
        if (compacted !== rawEntry) {
          needsRewrite = true;
        }
        return compacted;
      });

      const valid = normalized.filter(f => Boolean(f.mangaId));

      // Rewrite localStorage once if legacy strings or oversized synopses/lists were compacted
      if (needsRewrite) {
        try {
          localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(valid));
        } catch {
          // ignore quota warnings on passive read compaction
        }
      }

      setFavoritesCache(valid);
      return cachedFavorites!;
    } catch {
      return [];
    }
  },

  getFavoriteById(mangaId: string): FavoriteManga | undefined {
    if (!mangaId) return undefined;
    if (!cachedFavoritesMap) {
      this.getFavorites();
    }
    return cachedFavoritesMap?.get(mangaId);
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
      const exists = cachedFavoritesSet ? cachedFavoritesSet.has(mangaId) : favorites.some(f => f.mangaId === mangaId);

      let updated: FavoriteManga[];
      let createdFav: FavoriteManga | null = null;
      if (exists) {
        updated = favorites.filter(f => f.mangaId !== mangaId);
      } else {
        const rawFav: FavoriteManga = typeof mangaOrId === 'string' ? {
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
          synopsis: mangaOrId.synopsis,
          altTitles: mangaOrId.altTitles,
          updatedAt: Date.now()
        };
        const newFav = compactFavoriteForStorage(rawFav);
        createdFav = newFav;
        updated = [newFav, ...favorites];
      }

      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
      setFavoritesCache(updated);
      notifyListeners('favorites', mangaId);

      if (exists) {
        syncBridge?.onFavoriteRemoved?.(mangaId);
      } else if (createdFav) {
        syncBridge?.onFavoriteUpdated?.(createdFav);
      }
      return !exists;
    } catch {
      return false;
    }
  },

  updateFavoriteCategory(mangaId: string, category: LibraryCategory): void {
    try {
      const favorites = this.getFavorites();
      let updatedFav: FavoriteManga | undefined;
      const updated = favorites.map(fav => {
        if (fav.mangaId === mangaId) {
          updatedFav = { ...fav, userCategory: category, updatedAt: Date.now() };
          return updatedFav;
        }
        return fav;
      });
      if (!updatedFav) return;
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
      setFavoritesCache(updated);
      notifyListeners('favorites', mangaId);
      syncBridge?.onFavoriteUpdated?.(updatedFav);
    } catch (e) {
      console.warn('Failed to update favorite category', e);
    }
  },

  updateFavoriteScore(mangaId: string, score?: number, notes?: string): void {
    try {
      const favorites = this.getFavorites();
      let updatedFav: FavoriteManga | undefined;
      const updated = favorites.map(fav => {
        if (fav.mangaId === mangaId) {
          updatedFav = {
            ...fav,
            userScore: score,
            userNotes: notes !== undefined ? notes : fav.userNotes,
            updatedAt: Date.now()
          };
          return updatedFav;
        }
        return fav;
      });
      if (!updatedFav) return;
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
      setFavoritesCache(updated);
      notifyListeners('favorites', mangaId);
      syncBridge?.onFavoriteUpdated?.(updatedFav);
    } catch (e) {
      console.warn('Failed to update favorite score', e);
    }
  },

  removeFavorite(mangaId: string): void {
    try {
      const favorites = this.getFavorites().filter(f => f.mangaId !== mangaId);
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(favorites));
      setFavoritesCache(favorites);
      notifyListeners('favorites', mangaId);
      syncBridge?.onFavoriteRemoved?.(mangaId);
    } catch (e) {
      console.warn('Failed to remove favorite', e);
    }
  },

  enrichFavoritesMetadata(
    resolvedMap: Record<string, { altTitles?: string[]; authors?: string[] }>
  ): boolean {
    try {
      const favorites = this.getFavorites();
      let changed = false;
      const changedIds: string[] = [];
      const updated = favorites.map(fav => {
        const extra = resolvedMap[fav.mangaId];
        if (!extra) return fav;
        const mergedAlts = Array.from(
          new Set([...(fav.altTitles || []), ...(extra.altTitles || [])].filter(Boolean))
        ).slice(0, 14);
        const nextAuthors =
          (!fav.authors || fav.authors.length === 0 || fav.authors.includes('Coleção')) &&
          extra.authors?.length
            ? extra.authors
            : fav.authors;
        if (
          mergedAlts.length > (fav.altTitles?.length || 0) ||
          (nextAuthors && nextAuthors !== fav.authors)
        ) {
          changed = true;
          changedIds.push(fav.mangaId);
          return {
            ...fav,
            altTitles: mergedAlts.length > 0 ? mergedAlts : fav.altTitles,
            authors: nextAuthors
          };
        }
        return fav;
      });
      if (changed) {
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
        setFavoritesCache(updated);
        notifyListeners('favorites', changedIds);
      }
      return changed;
    } catch {
      return false;
    }
  },

  isBookmarked(mangaId: string): boolean {
    if (!mangaId) return false;
    if (!cachedFavoritesSet) {
      this.getFavorites();
    }
    return cachedFavoritesSet?.has(mangaId) || false;
  },

  /**
   * Migrates a manga entry (favorite metadata, category, score, notes, collections,
   * read chapters, and reading progress) from an old source/mangaId to a new target source.
   */
  migrateMangaData(
    sourceMangaId: string,
    targetManga: {
      mangaId: string;
      title: string;
      coverUrl: string;
      sourceId?: string;
      sourceName?: string;
      rating?: number;
      authors?: string[];
      genres?: string[];
      status?: FavoriteManga['status'];
      synopsis?: string;
      altTitles?: string[];
      userCategory?: LibraryCategory;
      userScore?: number;
      userNotes?: string;
    },
    targetChapters: Chapter[],
    sourceChapters: Chapter[] = [],
    options?: { removeOldSource?: boolean }
  ): { migratedReadChapters: number; migratedFavorite: boolean; migratedProgress: boolean } {
    const removeOld = options?.removeOldSource !== false;
    const now = Date.now();
    let migratedFavorite = false;
    let migratedReadChapters = 0;
    let migratedProgress = false;

    try {
      // 1. Migrate Favorite entry (preserving userCategory, userScore, userNotes, customCollections)
      const favorites = this.getFavorites();
      const oldFav = favorites.find(f => f.mangaId === sourceMangaId);
      const existingTargetFav = favorites.find(f => f.mangaId === targetManga.mangaId);

      if (oldFav || existingTargetFav) {
        const mergedCollections = Array.from(
          new Set([
            ...(existingTargetFav?.customCollections || []),
            ...(oldFav?.customCollections || [])
          ])
        );

        const resolvedTitle = targetManga.title || existingTargetFav?.title || oldFav?.title || 'Mangá Salvo';
        const mergedAltTitles = Array.from(
          new Set(
            [
              ...(targetManga.altTitles || []),
              ...(existingTargetFav?.altTitles || []),
              ...(oldFav?.altTitles || []),
              oldFav?.title && oldFav.title !== resolvedTitle ? oldFav.title : ''
            ].filter(Boolean)
          )
        )
          .filter(t => t !== resolvedTitle)
          .slice(0, 20);

        const nextFav: FavoriteManga = compactFavoriteForStorage({
          mangaId: targetManga.mangaId,
          title: resolvedTitle,
          coverUrl: targetManga.coverUrl || existingTargetFav?.coverUrl || oldFav?.coverUrl || '',
          sourceName: targetManga.sourceName || existingTargetFav?.sourceName || oldFav?.sourceName || 'MangaReader',
          sourceId: targetManga.sourceId || existingTargetFav?.sourceId || oldFav?.sourceId,
          rating: targetManga.rating ?? existingTargetFav?.rating ?? oldFav?.rating,
          authors: targetManga.authors?.length
            ? targetManga.authors
            : existingTargetFav?.authors?.length
            ? existingTargetFav.authors
            : oldFav?.authors,
          genres: targetManga.genres?.length
            ? targetManga.genres
            : existingTargetFav?.genres?.length
            ? existingTargetFav.genres
            : oldFav?.genres,
          status: targetManga.status || existingTargetFav?.status || oldFav?.status,
          userCategory: targetManga.userCategory || existingTargetFav?.userCategory || oldFav?.userCategory || 'reading',
          userScore:
            typeof targetManga.userScore === 'number'
              ? targetManga.userScore
              : existingTargetFav?.userScore ?? oldFav?.userScore,
          userNotes:
            targetManga.userNotes !== undefined
              ? targetManga.userNotes
              : existingTargetFav?.userNotes?.trim()
              ? existingTargetFav.userNotes
              : oldFav?.userNotes,
          customCollections: mergedCollections.length > 0 ? mergedCollections : undefined,
          synopsis: targetManga.synopsis || existingTargetFav?.synopsis || oldFav?.synopsis,
          altTitles: mergedAltTitles.length > 0 ? mergedAltTitles : undefined,
          updatedAt: now
        });

        const filteredFavs = favorites.filter(
          f => f.mangaId !== targetManga.mangaId && (!removeOld || f.mangaId !== sourceMangaId)
        );
        const nextFavs = [nextFav, ...filteredFavs];
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(nextFavs));
        setFavoritesCache(nextFavs);
        syncBridge?.onFavoriteUpdated?.(nextFav);
        if (removeOld && sourceMangaId !== targetManga.mangaId) {
          syncBridge?.onFavoriteRemoved?.(sourceMangaId);
        }
        migratedFavorite = true;
      }

      // 2. Migrate Read Chapters by matching chapterNumber (or <= highest read chapter number)
      const readSet = new Set(this.getReadChapters());
      const readNumbers = new Set<string>();
      let highestReadFloat = -1;

      for (const ch of sourceChapters) {
        const isRead = readSet.has(ch.id) || Boolean(ch.variants?.some(v => readSet.has(v.id)));
        if (isRead) {
          const norm = String(parseFloat(ch.chapterNumber));
          if (norm !== 'NaN') {
            readNumbers.add(norm);
            highestReadFloat = Math.max(highestReadFloat, parseFloat(ch.chapterNumber));
          } else {
            readNumbers.add(ch.chapterNumber.trim().toLowerCase());
          }
        }
      }

      const historyList = this.getHistory();
      const oldProgress = historyList.find(h => h.mangaId === sourceMangaId);
      const existingTargetProgress = historyList.find(h => h.mangaId === targetManga.mangaId);
      if (oldProgress?.chapterNumber) {
        const pFloat = parseFloat(oldProgress.chapterNumber);
        if (!isNaN(pFloat)) {
          highestReadFloat = Math.max(highestReadFloat, pFloat);
          readNumbers.add(String(pFloat));
        }
      }

      if (readNumbers.size > 0 || highestReadFloat >= 0) {
        for (const tCh of targetChapters) {
          const tFloat = parseFloat(tCh.chapterNumber);
          const matchesExact = !isNaN(tFloat)
            ? readNumbers.has(String(tFloat))
            : readNumbers.has(tCh.chapterNumber.trim().toLowerCase());
          const matchesRange = !isNaN(tFloat) && highestReadFloat >= 0 && tFloat <= highestReadFloat;

          if (matchesExact || matchesRange) {
            if (!readSet.has(tCh.id)) {
              readSet.add(tCh.id);
              migratedReadChapters++;
            }
            tCh.variants?.forEach(v => readSet.add(v.id));
          }
        }
        const nextReadList = Array.from(readSet);
        localStorage.setItem(READ_CHAPTERS_KEY, JSON.stringify(nextReadList));
        setReadChaptersCache(nextReadList);
      }

      // 3. Migrate ReadingProgress (also clean up orphaned source history when removeOld=true)
      if (oldProgress && targetChapters.length > 0) {
        const oldNum = parseFloat(oldProgress.chapterNumber);
        const existingTargetNum = existingTargetProgress?.chapterNumber
          ? parseFloat(existingTargetProgress.chapterNumber)
          : -1;
        const shouldKeepExistingTarget =
          Boolean(existingTargetProgress) &&
          !isNaN(existingTargetNum) &&
          (isNaN(oldNum) || existingTargetNum > oldNum);

        if (shouldKeepExistingTarget && removeOld && sourceMangaId !== targetManga.mangaId) {
          const cleanedHistory = historyList.filter(h => h.mangaId !== sourceMangaId).slice(0, 50);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanedHistory));
          setHistoryCache(cleanedHistory);
        } else {
          const matchedTargetCh =
            targetChapters.find(c => {
              const cNum = parseFloat(c.chapterNumber);
              return !isNaN(oldNum) && !isNaN(cNum)
                ? cNum === oldNum
                : c.chapterNumber === oldProgress.chapterNumber;
            }) ||
            targetChapters.find(c => !isNaN(oldNum) && parseFloat(c.chapterNumber) >= oldNum) ||
            targetChapters[targetChapters.length - 1];

          if (matchedTargetCh) {
            const nextProgress: ReadingProgress = {
              mangaId: targetManga.mangaId,
              mangaTitle: targetManga.title,
              mangaCover: targetManga.coverUrl,
              chapterId: matchedTargetCh.id,
              chapterNumber: matchedTargetCh.chapterNumber,
              chapterTitle: matchedTargetCh.title,
              pageNumber: matchedTargetCh.chapterNumber === oldProgress.chapterNumber ? oldProgress.pageNumber : 1,
              totalPages: matchedTargetCh.pagesCount || oldProgress.totalPages || 1,
              sourceId: targetManga.sourceId || matchedTargetCh.sourceId,
              updatedAt: now
            };

            const filteredHistory = historyList.filter(
              h => h.mangaId !== targetManga.mangaId && (!removeOld || h.mangaId !== sourceMangaId)
            );
            const nextHistory = [nextProgress, ...filteredHistory].slice(0, 50);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
            setHistoryCache(nextHistory);
            syncBridge?.onProgressSaved?.(nextProgress);
            migratedProgress = true;
          }
        }
      } else if (oldProgress && removeOld && sourceMangaId !== targetManga.mangaId) {
        // Fallback when targetChapters could not be fetched: ensure duplicate source history is removed cleanly
        const cleanedHistory = historyList.filter(h => h.mangaId !== sourceMangaId).slice(0, 50);
        if (cleanedHistory.length !== historyList.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanedHistory));
          setHistoryCache(cleanedHistory);
        }
      }

      notifyListeners(['favorites', 'history', 'readChapters'], [sourceMangaId, targetManga.mangaId]);
      syncBridge?.onLibraryStateChanged?.();
    } catch (e) {
      console.warn('Failed to migrate manga data:', e);
    }

    return { migratedReadChapters, migratedFavorite, migratedProgress };
  },

  /**
   * Page-level bookmarks & highlights
   */
  getPageBookmarks(): PageBookmark[] {
    if (cachedPageBookmarks) return cachedPageBookmarks;
    try {
      const data = localStorage.getItem(PAGE_BOOKMARKS_KEY);
      if (!data) {
        cachedPageBookmarks = [];
        return cachedPageBookmarks;
      }
      const parsed = JSON.parse(data);
      cachedPageBookmarks = Array.isArray(parsed) ? parsed : [];
      return cachedPageBookmarks;
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
      cachedPageBookmarks = updatedList;
      notifyListeners('pageBookmarks', []);
    } catch (e) {
      console.warn('Failed to save page bookmark', e);
    }
    return newBookmark;
  },

  removePageBookmark(bookmarkId: string): void {
    const list = this.getPageBookmarks().filter(b => b.id !== bookmarkId);
    try {
      localStorage.setItem(PAGE_BOOKMARKS_KEY, JSON.stringify(list));
      cachedPageBookmarks = list;
      notifyListeners('pageBookmarks', []);
    } catch (e) {
      console.warn('Failed to remove page bookmark', e);
    }
  },

  removePageBookmarkByPage(chapterId: string, pageNumber: number): void {
    const list = this.getPageBookmarks().filter(b => !(b.chapterId === chapterId && b.pageNumber === pageNumber));
    try {
      localStorage.setItem(PAGE_BOOKMARKS_KEY, JSON.stringify(list));
      cachedPageBookmarks = list;
      notifyListeners('pageBookmarks', []);
    } catch (e) {
      console.warn('Failed to remove page bookmark', e);
    }
  },

  /**
   * Custom Collections / Folders
   */
  getCustomCollections(): string[] {
    if (cachedCustomCollections) return cachedCustomCollections;
    try {
      const data = localStorage.getItem(CUSTOM_COLLECTIONS_KEY);
      if (!data) {
        cachedCustomCollections = [];
        return cachedCustomCollections;
      }
      const parsed = JSON.parse(data);
      cachedCustomCollections = Array.isArray(parsed) ? parsed : [];
      return cachedCustomCollections;
    } catch {
      return [];
    }
  },

  createCustomCollection(name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const list = this.getCustomCollections();
    if (list.some(c => c.toLowerCase() === trimmed.toLowerCase())) return false;
    const next = [...list, trimmed];
    try {
      localStorage.setItem(CUSTOM_COLLECTIONS_KEY, JSON.stringify(next));
      cachedCustomCollections = next;
      notifyListeners('collections', []);
      syncBridge?.onLibraryStateChanged?.();
      return true;
    } catch {
      return false;
    }
  },

  deleteCustomCollection(name: string): void {
    const list = this.getCustomCollections().filter(c => c !== name);
    try {
      localStorage.setItem(CUSTOM_COLLECTIONS_KEY, JSON.stringify(list));
      cachedCustomCollections = list;
      // Remove from favorites that reference this collection without mutating cached objects in-place
      const favorites = this.getFavorites();
      let changed = false;
      const changedIds: string[] = [];
      const nextFavs = favorites.map(f => {
        if (f.customCollections && f.customCollections.includes(name)) {
          changed = true;
          changedIds.push(f.mangaId);
          return {
            ...f,
            customCollections: f.customCollections.filter(c => c !== name)
          };
        }
        return f;
      });
      if (changed) {
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(nextFavs));
        setFavoritesCache(nextFavs);
      }
      notifyListeners(changed ? ['collections', 'favorites'] : 'collections', changedIds);
      syncBridge?.onLibraryStateChanged?.();
    } catch (e) {
      console.warn('Failed to delete custom collection', e);
    }
  },

  toggleMangaInCollection(mangaId: string, collectionName: string): boolean {
    const favorites = this.getFavorites();
    const target = this.getFavoriteById(mangaId);
    if (!target) return false;
    const currentCols = target.customCollections || [];
    let isNowIn = false;
    const nextCols = currentCols.includes(collectionName)
      ? currentCols.filter(c => c !== collectionName)
      : ((isNowIn = true), [...currentCols, collectionName]);
    const updatedFav: FavoriteManga = { ...target, customCollections: nextCols };
    const nextFavs = favorites.map(f => (f.mangaId === mangaId ? updatedFav : f));
    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(nextFavs));
      setFavoritesCache(nextFavs);
      notifyListeners('favorites', mangaId);
      syncBridge?.onFavoriteUpdated?.(updatedFav);
      syncBridge?.onLibraryStateChanged?.();
      return isNowIn;
    } catch {
      return false;
    }
  },

  setMangaCollections(mangaId: string, collections: string[]): boolean {
    const favorites = this.getFavorites();
    const target = this.getFavoriteById(mangaId);
    if (!target) return false;
    const updatedFav: FavoriteManga = {
      ...target,
      customCollections: Array.from(new Set(collections.filter(Boolean)))
    };
    const nextFavs = favorites.map(f => (f.mangaId === mangaId ? updatedFav : f));
    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(nextFavs));
      setFavoritesCache(nextFavs);
      notifyListeners('favorites', mangaId);
      syncBridge?.onFavoriteUpdated?.(updatedFav);
      syncBridge?.onLibraryStateChanged?.();
      return true;
    } catch {
      return false;
    }
  },

  batchUpdateCategory(mangaIds: string[], category: LibraryCategory): void {
    try {
      const idSet = new Set(mangaIds);
      const favorites = this.getFavorites();
      const updated = favorites.map(fav =>
        idSet.has(fav.mangaId) ? { ...fav, userCategory: category, updatedAt: Date.now() } : fav
      );
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
      setFavoritesCache(updated);
      notifyListeners('favorites', mangaIds);
      updated.filter(f => idSet.has(f.mangaId)).forEach(f => syncBridge?.onFavoriteUpdated?.(f));
      syncBridge?.onLibraryStateChanged?.();
    } catch (e) {
      console.warn('Failed to batch update categories', e);
    }
  },

  batchAddCollections(mangaIds: string[], collections: string[]): void {
    try {
      const idSet = new Set(mangaIds);
      const favorites = this.getFavorites();
      const updated = favorites.map(fav => {
        if (!idSet.has(fav.mangaId)) return fav;
        const current = fav.customCollections || [];
        const combined = Array.from(new Set([...current, ...collections]));
        return { ...fav, customCollections: combined, updatedAt: Date.now() };
      });
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
      setFavoritesCache(updated);
      notifyListeners('favorites', mangaIds);
      updated.filter(f => idSet.has(f.mangaId)).forEach(f => syncBridge?.onFavoriteUpdated?.(f));
      syncBridge?.onLibraryStateChanged?.();
    } catch (e) {
      console.warn('Failed to batch add collections', e);
    }
  },

  batchRemoveFavorites(mangaIds: string[]): void {
    try {
      const idSet = new Set(mangaIds);
      const favorites = this.getFavorites().filter(f => !idSet.has(f.mangaId));
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(favorites));
      setFavoritesCache(favorites);
      notifyListeners('favorites', mangaIds);
      mangaIds.forEach(id => syncBridge?.onFavoriteRemoved?.(id));
      syncBridge?.onLibraryStateChanged?.();
    } catch (e) {
      console.warn('Failed to batch remove favorites', e);
    }
  },

  /**
   * Ignored / Dismissed Mangas (ocultos da busca sem salvar nos favoritos)
   */
  getIgnoredMangas(): IgnoredManga[] {
    if (cachedIgnored) return cachedIgnored;
    try {
      const data = localStorage.getItem(IGNORED_KEY);
      if (!data) {
        setIgnoredCache([]);
        return cachedIgnored!;
      }
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) {
        setIgnoredCache([]);
        return cachedIgnored!;
      }
      let ignoredNeedsRewrite = false;
      const normalized: IgnoredManga[] = parsed
        .filter((item: any) => item && typeof item.mangaId === 'string' && item.mangaId)
        .map((item: any) => {
          const rawTitle = item.title || 'Obra Dispensada';
          const cleanTitle = typeof rawTitle === 'string' && rawTitle.includes('&')
            ? decodeHtmlEntities(rawTitle)
            : rawTitle;
          if (cleanTitle !== rawTitle) ignoredNeedsRewrite = true;
          const cleanAlts = Array.isArray(item.altTitles)
            ? item.altTitles
                .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
                .slice(0, 10)
                .map((t: string) => {
                  const decoded = t.includes('&') ? decodeHtmlEntities(t) : t;
                  if (decoded !== t) ignoredNeedsRewrite = true;
                  return decoded;
                })
            : undefined;
          return {
            mangaId: item.mangaId,
            title: cleanTitle,
            altTitles: cleanAlts,
            coverUrl: item.coverUrl || undefined,
            sourceId: item.sourceId || undefined,
            sourceName: item.sourceName || undefined,
            dismissedAt: typeof item.dismissedAt === 'number' ? item.dismissedAt : Date.now()
          };
        });
      if (ignoredNeedsRewrite) {
        try {
          localStorage.setItem(IGNORED_KEY, JSON.stringify(normalized));
        } catch {
          // ignore quota warnings on passive cleanup
        }
      }
      setIgnoredCache(normalized);
      return cachedIgnored!;
    } catch {
      return [];
    }
  },

  isIgnored(mangaId: string): boolean {
    if (!mangaId) return false;
    if (!cachedIgnoredSet) {
      this.getIgnoredMangas();
    }
    return cachedIgnoredSet?.has(mangaId) || false;
  },

  ignoreManga(manga: Omit<IgnoredManga, 'dismissedAt'> & { dismissedAt?: number }): void {
    if (!manga?.mangaId) return;
    try {
      const current = this.getIgnoredMangas().filter(item => item.mangaId !== manga.mangaId);
      const rawTitle = manga.title || 'Obra Dispensada';
      const entry: IgnoredManga = {
        mangaId: manga.mangaId,
        title: typeof rawTitle === 'string' && rawTitle.includes('&') ? decodeHtmlEntities(rawTitle) : rawTitle,
        altTitles: Array.isArray(manga.altTitles)
          ? manga.altTitles
              .filter(t => typeof t === 'string' && t.trim().length > 0)
              .slice(0, 10)
              .map(t => (t.includes('&') ? decodeHtmlEntities(t) : t))
          : undefined,
        coverUrl: manga.coverUrl,
        sourceId: manga.sourceId,
        sourceName: manga.sourceName,
        dismissedAt: manga.dismissedAt || Date.now()
      };
      const updated = [entry, ...current].slice(0, 3000);
      localStorage.setItem(IGNORED_KEY, JSON.stringify(updated));
      setIgnoredCache(updated);
      notifyListeners('ignored', manga.mangaId);
      syncBridge?.onLibraryStateChanged?.();
    } catch (e) {
      console.warn('Failed to ignore manga', e);
    }
  },

  unignoreManga(mangaId: string): void {
    if (!mangaId) return;
    try {
      if (cachedIgnoredSet && !cachedIgnoredSet.has(mangaId)) return;
      const current = this.getIgnoredMangas();
      const updated = current.filter(item => item.mangaId !== mangaId);
      if (updated.length !== current.length) {
        localStorage.setItem(IGNORED_KEY, JSON.stringify(updated));
        setIgnoredCache(updated);
        notifyListeners('ignored', mangaId);
        syncBridge?.onLibraryStateChanged?.();
      }
    } catch (e) {
      console.warn('Failed to unignore manga', e);
    }
  },

  toggleIgnoreManga(manga: Omit<IgnoredManga, 'dismissedAt'>): boolean {
    if (!manga?.mangaId) return false;
    if (this.isIgnored(manga.mangaId)) {
      this.unignoreManga(manga.mangaId);
      return false;
    }
    this.ignoreManga(manga);
    return true;
  },

  clearIgnoredMangas(): void {
    try {
      localStorage.setItem(IGNORED_KEY, JSON.stringify([]));
      setIgnoredCache([]);
      notifyListeners('ignored', '*');
      syncBridge?.onLibraryStateChanged?.();
    } catch (e) {
      console.warn('Failed to clear ignored mangas', e);
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
      pageBookmarks: this.getPageBookmarks(),
      customCollections: this.getCustomCollections(),
      ignoredMangas: this.getIgnoredMangas()
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
    categoriesAdded: number;
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
      let categoriesAdded = 0;

      if (Array.isArray(data.favorites)) {
        importedFavorites = data.favorites;
      } else if (Array.isArray(data.mangas) || Array.isArray(data.backupManga)) {
        // Tachiyomi / Mihon v1 & v2 protobuf-json backup format
        const mangaList = Array.isArray(data.backupManga) ? data.backupManga : data.mangas;
        
        // Extract categories if available
        let categoriesAdded = 0;
        const rawCategories = Array.isArray(data.backupCategories) ? data.backupCategories : Array.isArray(data.categories) ? data.categories : [];
        if (rawCategories.length > 0) {
          rawCategories.forEach((rc: any) => {
            const name = typeof rc === 'string' ? rc : rc?.name;
            if (name && typeof name === 'string' && name.trim()) {
              if (this.createCustomCollection(name.trim())) {
                categoriesAdded++;
              }
            }
          });
        }

        mangaList.forEach((tm: any) => {
          if (!tm || !tm.title) return;
          const cleanTitle = tm.title;
          const id = tm.url
            ? tm.url.replace(/^\/manga\//, '')
            : `mr_tachiyomi_${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

          let cat: LibraryCategory = 'reading';
          const cats = tm.categories || tm.categoriesList || [];
          if (Array.isArray(cats) && cats.length > 0) {
            const catStr = String(cats[0]).toLowerCase();
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
        favMap.set(f.mangaId, compactFavoriteForStorage({
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
          synopsis: typeof f.synopsis === 'string' ? f.synopsis : existing?.synopsis,
          altTitles: Array.isArray(f.altTitles) ? f.altTitles : existing?.altTitles,
          updatedAt: Math.max(f.updatedAt || 0, existing?.updatedAt || 0) || Date.now()
        }));
      });

      const mergedFavorites = Array.from(favMap.values());
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(mergedFavorites));
      setFavoritesCache(mergedFavorites);

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
      setHistoryCache(mergedHistory);

      // Merge Read Chapters if present
      if (Array.isArray(data.readChapters)) {
        const currentRead = this.getReadChapters();
        const set = new Set([...currentRead, ...data.readChapters]);
        const nextRead = Array.from(set);
        localStorage.setItem(READ_CHAPTERS_KEY, JSON.stringify(nextRead));
        setReadChaptersCache(nextRead);
      }

      // Merge Stats if present
      if (data.stats && typeof data.stats.totalSecondsSpent === 'number') {
        const currentSec = this.getStoredSeconds();
        if (data.stats.totalSecondsSpent > currentSec) {
          const statsPayload = {
            totalSeconds: data.stats.totalSecondsSpent,
            lastReadDate: data.stats.lastReadDate || new Date().toISOString()
          };
          localStorage.setItem(STATS_KEY, JSON.stringify(statsPayload));
          cachedStats = statsPayload;
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
        const nextBms = Array.from(bmMap.values());
        localStorage.setItem(PAGE_BOOKMARKS_KEY, JSON.stringify(nextBms));
        cachedPageBookmarks = nextBms;
      }

      // Merge Custom Collections if present
      if (Array.isArray(data.customCollections)) {
        const currentCols = this.getCustomCollections();
        const set = new Set([...currentCols, ...data.customCollections.filter((c: any) => typeof c === 'string' && c.trim())]);
        if (set.size > currentCols.length) {
          categoriesAdded += (set.size - currentCols.length);
        }
        const nextCols = Array.from(set);
        localStorage.setItem(CUSTOM_COLLECTIONS_KEY, JSON.stringify(nextCols));
        cachedCustomCollections = nextCols;
      }

      // Merge Ignored / Dismissed Mangas if present
      if (Array.isArray(data.ignoredMangas)) {
        const currentIgnored = this.getIgnoredMangas();
        const igMap = new Map<string, IgnoredManga>();
        currentIgnored.forEach(item => igMap.set(item.mangaId, item));
        data.ignoredMangas.forEach((item: IgnoredManga) => {
          if (item && item.mangaId && !igMap.has(item.mangaId)) {
            igMap.set(item.mangaId, {
              mangaId: item.mangaId,
              title: item.title || 'Obra Dispensada',
              coverUrl: item.coverUrl,
              sourceId: item.sourceId,
              sourceName: item.sourceName,
              dismissedAt: item.dismissedAt || Date.now()
            });
          }
        });
        const nextIgnored = Array.from(igMap.values()).slice(0, 3000);
        localStorage.setItem(IGNORED_KEY, JSON.stringify(nextIgnored));
        setIgnoredCache(nextIgnored);
      }

      notifyListeners('all', '*');
      syncBridge?.onBulkImported?.();

      return {
        success: true,
        favoritesAdded: favAdded,
        historyAdded: histAdded,
        totalFavorites: mergedFavorites.length,
        totalHistory: mergedHistory.length,
        categoriesAdded
      };
    } catch (err) {
      return {
        success: false,
        favoritesAdded: 0,
        historyAdded: 0,
        totalFavorites: this.getFavorites().length,
        totalHistory: this.getHistory().length,
        categoriesAdded: 0,
        message: (err as Error).message || 'Falha ao processar arquivo de restauração.'
      };
    }
  }
};

