import { Manga, FavoriteManga, ReadingProgress } from '../types/manga.js';
import { HistoryService } from './history.js';
import { MangaApi, SimilarityCategory, DetectedTropeTag } from './api.js';
import { getPreferredLanguage } from '../utils/languagePreference.js';
import { isMangaInIgnored } from '../utils/libraryFilters.js';

export type { SimilarityCategory, DetectedTropeTag };

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
  aiPowered?: boolean;
}

export interface SimilarMangaMatch {
  manga: Manga;
  similarityScore: number; // 0-100 percentage
  category?: SimilarityCategory;
  sharedGenres: string[];
  sharedDemographic?: string;
  isSameAuthor: boolean;
  isInLibrary: boolean;
  plotThemes?: string[];
  synopsisSimilarity?: number; // 0-100 narrative affinity
  matchExplanation?: string;
  isAnilistRec?: boolean;
  aiPowered?: boolean;
}

export interface SimilarMangasDetailedResult {
  matches: SimilarMangaMatch[];
  corePremise?: string;
  microTropes: string[];
  anilistTags: string[];
  detectedTags?: DetectedTropeTag[];
  aiPowered: boolean;
}

export interface PersonalizedRecommendationsDetailedResult {
  matches: RecommendationMatch[];
  aiPowered: boolean;
  profileSummary?: string;
}

const META_CACHE_KEY = 'mr_manga_metadata_cache_v1';
const MAX_META_CACHE = 120;

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
  cotidiano: 'Cotidiano',
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
  magia: 'Magia',
  martial: 'Artes Marciais',
  'martial arts': 'Artes Marciais',
  yaoi: 'Yaoi',
  bl: 'Yaoi',
  'boys love': 'Yaoi',
  yuri: 'Yuri',
  gl: 'Yuri',
  'girls love': 'Yuri',
  ecchi: 'Ecchi',
  harem: 'Harém',
  school: 'Vida Escolar',
  'school life': 'Vida Escolar'
};

export interface SemanticPlotTheme {
  id: string;
  label: string;
  searchQuery: string;
  keywords: string[];
}

