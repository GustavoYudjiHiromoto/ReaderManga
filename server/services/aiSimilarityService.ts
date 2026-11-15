import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { Manga } from '../../src/types/manga.js';
import { sourceRegistry } from '../sources/SourceRegistry.js';
import { globalCache } from '../cache/CacheService.js';

export type SimilarityCategory = 'twin_premise' | 'same_dynamic' | 'same_vibe';

export interface PremiseAnalysis {
  corePremise: string;
  microTropes: string[];
  searchQueries: string[];
  knownTwinTitles: string[];
}

export interface AniListEnrichment {
  anilistId?: number;
  tags: Array<{ name: string; rank: number }>;
  communityRecs: Array<{
    title: string;
    englishTitle?: string;
    romajiTitle?: string;
    description?: string;
    genres: string[];
    rating?: number;
  }>;
  tagDiscoveryRecs?: Array<{
    title: string;
    englishTitle?: string;
    romajiTitle?: string;
    description?: string;
    genres: string[];
    tags: string[];
    rating?: number;
  }>;
}

export interface JikanEnrichment {
  malId?: number;
  themes: string[];
  demographics: string[];
  communityRecs: Array<{
    title: string;
    votes: number;
  }>;
}

export interface MangaUpdatesEnrichment {
  seriesId?: number;
  categories: Array<{ name: string; votes: number }>;
  communityRecs: Array<{ title: string; rating?: number }>;
  tagDiscoveryRecs: Array<{
    title: string;
    matchedTags: string[];
    rating?: number;
    isFocusMatch?: boolean;
  }>;
}

export interface DetectedTropeTag {
  tag: string;
  votes?: number;
  source: 'mangaupdates' | 'anilist' | 'mal';
}

export interface HybridSimilarItem {
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
}

export interface HybridSimilarResponse {
  matches: HybridSimilarItem[];
  corePremise?: string;
  microTropes: string[];
  anilistTags: string[];
  detectedTags?: DetectedTropeTag[];
  aiPowered: boolean;
}

export interface HybridPersonalizedItem {
  manga: Manga;
  affinityScore: number;
  matchReasons: string[];
  aiPowered?: boolean;
}

export interface HybridPersonalizedResponse {
  matches: HybridPersonalizedItem[];
  aiPowered: boolean;
  profileSummary?: string;
}

// Per-model cooldown circuit breaker so exhausted Free Tier quotas do not cause repeated 429 failures
const modelCooldownUntil = new Map<string, number>();

const MODEL_PRIORITY: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
  { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
  { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW }
];

function isModelInCooldown(model: string): boolean {
  const until = modelCooldownUntil.get(model);
  return typeof until === 'number' && Date.now() < until;
}

function recordModelQuotaError(model: string, errMsg: string): void {
  const isQuota =
    errMsg.includes('429') ||
    errMsg.includes('RESOURCE_EXHAUSTED') ||
    errMsg.toLowerCase().includes('quota') ||
    errMsg.toLowerCase().includes('rate limit');

  if (!isQuota) return;

  // Parse retryDelay if present (e.g. "55664s"), capped between 15m and 6h
  let cooldownMs = 30 * 60 * 1000;
  const retryMatch = errMsg.match(/"retryDelay"\s*:\s*"(\d+)s"/);
  if (retryMatch) {
    const secs = parseInt(retryMatch[1], 10);
    if (!Number.isNaN(secs) && secs > 0) {
      cooldownMs = Math.min(6 * 3600 * 1000, Math.max(15 * 60 * 1000, secs * 1000));
    }
  }
  modelCooldownUntil.set(model, Date.now() + cooldownMs);
  console.info(
    `[AISimilarity] Quota reached for ${model}; pausing AI calls for this model for ${Math.round(cooldownMs / 60000)}m and using AniList + deterministic engine.`
  );
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

async function generateStructuredJsonWithFallback<T>(
  ai: GoogleGenAI,
  prompt: string,
  responseSchema: any
): Promise<T | null> {
  for (const candidate of MODEL_PRIORITY) {
    if (isModelInCooldown(candidate.model)) {
      continue;
    }
    try {
      const response = await ai.models.generateContent({
        model: candidate.model,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
          responseMimeType: 'application/json',
          responseSchema
        }
      });
      const text = (response.text ?? '').trim();
      if (!text) continue;
      return JSON.parse(text) as T;
    } catch (err) {
      const msg = (err as Error)?.message || String(err);
      if (
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.toLowerCase().includes('quota')
      ) {
        recordModelQuotaError(candidate.model, msg);
        continue;
      }
      // For transient non-quota errors, log concise note and try next model
      console.info(`[AISimilarity] Model ${candidate.model} unavailable; trying fallback.`);
    }
  }
  return null;
}

