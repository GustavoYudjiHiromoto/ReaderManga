import * as cheerio from 'cheerio';
import { IMangaSource, SourceSearchOptions, SourceSearchResult } from './IMangaSource.js';
import {
  Chapter,
  CustomHtmlSelectors,
  DynamicExtensionManifest,
  Manga,
  MangaPage,
  MangaSourceInfo,
  MangaStatus
} from '../../src/types/manga.js';
import { HttpError } from '../errors/HttpError.js';
import { residentialRelayService, isSafeExternalRelayUrl } from '../services/ResidentialRelayService.js';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Losslessly encodes any URL or relative path into an underscore-free token
 * safe for `mr_<sourceId>_<externalId>` and `ch_<sourceId>_<mangaId>_<chapterId>`.
 */
export function encodeDynamicId(raw: string): string {
  const clean = (raw || '').trim();
  const b64 = Buffer.from(clean, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '.')
    .replace(/=+$/g, '');
  return `d~${b64}`;
}

export function decodeDynamicId(token: string): string {
  if (!token) return '';
  if (!token.startsWith('d~')) {
    return token;
  }
  const body = token.slice(2).replace(/-/g, '+').replace(/\./g, '/');
  const pad = body.length % 4 === 0 ? '' : '='.repeat(4 - (body.length % 4));
  try {
    return Buffer.from(body + pad, 'base64').toString('utf8');
  } catch {
    return token;
  }
}

export function normalizeBaseUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function resolveAbsoluteUrl(href: string | undefined, baseUrl: string): string {
  if (!href) return '';
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return '';
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  try {
    return new URL(trimmed, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
  } catch {
    return '';
  }
}

export function extractBestImageUrl($el: cheerio.Cheerio<any>, baseUrl: string): string {
  const candidates = [
    $el.attr('data-src'),
    $el.attr('data-lazy-src'),
    $el.attr('data-original'),
    $el.attr('data-cfsrc'),
    $el.attr('data-full-url'),
    $el.attr('src'),
    $el.attr('srcset')?.split(',')[0]?.trim().split(/\s+/)[0]
  ];

  for (const cand of candidates) {
    if (!cand) continue;
    const trimmed = cand.trim();
    if (!trimmed || trimmed.startsWith('data:image/gif') || trimmed.startsWith('data:image/svg')) continue;
    const resolved = resolveAbsoluteUrl(trimmed, baseUrl);
    if (resolved) return resolved;
  }
  return '';
}

export function formatDynamicProxyUrl(imageUrl: string, refererUrl: string): string {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('/api/proxy/image')) return imageUrl;
  return `/api/proxy/image?url=${encodeURIComponent(imageUrl)}&referer=${encodeURIComponent(refererUrl)}`;
}

