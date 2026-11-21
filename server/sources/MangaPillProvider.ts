import { IMangaSource, SourceSearchOptions, SourceSearchResult } from './IMangaSource.js';
import { Manga, Chapter, MangaPage, MangaSourceInfo, MangaStatus } from '../../src/types/manga.js';
import { HttpError } from '../errors/HttpError.js';
import { residentialRelayService } from '../services/ResidentialRelayService.js';
import { decodeHtmlEntities } from '../../src/utils/htmlEntities.js';

function parseMangaStatus(rawStatus?: string): MangaStatus {
  if (!rawStatus) return 'ongoing';
  const s = rawStatus.toLowerCase().trim();
  if (s.includes('publish') || s.includes('ongoing')) return 'ongoing';
  if (s.includes('finish') || s.includes('complete')) return 'completed';
  if (s.includes('hiatus')) return 'hiatus';
  if (s.includes('discontinue') || s.includes('cancel')) return 'cancelled';
  return 'ongoing';
}

function parseRatingAndDemographic(genres: string[]): {
  contentRating: 'safe' | 'suggestive' | 'erotica' | 'pornographic';
  isAdult: boolean;
  demographic?: string;
} {
  const lower = genres.map(g => g.toLowerCase());
  let demographic: string | undefined;

  if (lower.includes('seinen')) demographic = 'seinen';
  else if (lower.includes('shounen') || lower.includes('shonen')) demographic = 'shounen';
  else if (lower.includes('shoujo') || lower.includes('shojo')) demographic = 'shoujo';
  else if (lower.includes('josei')) demographic = 'josei';

  if (lower.some(g => ['hentai', 'pornographic', 'smut'].includes(g))) {
    return { contentRating: 'pornographic', isAdult: true, demographic };
  }
  if (lower.some(g => ['erotica', 'doujinshi'].includes(g))) {
    return { contentRating: 'erotica', isAdult: true, demographic };
  }
  if (lower.some(g => ['ecchi', 'harem', 'gender bender'].includes(g))) {
    return { contentRating: 'suggestive', isAdult: false, demographic };
  }

  return { contentRating: 'safe', isAdult: false, demographic };
}

function formatProxyUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('/api/proxy/image')) return rawUrl;
  if (rawUrl.includes('cdn.readdetectiveconan.com') || rawUrl.includes('mangapill.com')) {
    return `/api/proxy/image?url=${encodeURIComponent(rawUrl)}`;
  }
  return rawUrl;
}

const GENRE_MAP: Record<string, string> = {
  'ação': 'Action',
  'acao': 'Action',
  'action': 'Action',
  'fantasia': 'Fantasy',
  'fantasy': 'Fantasy',
  'comédia': 'Comedy',
  'comedia': 'Comedy',
  'comedy': 'Comedy',
  'aventura': 'Adventure',
  'adventure': 'Adventure',
  'drama': 'Drama',
  'sobrenatural': 'Supernatural',
  'supernatural': 'Supernatural',
  'histórico': 'Historical',
  'historico': 'Historical',
  'historical': 'Historical',
  'horror': 'Horror',
  'terror': 'Horror',
  'sci-fi': 'Sci-Fi',
  'ficção científica': 'Sci-Fi',
  'ficcao cientifica': 'Sci-Fi',
  'romance': 'Romance',
  'mistério': 'Mystery',
  'misterio': 'Mystery',
  'mystery': 'Mystery',
  'shounen': 'Shounen',
  'shonen': 'Shounen',
  'seinen': 'Seinen',
  'shoujo': 'Shoujo',
  'shojo': 'Shoujo',
  'josei': 'Josei'
};

function mapGenre(rawGenre?: string | null): string | null {
  if (!rawGenre || rawGenre === 'all') return null;
  const lower = rawGenre.trim().toLowerCase();
  return GENRE_MAP[lower] || null;
}

function acceptsEnglishLanguage(language?: string): boolean {
  if (!language) return true;
  const tokens = language.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.some(t => t === 'all' || t === 'en' || t === 'en-us');
}

