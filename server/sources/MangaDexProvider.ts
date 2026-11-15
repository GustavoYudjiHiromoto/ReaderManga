import { IMangaSource, SourceSearchOptions, SourceSearchResult } from './IMangaSource.js';
import { Manga, Chapter, MangaPage, MangaSourceInfo } from '../../src/types/manga.js';
import { HttpError } from '../errors/HttpError.js';

function formatProxyUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('/api/proxy/image')) return rawUrl;
  return `/api/proxy/image?url=${encodeURIComponent(rawUrl)}`;
}

export class MangaDexProvider implements IMangaSource {
  private readonly baseUrl = 'https://api.mangadex.org';
  private readonly sourceId = 'mangadex';
  private readonly sourceName = 'MangaDex (Live API)';

  getInfo(): MangaSourceInfo {
    return {
      id: this.sourceId,
      name: this.sourceName,
      description: 'API aberta e global com milhões de títulos comunitários e scans oficiais em múltiplos idiomas.',
      version: '5.0.0',
      isAvailable: true,
      type: 'live_api',
      websiteUrl: 'https://mangadex.org',
      supportedFeatures: {
        search: true,
        filters: true,
        coverImages: true,
        multipleLanguages: true,
        chaptersDeduplication: true,
        webtoons: true,
        nsfwFilter: true
      },
      iconColor: '#f97316',
      badge: 'API Oficial Global',
      languages: ['PT-BR', 'EN', 'JA', 'ES', 'FR'],
      catalogEstimate: '+65.000 títulos'
    };
  }

