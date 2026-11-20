import { Manga } from '../../src/types/manga.js';
import { globalCache } from '../cache/CacheService.js';
import { IMangaSource, SourceSearchOptions } from './IMangaSource.js';
import { decodeHtmlEntities } from '../../src/utils/htmlEntities.js';

interface AniListTagItem {
  name: string;
  rank?: number;
  isMediaSpoiler?: boolean;
}

interface AniListCandidate {
  id: number;
  titleEnglish?: string;
  titleRomaji?: string;
  synonyms: string[];
  genres: string[];
  tags: AniListTagItem[];
  countryOfOrigin?: string;
  status?: string;
  averageScore?: number;
  description?: string;
  isAdult?: boolean;
  startYear?: number;
  relevanceScore: number;
}

// Official AniList MediaTagCollection tags & genres per UI trope/genre key
const UI_TO_ANILIST_MAP: Record<string, { tags?: string[]; genres?: string[] }> = {
  'tomboy': { tags: ['Tomboy'] },
  'tsundere': { tags: ['Tsundere'] },
  'yandere': { tags: ['Yandere'] },
  'kuudere / fria por fora': { tags: ['Kuudere'] },
  'gyaru': { tags: ['Gyaru'] },
  'diferença de idade': { tags: ['Age Gap'] },
  'morando juntos / vizinhos': { tags: ['Cohabitation'] },
  'casamento por contrato': { tags: ['Arranged Marriage', 'Fake Relationship', 'Marriage'] },
  'triângulo amoroso': { tags: ['Love Triangle'] },
  'vilã (villainess)': { tags: ['Villainess'] },
  'isekai': { tags: ['Isekai'] },
  'isekai reverso': { tags: ['Reverse Isekai'] },
  'reencarnação': { tags: ['Reincarnation'] },
  'regressão / tempo': { tags: ['Time Manipulation'] },
  'loop temporal': { tags: ['Time Loop', 'Time Manipulation'] },
  'dungeon / sistema': { tags: ['Dungeon'] },
  'construção de vila': { tags: ['Kingdom Management'] },
  'construção de vila / reino': { tags: ['Kingdom Management'] },
  'domador de monstros': { tags: ['Creature Taming'] },
  'vingança': { tags: ['Revenge'] },
  'expulso do grupo': { tags: ['Exiled'] },
  'anti-herói / vilão mc': { tags: ['Anti-Hero'] },
  'cultivação / murim': { tags: ['Cultivation', 'Wuxia'] },
  'necromante / invocação': { tags: ['Necromancy'] },
  'academia de magia': { tags: ['Magic', 'School'] },
  'harém': { tags: ['Female Harem'] },
  'harem invertido': { tags: ['Male Harem'] },
  'yaoi / bl': { tags: ["Boys' Love"] },
  'yuri / gl': { tags: ['Yuri'] },
  'troca de gênero': { tags: ['Gender Bending'] },
  'crossdressing / trap': { tags: ['Crossdressing'] },
  'protagonista criança / shota': { tags: ['Primarily Child Cast', 'Kids', 'Age Regression'] },
  'nobreza / aristocracia': { tags: ['Royal Affairs', 'Politics'] },
  'economia / comércio / império': { tags: ['Economics'] },
  'ferreiro / artesão / mercador': { tags: ['Crafts', 'Alchemy', 'Economics'] },
  'médico / curandeiro': { tags: ['Medicine'] },
  'vida lenta (slow life)': { tags: ['Iyashikei'] },
  'iyashikei / relaxante': { tags: ['Iyashikei'] },
  'fazenda / agricultura': { tags: ['Agriculture'] },
  'cuidando de criança (childcare)': { tags: ['Parenthood', 'Adoption'] },
  'animais / pets': { tags: ['Animals'] },
  'culinária / gastronomia': { tags: ['Food'] },
  'estalagem / restaurante / café': { tags: ['Restaurant', 'Inn', 'Food'] },
  'professor / tutor / mentor': { tags: ['Teacher'] },
  'mordomo / empregada': { tags: ['Maids', 'Butler'] },
  'santa / sacerdotisa': { tags: ['Shrine Maiden', 'Nun'] },
  'showbiz / atuação': { tags: ['Acting', 'Idol'] },
  'música / artes': { tags: ['Idol', 'Band', 'Drawing'], genres: ['Music'] },
  'otaku / mangaká / cosplay': { tags: ['Otaku Culture', 'Cosplay'] },
  'cgdct / clube escolar': { tags: ['Cute Girls Doing Cute Things', 'School Club'] },
  'paródia / humor nonsense': { tags: ['Parody', 'Surreal Comedy'] },
  'educacional / curiosidades': { tags: ['Educational'] },
  'romance colegial': { tags: ['School'], genres: ['Romance'] },
  'trabalho / adulto': { tags: ['Work', 'Office'] },
  'romcom / comédia romântica': { genres: ['Romance', 'Comedy'] },
  'delinquente / gangue': { tags: ['Delinquents', 'Gangs'] },
  'máfia / yakuza / crime': { tags: ['Yakuza', 'Mafia', 'Crime'] },
  'policial / detetive': { tags: ['Detective', 'Police'] },
  'militar / guerra': { tags: ['Military', 'War'] },
  'samurai / espadachim': { tags: ['Samurai', 'Swordplay'] },
  'ninja / shinobi / assassino': { tags: ['Ninja', 'Assassins'] },
  'super-heróis / poderes': { tags: ['Superhero', 'Super Power'] },
  'garotas mágicas (mahou shoujo)': { tags: ['Henshin', 'Magic'] },
  'fantasmas / ocultismo': { tags: ['Ghost', 'Youkai', 'Exorcism'] },
  'vampiros': { tags: ['Vampire'] },
  'monstros / demônios': { tags: ['Demons', 'Youkai'] },
  'garotas monstro': { tags: ['Monster Girl'] },
  'fantasia urbana': { tags: ['Urban Fantasy'] },
  'mitologia / deuses': { tags: ['Mythology', 'Gods'] },
  'anjos / demônios / guerra santa': { tags: ['Angels', 'Demons'] },
  'piratas / navegação': { tags: ['Pirates'] },
  'steampunk / vitoriano': { tags: ['Steampunk'] },
  'velho oeste / faroeste': { tags: ['Cowboys'] },
  'sobrevivência na selva / ilha': { tags: ['Wilderness', 'Survival'] },
  'loop temporal ': { tags: ['Time Loop'] },
  'mistério de assassinato': { tags: ['Detective', 'Crime'] },
  'body horror / mutação': { tags: ['Body Horror'] },
  'horror cósmico / cultos': { tags: ['Cosmic Horror', 'Cult'] },
  'pós-apocalíptico': { tags: ['Post-Apocalyptic', 'Dystopian'] },
  'apocalipse / zumbis': { tags: ['Zombie', 'Survival'] },
  'cyberpunk / futurista': { tags: ['Cyberpunk', 'Dystopian'] },
  'espacial / aliens': { tags: ['Space', 'Aliens'] },
  'mecha / robôs': { tags: ['Robots', 'Real Robot', 'Super Robot'], genres: ['Mecha'] },
  'realidade virtual / vrmmo': { tags: ['Virtual World', 'Video Games'] },
  'jogo da morte': { tags: ['Death Game', 'Battle Royale'] },
  'sobrevivência': { tags: ['Survival'] },
  'psicológico': { genres: ['Psychological'] },
  'suspense / thriller': { genres: ['Thriller'] },
  'tragédia / drama pesado': { tags: ['Tragedy'] },
  'gore / violência': { tags: ['Gore'] },
  'filosofia / reflexivo': { tags: ['Philosophy'] },
  'artes marciais': { tags: ['Martial Arts'] },
  'esportes de combate': { tags: ['Boxing', 'Wrestling', 'Judo'] },
  'esportes em equipe': { tags: ['Football', 'Basketball', 'Volleyball', 'Baseball'] },
  'corrida / carros / drift': { tags: ['Cars'] },
  'jogos / e-sports / apostas': { tags: ['Video Games', 'E-Sports', 'Gambling'] },
  'jogos de tabuleiro / cartas': { tags: ['Board Game', 'Card Battle', 'Mahjong', 'Shogi'] },
  'colorido (full color)': { tags: ['Full Color'] },
  'webtoon / scroll vertical': { tags: ['Long Strip'] },
  '4-koma (tirinhas)': { tags: ['4-koma'] },
  'antologia / coletânea': { tags: ['Anthology'] },
  'ação': { genres: ['Action'] },
  'fantasia': { genres: ['Fantasy'] },
  'comédia': { genres: ['Comedy'] },
  'aventura': { genres: ['Adventure'] },
  'drama': { genres: ['Drama'] },
  'sobrenatural': { genres: ['Supernatural'] },
  'histórico': { tags: ['Historical'] },
  'horror': { genres: ['Horror'] },
  'sci-fi': { genres: ['Sci-Fi'] },
  'romance': { genres: ['Romance'] },
  'mistério': { genres: ['Mystery'] },
  'slice of life': { genres: ['Slice of Life'] },
  'esportes': { genres: ['Sports'] }
};

