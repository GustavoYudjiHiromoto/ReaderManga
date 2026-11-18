import { IMangaSource, SourceSearchOptions } from './IMangaSource.js';
import { Manga, Chapter, MangaPage, MangaSourceInfo, PingErrorCode } from '../../src/types/manga.js';
import { MangaDexProvider } from './MangaDexProvider.js';
import { ComickProvider } from './ComickProvider.js';
import { MangaPillProvider } from './MangaPillProvider.js';
import { WeebCentralProvider } from './WeebCentralProvider.js';
import { MangaFireProvider } from './MangaFireProvider.js';
import { MangaBallProvider } from './MangaBallProvider.js';
import { HttpError } from '../errors/HttpError.js';
import { deduplicateAndGroupChapters, normalizeChapterNumber } from './ChapterDeduplicator.js';
import { extensionRepositoryService } from './ExtensionRepositoryService.js';
import { matchesProtagonistGender } from '../../src/utils/protagonistFilter.js';

function stripEditionTags(t: string): string {
  return (t || '')
    .replace(/\((?:official|colored|full\s*color|digital|webtoon|manga|uncensored|simulpub|pt-br|en)\)/gi, '')
    .replace(/\[(?:official|colored|pt-br|en|br|eng)\]/gi, '')
    .trim();
}

