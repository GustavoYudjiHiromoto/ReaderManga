import { Manga, Chapter, MangaPage, MangaSourceInfo } from '../types/manga.js';

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

export const MangaApi = {
  async getSources(): Promise<MangaSourceInfo[]> {
    const res = await fetch('/api/sources');
    if (!res.ok) throw new Error('Falha ao obter fontes de mangá');
    const json = await res.json();
    return json.data || [];
  },

  async pingSource(sourceId: string): Promise<import('../types/manga.js').SourcePingResult> {
    const res = await fetch(`/api/sources/${encodeURIComponent(sourceId)}/ping`);
    if (!res.ok) throw new Error(`Falha ao sondar fonte ${sourceId}`);
    const json = await res.json();
    return json.data;
  },

  async pingAllSources(): Promise<import('../types/manga.js').SourcePingResult[]> {
    const res = await fetch('/api/sources/ping/all');
    if (!res.ok) throw new Error('Falha ao sondar fontes');
    const json = await res.json();
    return json.data || [];
  },

  async getFeatured(options?: { sources?: string[] }): Promise<Manga[]> {
    const params = new URLSearchParams();
    if (options?.sources && options.sources.length > 0) {
      params.set('sources', options.sources.join(','));
    }
    const url = params.toString() ? `/api/manga/featured?${params.toString()}` : '/api/manga/featured';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Falha ao obter destaques');
    const json = await res.json();
    return json.data || [];
  },

  async search(query: string, options?: {
    source?: string;
    sources?: string[];
    genre?: string;
    genres?: string[];
    demographic?: string;
    type?: string;
    status?: string;
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
    if (options?.genres && options.genres.length > 0) {
      params.set('genres', options.genres.join(','));
      if (!options?.genre) params.set('genre', options.genres[0]);
    }
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset !== undefined) params.set('offset', options.offset.toString());
    if (options?.page !== undefined) params.set('page', options.page.toString());
    if (options?.includeAdult) params.set('includeAdult', 'true');
    if (options?.onlyAvailable) params.set('onlyAvailable', 'true');

    const res = await fetch(`/api/search?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao pesquisar mangás');
    return await res.json();
  },

  async getMangaDetails(internalId: string): Promise<Manga> {
    const res = await fetch(`/api/manga/${encodeURIComponent(internalId)}`);
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || (res.status === 404 ? 'Mangá não encontrado' : `Falha ao carregar detalhes (código ${res.status})`));
    }
    const json = await res.json();
    return json.data;
  },

  async getChapters(internalMangaId: string, options?: { lang?: string; order?: 'asc' | 'desc'; deduplicate?: boolean }): Promise<Chapter[]> {
    const params = new URLSearchParams();
    if (options?.lang) params.set('lang', options.lang);
    if (options?.order) params.set('order', options.order);
    if (options?.deduplicate !== undefined) params.set('deduplicate', String(options.deduplicate));

    const res = await fetch(`/api/manga/${encodeURIComponent(internalMangaId)}/chapters?${params.toString()}`);
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || `Falha ao carregar capítulos (código ${res.status})`);
    }
    const json = await res.json();
    return json.data || [];
  },

  async getChapterPages(internalChapterId: string): Promise<MangaPage[]> {
    const res = await fetch(`/api/chapters/${encodeURIComponent(internalChapterId)}/pages`);
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || `Falha ao carregar páginas do capítulo (código ${res.status})`);
    }
    const json = await res.json();
    return json.data || [];
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
  }
};
