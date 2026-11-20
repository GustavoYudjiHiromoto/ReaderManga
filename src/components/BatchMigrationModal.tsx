import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Search,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  BookOpen,
  RefreshCw,
  ArrowRight,
  Layers
} from 'lucide-react';
import { Chapter, FavoriteManga, Manga, MangaSourceInfo } from '../types/manga.js';
import { MangaApi } from '../services/api.js';
import { ExtensionService, FALLBACK_SOURCES_META } from '../services/extensionService.js';
import { HistoryService } from '../services/history.js';
import { UpdateTrackerService } from '../services/updateTracker.js';

interface BatchMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  allFavorites: FavoriteManga[];
  initialSelectedIds?: string[];
  onCompleted?: (summary: { migratedCount: number }) => void;
}

type ScopeMode = 'selected' | 'by_source' | 'all';
type RowStatus = 'pending' | 'searching' | 'matched' | 'not_found' | 'migrated' | 'error';

interface MigrationRow {
  fav: FavoriteManga;
  currentSourceId: string;
  currentSourceName: string;
  query: string;
  status: RowStatus;
  included: boolean;
  candidates: Manga[];
  selectedCandidateId: string | null;
  selectedCandidateChapters: Chapter[] | null;
  loadingChapters: boolean;
  error?: string;
}

export function extractFavoriteSourceId(fav: Pick<FavoriteManga, 'mangaId' | 'sourceId'>): string {
  if (fav.sourceId && fav.sourceId !== 'unknown') return fav.sourceId;
  if (fav.mangaId?.startsWith('mr_')) {
    const rest = fav.mangaId.slice(3);
    const sepIdx = rest.indexOf('_');
    if (sepIdx > 0) return rest.slice(0, sepIdx);
  }
  return 'unknown';
}

