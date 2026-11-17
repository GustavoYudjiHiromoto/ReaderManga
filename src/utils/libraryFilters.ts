import { FavoriteManga, IgnoredManga, Manga } from '../types/manga.js';

export function normalizeLibraryTitle(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/\((?:official|colored|full\s*color|digital|webtoon|manga|uncensored|simulpub|pt-br|en)\)/gi, '')
    .replace(/\[(?:official|colored|pt-br|en|br|eng)\]/gi, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function getAllCandidateIds(manga: Manga): string[] {
  const ids: string[] = [];
  if (manga.id) ids.push(manga.id);
  if (Array.isArray(manga.sources)) {
    for (const s of manga.sources) {
      if (s?.sourceId && s?.externalId) {
        ids.push(`mr_${s.sourceId}_${s.externalId}`);
      }
    }
  }
  return ids;
}

function getAllCandidateTitles(manga: Manga): string[] {
  const titles = new Set<string>();
  const main = normalizeLibraryTitle(manga.title);
  if (main) titles.add(main);
  if (Array.isArray(manga.altTitles)) {
    for (const alt of manga.altTitles) {
      const clean = normalizeLibraryTitle(alt);
      if (clean && clean.length >= 3) titles.add(clean);
    }
  }
  return Array.from(titles);
}

export function isMangaInFavorites(manga: Manga, favorites: FavoriteManga[]): boolean {
  if (!manga || !favorites || favorites.length === 0) return false;

  const favIds = new Set<string>();
  const favTitles = new Set<string>();
  for (const fav of favorites) {
    if (fav.mangaId) favIds.add(fav.mangaId);
    const main = normalizeLibraryTitle(fav.title);
    if (main) favTitles.add(main);
    if (Array.isArray(fav.altTitles)) {
      for (const alt of fav.altTitles) {
        const clean = normalizeLibraryTitle(alt);
        if (clean && clean.length >= 3) favTitles.add(clean);
      }
    }
  }

  for (const id of getAllCandidateIds(manga)) {
    if (favIds.has(id)) return true;
  }
  for (const t of getAllCandidateTitles(manga)) {
    if (favTitles.has(t)) return true;
  }
  return false;
}

export function isMangaInIgnored(manga: Manga, ignoredList: IgnoredManga[]): boolean {
  if (!manga || !ignoredList || ignoredList.length === 0) return false;

  const ignoredIds = new Set<string>();
  const ignoredTitles = new Set<string>();
  for (const item of ignoredList) {
    if (item.mangaId) ignoredIds.add(item.mangaId);
    const main = normalizeLibraryTitle(item.title);
    if (main) ignoredTitles.add(main);
    if (Array.isArray(item.altTitles)) {
      for (const alt of item.altTitles) {
        const clean = normalizeLibraryTitle(alt);
        if (clean && clean.length >= 3) ignoredTitles.add(clean);
      }
    }
  }

  for (const id of getAllCandidateIds(manga)) {
    if (ignoredIds.has(id)) return true;
  }
  for (const t of getAllCandidateTitles(manga)) {
    if (ignoredTitles.has(t)) return true;
  }
  return false;
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
