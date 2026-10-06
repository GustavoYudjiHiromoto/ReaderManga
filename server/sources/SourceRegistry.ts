import { IMangaSource, SourceSearchOptions } from './IMangaSource.js';
import { Manga, Chapter, MangaPage, MangaSourceInfo } from '../../src/types/manga.js';
import { MockMangaProvider } from './MockMangaProvider.js';
import { MangaDexProvider } from './MangaDexProvider.js';
import { HttpError } from '../errors/HttpError.js';

export class SourceRegistry {
  private sources: Map<string, IMangaSource> = new Map();

  constructor() {
    this.registerSource(new MockMangaProvider());
    this.registerSource(new MangaDexProvider());
  }

  public registerSource(source: IMangaSource): void {
    const info = source.getInfo();
    this.sources.set(info.id, source);
  }

  public getSources(): MangaSourceInfo[] {
    return Array.from(this.sources.values()).map(s => s.getInfo());
  }

  public getSource(id: string): IMangaSource | undefined {
    return this.sources.get(id);
  }

  /**
   * Search across a specified source or all sources simultaneously
   */
  public async search(query: string, options?: SourceSearchOptions & { sourceId?: string }): Promise<{
    results: Manga[];
    total: number;
    sourcesQueried: string[];
  }> {
    const targetSourceId = options?.sourceId;
    const sourcesToQuery: IMangaSource[] = [];

    if (targetSourceId && targetSourceId !== 'all') {
      const src = this.sources.get(targetSourceId);
      if (src) sourcesToQuery.push(src);
    } else {
      // Query all sources
      sourcesToQuery.push(...Array.from(this.sources.values()));
    }

    const promises = sourcesToQuery.map(src =>
      src.search(query, options).catch(err => {
        console.error(`Error querying source ${src.getInfo().id}:`, err);
        return { mangaList: [], total: 0, hasMore: false };
      })
    );

    const outcomes = await Promise.all(promises);
    const aggregated: Manga[] = [];

    for (const outcome of outcomes) {
      aggregated.push(...outcome.mangaList);
    }

    return {
      results: aggregated,
      total: aggregated.length,
      sourcesQueried: sourcesToQuery.map(s => s.getInfo().id)
    };
  }

  /**
   * Retrieve featured / popular manga for homepage discovery
   */
  public async getFeatured(): Promise<Manga[]> {
    const promises = Array.from(this.sources.values()).map(src =>
      src.getPopular({ limit: 8 }).catch(() => [])
    );

    const results = await Promise.all(promises);
    const merged: Manga[] = [];
    for (const list of results) {
      merged.push(...list);
    }
    return merged;
  }

  /**
   * Parse internal Manga ID: format "mr_<sourceId>_<externalId>"
   */
  public parseInternalMangaId(internalId: string): { sourceId: string; externalId: string } {
    if (!internalId || !internalId.startsWith('mr_')) {
      throw new HttpError(400, `Formato de identificador de mangá inválido: '${internalId}'. O formato esperado é 'mr_<source>_<id>'.`);
    }
    const parts = internalId.split('_');
    if (parts.length < 3 || !parts[1] || !parts.slice(2).join('_')) {
      throw new HttpError(400, `Formato de identificador de mangá inválido: '${internalId}'. O formato esperado é 'mr_<source>_<id>'.`);
    }
    const sourceId = parts[1];
    const externalId = parts.slice(2).join('_');
    return { sourceId, externalId };
  }

  /**
   * Parse internal Chapter ID: format "ch_<sourceId>_<externalMangaId>_<externalChapterId>"
   */
  public parseInternalChapterId(internalChapterId: string): {
    sourceId: string;
    externalMangaId: string;
    externalChapterId: string;
  } {
    if (!internalChapterId || !internalChapterId.startsWith('ch_')) {
      throw new HttpError(400, `Formato de identificador de capítulo inválido: '${internalChapterId}'. O formato esperado é 'ch_<source>_<mangaId>_<chapterId>'.`);
    }
    const parts = internalChapterId.split('_');
    if (parts.length < 4 || !parts[1] || !parts[2] || !parts.slice(3).join('_')) {
      throw new HttpError(400, `Formato de identificador de capítulo inválido: '${internalChapterId}'. O formato esperado é 'ch_<source>_<mangaId>_<chapterId>'.`);
    }
    const sourceId = parts[1];
    const externalMangaId = parts[2];
    const externalChapterId = parts.slice(3).join('_');
    return { sourceId, externalMangaId, externalChapterId };
  }

  /**
   * Get normalized manga details by internal ID
   */
  public async getMangaById(internalId: string): Promise<Manga | null> {
    const parsed = this.parseInternalMangaId(internalId);
    const source = this.sources.get(parsed.sourceId);
    if (!source) {
      throw new HttpError(404, `Fonte '${parsed.sourceId}' não encontrada para o mangá '${internalId}'.`);
    }

    return await source.getMangaDetails(parsed.externalId);
  }

  /**
   * Get chapters for an internal manga ID
   */
  public async getChapters(internalMangaId: string, language?: string): Promise<Chapter[]> {
    const parsed = this.parseInternalMangaId(internalMangaId);
    const source = this.sources.get(parsed.sourceId);
    if (!source) {
      throw new HttpError(404, `Fonte '${parsed.sourceId}' não encontrada para o mangá '${internalMangaId}'.`);
    }

    return await source.getChapters(parsed.externalId, language);
  }

  /**
   * Get pages for an internal chapter ID
   */
  public async getChapterPages(internalChapterId: string): Promise<MangaPage[]> {
    const parsed = this.parseInternalChapterId(internalChapterId);
    const source = this.sources.get(parsed.sourceId);
    if (!source) {
      throw new HttpError(404, `Fonte '${parsed.sourceId}' não encontrada para o capítulo '${internalChapterId}'.`);
    }

    return await source.getChapterPages(parsed.externalChapterId);
  }

  /**
   * Export structured dataset for external recommendation system integration
   */
  public async getRecommendationFeed(options?: { limit?: number }): Promise<{
    version: string;
    timestamp: string;
    totalAvailable: number;
    items: Array<{
      id: string;
      title: string;
      genres: string[];
      authors: string[];
      status: string;
      demographic?: string;
      releaseYear?: number;
      rating?: number;
      sources: Array<{ sourceId: string; externalId: string }>;
    }>;
  }> {
    const featured = await this.getFeatured();
    const limit = options?.limit || 50;

    return {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      totalAvailable: featured.length,
      items: featured.slice(0, limit).map(m => ({
        id: m.id,
        title: m.title,
        genres: m.genres,
        authors: m.authors,
        status: m.status,
        demographic: m.publicationInfo.demographic,
        releaseYear: m.publicationInfo.releaseYear,
        rating: m.rating,
        sources: m.sources.map(s => ({ sourceId: s.sourceId, externalId: s.externalId }))
      }))
    };
  }
}

export const sourceRegistry = new SourceRegistry();