function cleanTitle(t?: string): string {
  return (t || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function stripHtml(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const UMBRELLA_GENRES = new Set([
  'manga', 'manhwa', 'manhua', 'webtoon', 'long strip', 'adaptation', 'full color',
  'comedy', 'comedia', 'comédia',
  'romance',
  'action', 'acao', 'ação',
  'adventure', 'aventura',
  'fantasy', 'fantasia',
  'drama',
  'slice of life', 'cotidiano',
  'supernatural', 'sobrenatural',
  'seinen', 'shounen', 'shonen', 'shoujo', 'josei'
]);

const SYNOPSIS_STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her', 'was',
  'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now',
  'old', 'see', 'two', 'way', 'who', 'did', 'let', 'put', 'say', 'she', 'too', 'use', 'with',
  'that', 'this', 'from', 'they', 'been', 'have', 'were', 'what', 'when', 'make', 'like',
  'time', 'just', 'know', 'take', 'into', 'year', 'your', 'good', 'some', 'them', 'than',
  'then', 'look', 'only', 'come', 'over', 'also', 'back', 'after', 'work', 'well', 'even',
  'want', 'because', 'these', 'give', 'most', 'being', 'about', 'before', 'until', 'while',
  'where', 'suddenly', 'blue', 'every', 'story', 'manga', 'series', 'chapters', 'their',
  'there', 'which', 'would', 'could', 'other', 'life', 'lives', 'world', 'man', 'girl',
  'boy', 'guy', 'woman', 'makes', 'starts', 'begins', 'turns', 'becomes', 'together',
  'first', 'night', 'city', 'both', 'each', 'very', 'much', 'more', 'little', 'own',
  'finds', 'meets', 'ends', 'living', 'around', 'through', 'himself', 'herself', 'between',
  'still', 'always', 'never', 'really', 'things', 'something', 'someone', 'another', 'people',
  'unknown', 'show', 'less', 'sinopse', 'disponivel', 'para', 'com', 'uma', 'por', 'mais',
  'como', 'mas', 'foi', 'ele', 'ela', 'seu', 'sua', 'quando', 'muito', 'nao', 'sem', 'sobre',
  'entre', 'isso', 'este', 'esta', 'era', 'ate', 'pelo', 'pela', 'tem', 'historia', 'obra'
]);

function isUmbrellaGenre(tag: string): boolean {
  const lower = tag.trim().toLowerCase();
  return !lower || UMBRELLA_GENRES.has(lower);
}

/**
 * Extracts open-vocabulary distinctive keywords & 2-word phrases from ANY synopsis + title
 * so recommendations work for arbitrary niche tropes without hardcoding every trope.
 */
function extractOpenVocabularyTerms(input: {
  title?: string;
  altTitles?: string[];
  synopsis?: string;
}): { words: string[]; phrases: string[] } {
  const raw = `${input.title || ''} ${(input.altTitles || []).slice(0, 2).join(' ')} ${input.synopsis || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ');

  const tokens = raw.split(/\s+/).filter(w => w.length >= 4 && !SYNOPSIS_STOPWORDS.has(w) && !/^\d+$/.test(w));

  const freq = new Map<string, number>();
  for (const tok of tokens) {
    freq.set(tok, (freq.get(tok) || 0) + 1);
  }

  // Score tokens prioritizing words that repeat or are longer/specific
  const rankedWords = Array.from(freq.entries())
    .sort((a, b) => (b[1] * 2 + (b[0].length >= 6 ? 1 : 0)) - (a[1] * 2 + (a[0].length >= 6 ? 1 : 0)))
    .map(([w]) => w);

  const phraseCounts = new Map<string, number>();
  for (let i = 0; i < tokens.length - 1; i++) {
    const w1 = tokens[i];
    const w2 = tokens[i + 1];
    if (w1 !== w2 && w1.length >= 4 && w2.length >= 4) {
      const p = `${w1} ${w2}`;
      phraseCounts.set(p, (phraseCounts.get(p) || 0) + 1);
    }
  }

  const rankedPhrases = Array.from(phraseCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);

  return {
    words: rankedWords.slice(0, 14),
    phrases: rankedPhrases.slice(0, 6)
  };
}

/**
 * Queries AniList's public GraphQL API (no OAuth required) for granular tags (%),
 * community-voted recommendations, AND tag-intersection discovery across ~300+ micro-tags.
 */
async function fetchAniListEnrichment(
  titles: string[],
  fallbackGenres: string[] = []
): Promise<AniListEnrichment> {
  const cleanTitles = Array.from(
    new Set(titles.map(t => t?.trim()).filter((t): t is string => Boolean(t && t.length >= 2)))
  ).slice(0, 3);

  const cacheKey = `anilist_enrich_v2:${cleanTitle(cleanTitles[0] || fallbackGenres.join('_'))}`;
  const cached = globalCache.get<AniListEnrichment>(cacheKey);
  if (cached) return cached;

  const query = `
    query ($search: String) {
      Media(search: $search, type: MANGA, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
        id
        title { romaji english }
        genres
        tags { name rank isMediaSpoiler }
        recommendations(sort: RATING_DESC, perPage: 12) {
          nodes {
            rating
            mediaRecommendation {
              id
              type
              title { romaji english }
              description(asHtml: false)
              genres
              averageScore
              isAdult
            }
          }
        }
      }
    }
  `;

  let enrichment: AniListEnrichment = { tags: [], communityRecs: [], tagDiscoveryRecs: [] };
  let matchedMediaId: number | undefined;
  let mediaGenres: string[] = [];

  for (const candidateTitle of cleanTitles) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          query,
          variables: { search: candidateTitle }
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) continue;
      const json: any = await res.json();
      const media = json?.data?.Media;
      if (!media) continue;

      matchedMediaId = media.id;
      mediaGenres = Array.isArray(media.genres) ? media.genres.map(String) : [];

      const tags = (media.tags || [])
        .filter((t: any) => !t.isMediaSpoiler && (t.rank || 0) >= 40)
        .sort((a: any, b: any) => (b.rank || 0) - (a.rank || 0))
        .slice(0, 12)
        .map((t: any) => ({ name: String(t.name), rank: Number(t.rank || 50) }));

      const communityRecs = (media.recommendations?.nodes || [])
        .map((n: any) => n?.mediaRecommendation)
        .filter((m: any) => m && m.type === 'MANGA' && !m.isAdult)
        .map((m: any) => ({
          title: String(m.title?.english || m.title?.romaji || ''),
          englishTitle: m.title?.english ? String(m.title.english) : undefined,
          romajiTitle: m.title?.romaji ? String(m.title.romaji) : undefined,
          description: stripHtml(m.description).slice(0, 400),
          genres: Array.isArray(m.genres) ? m.genres.map(String) : [],
          rating: m.averageScore ? Number((m.averageScore / 10).toFixed(1)) : undefined
        }))
        .filter((r: any) => r.title);

      enrichment = {
        anilistId: media.id,
        tags,
        communityRecs,
        tagDiscoveryRecs: []
      };
      break;
    } catch {
      // try next title variant
    }
  }

  // AniList Tag-Intersection Discovery: works even when a manga has 0 community recs
  // or is brand new, using AniList's ~300+ community micro-tags + genre intersection!
  try {
    const rawTagsToQuery = enrichment.tags
      .slice(0, 4)
      .map(t => t.name);

    // Bridge common MangaDex/Comick niche tags to AniList tag names when AniList tags are sparse
    const ANILIST_TAG_BRIDGE: Record<string, string> = {
      'office workers': 'Work',
      'workplace': 'Work',
      'adult cast': 'Work',
      'gyaru': 'Gyaru',
      'delinquents': 'Delinquents',
      'monster girls': 'Monster Girl',
      'time travel': 'Time Manipulation',
      'reincarnation': 'Reincarnation',
      'villainess': 'Villainess',
      'crossdressing': 'Crossdressing',
      'genderswap': 'Gender Bending',
      'cooking': 'Food',
      'medical': 'Medicine',
      'childcare': 'Iyashikei'
    };

    if (rawTagsToQuery.length < 2) {
      for (const fg of fallbackGenres) {
        const mapped = ANILIST_TAG_BRIDGE[fg.toLowerCase()];
        if (mapped && !rawTagsToQuery.includes(mapped)) {
          rawTagsToQuery.push(mapped);
        }
      }
    }

    const coreGenres = Array.from(
      new Set([...mediaGenres, ...fallbackGenres].filter(g =>
        ['Comedy', 'Romance', 'Ecchi', 'Slice of Life', 'Action', 'Fantasy', 'Drama', 'Psychological', 'Sci-Fi', 'Supernatural', 'Mystery', 'Horror', 'Sports'].includes(g)
      ))
    ).slice(0, 2);

    if (rawTagsToQuery.length > 0 || coreGenres.length >= 2) {
      const tagDiscoveryQuery = `
        query ($tags: [String], $genres: [String]) {
          Page(perPage: 14) {
            media(type: MANGA, tag_in: $tags, genre_in: $genres, isAdult: false, sort: [SCORE_DESC, POPULARITY_DESC]) {
              id
              title { romaji english }
              description(asHtml: false)
              genres
              tags { name rank isMediaSpoiler }
              averageScore
            }
          }
        }
      `;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const tagRes = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          query: tagDiscoveryQuery,
          variables: {
            tags: rawTagsToQuery.length > 0 ? rawTagsToQuery : undefined,
            genres: coreGenres.length > 0 ? coreGenres : undefined
          }
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (tagRes.ok) {
        const tagJson: any = await tagRes.json();
        const mediaList: any[] = tagJson?.data?.Page?.media || [];
        enrichment.tagDiscoveryRecs = mediaList
          .filter(m => m && m.id !== matchedMediaId)
          .map(m => ({
            title: String(m.title?.english || m.title?.romaji || ''),
            englishTitle: m.title?.english ? String(m.title.english) : undefined,
            romajiTitle: m.title?.romaji ? String(m.title.romaji) : undefined,
            description: stripHtml(m.description).slice(0, 400),
            genres: Array.isArray(m.genres) ? m.genres.map(String) : [],
            tags: Array.isArray(m.tags)
              ? m.tags.filter((t: any) => !t.isMediaSpoiler && (t.rank || 0) >= 45).slice(0, 6).map((t: any) => String(t.name))
              : [],
            rating: m.averageScore ? Number((m.averageScore / 10).toFixed(1)) : undefined
          }))
          .filter(r => r.title);
      }
    }
  } catch {
    // non-fatal
  }

  globalCache.set(cacheKey, enrichment, 6 * 3600);
  return enrichment;
}

/**
 * Secondary community graph: Jikan / MyAnimeList public API (no key needed)
 * Provides MAL themes (Workplace, Adult Cast, etc.) and user-voted MAL recommendations.
 */
async function fetchJikanEnrichment(titles: string[]): Promise<JikanEnrichment> {
  const candidateTitle = titles.find(t => t && t.trim().length >= 3)?.trim();
  if (!candidateTitle) return { themes: [], demographics: [], communityRecs: [] };

  const cacheKey = `jikan_enrich_v1:${cleanTitle(candidateTitle)}`;
  const cached = globalCache.get<JikanEnrichment>(cacheKey);
  if (cached) return cached;

  const empty: JikanEnrichment = { themes: [], demographics: [], communityRecs: [] };
  try {
    const ctrl1 = new AbortController();
    const t1 = setTimeout(() => ctrl1.abort(), 3500);
    const searchRes = await fetch(
      `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(candidateTitle)}&limit=2&sfw=true`,
      { signal: ctrl1.signal }
    );
    clearTimeout(t1);
    if (!searchRes.ok) return empty;
    const searchJson: any = await searchRes.json();
    const first = Array.isArray(searchJson?.data) ? searchJson.data[0] : null;
    if (!first?.mal_id) return empty;

    const themes = Array.isArray(first.themes) ? first.themes.map((t: any) => String(t.name)) : [];
    const demographics = Array.isArray(first.demographics) ? first.demographics.map((d: any) => String(d.name)) : [];

    let communityRecs: Array<{ title: string; votes: number }> = [];
    try {
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 3500);
      const recRes = await fetch(
        `https://api.jikan.moe/v4/manga/${first.mal_id}/recommendations`,
        { signal: ctrl2.signal }
      );
      clearTimeout(t2);
      if (recRes.ok) {
        const recJson: any = await recRes.json();
        communityRecs = (recJson?.data || [])
          .slice(0, 10)
          .map((r: any) => ({
            title: String(r?.entry?.title || ''),
            votes: Number(r?.votes || 1)
          }))
          .filter((r: any) => r.title);
      }
    } catch {
      // non-fatal
    }

    const result: JikanEnrichment = { malId: first.mal_id, themes, demographics, communityRecs };
    globalCache.set(cacheKey, result, 6 * 3600);
    return result;
  } catch {
    return empty;
  }
}

const MU_NOISE_CATEGORIES = new Set([
  '21st century', '20th century', 'modern era', 'modern day', 'japan', 'tokyo',
  'urban setting', 'adapted to anime', 'adapted to drama', 'web comic', 'full color',
  'short chapters', 'multiple povs', 'english translation', 'anthology',
  'black-haired male lead', 'black-haired female lead', 'brown-haired male lead',
  'brown-haired female lead', 'blonde female lead', 'blonde male lead',
  'adult character/s', 'adult female lead', 'adult male lead', 'working adult/s',
  'kind male lead', 'vanilla', 'gentle male lead', 'glasses', 'first-time'
]);

