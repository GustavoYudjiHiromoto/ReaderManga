import React, { useState, useEffect } from 'react';
import {
  X,
  HardDriveDownload,
  BookOpen,
  Trash2,
  AlertTriangle,
  Clock,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Layers,
  Database
} from 'lucide-react';
import { OfflineCacheService, SavedOfflineChapter } from '../services/offlineCache.js';

interface DownloadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReadChapter: (mangaId: string, chapterId: string) => void;
  onNavigateToCatalog?: () => void;
}

export const DownloadsModal: React.FC<DownloadsModalProps> = ({
  isOpen,
  onClose,
  onReadChapter,
  onNavigateToCatalog
}) => {
  const [savedChapters, setSavedChapters] = useState<SavedOfflineChapter[]>([]);
  const [storageEstimate, setStorageEstimate] = useState<{ count: number; totalPages: number; estimatedMb: number }>({
    count: 0,
    totalPages: 0,
    estimatedMb: 0
  });
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const refreshList = async () => {
    const list = OfflineCacheService.getAllSavedChapters();
    setSavedChapters(list);
    const est = await OfflineCacheService.estimateStorageUsage();
    setStorageEstimate(est);
  };

  useEffect(() => {
    if (isOpen) {
      refreshList();
      setConfirmClearAll(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const unsubscribe = OfflineCacheService.subscribe(() => {
      refreshList();
    });
    return unsubscribe;
  }, []);

  if (!isOpen) return null;

  const handleDeleteChapter = async (e: React.MouseEvent, chapterId: string) => {
    e.stopPropagation();
    await OfflineCacheService.removeChapter(chapterId);
  };

  const handleClearAll = async () => {
    await OfflineCacheService.clearAllOfflineData();
    setConfirmClearAll(false);
  };

  const filteredChapters = savedChapters.filter((ch) => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return (
      ch.mangaTitle.toLowerCase().includes(term) ||
      ch.chapterNumber.toLowerCase().includes(term) ||
      (ch.chapterTitle && ch.chapterTitle.toLowerCase().includes(term))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <HardDriveDownload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                Leitura Offline & Downloads
                {savedChapters.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-xs font-mono tabular-nums">
                    {savedChapters.length}
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">
                Capítulos armazenados localmente no navegador (CacheStorage) para leitura 100% sem internet
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Storage Summary Bar */}
        {savedChapters.length > 0 && (
          <div className="px-6 py-3 bg-zinc-950/40 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4 text-zinc-300">
              <span className="flex items-center gap-1.5 font-medium">
                <Database className="h-3.5 w-3.5 text-zinc-500" />
                Espaço em disco:{' '}
                <strong className="text-zinc-100 font-mono font-semibold">
                  ~{storageEstimate.estimatedMb} MB
                </strong>
              </span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400">
                <strong className="text-zinc-200 font-mono">{storageEstimate.totalPages}</strong> páginas salvas
              </span>
            </div>

            {confirmClearAll ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Certeza?
                </span>
                <button
                  onClick={handleClearAll}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-medium transition-colors cursor-pointer"
                >
                  Confirmar Exclusão
                </button>
                <button
                  onClick={() => setConfirmClearAll(false)}
                  className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClearAll(true)}
                className="text-zinc-400 hover:text-rose-400 transition-colors flex items-center gap-1 cursor-pointer"
                title="Excluir todos os capítulos do cache offline"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Limpar Todo Cache</span>
              </button>
            )}
          </div>
        )}

        {/* Search filter if multiple chapters */}
        {savedChapters.length > 3 && (
          <div className="px-6 pt-3 pb-1">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filtrar por obra ou número do capítulo..."
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
            />
          </div>
        )}

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {savedChapters.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center text-zinc-500">
                <HardDriveDownload className="h-8 w-8 text-zinc-400" />
              </div>
              <h3 className="text-base font-semibold text-zinc-200 mb-1">
                Nenhum capítulo salvo para leitura offline
              </h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto mb-6">
                Você pode salvar capítulos diretamente no leitor ou na página de detalhes da obra para ler quando estiver no avião, metrô ou sem internet.
              </p>
              {onNavigateToCatalog && (
                <button
                  onClick={() => {
                    onClose();
                    onNavigateToCatalog();
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-950/40"
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Explorar Obras no Catálogo</span>
                </button>
              )}
            </div>
          ) : filteredChapters.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-xs">
              Nenhum capítulo corresponde ao filtro &ldquo;{searchFilter}&rdquo;.
            </div>
          ) : (
            filteredChapters.map((ch) => {
              const formattedDate = new Date(ch.savedAt).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={ch.chapterId}
                  className="group flex items-center justify-between gap-4 p-3.5 bg-zinc-950/70 hover:bg-zinc-950 border border-zinc-800/80 rounded-xl transition-all"
                >
                  <div className="flex items-center gap-3.5 overflow-hidden">
                    {ch.mangaCover ? (
                      <img
                        src={ch.mangaCover}
                        alt={ch.mangaTitle}
                        referrerPolicy="no-referrer"
                        className="w-12 h-16 object-cover rounded-lg shrink-0 bg-zinc-900 border border-zinc-800"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-12 h-16 rounded-lg shrink-0 bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600">
                        <BookOpen className="h-5 w-5" />
                      </div>
                    )}

                    <div className="overflow-hidden">
                      <h4 className="font-semibold text-sm text-zinc-100 line-clamp-1 group-hover:text-rose-400 transition-colors">
                        {ch.mangaTitle}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-medium text-rose-300 font-mono bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                          Cap. {ch.chapterNumber}
                        </span>
                        {ch.chapterTitle && (
                          <span className="text-xs text-zinc-400 line-clamp-1">
                            {ch.chapterTitle}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-1.5">
                        <span className="font-mono">{ch.pageCount} páginas</span>
                        <span>·</span>
                        <span>Salvo em {formattedDate}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        onReadChapter(ch.mangaId, ch.chapterId);
                        onClose();
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-md"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Ler</span>
                    </button>

                    <button
                      onClick={(e) => handleDeleteChapter(e, ch.chapterId)}
                      className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
                      title="Excluir do cache offline"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info note */}
        <div className="px-6 py-3 border-t border-zinc-800/80 bg-zinc-950/40 text-[11px] text-zinc-500 flex items-center justify-between">
          <span>Os capítulos salvos continuam disponíveis mesmo após fechar o navegador.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-xs font-medium transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
