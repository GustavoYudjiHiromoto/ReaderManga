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

  async getFeatured(): Promise<Manga[]> {
    const res = await fetch('/api/manga/featured');
    if (!res.ok) throw new Error('Falha ao obter destaques');
    const json = await res.json();
    return json.data || [];
  },

  async search(query: string, options?: { source?: string; genre?: string; limit?: number }): Promise<SearchResponse> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (options?.source && options.source !== 'all') params.set('source', options.source);
    if (options?.genre && options.genre !== 'all') params.set('genre', options.genre);
    if (options?.limit) params.set('limit', options.limit.toString());

    const res = await fetch(`/api/search?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao pesquisar mangás');
    return await res.json();
  },

  async getMangaDetails(internalId: string): Promise<Manga> {
    const res = await fetch(`/api/manga/${encodeURIComponent(internalId)}`);
    if (!res.ok) {
      if (res.status === 404) throw new Error('Mangá não encontrado');
      throw new Error('Falha ao carregar detalhes do mangá');
    }
    const json = await res.json();
    return json.data;
  },

  async getChapters(internalMangaId: string, options?: { lang?: string; order?: 'asc' | 'desc' }): Promise<Chapter[]> {
    const params = new URLSearchParams();
    if (options?.lang) params.set('lang', options.lang);
    if (options?.order) params.set('order', options.order);

    const res = await fetch(`/api/manga/${encodeURIComponent(internalMangaId)}/chapters?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar capítulos');
    const json = await res.json();
    return json.data || [];
  },

  async getChapterPages(internalChapterId: string): Promise<MangaPage[]> {
    const res = await fetch(`/api/chapters/${encodeURIComponent(internalChapterId)}/pages`);
    if (!res.ok) throw new Error('Falha ao carregar páginas do capítulo');
    const json = await res.json();
    return json.data || [];
  },

  async getRecommendationFeed(): Promise<RecommendationFeedResponse> {
    const res = await fetch('/api/recommendation-feed');
    if (!res.ok) throw new Error('Falha ao obter feed de recomendação');
    return await res.json();
  }
};
