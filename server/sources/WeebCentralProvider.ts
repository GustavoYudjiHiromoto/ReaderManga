import { IMangaSource, SourceSearchOptions, SourceSearchResult } from './IMangaSource.js';
import { Manga, Chapter, MangaPage, MangaSourceInfo, MangaStatus } from '../../src/types/manga.js';

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
    .trim();
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
  'seinen': 'Seinen',
  'shoujo': 'Shoujo',
  'josei': 'Josei',
  'psicológico': 'Psychological',
  'psicologico': 'Psychological',
  'psychological': 'Psychological',
  'slice of life': 'Slice of Life'
};

export class WeebCentralProvider implements IMangaSource {
  private readonly baseUrl = 'https://weebcentral.com';
  private readonly sourceId = 'weebcentral';
  private readonly sourceName = 'WeebCentral';

  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  private detailsCache: Map<string, { data: Manga; timestamp: number }> = new Map();
  private chaptersCache: Map<string, { data: Chapter[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  getInfo(): MangaSourceInfo {
    return {
      id: this.sourceId,
      name: 'WeebCentral (Ao Vivo)',
      description: 'Acervo extenso com scans de alta fidelidade e capítulos traduzidos sem restrição de licenciamento.',
      version: '1.0.0',
      isAvailable: true,
      type: 'live_api',
      websiteUrl: 'https://weebcentral.com',
      supportedFeatures: {
        search: true,
        filters: true,
        coverImages: true,
        multipleLanguages: false
      }
    };
  }

  /**
   * Parse an HTML article card from WeebCentral /search/data
   */
  private parseArticleCard(articleHtml: string): Manga | null {
    try {
      // 1. Series link & external ID
      const linkMatch = articleHtml.match(/href=\"https:\/\/weebcentral\.com\/series\/([A-Z0-9]+)\/([^\"]*)\"/i);
      if (!linkMatch) return null;

      const externalId = linkMatch[1];
      const slug = linkMatch[2] || '';

      // 2. Title
      const titleMatch = articleHtml.match(/class=\"line-clamp-1 link link-hover\">([^<]+)<\/a>/i) ||
                         articleHtml.match(/class=\"text-ellipsis truncate[^>]*>([^<]+)<\/div>/i);
      const title = decodeHtmlEntities(titleMatch ? titleMatch[1] : slug.replace(/-/g, ' '));
      if (!title) return null;

      // 3. Cover URL
      const coverMatch = articleHtml.match(/<source\s+srcset=\"([^\"]+)\"[^>]*type=\"image\/webp\"/i) ||
                         articleHtml.match(/<img\s+src=\"([^\"]+)\"[^>]*alt=\"[^\"]*cover\"/i) ||
                         articleHtml.match(/<img\s+src=\"(https:\/\/temp\.compsci88\.com\/cover\/[^\"]+)\"/i);
      const coverUrl = coverMatch ? coverMatch[1] : `https://temp.compsci88.com/cover/normal/${externalId}.webp`;

      // 4. Year
      const yearMatch = articleHtml.match(/<strong>Year:<\/strong>\s*<span>(\d+)<\/span>/i);
      const releaseYear = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

      // 5. Status
      const statusMatch = articleHtml.match(/<strong>Status:<\/strong>\s*<span>([^<]+)<\/span>/i);
      const rawStatus = (statusMatch ? statusMatch[1].trim().toLowerCase() : '');
      let status: MangaStatus = 'ongoing';
      if (rawStatus.includes('complete')) status = 'completed';
      else if (rawStatus.includes('hiatus')) status = 'hiatus';
      else if (rawStatus.includes('cancel')) status = 'cancelled';

      // 6. Authors
      const authorMatch = articleHtml.match(/<strong[^>]*>Author\(s\):[^<]*<\/strong>([\s\S]*?)<\/div>/i);
      const authors: string[] = [];
      if (authorMatch) {
        const authorLinks = [...authorMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
        for (const al of authorLinks) {
          const name = decodeHtmlEntities(al[1]);
          if (name) authors.push(name);
        }
      }

      // 7. Tags (Genres)
      const tagsMatch = articleHtml.match(/<strong[^>]*>Tag\(s\):[^<]*<\/strong>([\s\S]*?)<\/div>/i);
      const genres: string[] = [];
      if (tagsMatch) {
        const tagSpans = [...tagsMatch[1].matchAll(/<span>([^<]+)<\/span>/g)];
        for (const ts of tagSpans) {
          const t = decodeHtmlEntities(ts[1].replace(/,$/, ''));
          if (t) genres.push(t);
        }
      }

      // 8. Demographic
      let demographic: string | undefined;
      if (genres.includes('Shounen')) demographic = 'Shounen';
      else if (genres.includes('Seinen')) demographic = 'Seinen';
      else if (genres.includes('Shoujo')) demographic = 'Shoujo';
      else if (genres.includes('Josei')) demographic = 'Josei';

      // Content rating & adult content
      const isAdult = genres.some(g => /adult|hentai|smut|erotica/i.test(g));
      const isSuggestive = genres.some(g => /ecchi|mature/i.test(g));
      const contentRating: 'safe' | 'suggestive' | 'erotica' | 'pornographic' = isAdult
        ? 'pornographic'
        : (isSuggestive ? 'suggestive' : 'safe');

      return {
        id: `mr_${this.sourceId}_${externalId}`,
        title,
        altTitles: [],
        coverUrl,
        synopsis: 'Disponível no WeebCentral.',
        authors: authors.length > 0 ? authors : ['Autor Desconhecido'],
        artists: authors.length > 0 ? authors : ['Artista Desconhecido'],
        genres: genres.length > 0 ? genres : ['Mangá'],
        status,
        publicationInfo: {
          releaseYear,
          country: 'Japão',
          demographic
        },
        sources: [
          {
            sourceId: this.sourceId,
            externalId,
            url: `https://weebcentral.com/series/${externalId}/${slug}`,
            sourceName: this.sourceName
          }
        ],
        updatedAt: new Date().toISOString(),
        contentRating,
        isAdult,
        hasAvailableChapters: true,
        availabilityStatus: 'available'
      };
    } catch {
      return null;
    }
  }

  /**
   * Search mangas on WeebCentral
   */
  async search(query: string, options?: SourceSearchOptions): Promise<SourceSearchResult> {
    const trimmed = (query || '').trim();
    const limit = options?.limit || 24;
    const page = options?.page || 1;
    const offset = options?.offset !== undefined ? options.offset : (page - 1) * limit;

    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    params.set('sort', 'Popularity');
    params.set('order', 'Descending');
    params.set('display_mode', 'Full Display');

    if (trimmed) {
      params.set('text', trimmed);
    }

    if (options?.genre && options.genre !== 'all') {
      const lower = options.genre.toLowerCase();
      const mapped = GENRE_MAP[lower] || options.genre;
      params.set('included_tag', mapped);
    }

    const url = `${this.baseUrl}/search/data?${params.toString()}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'HX-Request': 'true'
        }
      });

      if (!res.ok) {
        return { mangaList: [], total: 0, hasMore: false };
      }

      const html = await res.text();
      const rawArticles = html.split('<article class="bg-base-300 flex gap-4 p-4">').slice(1);
      const results: Manga[] = [];

      for (const piece of rawArticles) {
        const manga = this.parseArticleCard(piece);
        if (manga && !results.some(r => r.id === manga.id)) {
          results.push(manga);
        }
      }

      let finalResults = results;
      if (!options?.includeAdult) {
        finalResults = finalResults.filter(m => !m.isAdult);
      }
      if (options?.onlyAvailable) {
        finalResults = finalResults.filter(m => m.hasAvailableChapters);
      }

      // If text query yielded 0 results from search/data, try quick-search fallback
      if (finalResults.length === 0 && trimmed) {
        const quickResults = await this.quickSearch(trimmed);
        let filteredQuick = quickResults;
        if (!options?.includeAdult) {
          filteredQuick = filteredQuick.filter(m => !m.isAdult);
        }
        if (options?.onlyAvailable) {
          filteredQuick = filteredQuick.filter(m => m.hasAvailableChapters);
        }
        if (filteredQuick.length > 0) {
          return {
            mangaList: filteredQuick.slice(0, limit),
            total: filteredQuick.length,
            hasMore: filteredQuick.length > limit
          };
        }
      }

      const hasMore = rawArticles.length >= limit || html.includes('View More Results...');

      return {
        mangaList: finalResults,
        total: finalResults.length,
        hasMore
      };
    } catch (err) {
      console.error(`[WeebCentral] Erro na busca por "${query}":`, (err as Error).message);
      return { mangaList: [], total: 0, hasMore: false };
    }
  }

  /**
   * Fallback quick-search via POST /search/simple
   */
  private async quickSearch(query: string): Promise<Manga[]> {
    try {
      const form = new URLSearchParams();
      form.append('text', query);

      const res = await fetch(`${this.baseUrl}/search/simple?location=main`, {
        method: 'POST',
        headers: {
          'User-Agent': this.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
          'HX-Request': 'true'
        },
        body: form.toString()
      });

      if (!res.ok) return [];

      const html = await res.text();
      const links = [...html.matchAll(/<a\s+href=\"https:\/\/weebcentral\.com\/series\/([A-Z0-9]+)\/([^\"]*)\"[^>]*>([\s\S]*?)<\/a>/gi)];
      const list: Manga[] = [];

      for (const m of links) {
        const externalId = m[1];
        const slug = m[2];
        const inner = m[3];

        const titleMatch = inner.match(/<div class=\"flex-1 overflow-hidden[^>]*>([^<]+)<\/div>/i);
        const title = decodeHtmlEntities(titleMatch ? titleMatch[1] : slug.replace(/-/g, ' '));

        const coverMatch = inner.match(/<source\s+srcset=\"([^\"]+)\"/i) ||
                           inner.match(/<img\s+src=\"([^\"]+)\"/i);
        const coverUrl = coverMatch ? coverMatch[1] : `https://temp.compsci88.com/cover/normal/${externalId}.webp`;

        list.push({
          id: `mr_${this.sourceId}_${externalId}`,
          title,
          altTitles: [],
          coverUrl,
          synopsis: 'Disponível no WeebCentral.',
          authors: ['Autor Desconhecido'],
          artists: ['Artista Desconhecido'],
          genres: ['Mangá'],
          status: 'ongoing',
          publicationInfo: { country: 'Japão' },
          sources: [
            {
              sourceId: this.sourceId,
              externalId,
              url: `https://weebcentral.com/series/${externalId}/${slug}`,
              sourceName: this.sourceName
            }
          ],
          updatedAt: new Date().toISOString()
        });
      }

      return list;
    } catch {
      return [];
    }
  }

  /**
   * Retrieve popular manga list
   */
  async getPopular(options?: SourceSearchOptions): Promise<Manga[]> {
    const res = await this.search('', options);
    return res.mangaList;
  }

  /**
   * Get detailed manga metadata
   */
  async getMangaDetails(externalId: string): Promise<Manga | null> {
    const cached = this.detailsCache.get(externalId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/series/${externalId}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent
        }
      });

      if (!res.ok) return null;

      const html = await res.text();

      // Title
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = decodeHtmlEntities(titleMatch ? titleMatch[1] : externalId);

      // Cover
      const coverMatch = html.match(/<source\s+srcset=\"([^\"]+)\"[^>]*type=\"image\/webp\"/i) ||
                         html.match(/<img\s+src=\"([^\"]+)\"[^>]*alt=\"[^\"]*cover\"/i);
      const coverUrl = coverMatch ? coverMatch[1] : `https://temp.compsci88.com/cover/normal/${externalId}.webp`;

      // Synopsis / Description
      const descMatch = html.match(/<p class=\"whitespace-pre-wrap break-words\">([\s\S]*?)<\/p>/i);
      const synopsis = decodeHtmlEntities(descMatch ? descMatch[1] : 'Sinopse não disponível.');

      // Authors
      const authorMatch = html.match(/<strong[^>]*>Author\(s\):[^<]*<\/strong>([\s\S]*?)<\/li>/i);
      const authors: string[] = [];
      if (authorMatch) {
        const links = [...authorMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
        for (const l of links) {
          const a = decodeHtmlEntities(l[1]);
          if (a) authors.push(a);
        }
      }

      // Status
      const statusMatch = html.match(/<strong[^>]*>Status:[^<]*<\/strong>\s*<a[^>]*>([^<]+)<\/a>/i);
      const rawStatus = (statusMatch ? statusMatch[1].trim().toLowerCase() : '');
      let status: MangaStatus = 'ongoing';
      if (rawStatus.includes('complete')) status = 'completed';
      else if (rawStatus.includes('hiatus')) status = 'hiatus';
      else if (rawStatus.includes('cancel')) status = 'cancelled';

      // Year / Released
      const yearMatch = html.match(/<strong[^>]*>(?:Released|Year):?[^<]*<\/strong>\s*(?:<a[^>]*>|<span[^>]*>)?\s*(\d{4})/i);
      const releaseYear = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

      // Tags
      const tagsMatch = html.match(/<strong[^>]*>Tags?\(s\):[^<]*<\/strong>([\s\S]*?)<\/li>/i);
      const genres: string[] = [];
      if (tagsMatch) {
        const tagLinks = [...tagsMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
        for (const tl of tagLinks) {
          const g = decodeHtmlEntities(tl[1]);
          if (g && !genres.includes(g)) genres.push(g);
        }
      }

      // Demographic
      let demographic: string | undefined;
      if (genres.includes('Shounen')) demographic = 'Shounen';
      else if (genres.includes('Seinen')) demographic = 'Seinen';
      else if (genres.includes('Shoujo')) demographic = 'Shoujo';
      else if (genres.includes('Josei')) demographic = 'Josei';

      const isAdult = genres.some(g => /adult|hentai|smut|erotica/i.test(g));
      const isSuggestive = genres.some(g => /ecchi|mature/i.test(g));
      const contentRating: 'safe' | 'suggestive' | 'erotica' | 'pornographic' = isAdult
        ? 'pornographic'
        : (isSuggestive ? 'suggestive' : 'safe');

      const manga: Manga = {
        id: `mr_${this.sourceId}_${externalId}`,
        title,
        altTitles: [],
        coverUrl,
        synopsis,
        authors: authors.length > 0 ? authors : ['Autor Desconhecido'],
        artists: authors.length > 0 ? authors : ['Artista Desconhecido'],
        genres: genres.length > 0 ? genres : ['Mangá'],
        status,
        publicationInfo: {
          releaseYear,
          country: 'Japão',
          demographic
        },
        sources: [
          {
            sourceId: this.sourceId,
            externalId,
            url,
            sourceName: this.sourceName
          }
        ],
        updatedAt: new Date().toISOString(),
        contentRating,
        isAdult,
        hasAvailableChapters: true,
        availabilityStatus: 'available'
      };

      this.detailsCache.set(externalId, { data: manga, timestamp: Date.now() });
      return manga;
    } catch (err) {
      console.error(`[WeebCentral] Erro ao carregar detalhes de ${externalId}:`, (err as Error).message);
      return null;
    }
  }

  /**
   * Get all chapters for a manga
   */
  async getChapters(externalMangaId: string, _language?: string): Promise<Chapter[]> {
    const cached = this.chaptersCache.get(externalMangaId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/series/${externalMangaId}/full-chapter-list`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'HX-Request': 'true'
        }
      });

      if (!res.ok) return [];

      const html = await res.text();
      const chapterLinks = [...html.matchAll(/<a[^>]+href=\"([^\"]*chapters\/([A-Z0-9]+))\"[^>]*>([\s\S]*?)<\/a>/gi)];
      const chapters: Chapter[] = [];

      for (const cl of chapterLinks) {
        const externalChapterId = cl[2];
        const inner = cl[3];

        const titleSpanMatch = inner.match(/<span class=\"\">([^<]+)<\/span>/i);
        const rawTitle = titleSpanMatch ? decodeHtmlEntities(titleSpanMatch[1]) : '';

        // Extract chapter number
        let chapterNumber = '1';
        const numMatch = rawTitle.match(/Chapter\s+([\d.]+)/i) ||
                         rawTitle.match(/Episode\s+([\d.]+)/i) ||
                         rawTitle.match(/Volume\s+([\d.]+)/i) ||
                         rawTitle.match(/(\d+(?:\.\d+)?)/);
        if (numMatch) {
          chapterNumber = numMatch[1];
        }

        const timeMatch = inner.match(/datetime=\"([^\"]+)\"/i);
        const releaseDate = timeMatch ? timeMatch[1] : undefined;

        chapters.push({
          id: `ch_${this.sourceId}_${externalMangaId}_${externalChapterId}`,
          mangaId: `mr_${this.sourceId}_${externalMangaId}`,
          chapterNumber,
          title: rawTitle || `Capítulo ${chapterNumber}`,
          releaseDate,
          language: 'en',
          sourceId: this.sourceId,
          externalChapterId
        });
      }

      this.chaptersCache.set(externalMangaId, { data: chapters, timestamp: Date.now() });
      return chapters;
    } catch (err) {
      console.error(`[WeebCentral] Erro ao carregar capítulos de ${externalMangaId}:`, (err as Error).message);
      return [];
    }
  }

  /**
   * Get pages for a chapter
   */
  async getChapterPages(externalChapterId: string): Promise<MangaPage[]> {
    try {
      const url = `${this.baseUrl}/chapters/${externalChapterId}/images?is_prev=False`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'HX-Request': 'true'
        }
      });

      if (!res.ok) return [];

      const html = await res.text();
      const imgMatches = [...html.matchAll(/<img[^>]+src=\"([^\"]+)\"[^>]*>/gi)];
      const pages: MangaPage[] = [];

      let pageNum = 1;
      for (const m of imgMatches) {
        const src = m[1];
        // Filter out static icons or non-manga graphics
        if (src.includes('/static/images/') || src.includes('broken_image') || src.includes('favicon')) {
          continue;
        }

        pages.push({
          pageNumber: pageNum++,
          imageUrl: src
        });
      }

      return pages;
    } catch (err) {
      console.error(`[WeebCentral] Erro ao carregar páginas do capítulo ${externalChapterId}:`, (err as Error).message);
      return [];
    }
  }
}
