import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  BookOpen,
  ArrowRight
} from 'lucide-react';
import { Chapter, Manga, MangaSourceInfo } from '../types/manga.js';
import { MangaApi } from '../services/api.js';
import { ExtensionService } from '../services/extensionService.js';
import { HistoryService } from '../services/history.js';

interface MangaMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceManga: Manga;
  sourceChapters: Chapter[];
  onMigrated: (targetMangaId: string) => void;
}

export const MangaMigrationModal: React.FC<MangaMigrationModalProps> = ({
  isOpen,
  onClose,
  sourceManga,
  sourceChapters,
  onMigrated
}) => {
  const [query, setQuery] = useState(sourceManga.title);
  const [availableSources, setAvailableSources] = useState<MangaSourceInfo[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('all');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Manga[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedCandidate, setSelectedCandidate] = useState<Manga | null>(null);
  const [candidateChapters, setCandidateChapters] = useState<Chapter[] | null>(null);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [removeOldFavorite, setRemoveOldFavorite] = useState(true);
  const [migrating, setMigrating] = useState(false);

  const currentSourceId = sourceManga.sources?.[0]?.sourceId;

  useEffect(() => {
    if (!isOpen) return;
    setQuery(sourceManga.title);
    setSelectedCandidate(null);
    setCandidateChapters(null);
    setSearchError(null);

    let mounted = true;
    ExtensionService.getSourcesMeta().then(list => {
      if (!mounted) return;
      const otherSources = list.filter(s => s.id !== currentSourceId);
      setAvailableSources(otherSources);
      runSearch(sourceManga.title, 'all', otherSources.map(s => s.id));
    });

    return () => {
      mounted = false;
    };
  }, [isOpen, sourceManga.id]);

  const runSearch = async (
    q: string,
    targetSource: string,
    fallbackSourceIds?: string[]
  ) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSearching(true);
    setSearchError(null);
    setSelectedCandidate(null);
    setCandidateChapters(null);

    try {
      const targetIds =
        targetSource === 'all'
          ? fallbackSourceIds || availableSources.map(s => s.id)
          : [targetSource];

      const res = await MangaApi.search(trimmed, {
        ...(targetSource !== 'all' ? { source: targetSource } : { sources: targetIds }),
        includeAdult: true,
        limit: 24
      });

      const filtered = (res.data || []).filter(m => m.id !== sourceManga.id);
      setResults(filtered);
    } catch (err) {
      setSearchError((err as Error).message || 'Falha ao buscar em outras extensões.');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectCandidate = async (candidate: Manga) => {
    setSelectedCandidate(candidate);
    setCandidateChapters(null);
    setLoadingChapters(true);
    try {
      const chs = await MangaApi.getChapters(candidate.id, { deduplicate: true });
      setCandidateChapters(chs);
    } catch {
      setCandidateChapters([]);
    } finally {
      setLoadingChapters(false);
    }
  };

  const handleConfirmMigrate = async () => {
    if (!selectedCandidate) return;
    setMigrating(true);
    try {
      const targetChapters =
        candidateChapters !== null
          ? candidateChapters
          : await MangaApi.getChapters(selectedCandidate.id, { deduplicate: true }).catch(() => []);

      HistoryService.migrateMangaData(
        sourceManga.id,
        {
          mangaId: selectedCandidate.id,
          title: selectedCandidate.title,
          coverUrl: selectedCandidate.coverUrl,
          sourceId: selectedCandidate.sources?.[0]?.sourceId,
          sourceName: selectedCandidate.sources?.[0]?.sourceName,
          rating: selectedCandidate.rating,
          authors: selectedCandidate.authors,
          genres: selectedCandidate.genres,
          status: selectedCandidate.status,
          synopsis: selectedCandidate.synopsis,
          altTitles: selectedCandidate.altTitles
        },
        targetChapters,
        sourceChapters,
        { removeOldSource: removeOldFavorite }
      );

      onClose();
      onMigrated(selectedCandidate.id);
    } finally {
      setMigrating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 shrink-0">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-zinc-100 truncate">
                Migrar Obra para Outra Fonte
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                Origem atual: {sourceManga.sources?.[0]?.sourceName || currentSourceId}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Fechar migração"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search & Target Source Controls */}
        <form
          onSubmit={e => {
            e.preventDefault();
            runSearch(query, selectedSourceId);
          }}
          className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/20 flex flex-col sm:flex-row gap-2"
        >
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar título nas outras extensões..."
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
            />
          </div>
          <select
            value={selectedSourceId}
            onChange={e => {
              const next = e.target.value;
              setSelectedSourceId(next);
              runSearch(query, next);
            }}
            className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-rose-500"
          >
            <option value="all">Todas as outras fontes</option>
            {availableSources.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {searching ? 'Buscando...' : 'Buscar'}
          </button>
        </form>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
          {searching ? (
            <div className="flex flex-col items-center justify-center py-14 text-zinc-400 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-rose-400" />
              <span className="text-xs">Consultando extensões compatíveis...</span>
            </div>
          ) : searchError ? (
            <div className="p-4 rounded-xl bg-rose-950/35 border border-rose-700/40 text-xs text-rose-200 flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{searchError}</span>
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center space-y-1.5">
              <BookOpen className="h-7 w-7 text-zinc-600 mx-auto" />
              <p className="text-sm font-medium text-zinc-300">
                Nenhuma correspondência encontrada
              </p>
              <p className="text-xs text-zinc-500">
                Tente buscar por um título alternativo ou em japonês/romaji no campo acima.
              </p>
            </div>
          ) : (
            results.map(candidate => {
              const isSelected = selectedCandidate?.id === candidate.id;
              const srcName = candidate.sources?.[0]?.sourceName || candidate.sources?.[0]?.sourceId || 'Fonte';
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => handleSelectCandidate(candidate)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer flex items-center gap-3.5 ${
                    isSelected
                      ? 'bg-rose-950/25 border-rose-500/60'
                      : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
                  }`}
                >
                  <div className="h-16 w-12 rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 shrink-0">
                    {candidate.coverUrl ? (
                      <img
                        src={candidate.coverUrl}
                        alt={candidate.title}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[10px] text-zinc-600">
                        Sem capa
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-zinc-100 truncate">
                        {candidate.title}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <span className="font-medium text-rose-300">{srcName}</span>
                      {candidate.latestChapter && (
                        <>
                          <span className="text-zinc-600">·</span>
                          <span className="font-mono tabular-nums">
                            Último: Cap. {candidate.latestChapter}
                          </span>
                        </>
                      )}
                      {isSelected && (
                        <>
                          <span className="text-zinc-600">·</span>
                          <span className="font-mono tabular-nums text-emerald-300">
                            {loadingChapters
                              ? 'Contando capítulos...'
                              : `${candidateChapters?.length ?? 0} capítulos encontrados`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <CheckCircle2 className="h-5 w-5 text-rose-400 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer & Migration Confirmation */}
        <div className="px-5 py-4 border-t border-zinc-800 bg-zinc-900/60 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <label className="inline-flex items-center gap-2 text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={removeOldFavorite}
                onChange={e => setRemoveOldFavorite(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-950 text-rose-500 focus:ring-rose-500"
              />
              <span>Substituir entrada antiga na biblioteca e histórico</span>
            </label>
            <span className="text-zinc-500">
              Transfere favoritos, categorias, notas e capítulos lidos
            </span>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-300 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!selectedCandidate || migrating || loadingChapters}
              onClick={handleConfirmMigrate}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
            >
              {migrating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5" />
              )}
              <span>{migrating ? 'Migrando...' : 'Migrar e Abrir Obra'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
