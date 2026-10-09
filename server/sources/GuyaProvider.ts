import { IMangaSource, SourceSearchOptions, SourceSearchResult } from './IMangaSource.js';
import { Manga, Chapter, MangaPage, MangaSourceInfo } from '../../src/types/manga.js';
import { HttpError } from '../errors/HttpError.js';

interface GuyaSeriesOverview {
  title?: string;
  slug: string;
  author: string;
  artist: string;
  description: string;
  cover: string;
  groups: Record<string, string>;
  last_updated?: number;
}

interface GuyaChapterData {
  volume?: string;
  title?: string;
  folder: string;
  groups: Record<string, string[]>;
  release_date?: Record<string, number>;
}

interface GuyaSeriesDetail {
  slug: string;
  title: string;
  description: string;
  author: string;
  artist: string;
  groups: Record<string, string>;
  cover: string;
  preferred_sort?: any;
  chapters: Record<string, GuyaChapterData>;
}

const SERIES_GENRES: Record<string, string[]> = {
  'kaguya-wants-to-be-confessed-to': ['Comédia', 'Romance', 'Drama', 'Escolar', 'Seinen'],
  'oshi-no-ko': ['Drama', 'Mistério', 'Sobrenatural', 'Seinen'],
  'renai-daikou': ['Comédia', 'Romance', 'Seinen'],
  'we-want-to-talk-about-kaguya': ['Comédia', 'Romance', 'Escolar'],
  'kaguya-wants-to-be-confessed-to-official-doujin': ['Comédia', 'Romance', 'Ecchi'],
  'original-hinatazaka': ['Slice of Life', 'Comédia']
};

const SERIES_ALT_TITLES: Record<string, string[]> = {
  'kaguya-wants-to-be-confessed-to': [
    'Kaguya-sama: Love is War',
    'Kaguya-sama wa Kokurasetai',
    'Kaguya Wants To Be Confessed To',
    'かぐや様は告らせたい'
  ],
  'oshi-no-ko': [
    'Oshi no Ko',
    '【推しの子】',
    'My Star',
    'Favorite Child'
  ],
  'renai-daikou': [
    'Renai Daikou',
    'Ren\'ai Daikou',
    'Love Agency',
    '恋愛代行'
  ],
  'we-want-to-talk-about-kaguya': [
    'We Want to Talk About Kaguya',
    'Kaguya-sama o Kataritai',
    'かぐや様を語りたい'
  ],
  'kaguya-wants-to-be-confessed-to-official-doujin': [
    'Kaguya Wants To Be Confessed To Official Doujin',
    'Kaguya-sama Official Doujin'
  ],
  'original-hinatazaka': [
    'Original Hinatazaka',
    'Hinatazaka46'
  ]
};

export class GuyaProvider implements IMangaSource {
  private readonly baseUrl = 'https://guya.moe';
  private readonly cdnUrl = 'https://guya.cubari.moe';
  private readonly sourceId = 'guya';
  private readonly sourceName = 'Guya / Cubari (Live API)';

