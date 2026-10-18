import React, { useState, useEffect } from 'react';
import { BookOpen, Star, Layers } from 'lucide-react';
import { Manga } from '../types/manga.js';

interface MangaCardProps {
  manga: Manga;
  onSelect: (mangaId: string) => void;
  onQuickRead?: (mangaId: string) => void;
}

export const MangaCard: React.FC<MangaCardProps> = ({ manga, onSelect, onQuickRead }) => {
  const [currentCover, setCurrentCover] = useState(manga.coverUrl);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setCurrentCover(manga.coverUrl);
    setImageError(false);
  }, [manga.coverUrl]);

  const handleImageError = () => {
    if (currentCover && !currentCover.startsWith('/api/proxy/image') && currentCover.startsWith('http')) {
      setCurrentCover(`/api/proxy/image?url=${encodeURIComponent(currentCover)}`);
    } else {
      setImageError(true);
    }
  };

  const primarySource = manga.sources[0]?.sourceName || (
    manga.id.includes('mangadex') ? 'MangaDex' :
    manga.id.includes('comick') ? 'Comick' :
    manga.id.includes('weebcentral') ? 'WeebCentral' :
    manga.id.includes('mangapill') ? 'MangaPill' :
    'Live'
  );
  const releaseYear = manga.publicationInfo?.releaseYear;
  const demographic = manga.publicationInfo?.demographic;

  const isAvailable = manga.hasAvailableChapters !== false;
  const isAdult = Boolean(manga.isAdult || manga.contentRating === 'erotica' || manga.contentRating === 'pornographic');

  return (
    <div
      onClick={() => onSelect(manga.id)}
      className={`group relative flex flex-col cursor-pointer bg-zinc-900/60 hover:bg-zinc-900 border rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-1 shadow-sm hover:shadow-xl ${
        isAvailable
          ? 'border-zinc-800/80 hover:border-zinc-700/80'
          : 'border-zinc-800/40 opacity-80 hover:opacity-100 hover:border-amber-500/40'
      }`}
    >
      {/* Cover Image Container */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-950">
        {!imageError ? (
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
          <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-900 p-4 text-center">
            <BookOpen className="h-8 w-8 text-zinc-600 mb-2" />
            <span className="text-xs text-zinc-400 font-medium line-clamp-2">{manga.title}</span>
          </div>
        )}

        {/* Gradient scrim for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

        {/* Source and Badges Overlay */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1 text-xs">
          <span className="backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border bg-zinc-950/90 text-emerald-300 border-emerald-500/40 truncate max-w-[130px]">
            {manga.sources[0]?.sourceId === 'comick' ? 'Comick (Ao Vivo)' :
             manga.sources[0]?.sourceId === 'mangadex' ? 'MangaDex (Ao Vivo)' :
             manga.sources[0]?.sourceId === 'weebcentral' ? 'WeebCentral (Ao Vivo)' :
             manga.sources[0]?.sourceId === 'mangapill' ? 'MangaPill (Ao Vivo)' :
             primarySource}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {isAdult && (
              <span className="bg-rose-950/90 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold text-rose-300 border border-rose-600/50">
                +18
              </span>
            )}
            {!isAvailable && (
              <span className="bg-amber-950/90 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-300 border border-amber-600/40">
                Sem Capítulos
              </span>
            )}
            {manga.rating && isAvailable && (
              <span className="flex items-center gap-1 bg-zinc-950/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[11px] font-mono font-medium text-amber-300 border border-zinc-800 tabular-nums">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {manga.rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>

        {/* Quick Read / Details Hover Button */}
        <div className="absolute inset-x-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {isAvailable && onQuickRead ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onQuickRead(manga.id);
              }}
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Ler Agora
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(manga.id);
              }}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg shadow-lg flex items-center justify-center gap-1.5 transition-colors border border-zinc-700/80 cursor-pointer"
            >
              Ver Detalhes
            </button>
          )}
        </div>
      </div>

      {/* Card Content */}
      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="font-semibold text-sm text-zinc-100 line-clamp-1 group-hover:text-rose-400 transition-colors">
          {manga.title}
        </h3>

        {/* Clean unboxed metadata with dot separators */}
        <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="line-clamp-1">{manga.authors[0] || 'Autor'}</span>
          {releaseYear && (
            <>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span className="font-mono tabular-nums">{releaseYear}</span>
            </>
          )}
        </div>

        {/* Genres & chapter count */}
        <div className="mt-2.5 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
          <span className="line-clamp-1 text-[11px] text-zinc-400">
            {manga.genres.slice(0, 2).join(' · ')}
          </span>
          {isAvailable && manga.latestChapter ? (
            <span className="shrink-0 font-mono text-[11px] text-zinc-400 tabular-nums">
              Cap. {manga.latestChapter}
            </span>
          ) : !isAvailable ? (
            <span className="shrink-0 text-[10px] text-amber-400/90 font-medium">
              Apenas Catálogo
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