export function extractChapterNumber(rawText: string, fallbackIndex: number = 1): string {
  const text = (rawText || '').trim();
  if (!text) return String(fallbackIndex);

  // Match patterns like "Capítulo 125.5", "Ch. 12", "Chapter 04", "#15"
  const explicitMatch = text.match(
    /(?:cap[íi]tulo|cap\.?|chapter|ch\.?|epis[óo]dio|ep\.?|#)\s*(\d+(?:[.,]\d+)?)/i
  );
  if (explicitMatch) {
    return explicitMatch[1].replace(',', '.');
  }

  // Fallback: first standalone number in title or URL
  const genericMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (genericMatch) {
    return genericMatch[1];
  }

  return String(fallbackIndex);
}

export function normalizeMangaStatus(rawStatus: string): MangaStatus {
  const s = (rawStatus || '').toLowerCase();
  if (s.includes('complet') || s.includes('conclu') || s.includes('finaliz') || s.includes('finish')) {
    return 'completed';
  }
  if (s.includes('hiat') || s.includes('paus') || s.includes('hold')) {
    return 'hiatus';
  }
  if (s.includes('cancel') || s.includes('drop')) {
    return 'cancelled';
  }
  return 'ongoing';
}

export function isCloudflareBlocked(status: number, body: string, headers?: Headers): boolean {
  const lower = (body || '').toLowerCase();
  const cfMitigated = headers?.get('cf-mitigated')?.toLowerCase() === 'challenge';
  if (cfMitigated) return true;
  if (status === 403 || status === 503) {
    if (
      lower.includes('just a moment') ||
      lower.includes('challenge-platform') ||
      lower.includes('__cf_chl_') ||
      lower.includes('cf-browser-verification') ||
      lower.includes('attention required! | cloudflare') ||
      lower.includes('enable javascript and cookies to continue')
    ) {
      return true;
    }
    if (status === 403 && headers?.get('server')?.toLowerCase().includes('cloudflare')) {
      return true;
    }
  }
  return false;
}

function toRelativeSlug(absUrl: string, baseUrl: string): string {
  try {
    const u = new URL(absUrl);
    const b = new URL(baseUrl);
    if (u.host === b.host) {
      return u.pathname + u.search;
    }
    return absUrl;
  } catch {
    return absUrl;
  }
}

export interface ParsedSearchContext {
  sourceId: string;
  sourceName: string;
  baseUrl: string;
  lang: string;
  nsfw?: boolean;
}

export function parseMadaraSearchHtml(html: string, ctx: ParsedSearchContext): Manga[] {
  const $ = cheerio.load(html);
  const results: Manga[] = [];
  const seen = new Set<string>();

  const cards = $('.c-tabs-item__content, .page-item-detail, .manga-item');
  cards.each((_, el) => {
    const $card = $(el);
    const $link = $card.find('.post-title h3 a, .post-title h4 a, h3 a, h4 a, .item-thumb a, .tab-thumb a').first();
    const href = resolveAbsoluteUrl($link.attr('href'), ctx.baseUrl);
    if (!href) return;

    const relPath = toRelativeSlug(href, ctx.baseUrl);
    if (seen.has(relPath)) return;
    seen.add(relPath);

    const title = ($card.find('.post-title h3, .post-title h4, .post-title a, h3 a').first().text() || $link.attr('title') || '').trim();
    if (!title) return;

    const $img = $card.find('img').first();
    const rawCover = extractBestImageUrl($img, ctx.baseUrl);
    const coverUrl = rawCover ? formatDynamicProxyUrl(rawCover, `${ctx.baseUrl}/`) : '';

    const genres: string[] = [];
    $card.find('.mg_genres .summary-content a').each((__, g) => {
      const txt = $(g).text().trim();
      if (txt) genres.push(txt);
    });

    const latestText = $card.find('.latest-chap .chapter a, .list-chapter .chapter-item a').first().text().trim();
    const extId = encodeDynamicId(relPath);

    results.push({
      id: `mr_${ctx.sourceId}_${extId}`,
      title,
      altTitles: [],
      coverUrl,
      synopsis: `Disponível via extensão ${ctx.sourceName}.`,
      authors: ['Autor Desconhecido'],
      artists: [],
      genres: genres.length > 0 ? genres : ['Manga'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [{ sourceId: ctx.sourceId, externalId: extId, url: href, sourceName: ctx.sourceName }],
      latestChapter: latestText ? extractChapterNumber(latestText, 1) : undefined,
      updatedAt: new Date().toISOString(),
      isAdult: Boolean(ctx.nsfw),
      contentRating: ctx.nsfw ? 'erotica' : 'safe',
      hasAvailableChapters: true,
      availabilityStatus: 'available',
      availableLanguages: [ctx.lang]
    });
  });

  return results;
}

export function parseMadaraDetailsHtml(html: string, mangaUrl: string, externalId: string, ctx: ParsedSearchContext): Manga | null {
  const $ = cheerio.load(html);
  const title = ($('.post-title h1, h1').first().text() || '').replace(/\s+/g, ' ').trim();
  if (!title) return null;

  const rawCover = extractBestImageUrl($('.summary_image img').first(), ctx.baseUrl);
  const coverUrl = rawCover ? formatDynamicProxyUrl(rawCover, `${ctx.baseUrl}/`) : '';
  const synopsis = ($('.summary__content p, .description-summary .summary__content').text() || '').replace(/\s+/g, ' ').trim() || `Obra carregada via ${ctx.sourceName}.`;

  const genres: string[] = [];
  $('.genres-content a').each((_, el) => {
    const g = $(el).text().trim();
    if (g && !genres.includes(g)) genres.push(g);
  });

  const authors: string[] = [];
  $('.author-content a').each((_, el) => {
    const a = $(el).text().trim();
    if (a && !authors.includes(a)) authors.push(a);
  });

  const artists: string[] = [];
  $('.artist-content a').each((_, el) => {
    const a = $(el).text().trim();
    if (a && !artists.includes(a)) artists.push(a);
  });

  const rawStatus = $('.post-status .summary-content').last().text().trim();

  return {
    id: `mr_${ctx.sourceId}_${externalId}`,
    title,
    altTitles: [],
    coverUrl,
    synopsis,
    authors: authors.length > 0 ? authors : ['Autor Desconhecido'],
    artists,
    genres: genres.length > 0 ? genres : ['Manga'],
    status: normalizeMangaStatus(rawStatus),
    publicationInfo: {},
    sources: [{ sourceId: ctx.sourceId, externalId, url: mangaUrl, sourceName: ctx.sourceName }],
    updatedAt: new Date().toISOString(),
    isAdult: Boolean(ctx.nsfw),
    contentRating: ctx.nsfw ? 'erotica' : 'safe',
    hasAvailableChapters: true,
    availabilityStatus: 'available',
    availableLanguages: [ctx.lang]
  };
}

export function parseMadaraChaptersHtml(html: string, externalMangaId: string, ctx: ParsedSearchContext): Chapter[] {
  const $ = cheerio.load(html);
  const chapters: Chapter[] = [];
  const seen = new Set<string>();
  const items = $('li.wp-manga-chapter');

  items.each((idx, el) => {
    const $item = $(el);
    const $a = $item.find('a').first();
    const href = resolveAbsoluteUrl($a.attr('href'), ctx.baseUrl);
    if (!href) return;

    const relPath = toRelativeSlug(href, ctx.baseUrl);
    if (seen.has(relPath)) return;
    seen.add(relPath);

    const rawTitle = $a.text().replace(/\s+/g, ' ').trim();
    const chNum = extractChapterNumber(rawTitle || relPath, items.length - idx);
    const dateStr = $item.find('.chapter-release-date').text().trim() || undefined;
    const extChId = encodeDynamicId(relPath);

    chapters.push({
      id: `ch_${ctx.sourceId}_${externalMangaId}_${extChId}`,
      mangaId: `mr_${ctx.sourceId}_${externalMangaId}`,
      chapterNumber: chNum,
      title: rawTitle || `Capítulo ${chNum}`,
      releaseDate: dateStr,
      language: ctx.lang,
      sourceId: ctx.sourceId,
      externalChapterId: extChId,
      scanlationGroup: ctx.sourceName
    });
  });

  return chapters;
}

export function parseMadaraPagesHtml(html: string, ctx: ParsedSearchContext, refererUrl: string): MangaPage[] {
  const $ = cheerio.load(html);
  const pages: MangaPage[] = [];
  const seen = new Set<string>();

  $('.reading-content img, .page-break img, .text-left img.wp-manga-chapter-img').each((_, el) => {
    const rawUrl = extractBestImageUrl($(el), ctx.baseUrl);
    if (!rawUrl || seen.has(rawUrl)) return;
    seen.add(rawUrl);
    pages.push({
      pageNumber: pages.length + 1,
      imageUrl: formatDynamicProxyUrl(rawUrl, refererUrl)
    });
  });

  return pages;
}

export function parseThemesiaSearchHtml(html: string, ctx: ParsedSearchContext): Manga[] {
  const $ = cheerio.load(html);
  const results: Manga[] = [];
  const seen = new Set<string>();

  $('.listupd .bs .bsx a, .utao .uta .imgu a, .bs .bsx a').each((_, el) => {
    const $a = $(el);
    const href = resolveAbsoluteUrl($a.attr('href'), ctx.baseUrl);
    if (!href) return;
    const relPath = toRelativeSlug(href, ctx.baseUrl);
    if (seen.has(relPath)) return;

    const title = ($a.find('.tt').text() || $a.attr('title') || $a.find('img').attr('alt') || '').replace(/\s+/g, ' ').trim();
    if (!title) return;
    seen.add(relPath);

    const rawCover = extractBestImageUrl($a.find('img').first(), ctx.baseUrl);
    const coverUrl = rawCover ? formatDynamicProxyUrl(rawCover, `${ctx.baseUrl}/`) : '';
    const extId = encodeDynamicId(relPath);

    results.push({
      id: `mr_${ctx.sourceId}_${extId}`,
      title,
      altTitles: [],
      coverUrl,
      synopsis: `Disponível via extensão ${ctx.sourceName}.`,
      authors: ['Autor Desconhecido'],
      artists: [],
      genres: ['Manga'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [{ sourceId: ctx.sourceId, externalId: extId, url: href, sourceName: ctx.sourceName }],
      updatedAt: new Date().toISOString(),
      isAdult: Boolean(ctx.nsfw),
      contentRating: ctx.nsfw ? 'erotica' : 'safe',
      hasAvailableChapters: true,
      availabilityStatus: 'available',
      availableLanguages: [ctx.lang]
    });
  });

  return results;
}

export function parseThemesiaDetailsHtml(html: string, mangaUrl: string, externalId: string, ctx: ParsedSearchContext): Manga | null {
  const $ = cheerio.load(html);
  const title = ($('h1.entry-title, .infox h1, h1').first().text() || '').replace(/\s+/g, ' ').trim();
  if (!title) return null;

  const rawCover = extractBestImageUrl($('.thumb img, .seriestucon img').first(), ctx.baseUrl);
  const coverUrl = rawCover ? formatDynamicProxyUrl(rawCover, `${ctx.baseUrl}/`) : '';
  const synopsis = ($('.entry-content[itemprop="description"] p, .entry-content p, .wd-full p').text() || '').replace(/\s+/g, ' ').trim() || `Obra carregada via ${ctx.sourceName}.`;

  const genres: string[] = [];
  $('.mgen a, .seriestugenre a').each((_, el) => {
    const g = $(el).text().trim();
    if (g && !genres.includes(g)) genres.push(g);
  });

  let rawStatus = '';
  const authors: string[] = [];
  $('.tsinfo .imptdt, .fmed, .infotable tr').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (/status/i.test(text)) rawStatus = text;
    if (/author|autor/i.test(text)) {
      const val = text.replace(/author|autor/gi, '').replace(/[:]/g, '').trim();
      if (val && val !== '-') authors.push(val);
    }
  });

  return {
    id: `mr_${ctx.sourceId}_${externalId}`,
    title,
    altTitles: [],
    coverUrl,
    synopsis,
    authors: authors.length > 0 ? authors : ['Autor Desconhecido'],
    artists: [],
    genres: genres.length > 0 ? genres : ['Manga'],
    status: normalizeMangaStatus(rawStatus),
    publicationInfo: {},
    sources: [{ sourceId: ctx.sourceId, externalId, url: mangaUrl, sourceName: ctx.sourceName }],
    updatedAt: new Date().toISOString(),
    isAdult: Boolean(ctx.nsfw),
    contentRating: ctx.nsfw ? 'erotica' : 'safe',
    hasAvailableChapters: true,
    availabilityStatus: 'available',
    availableLanguages: [ctx.lang]
  };
}

export function parseThemesiaChaptersHtml(html: string, externalMangaId: string, ctx: ParsedSearchContext): Chapter[] {
  const $ = cheerio.load(html);
  const chapters: Chapter[] = [];
  const seen = new Set<string>();
  const items = $('#chapterlist li, .eplister ul li');

  items.each((idx, el) => {
    const $item = $(el);
    const $a = $item.find('a').first();
    const href = resolveAbsoluteUrl($a.attr('href'), ctx.baseUrl);
    if (!href) return;

    const relPath = toRelativeSlug(href, ctx.baseUrl);
    if (seen.has(relPath)) return;
    seen.add(relPath);

    const chapTitle = ($item.find('.chapternum, .eph-num span').first().text() || $a.text()).replace(/\s+/g, ' ').trim();
    const chNum = extractChapterNumber(chapTitle || relPath, items.length - idx);
    const dateStr = $item.find('.chapterdate').text().trim() || undefined;
    const extChId = encodeDynamicId(relPath);

    chapters.push({
      id: `ch_${ctx.sourceId}_${externalMangaId}_${extChId}`,
      mangaId: `mr_${ctx.sourceId}_${externalMangaId}`,
      chapterNumber: chNum,
      title: chapTitle || `Capítulo ${chNum}`,
      releaseDate: dateStr,
      language: ctx.lang,
      sourceId: ctx.sourceId,
      externalChapterId: extChId,
      scanlationGroup: ctx.sourceName
    });
  });

  return chapters;
}

export function parseThemesiaPagesHtml(html: string, ctx: ParsedSearchContext, refererUrl: string): MangaPage[] {
  // 1. Try ts_reader.run({...}) embedded JSON
  const tsMatch = html.match(/ts_reader\.run\((\{[\s\S]*?\})\);/);
  if (tsMatch && tsMatch[1]) {
    try {
      const parsed = JSON.parse(tsMatch[1]);
      const images: unknown = parsed?.sources?.[0]?.images;
      if (Array.isArray(images) && images.length > 0) {
        const pages: MangaPage[] = [];
        for (const raw of images) {
          if (typeof raw !== 'string') continue;
          const abs = resolveAbsoluteUrl(raw, ctx.baseUrl);
          if (abs) {
            pages.push({
              pageNumber: pages.length + 1,
              imageUrl: formatDynamicProxyUrl(abs, refererUrl)
            });
          }
        }
        if (pages.length > 0) return pages;
      }
    } catch {
      // Fallback to DOM
    }
  }

  // 2. Fallback to #readerarea img
  const $ = cheerio.load(html);
  const pages: MangaPage[] = [];
  const seen = new Set<string>();
  $('#readerarea img, .rdminimal img').each((_, el) => {
    const rawUrl = extractBestImageUrl($(el), ctx.baseUrl);
    if (!rawUrl || seen.has(rawUrl)) return;
    seen.add(rawUrl);
    pages.push({
      pageNumber: pages.length + 1,
      imageUrl: formatDynamicProxyUrl(rawUrl, refererUrl)
    });
  });

  return pages;
}

export function parseCustomSearchHtml(html: string, selectors: CustomHtmlSelectors, ctx: ParsedSearchContext): Manga[] {
  const $ = cheerio.load(html);
  const results: Manga[] = [];
  const seen = new Set<string>();

  $(selectors.searchItem).each((_, el) => {
    const $item = $(el);
    const $linkEl = selectors.link === 'self' ? $item : $item.find(selectors.link).first();
    const href = resolveAbsoluteUrl($linkEl.attr('href'), ctx.baseUrl);
    if (!href) return;

    const relPath = toRelativeSlug(href, ctx.baseUrl);
    if (seen.has(relPath)) return;

    const $titleEl = selectors.title === 'self' ? $item : $item.find(selectors.title).first();
    const title = ($titleEl.text() || $linkEl.attr('title') || '').replace(/\s+/g, ' ').trim();
    if (!title) return;
    seen.add(relPath);

    let coverUrl = '';
    if (selectors.cover) {
      const $img = selectors.cover === 'self' ? $item : $item.find(selectors.cover).first();
      const raw = extractBestImageUrl($img, ctx.baseUrl);
      if (raw) coverUrl = formatDynamicProxyUrl(raw, `${ctx.baseUrl}/`);
    }

    const extId = encodeDynamicId(relPath);
    results.push({
      id: `mr_${ctx.sourceId}_${extId}`,
      title,
      altTitles: [],
      coverUrl,
      synopsis: `Disponível via extensão customizada ${ctx.sourceName}.`,
      authors: ['Autor Desconhecido'],
      artists: [],
      genres: ['Manga'],
      status: 'ongoing',
      publicationInfo: {},
      sources: [{ sourceId: ctx.sourceId, externalId: extId, url: href, sourceName: ctx.sourceName }],
      updatedAt: new Date().toISOString(),
      isAdult: Boolean(ctx.nsfw),
      contentRating: ctx.nsfw ? 'erotica' : 'safe',
      hasAvailableChapters: true,
      availabilityStatus: 'available',
      availableLanguages: [ctx.lang]
    });
  });

  return results;
}

export function parseCustomDetailsHtml(
  html: string,
  mangaUrl: string,
  externalId: string,
  selectors: CustomHtmlSelectors,
  ctx: ParsedSearchContext
): Manga | null {
  const $ = cheerio.load(html);
  const title = (selectors.detailTitle ? $(selectors.detailTitle).first().text() : $('h1').first().text())
    .replace(/\s+/g, ' ')
    .trim();
  if (!title) return null;

  const rawCover = selectors.detailCover ? extractBestImageUrl($(selectors.detailCover).first(), ctx.baseUrl) : '';
  const coverUrl = rawCover ? formatDynamicProxyUrl(rawCover, `${ctx.baseUrl}/`) : '';
  const synopsis = (selectors.detailSynopsis ? $(selectors.detailSynopsis).text() : '').replace(/\s+/g, ' ').trim() || `Obra via ${ctx.sourceName}.`;

  const genres: string[] = [];
  if (selectors.detailGenres) {
    $(selectors.detailGenres).each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });
  }

  const authors: string[] = [];
  if (selectors.detailAuthor) {
    $(selectors.detailAuthor).each((_, el) => {
      const a = $(el).text().trim();
      if (a && !authors.includes(a)) authors.push(a);
    });
  }

  const rawStatus = selectors.detailStatus ? $(selectors.detailStatus).text().trim() : '';

  return {
    id: `mr_${ctx.sourceId}_${externalId}`,
    title,
    altTitles: [],
    coverUrl,
    synopsis,
    authors: authors.length > 0 ? authors : ['Autor Desconhecido'],
    artists: [],
    genres: genres.length > 0 ? genres : ['Manga'],
    status: normalizeMangaStatus(rawStatus),
    publicationInfo: {},
    sources: [{ sourceId: ctx.sourceId, externalId, url: mangaUrl, sourceName: ctx.sourceName }],
    updatedAt: new Date().toISOString(),
    isAdult: Boolean(ctx.nsfw),
    contentRating: ctx.nsfw ? 'erotica' : 'safe',
    hasAvailableChapters: true,
    availabilityStatus: 'available',
    availableLanguages: [ctx.lang]
  };
}

