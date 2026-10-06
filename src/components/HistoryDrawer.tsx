import React from 'react';
import { X, BookOpen, Trash2, ArrowRight, Clock } from 'lucide-react';
import { ReadingProgress } from '../types/manga.js';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: ReadingProgress[];
  onResume: (progress: ReadingProgress) => void;
  onRemove: (mangaId: string) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onResume,
  onRemove
}) => {
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {history.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <BookOpen className="h-10 w-10 mx-auto mb-3 text-zinc-600" />
              <p className="text-sm">Você ainda não começou a ler nenhum mangá.</p>
              <p className="text-xs text-zinc-600 mt-1">Seu progresso será registrado automaticamente conforme você lê.</p>
            </div>
          ) : (
            history.map((item) => {
              const percent = item.totalPages > 0 ? Math.round((item.pageNumber / item.totalPages) * 100) : 0;
              return (
                <div
                  key={item.mangaId}
                  className="group relative flex gap-4 p-3.5 bg-zinc-950/60 hover:bg-zinc-950 border border-zinc-800/80 rounded-xl transition-all"
                >
                  <img
                    src={item.mangaCover}
                    alt={item.mangaTitle}
                    referrerPolicy="no-referrer"
                    className="w-16 h-22 object-cover rounded-lg shrink-0 bg-zinc-900"
                  />
                  <div className="flex flex-1 flex-col justify-between overflow-hidden">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-sm text-zinc-200 line-clamp-1">{item.mangaTitle}</h4>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemove(item.mangaId);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 rounded transition-opacity"
                          title="Remover do histórico"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Capítulo <span className="font-mono text-zinc-300 tabular-nums">{item.chapterNumber}</span>
                        {item.chapterTitle && ` · ${item.chapterTitle}`}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-1 font-mono tabular-nums">
                        Página {item.pageNumber} de {item.totalPages} ({percent}%)
                      </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-2">
                      <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-rose-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        onResume(item);
                        onClose();
                      }}
                      className="mt-3 flex items-center justify-center gap-1.5 w-full py-1.5 bg-zinc-800 hover:bg-rose-600 text-zinc-200 hover:text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
                    >
                      <span>Continuar Lendo</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