const MU_ARCHETYPE_PRIORITY_PATTERNS = [
  'muscular', 'tall', 'height', 'size', 'short male', 'short female', 'older female',
  'younger male', 'age gap', 'gyaru', 'tomboy', 'yandere', 'tsundere', 'kuudere',
  'monster girl', 'villainess', 'reincarnation', 'time travel', 'debt', 'cohabitation',
  'boss-subordinate', 'coworker', 'office worker', 'childhood friend', 'married',
  'contract', 'crossdressing', 'gender bender', 'single parent', 'revenge', 'dungeon',
  'proactive female', 'shameless', 'teasing', 'big breasts', 'smoking', 'delinquent'
];

const FANDOM_FOCUS_TO_MU_CATEGORIES: Array<{ patterns: string[]; muCats: string[]; queries: string[] }> = [
  {
    patterns: ['tall girl', 'tall female', 'alta', 'gigante', 'giant', 'height difference', 'size difference', 'diferenca de altura', 'diferença de altura'],
    muCats: ['Tall Female Short Male', 'Height Difference', 'Tall Female Lead'],
    queries: ['tall girl', 'giant girl', 'height difference']
  },
  {
    patterns: ['muscle', 'muscle mommy', 'musculosa', 'forte', 'abs', 'buff', 'sarada'],
    muCats: ['Muscular Female Lead', 'Height Difference'],
    queries: ['muscle girl', 'muscular female', 'buff girlfriend']
  },
  {
    patterns: ['older woman', 'onee-san', 'oneesan', 'mais velha', 'milf', 'ara ara', 'age gap'],
    muCats: ['Older Female Younger Male', 'Age Gap'],
    queries: ['older woman', 'onee-san romance']
  },
  {
    patterns: ['office', 'escritorio', 'escritório', 'trabalho', 'coworker', 'chefe', 'boss', 'senpai'],
    muCats: ['Office Worker/s', 'Coworker/s', 'Boss-Subordinate Relationship'],
    queries: ['office romance', 'coworker romance', 'tiny senpai']
  },
  {
    patterns: ['gyaru', 'gal'],
    muCats: ['Gyaru'],
    queries: ['gyaru romance']
  },
  {
    patterns: ['tomboy', 'moleca'],
    muCats: ['Tomboy'],
    queries: ['tomboy romance']
  },
  {
    patterns: ['debt', 'divida', 'dívida', 'bought', 'comprado', 'pobre'],
    muCats: ['Debt/s', 'Cohabitation'],
    queries: ['pay off debt', 'bought childhood friend']
  },
  {
    patterns: ['cohabit', 'mesmo teto', 'morar junto', 'roommate'],
    muCats: ['Cohabitation'],
    queries: ['living together', 'same roof romance']
  }
];

export function resolveFocusToCategoriesAndQueries(
  focusTags: string[] = [],
  focusQuery = ''
): { muCategories: string[]; searchQueries: string[]; focusTokens: string[] } {
  const muCategories = new Set<string>(focusTags.filter(Boolean));
  const searchQueries = new Set<string>();
  const focusTokens = new Set<string>();

  const qLower = focusQuery.trim().toLowerCase();
  if (qLower) {
    searchQueries.add(focusQuery.trim());
    qLower.split(/[\s,;]+/).filter(w => w.length >= 3).forEach(w => focusTokens.add(w));
    for (const entry of FANDOM_FOCUS_TO_MU_CATEGORIES) {
      if (entry.patterns.some(p => qLower.includes(p))) {
        entry.muCats.forEach(c => muCategories.add(c));
        entry.queries.forEach(q => searchQueries.add(q));
      }
    }
  }

  for (const tag of focusTags) {
    const cleanTag = tag.toLowerCase().replace(/\/s\b/g, '').replace(/lead/g, '').trim();
    if (cleanTag) {
      cleanTag.split(/\s+/).filter(w => w.length >= 3).forEach(w => focusTokens.add(w));
    }
  }

  return {
    muCategories: Array.from(muCategories),
    searchQueries: Array.from(searchQueries),
    focusTokens: Array.from(focusTokens)
  };
}

/**
 * Queries MangaUpdates (Baka-Updates) public API v1 for hyper-specific community tags
 * (e.g., "Muscular Female Lead", "Height Difference", "Tall Female Short Male", "Office Worker/s")
 * and fetches category-intersection series recommendations without hardcoding every trope.
 */
async function fetchMangaUpdatesEnrichment(
  titles: string[],
  focusTags: string[] = [],
  focusQuery = ''
): Promise<MangaUpdatesEnrichment> {
  const cleanTitles = Array.from(
    new Set(titles.map(t => t?.trim()).filter((t): t is string => Boolean(t && t.length >= 2)))
  ).slice(0, 2);

  if (cleanTitles.length === 0) {
    return { categories: [], communityRecs: [], tagDiscoveryRecs: [] };
  }

  const focusKey = `${focusTags.join(',')}|${focusQuery.trim().toLowerCase()}`;
  const cacheKey = `mu_enrich_v1:${cleanTitle(cleanTitles[0])}:${cleanTitle(focusKey)}`;
  const cached = globalCache.get<MangaUpdatesEnrichment>(cacheKey);
  if (cached) return cached;

  const empty: MangaUpdatesEnrichment = { categories: [], communityRecs: [], tagDiscoveryRecs: [] };

  let seriesId: number | undefined;
  let categories: Array<{ name: string; votes: number }> = [];
  let communityRecs: Array<{ title: string; rating?: number }> = [];

  for (const t of cleanTitles) {
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 4500);
      const searchRes = await fetch('https://api.mangaupdates.com/v1/series/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: t, perpage: 4 }),
        signal: ctrl.signal
      });
      clearTimeout(tm);
      if (!searchRes.ok) continue;
      const searchJson: any = await searchRes.json();
      const results: any[] = searchJson?.results || [];
      const targetNorm = cleanTitle(t);
      const best =
        results.find(r => cleanTitle(r?.record?.title) === targetNorm) ||
        results.find(r => cleanTitle(r?.record?.title).includes(targetNorm) || targetNorm.includes(cleanTitle(r?.record?.title))) ||
        results[0];

      if (!best?.record?.series_id) continue;
      seriesId = Number(best.record.series_id);

      const ctrl2 = new AbortController();
      const tm2 = setTimeout(() => ctrl2.abort(), 4500);
      const detRes = await fetch(`https://api.mangaupdates.com/v1/series/${seriesId}`, {
        signal: ctrl2.signal
      });
      clearTimeout(tm2);
      if (!detRes.ok) break;
      const detJson: any = await detRes.json();

      categories = (detJson?.categories || [])
        .map((c: any) => ({
          name: String(c?.category || '').trim(),
          votes: Number(c?.votes || 0)
        }))
        .filter((c: any) => c.name && !MU_NOISE_CATEGORIES.has(c.name.toLowerCase()) && !c.name.toLowerCase().startsWith('based on'))
        .sort((a: any, b: any) => {
          const aPri = MU_ARCHETYPE_PRIORITY_PATTERNS.some(p => a.name.toLowerCase().includes(p)) ? 2 : 0;
          const bPri = MU_ARCHETYPE_PRIORITY_PATTERNS.some(p => b.name.toLowerCase().includes(p)) ? 2 : 0;
          return (b.votes + bPri) - (a.votes + aPri);
        });

      communityRecs = [
        ...((detJson?.recommendations || []).map((r: any) => ({
          title: String(r?.series_name || ''),
          rating: undefined
        }))),
        ...((detJson?.category_recommendations || []).map((r: any) => ({
          title: String(r?.series_name || ''),
          rating: undefined
        })))
      ].filter(r => r.title);

      break;
    } catch {
      // try next title
    }
  }

  // Category-Intersection Discovery on MangaUpdates
  const tagDiscoveryRecs: Array<{ title: string; matchedTags: string[]; rating?: number; isFocusMatch?: boolean }> = [];
  const resolvedFocus = resolveFocusToCategoriesAndQueries(focusTags, focusQuery);

  const categoryBatches: Array<{ cats: string[]; isFocus: boolean }> = [];

  if (resolvedFocus.muCategories.length > 0) {
    // User explicitly steered focus (e.g. "Tall Female Lead" / "Muscular Female Lead" / "tall girl")
    categoryBatches.push({ cats: resolvedFocus.muCategories.slice(0, 3), isFocus: true });
    if (resolvedFocus.muCategories.length >= 2) {
      categoryBatches.push({ cats: [resolvedFocus.muCategories[0]], isFocus: true });
    }
  } else if (categories.length > 0) {
    const catNames = categories.map(c => c.name);
    const archetypeCats = catNames.filter(c =>
      /muscular|tall|height|short|older female|younger male|age gap|gyaru|tomboy|yandere|tsundere|monster|villainess|debt|cohabit/i.test(c)
    );
    const settingCats = catNames.filter(c => !archetypeCats.includes(c));

    // Cluster 1: Character Archetype / Dynamic Pair (e.g. Muscular Female Lead + Height Difference or Tall Female Short Male + Height Difference)
    if (archetypeCats.length >= 2) {
      categoryBatches.push({ cats: archetypeCats.slice(0, 2), isFocus: false });
      if (archetypeCats.length >= 3) {
        categoryBatches.push({ cats: [archetypeCats[0], archetypeCats[2]], isFocus: false });
      }
    } else if (archetypeCats.length === 1 && settingCats.length >= 1) {
      categoryBatches.push({ cats: [archetypeCats[0], settingCats[0]], isFocus: false });
    }

    // Cluster 2: Setting / Relationship Pair (e.g. Office Worker/s + Boss-Subordinate or top 2 overall)
    if (settingCats.length >= 2) {
      categoryBatches.push({ cats: settingCats.slice(0, 2), isFocus: false });
    } else if (categoryBatches.length === 0 && catNames.length >= 2) {
      categoryBatches.push({ cats: catNames.slice(0, 2), isFocus: false });
    } else if (categoryBatches.length === 0 && catNames.length === 1) {
      categoryBatches.push({ cats: [catNames[0]], isFocus: false });
    }
  }

  if (categoryBatches.length > 0) {
    const batchResults = await Promise.allSettled(
      categoryBatches.slice(0, 3).map(async batch => {
        const ctrl = new AbortController();
        const tm = setTimeout(() => ctrl.abort(), 4500);
        try {
          const res = await fetch('https://api.mangaupdates.com/v1/series/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category: batch.cats,
              exclude_genre: ['Hentai', 'Smut', 'Adult', 'Doujinshi', 'Yaoi', 'Yuri'],
              type: ['Manga', 'Manhwa', 'Manhua'],
              orderby: 'rating',
              perpage: 10
            }),
            signal: ctrl.signal
          });
          clearTimeout(tm);
          if (!res.ok) return { items: [], batch };
          const json: any = await res.json();
          return { items: Array.isArray(json?.results) ? json.results : [], batch };
        } catch {
          clearTimeout(tm);
          return { items: [], batch };
        }
      })
    );

    const seenMuIds = new Set<number>(seriesId ? [seriesId] : []);
    for (const br of batchResults) {
      if (br.status !== 'fulfilled') continue;
      const { items, batch } = br.value;
      for (const item of items) {
        const rec = item?.record;
        if (!rec?.title || (rec.series_id && seenMuIds.has(Number(rec.series_id)))) continue;
        if (rec.series_id) seenMuIds.add(Number(rec.series_id));
        tagDiscoveryRecs.push({
          title: String(rec.title),
          matchedTags: batch.cats,
          rating: rec.bayesian_rating ? Number(rec.bayesian_rating) : undefined,
          isFocusMatch: batch.isFocus
        });
      }
    }
  }

  const result: MangaUpdatesEnrichment = {
    seriesId,
    categories: categories.slice(0, 14),
    communityRecs: communityRecs.slice(0, 8),
    tagDiscoveryRecs: tagDiscoveryRecs.slice(0, 16)
  };

  globalCache.set(cacheKey, result, 6 * 3600);
  return result;
}