export const SEMANTIC_THEMES: SemanticPlotTheme[] = [
  {
    id: 'childhood_friend',
    label: 'Amigo(a) de Infância',
    searchQuery: 'childhood friend',
    keywords: [
      'childhood friend',
      'childhood friends',
      'osananajimi',
      'estranged childhood',
      'amigo de infancia',
      'amiga de infancia',
      'amigos de infancia',
      'cresceram juntos',
      'since childhood',
      'desde crianca'
    ]
  },
  {
    id: 'debt_rescue',
    label: 'Dívida & Acordo Financeiro',
    searchQuery: 'debt bought',
    keywords: [
      'debt',
      'debts',
      'divida',
      'dividas',
      'extreme poverty',
      'dirt-poor',
      'dirt poor',
      'poverty',
      'pobreza',
      'broke guy',
      'bankrupt',
      'falencia',
      'pay off',
      'parents vanish',
      'mountain of debt',
      'let me buy you',
      'bought by',
      'purchased',
      'part-time job',
      'part time jobs',
      'emprestimo',
      'financ',
      'comprad'
    ]
  },
  {
    id: 'cohabitation',
    label: 'Mesmo Teto & Coabitação',
    searchQuery: 'living together',
    keywords: [
      'same roof',
      'under the same roof',
      'mesmo teto',
      'sob o mesmo teto',
      'live together',
      'living together',
      'moves in',
      'move in with',
      'morar junto',
      'morando juntos',
      'roommate',
      'housemate',
      'colega de quarto',
      'cohabitation',
      'share an apartment',
      'live with her',
      'live with him'
    ]
  },
  {
    id: 'contract_relationship',
    label: 'Relacionamento de Contrato',
    searchQuery: 'contract marriage',
    keywords: [
      'contract',
      'contrato',
      'fake girlfriend',
      'fake boyfriend',
      'fake relationship',
      'arranged marriage',
      'casamento arranjado',
      'falso namoro',
      'namoro falso',
      'proposition',
      'in exchange for',
      'agreement',
      'deal with',
      'engagement contract'
    ]
  },
  {
    id: 'school_romcom',
    label: 'Romcom Escolar',
    searchQuery: 'high school romance',
    keywords: [
      'high school romcom',
      'romcom',
      'comedia romantica',
      'high school',
      'colegial',
      'ensino medio',
      'classmate',
      'colega de classe',
      'heart racing',
      'teasing',
      'confess',
      'crush',
      'school idol',
      'student council'
    ]
  },
  {
    id: 'devoted_heroine',
    label: 'Heroína Devota / Intensa',
    searchQuery: 'devoted childhood',
    keywords: [
      'devoted',
      'slightly intense',
      'slightly daring',
      'slightly thrilling',
      'obsess',
      'yandere',
      'pamper',
      'spoil',
      'clingy',
      'doting',
      'possessive',
      'possessiva',
      'devota',
      'apaixonada'
    ]
  },
  {
    id: 'gyaru_introvert',
    label: 'Gyaru / Popular & Introvertido',
    searchQuery: 'gyaru loner',
    keywords: [
      'gyaru',
      'gal',
      'popular girl',
      'loner',
      'introvert',
      'otaku',
      'delinquent',
      'delinquente',
      'yankee',
      'garota popular',
      'plain guy',
      'mob character'
    ]
  },
  {
    id: 'underdog_betrayed',
    label: 'Expulso do Grupo / Subestimado',
    searchQuery: 'kicked out party',
    keywords: [
      'kicked out',
      'expulso',
      'banished from the hero',
      'banished',
      'weakest',
      'useless',
      'underestimated',
      'subestimado',
      'exiled',
      's-rank',
      'cast out'
    ]
  },
  {
    id: 'system_hunter',
    label: 'Dungeon & Sistema de Caçador',
    searchQuery: 'dungeon hunter system',
    keywords: [
      'sistema',
      'system',
      'level up',
      'ranker',
      'dungeon',
      'hunter',
      'cacador',
      'portal',
      'despertar',
      'awakening',
      'status window',
      'janela de status',
      'solo leveling',
      'tower climber',
      'necromancer'
    ]
  },
  {
    id: 'reincarnation_isekai',
    label: 'Reencarnação / Isekai',
    searchQuery: 'reincarnated another world',
    keywords: [
      'reencarna',
      'reincarnat',
      'isekai',
      'outro mundo',
      'another world',
      'transmigra',
      'reborn',
      'summoned',
      'transportado',
      'truck-kun'
    ]
  },
  {
    id: 'regression_time',
    label: 'Regressão no Tempo',
    searchQuery: 'regression second chance',
    keywords: [
      'regress',
      'retorno no tempo',
      'time travel',
      'voltou no tempo',
      'timeline',
      'loop',
      'segunda chance',
      'second chance',
      'back in time',
      'turn back time'
    ]
  },
  {
    id: 'revenge_betrayal',
    label: 'Vingança & Traição',
    searchQuery: 'revenge betrayed',
    keywords: [
      'vinganca',
      'revenge',
      'traicao',
      'betrayal',
      'betrayed',
      'traido',
      'retribuicao',
      'avenger',
      'vengeance',
      'swears revenge'
    ]
  },
  {
    id: 'villainess_nobility',
    label: 'Vilã & Aristocracia Otome',
    searchQuery: 'villainess duke',
    keywords: [
      'vila',
      'villainess',
      'duchess',
      'duquesa',
      'duke',
      'aristocracia',
      'principe',
      'crown prince',
      'broken engagement',
      'condemned',
      'otome game',
      'emperor'
    ]
  },
  {
    id: 'murim_martial',
    label: 'Artes Marciais & Murim',
    searchQuery: 'murim martial arts',
    keywords: [
      'murim',
      'cultiva',
      'cultivation',
      'artes marciais',
      'seita',
      'martial sect',
      'dantian',
      'mestre marcial',
      'wuxia',
      'xianxia',
      'heavenly demon'
    ]
  },
  {
    id: 'slow_life_building',
    label: 'Vida Lenta & Construção',
    searchQuery: 'slow life kingdom',
    keywords: [
      'slow life',
      'fazenda',
      'construcao',
      'territorio',
      'agricultura',
      'vida calma',
      'farming',
      'estate developer',
      'peaceful life'
    ]
  },
  {
    id: 'crafting_alchemy',
    label: 'Alquimia, Forja & Culinária',
    searchQuery: 'alchemist blacksmith',
    keywords: [
      'alchem',
      'potion',
      'blacksmith',
      'cooking',
      'culinaria',
      'forja',
      'merchant',
      'comercio',
      'cafe',
      'bakery'
    ]
  },
  {
    id: 'monster_taming',
    label: 'Domador & Feras Mágicas',
    searchQuery: 'monster tamer',
    keywords: [
      'domador',
      'tamer',
      'monster tamer',
      'familiar',
      'monstro',
      'fera',
      'summoner'
    ]
  },
  {
    id: 'apocalypse_survival',
    label: 'Apocalipse & Sobrevivência',
    searchQuery: 'apocalypse survival',
    keywords: [
      'apocalipse',
      'apocalypse',
      'zumbi',
      'zombie',
      'sobrevivencia',
      'survival',
      'death game',
      'jogo da morte',
      'fim do mundo'
    ]
  },
  {
    id: 'magic_academy',
    label: 'Academia de Magia',
    searchQuery: 'magic academy',
    keywords: [
      'academia',
      'magic academy',
      'escola de magia',
      'sorcerer',
      'mage',
      'mago',
      'academy instructor'
    ]
  },
  {
    id: 'romance_work_adult',
    label: 'Romance Adulto & Trabalho',
    searchQuery: 'office romance',
    keywords: [
      'office romance',
      'office workers',
      'workforce',
      'workplace',
      'trabalho',
      'coworker',
      'salaryman',
      'boss',
      'ceo',
      'secretary',
      'senpai',
      'kouhai',
      'overtime',
      'adult life',
      'colega de trabalho'
    ]
  },
  {
    id: 'teasing_size_gap',
    label: 'Heroína Provocadora / Gap',
    searchQuery: 'tall girl romance',
    keywords: [
      'giant',
      'tall girl',
      'teasing',
      'over-familiar',
      'drunk',
      'older woman',
      'onee-san',
      'busty',
      'age gap',
      'height gap'
    ]
  },
  {
    id: 'family_guardian',
    label: 'Família, Tutela & Acolhimento',
    searchQuery: 'adopted child family',
    keywords: [
      'orphan',
      'orfao',
      'adopted',
      'adotad',
      'guardian',
      'raise',
      'single father',
      'younger sister',
      'elder sister',
      'step-sister',
      'stepsister',
      'childcare'
    ]
  },
  {
    id: 'psychological_mindgames',
    label: 'Jogos Mentais & Suspense',
    searchQuery: 'psychological thriller',
    keywords: [
      'mind game',
      'manipulat',
      'mastermind',
      'conspiracy',
      'thriller',
      'blackmail',
      'stalker',
      'deception'
    ]
  },
  {
    id: 'yaoi_bl',
    label: "Boys' Love & Yaoi",
    searchQuery: 'boys love',
    keywords: ['yaoi', 'bl', 'boys love', 'shounen ai', 'danmei', 'fujoshi']
  },
  {
    id: 'yuri_gl',
    label: "Girls' Love & Yuri",
    searchQuery: 'girls love yuri',
    keywords: ['yuri', 'gl', 'girls love', 'shoujo ai', 'baihe']
  }
];

