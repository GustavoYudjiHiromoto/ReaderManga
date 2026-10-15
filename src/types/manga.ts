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

export type MangaContentRating = 'safe' | 'suggestive' | 'erotica' | 'pornographic';
export type MangaAvailabilityStatus = 'available' | 'metadata_only' | 'source_error';

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
  contentRating?: MangaContentRating;
  isAdult?: boolean;
  hasAvailableChapters?: boolean;
  availabilityStatus?: MangaAvailabilityStatus;
}

export interface ChapterVariant {
  id: string;
  sourceId: string;
  sourceName?: string;
  externalChapterId: string;
  title?: string;
  scanlationGroup?: string;
  releaseDate?: string;
  pagesCount?: number;
  language: string;
  edition?: string;
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
  edition?: string;
  scanlationGroup?: string;
  variants?: ChapterVariant[];
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
  type: 'live_api';
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

export interface FavoriteManga {
  mangaId: string;
  title: string;
  coverUrl: string;
  sourceName?: string;
  sourceId?: string;
  rating?: number;
  authors?: string[];
  genres?: string[];
  status?: MangaStatus;
  updatedAt: number;
}
