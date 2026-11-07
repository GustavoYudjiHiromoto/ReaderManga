import React, { useMemo } from 'react';
import { X, BookOpen, Trash2, ArrowRight, Clock, Download, HardDriveDownload, Calendar } from 'lucide-react';
import { ReadingProgress } from '../types/manga.js';
import { HistoryService } from '../services/history.js';
import { OfflineCacheService } from '../services/offlineCache.js';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: ReadingProgress[];
  onResume: (progress: ReadingProgress) => void;
  onRemove: (mangaId: string) => void;
}

function getDayLabel(timestamp: number): string {
  if (!timestamp) return 'Anteriores';
  const itemDate = new Date(timestamp);
  const now = new Date();

  const isToday = itemDate.toDateString() === now.toDateString();
  if (isToday) return 'Hoje';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = itemDate.toDateString() === yesterday.toDateString();
  if (isYesterday) return 'Ontem';

  const diffDays = Math.floor((now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return 'Esta Semana';
  }

  return itemDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onResume,
  onRemove
}) => {
  const groupedHistory = useMemo(() => {
    const groups: { label: string; items: ReadingProgress[] }[] = [];
    const map = new Map<string, ReadingProgress[]>();

    for (const item of history) {
      const label = getDayLabel(item.updatedAt);
      if (!map.has(label)) {
        map.set(label, []);
        groups.push({ label, items: map.get(label)! });
      }
      map.get(label)!.push(item);
    }
    return groups;
  }, [history]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-rose-400" />
            <h2 className="text-base font-semibold text-zinc-100">Histórico de Leitura</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content with day grouping */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {history.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <BookOpen className="h-10 w-10 mx-auto mb-3 text-zinc-600" />
              <p className="text-sm">Você ainda não começou a ler nenhum mangá.</p>
              <p className="text-xs text-zinc-600 mt-1">Seu progresso será registrado automaticamente conforme você lê.</p>
            </div>
          ) : (
            groupedHistory.map((group) => (
              <div key={group.label} className="space-y-3">
                {/* Day Header Divider */}
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  <Calendar className="h-3.5 w-3.5 text-rose-400/80" />
                  <span>{group.label}</span>
                  <div className="flex-1 h-px bg-zinc-800/80" />
                </div>

                <div className="space-y-3">
                  {group.items.map((item) => {
                    const percent = item.totalPages > 0 ? Math.round((item.pageNumber / item.totalPages) * 100) : 0;
                    return (
                      <div
                        key={item.mangaId}
                        className="group relative flex gap-3.5 p-3 bg-zinc-950/60 hover:bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700/80 rounded-xl transition-all shadow-sm"
                      >
                        <img
                          src={item.mangaCover}
                          alt={item.mangaTitle}
                          referrerPolicy="no-referrer"
                          className="w-14 h-20 object-cover rounded-lg shrink-0 bg-zinc-900 border border-zinc-800"
                        />
                        <div className="flex flex-1 flex-col justify-between overflow-hidden">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-semibold text-sm text-zinc-200 line-clamp-1 group-hover:text-rose-300 transition-colors">
                                {item.mangaTitle}
                              </h4>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemove(item.mangaId);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 rounded transition-opacity cursor-pointer"
                                title="Remover do histórico"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs text-zinc-400">
                              <span className="font-medium text-zinc-300">
                                Cap. {item.chapterNumber}
                              </span>
                              {item.chapterTitle && (
                                <span className="text-zinc-500 truncate max-w-[130px]">
                                  · {item.chapterTitle}
                                </span>
                              )}
                              {OfflineCacheService.isChapterSaved(item.chapterId) && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded font-medium">
                                  <HardDriveDownload className="h-2.5 w-2.5" /> Offline
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Subtle sleek progress line */}
                          <div className="mt-2.5">
                            <div className="w-full bg-zinc-800/80 rounded-full h-1 overflow-hidden">
                              <div
                                className="bg-rose-500 h-1 rounded-full transition-all"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              onResume(item);
                              onClose();
                            }}
                            className="mt-2.5 flex items-center justify-center gap-1.5 w-full py-1.5 bg-zinc-800/80 hover:bg-rose-600 text-zinc-300 hover:text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
                          >
                            <span>Continuar Lendo</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer with backup export */}
        {history.length > 0 && (
          <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950/40">
            <button
              onClick={() => HistoryService.downloadBackupFile()}
              className="flex items-center justify-center gap-2 w-full py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-rose-400" />
              <span>Exportar Backup (Histórico + Favoritos)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