const STOPWORDS = new Set([
  // English common stopwords + manga blurb noise
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her', 'was',
  'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now',
  'old', 'see', 'two', 'way', 'who', 'did', 'let', 'put', 'say', 'she', 'too', 'use', 'with',
  'that', 'this', 'from', 'they', 'been', 'have', 'were', 'what', 'when', 'make', 'like',
  'time', 'just', 'know', 'take', 'into', 'year', 'your', 'good', 'some', 'them', 'than',
  'then', 'look', 'only', 'come', 'over', 'also', 'back', 'after', 'work', 'well', 'even',
  'want', 'because', 'these', 'give', 'most', 'being', 'about', 'after', 'before', 'until',
  'while', 'where', 'suddenly', 'out', 'blue', 'every', 'story', 'manga', 'series', 'chapters',
  'about', 'their', 'there', 'which', 'would', 'could', 'other', 'life', 'lives', 'world',
  'man', 'girl', 'boy', 'guy', 'woman', 'makes', 'starts', 'begins', 'turns', 'becomes',
  // Portuguese common stopwords
  'que', 'para', 'com', 'uma', 'por', 'mais', 'como', 'mas', 'foi', 'ao', 'ele', 'ela',
  'das', 'dos', 'seu', 'sua', 'ou', 'ser', 'quando', 'muito', 'nos', 'nao', 'sem', 'entre',
  'sobre', 'isso', 'este', 'esta', 'era', 'ate', 'pelo', 'pela', 'tem', 'historia', 'obra',
  'vida', 'dias', 'apos', 'tudo', 'nada', 'cada', 'onde', 'mesmo'
]);

// Canonical concept normalization merges multilingual synonyms into shared narrative stems
const CONCEPT_STEM_MAP: Record<string, string> = {
  // Poverty / debt / financial strain
  poor: 'concept_poverty',
  poverty: 'concept_poverty',
  broke: 'concept_poverty',
  pobre: 'concept_poverty',
  pobreza: 'concept_poverty',
  bankrupt: 'concept_poverty',
  destitute: 'concept_poverty',
  penniless: 'concept_poverty',
  indigent: 'concept_poverty',
  debt: 'concept_debt',
  debts: 'concept_debt',
  divida: 'concept_debt',
  dividas: 'concept_debt',
  owe: 'concept_debt',
  owed: 'concept_debt',
  loan: 'concept_debt',
  loans: 'concept_debt',
  creditor: 'concept_debt',
  creditors: 'concept_debt',
  money: 'concept_money',
  dinheiro: 'concept_money',
  cash: 'concept_money',
  yen: 'concept_money',
  million: 'concept_money',
  pay: 'concept_pay',
  paid: 'concept_pay',
  paying: 'concept_pay',
  repay: 'concept_pay',
  pagar: 'concept_pay',

  // Bought / contract / deal
  buy: 'concept_bought',
  bought: 'concept_bought',
  purchase: 'concept_bought',
  purchased: 'concept_bought',
  comprou: 'concept_bought',
  comprado: 'concept_bought',
  comprada: 'concept_bought',
  comprar: 'concept_bought',
  contract: 'concept_contract',
  contrato: 'concept_contract',
  agreement: 'concept_contract',
  deal: 'concept_contract',
  proposition: 'concept_contract',
  exchange: 'concept_contract',
  acordo: 'concept_contract',
  arranged: 'concept_contract',
  fake: 'concept_fake',
  pretend: 'concept_fake',
  falso: 'concept_fake',
  falsa: 'concept_fake',
  fingir: 'concept_fake',

  // Childhood friend & romance
  childhood: 'concept_childhood',
  osananajimi: 'concept_childhood',
  infancia: 'concept_childhood',
  estranged: 'concept_reunion',
  reunite: 'concept_reunion',
  reunited: 'concept_reunion',
  reencounter: 'concept_reunion',
  reencontro: 'concept_reunion',
  friend: 'concept_friend',
  friends: 'concept_friend',
  amigo: 'concept_friend',
  amiga: 'concept_friend',
  romcom: 'concept_romcom',
  romance: 'concept_romcom',
  romantic: 'concept_romcom',
  sweet: 'concept_sweet',
  fluffy: 'concept_sweet',
  wholesome: 'concept_sweet',
  heart: 'concept_heart',
  racing: 'concept_heart',
  thrilling: 'concept_thrilling',
  daring: 'concept_thrilling',
  stimulating: 'concept_thrilling',
  devoted: 'concept_devoted',
  intense: 'concept_devoted',
  obsessed: 'concept_devoted',
  pamper: 'concept_devoted',
  pampers: 'concept_devoted',
  pampered: 'concept_devoted',
  spoil: 'concept_devoted',
  spoils: 'concept_devoted',
  doting: 'concept_devoted',
  tease: 'concept_tease',
  teasing: 'concept_tease',

  // Cohabitation & housing
  roof: 'concept_cohabit',
  cohabit: 'concept_cohabit',
  cohabitation: 'concept_cohabit',
  roommate: 'concept_cohabit',
  housemate: 'concept_cohabit',
  live: 'concept_live',
  living: 'concept_live',
  morar: 'concept_live',
  morando: 'concept_live',
  move: 'concept_movein',
  moves: 'concept_movein',
  moving: 'concept_movein',
  apartment: 'concept_home',
  house: 'concept_home',
  mansion: 'concept_home',
  casa: 'concept_home',
  apartamento: 'concept_home',
  teto: 'concept_cohabit',

  // Parents / abandonment / family
  parents: 'concept_parents',
  pais: 'concept_parents',
  family: 'concept_family',
  familia: 'concept_family',
  vanish: 'concept_abandon',
  vanished: 'concept_abandon',
  disappear: 'concept_abandon',
  disappeared: 'concept_abandon',
  abandon: 'concept_abandon',
  abandoned: 'concept_abandon',
  abandonedly: 'concept_abandon',
  fled: 'concept_abandon',
  fugiram: 'concept_abandon',

  // School & youth
  school: 'concept_school',
  highschool: 'concept_school',
  escola: 'concept_school',
  colegio: 'concept_school',
  student: 'concept_student',
  estudante: 'concept_student',
  classmate: 'concept_classmate',
  classmates: 'concept_classmate',
  parttime: 'concept_parttime',
  job: 'concept_parttime',
  jobs: 'concept_parttime',

  // Action/fantasy core stems
  revenge: 'concept_revenge',
  vengeance: 'concept_revenge',
  vinganca: 'concept_revenge',
  betray: 'concept_betray',
  betrayed: 'concept_betray',
  betrayal: 'concept_betray',
  traido: 'concept_betray',
  traicao: 'concept_betray',
  dungeon: 'concept_dungeon',
  dungeons: 'concept_dungeon',
  hunter: 'concept_hunter',
  hunters: 'concept_hunter',
  reincarnate: 'concept_isekai',
  reincarnated: 'concept_isekai',
  transmigrated: 'concept_isekai',
  isekai: 'concept_isekai',
  villainess: 'concept_villainess',
  regression: 'concept_regress',
  regressed: 'concept_regress',
  gyaru: 'concept_gyaru',
  loner: 'concept_loner',
  introvert: 'concept_loner'
};

