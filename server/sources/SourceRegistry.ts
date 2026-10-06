import { IMangaSource, SourceSearchOptions } from './IMangaSource.js';
import { Manga, Chapter, MangaPage, MangaSourceInfo } from '../../src/types/manga.js';
import { OpenMangaProvider } from './OpenMangaProvider.js';
import { MangaDexProvider } from './MangaDexProvider.js';

export class SourceRegistry {
  private sources: Map<string, IMangaSource> = new Map();

  constructor() {
    this.registerSource(new OpenMangaProvider());
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
  public parseInternalMangaId(internalId: string): { sourceId: string; externalId: string } | null {
    if (!internalId.startsWith('mr_')) return null;
    const parts = internalId.split('_');
    if (parts.length < 3) return null;
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
  } | null {
    if (!internalChapterId.startsWith('ch_')) return null;
    const parts = internalChapterId.split('_');
    if (parts.length < 4) return null;
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
    if (!parsed) return null;

    const source = this.sources.get(parsed.sourceId);
    if (!source) return null;

    return await source.getMangaDetails(parsed.externalId);
  }

  /**
   * Get chapters for an internal manga ID
   */
  public async getChapters(internalMangaId: string, language?: string): Promise<Chapter[]> {
    const parsed = this.parseInternalMangaId(internalMangaId);
    if (!parsed) return [];

    const source = this.sources.get(parsed.sourceId);
    if (!source) return [];

    return await source.getChapters(parsed.externalId, language);
  }

  /**
   * Get pages for an internal chapter ID
   */
  public async getChapterPages(internalChapterId: string): Promise<MangaPage[]> {
    const parsed = this.parseInternalChapterId(internalChapterId);
    if (!parsed) return [];

    const source = this.sources.get(parsed.sourceId);
    if (!source) return [];

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
