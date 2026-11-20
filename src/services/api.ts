import {
  Manga,
  Chapter,
  MangaPage,
  MangaSourceInfo,
  DynamicExtensionManifest,
  ExtensionRepo,
  RelayMode,
  RelayStatus,
  CustomHtmlSelectors,
  SiteDetectionResult,
  RepoSyncSummary,
  MirrorProbeCandidate
} from '../types/manga.js';

export interface SearchResponse {
  success: boolean;
  query: string;
  total: number;
  sourcesQueried: string[];
  data: Manga[];
}

export interface RecommendationFeedResponse {
  success: boolean;
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
}

export type SimilarityCategory = 'twin_premise' | 'same_dynamic' | 'same_vibe';

export interface DetectedTropeTag {
  tag: string;
  votes?: number;
  source: 'mangaupdates' | 'anilist' | 'mal';
}

export interface HybridSimilarityApiResponse {
  matches: Array<{
    manga: Manga;
    similarityScore: number;
    category: SimilarityCategory;
    sharedGenres: string[];
    plotThemes: string[];
    matchExplanation: string;
    synopsisSimilarity: number;
    isSameAuthor: boolean;
    isAnilistRec?: boolean;
    aiPowered?: boolean;
  }>;
  corePremise?: string;
  microTropes: string[];
  anilistTags: string[];
  detectedTags?: DetectedTropeTag[];
  aiPowered: boolean;
}

export interface HybridPersonalizedApiResponse {
  matches: Array<{
    manga: Manga;
    affinityScore: number;
    matchReasons: string[];
    aiPowered?: boolean;
  }>;
  aiPowered: boolean;
  profileSummary?: string;
}

const MAX_API_CACHE = 80;

interface ApiCacheEntry {
  expiresAt: number;
  value: unknown;
}

const apiResponseCache = new Map<string, ApiCacheEntry>();
const apiInFlight = new Map<string, Promise<unknown>>();

