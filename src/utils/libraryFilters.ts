import { FavoriteManga, IgnoredManga, Manga } from '../types/manga.js';

const NORMALIZED_TITLE_CACHE = new Map<string, string>();
const SPACED_TITLE_CACHE = new Map<string, string>();
const MAX_TITLE_CACHE_SIZE = 15000;

export function stripLibraryEditionTags(raw: string): string {
  return raw
    .replace(/\((?:official|colored|full\s*color|digital|webtoon|manga|uncensored|simulpub|pt-br|en)\)/gi, '')
    .replace(/\[(?:official|colored|pt-br|en|br|eng)\]/gi, '');
}

export function normalizeLibraryTitle(raw?: string): string {
  if (!raw) return '';
  const cached = NORMALIZED_TITLE_CACHE.get(raw);
  if (cached !== undefined) return cached;

  const result = stripLibraryEditionTags(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  if (NORMALIZED_TITLE_CACHE.size >= MAX_TITLE_CACHE_SIZE) {
    NORMALIZED_TITLE_CACHE.clear();
  }
  NORMALIZED_TITLE_CACHE.set(raw, result);
  return result;
}

export function normalizeSpacedLibraryTitle(raw?: string): string {
  if (!raw) return '';
  const cached = SPACED_TITLE_CACHE.get(raw);
  if (cached !== undefined) return cached;

  const result = stripLibraryEditionTags(raw)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  if (SPACED_TITLE_CACHE.size >= MAX_TITLE_CACHE_SIZE) {
    SPACED_TITLE_CACHE.clear();
  }
  SPACED_TITLE_CACHE.set(raw, result);
  return result;
}

interface MangaCandidateCacheEntry {
  title: string;
  altTitlesRef: string[] | undefined;
  sourcesRef: Manga['sources'] | undefined;
  ids: string[];
  titles: string[];
}

const MANGA_CANDIDATES_CACHE = new WeakMap<Manga, MangaCandidateCacheEntry>();

function getMangaCandidates(manga: Manga): { ids: string[]; titles: string[] } {
  const cached = MANGA_CANDIDATES_CACHE.get(manga);
  if (
    cached &&
    cached.title === manga.title &&
    cached.altTitlesRef === manga.altTitles &&
    cached.sourcesRef === manga.sources
  ) {
    return { ids: cached.ids, titles: cached.titles };
  }

  const ids: string[] = [];
  if (manga.id) ids.push(manga.id);
  if (Array.isArray(manga.sources)) {
    for (const s of manga.sources) {
      if (s?.sourceId && s?.externalId) {
        ids.push(`mr_${s.sourceId}_${s.externalId}`);
      }
    }
  }

  const titleSet = new Set<string>();
  const main = normalizeLibraryTitle(manga.title);
  if (main) titleSet.add(main);
  if (Array.isArray(manga.altTitles)) {
    for (const alt of manga.altTitles) {
      const clean = normalizeLibraryTitle(alt);
      if (clean && clean.length >= 3) titleSet.add(clean);
    }
  }

  const titles = Array.from(titleSet);
  MANGA_CANDIDATES_CACHE.set(manga, {
    title: manga.title,
    altTitlesRef: manga.altTitles,
    sourcesRef: manga.sources,
    ids,
    titles
  });
  return { ids, titles };
}

export interface LibraryIndex {
  ids: Set<string>;
  titles: Set<string>;
}

const EMPTY_LIBRARY_INDEX: LibraryIndex = { ids: new Set<string>(), titles: new Set<string>() };
const LIBRARY_INDEX_CACHE = new WeakMap<
  ReadonlyArray<{ mangaId: string; title?: string; altTitles?: string[] }>,
  { length: number; firstId?: string; lastId?: string; index: LibraryIndex }
>();

export function buildLibraryIndex(
  items: ReadonlyArray<{ mangaId: string; title?: string; altTitles?: string[] }>
): LibraryIndex {
  if (!items || items.length === 0) {
    return EMPTY_LIBRARY_INDEX;
  }
  const firstId = items[0]?.mangaId;
  const lastId = items[items.length - 1]?.mangaId;
  const cached = LIBRARY_INDEX_CACHE.get(items);
  if (
    cached &&
    cached.length === items.length &&
    cached.firstId === firstId &&
    cached.lastId === lastId
  ) {
    return cached.index;
  }

  const ids = new Set<string>();
  const titles = new Set<string>();
  for (const item of items) {
    if (item.mangaId) ids.add(item.mangaId);
    if (item.title) {
      const main = normalizeLibraryTitle(item.title);
      if (main) titles.add(main);
    }
    if (Array.isArray(item.altTitles)) {
      for (const alt of item.altTitles) {
        const clean = normalizeLibraryTitle(alt);
        if (clean && clean.length >= 3) titles.add(clean);
      }
    }
  }
  const index = { ids, titles };
  LIBRARY_INDEX_CACHE.set(items, { length: items.length, firstId, lastId, index });
  return index;
}

export function isMangaInLibraryIndex(manga: Manga, index: LibraryIndex): boolean {
  if (!manga || (index.ids.size === 0 && index.titles.size === 0)) return false;
  const { ids, titles } = getMangaCandidates(manga);
  for (const id of ids) {
    if (index.ids.has(id)) return true;
  }
  for (const t of titles) {
    if (index.titles.has(t)) return true;
  }
  return false;
}

export function isMangaInFavorites(manga: Manga, favorites: FavoriteManga[]): boolean {
  if (!manga || !favorites || favorites.length === 0) return false;
  return isMangaInLibraryIndex(manga, buildLibraryIndex(favorites));
}

export function isMangaInIgnored(manga: Manga, ignoredList: IgnoredManga[]): boolean {
  if (!manga || !ignoredList || ignoredList.length === 0) return false;
  return isMangaInLibraryIndex(manga, buildLibraryIndex(ignoredList));
}

export function pickOracleCandidate(
  candidates: Manga[],
  favorites: FavoriteManga[],
  ignoredList: IgnoredManga[],
  lastShownId?: string
): Manga | null {
  const safeVisible = candidates.filter(m => m && !m.isAdult && !isMangaInIgnored(m, ignoredList));
  if (safeVisible.length === 0) return null;

  const unsaved = safeVisible.filter(m => !isMangaInFavorites(m, favorites));
  const preferredPool = unsaved.length > 0 ? unsaved : safeVisible;
  const nonRepeatPool =
    lastShownId && preferredPool.length > 1
      ? preferredPool.filter(m => m.id !== lastShownId)
      : preferredPool;

  const finalPool = nonRepeatPool.length > 0 ? nonRepeatPool : preferredPool;
  return finalPool[Math.floor(Math.random() * finalPool.length)] || null;
}

export function pickSurpriseCandidate(
  pools: Manga[][],
  favorites: FavoriteManga[],
  ignoredList: IgnoredManga[]
): Manga | null {
  for (const pool of pools) {
    if (!pool || pool.length === 0) continue;
    const discoveries = pool.filter(
      m => m && !m.isAdult && !isMangaInIgnored(m, ignoredList) && !isMangaInFavorites(m, favorites)
    );
    if (discoveries.length > 0) {
      return discoveries[Math.floor(Math.random() * discoveries.length)];
    }
  }

  // Last resort: still NEVER pick an ignored/hidden manga
  for (const pool of pools) {
    if (!pool || pool.length === 0) continue;
    const visible = pool.filter(m => m && !m.isAdult && !isMangaInIgnored(m, ignoredList));
    if (visible.length > 0) {
      return visible[Math.floor(Math.random() * visible.length)];
    }
  }

  return null;
}