/**
 * Trope-agnostic deterministic premise & query extractor:
 * combines niche tags, broad narrative archetypes, AND open-vocabulary synopsis phrases
 * so ANY niche manga generates sharp discovery queries even without hardcoded rules.
 */
function buildDeterministicPremiseFallback(
  targetManga: {
    title: string;
    altTitles?: string[];
    synopsis?: string;
    genres?: string[];
  },
  anilist: AniListEnrichment,
  jikan: JikanEnrichment = { themes: [], demographics: [], communityRecs: [] },
  mu: MangaUpdatesEnrichment = { categories: [], communityRecs: [], tagDiscoveryRecs: [] }
): {
  microTropes: string[];
  searchQueries: string[];
  nicheTags: string[];
  openKeywords: string[];
} {
  const combined = `${targetManga.title} ${(targetManga.altTitles || []).join(' ')} ${targetManga.synopsis || ''}`.toLowerCase();
  const tagNames = [
    ...anilist.tags.map(t => t.name.toLowerCase()),
    ...mu.categories.map(c => c.name.toLowerCase())
  ];

  const tropeRules: Array<{
    label: string;
    patterns: string[];
    queries: string[];
  }> = [
    {
      label: 'Dívida & Resgate Financeiro',
      patterns: ['debt', 'divida', 'bought', 'pay off', 'poverty', 'dirt-poor', 'broke', 'bankrupt'],
      queries: ['live with you debt', 'bought childhood friend', 'pay off debt']
    },
    {
      label: 'Morando Sob o Mesmo Teto',
      patterns: ['same roof', 'live with', 'live together', 'living together', 'moves in', 'cohabitation', 'roommate'],
      queries: ['living together', 'same roof romance', 'live together']
    },
    {
      label: 'Amiga de Infância Devota',
      patterns: ['childhood friend', 'osananajimi', 'devoted', 'amiga de infancia'],
      queries: ['childhood friend', 'devoted childhood']
    },
    {
      label: 'Casamento / Contrato',
      patterns: ['married', 'marriage', 'arranged', 'contract', 'fiance', 'wife'],
      queries: ['married couple', 'contract marriage']
    },
    {
      label: 'Gyaru & Introvertido',
      patterns: ['gyaru', 'gal', 'loner', 'popular girl'],
      queries: ['gal married', 'gyaru romance']
    },
    {
      label: 'Trabalho & Romance Adulto',
      patterns: ['office worker', 'workforce', 'coworker', 'salaryman', 'senpai', 'kouhai', 'workplace', 'boss', 'overtime'],
      queries: ['office romance', 'tiny senpai', 'drinking coworker']
    },
    {
      label: 'Heroína Alta / Forte / Gap',
      patterns: ['giant', 'dekai', 'tall', 'muscular', 'height difference', 'teasing', 'over-familiar', 'drunk', 'older woman', 'onee-san'],
      queries: ['tall girl romance', 'muscle girl', 'height difference']
    },
    {
      label: 'Regressão no Tempo',
      patterns: ['regress', 'time travel', 'second chance', 'turn back'],
      queries: ['regression', 'returned time']
    },
    {
      label: 'Dungeon & Sistema',
      patterns: ['dungeon', 'hunter', 'system', 'level up', 'necromancer', 'tower'],
      queries: ['dungeon system', 'hunter level']
    },
    {
      label: 'Vingança & Banimento',
      patterns: ['revenge', 'betray', 'banished', 'kicked out'],
      queries: ['banished party', 'revenge betrayed']
    },
    {
      label: 'Vilã & Nobreza Otome',
      patterns: ['villainess', 'duke', 'crown prince', 'otome'],
      queries: ['villainess duke', 'broken engagement']
    }
  ];

  const microTropes: string[] = [];
  const searchQueries: string[] = [];

  for (const rule of tropeRules) {
    const matchesText = rule.patterns.some(p => combined.includes(p));
    const matchesTag = tagNames.some(t => rule.patterns.some(p => t.includes(p)));
    if (matchesText || matchesTag) {
      microTropes.push(rule.label);
      for (const q of rule.queries) {
        if (!searchQueries.includes(q)) searchQueries.push(q);
      }
    }
  }

  // Extract ALL non-umbrella niche tags from MU categories + target genres + AniList + MAL themes
  const nicheTags = Array.from(
    new Set(
      [
        ...mu.categories.slice(0, 6).map(c => c.name),
        ...(targetManga.genres || []),
        ...anilist.tags.slice(0, 6).map(t => t.name),
        ...jikan.themes
      ].filter(g => !isUmbrellaGenre(g))
    )
  ).slice(0, 8);

  for (const nt of nicheTags) {
    if (!microTropes.includes(nt) && microTropes.length < 5) {
      microTropes.push(nt);
    }
  }

  // Open-vocabulary extraction directly from ANY synopsis so unseen tropes still generate queries
  const openVocab = extractOpenVocabularyTerms(targetManga);
  for (const phrase of openVocab.phrases.slice(0, 3)) {
    if (!searchQueries.includes(phrase) && searchQueries.length < 6) {
      searchQueries.push(phrase);
    }
  }
  if (searchQueries.length < 4 && openVocab.words.length >= 2) {
    const pairQuery = `${openVocab.words[0]} ${openVocab.words[1]}`;
    if (!searchQueries.includes(pairQuery)) searchQueries.push(pairQuery);
  }

  // Incorporate top AniList tag names as keyword searches if slots remain
  for (const t of anilist.tags.slice(0, 3)) {
    if (t.name && !searchQueries.includes(t.name) && searchQueries.length < 6) {
      searchQueries.push(t.name);
    }
  }

  return {
    microTropes: microTropes.slice(0, 5),
    searchQueries: searchQueries.slice(0, 6),
    nicheTags,
    openKeywords: openVocab.words
  };
}

/**
 * Extracts deep premise structure, targeted search queries, and potential twin titles
 * using Gemini with per-model quota fallback (strictly server-side).
 */