export class MangaPillProvider implements IMangaSource {
  private readonly baseUrl = 'https://mangapill.com';
  private readonly sourceId = 'mangapill';
  private readonly sourceName = 'MangaPill';

  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  private detailsCache: Map<string, { data: Manga; timestamp: number }> = new Map();
  private chaptersCache: Map<string, { data: Chapter[]; timestamp: number }> = new Map();
  private searchCache: Map<string, { data: SourceSearchResult; timestamp: number }> = new Map();
  private pageHtmlCache: Map<string, { html: string; timestamp: number }> = new Map();
  private inFlightHtml: Map<string, Promise<string>> = new Map();
  private popularCache: { data: Manga[]; timestamp: number } | null = null;
  private upstreamCooldownUntil = 0;
  private lastCooldownLogAt = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly SEARCH_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
  private readonly PAGE_HTML_CACHE_TTL_MS = 60 * 1000; // 60 seconds (shares /manga/:id fetch between details & chapters)
  private readonly POPULAR_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private readonly UPSTREAM_COOLDOWN_MS = 25 * 1000; // 25 seconds backoff after repeated 5xx failures

  getInfo(): MangaSourceInfo {
    return {
      id: this.sourceId,
      name: 'MangaPill (Ao Vivo)',
      description: 'Catálogo abrangente em inglês com lançamentos rápidos e páginas em alta definição.',
      version: '1.0.0',
      isAvailable: true,
      type: 'live_api',
      websiteUrl: 'https://mangapill.com',
      supportedFeatures: {
        search: true,
        filters: true,
        coverImages: true,
        multipleLanguages: false,
        chaptersDeduplication: true,
        webtoons: false,
        nsfwFilter: false
      },
      iconColor: '#10b981',
      badge: 'Ultra Rápido',
      languages: ['EN'],
      catalogEstimate: '+20.000 títulos'
    };
  }

  private setSearchCache(key: string, data: SourceSearchResult): void {
    if (this.searchCache.size >= 120) {
      const oldestKey = this.searchCache.keys().next().value;
      if (oldestKey) this.searchCache.delete(oldestKey);
    }
    this.searchCache.set(key, { data, timestamp: Date.now() });
  }

  private setPageHtmlCache(url: string, html: string): void {
    if (this.pageHtmlCache.size >= 60) {
      const oldestKey = this.pageHtmlCache.keys().next().value;
      if (oldestKey) this.pageHtmlCache.delete(oldestKey);
    }
    this.pageHtmlCache.set(url, { html, timestamp: Date.now() });
  }