export function parseCustomChaptersHtml(
  html: string,
  externalMangaId: string,
  selectors: CustomHtmlSelectors,
  ctx: ParsedSearchContext
): Chapter[] {
  const $ = cheerio.load(html);
  const chapters: Chapter[] = [];
  const seen = new Set<string>();
  const items = $(selectors.chapterItem);

  items.each((idx, el) => {
    const $item = $(el);
    const $a = !selectors.chapterLink || selectors.chapterLink === 'self'
      ? $item
      : $item.find(selectors.chapterLink).first();
    const href = resolveAbsoluteUrl($a.attr('href'), ctx.baseUrl);
    if (!href) return;

    const relPath = toRelativeSlug(href, ctx.baseUrl);
    if (seen.has(relPath)) return;
    seen.add(relPath);

    const chapTitle = (selectors.chapterTitle ? $item.find(selectors.chapterTitle).first().text() : $a.text())
      .replace(/\s+/g, ' ')
      .trim();
    const chNum = extractChapterNumber(chapTitle || relPath, items.length - idx);
    const dateStr = selectors.chapterDate ? $item.find(selectors.chapterDate).first().text().trim() || undefined : undefined;
    const extChId = encodeDynamicId(relPath);

    chapters.push({
      id: `ch_${ctx.sourceId}_${externalMangaId}_${extChId}`,
      mangaId: `mr_${ctx.sourceId}_${externalMangaId}`,
      chapterNumber: chNum,
      title: chapTitle || `Capítulo ${chNum}`,
      releaseDate: dateStr,
      language: ctx.lang,
      sourceId: ctx.sourceId,
      externalChapterId: extChId,
      scanlationGroup: ctx.sourceName
    });
  });

  return chapters;
}