async function analyzePremiseWithAI(
  ai: GoogleGenAI,
  targetManga: {
    id: string;
    title: string;
    altTitles?: string[];
    synopsis?: string;
    genres?: string[];
    authors?: string[];
  },
  anilist: AniListEnrichment,
  mu: MangaUpdatesEnrichment = { categories: [], communityRecs: [], tagDiscoveryRecs: [] },
  focusCue = ''
): Promise<PremiseAnalysis | null> {
  const cacheKey = `ai_premise_v2:${targetManga.id}:${cleanTitle(targetManga.title)}:${cleanTitle(focusCue)}`;
  const cached = globalCache.get<PremiseAnalysis>(cacheKey);
  if (cached) return cached;

  const anilistTagSummary = anilist.tags.slice(0, 8).map(t => `${t.name} (${t.rank}%)`).join(', ');
  const muCatSummary = mu.categories.slice(0, 10).map(c => c.name).join(', ');
  const prompt = `Analyze this manga/manhwa carefully and identify what specifically attracts readers to it (whether that is the plot hook, character archetypes/body type like tall girl / muscular female / gyaru, relationship dynamic, or setting) so we find true matches.

Title: ${targetManga.title}
Alt Titles: ${(targetManga.altTitles || []).slice(0, 4).join(' | ') || 'None'}
Genres: ${(targetManga.genres || []).join(', ') || 'Unknown'}
AniList Tags: ${anilistTagSummary || 'None'}
MangaUpdates Community Tags: ${muCatSummary || 'None'}
User Requested Similarity Focus: ${focusCue || 'Auto (balance character archetype + plot hook)'}
Synopsis: ${(targetManga.synopsis || 'No synopsis available').slice(0, 1400)}

Instructions:
1. corePremise: Write 1 concise Portuguese (PT-BR) sentence summarizing the exact hook & character archetype/dynamic.
2. microTropes: 3 to 5 specific short Portuguese trope or archetype labels (3-4 words each).
3. searchQueries: 4 to 6 short English search keyword queries (2-4 words each) optimized to find similar manga titles on MangaDex/Comick (e.g., if tall/muscular female lead: "tall girl romance", "muscle girlfriend", "size difference romance").
4. knownTwinTitles: Up to 6 REAL well-known manga/manhwa titles in English or Romaji that share this SPECIFIC appeal (plot hook OR character archetype/dynamic). Only include real published titles you are confident about.`;

  const parsed = await generateStructuredJsonWithFallback<PremiseAnalysis>(ai, prompt, {
    type: Type.OBJECT,
    properties: {
      corePremise: { type: Type.STRING },
      microTropes: { type: Type.ARRAY, items: { type: Type.STRING } },
      searchQueries: { type: Type.ARRAY, items: { type: Type.STRING } },
      knownTwinTitles: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ['corePremise', 'microTropes', 'searchQueries', 'knownTwinTitles']
  });

  if (!parsed || !parsed.corePremise) return null;

  const cleanResult: PremiseAnalysis = {
    corePremise: String(parsed.corePremise).slice(0, 240),
    microTropes: (parsed.microTropes || []).map(String).slice(0, 5),
    searchQueries: (parsed.searchQueries || []).map(String).filter(q => q.trim().length >= 3).slice(0, 6),
    knownTwinTitles: (parsed.knownTwinTitles || []).map(String).filter(t => t.trim().length >= 3).slice(0, 6)
  };

  globalCache.set(cacheKey, cleanResult, 24 * 3600);
  return cleanResult;
}

/**
 * Ranks & categorizes ONLY verified real candidate mangas that resolved in live sources.
 */
async function rerankCandidatesWithAI(
  ai: GoogleGenAI,
  targetManga: {
    title: string;
    synopsis?: string;
    genres?: string[];
  },
  premise: PremiseAnalysis | null,
  candidates: Manga[],
  focusCue = ''
): Promise<Map<string, { score: number; category: SimilarityCategory; reason: string; tropes: string[] }>> {
  const resultMap = new Map<string, { score: number; category: SimilarityCategory; reason: string; tropes: string[] }>();
  if (candidates.length === 0) return resultMap;

  const compactCandidates = candidates.slice(0, 24).map(c => ({
    id: c.id,
    title: c.title,
    genres: (c.genres || []).slice(0, 6),
    synopsis: (c.synopsis || '').slice(0, 320)
  }));

  const prompt = `You are a manga recommendation specialist. Rank and categorize these REAL candidate mangas by how closely they match the target manga's SPECIFIC premise, character archetype (such as tall/muscular female lead, size difference, gyaru, older woman, etc.), or dynamic.

TARGET MANGA:
Title: ${targetManga.title}
Core Premise: ${premise?.corePremise || 'N/A'}
Micro-Tropes: ${(premise?.microTropes || []).join(', ') || 'N/A'}
Genres: ${(targetManga.genres || []).join(', ')}
User Focus Preference: ${focusCue || 'Auto'}
Synopsis: ${(targetManga.synopsis || '').slice(0, 900)}

CANDIDATES (use exact id strings):
${JSON.stringify(compactCandidates)}

Categorization rules:
- "twin_premise": True matches to the primary hook, character archetype, or requested User Focus Preference. Score 84-98.
- "same_dynamic": Similar character dynamic or relationship trope even if setup differs. Score 74-88.
- "same_vibe": Shares overall tone, atmosphere, and genre feel. Score 58-76.

Return entries for all meaningful matches (at most 18).
Write "reason" in natural, concise Brazilian Portuguese (max 110 chars) explaining SPECIFICALLY why it matches.
Write "tropes" as 1-2 ultra-short PT-BR tags.`;

  const parsed = await generateStructuredJsonWithFallback<
    Array<{ id: string; score: number; category: string; reason: string; tropes?: string[] }>
  >(ai, prompt, {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        score: { type: Type.INTEGER },
        category: { type: Type.STRING },
        reason: { type: Type.STRING },
        tropes: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ['id', 'score', 'category', 'reason']
    }
  });

  if (!Array.isArray(parsed)) return resultMap;

  const validIds = new Set(compactCandidates.map(c => c.id));
  for (const item of parsed) {
    if (!item || !validIds.has(item.id)) continue;
    const cat: SimilarityCategory =
      item.category === 'twin_premise' || item.category === 'same_dynamic' || item.category === 'same_vibe'
        ? item.category
        : 'same_vibe';
    const clampedScore = Math.min(99, Math.max(55, Number(item.score) || 70));
    resultMap.set(item.id, {
      score: clampedScore,
      category: cat,
      reason: String(item.reason || '').slice(0, 140),
      tropes: Array.isArray(item.tropes) ? item.tropes.map(String).slice(0, 3) : []
    });
  }

  return resultMap;
}

/**
 * Specificity-weighted, trope-agnostic deterministic scorer when Gemini is unavailable or in cooldown.
 * Rewards rare/niche tags, community graph hits (AniList + MAL), and open-vocabulary synopsis overlap
 * much higher than broad umbrella genres like Comedy/Romance/Fantasy.
 */
