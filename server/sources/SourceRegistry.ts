import { IMangaSource, SourceSearchOptions } from './IMangaSource.js';
import { Manga, Chapter, MangaPage, MangaSourceInfo } from '../../src/types/manga.js';
import { MangaDexProvider } from './MangaDexProvider.js';
import { ComickProvider } from './ComickProvider.js';
import { MangaPillProvider } from './MangaPillProvider.js';
import { WeebCentralProvider } from './WeebCentralProvider.js';
import { HttpError } from '../errors/HttpError.js';
import { deduplicateAndGroupChapters } from './ChapterDeduplicator.js';

function normalizeTitle(t: string): string {
  if (!t) return '';
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function areSameManga(m1: Manga, m2: Manga): boolean {
  if (m1.id === m2.id) return true;

  const norm1 = normalizeTitle(m1.title);
  const norm2 = normalizeTitle(m2.title);

  // Exact normalized title match (at least 3 characters)
  if (norm1 && norm2 && norm1.length >= 3 && norm1 === norm2) {
    return true;
  }

  // Cross-check altTitles against main title
  const alts1 = (m1.altTitles || []).map(normalizeTitle).filter(a => a.length >= 3);
  const alts2 = (m2.altTitles || []).map(normalizeTitle).filter(a => a.length >= 3);

  if (norm2.length >= 4 && alts1.includes(norm2)) return true;
  if (norm1.length >= 4 && alts2.includes(norm1)) return true;

  // Cross altTitles match for significant titles
  for (const a1 of alts1) {
    if (a1.length >= 5 && alts2.includes(a1)) {
      return true;
    }
  }

  return false;
}

function mergeManga(primary: Manga, secondary: Manga): Manga {
  const mergedSources = [...primary.sources];
  for (const s of secondary.sources) {
    if (!mergedSources.some(existing => existing.sourceId === s.sourceId && existing.externalId === s.externalId)) {
      mergedSources.push(s);
    }
  }

  const altTitlesSet = new Set([...primary.altTitles, ...secondary.altTitles]);
  altTitlesSet.delete(primary.title);

  const genresSet = new Set([...primary.genres, ...secondary.genres]);

  const authors = primary.authors.includes('Autor Desconhecido') && !secondary.authors.includes('Autor Desconhecido')
    ? secondary.authors
    : primary.authors;

  const artists = primary.artists.includes('Artista Desconhecido') && !secondary.artists.includes('Artista Desconhecido')
    ? secondary.artists
    : primary.artists;

  const isDefaultSynopsis = !primary.synopsis || primary.synopsis === 'Sinopse não disponível.' || primary.synopsis.length < 30;
  const synopsis = isDefaultSynopsis && secondary.synopsis && secondary.synopsis.length > 30
    ? secondary.synopsis
    : primary.synopsis;

  const isDefaultCover = !primary.coverUrl || primary.coverUrl.includes('images.unsplash.com');
  const coverUrl = isDefaultCover && secondary.coverUrl && !secondary.coverUrl.includes('images.unsplash.com')
    ? secondary.coverUrl
    : primary.coverUrl;

  return {
    ...primary,
    altTitles: Array.from(altTitlesSet).slice(0, 8),
    genres: Array.from(genresSet),
    authors,
    artists,
    synopsis,
    coverUrl,
    sources: mergedSources,
    rating: primary.rating || secondary.rating,
    publicationInfo: {
      releaseYear: primary.publicationInfo?.releaseYear || secondary.publicationInfo?.releaseYear,
      country: primary.publicationInfo?.country || secondary.publicationInfo?.country,
      demographic: primary.publicationInfo?.demographic || secondary.publicationInfo?.demographic,
      magazine: primary.publicationInfo?.magazine || secondary.publicationInfo?.magazine
    },
    isAdult: Boolean(primary.isAdult || secondary.isAdult),
    contentRating: (primary.contentRating === 'pornographic' || secondary.contentRating === 'pornographic')
      ? 'pornographic'
      : (primary.contentRating === 'erotica' || secondary.contentRating === 'erotica')
      ? 'erotica'
      : (primary.contentRating === 'suggestive' || secondary.contentRating === 'suggestive')
      ? 'suggestive'
      : 'safe',
    hasAvailableChapters: Boolean(primary.hasAvailableChapters || secondary.hasAvailableChapters),
    availabilityStatus: (primary.hasAvailableChapters || secondary.hasAvailableChapters)
      ? 'available'
      : 'metadata_only'
  };
}

function deduplicateMangaList(list: Manga[]): Manga[] {
  const result: Manga[] = [];

  for (const item of list) {
    const existingIndex = result.findIndex(r => areSameManga(r, item));
    if (existingIndex >= 0) {
      result[existingIndex] = mergeManga(result[existingIndex], item);
    } else {
      result.push({ ...item });
    }
  }

  return result;
}

export class SourceRegistry {
  private sources: Map<string, IMangaSource> = new Map();

  constructor() {
    this.registerSource(new ComickProvider());
    this.registerSource(new MangaDexProvider());
    this.registerSource(new WeebCentralProvider());
    this.registerSource(new MangaPillProvider());
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
   * Search across a specified source or all sources simultaneously.
   * When searching across all sources, live providers (Comick, MangaDex, WeebCentral, MangaPill)
   * are queried in parallel, safe cross-source deduplication merges identical works,
   * and exact title matches are ranked first.
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
      // Query real live sources first
      const liveSourceIds = ['comick', 'mangadex', 'weebcentral', 'mangapill'];
      for (const id of liveSourceIds) {
        const src = this.sources.get(id);
        if (src) sourcesToQuery.push(src);
      }
    }

    const promises = sourcesToQuery.map(src =>
      src.search(query, options).catch(err => {
        console.error(`Error querying source ${src.getInfo().id}:`, err);
        return { mangaList: [], total: 0, hasMore: false };
      })
    );

    const outcomes = await Promise.all(promises);
    const rawLiveResults: Manga[] = [];

    outcomes.forEach((outcome) => {
      rawLiveResults.push(...outcome.mangaList);
    });

    // Safely deduplicate live results across Comick, MangaDex, WeebCentral, and Guya
    let liveResults = deduplicateMangaList(rawLiveResults);

    // Filter adult if includeAdult is not explicitly true (Safe Mode by default)
    if (!options?.includeAdult) {
      liveResults = liveResults.filter(m => !m.isAdult);
    }

    // Filter by availability if requested
    if (options?.onlyAvailable) {
      liveResults = liveResults.filter(m => m.hasAvailableChapters);
    }

    // If a search query was supplied, sort live results so exact or prefix matches come first
    const trimmedQuery = query.trim().toLowerCase();
    if (trimmedQuery) {
      liveResults.sort((a, b) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        const aAlts = (a.altTitles || []).map(t => t.toLowerCase());
        const bAlts = (b.altTitles || []).map(t => t.toLowerCase());

        const scoreA = aTitle === trimmedQuery ? 5
          : aTitle.startsWith(trimmedQuery) ? 4
          : aAlts.some(t => t === trimmedQuery) ? 3
          : aTitle.includes(trimmedQuery) ? 2
          : aAlts.some(t => t.startsWith(trimmedQuery)) ? 2
          : aAlts.some(t => t.includes(trimmedQuery)) ? 1
          : 0;

        const scoreB = bTitle === trimmedQuery ? 5
          : bTitle.startsWith(trimmedQuery) ? 4
          : bAlts.some(t => t === trimmedQuery) ? 3
          : bTitle.includes(trimmedQuery) ? 2
          : bAlts.some(t => t.startsWith(trimmedQuery)) ? 2
          : bAlts.some(t => t.includes(trimmedQuery)) ? 1
          : 0;

        return scoreB - scoreA;
      });
    }

    return {
      results: liveResults,
      total: liveResults.length,
      sourcesQueried: sourcesToQuery.map(s => s.getInfo().id)
    };
  }

  /**
   * Retrieve featured / popular manga for homepage discovery.
   * Merges and deduplicates popular works from live providers (Comick, MangaDex, WeebCentral, MangaPill).
   * Safe mode and chapter availability are enforced for a premium discovery experience.
   */
  public async getFeatured(): Promise<Manga[]> {
    const liveSources = [this.sources.get('comick'), this.sources.get('mangadex'), this.sources.get('weebcentral'), this.sources.get('mangapill')].filter(Boolean) as IMangaSource[];
    const promises = liveSources.map(src =>
      src.getPopular({ limit: 24, includeAdult: false, onlyAvailable: true }).catch(() => [])
    );

    const results = await Promise.all(promises);
    const rawList: Manga[] = [];
    for (const list of results) {
      rawList.push(...list);
    }

    const deduped = deduplicateMangaList(rawList);
    // Exclude adult content and metadata-only works from homepage featured
    return deduped.filter(m => !m.isAdult && m.hasAvailableChapters !== false);
  }

  /**
   * Parse internal Manga ID: format "mr_<sourceId>_<externalId>"
   */
  public parseInternalMangaId(internalId: string): { sourceId: string; externalId: string } {
    if (!internalId || !internalId.startsWith('mr_')) {
      throw new HttpError(400, `Formato de identificador de mangá inválido: '${internalId}'. O formato esperado é 'mr_<source>_<id>'.`);
    }
    const withoutPrefix = internalId.substring(3);
    const firstUnderscore = withoutPrefix.indexOf('_');
    if (firstUnderscore === -1) {
      throw new HttpError(400, `Formato de identificador de mangá inválido: '${internalId}'. O formato esperado é 'mr_<source>_<id>'.`);
    }
    const sourceId = withoutPrefix.substring(0, firstUnderscore);
    const externalId = withoutPrefix.substring(firstUnderscore + 1);
    if (!sourceId || !externalId) {
      throw new HttpError(400, `Formato de identificador de mangá inválido: '${internalId}'. O formato esperado é 'mr_<source>_<id>'.`);
    }
    return { sourceId, externalId };
  }

  /**
   * Parse internal Chapter ID: format "ch_<sourceId>_<externalMangaId>_<externalChapterId>"
   * Optional fallback suffix format: "ch_<sourceId>_<externalMangaId>_<externalChapterId>__md_<fallbackChapterId>"
   */
  public parseInternalChapterId(internalChapterId: string): {
    sourceId: string;
    externalMangaId: string;
    externalChapterId: string;
    fallbackChapterId?: string;
  } {
    if (!internalChapterId || !internalChapterId.startsWith('ch_')) {
      throw new HttpError(400, `Formato de identificador de capítulo inválido: '${internalChapterId}'. O formato esperado é 'ch_<source>_<mangaId>_<chapterId>'.`);
    }

    let idWithoutFallback = internalChapterId;
    let fallbackChapterId: string | undefined;

    const mdIndex = internalChapterId.indexOf('__md_');
    if (mdIndex !== -1) {
      fallbackChapterId = internalChapterId.substring(mdIndex + 5);
      idWithoutFallback = internalChapterId.substring(0, mdIndex);
    }

    // Strip "ch_" prefix
    const withoutPrefix = idWithoutFallback.substring(3);
    const firstUnderscore = withoutPrefix.indexOf('_');
    if (firstUnderscore === -1) {
      throw new HttpError(400, `Formato de identificador de capítulo inválido: '${internalChapterId}'. O formato esperado é 'ch_<source>_<mangaId>_<chapterId>'.`);
    }

    const sourceId = withoutPrefix.substring(0, firstUnderscore);
    const remainder = withoutPrefix.substring(firstUnderscore + 1);
    if (!sourceId || !remainder) {
      throw new HttpError(400, `Formato de identificador de capítulo inválido: '${internalChapterId}'. O formato esperado é 'ch_<source>_<mangaId>_<chapterId>'.`);
    }

    let externalMangaId = '';
    let externalChapterId = '';

    if (sourceId === 'comick') {
      // In Comick, manga IDs and chapter hids are canonical 8-character identifiers.
      // If externalMangaId contains underscores (e.g. dhPOlu_L or _OdzOZzi), remainder starts with 8 chars,
      // followed by '_' and the externalChapterId.
      if (remainder.length >= 17 && remainder[8] === '_') {
        externalMangaId = remainder.substring(0, 8);
        externalChapterId = remainder.substring(9);
      } else {
        const lastUnderscore = remainder.lastIndexOf('_');
        if (lastUnderscore !== -1) {
          externalMangaId = remainder.substring(0, lastUnderscore);
          externalChapterId = remainder.substring(lastUnderscore + 1);
        } else {
          externalMangaId = remainder;
          externalChapterId = remainder;
        }
      }
    } else if (sourceId === 'mangapill') {
      const lastUnderscore = remainder.lastIndexOf('_');
      if (lastUnderscore !== -1) {
        externalMangaId = remainder.substring(0, lastUnderscore);
        externalChapterId = remainder.substring(lastUnderscore + 1);
      } else {
        externalMangaId = remainder;
        externalChapterId = remainder;
      }
    } else if (sourceId === 'mangadex') {
      // MangaDex externalChapterId is a 36-character UUID
      if (remainder.length > 37 && remainder[remainder.length - 37] === '_') {
        externalChapterId = remainder.substring(remainder.length - 36);
        externalMangaId = remainder.substring(0, remainder.length - 37);
      } else {
        const parts = remainder.split('_');
        externalMangaId = parts[0];
        externalChapterId = parts.slice(1).join('_');
      }
    } else if (sourceId === 'weebcentral') {
      // WeebCentral uses 26-character ULIDs for series and chapters
      if (remainder.length === 53 && remainder[26] === '_') {
        externalMangaId = remainder.substring(0, 26);
        externalChapterId = remainder.substring(27);
      } else {
        const parts = remainder.split('_');
        externalMangaId = parts[0];
        externalChapterId = parts.slice(1).join('_');
      }
    } else {
      const parts = remainder.split('_');
      externalMangaId = parts[0];
      externalChapterId = parts.slice(1).join('_');
    }

    if (!externalMangaId || !externalChapterId) {
      throw new HttpError(400, `Formato de identificador de capítulo inválido: '${internalChapterId}'. O formato esperado é 'ch_<source>_<mangaId>_<chapterId>'.`);
    }

    return {
      sourceId,
      externalMangaId,
      externalChapterId,
      ...(fallbackChapterId ? { fallbackChapterId } : {})
    };
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
   * Get chapters for an internal manga ID with optional deduplication
   */
  public async getChapters(
    internalMangaId: string,
    language?: string,
    options?: { deduplicate?: boolean }
  ): Promise<Chapter[]> {
    const parsed = this.parseInternalMangaId(internalMangaId);
    const source = this.sources.get(parsed.sourceId);
    if (!source) {
      throw new HttpError(404, `Fonte '${parsed.sourceId}' não encontrada para o mangá '${internalMangaId}'.`);
    }

    let chapters = await source.getChapters(parsed.externalId, language);

    if (options?.deduplicate !== false) {
      chapters = deduplicateAndGroupChapters(chapters);
    }

    return chapters;
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

    // Comick fallback logic
    if (parsed.sourceId === 'comick') {
      let pages: MangaPage[] = [];
      let fallbackChapterId = parsed.fallbackChapterId;

      // 1. Chame primeiro ComickProvider para obter páginas e descobrir mdid (sem chamada HTTP duplicada)
      // Se Comick lançar HttpError, só prossiga para fallback se fallbackChapterId já for conhecido.
      if (typeof (source as any).getChapterPagesResult === 'function') {
        try {
          const result = await (source as any).getChapterPagesResult(parsed.externalChapterId);
          pages = result.pages;
          if (!fallbackChapterId && result.mdid) {
            fallbackChapterId = result.mdid;
          }
        } catch (err) {
          if (err instanceof HttpError && (err.status === 404 || err.status === 502) && fallbackChapterId) {
            pages = [];
          } else {
            throw err;
          }
        }
      } else {
        pages = await source.getChapterPages(parsed.externalChapterId);
      }

      // 2. Se retornar uma lista com uma ou mais páginas, retorne imediatamente
      if (pages && pages.length > 0) {
        return pages;
      }

      // 3. Se retornar [] e existir fallbackChapterId (do ID interno ou descoberto via Comick API), tente MangaDexProvider.getChapterPages(fallbackChapterId)
      if (fallbackChapterId) {
        const mangaDexSource = this.sources.get('mangadex');
        if (mangaDexSource) {
          try {
            const mdPages = await mangaDexSource.getChapterPages(fallbackChapterId);
            // 4. Se MangaDex retornar páginas, retorne-as
            if (mdPages && mdPages.length > 0) {
              return mdPages;
            }
          } catch (err) {
            // Se MangaDex falhar (ex: 404, indisponível), trate como sem páginas disponíveis
            console.warn(`[SourceRegistry] Fallback MangaDex falhou para ${fallbackChapterId}:`, (err as Error).message);
          }
        }
      }

      // 4. Se nenhuma fonte possuir páginas, retorne []
      return [];
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
