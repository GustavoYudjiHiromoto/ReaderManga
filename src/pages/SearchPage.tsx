import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  Filter,
  BookOpen,
  RefreshCw,
  Dices,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Check,
  Sparkles,
  Globe2,
  Users,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Blocks,
  Plus,
  BookmarkX,
  Bookmark,
  LayoutGrid,
  LayoutList,
  Grid3x3,
  ArrowUpDown,
  EyeOff,
  Eye,
  Trash2
} from 'lucide-react';
import { Manga, FavoriteManga, IgnoredManga } from '../types/manga.js';
import { MangaApi } from '../services/api.js';
import { MangaCard, MangaCardLayoutMode } from '../components/MangaCard.js';
import { ExtensionService } from '../services/extensionService.js';
import { HistoryService } from '../services/history.js';
import {
  LANGUAGE_OPTIONS,
  getPreferredLanguage,
  setPreferredLanguage,
  subscribePreferredLanguage
} from '../utils/languagePreference.js';

interface SearchPageProps {
  onSelectManga: (mangaId: string) => void;
  onReadChapter?: (mangaId: string, chapterId: string) => void;
  initialQuery?: string;
}

export const GENRE_TRANSLATIONS: Record<string, string[]> = {
  // Tropes & Subgêneros Específicos
  'yaoi / bl': [
    'yaoi', 'bl', "boys' love", 'boys love', 'shounen ai', 'shounen-ai', 'danmei', 'fujoshi'
  ],
  'yuri / gl': [
    'yuri', 'gl', "girls' love", 'girls love', 'shoujo ai', 'shoujo-ai', 'baihe'
  ],
  'harém': [
    'harem', 'harém', 'polyamory', 'poly'
  ],
  'ecchi': [
    'ecchi', 'fanservice', 'sensual', 'borderline h', 'softcore'
  ],
  'troca de gênero': [
    'gender bender', 'gender swap', 'genderswap', 'troca de gênero', 'troca de sexo', 'crossdressing'
  ],
  'mecha / robôs': [
    'mecha', 'robot', 'robô', 'robos', 'robôs', 'mechas', 'giant robot', 'piloto'
  ],
  'culinária / gastronomia': [
    'cooking', 'food', 'culinária', 'culinaria', 'gastronomia', 'chef', 'gourmet', 'restaurant', 'comida'
  ],
  'monstros / demônios': [
    'monsters', 'monster', 'demons', 'demon', 'demônios', 'demonio', 'vampire', 'vampiro', 'youkai', 'yokai'
  ],
  'militar / guerra': [
    'military', 'war', 'militar', 'guerra', 'army', 'exército', 'soldado'
  ],
  'policial / detetive': [
    'detective', 'police', 'policial', 'detetive', 'crime', 'investigation', 'investigação'
  ],
  'isekai reverso': [
    'reverse isekai', 'isekai reverso', 'modern fantasy'
  ],
  'música / artes': [
    'music', 'música', 'musica', 'band', 'banda', 'idol', 'ídolo', 'art', 'teatro'
  ],
  'overpower (op)': [
    'overpower', 'overpowered', 'op protagonist', 'cheat skill', 'cheat ability',
    'apelão', 'strongest', 'unrivaled', 'invincible', 'max level', 'saikyou',
    'peerless', 'godlike', 'overpowered protagonist', 'cheat', 'unmatched'
  ],
  'yandere': ['yandere', 'stalker', 'obsessive', 'possessive', 'yandere girlfriend'],
  'tomboy': ['tomboy', 'garota moleca', 'moleca', 'boyish'],
  'construção de vila': ['village building', 'kingdom building', 'city building', 'nation building', 'territory', 'construção de vila', 'reino', 'settlement', 'estate developer', 'fief', 'território', 'construcao de vila'],
  'fazenda / agricultura': ['farming', 'fazenda', 'agricultura', 'slow life', 'vida calma', 'vida lenta', 'agriculture', 'harvest', 'farm life'],
  'vilã (villainess)': ['villainess', 'vilã', 'vila', 'antagonista', 'villain', 'otome', 'otome game'],
  'reencarnação': ['reincarnation', 'reencarnação', 'transmigration', 'reborn', 'reencarnado', 'isekai'],
  'regressão / tempo': ['time travel', 'regression', 'regressor', 'viagem no tempo', 'retorno', 'loop', 'timeline', 'regressão', 'regressao'],
  'dungeon / sistema': ['dungeon', 'system', 'sistema', 'portais', 'hunter', 'leveling', 'ranker', 'tower', 'awakening', 'solo leveling'],
  'cultivação / murim': ['cultivation', 'cultivo', 'murim', 'wuxia', 'xianxia', 'martial arts', 'artes marciais', 'qi', 'sect'],
  'domador de monstros': ['monster tamer', 'tamer', 'domador', 'monster pet', 'beast tamer', 'monster', 'pet'],
  'vingança': ['revenge', 'vingança', 'betrayal', 'traição', 'retribution', 'avenger'],
  'romance colegial': ['school life', 'school romance', 'colegial', 'escolar', 'student', 'high school'],
  'harem invertido': ['reverse harem', 'harem invertido'],
  'psicológico': ['psychological', 'psicológico', 'psicologico'],
  'sobrevivência': ['survival', 'sobrevivência', 'sobrevivencia', 'death game'],
  'isekai': ['isekai', 'another world', 'outro mundo', 'summoned', 'transported'],
  'apocalipse / zumbis': ['zombie', 'apocalypse', 'apocalipse', 'zumbi', 'survival', 'post-apocalyptic', 'fim do mundo'],
  'academia de magia': ['magic academy', 'academia de magia', 'magic school', 'escola de magia'],
  'romcom / comédia romântica': ['romcom', 'romantic comedy', 'comédia romântica', 'comedia romantica'],
  'trabalho / adulto': ['office', 'office romance', 'workplace', 'ceo', 'trabalho', 'adult romance', 'empresa'],
  'delinquente / gangue': ['delinquent', 'gang', 'yankee', 'delinquente', 'gangue', 'brawler', 'bosozoku'],
  'caçada de monstros': ['monster hunter', 'monster hunting', 'caçador de monstros', 'caçada', 'beasts'],
  'jogo da morte': ['death game', 'jogo da morte', 'battle royale', 'deathmatch'],

  // Gêneros Clássicos
  'ação': ['action', 'ação', 'acao'],
  'fantasia': ['fantasy', 'fantasia', 'magic', 'magia'],
  'comédia': ['comedy', 'comédia', 'comedia', 'funny'],
  'aventura': ['adventure', 'aventura', 'quest'],
  'drama': ['drama'],
  'sobrenatural': ['supernatural', 'sobrenatural'],
  'histórico': ['historical', 'histórico', 'historico'],
  'horror': ['horror', 'terror'],
  'sci-fi': ['sci-fi', 'sci fi', 'science fiction', 'ficção científica'],
  'romance': ['romance', 'romantic'],
  'mistério': ['mystery', 'mistério', 'misterio'],
  'slice of life': ['slice of life', 'cotidiano'],
  'esportes': ['sports', 'esportes', 'esporte']
};