function normalizeMatchTitle(t: string): string {
  return (t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\((?:official|colored|full\s*color|digital|webtoon|manga|uncensored|simulpub|pt-br|en)\)/gi, '')
    .replace(/[^a-z0-9]/g, '');
}

function stripHtmlSimple(html?: string | null): string {
  if (!html) return '';
  const stripped = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(stripped);
}

export function extractAniListFilters(options?: SourceSearchOptions): {
  tagGroups: string[][];
  allTags: string[];
  requiredGenres: string[];
  hasNicheTag: boolean;
} {
  const requestedRaw = [
    ...(Array.isArray(options?.genres) ? options.genres : []),
    ...(options?.genre && options.genre !== 'all' ? [options.genre] : [])
  ];

  const seenUi = new Set<string>();
  const tagGroups: string[][] = [];
  const allTags = new Set<string>();
  const requiredGenres = new Set<string>();
  let hasNicheTag = false;

  for (const raw of requestedRaw) {
    const lower = raw.toLowerCase().trim();
    if (!lower || seenUi.has(lower)) continue;
    seenUi.add(lower);

    const mapped = UI_TO_ANILIST_MAP[lower];
    if (!mapped) continue;

    if (mapped.tags && mapped.tags.length > 0) {
      hasNicheTag = true;
      tagGroups.push(mapped.tags);
      mapped.tags.forEach(t => allTags.add(t));
    }
    if (mapped.genres) {
      mapped.genres.forEach(g => requiredGenres.add(g));
    }
  }

  return {
    tagGroups,
    allTags: Array.from(allTags),
    requiredGenres: Array.from(requiredGenres),
    hasNicheTag
  };
}

