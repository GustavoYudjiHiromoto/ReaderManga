import {
  DynamicExtensionManifest,
  ExtensionRepo,
  Manga,
  MangaSourceInfo,
  SourceConfig,
  SourcePingResult,
  CustomHtmlSelectors,
  SiteDetectionResult,
  RepoSyncSummary,
  MirrorProbeCandidate
} from '../types/manga.js';
import { MangaApi } from './api.js';
import { decodeHtmlEntities } from '../utils/htmlEntities.js';

const STORAGE_KEY = 'mr_extensions_config';
const PING_CACHE_KEY = 'mr_extensions_ping_cache';

/**
 * Official endpoints for MangaBall API
 */
export const MANGABALL_ENDPOINTS = {
  baseUrl: 'https://mangaball.net',
  searchAdvanced: 'https://mangaball.net/api/v1/title/search-advanced/',
  smartSearch: 'https://mangaball.net/api/v1/smart-search/search/',
  titleDetails: (id: string) => `https://mangaball.net/api/v1/title/${id}/`,
  titleChapters: (id: string) => `https://mangaball.net/api/v1/title/${id}/chapters/`
};

/**
 * Official endpoints for MangaFire
 */
export const MANGAFIRE_ENDPOINTS = {
  baseUrl: 'https://mangafire.to',
  filter: 'https://mangafire.to/filter',
  searchAjax: 'https://mangafire.to/ajax/manga/search',
  mangaDetails: (slug: string) => `https://mangafire.to/manga/${slug}`,
  readChapters: (mangaId: string) => `https://mangafire.to/ajax/read/${mangaId}/list`,
  chapterPages: (chapterId: string) => `https://mangafire.to/ajax/read/chapter/${chapterId}`
};

export interface RawMangaBallItem {
  id?: string | number;
  slug?: string;
  _id?: string;
  title?: string;
  name?: string;
  cover?: string;
  cover_url?: string;
  thumbnail?: string;
  synopsis?: string;
  description?: string;
  authors?: string[];
  author?: string;
  genres?: string[];
  status?: string;
  rating?: number | string;
  is_nsfw?: boolean;
  is_adult?: boolean;
}

/**
 * Parsing logic for MangaBall raw API data into normalized Manga model
 */
export function parseMangaBallItem(raw: RawMangaBallItem): Manga {
  const extId = String(raw.id || raw.slug || raw._id || 'unknown');
  const title = decodeHtmlEntities(raw.title || raw.name || 'Sem título') || 'Sem título';
  const cover = raw.cover || raw.cover_url || raw.thumbnail || '';
  const coverUrl = cover.startsWith('http') ? cover : (cover ? `https://mangaball.net${cover}` : '');
  const isAdult = Boolean(raw.is_nsfw || raw.is_adult);

  return {
    id: `mr_mangaball_${extId}`,
    title,
    altTitles: [],
    coverUrl,
    synopsis: decodeHtmlEntities(raw.synopsis || raw.description) || 'Disponível no acervo MangaBall.',
    authors: Array.isArray(raw.authors) && raw.authors.length > 0 ? raw.authors : [raw.author || 'MangaBall'],
    artists: [],
    genres: Array.isArray(raw.genres) && raw.genres.length > 0 ? raw.genres : ['Webtoon', 'Manhwa'],
    status: raw.status === 'completed' ? 'completed' : 'ongoing',
    rating: Number(raw.rating || 8.0),
    publicationInfo: {
      country: 'KR'
    },
    updatedAt: new Date().toISOString(),
    sources: [
      {
        sourceId: 'mangaball',
        externalId: extId,
        url: `https://mangaball.net/title/${extId}`
      }
    ],
    isAdult,
    contentRating: isAdult ? 'pornographic' : 'safe',
    hasAvailableChapters: true,
    availabilityStatus: 'available'
  };
}

/**
 * Parsing logic for MangaBall search responses
 */
export function parseMangaBallResponse(data: any): { mangaList: Manga[]; total: number; hasMore: boolean } {
  if (!data) return { mangaList: [], total: 0, hasMore: false };
  const items = Array.isArray(data) ? data : (data.items || data.results || data.data || []);
  if (!Array.isArray(items)) return { mangaList: [], total: 0, hasMore: false };

  const mangaList = items.map(parseMangaBallItem);
  return {
    mangaList,
    total: Number(data.total || data.count || mangaList.length),
    hasMore: mangaList.length >= 20
  };
}

