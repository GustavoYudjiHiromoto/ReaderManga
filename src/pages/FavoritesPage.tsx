import React, { useState, useEffect } from 'react';
import { Bookmark, BookOpen, Trash2, ArrowRight, Sparkles, Heart } from 'lucide-react';
import { FavoriteManga, Manga } from '../types/manga.js';
import { HistoryService } from '../services/history.js';
import { MangaCard } from '../components/MangaCard.js';
import { MangaApi } from '../services/api.js';

interface FavoritesPageProps {
  onSelectManga: (mangaId: string) => void;
  onReadChapter?: (mangaId: string, chapterId: string) => void;
  onNavigateToCatalog: () => void;
}

export const FavoritesPage: React.FC<FavoritesPageProps> = ({
  onSelectManga,
  onReadChapter,
  onNavigateToCatalog
}) => {
  const [favorites, setFavorites] = useState<FavoriteManga[]>([]);

  useEffect(() => {
    // Initial load
    setFavorites(HistoryService.getFavorites());

    // Subscribe to real-time changes
    const unsubscribe = HistoryService.subscribe(() => {
      setFavorites(HistoryService.getFavorites());
    });

    return unsubscribe;
  }, []);

  const handleRemove = (e: React.MouseEvent, mangaId: string) => {
    e.stopPropagation();
    HistoryService.removeFavorite(mangaId);
  };

  const handleQuickRead = async (mangaId: string) => {
    // If progress exists, resume from saved chapter
    const progress = HistoryService.getProgress(mangaId);
    if (progress && onReadChapter) {
      onReadChapter(mangaId, progress.chapterId);
      return;
    }

    try {
      const chapters = await MangaApi.getChapters(mangaId, { order: 'asc' });
      if (chapters.length > 0 && onReadChapter) {
        onReadChapter(mangaId, chapters[0].id);
      } else {
        onSelectManga(mangaId);
      }
    } catch {
      onSelectManga(mangaId);
    }
  };

  // Convert FavoriteManga to lightweight Manga for MangaCard rendering without API calls
  const mapFavoriteToManga = (fav: FavoriteManga): Manga => {
    return {
      id: fav.mangaId,
      title: fav.title,
      altTitles: [],
      coverUrl: fav.coverUrl,
      synopsis: '',
      authors: fav.authors && fav.authors.length > 0 ? fav.authors : ['Coleção'],
      artists: [],
      genres: fav.genres && fav.genres.length > 0 ? fav.genres : ['Favorito'],
      status: fav.status || 'ongoing',
      publicationInfo: {},
      sources: [
        {
          sourceId: fav.sourceId || (
            fav.mangaId.includes('mangadex') ? 'mangadex' :
            fav.mangaId.includes('comick') ? 'comick' :
            fav.mangaId.includes('weebcentral') ? 'weebcentral' :
            fav.mangaId.includes('guya') ? 'guya' : 'unknown'
          ),
          externalId: '',
          sourceName: fav.sourceName || (
            fav.mangaId.includes('mangadex') ? 'MangaDex' :
            fav.mangaId.includes('comick') ? 'Comick' :
            fav.mangaId.includes('weebcentral') ? 'WeebCentral' :
            fav.mangaId.includes('guya') ? 'Guya/Cubari' : 'Manga'
          )
        }
      ],
      rating: fav.rating,
      updatedAt: new Date(fav.updatedAt).toISOString()
    };
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <Bookmark className="h-5 w-5 fill-rose-500/30" />
              </div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Minha Biblioteca
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400">
              Suas obras favoritas salvas localmente para acesso rápido e acompanhamento
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 font-mono tabular-nums">
              {favorites.length} {favorites.length === 1 ? 'obra favoritada' : 'obras favoritadas'}
            </span>
          </div>
        </div>

        {/* Empty State */}
        {favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-zinc-900/30 rounded-2xl border border-zinc-800/60 max-w-2xl mx-auto my-8">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 mb-4 shadow-inner">
              <Bookmark className="h-8 w-8 text-zinc-500" />
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-zinc-200 mb-2">
              Sua biblioteca está vazia
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-md mb-6 leading-relaxed">
              Você ainda não adicionou nenhum mangá aos seus favoritos. Ao explorar obras, clique no botão &quot;Favoritar&quot; para guardá-las aqui.
            </p>
            <button
              onClick={onNavigateToCatalog}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg shadow-rose-950/50 transition-all cursor-pointer"
            >
              <BookOpen className="h-4 w-4" />
              <span>Explorar Catálogo de Mangás</span>
            </button>
          </div>
        ) : (
          /* Favorites Grid */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
            {favorites.map((fav) => (
              <div key={fav.mangaId} className="group relative">
                <MangaCard
                  manga={mapFavoriteToManga(fav)}
                  onSelect={onSelectManga}
                  onQuickRead={handleQuickRead}
                />
                
                {/* Remove button badge */}
                <button
                  onClick={(e) => handleRemove(e, fav.mangaId)}
                  title="Remover dos favoritos"
                  className="absolute top-2 right-2 z-20 p-1.5 rounded-lg bg-zinc-950/80 hover:bg-rose-950/90 text-zinc-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-500/50 opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer shadow-md backdrop-blur-sm"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
