import { IMangaSource, SourceSearchOptions, SourceSearchResult } from './IMangaSource.js';
import { Manga, Chapter, MangaPage, MangaSourceInfo, MangaStatus } from '../../src/types/manga.js';
import { decodeHtmlEntities } from '../../src/utils/htmlEntities.js';

export function parseWeebCentralAssociatedNames(html: string): string[] {
  if (!html) return [];
  const blockMatch = html.match(/<strong>\s*Associated Name\(s\)\s*<\/strong>\s*<ul[^>]*>([\s\S]*?)<\/ul>/i);
  if (!blockMatch) return [];

  const inner = blockMatch[1];
  const results: string[] = [];
  const liRegex = /<li[^>]*>([^<]+)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRegex.exec(inner)) !== null) {
    const cleaned = decodeHtmlEntities(m[1]);
    if (cleaned && !results.includes(cleaned)) {
      results.push(cleaned);
    }
  }
  return results.slice(0, 12);
}

function acceptsEnglishLanguage(language?: string): boolean {
  if (!language) return true;
  const tokens = language.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.some(t => t === 'all' || t === 'en' || t === 'en-us');
}

function mapWeebCentralTypeToCountry(rawType?: string, genresLower: string[] = []): string | undefined {
  const t = (rawType || '').toLowerCase().trim();
  if (t.includes('manhwa') || t.includes('webtoon') || t.includes('korean')) return 'KR';
  if (t.includes('manhua') || t.includes('chinese')) return 'CN';
  if (t.includes('oel') || t.includes('comic') || t.includes('western')) return 'US';
  if (t.includes('manga') || t.includes('one-shot') || t.includes('oneshot') || t.includes('doujinshi')) return 'JP';
  if (genresLower.includes('manhwa') || genresLower.includes('korean')) return 'KR';
  if (genresLower.includes('manhua') || genresLower.includes('chinese')) return 'CN';
  if (genresLower.includes('comic') || genresLower.includes('western')) return 'US';
  return undefined;
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
  'slice of life': 'Slice of Life',
  'isekai': 'Isekai',
  'time travel': 'Time Travel',
  'regression': 'Time Travel',
  'regressão / tempo': 'Time Travel',
  'regressao / tempo': 'Time Travel',
  'viagem no tempo': 'Time Travel',
  'reincarnation': 'Reincarnation',
  'reencarnação': 'Reincarnation',
  'reencarnacao': 'Reincarnation',
  'villainess': 'Villainess',
  'vilã (villainess)': 'Villainess',
  'vilã': 'Villainess',
  'vila': 'Villainess',
  'survival': 'Survival',
  'sobrevivência': 'Survival',
  'sobrevivencia': 'Survival',
  'martial arts': 'Martial Arts',
  'artes marciais': 'Martial Arts',
  'cultivação / murim': 'Martial Arts',
  'magic': 'Magic',
  'magia': 'Magic',
  'school life': 'School Life',
  'romance colegial': 'School Life',
  'harem': 'Harem',
  'reverse harem': 'Reverse Harem',
  'harem invertido': 'Reverse Harem',
  'tragedy': 'Tragedy',
  'tragédia / drama pesado': 'Tragedy',
  'thriller': 'Thriller',
  'suspense / thriller': 'Thriller',
  'gore': 'Gore',
  'gore / violência': 'Gore',
  'mecha': 'Mecha',
  'mecha / robôs': 'Mecha',
  'yaoi / bl': 'Yaoi',
  'yuri / gl': 'Yuri',
  'vampiros': 'Vampires',
  'samurai / espadachim': 'Samurai',
  'esportes': 'Sports',
  'sports': 'Sports',
  'esportes de combate': 'Sports',
  'esportes em equipe': 'Sports',
  'corrida / carros / drift': 'Sports',
  'oneshot (história única)': 'Oneshot',
  'oneshot': 'Oneshot',
  'militar / guerra': 'Military',
  'policial / detetive': 'Police',
  'cyberpunk / futurista': 'Sci-Fi',
  'pós-apocalíptico': 'Post-Apocalyptic',
  'super-heróis / poderes': 'Superhero',
  'garotas mágicas (mahou shoujo)': 'Mahou Shoujo',
  'culinária / gastronomia': 'Cooking',
  'médico / curandeiro': 'Medical',
  'música / artes': 'Music',
  'loop temporal': 'Time Travel',
  'reencarnado como monstro': 'Reincarnation',
  'crossdressing / trap': 'Crossdressing'
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
      version: '1.1.0',
      isAvailable: true,
      type: 'live_api',
      websiteUrl: 'https://weebcentral.com',
      supportedFeatures: {
        search: true,
        filters: true,
        coverImages: true,
        multipleLanguages: false,
        chaptersDeduplication: true,
        webtoons: true,
        nsfwFilter: false
      },
      iconColor: '#06b6d4',
      badge: 'Scans & Lançamentos',
      languages: ['EN'],
      catalogEstimate: '+35.000 títulos'
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
      const gLower = genres.map(g => g.toLowerCase());
      if (gLower.includes('shounen') || gLower.includes('shonen')) demographic = 'shounen';
      else if (gLower.includes('seinen')) demographic = 'seinen';
      else if (gLower.includes('shoujo') || gLower.includes('shojo')) demographic = 'shoujo';
      else if (gLower.includes('josei')) demographic = 'josei';

      // Country / Type detection (extract explicit Type: badge first so Manhwa/Manhua aren't falsely marked as JP)
      const typeMatch = articleHtml.match(/<strong[^>]*>\s*Type:?\s*<\/strong>\s*(?:<span[^>]*>|<a[^>]*>)?([^<]+)(?:<\/span>|<\/a>)?/i);
      const rawTypeText = typeMatch ? decodeHtmlEntities(typeMatch[1]).trim() : '';
      const country = mapWeebCentralTypeToCountry(rawTypeText, gLower);
      if (rawTypeText && (rawTypeText.toLowerCase().includes('manhwa') || rawTypeText.toLowerCase().includes('manhua')) && !genres.some(g => g.toLowerCase() === rawTypeText.toLowerCase())) {
        genres.push(rawTypeText);
      }

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
          ...(country ? { country } : {}),
          demographic
        },
        availableLanguages: ['en'],
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
    if (!acceptsEnglishLanguage(options?.language)) {
      return { mangaList: [], total: 0, hasMore: false };
    }

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

    let textQuery = trimmed;
    const KEYWORD_FALLBACKS: Record<string, string> = {
      'overpower (op)': 'overpowered',
      'overpower': 'overpowered',
      'yandere': 'yandere',
      'tomboy': 'tomboy',
      'gyaru': 'gyaru',
      'tsundere': 'tsundere',
      'kuudere / fria por fora': 'ice',
      'construção de vila': 'village',
      'construção de vila / reino': 'village',
      'fazenda / agricultura': 'farming',
      'dungeon / sistema': 'dungeon',
      'domador de monstros': 'tamer',
      'vingança': 'revenge',
      'expulso do grupo': 'banished',
      'lorde demônio / rei demônio': 'demon lord',
      'necromante / invocação': 'necromancer'
    };
    if (!textQuery && options?.genres) {
      for (const g of options.genres) {
        const kw = KEYWORD_FALLBACKS[g.toLowerCase()];
        if (kw) {
          textQuery = kw;
          break;
        }
      }
    }

    if (textQuery) {
      params.set('text', textQuery);
    }

    const tagsToSet = new Set<string>();
    if (options?.genre && options.genre !== 'all') {
      const lower = options.genre.toLowerCase();
      const mapped = GENRE_MAP[lower];
      if (mapped) tagsToSet.add(mapped);
    }
    if (Array.isArray(options?.genres)) {
      for (const g of options.genres) {
        const lower = g.toLowerCase();
        const mapped = GENRE_MAP[lower];
        if (mapped) tagsToSet.add(mapped);
      }
    }
    for (const tag of tagsToSet) {
      params.append('included_tag', tag);
    }

    const excludedTagsToSet = new Set<string>();
    if (Array.isArray(options?.excludedGenres)) {
      for (const eg of options.excludedGenres) {
        const lower = eg.toLowerCase().trim();
        const mapped = GENRE_MAP[lower];
        if (mapped) excludedTagsToSet.add(mapped);
        if (lower === 'fantasia' || lower === 'fantasy') {
          excludedTagsToSet.add('Magic');
        }
      }
    }
    for (const exTag of excludedTagsToSet) {
      params.append('excluded_tag', exTag);
    }

    if (options?.type && options.type !== 'all') {
      const t = options.type.toLowerCase();
      if (t === 'manga') params.append('included_type', 'Manga');
      else if (t === 'manhwa') params.append('included_type', 'Manhwa');
      else if (t === 'manhua') params.append('included_type', 'Manhua');
      else if (t === 'comic') params.append('included_type', 'OEL');
    }

    if (options?.status && options.status !== 'all') {
      const s = options.status.toLowerCase();
      if (s === 'ongoing') params.append('included_status', 'Ongoing');
      else if (s === 'completed') params.append('included_status', 'Complete');
      else if (s === 'hiatus') params.append('included_status', 'Hiatus');
      else if (s === 'cancelled') params.append('included_status', 'Canceled');
    }

    // If a genre/subgenre was requested without text query and neither mapped to a WeebCentral tag nor keyword fallback, return empty instead of unfiltered popular dump
    if (!textQuery && tagsToSet.size === 0 && ((options?.genre && options.genre !== 'all') || (options?.genres && options.genres.length > 0))) {
      return { mangaList: [], total: 0, hasMore: false };
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
      if (options?.type && options.type !== 'all') {
        const targetType = options.type.toLowerCase();
        finalResults = finalResults.filter(m => {
          const c = (m.publicationInfo?.country || '').toLowerCase();
          if (targetType === 'manga') return !c || c === 'jp';
          if (targetType === 'manhwa') return c === 'kr';
          if (targetType === 'manhua') return c === 'cn';
          if (targetType === 'comic') return c === 'us';
          return true;
        });
      }

      const hasRestrictiveFilters =
        tagsToSet.size > 0 ||
        excludedTagsToSet.size > 0 ||
        (Boolean(options?.type) && options?.type !== 'all') ||
        (Boolean(options?.status) && options?.status !== 'all');

      // Only use quick-search fallback for plain unfiltered title lookups
      if (finalResults.length === 0 && trimmed && !hasRestrictiveFilters) {
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
          publicationInfo: {},
          availableLanguages: ['en'],
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

      const typeMatch = html.match(/<strong[^>]*>\s*Type:?\s*<\/strong>[\s\S]*?(?:<a[^>]*>|<span[^>]*>)([^<]+)(?:<\/a>|<\/span>)/i);
      const rawTypeText = typeMatch ? decodeHtmlEntities(typeMatch[1]).trim() : '';
      const resolvedCountry = mapWeebCentralTypeToCountry(rawTypeText, genres.map(g => g.toLowerCase()));
      if (rawTypeText && (rawTypeText.toLowerCase().includes('manhwa') || rawTypeText.toLowerCase().includes('manhua')) && !genres.some(g => g.toLowerCase() === rawTypeText.toLowerCase())) {
        genres.push(rawTypeText);
      }

      const altTitles = parseWeebCentralAssociatedNames(html)
        .filter(a => a.toLowerCase() !== title.toLowerCase());

      const manga: Manga = {
        id: `mr_${this.sourceId}_${externalId}`,
        title,
        altTitles,
        coverUrl,
        synopsis,
        authors: authors.length > 0 ? authors : ['Autor Desconhecido'],
        artists: authors.length > 0 ? authors : ['Artista Desconhecido'],
        genres: genres.length > 0 ? genres : ['Mangá'],
        status,
        publicationInfo: {
          releaseYear,
          ...(resolvedCountry ? { country: resolvedCountry } : {}),
          demographic
        },
        availableLanguages: ['en'],
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
  async getChapters(externalMangaId: string, language?: string): Promise<Chapter[]> {
    if (!acceptsEnglishLanguage(language)) {
      return [];
    }

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
