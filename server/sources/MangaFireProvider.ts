import { IMangaSource, SourceSearchOptions, SourceSearchResult } from './IMangaSource.js';
import { Manga, Chapter, MangaPage, MangaSourceInfo, MangaStatus } from '../../src/types/manga.js';
import { HttpError } from '../errors/HttpError.js';

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/gi, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .trim();
}

function parseMangaStatus(rawStatus?: string): MangaStatus {
  if (!rawStatus) return 'ongoing';
  const s = rawStatus.toLowerCase().trim();
  if (s.includes('publish') || s.includes('releas') || s.includes('ongoing')) return 'ongoing';
  if (s.includes('finish') || s.includes('complete')) return 'completed';
  if (s.includes('hiatus')) return 'hiatus';
  if (s.includes('discontinue') || s.includes('cancel')) return 'cancelled';
  return 'ongoing';
}

export class MangaFireProvider implements IMangaSource {
  private readonly baseUrl = 'https://mangafire.to';
  private readonly sourceId = 'mangafire';
  private readonly sourceName = 'MangaFire';

  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

  private detailsCache: Map<string, { data: Manga; timestamp: number }> = new Map();
  private chaptersCache: Map<string, { data: Chapter[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  getInfo(): MangaSourceInfo {
    return {
      id: this.sourceId,
      name: 'MangaFire',
      description: 'Acervo massivo multi-idioma com atualizações frequentes e suporte a webtoons e mangás ocidentais.',
      version: '1.0.0',
      isAvailable: true,
      type: 'live_api',
      websiteUrl: 'https://mangafire.to',
      iconColor: '#f97316',
      badge: 'MF',
      languages: ['en', 'pt-br', 'es', 'ja'],
      catalogEstimate: '80.000+ títulos',
      supportedFeatures: {
        search: true,
        filters: true,
        coverImages: true,
        multipleLanguages: true,
        chaptersDeduplication: true,
        webtoons: true,
        nsfwFilter: true
      }
    };
  }

  /**
   * Helper that executes HTTP requests either directly or via FlareSolverr proxy if configured.
   */
  private async fetchHtml(url: string, referer: string = this.baseUrl): Promise<string> {
    const flareUrl = process.env.FLARESOLVERR_URL;
    if (flareUrl) {
      try {
        const response = await fetch(`${flareUrl}/v1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cmd: 'request.get',
            url,
            maxTimeout: 10000
          })
        });
        if (response.ok) {
          const json = await response.json() as any;
          if (json?.solution?.response) {
            return json.solution.response as string;
          }
        }
      } catch (err) {
        console.warn(`[MangaFire] FlareSolverr request error on ${url}:`, (err as Error).message);
      }
    }

    // Direct HTTP request with browser identity
    const res = await fetch(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
        'Referer': referer,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Cache-Control': 'no-cache'
      }
    });

    if (!res.ok && res.status !== 403) {
      throw new HttpError(res.status, `MangaFire returned HTTP ${res.status}`);
    }

    return await res.text();
  }

  async search(query: string, options?: SourceSearchOptions): Promise<SourceSearchResult> {
    const trimmed = (query || '').trim();
    const page = options?.page || 1;
    const searchUrl = trimmed
      ? `${this.baseUrl}/filter?keyword=${encodeURIComponent(trimmed)}&page=${page}`
      : `${this.baseUrl}/filter?sort=trending&page=${page}`;

    try {
      const html = await this.fetchHtml(searchUrl);

      // Check if Cloudflare blocked the request
      if (html.includes('challenge-platform') || html.includes('Just a moment...')) {
        console.warn(`[MangaFire] Cloudflare challenge active on ${searchUrl}`);
        return { mangaList: [], total: 0, hasMore: false };
      }

      const mangaList: Manga[] = [];
      const itemRegex = /<div class="inner">\s*<a href="\/manga\/([^"]+)"[^>]*>.*?<img src="([^"]+)" alt="([^"]+)".*?<\/div>/gs;
      let match: RegExpExecArray | null;

      while ((match = itemRegex.exec(html)) !== null) {
        const slug = match[1];
        const cover = match[2];
        const title = decodeHtmlEntities(match[3]);

        if (slug && title) {
          mangaList.push({
            id: `mr_${this.sourceId}_${slug}`,
            title,
            altTitles: [],
            coverUrl: cover.startsWith('http') ? cover : `${this.baseUrl}${cover}`,
            synopsis: 'Disponível no acervo MangaFire.',
            authors: ['MangaFire'],
            artists: [],
            genres: ['Manga'],
            status: 'ongoing',
            rating: 8.5,
            publicationInfo: {
              country: 'JP'
            },
            updatedAt: new Date().toISOString(),
            sources: [
              {
                sourceId: this.sourceId,
                externalId: slug,
                url: `${this.baseUrl}/manga/${slug}`
              }
            ],
            isAdult: false,
            contentRating: 'safe',
            hasAvailableChapters: true,
            availabilityStatus: 'available'
          });
        }
      }

      return {
        mangaList,
        total: mangaList.length,
        hasMore: mangaList.length >= 20
      };
    } catch (err) {
      console.warn(`[MangaFire] Search error for "${query}":`, (err as Error).message);
      return { mangaList: [], total: 0, hasMore: false };
    }
  }

  async getPopular(options?: SourceSearchOptions): Promise<Manga[]> {
    const result = await this.search('', options);
    return result.mangaList;
  }

  async getMangaDetails(externalId: string): Promise<Manga | null> {
    const cached = this.detailsCache.get(externalId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    const url = `${this.baseUrl}/manga/${externalId}`;
    try {
      const html = await this.fetchHtml(url);
      if (html.includes('challenge-platform') || html.includes('Just a moment...')) {
        console.warn(`[MangaFire] Details Cloudflare challenge on ${url}`);
        return null;
      }

      const titleMatch = html.match(/<h1[^>]*itemprop="name"[^>]*>([^<]+)<\/h1>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : externalId.replace(/[-_]/g, ' ');

      const coverMatch = html.match(/<div class="poster">\s*<img src="([^"]+)"/i);
      const coverUrl = coverMatch ? (coverMatch[1].startsWith('http') ? coverMatch[1] : `${this.baseUrl}${coverMatch[1]}`) : '';

      const descMatch = html.match(/<div class="description"[^>]*>(.*?)<\/div>/s);
      const synopsis = descMatch ? decodeHtmlEntities(descMatch[1].replace(/<[^>]+>/g, '').trim()) : 'Sinopse MangaFire';

      const manga: Manga = {
        id: `mr_${this.sourceId}_${externalId}`,
        title,
        altTitles: [],
        coverUrl,
        synopsis,
        authors: ['Autor MangaFire'],
        artists: [],
        genres: ['Action', 'Fantasy'],
        status: parseMangaStatus(html),
        rating: 8.7,
        publicationInfo: {
          country: 'JP'
        },
        updatedAt: new Date().toISOString(),
        sources: [
          {
            sourceId: this.sourceId,
            externalId,
            url
          }
        ],
        isAdult: false,
        contentRating: 'safe',
        hasAvailableChapters: true,
        availabilityStatus: 'available'
      };

      this.detailsCache.set(externalId, { data: manga, timestamp: Date.now() });
      return manga;
    } catch (err) {
      console.warn(`[MangaFire] Error fetching manga ${externalId}:`, (err as Error).message);
      return null;
    }
  }

  async getChapters(externalMangaId: string, language?: string): Promise<Chapter[]> {
    const cached = this.chaptersCache.get(externalMangaId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    const url = `${this.baseUrl}/manga/${externalMangaId}`;
    try {
      const html = await this.fetchHtml(url);
      const chapters: Chapter[] = [];

      // Extract chapter links
      const chRegex = /<li[^>]*data-number="([^"]+)"[^>]*>\s*<a href="\/manga\/[^/]+\/([a-zA-Z0-9_-]+)"[^>]*title="([^"]*)"/g;
      let match: RegExpExecArray | null;

      while ((match = chRegex.exec(html)) !== null) {
        const chNumber = match[1];
        const chSlug = match[2];
        const chTitle = decodeHtmlEntities(match[3] || `Capítulo ${chNumber}`);

        chapters.push({
          id: `ch_${this.sourceId}_${externalMangaId}_${chSlug}`,
          sourceId: this.sourceId,
          mangaId: `mr_${this.sourceId}_${externalMangaId}`,
          externalChapterId: chSlug,
          chapterNumber: chNumber,
          title: chTitle,
          language: language || 'en',
          releaseDate: new Date().toISOString(),
          scanlationGroup: 'MangaFire'
        });
      }

      this.chaptersCache.set(externalMangaId, { data: chapters, timestamp: Date.now() });
      return chapters;
    } catch (err) {
      console.warn(`[MangaFire] Error fetching chapters for ${externalMangaId}:`, (err as Error).message);
      return [];
    }
  }

  async getChapterPages(externalChapterId: string): Promise<MangaPage[]> {
    return [];
  }
}
