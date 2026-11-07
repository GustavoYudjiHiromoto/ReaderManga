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

export class MangaBallProvider implements IMangaSource {
  private readonly baseUrl = 'https://mangaball.net';
  private readonly sourceId = 'mangaball';
  private readonly sourceName = 'MangaBall';

  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

  private detailsCache: Map<string, { data: Manga; timestamp: number }> = new Map();
  private chaptersCache: Map<string, { data: Chapter[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  getInfo(): MangaSourceInfo {
    return {
      id: this.sourceId,
      name: 'MangaBall',
      description: 'Repositório focado em webtoons e manhwas com indexação de traduções multi-idioma.',
      version: '1.0.0',
      isAvailable: true,
      type: 'live_api',
      websiteUrl: 'https://mangaball.net',
      iconColor: '#8b5cf6',
      badge: 'MB',
      languages: ['en', 'pt-br', 'es'],
      catalogEstimate: '45.000+ títulos',
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
  private async fetchApi(endpoint: string, options: RequestInit = {}): Promise<any> {
    const fullUrl = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const flareUrl = process.env.FLARESOLVERR_URL;

    if (flareUrl) {
      try {
        const response = await fetch(`${flareUrl}/v1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cmd: options.method === 'POST' ? 'request.post' : 'request.get',
            url: fullUrl,
            postData: options.body ? String(options.body) : undefined,
            maxTimeout: 10000
          })
        });
        if (response.ok) {
          const json = await response.json() as any;
          if (json?.solution?.response) {
            try {
              return JSON.parse(json.solution.response);
            } catch {
              return json.solution.response;
            }
          }
        }
      } catch (err) {
        console.warn(`[MangaBall] FlareSolverr request error on ${fullUrl}:`, (err as Error).message);
      }
    }

    const res = await fetch(fullUrl, {
      ...options,
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Origin': this.baseUrl,
        'Referer': `${this.baseUrl}/`,
        ...(options.headers || {})
      }
    });

    if (res.status === 403) {
      console.warn(`[MangaBall] Cloudflare WAF 403 on ${fullUrl}`);
      return null;
    }

    if (!res.ok) {
      throw new HttpError(res.status, `MangaBall returned HTTP ${res.status}`);
    }

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async search(query: string, options?: SourceSearchOptions): Promise<SourceSearchResult> {
    const trimmed = (query || '').trim();
    try {
      const payload = {
        query: trimmed,
        page: options?.page || 1,
        limit: options?.limit || 20
      };

      const data = await this.fetchApi('/api/v1/title/search-advanced/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!data || !Array.isArray(data.items || data.results || data.data)) {
        return { mangaList: [], total: 0, hasMore: false };
      }

      const items = (data.items || data.results || data.data) as any[];
      const mangaList: Manga[] = items.map(item => {
        const id = String(item.id || item.slug || item._id);
        const title = decodeHtmlEntities(item.title || item.name || 'Sem título');
        const cover = item.cover || item.cover_url || item.thumbnail || '';
        return {
          id: `mr_${this.sourceId}_${id}`,
          title,
          altTitles: Array.isArray(item.alt_titles) ? item.alt_titles : [],
          coverUrl: cover.startsWith('http') ? cover : `${this.baseUrl}${cover}`,
          synopsis: item.synopsis || item.description || 'Disponível no acervo MangaBall.',
          authors: Array.isArray(item.authors) ? item.authors : [item.author || 'MangaBall'],
          artists: [],
          genres: Array.isArray(item.genres) ? item.genres : ['Webtoon'],
          status: (item.status === 'completed' ? 'completed' : 'ongoing') as MangaStatus,
          rating: Number(item.rating || 8.0),
          publicationInfo: {
            country: 'KR'
          },
          updatedAt: new Date().toISOString(),
          sources: [
            {
              sourceId: this.sourceId,
              name: this.sourceName,
              externalId: id,
              url: `${this.baseUrl}/title/${id}`
            }
          ],
          isAdult: Boolean(item.is_nsfw || item.is_adult),
          contentRating: (item.is_nsfw || item.is_adult) ? 'pornographic' : 'safe',
          hasAvailableChapters: true,
          availabilityStatus: 'available'
        };
      });

      return {
        mangaList,
        total: mangaList.length,
        hasMore: mangaList.length >= 20
      };
    } catch (err) {
      console.warn(`[MangaBall] Search error for "${query}":`, (err as Error).message);
      return { mangaList: [], total: 0, hasMore: false };
    }
  }

  async getPopular(options?: SourceSearchOptions): Promise<Manga[]> {
    const res = await this.search('', options);
    return res.mangaList;
  }

  async getMangaDetails(externalId: string): Promise<Manga | null> {
    const cached = this.detailsCache.get(externalId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const data = await this.fetchApi(`/api/v1/title/${externalId}/`);
      if (!data) return null;

      const title = decodeHtmlEntities(data.title || data.name || externalId.replace(/[-_]/g, ' '));
      const cover = data.cover || data.cover_url || '';

      const manga: Manga = {
        id: `mr_${this.sourceId}_${externalId}`,
        title,
        altTitles: Array.isArray(data.alt_titles) ? data.alt_titles : [],
        coverUrl: cover.startsWith('http') ? cover : `${this.baseUrl}${cover}`,
        synopsis: data.synopsis || data.description || 'Sinopse MangaBall',
        authors: Array.isArray(data.authors) ? data.authors : ['Autor MangaBall'],
        artists: [],
        genres: Array.isArray(data.genres) ? data.genres : ['Action', 'Webtoon'],
        status: (data.status === 'completed' ? 'completed' : 'ongoing') as MangaStatus,
        rating: 8.4,
        publicationInfo: {
          country: 'KR'
        },
        updatedAt: new Date().toISOString(),
        sources: [
          {
            sourceId: this.sourceId,
            externalId,
            url: `${this.baseUrl}/title/${externalId}`
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
      console.warn(`[MangaBall] Error getting details for ${externalId}:`, (err as Error).message);
      return null;
    }
  }

  async getChapters(externalMangaId: string, language?: string): Promise<Chapter[]> {
    const cached = this.chaptersCache.get(externalMangaId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const data = await this.fetchApi(`/api/v1/title/${externalMangaId}/chapters/`);
      if (!data || !Array.isArray(data.items || data.chapters || data)) {
        return [];
      }

      const rawChapters = (data.items || data.chapters || data) as any[];
      const chapters: Chapter[] = rawChapters.map(ch => {
        const chId = String(ch.id || ch.slug || ch._id);
        const chNum = String(ch.chapter_number || ch.number || '1');
        return {
          id: `ch_${this.sourceId}_${externalMangaId}_${chId}`,
          sourceId: this.sourceId,
          mangaId: `mr_${this.sourceId}_${externalMangaId}`,
          externalChapterId: chId,
          chapterNumber: chNum,
          title: ch.title ? decodeHtmlEntities(ch.title) : `Capítulo ${chNum}`,
          language: language || ch.language || 'en',
          releaseDate: ch.created_at || new Date().toISOString(),
          scanlationGroup: 'MangaBall'
        };
      });

      this.chaptersCache.set(externalMangaId, { data: chapters, timestamp: Date.now() });
      return chapters;
    } catch (err) {
      console.warn(`[MangaBall] Error getting chapters for ${externalMangaId}:`, (err as Error).message);
      return [];
    }
  }

  async getChapterPages(externalChapterId: string): Promise<MangaPage[]> {
    return [];
  }
}
