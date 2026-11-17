import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Search,
  Check,
  Sparkles,
  BookOpen
} from 'lucide-react';
import { Chapter, FavoriteManga, Manga } from '../types/manga.js';
import { MangaApi } from '../services/api.js';
import { HistoryService } from '../services/history.js';
import { extractFavoriteSourceId } from './BatchMigrationModal.js';

interface DuplicateFavoritesModalProps {
  isOpen: boolean;
  onClose: () => void;
  favorites: FavoriteManga[];
  onMerged?: (summary: { mergedGroups: number; removedEntries: number }) => void;
}

export interface DuplicateGroup {
  id: string;
  reason: 'exact_title' | 'alt_title' | 'substring_match' | 'verified_source';
  reasonLabel: string;
  items: FavoriteManga[];
  recommendedPrimaryId: string;
}

interface EnrichedFavMeta {
  altTitles: string[];
  authors?: string[];
  synopsis?: string;
}

const STOP_STEMS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'your', 'our',
  'manga', 'webtoon', 'comic', 'story', 'tales', 'world', 'life', 'days',
  'girl', 'girls', 'boy', 'boys', 'king', 'queen', 'lord', 'lady', 'hero',
  'villain', 'villainess', 'saint', 'magic', 'magical', 'fantasy', 'isekai',
  'reincarnated', 'reincarnation', 'level', 'leveling', 'part', 'season',
  'volume', 'edition', 'special', 'official', 'colored', 'color', 'chronicles',
  'adventure', 'adventures', 'academy', 'school', 'high', 'highschool',
  'about', 'being', 'became', 'become', 'after', 'before', 'until', 'since',
  'when', 'where', 'what', 'which', 'cant', 'dont', 'wont', 'isnt',
  'san', 'kun', 'chan', 'sama', 'desu', 'sore', 'kono', 'ano', 'boku', 'watashi',
  'ore', 'kimi', 'tachi', 'kara', 'made', 'yori', 'dake', 'nado', 'tame', 'nara'
]);

const SOURCE_PRIORITY: Record<string, number> = {
  comick: 8,
  mangadex: 7,
  weebcentral: 6,
  mangafire: 5,
  mangaball: 4,
  mangapill: 3
};

function stripFavEditionTags(t: string): string {
  return (t || '')
    .replace(/\((?:official|colored|full\s*color|digital|webtoon|manga|uncensored|simulpub|pt-br|en)\)/gi, '')
    .replace(/\[(?:official|colored|pt-br|en|br|eng)\]/gi, '')
    .trim();
}

