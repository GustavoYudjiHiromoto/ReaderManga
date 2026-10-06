/**
 * Domain Models for MangaReader
 * Represents normalized manga concepts independent of external providers.
 */

export type MangaStatus = 'ongoing' | 'completed' | 'hiatus' | 'cancelled';

export interface ExternalReference {
  sourceId: string;
  externalId: string;
  url?: string;
  sourceName?: string;
}

export interface PublicationInfo {
  releaseYear?: number;
  magazine?: string;
  country?: string;
  demographic?: string;
}

export interface Manga {
  id: string; // Internal unique ID (e.g., 'mr_mangadex_xxx' or 'mr_openmanga_frieren')
  title: string;
  altTitles: string[];
  coverUrl: string;
  synopsis: string;
  authors: string[];
  artists: string[];
  genres: string[];
  status: MangaStatus;
  publicationInfo: PublicationInfo;
  sources: ExternalReference[];
  latestChapter?: string;
  totalChapters?: number;
  rating?: number;
  updatedAt: string;
}

export interface Chapter {
  id: string; // Internal chapter ID (e.g., 'ch_openmanga_frieren_1')
  mangaId: string; // References internal Manga id
  chapterNumber: string; // e.g. "1", "1.5", "104"
  volume?: string;
  title?: string;
  releaseDate?: string;
  language: string; // ISO 639-1 e.g. 'pt-br', 'en', 'ja'
  sourceId: string;
  externalChapterId: string;
  pagesCount?: number;
}

export interface MangaPage {
  pageNumber: number;
  imageUrl: string;
  width?: number;
  height?: number;
}

export interface MangaSourceInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  isAvailable: boolean;
  type: 'live_api' | 'mock';
  websiteUrl?: string;
  supportedFeatures: {
    search: boolean;
    filters: boolean;
    coverImages: boolean;
    multipleLanguages: boolean;
  };
}

export interface ReadingProgress {
  mangaId: string;
  mangaTitle: string;
  mangaCover: string;
  chapterId: string;
  chapterNumber: string;
  chapterTitle?: string;
  pageNumber: number;
  totalPages: number;
  updatedAt: number;
}