function getCachedValue<T>(key: string): T | undefined {
  const hit = apiResponseCache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    apiResponseCache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function setCachedValue<T>(key: string, value: T, ttlMs: number): T {
  if (ttlMs <= 0) return value;
  if (apiResponseCache.size >= MAX_API_CACHE) {
    const oldestKey = apiResponseCache.keys().next().value;
    if (oldestKey !== undefined) {
      apiResponseCache.delete(oldestKey);
    }
  }
  apiResponseCache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

function coalesceGet<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  if (ttlMs > 0) {
    const cached = getCachedValue<T>(key);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
  }

  const pending = apiInFlight.get(key) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  const promise = fetcher()
    .then(result => {
      if (ttlMs > 0) {
        setCachedValue(key, result, ttlMs);
      }
      return result;
    })
    .finally(() => {
      if (apiInFlight.get(key) === promise) {
        apiInFlight.delete(key);
      }
    });

  apiInFlight.set(key, promise);
  return promise;
}

function invalidateSourcesCache() {
  apiResponseCache.delete('sources');
  for (const key of apiResponseCache.keys()) {
    if (
      key.startsWith('featured:') ||
      key.startsWith('search:') ||
      key.startsWith('catalog:')
    ) {
      apiResponseCache.delete(key);
    }
  }
}

export const MangaApi = {
  async getSources(): Promise<MangaSourceInfo[]> {
    return coalesceGet('sources', 60_000, async () => {
      const res = await fetch('/api/sources');
      if (!res.ok) throw new Error('Falha ao obter fontes de mangá');
      const json = await res.json();
      return json.data || [];
    });
  },

  async pingSource(sourceId: string): Promise<import('../types/manga.js').SourcePingResult> {
    const res = await fetch(`/api/sources/${encodeURIComponent(sourceId)}/ping`);
    if (!res.ok) throw new Error(`Falha ao sondar fonte ${sourceId}`);
    const json = await res.json();
    return json.data;
  },

  async pingAllSources(): Promise<import('../types/manga.js').SourcePingResult[]> {
    return coalesceGet('ping:all', 0, async () => {
      const res = await fetch('/api/sources/ping/all');
      if (!res.ok) throw new Error('Falha ao sondar fontes');
      const json = await res.json();
      return json.data || [];
    });
  },

  async getSourceCatalog(
    sourceId: string,
    options?: {
      mode?: 'popular' | 'latest';
      page?: number;
      limit?: number;
      includeAdult?: boolean;
      onlyAvailable?: boolean;
      genre?: string;
    }
  ): Promise<{
    sourceId: string;
    mode: 'popular' | 'latest';
    page: number;
    total: number;
    hasMore: boolean;
    data: Manga[];
  }> {
    const params = new URLSearchParams();
    params.set('mode', options?.mode === 'latest' ? 'latest' : 'popular');
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.includeAdult) params.set('includeAdult', 'true');
    if (options?.onlyAvailable === false) params.set('onlyAvailable', 'false');
    if (options?.genre && options.genre !== 'all') params.set('genre', options.genre);

    const qs = params.toString();
    const url = `/api/sources/${encodeURIComponent(sourceId)}/catalog?${qs}`;
    return coalesceGet(`catalog:${url}`, 20_000, async () => {
      const res = await fetch(url);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Falha ao explorar catálogo de ${sourceId}`);
      }
      return await res.json();
    });
  },

  async getExtensionRepos(): Promise<ExtensionRepo[]> {
    const res = await fetch('/api/extensions/repos');
    if (!res.ok) throw new Error('Falha ao carregar repositórios de extensões');
    const json = await res.json();
    return json.data || [];
  },

  async addExtensionRepo(url: string): Promise<ExtensionRepo> {
    const res = await fetch('/api/extensions/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error || `Falha ao adicionar repositório (${res.status})`);
    }
    return json.data;
  },

  async removeExtensionRepo(url: string): Promise<void> {
    const res = await fetch(`/api/extensions/repos?url=${encodeURIComponent(url)}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Falha ao remover repositório');
  },

  async getInstalledExtensions(): Promise<DynamicExtensionManifest[]> {
    const res = await fetch('/api/extensions/installed');
    if (!res.ok) throw new Error('Falha ao listar extensões instaladas');
    const json = await res.json();
    return json.data || [];
  },

  async installExtension(manifest: Partial<DynamicExtensionManifest>): Promise<DynamicExtensionManifest> {
    const res = await fetch('/api/extensions/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifest })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error || `Falha ao instalar extensão (${res.status})`);
    }
    invalidateSourcesCache();
    return json.data;
  },

  async updateExtensionMirror(id: string, baseUrl: string | null): Promise<DynamicExtensionManifest> {
    const res = await fetch(`/api/extensions/${encodeURIComponent(id)}/mirror`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error || `Falha ao atualizar espelho (${res.status})`);
    }
    invalidateSourcesCache();
    return json.data;
  },

  async uninstallExtension(id: string): Promise<void> {
    const res = await fetch(`/api/extensions/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error || `Falha ao desinstalar extensão (${res.status})`);
    }
    invalidateSourcesCache();
  },

  async detectExtensionSite(payload: {
    url: string;
    query?: string;
    template?: 'madara' | 'themesia' | 'custom_html';
    selectors?: CustomHtmlSelectors;
  }): Promise<SiteDetectionResult> {
    const res = await fetch('/api/extensions/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error || `Falha ao analisar site (${res.status})`);
    }
    return json.data;
  },

  async syncAllExtensionRepos(): Promise<RepoSyncSummary> {
    const res = await fetch('/api/extensions/repos/sync-all', { method: 'POST' });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error || `Falha ao sincronizar repositórios (${res.status})`);
    }
    return json.data;
  },

  async probeExtensionMirrors(id: string, baseUrl?: string): Promise<MirrorProbeCandidate[]> {
    const res = await fetch(`/api/extensions/${encodeURIComponent(id)}/probe-mirrors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error || `Falha ao testar espelhos (${res.status})`);
    }
    return json.data || [];
  },

  async getFeatured(options?: { sources?: string[] }): Promise<Manga[]> {
    const params = new URLSearchParams();
    if (options?.sources && options.sources.length > 0) {
      params.set('sources', options.sources.join(','));
    }
    const qs = params.toString();
    const url = qs ? `/api/manga/featured?${qs}` : '/api/manga/featured';
    return coalesceGet(`featured:${qs}`, 30_000, async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao obter destaques');
      const json = await res.json();
      return json.data || [];
    });
  },

  async search(query: string, options?: {
    source?: string;
    sources?: string[];
    genre?: string;
    genres?: string[];
    demographic?: string;
    type?: string;
    status?: string;
    language?: string;
    limit?: number;
    offset?: number;
    page?: number;
    includeAdult?: boolean;
    onlyAvailable?: boolean;
  }): Promise<SearchResponse> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (options?.source && options.source !== 'all') params.set('source', options.source);
    if (options?.sources && options.sources.length > 0) params.set('sources', options.sources.join(','));
    if (options?.genre && options.genre !== 'all') params.set('genre', options.genre);
    if (options?.demographic && options.demographic !== 'all') params.set('demographic', options.demographic);
    if (options?.type && options.type !== 'all') params.set('type', options.type);
    if (options?.status && options.status !== 'all') params.set('status', options.status);
    if (options?.language && options.language !== 'all') params.set('language', options.language);
    if (options?.genres && options.genres.length > 0) {
      params.set('genres', options.genres.join(','));
      if (!options?.genre) params.set('genre', options.genres[0]);
    }
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset !== undefined) params.set('offset', options.offset.toString());
    if (options?.page !== undefined) params.set('page', options.page.toString());
    if (options?.includeAdult) params.set('includeAdult', 'true');
    if (options?.onlyAvailable) params.set('onlyAvailable', 'true');

    const qs = params.toString();
    return coalesceGet(`search:${qs}`, 20_000, async () => {
      const res = await fetch(`/api/search?${qs}`);
      if (!res.ok) throw new Error('Falha ao pesquisar mangás');
      return await res.json();
    });
  },

  async getMangaDetails(internalId: string): Promise<Manga> {
    return coalesceGet(`details:${internalId}`, 45_000, async () => {
      const res = await fetch(`/api/manga/${encodeURIComponent(internalId)}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || (res.status === 404 ? 'Mangá não encontrado' : `Falha ao carregar detalhes (código ${res.status})`));
      }
      const json = await res.json();
      return json.data;
    });
  },

  async getChapters(
    internalMangaId: string,
    options?: {
      lang?: string;
      order?: 'asc' | 'desc';
      deduplicate?: boolean;
      title?: string;
      altTitles?: string[];
      forceFederate?: boolean;
    }
  ): Promise<Chapter[]> {
    const params = new URLSearchParams();
    if (options?.lang) params.set('lang', options.lang);
    if (options?.order) params.set('order', options.order);
    if (options?.deduplicate !== undefined) params.set('deduplicate', String(options.deduplicate));
    if (options?.title) params.set('title', options.title);
    if (options?.altTitles && options.altTitles.length > 0) {
      params.set('altTitles', options.altTitles.slice(0, 6).join('||'));
    }
    if (options?.forceFederate) params.set('forceFederate', 'true');

    const qs = params.toString();
    const url = `/api/manga/${encodeURIComponent(internalMangaId)}/chapters?${qs}`;
    const ttlMs = options?.forceFederate ? 0 : 30_000;
    return coalesceGet(`chapters:${internalMangaId}:${qs}`, ttlMs, async () => {
      const res = await fetch(url);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Falha ao carregar capítulos (código ${res.status})`);
      }
      const json = await res.json();
      return json.data || [];
    });
  },

  async getChapterPages(internalChapterId: string): Promise<MangaPage[]> {
    return coalesceGet(`pages:${internalChapterId}`, 60_000, async () => {
      const res = await fetch(`/api/chapters/${encodeURIComponent(internalChapterId)}/pages`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Falha ao carregar páginas do capítulo (código ${res.status})`);
      }
      const json = await res.json();
      return json.data || [];
    });
  },

  async getRecommendationFeed(): Promise<RecommendationFeedResponse> {
    const res = await fetch('/api/recommendation-feed');
    if (!res.ok) throw new Error('Falha ao obter feed de recomendação');
    return await res.json();
  },

  async getRelatedRecommendations(manga: { id: string; genres?: string[]; authors?: string[] }): Promise<Manga[]> {
    try {
      const primaryGenre = manga.genres && manga.genres.length > 0 ? manga.genres[0] : '';
      if (primaryGenre) {
        const searchRes = await this.search('', { genre: primaryGenre, limit: 10 });
        const filtered = (searchRes.data || []).filter(m => m.id !== manga.id);
        if (filtered.length >= 3) return filtered.slice(0, 8);
      }
      const featured = await this.getFeatured();
      return featured.filter(m => m.id !== manga.id).slice(0, 8);
    } catch {
      return [];
    }
  },

  async getHybridSimilarMangas(payload: {
    targetManga: {
      id: string;
      title: string;
      altTitles?: string[];
      synopsis?: string;
      genres?: string[];
      authors?: string[];
      publicationInfo?: { country?: string; demographic?: string };
    };
    language?: string;
    localCandidates?: Manga[];
    ignoredIds?: string[];
    ignoredTitles?: string[];
    focusTags?: string[];
    focusQuery?: string;
    limit?: number;
  }): Promise<HybridSimilarityApiResponse> {
    const res = await fetch('/api/similarity/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Falha ao buscar obras similares');
    const json = await res.json();
    return json.data;
  },

  async getHybridPersonalized(payload: {
    favorites: Array<{
      mangaId: string;
      title: string;
      genres?: string[];
      userScore?: number;
      userCategory?: string;
      synopsis?: string;
    }>;
    ignored: Array<{ mangaId: string; title: string }>;
    language?: string;
    hideLibrary?: boolean;
    limit?: number;
  }): Promise<HybridPersonalizedApiResponse> {
    const res = await fetch('/api/recommendations/personalized', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Falha ao gerar recomendações personalizadas');
    const json = await res.json();
    return json.data;
  },

  async resolveLibraryTitles(
    items: Array<{ mangaId: string; title: string }>
  ): Promise<Record<string, { altTitles: string[]; authors?: string[] }>> {
    if (!items || items.length === 0) return {};
    const res = await fetch('/api/library/resolve-titles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    if (!res.ok) throw new Error('Falha ao resolver títulos alternativos da biblioteca');
    const json = await res.json();
    return json.data || {};
  },

  async getRelayStatus(): Promise<RelayStatus> {
    const res = await fetch('/api/relay/status');
    if (!res.ok) throw new Error('Falha ao consultar status da Ponte Residencial');
    const json = await res.json();
    return json.data;
  },

  async updateRelayConfig(patch: {
    mode?: RelayMode;
    customProxyUrl?: string | null;
  }): Promise<RelayStatus> {
    const res = await fetch('/api/relay/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error || 'Falha ao atualizar configuração da Ponte Residencial');
    }
    return json.data;
  },

  async rotateRelayToken(): Promise<RelayStatus> {
    const res = await fetch('/api/relay/token/rotate', { method: 'POST' });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error || 'Falha ao rotacionar token');
    }
    return json.data;
  },

  async disconnectRelay(): Promise<RelayStatus> {
    const res = await fetch('/api/relay/disconnect', { method: 'POST' });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error || 'Falha ao desconectar ponte');
    }
    return json.data;
  },

  async testRelay(
    url?: string
  ): Promise<{ ok: boolean; status: number; latencyMs: number; bytes: number }> {
    const res = await fetch('/api/relay/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error || 'Falha no teste da Ponte Residencial');
    }
    return json.data;
  }
};
