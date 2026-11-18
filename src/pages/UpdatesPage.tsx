import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles,
  RefreshCw,
  BookOpen,
  CheckCheck,
  Check,
  Search,
  Clock,
  Bookmark,
  Compass,
  Bell,
  Calendar
} from 'lucide-react';
import { FavoriteManga, MangaUpdateInfo, LibraryCategory } from '../types/manga.js';
import { HistoryService } from '../services/history.js';
import { UpdateTrackerService } from '../services/updateTracker.js';
import { getNextCoverFallback } from '../utils/coverFallback.js';

interface UpdatesPageProps {
  onSelectManga: (mangaId: string) => void;
  onReadChapter: (mangaId: string, chapterId: string) => void;
  onNavigateToSearch: () => void;
  onNavigateToFavorites: () => void;
}

type UpdatesFilter = 'new' | 'reading' | 'all';

const CATEGORY_LABELS: Record<LibraryCategory, string> = {
  reading: 'Lendo',
  plan_to_read: 'Quero Ler',
  completed: 'Completo',
  on_hold: 'Pausado',
  dropped: 'Abandonado'
};

function parseReleaseTimestamp(releaseDate?: string): number {
  if (!releaseDate) return 0;
  const trimmed = releaseDate.trim();
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const y = Number(ymdMatch[1]);
    const m = Number(ymdMatch[2]) - 1;
    const d = Number(ymdMatch[3]);
    return new Date(y, m, d, 12, 0, 0).getTime();
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getEffectiveUpdateTimestamp(update?: MangaUpdateInfo): number {
  if (!update) return 0;
  const releaseTs = parseReleaseTimestamp(update.releaseDate);
  if (releaseTs > 0) return releaseTs;
  return update.discoveredAt || update.checkedAt || 0;
}

function getDayLabel(timestamp: number): string {
  if (!timestamp) return 'Aguardando Verificação';
  const itemDate = new Date(timestamp);
  const now = new Date();

  if (itemDate.toDateString() === now.toDateString()) {
    return 'Hoje';
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (itemDate.toDateString() === yesterday.toDateString()) {
    return 'Ontem';
  }

  const diffDays = Math.floor((now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays >= 0 && diffDays < 7) {
    return 'Esta Semana';
  }

  return itemDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

function formatReleaseMeta(update?: MangaUpdateInfo): string {
  if (!update) return 'Não verificado';
  const releaseTs = parseReleaseTimestamp(update.releaseDate);
  if (releaseTs > 0) {
    return `Publicado: ${new Date(releaseTs).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  }
  const ts = update.discoveredAt || update.checkedAt;
  if (!ts) return 'Não verificado';
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Verificado agora';
  if (mins < 60) return `Verificado há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Verificado há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Verificado há ${days}d`;
}

export const UpdatesPage: React.FC<UpdatesPageProps> = ({
  onSelectManga,
  onReadChapter,
  onNavigateToSearch,
  onNavigateToFavorites
}) => {
  const [favorites, setFavorites] = useState<FavoriteManga[]>(() => HistoryService.getFavorites());
  const [updatesMap, setUpdatesMap] = useState<Record<string, MangaUpdateInfo>>(() => UpdateTrackerService.getStoredUpdates());
  const [readChapters, setReadChapters] = useState<string[]>(() => HistoryService.getReadChapters());
  const [filter, setFilter] = useState<UpdatesFilter>('new');
  const [searchTerm, setSearchTerm] = useState('');
  const [isChecking, setIsChecking] = useState<boolean>(() => UpdateTrackerService.isChecking());
  const [progressMsg, setProgressMsg] = useState<string | null>(() => UpdateTrackerService.getProgress());
  const [coverErrors, setCoverErrors] = useState<Record<string, boolean>>({});
  const [coverOverrides, setCoverOverrides] = useState<Record<string, string>>({});
  const attemptedCoversRef = useRef<Record<string, Set<string>>>({});

  // Reset Navbar unseen badge counter as soon as the user opens Lançamentos (unread-message style)
  useEffect(() => {
    UpdateTrackerService.acknowledgeFeedUpdates();
  }, [updatesMap]);

  useEffect(() => {
    const syncState = () => {
      setFavorites(HistoryService.getFavorites());
      setReadChapters(HistoryService.getReadChapters());
    };
    const syncUpdates = () => {
      setUpdatesMap(UpdateTrackerService.getStoredUpdates());
      setIsChecking(UpdateTrackerService.isChecking());
      setProgressMsg(UpdateTrackerService.getProgress());
    };

    const unsubHist = HistoryService.subscribe(syncState);
    const unsubUpd = UpdateTrackerService.subscribe(syncUpdates);
    return () => {
      unsubHist();
      unsubUpd();
    };
  }, []);

  const readSet = useMemo(() => new Set(readChapters), [readChapters]);

  const combinedRows = useMemo(() => {
    const rows = favorites.map((fav) => {
      const update = updatesMap[fav.mangaId];
      const progress = HistoryService.getProgress(fav.mangaId);
      const isUnreadNew = Boolean(update?.hasNew && !readSet.has(update.latestChapterId));
      const effectiveTimestamp = getEffectiveUpdateTimestamp(update);
      return {
        fav,
        update,
        progress,
        isUnreadNew,
        effectiveTimestamp
      };
    });

    // Sort chronologically descending by release/discovery day so day dividers stay grouped once
    rows.sort((a, b) => {
      if (a.effectiveTimestamp !== b.effectiveTimestamp) {
        return b.effectiveTimestamp - a.effectiveTimestamp;
      }
      if (a.isUnreadNew !== b.isUnreadNew) return a.isUnreadNew ? -1 : 1;
      return (b.fav.updatedAt || 0) - (a.fav.updatedAt || 0);
    });

    return rows;
  }, [favorites, updatesMap, readSet]);

  const newCount = useMemo(
    () => combinedRows.filter(r => r.isUnreadNew).length,
    [combinedRows]
  );

  const readingCount = useMemo(
    () => combinedRows.filter(r => (r.fav.userCategory || 'reading') === 'reading').length,
    [combinedRows]
  );

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return combinedRows.filter(({ fav, isUnreadNew }) => {
      if (filter === 'new' && !isUnreadNew) return false;
      if (filter === 'reading' && (fav.userCategory || 'reading') !== 'reading') return false;
      if (q && !fav.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [combinedRows, filter, searchTerm]);

  const groupedUpdates = useMemo(() => {
    const groups: Array<{ label: string; items: typeof filteredRows }> = [];
    const map = new Map<string, typeof filteredRows>();

    for (const row of filteredRows) {
      const label = getDayLabel(row.effectiveTimestamp);
      if (!map.has(label)) {
        const list: typeof filteredRows = [];
        map.set(label, list);
        groups.push({ label, items: list });
      }
      map.get(label)!.push(row);
    }

    // Within each day group, prioritize unread releases first
    for (const group of groups) {
      group.items.sort((a, b) => {
        if (a.isUnreadNew !== b.isUnreadNew) return a.isUnreadNew ? -1 : 1;
        return b.effectiveTimestamp - a.effectiveTimestamp;
      });
    }

    return groups;
  }, [filteredRows]);

  const handleManualCheck = async () => {
    if (isChecking) return;
    setIsChecking(true);
    setProgressMsg('Conectando às fontes...');
    try {
      await UpdateTrackerService.checkUpdates(true, (msg) => setProgressMsg(msg));
    } finally {
      setIsChecking(false);
      setProgressMsg(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-24">
      {/* Header Strip */}
      <div className="border-b border-zinc-800/80 bg-zinc-950/80">
        <div className="mx-auto max-w-6xl px-3 sm:px-6 lg:px-8 py-6 sm:py-9">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-rose-400 text-xs uppercase tracking-widest font-semibold mb-1.5">
                <Bell className="h-3.5 w-3.5" />
                <span>Radar da Biblioteca</span>
              </div>
              <h1 className="font-serif text-2xl sm:text-4xl font-bold tracking-tight text-white">
                Lançamentos & Atualizações
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1.5">
                Acompanhe os novos capítulos das suas <span className="font-mono text-zinc-200 tabular-nums">{favorites.length}</span> obras salvas sem poluir sua tela inicial.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {newCount > 0 && (
                <button
                  type="button"
                  onClick={() => UpdateTrackerService.markAllUpdatesAsSeen()}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs font-medium text-zinc-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCheck className="h-4 w-4 text-emerald-400" />
                  <span>Marcar Tudo Visto</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleManualCheck}
                disabled={isChecking || favorites.length === 0}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center gap-2 shadow-lg shadow-rose-950/40 cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />
                <span>{isChecking ? 'Verificando...' : 'Verificar Agora'}</span>
              </button>
            </div>
          </div>

          {progressMsg && (
            <div className="mt-4 px-3.5 py-2 rounded-xl bg-zinc-900 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
              <span className="truncate">{progressMsg}</span>
            </div>
          )}

          {/* Filter & Search Bar */}
          {favorites.length > 0 && (
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                <button
                  type="button"
                  onClick={() => setFilter('new')}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 border ${
                    filter === 'new'
                      ? 'bg-rose-500/15 border-rose-500/50 text-rose-300'
                      : 'bg-zinc-900/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Novos Capítulos</span>
                  <span className="font-mono tabular-nums text-[11px]">({newCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilter('reading')}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 border ${
                    filter === 'reading'
                      ? 'bg-rose-500/15 border-rose-500/50 text-rose-300'
                      : 'bg-zinc-900/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>Lendo Agora</span>
                  <span className="font-mono tabular-nums text-[11px]">({readingCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 border ${
                    filter === 'all'
                      ? 'bg-rose-500/15 border-rose-500/50 text-rose-300'
                      : 'bg-zinc-900/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span>Todos Monitorados</span>
                  <span className="font-mono tabular-nums text-[11px]">({favorites.length})</span>
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrar por título..."
                  className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl bg-zinc-900/90 border border-zinc-800 focus:border-rose-500/60 focus:outline-none text-xs text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-6xl px-3 sm:px-6 lg:px-8 mt-6">
        {favorites.length === 0 ? (
          <div className="p-8 sm:p-12 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center">
            <Bookmark className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
            <h2 className="text-base font-bold text-zinc-200">Sua biblioteca ainda está vazia</h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto leading-relaxed">
              Favorite obras para que o Radar monitore automaticamente quando novos capítulos forem publicados nas fontes conectadas.
            </p>
            <button
              type="button"
              onClick={onNavigateToSearch}
              className="mt-5 min-h-[44px] px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Compass className="h-4 w-4" />
              <span>Explorar Catálogo</span>
            </button>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-8 sm:p-12 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 text-center">
            <CheckCheck className="h-10 w-10 text-emerald-400/80 mx-auto mb-3" />
            <h2 className="text-base font-bold text-zinc-200">
              {filter === 'new' && !searchTerm
                ? 'Você está em dia com todas as leituras!'
                : 'Nenhuma atualização encontrada neste filtro'}
            </h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
              {filter === 'new' && !searchTerm
                ? 'Todos os lançamentos recentes foram lidos ou marcados como vistos. Clique em Verificar Agora para consultar novamente as fontes.'
                : 'Altere o filtro acima ou limpe a busca para visualizar toda a sua lista.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              {filter !== 'all' && (
                <button
                  type="button"
                  onClick={() => {
                    setFilter('all');
                    setSearchTerm('');
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
                >
                  Ver Todos Monitorados ({favorites.length})
                </button>
              )}
              <button
                type="button"
                onClick={onNavigateToFavorites}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
              >
                Ir para Favoritos
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedUpdates.map((group) => (
              <section key={group.label} className="space-y-3.5">
                {/* Day Header Divider (matching HistoryDrawer pattern) */}
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  <Calendar className="h-3.5 w-3.5 text-rose-400/80 shrink-0" />
                  <span>{group.label}</span>
                  <span className="text-[11px] font-mono text-zinc-500 tabular-nums font-normal lowercase">
                    ({group.items.length})
                  </span>
                  <div className="flex-1 h-px bg-zinc-800/80" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {group.items.map(({ fav, update, progress, isUnreadNew }) => {
                    const catLabel = CATEGORY_LABELS[fav.userCategory || 'reading'] || 'Favorito';
                    const targetChapterId = update?.latestChapterId || progress?.chapterId;
                    const targetChapterNum = update?.latestChapterNumber || progress?.chapterNumber;

                    return (
                      <article
                        key={fav.mangaId}
                        className={`group flex gap-3.5 p-3 sm:p-3.5 rounded-2xl border transition-all ${
                          isUnreadNew
                            ? 'bg-zinc-900/80 border-rose-500/35 hover:border-rose-500/60 shadow-md'
                            : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectManga(fav.mangaId)}
                          className="w-16 sm:w-20 aspect-[3/4] rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 shrink-0 cursor-pointer focus:outline-none"
                          aria-label={`Ver detalhes de ${fav.title}`}
                        >
                          {!coverErrors[fav.mangaId] && (coverOverrides[fav.mangaId] || fav.coverUrl) ? (
                            <img
                              src={coverOverrides[fav.mangaId] || fav.coverUrl}
                              alt={fav.title}
                              referrerPolicy="no-referrer"
                              onError={() => {
                                const currentSrc = coverOverrides[fav.mangaId] || fav.coverUrl;
                                if (currentSrc) {
                                  const attempted =
                                    attemptedCoversRef.current[fav.mangaId] ||
                                    (attemptedCoversRef.current[fav.mangaId] = new Set());
                                  attempted.add(currentSrc);
                                  const next = getNextCoverFallback(currentSrc, attempted);
                                  if (next) {
                                    setCoverOverrides(prev => ({ ...prev, [fav.mangaId]: next }));
                                    return;
                                  }
                                }
                                setCoverErrors(prev => ({ ...prev, [fav.mangaId]: true }));
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center p-1.5 text-zinc-600">
                              <BookOpen className="h-5 w-5" />
                            </div>
                          )}
                        </button>

                        <div className="flex flex-1 flex-col justify-between min-w-0">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => onSelectManga(fav.mangaId)}
                                className="text-left font-semibold text-sm text-zinc-100 hover:text-rose-400 transition-colors line-clamp-2 leading-snug cursor-pointer"
                              >
                                {fav.title}
                              </button>

                              {isUnreadNew && (
                                <button
                                  type="button"
                                  onClick={() => UpdateTrackerService.markMangaUpdateAsSeen(fav.mangaId)}
                                  className="min-h-[36px] min-w-[36px] -mt-1 -mr-1 p-2 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/80 transition-colors shrink-0 cursor-pointer"
                                  title="Marcar lançamento como visto"
                                  aria-label={`Marcar ${fav.title} como visto`}
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                              )}
                            </div>

                            {/* Clean unboxed editorial metadata row */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-400 mt-1">
                              <span className={isUnreadNew ? 'text-rose-400 font-semibold' : 'text-zinc-400'}>
                                {catLabel}
                              </span>
                              <span aria-hidden="true" className="text-zinc-700">·</span>
                              {update ? (
                                <span className="font-mono text-zinc-200 font-semibold tabular-nums">
                                  Cap. {update.latestChapterNumber}
                                </span>
                              ) : (
                                <span className="text-zinc-500">Sem verificação</span>
                              )}
                              {(update?.lastReadNumber || progress?.chapterNumber) && (
                                <>
                                  <span aria-hidden="true" className="text-zinc-700">·</span>
                                  <span className="font-mono text-zinc-500 tabular-nums">
                                    leu {update?.lastReadNumber || progress?.chapterNumber}
                                  </span>
                                </>
                              )}
                              {update?.failoverUsed && update.chapterSourceId && (
                                <>
                                  <span aria-hidden="true" className="text-zinc-700">·</span>
                                  <span
                                    className="text-emerald-400/90 font-medium"
                                    title="Capítulo localizado automaticamente em outra fonte ativa"
                                  >
                                    via {update.chapterSourceName || update.chapterSourceId}
                                  </span>
                                </>
                              )}
                            </div>

                            {update?.latestChapterTitle && (
                              <p className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5">
                                {update.latestChapterTitle}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-zinc-800/70">
                            <span className="text-[10px] text-zinc-500 flex items-center gap-1 tabular-nums">
                              <Clock className="h-3 w-3 shrink-0" />
                              {formatReleaseMeta(update)}
                            </span>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onSelectManga(fav.mangaId)}
                                className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-[11px] font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
                              >
                                Obra
                              </button>

                              {targetChapterId && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    UpdateTrackerService.markMangaUpdateAsSeen(fav.mangaId);
                                    onReadChapter(fav.mangaId, targetChapterId);
                                  }}
                                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                                    isUnreadNew
                                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm'
                                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                                  }`}
                                >
                                  <BookOpen className="h-3 w-3 shrink-0" />
                                  <span>Ler Cap. {targetChapterNum}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
