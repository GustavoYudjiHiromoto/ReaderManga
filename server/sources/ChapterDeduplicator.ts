import { Chapter, ChapterVariant } from '../../src/types/manga.js';

export function normalizeChapterNumber(numStr: string): string {
  if (!numStr) return '0';
  const trimmed = numStr.trim();
  const parsed = parseFloat(trimmed);
  if (!isNaN(parsed)) {
    return String(parsed);
  }
  return trimmed;
}

export function detectEdition(title?: string, extra?: string): string {
  const combined = `${title || ''} ${extra || ''}`.toLowerCase();
  if (combined.includes('fan-color') || combined.includes('fan colored')) return 'fan-colored';
  if (combined.includes('digital color') || combined.includes('official color') || combined.includes('colored') || combined.includes('colorida')) return 'colored';
  if (combined.includes('oneshot') || combined.includes('one-shot')) return 'oneshot';
  if (combined.includes('omake') || combined.includes('extra') || combined.includes('special') || combined.includes('gaiden')) return 'special';
  return 'standard';
}

export function areTitlesEquivalent(t1?: string, t2?: string): boolean {
  if (!t1 || !t2) return true;
  const clean1 = t1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const clean2 = t2.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean1 || !clean2) return true;
  if (clean1 === clean2) return true;
  if (clean1.includes(clean2) || clean2.includes(clean1)) return true;

  // Check word overlap for differing translations of the same chapter title
  const words1 = new Set(t1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(t2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  let common = 0;
  for (const w of words1) {
    if (words2.has(w)) common++;
  }
  const minWords = Math.min(words1.size, words2.size);
  if (minWords > 0 && (common / minWords) >= 0.4) {
    return true;
  }

  // If one title is simply a generic number label (e.g. "Chapter 200"), treat as compatible
  if (/^(chapter|capítulo|cap|ep|episode)\s*\d+/i.test(t1.trim()) || /^(chapter|capítulo|cap|ep|episode)\s*\d+/i.test(t2.trim())) {
    return true;
  }

  return false;
}

export function areChaptersEquivalent(ch1: Chapter, ch2: Chapter): boolean {
  // 1. Language must strictly match: pt-br and en are never considered duplicate
  const l1 = (ch1.language || 'en').toLowerCase().trim();
  const l2 = (ch2.language || 'en').toLowerCase().trim();
  if (l1 !== l2) return false;

  // 2. Chapter number must match
  const n1 = normalizeChapterNumber(ch1.chapterNumber);
  const n2 = normalizeChapterNumber(ch2.chapterNumber);
  if (n1 !== n2) return false;

  // 3. Edition must match (e.g. colored edition is not duplicate of black & white)
  const ed1 = detectEdition(ch1.title, ch1.edition);
  const ed2 = detectEdition(ch2.title, ch2.edition);
  if (ed1 !== ed2) return false;

  // 4. Volume: if both specify differing non-zero volumes, preserve distinctness
  if (ch1.volume && ch2.volume && ch1.volume !== ch2.volume) {
    return false;
  }

  // 5. Title compatibility
  return areTitlesEquivalent(ch1.title, ch2.title);
}

const SOURCE_PRIORITY: Record<string, number> = {
  mangapill: 8,
  weebcentral: 8,
  mangadex: 6,
  comick: 4
};

export function calculateChapterScore(ch: Chapter): number {
  let score = SOURCE_PRIORITY[ch.sourceId] || 2;
  if (ch.pagesCount && ch.pagesCount > 0) score += 3;
  if (ch.title && !/^(chapter|capítulo|cap)\s*\d+$/i.test(ch.title.trim())) score += 2;
  if (ch.releaseDate) score += 1;
  return score;
}

function getSourceName(sourceId: string): string {
  switch (sourceId) {
    case 'mangapill': return 'MangaPill';
    case 'weebcentral': return 'WeebCentral';
    case 'mangadex': return 'MangaDex';
    case 'comick': return 'Comick';
    default: return sourceId;
  }
}

/**
 * Deduplicates and groups equivalent chapters.
 * Preserves distinct languages and editions, while collapsing redundant scanlations
 * or cross-source clones into a clean primary chapter with accessible variants.
 */
export function deduplicateAndGroupChapters(chapters: Chapter[]): Chapter[] {
  const result: Chapter[] = [];

  for (const ch of chapters) {
    const existingIndex = result.findIndex(r => areChaptersEquivalent(r, ch));

    if (existingIndex === -1) {
      result.push({
        ...ch,
        variants: ch.variants ? [...ch.variants] : []
      });
    } else {
      const existing = result[existingIndex];
      const existingScore = calculateChapterScore(existing);
      const newScore = calculateChapterScore(ch);

      const variantToAdd: ChapterVariant = {
        id: ch.id,
        sourceId: ch.sourceId,
        sourceName: getSourceName(ch.sourceId),
        externalChapterId: ch.externalChapterId,
        title: ch.title,
        scanlationGroup: ch.scanlationGroup,
        releaseDate: ch.releaseDate,
        pagesCount: ch.pagesCount,
        language: ch.language,
        edition: ch.edition || detectEdition(ch.title)
      };

      if (newScore > existingScore) {
        // ch becomes the primary, existing becomes a variant
        const oldPrimaryAsVariant: ChapterVariant = {
          id: existing.id,
          sourceId: existing.sourceId,
          sourceName: getSourceName(existing.sourceId),
          externalChapterId: existing.externalChapterId,
          title: existing.title,
          scanlationGroup: existing.scanlationGroup,
          releaseDate: existing.releaseDate,
          pagesCount: existing.pagesCount,
          language: existing.language,
          edition: existing.edition || detectEdition(existing.title)
        };

        const existingVariants = existing.variants || [];
        // Avoid duplicate variant IDs
        const combinedVariants = [oldPrimaryAsVariant, ...existingVariants].filter(
          v => v.id !== ch.id && v.externalChapterId !== ch.externalChapterId
        );

        result[existingIndex] = {
          ...ch,
          title: ch.title || existing.title,
          volume: ch.volume || existing.volume,
          pagesCount: ch.pagesCount || existing.pagesCount,
          scanlationGroup: ch.scanlationGroup || existing.scanlationGroup,
          variants: combinedVariants
        };
      } else {
        // existing remains primary, ch is added as variant
        if (!existing.variants) existing.variants = [];
        const alreadyHasVariant = existing.variants.some(
          v => v.id === ch.id || (v.sourceId === ch.sourceId && v.externalChapterId === ch.externalChapterId)
        );
        if (!alreadyHasVariant) {
          existing.variants.push(variantToAdd);
        }
        // Enrich existing if it was missing title or pagesCount
        if (!existing.title && ch.title) existing.title = ch.title;
        if (!existing.pagesCount && ch.pagesCount) existing.pagesCount = ch.pagesCount;
        if (!existing.volume && ch.volume) existing.volume = ch.volume;
      }
    }
  }

  return result;
}