/**
 * Parsing logic for MangaFire HTML filter / search responses
 */
export function parseMangaFireHtml(html: string): { mangaList: Manga[]; total: number; hasMore: boolean } {
  if (!html || html.includes('challenge-platform') || html.includes('Just a moment...')) {
    return { mangaList: [], total: 0, hasMore: false };
  }

  const mangaList: Manga[] = [];
  const itemRegex = /<div class="inner">\s*<a href="\/manga\/([^"]+)"[^>]*>.*?<img src="([^"]+)" alt="([^"]+)".*?<\/div>/gs;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(html)) !== null) {
    const slug = match[1];
    const cover = match[2];
    const title = decodeHtmlEntities(match[3]);

    if (slug && title) {
      mangaList.push({
        id: `mr_mangafire_${slug}`,
        title,
        altTitles: [],
        coverUrl: cover.startsWith('http') ? cover : `https://mangafire.to${cover}`,
        synopsis: 'Disponível no acervo MangaFire.',
        authors: ['MangaFire'],
        artists: [],
        genres: ['Manga'],
        status: 'ongoing',
        rating: 8.5,
        publicationInfo: { country: 'JP' },
        updatedAt: new Date().toISOString(),
        sources: [
          {
            sourceId: 'mangafire',
            externalId: slug,
            url: `https://mangafire.to/manga/${slug}`
          }
        ],
        isAdult: false,
        contentRating: 'safe',
        hasAvailableChapters: true,
        availabilityStatus: 'available'
      });
    }
  }

  return {
    mangaList,
    total: mangaList.length,
    hasMore: mangaList.length >= 20
  };
}

export const FALLBACK_SOURCES_META: MangaSourceInfo[] = [
  {
    id: 'comick',
    name: 'Comick (Live API)',
    description: 'Catálogo de alta densidade especializado em manhwas, webtoons e manhuas com capítulos agrupados.',
    version: '2.1.0',
    isAvailable: true,
    type: 'live_api',
    websiteUrl: 'https://comick.io',
    iconColor: '#a855f7',
    badge: 'Manhwas & Webtoons',
    languages: ['pt-br', 'en', 'es', 'fr'],
    catalogEstimate: '+85.000 títulos',
    supportedFeatures: {
      search: true,
      filters: true,
      coverImages: true,
      multipleLanguages: true,
      chaptersDeduplication: true,
      webtoons: true,
      nsfwFilter: true
    }
  },
  {
    id: 'mangadex',
    name: 'MangaDex (Live API)',
    description: 'A maior biblioteca aberta de mangás com API oficial, traduções comunitárias e suporte multilíngue.',
    version: '5.0.0',
    isAvailable: true,
    type: 'live_api',
    websiteUrl: 'https://mangadex.org',
    iconColor: '#ff6740',
    badge: 'API Oficial Global',
    languages: ['pt-br', 'en', 'es', 'ja', 'it'],
    catalogEstimate: '+65.000 títulos',
    supportedFeatures: {
      search: true,
      filters: true,
      coverImages: true,
      multipleLanguages: true,
      chaptersDeduplication: true,
      webtoons: true,
      nsfwFilter: true
    }
  },
  {
    id: 'weebcentral',
    name: 'WeebCentral (Ao Vivo)',
    description: 'Acervo extenso com scans de alta fidelidade e capítulos traduzidos sem restrição de licenciamento.',
    version: '1.1.0',
    isAvailable: true,
    type: 'live_api',
    websiteUrl: 'https://weebcentral.com',
    iconColor: '#06b6d4',
    badge: 'Scans & Lançamentos',
    languages: ['en'],
    catalogEstimate: '+35.000 títulos',
    supportedFeatures: {
      search: true,
      filters: true,
      coverImages: true,
      multipleLanguages: false,
      chaptersDeduplication: true,
      webtoons: true,
      nsfwFilter: true
    }
  },
  {
    id: 'mangapill',
    name: 'MangaPill (Ao Vivo)',
    description: 'Servidor ultra veloz focado nos lançamentos mais recentes de mangás e séries em publicação semanal.',
    version: '1.0.0',
    isAvailable: true,
    type: 'live_api',
    websiteUrl: 'https://mangapill.com',
    iconColor: '#10b981',
    badge: 'Ultra Rápido',
    languages: ['en'],
    catalogEstimate: '+20.000 títulos',
    supportedFeatures: {
      search: true,
      filters: true,
      coverImages: true,
      multipleLanguages: false,
      chaptersDeduplication: true,
      webtoons: true,
      nsfwFilter: true
    }
  },
  {
    id: 'mangafire',
    name: 'MangaFire',
    description: 'Acervo massivo multi-idioma com atualizações frequentes e suporte a webtoons e mangás ocidentais.',
    version: '1.0.0',
    isAvailable: true,
    type: 'live_api',
    websiteUrl: 'https://mangafire.to',
    iconColor: '#f97316',
    badge: 'MF',
    languages: ['en', 'pt-br', 'es', 'ja'],
    catalogEstimate: '80.000+ títulos',
    supportedFeatures: {
      search: true,
      filters: true,
      coverImages: true,
      multipleLanguages: true,
      chaptersDeduplication: true,
      webtoons: true,
      nsfwFilter: true
    }
  },
  {
    id: 'mangaball',
    name: 'MangaBall',
    description: 'Repositório focado em webtoons e manhwas com indexação de traduções multi-idioma.',
    version: '1.0.0',
    isAvailable: true,
    type: 'live_api',
    websiteUrl: 'https://mangaball.net',
    iconColor: '#8b5cf6',
    badge: 'MB',
    languages: ['en', 'pt-br', 'es'],
    catalogEstimate: '45.000+ títulos',
    supportedFeatures: {
      search: true,
      filters: true,
      coverImages: true,
      multipleLanguages: true,
      chaptersDeduplication: true,
      webtoons: true,
      nsfwFilter: true
    }
  }
];