export function shouldUseAniListDiscovery(query: string, options?: SourceSearchOptions): boolean {
  if (query.trim().length > 0) return false;
  // Don't invoke external AniList discovery if searching inside an unknown/test-only custom source
  const { hasNicheTag } = extractAniListFilters(options);
  return hasNicheTag;
}

function mapTypeToCountry(type?: string): string | undefined {
  const t = (type || '').toLowerCase();
  if (t === 'manga') return 'JP';
  if (t === 'manhwa') return 'KR';
  if (t === 'manhua') return 'CN';
  return undefined;
}

function mapStatusToAniList(status?: string): string | undefined {
  const s = (status || '').toLowerCase();
  if (s === 'ongoing') return 'RELEASING';
  if (s === 'completed') return 'FINISHED';
  if (s === 'hiatus') return 'HIATUS';
  if (s === 'cancelled') return 'CANCELLED';
  return undefined;
}

async function fetchAniListMediaBatch(
  aniPage: number,
  allTags: string[],
  requiredGenres: string[],
  country?: string,
  status?: string,
  includeAdult?: boolean
): Promise<any[]> {
  const query = `
    query ($page: Int, $tags: [String], $genres: [String], $country: CountryCode, $status: MediaStatus, $isAdult: Boolean) {
      Page(page: $page, perPage: 50) {
        media(
          type: MANGA,
          tag_in: $tags,
          genre_in: $genres,
          countryOfOrigin: $country,
          status: $status,
          isAdult: $isAdult,
          sort: [POPULARITY_DESC, SCORE_DESC]
        ) {
          id
          title { english romaji }
          synonyms
          genres
          tags { name rank isMediaSpoiler }
          countryOfOrigin
          status
          averageScore
          description(asHtml: false)
          isAdult
          startDate { year }
        }
      }
    }
  `;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        query,
        variables: {
          page: aniPage,
          tags: allTags.length > 0 ? allTags : undefined,
          genres: requiredGenres.length > 0 ? requiredGenres : undefined,
          country: country || undefined,
          status: status || undefined,
          isAdult: includeAdult ? undefined : false
        }
      }),
      signal: controller.signal
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    return Array.isArray(json?.data?.Page?.media) ? json.data.Page.media : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFilteredAniListCandidates(
  options: SourceSearchOptions,
  targetPage: number
): Promise<AniListCandidate[]> {
  const { tagGroups, allTags, requiredGenres } = extractAniListFilters(options);
  if (allTags.length === 0 && requiredGenres.length === 0) return [];

  const country = mapTypeToCountry(options.type);
  const status = mapStatusToAniList(options.status);
  const includeAdult = Boolean(options.includeAdult);
  const demo = options.demographic && options.demographic !== 'all' ? options.demographic.toLowerCase() : undefined;

  const cacheKey = `anilist_disc_v2:${allTags.join(',')}:${requiredGenres.join(',')}:${country || 'all'}:${status || 'all'}:${demo || 'all'}:${includeAdult}:p${targetPage}`;
  const cached = globalCache.get<AniListCandidate[]>(cacheKey);
  if (cached) return cached;

  // Query 2 AniList pages in parallel so plenty of high-rank subgenre hits remain
  const startAniPage = (targetPage - 1) * 2 + 1;
  const pagesToFetch = targetPage === 1 ? [1, 2] : [startAniPage, startAniPage + 1];
  const rawPages = await Promise.all(
    pagesToFetch.map(p => fetchAniListMediaBatch(p, allTags, requiredGenres, country, status, includeAdult))
  );

  const seenIds = new Set<number>();
  const candidates: AniListCandidate[] = [];

  for (const list of rawPages) {
    for (const m of list) {
      if (!m || !m.id || seenIds.has(m.id)) continue;
      seenIds.add(m.id);
      if (!includeAdult && m.isAdult) continue;

      const genres: string[] = Array.isArray(m.genres) ? m.genres.map(String) : [];
      const tags: AniListTagItem[] = Array.isArray(m.tags)
        ? m.tags.filter((t: any) => t && t.name && !t.isMediaSpoiler).map((t: any) => ({
            name: String(t.name),
            rank: Number(t.rank || 0)
          }))
        : [];

      const genresLower = new Set(genres.map(g => g.toLowerCase()));
      if (requiredGenres.some(rg => !genresLower.has(rg.toLowerCase()))) {
        continue;
      }

      const tagRankMap = new Map<string, number>();
      for (const t of tags) {
        tagRankMap.set(t.name.toLowerCase(), t.rank || 0);
      }

      if (demo && !tagRankMap.has(demo) && !genresLower.has(demo)) {
        continue;
      }

      // Every requested subgenre tagGroup must match with reasonable tag rank (>= 45, or >= 50 primary)
      let totalRankScore = 0;
      let missingGroup = false;
      for (const group of tagGroups) {
        let bestGroupRank = 0;
        for (const tagName of group) {
          const r = tagRankMap.get(tagName.toLowerCase()) || 0;
          if (r > bestGroupRank) bestGroupRank = r;
        }
        if (bestGroupRank < 45) {
          missingGroup = true;
          break;
        }
        totalRankScore += bestGroupRank;
      }
      if (missingGroup) continue;

      candidates.push({
        id: Number(m.id),
        titleEnglish: m.title?.english ? String(m.title.english) : undefined,
        titleRomaji: m.title?.romaji ? String(m.title.romaji) : undefined,
        synonyms: Array.isArray(m.synonyms) ? m.synonyms.map(String).slice(0, 6) : [],
        genres,
        tags: tags.filter(t => (t.rank || 0) >= 40).slice(0, 14),
        countryOfOrigin: m.countryOfOrigin ? String(m.countryOfOrigin) : undefined,
        status: m.status ? String(m.status) : undefined,
        averageScore: m.averageScore ? Number(m.averageScore) : undefined,
        description: stripHtmlSimple(m.description),
        isAdult: Boolean(m.isAdult),
        startYear: m.startDate?.year ? Number(m.startDate.year) : undefined,
        relevanceScore: totalRankScore + (m.averageScore ? m.averageScore * 0.2 : 0)
      });
    }
  }

  candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
  globalCache.set(cacheKey, candidates, 3600);
  return candidates;
}