export function parseCustomPagesHtml(
  html: string,
  selectors: CustomHtmlSelectors,
  ctx: ParsedSearchContext,
  refererUrl: string
): MangaPage[] {
  const $ = cheerio.load(html);
  const pages: MangaPage[] = [];
  const seen = new Set<string>();

  $(selectors.pageImg).each((_, el) => {
    const rawUrl = extractBestImageUrl($(el), ctx.baseUrl);
    if (!rawUrl || seen.has(rawUrl)) return;
    seen.add(rawUrl);
    pages.push({
      pageNumber: pages.length + 1,
      imageUrl: formatDynamicProxyUrl(rawUrl, refererUrl)
    });
  });

  return pages;
}

export class DynamicTemplateProvider implements IMangaSource {
  private manifest: DynamicExtensionManifest;
  private detailsCache = new Map<string, { data: Manga; timestamp: number }>();
  private chaptersCache = new Map<string, { data: Chapter[]; timestamp: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(manifest: DynamicExtensionManifest) {
    this.manifest = {
      ...manifest,
      baseUrl: normalizeBaseUrl(manifest.baseUrl) || manifest.baseUrl.replace(/\/+$/, ''),
      defaultBaseUrl: normalizeBaseUrl(manifest.defaultBaseUrl || manifest.baseUrl) || manifest.baseUrl.replace(/\/+$/, '')
    };
  }

  public getManifest(): DynamicExtensionManifest {
    return { ...this.manifest };
  }

  public getBaseUrl(): string {
    return this.manifest.baseUrl;
  }

  public updateBaseUrl(newBaseUrl: string): void {
    const normalized = normalizeBaseUrl(newBaseUrl);
    if (!normalized) {
      throw new HttpError(400, 'URL do espelho inválida. Informe uma URL completa com http:// ou https://');
    }
    this.manifest = {
      ...this.manifest,
      baseUrl: normalized,
      updatedAt: Date.now()
    };
    this.detailsCache.clear();
    this.chaptersCache.clear();
  }

  private getContext(): ParsedSearchContext {
    return {
      sourceId: this.manifest.id,
      sourceName: this.manifest.name,
      baseUrl: this.manifest.baseUrl,
      lang: this.manifest.lang || 'pt-br',
      nsfw: this.manifest.nsfw
    };
  }

  public getInfo(): MangaSourceInfo {
    const templateLabel =
      this.manifest.template === 'madara'
        ? 'Madara'
        : this.manifest.template === 'themesia'
        ? 'Themesia'
        : 'Custom HTML';

    return {
      id: this.manifest.id,
      name: this.manifest.name,
      description:
        this.manifest.description ||
        `Extensão dinâmica (${templateLabel}) conectada diretamente em ${this.manifest.baseUrl}.`,
      version: this.manifest.version || '1.0.0',
      isAvailable: true,
      type: 'template_extension',
      template: this.manifest.template,
      baseUrl: this.manifest.baseUrl,
      defaultBaseUrl: this.manifest.defaultBaseUrl,
      isDynamic: true,
      repoUrl: this.manifest.repoUrl,
      supportsMirrorEdit: true,
      websiteUrl: this.manifest.baseUrl,
      iconColor: this.manifest.iconColor || '#f43f5e',
      badge: this.manifest.badge || `${templateLabel} • ${(this.manifest.lang || 'pt-br').toUpperCase()}`,
      languages: this.manifest.languages?.length ? this.manifest.languages : [this.manifest.lang || 'pt-br'],
      catalogEstimate: 'Via Repositório / Template',
      supportedFeatures: {
        search: true,
        filters: false,
        coverImages: true,
        multipleLanguages: (this.manifest.languages?.length || 1) > 1,
        chaptersDeduplication: true,
        webtoons: true,
        nsfwFilter: Boolean(this.manifest.nsfw)
      }
    };
  }

  private async fetchPage(url: string, init?: RequestInit): Promise<string> {
    const mergedHeaders: Record<string, string> = {
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': `${this.manifest.baseUrl}/`,
      ...(this.manifest.headers || {}),
      ...((init?.headers as Record<string, string>) || {})
    };

    const tryRelay = async (): Promise<{ status: number; body: string; headers?: Headers } | null> => {
      if (!residentialRelayService.isRelayReady() || !isSafeExternalRelayUrl(url)) return null;
      try {
        const res = await residentialRelayService.fetchThroughRelay(url, {
          method: (init?.method as string) || 'GET',
          headers: mergedHeaders,
          body: init?.body ? String(init.body) : undefined,
          responseType: 'text'
        });
        return { status: res.status, body: res.bodyText || '' };
      } catch {
        return null;
      }
    };

    if (residentialRelayService.getMode() === 'always' && residentialRelayService.isRelayReady()) {
      const relayHit = await tryRelay();
      if (relayHit && relayHit.status < 400 && !isCloudflareBlocked(relayHit.status, relayHit.body)) {
        return relayHit.body;
      }
    }

    let response: Response | null = null;
    let body = '';
    let directError: Error | null = null;

    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(9000),
        headers: mergedHeaders
      });
      body = await response.text();
    } catch (err) {
      directError = err as Error;
    }

    const blockedOrFailed =
      !response ||
      isCloudflareBlocked(response.status, body, response.headers) ||
      response.status === 403 ||
      response.status === 429 ||
      response.status === 503;

    if (blockedOrFailed && residentialRelayService.isRelayReady()) {
      const relayHit = await tryRelay();
      if (relayHit && relayHit.status < 400 && !isCloudflareBlocked(relayHit.status, relayHit.body)) {
        return relayHit.body;
      }
    }

    if (directError || !response) {
      throw new HttpError(
        502,
        `Falha de conexão com '${this.manifest.baseUrl}': ${directError?.message || 'erro desconhecido'}`
      );
    }

    if (isCloudflareBlocked(response.status, body, response.headers)) {
      throw new HttpError(
        403,
        `Bloqueio Cloudflare (HTTP ${response.status}) em '${this.manifest.baseUrl}'. Tente conectar a Ponte Residencial na aba Extensões, editar o espelho (mirror) ou usar outra fonte.`
      );
    }

    if (response.status === 429) {
      throw new HttpError(429, `Limite de requisições (429) atingido em '${this.manifest.baseUrl}'.`);
    }

    if (!response.ok) {
      throw new HttpError(response.status, `Erro HTTP ${response.status} ao acessar '${url}'.`);
    }

    return body;
  }

  private buildTargetUrl(externalId: string): string {
    const decoded = decodeDynamicId(externalId);
    const resolved = resolveAbsoluteUrl(decoded, this.manifest.baseUrl);
    if (!resolved) {
      throw new HttpError(400, `Identificador externo inválido para a extensão '${this.manifest.id}'.`);
    }
    return resolved;
  }

  async search(query: string, options?: SourceSearchOptions): Promise<SourceSearchResult> {
    const q = (query || '').trim();
    if (!q) {
      const popular = await this.getPopular(options);
      return { mangaList: popular, total: popular.length, hasMore: false };
    }

    const encoded = encodeURIComponent(q);
    const ctx = this.getContext();
    let list: Manga[] = [];

    if (this.manifest.template === 'madara') {
      const url = `${this.manifest.baseUrl}/?s=${encoded}&post_type=wp-manga`;
      const html = await this.fetchPage(url);
      list = parseMadaraSearchHtml(html, ctx);
    } else if (this.manifest.template === 'themesia') {
      const url = `${this.manifest.baseUrl}/?s=${encoded}`;
      const html = await this.fetchPage(url);
      list = parseThemesiaSearchHtml(html, ctx);
    } else {
      const sel = this.manifest.selectors;
      if (!sel) return { mangaList: [], total: 0, hasMore: false };
      const pattern = sel.searchPath || '/?s={query}';
      const rel = pattern.replace('{query}', encoded);
      const url = resolveAbsoluteUrl(rel, this.manifest.baseUrl);
      const html = await this.fetchPage(url);
      list = parseCustomSearchHtml(html, sel, ctx);
    }

    const limit = options?.limit || 24;
    return {
      mangaList: list.slice(0, limit),
      total: list.length,
      hasMore: list.length > limit
    };
  }

  async getPopular(options?: SourceSearchOptions): Promise<Manga[]> {
    const ctx = this.getContext();
    const page = Math.max(1, options?.page || 1);
    let list: Manga[] = [];

    try {
      if (this.manifest.template === 'madara') {
        const path = page > 1 ? `/manga/page/${page}/?m_orderby=views` : `/manga/?m_orderby=views`;
        const html = await this.fetchPage(`${this.manifest.baseUrl}${path}`);
        list = parseMadaraSearchHtml(html, ctx);
      } else if (this.manifest.template === 'themesia') {
        const path = page > 1 ? `/manga/?page=${page}&order=popular` : `/manga/?order=popular`;
        const html = await this.fetchPage(`${this.manifest.baseUrl}${path}`);
        list = parseThemesiaSearchHtml(html, ctx);
      } else if (this.manifest.selectors) {
        const path = this.manifest.selectors.popularPath || '/';
        const html = await this.fetchPage(resolveAbsoluteUrl(path, this.manifest.baseUrl));
        list = parseCustomSearchHtml(html, this.manifest.selectors, ctx);
      }
    } catch {
      if (page === 1) {
        try {
          const html = await this.fetchPage(`${this.manifest.baseUrl}/`);
          if (this.manifest.template === 'madara') list = parseMadaraSearchHtml(html, ctx);
          else if (this.manifest.template === 'themesia') list = parseThemesiaSearchHtml(html, ctx);
          else if (this.manifest.selectors) list = parseCustomSearchHtml(html, this.manifest.selectors, ctx);
        } catch {
          return [];
        }
      } else {
        return [];
      }
    }

    const limit = options?.limit || 24;
    return list.slice(0, limit);
  }

  async getLatest(options?: SourceSearchOptions): Promise<Manga[]> {
    const ctx = this.getContext();
    const page = Math.max(1, options?.page || 1);
    let list: Manga[] = [];

    try {
      if (this.manifest.template === 'madara') {
        const path = page > 1 ? `/manga/page/${page}/?m_orderby=latest` : `/manga/?m_orderby=latest`;
        const html = await this.fetchPage(`${this.manifest.baseUrl}${path}`);
        list = parseMadaraSearchHtml(html, ctx);
      } else if (this.manifest.template === 'themesia') {
        const path = page > 1 ? `/manga/?page=${page}&order=update` : `/manga/?order=update`;
        const html = await this.fetchPage(`${this.manifest.baseUrl}${path}`);
        list = parseThemesiaSearchHtml(html, ctx);
      } else if (this.manifest.selectors) {
        const path = this.manifest.selectors.popularPath || '/';
        const html = await this.fetchPage(resolveAbsoluteUrl(path, this.manifest.baseUrl));
        list = parseCustomSearchHtml(html, this.manifest.selectors, ctx);
      }
    } catch {
      if (page === 1) {
        try {
          const html = await this.fetchPage(`${this.manifest.baseUrl}/`);
          if (this.manifest.template === 'madara') list = parseMadaraSearchHtml(html, ctx);
          else if (this.manifest.template === 'themesia') list = parseThemesiaSearchHtml(html, ctx);
          else if (this.manifest.selectors) list = parseCustomSearchHtml(html, this.manifest.selectors, ctx);
        } catch {
          return [];
        }
      } else {
        return [];
      }
    }

    const limit = options?.limit || 24;
    return list.slice(0, limit);
  }

  async getMangaDetails(externalId: string): Promise<Manga | null> {
    const cached = this.detailsCache.get(externalId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    const mangaUrl = this.buildTargetUrl(externalId);
    const html = await this.fetchPage(mangaUrl);
    const ctx = this.getContext();

    let manga: Manga | null = null;
    if (this.manifest.template === 'madara') {
      manga = parseMadaraDetailsHtml(html, mangaUrl, externalId, ctx);
    } else if (this.manifest.template === 'themesia') {
      manga = parseThemesiaDetailsHtml(html, mangaUrl, externalId, ctx);
    } else if (this.manifest.selectors) {
      manga = parseCustomDetailsHtml(html, mangaUrl, externalId, this.manifest.selectors, ctx);
    }

    if (manga) {
      this.detailsCache.set(externalId, { data: manga, timestamp: Date.now() });
    }
    return manga;
  }

  async getChapters(externalMangaId: string): Promise<Chapter[]> {
    const cached = this.chaptersCache.get(externalMangaId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    const mangaUrl = this.buildTargetUrl(externalMangaId);
    const html = await this.fetchPage(mangaUrl);
    const ctx = this.getContext();
    let chapters: Chapter[] = [];

    if (this.manifest.template === 'madara') {
      chapters = parseMadaraChaptersHtml(html, externalMangaId, ctx);

      // Modern WP-Madara loads chapter list asynchronously via POST /ajax/chapters/
      if (chapters.length === 0) {
        try {
          const ajaxUrl = `${mangaUrl.replace(/\/+$/, '')}/ajax/chapters/`;
          const ajaxHtml = await this.fetchPage(ajaxUrl, {
            method: 'POST',
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': mangaUrl
            }
          });
          chapters = parseMadaraChaptersHtml(ajaxHtml, externalMangaId, ctx);
        } catch {
          // Try wp-admin/admin-ajax.php if post ID is embedded
        }
      }

      if (chapters.length === 0) {
        const $ = cheerio.load(html);
        const postId = $('#manga-chapters-holder').attr('data-id') || $('[data-id]').first().attr('data-id');
        if (postId && /^\d+$/.test(postId)) {
          try {
            const adminAjax = await this.fetchPage(`${this.manifest.baseUrl}/wp-admin/admin-ajax.php`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': mangaUrl
              },
              body: `action=manga_get_chapters&manga=${postId}`
            });
            chapters = parseMadaraChaptersHtml(adminAjax, externalMangaId, ctx);
          } catch {
            // Keep empty
          }
        }
      }
    } else if (this.manifest.template === 'themesia') {
      chapters = parseThemesiaChaptersHtml(html, externalMangaId, ctx);
    } else if (this.manifest.selectors) {
      chapters = parseCustomChaptersHtml(html, externalMangaId, this.manifest.selectors, ctx);
    }

    if (chapters.length > 0) {
      this.chaptersCache.set(externalMangaId, { data: chapters, timestamp: Date.now() });
    }
    return chapters;
  }

  async getChapterPages(externalChapterId: string): Promise<MangaPage[]> {
    const chapterUrl = this.buildTargetUrl(externalChapterId);
    const html = await this.fetchPage(chapterUrl);
    const ctx = this.getContext();

    if (this.manifest.template === 'madara') {
      return parseMadaraPagesHtml(html, ctx, chapterUrl);
    }
    if (this.manifest.template === 'themesia') {
      return parseThemesiaPagesHtml(html, ctx, chapterUrl);
    }
    if (this.manifest.selectors) {
      return parseCustomPagesHtml(html, this.manifest.selectors, ctx, chapterUrl);
    }
    return [];
  }
}
