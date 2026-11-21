import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Trash2,
  Compass,
  Flame
} from 'lucide-react';
import { Manga, FavoriteManga, IgnoredManga, MangaSourceInfo } from '../types/manga.js';
import { MangaApi } from '../services/api.js';
import { MangaCard, MangaCardLayoutMode } from '../components/MangaCard.js';
import { ExtensionService, FALLBACK_SOURCES_META } from '../services/extensionService.js';
import { HistoryService } from '../services/history.js';
import {
  LANGUAGE_OPTIONS,
  getPreferredLanguage,
  setPreferredLanguage,
  subscribePreferredLanguage
} from '../utils/languagePreference.js';
import {
  normalizeLibraryTitle,
  buildLibraryIndex,
  isMangaInLibraryIndex,
  isMangaInFavorites as checkMangaInFavorites,
  pickSurpriseCandidate
} from '../utils/libraryFilters.js';

type SourceBrowseMode = 'popular' | 'latest' | 'search';

interface SearchPageProps {
  isActive?: boolean;
  onSelectManga: (mangaId: string) => void;
  onReadChapter?: (mangaId: string, chapterId: string) => void;
  initialQuery?: string;
  browseSignal?: {
    sourceId: string;
    mode: SourceBrowseMode;
    nonce: number;
  } | null;
}

export type TropeCategory = 'all' | 'isekai' | 'romance' | 'lifestyle' | 'action' | 'dark' | 'format';

export interface SpecificTrope {
  id: string;
  label: string;
  category: Exclude<TropeCategory, 'all'>;
}

export const TROPE_CATEGORIES: Array<{ id: TropeCategory; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'isekai', label: 'Isekai & Poder' },
  { id: 'romance', label: 'Romance & Dinâmicas' },
  { id: 'lifestyle', label: 'Vida & Profissões' },
  { id: 'action', label: 'Ação & Mundos' },
  { id: 'dark', label: 'Sombrio & Sci-Fi' },
  { id: 'format', label: 'Esportes & Formatos' }
];