export const SPECIFIC_TROPES = [
  { id: 'Isekai', label: 'Isekai', highlight: true },
  { id: 'Overpower (OP)', label: 'Overpower (OP)', highlight: true },
  { id: 'Dungeon / Sistema', label: 'Dungeon / Sistema', highlight: true },
  { id: 'Regressão / Tempo', label: 'Regressão / Tempo', highlight: true },
  { id: 'Reencarnação', label: 'Reencarnação', highlight: true },
  { id: 'Vilã (Villainess)', label: 'Vilã (Villainess)', highlight: true },
  { id: 'Cultivação / Murim', label: 'Cultivação / Murim', highlight: true },
  { id: 'Vingança', label: 'Vingança / Traição', highlight: true },
  { id: 'Yaoi / BL', label: 'Yaoi / BL (Boys\' Love)', highlight: true },
  { id: 'Yuri / GL', label: 'Yuri / GL (Girls\' Love)', highlight: true },
  { id: 'Harém', label: 'Harém', highlight: true },
  { id: 'Ecchi', label: 'Ecchi / Sensual', highlight: true },
  { id: 'RomCom / Comédia Romântica', label: 'Comédia Romântica', highlight: true },
  { id: 'Apocalipse / Zumbis', label: 'Apocalipse / Zumbis' },
  { id: 'Construção de Vila', label: 'Construção de Reino' },
  { id: 'Fazenda / Agricultura', label: 'Fazenda / Vida Lenta' },
  { id: 'Academia de Magia', label: 'Academia de Magia' },
  { id: 'Trabalho / Adulto', label: 'Romance Adulto / Office' },
  { id: 'Troca de Gênero', label: 'Troca de Gênero (Gender Bender)' },
  { id: 'Delinquente / Gangue', label: 'Delinquentes / Gangues' },
  { id: 'Monstros / Demônios', label: 'Monstros / Demônios' },
  { id: 'Domador de Monstros', label: 'Domador de Monstros' },
  { id: 'Caçada de Monstros', label: 'Caçada / Monstros' },
  { id: 'Jogo da Morte', label: 'Jogo da Morte / Survival' },
  { id: 'Mecha / Robôs', label: 'Mecha / Robôs' },
  { id: 'Culinária / Gastronomia', label: 'Culinária / Gastronomia' },
  { id: 'Militar / Guerra', label: 'Militar / Guerra' },
  { id: 'Policial / Detetive', label: 'Policial / Detetive' },
  { id: 'Isekai Reverso', label: 'Isekai Reverso' },
  { id: 'Música / Artes', label: 'Música / Ídolos' },
  { id: 'Yandere', label: 'Yandere' },
  { id: 'Tomboy', label: 'Tomboy' },
  { id: 'Romance Colegial', label: 'Romance Colegial' },
  { id: 'Harem Invertido', label: 'Harem Invertido' },
  { id: 'Psicológico', label: 'Psicológico' },
  { id: 'Sobrevivência', label: 'Sobrevivência' }
];

export const CLASSIC_GENRES = [
  'Ação',
  'Fantasia',
  'Comédia',
  'Aventura',
  'Drama',
  'Sobrenatural',
  'Histórico',
  'Horror',
  'Sci-Fi',
  'Romance',
  'Mistério',
  'Slice of Life',
  'Esportes'
];

export function getMangaType(manga: Manga): 'manga' | 'manhwa' | 'manhua' | 'comic' {
  const country = (manga.publicationInfo?.country || '').toLowerCase().trim();
  const genres = (manga.genres || []).map(g => g.toLowerCase());
  const title = manga.title || '';
  const alts = (manga.altTitles || []).join(' ');

  // Korean Hangul characters check
  const hasHangul = /[\uac00-\ud7a3]/.test(title) || /[\uac00-\ud7a3]/.test(alts);

  // Chinese Hanzi check (ensure no Japanese Hiragana/Katakana)
  const hasKana = /[\u3040-\u30ff]/.test(title) || /[\u3040-\u30ff]/.test(alts);
  const hasChinese = !hasKana && (/[\u4e00-\u9fff]/.test(title) || /[\u4e00-\u9fff]/.test(alts));

  if (
    country === 'kr' ||
    country === 'ko' ||
    country === 'coreia' ||
    country === 'korea' ||
    country === 'south korea' ||
    genres.includes('manhwa') ||
    genres.includes('webtoon') ||
    hasHangul
  ) {
    return 'manhwa';
  }

  if (
    country === 'cn' ||
    country === 'zh' ||
    country === 'china' ||
    country === 'taiwan' ||
    country === 'hong kong' ||
    genres.includes('manhua') ||
    hasChinese
  ) {
    return 'manhua';
  }

  if (country === 'us' || country === 'en' || country === 'estados unidos' || genres.includes('comic') || genres.includes('western')) {
    return 'comic';
  }

  return 'manga';
}

export function getMangaDemographic(manga: Manga): string | undefined {
  if (manga.publicationInfo?.demographic) {
    const d = manga.publicationInfo.demographic.toLowerCase();
    if (d.includes('shounen') || d.includes('shonen')) return 'shounen';
    if (d.includes('shoujo') || d.includes('shojo')) return 'shoujo';
    if (d.includes('seinen')) return 'seinen';
    if (d.includes('josei')) return 'josei';
    return d;
  }
  const genres = (manga.genres || []).map(g => g.toLowerCase());
  if (genres.some(g => g.includes('shounen') || g.includes('shonen'))) return 'shounen';
  if (genres.some(g => g.includes('shoujo') || g.includes('shojo'))) return 'shoujo';
  if (genres.some(g => g.includes('seinen'))) return 'seinen';
  if (genres.some(g => g.includes('josei'))) return 'josei';
  return undefined;
}

export function matchGenre(mangaOrGenres: Manga | string[] | undefined, filterGenre: string, scanSynopsis = true): boolean {
  if (!mangaOrGenres) return false;
  const targetLower = filterGenre.toLowerCase().trim();
  const synonyms = GENRE_TRANSLATIONS[targetLower] || [targetLower];

  let genresLower: string[] = [];
  let titleLower = '';
  let synopsisLower = '';

  if (Array.isArray(mangaOrGenres)) {
    genresLower = mangaOrGenres.map(g => g.toLowerCase());
  } else {
    genresLower = (mangaOrGenres.genres || []).map(g => g.toLowerCase());
    titleLower = (mangaOrGenres.title || '').toLowerCase();
    const alts = (mangaOrGenres.altTitles || []).map(a => a.toLowerCase());
    titleLower += ' ' + alts.join(' ');
    if (scanSynopsis && mangaOrGenres.synopsis) {
      synopsisLower = mangaOrGenres.synopsis.toLowerCase();
    }
  }

  return synonyms.some(syn => {
    const s = syn.toLowerCase();
    // 1. Direct match in genre list
    if (genresLower.some(g => g === s || g.includes(s) || s.includes(g))) return true;
    // 2. Direct match in title or alternative titles
    if (titleLower && titleLower.includes(s)) return true;
    // 3. Synopsis scan with word boundary for short words to prevent false positives
    if (synopsisLower) {
      if (s.length <= 4) {
        const regex = new RegExp(`\\b${s}\\b`, 'i');
        if (regex.test(synopsisLower)) return true;
      } else if (synopsisLower.includes(s)) {
        return true;
      }
    }
    return false;
  });
}