  private seriesCache: { data: Record<string, GuyaSeriesOverview>; timestamp: number } | null = null;
  private detailsCache: Map<string, { data: GuyaSeriesDetail; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  getInfo(): MangaSourceInfo {
    return {
      id: this.sourceId,
      name: this.sourceName,
      description: 'Fonte especializada com scans oficiais da comunidade e leitura de alta fidelidade para séries como Kaguya-sama e Oshi no Ko.',
      version: '1.0.0',
      isAvailable: true,
      type: 'live_api',
      websiteUrl: 'https://guya.cubari.moe',
      supportedFeatures: {
        search: true,
        filters: true,
        coverImages: true,
        multipleLanguages: false
      }
    };
  }

  private async fetchWithTimeout(url: string, timeoutMs = 8000): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'MangaReader-App/1.0.0 (https://github.com/aistudio-build)',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new HttpError(404, `Recurso não encontrado na API Guya/Cubari (HTTP 404).`);
        }
        if (response.status === 429) {
          throw new HttpError(429, `Limite de requisições excedido na API Guya (Rate limit 429).`);
        }
        if (response.status >= 500) {
          throw new HttpError(502, `Falha no servidor Guya/Cubari: HTTP ${response.status}`);
        }
        throw new HttpError(502, `Falha de comunicação com a API Guya: HTTP ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw new HttpError(504, 'Tempo limite de comunicação esgotado com a API Guya/Cubari (Gateway Timeout).');
      }
      throw new HttpError(502, `Erro ao conectar com a API Guya/Cubari: ${(err as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getAllSeries(): Promise<Record<string, GuyaSeriesOverview>> {
    const now = Date.now();
    if (this.seriesCache && now - this.seriesCache.timestamp < this.CACHE_TTL_MS) {
      return this.seriesCache.data;
    }

    try {
      const data = await this.fetchWithTimeout(`${this.baseUrl}/api/get_all_series`);
      this.seriesCache = { data, timestamp: now };
      return data;
    } catch (err) {
      if (this.seriesCache) return this.seriesCache.data;
      throw err;
    }
  }

  private async getSeriesDetail(slug: string): Promise<GuyaSeriesDetail | null> {
    const now = Date.now();
    const cached = this.detailsCache.get(slug);
    if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const data = await this.fetchWithTimeout(`${this.baseUrl}/api/series/${encodeURIComponent(slug)}/`);
      this.detailsCache.set(slug, { data, timestamp: now });
      return data;
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      if (cached) return cached.data;
      return null;
    }
  }

  private normalizeGuyaItem(titleKey: string, overview: GuyaSeriesOverview, detail?: GuyaSeriesDetail | null): Manga {
    const slug = overview.slug || detail?.slug || titleKey;
    const title = detail?.title || titleKey;
    const slugLower = slug.toLowerCase();

    const genres = SERIES_GENRES[slugLower] || ['Comédia', 'Romance', 'Seinen'];
    const altTitles = SERIES_ALT_TITLES[slugLower] || [title];

    const authors = overview.author ? [overview.author] : (detail?.author ? [detail.author] : ['Aka Akasaka']);
    const artists = overview.artist ? [overview.artist] : (detail?.artist ? [detail.artist] : authors);

    const coverPath = overview.cover || detail?.cover || '';
    const coverUrl = coverPath.startsWith('http')
      ? coverPath
      : `${this.cdnUrl}${coverPath}`;

    const synopsis = detail?.description || overview.description || 'Sinopse não disponível.';

    return {
      id: `mr_${this.sourceId}_${slug}`,
      title,
      altTitles: altTitles.slice(0, 5),
      coverUrl,
      synopsis,
      authors,
      artists,
      genres,
      status: 'ongoing',
      publicationInfo: {
        country: 'JP',
        demographic: 'Seinen'
      },
      sources: [
        {
          sourceId: this.sourceId,
          sourceName: this.sourceName,
          externalId: slug,
          url: `https://guya.cubari.moe/read/manga/${slug}/`
        }
      ],
      updatedAt: overview.last_updated
        ? new Date(overview.last_updated * 1000).toISOString()
        : new Date().toISOString()
    };
  }

  async search(query: string, options?: SourceSearchOptions): Promise<SourceSearchResult> {
    try {
      const all = await this.getAllSeries();
      const q = query.trim().toLowerCase();
      const selectedGenre = options?.genre && options.genre !== 'all' ? options.genre.toLowerCase() : null;

      const matched: Manga[] = [];

      for (const [titleKey, overview] of Object.entries(all)) {
        const slug = overview.slug;
        const slugLower = slug.toLowerCase();
        const altTitles = SERIES_ALT_TITLES[slugLower] || [];
        const genres = SERIES_GENRES[slugLower] || [];

        // Filter by genre if specified
        if (selectedGenre) {
          const hasGenre = genres.some(g => g.toLowerCase().includes(selectedGenre) || selectedGenre.includes(g.toLowerCase()));
          if (!hasGenre) continue;
        }

        // Filter by search query if specified
        if (q) {
          const titleMatch = titleKey.toLowerCase().includes(q);
          const slugMatch = slugLower.includes(q);
          const altMatch = altTitles.some(a => a.toLowerCase().includes(q));
          const authorMatch = overview.author?.toLowerCase().includes(q) || overview.artist?.toLowerCase().includes(q);

          if (!titleMatch && !slugMatch && !altMatch && !authorMatch) {
            continue;
          }
        }

        matched.push(this.normalizeGuyaItem(titleKey, overview));
      }

      const limit = options?.limit || 24;
      const offset = options?.offset || (options?.page ? (options.page - 1) * limit : 0);
      const sliced = matched.slice(offset, offset + limit);

      return {
        mangaList: sliced,
        total: matched.length,
        hasMore: offset + limit < matched.length
      };
    } catch (err) {
      console.warn(`[GuyaProvider] search failed:`, (err as Error).message);
      return { mangaList: [], total: 0, hasMore: false };
    }
  }

  async getPopular(options?: SourceSearchOptions): Promise<Manga[]> {
    try {
      const all = await this.getAllSeries();
      const selectedGenre = options?.genre && options.genre !== 'all' ? options.genre.toLowerCase() : null;

      const list: Manga[] = [];
      for (const [titleKey, overview] of Object.entries(all)) {
        const slugLower = overview.slug.toLowerCase();
        const genres = SERIES_GENRES[slugLower] || [];

        if (selectedGenre) {
          const hasGenre = genres.some(g => g.toLowerCase().includes(selectedGenre) || selectedGenre.includes(g.toLowerCase()));
          if (!hasGenre) continue;
        }

        list.push(this.normalizeGuyaItem(titleKey, overview));
      }

      const limit = options?.limit || 24;
      const offset = options?.offset || 0;
      return list.slice(offset, offset + limit);
    } catch (err) {
      console.warn(`[GuyaProvider] getPopular failed:`, (err as Error).message);
      return [];
    }
  }

  async getMangaDetails(externalId: string): Promise<Manga | null> {
    try {
      const detail = await this.getSeriesDetail(externalId);
      if (!detail) return null;

      const all = await this.getAllSeries().catch(() => ({}));
      const overview = Object.values(all).find(o => o.slug === externalId) || {
        slug: detail.slug,
        author: detail.author,
        artist: detail.artist,
        description: detail.description,
        cover: detail.cover,
        groups: detail.groups
      };

      return this.normalizeGuyaItem(detail.title || externalId, overview, detail);
    } catch (err) {
      console.warn(`[GuyaProvider] getMangaDetails failed for ${externalId}:`, (err as Error).message);
      return null;
    }
  }

  async getChapters(externalMangaId: string, _language?: string): Promise<Chapter[]> {
    try {
      const detail = await this.getSeriesDetail(externalMangaId);
      if (!detail || !detail.chapters) return [];

      const chapters: Chapter[] = [];
      const chapterNumbers = Object.keys(detail.chapters);

      for (const chNum of chapterNumbers) {
        const chData = detail.chapters[chNum];
        if (!chData || !chData.groups) continue;

        // Pick preferred group or first group with pages
        const groupIds = Object.keys(chData.groups);
        if (groupIds.length === 0) continue;

        const primaryGroupId = groupIds[0];
        const pagesArray = chData.groups[primaryGroupId] || [];

        let releaseDateStr: string | undefined;
        if (chData.release_date && chData.release_date[primaryGroupId]) {
          const ts = chData.release_date[primaryGroupId];
          releaseDateStr = new Date(ts * 1000).toISOString().substring(0, 10);
        }

        chapters.push({
          id: `ch_${this.sourceId}_${externalMangaId}_${externalMangaId}---${chNum}`,
          mangaId: `mr_${this.sourceId}_${externalMangaId}`,
          chapterNumber: chNum,
          volume: chData.volume || undefined,
          title: chData.title || undefined,
          releaseDate: releaseDateStr,
          language: 'en',
          sourceId: this.sourceId,
          externalChapterId: `${externalMangaId}---${chNum}`,
          pagesCount: pagesArray.length
        });
      }

      // Sort chapters numerically
      chapters.sort((a, b) => {
        const numA = parseFloat(a.chapterNumber) || 0;
        const numB = parseFloat(b.chapterNumber) || 0;
        return numA - numB;
      });

      return chapters;
    } catch (err) {
      console.warn(`[GuyaProvider] getChapters failed for ${externalMangaId}:`, (err as Error).message);
      return [];
    }
  }

  async getChapterPages(externalChapterId: string): Promise<MangaPage[]> {
    try {
      // Parse composite externalChapterId: format "<slug>---<chapterNumber>"
      if (!externalChapterId || !externalChapterId.includes('---')) {
        throw new HttpError(400, `Identificador de capítulo Guya inválido: '${externalChapterId}'. Formato esperado: '<slug>---<chapterNum>'.`);
      }

      const [slug, chapterNum] = externalChapterId.split('---');
      const detail = await this.getSeriesDetail(slug);
      if (!detail || !detail.chapters) {
        throw new HttpError(404, `Série Guya '${slug}' não encontrada.`);
      }

      const chData = detail.chapters[chapterNum];
      if (!chData || !chData.groups) {
        throw new HttpError(404, `Capítulo '${chapterNum}' não encontrado na série Guya '${slug}'.`);
      }

      const groupIds = Object.keys(chData.groups);
      if (groupIds.length === 0) {
        return [];
      }

      const primaryGroupId = groupIds[0];
      const fileNames = chData.groups[primaryGroupId] || [];

      return fileNames.map((fileName, idx) => ({
        pageNumber: idx + 1,
        imageUrl: `${this.cdnUrl}/media/manga/${slug}/chapters/${chData.folder}/${primaryGroupId}/${fileName}`
      }));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.warn(`[GuyaProvider] getChapterPages failed for ${externalChapterId}:`, (err as Error).message);
      return [];
    }
  }

  /**
   * Helper to check if a manga slug/title is supported on Guya
   */
  public isSupportedSlug(slug: string): boolean {
    const lower = slug.toLowerCase();
    return Object.keys(SERIES_GENRES).includes(lower);
  }
}