function deterministicFallbackScore(
  target: {
    title: string;
    altTitles?: string[];
    synopsis?: string;
    genres?: string[];
    authors?: string[];
  },
  candidate: Manga,
  anilistRecTitles: Set<string>,
  tagDiscoveryTitles: Set<string> = new Set(),
  malRecTitles: Set<string> = new Set(),
  targetOpenWords: string[] = [],
  muMatchTagsByTitle: Map<string, { tags: string[]; isFocus: boolean }> = new Map(),
  focusTokens: string[] = []
): { score: number; category: SimilarityCategory; reason: string; tropes: string[] } {
  const tGenres = new Set((target.genres || []).map(g => g.toLowerCase()));
  const cGenres = (candidate.genres || []).map(g => g.toLowerCase());
  const shared = cGenres.filter(g => tGenres.has(g) && g !== 'manga');
  const sharedNicheTags = shared.filter(g => !isUmbrellaGenre(g));
  const sharedUmbrella = shared.filter(g => isUmbrellaGenre(g));

  const tText = `${target.title} ${target.synopsis || ''}`.toLowerCase();
  const cText = `${candidate.title} ${candidate.synopsis || ''}`.toLowerCase();

  const tropeGroups: Array<{ label: string; keys: string[]; weight: number }> = [
    { label: 'Dívida / Acordo', keys: ['debt', 'divida', 'bought', 'pay off', 'poverty', 'poor', 'broke'], weight: 16 },
    { label: 'Mesmo Teto', keys: ['live together', 'living together', 'live with', 'same roof', 'moves in', 'roommate', 'cohabit'], weight: 15 },
    { label: 'Amiga de Infância', keys: ['childhood friend', 'osananajimi', 'infancia'], weight: 14 },
    { label: 'Casamento / Contrato', keys: ['married', 'marriage', 'contract', 'fiance', 'wife', 'husband'], weight: 12 },
    { label: 'Gyaru / Romcom', keys: ['gyaru', 'gal', 'romcom', 'high school'], weight: 10 },
    { label: 'Escritório / Trabalho', keys: ['office', 'workforce', 'coworker', 'workplace', 'salaryman', 'boss', 'senpai', 'kouhai', 'overtime'], weight: 14 },
    { label: 'Heroína Alta / Forte / Gap', keys: ['giant', 'dekai', 'tall', 'muscular', 'height difference', 'size difference', 'teasing', 'drunk', 'older woman', 'onee-san'], weight: 15 },
    { label: 'Regressão / Tempo', keys: ['regress', 'time travel', 'second chance', 'turn back'], weight: 14 },
    { label: 'Dungeon / Sistema', keys: ['dungeon', 'hunter', 'system', 'level up', 'necromancer'], weight: 14 },
    { label: 'Vingança / Traição', keys: ['revenge', 'betray', 'banished', 'kicked out'], weight: 14 },
    { label: 'Vilã / Nobreza', keys: ['villainess', 'duke', 'crown prince', 'otome'], weight: 14 }
  ];

  const matchedTropes: string[] = [];
  let tropeBoost = 0;
  for (const grp of tropeGroups) {
    const inTarget = grp.keys.some(k => tText.includes(k));
    const inCand = grp.keys.some(k => cText.includes(k));
    if (inTarget && inCand) {
      matchedTropes.push(grp.label);
      tropeBoost += grp.weight;
    }
  }

  // Open-vocabulary rare synopsis keyword & candidate tag overlap (works for ANY unseen trope!)
  const openWordsToCheck = targetOpenWords.length > 0
    ? targetOpenWords
    : extractOpenVocabularyTerms(target).words;
  const matchedOpenWords: string[] = [];
  for (const w of openWordsToCheck) {
    if (cText.includes(w) || cGenres.some(g => g.includes(w))) {
      matchedOpenWords.push(w);
    }
  }
  const openVocabBoost = Math.min(24, matchedOpenWords.length * 6);

  const candTitles = [candidate.title, ...(candidate.altTitles || [])].map(cleanTitle).filter(Boolean);
  const isAnilistRec = candTitles.some(nt => anilistRecTitles.has(nt));
  const isMalRec = candTitles.some(nt => malRecTitles.has(nt));
  const isTagDiscovery = candTitles.some(nt => tagDiscoveryTitles.has(nt));

  let muEntry: { tags: string[]; isFocus: boolean } | undefined;
  for (const nt of candTitles) {
    const hit = muMatchTagsByTitle.get(nt);
    if (hit) {
      muEntry = hit;
      break;
    }
  }
  const muTags = muEntry?.tags || [];
  const isMuFocus = Boolean(muEntry?.isFocus);

  // User custom focus token boost (e.g. user typed "tall girl" or "muscle")
  let focusTextMatches = 0;
  for (const ft of focusTokens) {
    if (cText.includes(ft) || cGenres.some(g => g.includes(ft))) {
      focusTextMatches++;
    }
  }

  const sameAuthor = Boolean(
    target.authors?.[0] &&
      target.authors[0] !== 'Unknown' &&
      target.authors[0] !== 'Autor Desconhecido' &&
      candidate.authors?.some(a => a.toLowerCase() === target.authors![0].toLowerCase())
  );

  // Niche tags weigh 4x more than generic umbrella genres (Comedy/Romance/Slice of Life)
  const genreBoost = Math.min(28, sharedNicheTags.length * 12 + Math.min(9, sharedUmbrella.length * 3));

  let score = 46 + genreBoost + Math.min(30, tropeBoost) + openVocabBoost;
  if (isAnilistRec || isMalRec) score += 16;
  else if (isTagDiscovery) score += 9;
  if (muTags.length > 0) score += Math.min(22, muTags.length * 9);
  if (isMuFocus) score += 10;
  if (focusTextMatches > 0) score += Math.min(18, focusTextMatches * 8);
  if (sameAuthor) score += 14;
  score = Math.min(98, Math.max(55, score));

  let category: SimilarityCategory = 'same_vibe';
  if (
    isMuFocus ||
    focusTextMatches >= 2 ||
    muTags.length >= 2 ||
    matchedTropes.length >= 2 ||
    ((isAnilistRec || isMalRec) && (tropeBoost >= 12 || sharedNicheTags.length >= 1 || matchedOpenWords.length >= 2)) ||
    (sharedNicheTags.length >= 2 && matchedOpenWords.length >= 2) ||
    matchedOpenWords.length >= 4
  ) {
    category = 'twin_premise';
  } else if (
    muTags.length === 1 ||
    focusTextMatches >= 1 ||
    matchedTropes.length === 1 ||
    isAnilistRec ||
    isMalRec ||
    isTagDiscovery ||
    sharedNicheTags.length >= 1 ||
    matchedOpenWords.length >= 2 ||
    sameAuthor
  ) {
    category = 'same_dynamic';
  }

  let reason = '';
  if (muTags.length > 0) {
    reason = `Tags: ${muTags.slice(0, 2).join(' + ')}`;
  } else if (matchedTropes.length > 0 && sharedNicheTags.length > 0) {
    const prettyTag = (candidate.genres || []).find(g => g.toLowerCase() === sharedNicheTags[0]) || sharedNicheTags[0];
    reason = `${prettyTag} · ${matchedTropes[0]}`;
  } else if (matchedTropes.length > 0) {
    reason = `Enredo afim: ${matchedTropes.slice(0, 2).join(' + ')}`;
  } else if (isAnilistRec || isMalRec) {
    reason = isMalRec && isAnilistRec
      ? 'Alta recomendação da comunidade no AniList e MAL'
      : isMalRec
      ? 'Recomendado por leitores no MyAnimeList'
      : 'Muito recomendada por leitores no AniList';
  } else if (sharedNicheTags.length > 0 && matchedOpenWords.length > 0) {
    const prettyTags = sharedNicheTags.slice(0, 2).map(s => (candidate.genres || []).find(g => g.toLowerCase() === s) || s);
    reason = `${prettyTags.join(' + ')} · ${matchedOpenWords.slice(0, 2).join(', ')}`;
  } else if (matchedOpenWords.length >= 2) {
    reason = `Sinopse afim: ${matchedOpenWords.slice(0, 3).join(', ')}`;
  } else if (sameAuthor) {
    reason = `Mesmo autor (${target.authors?.[0]})`;
  } else if (sharedNicheTags.length > 0) {
    const prettyTags = sharedNicheTags.slice(0, 2).map(s => (candidate.genres || []).find(g => g.toLowerCase() === s) || s);
    reason = `Subgênero em comum: ${prettyTags.join(' · ')}`;
  } else if (shared.length > 0) {
    reason = `Gêneros: ${shared.slice(0, 3).join(' · ')}`;
  } else {
    reason = 'Atmosfera e estilo semelhantes';
  }

  const displayTropes = muTags.length > 0
    ? muTags.slice(0, 2)
    : matchedTropes.length > 0
    ? matchedTropes.slice(0, 2)
    : sharedNicheTags.slice(0, 2).map(s => (candidate.genres || []).find(g => g.toLowerCase() === s) || s);

  return { score, category, reason, tropes: displayTropes };
}

/**
 * Main entry point: Hybrid AI + MangaUpdates + AniList + MAL/Jikan + Open-Vocabulary Live Source Similarity Matcher.
 */