function candidateTitlesMatch(candidate: AniListCandidate, manga: Manga): boolean {
  const candidateNorms = new Set(
    [candidate.titleEnglish, candidate.titleRomaji, ...candidate.synonyms]
      .filter((t): t is string => Boolean(t && t.trim().length >= 3))
      .map(normalizeMatchTitle)
      .filter(n => n.length >= 3)
  );
  if (candidateNorms.size === 0) return false;

  const mangaNorms = [manga.title, ...(manga.altTitles || [])]
    .filter((t): t is string => Boolean(t && t.trim().length >= 3))
    .map(normalizeMatchTitle)
    .filter(n => n.length >= 3);

  return mangaNorms.some(n => candidateNorms.has(n));
}

function enrichMangaWithAniList(manga: Manga, cand: AniListCandidate): Manga {
  const mergedGenres = new Set<string>(manga.genres || []);
  for (const g of cand.genres) mergedGenres.add(g);
  for (const t of cand.tags) {
    if ((t.rank || 0) >= 45) mergedGenres.add(t.name);
  }

  const mergedAlts = new Set<string>(manga.altTitles || []);
  if (cand.titleEnglish && cand.titleEnglish !== manga.title) mergedAlts.add(cand.titleEnglish);
  if (cand.titleRomaji && cand.titleRomaji !== manga.title) mergedAlts.add(cand.titleRomaji);
  for (const syn of cand.synonyms) {
    if (syn && syn !== manga.title) mergedAlts.add(syn);
  }

  const isDefaultSynopsis = !manga.synopsis || manga.synopsis === 'Sinopse não disponível.' || manga.synopsis.length < 25;
  const synopsis = isDefaultSynopsis && cand.description && cand.description.length > 25
    ? cand.description
    : manga.synopsis;

  let demographic = manga.publicationInfo?.demographic;
  if (!demographic) {
    const tagLower = cand.tags.map(t => t.name.toLowerCase());
    if (tagLower.includes('shounen')) demographic = 'shounen';
    else if (tagLower.includes('seinen')) demographic = 'seinen';
    else if (tagLower.includes('shoujo')) demographic = 'shoujo';
    else if (tagLower.includes('josei')) demographic = 'josei';
  }

  return {
    ...manga,
    altTitles: Array.from(mergedAlts).slice(0, 12),
    genres: Array.from(mergedGenres),
    synopsis,
    rating: manga.rating || (cand.averageScore ? Number((cand.averageScore / 10).toFixed(1)) : undefined),
    publicationInfo: {
      ...manga.publicationInfo,
      country: manga.publicationInfo?.country || cand.countryOfOrigin,
      releaseYear: manga.publicationInfo?.releaseYear || cand.startYear,
      demographic
    }
  };
}