function normalizeTitle(t: string): string {
  if (!t) return '';
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function scoreCandidate(fav: FavoriteManga, candidate: Manga): number {
  const normSource = normalizeTitle(fav.title);
  const normAlt = (fav.altTitles || []).map(normalizeTitle).filter(s => s.length >= 3);
  const normCand = normalizeTitle(candidate.title);
  const normCandAlts = (candidate.altTitles || []).map(normalizeTitle).filter(s => s.length >= 3);

  let score = 0;
  if (normSource && normCand && normSource === normCand) {
    score = 100;
  } else if (normSource && normCandAlts.includes(normSource)) {
    score = 92;
  } else if (normCand && normAlt.includes(normCand)) {
    score = 90;
  } else if (normSource && normCand && (normCand.includes(normSource) || normSource.includes(normCand))) {
    const ratio = Math.min(normCand.length, normSource.length) / Math.max(normCand.length, normSource.length);
    score = Math.round(55 + ratio * 30);
  } else {
    const wordsA = new Set(fav.title.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(candidate.title.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    let common = 0;
    wordsA.forEach(w => {
      if (wordsB.has(w)) common++;
    });
    const union = Math.max(wordsA.size, wordsB.size, 1);
    score = Math.round((common / union) * 55);
  }

  if (candidate.hasAvailableChapters) score += 3;
  if (candidate.latestChapter) score += 2;
  return score;
}

export const BatchMigrationModal: React.FC<BatchMigrationModalProps> = ({
  isOpen,
  onClose,
  allFavorites,
  initialSelectedIds,
  onCompleted
}) => {
  const [sourcesList, setSourcesList] = useState<MangaSourceInfo[]>(FALLBACK_SOURCES_META);
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');
  const [sourceFilterId, setSourceFilterId] = useState<string>('');
  const [targetSourceId, setTargetSourceId] = useState<string>('all');
  const [removeOldSource, setRemoveOldSource] = useState(true);

  const [rows, setRows] = useState<MigrationRow[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrateSummary, setMigrateSummary] = useState<{ migrated: number; failed: number } | null>(null);

  const cancelRunRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelRunRef.current++;
    };
  }, []);

  // Load live sources list (built-ins + installed dynamic extensions)
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    ExtensionService.getSourcesMeta().then(list => {
      if (active && Array.isArray(list) && list.length > 0) {
        setSourcesList(list);
      }
    });
    const unsub = ExtensionService.subscribe(() => {
      ExtensionService.getSourcesMeta().then(list => {
        if (active && Array.isArray(list) && list.length > 0) {
          setSourcesList(list);
        }
      });
    });
    return () => {
      active = false;
      unsub();
    };
  }, [isOpen]);

  const sourceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sourcesList) {
      map.set(s.id, s.name);
    }
    return map;
  }, [sourcesList]);

  // Distinct sources present in library favorites
  const librarySources = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const fav of allFavorites) {
      const sid = extractFavoriteSourceId(fav);
      const existing = counts.get(sid);
      const label = fav.sourceName || sourceNameMap.get(sid) || (sid === 'unknown' ? 'Desconhecida' : sid);
      if (existing) {
        existing.count++;
      } else {
        counts.set(sid, { id: sid, name: label, count: 1 });
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [allFavorites, sourceNameMap]);

  // Reset modal state on open
  useEffect(() => {
    if (!isOpen) {
      cancelRunRef.current++;
      setIsMatching(false);
      setIsMigrating(false);
      return;
    }

    const hasPreselected = Boolean(initialSelectedIds && initialSelectedIds.length > 0);
    const nextScope: ScopeMode = hasPreselected ? 'selected' : 'all';
    setScopeMode(nextScope);
    setSourceFilterId(librarySources[0]?.id || '');
    setTargetSourceId('all');
    setMigrateSummary(null);
    setMatchProgress({ done: 0, total: 0 });
  }, [isOpen, initialSelectedIds]);

  const scopedFavorites = useMemo(() => {
    if (scopeMode === 'selected' && initialSelectedIds && initialSelectedIds.length > 0) {
      const idSet = new Set(initialSelectedIds);
      return allFavorites.filter(f => idSet.has(f.mangaId));
    }
    if (scopeMode === 'by_source' && sourceFilterId) {
      return allFavorites.filter(f => extractFavoriteSourceId(f) === sourceFilterId);
    }
    return allFavorites;
  }, [allFavorites, scopeMode, initialSelectedIds, sourceFilterId]);

  // Rebuild queue rows whenever scope changes
  useEffect(() => {
    if (!isOpen) return;
    cancelRunRef.current++;
    setIsMatching(false);
    setMigrateSummary(null);

    const nextRows: MigrationRow[] = scopedFavorites.map(fav => {
      const currentSourceId = extractFavoriteSourceId(fav);
      const currentSourceName =
        fav.sourceName || sourceNameMap.get(currentSourceId) || currentSourceId;
      return {
        fav,
        currentSourceId,
        currentSourceName,
        query: fav.title,
        status: 'pending',
        included: false,
        candidates: [],
        selectedCandidateId: null,
        selectedCandidateChapters: null,
        loadingChapters: false
      };
    });
    setRows(nextRows);
  }, [isOpen, scopedFavorites, sourceNameMap]);

  const fetchCandidateMatch = async (
    row: MigrationRow,
    customQuery?: string
  ): Promise<Partial<MigrationRow>> => {
    const q = (customQuery ?? row.query).trim();
    if (!q) {
      return { status: 'not_found', candidates: [], selectedCandidateId: null, included: false };
    }

    const allSourceIds = sourcesList.map(s => s.id);
    const otherSourceIds = allSourceIds.filter(id => id !== row.currentSourceId);

    const searchOpts =
      targetSourceId !== 'all'
        ? { source: targetSourceId, includeAdult: true, limit: 14 }
        : {
            sources: otherSourceIds.length > 0 ? otherSourceIds : allSourceIds,
            includeAdult: true,
            limit: 18
          };

    try {
      const res = await MangaApi.search(q, searchOpts);
      const raw = Array.isArray(res.data) ? res.data : [];
      const filtered = raw.filter(m => {
        if (m.id === row.fav.mangaId) return false;
        const candSourceId = m.sources?.[0]?.sourceId;
        if (targetSourceId === 'all' && candSourceId && candSourceId === row.currentSourceId) {
          return false;
        }
        return true;
      });

      const ranked = [...filtered].sort(
        (a, b) => scoreCandidate(row.fav, b) - scoreCandidate(row.fav, a)
      );

      if (ranked.length === 0) {
        return {
          query: q,
          status: 'not_found',
          candidates: [],
          selectedCandidateId: null,
          selectedCandidateChapters: null,
          loadingChapters: false,
          included: false
        };
      }

      const best = ranked[0];
      let chapters: Chapter[] | null = null;
      try {
        chapters = await Promise.race([
          MangaApi.getChapters(best.id, { deduplicate: true }),
          new Promise<Chapter[]>(resolve => setTimeout(() => resolve([]), 6000))
        ]);
      } catch {
        chapters = [];
      }

      return {
        query: q,
        status: 'matched',
        candidates: ranked.slice(0, 8),
        selectedCandidateId: best.id,
        selectedCandidateChapters: chapters,
        loadingChapters: false,
        included: true,
        error: undefined
      };
    } catch (err) {
      return {
        query: q,
        status: 'error',
        candidates: [],
        selectedCandidateId: null,
        selectedCandidateChapters: null,
        loadingChapters: false,
        included: false,
        error: (err as Error).message || 'Falha na busca'
      };
    }
  };

  const runBatchSearch = async (targetRows?: MigrationRow[]) => {
    const activeRows = targetRows || rows;
    if (activeRows.length === 0) return;

    const runId = ++cancelRunRef.current;
    setIsMatching(true);
    setMigrateSummary(null);
    setMatchProgress({ done: 0, total: activeRows.length });

    setRows(prev =>
      prev.map(r =>
        r.status === 'migrated'
          ? r
          : { ...r, status: 'searching', error: undefined }
      )
    );

    let cursor = 0;
    let completed = 0;
    const concurrency = 3;

    const worker = async () => {
      while (cursor < activeRows.length) {
        if (!mountedRef.current || cancelRunRef.current !== runId) return;
        const idx = cursor++;
        const row = activeRows[idx];
        if (!row || row.status === 'migrated') {
          completed++;
          if (mountedRef.current && cancelRunRef.current === runId) {
            setMatchProgress({ done: completed, total: activeRows.length });
          }
          continue;
        }

        const patch = await fetchCandidateMatch(row);
        completed++;

        if (!mountedRef.current || cancelRunRef.current !== runId) return;

        setRows(prev =>
          prev.map(item =>
            item.fav.mangaId === row.fav.mangaId ? { ...item, ...patch } : item
          )
        );
        setMatchProgress({ done: completed, total: activeRows.length });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, activeRows.length) }, () => worker())
    );

    if (mountedRef.current && cancelRunRef.current === runId) {
      setIsMatching(false);
    }
  };

  // Auto-start lookup when opened directly from multi-select toolbar
  const autoTriggeredRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      autoTriggeredRef.current = false;
      return;
    }
    if (
      initialSelectedIds &&
      initialSelectedIds.length > 0 &&
      scopeMode === 'selected' &&
      rows.length > 0 &&
      !autoTriggeredRef.current &&
      rows.every(r => r.status === 'pending')
    ) {
      autoTriggeredRef.current = true;
      runBatchSearch(rows);
    }
  }, [isOpen, initialSelectedIds, scopeMode, rows]);

  const handleResearchRow = async (mangaId: string) => {
    const targetRow = rows.find(r => r.fav.mangaId === mangaId);
    if (!targetRow || isMigrating) return;

    setRows(prev =>
      prev.map(r =>
        r.fav.mangaId === mangaId
          ? { ...r, status: 'searching', error: undefined }
          : r
      )
    );

    const patch = await fetchCandidateMatch(targetRow, targetRow.query);
    if (!mountedRef.current) return;

    setRows(prev =>
      prev.map(r => (r.fav.mangaId === mangaId ? { ...r, ...patch } : r))
    );
  };

  const handleSelectRowCandidate = async (mangaId: string, candidateId: string) => {
    const row = rows.find(r => r.fav.mangaId === mangaId);
    const candidate = row?.candidates.find(c => c.id === candidateId);
    if (!row || !candidate) return;

    setRows(prev =>
      prev.map(r =>
        r.fav.mangaId === mangaId
          ? {
              ...r,
              selectedCandidateId: candidateId,
              selectedCandidateChapters: null,
              loadingChapters: true,
              included: true
            }
          : r
      )
    );

    let chapters: Chapter[] = [];
    try {
      chapters = await Promise.race([
        MangaApi.getChapters(candidateId, { deduplicate: true }),
        new Promise<Chapter[]>(resolve => setTimeout(() => resolve([]), 6000))
      ]);
    } catch {
      chapters = [];
    }

    if (!mountedRef.current) return;
    setRows(prev =>
      prev.map(r =>
        r.fav.mangaId === mangaId && r.selectedCandidateId === candidateId
          ? { ...r, selectedCandidateChapters: chapters, loadingChapters: false }
          : r
      )
    );
  };

  const readyRows = useMemo(
    () =>
      rows.filter(
        r =>
          r.included &&
          r.status === 'matched' &&
          r.selectedCandidateId &&
          r.candidates.some(c => c.id === r.selectedCandidateId)
      ),
    [rows]
  );

  const handleExecuteBatchMigration = async () => {
    if (readyRows.length === 0 || isMigrating) return;
    setIsMigrating(true);
    setMigrateSummary(null);

    let migrated = 0;
    let failed = 0;

    for (const row of readyRows) {
      if (!mountedRef.current) break;
      const targetCandidate = row.candidates.find(c => c.id === row.selectedCandidateId);
      if (!targetCandidate) {
        failed++;
        continue;
      }

      try {
        const targetChapters =
          row.selectedCandidateChapters !== null
            ? row.selectedCandidateChapters
            : await MangaApi.getChapters(targetCandidate.id, { deduplicate: true }).catch(() => []);

        // Best-effort source chapters lookup with short timeout so dead sources never stall migration
        const sourceChapters = await Promise.race([
          MangaApi.getChapters(row.fav.mangaId, { deduplicate: true }).catch(() => [] as Chapter[]),
          new Promise<Chapter[]>(resolve => setTimeout(() => resolve([]), 3000))
        ]);

        HistoryService.migrateMangaData(
          row.fav.mangaId,
          {
            mangaId: targetCandidate.id,
            title: targetCandidate.title,
            coverUrl: targetCandidate.coverUrl,
            sourceId: targetCandidate.sources?.[0]?.sourceId,
            sourceName:
              targetCandidate.sources?.[0]?.sourceName ||
              sourceNameMap.get(targetCandidate.sources?.[0]?.sourceId || ''),
            rating: targetCandidate.rating,
            authors: targetCandidate.authors,
            genres: targetCandidate.genres,
            status: targetCandidate.status,
            synopsis: targetCandidate.synopsis,
            altTitles: targetCandidate.altTitles
          },
          targetChapters,
          sourceChapters,
          { removeOldSource: removeOldSource }
        );

        if (removeOldSource) {
          UpdateTrackerService.migrateMangaUpdate(row.fav.mangaId, targetCandidate.id);
        }

        migrated++;
        if (mountedRef.current) {
          setRows(prev =>
            prev.map(r =>
              r.fav.mangaId === row.fav.mangaId
                ? { ...r, status: 'migrated', included: false }
                : r
            )
          );
        }
      } catch (err) {
        failed++;
        if (mountedRef.current) {
          setRows(prev =>
            prev.map(r =>
              r.fav.mangaId === row.fav.mangaId
                ? { ...r, status: 'error', error: (err as Error).message || 'Erro ao migrar' }
                : r
            )
          );
        }
      }
    }

    if (mountedRef.current) {
      setIsMigrating(false);
      setMigrateSummary({ migrated, failed });
      if (migrated > 0) {
        onCompleted?.({ migratedCount: migrated });
      }
    }
  };

  if (!isOpen) return null;

  const hasInitialSelected = Boolean(initialSelectedIds && initialSelectedIds.length > 0);
  const matchedCount = rows.filter(r => r.status === 'matched').length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 shrink-0">
              <Layers className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-zinc-100 truncate">
                Migração em Lote de Fontes
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                Transfira várias obras de uma fonte antiga para outro provedor preservando progresso e notas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            aria-label="Fechar migração em lote"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scope & Target Source Controls */}
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/30 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Scope Selector */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-zinc-400 mr-1">Escopo:</span>
              {hasInitialSelected && (
                <button
                  type="button"
                  disabled={isMatching || isMigrating}
                  onClick={() => setScopeMode('selected')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                    scopeMode === 'selected'
                      ? 'bg-rose-600 text-white'
                      : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800'
                  }`}
                >
                  Selecionadas ({initialSelectedIds?.length || 0})
                </button>
              )}
              <button
                type="button"
                disabled={isMatching || isMigrating || librarySources.length === 0}
                onClick={() => setScopeMode('by_source')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  scopeMode === 'by_source'
                    ? 'bg-rose-600 text-white'
                    : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800'
                }`}
              >
                Por fonte
              </button>
              <button
                type="button"
                disabled={isMatching || isMigrating}
                onClick={() => setScopeMode('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                  scopeMode === 'all'
                    ? 'bg-rose-600 text-white'
                    : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800'
                }`}
              >
                Toda a Biblioteca ({allFavorites.length})
              </button>
            </div>

            {/* Trigger Match Lookup */}
            <button
              type="button"
              disabled={rows.length === 0 || isMatching || isMigrating}
              onClick={() => runBatchSearch()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              {isMatching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              <span className="tabular-nums">
                {isMatching
                  ? `Buscando (${matchProgress.done}/${matchProgress.total})...`
                  : matchedCount > 0
                  ? 'Rebuscar Todas'
                  : `Buscar Correspondências (${rows.length})`}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {scopeMode === 'by_source' && librarySources.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-zinc-400 whitespace-nowrap">Origem:</label>
                <select
                  value={sourceFilterId}
                  disabled={isMatching || isMigrating}
                  onChange={e => setSourceFilterId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-rose-500"
                >
                  {librarySources.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.count})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="text-zinc-400 whitespace-nowrap">Fonte de destino:</label>
              <select
                value={targetSourceId}
                disabled={isMatching || isMigrating}
                onChange={e => setTargetSourceId(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-rose-500"
              >
                <option value="all">Todas as outras fontes</option>
                {sourcesList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Summary / Result Callout */}
        {migrateSummary && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-950/35 border border-emerald-700/40 flex items-center justify-between gap-3 text-xs text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                Migração concluída: <strong className="tabular-nums">{migrateSummary.migrated}</strong> obra(s) migrada(s)
                {migrateSummary.failed > 0 ? `, ${migrateSummary.failed} falha(s)` : ''}.
              </span>
            </div>
          </div>
        )}

        {/* Queue Rows */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
          {rows.length === 0 ? (
            <div className="py-14 text-center space-y-1.5">
              <BookOpen className="h-7 w-7 text-zinc-600 mx-auto" />
              <p className="text-sm font-medium text-zinc-300">
                Nenhuma obra neste escopo
              </p>
              <p className="text-xs text-zinc-500">
                Escolha outra fonte de origem ou adicione obras à biblioteca primeiro.
              </p>
            </div>
          ) : (
            rows.map(row => {
              const selectedCand = row.candidates.find(c => c.id === row.selectedCandidateId);
              const candSourceName =
                selectedCand?.sources?.[0]?.sourceName ||
                sourceNameMap.get(selectedCand?.sources?.[0]?.sourceId || '') ||
                selectedCand?.sources?.[0]?.sourceId;
              const chaptersCount = row.selectedCandidateChapters?.length ?? null;

              return (
                <div
                  key={row.fav.mangaId}
                  className={`p-3 rounded-xl border transition-colors flex flex-col md:flex-row md:items-center gap-3 ${
                    row.status === 'migrated'
                      ? 'bg-emerald-950/15 border-emerald-800/40'
                      : row.included && row.status === 'matched'
                      ? 'bg-zinc-900/70 border-rose-500/40'
                      : 'bg-zinc-900/40 border-zinc-800/90'
                  }`}
                >
                  {/* Left: Checkbox + Cover + Original Info */}
                  <div className="flex items-center gap-3 min-w-0 md:w-[38%]">
                    <input
                      type="checkbox"
                      checked={row.included}
                      disabled={row.status !== 'matched' || isMigrating}
                      onChange={e =>
                        setRows(prev =>
                          prev.map(r =>
                            r.fav.mangaId === row.fav.mangaId
                              ? { ...r, included: e.target.checked }
                              : r
                          )
                        )
                      }
                      className="rounded border-zinc-700 bg-zinc-950 text-rose-500 focus:ring-rose-500 shrink-0 disabled:opacity-40 cursor-pointer"
                    />

                    <div className="h-14 w-10 rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 shrink-0">
                      {row.fav.coverUrl ? (
                        <img
                          src={row.fav.coverUrl}
                          alt={row.fav.title}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-[10px] text-zinc-600">
                          Capa
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-zinc-100 truncate" title={row.fav.title}>
                        {row.fav.title}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate">
                        Atual: <span className="text-zinc-300">{row.currentSourceName}</span>
                      </p>
                      <div className="mt-1">
                        {row.status === 'pending' && (
                          <span className="text-[11px] text-zinc-500">Aguardando busca</span>
                        )}
                        {row.status === 'searching' && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-rose-300">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Buscando...
                          </span>
                        )}
                        {row.status === 'matched' && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Correspondência encontrada
                          </span>
                        )}
                        {row.status === 'not_found' && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            Não encontrado
                          </span>
                        )}
                        {row.status === 'error' && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-rose-400">
                            <AlertTriangle className="h-3 w-3" />
                            {row.error || 'Erro'}
                          </span>
                        )}
                        {row.status === 'migrated' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Migrado com sucesso
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Editable Query + Candidate Selector */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={row.query}
                        disabled={row.status === 'migrated' || isMigrating}
                        onChange={e => {
                          const val = e.target.value;
                          setRows(prev =>
                            prev.map(r =>
                              r.fav.mangaId === row.fav.mangaId ? { ...r, query: val } : r
                            )
                          );
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleResearchRow(row.fav.mangaId);
                          }
                        }}
                        placeholder="Ajustar título para buscar..."
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-rose-500 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        disabled={row.status === 'searching' || row.status === 'migrated' || isMigrating}
                        onClick={() => handleResearchRow(row.fav.mangaId)}
                        title="Rebuscar apenas esta obra"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                      >
                        <RefreshCw className={`h-3 w-3 ${row.status === 'searching' ? 'animate-spin' : ''}`} />
                        <span>Rebuscar</span>
                      </button>
                    </div>

                    {row.candidates.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={row.selectedCandidateId || ''}
                          disabled={row.status === 'migrated' || isMigrating}
                          onChange={e => handleSelectRowCandidate(row.fav.mangaId, e.target.value)}
                          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-rose-500 disabled:opacity-60"
                        >
                          {row.candidates.map(cand => {
                            const cSrc =
                              cand.sources?.[0]?.sourceName ||
                              sourceNameMap.get(cand.sources?.[0]?.sourceId || '') ||
                              cand.sources?.[0]?.sourceId ||
                              'Fonte';
                            const latestLabel = cand.latestChapter ? ` · Cap. ${cand.latestChapter}` : '';
                            return (
                              <option key={cand.id} value={cand.id}>
                                [{cSrc}] {cand.title}
                                {latestLabel}
                              </option>
                            );
                          })}
                        </select>

                        {selectedCand && (
                          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 shrink-0 tabular-nums">
                            {candSourceName && (
                              <span className="text-rose-300 font-medium">{candSourceName}</span>
                            )}
                            <span className="text-zinc-600">·</span>
                            {row.loadingChapters ? (
                              <span className="text-zinc-400">Contando...</span>
                            ) : chaptersCount !== null ? (
                              <span className="text-emerald-300 font-mono">
                                {chaptersCount} cap.
                              </span>
                            ) : selectedCand.latestChapter ? (
                              <span className="font-mono">Cap. {selectedCand.latestChapter}</span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-800 bg-zinc-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={removeOldSource}
              disabled={isMigrating}
              onChange={e => setRemoveOldSource(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-950 text-rose-500 focus:ring-rose-500"
            />
            <span>Substituir entrada antiga na biblioteca e histórico</span>
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-300 cursor-pointer whitespace-nowrap shrink-0"
            >
              {migrateSummary ? 'Fechar' : 'Cancelar'}
            </button>
            <button
              type="button"
              disabled={readyRows.length === 0 || isMigrating || isMatching}
              onClick={handleExecuteBatchMigration}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0 tabular-nums"
            >
              {isMigrating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5" />
              )}
              <span>
                {isMigrating
                  ? 'Migrando...'
                  : `Migrar Selecionadas (${readyRows.length})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