  private async fetchWithTimeout(url: string, timeoutMs = 7000): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'MangaReader-App/1.0.0 (https://github.com/aistudio-build)'
        }
      });
      if (!response.ok) {
        if (response.status === 404) {
          throw new HttpError(404, `Recurso não encontrado na API MangaDex (HTTP 404).`);
        }
        if (response.status === 429) {
          throw new HttpError(429, `Limite de requisições excedido na API MangaDex (Rate limit 429). Aguarde alguns instantes.`);
        }
        if (response.status === 503) {
          throw new HttpError(503, `Serviço MangaDex temporariamente indisponível (HTTP 503).`);
        }
        if (response.status === 502 || response.status >= 500) {
          throw new HttpError(502, `Falha no provedor externo MangaDex: HTTP ${response.status} ${response.statusText}`);
        }
        throw new HttpError(502, `Falha de comunicação com a API MangaDex: HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw new HttpError(504, 'Tempo limite de comunicação esgotado com a API MangaDex (Gateway Timeout).');
      }
      throw new HttpError(502, `Erro ao conectar com a API MangaDex: ${(err as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeMangaDexItem(item: any): Manga {
    const attrs = item.attributes || {};
    const title = attrs.title?.en || attrs.title?.ja || attrs.title?.['ja-ro'] || Object.values(attrs.title || {})[0] || 'Sem Título';
    
    // Alt titles
    const altTitles: string[] = [];
    if (Array.isArray(attrs.altTitles)) {
      for (const altObj of attrs.altTitles) {
        const val = Object.values(altObj)[0] as string;
        if (val && !altTitles.includes(val)) {
          altTitles.push(val);
        }
      }
    }

    // Cover art relationship
    let coverFileName = '';
    let authorName = '';
    let artistName = '';

    if (Array.isArray(item.relationships)) {
      for (const rel of item.relationships) {
        if (rel.type === 'cover_art' && rel.attributes?.fileName) {
          coverFileName = rel.attributes.fileName;
        } else if (rel.type === 'author' && rel.attributes?.name) {
          authorName = rel.attributes.name;
        } else if (rel.type === 'artist' && rel.attributes?.name) {
          artistName = rel.attributes.name;
        }
      }
    }

    const coverUrl = coverFileName
      ? formatProxyUrl(`https://uploads.mangadex.org/covers/${item.id}/${coverFileName}.512.jpg`)
      : 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80';

    // Genres / tags (include genre, theme, and format groups for rich trope filtering like Isekai, Villainess, Reincarnation, etc.)
    const genres: string[] = [];
    if (Array.isArray(attrs.tags)) {
      for (const tag of attrs.tags) {
        const tagName = tag.attributes?.name?.en;
        const group = tag.attributes?.group;
        if (tagName && (group === 'genre' || group === 'theme' || group === 'format')) {
          genres.push(tagName);
        }
      }
    }

    // Synopsis
    const synopsis = attrs.description?.['pt-br'] || attrs.description?.en || Object.values(attrs.description || {})[0] || 'Sinopse não disponível.';

    // Status mapping
    let status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled' = 'ongoing';
    if (attrs.status === 'completed') status = 'completed';
    else if (attrs.status === 'hiatus') status = 'hiatus';
    else if (attrs.status === 'cancelled') status = 'cancelled';

    // Content rating and adult content detection
    const rawRating = attrs.contentRating as string;
    let contentRating: 'safe' | 'suggestive' | 'erotica' | 'pornographic' = 'safe';
    if (rawRating === 'pornographic') contentRating = 'pornographic';
    else if (rawRating === 'erotica') contentRating = 'erotica';
    else if (rawRating === 'suggestive') contentRating = 'suggestive';

    const allTagNames = Array.isArray(attrs.tags)
      ? attrs.tags.map((t: any) => t.attributes?.name?.en).filter(Boolean)
      : [];
    const hasAdultTag = allTagNames.some((t: string) => /hentai|erotica|smut|sexual violence/i.test(t));
    const isAdult = contentRating === 'pornographic' || contentRating === 'erotica' || hasAdultTag;

    // Availability detection:
    // A work on MangaDex is readable if it has uploaded chapters in available languages
    const hasAvailableChapters = Boolean(
      attrs.latestUploadedChapter &&
      Array.isArray(attrs.availableTranslatedLanguages) &&
      attrs.availableTranslatedLanguages.length > 0
    );
    const availabilityStatus = hasAvailableChapters ? 'available' : 'metadata_only';

    return {
      id: `mr_${this.sourceId}_${item.id}`,
      title,
      altTitles: altTitles.slice(0, 5),
      coverUrl,
      synopsis,
      authors: authorName ? [authorName] : ['Autor Desconhecido'],
      artists: artistName ? [artistName] : (authorName ? [authorName] : ['Artista Desconhecido']),
      genres: genres.length > 0 ? genres : ['Manga'],
      status,
      publicationInfo: {
        releaseYear: attrs.year || undefined,
        country: attrs.originalLanguage?.toUpperCase(),
        demographic: attrs.publicationDemographic ? String(attrs.publicationDemographic).toLowerCase() : undefined
      },
      sources: [
        {
          sourceId: this.sourceId,
          sourceName: this.sourceName,
          externalId: item.id,
          url: `https://mangadex.org/title/${item.id}`
        }
      ],
      latestChapter: attrs.lastChapter || undefined,
      updatedAt: attrs.updatedAt || new Date().toISOString(),
      contentRating,
      isAdult,
      hasAvailableChapters,
      availabilityStatus,
      availableLanguages: Array.isArray(attrs.availableTranslatedLanguages)
        ? attrs.availableTranslatedLanguages.map((l: string) => String(l).toLowerCase())
        : undefined
    };
  }

  private static dynamicTagMap: Record<string, string> | null = null;
  private static dynamicTagFetchPromise: Promise<Record<string, string>> | null = null;

  private static readonly GENRE_MAP: Record<string, string> = {
    // Tropes & Subgêneros (Temas Oficiais MangaDex)
    'time travel': '292e862b-2d17-4062-90a2-0356caa4ae27',
    'regression': '292e862b-2d17-4062-90a2-0356caa4ae27',
    'regressão / tempo': '292e862b-2d17-4062-90a2-0356caa4ae27',
    'regressao / tempo': '292e862b-2d17-4062-90a2-0356caa4ae27',
    'viagem no tempo': '292e862b-2d17-4062-90a2-0356caa4ae27',
    'isekai': 'ace04997-f6bd-436e-b261-779182193d3d',
    'reincarnation': '0bc90acb-ccc1-44ca-a34a-b9f3a73259d0',
    'reencarnação': '0bc90acb-ccc1-44ca-a34a-b9f3a73259d0',
    'reencarnacao': '0bc90acb-ccc1-44ca-a34a-b9f3a73259d0',
    'villainess': 'd14322ac-4d6f-4e9b-afd9-629d5f4d8a41',
    'vilã (villainess)': 'd14322ac-4d6f-4e9b-afd9-629d5f4d8a41',
    'vilã': 'd14322ac-4d6f-4e9b-afd9-629d5f4d8a41',
    'vila': 'd14322ac-4d6f-4e9b-afd9-629d5f4d8a41',
    'survival': '5fff9cde-849c-4d78-aab0-0d52b2ee1d25',
    'sobrevivência': '5fff9cde-849c-4d78-aab0-0d52b2ee1d25',
    'sobrevivencia': '5fff9cde-849c-4d78-aab0-0d52b2ee1d25',
    'psychological': '3b60b75c-a2d7-4860-ab56-05f391bb889c',
    'psicológico': '3b60b75c-a2d7-4860-ab56-05f391bb889c',
    'psicologico': '3b60b75c-a2d7-4860-ab56-05f391bb889c',
    'reverse harem': '65761a2a-415e-47f3-bef2-a9dababba7a6',
    'harem invertido': '65761a2a-415e-47f3-bef2-a9dababba7a6',
    'harem': 'aafb99c1-7f60-43fa-b75f-fc9502ce29c7',
    'martial arts': '799c202e-7daa-44eb-9cf7-8a3c0441531e',
    'artes marciais': '799c202e-7daa-44eb-9cf7-8a3c0441531e',
    'wuxia': 'acc803a4-c95a-4c22-86fc-eb6b582d82a2',
    'cultivação / murim': 'acc803a4-c95a-4c22-86fc-eb6b582d82a2',
    'cultivacao / murim': 'acc803a4-c95a-4c22-86fc-eb6b582d82a2',
    'murim': 'acc803a4-c95a-4c22-86fc-eb6b582d82a2',
    'magic': 'a1f53773-c69a-4ce5-8cab-fffcd90b1565',
    'magia': 'a1f53773-c69a-4ce5-8cab-fffcd90b1565',
    'monsters': '36fd93ea-e8b8-445e-b836-358f02b3d33d',
    'monstros': '36fd93ea-e8b8-445e-b836-358f02b3d33d',
    'domador de monstros': '36fd93ea-e8b8-445e-b836-358f02b3d33d',
    'monster girls': 'dd1f77c5-dea9-4e2b-97ae-224af09caf99',
    'school life': 'caaa44eb-cd40-4177-b930-79d3ef2afe87',
    'romance colegial': 'caaa44eb-cd40-4177-b930-79d3ef2afe87',
    'video games': '9438db5a-7e2a-4ac0-b39e-e0d95a34b8a8',
    'virtual reality': '8c86611e-fab7-4986-9dec-d1a2f44acdd5',
    'post-apocalyptic': '9467335a-1b83-4497-9231-765337a00b96',
    'vampires': 'd7d1730f-6eb0-4ba6-9437-602cac38664c',
    'demons': '39730448-9a5f-48a2-85b0-a70db87b1233',
    'zombies': '631ef465-9aba-4afb-b0fc-ea10efe274a8',
    'delinquents': 'da2d50ca-3018-4cc0-ac7a-6b7d472a29ea',
    'office workers': '92d6d951-ca5e-429c-ac78-451071cbf064',
    'workplace': '92d6d951-ca5e-429c-ac78-451071cbf064',
    'gyaru': 'fad12b5e-68ba-460e-b933-9ae8318f5b65',
    'cooking': 'ea2bc92d-1c26-4930-9b7c-d5c0dc1b6869',
    'medical': 'c8cbe35b-1b2b-4a3f-9c37-db84c4514856',
    'music': 'f42fbf9e-188a-447b-9fdc-f19dc1e4d685',
    'crossdressing': '9ab53f92-3eed-4e9b-903a-917c86035ee3',
    'genderswap': '2bd2e8d0-f146-434a-9b51-fc9ff2c5fe6a',
    'mafia': '85daba54-a71c-4554-8a28-9901a8b0afad',
    'military': 'ac72833b-c4e9-4878-b9db-6c8a4a99444a',
    'police': 'df33b754-73a3-4c54-80e6-1a74a8058539',

    // Gêneros Tradicionais
    'ação': '391b0423-d847-456f-aff0-8b0cfc03066b',
    'acao': '391b0423-d847-456f-aff0-8b0cfc03066b',
    'action': '391b0423-d847-456f-aff0-8b0cfc03066b',
    'fantasia': 'cdc58593-87dd-415e-bbc0-2ec27bf404cc',
    'fantasy': 'cdc58593-87dd-415e-bbc0-2ec27bf404cc',
    'comédia': '4d32cc48-9f00-4cca-9b5a-a839f0764984',
    'comedia': '4d32cc48-9f00-4cca-9b5a-a839f0764984',
    'comedy': '4d32cc48-9f00-4cca-9b5a-a839f0764984',
    'aventura': '87cc87cd-a395-47af-b27a-93258283bbc6',
    'adventure': '87cc87cd-a395-47af-b27a-93258283bbc6',
    'drama': 'b9af3a63-f058-46de-a9a0-e0c13906197a',
    'sobrenatural': 'eabc5b4c-6aff-42f3-b657-3e90cbd00b75',
    'supernatural': 'eabc5b4c-6aff-42f3-b657-3e90cbd00b75',
    'histórico': '33771934-028e-4cb3-8744-691e866a923e',
    'historico': '33771934-028e-4cb3-8744-691e866a923e',
    'historical': '33771934-028e-4cb3-8744-691e866a923e',
    'horror': 'cdad7e68-1419-41dd-bdce-27753074a640',
    'terror': 'cdad7e68-1419-41dd-bdce-27753074a640',
    'sci-fi': '256c8bd9-4904-4360-bf4f-508a76d67183',
    'ficção científica': '256c8bd9-4904-4360-bf4f-508a76d67183',
    'romance': '423e2eae-a7a2-4a8b-ac03-a8351462d71d',
    'mistério': 'ee968100-4191-4968-93d3-f82d72be7e46',
    'misterio': 'ee968100-4191-4968-93d3-f82d72be7e46',
    'mystery': 'ee968100-4191-4968-93d3-f82d72be7e46',
    'slice of life': 'e5301a23-ebd9-49dd-a0cb-2add944c7fe9',
    'cotidiano': 'e5301a23-ebd9-49dd-a0cb-2add944c7fe9',
    'sports': '69964a64-2f90-4d33-beeb-f3ed2875eb4c',
    'esportes': '69964a64-2f90-4d33-beeb-f3ed2875eb4c'
  };

  private static readonly KEYWORD_FALLBACKS: Record<string, string> = {
    'overpower (op)': 'overpowered',
    'overpower': 'overpowered',
    'yandere': 'yandere',
    'tomboy': 'tomboy',
    'construção de vila': 'village',
    'construção de vila / reino': 'village',
    'fazenda / agricultura': 'farming',
    'dungeon / sistema': 'dungeon',
    'domador de monstros': 'tamer',
    'vingança': 'revenge'
  };

  private async ensureDynamicTagsLoaded(): Promise<Record<string, string>> {
    if (MangaDexProvider.dynamicTagMap) return MangaDexProvider.dynamicTagMap;
    if (!MangaDexProvider.dynamicTagFetchPromise) {
      MangaDexProvider.dynamicTagFetchPromise = (async () => {
        const merged: Record<string, string> = { ...MangaDexProvider.GENRE_MAP };
        try {
          const res = await this.fetchWithTimeout(`${this.baseUrl}/manga/tag`, 4000);
          if (Array.isArray(res?.data)) {
            for (const t of res.data) {
              const name = t?.attributes?.name?.en;
              if (name && t?.id) {
                merged[String(name).toLowerCase()] = String(t.id);
              }
            }
          }
        } catch {
          // fallback cleanly to static GENRE_MAP
        }
        MangaDexProvider.dynamicTagMap = merged;
        return merged;
      })();
    }
    return MangaDexProvider.dynamicTagFetchPromise;
  }

  async search(query: string, options?: SourceSearchOptions): Promise<SourceSearchResult> {
    try {
      const limit = Math.min(options?.limit || 24, 60);
      const offset = options?.offset || (options?.page ? (options.page - 1) * limit : 0);
      const orderParam = query.trim() ? 'order[relevance]=desc' : 'order[followedCount]=desc';

      const requestedTagList = [
        ...(options?.genre && options.genre !== 'all' ? [options.genre] : []),
        ...(Array.isArray(options?.genres) ? options.genres : [])
      ];
      const wantsSuggestiveOnly = requestedTagList.some(g => g.toLowerCase() === 'ecchi');

      const ratingsQuery = options?.includeAdult
        ? 'contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic'
        : wantsSuggestiveOnly
        ? 'contentRating[]=suggestive'
        : 'contentRating[]=safe&contentRating[]=suggestive';
      const availableParam = options?.onlyAvailable !== false ? '&hasAvailableChapters=true' : '';
      let url = `${this.baseUrl}/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&includes[]=artist&${ratingsQuery}&${orderParam}${availableParam}`;
      
      let effectiveQuery = query.trim();
      if (!effectiveQuery && options?.genres) {
        for (const g of options.genres) {
          const kw = MangaDexProvider.KEYWORD_FALLBACKS[g.toLowerCase()];
          if (kw) {
            effectiveQuery = kw;
            break;
          }
        }
      }

      if (effectiveQuery) {
        url += `&title=${encodeURIComponent(effectiveQuery)}`;
      }

      const tagMap = await this.ensureDynamicTagsLoaded();
      const tagsToInclude = new Set<string>();
      for (const rawTag of requestedTagList) {
        const lower = rawTag.toLowerCase().trim();
        if (!lower || lower === 'ecchi') continue;
        const tagId = tagMap[lower];
        if (tagId) tagsToInclude.add(tagId);
      }
      if (tagsToInclude.size > 0) {
        for (const tagId of tagsToInclude) {
          url += `&includedTags[]=${encodeURIComponent(tagId)}`;
        }
        if (tagsToInclude.size > 1) {
          url += '&includedTagsMode=AND';
        }
      }

      if (options?.demographic && options.demographic !== 'all') {
        const demo = options.demographic.toLowerCase();
        if (['shounen', 'shoujo', 'seinen', 'josei'].includes(demo)) {
          url += `&publicationDemographic[]=${encodeURIComponent(demo)}`;
        }
      }

      if (options?.status && options.status !== 'all') {
        const st = options.status.toLowerCase();
        if (['ongoing', 'completed', 'hiatus', 'cancelled'].includes(st)) {
          url += `&status[]=${encodeURIComponent(st)}`;
        }
      }

      if (options?.type && options.type !== 'all') {
        const t = options.type.toLowerCase();
        if (t === 'manga') url += '&originalLanguage[]=ja';
        else if (t === 'manhwa') url += '&originalLanguage[]=ko';
        else if (t === 'manhua') url += '&originalLanguage[]=zh&originalLanguage[]=zh-hk';
        else if (t === 'comic') url += '&originalLanguage[]=en';
      }

      if (options?.language && options.language !== 'all') {
        const langParts = options.language.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        const mdLangs = new Set<string>();
        for (const lp of langParts) {
          if (lp === 'pt-br' || lp === 'pt') {
            mdLangs.add('pt-br');
            mdLangs.add('pt');
          } else {
            mdLangs.add(lp);
          }
        }
        for (const ml of mdLangs) {
          url += `&availableTranslatedLanguage[]=${encodeURIComponent(ml)}`;
        }
      }

      const res = await this.fetchWithTimeout(url);
      const list = Array.isArray(res.data) ? res.data : [];
      let mangaList: Manga[] = list.map((item: any) => this.normalizeMangaDexItem(item));

      // Filter adult if includeAdult is false (secondary safety check on tags)
      if (!options?.includeAdult) {
        mangaList = mangaList.filter((m: Manga) => !m.isAdult);
      }

      // Filter onlyAvailable if requested
      if (options?.onlyAvailable) {
        mangaList = mangaList.filter((m: Manga) => m.hasAvailableChapters);
      }

      return {
        mangaList,
        total: res.total || mangaList.length,
        hasMore: (offset + limit) < (res.total || 0)
      };
    } catch (err) {
      console.warn(`[MangaDexProvider] search failed:`, (err as Error).message);
      return { mangaList: [], total: 0, hasMore: false };
    }
  }

  async getPopular(options?: SourceSearchOptions): Promise<Manga[]> {
    try {
      const limit = Math.min(options?.limit || 24, 60);
      const offset = options?.offset || (options?.page ? (options.page - 1) * limit : 0);
      const ratingsQuery = options?.includeAdult
        ? 'contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic'
        : 'contentRating[]=safe&contentRating[]=suggestive';
      const availableParam = options?.onlyAvailable !== false ? '&hasAvailableChapters=true' : '';
      let url = `${this.baseUrl}/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&includes[]=artist&${ratingsQuery}&order[followedCount]=desc${availableParam}`;

      if (options?.genre && options.genre !== 'all') {
        const tagId = MangaDexProvider.GENRE_MAP[options.genre.toLowerCase()];
        if (tagId) {
          url += `&includedTags[]=${encodeURIComponent(tagId)}`;
        }
      }

      const res = await this.fetchWithTimeout(url);
      const list = Array.isArray(res.data) ? res.data : [];
      let mangaList: Manga[] = list.map((item: any) => this.normalizeMangaDexItem(item));

      if (!options?.includeAdult) {
        mangaList = mangaList.filter((m: Manga) => !m.isAdult);
      }

      if (options?.onlyAvailable) {
        mangaList = mangaList.filter((m: Manga) => m.hasAvailableChapters);
      }

      return mangaList;
    } catch (err) {
      console.warn(`[MangaDexProvider] getPopular failed:`, (err as Error).message);
      return [];
    }
  }

  async getMangaDetails(externalId: string): Promise<Manga | null> {
    try {
      const url = `${this.baseUrl}/manga/${externalId}?includes[]=cover_art&includes[]=author&includes[]=artist`;
      const res = await this.fetchWithTimeout(url);
      if (!res.data) return null;
      return this.normalizeMangaDexItem(res.data);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      if (err instanceof HttpError) throw err;
      console.warn(`[MangaDexProvider] getMangaDetails failed for ${externalId}:`, (err as Error).message);
      return null;
    }
  }

  async getChapters(externalMangaId: string, language?: string): Promise<Chapter[]> {
    try {
      const PAGE_LIMIT = 500;
      const MAX_TOTAL = 4000;
      const buildUrl = (langQuery: string, offset = 0) =>
        `${this.baseUrl}/manga/${externalMangaId}/feed?order[chapter]=desc&limit=${PAGE_LIMIT}&offset=${offset}&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&includes[]=scanlation_group${langQuery}`;

      const fetchAllOffsets = async (langQuery: string): Promise<any[]> => {
        const res = await this.fetchWithTimeout(buildUrl(langQuery, 0));
        let collected = Array.isArray(res.data) ? [...res.data] : [];
        if (res.total > PAGE_LIMIT && collected.length === PAGE_LIMIT) {
          const totalToFetch = Math.min(res.total, MAX_TOTAL);
          const offsets: number[] = [];
          for (let o = PAGE_LIMIT; o < totalToFetch; o += PAGE_LIMIT) {
            offsets.push(o);
          }
          for (let i = 0; i < offsets.length; i += 4) {
            const batch = offsets.slice(i, i + 4);
            const extraPages = await Promise.all(
              batch.map(o => this.fetchWithTimeout(buildUrl(langQuery, o)).catch(() => ({ data: [] })))
            );
            for (const p of extraPages) {
              if (Array.isArray(p.data)) {
                collected = [...collected, ...p.data];
              }
            }
          }
        }
        return collected;
      };

      let langQuery = '';
      if (language) {
        langQuery = `&translatedLanguage[]=${encodeURIComponent(language)}`;
      } else {
        langQuery = '&translatedLanguage[]=pt-br&translatedLanguage[]=en';
      }

      let list = await fetchAllOffsets(langQuery);

      // Fallback: If no language was explicitly requested and preferred languages (pt-br, en) returned no chapters,
      // fetch chapters without language restriction so available translations are displayed instead of empty list
      if (!language && list.length === 0) {
        list = await fetchAllOffsets('');
      }

      // Filter out chapters hosted on external third-party sites (e.g. MangaPlus, Webnovel)
      // which have externalUrl set or 0 pages, as MangaDex does not host images for them.
      const readableList = list.filter((item: any) => {
        const attrs = item.attributes || {};
        return !attrs.externalUrl && (attrs.pages === undefined || attrs.pages === null || attrs.pages > 0);
      });

      return readableList.map((item: any) => {
        const attrs = item.attributes || {};
        const scanGroup = item.relationships?.find((r: any) => r.type === 'scanlation_group')?.attributes?.name;
        return {
          id: `ch_${this.sourceId}_${externalMangaId}_${item.id}`,
          mangaId: `mr_${this.sourceId}_${externalMangaId}`,
          chapterNumber: attrs.chapter || '1',
          volume: attrs.volume || undefined,
          title: attrs.title || undefined,
          releaseDate: attrs.publishAt ? attrs.publishAt.substring(0, 10) : undefined,
          language: attrs.translatedLanguage || 'en',
          sourceId: this.sourceId,
          externalChapterId: item.id,
          pagesCount: attrs.pages || undefined,
          scanlationGroup: scanGroup || undefined
        };
      });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error(`[MangaDexProvider] Erro ao buscar capítulos para ${externalMangaId}:`, (err as Error).message);
      throw new HttpError(502, `Falha ao obter capítulos da fonte MangaDex: ${(err as Error).message}`);
    }
  }

  async getChapterPages(externalChapterId: string): Promise<MangaPage[]> {
    try {
      const url = `${this.baseUrl}/at-home/server/${externalChapterId}`;
      const res = await this.fetchWithTimeout(url);
      if (!res.baseUrl || !res.chapter?.hash) {
        // If the chapter is external or has no hosted images, return empty list instead of throwing 502
        return [];
      }

      const { baseUrl, chapter } = res;
      // Prefer standard data or dataSaver
      const files: string[] = chapter.dataSaver && chapter.dataSaver.length > 0
        ? chapter.dataSaver
        : chapter.data;
      const subDir = chapter.dataSaver && chapter.dataSaver.length > 0 ? 'data-saver' : 'data';

      // Prefer permanent official MangaDex CDN (uploads.mangadex.org)
      // routed through /api/proxy/image to prevent 302 edge challenge blocks and CORS issues
      const cdnBase = 'https://uploads.mangadex.org';

      return files.map((fileName, index) => ({
        pageNumber: index + 1,
        imageUrl: formatProxyUrl(`${cdnBase}/${subDir}/${chapter.hash}/${fileName}`)
      }));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.warn(`[MangaDexProvider] getChapterPages failed for ${externalChapterId}:`, (err as Error).message);
      throw new HttpError(502, `Falha ao obter páginas do capítulo no MangaDex: ${(err as Error).message}`);
    }
  }
}
