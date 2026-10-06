import { Manga, Chapter, MangaPage, MangaSourceInfo } from '../../src/types/manga.js';

export interface SourceSearchOptions {
  limit?: number;
  offset?: number;
  genre?: string;
  language?: string;
}

export interface SourceSearchResult {
  mangaList: Manga[];
  total: number;
  hasMore: boolean;
}

export interface IMangaSource {
  getInfo(): MangaSourceInfo;
  search(query: string, options?: SourceSearchOptions): Promise<SourceSearchResult>;
  getPopular(options?: SourceSearchOptions): Promise<Manga[]>;
  getMangaDetails(externalId: string): Promise<Manga | null>;
  getChapters(externalMangaId: string, language?: string): Promise<Chapter[]>;
  getChapterPages(externalChapterId: string): Promise<MangaPage[]>;
}
