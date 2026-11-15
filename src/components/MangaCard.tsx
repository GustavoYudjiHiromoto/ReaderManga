import React, { useState, useEffect } from 'react';
import { BookOpen, Star, Bookmark, EyeOff, Eye } from 'lucide-react';
import { Manga, ReadingProgress } from '../types/manga.js';
import { HistoryService } from '../services/history.js';
import { TrackerStatusBadge } from './TrackerStatusBadge.js';

export type MangaCardLayoutMode = 'grid' | 'compact' | 'list';

interface MangaCardProps {
  manga: Manga;
  onSelect: (mangaId: string) => void;
  onQuickRead?: (mangaId: string) => void;
  showTrackerStatus?: boolean;
  onOpenTrackers?: (mangaId?: string, mangaTitle?: string) => void;
  layoutMode?: MangaCardLayoutMode;
  hideBookmarkButton?: boolean;
  allowDismiss?: boolean;
  onDismiss?: (manga: Manga) => void;
}

export const MangaCard: React.FC<MangaCardProps> = ({
  manga,
  onSelect,
  onQuickRead,
  showTrackerStatus = true,
  onOpenTrackers,
  layoutMode = 'grid',
  hideBookmarkButton = false,
  allowDismiss = false,
  onDismiss
}) => {
  const [currentCover, setCurrentCover] = useState(manga.coverUrl);
  const [imageError, setImageError] = useState(false);
  const [progress, setProgress] = useState<ReadingProgress | undefined>(() => HistoryService.getProgress(manga.id));
  const [isSaved, setIsSaved] = useState<boolean>(() => HistoryService.isBookmarked(manga.id));
  const [isIgnored, setIsIgnored] = useState<boolean>(() => HistoryService.isIgnored(manga.id));

  useEffect(() => {
    setCurrentCover(manga.coverUrl);
    setImageError(false);
    setProgress(HistoryService.getProgress(manga.id));
    setIsSaved(HistoryService.isBookmarked(manga.id));
    setIsIgnored(HistoryService.isIgnored(manga.id));

    const unsub = HistoryService.subscribe(() => {
      setProgress(HistoryService.getProgress(manga.id));
      setIsSaved(HistoryService.isBookmarked(manga.id));
      setIsIgnored(HistoryService.isIgnored(manga.id));
    });
    return unsub;
  }, [manga.id, manga.coverUrl]);

  const handleImageError = () => {
    if (currentCover && !currentCover.startsWith('/api/proxy/image') && currentCover.startsWith('http')) {
      setCurrentCover(`/api/proxy/image?url=${encodeURIComponent(currentCover)}`);
    } else {
      setImageError(true);
    }
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextSaved = HistoryService.toggleBookmark({
      mangaId: manga.id,
      title: manga.title,
      coverUrl: manga.coverUrl,
      sourceName: manga.sources?.[0]?.sourceName,
      sourceId: manga.sources?.[0]?.sourceId,
      rating: manga.rating,
      authors: manga.authors,
      genres: manga.genres,
      status: manga.status,
      updatedAt: Date.now()
    });
    if (nextSaved && isIgnored) {
      HistoryService.unignoreManga(manga.id);
      setIsIgnored(false);
    }
    setIsSaved(nextSaved);
  };

  const handleDismissClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDismiss) {
      onDismiss(manga);
      return;
    }
    const nextIgnored = HistoryService.toggleIgnoreManga({
      mangaId: manga.id,
      title: manga.title,
      coverUrl: manga.coverUrl,
      sourceId: manga.sources?.[0]?.sourceId,
      sourceName: manga.sources?.[0]?.sourceName
    });
    setIsIgnored(nextIgnored);
  };

  const showDismissAction = (allowDismiss && !isSaved) || isIgnored;

  const rawSource = manga.sources?.[0]?.sourceName || manga.sources?.[0]?.sourceId || (
    manga.id.includes('mangadex') ? 'MangaDex' :
    manga.id.includes('comick') ? 'Comick' :
    manga.id.includes('weebcentral') ? 'WeebCentral' :
    manga.id.includes('mangapill') ? 'MangaPill' :
    manga.id.includes('mangafire') ? 'MangaFire' :
    'Live'
  );
  const primarySource = rawSource.replace(/\s*\((LIVE|AO VIVO|API)[^)]*\)/gi, '').trim() || 'Mangá';
  const releaseYear = manga.publicationInfo?.releaseYear;
  const isAvailable = manga.hasAvailableChapters !== false;
  const isAdult = Boolean(manga.isAdult || manga.contentRating === 'erotica' || manga.contentRating === 'pornographic');
  const cleanAuthor = manga.authors?.[0] && manga.authors[0] !== 'Autor Desconhecido' && manga.authors[0] !== 'Unknown'
    ? manga.authors[0]
    : undefined;

  // =========================================================================
  // LIST MODE LAYOUT (Horizontal row with synopsis, genres, and actions)
  // =========================================================================
  if (layoutMode === 'list') {
    return (
      <div
        onClick={() => onSelect(manga.id)}
        className="manga-card-interactive group relative flex flex-row items-stretch gap-3 sm:gap-4 p-2.5 sm:p-3.5 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl cursor-pointer transition-all duration-200 shadow-sm hover:shadow-lg min-w-0"
      >
        {/* Cover Left Thumbnail */}
        <div className="relative w-20 xs:w-24 sm:w-28 aspect-[3/4] rounded-xl overflow-hidden bg-zinc-950 shrink-0 border border-zinc-800">
          {!imageError && currentCover ? (
            <img
              src={currentCover}
              alt={manga.title}
              referrerPolicy="no-referrer"
              onError={handleImageError}
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center p-2 text-center bg-zinc-900 text-zinc-500 text-[10px]">
              {manga.title}
            </div>
          )}

          {isSaved && (
            <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-rose-600/95 text-white text-[9px] font-bold shadow-md">
              Salvo
            </div>
          )}

          {progress?.chapterNumber && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-zinc-950/80 overflow-hidden">
              <div className="h-full bg-rose-500 w-full" />
            </div>
          )}
        </div>

        {/* Content Right */}
        <div className="flex flex-1 flex-col justify-between min-w-0 py-0.5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-zinc-400 mb-1">
                  <span className="font-semibold text-emerald-300">
                    {primarySource}
                  </span>
                  {releaseYear && (
                    <>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className="text-zinc-400 font-mono tabular-nums">{releaseYear}</span>
                    </>
                  )}
                  {manga.rating && (
                    <>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className="inline-flex items-center gap-0.5 text-amber-300 font-mono text-[10px] font-semibold tabular-nums">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {manga.rating.toFixed(1)}
                      </span>
                    </>
                  )}
                  {isAdult && (
                    <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-rose-950/80 text-rose-300 border border-rose-600/40">
                      +18
                    </span>
                  )}
                </div>

                <h3 className="font-semibold text-sm sm:text-base text-zinc-100 group-hover:text-rose-400 transition-colors line-clamp-2 sm:line-clamp-1 leading-snug">
                  {manga.title}
                </h3>
              </div>

              {(showDismissAction || !hideBookmarkButton) && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {showDismissAction && (
                    <button
                      type="button"
                      onClick={handleDismissClick}
                      className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border transition-colors cursor-pointer shrink-0 ${
                        isIgnored
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                          : 'bg-zinc-800/80 border-zinc-750 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'
                      }`}
                      title={isIgnored ? 'Obra dispensada (clique para restaurar)' : 'Não vou ler (ocultar das buscas)'}
                      aria-label={isIgnored ? `Restaurar ${manga.title} nas buscas` : `Dispensar ${manga.title} das buscas`}
                    >
                      {isIgnored ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  )}

                  {!hideBookmarkButton && (
                    <button
                      type="button"
                      onClick={handleToggleFavorite}
                      className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border transition-colors cursor-pointer shrink-0 ${
                        isSaved
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 hover:bg-rose-500/30'
                          : 'bg-zinc-800/80 border-zinc-750 text-zinc-400 hover:text-white hover:bg-zinc-700'
                      }`}
                      title={isSaved ? 'Remover da Biblioteca' : 'Salvar na Biblioteca'}
                    >
                      <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-rose-500' : ''}`} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {cleanAuthor && (
              <p className="text-xs text-zinc-400 mt-0.5 truncate">{cleanAuthor}</p>
            )}

            {manga.synopsis && (
              <p className="text-xs text-zinc-400 font-light line-clamp-2 mt-1.5 hidden xs:block">
                {manga.synopsis}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/60 mt-2">
            <div className="text-[11px] text-zinc-400 truncate max-w-[65%]">
              {manga.genres?.slice(0, 3).join(' · ') || 'Obra'}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {progress?.chapterNumber && (
                <span className="text-[11px] font-mono text-rose-400 font-semibold tabular-nums">
                  Lido: c.{progress.chapterNumber}
                </span>
              )}
              {isAvailable && manga.latestChapter && (
                <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                  Cap. {manga.latestChapter}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // COMPACT & STANDARD GRID MODE LAYOUT
  // =========================================================================
  const isCompact = layoutMode === 'compact';

  return (
    <div
      onClick={() => onSelect(manga.id)}
      className={`manga-card-interactive group relative flex flex-col min-w-0 cursor-pointer bg-zinc-900/65 hover:bg-zinc-900 border rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-1 shadow-sm hover:shadow-xl ${
        isAvailable
          ? 'border-zinc-800/80 hover:border-zinc-700/80'
          : 'border-zinc-800/40 opacity-85 hover:opacity-100 hover:border-amber-500/40'
      }`}
    >
      {/* Cover Image Container */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-950">
        {!imageError && currentCover ? (
          <img
            src={currentCover}
            alt={`Capa de ${manga.title}`}
            referrerPolicy="no-referrer"
            onError={handleImageError}
            className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
              !isAvailable ? 'grayscale-[0.25]' : ''
            }`}
            loading="lazy"
          />
        ) : (
          <div className="relative h-full w-full flex flex-col justify-between p-2.5 sm:p-3 overflow-hidden bg-gradient-to-br from-zinc-900 via-rose-950/20 to-zinc-950 border-b border-zinc-800">
            <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 uppercase tracking-widest border-b border-zinc-800/60 pb-1">
              <span>VOL. 1</span>
              <span>MANGA</span>
            </div>
            <div className="my-auto py-1 text-center">
              <div className="mx-auto w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-1.5 shadow-inner">
                <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
              <h4 className="font-serif font-bold text-[11px] sm:text-xs text-zinc-100 line-clamp-2 leading-snug px-1">
                {manga.title}
              </h4>
            </div>
            <div className="pt-1 border-t border-zinc-800/60 text-center">
              <span className="text-[8px] font-medium text-rose-300/80 uppercase tracking-wider truncate block">
                {manga.genres?.[0] || 'Obra'}
              </span>
            </div>
          </div>
        )}

        {/* Gradient scrim for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-transparent to-black/35 pointer-events-none" />

        {/* Source and Badges Overlay */}
        <div className="absolute top-1.5 sm:top-2 left-1.5 sm:left-2 right-1.5 sm:right-2 flex items-start justify-between gap-1 text-xs z-10 pointer-events-none">
          <span
            className={`backdrop-blur-md px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider border bg-zinc-950/85 text-emerald-300 border-emerald-500/40 pointer-events-auto truncate shadow-sm ${
              isCompact
                ? (showDismissAction ? 'text-[8px] sm:text-[9px] max-w-[calc(100%-4rem)]' : 'text-[8px] sm:text-[9px] max-w-[calc(100%-2.25rem)]')
                : (showDismissAction ? 'text-[9px] sm:text-[10px] max-w-[calc(100%-4.75rem)]' : 'text-[9px] sm:text-[10px] max-w-[calc(100%-2.75rem)]')
            }`}
          >
            {primarySource}
          </span>

          <div className="flex items-center gap-1 shrink-0 pointer-events-auto">
            {isAdult && !isCompact && (
              <span className="bg-rose-950/90 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-rose-300 border border-rose-600/50 shadow-sm">
                +18
              </span>
            )}

            {/* Quick 1-tap Dismiss ("Não vou ler") Button */}
            {showDismissAction && (
              <button
                type="button"
                onClick={handleDismissClick}
                className={`flex items-center justify-center rounded-lg backdrop-blur-md border transition-all cursor-pointer shadow-md ${
                  isCompact ? 'h-7 w-7' : 'h-8 w-8 sm:h-8 sm:w-8'
                } ${
                  isIgnored
                    ? 'bg-amber-600/90 border-amber-400 text-white'
                    : 'bg-zinc-950/85 hover:bg-zinc-900 border-zinc-700/80 text-zinc-300 hover:text-amber-300'
                }`}
                title={isIgnored ? 'Dispensado (clique para restaurar nas buscas)' : 'Não vou ler (ocultar das buscas sem favoritar)'}
                aria-label={isIgnored ? `Restaurar ${manga.title} nas buscas` : `Dispensar ${manga.title} das buscas`}
              >
                {isIgnored ? (
                  <Eye className={isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                ) : (
                  <EyeOff className={isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                )}
              </button>
            )}

            {/* Quick 1-tap Favorite/Bookmark Button on the card */}
            {!hideBookmarkButton && (
              <button
                type="button"
                onClick={handleToggleFavorite}
                className={`flex items-center justify-center rounded-lg backdrop-blur-md border transition-all cursor-pointer shadow-md ${
                  isCompact ? 'h-7 w-7' : 'h-8 w-8 sm:h-8 sm:w-8'
                } ${
                  isSaved
                    ? 'bg-rose-600 border-rose-500 text-white shadow-rose-950/60'
                    : 'bg-zinc-950/85 hover:bg-zinc-900 border-zinc-700/80 text-zinc-300 hover:text-white'
                }`}
                title={isSaved ? 'Salvo na Biblioteca (clique para remover)' : 'Favoritar este mangá'}
                aria-label={isSaved ? `Remover ${manga.title} da biblioteca` : `Salvar ${manga.title} na biblioteca`}
              >
                <Bookmark className={`${isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5'} ${isSaved ? 'fill-white' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Reading Progress Indicator Bar at bottom of cover */}
        {progress && progress.chapterNumber && (
          <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none">
            <div className="h-1 w-full bg-zinc-950/80 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.max(15, Math.round(((parseFloat(progress.chapterNumber) || 1) / (parseFloat(manga.latestChapter || '100') || 100)) * 100)))}%`
                }}
              />
            </div>
          </div>
        )}

        {/* Quick Read / Details Hover Button (Desktop pointer devices only) */}
        {!isCompact && (
          <div className="absolute inset-x-2.5 bottom-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20 hidden md:block">
            {isAvailable && onQuickRead ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickRead(manga.id);
                }}
                className="w-full py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>{progress ? `Cap. ${progress.chapterNumber}` : 'Ler Agora'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(manga.id);
                }}
                className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg shadow-lg flex items-center justify-center gap-1.5 transition-colors border border-zinc-700/80 cursor-pointer"
              >
                <span>Ver Detalhes</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className={`flex flex-1 flex-col justify-between gap-1.5 ${isCompact ? 'p-1.5 sm:p-2' : 'p-2.5 sm:p-3'}`}>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-1 min-w-0">
            <h3
              className={`font-semibold text-zinc-100 group-hover:text-rose-400 transition-colors line-clamp-2 leading-snug min-w-0 flex-1 ${
                isCompact ? 'text-[11px] sm:text-xs min-h-[28px] sm:min-h-[32px]' : 'text-xs sm:text-sm min-h-[32px] sm:min-h-[36px]'
              }`}
              title={manga.title}
            >
              {manga.title}
            </h3>
            {showTrackerStatus !== false && !isCompact && (
              <TrackerStatusBadge
                mangaId={manga.id}
                mangaTitle={manga.title}
                size="sm"
                onOpenTrackers={onOpenTrackers}
                className="shrink-0"
              />
            )}
          </div>
        </div>

        {/* Clean, tightly-aligned metadata row */}
        <div className={`flex items-center justify-between gap-1 text-zinc-400 font-mono min-w-0 ${isCompact ? 'text-[9px] sm:text-[10px]' : 'text-[10px] sm:text-[11px]'}`}>
          <span className="truncate min-w-0 text-zinc-400">
            {isCompact
              ? (releaseYear || manga.genres?.[0] || 'Mangá')
              : (cleanAuthor || releaseYear || manga.genres?.[0] || 'Mangá')}
          </span>

          {progress?.chapterNumber ? (
            <span className="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 font-semibold tabular-nums shrink-0 text-[9px] sm:text-[10px]">
              {isCompact ? `c.${progress.chapterNumber}` : `Lido: c.${progress.chapterNumber}`}
            </span>
          ) : isAvailable && manga.latestChapter ? (
            <span className="text-zinc-400 tabular-nums shrink-0">
              {isCompact ? `c.${manga.latestChapter}` : `Cap. ${manga.latestChapter}`}
            </span>
          ) : manga.rating ? (
            <span className="inline-flex items-center gap-0.5 text-amber-300 font-mono tabular-nums shrink-0 font-semibold">
              <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
              {manga.rating.toFixed(1)}
            </span>
          ) : !isAvailable ? (
            <span className="text-amber-400/90 shrink-0 font-medium">Catálogo</span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
