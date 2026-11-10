import { Manga, FavoriteManga, ReadingProgress } from '../types/manga.js';
import { HistoryService } from './history.js';
import { MangaApi } from './api.js';

export interface GenreStat {
  name: string;
  count: number;
  percentage: number;
}

export interface ReaderDNA {
  topGenres: GenreStat[];
  topDemographics: Array<{ name: string; count: number }>;
  topAuthors: string[];
  totalAnalyzed: number;
  dominantMood: string;
  sampleInspirations: string[];
}

export interface RecommendationMatch {
  manga: Manga;
  affinityScore: number; // 0-100 percentage
  matchReasons: string[];
  isInLibrary: boolean;
}

export interface SimilarMangaMatch {
  manga: Manga;
  similarityScore: number; // 0-100 percentage
  sharedGenres: string[];
  sharedDemographic?: string;
  isSameAuthor: boolean;
  isInLibrary: boolean;
}

// Canonical genre normalization map for consistent affinity calculation
const CANONICAL_GENRE_NAMES: Record<string, string> = {
  action: 'Ação',
  'ação': 'Ação',
  fantasy: 'Fantasia',
  fantasia: 'Fantasia',
  adventure: 'Aventura',
  aventura: 'Aventura',
  comedy: 'Comédia',
  'comédia': 'Comédia',
  drama: 'Drama',
  mystery: 'Mistério',
  'mistério': 'Mistério',
  psychological: 'Psicológico',
  'psicológico': 'Psicológico',
  horror: 'Terror',
  terror: 'Terror',
  romance: 'Romance',
  'sci-fi': 'Ficção Científica',
  scifi: 'Ficção Científica',
  supernatural: 'Sobrenatural',
  sobrenatural: 'Sobrenatural',
  'slice of life': 'Cotidiano',
  sports: 'Esportes',
  esportes: 'Esportes',
  historical: 'Histórico',
  'histórico': 'Histórico',
  seinen: 'Seinen',
  shounen: 'Shounen',
  shonen: 'Shounen',
  shoujo: 'Shoujo',
  josei: 'Josei',
  isekai: 'Isekai',
  manhwa: 'Manhwa',
  webtoon: 'Webtoon',
  magic: 'Magia',
  martial: 'Artes Marciais',
  'martial arts': 'Artes Marciais'
};

