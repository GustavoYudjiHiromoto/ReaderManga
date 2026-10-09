import { IMangaSource, SourceSearchOptions, SourceSearchResult } from './IMangaSource.js';
import { Manga, Chapter, MangaPage, MangaSourceInfo } from '../../src/types/manga.js';
import { HttpError } from '../errors/HttpError.js';

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
        multipleLanguages: true
      }
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
      ? `https://uploads.mangadex.org/covers/${item.id}/${coverFileName}.512.jpg`
      : 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80';

    // Genres / tags
    const genres: string[] = [];
    if (Array.isArray(attrs.tags)) {
      for (const tag of attrs.tags) {
        const tagName = tag.attributes?.name?.en;
        if (tagName && tag.attributes?.group === 'genre') {
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
        demographic: attrs.publicationDemographic
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
      updatedAt: attrs.updatedAt || new Date().toISOString()
    };
  }

  private static readonly GENRE_MAP: Record<string, string> = {
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
    'sci-fi': '256c8bd9-4904-4360-bf4f-508a76d67183',
    'romance': '423e2eae-a7a2-4a8b-ac03-a8351462d71d',
    'mistério': 'ee968100-4191-4968-93d3-f82d72be7e46',
    'misterio': 'ee968100-4191-4968-93d3-f82d72be7e46',
    'mystery': 'ee968100-4191-4968-93d3-f82d72be7e46'
  };

  async search(query: string, options?: SourceSearchOptions): Promise<SourceSearchResult> {
    try {
      const limit = Math.min(options?.limit || 24, 60);
      const offset = options?.offset || (options?.page ? (options.page - 1) * limit : 0);
      const orderParam = query.trim() ? 'order[relevance]=desc' : 'order[followedCount]=desc';
      let url = `${this.baseUrl}/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&includes[]=artist&contentRating[]=safe&contentRating[]=suggestive&${orderParam}`;
      
      if (query.trim()) {
        url += `&title=${encodeURIComponent(query.trim())}`;
      }

      if (options?.genre && options.genre !== 'all') {
        const tagId = MangaDexProvider.GENRE_MAP[options.genre.toLowerCase()];
        if (tagId) {
          url += `&includedTags[]=${encodeURIComponent(tagId)}`;
        }
      }

      const res = await this.fetchWithTimeout(url);
      const list = Array.isArray(res.data) ? res.data : [];
      const mangaList = list.map((item: any) => this.normalizeMangaDexItem(item));

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
      let url = `${this.baseUrl}/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&includes[]=artist&contentRating[]=safe&contentRating[]=suggestive&order[followedCount]=desc`;

      if (options?.genre && options.genre !== 'all') {
        const tagId = MangaDexProvider.GENRE_MAP[options.genre.toLowerCase()];
        if (tagId) {
          url += `&includedTags[]=${encodeURIComponent(tagId)}`;
        }
      }

      const res = await this.fetchWithTimeout(url);
      const list = Array.isArray(res.data) ? res.data : [];
      return list.map((item: any) => this.normalizeMangaDexItem(item));
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
      const buildUrl = (langQuery: string, offset = 0) =>
        `${this.baseUrl}/manga/${externalMangaId}/feed?order[chapter]=desc&limit=100&offset=${offset}&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica${langQuery}`;

      let langQuery = '';
      if (language) {
        langQuery = `&translatedLanguage[]=${encodeURIComponent(language)}`;
      } else {
        langQuery = '&translatedLanguage[]=pt-br&translatedLanguage[]=en';
      }

      let res = await this.fetchWithTimeout(buildUrl(langQuery, 0));
      let list = Array.isArray(res.data) ? res.data : [];

      // If more chapters exist (> 100), fetch next 100 to expand chapters available
      if (res.total > 100 && list.length === 100) {
        const resOffset100 = await this.fetchWithTimeout(buildUrl(langQuery, 100)).catch(() => ({ data: [] }));
        if (Array.isArray(resOffset100.data) && resOffset100.data.length > 0) {
          list = [...list, ...resOffset100.data];
        }
      }

      // Fallback: If no language was explicitly requested and preferred languages (pt-br, en) returned no chapters,
      // fetch chapters without language restriction so available translations are displayed instead of empty list
      if (!language && list.length === 0) {
        const fallbackRes = await this.fetchWithTimeout(buildUrl('', 0));
        if (Array.isArray(fallbackRes.data) && fallbackRes.data.length > 0) {
          list = fallbackRes.data;
          if (fallbackRes.total > 100 && list.length === 100) {
            const fallbackRes2 = await this.fetchWithTimeout(buildUrl('', 100)).catch(() => ({ data: [] }));
            if (Array.isArray(fallbackRes2.data)) {
              list = [...list, ...fallbackRes2.data];
            }
          }
        }
      }

      return list.map((item: any) => {
        const attrs = item.attributes || {};
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
          pagesCount: attrs.pages || undefined
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
        throw new HttpError(502, 'Resposta inválida do servidor at-home do MangaDex.');
      }

      const { baseUrl, chapter } = res;
      // Prefer standard data or dataSaver
      const files: string[] = chapter.dataSaver && chapter.dataSaver.length > 0
        ? chapter.dataSaver
        : chapter.data;
      const subDir = chapter.dataSaver && chapter.dataSaver.length > 0 ? 'data-saver' : 'data';

      // Prefer permanent official MangaDex CDN (uploads.mangadex.org)
      // to ensure reliable, unthrottled image URLs that do not expire after 15 minutes
      // or return 404 from ephemeral volunteer nodes.
      const cdnBase = 'https://uploads.mangadex.org';

      return files.map((fileName, index) => ({
        pageNumber: index + 1,
        imageUrl: `${cdnBase}/${subDir}/${chapter.hash}/${fileName}`
      }));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.warn(`[MangaDexProvider] getChapterPages failed for ${externalChapterId}:`, (err as Error).message);
      throw new HttpError(502, `Falha ao obter páginas do capítulo no MangaDex: ${(err as Error).message}`);
    }
  }
}
