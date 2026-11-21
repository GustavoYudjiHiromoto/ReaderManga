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
  availableLanguages?: string[];
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

export type ExtensionTemplate = 'native' | 'madara' | 'themesia' | 'custom_html' | 'json_api';

export interface CustomHtmlSelectors {
  searchPath?: string;
  popularPath?: string;
  searchItem: string;
  title: string;
  link: string;
  cover?: string;
  detailTitle?: string;
  detailCover?: string;
  detailSynopsis?: string;
  detailGenres?: string;
  detailAuthor?: string;
  detailStatus?: string;
  chapterItem: string;
  chapterTitle?: string;
  chapterLink?: string;
  chapterDate?: string;
  pageImg: string;
}

export interface DynamicExtensionManifest {
  id: string;
  name: string;
  baseUrl: string;
  defaultBaseUrl?: string;
  template: 'madara' | 'themesia' | 'custom_html';
  version: string;
  lang: string;
  languages?: string[];
  description?: string;
  badge?: string;
  iconColor?: string;
  repoUrl?: string;
  nsfw?: boolean;
  selectors?: CustomHtmlSelectors;
  headers?: Record<string, string>;
  installedAt?: number;
  updatedAt?: number;
}

export interface ExtensionRepo {
  url: string;
  name: string;
  description?: string;
  lastSyncedAt: number;
  extensions: DynamicExtensionManifest[];
}

export interface MangaSourceInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  isAvailable: boolean;
  type: 'live_api' | 'template_extension';
  template?: ExtensionTemplate;
  baseUrl?: string;
  defaultBaseUrl?: string;
  isDynamic?: boolean;
  repoUrl?: string;
  supportsMirrorEdit?: boolean;
  websiteUrl?: string;
  supportedFeatures: {
    search: boolean;
    filters: boolean;
    coverImages: boolean;
    multipleLanguages: boolean;
    chaptersDeduplication?: boolean;
    webtoons?: boolean;
    nsfwFilter?: boolean;
  };
  iconColor?: string;
  badge?: string;
  languages?: string[];
  catalogEstimate?: string;
}

export interface SourceConfig {
  id: string;
  enabled: boolean;
  priority: number; // lower number = higher search priority
  preferredLanguage?: string;
}

export type PingErrorCode = 'cloudflare' | 'offline' | 'ratelimit' | 'layout' | 'unknown';

export interface SourcePingResult {
  sourceId: string;
  status: 'online' | 'degraded' | 'offline';
  latencyMs: number;
  error?: string;
  errorCode?: PingErrorCode;
  checkedAt?: number;
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
  scrollRatio?: number; // 0.0 to 1.0 exact pixel scroll position in webtoon mode
  scrollOffset?: number;
  sourceId?: string;
  updatedAt: number;
}

export type LibraryCategory = 'reading' | 'plan_to_read' | 'completed' | 'on_hold' | 'dropped';

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
  userCategory?: LibraryCategory;
  userScore?: number; // 1 to 10
  userNotes?: string;
  customCollections?: string[]; // e.g. ["Favoritos do Ano", "Para Reler"]
  synopsis?: string;
  altTitles?: string[];
  updatedAt: number;
}

export interface ReadingStats {
  totalChaptersRead: number;
  totalSecondsSpent: number;
  totalMinutesSpent: number;
  formattedTimeSpent: string;
  uniqueMangasRead: number;
  totalPagesRead: number;
  lastReadDate?: string;
}

export interface PageBookmark {
  id: string; // e.g., 'bm_1730000000_xyz'
  mangaId: string;
  mangaTitle: string;
  mangaCover: string;
  chapterId: string;
  chapterNumber: string;
  chapterTitle?: string;
  pageNumber: number; // 1-based page index
  imageUrl: string;
  note?: string;
  createdAt: number;
}

export interface IgnoredManga {
  mangaId: string;
  title: string;
  altTitles?: string[];
  coverUrl?: string;
  sourceId?: string;
  sourceName?: string;
  dismissedAt: number;
}

export interface LibraryBackup {
  version: number;
  exportedAt: string;
  source: string;
  favorites: FavoriteManga[];
  history: ReadingProgress[];
  stats?: ReadingStats;
  readChapters?: string[];
  pageBookmarks?: PageBookmark[];
  customCollections?: string[];
  ignoredMangas?: IgnoredManga[];
  dismissedDuplicatePairs?: string[];
}

export interface MangaUpdateInfo {
  mangaId: string;
  latestChapterId: string;
  latestChapterNumber: string;
  latestChapterTitle?: string;
  releaseDate?: string;
  chapterSourceId?: string;
  chapterSourceName?: string;
  failoverUsed?: boolean;
  hasNew: boolean;
  lastReadNumber?: string;
  discoveredAt?: number;
  checkedAt: number;
}

export interface SiteDetectionResult {
  detected: boolean;
  suggestedName: string;
  baseUrl: string;
  lang: string;
  template: 'madara' | 'themesia' | 'custom_html';
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
  cloudflareBlocked?: boolean;
  probeSearchCount: number;
  probeSampleTitles: string[];
  probeChapterCount?: number;
  selectors?: CustomHtmlSelectors;
  error?: string;
}

export interface RepoSyncSummary {
  reposChecked: number;
  extensionsUpdated: Array<{
    id: string;
    name: string;
    fromVersion: string;
    toVersion: string;
  }>;
  failedRepos: Array<{
    url: string;
    error: string;
  }>;
}

export interface MirrorProbeCandidate {
  url: string;
  reachable: boolean;
  status: number;
  latencyMs: number;
  cloudflare?: boolean;
}

export type RelayMode = 'off' | 'fallback' | 'always';

export interface RelayStatus {
  mode: RelayMode;
  bridgeOnline: boolean;
  customProxyConfigured: boolean;
  customProxyUrl?: string;
  clientLabel?: string;
  connectedSince?: number;
  lastSeenAt?: number;
  token: string;
  stats: {
    requestsServed: number;
    requestsSucceeded: number;
    requestsFailed: number;
    lastBlockedDomain?: string;
    lastRoutedAt?: number;
  };
}


