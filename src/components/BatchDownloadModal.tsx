import React, { useState, useRef } from 'react';
import {
  X,
  HardDriveDownload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  StopCircle,
  Check,
  CheckSquare,
  Square
} from 'lucide-react';
import { Manga, Chapter } from '../types/manga.js';
import { MangaApi } from '../services/api.js';
import { OfflineCacheService } from '../services/offlineCache.js';

interface BatchDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  manga: Manga;
  chapters: Chapter[];
  readChapterIds: string[];
  savedChapterIds: string[];
}

export const BatchDownloadModal: React.FC<BatchDownloadModalProps> = ({
  isOpen,
  onClose,
  manga,
  chapters,
  readChapterIds,
  savedChapterIds
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<{
    currentIndex: number;
    total: number;
    currentChapterNumber: string;
    subStatus?: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isCancelledRef = useRef(false);

  if (!isOpen) return null;

  // Filter unread and unsaved chapters
  const unsavedChapters = chapters.filter(c => !savedChapterIds.includes(c.id));
  const unreadUnsavedChapters = unsavedChapters.filter(c => !readChapterIds.includes(c.id));

  const handleSelectNext = (count: number) => {
    const targetList = unreadUnsavedChapters.length > 0 ? unreadUnsavedChapters : unsavedChapters;
    const toSelect = targetList.slice(0, count).map(c => c.id);
    setSelectedIds(toSelect);
  };

  const handleSelectAllUnsaved = () => {
    setSelectedIds(unsavedChapters.map(c => c.id));
  };

  const handleToggleChapter = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(x => x !== id));
    } else {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const handleStartDownload = async () => {
    if (selectedIds.length === 0 || isDownloading) return;

    setIsDownloading(true);
    setErrorMsg(null);
    isCancelledRef.current = false;

    const chaptersToDownload = chapters.filter(c => selectedIds.includes(c.id));

    for (let i = 0; i < chaptersToDownload.length; i++) {
      if (isCancelledRef.current) break;

      const ch = chaptersToDownload[i];
      setCurrentProgress({
        currentIndex: i + 1,
        total: chaptersToDownload.length,
        currentChapterNumber: ch.chapterNumber,
        subStatus: 'Obtendo páginas do capítulo...'
      });

      try {
        const pages = await MangaApi.getChapterPages(ch.id);
        if (isCancelledRef.current) break;

        setCurrentProgress(prev => prev ? {
          ...prev,
          subStatus: `Armazenando ${pages.length} páginas no cache local...`
        } : null);

        await OfflineCacheService.cacheChapter(ch.id, pages, {
          mangaId: manga.id,
          mangaTitle: manga.title,
          mangaCover: manga.coverUrl,
          chapterNumber: ch.chapterNumber,
          chapterTitle: ch.title
        });
      } catch (err) {
        console.warn(`Failed to cache chapter ${ch.id}:`, err);
      }
    }

    setIsDownloading(false);
    setCurrentProgress(null);
    if (!isCancelledRef.current) {
      onClose();
    }
  };

  const handleCancelDownload = () => {
    isCancelledRef.current = true;
    setIsDownloading(false);
    setCurrentProgress(null);
  };

  const percent = currentProgress
    ? Math.round(((currentProgress.currentIndex - 1) / currentProgress.total) * 100)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={isDownloading ? undefined : onClose}
    >
      <div
        className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <HardDriveDownload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                Baixar Capítulos em Lote
              </h2>
              <p className="text-xs text-zinc-400">
                Salvar múltiplos capítulos para leitura offline ininterrupta
              </p>
            </div>
          </div>
          {!isDownloading && (
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Downloading Active State */}
        {isDownloading && currentProgress ? (
          <div className="p-8 text-center space-y-5">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <Loader2 className="h-14 w-14 text-rose-500 animate-spin" />
              <span className="absolute font-mono text-xs font-bold text-zinc-200">
                {percent}%
              </span>
            </div>

            <div>
              <h3 className="text-base font-semibold text-zinc-100">
                Baixando Capítulo {currentProgress.currentChapterNumber}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Progresso: {currentProgress.currentIndex} de {currentProgress.total} capítulos selecionados
              </p>
              {currentProgress.subStatus && (
                <p className="text-[11px] text-zinc-500 mt-2 font-mono">
                  {currentProgress.subStatus}
                </p>
              )}
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-rose-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(5, percent)}%` }}
              />
            </div>

            <button
              onClick={handleCancelDownload}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-rose-400 hover:text-rose-300 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 mx-auto cursor-pointer"
            >
              <StopCircle className="h-4 w-4" />
              <span>Interromper Download</span>
            </button>
          </div>
        ) : (
          <>
            {/* Quick Presets */}
            <div className="p-6 pb-3 border-b border-zinc-800/80 bg-zinc-950/20">
              <span className="text-xs font-semibold text-zinc-400 block mb-2.5 uppercase tracking-wider">
                Seleção Rápida
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleSelectNext(5)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
                >
                  Próximos 5 Não Salvos
                </button>
                <button
                  onClick={() => handleSelectNext(10)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
                >
                  Próximos 10 Não Salvos
                </button>
                <button
                  onClick={handleSelectAllUnsaved}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
                >
                  Todos os Não Salvos ({unsavedChapters.length})
                </button>
                {selectedIds.length > 0 && (
                  <button
                    onClick={() => setSelectedIds([])}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors cursor-pointer"
                  >
                    Desmarcar Todos
                  </button>
                )}
              </div>
            </div>

            {/* Chapter Selection Checklist */}
            <div className="p-6 overflow-y-auto max-h-[45vh] space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                <span>Capítulo</span>
                <span className="font-mono">{selectedIds.length} selecionado(s)</span>
              </div>

              {chapters.map((ch) => {
                const isAlreadySaved = savedChapterIds.includes(ch.id);
                const isSelected = selectedIds.includes(ch.id);

                return (
                  <div
                    key={ch.id}
                    onClick={() => {
                      if (!isAlreadySaved) handleToggleChapter(ch.id);
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors ${
                      isAlreadySaved
                        ? 'bg-zinc-950/40 border-zinc-800/40 opacity-50 cursor-not-allowed'
                        : isSelected
                        ? 'bg-rose-950/20 border-rose-500/40 cursor-pointer'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isAlreadySaved ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : isSelected ? (
                        <CheckSquare className="h-4 w-4 text-rose-400 shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-zinc-600 shrink-0" />
                      )}

                      <span className="font-medium text-zinc-200">
                        Capítulo {ch.chapterNumber}
                        {ch.title && ` - ${ch.title}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isAlreadySaved && (
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          Já Salvo
                        </span>
                      )}
                      {ch.pagesCount && (
                        <span className="text-[11px] text-zinc-500 font-mono">
                          {ch.pagesCount} págs
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer with confirmation button */}
            <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-400">
                {selectedIds.length === 0
                  ? 'Selecione capítulos para baixar'
                  : `${selectedIds.length} capítulo(s) pronto(s) para download`}
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleStartDownload}
                  disabled={selectedIds.length === 0}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-md shadow-rose-950/40 cursor-pointer"
                >
                  <HardDriveDownload className="h-3.5 w-3.5" />
                  <span>Baixar {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
