import { IMangaSource, SourceSearchOptions, SourceSearchResult } from './IMangaSource.js';
import { Manga, Chapter, MangaPage, MangaSourceInfo } from '../../src/types/manga.js';

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
        throw new Error(`MangaDex HTTP Error: ${response.status} ${response.statusText}`);
      }
      return await response.json();
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

  async search(query: string, options?: SourceSearchOptions): Promise<SourceSearchResult> {
    try {
      const limit = Math.min(options?.limit || 20, 30);
      const offset = options?.offset || 0;
      let url = `${this.baseUrl}/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&includes[]=artist&contentRating[]=safe&contentRating[]=suggestive&order[relevance]=desc`;
      
      if (query.trim()) {
        url += `&title=${encodeURIComponent(query.trim())}`;
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
      const limit = options?.limit || 10;
      const url = `${this.baseUrl}/manga?limit=${limit}&includes[]=cover_art&includes[]=author&includes[]=artist&contentRating[]=safe&contentRating[]=suggestive&order[followedCount]=desc`;
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
      console.warn(`[MangaDexProvider] getMangaDetails failed for ${externalId}:`, (err as Error).message);
      return null;
    }
  }

  async getChapters(externalMangaId: string, language?: string): Promise<Chapter[]> {
    try {
      let langParam = 'translatedLanguage[]=pt-br&translatedLanguage[]=en';
      if (language) {
        langParam = `translatedLanguage[]=${encodeURIComponent(language)}`;
      }
      const url = `${this.baseUrl}/manga/${externalMangaId}/feed?${langParam}&order[chapter]=desc&limit=100&contentRating[]=safe&contentRating[]=suggestive`;
      const res = await this.fetchWithTimeout(url);
      const list = Array.isArray(res.data) ? res.data : [];

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
      console.warn(`[MangaDexProvider] getChapters failed for ${externalMangaId}:`, (err as Error).message);
      return [];
    }
  }

  async getChapterPages(externalChapterId: string): Promise<MangaPage[]> {
    try {
      const url = `${this.baseUrl}/at-home/server/${externalChapterId}`;
      const res = await this.fetchWithTimeout(url);
      if (!res.baseUrl || !res.chapter?.hash) {
        throw new Error('Invalid at-home server response');
      }

      const { baseUrl, chapter } = res;
      // Prefer standard data or dataSaver
      const files: string[] = chapter.dataSaver && chapter.dataSaver.length > 0
        ? chapter.dataSaver
        : chapter.data;
      const subDir = chapter.dataSaver && chapter.dataSaver.length > 0 ? 'data-saver' : 'data';

      return files.map((fileName, index) => ({
        pageNumber: index + 1,
        imageUrl: `${baseUrl}/${subDir}/${chapter.hash}/${fileName}`
      }));
    } catch (err) {
      console.warn(`[MangaDexProvider] getChapterPages failed for ${externalChapterId}:`, (err as Error).message);
      return [];
    }
  }
}