export const DEFAULT_SOURCE_CONFIGS: Record<string, SourceConfig> = {
  comick: { id: 'comick', enabled: true, priority: 0 },
  mangadex: { id: 'mangadex', enabled: true, priority: 1 },
  weebcentral: { id: 'weebcentral', enabled: true, priority: 2 },
  mangapill: { id: 'mangapill', enabled: true, priority: 3 },
  mangafire: { id: 'mangafire', enabled: true, priority: 4 },
  mangaball: { id: 'mangaball', enabled: true, priority: 5 }
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyListeners() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.warn('[ExtensionService] Listener error:', e);
    }
  });
}

class ExtensionServiceImpl {
  private configs: Record<string, SourceConfig> = { ...DEFAULT_SOURCE_CONFIGS };
  private pingResults: Record<string, SourcePingResult> = {};
  private sourcesMeta: MangaSourceInfo[] = [...FALLBACK_SOURCES_META];
  private isLoaded = false;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed === 'object' && parsed !== null) {
          // Merge with defaults in case new sources (like mangafire and mangaball) are added
          this.configs = {
            ...DEFAULT_SOURCE_CONFIGS,
            ...parsed,
            mangafire: parsed.mangafire || DEFAULT_SOURCE_CONFIGS.mangafire,
            mangaball: parsed.mangaball || DEFAULT_SOURCE_CONFIGS.mangaball
          };
        }
      }

      // Load cached pings
      const cachedPings = localStorage.getItem(PING_CACHE_KEY);
      if (cachedPings) {
        this.pingResults = JSON.parse(cachedPings) || {};
      }
    } catch (e) {
      console.warn('[ExtensionService] Failed to load config from localStorage:', e);
      this.configs = { ...DEFAULT_SOURCE_CONFIGS };
    }
    this.isLoaded = true;
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.configs));
      localStorage.setItem(PING_CACHE_KEY, JSON.stringify(this.pingResults));
    } catch (e) {
      console.warn('[ExtensionService] Failed to save config to localStorage:', e);
    }
    notifyListeners();
  }

  public subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  public getConfigs(): Record<string, SourceConfig> {
    return { ...this.configs };
  }

  /**
   * Retrieves sources metadata, seamlessly merging live API responses with fallback metadata
   * to guarantee that all 6 sources (including MangaFire and MangaBall) are always present.
   */
  public async getSourcesMeta(): Promise<MangaSourceInfo[]> {
    try {
      const liveSources = await MangaApi.getSources();
      if (Array.isArray(liveSources) && liveSources.length > 0) {
        const map = new Map<string, MangaSourceInfo>();
        FALLBACK_SOURCES_META.forEach(s => map.set(s.id, s));
        liveSources.forEach(s => map.set(s.id, { ...map.get(s.id), ...s }));
        this.sourcesMeta = Array.from(map.values());

        // Auto-register any newly discovered dynamic extensions into configs
        let configChanged = false;
        const liveIds = new Set(this.sourcesMeta.map(s => s.id));
        const maxPriority = Object.values(this.configs).reduce((max, c) => Math.max(max, c.priority), -1);
        let nextPriority = maxPriority + 1;

        for (const s of this.sourcesMeta) {
          if (!this.configs[s.id]) {
            this.configs[s.id] = { id: s.id, enabled: true, priority: nextPriority++ };
            configChanged = true;
          }
        }

        // Prune uninstalled dynamic sources from configs
        for (const key of Object.keys(this.configs)) {
          if (!DEFAULT_SOURCE_CONFIGS[key] && !liveIds.has(key)) {
            delete this.configs[key];
            delete this.pingResults[key];
            configChanged = true;
          }
        }

        if (configChanged) {
          this.saveToStorage();
        }
        return this.sourcesMeta;
      }
    } catch (err) {
      console.warn('[ExtensionService] Using fallback sources metadata:', err);
    }
    return this.sourcesMeta;
  }

  /**
   * Return list of enabled source IDs sorted by user priority
   */
  public getEnabledSourceIds(): string[] {
    const entries = Object.values(this.configs).filter(c => c.enabled);
    if (entries.length === 0) {
      // Safety fallback: at least one source must be active
      return ['comick', 'mangadex', 'weebcentral', 'mangapill', 'mangafire', 'mangaball'];
    }
    entries.sort((a, b) => a.priority - b.priority);
    return entries.map(c => c.id);
  }

  public isSourceEnabled(sourceId: string): boolean {
    return Boolean(this.configs[sourceId]?.enabled ?? true);
  }

  public toggleSource(sourceId: string, forceEnabled?: boolean): { success: boolean; message?: string } {
    const current = this.configs[sourceId] || { id: sourceId, enabled: true, priority: 99 };
    const nextVal = forceEnabled !== undefined ? forceEnabled : !current.enabled;

    // Safety guard: cannot disable the last active source
    if (!nextVal) {
      const activeCount = Object.values(this.configs).filter(c => c.enabled).length;
      if (activeCount <= 1 && current.enabled) {
        return {
          success: false,
          message: 'Pelo menos uma extensão de mangá deve permanecer ativa para permitir pesquisas e catálogo.'
        };
      }
    }

    this.configs = {
      ...this.configs,
      [sourceId]: {
        ...current,
        enabled: nextVal
      }
    };
    this.saveToStorage();
    return { success: true };
  }

  public movePriority(sourceId: string, direction: 'up' | 'down') {
    const all = Object.values(this.configs).sort((a, b) => a.priority - b.priority);
    const index = all.findIndex(item => item.id === sourceId);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      const prev = all[index - 1];
      const current = all[index];
      const tempP = prev.priority;
      prev.priority = current.priority;
      current.priority = tempP;
    } else if (direction === 'down' && index < all.length - 1) {
      const next = all[index + 1];
      const current = all[index];
      const tempP = next.priority;
      next.priority = current.priority;
      current.priority = tempP;
    }

    const updated: Record<string, SourceConfig> = {};
    all.forEach((item, idx) => {
      updated[item.id] = { ...item, priority: idx };
    });
    this.configs = updated;
    this.saveToStorage();
  }

  public enableAll() {
    const updated: Record<string, SourceConfig> = {};
    for (const [key, conf] of Object.entries(this.configs)) {
      updated[key] = { ...conf, enabled: true };
    }
    this.configs = updated;
    this.saveToStorage();
  }

  public resetToDefaults() {
    this.configs = { ...DEFAULT_SOURCE_CONFIGS };
    this.saveToStorage();
  }

  public getPingResult(sourceId: string): SourcePingResult | undefined {
    return this.pingResults[sourceId];
  }

  public getAllPingResults(): Record<string, SourcePingResult> {
    return { ...this.pingResults };
  }

  public async pingSource(sourceId: string): Promise<SourcePingResult> {
    try {
      const res = await MangaApi.pingSource(sourceId);
      this.pingResults[sourceId] = res;
      this.saveToStorage();
      return res;
    } catch (err) {
      const fallback: SourcePingResult = {
        sourceId,
        status: 'offline',
        latencyMs: 0,
        error: (err as Error).message,
        checkedAt: Date.now()
      };
      this.pingResults[sourceId] = fallback;
      this.saveToStorage();
      return fallback;
    }
  }

  public async pingAllSources(): Promise<Record<string, SourcePingResult>> {
    try {
      const list = await MangaApi.pingAllSources();
      const updated: Record<string, SourcePingResult> = {};
      for (const item of list) {
        updated[item.sourceId] = item;
      }
      this.pingResults = {
        ...this.pingResults,
        ...updated
      };
      this.saveToStorage();
      return this.pingResults;
    } catch {
      return this.pingResults;
    }
  }

  /**
   * Helper to query specifically MangaBall via backend federated search endpoint
   */
  public async queryMangaBall(query: string, options?: { page?: number; limit?: number }) {
    return MangaApi.search(query, {
      source: 'mangaball',
      page: options?.page,
      limit: options?.limit
    });
  }

  /**
   * Helper to query specifically MangaFire via backend federated search endpoint
   */
  public async queryMangaFire(query: string, options?: { page?: number; limit?: number }) {
    return MangaApi.search(query, {
      source: 'mangafire',
      page: options?.page,
      limit: options?.limit
    });
  }

  public async getRepos(): Promise<ExtensionRepo[]> {
    return MangaApi.getExtensionRepos();
  }

  public async addRepo(url: string): Promise<ExtensionRepo> {
    return MangaApi.addExtensionRepo(url);
  }

  public async removeRepo(url: string): Promise<void> {
    await MangaApi.removeExtensionRepo(url);
  }

  public async installExtension(manifest: Partial<DynamicExtensionManifest>): Promise<DynamicExtensionManifest> {
    const installed = await MangaApi.installExtension(manifest);
    const maxPriority = Object.values(this.configs).reduce((max, c) => Math.max(max, c.priority), -1);
    this.configs = {
      ...this.configs,
      [installed.id]: {
        id: installed.id,
        enabled: true,
        priority: this.configs[installed.id]?.priority ?? maxPriority + 1
      }
    };
    this.saveToStorage();
    await this.getSourcesMeta();
    return installed;
  }

  public async updateMirror(sourceId: string, baseUrl: string | null): Promise<DynamicExtensionManifest> {
    const updated = await MangaApi.updateExtensionMirror(sourceId, baseUrl);
    delete this.pingResults[sourceId];
    this.saveToStorage();
    await this.getSourcesMeta();
    return updated;
  }

  public async uninstallExtension(sourceId: string): Promise<void> {
    await MangaApi.uninstallExtension(sourceId);
    const nextConfigs = { ...this.configs };
    delete nextConfigs[sourceId];
    this.configs = nextConfigs;
    delete this.pingResults[sourceId];
    this.saveToStorage();
    await this.getSourcesMeta();
  }

  public async detectSite(payload: {
    url: string;
    query?: string;
    template?: 'madara' | 'themesia' | 'custom_html';
    selectors?: CustomHtmlSelectors;
  }): Promise<SiteDetectionResult> {
    return MangaApi.detectExtensionSite(payload);
  }

  public async syncAllRepos(): Promise<RepoSyncSummary> {
    const summary = await MangaApi.syncAllExtensionRepos();
    await this.getSourcesMeta();
    return summary;
  }

  public async probeMirrors(sourceId: string, baseUrl?: string): Promise<MirrorProbeCandidate[]> {
    return MangaApi.probeExtensionMirrors(sourceId, baseUrl);
  }

  public getHealthSummary(sourceIds?: string[]): {
    online: number;
    degraded: number;
    offline: number;
    cloudflare: number;
    untested: number;
  } {
    const targetIds = sourceIds || this.sourcesMeta.map(s => s.id);
    let online = 0;
    let degraded = 0;
    let offline = 0;
    let cloudflare = 0;
    let untested = 0;

    for (const id of targetIds) {
      const p = this.pingResults[id];
      if (!p) {
        untested++;
      } else if (p.status === 'online' && !p.errorCode) {
        online++;
      } else if (p.status === 'degraded' || p.errorCode === 'layout') {
        degraded++;
      } else {
        offline++;
        if (p.errorCode === 'cloudflare') {
          cloudflare++;
        }
      }
    }

    return { online, degraded, offline, cloudflare, untested };
  }
}

export const ExtensionService = new ExtensionServiceImpl();