async function resolveCandidateInSources(
  cand: AniListCandidate,
  sourcesToQuery: IMangaSource[],
  options: SourceSearchOptions
): Promise<Manga | null> {
  const sourceIdsKey = sourcesToQuery.map(s => s.getInfo().id).join(',');
  const langKey = options.language || 'all';
  const availKey = options.onlyAvailable !== false ? '1' : '0';
  const resolveKey = `anilist_resolve_v1:${cand.id}:${sourceIdsKey}:${langKey}:${availKey}`;
  const cached = globalCache.get<Manga | null>(resolveKey);
  if (cached !== undefined) return cached;

  const lookupTitles = Array.from(
    new Set([cand.titleEnglish, cand.titleRomaji].filter((t): t is string => Boolean(t && t.trim().length >= 2)))
  );
  if (lookupTitles.length === 0) return null;

  // Prefer reliable fast-metadata live providers first
  const priorityOrder = ['mangadex', 'weebcentral', 'comick', 'mangapill'];
  const orderedSources = [...sourcesToQuery].sort((a, b) => {
    const ia = priorityOrder.indexOf(a.getInfo().id);
    const ib = priorityOrder.indexOf(b.getInfo().id);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  }).slice(0, 3);

  const cleanOptions: SourceSearchOptions = {
    language: options.language,
    type: options.type,
    onlyAvailable: options.onlyAvailable,
    includeAdult: options.includeAdult,
    limit: 4,
    page: 1
  };

  const isCandDoujin = cand.tags.some(t => t.name.toLowerCase() === 'doujinshi');
  for (const src of orderedSources) {
    for (const title of lookupTitles) {
      try {
        const res = await src.search(title, cleanOptions);
        const matches = (res.mangaList || []).filter(m => {
          if (!candidateTitlesMatch(cand, m)) return false;
          if (!isCandDoujin) {
            const isDoujin =
              (m.genres || []).some(g => g.toLowerCase() === 'doujinshi') ||
              /\(doujinshi\)/i.test(m.title);
            if (isDoujin) return false;
          }
          return true;
        });
        const match = matches[0];
        if (match) {
          const enriched = enrichMangaWithAniList(match, cand);
          globalCache.set(resolveKey, enriched, 6 * 3600);
          return enriched;
        }
      } catch {
        // try next title/source
      }
    }
  }

  globalCache.set(resolveKey, null, 1800);
  return null;
}

/**
 * Discovers readable manga works matching AniList community tags & protagonist filters,
 * resolves them against active readable providers, and enriches their metadata/tags.
 */
export async function discoverViaAniList(
  sourcesToQuery: IMangaSource[],
  options: SourceSearchOptions
): Promise<Manga[]> {
  if (!sourcesToQuery || sourcesToQuery.length === 0) return [];
  const page = Math.max(1, options.page || 1);

  try {
    const candidates = await fetchFilteredAniListCandidates(options, page);
    if (candidates.length === 0) return [];

    // Resolve top 12 candidates in small batches of 4 to avoid rate limiting
    const slice = candidates.slice(0, 12);
    const resolved: Manga[] = [];
    const batchSize = 4;

    for (let i = 0; i < slice.length; i += batchSize) {
      const batch = slice.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(cand => resolveCandidateInSources(cand, sourcesToQuery, options))
      );
      for (const item of batchResults) {
        if (item) resolved.push(item);
      }
    }

    return resolved;
  } catch {
    return [];
  }
}
