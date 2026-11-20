import type { Manga, Chapter } from '../types/manga.js';

const NAMED_HTML_ENTITIES: Record<string, string> = {
  quot: '"',
  apos: "'",
  amp: '&',
  lt: '<',
  gt: '>',
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  middot: '·',
  bull: '•',
  laquo: '«',
  raquo: '»',
  deg: '°',
  plusmn: '±',
  frac12: '½'
};

const ENTITY_PATTERN = /&(?:#x([0-9a-fA-F]+)|#(\d+)|([a-zA-Z][a-zA-Z0-9]+));/g;

function decodeOnce(input: string): string {
  return input.replace(ENTITY_PATTERN, (full, hex, dec, named) => {
    if (hex !== undefined) {
      const code = parseInt(hex, 16);
      if (code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) {
        return String.fromCodePoint(code);
      }
      return full;
    }
    if (dec !== undefined) {
      const code = parseInt(dec, 10);
      if (code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) {
        return String.fromCodePoint(code);
      }
      return full;
    }
    if (named !== undefined) {
      const replacement = NAMED_HTML_ENTITIES[named] ?? NAMED_HTML_ENTITIES[named.toLowerCase()];
      if (replacement !== undefined) return replacement;
    }
    return full;
  });
}

/**
 * Decodes HTML named, decimal (e.g. `&#34;`, `&#39;`), and hexadecimal (e.g. `&#x27;`) entities.
 * Handles up to 2 passes for double-encoded payloads (e.g. `&amp;#34;`).
 */
export function decodeHtmlEntities(str?: string | null): string {
  if (!str) return '';
  if (!str.includes('&')) return str.trim();

  let decoded = decodeOnce(str);
  if (decoded !== str && decoded.includes('&')) {
    decoded = decodeOnce(decoded);
  }
  return decoded.trim();
}

function cleanStringArray(list?: string[]): { list?: string[]; changed: boolean } {
  if (!Array.isArray(list) || list.length === 0) return { list, changed: false };
  let changed = false;
  const out = new Array<string>(list.length);
  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
    if (typeof raw === 'string' && raw.includes('&')) {
      const cleaned = decodeHtmlEntities(raw);
      if (cleaned !== raw) changed = true;
      out[i] = cleaned;
    } else {
      out[i] = raw;
    }
  }
  return { list: changed ? out : list, changed };
}

export function sanitizeMangaEntities(manga: Manga): Manga {
  if (!manga) return manga;
  const title = manga.title?.includes('&') ? decodeHtmlEntities(manga.title) : manga.title;
  const synopsis = manga.synopsis?.includes('&') ? decodeHtmlEntities(manga.synopsis) : manga.synopsis;
  const alts = cleanStringArray(manga.altTitles);
  const authors = cleanStringArray(manga.authors);
  const artists = cleanStringArray(manga.artists);
  const genres = cleanStringArray(manga.genres);
  const magazine = manga.publicationInfo?.magazine?.includes('&')
    ? decodeHtmlEntities(manga.publicationInfo.magazine)
    : manga.publicationInfo?.magazine;
  const demographic = manga.publicationInfo?.demographic?.includes('&')
    ? decodeHtmlEntities(manga.publicationInfo.demographic)
    : manga.publicationInfo?.demographic;

  const changed =
    title !== manga.title ||
    synopsis !== manga.synopsis ||
    alts.changed ||
    authors.changed ||
    artists.changed ||
    genres.changed ||
    magazine !== manga.publicationInfo?.magazine ||
    demographic !== manga.publicationInfo?.demographic;

  if (!changed) return manga;

  return {
    ...manga,
    title,
    synopsis,
    altTitles: alts.list || [],
    authors: authors.list || [],
    artists: artists.list || [],
    genres: genres.list || [],
    publicationInfo: {
      ...manga.publicationInfo,
      magazine,
      demographic
    }
  };
}

export function sanitizeChapterEntities(chapter: Chapter): Chapter {
  if (!chapter) return chapter;
  const title = chapter.title?.includes('&') ? decodeHtmlEntities(chapter.title) : chapter.title;
  const scanlationGroup = chapter.scanlationGroup?.includes('&')
    ? decodeHtmlEntities(chapter.scanlationGroup)
    : chapter.scanlationGroup;

  let variantsChanged = false;
  let variants = chapter.variants;
  if (Array.isArray(chapter.variants) && chapter.variants.length > 0) {
    const nextVariants = chapter.variants.map(v => {
      const vTitle = v.title?.includes('&') ? decodeHtmlEntities(v.title) : v.title;
      const vScan = v.scanlationGroup?.includes('&')
        ? decodeHtmlEntities(v.scanlationGroup)
        : v.scanlationGroup;
      if (vTitle !== v.title || vScan !== v.scanlationGroup) {
        variantsChanged = true;
        return { ...v, title: vTitle, scanlationGroup: vScan };
      }
      return v;
    });
    if (variantsChanged) variants = nextVariants;
  }

  if (title === chapter.title && scanlationGroup === chapter.scanlationGroup && !variantsChanged) {
    return chapter;
  }

  return {
    ...chapter,
    title,
    scanlationGroup,
    variants
  };
}