export const SearchPage: React.FC<SearchPageProps> = ({ onSelectManga, onReadChapter, initialQuery = '' }) => {
  const getUrlParam = (key: string, fallback: string = '') => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const val = sp.get(key);
      if (val !== null) return val;
    }
    return fallback;
  };

  const [query, setQuery] = useState(() => getUrlParam('q', initialQuery));
  const [results, setResults] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Filters state
  const [selectedStatus, setSelectedStatus] = useState<string>(() => getUrlParam('status', 'all'));
  const [selectedDemographic, setSelectedDemographic] = useState<string>(() => getUrlParam('demographic', 'all'));
  const [selectedType, setSelectedType] = useState<string>(() => getUrlParam('type', 'all'));
  const [selectedSource, setSelectedSource] = useState<string>(() => getUrlParam('source', 'all'));
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => getUrlParam('lang', '') || getPreferredLanguage());
  const [includedGenres, setIncludedGenres] = useState<string[]>(() => {
    const gs = getUrlParam('genres', '');
    const g = getUrlParam('genre', '');
    if (gs) return gs.split(',').filter(Boolean);
    if (g && g !== 'all') return [g];
    return [];
  });
  const [excludedGenres, setExcludedGenres] = useState<string[]>(() => {
    const eg = getUrlParam('excluded_genres', '');
    if (eg) return eg.split(',').filter(Boolean);
    return [];
  });
  const [deepSynopsisSearch, setDeepSynopsisSearch] = useState<boolean>(() => getUrlParam('deep', '1') !== '0');
  const [safeSearch, setSafeSearch] = useState<boolean>(() => getUrlParam('safe', '1') === '1');
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(() => getUrlParam('available', '1') !== '0');
  const [hideLibrary, setHideLibrary] = useState<boolean>(() => {
    const p = getUrlParam('hide_library', '');
    if (p === '1') return true;
    if (p === '0') return false;
    try {
      return localStorage.getItem('mr_search_hide_library') === 'true';
    } catch {
      return false;
    }
  });

  const [hideIgnored, setHideIgnored] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('mr_search_hide_ignored');
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });
  const [showIgnoredModal, setShowIgnoredModal] = useState(false);
  const [ignoredSearch, setIgnoredSearch] = useState('');
  const [confirmClearIgnored, setConfirmClearIgnored] = useState(false);
  const [dismissToast, setDismissToast] = useState<{ mangaId: string; title: string } | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live favorites & ignored synchronization
  const [favoritesList, setFavoritesList] = useState<FavoriteManga[]>(() => HistoryService.getFavorites());
  const [ignoredList, setIgnoredList] = useState<IgnoredManga[]>(() => HistoryService.getIgnoredMangas());

  useEffect(() => {
    const unsub = HistoryService.subscribe(() => {
      setFavoritesList(HistoryService.getFavorites());
      setIgnoredList(HistoryService.getIgnoredMangas());
    });
    return () => {
      unsub();
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const { savedIdsSet, savedTitlesSet } = useMemo(() => {
    const ids = new Set<string>();
    const titles = new Set<string>();
    favoritesList.forEach(fav => {
      if (fav.mangaId) ids.add(fav.mangaId);
      if (fav.title) {
        const clean = fav.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (clean) titles.add(clean);
      }
    });
    return { savedIdsSet: ids, savedTitlesSet: titles };
  }, [favoritesList]);

  const { ignoredIdsSet, ignoredTitlesSet } = useMemo(() => {
    const ids = new Set<string>();
    const titles = new Set<string>();
    ignoredList.forEach(item => {
      if (item.mangaId) ids.add(item.mangaId);
      if (item.title) {
        const clean = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (clean) titles.add(clean);
      }
    });
    return { ignoredIdsSet: ids, ignoredTitlesSet: titles };
  }, [ignoredList]);

  const isMangaInLibrary = (m: Manga): boolean => {
    if (savedIdsSet.has(m.id)) return true;
    if (m.title) {
      const clean = m.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean && savedTitlesSet.has(clean)) return true;
    }
    if (m.altTitles && m.altTitles.length > 0) {
      for (const alt of m.altTitles) {
        const cleanAlt = alt.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanAlt && savedTitlesSet.has(cleanAlt)) return true;
      }
    }
    if (m.sources && m.sources.length > 0) {
      for (const s of m.sources) {
        if (s.externalId && savedIdsSet.has(`mr_${s.sourceId}_${s.externalId}`)) return true;
      }
    }
    return false;
  };

  const isMangaIgnored = (m: Manga): boolean => {
    if (ignoredIdsSet.has(m.id)) return true;
    if (m.title) {
      const clean = m.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean && ignoredTitlesSet.has(clean)) return true;
    }
    if (m.altTitles && m.altTitles.length > 0) {
      for (const alt of m.altTitles) {
        const cleanAlt = alt.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanAlt && ignoredTitlesSet.has(cleanAlt)) return true;
      }
    }
    if (m.sources && m.sources.length > 0) {
      for (const s of m.sources) {
        if (s.externalId && ignoredIdsSet.has(`mr_${s.sourceId}_${s.externalId}`)) return true;
      }
    }
    return false;
  };

  const [sourcesQueried, setSourcesQueried] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const observerRef = useRef<HTMLDivElement | null>(null);

  type SortOption = 'relevance' | 'rating' | 'latest' | 'alphabetical' | 'chapters';
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [layoutMode, setLayoutMode] = useState<MangaCardLayoutMode>(() => {
    try {
      const stored = localStorage.getItem('mr_search_layout_mode');
      if (stored === 'compact' || stored === 'list' || stored === 'grid') return stored;
      return 'grid';
    } catch {
      return 'grid';
    }
  });

  const handleSetLayoutMode = (mode: MangaCardLayoutMode) => {
    setLayoutMode(mode);
    try {
      localStorage.setItem('mr_search_layout_mode', mode);
    } catch {
      // ignore
    }
  };

  const { displayedResults, hiddenFavoritesCount, hiddenIgnoredCount } = useMemo(() => {
    let favHidden = 0;
    let igHidden = 0;

    const filtered = results.filter(m => {
      if (hideLibrary && isMangaInLibrary(m)) {
        favHidden++;
        return false;
      }
      if (hideIgnored && isMangaIgnored(m)) {
        igHidden++;
        return false;
      }
      return true;
    });

    const sorted = [...filtered];
    switch (sortBy) {
      case 'rating':
        sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'latest':
        sorted.sort((a, b) => {
          const yA = a.publicationInfo?.releaseYear || 0;
          const yB = b.publicationInfo?.releaseYear || 0;
          if (yB !== yA) return yB - yA;
          return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        });
        break;
      case 'alphabetical':
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'chapters':
        sorted.sort((a, b) => (parseFloat(b.latestChapter || '0') || 0) - (parseFloat(a.latestChapter || '0') || 0));
        break;
      case 'relevance':
      default:
        break;
    }
    return {
      displayedResults: sorted,
      hiddenFavoritesCount: favHidden,
      hiddenIgnoredCount: igHidden
    };
  }, [results, hideLibrary, hideIgnored, savedIdsSet, savedTitlesSet, ignoredIdsSet, ignoredTitlesSet, sortBy]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedStatus !== 'all') count++;
    if (selectedDemographic !== 'all') count++;
    if (selectedType !== 'all') count++;
    if (selectedSource !== 'all') count++;
    if (selectedLanguage !== 'pt-br,en') count++;
    if (!safeSearch) count++;
    if (!onlyAvailable) count++;
    if (!deepSynopsisSearch) count++;
    if (hideLibrary) count++;
    count += includedGenres.length;
    count += excludedGenres.length;
    return count;
  }, [selectedStatus, selectedDemographic, selectedType, selectedSource, selectedLanguage, safeSearch, onlyAvailable, includedGenres, excludedGenres, deepSynopsisSearch, hideLibrary]);

  useEffect(() => {
    const startQ = getUrlParam('q', initialQuery);
    const startStatus = getUrlParam('status', 'all');
    const startDemo = getUrlParam('demographic', 'all');
    const startType = getUrlParam('type', 'all');
    const startSrc = getUrlParam('source', 'all');
    const startLang = getUrlParam('lang', '') || getPreferredLanguage();
    const startInc = getUrlParam('genres', '')
      ? getUrlParam('genres', '').split(',').filter(Boolean)
      : (getUrlParam('genre', '') && getUrlParam('genre', '') !== 'all' ? [getUrlParam('genre', '')] : []);
    const startExc = getUrlParam('excluded_genres', '')
      ? getUrlParam('excluded_genres', '').split(',').filter(Boolean)
      : [];
    const startSafe = getUrlParam('safe', '1') === '1';
    const startAvail = getUrlParam('available', '1') !== '0';
    const startDeep = getUrlParam('deep', '1') !== '0';

    executeSearch(startQ, startInc, startExc, startStatus, startDemo, startType, startSafe, startAvail, startSrc, startDeep, startLang);
  }, []);

  // Subscribe to preferred language changes from Profile / other tabs
  useEffect(() => {
    return subscribePreferredLanguage((nextLang) => {
      setSelectedLanguage(prev => {
        if (prev === nextLang) return prev;
        executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, nextLang);
        return nextLang;
      });
    });
  }, [query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch]);

  // Subscribe to extension toggles in modal to automatically refresh active sources
  useEffect(() => {
    const unsub = ExtensionService.subscribe(() => {
      executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage);
    });
    return unsub;
  }, [query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage]);

  useEffect(() => {
    if (initialQuery && initialQuery !== query) {
      setQuery(initialQuery);
      executeSearch(initialQuery, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage);
    }
  }, [initialQuery]);

  const executeSearch = async (
    searchQuery: string,
    incGenres = includedGenres,
    excGenres = excludedGenres,
    stat = selectedStatus,
    demo = selectedDemographic,
    typ = selectedType,
    isSafe = safeSearch,
    availOnly = onlyAvailable,
    src = selectedSource,
    deepSynopsis = deepSynopsisSearch,
    lang = selectedLanguage
  ) => {
    setLoading(true);
    setSearchPage(1);
    setHasMore(true);

    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/search')) {
      const sp = new URLSearchParams();
      if (searchQuery.trim()) sp.set('q', searchQuery.trim());
      if (stat && stat !== 'all') sp.set('status', stat);
      if (demo && demo !== 'all') sp.set('demographic', demo);
      if (typ && typ !== 'all') sp.set('type', typ);
      if (src && src !== 'all') sp.set('source', src);
      if (lang && lang !== 'pt-br,en') sp.set('lang', lang);
      if (incGenres.length > 0) sp.set('genres', incGenres.join(','));
      if (excGenres.length > 0) sp.set('excluded_genres', excGenres.join(','));
      if (!isSafe) sp.set('safe', '0');
      if (!availOnly) sp.set('available', '0');
      if (!deepSynopsis) sp.set('deep', '0');
      const newUrl = sp.toString() ? `/search?${sp.toString()}` : '/search';
      window.history.replaceState({ ...window.history.state, view: 'search' }, '', newUrl);
    }

    try {
      // Map primary genre to English for provider APIs
      const primaryGenreEnglish = incGenres.length > 0
        ? (GENRE_TRANSLATIONS[incGenres[0].toLowerCase()]?.[0] || incGenres[0])
        : undefined;

      const activeSources = src !== 'all' ? [src] : ExtensionService.getEnabledSourceIds();

      const res = await MangaApi.search(searchQuery, {
        source: src !== 'all' ? src : undefined,
        sources: activeSources,
        genre: primaryGenreEnglish,
        genres: incGenres,
        demographic: demo === 'all' ? undefined : demo,
        type: typ === 'all' ? undefined : typ,
        status: stat === 'all' ? undefined : stat,
        language: lang && lang !== 'all' ? lang : undefined,
        limit: 36,
        page: 1,
        includeAdult: !isSafe,
        onlyAvailable: availOnly
      });

      let data = res.data || [];

      // Filter by included and excluded genres
      if (incGenres.length > 0) {
        data = data.filter(m => incGenres.every(ig => matchGenre(m, ig, deepSynopsis)));
      }
      if (excGenres.length > 0) {
        data = data.filter(m => !excGenres.some(eg => matchGenre(m, eg, deepSynopsis)));
      }

      // Filter by status
      if (stat !== 'all') {
        data = data.filter(m => m.status === stat);
      }

      // Filter by demographic
      if (demo !== 'all') {
        data = data.filter(m => getMangaDemographic(m) === demo);
      }

      // Filter by type / format
      if (typ !== 'all') {
        data = data.filter(m => getMangaType(m) === typ);
      }

      setResults(data);
      setSourcesQueried(res.sourcesQueried || []);
      if (data.length < 24) {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    const nextPage = searchPage + 1;
    try {
      const primaryGenreEnglish = includedGenres.length > 0
        ? (GENRE_TRANSLATIONS[includedGenres[0].toLowerCase()]?.[0] || includedGenres[0])
        : undefined;

      const activeSources = selectedSource !== 'all' ? [selectedSource] : ExtensionService.getEnabledSourceIds();

      const res = await MangaApi.search(query, {
        source: selectedSource !== 'all' ? selectedSource : undefined,
        sources: activeSources,
        genre: primaryGenreEnglish,
        genres: includedGenres,
        demographic: selectedDemographic === 'all' ? undefined : selectedDemographic,
        type: selectedType === 'all' ? undefined : selectedType,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        language: selectedLanguage && selectedLanguage !== 'all' ? selectedLanguage : undefined,
        limit: 24,
        page: nextPage,
        includeAdult: !safeSearch,
        onlyAvailable: onlyAvailable
      });

      let newItems = res.data || [];

      if (includedGenres.length > 0) {
        newItems = newItems.filter(m => includedGenres.every(ig => matchGenre(m, ig, deepSynopsisSearch)));
      }
      if (excludedGenres.length > 0) {
        newItems = newItems.filter(m => !excludedGenres.some(eg => matchGenre(m, eg, deepSynopsisSearch)));
      }
      if (selectedStatus !== 'all') {
        newItems = newItems.filter(m => m.status === selectedStatus);
      }
      if (selectedDemographic !== 'all') {
        newItems = newItems.filter(m => getMangaDemographic(m) === selectedDemographic);
      }
      if (selectedType !== 'all') {
        newItems = newItems.filter(m => getMangaType(m) === selectedType);
      }

      if (newItems.length === 0 || newItems.length < 24) {
        setHasMore(false);
      }
      setResults(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const filteredNew = newItems.filter(m => !existingIds.has(m.id));
        return [...prev, ...filteredNew];
      });
      setSearchPage(nextPage);
    } catch (err) {
      console.error('Load more failed:', err);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  // IntersectionObserver for seamless Infinite Scroll
  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const target = observerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading && results.length > 0) {
          handleLoadMore();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, results.length, searchPage]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch);
  };

  const handleClear = () => {
    setQuery('');
    executeSearch('', includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch);
  };

  const handleStatusSelect = (stat: string) => {
    const nextStat = selectedStatus === stat ? 'all' : stat;
    setSelectedStatus(nextStat);
    executeSearch(query, includedGenres, excludedGenres, nextStat, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch);
  };

  const handleDemographicSelect = (demo: string) => {
    const nextDemo = selectedDemographic === demo ? 'all' : demo;
    setSelectedDemographic(nextDemo);
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, nextDemo, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch);
  };

  const handleTypeSelect = (typ: string) => {
    const nextType = selectedType === typ ? 'all' : typ;
    setSelectedType(nextType);
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, nextType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch);
  };

  const handleSourceSelect = (src: string) => {
    const nextSrc = selectedSource === src ? 'all' : src;
    setSelectedSource(nextSrc);
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, nextSrc, deepSynopsisSearch, selectedLanguage);
  };

  const handleLanguageSelect = (lang: string) => {
    setSelectedLanguage(lang);
    setPreferredLanguage(lang);
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, lang);
  };

  // 3-state cycle: 1st click = Include (+), 2nd click = Exclude (-), 3rd click = Reset
  const handleGenreCycle = (genreId: string) => {
    const isInc = includedGenres.includes(genreId);
    const isExc = excludedGenres.includes(genreId);

    let nextInc = [...includedGenres];
    let nextExc = [...excludedGenres];

    if (!isInc && !isExc) {
      nextInc.push(genreId);
    } else if (isInc) {
      nextInc = nextInc.filter(g => g !== genreId);
      nextExc.push(genreId);
    } else {
      nextExc = nextExc.filter(g => g !== genreId);
    }

    setIncludedGenres(nextInc);
    setExcludedGenres(nextExc);
    executeSearch(query, nextInc, nextExc, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch);
  };

  const handleClearGenres = () => {
    setIncludedGenres([]);
    setExcludedGenres([]);
    executeSearch(query, [], [], selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch);
  };

  const toggleSafeSearch = () => {
    const nextSafe = !safeSearch;
    setSafeSearch(nextSafe);
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, nextSafe, onlyAvailable, selectedSource, deepSynopsisSearch);
  };

  const toggleOnlyAvailable = () => {
    const nextAvail = !onlyAvailable;
    setOnlyAvailable(nextAvail);
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, nextAvail, selectedSource, deepSynopsisSearch);
  };

  const toggleDeepSynopsis = () => {
    const nextDeep = !deepSynopsisSearch;
    setDeepSynopsisSearch(nextDeep);
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, nextDeep);
  };

  const toggleHideLibrary = () => {
    const next = !hideLibrary;
    setHideLibrary(next);
    try {
      localStorage.setItem('mr_search_hide_library', String(next));
    } catch {}

    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/search')) {
      const sp = new URLSearchParams(window.location.search);
      if (next) {
        sp.set('hide_library', '1');
      } else {
        sp.delete('hide_library');
      }
      const newUrl = sp.toString() ? `/search?${sp.toString()}` : '/search';
      window.history.replaceState({ ...window.history.state, view: 'search' }, '', newUrl);
    }
  };

  const toggleHideIgnored = () => {
    const next = !hideIgnored;
    setHideIgnored(next);
    try {
      localStorage.setItem('mr_search_hide_ignored', String(next));
    } catch {}
  };

  const handleDismissManga = (m: Manga) => {
    if (isMangaIgnored(m)) {
      HistoryService.unignoreManga(m.id);
      if (dismissToast?.mangaId === m.id) setDismissToast(null);
      return;
    }
    HistoryService.ignoreManga({
      mangaId: m.id,
      title: m.title,
      coverUrl: m.coverUrl,
      sourceId: m.sources?.[0]?.sourceId,
      sourceName: m.sources?.[0]?.sourceName
    });
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setDismissToast({ mangaId: m.id, title: m.title });
    dismissTimerRef.current = setTimeout(() => {
      setDismissToast(null);
    }, 5000);
  };

  const handleClearAllFilters = () => {
    setSelectedStatus('all');
    setSelectedDemographic('all');
    setSelectedType('all');
    setSelectedSource('all');
    setSafeSearch(true);
    setOnlyAvailable(true);
    setDeepSynopsisSearch(true);
    setHideLibrary(false);
    try {
      localStorage.removeItem('mr_search_hide_library');
    } catch {}
    setIncludedGenres([]);
    setExcludedGenres([]);
    executeSearch(query, [], [], 'all', 'all', 'all', true, true, 'all', true);
  };

  const handleRandomManga = async () => {
    try {
      const pool = (displayedResults.length > 0 ? displayedResults : results.length > 0 ? results : (await MangaApi.getFeatured()));
      if (pool.length === 0) return;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      onSelectManga(chosen.id);
    } catch (err) {
      console.warn('Failed to pick random manga:', err);
    }
  };

  const POPULAR_SEARCH_TERMS = ['Solo Leveling', 'Frieren', 'Chainsaw Man', 'One Piece', 'Berserk', 'Spy x Family', 'Jujutsu Kaisen', 'Oshi no Ko'];

  const STATUS_OPTIONS = [
    { id: 'all', label: 'Todos' },
    { id: 'ongoing', label: 'Em Andamento' },
    { id: 'completed', label: 'Concluído' },
    { id: 'hiatus', label: 'Hiato' },
    { id: 'cancelled', label: 'Cancelado' }
  ];

  const DEMOGRAPHIC_OPTIONS = [
    { id: 'all', label: 'Todas' },
    { id: 'shounen', label: 'Shounen' },
    { id: 'shoujo', label: 'Shoujo' },
    { id: 'seinen', label: 'Seinen' },
    { id: 'josei', label: 'Josei' }
  ];

  const TYPE_OPTIONS = [
    { id: 'all', label: 'Todos' },
    { id: 'manga', label: 'Mangá (JP)' },
    { id: 'manhwa', label: 'Manhwa (KR)' },
    { id: 'manhua', label: 'Manhua (CN)' },
    { id: 'comic', label: 'Comics / Webtoon' }
  ];

  const SOURCE_OPTIONS = [
    { id: 'all', label: 'Todas as Extensões Ativas' },
    { id: 'mangadex', label: 'MangaDex (Oficial)' },
    { id: 'comick', label: 'Comick' },
    { id: 'weebcentral', label: 'WeebCentral' },
    { id: 'mangapill', label: 'MangaPill' },
    { id: 'mangafire', label: 'MangaFire' },
    { id: 'mangaball', label: 'MangaBall' }
  ];

  const statusLabel = (st: string) => {
    const found = STATUS_OPTIONS.find(o => o.id === st);
    return found ? found.label : st;
  };

  const demographicLabel = (dm: string) => {
    const found = DEMOGRAPHIC_OPTIONS.find(o => o.id === dm);
    return found ? found.label : dm;
  };

  const typeLabel = (tp: string) => {
    const found = TYPE_OPTIONS.find(o => o.id === tp);
    return found ? found.label : tp;
  };

  const sourceLabel = (src: string) => {
    const found = SOURCE_OPTIONS.find(o => o.id === src);
    return found ? found.label : src;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-24">
      {/* Search Header Container */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/40 py-5 sm:py-8">
        <div className="mx-auto max-w-5xl px-3 sm:px-6">
          <div className="text-center mb-4 sm:mb-6">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Pesquisar Mangás
            </h1>
            <p className="text-xs text-zinc-400 mt-1 px-2">
              Catálogo completo com filtros por demografia, formato, status e subgêneros
            </p>
          </div>

          {/* Search Box */}
          <div className="max-w-2xl mx-auto space-y-2.5 sm:space-y-3">
            <form onSubmit={handleSearchSubmit} className="relative flex items-center">
              <Search className="absolute left-3.5 sm:left-4 h-4 w-4 sm:h-5 sm:w-5 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Título, autor ou palavra-chave..."
                className="w-full pl-10 sm:pl-12 pr-24 sm:pr-28 py-3 sm:py-3.5 bg-zinc-900/90 border border-zinc-700/80 focus:border-rose-500 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 shadow-inner focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-[4.6rem] sm:right-20 p-1.5 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
                  title="Limpar busca"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="submit"
                className="absolute right-1.5 sm:right-2 px-3.5 sm:px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-sm"
              >
                Buscar
              </button>
            </form>

            {/* Filter Toggle & Quick Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2 flex-1 sm:flex-initial">
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border transition-all cursor-pointer font-medium flex-1 sm:flex-initial min-w-[138px] ${
                    showFilters || activeFiltersCount > 0
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-sm'
                      : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                  }`}
                  title="Configurar filtros específicos"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Filtros</span>
                  {activeFiltersCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-500/30 text-rose-200 text-[10px] font-mono shrink-0">
                      {activeFiltersCount}
                    </span>
                  )}
                  {showFilters ? <ChevronUp className="h-3.5 w-3.5 ml-0.5 text-zinc-400 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 ml-0.5 text-zinc-400 shrink-0" />}
                </button>

                {/* Discovery Mode Toggle: Ocultar da Biblioteca */}
                <button
                  type="button"
                  onClick={toggleHideLibrary}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border transition-all cursor-pointer font-medium flex-1 sm:flex-initial min-w-[138px] ${
                    hideLibrary
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-sm ring-1 ring-emerald-500/30'
                      : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                  }`}
                  title={
                    hideLibrary
                      ? `Modo Descoberta ativo: ${hiddenFavoritesCount} obra(s) já favoritadas estão ocultadas. Clique para mostrar todas.`
                      : 'Modo Descoberta: Clique para ocultar mangás que você já tem na biblioteca e encontrar apenas títulos novos'
                  }
                >
                  <Sparkles className={`h-3.5 w-3.5 shrink-0 ${hideLibrary ? 'text-emerald-400' : 'text-zinc-400'}`} />
                  <span className="truncate">{hideLibrary ? 'Apenas Novos' : 'Ocultar Salvos'}</span>
                  {hideLibrary && hiddenFavoritesCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/25 text-emerald-200 text-[10px] font-mono font-bold shrink-0">
                      -{hiddenFavoritesCount}
                    </span>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                {activeFiltersCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-xs px-1 py-1"
                  >
                    Limpar filtros
                  </button>
                ) : (
                  <span className="sm:hidden" />
                )}

                <div className="flex items-center gap-2 ml-auto sm:ml-0">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmClearIgnored(false);
                      setShowIgnoredModal(true);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border transition-all cursor-pointer shrink-0 ${
                      ignoredList.length > 0 && hideIgnored
                        ? 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border-zinc-700/80'
                        : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                    }`}
                    title="Gerenciar obras marcadas como 'não vou ler' (ocultadas das buscas sem salvar nos favoritos)"
                  >
                    <EyeOff className="h-3.5 w-3.5 text-amber-400" />
                    <span>Dispensados</span>
                    {ignoredList.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono tabular-nums">
                        {ignoredList.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleRandomManga}
                    className="flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-all cursor-pointer shrink-0"
                    title="Sortear um mangá aleatório para ler agora"
                  >
                    <Dices className="h-3.5 w-3.5 text-rose-400" />
                    <span>Surpreenda-me</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Keyword Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 text-xs text-zinc-400">
              <span className="text-[11px] text-zinc-500 shrink-0">Sugestões:</span>
              {POPULAR_SEARCH_TERMS.map(term => (
                <button
                  key={term}
                  type="button"
                  onClick={() => {
                    setQuery(term);
                    executeSearch(term, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch);
                  }}
                  className="px-2.5 py-1 rounded-md bg-zinc-900/60 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800/80 shrink-0 transition-colors cursor-pointer text-[11px]"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          {/* Expandable Filter Panel */}
          {showFilters && (
            <div className="mt-4 sm:mt-6 max-w-3xl mx-auto p-3.5 sm:p-6 rounded-2xl bg-zinc-950/95 border border-zinc-800 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 space-y-4 sm:space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-rose-400" />
                  <span className="font-semibold text-sm text-zinc-100">Filtros Avançados & Categorias</span>
                </div>
                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 cursor-pointer font-medium"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Redefinir Tudo</span>
                  </button>
                )}
              </div>

              {/* 1. Demografia & Formato / Origem */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Demografia */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                    <Users className="h-3.5 w-3.5 text-rose-400" />
                    <span>Demografia (Público-Alvo):</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {DEMOGRAPHIC_OPTIONS.map((dm) => (
                      <button
                        key={dm.id}
                        type="button"
                        onClick={() => handleDemographicSelect(dm.id)}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer border ${
                          selectedDemographic === dm.id
                            ? 'bg-rose-500/20 text-rose-300 font-semibold border-rose-500/40 shadow-sm'
                            : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                        }`}
                      >
                        {dm.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Formato / Tipo */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                    <Globe2 className="h-3.5 w-3.5 text-rose-400" />
                    <span>Formato / Origem:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {TYPE_OPTIONS.map((tp) => (
                      <button
                        key={tp.id}
                        type="button"
                        onClick={() => handleTypeSelect(tp.id)}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer border ${
                          selectedType === tp.id
                            ? 'bg-rose-500/20 text-rose-300 font-semibold border-rose-500/40 shadow-sm'
                            : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                        }`}
                      >
                        {tp.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 2. Status da Obra & Preferências */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-zinc-850">
                {/* Status da Obra */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                    <Clock className="h-3.5 w-3.5 text-rose-400" />
                    <span>Status da Obra:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {STATUS_OPTIONS.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => handleStatusSelect(st.id)}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer border ${
                          selectedStatus === st.id
                            ? 'bg-rose-500/20 text-rose-300 font-semibold border-rose-500/40 shadow-sm'
                            : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preferências */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-300">Preferências de Conteúdo:</span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={toggleSafeSearch}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        safeSearch
                          ? 'bg-emerald-950/30 text-emerald-300 border-emerald-600/40 hover:bg-emerald-950/50'
                          : 'bg-rose-950/40 text-rose-300 border-rose-600/50 hover:bg-rose-950/60'
                      }`}
                    >
                      {safeSearch ? (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Filtro +18: Ativo</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
                          <span>Exibindo +18</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={toggleOnlyAvailable}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        onlyAvailable
                          ? 'bg-rose-950/40 text-rose-300 border-rose-600/50 hover:bg-rose-950/60'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                      title={onlyAvailable ? "Mostrando apenas mangás com capítulos disponíveis para ler" : "Mostrando todas as obras, incluindo itens de catálogo sem capítulos"}
                    >
                      <BookOpen className={`h-3.5 w-3.5 ${onlyAvailable ? 'text-rose-400' : 'text-zinc-400'}`} />
                      <span>{onlyAvailable ? 'Apenas com Capítulos' : 'Incluir sem Capítulos'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={toggleDeepSynopsis}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        deepSynopsisSearch
                          ? 'bg-indigo-950/40 text-indigo-300 border-indigo-600/50 hover:bg-indigo-950/60 shadow-sm'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                      title="Busca profunda: analisa também a sinopse e títulos alternativos para termos como Overpower, Portais, Reencarnação mesmo em obras não tagueadas"
                    >
                      <Sparkles className={`h-3.5 w-3.5 ${deepSynopsisSearch ? 'text-indigo-400' : 'text-zinc-400'}`} />
                      <span>{deepSynopsisSearch ? 'Busca em Sinopses: Ativa' : 'Sinopses: Inativa'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={toggleHideLibrary}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        hideLibrary
                          ? 'bg-emerald-950/40 text-emerald-300 border-emerald-600/50 hover:bg-emerald-950/60 shadow-sm ring-1 ring-emerald-500/20'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                      title="Oculta dos resultados as obras que você já tem na biblioteca de favoritos para encontrar apenas mangás novos"
                    >
                      <BookmarkX className={`h-3.5 w-3.5 ${hideLibrary ? 'text-emerald-400' : 'text-zinc-400'}`} />
                      <span>{hideLibrary ? 'Ocultando Salvos: Ativo' : 'Ocultar Salvos'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 2.5. Idioma Preferido (Escolha Individual por Usuário) */}
              <div className="space-y-2 pt-3 border-t border-zinc-850">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-zinc-300">
                    <Globe2 className="h-3.5 w-3.5 text-rose-400" />
                    <span>Idioma Preferido (Pesquisa, Leitor e Lançamentos):</span>
                  </div>
                  <span className="text-[11px] text-zinc-500">Salvo individualmente para você</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {LANGUAGE_OPTIONS.map((lo) => (
                    <button
                      key={lo.id}
                      type="button"
                      onClick={() => handleLanguageSelect(lo.id)}
                      className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer border ${
                        selectedLanguage === lo.id
                          ? 'bg-rose-500/20 text-rose-300 font-semibold border-rose-500/40 shadow-sm'
                          : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                      }`}
                      title={lo.desc}
                    >
                      {lo.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Extensão / Repositório de Origem */}
              <div className="space-y-2 pt-3 border-t border-zinc-850">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-zinc-300">
                    <Blocks className="h-3.5 w-3.5 text-rose-400" />
                    <span>Filtrar por Extensão / Repositório:</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('open-extensions-modal'));
                      }
                    }}
                    className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 transition-colors cursor-pointer font-medium"
                    title="Configurar quais repositórios estão ativos ou desativados"
                  >
                    <Blocks className="h-3 w-3" />
                    <span>Gerenciar Extensões</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 text-xs">
                  {SOURCE_OPTIONS.map((so) => (
                    <button
                      key={so.id}
                      type="button"
                      onClick={() => handleSourceSelect(so.id)}
                      className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer border ${
                        selectedSource === so.id
                          ? 'bg-rose-500/20 text-rose-300 font-semibold border-rose-500/40 shadow-sm'
                          : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                      }`}
                    >
                      {so.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Subgêneros & Tropes Específicos (Com inclusão + e exclusão -) */}
              <div className="space-y-2 pt-3 border-t border-zinc-850">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-medium text-rose-300">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-rose-400" />
                      <span>Subgêneros & Tropes:</span>
                    </div>
                    <span className="hidden sm:inline text-[10px] text-zinc-500 font-normal">
                      (1 clique = Incluir <span className="text-emerald-400 font-bold">+</span> | 2 cliques = Excluir <span className="text-rose-400 font-bold">-</span>)
                    </span>
                  </div>
                  {(includedGenres.some(g => SPECIFIC_TROPES.some(t => t.id === g)) || excludedGenres.some(g => SPECIFIC_TROPES.some(t => t.id === g))) && (
                    <button
                      type="button"
                      onClick={() => {
                        const remInc = includedGenres.filter(g => !SPECIFIC_TROPES.some(t => t.id === g));
                        const remExc = excludedGenres.filter(g => !SPECIFIC_TROPES.some(t => t.id === g));
                        setIncludedGenres(remInc);
                        setExcludedGenres(remExc);
                        executeSearch(query, remInc, remExc, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch);
                      }}
                      className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      Limpar Tropes
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {SPECIFIC_TROPES.map((trope) => {
                    const isInc = includedGenres.includes(trope.id);
                    const isExc = excludedGenres.includes(trope.id);
                    return (
                      <button
                        key={trope.id}
                        type="button"
                        onClick={() => handleGenreCycle(trope.id)}
                        title={
                          isInc 
                            ? `${trope.label}: Incluído obrigatoriamente (+). Clique para EXCLUIR (-).` 
                            : isExc 
                            ? `${trope.label}: Excluído da busca (-). Clique para remover filtro.` 
                            : `${trope.label}: Clique para INCLUIR (+).`
                        }
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                          isInc
                            ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200 font-semibold shadow-sm ring-1 ring-emerald-500/30'
                            : isExc
                            ? 'bg-rose-500/25 border-rose-500/70 text-rose-200 font-semibold shadow-sm line-through decoration-rose-400'
                            : trope.highlight
                            ? 'bg-zinc-900/90 border-zinc-700/80 text-zinc-300 hover:text-rose-300 hover:border-rose-500/50'
                            : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        {isInc && <Plus className="h-3 w-3 text-emerald-400 shrink-0" />}
                        {isExc && <X className="h-3 w-3 text-rose-400 shrink-0" />}
                        <span>{trope.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 5. Gêneros Tradicionais (Com inclusão + e exclusão -) */}
              <div className="space-y-2 pt-3 border-t border-zinc-850">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-400">Gêneros Tradicionais:</span>
                  {(includedGenres.some(g => CLASSIC_GENRES.includes(g)) || excludedGenres.some(g => CLASSIC_GENRES.includes(g))) && (
                    <button
                      type="button"
                      onClick={() => {
                        const remInc = includedGenres.filter(g => !CLASSIC_GENRES.includes(g));
                        const remExc = excludedGenres.filter(g => !CLASSIC_GENRES.includes(g));
                        setIncludedGenres(remInc);
                        setExcludedGenres(remExc);
                        executeSearch(query, remInc, remExc, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch);
                      }}
                      className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      Limpar Tradicionais
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {CLASSIC_GENRES.map((g) => {
                    const isInc = includedGenres.includes(g);
                    const isExc = excludedGenres.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => handleGenreCycle(g)}
                        title={
                          isInc 
                            ? `${g}: Incluído (+). Clique para EXCLUIR (-).` 
                            : isExc 
                            ? `${g}: Excluído (-). Clique para remover filtro.` 
                            : `${g}: Clique para INCLUIR (+).`
                        }
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                          isInc
                            ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200 font-semibold shadow-sm'
                            : isExc
                            ? 'bg-rose-500/25 border-rose-500/70 text-rose-200 font-semibold shadow-sm line-through decoration-rose-400'
                            : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        {isInc && <Plus className="h-3 w-3 text-emerald-400 shrink-0" />}
                        {isExc && <X className="h-3 w-3 text-rose-400 shrink-0" />}
                        <span>{g}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Panel Footer */}
              <div className="flex items-center justify-end pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
                >
                  Concluir
                </button>
              </div>
            </div>
          )}

          {/* Active Filter Chips Bar */}
          {!showFilters && activeFiltersCount > 0 && (
            <div className="mt-4 max-w-2xl mx-auto flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs">
              <span className="text-zinc-500 text-[11px] font-medium">Filtros Ativos:</span>

              {selectedDemographic !== 'all' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700/60 text-[11px]">
                  <span>Demografia: {demographicLabel(selectedDemographic)}</span>
                  <button type="button" onClick={() => handleDemographicSelect('all')} className="hover:text-rose-400 cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {selectedType !== 'all' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700/60 text-[11px]">
                  <span>Formato: {typeLabel(selectedType)}</span>
                  <button type="button" onClick={() => handleTypeSelect('all')} className="hover:text-rose-400 cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {selectedStatus !== 'all' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700/60 text-[11px]">
                  <span>Status: {statusLabel(selectedStatus)}</span>
                  <button type="button" onClick={() => handleStatusSelect('all')} className="hover:text-rose-400 cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {selectedSource !== 'all' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-rose-300 border border-rose-500/30 text-[11px]">
                  <span>Fonte: {sourceLabel(selectedSource)}</span>
                  <button type="button" onClick={() => handleSourceSelect('all')} className="hover:text-white cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {selectedLanguage !== 'pt-br,en' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-sky-300 border border-sky-500/30 text-[11px]">
                  <Globe2 className="h-3 w-3 text-sky-400" />
                  <span>
                    Idioma: {LANGUAGE_OPTIONS.find(l => l.id === selectedLanguage)?.shortLabel || selectedLanguage.toUpperCase()}
                  </span>
                  <button type="button" onClick={() => handleLanguageSelect('pt-br,en')} className="hover:text-white cursor-pointer" title="Voltar para PT-BR + EN">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {!safeSearch && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/40 text-rose-300 border border-rose-600/40 text-[11px]">
                  <span>+18 Ativo</span>
                  <button type="button" onClick={toggleSafeSearch} className="hover:text-white cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {!onlyAvailable && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/40 text-amber-300 border border-amber-600/40 text-[11px]">
                  <span>Inclui Catálogo Sem Capítulos</span>
                  <button type="button" onClick={toggleOnlyAvailable} className="hover:text-white cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {!deepSynopsisSearch && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700/60 text-[11px]">
                  <span>Sinopses: Desativado</span>
                  <button type="button" onClick={toggleDeepSynopsis} className="hover:text-white cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {hideLibrary && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/40 text-emerald-300 border border-emerald-600/40 text-[11px]">
                  <Sparkles className="h-3 w-3 text-emerald-400" />
                  <span>Ocultando Salvos{hiddenFavoritesCount > 0 ? ` (-${hiddenFavoritesCount})` : ''}</span>
                  <button type="button" onClick={toggleHideLibrary} className="hover:text-white cursor-pointer ml-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {includedGenres.map(g => (
                <span key={`inc-${g}`} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/40 text-emerald-300 border border-emerald-600/40 text-[11px]">
                  <span className="font-bold">+</span>
                  <span>{g}</span>
                  <button type="button" onClick={() => handleGenreCycle(g)} className="hover:text-white cursor-pointer ml-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}

              {excludedGenres.map(g => (
                <span key={`exc-${g}`} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/40 text-rose-300 border border-rose-600/40 text-[11px] line-through">
                  <span className="font-bold no-underline">-</span>
                  <span>{g}</span>
                  <button type="button" onClick={() => handleGenreCycle(g)} className="hover:text-white cursor-pointer ml-0.5 no-underline">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}

              <button
                type="button"
                onClick={handleClearAllFilters}
                className="ml-auto text-[11px] text-rose-400 hover:text-rose-300 underline cursor-pointer"
              >
                Limpar tudo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Results Container */}
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 mt-5 sm:mt-8">
        {/* Results Metadata & View Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-3.5 sm:pb-4 border-b border-zinc-800/80 mb-4 sm:mb-6 gap-3 text-xs text-zinc-400">
          <div className="flex flex-wrap items-center gap-2">
            {loading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-rose-400" />
                <span>Consultando repositórios ativos...</span>
              </span>
            ) : (
              <>
                <span>
                  <strong className="text-zinc-200 font-mono tabular-nums">{displayedResults.length}</strong>{' '}
                  {displayedResults.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}
                  {query ? ` para "${query}"` : ''}
                </span>
                {hideLibrary && hiddenFavoritesCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] tabular-nums">
                    <Sparkles className="h-3 w-3 text-emerald-400 shrink-0" />
                    <span>{hiddenFavoritesCount} salvo(s) ocultado(s)</span>
                  </span>
                )}
                {hideIgnored && hiddenIgnoredCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmClearIgnored(false);
                      setShowIgnoredModal(true);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-[11px] tabular-nums transition-colors cursor-pointer"
                    title="Ver ou restaurar obras dispensadas"
                  >
                    <EyeOff className="h-3 w-3 text-amber-400 shrink-0" />
                    <span>{hiddenIgnoredCount} dispensado(s) ocultado(s)</span>
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full md:w-auto">
            {/* Quick Language Selector (per-user preference) */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-300">
              <Globe2 className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              <select
                value={selectedLanguage}
                onChange={(e) => handleLanguageSelect(e.target.value)}
                aria-label="Selecionar idioma preferido"
                title="Escolher idioma preferido para buscas, capítulos, leitor e lançamentos"
                className="bg-transparent text-zinc-200 text-xs font-medium focus:outline-none cursor-pointer"
              >
                {LANGUAGE_OPTIONS.map((lo) => (
                  <option key={lo.id} value={lo.id} className="bg-zinc-900">
                    {lo.shortLabel}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Selector Dropdown */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-300 flex-1 sm:flex-initial">
              <ArrowUpDown className="h-3.5 w-3.5 text-rose-400 shrink-0" />
              <span className="text-zinc-500 hidden md:inline">Ordenar:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-transparent text-zinc-200 text-xs font-medium focus:outline-none cursor-pointer w-full sm:w-auto"
              >
                <option value="relevance" className="bg-zinc-900">Mais Populares</option>
                <option value="rating" className="bg-zinc-900">Melhor Avaliados (★)</option>
                <option value="latest" className="bg-zinc-900">Mais Recentes</option>
                <option value="alphabetical" className="bg-zinc-900">Ordem A-Z</option>
                <option value="chapters" className="bg-zinc-900">Mais Capítulos</option>
              </select>
            </div>

            {/* Layout Mode Switcher */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => handleSetLayoutMode('grid')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  layoutMode === 'grid'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Visualização em Grade Padrão"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleSetLayoutMode('compact')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  layoutMode === 'compact'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Visualização em Grade Compacta (Mais itens)"
              >
                <Grid3x3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleSetLayoutMode('list')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  layoutMode === 'list'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Visualização em Lista Detalhada (com sinopse)"
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Results Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <RefreshCw className="h-7 w-7 animate-spin text-rose-500 mb-3" />
            <p className="text-sm">Buscando mangás nas fontes integradas...</p>
          </div>
        ) : displayedResults.length === 0 ? (
          <div className="text-center py-16 px-4 text-zinc-400 bg-zinc-900/30 rounded-2xl border border-zinc-800/60 max-w-xl mx-auto space-y-3">
            {results.length > 0 && (hideLibrary || hideIgnored) ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3 className="text-base font-semibold text-zinc-200">
                  Todas as obras encontradas já foram filtradas!
                </h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Foram localizados <strong className="tabular-nums">{results.length}</strong> mangá(s) para esta busca
                  {hiddenFavoritesCount > 0 ? ` (${hiddenFavoritesCount} na biblioteca` : ''}
                  {hiddenFavoritesCount > 0 && hiddenIgnoredCount > 0 ? ` e ${hiddenIgnoredCount} dispensados)` : hiddenFavoritesCount > 0 ? ')' : ''}
                  {hiddenFavoritesCount === 0 && hiddenIgnoredCount > 0 ? ` (${hiddenIgnoredCount} dispensados)` : ''}.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  {hiddenFavoritesCount > 0 && (
                    <button
                      type="button"
                      onClick={toggleHideLibrary}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
                    >
                      Exibir Salvos da Biblioteca
                    </button>
                  )}
                  {hiddenIgnoredCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmClearIgnored(false);
                        setShowIgnoredModal(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-all cursor-pointer"
                    >
                      Ver Dispensados ({hiddenIgnoredCount})
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <BookOpen className="h-10 w-10 mx-auto mb-2 text-zinc-600" />
                <h3 className="text-base font-semibold text-zinc-300">Nenhum mangá encontrado</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Tente pesquisar por outro título, autor, ou alterne os filtros de demografia, status e gênero.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className={
              layoutMode === 'list'
                ? 'flex flex-col gap-2.5 sm:gap-3'
                : layoutMode === 'compact'
                ? 'manga-cover-grid-compact'
                : 'manga-cover-grid'
            }>
              {displayedResults.map((manga) => (
                <MangaCard
                  key={manga.id}
                  manga={manga}
                  onSelect={onSelectManga}
                  onQuickRead={(id) => onReadChapter?.(id, '')}
                  layoutMode={layoutMode}
                  allowDismiss={true}
                  onDismiss={handleDismissManga}
                />
              ))}
            </div>

            {/* Seamless Infinite Scroll Sentinel */}
            <div ref={observerRef} className="py-10 flex flex-col items-center justify-center min-h-[60px]">
              {loadingMore && (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <RefreshCw className="h-4 w-4 animate-spin text-rose-500" />
                  <span>Carregando mais mangás automaticamente...</span>
                </div>
              )}
              {!hasMore && displayedResults.length > 0 && (
                <p className="text-xs text-zinc-600 tabular-nums">
                  Fim dos resultados da busca ({displayedResults.length} obras exibidas
                  {hideLibrary && hiddenFavoritesCount > 0 ? `, ${hiddenFavoritesCount} salvas ocultadas` : ''}
                  {hideIgnored && hiddenIgnoredCount > 0 ? `, ${hiddenIgnoredCount} dispensadas ocultadas` : ''})
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Floating Undo Toast when a manga is dismissed */}
      {dismissToast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/80 rounded-2xl px-3.5 py-2.5 shadow-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center shrink-0">
              <EyeOff className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-100 truncate">{dismissToast.title}</p>
              <p className="text-[11px] text-zinc-400">Ocultado das buscas (sem favoritar)</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                HistoryService.unignoreManga(dismissToast.mangaId);
                setDismissToast(null);
              }}
              className="px-3 py-1.5 min-h-[36px] rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-colors cursor-pointer"
            >
              Desfazer
            </button>
            <button
              type="button"
              onClick={() => setDismissToast(null)}
              className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              aria-label="Fechar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal: Obras Dispensadas (Sem Interesse) */}
      {showIgnoredModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setShowIgnoredModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[85vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-zinc-800">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center shrink-0">
                  <EyeOff className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-serif text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>Obras Dispensadas</span>
                    <span className="text-xs font-mono font-semibold text-amber-300 tabular-nums">
                      ({ignoredList.length})
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Títulos marcados como "não vou ler" ficam ocultos na pesquisa sem entrar nos favoritos.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIgnoredModal(false)}
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
                aria-label="Fechar janela"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Hide toggle + Filter */}
            <div className="p-3.5 sm:px-5 border-b border-zinc-800/80 space-y-2.5 bg-zinc-900/30">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-zinc-300 font-medium">Ocultar automaticamente nas buscas</span>
                <button
                  type="button"
                  onClick={toggleHideIgnored}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    hideIgnored
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {hideIgnored ? 'Ativo' : 'Pausado (Exibindo)'}
                </button>
              </div>

              {ignoredList.length > 3 && (
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={ignoredSearch}
                    onChange={(e) => setIgnoredSearch(e.target.value)}
                    placeholder="Filtrar títulos dispensados..."
                    className="w-full pl-8 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/60"
                  />
                </div>
              )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-2">
              {ignoredList.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <EyeOff className="h-8 w-8 text-zinc-700 mx-auto" />
                  <p className="text-sm font-medium text-zinc-300">Nenhuma obra dispensada ainda</p>
                  <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                    Toque no ícone de olho cortado nos cards da pesquisa quando souber que não vai ler uma obra.
                  </p>
                </div>
              ) : (
                ignoredList
                  .filter(item =>
                    !ignoredSearch.trim() ||
                    item.title.toLowerCase().includes(ignoredSearch.trim().toLowerCase())
                  )
                  .map(item => (
                    <div
                      key={item.mangaId}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800/80"
                    >
                      <div
                        onClick={() => {
                          setShowIgnoredModal(false);
                          onSelectManga(item.mangaId);
                        }}
                        className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group"
                      >
                        <div className="h-12 w-9 rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 shrink-0">
                          {item.coverUrl ? (
                            <img
                              src={item.coverUrl}
                              alt={item.title}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-zinc-600">
                              <BookOpen className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-zinc-100 group-hover:text-rose-400 transition-colors truncate">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                            {(item.sourceName || 'Catálogo').replace(/\s*\((LIVE|AO VIVO|API)[^)]*\)/gi, '')}
                            {' · '}
                            {new Date(item.dismissedAt).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => HistoryService.unignoreManga(item.mangaId)}
                        className="px-3 py-1.5 min-h-[36px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700/80 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                        title="Voltar a exibir esta obra nas buscas"
                      >
                        <Eye className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Restaurar</span>
                      </button>
                    </div>
                  ))
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 p-3.5 sm:px-5 border-t border-zinc-800 bg-zinc-900/40">
              {ignoredList.length > 0 ? (
                confirmClearIgnored ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        HistoryService.clearIgnoredMangas();
                        setConfirmClearIgnored(false);
                      }}
                      className="px-3 py-1.5 min-h-[36px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Confirmar Limpeza
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearIgnored(false)}
                      className="px-2.5 py-1.5 min-h-[36px] rounded-xl text-zinc-400 hover:text-white text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearIgnored(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs font-medium transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Limpar Lista</span>
                  </button>
                )
              ) : (
                <span />
              )}

              <button
                type="button"
                onClick={() => setShowIgnoredModal(false)}
                className="px-4 py-1.5 min-h-[36px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