  private async fetchWithTimeout(url: string, timeoutMs = 12000, maxRetries = 2): Promise<string> {
    if (url.includes('/manga/')) {
      const cachedPage = this.pageHtmlCache.get(url);
      if (cachedPage && Date.now() - cachedPage.timestamp < this.PAGE_HTML_CACHE_TTL_MS) {
        return cachedPage.html;
      }
    }

    const existing = this.inFlightHtml.get(url);
    if (existing) {
      return existing;
    }

    const task = (async () => {
      let lastError: any;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const reqHeaders: Record<string, string> = {
            'User-Agent': this.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': `${this.baseUrl}/`,
            'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"'
          };
          if (attempt > 0) {
            reqHeaders['Connection'] = 'close';
            reqHeaders['Cache-Control'] = 'no-cache';
          }

          const response = await fetch(url, {
            signal: controller.signal,
            headers: reqHeaders
          });

          if (!response.ok) {
            if (response.status === 404) {
              throw new HttpError(404, `Recurso não encontrado no MangaPill (HTTP 404).`);
            }
            if (response.status === 429) {
              throw new HttpError(429, `Limite de requisições excedido no MangaPill (Rate limit 429).`);
            }
            if (response.status >= 500) {
              throw new HttpError(502, `Falha no servidor MangaPill: HTTP ${response.status}`);
            }
            throw new HttpError(502, `Falha de comunicação com o MangaPill: HTTP ${response.status}`);
          }

          const html = await response.text();
          this.upstreamCooldownUntil = 0;
          if (url.includes('/manga/')) {
            this.setPageHtmlCache(url, html);
          }
          return html;
        } catch (err) {
          lastError = err;
          if (err instanceof HttpError && err.status === 404) {
            throw err;
          }

          const errMsg = ((err as Error)?.message || '').toLowerCase();
          const errName = (err as Error)?.name || '';
          const isHttpTransient =
            err instanceof HttpError && (err.status === 429 || err.status >= 500);
          const isNetworkTransient =
            errName === 'AbortError' ||
            errMsg.includes('terminated') ||
            errMsg.includes('socket') ||
            errMsg.includes('econnreset') ||
            errMsg.includes('etimedout') ||
            errMsg.includes('fetch failed');

          if (attempt < maxRetries && (isHttpTransient || isNetworkTransient)) {
            const backoffMs = 400 * (attempt + 1) + Math.floor(Math.random() * 200);
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          }

          // Optional residential relay fallback if connected
          if (residentialRelayService.isRelayReady()) {
            try {
              const relayed = await residentialRelayService.fetchThroughRelay(url, {
                headers: {
                  'User-Agent': this.userAgent,
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                  'Referer': `${this.baseUrl}/`
                },
                responseType: 'text'
              });
              if (relayed.ok && relayed.bodyText) {
                this.upstreamCooldownUntil = 0;
                if (url.includes('/manga/')) {
                  this.setPageHtmlCache(url, relayed.bodyText);
                }
                return relayed.bodyText;
              }
            } catch {
              // Ignore relay error and fall through to normalized HttpError
            }
          }

          if (err instanceof HttpError) {
            if (err.status >= 500 || err.status === 429) {
              this.upstreamCooldownUntil = Date.now() + this.UPSTREAM_COOLDOWN_MS;
            }
            throw err;
          }
          this.upstreamCooldownUntil = Date.now() + this.UPSTREAM_COOLDOWN_MS;
          if (errName === 'AbortError') {
            throw new HttpError(504, 'Tempo limite de comunicação esgotado com o MangaPill (Gateway Timeout).');
          }
          throw new HttpError(502, `Erro ao conectar com o MangaPill: ${(err as Error).message}`);
        } finally {
          clearTimeout(timeout);
        }
      }

      throw lastError;
    })();

    this.inFlightHtml.set(url, task);
    try {
      return await task;
    } finally {
      this.inFlightHtml.delete(url);
    }
  }

  /**
   * Parse HTML cards from search or /mangas/new
   */
  private parseMangaCards(html: string): Manga[] {
    const results: Manga[] = [];
    const cardRegex = /<a\s+href="\/manga\/([0-9]+(?:\/[^"]+)?)"[^>]*>[\s\S]*?<img\s+(?:data-src|src)="([^"]+)"[^>]*alt="([^"]*)"[\s\S]*?<\/figure>[\s\S]*?<\/a>[\s\S]*?<a\s+href="\/manga\/[0-9]+(?:\/[^"]+)?"[^>]*>[\s\S]*?<div[^>]*line-clamp-2[^>]*>([^<]+)<\/div>([\s\S]*?)<\/a>([\s\S]*?)(?=<div>\s*<a\s+href="\/manga\/|<\/div>\s*<\/div>\s*<\/div>|$)/g;

    let m: RegExpExecArray | null;
    const seenIds = new Set<string>();

    while ((m = cardRegex.exec(html)) !== null) {
      const mangaPath = m[1]; // e.g. "1/berserk" or "1"
      const coverUrl = m[2];
      const title = decodeHtmlEntities(m[4].trim());
      const restTitle = m[5];
      const restCard = m[6];

      // Format externalId replacing '/' with '-'
      const externalId = mangaPath.replace(/\//g, '-');
      if (seenIds.has(externalId)) continue;
      seenIds.add(externalId);

      // Alt title
      const altTitleMatch = restTitle.match(/class="[^"]*text-secondary[^"]*">([^<]+)<\/div>/i);
      const altTitle = altTitleMatch ? decodeHtmlEntities(altTitleMatch[1].trim()) : '';

      // Year and status
      const yearMatch = restCard.match(/class="[^"]*bg-orange-500[^"]*">([^<]+)<\/div>/i);
      const releaseYear = yearMatch ? parseInt(yearMatch[1].trim(), 10) : undefined;

      const statusMatch = restCard.match(/class="[^"]*bg-green-500[^"]*">([^<]+)<\/div>/i);
      const status = parseMangaStatus(statusMatch ? statusMatch[1].trim() : undefined);

      // Genres
      const genreMatches = [...restCard.matchAll(/class="[^"]*bg-card[^"]*">([^<]+)<\/div>/g)].map(g =>
        decodeHtmlEntities(g[1].trim())
      );

      const { contentRating, isAdult, demographic } = parseRatingAndDemographic(genreMatches);

      results.push({
        id: `mr_${this.sourceId}_${externalId}`,
        title,
        altTitles: altTitle ? [altTitle] : [],
        coverUrl: formatProxyUrl(coverUrl),
        synopsis: 'Sinopse disponível na página de detalhes da obra.',
        authors: ['Autor Desconhecido'],
        artists: ['Artista Desconhecido'],
        genres: genreMatches.length > 0 ? genreMatches : ['Manga'],
        status,
        publicationInfo: {
          releaseYear: isNaN(releaseYear as number) ? undefined : releaseYear,
          country: 'JP',
          demographic
        },
        availableLanguages: ['en'],
        sources: [
          {
            sourceId: this.sourceId,
            sourceName: this.sourceName,
            externalId,
            url: `${this.baseUrl}/manga/${mangaPath}`
          }
        ],
        updatedAt: new Date().toISOString(),
        contentRating,
        isAdult,
        hasAvailableChapters: true,
        availabilityStatus: 'available'
      });
    }

    return results;
  }

  async search(query: string, options?: SourceSearchOptions): Promise<SourceSearchResult> {
    if (!acceptsEnglishLanguage(options?.language)) {
      return { mangaList: [], total: 0, hasMore: false };
    }

    const rawQuery = (query || '').trim();
    const q = rawQuery;
    const limit = options?.limit || 24;
    const page = options?.page || (options?.offset !== undefined ? Math.floor(options.offset / limit) + 1 : 1);
    const requestedGenre = options?.genre && options.genre !== 'all' ? options.genre : null;
    const mappedGenre = mapGenre(requestedGenre);
    const isPopularBrowse = !q;

    // If user asked for a specific subgenre/trope that MangaPill doesn't support natively without a text query, return empty
    if (isPopularBrowse && requestedGenre && !mappedGenre) {
      return { mangaList: [], total: 0, hasMore: false };
    }

    // On MangaPill /search without ?q=, page 2+ is 100% alphabetical (id ASC: numbers, A-Z).
    // Never leak alphabetical pages into "Mais Populares" (with or without genre filters).
    if (isPopularBrowse && page > 1) {
      return { mangaList: [], total: 0, hasMore: false };
    }

    const excludedList = Array.isArray(options?.excludedGenres)
      ? options.excludedGenres.map(g => g.toLowerCase().trim()).filter(Boolean).sort()
      : [];
    const cacheKey = `${q.toLowerCase()}|${mappedGenre || ''}|ex:${excludedList.join(',')}|${options?.language || ''}|${page}|${limit}|${Boolean(options?.includeAdult)}|${Boolean(options?.onlyAvailable)}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.SEARCH_CACHE_TTL_MS) {
      return cached.data;
    }

    const buildFallbackSearchResult = (): SourceSearchResult => {
      if (cached) return cached.data;
      if (isPopularBrowse && !mappedGenre) {
        let pool = this.popularCache?.data?.length
          ? [...this.popularCache.data]
          : this.getFallbackPopularList();
        if (!options?.includeAdult) pool = pool.filter(m => !m.isAdult);
        if (options?.onlyAvailable) pool = pool.filter(m => m.hasAvailableChapters);
        const sliced = pool.slice(0, limit);
        return { mangaList: sliced, total: pool.length, hasMore: false };
      }
      return { mangaList: [], total: 0, hasMore: false };
    };

    if (Date.now() < this.upstreamCooldownUntil) {
      return buildFallbackSearchResult();
    }

    try {
      let url: string;
      if (q && mappedGenre) {
        url = `${this.baseUrl}/search?q=${encodeURIComponent(q)}&genre=${encodeURIComponent(mappedGenre)}&page=${page}`;
      } else if (q) {
        url = `${this.baseUrl}/search?q=${encodeURIComponent(q)}&page=${page}`;
      } else if (mappedGenre) {
        url = `${this.baseUrl}/search?genre=${encodeURIComponent(mappedGenre)}&page=${page}`;
      } else {
        url = `${this.baseUrl}/search?type=manga&page=${page}`;
      }

      const html = await this.fetchWithTimeout(url);
      let mangaList = this.parseMangaCards(html);

      if (isPopularBrowse) {
        mangaList = MangaPillProvider.sliceCuratedPopular(mangaList);
        if (!mappedGenre && mangaList.length > 0) {
          this.popularCache = { data: mangaList, timestamp: Date.now() };
        }
      }

      // Filter adult if includeAdult is false
      if (!options?.includeAdult) {
        mangaList = mangaList.filter(m => !m.isAdult);
      }

      // Filter availability
      if (options?.onlyAvailable) {
        mangaList = mangaList.filter(m => m.hasAvailableChapters);
      }

      const sliced = mangaList.slice(0, limit);
      const result: SourceSearchResult = {
        mangaList: sliced,
        total: mangaList.length,
        hasMore: isPopularBrowse ? false : mangaList.length >= limit
      };
      this.setSearchCache(cacheKey, result);
      return result;
    } catch (err) {
      const now = Date.now();
      if (now - this.lastCooldownLogAt >= this.UPSTREAM_COOLDOWN_MS) {
        this.lastCooldownLogAt = now;
        console.info(`[MangaPillProvider] Upstream temporarily unavailable during search (${(err as Error).message}); serving fallback.`);
      }
      return buildFallbackSearchResult();
    }
  }

  public static sliceCuratedPopular(mangaList: Manga[]): Manga[] {
    for (let i = 0; i < mangaList.length; i++) {
      const item = mangaList[i];
      const extId = item.sources?.[0]?.externalId || item.id.replace(/^mr_mangapill_/, '');
      const slugMatch = extId.match(/^(\d+)-/);
      if (slugMatch) {
        const numId = parseInt(slugMatch[1], 10);
        // MangaPill curated classics on /search are strictly IDs 1..12;
        // IDs >= 13 belong to the alphabetical id-ASC catalog dump (μ & I, 009, 1 Love 9, 51 Ways, 6000, A-Z).
        if (numId >= 13) {
          return mangaList.slice(0, i);
        }
        continue;
      }

      // Fallback heuristic for synthetic/non-slugged items
      if (
        i >= 1 &&
        (/^[^a-zA-Z0-9]/.test(item.title) ||
          /^0\d/.test(item.title) ||
          (/^\d/.test(item.title) && !/^20(?:th\b|\s+seiki)/i.test(item.title)))
      ) {
        return mangaList.slice(0, i);
      }
    }
    return mangaList.slice(0, 11);
  }

  async getPopular(options?: SourceSearchOptions): Promise<Manga[]> {
    const limit = options?.limit || 24;
    const page = options?.page || (options?.offset !== undefined ? Math.floor(options.offset / limit) + 1 : 1);
    const mappedGenre = mapGenre(options?.genre);
    const isDefaultQuery = !mappedGenre && page === 1 && (!options?.offset || options.offset === 0);

    // Page 2+ on MangaPill /search without ?q= is purely alphabetical, even with genre filters.
    if (page > 1) {
      return [];
    }

    // 1. Return fresh popular cache if available
    if (isDefaultQuery && this.popularCache && Date.now() - this.popularCache.timestamp < this.POPULAR_CACHE_TTL_MS) {
      let cached = [...this.popularCache.data];
      if (!options?.includeAdult) cached = cached.filter(m => !m.isAdult);
      if (options?.onlyAvailable) cached = cached.filter(m => m.hasAvailableChapters);
      return cached.slice(0, limit);
    }

    if (Date.now() < this.upstreamCooldownUntil) {
      if (!mappedGenre && this.popularCache && this.popularCache.data.length > 0) {
        let cached = [...this.popularCache.data];
        if (!options?.includeAdult) cached = cached.filter(m => !m.isAdult);
        if (options?.onlyAvailable) cached = cached.filter(m => m.hasAvailableChapters);
        return cached.slice(0, limit);
      }
      if (mappedGenre) return [];
      const fallback = this.getFallbackPopularList();
      let filtered = [...fallback];
      if (!options?.includeAdult) filtered = filtered.filter(m => !m.isAdult);
      if (options?.onlyAvailable) filtered = filtered.filter(m => m.hasAvailableChapters);
      return filtered.slice(0, limit);
    }

    try {
      const url = mappedGenre
        ? `${this.baseUrl}/search?genre=${encodeURIComponent(mappedGenre)}&page=${page}`
        : `${this.baseUrl}/search?type=manga&page=${page}`;

      const html = await this.fetchWithTimeout(url);
      let mangaList = MangaPillProvider.sliceCuratedPopular(this.parseMangaCards(html));

      if (mangaList.length > 0 && isDefaultQuery) {
        this.popularCache = { data: mangaList, timestamp: Date.now() };
      }

      if (!options?.includeAdult) {
        mangaList = mangaList.filter(m => !m.isAdult);
      }

      if (options?.onlyAvailable) {
        mangaList = mangaList.filter(m => m.hasAvailableChapters);
      }

      return mangaList.slice(0, limit);
    } catch (err) {
      // If live fetch fails, fall back to stale cache or curated popular baseline
      if (!mappedGenre && this.popularCache && this.popularCache.data.length > 0) {
        let cached = [...this.popularCache.data];
        if (!options?.includeAdult) cached = cached.filter(m => !m.isAdult);
        if (options?.onlyAvailable) cached = cached.filter(m => m.hasAvailableChapters);
        return cached.slice(0, limit);
      }

      if (mappedGenre) {
        return [];
      }

      const fallback = this.getFallbackPopularList();
      let filtered = [...fallback];
      if (!options?.includeAdult) filtered = filtered.filter(m => !m.isAdult);
      if (options?.onlyAvailable) filtered = filtered.filter(m => m.hasAvailableChapters);
      return filtered.slice(0, limit);
    }
  }

  private getFallbackPopularList(): Manga[] {
    const now = new Date().toISOString();
    return [
      {
        id: `mr_${this.sourceId}_1-berserk`,
        title: 'Berserk',
        altTitles: ['Kenpuu Denki Berserk'],
        coverUrl: formatProxyUrl('https://cdn.readdetectiveconan.com/file/mangapill/covers/1.jpg'),
        synopsis: 'Guts, conhecido como o Espadachim Negro, busca refúgio das forças demoníacas atraídas por ele.',
        authors: ['Kentaro Miura'],
        artists: ['Kentaro Miura'],
        genres: ['Action', 'Adventure', 'Drama', 'Fantasy', 'Horror', 'Supernatural'],
        status: 'ongoing',
        rating: 9.5,
        contentRating: 'suggestive',
        isAdult: false,
        publicationInfo: {
          country: 'JP',
          demographic: 'seinen'
        },
        hasAvailableChapters: true,
        availabilityStatus: 'available',
        availableLanguages: ['en'],
        sources: [
          {
            sourceId: this.sourceId,
            sourceName: this.sourceName,
            externalId: '1-berserk',
            url: `${this.baseUrl}/manga/1/berserk`
          }
        ],
        updatedAt: now
      },
      {
        id: `mr_${this.sourceId}_2-one-piece`,
        title: 'One Piece',
        altTitles: ['OP'],
        coverUrl: formatProxyUrl('https://cdn.readdetectiveconan.com/file/mangapill/covers/2.jpg'),
        synopsis: 'Monkey D. Luffy navega pela Grand Line com seus companheiros em busca do lendário tesouro One Piece.',
        authors: ['Eiichiro Oda'],
        artists: ['Eiichiro Oda'],
        genres: ['Action', 'Adventure', 'Comedy', 'Fantasy', 'Shounen'],
        status: 'ongoing',
        rating: 9.3,
        contentRating: 'safe',
        isAdult: false,
        publicationInfo: {
          country: 'JP',
          demographic: 'shounen'
        },
        hasAvailableChapters: true,
        availabilityStatus: 'available',
        availableLanguages: ['en'],
        sources: [
          {
            sourceId: this.sourceId,
            sourceName: this.sourceName,
            externalId: '2-one-piece',
            url: `${this.baseUrl}/manga/2/one-piece`
          }
        ],
        updatedAt: now
      },
      {
        id: `mr_${this.sourceId}_5035-sousou-no-frieren`,
        title: 'Sousou no Frieren',
        altTitles: ['Frieren: Beyond Journey\'s End'],
        coverUrl: formatProxyUrl('https://cdn.readdetectiveconan.com/file/mangapill/covers/5035.jpg'),
        synopsis: 'A maga elfa Frieren reflete sobre a vida, a mortalidade humana e os laços que formou em sua jornada.',
        authors: ['Kanehito Yamada'],
        artists: ['Tsukasa Abe'],
        genres: ['Adventure', 'Drama', 'Fantasy', 'Shounen'],
        status: 'ongoing',
        rating: 9.1,
        contentRating: 'safe',
        isAdult: false,
        publicationInfo: {
          country: 'JP',
          demographic: 'shounen'
        },
        hasAvailableChapters: true,
        availabilityStatus: 'available',
        availableLanguages: ['en'],
        sources: [
          {
            sourceId: this.sourceId,
            sourceName: this.sourceName,
            externalId: '5035-sousou-no-frieren',
            url: `${this.baseUrl}/manga/5035/sousou-no-frieren`
          }
        ],
        updatedAt: now
      },
      {
        id: `mr_${this.sourceId}_2061-chainsaw-man`,
        title: 'Chainsaw Man',
        altTitles: ['CSM'],
        coverUrl: formatProxyUrl('https://cdn.readdetectiveconan.com/file/mangapill/covers/2061.jpg'),
        synopsis: 'Denji renasce como um demônio da motosserra e se junta aos Caçadores de Demônios da Segurança Pública.',
        authors: ['Tatsuki Fujimoto'],
        artists: ['Tatsuki Fujimoto'],
        genres: ['Action', 'Comedy', 'Horror', 'Supernatural'],
        status: 'ongoing',
        rating: 8.9,
        contentRating: 'suggestive',
        isAdult: false,
        publicationInfo: {
          country: 'JP',
          demographic: 'shounen'
        },
        hasAvailableChapters: true,
        availabilityStatus: 'available',
        availableLanguages: ['en'],
        sources: [
          {
            sourceId: this.sourceId,
            sourceName: this.sourceName,
            externalId: '2061-chainsaw-man',
            url: `${this.baseUrl}/manga/2061/chainsaw-man`
          }
        ],
        updatedAt: now
      }
    ];
  }

  async getMangaDetails(externalId: string): Promise<Manga | null> {
    const cached = this.detailsCache.get(externalId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      // Resolve path: externalId e.g. "1-berserk" or "1" or "5035-sousou-no-frieren"
      const numMatch = externalId.match(/^(\d+)(?:[-/](.*))?$/);
      let path: string;
      if (numMatch) {
        const id = numMatch[1];
        const slug = numMatch[2] ? numMatch[2].replace(/\//g, '-') : '';
        path = slug ? `${id}/${slug}` : id;
      } else {
        path = externalId.replace(/-/g, '/');
      }

      const url = `${this.baseUrl}/manga/${path}`;
      const html = await this.fetchWithTimeout(url);

      // Title
      const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const title = h1Match ? decodeHtmlEntities(h1Match[1].trim()) : externalId;

      // Alt title
      const altMatch = html.match(/<div class="[^"]*text-sm text-secondary[^"]*">([\s\S]*?)<\/div>/i);
      const altTitle = altMatch ? decodeHtmlEntities(altMatch[1].trim()) : '';

      // Synopsis
      const descMatch = html.match(/<p class="[^"]*text-sm text--secondary[^"]*">([\s\S]*?)<\/p>/i);
      const synopsis = descMatch
        ? decodeHtmlEntities(descMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim())
        : 'Sinopse não disponível.';

      // Cover image
      const coverMatch =
        html.match(/<img[^>]+data-src="([^"]+)"[^>]*>/i) || html.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
      const coverUrl = formatProxyUrl(coverMatch ? coverMatch[1].trim() : '');

      // Year, Status, Type
      const yearMatch = html.match(/<label class="[^"]*text-secondary[^"]*">Year<\/label>\s*<div>([^<]+)<\/div>/i);
      const releaseYear = yearMatch ? parseInt(yearMatch[1].trim(), 10) : undefined;

      const statusMatch = html.match(/<label class="[^"]*text-secondary[^"]*">Status<\/label>\s*<div>([^<]+)<\/div>/i);
      const status = parseMangaStatus(statusMatch ? statusMatch[1].trim() : undefined);

      // Genres
      const genreMatches = [
        ...html.matchAll(/<a class="[^"]*text-brand[^"]*" href="\/search\?genre=[^"]+">([^<]+)<\/a>/gi)
      ].map(g => decodeHtmlEntities(g[1].trim()));

      const { contentRating, isAdult, demographic } = parseRatingAndDemographic(genreMatches);

      // Check chapters presence
      const hasChapters = html.includes('/chapters/') && html.includes('Chapters');

      const canonicalExternalId = numMatch && numMatch[2]
        ? `${numMatch[1]}-${numMatch[2].replace(/\//g, '-')}`
        : externalId;

      const manga: Manga = {
        id: `mr_${this.sourceId}_${canonicalExternalId}`,
        title,
        altTitles: altTitle ? [altTitle] : [],
        coverUrl,
        synopsis,
        authors: ['Autor Desconhecido'],
        artists: ['Artista Desconhecido'],
        genres: genreMatches.length > 0 ? genreMatches : ['Manga'],
        status,
        publicationInfo: {
          releaseYear: isNaN(releaseYear as number) ? undefined : releaseYear,
          country: 'JP',
          demographic
        },
        availableLanguages: ['en'],
        sources: [
          {
            sourceId: this.sourceId,
            sourceName: this.sourceName,
            externalId: canonicalExternalId,
            url
          }
        ],
        updatedAt: new Date().toISOString(),
        contentRating,
        isAdult,
        hasAvailableChapters: hasChapters,
        availabilityStatus: hasChapters ? 'available' : 'metadata_only'
      };

      this.detailsCache.set(externalId, { data: manga, timestamp: Date.now() });
      if (canonicalExternalId !== externalId) {
        this.detailsCache.set(canonicalExternalId, { data: manga, timestamp: Date.now() });
      }

      return manga;
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      if (cached) return cached.data;
      console.info(`[MangaPillProvider] getMangaDetails unavailable for ${externalId}: ${(err as Error).message}`);
      return null;
    }
  }

  async getChapters(externalMangaId: string, language?: string): Promise<Chapter[]> {
    // MangaPill only provides English scanlations
    if (!acceptsEnglishLanguage(language)) {
      return [];
    }

    const cached = this.chaptersCache.get(externalMangaId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const numMatch = externalMangaId.match(/^(\d+)(?:[-/](.*))?$/);
      let path: string;
      if (numMatch) {
        const id = numMatch[1];
        const slug = numMatch[2] ? numMatch[2].replace(/\//g, '-') : '';
        path = slug ? `${id}/${slug}` : id;
      } else {
        path = externalMangaId.replace(/-/g, '/');
      }

      const url = `${this.baseUrl}/manga/${path}`;
      const html = await this.fetchWithTimeout(url);

      const chRegex = /<a\s+[^>]*href="\/chapters\/([0-9]+-[0-9]+(?:\/[^"]+)?)"[^>]*>([\s\S]*?)<\/a>/g;
      const chapters: Chapter[] = [];
      let m: RegExpExecArray | null;

      while ((m = chRegex.exec(html)) !== null) {
        const rawPath = m[1]; // e.g. "1-20386000/berserk-chapter-386"
        const linkText = decodeHtmlEntities(m[2].trim().replace(/\s+/g, ' '));

        // Format externalChapterId replacing '/' with '---'
        const externalChapterId = rawPath.replace(/\//g, '---');

        // Extract chapter number
        let chapterNumber = '0';
        const textMatch = linkText.match(/chapter\s+([0-9]+(?:\.[0-9]+)?)/i);
        if (textMatch) {
          chapterNumber = textMatch[1];
        } else {
          const pathMatch = rawPath.match(/chapter-([0-9]+(?:\.[0-9]+)?)/i);
          if (pathMatch) {
            chapterNumber = pathMatch[1];
          }
        }

        chapters.push({
          id: `ch_${this.sourceId}_${externalMangaId}_${externalChapterId}`,
          mangaId: `mr_${this.sourceId}_${externalMangaId}`,
          chapterNumber,
          title: linkText,
          language: 'en',
          sourceId: this.sourceId,
          externalChapterId
        });
      }

      // Sort chapters numerically ascending
      chapters.sort((a, b) => {
        const numA = parseFloat(a.chapterNumber) || 0;
        const numB = parseFloat(b.chapterNumber) || 0;
        return numA - numB;
      });

      this.chaptersCache.set(externalMangaId, { data: chapters, timestamp: Date.now() });
      return chapters;
    } catch (err) {
      if (cached) return cached.data;
      console.info(`[MangaPillProvider] getChapters unavailable for ${externalMangaId}: ${(err as Error).message}`);
      return [];
    }
  }

  async getChapterPages(externalChapterId: string): Promise<MangaPage[]> {
    try {
      if (!externalChapterId) {
        throw new HttpError(400, 'Identificador de capítulo MangaPill não fornecido.');
      }

      // Convert delimiter: "1-10001000---berserk-chapter-1" -> "1-10001000/berserk-chapter-1"
      const chapterPath = externalChapterId.replace(/---/g, '/');
      const url = `${this.baseUrl}/chapters/${chapterPath}`;

      const html = await this.fetchWithTimeout(url);

      const imgRegex = /<img[^>]+data-src="([^"]+)"[^>]*>/gi;
      const pages: MangaPage[] = [];
      let m: RegExpExecArray | null;
      let pageNum = 1;

      while ((m = imgRegex.exec(html)) !== null) {
        const imageUrl = m[1].trim();
        // MangaPill images are hosted on cdn.readdetectiveconan.com or mangap
        if (imageUrl.includes('cdn.readdetectiveconan.com') || imageUrl.includes('mangap')) {
          pages.push({
            pageNumber: pageNum++,
            imageUrl: formatProxyUrl(imageUrl)
          });
        }
      }

      if (pages.length === 0) {
        // Fallback check: look for src attributes if data-src was not present
        const srcRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
        while ((m = srcRegex.exec(html)) !== null) {
          const imageUrl = m[1].trim();
          if (imageUrl.includes('cdn.readdetectiveconan.com') && !imageUrl.includes('static')) {
            pages.push({
              pageNumber: pageNum++,
              imageUrl: formatProxyUrl(imageUrl)
            });
          }
        }
      }

      return pages;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.warn(`[MangaPillProvider] getChapterPages failed for ${externalChapterId}:`, (err as Error).message);
      return [];
    }
  }
}