function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function extractSemanticThemes(text: string): string[] {
  if (!text) return [];
  const lower = stripDiacritics(text.toLowerCase());
  const matchedLabels: string[] = [];

  SEMANTIC_THEMES.forEach(theme => {
    const hasMatch = theme.keywords.some(kw => {
      const normalizedKw = stripDiacritics(kw.toLowerCase());
      if (normalizedKw.length <= 4) {
        return new RegExp(`\\b${normalizedKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower);
      }
      return lower.includes(normalizedKw);
    });
    if (hasMatch) {
      matchedLabels.push(theme.label);
    }
  });

  return matchedLabels;
}

export interface NarrativeProfile {
  tokens: Set<string>;
  bigrams: Set<string>;
  themes: string[];
  rawConceptTerms: Map<string, string>; // stem -> readable surface word
}

export function analyzeNarrativeProfile(input: {
  title?: string;
  altTitles?: string[];
  synopsis?: string;
}): NarrativeProfile {
  const combined = [
    input.title || '',
    (input.altTitles || []).join(' '),
    input.synopsis || ''
  ].join(' ');

  const normalized = stripDiacritics(combined.toLowerCase())
    .replace(/part-time/g, 'parttime')
    .replace(/high school/g, 'highschool')
    .replace(/dirt-poor/g, 'dirt poor')
    .replace(/[^a-z0-9\s]/g, ' ');

  const rawWords = normalized.split(/\s+/).filter(Boolean);
  const meaningfulStems: string[] = [];
  const rawConceptTerms = new Map<string, string>();

  for (const w of rawWords) {
    if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    const stem = CONCEPT_STEM_MAP[w] || (w.length > 5 && w.endsWith('ing') ? w.slice(0, -3) : w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
    meaningfulStems.push(stem);
    if (!rawConceptTerms.has(stem)) {
      rawConceptTerms.set(stem, w);
    }
  }

  const tokens = new Set(meaningfulStems);
  const bigrams = new Set<string>();
  for (let i = 0; i < meaningfulStems.length - 1; i++) {
    const a = meaningfulStems[i];
    const b = meaningfulStems[i + 1];
    if (a !== b) {
      bigrams.add(`${a}+${b}`);
    }
  }

  const themes = extractSemanticThemes(combined);
  return { tokens, bigrams, themes, rawConceptTerms };
}

export interface NarrativeSimilarityResult {
  score: number; // 0.0 to 1.0
  sharedThemes: string[];
  sharedKeywords: string[];
}

export function computeNarrativeSimilarity(
  a: NarrativeProfile,
  b: NarrativeProfile
): NarrativeSimilarityResult {
  const sharedThemes = a.themes.filter(t => b.themes.includes(t));

  // Weighted unigram overlap (Cosine-style geometric mean normalization)
  let sharedUnigramCount = 0;
  const matchedDisplayTerms: string[] = [];

  a.tokens.forEach(tok => {
    if (b.tokens.has(tok)) {
      sharedUnigramCount++;
      const label = a.rawConceptTerms.get(tok) || b.rawConceptTerms.get(tok) || tok;
      if (!tok.startsWith('concept_') || matchedDisplayTerms.length < 6) {
        matchedDisplayTerms.push(label.replace(/^concept_/, ''));
      }
    }
  });

  let sharedBigramCount = 0;
  a.bigrams.forEach(bg => {
    if (b.bigrams.has(bg)) {
      sharedBigramCount++;
    }
  });

  const denomUnigram = Math.sqrt(Math.max(1, a.tokens.size) * Math.max(1, b.tokens.size));
  const denomBigram = Math.sqrt(Math.max(1, a.bigrams.size) * Math.max(1, b.bigrams.size));

  const unigramSim = a.tokens.size > 0 && b.tokens.size > 0 ? Math.min(1, sharedUnigramCount / denomUnigram) : 0;
  const bigramSim = a.bigrams.size > 0 && b.bigrams.size > 0 ? Math.min(1, sharedBigramCount / denomBigram) : 0;

  // Theme similarity (Jaccard + shared count boost so 2-3 specific plot matches stand out clearly)
  const themeUnionSize = new Set([...a.themes, ...b.themes]).size;
  const themeJaccard = themeUnionSize > 0 ? sharedThemes.length / themeUnionSize : 0;
  const themeDensityBoost = Math.min(1, sharedThemes.length / 3);
  const themeSim = themeUnionSize > 0 ? (themeJaccard * 0.45 + themeDensityBoost * 0.55) : 0;

  // Combine narrative signals cleanly
  const score = Math.min(
    1,
    unigramSim * 0.44 +
      bigramSim * 0.22 +
      themeSim * 0.48
  );

  return {
    score,
    sharedThemes,
    sharedKeywords: Array.from(new Set(matchedDisplayTerms)).slice(0, 5)
  };
}

/**
 * Generates high-signal search keywords from a manga's synopsis & title
 * so candidate discovery searches actual plot tropes rather than only broad genre tags.
 */
export function extractNarrativeSearchQueries(manga: {
  title?: string;
  altTitles?: string[];
  synopsis?: string;
}): string[] {
  const combined = `${manga.title || ''} ${(manga.altTitles || []).join(' ')} ${manga.synopsis || ''}`;
  const matchedThemes = SEMANTIC_THEMES.filter(theme => {
    const lower = stripDiacritics(combined.toLowerCase());
    return theme.keywords.some(kw => lower.includes(stripDiacritics(kw.toLowerCase())));
  });

  const queries: string[] = [];
  for (const t of matchedThemes) {
    if (!queries.includes(t.searchQuery)) {
      queries.push(t.searchQuery);
    }
    if (queries.length >= 3) break;
  }

  // Fallback / supplement: distinctive concept terms or open-vocabulary words from synopsis
  if (queries.length < 2 && manga.synopsis) {
    const profile = analyzeNarrativeProfile(manga);
    const strongConcepts: string[] = [];
    profile.tokens.forEach(tok => {
      if (tok.startsWith('concept_') && tok !== 'concept_romcom' && tok !== 'concept_live') {
        const surface = profile.rawConceptTerms.get(tok);
        if (surface && surface.length >= 4 && !strongConcepts.includes(surface)) {
          strongConcepts.push(surface);
        }
      }
    });
    if (strongConcepts.length >= 2) {
      queries.push(`${strongConcepts[0]} ${strongConcepts[1]}`);
    } else if (strongConcepts.length === 1) {
      queries.push(strongConcepts[0]);
    } else {
      // Pure open-vocabulary fallback for unseen tropes
      const openWords = Array.from(profile.tokens)
        .filter(t => !t.startsWith('concept_') && t.length >= 5)
        .slice(0, 3);
      if (openWords.length >= 2) {
        queries.push(`${openWords[0]} ${openWords[1]}`);
      } else if (openWords.length === 1) {
        queries.push(openWords[0]);
      }
    }
  }

  return queries.slice(0, 3);
}

const BROAD_UMBRELLA_GENRES = new Set([
  'manga', 'manhwa', 'webtoon', 'ação', 'action', 'aventura', 'adventure',
  'comédia', 'comedy', 'drama', 'fantasia', 'fantasy', 'romance',
  'cotidiano', 'slice of life', 'sobrenatural', 'supernatural',
  'seinen', 'shounen', 'shoujo', 'josei'
]);

function normalizeGenreName(g: string): string {
  const clean = g.trim().toLowerCase();
  for (const [key, val] of Object.entries(CANONICAL_GENRE_NAMES)) {
    if (clean === key || clean.includes(key)) {
      return val;
    }
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function cleanTitleForMatch(t?: string): string {
  return (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Pure deterministic scorer for similarity between a target manga and a candidate.
 * Exported directly for unit verification and UI ranking.
 * Uses specificity weighting so niche subgenres/tags & open-vocabulary synopsis overlap
 * outweigh generic umbrella genres like Comedy/Romance/Fantasy.
 */
export function scoreSimilarMangaCandidate(
  targetManga: {
    id: string;
    title: string;
    altTitles?: string[];
    synopsis?: string;
    genres?: string[];
    authors?: string[];
    publicationInfo?: { country?: string; demographic?: string };
  },
  candidate: Manga,
  targetProfile?: NarrativeProfile,
  isInLibrary = false
): SimilarMangaMatch {
  const targetGenres = (targetManga.genres || []).map(normalizeGenreName).filter(g => g !== 'Manga');
  const candGenres = (candidate.genres || []).map(normalizeGenreName).filter(g => g !== 'Manga');
  const sharedGenres = targetGenres.filter(g => candGenres.includes(g));
  const sharedNicheGenres = sharedGenres.filter(g => !BROAD_UMBRELLA_GENRES.has(g.toLowerCase()));
  const sharedUmbrellaGenres = sharedGenres.filter(g => BROAD_UMBRELLA_GENRES.has(g.toLowerCase()));

  const targetAuthor = targetManga.authors?.[0];
  const resolvedTargetProfile = targetProfile || analyzeNarrativeProfile(targetManga);
  const candProfile = analyzeNarrativeProfile(candidate);

  const narrative = computeNarrativeSimilarity(resolvedTargetProfile, candProfile);
  const synopsisPercent = Math.round(narrative.score * 100);

  const isSameAuthor = Boolean(
    targetAuthor &&
      targetAuthor !== 'Unknown' &&
      targetAuthor !== 'Autor Desconhecido' &&
      candidate.authors &&
      candidate.authors.some(a => a.toLowerCase() === targetAuthor.toLowerCase())
  );

  const sameCountry = Boolean(
    targetManga.publicationInfo?.country &&
      candidate.publicationInfo?.country &&
      targetManga.publicationInfo.country.toLowerCase() === candidate.publicationInfo.country.toLowerCase()
  );

  const sameDemo = Boolean(
    targetManga.publicationInfo?.demographic &&
      candidate.publicationInfo?.demographic &&
      targetManga.publicationInfo.demographic.toLowerCase() === candidate.publicationInfo.demographic.toLowerCase()
  );

  // Weighted composite score (out of 100) prioritizing niche tags & open-vocabulary synopsis affinity
  let rawScore = 44; // neutral floor

  // 1. Narrative & Synopsis weight (up to +44 points!)
  rawScore += Math.round(narrative.score * 44);

  // 2. Specificity-weighted Genre/Tag weight:
  // Niche tags (Office Workers, Ecchi, Villainess, Gyaru, Time Travel, etc.) weigh ~3.5x more than generic umbrellas
  const nicheBoost = Math.min(20, sharedNicheGenres.length * 10);
  const umbrellaBoost = Math.min(10, sharedUmbrellaGenres.length * 2.5);
  rawScore += Math.round(nicheBoost + umbrellaBoost);

  // 3. Open-vocabulary keyword overlap bonus even when 0 hardcoded themes match
  if (narrative.sharedThemes.length === 0 && narrative.sharedKeywords.length >= 2) {
    rawScore += Math.min(14, narrative.sharedKeywords.length * 4);
  }

  // 4. Creator / Format / Demographic bonuses
  if (isSameAuthor) rawScore += 18;
  if (sameCountry) rawScore += 3;
  if (sameDemo) rawScore += 4;

  // Small extra certainty bonus when BOTH themes and synopsis terms align strongly
  if (narrative.sharedThemes.length >= 2 && narrative.sharedKeywords.length >= 3) {
    rawScore += 6;
  }

  // Clamp cleanly into 55..99
  const similarityScore = Math.min(Math.max(Math.round(rawScore), 55), 99);

  // Craft helpful explanation string for UI badges
  let matchExplanation = '';
  if (narrative.sharedThemes.length > 0 && sharedNicheGenres.length > 0) {
    matchExplanation = `${sharedNicheGenres[0]} · ${narrative.sharedThemes[0]}`;
  } else if (narrative.sharedThemes.length > 0) {
    matchExplanation = `Sinopse: ${narrative.sharedThemes.slice(0, 2).join(' · ')}`;
  } else if (sharedNicheGenres.length > 0 && narrative.sharedKeywords.length >= 1) {
    matchExplanation = `${sharedNicheGenres.slice(0, 2).join(' + ')} · ${narrative.sharedKeywords.slice(0, 2).join(', ')}`;
  } else if (narrative.sharedKeywords.length >= 2) {
    matchExplanation = `Enredo afim: ${narrative.sharedKeywords.slice(0, 3).join(', ')}`;
  } else if (isSameAuthor) {
    matchExplanation = `Mesmo autor (${targetAuthor})`;
  } else if (sharedNicheGenres.length > 0) {
    matchExplanation = `Subgêneros: ${sharedNicheGenres.slice(0, 3).join(' · ')}`;
  } else if (sharedGenres.length > 0) {
    matchExplanation = `Gêneros: ${sharedGenres.slice(0, 3).join(' · ')}`;
  }

  const prioritizedGenres = Array.from(new Set([...narrative.sharedThemes, ...sharedNicheGenres, ...sharedUmbrellaGenres]));

  let category: SimilarityCategory = 'same_vibe';
  if (
    narrative.sharedThemes.length >= 2 ||
    synopsisPercent >= 52 ||
    (sharedNicheGenres.length >= 2 && narrative.sharedKeywords.length >= 2)
  ) {
    category = 'twin_premise';
  } else if (
    narrative.sharedThemes.length >= 1 ||
    sharedNicheGenres.length >= 1 ||
    isSameAuthor ||
    synopsisPercent >= 28 ||
    narrative.sharedKeywords.length >= 3
  ) {
    category = 'same_dynamic';
  }

  return {
    manga: candidate,
    similarityScore,
    category,
    sharedGenres: prioritizedGenres.slice(0, 3),
    sharedDemographic: candidate.publicationInfo?.demographic,
    isSameAuthor,
    isInLibrary,
    plotThemes: narrative.sharedThemes,
    synopsisSimilarity: synopsisPercent,
    matchExplanation
  };
}

function getStoredCatalogCache(): Manga[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(META_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const RecommendationService = {
  /**
   * Stores lightweight manga metadata (including synopsis & genres) locally
   * so read & favorited titles can be compared cleanly in similarity calculations.
   */
  rememberMangaMetadata(manga: Manga): void {
    if (typeof localStorage === 'undefined' || !manga?.id || !manga?.title) return;
    try {
      const list = getStoredCatalogCache();
      const filtered = list.filter(item => item.id !== manga.id);
      const compact: Manga = {
        id: manga.id,
        title: manga.title,
        altTitles: (manga.altTitles || []).slice(0, 5),
        coverUrl: manga.coverUrl,
        synopsis: (manga.synopsis || '').slice(0, 1200),
        authors: (manga.authors || []).slice(0, 3),
        artists: (manga.artists || []).slice(0, 2),
        genres: (manga.genres || []).slice(0, 12),
        status: manga.status,
        publicationInfo: manga.publicationInfo || {},
        sources: (manga.sources || []).slice(0, 3),
        rating: manga.rating,
        updatedAt: manga.updatedAt || new Date().toISOString(),
        isAdult: manga.isAdult
      };
      const next = [compact, ...filtered].slice(0, MAX_META_CACHE);
      localStorage.setItem(META_CACHE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors silently
    }
  },

  isMangaInLibrary(manga: { id: string; title?: string; altTitles?: string[] }): boolean {
    if (typeof localStorage === 'undefined') return false;
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
          for (const h of history) {
            if (cleanTitleForMatch(h.mangaTitle) === normAlt) return true;
          }
        }
      }
    }

    return false;
  },

  /**
   * Builds local Manga candidate objects from viewed cache, saved favorites, and reading history
   * so already-read works with matching synopses appear reliably in similarity checks.
   */
  getLocalCandidatePool(): Manga[] {
    if (typeof localStorage === 'undefined') return [];
    const cached = getStoredCatalogCache();
    const favorites = HistoryService.getFavorites();
    const history = HistoryService.getHistory();

    const byId = new Map<string, Manga>();
    cached.forEach(m => {
      if (m?.id) byId.set(m.id, m);
    });

    favorites.forEach((fav: FavoriteManga) => {
      const existing = byId.get(fav.mangaId);
      if (existing) {
        if (!existing.synopsis && fav.synopsis) existing.synopsis = fav.synopsis;
        if ((!existing.genres || existing.genres.length === 0) && fav.genres?.length) {
          existing.genres = fav.genres;
        }
      } else if (fav.synopsis || (fav.genres && fav.genres.length > 0)) {
        byId.set(fav.mangaId, {
          id: fav.mangaId,
          title: fav.title,
          altTitles: fav.altTitles || [],
          coverUrl: fav.coverUrl,
          synopsis: fav.synopsis || fav.userNotes || '',
          authors: fav.authors || [],
          artists: [],
          genres: fav.genres || [],
          status: fav.status || 'ongoing',
          publicationInfo: {},
          sources: fav.sourceId ? [{ sourceId: fav.sourceId, sourceName: fav.sourceName, externalId: fav.mangaId }] : [],
          rating: fav.rating,
          updatedAt: new Date(fav.updatedAt || Date.now()).toISOString()
        });
      }
    });

    history.forEach((hist: ReadingProgress) => {
      if (!byId.has(hist.mangaId) && hist.mangaTitle) {
        byId.set(hist.mangaId, {
          id: hist.mangaId,
          title: hist.mangaTitle,
          altTitles: [],
          coverUrl: hist.mangaCover,
          synopsis: '',
          authors: [],
          artists: [],
          genres: [],
          status: 'ongoing',
          publicationInfo: {},
          sources: hist.sourceId ? [{ sourceId: hist.sourceId, externalId: hist.mangaId }] : [],
          updatedAt: new Date(hist.updatedAt || Date.now()).toISOString()
        });
      }
    });

    return Array.from(byId.values());
  },

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

    // Analyze reading history
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

  scoreAffinity(manga: Manga, dna: ReaderDNA): { score: number; reasons: string[] } {
    if (dna.topGenres.length === 0) {
      return { score: 75, reasons: ['Recomendado com base no acervo em destaque'] };
    }

    let score = 50;
    const reasons: string[] = [];
    const matchedTopGenres: string[] = [];

    const mangaGenres = (manga.genres || []).map(normalizeGenreName);

    // Genre overlap
    dna.topGenres.slice(0, 5).forEach((topG, idx) => {
      if (mangaGenres.includes(topG.name)) {
        matchedTopGenres.push(topG.name);
        const boost = idx === 0 ? 18 : idx === 1 ? 14 : 9;
        score += boost;
      }
    });

    if (matchedTopGenres.length > 0) {
      reasons.push(`Combina com seu gosto por ${matchedTopGenres.slice(0, 2).join(' e ')}`);
    }

    // Semantic plot theme matching from synopsis
    const plotThemes = extractSemanticThemes(`${manga.title} ${manga.synopsis || ''}`);
    if (plotThemes.length > 0) {
      score += 12;
      reasons.push(`Enredo: ${plotThemes[0]}`);
    }

    // Author match
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

    score = Math.min(Math.max(score, 60), 99);

    if (reasons.length === 0) {
      reasons.push('Sugestão popular entre leitores com perfil similar');
    }

    return { score, reasons };
  },

  async getPersonalizedRecommendationsDetailed(options?: {
    hideLibrary?: boolean;
    limit?: number;
  }): Promise<PersonalizedRecommendationsDetailedResult> {
    const hideLibrary = options?.hideLibrary !== false;
    const limit = options?.limit || 12;
    const language = getPreferredLanguage();
    const favorites = HistoryService.getFavorites();
    const ignored = HistoryService.getIgnoredMangas();
    const ignoredIds = new Set(ignored.map(i => i.mangaId));

    // Try Hybrid AI + Live Sources personalized ranking when user has favorites
    if (favorites.length > 0 && typeof fetch !== 'undefined') {
      try {
        const hybrid = await MangaApi.getHybridPersonalized({
          favorites: favorites.slice(0, 15).map(f => ({
            mangaId: f.mangaId,
            title: f.title,
            genres: f.genres,
            userScore: f.userScore,
            userCategory: f.userCategory,
            synopsis: f.synopsis
          })),
          ignored: ignored.slice(0, 20).map(i => ({ mangaId: i.mangaId, title: i.title })),
          language,
          hideLibrary,
          limit
        });

        if (hybrid && hybrid.matches && hybrid.matches.length > 0) {
          const mapped: RecommendationMatch[] = hybrid.matches
            .filter(m => !ignoredIds.has(m.manga.id) && !isMangaInIgnored(m.manga, ignored))
            .map(m => ({
              manga: m.manga,
              affinityScore: m.affinityScore,
              matchReasons: m.matchReasons,
              isInLibrary: this.isMangaInLibrary(m.manga),
              aiPowered: m.aiPowered
            }));

          const filtered = hideLibrary ? mapped.filter(m => !m.isInLibrary) : mapped;
          if (filtered.length > 0) {
            return {
              matches: filtered.slice(0, limit),
              aiPowered: hybrid.aiPowered,
              profileSummary: hybrid.profileSummary
            };
          }
        }
      } catch (err) {
        console.warn('Hybrid personalized recommendations fallback:', err);
      }
    }

    const dna = this.calculateReaderDNA();

    try {
      const searchPromises: Promise<any>[] = [];

      if (dna.topGenres.length > 0) {
        const g1 = dna.topGenres[0]?.name;
        if (g1) {
          searchPromises.push(MangaApi.search('', { genre: g1, limit: 12, language, onlyAvailable: true }));
        }
        const g2 = dna.topGenres[1]?.name;
        if (g2 && g2 !== g1) {
          searchPromises.push(MangaApi.search('', { genre: g2, limit: 10, language, onlyAvailable: true }));
        }
      }

      searchPromises.push(MangaApi.getFeatured());

      const results = await Promise.allSettled(searchPromises);
      const pool: Manga[] = [];
      const seenIds = new Set<string>();

      results.forEach(res => {
        if (res.status === 'fulfilled') {
          const list: Manga[] = Array.isArray(res.value) ? res.value : (res.value?.data || []);
          list.forEach(m => {
            if (m && m.id && !seenIds.has(m.id) && !m.isAdult && !ignoredIds.has(m.id) && !isMangaInIgnored(m, ignored)) {
              seenIds.add(m.id);
              pool.push(m);
            }
          });
        }
      });

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

      const filtered = hideLibrary ? matches.filter(m => !m.isInLibrary) : matches;
      filtered.sort((a, b) => b.affinityScore - a.affinityScore);

      return {
        matches: filtered.slice(0, limit),
        aiPowered: false
      };
    } catch (err) {
      console.warn('Failed to generate personalized recommendations:', err);
      return { matches: [], aiPowered: false };
    }
  },

  async getPersonalizedRecommendations(options?: {
    hideLibrary?: boolean;
    limit?: number;
  }): Promise<RecommendationMatch[]> {
    const detailed = await this.getPersonalizedRecommendationsDetailed(options);
    return detailed.matches;
  },

  /**
   * Computes deep semantic, narrative synopsis, and categorical similarity between
   * a target manga and both live discovery candidates AND local read/library mangas.
   */
  async getSimilarMangasDetailed(targetManga: {
    id: string;
    title: string;
    altTitles?: string[];
    synopsis?: string;
    genres?: string[];
    authors?: string[];
    publicationInfo?: { country?: string; demographic?: string };
  }, options?: { hideLibrary?: boolean; limit?: number; focusTags?: string[]; focusQuery?: string }): Promise<SimilarMangasDetailedResult> {
    const hideLibrary = options?.hideLibrary !== false;
    const limit = options?.limit || 18;
    const focusTags = options?.focusTags || [];
    const focusQuery = options?.focusQuery || '';
    const language = getPreferredLanguage();
    const ignored = HistoryService.getIgnoredMangas();
    const ignoredIds = ignored.map(i => i.mangaId);
    const ignoredTitles = ignored.map(i => i.title);

    const hasActiveFocus = focusTags.length > 0 || focusQuery.trim().length > 0;
    const localPool = this.getLocalCandidatePool().filter(
      m => !isMangaInIgnored(m, ignored) && (m.synopsis || (m.genres && m.genres.length > 0))
    );

    // 1. Try Hybrid Server Engine (AI Premise + MangaUpdates + AniList + Live Sources)
    if (typeof fetch !== 'undefined') {
      try {
        const hybrid = await MangaApi.getHybridSimilarMangas({
          targetManga,
          language,
          localCandidates: localPool.slice(0, 40),
          ignoredIds,
          ignoredTitles,
          focusTags,
          focusQuery,
          limit
        });

        if (hybrid && Array.isArray(hybrid.matches) && (hybrid.matches.length > 0 || hasActiveFocus)) {
          const hydrated: SimilarMangaMatch[] = hybrid.matches
            .filter(m => !isMangaInIgnored(m.manga, ignored))
            .map(m => ({
              ...m,
              isInLibrary: this.isMangaInLibrary(m.manga)
            }));

          const filtered = hideLibrary ? hydrated.filter(m => !m.isInLibrary) : hydrated;
          return {
            matches: filtered.slice(0, limit),
            corePremise: hybrid.corePremise,
            microTropes: hybrid.microTropes || [],
            anilistTags: hybrid.anilistTags || [],
            detectedTags: hybrid.detectedTags || [],
            aiPowered: hybrid.aiPowered
          };
        }
      } catch (err) {
        console.warn('Hybrid similarity fallback to local engine:', err);
      }
    }

    // 2. Deterministic Local + Live Search Fallback (offline / network error recovery)
    const targetGenres = (targetManga.genres || [])
      .map(normalizeGenreName)
      .filter(g => g !== 'Manga');
    const targetAuthor = targetManga.authors?.[0];
    const targetNormTitle = cleanTitleForMatch(targetManga.title);
    const targetProfile = analyzeNarrativeProfile(targetManga);
    const plotQueries = extractNarrativeSearchQueries(targetManga);

    try {
      const promises: Promise<any>[] = [];

      if (focusQuery.trim()) {
        promises.push(MangaApi.search(focusQuery.trim(), { limit: 14, language, onlyAvailable: true }));
      }
      focusTags.slice(0, 2).forEach(ft => {
        promises.push(MangaApi.search(ft, { limit: 10, language, onlyAvailable: true }));
      });

      if (!hasActiveFocus) {
        plotQueries.forEach(q => {
          promises.push(MangaApi.search(q, { limit: 12, language, onlyAvailable: true }));
        });

        if (targetGenres.length > 0) {
          promises.push(MangaApi.search('', { genre: targetGenres[0], limit: 12, language, onlyAvailable: true }));
        }
        if (targetGenres.length > 1) {
          promises.push(MangaApi.search('', { genre: targetGenres[1], limit: 10, language, onlyAvailable: true }));
        }

        if (targetAuthor && targetAuthor !== 'Unknown' && targetAuthor !== 'Autor Desconhecido') {
          promises.push(MangaApi.search(targetAuthor, { limit: 6, language, onlyAvailable: true }));
        }

        promises.push(MangaApi.getRelatedRecommendations(targetManga));
      }

      const settled = await Promise.allSettled(promises);
      const candidates: Manga[] = [];
      const seenIds = new Set<string>([targetManga.id, ...ignoredIds]);
      const seenTitles = new Set<string>(targetNormTitle ? [targetNormTitle] : []);

      const pushCandidate = (m: Manga) => {
        if (!m || !m.id || m.isAdult || isMangaInIgnored(m, ignored)) return;
        const normT = cleanTitleForMatch(m.title);
        if (seenIds.has(m.id)) return;
        if (normT && seenTitles.has(normT)) return;
        seenIds.add(m.id);
        if (normT) seenTitles.add(normT);
        candidates.push(m);
      };

      localPool.forEach(pushCandidate);

      settled.forEach(res => {
        if (res.status === 'fulfilled') {
          const list: Manga[] = Array.isArray(res.value) ? res.value : (res.value?.data || []);
          list.forEach(pushCandidate);
        }
      });

      const matches: SimilarMangaMatch[] = candidates.map(candidate => {
        const inLib = this.isMangaInLibrary(candidate);
        return scoreSimilarMangaCandidate(targetManga, candidate, targetProfile, inLib);
      });

      const focusWords = [...focusTags, focusQuery]
        .join(' ')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[\s,;]+/)
        .filter(w => w.length >= 3);

      const focusFiltered = hasActiveFocus && focusWords.length > 0
        ? matches.filter(m => {
            const hay = `${m.manga.title} ${m.manga.synopsis || ''} ${(m.manga.genres || []).join(' ')}`
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '');
            return focusWords.some(fw => hay.includes(fw));
          })
        : matches;

      const filtered = hideLibrary ? focusFiltered.filter(m => !m.isInLibrary) : focusFiltered;
      filtered.sort((a, b) => b.similarityScore - a.similarityScore);

      return {
        matches: filtered.slice(0, limit),
        microTropes: targetProfile.themes.slice(0, 4),
        anilistTags: [],
        detectedTags: [],
        aiPowered: false
      };
    } catch (err) {
      console.warn('Failed to calculate similar mangas:', err);
      return { matches: [], microTropes: [], anilistTags: [], aiPowered: false };
    }
  },

  async getSimilarMangas(targetManga: {
    id: string;
    title: string;
    altTitles?: string[];
    synopsis?: string;
    genres?: string[];
    authors?: string[];
    publicationInfo?: { country?: string; demographic?: string };
  }, options?: { hideLibrary?: boolean; limit?: number }): Promise<SimilarMangaMatch[]> {
    const detailed = await this.getSimilarMangasDetailed(targetManga, options);
    return detailed.matches;
  }
};