export function normalizeFavTitle(t: string): string {
  if (!t) return '';
  return stripFavEditionTags(t)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeSpacedWords(t: string): string {
  if (!t) return '';
  return stripFavEditionTags(t)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getAllTitles(fav: FavoriteManga, enriched?: EnrichedFavMeta): string[] {
  return Array.from(
    new Set([fav.title, ...(fav.altTitles || []), ...(enriched?.altTitles || [])].filter(Boolean))
  );
}

export function matchFavoritesPair(
  a: FavoriteManga,
  b: FavoriteManga,
  enrichedMap?: Record<string, EnrichedFavMeta>
): { matched: boolean; reason: DuplicateGroup['reason']; reasonLabel: string } {
  if (a.mangaId === b.mangaId) {
    return { matched: false, reason: 'exact_title', reasonLabel: '' };
  }

  const normA = normalizeFavTitle(a.title);
  const normB = normalizeFavTitle(b.title);

  if (normA.length >= 3 && normB.length >= 3 && normA === normB) {
    return { matched: true, reason: 'exact_title', reasonLabel: 'Título idêntico em fontes diferentes' };
  }

  const altsA = Array.from(
    new Set([...(a.altTitles || []), ...(enrichedMap?.[a.mangaId]?.altTitles || [])])
  )
    .map(normalizeFavTitle)
    .filter(s => s.length >= 3);

  const altsB = Array.from(
    new Set([...(b.altTitles || []), ...(enrichedMap?.[b.mangaId]?.altTitles || [])])
  )
    .map(normalizeFavTitle)
    .filter(s => s.length >= 3);

  const hasEnriched = Boolean(enrichedMap?.[a.mangaId] || enrichedMap?.[b.mangaId]);

  if (normB.length >= 4 && altsA.includes(normB)) {
    return {
      matched: true,
      reason: hasEnriched ? 'verified_source' : 'alt_title',
      reasonLabel: 'Título alternativo confirmado entre fontes'
    };
  }
  if (normA.length >= 4 && altsB.includes(normA)) {
    return {
      matched: true,
      reason: hasEnriched ? 'verified_source' : 'alt_title',
      reasonLabel: 'Título alternativo confirmado entre fontes'
    };
  }

  for (const altA of altsA) {
    if (altA.length >= 5 && altsB.includes(altA)) {
      return {
        matched: true,
        reason: hasEnriched ? 'verified_source' : 'alt_title',
        reasonLabel: 'Mesma obra por título alternativo em comum'
      };
    }
  }

  // Romaji particle tolerance
  const romajiLoose = (s: string) => s.replace(/wo/g, 'o').replace(/ou/g, 'o');
  const looseA = [normA, ...altsA].filter(s => s.length >= 12).map(romajiLoose);
  const looseB = [normB, ...altsB].filter(s => s.length >= 12).map(romajiLoose);
  for (const r of looseA) {
    if (looseB.includes(r)) {
      return {
        matched: true,
        reason: 'alt_title',
        reasonLabel: 'Título idêntico (variação de romanização)'
      };
    }
  }

  // Word-boundary multi-word containment (e.g. "Beast Tamer" inside "Yuusha Party wo Tsuihou Sareta Beast Tamer, ...")
  const titlesA = getAllTitles(a, enrichedMap?.[a.mangaId]);
  const titlesB = getAllTitles(b, enrichedMap?.[b.mangaId]);
  for (const tA of titlesA) {
    for (const tB of titlesB) {
      const sA = normalizeSpacedWords(tA);
      const sB = normalizeSpacedWords(tB);
      if (!sA || !sB) continue;
      const shorter = sA.length <= sB.length ? sA : sB;
      const longer = sA.length <= sB.length ? sB : sA;
      const shorterCompact = shorter.replace(/\s+/g, '');
      const shorterWords = shorter.split(' ').filter(Boolean);
      if (shorterWords.length >= 2 && shorterCompact.length >= 9) {
        if (` ${longer} `.includes(` ${shorter} `)) {
          return {
            matched: true,
            reason: 'substring_match',
            reasonLabel: 'Mesmo subtítulo/nome em inglês e japonês'
          };
        }
      }
    }
  }

  return { matched: false, reason: 'exact_title', reasonLabel: '' };
}

function getDistinctiveTokens(title: string): string[] {
  return normalizeSpacedWords(title)
    .split(' ')
    .filter(tok => tok.length >= 4 && !STOP_STEMS.has(tok) && !/^\d+$/.test(tok));
}

export function findSuspectedCandidateIds(
  favorites: FavoriteManga[],
  alreadyGroupedIds: Set<string>
): string[] {
  const tokenOwners = new Map<string, FavoriteManga[]>();

  for (const fav of favorites) {
    const tokens = getDistinctiveTokens(fav.title);
    for (const tok of tokens) {
      const arr = tokenOwners.get(tok) || [];
      arr.push(fav);
      tokenOwners.set(tok, arr);
    }
  }

  const candidateIds = new Set<string>();
  tokenOwners.forEach((owners) => {
    if (owners.length >= 2 && owners.length <= 5) {
      // At least two entries from different sources sharing a distinctive token (e.g. "komi")
      const distinctSources = new Set(owners.map(o => extractFavoriteSourceId(o)));
      if (distinctSources.size >= 2) {
        for (const o of owners) {
          if (!alreadyGroupedIds.has(o.mangaId)) {
            candidateIds.add(o.mangaId);
          }
        }
      }
    }
  });

  return Array.from(candidateIds);
}

function pickRecommendedPrimaryId(items: FavoriteManga[]): string {
  const historyMap = new Map(
    HistoryService.getHistory().map(h => [h.mangaId, parseFloat(h.chapterNumber || '0') || 0])
  );

  let best = items[0];
  let bestScore = -Infinity;

  for (const item of items) {
    let score = 0;
    const chProgress = historyMap.get(item.mangaId) || 0;
    if (chProgress > 0) score += 50 + Math.min(chProgress / 100, 20);
    if (typeof item.userScore === 'number') score += 20;
    if (item.userNotes?.trim()) score += 15;
    score += (item.customCollections?.length || 0) * 8;
    const sid = extractFavoriteSourceId(item);
    score += SOURCE_PRIORITY[sid] || 1;
    if (item.authors?.length && !item.authors.includes('Coleção')) score += 3;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return best.mangaId;
}

export function detectDuplicateFavoriteGroups(
  favorites: FavoriteManga[],
  enrichedMap?: Record<string, EnrichedFavMeta>
): DuplicateGroup[] {
  const n = favorites.length;
  if (n < 2) return [];

  const parent = Array.from({ length: n }, (_, i) => i);
  const reasonByRoot = new Map<number, { reason: DuplicateGroup['reason']; reasonLabel: string }>();

  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };

  const union = (i: number, j: number, reason: DuplicateGroup['reason'], reasonLabel: string) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) {
      parent[rj] = ri;
      if (!reasonByRoot.has(ri)) {
        reasonByRoot.set(ri, { reason, reasonLabel });
      }
    }
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const m = matchFavoritesPair(favorites[i], favorites[j], enrichedMap);
      if (m.matched) {
        union(i, j, m.reason, m.reasonLabel);
      }
    }
  }

  const buckets = new Map<number, FavoriteManga[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = buckets.get(root) || [];
    list.push(favorites[i]);
    buckets.set(root, list);
  }

  const groups: DuplicateGroup[] = [];
  buckets.forEach((items, root) => {
    if (items.length >= 2) {
      const meta = reasonByRoot.get(root) || {
        reason: 'exact_title' as const,
        reasonLabel: 'Possível duplicata encontrada'
      };
      groups.push({
        id: items.map(x => x.mangaId).sort().join('::'),
        reason: meta.reason,
        reasonLabel: meta.reasonLabel,
        items,
        recommendedPrimaryId: pickRecommendedPrimaryId(items)
      });
    }
  });

  return groups;
}