function normalizeGenreName(g: string): string {
  const clean = g.trim().toLowerCase();
  for (const [key, val] of Object.entries(CANONICAL_GENRE_NAMES)) {
    if (clean === key || clean.includes(key)) {
      return val;
    }
  }
  // Title-case fallback
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function cleanTitleForMatch(t?: string): string {
  return (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export const RecommendationService = {
  /**
   * Checks whether a manga is already present in the user's library (favorites or reading history)
   */
  isMangaInLibrary(manga: { id: string; title?: string; altTitles?: string[] }): boolean {
    const favorites = HistoryService.getFavorites();
    const history = HistoryService.getHistory();

    const favIds = new Set(favorites.map(f => f.mangaId));
    const histIds = new Set(history.map(h => h.mangaId));

    if (favIds.has(manga.id) || histIds.has(manga.id)) return true;

    const normTitle = cleanTitleForMatch(manga.title);
    if (!normTitle) return false;

    for (const f of favorites) {
      if (cleanTitleForMatch(f.title) === normTitle) return true;
    }
    for (const h of history) {
      if (cleanTitleForMatch(h.mangaTitle) === normTitle) return true;
    }

    if (manga.altTitles && manga.altTitles.length > 0) {
      for (const alt of manga.altTitles) {
        const normAlt = cleanTitleForMatch(alt);
        if (normAlt) {
          for (const f of favorites) {
            if (cleanTitleForMatch(f.title) === normAlt) return true;
          }
        }
      }
    }

    return false;
  },

  /**
   * Generates the Reader DNA by mining genres, demography, and ratings
   * from the user's library and reading history.
   */
  calculateReaderDNA(): ReaderDNA {
    const favorites = HistoryService.getFavorites();
    const history = HistoryService.getHistory();

    const genreWeights: Record<string, number> = {};
    const demoCounts: Record<string, number> = {};
    const authorCounts: Record<string, number> = {};
    const inspirationTitles: string[] = [];

    // Analyze favorites (high weight: 3x, or 5x if user rated >= 8)
    favorites.forEach(fav => {
      let weight = 3;
      if (typeof fav.userScore === 'number') {
        if (fav.userScore >= 8) weight = 5;
        else if (fav.userScore <= 4) weight = 1;
      }

      if (fav.title && inspirationTitles.length < 3) {
        inspirationTitles.push(fav.title);
      }

      (fav.genres || []).forEach(g => {
        const canonical = normalizeGenreName(g);
        genreWeights[canonical] = (genreWeights[canonical] || 0) + weight;
      });

      (fav.authors || []).forEach(a => {
        if (a && a !== 'Unknown') {
          authorCounts[a] = (authorCounts[a] || 0) + 1;
        }
      });
    });

    // Analyze reading history (weight: 1x, or 2x if deep in pages/chapters)
    history.forEach(hist => {
      if (hist.mangaTitle && inspirationTitles.length < 3 && !inspirationTitles.includes(hist.mangaTitle)) {
        inspirationTitles.push(hist.mangaTitle);
      }
    });

    const totalWeight = Object.values(genreWeights).reduce((a, b) => a + b, 0);

    const sortedGenres: GenreStat[] = Object.entries(genreWeights)
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalWeight > 0 ? Math.round((count / totalWeight) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const sortedDemographics = Object.entries(demoCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const sortedAuthors = Object.entries(authorCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 5);

    // Formulate a punchy dominant mood description
    let dominantMood = 'Explorador Curioso';
    if (sortedGenres.length >= 2) {
      dominantMood = `${sortedGenres[0].name} & ${sortedGenres[1].name}`;
    } else if (sortedGenres.length === 1) {
      dominantMood = sortedGenres[0].name;
    }

    return {
      topGenres: sortedGenres,
      topDemographics: sortedDemographics,
      topAuthors: sortedAuthors,
      totalAnalyzed: favorites.length + history.length,
      dominantMood,
      sampleInspirations: inspirationTitles
    };
  },

  /**
   * Computes affinity score (0 to 100%) between a candidate manga and the user's Reader DNA
   */
  scoreAffinity(manga: Manga, dna: ReaderDNA): { score: number; reasons: string[] } {
    if (dna.topGenres.length === 0) {
      return { score: 75, reasons: ['Recomendado com base no acervo em destaque'] };
    }

    let score = 50; // Baseline
    const reasons: string[] = [];
    const matchedTopGenres: string[] = [];

    const mangaGenres = (manga.genres || []).map(normalizeGenreName);

    // Check overlap with user's top genres
    dna.topGenres.slice(0, 5).forEach((topG, idx) => {
      if (mangaGenres.includes(topG.name)) {
        matchedTopGenres.push(topG.name);
        // Higher weight for top 1-2 favorite genres
        const boost = idx === 0 ? 18 : idx === 1 ? 14 : 9;
        score += boost;
      }
    });

    if (matchedTopGenres.length > 0) {
      reasons.push(`Combina com seu gosto por ${matchedTopGenres.slice(0, 2).join(' e ')}`);
    }

    // Check author match
    if (manga.authors && manga.authors.length > 0) {
      const matchAuthor = manga.authors.find(a => dna.topAuthors.includes(a));
      if (matchAuthor) {
        score += 20;
        reasons.push(`Do mesmo autor que você já salvou (${matchAuthor})`);
      }
    }

    // Rating quality bonus
    if (manga.rating && manga.rating >= 8.0) {
      score += 6;
      reasons.push(`Avaliação alta da comunidade (★ ${manga.rating.toFixed(1)})`);
    }

    // Clamp score cleanly between 60% and 99%
    score = Math.min(Math.max(score, 60), 99);

    if (reasons.length === 0) {
      reasons.push('Sugestão popular entre leitores com perfil similar');
    }

    return { score, reasons };
  },

  /**
   * Fetches personalized recommendations powered by the reader's DNA profile
   */
  async getPersonalizedRecommendations(options?: {
    hideLibrary?: boolean;
    limit?: number;
  }): Promise<RecommendationMatch[]> {
    const hideLibrary = options?.hideLibrary !== false;
    const limit = options?.limit || 12;

    const dna = this.calculateReaderDNA();

    try {
      // Gather pool of candidates: search by user's top genres + featured
      const searchPromises: Promise<any>[] = [];

      if (dna.topGenres.length > 0) {
        // Query top 2 favorite genres
        const g1 = dna.topGenres[0]?.name;
        if (g1) {
          searchPromises.push(MangaApi.search('', { genre: g1, limit: 12, onlyAvailable: true }));
        }
        const g2 = dna.topGenres[1]?.name;
        if (g2 && g2 !== g1) {
          searchPromises.push(MangaApi.search('', { genre: g2, limit: 10, onlyAvailable: true }));
        }
      }

      // Always include featured for diversity
      searchPromises.push(MangaApi.getFeatured());

      const results = await Promise.allSettled(searchPromises);
      const pool: Manga[] = [];
      const seenIds = new Set<string>();

      results.forEach(res => {
        if (res.status === 'fulfilled') {
          const list: Manga[] = Array.isArray(res.value) ? res.value : (res.value?.data || []);
          list.forEach(m => {
            if (m && m.id && !seenIds.has(m.id) && !m.isAdult) {
              seenIds.add(m.id);
              pool.push(m);
            }
          });
        }
      });

      // Score each candidate against user's DNA
      const matches: RecommendationMatch[] = pool.map(m => {
        const inLib = this.isMangaInLibrary(m);
        const { score, reasons } = this.scoreAffinity(m, dna);
        return {
          manga: m,
          affinityScore: score,
          matchReasons: reasons,
          isInLibrary: inLib
        };
      });

      // Filter by hideLibrary if requested
      const filtered = hideLibrary ? matches.filter(m => !m.isInLibrary) : matches;

      // Sort by affinity score descending
      filtered.sort((a, b) => b.affinityScore - a.affinityScore);

      return filtered.slice(0, limit);
    } catch (err) {
      console.warn('Failed to generate personalized recommendations:', err);
      return [];
    }
  },

  /**
   * Computes granular similarity between a target manga and candidate mangas
   */
  async getSimilarMangas(targetManga: {
    id: string;
    title: string;
    genres?: string[];
    authors?: string[];
    publicationInfo?: { country?: string; demographic?: string };
  }, options?: { hideLibrary?: boolean; limit?: number }): Promise<SimilarMangaMatch[]> {
    const hideLibrary = options?.hideLibrary !== false;
    const limit = options?.limit || 8;

    const targetGenres = (targetManga.genres || []).map(normalizeGenreName);
    const targetAuthor = targetManga.authors?.[0];

    try {
      // Gather pool by searching primary & secondary genres
      const promises: Promise<any>[] = [];

      if (targetGenres.length > 0) {
        promises.push(MangaApi.search('', { genre: targetGenres[0], limit: 12, onlyAvailable: true }));
      }
      if (targetGenres.length > 1) {
        promises.push(MangaApi.search('', { genre: targetGenres[1], limit: 10, onlyAvailable: true }));
      }
      if (targetAuthor && targetAuthor !== 'Unknown') {
        promises.push(MangaApi.search(targetAuthor, { limit: 6, onlyAvailable: true }));
      }

      // Also call standard related recommendations as fallback
      promises.push(MangaApi.getRelatedRecommendations(targetManga));

      const settled = await Promise.allSettled(promises);
      const candidates: Manga[] = [];
      const seenIds = new Set<string>([targetManga.id]);

      settled.forEach(res => {
        if (res.status === 'fulfilled') {
          const list: Manga[] = Array.isArray(res.value) ? res.value : (res.value?.data || []);
          list.forEach(m => {
            if (m && m.id && !seenIds.has(m.id) && !m.isAdult) {
              seenIds.add(m.id);
              candidates.push(m);
            }
          });
        }
      });

      // Compute similarity score for each candidate
      const matches: SimilarMangaMatch[] = candidates.map(candidate => {
        const candGenres = (candidate.genres || []).map(normalizeGenreName);
        const sharedGenres = targetGenres.filter(g => candGenres.includes(g));

        let score = 55; // baseline

        // Genre overlap points
        if (sharedGenres.length >= 4) score += 32;
        else if (sharedGenres.length === 3) score += 25;
        else if (sharedGenres.length === 2) score += 18;
        else if (sharedGenres.length === 1) score += 10;

        // Same author bonus
        const isSameAuthor = Boolean(
          targetAuthor &&
          candidate.authors &&
          candidate.authors.some(a => a.toLowerCase() === targetAuthor.toLowerCase())
        );
        if (isSameAuthor) score += 22;

        // Same country / type bonus (e.g. Manhwa with Manhwa)
        if (targetManga.publicationInfo?.country && candidate.publicationInfo?.country) {
          if (targetManga.publicationInfo.country.toLowerCase() === candidate.publicationInfo.country.toLowerCase()) {
            score += 6;
          }
        }

        // Clamp cleanly between 65% and 98%
        score = Math.min(Math.max(score, 65), 98);

        return {
          manga: candidate,
          similarityScore: score,
          sharedGenres,
          sharedDemographic: candidate.publicationInfo?.demographic,
          isSameAuthor,
          isInLibrary: this.isMangaInLibrary(candidate)
        };
      });

      // Filter out library items if requested
      const filtered = hideLibrary ? matches.filter(m => !m.isInLibrary) : matches;

      // Sort highest similarity first
      filtered.sort((a, b) => b.similarityScore - a.similarityScore);

      return filtered.slice(0, limit);
    } catch (err) {
      console.warn('Failed to calculate similar mangas:', err);
      return [];
    }
  }
};