export async function findHybridSimilarMangas(params: {
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
}): Promise<HybridSimilarResponse> {
  const {
    targetManga,
    language,
    localCandidates = [],
    ignoredIds = [],
    ignoredTitles = [],
    focusTags = [],
    focusQuery = '',
    limit = 18
  } = params;
  const langKey = language || 'all';
  const focusFingerprint = `${focusTags.join(',')}|${focusQuery.trim().toLowerCase()}`;
  const cacheKey = `hybrid_sim_v5:${targetManga.id}:${langKey}:${localCandidates.length}:${cleanTitle(focusFingerprint)}`;
  const cached = globalCache.get<HybridSimilarResponse>(cacheKey);

  if (cached) {
    const igIds = new Set(ignoredIds);
    const igTitles = new Set(ignoredTitles.map(cleanTitle).filter(Boolean));
    return {
      ...cached,
      matches: cached.matches.filter(
        m => !igIds.has(m.manga.id) && !igTitles.has(cleanTitle(m.manga.title))
      )
    };
  }

  const ai = getGeminiClient();
  const titleVariants = [targetManga.title, ...(targetManga.altTitles || []).slice(0, 2)];
  const [anilist, jikan, mu] = await Promise.all([
    fetchAniListEnrichment(titleVariants, targetManga.genres || []),
    fetchJikanEnrichment(titleVariants),
    fetchMangaUpdatesEnrichment(titleVariants, focusTags, focusQuery)
  ]);

  const resolvedFocus = resolveFocusToCategoriesAndQueries(focusTags, focusQuery);
  const focusCueText = [...focusTags, focusQuery].filter(Boolean).join(', ');
  const premise = ai ? await analyzePremiseWithAI(ai, targetManga, anilist, mu, focusCueText) : null;
  const detFallback = buildDeterministicPremiseFallback(targetManga, anilist, jikan, mu);

  // Build parallel search queries across our live sources
  const searchQueries: Array<{ q: string; limit: number; genre?: string; genres?: string[] }> = [];
  const seenQueries = new Set<string>();
  const addSearch = (q: string, lim = 8, genre?: string, genres?: string[]) => {
    const gKey = genres ? genres.join(',').toLowerCase() : (genre || '').toLowerCase();
    const key = `${q.toLowerCase().trim()}|${gKey}`;
    if (seenQueries.has(key)) return;
    seenQueries.add(key);
    searchQueries.push({ q, limit: lim, genre, genres });
  };

  // 0. User-steered focus queries take top priority when provided
  for (const fq of resolvedFocus.searchQueries.slice(0, 4)) {
    addSearch(fq, 8);
  }

  // 1. Resolve MangaUpdates hyper-specific tag-intersection titles (Muscular Female Lead, Tall Girl, Debt, etc.)
  for (const muRec of mu.tagDiscoveryRecs.slice(0, 8)) {
    addSearch(muRec.title, 3);
  }
  for (const muComm of mu.communityRecs.slice(0, 4)) {
    addSearch(muComm.title, 3);
  }

  // 2. Resolve AniList & MAL community recommendation titles to real playable mangas
  for (const rec of anilist.communityRecs.slice(0, 4)) {
    addSearch(rec.englishTitle || rec.title, 3);
  }
  for (const malRec of jikan.communityRecs.slice(0, 3)) {
    addSearch(malRec.title, 3);
  }

  // 3. Resolve AniList Tag-Intersection discovery titles
  for (const tagRec of (anilist.tagDiscoveryRecs || []).slice(0, 4)) {
    addSearch(tagRec.englishTitle || tagRec.title, 3);
  }

  // 4. Resolve AI-suggested twin premise titles OR open-vocabulary trope queries
  if (premise) {
    for (const twinTitle of premise.knownTwinTitles.slice(0, 4)) {
      addSearch(twinTitle, 4);
    }
    for (const tropeQuery of premise.searchQueries.slice(0, 4)) {
      addSearch(tropeQuery, 8);
    }
  } else {
    for (const q of detFallback.searchQueries.slice(0, 4)) {
      addSearch(q, 8);
    }
  }

  // 5. Multi-tag intersection searches (niche tags + core genre)
  const nicheTargetGenres = (targetManga.genres || []).filter(g => !isUmbrellaGenre(g));
  const coreTargetGenres = (targetManga.genres || []).filter(g => isUmbrellaGenre(g) && g.toLowerCase() !== 'manga');
  if (nicheTargetGenres.length >= 2) {
    addSearch('', 10, undefined, nicheTargetGenres.slice(0, 2));
  }
  if (nicheTargetGenres.length >= 1 && coreTargetGenres.length >= 1) {
    addSearch('', 10, undefined, [nicheTargetGenres[0], coreTargetGenres[0]]);
  } else if (coreTargetGenres.length >= 2) {
    addSearch('', 10, undefined, coreTargetGenres.slice(0, 2));
  } else if (coreTargetGenres.length === 1) {
    addSearch('', 10, coreTargetGenres[0]);
  }

  if (targetManga.authors?.[0] && targetManga.authors[0] !== 'Unknown' && targetManga.authors[0] !== 'Autor Desconhecido') {
    addSearch(targetManga.authors[0], 5);
  }

  const searchLang = langKey && langKey !== 'all' ? langKey : undefined;
  const searchResults = await Promise.allSettled(
    searchQueries.slice(0, 20).map(sq =>
      sourceRegistry.search(sq.q, {
        genre: sq.genre,
        genres: sq.genres,
        limit: sq.limit,
        language: searchLang,
        onlyAvailable: true,
        includeAdult: false
      })
    )
  );

  // Deduplicate real candidates
  const candidateMap = new Map<string, Manga>();
  const seenNormTitles = new Set<string>([cleanTitle(targetManga.title)]);
  (targetManga.altTitles || []).forEach(a => {
    const n = cleanTitle(a);
    if (n) seenNormTitles.add(n);
  });

  const igIdsSet = new Set(ignoredIds);
  const igTitlesSet = new Set(ignoredTitles.map(cleanTitle).filter(Boolean));

  const tryPush = (m: Manga) => {
    if (!m || !m.id || m.id === targetManga.id || m.isAdult) return;
    if (igIdsSet.has(m.id)) return;
    const nt = cleanTitle(m.title);
    if (!nt || seenNormTitles.has(nt) || igTitlesSet.has(nt)) return;
    if ((m.altTitles || []).some(a => seenNormTitles.has(cleanTitle(a)) || igTitlesSet.has(cleanTitle(a)))) {
      return;
    }
    seenNormTitles.add(nt);
    candidateMap.set(m.id, m);
  };

  localCandidates.forEach(tryPush);

  searchResults.forEach(res => {
    if (res.status === 'fulfilled') {
      (res.value.results || []).forEach(tryPush);
    }
  });

  const realCandidates = Array.from(candidateMap.values());

  // Build AniList + MAL + MangaUpdates lookups
  const anilistTitleSet = new Set<string>();
  const tagDiscoveryTitleSet = new Set<string>();
  const malTitleSet = new Set<string>();
  const muMatchTagsByTitle = new Map<string, { tags: string[]; isFocus: boolean }>();
  const extraDescByTitle = new Map<string, string>();
  const extraTagsByTitle = new Map<string, string[]>();

  anilist.communityRecs.forEach(r => {
    [r.title, r.englishTitle, r.romajiTitle].forEach(t => {
      const nt = cleanTitle(t);
      if (nt) {
        anilistTitleSet.add(nt);
        if (r.description) extraDescByTitle.set(nt, r.description);
      }
    });
  });

  (anilist.tagDiscoveryRecs || []).forEach(r => {
    [r.title, r.englishTitle, r.romajiTitle].forEach(t => {
      const nt = cleanTitle(t);
      if (nt) {
        tagDiscoveryTitleSet.add(nt);
        if (r.description && !extraDescByTitle.has(nt)) extraDescByTitle.set(nt, r.description);
        if (r.tags?.length) extraTagsByTitle.set(nt, r.tags);
      }
    });
  });

  jikan.communityRecs.forEach(r => {
    const nt = cleanTitle(r.title);
    if (nt) malTitleSet.add(nt);
  });

  mu.communityRecs.forEach(r => {
    const nt = cleanTitle(r.title);
    if (nt) anilistTitleSet.add(nt);
  });

  mu.tagDiscoveryRecs.forEach(r => {
    const nt = cleanTitle(r.title);
    if (nt) {
      const existing = muMatchTagsByTitle.get(nt);
      const mergedTags = Array.from(new Set([...(existing?.tags || []), ...r.matchedTags]));
      muMatchTagsByTitle.set(nt, {
        tags: mergedTags,
        isFocus: Boolean(existing?.isFocus || r.isFocusMatch)
      });
    }
  });

  const enrichedCandidates = realCandidates.map(c => {
    const nt = cleanTitle(c.title);
    const extraDesc = extraDescByTitle.get(nt);
    const extraTags = extraTagsByTitle.get(nt);
    let updated = c;
    if ((!c.synopsis || c.synopsis.trim().length <= 30) && extraDesc) {
      updated = { ...updated, synopsis: extraDesc };
    }
    if (extraTags && extraTags.length > 0) {
      updated = { ...updated, genres: Array.from(new Set([...(updated.genres || []), ...extraTags])) };
    }
    return updated;
  });

  // AI Categorized Re-ranking (only runs if at least one model is available and not in cooldown)
  const aiRankMap = ai
    ? await rerankCandidatesWithAI(ai, targetManga, premise, enrichedCandidates, focusCueText)
    : new Map();

  const scored: HybridSimilarItem[] = enrichedCandidates.map(cand => {
    const aiInfo = aiRankMap.get(cand.id);
    const det = deterministicFallbackScore(
      targetManga,
      cand,
      anilistTitleSet,
      tagDiscoveryTitleSet,
      malTitleSet,
      detFallback.openKeywords,
      muMatchTagsByTitle,
      resolvedFocus.focusTokens
    );
    const candTitles = [cand.title, ...(cand.altTitles || [])].map(cleanTitle).filter(Boolean);
    const isAnilistRec = candTitles.some(nt => anilistTitleSet.has(nt) || malTitleSet.has(nt));
    const isSameAuthor = Boolean(
      targetManga.authors?.[0] &&
        targetManga.authors[0] !== 'Unknown' &&
        targetManga.authors[0] !== 'Autor Desconhecido' &&
        cand.authors?.some(a => a.toLowerCase() === targetManga.authors![0].toLowerCase())
    );

    const tGenres = new Set((targetManga.genres || []).map(g => g.toLowerCase()));
    const sharedGenres = (cand.genres || []).filter(g => tGenres.has(g.toLowerCase()) && g.toLowerCase() !== 'manga');

    const finalScore = aiInfo
      ? Math.min(99, Math.round(aiInfo.score * 0.8 + det.score * 0.2 + (isAnilistRec ? 3 : 0)))
      : det.score;

    const category: SimilarityCategory = aiInfo ? aiInfo.category : det.category;
    const matchExplanation = aiInfo?.reason || det.reason;
    const plotThemes = (aiInfo?.tropes && aiInfo.tropes.length > 0) ? aiInfo.tropes : det.tropes;

    return {
      manga: cand,
      similarityScore: finalScore,
      category,
      sharedGenres: Array.from(new Set([...plotThemes, ...sharedGenres])).slice(0, 3),
      plotThemes,
      matchExplanation,
      synopsisSimilarity: finalScore,
      isSameAuthor,
      isAnilistRec,
      aiPowered: Boolean(aiInfo)
    };
  });

  const catRank: Record<SimilarityCategory, number> = {
    twin_premise: 3,
    same_dynamic: 2,
    same_vibe: 1
  };
  scored.sort((a, b) => {
    if (Math.abs(b.similarityScore - a.similarityScore) >= 4) {
      return b.similarityScore - a.similarityScore;
    }
    if (catRank[b.category] !== catRank[a.category]) {
      return catRank[b.category] - catRank[a.category];
    }
    return b.similarityScore - a.similarityScore;
  });

  const combinedTags = Array.from(
    new Set([
      ...mu.categories.slice(0, 5).map(c => c.name),
      ...anilist.tags.slice(0, 4).map(t => t.name),
      ...jikan.themes.slice(0, 3)
    ])
  ).slice(0, 8);

  const detectedTagsMap = new Map<string, DetectedTropeTag>();
  for (const c of mu.categories.slice(0, 8)) {
    if (!detectedTagsMap.has(c.name.toLowerCase())) {
      detectedTagsMap.set(c.name.toLowerCase(), { tag: c.name, votes: c.votes, source: 'mangaupdates' });
    }
  }
  for (const t of anilist.tags.slice(0, 5)) {
    if (!detectedTagsMap.has(t.name.toLowerCase())) {
      detectedTagsMap.set(t.name.toLowerCase(), { tag: t.name, votes: t.rank, source: 'anilist' });
    }
  }
  for (const th of jikan.themes.slice(0, 3)) {
    if (!detectedTagsMap.has(th.toLowerCase())) {
      detectedTagsMap.set(th.toLowerCase(), { tag: th, source: 'mal' });
    }
  }

  const payload: HybridSimilarResponse = {
    matches: scored.slice(0, limit),
    corePremise: premise?.corePremise,
    microTropes: premise?.microTropes?.length ? premise.microTropes : detFallback.microTropes,
    anilistTags: combinedTags,
    detectedTags: Array.from(detectedTagsMap.values()).slice(0, 10),
    aiPowered: Boolean(ai && (premise || aiRankMap.size > 0))
  };

  globalCache.set(cacheKey, payload, 1800);
  return payload;
}