async function fetchWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
  ]);
}

export const DuplicateFavoritesModal: React.FC<DuplicateFavoritesModalProps> = ({
  isOpen,
  onClose,
  favorites,
  onMerged
}) => {
  const [enrichedMap, setEnrichedMap] = useState<Record<string, EnrichedFavMeta>>({});
  const [selectedPrimaryMap, setSelectedPrimaryMap] = useState<Record<string, string>>({});
  const [includedGroupIds, setIncludedGroupIds] = useState<Record<string, boolean>>({});
  const [isScanningSources, setIsScanningSources] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [isDeepScanned, setIsDeepScanned] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<{ mergedGroups: number; removedEntries: number } | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const runTokenRef = useRef(0);
  const autoCheckedSuspectsRef = useRef(false);

  const groups = useMemo(
    () => detectDuplicateFavoriteGroups(favorites, enrichedMap),
    [favorites, enrichedMap]
  );

  // Keep selected primary & checkbox map synced with discovered groups
  useEffect(() => {
    setSelectedPrimaryMap(prev => {
      const next = { ...prev };
      for (const g of groups) {
        if (!next[g.id] || !g.items.some(it => it.mangaId === next[g.id])) {
          next[g.id] = g.recommendedPrimaryId;
        }
      }
      return next;
    });
    setIncludedGroupIds(prev => {
      const next = { ...prev };
      for (const g of groups) {
        if (next[g.id] === undefined) {
          next[g.id] = true;
        }
      }
      return next;
    });
  }, [groups]);

  const runSourceVerification = async (targetFavs: FavoriteManga[], markDeep = false) => {
    if (targetFavs.length === 0) return;
    const token = ++runTokenRef.current;
    setIsScanningSources(true);
    setScanProgress({ done: 0, total: targetFavs.length });

    const chunkSize = 15;
    let done = 0;

    for (let i = 0; i < targetFavs.length; i += chunkSize) {
      if (runTokenRef.current !== token) return;
      const chunk = targetFavs.slice(i, i + chunkSize);
      try {
        const resolved = await fetchWithTimeout(
          MangaApi.resolveLibraryTitles(
            chunk.map(f => ({ mangaId: f.mangaId, title: f.title }))
          ),
          12000
        );
        if (runTokenRef.current !== token) return;
        setEnrichedMap(prev => {
          const next = { ...prev };
          for (const fav of chunk) {
            const info = resolved[fav.mangaId];
            if (info) {
              next[fav.mangaId] = {
                altTitles: Array.isArray(info.altTitles) ? info.altTitles : [],
                authors: info.authors
              };
            }
          }
          return next;
        });
        HistoryService.enrichFavoritesMetadata(resolved);
      } catch {
        // Fallback per-item for resilience if batch call fails
        for (const fav of chunk) {
          if (runTokenRef.current !== token) return;
          try {
            const details: Manga = await fetchWithTimeout(MangaApi.getMangaDetails(fav.mangaId), 4500);
            if (runTokenRef.current !== token) return;
            const alts = Array.isArray(details.altTitles) ? details.altTitles : [];
            setEnrichedMap(prev => ({
              ...prev,
              [fav.mangaId]: { altTitles: alts, authors: details.authors, synopsis: details.synopsis }
            }));
            HistoryService.enrichFavoritesMetadata({
              [fav.mangaId]: { altTitles: alts, authors: details.authors }
            });
          } catch {
            // Skip unreachable entry
          }
        }
      } finally {
        done = Math.min(targetFavs.length, done + chunk.length);
        if (runTokenRef.current === token) {
          setScanProgress({ done, total: targetFavs.length });
        }
      }
    }

    if (runTokenRef.current === token) {
      setIsScanningSources(false);
      if (markDeep) setIsDeepScanned(true);
    }
  };

  // On modal open: reset status and automatically resolve missing altTitles across library (catches both Komi-style stems AND 0-word-overlap EN/JP pairs)
  useEffect(() => {
    if (!isOpen) {
      runTokenRef.current++;
      autoCheckedSuspectsRef.current = false;
      return;
    }

    setMergeResult(null);
    setMergeError(null);
    setIsDeepScanned(false);

    if (!autoCheckedSuspectsRef.current) {
      autoCheckedSuspectsRef.current = true;
      const missingMeta = favorites.filter(
        f => (!f.altTitles || f.altTitles.length === 0) && !enrichedMap[f.mangaId]
      );
      if (missingMeta.length > 0) {
        void runSourceVerification(missingMeta, false);
      }
    }
  }, [isOpen]);

  const handleDeepScan = () => {
    const targets = favorites.filter(f => !enrichedMap[f.mangaId] || (f.altTitles?.length || 0) < 2);
    void runSourceVerification(targets.length > 0 ? targets : favorites, true);
  };

  const selectedGroups = groups.filter(g => includedGroupIds[g.id] !== false);

  const handleMergeSelected = async () => {
    if (selectedGroups.length === 0 || isMerging) return;
    setIsMerging(true);
    setMergeError(null);

    let mergedGroupsCount = 0;
    let removedEntriesCount = 0;

    try {
      for (const group of selectedGroups) {
        const primaryId = selectedPrimaryMap[group.id] || group.recommendedPrimaryId;
        const primaryFav = group.items.find(it => it.mangaId === primaryId) || group.items[0];
        const duplicates = group.items.filter(it => it.mangaId !== primaryFav.mangaId);
        if (duplicates.length === 0) continue;

        // Collect all altTitles and richer metadata across the whole group so "Ocultar Salvos" matches every title variant
        const combinedAlts = Array.from(
          new Set(
            group.items.flatMap(it => [
              it.title,
              ...(it.altTitles || []),
              ...(enrichedMap[it.mangaId]?.altTitles || [])
            ])
          )
        ).filter(t => t && t !== primaryFav.title);

        const primaryEnriched = enrichedMap[primaryFav.mangaId];
        const fallbackAuthors =
          primaryFav.authors?.length && !primaryFav.authors.includes('Coleção')
            ? primaryFav.authors
            : primaryEnriched?.authors?.length
            ? primaryEnriched.authors
            : group.items.find(it => it.authors?.length && !it.authors.includes('Coleção'))?.authors;

        // Best-effort fetch of target chapters once for chapter read-mark transfer
        let targetChapters: Chapter[] = [];
        try {
          targetChapters = await fetchWithTimeout(MangaApi.getChapters(primaryFav.mangaId), 4000);
        } catch {
          targetChapters = [];
        }

        // Track highest reading progress across all items in the group so merging never downgrades progress
        const historyList = HistoryService.getHistory();
        const primaryProg = historyList.find(h => h.mangaId === primaryFav.mangaId);
        let bestProgNum = primaryProg?.chapterNumber ? parseFloat(primaryProg.chapterNumber) || 0 : 0;

        for (const dup of duplicates) {
          let dupChapters: Chapter[] = [];
          try {
            dupChapters = await fetchWithTimeout(MangaApi.getChapters(dup.mangaId), 3500);
          } catch {
            dupChapters = [];
          }

          const currentFavorites = HistoryService.getFavorites();
          const currentPrimary = currentFavorites.find(f => f.mangaId === primaryFav.mangaId) || primaryFav;
          const preservedCategory = currentPrimary.userCategory || dup.userCategory;
          const preservedScore = currentPrimary.userScore ?? dup.userScore;
          const preservedNotes = currentPrimary.userNotes?.trim()
            ? currentPrimary.userNotes
            : dup.userNotes;
          const dupProg = HistoryService.getHistory().find(h => h.mangaId === dup.mangaId);
          const dupProgNum = dupProg?.chapterNumber ? parseFloat(dupProg.chapterNumber) || 0 : 0;

          HistoryService.migrateMangaData(
            dup.mangaId,
            {
              mangaId: currentPrimary.mangaId,
              title: currentPrimary.title,
              coverUrl: currentPrimary.coverUrl || dup.coverUrl,
              sourceId: extractFavoriteSourceId(currentPrimary),
              sourceName: currentPrimary.sourceName,
              rating: currentPrimary.rating ?? dup.rating,
              authors: fallbackAuthors,
              genres: currentPrimary.genres?.length ? currentPrimary.genres : dup.genres,
              status: currentPrimary.status || dup.status,
              synopsis: currentPrimary.synopsis || primaryEnriched?.synopsis || dup.synopsis,
              altTitles: combinedAlts
            },
            targetChapters,
            dupChapters,
            { removeOldSource: true }
          );

          // Ensure chosen primary's category, score and notes stay authoritative
          if (preservedCategory) {
            HistoryService.updateFavoriteCategory(currentPrimary.mangaId, preservedCategory);
          }
          if (typeof preservedScore === 'number' || preservedNotes) {
            HistoryService.updateFavoriteScore(
              currentPrimary.mangaId,
              typeof preservedScore === 'number' ? preservedScore : 10,
              preservedNotes
            );
          }

          // If primary already had strictly further reading progress, restore primary's progress over dup's lower one
          if (primaryProg && bestProgNum > dupProgNum && dupProg) {
            const { updatedAt: _ignoredUpdatedAt, ...restPrimaryProg } = primaryProg;
            HistoryService.saveProgress(restPrimaryProg);
          } else if (dupProgNum > bestProgNum) {
            bestProgNum = dupProgNum;
          }

          removedEntriesCount++;
        }

        mergedGroupsCount++;
      }

      setMergeResult({
        mergedGroups: mergedGroupsCount,
        removedEntries: removedEntriesCount
      });
      onMerged?.({
        mergedGroups: mergedGroupsCount,
        removedEntries: removedEntriesCount
      });
    } catch (err: any) {
      setMergeError(err?.message || 'Erro inesperado ao mesclar duplicatas.');
    } finally {
      setIsMerging(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl text-zinc-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                Mesclar Obras Duplicadas
              </h3>
              <p className="text-[11px] text-zinc-400">
                Unifica a mesma obra salva em fontes diferentes preservando progresso, nota e pastas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isMerging}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Scan Status / Deep Scan Trigger */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 text-xs">
            <div className="flex items-center gap-2.5 text-zinc-300">
              {isScanningSources ? (
                <>
                  <Loader2 className="h-4 w-4 text-rose-400 animate-spin shrink-0" />
                  <span>
                    Consultando títulos alternativos nas fontes ({scanProgress.done}/{scanProgress.total})...
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>
                    {groups.length > 0
                      ? `${groups.length} ${groups.length === 1 ? 'grupo duplicado detectado' : 'grupos duplicados detectados'}`
                      : 'Nenhuma duplicata óbvia encontrada até agora.'}
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleDeepScan}
              disabled={isScanningSources || isMerging || favorites.length < 2}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-[11px] font-semibold transition-colors disabled:opacity-40 cursor-pointer shrink-0"
              title="Consulta títulos alternativos nas fontes originais para encontrar duplicatas com nomes completamente diferentes (ex: japonês vs inglês)"
            >
              <Search className="h-3.5 w-3.5 text-rose-400" />
              <span>{isDeepScanned ? 'Reverificar Fontes' : 'Varredura Profunda nas Fontes'}</span>
            </button>
          </div>

          {mergeError && (
            <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-200 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{mergeError}</span>
            </div>
          )}

          {mergeResult && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-emerald-200 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                {mergeResult.mergedGroups} {mergeResult.mergedGroups === 1 ? 'grupo mesclado' : 'grupos mesclados'}!{' '}
                {mergeResult.removedEntries} {mergeResult.removedEntries === 1 ? 'entrada redundante unificada' : 'entradas redundantes unificadas'} com segurança.
              </span>
            </div>
          )}

          {groups.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <div className="mx-auto w-11 h-11 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-400">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              </div>
              <p className="text-sm font-semibold text-zinc-200">
                {isScanningSources ? 'Analisando sua biblioteca...' : 'Biblioteca sem duplicatas detectadas'}
              </p>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                {isDeepScanned
                  ? 'Todas as entradas foram verificadas nas fontes e não foram encontrados pares equivalentes.'
                  : 'Se você tiver a mesma obra salva com nomes totalmente diferentes em inglês e japonês, clique em "Varredura Profunda nas Fontes" acima.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map(group => {
                const isIncluded = includedGroupIds[group.id] !== false;
                const selectedPrimaryId = selectedPrimaryMap[group.id] || group.recommendedPrimaryId;

                return (
                  <div
                    key={group.id}
                    className={`rounded-xl border transition-colors p-3.5 space-y-2.5 ${
                      isIncluded
                        ? 'bg-zinc-950/75 border-zinc-700/80'
                        : 'bg-zinc-950/30 border-zinc-800/60 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isIncluded}
                          disabled={isMerging}
                          onChange={(e) =>
                            setIncludedGroupIds(prev => ({ ...prev, [group.id]: e.target.checked }))
                          }
                          className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-rose-500 focus:ring-rose-500 cursor-pointer"
                        />
                        <span className="text-[11px] font-semibold text-zinc-300">
                          {group.reasonLabel}
                        </span>
                      </label>
                      <span className="text-[10px] font-mono text-zinc-500">
                        {group.items.length} entradas
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.items.map(item => {
                        const isPrimary = selectedPrimaryId === item.mangaId;
                        const sourceId = extractFavoriteSourceId(item).toUpperCase();
                        const progress = HistoryService.getProgress(item.mangaId);

                        return (
                          <button
                            key={item.mangaId}
                            type="button"
                            disabled={!isIncluded || isMerging}
                            onClick={() =>
                              setSelectedPrimaryMap(prev => ({ ...prev, [group.id]: item.mangaId }))
                            }
                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer disabled:cursor-default ${
                              isPrimary
                                ? 'bg-rose-500/10 border-rose-500/50 ring-1 ring-rose-500/30'
                                : 'bg-zinc-900/70 border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            <img
                              src={item.coverUrl}
                              alt={item.title}
                              className="w-11 h-16 rounded-lg object-cover bg-zinc-800 shrink-0"
                            />
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[9px] font-bold tracking-wider text-zinc-300 uppercase">
                                  {sourceId}
                                </span>
                                {isPrimary ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-semibold">
                                    <Check className="h-2.5 w-2.5" />
                                    Manter
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-zinc-500">
                                    Unificar nesta
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-semibold text-zinc-100 line-clamp-2 leading-snug">
                                {item.title}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                                {progress?.chapterNumber ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                                    <BookOpen className="h-2.5 w-2.5" />
                                    Cap. {progress.chapterNumber}
                                  </span>
                                ) : (
                                  <span>Sem progresso</span>
                                )}
                                {typeof item.userScore === 'number' && (
                                  <span>• ★ {item.userScore}</span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 px-5 py-3.5 border-t border-zinc-800 bg-zinc-950/60 shrink-0">
          <p className="text-[11px] text-zinc-400">
            Clique no card desejado em cada grupo para escolher qual fonte será mantida como principal.
          </p>
          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isMerging}
              className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleMergeSelected}
              disabled={selectedGroups.length === 0 || isMerging}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-950/40 transition-colors cursor-pointer disabled:opacity-40"
            >
              {isMerging ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Mesclando...</span>
                </>
              ) : (
                <>
                  <Layers className="h-3.5 w-3.5" />
                  <span>Mesclar Selecionados ({selectedGroups.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