function normalizeTitle(t: string): string {
  if (!t) return '';
  return stripEditionTags(t)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function areSameManga(m1: Manga, m2: Manga): boolean {
  if (m1.id === m2.id) return true;

  const norm1 = normalizeTitle(m1.title);
  const norm2 = normalizeTitle(m2.title);

  // Exact normalized title match (at least 3 characters)
  if (norm1 && norm2 && norm1.length >= 3 && norm1 === norm2) {
    return true;
  }

  // Cross-check altTitles against main title
  const alts1 = (m1.altTitles || []).map(normalizeTitle).filter(a => a.length >= 3);
  const alts2 = (m2.altTitles || []).map(normalizeTitle).filter(a => a.length >= 3);

  if (norm2.length >= 4 && alts1.includes(norm2)) return true;
  if (norm1.length >= 4 && alts2.includes(norm1)) return true;

  // Cross altTitles match for significant titles
  for (const a1 of alts1) {
    if (a1.length >= 5 && alts2.includes(a1)) {
      return true;
    }
  }

  // Romaji particle tolerance (e.g. "Koi o Suru" vs "Koi wo Suru") for long titles
  const romajiLoose = (s: string) => s.replace(/wo/g, 'o').replace(/ou/g, 'o');
  const all1 = [norm1, ...alts1].filter(s => s.length >= 12).map(romajiLoose);
  const all2 = [norm2, ...alts2].filter(s => s.length >= 12).map(romajiLoose);
  for (const r1 of all1) {
    if (all2.includes(r1)) return true;
  }

  return false;
}

function mergeManga(primary: Manga, secondary: Manga): Manga {
  const mergedSources = [...primary.sources];
  for (const s of secondary.sources) {
    if (!mergedSources.some(existing => existing.sourceId === s.sourceId && existing.externalId === s.externalId)) {
      mergedSources.push(s);
    }
  }

  const altTitlesSet = new Set([...primary.altTitles, ...secondary.altTitles]);
  altTitlesSet.delete(primary.title);

  const genresSet = new Set([...primary.genres, ...secondary.genres]);

  const authors = primary.authors.includes('Autor Desconhecido') && !secondary.authors.includes('Autor Desconhecido')
    ? secondary.authors
    : primary.authors;

  const artists = primary.artists.includes('Artista Desconhecido') && !secondary.artists.includes('Artista Desconhecido')
    ? secondary.artists
    : primary.artists;

  const isDefaultSynopsis = !primary.synopsis || primary.synopsis === 'Sinopse não disponível.' || primary.synopsis.length < 30;
  const synopsis = isDefaultSynopsis && secondary.synopsis && secondary.synopsis.length > 30
    ? secondary.synopsis
    : primary.synopsis;

  const isDefaultCover = !primary.coverUrl || primary.coverUrl.includes('images.unsplash.com');
  const coverUrl = isDefaultCover && secondary.coverUrl && !secondary.coverUrl.includes('images.unsplash.com')
    ? secondary.coverUrl
    : primary.coverUrl;

  return {
    ...primary,
    altTitles: Array.from(altTitlesSet).slice(0, 12),
    genres: Array.from(genresSet),
    authors,
    artists,
    synopsis,
    coverUrl,
    sources: mergedSources,
    rating: primary.rating || secondary.rating,
    publicationInfo: {
      releaseYear: primary.publicationInfo?.releaseYear || secondary.publicationInfo?.releaseYear,
      country: primary.publicationInfo?.country || secondary.publicationInfo?.country,
      demographic: primary.publicationInfo?.demographic || secondary.publicationInfo?.demographic,
      magazine: primary.publicationInfo?.magazine || secondary.publicationInfo?.magazine
    },
    isAdult: Boolean(primary.isAdult || secondary.isAdult),
    contentRating: (primary.contentRating === 'pornographic' || secondary.contentRating === 'pornographic')
      ? 'pornographic'
      : (primary.contentRating === 'erotica' || secondary.contentRating === 'erotica')
      ? 'erotica'
      : (primary.contentRating === 'suggestive' || secondary.contentRating === 'suggestive')
      ? 'suggestive'
      : 'safe',
    hasAvailableChapters: Boolean(primary.hasAvailableChapters || secondary.hasAvailableChapters),
    availabilityStatus: (primary.hasAvailableChapters || secondary.hasAvailableChapters)
      ? 'available'
      : 'metadata_only'
  };
}

export function deduplicateMangaList(list: Manga[]): Manga[] {
  const result: Manga[] = [];

  for (const item of list) {
    const existingIndex = result.findIndex(r => areSameManga(r, item));
    if (existingIndex >= 0) {
      result[existingIndex] = mergeManga(result[existingIndex], item);
    } else {
      result.push({ ...item });
    }
  }

  return result;
}

export class SourceRegistry {
  private sources: Map<string, IMangaSource> = new Map();

  constructor() {
    this.registerSource(new ComickProvider());
    this.registerSource(new MangaDexProvider());
    this.registerSource(new WeebCentralProvider());
    this.registerSource(new MangaPillProvider());
    this.registerSource(new MangaFireProvider());
    this.registerSource(new MangaBallProvider());
    extensionRepositoryService.attachRegistry(this);
  }

  public registerSource(source: IMangaSource): void {
    const info = source.getInfo();
    this.sources.set(info.id, source);
  }

  public unregisterSource(id: string): boolean {
    return this.sources.delete(id);
  }

  public getSources(): MangaSourceInfo[] {
    return Array.from(this.sources.values()).map(s => s.getInfo());
  }

  public getSource(id: string): IMangaSource | undefined {
    return this.sources.get(id);
  }

  /**
   * Search across a specified source or all sources simultaneously.
   * When searching across all sources, live providers (Comick, MangaDex, WeebCentral, MangaPill)
   * are queried in parallel, safe cross-source deduplication merges identical works,
   * and exact title matches are ranked first.
   */
  public async search(query: string, options?: SourceSearchOptions & { sourceId?: string; enabledSources?: string[] }): Promise<{
    results: Manga[];
    total: number;
    sourcesQueried: string[];
  }> {
    const targetSourceId = options?.sourceId;
    const sourcesToQuery: IMangaSource[] = [];

    if (targetSourceId && targetSourceId !== 'all') {
      const src = this.sources.get(targetSourceId);
      if (src) sourcesToQuery.push(src);
    } else {
      // Query enabled live sources in user priority order, or all registered sources by default
      const defaultLiveIds = Array.from(this.sources.keys());
      let candidateIds = defaultLiveIds;
      if (options?.enabledSources && options.enabledSources.length > 0) {
        candidateIds = options.enabledSources.filter(id => this.sources.has(id));
        if (candidateIds.length === 0) candidateIds = defaultLiveIds;
      }

      for (const id of candidateIds) {
        // Skip strictly English-only sources when user specifically filters for Portuguese-only
        if (options?.language === 'pt-br' && (id === 'mangapill' || id === 'weebcentral')) {
          continue;
        }
        const src = this.sources.get(id);
        if (src && !sourcesToQuery.includes(src)) sourcesToQuery.push(src);
      }
    }

    const TROPE_SYNONYM_QUERIES: Record<string, string[]> = {
      'overpower (op)': ['overpowered', 'strongest', 'cheat', 'invincible'],
      'overpower': ['overpowered', 'strongest', 'cheat', 'invincible'],
      'construção de vila': ['village building', 'kingdom building', 'territory'],
      'construção de vila / reino': ['village building', 'kingdom building', 'territory'],
      'fazenda / agricultura': ['farming', 'slow life', 'agriculture'],
      'dungeon / sistema': ['dungeon', 'system', 'hunter', 'leveling'],
      'domador de monstros': ['monster tamer', 'beast tamer', 'tamer'],
      'vingança': ['revenge', 'avenger', 'betrayal'],
      'regressão / tempo': ['regression', 'time travel', 'regressor'],
      'yandere': ['yandere', 'stalker'],
      'tomboy': ['tomboy', 'boyish'],
      'vilã (villainess)': ['villainess', 'vilã'],
      'reencarnação': ['reincarnation', 'transmigration'],
      'protagonista criança / shota': ['child protagonist', 'reincarnated as a boy', 'young lord isekai'],
      'nobreza / aristocracia': ['aristocrat', 'noble isekai', 'duke'],
      'avaliação (appraisal)': ['appraisal', 'kantei'],
      'recrutamento / aliados': ['recruit', 'loyal subordinates', 'talent'],
      'ferreiro / artesão / mercador': ['blacksmith', 'merchant', 'alchemy'],
      'médico / curandeiro': ['doctor isekai', 'healer', 'pharmacy'],
      'vida lenta (slow life)': ['slow life', 'peaceful life'],
      'estrategista / gênio': ['strategist', 'genius', 'tactician'],
      'necromante / invocação': ['necromancer', 'summoner', 'skeleton'],
      'torre / escalada': ['tower', 'climber', 'floor'],
      'cyberpunk / futurista': ['cyberpunk', 'android', 'dystopia'],
      'aventura em guilda / rank s': ['guild', 's-rank', 'adventurer', 'banished'],
      'realidade virtual / vrmmo': ['vrmmo', 'virtual reality', 'vr game'],
      'vampiros': ['vampire', 'vampires'],
      'samurai / espadachim': ['samurai', 'swordmaster', 'katana'],
      'ninja / shinobi / assassino': ['ninja', 'shinobi', 'assassin'],
      'máfia / yakuza / crime': ['mafia', 'yakuza', 'crime'],
      'super-heróis / poderes': ['superhero', 'super power'],
      'garotas mágicas (mahou shoujo)': ['magical girls', 'mahou shoujo'],
      'fantasmas / ocultismo': ['ghosts', 'exorcist', 'occult'],
      'pós-apocalíptico': ['post-apocalyptic', 'wasteland'],
      'suspense / thriller': ['thriller', 'suspense'],
      'tragédia / drama pesado': ['tragedy'],
      'gore / violência': ['gore'],
      'gyaru': ['gyaru'],
      'garotas monstro': ['monster girls'],
      'colorido (full color)': ['full color'],
      'jogos / e-sports / apostas': ['video games', 'gambling'],
      'filosofia / reflexivo': ['philosophical'],
      'artes marciais': ['martial arts', 'fighting'],
      'expulso do grupo': ['banished', 'kicked out', 'expelled'],
      'fraco para forte': ['weakest', 'f-rank', 'leveling'],
      'reencarnado como monstro': ['reincarnated as a', 'slime', 'goblin', 'dragon', 'spider'],
      'lorde demônio / rei demônio': ['demon lord', 'demon king', 'maou'],
      'constelações / stream divino': ['constellation', 'constellations', 'sponsor'],
      'herói invocado / traído': ['summoned hero', 'betrayed hero', 'hero party'],
      'portais na terra (gate)': ['hunter', 'gate', 'awakening'],
      'habilidade única / cheat': ['cheat skill', 'unique skill', 'status window'],
      'imortal / cultivo moderno': ['immortal', 'urban cultivation'],
      'casamento por contrato': ['contract marriage', 'arranged marriage', 'fake marriage'],
      'inimigos para amantes': ['rival', 'enemies to lovers', 'arch-enemy'],
      'amigos de infância': ['childhood friend', 'childhood friends'],
      'rompimento de noivado': ['broken engagement', 'engagement annulled'],
      'triângulo amoroso': ['love triangle', 'love polygon'],
      'diferença de idade': ['age gap', 'older woman', 'younger'],
      'kuudere / fria por fora': ['ice queen', 'kuudere', 'cold'],
      'tsundere': ['tsundere'],
      'dandere / tímida(o)': ['shy', 'dandere', 'introvert'],
      'morando juntos / vizinhos': ['neighbor', 'roommate', 'cohabitation'],
      'vida de casado / recém-casados': ['married life', 'newlywed', 'wife'],
      'amor proibido / secreto': ['forbidden love', 'secret relationship'],
      'iyashikei / relaxante': ['iyashikei', 'healing', 'cozy'],
      'cuidando de criança (childcare)': ['childcare', 'daughter', 'single father'],
      'animais / pets': ['animals', 'pets', 'cat', 'dog'],
      'estalagem / restaurante / café': ['cafe', 'tavern', 'bakery', 'restaurant'],
      'professor / tutor / mentor': ['teacher', 'instructor', 'tutor'],
      'mordomo / empregada': ['maid', 'butler'],
      'showbiz / atuação': ['showbiz', 'actor', 'actress', 'idol'],
      'otaku / mangaká / cosplay': ['otaku', 'mangaka', 'cosplay'],
      'santa / sacerdotisa': ['saint', 'saintess', 'priestess'],
      'economia / comércio / império': ['merchant', 'economics', 'business'],
      'engenharia / magitec': ['engineer', 'inventor', 'magitech'],
      'fantasia urbana': ['urban fantasy', 'modern magic'],
      'mitologia / deuses': ['mythology', 'goddess', 'god'],
      'anjos / demônios / guerra santa': ['angel', 'fallen angel'],
      'piratas / navegação': ['pirate', 'pirates'],
      'mercenário / caçador de recompensas': ['mercenary', 'bounty hunter'],
      'steampunk / vitoriano': ['steampunk', 'victorian'],
      'velho oeste / faroeste': ['western', 'cowboy'],
      'sobrevivência na selva / ilha': ['island', 'deserted island'],
      'anti-herói / vilão mc': ['antihero', 'villain'],
      'loop temporal': ['time loop', 'regression'],
      'mistério de assassinato': ['murder', 'detective', 'serial killer'],
      'body horror / mutação': ['parasite', 'mutation'],
      'horror cósmico / cultos': ['cult', 'eldritch'],
      'espacial / aliens': ['space', 'aliens', 'starship'],
      'esportes de combate': ['boxing', 'mma', 'wrestling'],
      'esportes em equipe': ['soccer', 'basketball', 'volleyball', 'baseball'],
      'corrida / carros / drift': ['racing', 'drift', 'cars']
    };

    const effectiveOptions: SourceSearchOptions | undefined = options?.protagonist
      ? { ...options, limit: Math.min(Math.max(options.limit || 24, 48), 60) }
      : options;

    const extraSynonyms: string[] = [];
    if (!query.trim() && options?.genres) {
      for (const g of options.genres) {
        const found = TROPE_SYNONYM_QUERIES[g.toLowerCase()];
        if (found) {
          extraSynonyms.push(...found.slice(1));
          break;
        }
      }
    }

    const promises = sourcesToQuery.map(src =>
      src.search(query, effectiveOptions).catch(err => {
        console.error(`Error querying source ${src.getInfo().id}:`, err);
        return { mangaList: [], total: 0, hasMore: false };
      })
    );

    const extraPromises = extraSynonyms.flatMap(syn =>
      sourcesToQuery
        .filter(src => src.getInfo().id !== 'mangapill')
        .map(src =>
          src.search(syn, { ...effectiveOptions, genres: undefined, genre: undefined }).catch(() => ({ mangaList: [], total: 0, hasMore: false }))
        )
    );

    // If browsing Female Protagonist without text query or explicit subgenre, include Villainess/FMC catalog batch
    if (options?.protagonist === 'female' && !query.trim() && (!options.genres || options.genres.length === 0)) {
      for (const src of sourcesToQuery) {
        const id = src.getInfo().id;
        if (id === 'mangadex' || id === 'comick' || id === 'weebcentral') {
          extraPromises.push(
            src.search('', { ...effectiveOptions, genre: 'villainess', genres: ['villainess'] }).catch(() => ({ mangaList: [], total: 0, hasMore: false }))
          );
        }
      }
    }

    const [outcomes, extraOutcomes] = await Promise.all([
      Promise.all(promises),
      Promise.all(extraPromises)
    ]);
    const rawLiveResults: Manga[] = [];

    if (!query.trim() && outcomes.length > 1) {
      const maxLen = Math.max(...outcomes.map(o => o.mangaList.length), 0);
      for (let i = 0; i < maxLen; i++) {
        for (const outcome of outcomes) {
          if (i < outcome.mangaList.length) {
            rawLiveResults.push(outcome.mangaList[i]);
          }
        }
      }
    } else {
      outcomes.forEach((outcome) => {
        rawLiveResults.push(...outcome.mangaList);
      });
    }
    extraOutcomes.forEach((outcome) => {
      rawLiveResults.push(...outcome.mangaList);
    });

    // Safely deduplicate live results across Comick, MangaDex, WeebCentral, and MangaPill
    let liveResults = deduplicateMangaList(rawLiveResults);

    // Filter adult if includeAdult is not explicitly true (Safe Mode by default)
    if (!options?.includeAdult) {
      liveResults = liveResults.filter(m => !m.isAdult);
    }

    // Filter by availability: exclude metadata-only works without readable chapters
    if (options?.onlyAvailable !== false) {
      liveResults = liveResults.filter(m => m.hasAvailableChapters !== false);
    }

    // Filter by demographic if requested
    if (options?.demographic && options.demographic !== 'all') {
      const targetDemo = options.demographic.toLowerCase();
      liveResults = liveResults.filter(m => {
        const demo = m.publicationInfo?.demographic?.toLowerCase() ||
          (m.genres.some(g => g.toLowerCase().includes('shounen') || g.toLowerCase().includes('shonen')) ? 'shounen'
          : m.genres.some(g => g.toLowerCase().includes('shoujo') || g.toLowerCase().includes('shojo')) ? 'shoujo'
          : m.genres.some(g => g.toLowerCase().includes('seinen')) ? 'seinen'
          : m.genres.some(g => g.toLowerCase().includes('josei')) ? 'josei' : undefined);
        return demo === targetDemo;
      });
    }

    // Filter by protagonist gender if requested
    if (options?.protagonist) {
      liveResults = liveResults.filter(m => matchesProtagonistGender(m, options.protagonist!));
    }

    // Filter by status if requested
    if (options?.status && options.status !== 'all') {
      const targetStatus = options.status.toLowerCase();
      liveResults = liveResults.filter(m => m.status === targetStatus);
    }

    // Filter by format/type if requested
    if (options?.type && options.type !== 'all') {
      const targetType = options.type.toLowerCase();
      liveResults = liveResults.filter(m => {
        const country = (m.publicationInfo?.country || '').toLowerCase();
        const gLowers = (m.genres || []).map(g => g.toLowerCase());
        let detected = 'manga';
        if (country === 'kr' || country === 'ko' || country === 'coreia' || country === 'korea' || gLowers.includes('manhwa')) detected = 'manhwa';
        else if (country === 'cn' || country === 'china' || country === 'zh' || gLowers.includes('manhua')) detected = 'manhua';
        else if (country === 'us' || country === 'en' || gLowers.includes('comic') || gLowers.includes('webtoon')) detected = 'comic';
        return detected === targetType;
      });
    }

    // Filter by requested language when a work declares availableLanguages (e.g. MangaDex)
    if (options?.language && options.language !== 'all') {
      const requestedLangs = options.language.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      const acceptsPt = requestedLangs.includes('pt-br') || requestedLangs.includes('pt');
      const acceptsEn = requestedLangs.includes('en');
      liveResults = liveResults.filter(m => {
        if (!Array.isArray(m.availableLanguages) || m.availableLanguages.length === 0) {
          return true;
        }
        return m.availableLanguages.some(avail => {
          const a = avail.toLowerCase();
          if (acceptsPt && (a === 'pt-br' || a === 'pt')) return true;
          if (acceptsEn && a === 'en') return true;
          return requestedLangs.includes(a);
        });
      });
    }

    // If a search query was supplied, sort live results so exact or prefix matches come first
    const trimmedQuery = query.trim().toLowerCase();
    if (trimmedQuery) {
      liveResults.sort((a, b) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        const aAlts = (a.altTitles || []).map(t => t.toLowerCase());
        const bAlts = (b.altTitles || []).map(t => t.toLowerCase());

        const scoreA = aTitle === trimmedQuery ? 5
          : aTitle.startsWith(trimmedQuery) ? 4
          : aAlts.some(t => t === trimmedQuery) ? 3
          : aTitle.includes(trimmedQuery) ? 2
          : aAlts.some(t => t.startsWith(trimmedQuery)) ? 2
          : aAlts.some(t => t.includes(trimmedQuery)) ? 1
          : 0;

        const scoreB = bTitle === trimmedQuery ? 5
          : bTitle.startsWith(trimmedQuery) ? 4
          : bAlts.some(t => t === trimmedQuery) ? 3
          : bTitle.includes(trimmedQuery) ? 2
          : bAlts.some(t => t.startsWith(trimmedQuery)) ? 2
          : bAlts.some(t => t.includes(trimmedQuery)) ? 1
          : 0;

        return scoreB - scoreA;
      });
    }

    return {
      results: liveResults,
      total: liveResults.length,
      sourcesQueried: sourcesToQuery.map(s => s.getInfo().id)
    };
  }

  /**
   * Retrieve featured / popular manga for homepage discovery.
   * Merges and deduplicates popular works from live providers (Comick, MangaDex, WeebCentral, MangaPill).
   * Safe mode and chapter availability are enforced for a premium discovery experience.
   */
  public async getFeatured(options?: { enabledSources?: string[] }): Promise<Manga[]> {
    const defaultLiveIds = Array.from(this.sources.keys());
    let candidateIds = defaultLiveIds;
    if (options?.enabledSources && options.enabledSources.length > 0) {
      candidateIds = options.enabledSources.filter(id => this.sources.has(id));
      if (candidateIds.length === 0) candidateIds = defaultLiveIds;
    }

    const liveSources = candidateIds.map(id => this.sources.get(id)).filter(Boolean) as IMangaSource[];
    const promises = liveSources.map(src =>
      src.getPopular({ limit: 24, includeAdult: false, onlyAvailable: true }).catch(() => [])
    );

    const results = await Promise.all(promises);
    const rawList: Manga[] = [];
    for (const list of results) {
      rawList.push(...list);
    }

    const deduped = deduplicateMangaList(rawList);
    // Exclude adult content and metadata-only works from homepage featured
    return deduped.filter(m => !m.isAdult && m.hasAvailableChapters !== false);
  }

  /**
   * Browse catalog of a single source directly (Popular or Latest Releases), Mihon Browse Source style.
   */
  public async getSourceCatalog(
    sourceId: string,
    mode: 'popular' | 'latest' = 'popular',
    options?: SourceSearchOptions
  ): Promise<Manga[]> {
    const src = this.sources.get(sourceId);
    if (!src) {
      throw new HttpError(404, `Fonte '${sourceId}' não encontrada.`);
    }

    let list: Manga[];
    if (mode === 'latest' && typeof src.getLatest === 'function') {
      list = await src.getLatest(options);
    } else {
      list = await src.getPopular(options);
      if (mode === 'latest') {
        list = [...list].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      }
    }

    if (!options?.includeAdult) {
      list = list.filter(m => !m.isAdult);
    }
    return list;
  }

  /**
   * Build prioritized failover source order including native APIs first,
   * followed by secondary native sources and any installed dynamic template extensions.
   */
  public getFailoverOrder(excludeSourceId: string, kind: 'chapters' | 'pages' = 'chapters'): string[] {
    const preferredBuiltins =
      kind === 'pages'
        ? ['weebcentral', 'mangapill', 'mangadex', 'comick']
        : ['comick', 'weebcentral', 'mangapill', 'mangadex'];

    const ordered: string[] = [];
    for (const id of preferredBuiltins) {
      if (id !== excludeSourceId && this.sources.has(id) && !ordered.includes(id)) {
        ordered.push(id);
      }
    }

    for (const id of this.sources.keys()) {
      if (id !== excludeSourceId && !ordered.includes(id)) {
        ordered.push(id);
      }
    }

    return ordered;
  }

  /**
   * Ping a specific source to test connectivity, latency, and operational status.
   */
  public async pingSource(sourceId: string): Promise<{
    sourceId: string;
    status: 'online' | 'degraded' | 'offline';
    latencyMs: number;
    error?: string;
    errorCode?: PingErrorCode;
    checkedAt: number;
  }> {
    const src = this.sources.get(sourceId);
    const checkedAt = Date.now();
    if (!src) {
      return {
        sourceId,
        status: 'offline',
        latencyMs: 0,
        error: 'Fonte não encontrada',
        errorCode: 'offline',
        checkedAt
      };
    }

    const start = Date.now();
    try {
      const probePromise = src.search('one piece', { limit: 1 });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tempo limite de 6000ms excedido')), 6000)
      );
      const res = await Promise.race([probePromise, timeoutPromise]);
      const latencyMs = Date.now() - start;
      const count = Array.isArray(res?.mangaList) ? res.mangaList.length : 0;
      return {
        sourceId,
        status: latencyMs > 3500 ? 'degraded' : 'online',
        latencyMs,
        ...(count === 0
          ? {
              error: 'Site respondeu, mas nenhum resultado foi extraído (possível mudança de layout ou busca vazia)',
              errorCode: 'layout' as PingErrorCode
            }
          : {}),
        checkedAt
      };
    } catch (err) {
      const msg = (err as Error).message || '';
      const lower = msg.toLowerCase();
      let errorCode: PingErrorCode = 'unknown';
      if (lower.includes('cloudflare') || lower.includes('403') || lower.includes('challenge')) {
        errorCode = 'cloudflare';
      } else if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many')) {
        errorCode = 'ratelimit';
      } else if (
        lower.includes('tempo limite') ||
        lower.includes('enotfound') ||
        lower.includes('econnrefused') ||
        lower.includes('etimedout') ||
        lower.includes('fetch') ||
        lower.includes('conexão')
      ) {
        errorCode = 'offline';
      }

      return {
        sourceId,
        status: 'offline',
        latencyMs: Date.now() - start,
        error: msg,
        errorCode,
        checkedAt
      };
    }
  }

  /**
   * Parse internal Manga ID: format "mr_<sourceId>_<externalId>"
   */
  public parseInternalMangaId(internalId: string): { sourceId: string; externalId: string } {
    if (!internalId || !internalId.startsWith('mr_')) {
      throw new HttpError(400, `Formato de identificador de mangá inválido: '${internalId}'. O formato esperado é 'mr_<source>_<id>'.`);
    }
    const withoutPrefix = internalId.substring(3);
    const firstUnderscore = withoutPrefix.indexOf('_');
    if (firstUnderscore === -1) {
      throw new HttpError(400, `Formato de identificador de mangá inválido: '${internalId}'. O formato esperado é 'mr_<source>_<id>'.`);
    }
    const sourceId = withoutPrefix.substring(0, firstUnderscore);
    const externalId = withoutPrefix.substring(firstUnderscore + 1);
    if (!sourceId || !externalId) {
      throw new HttpError(400, `Formato de identificador de mangá inválido: '${internalId}'. O formato esperado é 'mr_<source>_<id>'.`);
    }
    return { sourceId, externalId };
  }

  /**
   * Parse internal Chapter ID: format "ch_<sourceId>_<externalMangaId>_<externalChapterId>"
   * Optional fallback suffix format: "ch_<sourceId>_<externalMangaId>_<externalChapterId>__md_<fallbackChapterId>"
   */
  public parseInternalChapterId(internalChapterId: string): {
    sourceId: string;
    externalMangaId: string;
    externalChapterId: string;
    fallbackChapterId?: string;
  } {
    if (!internalChapterId || !internalChapterId.startsWith('ch_')) {
      throw new HttpError(400, `Formato de identificador de capítulo inválido: '${internalChapterId}'. O formato esperado é 'ch_<source>_<mangaId>_<chapterId>'.`);
    }

    let idWithoutFallback = internalChapterId;
    let fallbackChapterId: string | undefined;

    const mdIndex = internalChapterId.indexOf('__md_');
    if (mdIndex !== -1) {
      fallbackChapterId = internalChapterId.substring(mdIndex + 5);
      idWithoutFallback = internalChapterId.substring(0, mdIndex);
    }

    // Strip "ch_" prefix
    const withoutPrefix = idWithoutFallback.substring(3);
    const firstUnderscore = withoutPrefix.indexOf('_');
    if (firstUnderscore === -1) {
      throw new HttpError(400, `Formato de identificador de capítulo inválido: '${internalChapterId}'. O formato esperado é 'ch_<source>_<mangaId>_<chapterId>'.`);
    }

    const sourceId = withoutPrefix.substring(0, firstUnderscore);
    const remainder = withoutPrefix.substring(firstUnderscore + 1);
    if (!sourceId || !remainder) {
      throw new HttpError(400, `Formato de identificador de capítulo inválido: '${internalChapterId}'. O formato esperado é 'ch_<source>_<mangaId>_<chapterId>'.`);
    }

    let externalMangaId = '';
    let externalChapterId = '';

    if (sourceId === 'comick') {
      // In Comick, manga IDs and chapter hids are canonical 8-character identifiers.
      // If externalMangaId contains underscores (e.g. dhPOlu_L or _OdzOZzi), remainder starts with 8 chars,
      // followed by '_' and the externalChapterId.
      if (remainder.length >= 17 && remainder[8] === '_') {
        externalMangaId = remainder.substring(0, 8);
        externalChapterId = remainder.substring(9);
      } else {
        const lastUnderscore = remainder.lastIndexOf('_');
        if (lastUnderscore !== -1) {
          externalMangaId = remainder.substring(0, lastUnderscore);
          externalChapterId = remainder.substring(lastUnderscore + 1);
        } else {
          externalMangaId = remainder;
          externalChapterId = remainder;
        }
      }
    } else if (sourceId === 'mangapill') {
      const lastUnderscore = remainder.lastIndexOf('_');
      if (lastUnderscore !== -1) {
        externalMangaId = remainder.substring(0, lastUnderscore);
        externalChapterId = remainder.substring(lastUnderscore + 1);
      } else {
        externalMangaId = remainder;
        externalChapterId = remainder;
      }
    } else if (sourceId === 'mangadex') {
      // MangaDex externalChapterId is a 36-character UUID
      if (remainder.length > 37 && remainder[remainder.length - 37] === '_') {
        externalChapterId = remainder.substring(remainder.length - 36);
        externalMangaId = remainder.substring(0, remainder.length - 37);
      } else {
        const parts = remainder.split('_');
        externalMangaId = parts[0];
        externalChapterId = parts.slice(1).join('_');
      }
    } else if (sourceId === 'weebcentral') {
      // WeebCentral uses 26-character ULIDs for series and chapters
      if (remainder.length === 53 && remainder[26] === '_') {
        externalMangaId = remainder.substring(0, 26);
        externalChapterId = remainder.substring(27);
      } else {
        const parts = remainder.split('_');
        externalMangaId = parts[0];
        externalChapterId = parts.slice(1).join('_');
      }
    } else if (sourceId === 'mangafire' || sourceId === 'mangaball') {
      const lastUnderscore = remainder.lastIndexOf('_');
      if (lastUnderscore !== -1) {
        externalMangaId = remainder.substring(0, lastUnderscore);
        externalChapterId = remainder.substring(lastUnderscore + 1);
      } else {
        externalMangaId = remainder;
        externalChapterId = remainder;
      }
    } else {
      const lastUnderscore = remainder.lastIndexOf('_');
      if (lastUnderscore !== -1) {
        externalMangaId = remainder.substring(0, lastUnderscore);
        externalChapterId = remainder.substring(lastUnderscore + 1);
      } else {
        externalMangaId = remainder;
        externalChapterId = remainder;
      }
    }

    if (!externalMangaId || !externalChapterId) {
      throw new HttpError(400, `Formato de identificador de capítulo inválido: '${internalChapterId}'. O formato esperado é 'ch_<source>_<mangaId>_<chapterId>'.`);
    }

    return {
      sourceId,
      externalMangaId,
      externalChapterId,
      ...(fallbackChapterId ? { fallbackChapterId } : {})
    };
  }

  /**
   * Get normalized manga details by internal ID
   */
  public async getMangaById(internalId: string): Promise<Manga | null> {
    const parsed = this.parseInternalMangaId(internalId);
    const source = this.sources.get(parsed.sourceId);
    if (!source) {
      throw new HttpError(404, `Fonte '${parsed.sourceId}' não encontrada para o mangá '${internalId}'.`);
    }

    return await source.getMangaDetails(parsed.externalId);
  }

  private shouldFederateChapters(chapters: Chapter[], sourceId: string, language?: string): boolean {
    if (chapters.length <= 2) return true;

    const nums = chapters
      .map(c => parseFloat(c.chapterNumber))
      .filter(n => !isNaN(n) && n > 0);

    if (nums.length > 0) {
      const minNum = Math.min(...nums);
      const maxNum = Math.max(...nums);
      const uniqueInts = new Set(nums.map(n => Math.floor(n)));

      // Missing early chapters (e.g., DMCA left only the latest chapter 115.5 or chapters 200+)
      if (minNum > 2) return true;

      // Severe density gap across the run (e.g., only a handful of chapters survived)
      if (maxNum >= 10 && uniqueInts.size < Math.floor(maxNum * 0.65)) return true;
    }

    // Primary source (e.g. MangaDex) only has non-PT/EN chapters while user reads in PT-BR/EN
    if (sourceId === 'mangadex' && (!language || ['pt-br', 'pt', 'en', 'pt-br,en'].includes(language.toLowerCase()))) {
      const hasPreferredLang = chapters.some(c =>
        ['pt-br', 'pt', 'en'].includes((c.language || '').toLowerCase())
      );
      if (!hasPreferredLang) return true;
    }

    return false;
  }

  /**
   * Get chapters for an internal manga ID with automatic cross-source federation and optional deduplication
   */
  public async getChapters(
    internalMangaId: string,
    language?: string,
    options?: {
      deduplicate?: boolean;
      titleHint?: string;
      altTitlesHint?: string[];
      forceFederate?: boolean;
    }
  ): Promise<Chapter[]> {
    const parsed = this.parseInternalMangaId(internalMangaId);
    const source = this.sources.get(parsed.sourceId);

    if (!source && !options?.titleHint?.trim()) {
      throw new HttpError(404, `Fonte '${parsed.sourceId}' não encontrada para o mangá '${internalMangaId}'.`);
    }

    let chapters: Chapter[] = [];
    let primaryError: unknown = null;

    if (source) {
      try {
        chapters = await source.getChapters(parsed.externalId, language);
      } catch (err) {
        primaryError = err;
        console.warn(
          `[SourceRegistry] Primary chapters failed for ${internalMangaId}, attempting cross-source failover:`,
          (err as Error).message
        );
      }
    } else {
      primaryError = new HttpError(404, `Fonte '${parsed.sourceId}' não instalada.`);
    }

    const needsFederation =
      Boolean(primaryError) ||
      Boolean(options?.forceFederate) ||
      this.shouldFederateChapters(chapters, parsed.sourceId, language);

    // If primary source failed, returned an incomplete list, or forceFederate is active,
    // federate missing/newer chapters in parallel from healthy alternative sources
    if (needsFederation) {
      try {
        const manga = source
          ? await source.getMangaDetails(parsed.externalId).catch(() => null)
          : null;

        const rawTitles = [
          manga?.title || options?.titleHint || parsed.externalId.replace(/[-_]/g, ' '),
          ...(manga?.altTitles || []),
          ...(options?.altTitlesHint || [])
        ]
          .filter((t): t is string => typeof t === 'string' && t.trim().length > 2)
          .filter((t, idx) => idx === 0 || /[a-zA-Z]{3}/.test(t))
          .map(t => t.trim());

        const searchTitles = Array.from(new Set(rawTitles)).slice(0, 4);

        if (searchTitles.length > 0) {
          const targetRef: Manga = {
            title: searchTitles[0],
            id: internalMangaId,
            altTitles: Array.from(
              new Set([...(manga?.altTitles || []), ...(options?.altTitlesHint || [])])
            ),
            coverUrl: '',
            synopsis: '',
            authors: manga?.authors || [],
            artists: [],
            genres: [],
            status: 'ongoing',
            publicationInfo: {},
            updatedAt: '',
            sources: []
          };

          const preferredAltIds = this.getFailoverOrder(parsed.sourceId, 'chapters');

          const altFetches = await Promise.allSettled(
            preferredAltIds.map(async (altSourceId) => {
              const altSource = this.sources.get(altSourceId)!;
              const probe = (async () => {
                for (const titleQuery of searchTitles) {
                  const searchResults = await altSource.search(titleQuery, { includeAdult: true, limit: 8 }).catch(() => null);
                  const list = Array.isArray(searchResults?.mangaList) ? searchResults.mangaList : [];
                  const matched = list.find((m: Manga) => areSameManga(m, targetRef));
                  if (matched) {
                    const altExtId = matched.sources[0]?.externalId || matched.id.replace(/^mr_[^_]+_/, '');
                    const altChs = await altSource.getChapters(altExtId, language).catch(() => []);
                    if (altChs && altChs.length > 0) {
                      return altChs;
                    }
                  }
                }
                return [] as Chapter[];
              })();

              return Promise.race([
                probe,
                new Promise<Chapter[]>(resolve => setTimeout(() => resolve([]), 8000))
              ]);
            })
          );

          const candidateBuckets = altFetches
            .filter((r): r is PromiseFulfilledResult<Chapter[]> => r.status === 'fulfilled' && r.value.length > 0)
            .map(r => r.value)
            .sort((a, b) => b.length - a.length);

          // Merge the top 2 richest alternative sources alongside primary chapters
          for (const bucket of candidateBuckets.slice(0, 2)) {
            chapters = [...chapters, ...bucket];
          }
        }
      } catch (federateErr) {
        console.warn('[SourceRegistry] Chapter federation error:', federateErr);
      }
    }

    if (chapters.length === 0 && primaryError) {
      throw primaryError;
    }

    if (options?.deduplicate !== false) {
      chapters = deduplicateAndGroupChapters(chapters);
    }

    return chapters;
  }

  /**
   * Get pages for an internal chapter ID
   */
  public async getChapterPages(internalChapterId: string): Promise<MangaPage[]> {
    const parsed = this.parseInternalChapterId(internalChapterId);
    const source = this.sources.get(parsed.sourceId);
    if (!source) {
      throw new HttpError(404, `Fonte '${parsed.sourceId}' não encontrada para o capítulo '${internalChapterId}'.`);
    }

    // Comick fallback logic
    if (parsed.sourceId === 'comick') {
      let pages: MangaPage[] = [];
      let fallbackChapterId = parsed.fallbackChapterId;

      // 1. Chame primeiro ComickProvider para obter páginas e descobrir mdid (sem chamada HTTP duplicada)
      // Se Comick lançar HttpError, só prossiga para fallback se fallbackChapterId já for conhecido.
      if (typeof (source as any).getChapterPagesResult === 'function') {
        try {
          const result = await (source as any).getChapterPagesResult(parsed.externalChapterId);
          pages = result.pages;
          if (!fallbackChapterId && result.mdid) {
            fallbackChapterId = result.mdid;
          }
        } catch (err) {
          if (err instanceof HttpError && (err.status === 404 || err.status === 502) && fallbackChapterId) {
            pages = [];
          } else {
            throw err;
          }
        }
      } else {
        pages = await source.getChapterPages(parsed.externalChapterId);
      }

      // 2. Se retornar uma lista com uma ou mais páginas, retorne imediatamente
      if (pages && pages.length > 0) {
        return pages;
      }

      // 3. Se retornar [] e existir fallbackChapterId (do ID interno ou descoberto via Comick API), tente MangaDexProvider.getChapterPages(fallbackChapterId)
      if (fallbackChapterId) {
        const mangaDexSource = this.sources.get('mangadex');
        if (mangaDexSource) {
          try {
            const mdPages = await mangaDexSource.getChapterPages(fallbackChapterId);
            // 4. Se MangaDex retornar páginas, retorne-as
            if (mdPages && mdPages.length > 0) {
              return mdPages;
            }
          } catch (err) {
            // Se MangaDex falhar (ex: 404, indisponível), trate como sem páginas disponíveis
            console.warn(`[SourceRegistry] Fallback MangaDex falhou para ${fallbackChapterId}:`, (err as Error).message);
          }
        }
      }
      // Se Comick e MangaDex não tiverem páginas, continue para o failover universal com MangaPill e WeebCentral!
    } else {
      try {
        const pages = await source.getChapterPages(parsed.externalChapterId);
        if (pages && pages.length > 0) {
          return pages;
        }
      } catch (err) {
        console.warn(`[SourceRegistry] Source '${parsed.sourceId}' failed for chapter ${parsed.externalChapterId}:`, (err as Error).message);
      }
    }

    // Universal Cross-Source Auto-Failover:
    // If the chapter's native source failed or returned 0 pages, attempt recovery from alternative sources for the same chapter number
    try {
      const manga = await this.getMangaById(`mr_${parsed.sourceId}_${parsed.externalMangaId}`).catch(() => null);
      const searchTitle = manga?.title || parsed.externalMangaId.replace(/[-_]/g, ' ');

      // Determine real chapter number by checking the manga's chapters list
      let targetNum: string | null = null;
      try {
        const chapters = await source.getChapters(parsed.externalMangaId).catch(() => []);
        const ch = chapters.find(c => 
          c.id === internalChapterId || 
          c.externalChapterId === parsed.externalChapterId || 
          c.variants?.some(v => v.id === internalChapterId || v.externalChapterId === parsed.externalChapterId)
        );
        if (ch) {
          targetNum = ch.chapterNumber;
        }
      } catch {
        // fallback
      }

      if (!targetNum) {
        const numMatch = parsed.externalChapterId.match(/(\d+(?:\.\d+)?)/);
        targetNum = numMatch ? numMatch[1] : null;
      }

      if (searchTitle && targetNum) {
        const failoverTitles = Array.from(
          new Set(
            [
              searchTitle,
              ...(manga?.altTitles || []).filter(t => /[a-zA-Z]{3}/.test(t))
            ]
              .map(t => t.trim())
              .filter(t => t.length > 2)
          )
        ).slice(0, 4);

        const targetRef: Manga = {
          title: searchTitle,
          id: '',
          altTitles: manga?.altTitles || [],
          coverUrl: '',
          synopsis: '',
          authors: [],
          artists: [],
          genres: [],
          status: 'ongoing',
          publicationInfo: {},
          updatedAt: '',
          sources: []
        };

        const failoverOrder = this.getFailoverOrder(parsed.sourceId, 'pages');

        for (const altSourceId of failoverOrder) {
          const altSource = this.sources.get(altSourceId)!;
          try {
            const altPages = await Promise.race([
              (async () => {
                let matched: Manga | undefined;
                for (const qTitle of failoverTitles) {
                  const searchResults = await altSource.search(qTitle, { includeAdult: true, limit: 8 }).catch(() => null);
                  const list = Array.isArray(searchResults?.mangaList) ? searchResults.mangaList : [];
                  matched = list.find((m: Manga) => areSameManga(m, targetRef));
                  if (matched) break;
                }

                if (matched) {
                  const altMangaExtId = matched.sources[0]?.externalId || matched.id.replace(/^mr_[^_]+_/, '');
                  const altChapters = await altSource.getChapters(altMangaExtId);
                  const matchingChapter = altChapters.find(
                    c => normalizeChapterNumber(c.chapterNumber) === normalizeChapterNumber(targetNum!)
                  );
                  if (matchingChapter) {
                    return await altSource.getChapterPages(matchingChapter.externalChapterId);
                  }
                }
                return [] as MangaPage[];
              })(),
              new Promise<MangaPage[]>(resolve => setTimeout(() => resolve([]), 7000))
            ]);

            if (altPages && altPages.length > 0) {
              console.log(`[SourceRegistry] Auto-failover: successfully recovered chapter ${targetNum} via '${altSourceId}'!`);
              return altPages;
            }
          } catch {
            // try next source
          }
        }
      }
    } catch (failoverErr) {
      console.warn('[SourceRegistry] Cross-source failover error:', failoverErr);
    }

    return [];
  }

  /**
   * Export structured dataset for external recommendation system integration
   */
  public async getRecommendationFeed(options?: { limit?: number }): Promise<{
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
  }> {
    const featured = await this.getFeatured();
    const limit = options?.limit || 50;

    return {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      totalAvailable: featured.length,
      items: featured.slice(0, limit).map(m => ({
        id: m.id,
        title: m.title,
        genres: m.genres,
        authors: m.authors,
        status: m.status,
        demographic: m.publicationInfo.demographic,
        releaseYear: m.publicationInfo.releaseYear,
        rating: m.rating,
        sources: m.sources.map(s => ({ sourceId: s.sourceId, externalId: s.externalId }))
      }))
    };
  }
}

export const sourceRegistry = new SourceRegistry();