/**
 * Hybrid Personalized Recommendations ("Para Você") using at most 1 AI re-rank call
 * (saving 50% of daily quota) + deterministic genre/trope candidate discovery + negative signals.
 */
export async function findHybridPersonalizedRecommendations(params: {
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
}): Promise<HybridPersonalizedResponse> {
  const { favorites, ignored, language, hideLibrary = true, limit = 12 } = params;
  const ai = getGeminiClient();

  if (favorites.length === 0) {
    return { matches: [], aiPowered: false };
  }

  const favFingerprint = favorites
    .slice(0, 12)
    .map(f => `${f.mangaId}:${f.userScore || 0}`)
    .join(',');
  const langKey = language || 'all';
  const cacheKey = `hybrid_pers_v2:${favFingerprint}:${ignored.length}:${langKey}:${hideLibrary}`;
  const cached = globalCache.get<HybridPersonalizedResponse>(cacheKey);
  if (cached) return cached;

  const likedFavs = [...favorites]
    .filter(f => f.userCategory !== 'dropped' && (f.userScore === undefined || f.userScore >= 6))
    .sort((a, b) => (b.userScore || 7) - (a.userScore || 7))
    .slice(0, 8);

  const droppedFavs = favorites.filter(f => f.userCategory === 'dropped').slice(0, 5);
  const topTasteList = likedFavs.length > 0 ? likedFavs : favorites.slice(0, 6);

  // Extract top genres + deterministic plot queries from user's favorite synopses
  const genreCounts: Record<string, number> = {};
  const searchJobs: Promise<any>[] = [];
  const searchLang = langKey && langKey !== 'all' ? langKey : undefined;

  topTasteList.forEach(f => (f.genres || []).forEach(g => {
    if (g.toLowerCase() !== 'manga') genreCounts[g] = (genreCounts[g] || 0) + 1;
  }));
  const topGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g);
  for (const g of topGenres) {
    searchJobs.push(sourceRegistry.search('', { genre: g, limit: 10, language: searchLang, onlyAvailable: true, includeAdult: false }));
  }

  // Also run trope searches derived from user's top favorite synopses (0 AI calls!)
  const seedFav = topTasteList[0];
  if (seedFav?.synopsis) {
    const det = buildDeterministicPremiseFallback(
      { title: seedFav.title, synopsis: seedFav.synopsis, genres: seedFav.genres },
      { tags: [], communityRecs: [] }
    );
    for (const q of det.searchQueries.slice(0, 2)) {
      searchJobs.push(sourceRegistry.search(q, { limit: 6, language: searchLang, onlyAvailable: true, includeAdult: false }));
    }
  }

  const outcomes = await Promise.allSettled(searchJobs);
  const favIdSet = new Set(favorites.map(f => f.mangaId));
  const favTitleSet = new Set(favorites.map(f => cleanTitle(f.title)));
  const igIdSet = new Set(ignored.map(i => i.mangaId));
  const igTitleSet = new Set(ignored.map(i => cleanTitle(i.title)));

  const candidateMap = new Map<string, Manga>();
  const seenTitles = new Set<string>();

  outcomes.forEach(res => {
    if (res.status === 'fulfilled') {
      const list: Manga[] = res.value?.results || [];
      for (const m of list) {
        if (!m || !m.id || m.isAdult) continue;
        if (igIdSet.has(m.id) || igTitleSet.has(cleanTitle(m.title))) continue;
        const inLib = favIdSet.has(m.id) || favTitleSet.has(cleanTitle(m.title));
        if (hideLibrary && inLib) continue;
        const nt = cleanTitle(m.title);
        if (!nt || seenTitles.has(nt)) continue;
        seenTitles.add(nt);
        candidateMap.set(m.id, m);
      }
    }
  });

  const candidates = Array.from(candidateMap.values()).slice(0, 24);
  if (candidates.length === 0) {
    return { matches: [], aiPowered: false };
  }

  // Single combined AI re-ranking + profile summary call (only when quota permits)
  const aiReasons = new Map<string, { score: number; reason: string }>();
  let profileSummary = '';

  if (ai) {
    const rankPrompt = `Rank these real candidate mangas for this reader based on their favorites (and avoid vibes from dismissed/dropped titles).

FAVORITES: ${topTasteList.map(f => `${f.title} [${(f.genres || []).slice(0, 3).join(', ')}]`).join('; ')}
AVOID: ${[...droppedFavs.map(d => d.title), ...ignored.slice(0, 6).map(i => i.title)].join(', ') || 'None'}

CANDIDATES:
${JSON.stringify(candidates.map(c => ({ id: c.id, title: c.title, genres: (c.genres || []).slice(0, 5), synopsis: (c.synopsis || '').slice(0, 240) })))}

Return JSON with:
- profileSummary: 1 short PT-BR phrase summarizing their reading taste
- matches: top 12 matches [{ id, score (65-99), reason (concise PT-BR max 95 chars) }]`;

    const parsed = await generateStructuredJsonWithFallback<{
      profileSummary?: string;
      matches?: Array<{ id: string; score: number; reason: string }>;
    }>(ai, rankPrompt, {
      type: Type.OBJECT,
      properties: {
        profileSummary: { type: Type.STRING },
        matches: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              score: { type: Type.INTEGER },
              reason: { type: Type.STRING }
            },
            required: ['id', 'score', 'reason']
          }
        }
      },
      required: ['profileSummary', 'matches']
    });

    if (parsed) {
      profileSummary = String(parsed.profileSummary || '').slice(0, 180);
      if (Array.isArray(parsed.matches)) {
        for (const item of parsed.matches) {
          if (item?.id && candidateMap.has(item.id)) {
            aiReasons.set(item.id, {
              score: Math.min(99, Math.max(60, Number(item.score) || 78)),
              reason: String(item.reason || '').slice(0, 120)
            });
          }
        }
      }
    }
  }

  const matches: HybridPersonalizedItem[] = candidates.map(cand => {
    const aiR = aiReasons.get(cand.id);
    const sharedG = (cand.genres || []).filter(g => topGenres.some(tg => tg.toLowerCase() === g.toLowerCase()));
    const fallbackScore = Math.min(96, 66 + sharedG.length * 10 + (cand.rating && cand.rating >= 8 ? 6 : 0));
    return {
      manga: cand,
      affinityScore: aiR ? aiR.score : fallbackScore,
      matchReasons: [
        aiR?.reason ||
          (sharedG.length > 0
            ? `Combina com seu gosto por ${sharedG.slice(0, 2).join(' e ')}`
            : 'Selecionado com base no seu perfil de leitura')
      ],
      aiPowered: Boolean(aiR)
    };
  });

  matches.sort((a, b) => b.affinityScore - a.affinityScore);

  const responsePayload: HybridPersonalizedResponse = {
    matches: matches.slice(0, limit),
    aiPowered: aiReasons.size > 0,
    profileSummary: profileSummary || undefined
  };

  globalCache.set(cacheKey, responsePayload, 3600);
  return responsePayload;
}
