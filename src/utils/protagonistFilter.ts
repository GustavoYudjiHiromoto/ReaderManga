import { Manga } from '../types/manga.js';

export type ProtagonistGender = 'all' | 'female' | 'male';

const FEMALE_EXACT_TAGS = new Set([
  'female protagonist',
  'villainess',
  'magical girls',
  'mahou shoujo',
  "girls' love",
  'girls love',
  'yuri',
  'shoujo ai',
  'shoujo-ai',
  'baihe',
  'reverse harem',
  'otome',
  'otome game',
  'cgdct',
  'gyaru',
  'loli',
  'idols (female)'
]);

const MALE_EXACT_TAGS = new Set([
  'male protagonist',
  'shota',
  'shouta',
  "boys' love",
  'boys love',
  'yaoi',
  'shounen ai',
  'shounen-ai',
  'danmei',
  'idols (male)'
]);

const FEMALE_PHRASE_PATTERNS: RegExp[] = [
  /\b(?:female protagonist|female lead|heroine|villainess|otome game|magical girl|mahou shoujo|office lady|high school girl|schoolgirl|middle school girl)\b/i,
  /\b(?:reincarnated|reborn|transmigrated)\s+as\s+(?:a|the)\s+(?:girl|lady|woman|daughter|princess|duchess|saintess|villainess|empress|queen|maid|witch)\b/i,
  /\b(?:a|one)\s+(?:young\s+)?girl\s+named\b/i,
  /\b(?:she\s+(?:is|was|has|had|finds|must|decides|discovers|awakens|wants|tries|starts|becomes|lives|works|falls))\b/i,
  /\b(?:her\s+(?:life|family|husband|fianc[eé]|father|mother|sister|brother|power|magic|past|dream|body|fate))\b/i,
  /\b(?:protagonista feminina|hero[ií]na|vil[aã]|uma garota|uma jovem|uma menina|uma mulher|ela\s+(?:[eé]|foi|era|tem|decide|descobre|precisa|vive|acaba))\b/i
];

const MALE_PHRASE_PATTERNS: RegExp[] = [
  /\b(?:male protagonist|male lead|salaryman|high school boy|schoolboy|young master|young lord|swordsman|demon king|demon lord)\b/i,
  /\b(?:reincarnated|reborn|transmigrated)\s+as\s+(?:a|the)\s+(?:boy|man|guy|son|prince|king|emperor|duke|lord|knight|hero|goblin|slime)\b/i,
  /\b(?:a|one)\s+(?:young\s+)?(?:boy|man|guy)\s+named\b/i,
  /\b(?:he\s+(?:is|was|has|had|finds|must|decides|discovers|awakens|wants|tries|starts|becomes|lives|works|falls))\b/i,
  /\b(?:his\s+(?:life|family|wife|fianc[eé]e|father|mother|sister|brother|power|sword|magic|past|dream|body|skill|fate))\b/i,
  /\b(?:protagonista masculino|um garoto|um jovem|um rapaz|um menino|um homem|ele\s+(?:[eé]|foi|era|tem|decide|descobre|precisa|vive|acaba))\b/i
];

const FEMALE_TITLE_PATTERNS: RegExp[] = [
  /\b(?:villainess|princess|duchess|saintess|empress|queen|witch|girl|lady|maiden|daughter|wife|bride|sister|mother|gyaru|ojou|reijou|shojo|shoujo|vil[aã]|princesa|duquesa|imperatriz|garota|menina)\b/i
];

const MALE_TITLE_PATTERNS: RegExp[] = [
  /\b(?:boy|prince|king|emperor|lord|knight|swordsman|uncle|father|husband|brother|shota|hero|garoto|menino|pr[ií]ncipe|cavaleiro)\b/i
];

function countMatches(text: string, regex: RegExp): number {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Classifies likely protagonist gender ('female' | 'male' | 'unknown') using:
 * 1. Explicit genres/tags (highest weight)
 * 2. Synopsis lead patterns & pronoun balance (EN + PT-BR)
 * 3. Title/altTitle signals
 * 4. Publication demographic as a gentle tie-breaker only
 */
export function classifyProtagonistGender(manga: Manga): 'female' | 'male' | 'unknown' {
  if (!manga) return 'unknown';

  let femaleScore = 0;
  let maleScore = 0;

  const genresLower = (manga.genres || []).map(g => g.toLowerCase().trim());
  const hasReverseHarem = genresLower.some(g => g.includes('reverse harem') || g.includes('harem invertido'));

  for (const g of genresLower) {
    if (FEMALE_EXACT_TAGS.has(g)) {
      femaleScore += 10;
    } else if (MALE_EXACT_TAGS.has(g)) {
      maleScore += 10;
    } else if (g === 'harem' && !hasReverseHarem) {
      // Standard "Harem" tag strongly correlates with male MC unless Reverse Harem is also present
      maleScore += 7;
    }
  }

  const titleBundle = `${manga.title || ''} ${(manga.altTitles || []).slice(0, 4).join(' ')}`;
  for (const pat of FEMALE_TITLE_PATTERNS) {
    if (pat.test(titleBundle)) femaleScore += 3;
  }
  for (const pat of MALE_TITLE_PATTERNS) {
    if (pat.test(titleBundle)) maleScore += 3;
  }

  const synopsis = manga.synopsis && manga.synopsis !== 'Sinopse não disponível.'
    ? manga.synopsis
    : '';

  if (synopsis) {
    for (const pat of FEMALE_PHRASE_PATTERNS) {
      if (pat.test(synopsis)) femaleScore += 5;
    }
    for (const pat of MALE_PHRASE_PATTERNS) {
      if (pat.test(synopsis)) maleScore += 5;
    }

    // Pronoun balance across EN and PT-BR synopses
    const enFemalePronouns = countMatches(synopsis, /\b(?:she|her|hers|herself)\b/gi);
    const enMalePronouns = countMatches(synopsis, /\b(?:he|him|his|himself)\b/gi);
    const ptFemalePronouns = countMatches(synopsis, /\b(?:ela|dela|a protagonista|a garota)\b/gi);
    const ptMalePronouns = countMatches(synopsis, /\b(?:ele|dele|o protagonista|o garoto)\b/gi);

    const femalePronouns = enFemalePronouns + ptFemalePronouns;
    const malePronouns = enMalePronouns + ptMalePronouns;

    if (femalePronouns > malePronouns) {
      femaleScore += Math.min(6, (femalePronouns - malePronouns) * 1.5);
    } else if (malePronouns > femalePronouns) {
      maleScore += Math.min(6, (malePronouns - femalePronouns) * 1.5);
    }
  }

  // Gentle demographic prior (never overrides strong synopsis/tag evidence)
  const demo = (manga.publicationInfo?.demographic || '').toLowerCase();
  if (demo === 'shoujo' || demo === 'josei' || genresLower.includes('shoujo') || genresLower.includes('josei')) {
    femaleScore += 1.5;
  } else if (demo === 'shounen' || demo === 'seinen' || genresLower.includes('shounen') || genresLower.includes('seinen')) {
    maleScore += 1.5;
  }

  if (femaleScore === 0 && maleScore === 0) return 'unknown';
  if (femaleScore > maleScore + 0.5) return 'female';
  if (maleScore > femaleScore + 0.5) return 'male';
  return 'unknown';
}

export function matchesProtagonistGender(manga: Manga, target: ProtagonistGender): boolean {
  if (target === 'all') return true;
  return classifyProtagonistGender(manga) === target;
}
