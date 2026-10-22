import React, { useState, useEffect } from 'react';
import {
  X,
  Bookmark,
  BookOpen,
  Trash2,
  Calendar,
  Layers,
  ArrowRight,
  ExternalLink,
  MessageSquare
} from 'lucide-react';
import { PageBookmark } from '../types/manga.js';
import { HistoryService } from '../services/history.js';

interface PageBookmarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMangaId?: string;
  onJumpToPage: (mangaId: string, chapterId: string, pageNumber: number) => void;
}

export const PageBookmarksModal: React.FC<PageBookmarksModalProps> = ({
  isOpen,
  onClose,
  currentMangaId,
  onJumpToPage
}) => {
  const [bookmarks, setBookmarks] = useState<PageBookmark[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'current'>(currentMangaId ? 'current' : 'all');
  const [searchFilter, setSearchFilter] = useState('');

  const refreshBookmarks = () => {
    setBookmarks(HistoryService.getPageBookmarks());
  };

  useEffect(() => {
    if (isOpen) {
      refreshBookmarks();
      if (currentMangaId) setFilterMode('current');
    }
  }, [isOpen, currentMangaId]);

  useEffect(() => {
    const unsubscribe = HistoryService.subscribe(() => {
      refreshBookmarks();
    });
    return unsubscribe;
  }, []);

  if (!isOpen) return null;

  const filteredBookmarks = bookmarks.filter((bm) => {
    if (filterMode === 'current' && currentMangaId && bm.mangaId !== currentMangaId) {
      return false;
    }
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return (
      bm.mangaTitle.toLowerCase().includes(term) ||
      bm.chapterNumber.toLowerCase().includes(term) ||
      (bm.note && bm.note.toLowerCase().includes(term))
    );
  });

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    HistoryService.removePageBookmark(id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Bookmark className="h-5 w-5 fill-rose-500/20" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                Marcadores de Páginas
                {bookmarks.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-xs font-mono">
                    {bookmarks.length}
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">
                Páginas salvas para releitura rápida e destaques visuais
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar & Filter Tabs */}
        <div className="px-6 py-3 bg-zinc-950/40 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          {currentMangaId && (
            <div className="flex items-center gap-1 p-0.5 bg-zinc-900 border border-zinc-800 rounded-lg">
              <button
                onClick={() => setFilterMode('current')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  filterMode === 'current'
                    ? 'bg-zinc-800 text-rose-300 font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Esta Obra
              </button>
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-zinc-800 text-rose-300 font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Todas as Obras ({bookmarks.length})
              </button>
            </div>
          )}

          {bookmarks.length > 3 && (
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filtrar marcadores..."
              className="px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
            />
          )}
        </div>

        {/* Bookmarks Grid / List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {filteredBookmarks.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-zinc-800/40 border border-zinc-700/50 flex items-center justify-center text-zinc-500">
                <Bookmark className="h-8 w-8 text-zinc-500" />
              </div>
              <h3 className="text-base font-semibold text-zinc-200 mb-1">
                Nenhuma página marcada ainda
              </h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Durante a leitura, toque no botão de marcador para salvar páginas especiais, cenas épicas ou frases memoráveis.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredBookmarks.map((bm) => {
                const dateStr = new Date(bm.createdAt).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div
                    key={bm.id}
                    onClick={() => {
                      onJumpToPage(bm.mangaId, bm.chapterId, bm.pageNumber);
                      onClose();
                    }}
                    className="group relative flex gap-3.5 p-3 rounded-xl bg-zinc-950/70 hover:bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 transition-all cursor-pointer overflow-hidden shadow-sm hover:shadow-lg"
                  >
                    {/* Thumbnail */}
                    <div className="w-16 h-24 rounded-lg bg-zinc-900 border border-zinc-800 shrink-0 overflow-hidden relative">
                      <img
                        src={bm.imageUrl}
                        alt={`Página ${bm.pageNumber}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        onError={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          if (!img.src.startsWith('/api/proxy/image') && img.src.startsWith('http')) {
                            img.src = `/api/proxy/image?url=${encodeURIComponent(bm.imageUrl)}`;
                          }
                        }}
                      />
                      <span className="absolute bottom-1 right-1 bg-black/80 backdrop-blur-sm text-[10px] font-mono text-zinc-200 px-1 py-0.2 rounded font-semibold">
                        p.{bm.pageNumber}
                      </span>
                    </div>

                    {/* Metadata & Actions */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <h4 className="font-semibold text-xs sm:text-sm text-zinc-100 truncate group-hover:text-rose-400 transition-colors">
                          {bm.mangaTitle}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-mono font-medium text-rose-300 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20">
                            Cap. {bm.chapterNumber}
                          </span>
                          <span className="text-[11px] text-zinc-400">
                            Página {bm.pageNumber}
                          </span>
                        </div>

                        {bm.note && (
                          <p className="text-[11px] text-amber-300/90 italic mt-1.5 line-clamp-2 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                            &ldquo;{bm.note}&rdquo;
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-zinc-900 text-[10px] text-zinc-500">
                        <span>{dateStr}</span>
                        <button
                          onClick={(e) => handleDelete(e, bm.id)}
                          className="p-1 text-zinc-500 hover:text-rose-400 transition-colors rounded cursor-pointer"
                          title="Excluir marcador"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950/60 text-[11px] text-zinc-500 flex items-center justify-between">
          <span>Os marcadores são sincronizados com seu backup de biblioteca.</span>
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
