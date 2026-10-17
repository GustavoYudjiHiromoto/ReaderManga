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

  if (lower.includes('seinen')) demographic = 'Seinen';
  else if (lower.includes('shounen') || lower.includes('shonen')) demographic = 'Shounen';
  else if (lower.includes('shoujo') || lower.includes('shojo')) demographic = 'Shoujo';
  else if (lower.includes('josei')) demographic = 'Josei';

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

export class MangaPillProvider implements IMangaSource {
  private readonly baseUrl = 'https://mangapill.com';
  private readonly sourceId = 'mangapill';
  private readonly sourceName = 'MangaPill';

  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  private detailsCache: Map<string, { data: Manga; timestamp: number }> = new Map();
  private chaptersCache: Map<string, { data: Chapter[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
        multipleLanguages: false
      }
    };
  }

  private async fetchWithTimeout(url: string, timeoutMs = 9000): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
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

      return await response.text();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw new HttpError(504, 'Tempo limite de comunicação esgotado com o MangaPill (Gateway Timeout).');
      }
      throw new HttpError(502, `Erro ao conectar com o MangaPill: ${(err as Error).message}`);
    } finally {
      clearTimeout(timeout);
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
        coverUrl,
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
    try {
      const q = (query || '').trim();
      const page = options?.page || 1;
      let url: string;

      const genre = options?.genre && options.genre !== 'all' ? options.genre : null;

      if (q && genre) {
        url = `${this.baseUrl}/search?q=${encodeURIComponent(q)}&genre=${encodeURIComponent(genre)}&page=${page}`;
      } else if (q) {
        url = `${this.baseUrl}/search?q=${encodeURIComponent(q)}&page=${page}`;
      } else if (genre) {
        url = `${this.baseUrl}/search?genre=${encodeURIComponent(genre)}&page=${page}`;
      } else {
        url = `${this.baseUrl}/mangas/new?page=${page}`;
      }

      const html = await this.fetchWithTimeout(url);
      let mangaList = this.parseMangaCards(html);

      // Filter adult if includeAdult is false
      if (!options?.includeAdult) {
        mangaList = mangaList.filter(m => !m.isAdult);
      }

      // Filter availability
      if (options?.onlyAvailable) {
        mangaList = mangaList.filter(m => m.hasAvailableChapters);
      }

      const limit = options?.limit || 24;
      const offset = options?.offset || 0;
      const sliced = mangaList.slice(offset, offset + limit);

      return {
        mangaList: sliced,
        total: mangaList.length,
        hasMore: offset + limit < mangaList.length
      };
    } catch (err) {
      console.warn(`[MangaPillProvider] search failed:`, (err as Error).message);
      return { mangaList: [], total: 0, hasMore: false };
    }
  }

  async getPopular(options?: SourceSearchOptions): Promise<Manga[]> {
    try {
      const page = options?.page || 1;
      const genre = options?.genre && options.genre !== 'all' ? options.genre : null;
      const url = genre
        ? `${this.baseUrl}/search?genre=${encodeURIComponent(genre)}&page=${page}`
        : `${this.baseUrl}/mangas/new?page=${page}`;

      const html = await this.fetchWithTimeout(url);
      let mangaList = this.parseMangaCards(html);

      if (!options?.includeAdult) {
        mangaList = mangaList.filter(m => !m.isAdult);
      }

      if (options?.onlyAvailable) {
        mangaList = mangaList.filter(m => m.hasAvailableChapters);
      }

      const limit = options?.limit || 24;
      const offset = options?.offset || 0;
      return mangaList.slice(offset, offset + limit);
    } catch (err) {
      console.warn(`[MangaPillProvider] getPopular failed:`, (err as Error).message);
      return [];
    }
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
      const coverUrl = coverMatch ? coverMatch[1].trim() : '';

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
      console.warn(`[MangaPillProvider] getMangaDetails failed for ${externalId}:`, (err as Error).message);
      return null;
    }
  }

  async getChapters(externalMangaId: string, language?: string): Promise<Chapter[]> {
    // MangaPill only provides English scanlations
    if (language && !['en', 'en-us', 'all'].includes(language.toLowerCase().trim())) {
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
      console.warn(`[MangaPillProvider] getChapters failed for ${externalMangaId}:`, (err as Error).message);
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
            imageUrl
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
              imageUrl
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