export const GENRE_TRANSLATIONS: Record<string, string[]> = {
  // Tropes & Subgêneros Específicos
  'yaoi / bl': [
    'yaoi', 'bl', "boys' love", 'boys love', 'shounen ai', 'shounen-ai', 'danmei', 'fujoshi'
  ],
  'yuri / gl': [
    'yuri', 'gl', "girls' love", 'girls love', 'shoujo ai', 'shoujo-ai', 'baihe'
  ],
  'harém': [
    'harem', 'female harem', 'harém', 'polyamory', 'poly'
  ],
  'ecchi': [
    'ecchi', 'fanservice', 'sensual', 'borderline h', 'softcore'
  ],
  'troca de gênero': [
    'gender bender', 'gender swap', 'genderswap', 'magical sex shift', 'troca de gênero', 'troca de sexo'
  ],
  'crossdressing / trap': [
    'crossdressing', 'trap', 'josou', 'disguised as a boy', 'disguised as a girl', 'femboy', 'otokonoko'
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
    'music', 'música', 'musica', 'band', 'banda', 'idol', 'ídolo', 'performing arts', 'visual arts', 'teatro'
  ],
  'overpower (op)': [
    'overpower', 'overpowered', 'op protagonist', 'cheat skill', 'cheat ability',
    'apelão', 'strongest', 'unrivaled', 'invincible', 'max level', 'saikyou',
    'peerless', 'godlike', 'overpowered protagonist', 'cheat', 'unmatched'
  ],
  'yandere': ['yandere', 'stalker', 'obsessive', 'possessive', 'yandere girlfriend'],
  'tomboy': ['tomboy', 'garota moleca', 'moleca', 'boyish'],
  'construção de vila': ['village building', 'kingdom building', 'kingdom management', 'city building', 'nation building', 'territory', 'construção de vila', 'reino', 'settlement', 'estate developer', 'fief', 'território', 'construcao de vila'],
  'fazenda / agricultura': ['farming', 'fazenda', 'agricultura', 'slow life', 'vida calma', 'vida lenta', 'agriculture', 'harvest', 'farm life'],
  'vilã (villainess)': ['villainess', 'vilã', 'vila', 'antagonista', 'villain', 'otome', 'otome game'],
  'reencarnação': ['reincarnation', 'reencarnação', 'transmigration', 'reborn', 'reencarnado', 'isekai'],
  'regressão / tempo': ['time travel', 'time manipulation', 'regression', 'regressor', 'viagem no tempo', 'retorno', 'loop', 'timeline', 'regressão', 'regressao'],
  'dungeon / sistema': ['dungeon', 'system', 'sistema', 'portais', 'hunter', 'leveling', 'ranker', 'tower', 'awakening', 'solo leveling'],
  'cultivação / murim': ['cultivation', 'cultivo', 'murim', 'wuxia', 'xianxia', 'martial arts', 'artes marciais', 'qi', 'sect'],
  'domador de monstros': ['monster tamer', 'creature taming', 'tamer', 'domador', 'monster pet', 'beast tamer', 'monster', 'pet'],
  'vingança': ['revenge', 'vingança', 'betrayal', 'traição', 'retribution', 'avenger'],
  'romance colegial': ['school life', 'school romance', 'school', 'colegial', 'escolar', 'student', 'high school'],
  'harem invertido': ['reverse harem', 'male harem', 'harem invertido'],
  'psicológico': ['psychological', 'psicológico', 'psicologico'],
  'sobrevivência': ['survival', 'sobrevivência', 'sobrevivencia', 'death game'],
  'isekai': ['isekai', 'another world', 'outro mundo', 'summoned', 'transported'],
  'apocalipse / zumbis': ['zombie', 'zombies', 'apocalypse', 'apocalipse', 'zumbi', 'survival', 'post-apocalyptic', 'fim do mundo'],
  'academia de magia': ['magic academy', 'academia de magia', 'magic school', 'escola de magia', 'magic'],
  'romcom / comédia romântica': ['romcom', 'romantic comedy', 'comédia romântica', 'comedia romantica'],
  'trabalho / adulto': ['office', 'office workers', 'office romance', 'workplace', 'work', 'ceo', 'trabalho', 'adult romance', 'empresa'],
  'delinquente / gangue': ['delinquents', 'delinquent', 'gang', 'gangs', 'yankee', 'delinquente', 'gangue', 'brawler', 'bosozoku'],
  'caçada de monstros': ['monster hunter', 'monster hunting', 'caçador de monstros', 'caçada', 'beasts'],
  'jogo da morte': ['death game', 'jogo da morte', 'battle royale', 'deathmatch'],
  'protagonista criança / shota': [
    'child protagonist', 'primarily child cast', 'kids', 'age regression', 'young male lead', 'shota', 'shouta', 'reincarnated as a boy',
    'reborn as a boy', 'young boy', 'young lord', 'child', 'criança', 'menino', 'garoto'
  ],
  'nobreza / aristocracia': [
    'aristocracy', 'noble', 'duke', 'count', 'baron', 'kizoku', 'royal', 'prince',
    'aristocrat', 'nobre', 'nobreza', 'realeza'
  ],
  'avaliação (appraisal)': [
    'appraisal', 'kantei', 'appraise', 'evaluate', 'avaliação', 'avaliacao', 'identificar'
  ],
  'recrutamento / aliados': [
    'recruit', 'loyal subordinates', 'subordinate', 'retainer', 'vassal', 'talented',
    'recrutamento', 'aliados', 'talento'
  ],
  'ferreiro / artesão / mercador': [
    'blacksmith', 'merchant', 'crafting', 'alchemy', 'potion', 'ferreiro', 'mercador',
    'artesão', 'alquimia'
  ],
  'médico / curandeiro': [
    'doctor', 'healer', 'medicine', 'medical', 'pharmacy', 'pharmacist', 'médico', 'curandeiro'
  ],
  'vida lenta (slow life)': [
    'slow life', 'vida lenta', 'peaceful life', 'laid back', 'iyashikei', 'rural'
  ],
  'estrategista / gênio': [
    'strategist', 'tactician', 'strategy game', 'smart', 'genius', 'mastermind', 'clever protagonist',
    'estrategista', 'inteligente'
  ],
  'necromante / invocação': [
    'necromancer', 'necromancy', 'summoner', 'undead', 'skeleton', 'shadow monarch',
    'necromante', 'invocador', 'invocação'
  ],
  'torre / escalada': [
    'tower', 'climber', 'climbing', 'floor', 'ranker', 'torre', 'escalada'
  ],
  'realidade virtual / vrmmo': [
    'virtual reality', 'vrmmo', 'vr game', 'full dive', 'mmorpg', 'realidade virtual'
  ],
  'máfia / yakuza / crime': [
    'mafia', 'yakuza', 'crime', 'organized crime', 'syndicate', 'gangster', 'máfia'
  ],
  'vampiros': [
    'vampires', 'vampire', 'vampiro', 'vampira', 'bloodsucker'
  ],
  'samurai / espadachim': [
    'samurai', 'katana', 'swordsman', 'swordmaster', 'espadachim'
  ],
  'ninja / shinobi / assassino': [
    'ninja', 'shinobi', 'assassin', 'assassination', 'hitman', 'assassino'
  ],
  'super-heróis / poderes': [
    'superhero', 'super power', 'superpowers', 'vigilante', 'super-herói', 'poderes'
  ],
  'garotas mágicas (mahou shoujo)': [
    'magical girls', 'mahou shoujo', 'magical girl', 'garota mágica'
  ],
  'fantasmas / ocultismo': [
    'ghosts', 'ghost', 'occult', 'exorcist', 'spirit', 'fantasma', 'ocultismo', 'exorcista'
  ],
  'pós-apocalíptico': [
    'post-apocalyptic', 'post apocalyptic', 'wasteland', 'ruined world', 'pós-apocalíptico'
  ],
  'cyberpunk / futurista': [
    'cyberpunk', 'dystopia', 'android', 'cyborg', 'hacker', 'distopia', 'futurista'
  ],
  'suspense / thriller': [
    'thriller', 'suspense', 'mind games', 'tension'
  ],
  'tragédia / drama pesado': [
    'tragedy', 'tragédia', 'tragedia', 'tragic', 'heartbreak'
  ],
  'gore / violência': [
    'gore', 'brutal', 'splatter', 'violência'
  ],
  'gyaru': [
    'gyaru', 'kogal', 'gal'
  ],
  'garotas monstro': [
    'monster girls', 'monster girl', 'lamia', 'harpy', 'centaur', 'garota monstro'
  ],
  'colorido (full color)': [
    'full color', 'official colored', 'fan colored', 'colored', 'colorido'
  ],
  'jogos / e-sports / apostas': [
    'video games', 'video game', 'high stakes game', 'gambling', 'esports', 'apostas', 'jogos'
  ],
  'aventura em guilda / rank s': [
    'adventurer', 'guild', 's-rank', 'f-rank', 'banished', 'kicked from party', 'guilda', 'aventureiro'
  ],
  'filosofia / reflexivo': [
    'philosophical', 'philosophy', 'existential', 'filosófico', 'filosofia'
  ],
  'artes marciais': [
    'martial arts', 'karate', 'kung fu', 'mma', 'boxing', 'artes marciais', 'luta'
  ],

  // Novos Subgêneros & Nichos Expandidos
  'expulso do grupo': [
    'banished', 'exiled', 'kicked out', 'expelled', 'fired', 'useless', 'dismissed', 'expulso', 'expulsa'
  ],
  'fraco para forte': [
    'weak to strong', 'weakest', 'f-rank', 'e-rank', 'lowest rank', 'underdog', 'trash', 'fraco', 'zero to hero'
  ],
  'reencarnado como monstro': [
    'reincarnated as a', 'slime', 'goblin', 'spider', 'dragon', 'skeleton', 'sword', 'vending machine', 'monster', 'reencarnado como'
  ],
  'lorde demônio / rei demônio': [
    'demon lord', 'demon king', 'maou', 'dark lord', 'rei demônio', 'lorde demônio'
  ],
  'constelações / stream divino': [
    'constellation', 'constellations', 'sponsor', 'viewers', 'gods watching', 'livestream', 'constelação', 'constelações'
  ],
  'herói invocado / traído': [
    'summoned hero', 'betrayed hero', 'hero party', 'classmates', 'herói traído', 'invocado'
  ],
  'portais na terra (gate)': [
    'gate', 'gates', 'portal', 'portais', 'rift', 'dungeon break', 'awakened', 'hunter'
  ],
  'habilidade única / cheat': [
    'cheat skill', 'unique skill', 'broken skill', 'status window', 'skill tree', 'habilidade única', 'janela de status'
  ],
  'imortal / cultivo moderno': [
    'immortal', 'urban cultivation', 'cultivator in modern', 'cultivation', 'imortal', 'cultivo moderno'
  ],
  'casamento por contrato': [
    'contract marriage', 'arranged marriage', 'fake relationship', 'marriage', 'fake dating', 'fake marriage', 'contractual', 'casamento por contrato', 'casamento arranjado'
  ],
  'inimigos para amantes': [
    'enemies to lovers', 'rival', 'rivals', 'arch-enemy', 'rivalry', 'inimigos', 'rivalidade'
  ],
  'amigos de infância': [
    'childhood friend', 'childhood friends', 'osananajimi', 'amigo de infância', 'amiga de infância'
  ],
  'rompimento de noivado': [
    'broken engagement', 'annulment', 'engagement annulled', 'condemnation', 'noivado desfeito', 'rompimento'
  ],
  'triângulo amoroso': [
    'love polygon', 'love triangle', 'triângulo amoroso', 'triangle'
  ],
  'diferença de idade': [
    'age gap', 'older woman', 'older man', 'younger', 'diferença de idade'
  ],
  'kuudere / fria por fora': [
    'kuudere', 'ice queen', 'emotionless', 'expressionless', 'cold beauty', 'aloof', 'fria'
  ],
  'tsundere': [
    'tsundere', 'hot and cold', 'stubborn'
  ],
  'dandere / tímida(o)': [
    'dandere', 'shy', 'socially anxious', 'introvert', 'komyushou', 'tímida', 'tímido', 'fobia social'
  ],
  'morando juntos / vizinhos': [
    'cohabitation', 'roommate', 'neighbor', 'next door', 'living together', 'vizinha', 'vizinho', 'morando juntos'
  ],
  'vida de casado / recém-casados': [
    'married life', 'newlywed', 'husband and wife', 'wife', 'recém-casados', 'vida de casado'
  ],
  'amor proibido / secreto': [
    'forbidden love', 'secret relationship', 'taboo', 'affair', 'amor proibido', 'secreto'
  ],
  'iyashikei / relaxante': [
    'iyashikei', 'healing', 'cozy', 'relaxing', 'heartwarming', 'wholesome', 'tranquilo'
  ],
  'cuidando de criança (childcare)': [
    'childcare', 'parenthood', 'adoption', 'raising a child', 'parenting', 'single father', 'single mother', 'daughter', 'adopt', 'cuidando de criança', 'pai solteiro'
  ],
  'animais / pets': [
    'animals', 'pets', 'pet', 'cat', 'dog', 'fluffy', 'animais', 'bichinhos', 'mascotes'
  ],
  'estalagem / restaurante / café': [
    'gourmet', 'cafe', 'tavern', 'inn', 'bakery', 'izakaya', 'restaurant', 'food', 'cooking', 'cafeteria', 'padaria', 'estalagem'
  ],
  'professor / tutor / mentor': [
    'teacher', 'instructor', 'tutor', 'professor', 'mentor', 'sensei', 'academy instructor'
  ],
  'mordomo / empregada': [
    'maid', 'maids', 'butler', 'servant', 'housekeeper', 'empregada', 'mordomo'
  ],
  'showbiz / atuação': [
    'showbiz', 'performing arts', 'acting', 'actor', 'actress', 'celebrity', 'audition', 'entertainment industry', 'atuação', 'idol'
  ],
  'otaku / mangaká / cosplay': [
    'otaku culture', 'otaku', 'mangaka', 'manga artist', 'cosplay', 'doujin', 'anime', 'mangaká'
  ],
  'cgdct / clube escolar': [
    'cgdct', 'cute girls doing cute things', 'club', 'school club', 'clube escolar', 'garotas fofas'
  ],
  'paródia / humor nonsense': [
    'parody', 'gag humor', 'surreal comedy', 'spoof', 'satire', 'absurd', 'paródia', 'besteirol'
  ],
  'santa / sacerdotisa': [
    'saint', 'saintess', 'priestess', 'shrine maiden', 'miko', 'nun', 'santa', 'sacerdotisa'
  ],
  'economia / comércio / império': [
    'economics', 'commerce', 'merchant', 'business', 'trade', 'company', 'shop', 'comércio', 'economia'
  ],
  'engenharia / magitec': [
    'engineer', 'inventor', 'magitech', 'invention', 'technology', 'crafting', 'crafts', 'engenheiro', 'invenção'
  ],
  'educacional / curiosidades': [
    'educational', 'trivia', 'documentary', 'informative', 'educacional', 'aprendizado'
  ],
  'fantasia urbana': [
    'urban fantasy', 'modern magic', 'hidden world', 'fantasia urbana'
  ],
  'mitologia / deuses': [
    'mythology', 'gods', 'goddess', 'deity', 'greek', 'norse', 'folklore', 'mitologia', 'deuses'
  ],
  'anjos / demônios / guerra santa': [
    'angel', 'angels', 'fallen angel', 'heaven', 'hell', 'seraph', 'anjo', 'anjos'
  ],
  'piratas / navegação': [
    'pirate', 'pirates', 'corsair', 'pirata', 'piratas', 'voyage'
  ],
  'mercenário / caçador de recompensas': [
    'mercenary', 'bounty hunter', 'sellsword', 'mercenário', 'caçador de recompensas'
  ],
  'steampunk / vitoriano': [
    'steampunk', 'victorian', 'clockwork', 'airship', 'vitoriano'
  ],
  'velho oeste / faroeste': [
    'western', 'cowboy', 'cowboys', 'gunslinger', 'wild west', 'frontier', 'faroeste'
  ],
  'sobrevivência na selva / ilha': [
    'deserted island', 'island', 'wilderness', 'castaway', 'shipwreck', 'jungle', 'ilha deserta'
  ],
  'anti-herói / vilão mc': [
    'antihero', 'anti-hero', 'ruthless', 'evil protagonist', 'villain protagonist', 'anti-herói'
  ],
  'loop temporal': [
    'time loop', 'time travel', 'time manipulation', 'die and repeat', 'groundhog', 'reset', 'loop temporal'
  ],
  'mistério de assassinato': [
    'murder', 'murder mystery', 'serial killer', 'locked room', 'homicide', 'detective', 'assassinato'
  ],
  'body horror / mutação': [
    'body horror', 'parasite', 'mutation', 'grotesque', 'assimilation', 'mutação', 'parasita'
  ],
  'horror cósmico / cultos': [
    'cosmic horror', 'eldritch', 'lovecraft', 'cult', 'cultist', 'seita', 'culto'
  ],
  'espacial / aliens': [
    'space', 'aliens', 'alien', 'starship', 'galaxy', 'planet', 'espacial', 'alienígenas'
  ],
  'esportes de combate': [
    'combat sports', 'boxing', 'mma', 'wrestling', 'judo', 'karate', 'kickboxing', 'boxe'
  ],
  'esportes em equipe': [
    'team sports', 'soccer', 'football', 'basketball', 'volleyball', 'baseball', 'rugby', 'futebol', 'basquete', 'vôlei'
  ],
  'corrida / carros / drift': [
    'racing', 'cars', 'drift', 'motorsport', 'motorcycle', 'rally', 'corrida', 'carros'
  ],
  'jogos de tabuleiro / cartas': [
    'traditional games', 'mahjong', 'shogi', 'chess', 'card game', 'karuta', 'board game', 'xadrez', 'cartas'
  ],
  'webtoon / scroll vertical': [
    'long strip', 'webtoon', 'web comic', 'vertical', 'scroll vertical'
  ],
  'oneshot (história única)': [
    'oneshot', 'one-shot', 'one shot', 'história única'
  ],
  '4-koma (tirinhas)': [
    '4-koma', 'yonkoma', '4koma', 'tirinhas'
  ],
  'premiado (award winning)': [
    'award winning', 'award', 'prize', 'premiado'
  ],
  'antologia / coletânea': [
    'anthology', 'collection', 'short stories', 'antologia', 'coletânea'
  ],

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

interface CompiledGenreSynonym {
  lower: string;
  shortRegex: RegExp | null;
}

const COMPILED_GENRE_SYNONYMS: Record<string, CompiledGenreSynonym[]> = Object.fromEntries(
  Object.entries(GENRE_TRANSLATIONS).map(([key, list]) => [
    key,
    list.map(syn => {
      const lower = syn.toLowerCase();
      const shortRegex =
        lower.length <= 4
          ? new RegExp(`\\b${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
          : null;
      return { lower, shortRegex };
    })
  ])
);

export const SPECIFIC_TROPES: SpecificTrope[] = [
  // Isekai & Poder (27)
  { id: 'Isekai', label: 'Isekai', category: 'isekai' },
  { id: 'Reencarnação', label: 'Reencarnação', category: 'isekai' },
  { id: 'Regressão / Tempo', label: 'Regressão / Tempo', category: 'isekai' },
  { id: 'Dungeon / Sistema', label: 'Dungeon / Sistema', category: 'isekai' },
  { id: 'Overpower (OP)', label: 'Overpower (OP)', category: 'isekai' },
  { id: 'Expulso do Grupo', label: 'Expulso do Grupo (Banished)', category: 'isekai' },
  { id: 'Fraco para Forte', label: 'Fraco para Forte (Zero to Hero)', category: 'isekai' },
  { id: 'Reencarnado como Monstro', label: 'Reencarnado como Monstro / Objeto', category: 'isekai' },
  { id: 'Lorde Demônio / Rei Demônio', label: 'Lorde Demônio / Maou', category: 'isekai' },
  { id: 'Constelações / Stream Divino', label: 'Constelações / Stream Divino', category: 'isekai' },
  { id: 'Herói Invocado / Traído', label: 'Herói Invocado / Traído', category: 'isekai' },
  { id: 'Portais na Terra (Gate)', label: 'Portais na Terra (Gates)', category: 'isekai' },
  { id: 'Habilidade Única / Cheat', label: 'Habilidade Única / Status', category: 'isekai' },
  { id: 'Imortal / Cultivo Moderno', label: 'Imortal / Cultivo Moderno', category: 'isekai' },
  { id: 'Construção de Vila', label: 'Gestão de Território / Reino', category: 'isekai' },
  { id: 'Nobreza / Aristocracia', label: 'Nobreza / Aristocracia', category: 'isekai' },
  { id: 'Vilã (Villainess)', label: 'Vilã (Villainess)', category: 'isekai' },
  { id: 'Cultivação / Murim', label: 'Cultivação / Murim', category: 'isekai' },
  { id: 'Avaliação (Appraisal)', label: 'Avaliação (Appraisal)', category: 'isekai' },
  { id: 'Recrutamento / Aliados', label: 'Recrutamento / Talentos', category: 'isekai' },
  { id: 'Academia de Magia', label: 'Academia de Magia', category: 'isekai' },
  { id: 'Domador de Monstros', label: 'Domador de Monstros', category: 'isekai' },
  { id: 'Necromante / Invocação', label: 'Necromante / Invocação', category: 'isekai' },
  { id: 'Torre / Escalada', label: 'Torre / Escalada', category: 'isekai' },
  { id: 'Aventura em Guilda / Rank S', label: 'Guildas / Aventureiro Rank S', category: 'isekai' },
  { id: 'Isekai Reverso', label: 'Isekai Reverso', category: 'isekai' },
  { id: 'Protagonista Criança / Shota', label: 'Protagonista Criança / Shota', category: 'isekai' },

  // Romance & Dinâmicas (25)
  { id: 'RomCom / Comédia Romântica', label: 'Comédia Romântica', category: 'romance' },
  { id: 'Romance Colegial', label: 'Romance Colegial', category: 'romance' },
  { id: 'Trabalho / Adulto', label: 'Romance Adulto / Office', category: 'romance' },
  { id: 'Casamento por Contrato', label: 'Casamento por Contrato / Fake', category: 'romance' },
  { id: 'Inimigos para Amantes', label: 'Inimigos para Amantes', category: 'romance' },
  { id: 'Amigos de Infância', label: 'Amigos de Infância', category: 'romance' },
  { id: 'Rompimento de Noivado', label: 'Rompimento de Noivado', category: 'romance' },
  { id: 'Triângulo Amoroso', label: 'Triângulo Amoroso', category: 'romance' },
  { id: 'Diferença de Idade', label: 'Diferença de Idade (Age Gap)', category: 'romance' },
  { id: 'Kuudere / Fria por Fora', label: 'Kuudere / Rainha de Gelo', category: 'romance' },
  { id: 'Tsundere', label: 'Tsundere', category: 'romance' },
  { id: 'Dandere / Tímida(o)', label: 'Dandere / Timidez Social', category: 'romance' },
  { id: 'Yandere', label: 'Yandere', category: 'romance' },
  { id: 'Tomboy', label: 'Tomboy', category: 'romance' },
  { id: 'Gyaru', label: 'Gyaru', category: 'romance' },
  { id: 'Morando Juntos / Vizinhos', label: 'Morando Juntos / Vizinhos', category: 'romance' },
  { id: 'Vida de Casado / Recém-Casados', label: 'Vida de Casado / Recém-Casados', category: 'romance' },
  { id: 'Amor Proibido / Secreto', label: 'Amor Proibido / Secreto', category: 'romance' },
  { id: 'Harém', label: 'Harém', category: 'romance' },
  { id: 'Harem Invertido', label: 'Harem Invertido', category: 'romance' },
  { id: 'Ecchi', label: 'Ecchi / Sensual', category: 'romance' },
  { id: 'Yaoi / BL', label: 'Yaoi / BL (Boys\' Love)', category: 'romance' },
  { id: 'Yuri / GL', label: 'Yuri / GL (Girls\' Love)', category: 'romance' },
  { id: 'Troca de Gênero', label: 'Troca de Gênero (Gender Bender)', category: 'romance' },
  { id: 'Crossdressing / Trap', label: 'Crossdressing / Trap', category: 'romance' },

  // Vida & Profissões (21)
  { id: 'Vida Lenta (Slow Life)', label: 'Vida Lenta (Slow Life)', category: 'lifestyle' },
  { id: 'Iyashikei / Relaxante', label: 'Iyashikei / Relaxante & Cura', category: 'lifestyle' },
  { id: 'Cuidando de Criança (Childcare)', label: 'Paternidade / Childcare', category: 'lifestyle' },
  { id: 'Animais / Pets', label: 'Animais / Pets & Mascotes', category: 'lifestyle' },
  { id: 'Fazenda / Agricultura', label: 'Fazenda / Agricultura', category: 'lifestyle' },
  { id: 'Culinária / Gastronomia', label: 'Culinária / Gastronomia', category: 'lifestyle' },
  { id: 'Estalagem / Restaurante / Café', label: 'Estalagem / Café & Tavernas', category: 'lifestyle' },
  { id: 'Ferreiro / Artesão / Mercador', label: 'Ferreiro / Mercador / Alquimia', category: 'lifestyle' },
  { id: 'Economia / Comércio / Império', label: 'Comércio / Economia & Negócios', category: 'lifestyle' },
  { id: 'Engenharia / Magitec', label: 'Engenharia / Ciência & Magitec', category: 'lifestyle' },
  { id: 'Médico / Curandeiro', label: 'Médico / Curandeiro', category: 'lifestyle' },
  { id: 'Professor / Tutor / Mentor', label: 'Professor / Tutor / Mentor', category: 'lifestyle' },
  { id: 'Mordomo / Empregada', label: 'Maid / Mordomo', category: 'lifestyle' },
  { id: 'Santa / Sacerdotisa', label: 'Santa / Sacerdotisa (Saintess)', category: 'lifestyle' },
  { id: 'Estrategista / Gênio', label: 'Estrategista / Inteligente', category: 'lifestyle' },
  { id: 'Música / Artes', label: 'Música / Ídolos & Artes', category: 'lifestyle' },
  { id: 'Showbiz / Atuação', label: 'Showbiz / Atuação & Fama', category: 'lifestyle' },
  { id: 'Otaku / Mangaká / Cosplay', label: 'Cultura Otaku / Mangaká', category: 'lifestyle' },
  { id: 'CGDCT / Clube Escolar', label: 'CGDCT / Clube Escolar', category: 'lifestyle' },
  { id: 'Paródia / Humor Nonsense', label: 'Paródia / Humor Nonsense', category: 'lifestyle' },
  { id: 'Educacional / Curiosidades', label: 'Educacional / Curiosidades', category: 'lifestyle' },

  // Ação & Mundos (21)
  { id: 'Artes Marciais', label: 'Artes Marciais / Luta', category: 'action' },
  { id: 'Samurai / Espadachim', label: 'Samurai / Espadachim', category: 'action' },
  { id: 'Ninja / Shinobi / Assassino', label: 'Ninja / Assassino', category: 'action' },
  { id: 'Fantasia Urbana', label: 'Fantasia Urbana', category: 'action' },
  { id: 'Mitologia / Deuses', label: 'Mitologia / Deuses & Lendas', category: 'action' },
  { id: 'Anjos / Demônios / Guerra Santa', label: 'Anjos / Céu & Guerra Santa', category: 'action' },
  { id: 'Militar / Guerra', label: 'Militar / Guerra', category: 'action' },
  { id: 'Policial / Detetive', label: 'Policial / Detetive', category: 'action' },
  { id: 'Máfia / Yakuza / Crime', label: 'Máfia / Yakuza / Crime', category: 'action' },
  { id: 'Delinquente / Gangue', label: 'Delinquentes / Gangues', category: 'action' },
  { id: 'Mercenário / Caçador de Recompensas', label: 'Mercenário / Caçador', category: 'action' },
  { id: 'Piratas / Navegação', label: 'Piratas / Navegação', category: 'action' },
  { id: 'Steampunk / Vitoriano', label: 'Steampunk / Vitoriano', category: 'action' },
  { id: 'Velho Oeste / Faroeste', label: 'Faroeste / Pistoleiros', category: 'action' },
  { id: 'Super-Heróis / Poderes', label: 'Super-Heróis / Poderes', category: 'action' },
  { id: 'Garotas Mágicas (Mahou Shoujo)', label: 'Garotas Mágicas (Mahou Shoujo)', category: 'action' },
  { id: 'Caçada de Monstros', label: 'Caçada / Monstros', category: 'action' },
  { id: 'Monstros / Demônios', label: 'Monstros / Demônios', category: 'action' },
  { id: 'Vampiros', label: 'Vampiros', category: 'action' },
  { id: 'Garotas Monstro', label: 'Garotas Monstro', category: 'action' },
  { id: 'Sobrevivência na Selva / Ilha', label: 'Ilha Deserta / Selva', category: 'action' },

  // Sombrio & Sci-Fi (20)
  { id: 'Vingança', label: 'Vingança / Traição', category: 'dark' },
  { id: 'Anti-Herói / Vilão MC', label: 'Anti-Herói / Protagonista Vilão', category: 'dark' },
  { id: 'Psicológico', label: 'Psicológico', category: 'dark' },
  { id: 'Suspense / Thriller', label: 'Suspense / Thriller', category: 'dark' },
  { id: 'Mistério de Assassinato', label: 'Mistério de Assassinato', category: 'dark' },
  { id: 'Loop Temporal', label: 'Loop Temporal (Die & Repeat)', category: 'dark' },
  { id: 'Sobrevivência', label: 'Sobrevivência', category: 'dark' },
  { id: 'Jogo da Morte', label: 'Jogo da Morte / Survival', category: 'dark' },
  { id: 'Apocalipse / Zumbis', label: 'Apocalipse / Zumbis', category: 'dark' },
  { id: 'Pós-Apocalíptico', label: 'Pós-Apocalíptico', category: 'dark' },
  { id: 'Tragédia / Drama Pesado', label: 'Tragédia / Drama Pesado', category: 'dark' },
  { id: 'Gore / Violência', label: 'Gore / Violência', category: 'dark' },
  { id: 'Body Horror / Mutação', label: 'Body Horror / Parasitas', category: 'dark' },
  { id: 'Horror Cósmico / Cultos', label: 'Horror Cósmico / Seitas', category: 'dark' },
  { id: 'Fantasmas / Ocultismo', label: 'Fantasmas / Ocultismo', category: 'dark' },
  { id: 'Filosofia / Reflexivo', label: 'Filosofia / Reflexivo', category: 'dark' },
  { id: 'Mecha / Robôs', label: 'Mecha / Robôs', category: 'dark' },
  { id: 'Cyberpunk / Futurista', label: 'Cyberpunk / Futurista', category: 'dark' },
  { id: 'Espacial / Aliens', label: 'Espacial / Alienígenas', category: 'dark' },
  { id: 'Realidade Virtual / VRMMO', label: 'Realidade Virtual / VRMMO', category: 'dark' },

  // Esportes & Formatos (11)
  { id: 'Esportes de Combate', label: 'Esportes de Combate (Boxe / MMA)', category: 'format' },
  { id: 'Esportes em Equipe', label: 'Esportes em Equipe (Futebol / Vôlei)', category: 'format' },
  { id: 'Corrida / Carros / Drift', label: 'Corrida / Carros & Drift', category: 'format' },
  { id: 'Jogos / E-Sports / Apostas', label: 'Jogos / Apostas / E-Sports', category: 'format' },
  { id: 'Jogos de Tabuleiro / Cartas', label: 'Xadrez / Shogi / Mahjong / Cartas', category: 'format' },
  { id: 'Colorido (Full Color)', label: 'Colorido (Full Color)', category: 'format' },
  { id: 'Webtoon / Scroll Vertical', label: 'Webtoon / Scroll Vertical', category: 'format' },
  { id: 'Oneshot (História Única)', label: 'Oneshot (História Única)', category: 'format' },
  { id: '4-Koma (Tirinhas)', label: '4-Koma (Tirinhas)', category: 'format' },
  { id: 'Premiado (Award Winning)', label: 'Premiado (Award Winning)', category: 'format' },
  { id: 'Antologia / Coletânea', label: 'Antologia / Coletânea', category: 'format' }
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

  if (
    country === 'jp' ||
    country === 'ja' ||
    country === 'japão' ||
    country === 'japan'
  ) {
    if (genres.includes('webtoon') || genres.some(g => g.includes('manhwa'))) {
      return 'manhwa';
    }
    if (genres.some(g => g.includes('manhua'))) {
      return 'manhua';
    }
    return 'manga';
  }

  if (genres.includes('webtoon')) {
    return 'manhwa';
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

function normalizeWorkTitle(t: string): string {
  return normalizeLibraryTitle(t);
}

const searchRomajiLoose = (s: string) => s.replace(/wo/g, 'o').replace(/ou/g, 'o');

function appendUniqueSearchResults(prev: Manga[], newItems: Manga[]): Manga[] {
  if (!newItems || newItems.length === 0) return prev;
  const seenIds = new Set<string>();
  const seenPrimary = new Set<string>();
  const seenAlts = new Set<string>();
  const seenSharedAlts = new Set<string>();
  const seenLoose = new Set<string>();

  const registerManga = (m: Manga) => {
    if (m.id) seenIds.add(m.id);
    const n = normalizeWorkTitle(m.title);
    if (n.length >= 3) seenPrimary.add(n);
    if (n.length >= 12) seenLoose.add(searchRomajiLoose(n));
    if (Array.isArray(m.altTitles)) {
      for (const alt of m.altTitles) {
        const clean = normalizeWorkTitle(alt);
        if (clean.length >= 3) {
          seenAlts.add(clean);
          if (clean.length >= 5) seenSharedAlts.add(clean);
          if (clean.length >= 12) seenLoose.add(searchRomajiLoose(clean));
        }
      }
    }
  };

  for (const existing of prev) {
    registerManga(existing);
  }

  const additions: Manga[] = [];
  for (const m of newItems) {
    if (m.id && seenIds.has(m.id)) continue;
    const n = normalizeWorkTitle(m.title);
    if (n.length >= 3 && seenPrimary.has(n)) continue;
    if (n.length >= 4 && seenAlts.has(n)) continue;
    if (n.length >= 12 && seenLoose.has(searchRomajiLoose(n))) continue;

    let dupByAlt = false;
    if (Array.isArray(m.altTitles)) {
      for (const alt of m.altTitles) {
        const clean = normalizeWorkTitle(alt);
        if (clean.length < 3) continue;
        if (clean.length >= 4 && seenPrimary.has(clean)) {
          dupByAlt = true;
          break;
        }
        if (clean.length >= 5 && seenSharedAlts.has(clean)) {
          dupByAlt = true;
          break;
        }
        if (clean.length >= 12 && seenLoose.has(searchRomajiLoose(clean))) {
          dupByAlt = true;
          break;
        }
      }
    }
    if (dupByAlt) continue;

    additions.push(m);
    registerManga(m);
  }

  return additions.length > 0 ? [...prev, ...additions] : prev;
}

export function matchGenre(mangaOrGenres: Manga | string[] | undefined, filterGenre: string, scanSynopsis = true): boolean {
  if (!mangaOrGenres) return false;
  const targetLower = filterGenre.toLowerCase().trim();
  const compiledSynonyms: CompiledGenreSynonym[] = COMPILED_GENRE_SYNONYMS[targetLower] || [
    {
      lower: targetLower,
      shortRegex:
        targetLower.length <= 4
          ? new RegExp(`\\b${targetLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
          : null
    }
  ];

  let genresLower: string[];
  let titleLower = '';
  let synopsisLower = '';

  if (Array.isArray(mangaOrGenres)) {
    genresLower = mangaOrGenres.map(g => g.toLowerCase());
  } else {
    genresLower = (mangaOrGenres.genres || []).map(g => g.toLowerCase());
    titleLower = (mangaOrGenres.title || '').toLowerCase();
    if (mangaOrGenres.altTitles && mangaOrGenres.altTitles.length > 0) {
      titleLower += ' ' + mangaOrGenres.altTitles.map(a => a.toLowerCase()).join(' ');
    }
    if (scanSynopsis && mangaOrGenres.synopsis) {
      synopsisLower = mangaOrGenres.synopsis.toLowerCase();
    }
  }

  for (let i = 0; i < compiledSynonyms.length; i++) {
    const { lower: s, shortRegex } = compiledSynonyms[i];
    // 1. Direct match in genre list
    for (let j = 0; j < genresLower.length; j++) {
      const g = genresLower[j];
      if (g === s || g.includes(s) || s.includes(g)) return true;
    }
    // 2. Direct match in title or alternative titles
    if (titleLower && titleLower.includes(s)) return true;
    // 3. Synopsis scan with precompiled word boundary for short words
    if (synopsisLower) {
      if (shortRegex) {
        if (shortRegex.test(synopsisLower)) return true;
      } else if (synopsisLower.includes(s)) {
        return true;
      }
    }
  }
  return false;
}

export const SearchPage: React.FC<SearchPageProps> = ({
  isActive = true,
  onSelectManga,
  onReadChapter,
  initialQuery = '',
  browseSignal = null
}) => {
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
  const [sourcesList, setSourcesList] = useState<MangaSourceInfo[]>(() => [...FALLBACK_SOURCES_META]);

  // Filters state
  const [selectedStatus, setSelectedStatus] = useState<string>(() => getUrlParam('status', 'all'));
  const [selectedDemographic, setSelectedDemographic] = useState<string>(() => getUrlParam('demographic', 'all'));
  const [selectedType, setSelectedType] = useState<string>(() => getUrlParam('type', 'all'));
  const [selectedSource, setSelectedSource] = useState<string>(() => getUrlParam('source', 'all'));
  const [tropeFilter, setTropeFilter] = useState('');
  const [tropeCategory, setTropeCategory] = useState<TropeCategory>('all');
  const [sourceBrowseMode, setSourceBrowseMode] = useState<SourceBrowseMode>(() => {
    const m = getUrlParam('mode', '');
    if (m === 'latest' || m === 'popular' || m === 'search') return m;
    return getUrlParam('source', 'all') !== 'all' && !getUrlParam('q', '') ? 'popular' : 'search';
  });
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
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const searchDirtyRef = useRef(false);
  const searchRequeryDirtyRef = useRef(false);
  const searchSourcesDirtyRef = useRef(false);
  const searchSeqRef = useRef(0);
  const selectedLanguageRef = useRef(selectedLanguage);
  selectedLanguageRef.current = selectedLanguage;

  useEffect(() => {
    if (!isActive) return;
    if (searchDirtyRef.current) {
      searchDirtyRef.current = false;
      const nextFavs = HistoryService.getFavorites();
      const nextIgnored = HistoryService.getIgnoredMangas();
      setFavoritesList(prev => (prev === nextFavs ? prev : nextFavs));
      setIgnoredList(prev => (prev === nextIgnored ? prev : nextIgnored));
    }
    if (searchSourcesDirtyRef.current) {
      searchSourcesDirtyRef.current = false;
      ExtensionService.getSourcesMeta().then(list => {
        if (Array.isArray(list) && list.length > 0) setSourcesList(list);
      }).catch(() => {});
    }
    if (searchRequeryDirtyRef.current) {
      searchRequeryDirtyRef.current = false;
      executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, sourceBrowseMode);
    }
  }, [isActive]);

  useEffect(() => {
    const unsub = HistoryService.subscribe(() => {
      if (!isActiveRef.current) {
        searchDirtyRef.current = true;
        return;
      }
      const nextFavs = HistoryService.getFavorites();
      const nextIgnored = HistoryService.getIgnoredMangas();
      setFavoritesList(prev => (prev === nextFavs ? prev : nextFavs));
      setIgnoredList(prev => (prev === nextIgnored ? prev : nextIgnored));
    }, ['favorites', 'ignored']);
    return () => {
      unsub();
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const libraryIndex = useMemo(() => buildLibraryIndex(favoritesList), [favoritesList]);
  const ignoredIndex = useMemo(() => buildLibraryIndex(ignoredList), [ignoredList]);

  const isMangaInLibrary = useCallback((m: Manga): boolean => {
    return isMangaInLibraryIndex(m, libraryIndex);
  }, [libraryIndex]);

  const isMangaIgnored = useCallback((m: Manga): boolean => {
    return isMangaInLibraryIndex(m, ignoredIndex);
  }, [ignoredIndex]);

  const isMangaIgnoredRef = useRef(isMangaIgnored);
  isMangaIgnoredRef.current = isMangaIgnored;

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
    if (!hideLibrary && !hideIgnored && sortBy === 'relevance') {
      return {
        displayedResults: results,
        hiddenFavoritesCount: 0,
        hiddenIgnoredCount: 0
      };
    }

    let favHidden = 0;
    let igHidden = 0;

    const filtered = (!hideLibrary && !hideIgnored)
      ? results
      : results.filter(m => {
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

    if (sortBy === 'relevance') {
      return {
        displayedResults: filtered,
        hiddenFavoritesCount: favHidden,
        hiddenIgnoredCount: igHidden
      };
    }

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
      case 'chapters': {
        const chapterNums = new Map<string, number>();
        for (const m of sorted) {
          chapterNums.set(m.id, parseFloat(m.latestChapter || '0') || 0);
        }
        sorted.sort((a, b) => (chapterNums.get(b.id) || 0) - (chapterNums.get(a.id) || 0));
        break;
      }
      default:
        break;
    }
    return {
      displayedResults: sorted,
      hiddenFavoritesCount: favHidden,
      hiddenIgnoredCount: igHidden
    };
  }, [results, hideLibrary, hideIgnored, isMangaInLibrary, isMangaIgnored, sortBy]);

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

  const tropeCategoryCounts = useMemo(() => {
    const counts = new Map<TropeCategory, number>();
    counts.set('all', SPECIFIC_TROPES.length);
    for (const t of SPECIFIC_TROPES) {
      counts.set(t.category, (counts.get(t.category) || 0) + 1);
    }
    return counts;
  }, []);

  const searchableTropes = useMemo(() => {
    return SPECIFIC_TROPES.map(t => ({
      trope: t,
      labelLower: t.label.toLowerCase(),
      idLower: t.id.toLowerCase(),
      synsLower: (COMPILED_GENRE_SYNONYMS[t.id.toLowerCase()] || []).map(s => s.lower)
    }));
  }, []);

  const filteredSpecificTropes = useMemo(() => {
    const q = tropeFilter.trim().toLowerCase();
    if (!q && tropeCategory === 'all') return SPECIFIC_TROPES;
    const out: SpecificTrope[] = [];
    for (const entry of searchableTropes) {
      if (tropeCategory !== 'all' && entry.trope.category !== tropeCategory) continue;
      if (
        !q ||
        entry.labelLower.includes(q) ||
        entry.idLower.includes(q) ||
        entry.synsLower.some(s => s.includes(q))
      ) {
        out.push(entry.trope);
      }
    }
    return out;
  }, [tropeCategory, tropeFilter, searchableTropes]);

  useEffect(() => {
    let active = true;
    const syncSources = () => {
      ExtensionService.getSourcesMeta().then(list => {
        if (active && Array.isArray(list) && list.length > 0) {
          setSourcesList(list);
        }
      }).catch(() => {});
    };
    syncSources();

    const startQ = getUrlParam('q', initialQuery);
    const startStatus = getUrlParam('status', 'all');
    const startDemo = getUrlParam('demographic', 'all');
    const startType = getUrlParam('type', 'all');
    const startSrc = getUrlParam('source', 'all');
    const startModeParam = getUrlParam('mode', '');
    const startMode: SourceBrowseMode =
      startModeParam === 'latest' || startModeParam === 'popular' || startModeParam === 'search'
        ? startModeParam
        : startSrc !== 'all' && !startQ.trim()
        ? 'popular'
        : 'search';
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

    executeSearch(startQ, startInc, startExc, startStatus, startDemo, startType, startSafe, startAvail, startSrc, startDeep, startLang, startMode);

    return () => {
      active = false;
    };
  }, []);

  // Subscribe to preferred language changes from Profile / other tabs
  useEffect(() => {
    return subscribePreferredLanguage((nextLang) => {
      if (selectedLanguageRef.current === nextLang) return;
      selectedLanguageRef.current = nextLang;
      setSelectedLanguage(nextLang);
      if (!isActiveRef.current) {
        searchRequeryDirtyRef.current = true;
        return;
      }
      executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, nextLang, sourceBrowseMode);
    });
  }, [query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, sourceBrowseMode]);

  // Subscribe to extension toggles / installs / uninstalls to keep source options and results live
  useEffect(() => {
    const unsub = ExtensionService.subscribe(() => {
      if (!isActiveRef.current) {
        searchSourcesDirtyRef.current = true;
        searchRequeryDirtyRef.current = true;
        return;
      }
      ExtensionService.getSourcesMeta().then(list => {
        if (Array.isArray(list) && list.length > 0) {
          setSourcesList(list);
        }
      }).catch(() => {});
      executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, sourceBrowseMode);
    });
    return unsub;
  }, [query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, sourceBrowseMode]);

  useEffect(() => {
    if (initialQuery && initialQuery !== query) {
      setQuery(initialQuery);
      setSourceBrowseMode('search');
      executeSearch(initialQuery, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, 'search');
    }
  }, [initialQuery]);

  // Respond to external Browse Source signals (e.g., clicking "Explorar catálogo" in ExtensionsModal)
  useEffect(() => {
    if (!browseSignal || !browseSignal.sourceId) return;
    const nextMode = browseSignal.mode || 'popular';
    setQuery('');
    setSelectedStatus('all');
    setSelectedDemographic('all');
    setSelectedType('all');
    setIncludedGenres([]);
    setExcludedGenres([]);
    setSelectedSource(browseSignal.sourceId);
    setSourceBrowseMode(nextMode);
    ExtensionService.getSourcesMeta().then(list => {
      if (Array.isArray(list) && list.length > 0) setSourcesList(list);
    }).catch(() => {});
    executeSearch('', [], [], 'all', 'all', 'all', safeSearch, onlyAvailable, browseSignal.sourceId, deepSynopsisSearch, selectedLanguage, nextMode);
  }, [browseSignal?.sourceId, browseSignal?.mode, browseSignal?.nonce]);

  const isCatalogBrowseEligible = (
    searchQuery: string,
    src: string,
    mode: SourceBrowseMode,
    incGenres: string[],
    excGenres: string[],
    stat: string,
    demo: string,
    typ: string
  ) => {
    return (
      src !== 'all' &&
      mode !== 'search' &&
      !searchQuery.trim() &&
      incGenres.length === 0 &&
      excGenres.length === 0 &&
      stat === 'all' &&
      demo === 'all' &&
      typ === 'all'
    );
  };

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
    lang = selectedLanguage,
    browseMode: SourceBrowseMode = sourceBrowseMode
  ) => {
    const seq = ++searchSeqRef.current;
    setLoading(true);
    setLoadingMore(false);
    setSearchPage(1);
    setHasMore(true);

    const effectiveMode: SourceBrowseMode =
      src === 'all' ? 'search' : searchQuery.trim() ? 'search' : browseMode;

    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/search')) {
      const sp = new URLSearchParams();
      if (searchQuery.trim()) sp.set('q', searchQuery.trim());
      if (stat && stat !== 'all') sp.set('status', stat);
      if (demo && demo !== 'all') sp.set('demographic', demo);
      if (typ && typ !== 'all') sp.set('type', typ);
      if (src && src !== 'all') {
        sp.set('source', src);
        if (effectiveMode !== 'search') sp.set('mode', effectiveMode);
      }
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
      if (isCatalogBrowseEligible(searchQuery, src, effectiveMode, incGenres, excGenres, stat, demo, typ)) {
        const catalogRes = await MangaApi.getSourceCatalog(src, {
          mode: effectiveMode === 'latest' ? 'latest' : 'popular',
          page: 1,
          limit: 24,
          includeAdult: !isSafe,
          onlyAvailable: availOnly
        });
        if (searchSeqRef.current !== seq) return;
        const items = catalogRes.data || [];
        setResults(items);
        setSourcesQueried([src]);
        setHasMore(Boolean(catalogRes.hasMore));
        return;
      }

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
        excludedGenres: excGenres,
        demographic: demo === 'all' ? undefined : demo,
        type: typ === 'all' ? undefined : typ,
        status: stat === 'all' ? undefined : stat,
        language: lang && lang !== 'all' ? lang : undefined,
        limit: 36,
        page: 1,
        includeAdult: !isSafe,
        onlyAvailable: availOnly
      });

      if (searchSeqRef.current !== seq) return;

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
      const hasStrictClientFilters = incGenres.length > 0 || excGenres.length > 0;
      if (data.length === 0 || (!hasStrictClientFilters && data.length < 24)) {
        setHasMore(false);
      }
    } catch (err) {
      if (searchSeqRef.current !== seq) return;
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      if (searchSeqRef.current === seq) {
        setLoading(false);
      }
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || loading) return;
    const seqAtStart = searchSeqRef.current;
    setLoadingMore(true);
    const nextPage = searchPage + 1;
    try {
      if (isCatalogBrowseEligible(query, selectedSource, sourceBrowseMode, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType)) {
        const catalogRes = await MangaApi.getSourceCatalog(selectedSource, {
          mode: sourceBrowseMode === 'latest' ? 'latest' : 'popular',
          page: nextPage,
          limit: 24,
          includeAdult: !safeSearch,
          onlyAvailable
        });
        if (searchSeqRef.current !== seqAtStart) return;
        const newItems = catalogRes.data || [];
        if (newItems.length === 0 || !catalogRes.hasMore) {
          setHasMore(false);
        }
        setResults(prev => appendUniqueSearchResults(prev, newItems));
        setSearchPage(nextPage);
        return;
      }

      const primaryGenreEnglish = includedGenres.length > 0
        ? (GENRE_TRANSLATIONS[includedGenres[0].toLowerCase()]?.[0] || includedGenres[0])
        : undefined;

      const activeSources = selectedSource !== 'all' ? [selectedSource] : ExtensionService.getEnabledSourceIds();

      const res = await MangaApi.search(query, {
        source: selectedSource !== 'all' ? selectedSource : undefined,
        sources: activeSources,
        genre: primaryGenreEnglish,
        genres: includedGenres,
        excludedGenres,
        demographic: selectedDemographic === 'all' ? undefined : selectedDemographic,
        type: selectedType === 'all' ? undefined : selectedType,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        language: selectedLanguage && selectedLanguage !== 'all' ? selectedLanguage : undefined,
        limit: 24,
        page: nextPage,
        includeAdult: !safeSearch,
        onlyAvailable: onlyAvailable
      });

      if (searchSeqRef.current !== seqAtStart) return;

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

      const hasStrictClientFilters = includedGenres.length > 0 || excludedGenres.length > 0;
      if (newItems.length === 0 || (!hasStrictClientFilters && newItems.length < 24)) {
        setHasMore(false);
      }
      setResults(prev => appendUniqueSearchResults(prev, newItems));
      setSearchPage(nextPage);
    } catch (err) {
      if (searchSeqRef.current !== seqAtStart) return;
      console.error('Load more failed:', err);
      setHasMore(false);
    } finally {
      if (searchSeqRef.current === seqAtStart) {
        setLoadingMore(false);
      }
    }
  };

  const handleLoadMoreRef = useRef(handleLoadMore);
  handleLoadMoreRef.current = handleLoadMore;

  // IntersectionObserver for seamless Infinite Scroll
  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const target = observerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading && results.length > 0) {
          handleLoadMoreRef.current();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, results.length, searchPage, selectedSource, sourceBrowseMode]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextMode: SourceBrowseMode = query.trim() ? 'search' : sourceBrowseMode;
    if (query.trim() && sourceBrowseMode !== 'search') {
      setSourceBrowseMode('search');
    }
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, nextMode);
  };

  const handleClear = () => {
    setQuery('');
    const nextMode: SourceBrowseMode = selectedSource !== 'all' ? 'popular' : 'search';
    setSourceBrowseMode(nextMode);
    executeSearch('', includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, nextMode);
  };

  const handleStatusSelect = (stat: string) => {
    const nextStat = selectedStatus === stat ? 'all' : stat;
    setSelectedStatus(nextStat);
    executeSearch(query, includedGenres, excludedGenres, nextStat, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, sourceBrowseMode);
  };

  const handleDemographicSelect = (demo: string) => {
    const nextDemo = selectedDemographic === demo ? 'all' : demo;
    setSelectedDemographic(nextDemo);
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, nextDemo, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, sourceBrowseMode);
  };

  const handleTypeSelect = (typ: string) => {
    const nextType = selectedType === typ ? 'all' : typ;
    setSelectedType(nextType);
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, nextType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, sourceBrowseMode);
  };

  const handleSourceSelect = (src: string) => {
    const nextSrc = selectedSource === src ? 'all' : src;
    const nextMode: SourceBrowseMode = nextSrc === 'all' ? 'search' : query.trim() ? 'search' : 'popular';
    setSelectedSource(nextSrc);
    setSourceBrowseMode(nextMode);
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, nextSrc, deepSynopsisSearch, selectedLanguage, nextMode);
  };

  const handleSourceBrowseModeChange = (mode: SourceBrowseMode) => {
    setSourceBrowseMode(mode);
    if (mode !== 'search' && query.trim()) {
      setQuery('');
      executeSearch('', includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, mode);
    } else {
      executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, mode);
    }
  };

  const handleLanguageSelect = (lang: string) => {
    if (lang === selectedLanguageRef.current) return;
    selectedLanguageRef.current = lang;
    setSelectedLanguage(lang);
    setPreferredLanguage(lang);
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, lang, sourceBrowseMode);
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
    executeSearch(query, nextInc, nextExc, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, sourceBrowseMode);
  };

  const handleClearGenres = () => {
    setIncludedGenres([]);
    setExcludedGenres([]);
    executeSearch(query, [], [], selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, sourceBrowseMode);
  };

  const toggleSafeSearch = () => {
    const nextSafe = !safeSearch;
    setSafeSearch(nextSafe);
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, nextSafe, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, sourceBrowseMode);
  };

  const toggleOnlyAvailable = () => {
    const nextAvail = !onlyAvailable;
    setOnlyAvailable(nextAvail);
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, nextAvail, selectedSource, deepSynopsisSearch, selectedLanguage, sourceBrowseMode);
  };

  const toggleDeepSynopsis = () => {
    const nextDeep = !deepSynopsisSearch;
    setDeepSynopsisSearch(nextDeep);
    executeSearch(query, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, nextDeep, selectedLanguage, sourceBrowseMode);
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

  const handleDismissManga = useCallback((m: Manga) => {
    if (isMangaIgnoredRef.current(m) || HistoryService.isIgnored(m.id)) {
      HistoryService.unignoreManga(m.id);
      setDismissToast(prev => (prev?.mangaId === m.id ? null : prev));
      return;
    }
    HistoryService.ignoreManga({
      mangaId: m.id,
      title: m.title,
      altTitles: m.altTitles,
      coverUrl: m.coverUrl,
      sourceId: m.sources?.[0]?.sourceId,
      sourceName: m.sources?.[0]?.sourceName
    });
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setDismissToast({ mangaId: m.id, title: m.title });
    dismissTimerRef.current = setTimeout(() => {
      setDismissToast(null);
    }, 5000);
  }, []);

  const handleQuickRead = useCallback((id: string) => {
    onReadChapter?.(id, '');
  }, [onReadChapter]);

  const handleClearAllFilters = () => {
    setSelectedStatus('all');
    setSelectedDemographic('all');
    setSelectedType('all');
    setSelectedSource('all');
    setSafeSearch(true);
    setOnlyAvailable(true);
    setDeepSynopsisSearch(true);
    setHideLibrary(false);
    setTropeFilter('');
    setTropeCategory('all');
    try {
      localStorage.removeItem('mr_search_hide_library');
    } catch {}
    setIncludedGenres([]);
    setExcludedGenres([]);
    executeSearch(query, [], [], 'all', 'all', 'all', true, true, 'all', true, selectedLanguage, sourceBrowseMode);
  };

  const handleRandomManga = async () => {
    try {
      const latestFavorites = HistoryService.getFavorites();
      const latestIgnored = HistoryService.getIgnoredMangas();
      let chosen = pickSurpriseCandidate(
        [displayedResults, results],
        latestFavorites,
        latestIgnored
      );

      // If current filtered/visible results only contain saved or ignored works, fetch fresh featured works
      if (
        !chosen ||
        checkMangaInFavorites(chosen, latestFavorites)
      ) {
        const featuredPool = await MangaApi.getFeatured().catch(() => []);
        const freshDiscovery = pickSurpriseCandidate(
          [displayedResults, results, featuredPool],
          latestFavorites,
          latestIgnored
        );
        if (freshDiscovery) {
          chosen = freshDiscovery;
        }
      }

      if (!chosen) return;
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

  const SOURCE_OPTIONS = useMemo(() => {
    return [
      { id: 'all', label: 'Todas as Extensões Ativas' },
      ...sourcesList.map(s => ({ id: s.id, label: s.name }))
    ];
  }, [sourcesList]);

  const activeSourceInfo = useMemo(
    () => (selectedSource !== 'all' ? sourcesList.find(s => s.id === selectedSource) : undefined),
    [selectedSource, sourcesList]
  );

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
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border transition-colors cursor-pointer font-medium flex-1 sm:flex-initial min-w-[138px] ${
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
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border transition-colors cursor-pointer font-medium flex-1 sm:flex-initial min-w-[138px] ${
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
                    className={`flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border transition-colors cursor-pointer shrink-0 ${
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
                    className="flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors cursor-pointer shrink-0"
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
                    setSourceBrowseMode('search');
                    executeSearch(term, includedGenres, excludedGenres, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, 'search');
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
            <div className="mt-4 sm:mt-6 max-w-3xl mx-auto p-3.5 sm:p-6 rounded-2xl bg-zinc-950/[0.98] border border-zinc-800 shadow-2xl animate-in fade-in zoom-in-95 duration-150 space-y-4 sm:space-y-5">
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
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
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
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
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
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
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
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
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
              <div className="space-y-2.5 pt-3 border-t border-zinc-850">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-medium text-rose-300">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-rose-400" />
                      <span>Subgêneros & Tropes ({SPECIFIC_TROPES.length}):</span>
                    </div>
                    <span className="hidden sm:inline text-[10px] text-zinc-500 font-normal">
                      (1 clique = Incluir <span className="text-emerald-400 font-bold">+</span> | 2 cliques = Excluir <span className="text-rose-400 font-bold">-</span>)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <div className="relative">
                      <Search className="h-3 w-3 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={tropeFilter}
                        onChange={(e) => setTropeFilter(e.target.value)}
                        placeholder="Filtrar tag..."
                        className="w-32 sm:w-40 pl-7 pr-6 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-rose-500/60"
                      />
                      {tropeFilter && (
                        <button
                          type="button"
                          onClick={() => setTropeFilter('')}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 cursor-pointer"
                          aria-label="Limpar filtro de subgêneros"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {(includedGenres.some(g => SPECIFIC_TROPES.some(t => t.id === g)) || excludedGenres.some(g => SPECIFIC_TROPES.some(t => t.id === g))) && (
                      <button
                        type="button"
                        onClick={() => {
                          const remInc = includedGenres.filter(g => !SPECIFIC_TROPES.some(t => t.id === g));
                          const remExc = excludedGenres.filter(g => !SPECIFIC_TROPES.some(t => t.id === g));
                          setIncludedGenres(remInc);
                          setExcludedGenres(remExc);
                          executeSearch(query, remInc, remExc, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, sourceBrowseMode);
                        }}
                        className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer shrink-0"
                      >
                        Limpar Tropes
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
                  {TROPE_CATEGORIES.map(cat => {
                    const count = tropeCategoryCounts.get(cat.id) || 0;
                    const active = tropeCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setTropeCategory(cat.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
                          active
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                            : 'bg-zinc-900/70 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        {cat.label} <span className="opacity-65">({count})</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 max-h-64 overflow-y-auto pr-1">
                  {filteredSpecificTropes.map((trope) => {
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
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                          isInc
                            ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200 font-semibold shadow-sm ring-1 ring-emerald-500/30'
                            : isExc
                            ? 'bg-rose-500/25 border-rose-500/70 text-rose-200 font-semibold shadow-sm line-through decoration-rose-400'
                            : 'bg-zinc-900/90 border-zinc-700/80 text-zinc-300 hover:text-rose-300 hover:border-rose-500/50'
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
                        executeSearch(query, remInc, remExc, selectedStatus, selectedDemographic, selectedType, safeSearch, onlyAvailable, selectedSource, deepSynopsisSearch, selectedLanguage, sourceBrowseMode);
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
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
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
        {/* Mihon-style Browse Source Header Bar (when exploring a single extension) */}
        {selectedSource !== 'all' && (
          <div className="mb-5 p-3.5 sm:p-4 rounded-xl bg-zinc-900/65 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 shrink-0">
                <Compass className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-zinc-100 truncate">
                    {activeSourceInfo?.name || sourceLabel(selectedSource)}
                  </span>
                  {activeSourceInfo?.isDynamic && (
                    <>
                      <span aria-hidden="true" className="text-zinc-700">·</span>
                      <span className="text-xs text-zinc-400">
                        Template {activeSourceInfo.template === 'themesia' ? 'Themesia' : activeSourceInfo.template === 'custom_html' ? 'Custom' : 'Madara'}
                      </span>
                    </>
                  )}
                  {activeSourceInfo?.languages && activeSourceInfo.languages.length > 0 && (
                    <>
                      <span aria-hidden="true" className="text-zinc-700">·</span>
                      <span className="text-xs font-mono text-zinc-400">
                        {activeSourceInfo.languages.join(', ')}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-zinc-400 truncate">
                  {sourceBrowseMode === 'latest'
                    ? 'Exibindo os últimos lançamentos publicados diretamente nesta fonte'
                    : sourceBrowseMode === 'popular'
                    ? 'Explorando o catálogo mais popular diretamente nesta extensão'
                    : 'Pesquisando e filtrando dentro desta fonte'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="inline-flex items-center p-1 rounded-xl bg-zinc-950 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => handleSourceBrowseModeChange('popular')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    sourceBrowseMode === 'popular'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Flame className="h-3.5 w-3.5 text-rose-400" />
                  <span>Populares</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSourceBrowseModeChange('latest')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    sourceBrowseMode === 'latest'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Clock className="h-3.5 w-3.5 text-sky-400" />
                  <span>Últimos</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSourceBrowseModeChange('search')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    sourceBrowseMode === 'search'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Search className="h-3.5 w-3.5 text-zinc-300" />
                  <span>Busca</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleSourceSelect('all')}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
                title="Voltar à busca global em todas as fontes"
              >
                Todas as fontes
              </button>
            </div>
          </div>
        )}

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
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/40 transition-colors cursor-pointer"
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
                      className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-colors cursor-pointer"
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
                  onQuickRead={handleQuickRead}
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
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md bg-zinc-900/[0.98] border border-zinc-700/80 rounded-2xl px-3.5 py-2.5 shadow-2xl flex items-center justify-between gap-3">
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
                              decoding="async"
                              loading="lazy"
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
