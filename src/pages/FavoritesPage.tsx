import React, { useState, useEffect, useRef } from 'react';
import {
  Bookmark,
  BookOpen,
  Trash2,
  ArrowRight,
  Sparkles,
  Heart,
  Download,
  Upload,
  AlertCircle,
  Check,
  Search,
  RefreshCw,
  Filter,
  ArrowUpDown,
  Bell,
  Clock,
  X
} from 'lucide-react';
import { FavoriteManga, Manga, ReadingProgress } from '../types/manga.js';
import { HistoryService } from '../services/history.js';
import { MangaCard } from '../components/MangaCard.js';
import { MangaApi } from '../services/api.js';
import { ReadingStatsSummary } from '../components/ReadingStatsSummary.js';

interface FavoritesPageProps {
  onSelectManga: (mangaId: string) => void;
  onReadChapter?: (mangaId: string, chapterId: string) => void;
  onNavigateToCatalog: () => void;
}

interface UpdateInfo {
  latestChapterId: string;
  latestChapterNumber: string;
  hasNew: boolean;
  lastReadNumber?: string;
}

export const FavoritesPage: React.FC<FavoritesPageProps> = ({
  onSelectManga,
  onReadChapter,
  onNavigateToCatalog
}) => {
  const [favorites, setFavorites] = useState<FavoriteManga[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search, filter & sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState('all');
  const [sortBy, setSortBy] = useState<'recent' | 'title-asc' | 'title-desc'>('recent');
  const [filterOnlyUnread, setFilterOnlyUnread] = useState(false);

  // Live update tracker state
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateCheckProgress, setUpdateCheckProgress] = useState<string | null>(null);
  const [updatesMap, setUpdatesMap] = useState<Record<string, UpdateInfo>>({});

  useEffect(() => {
    // Initial load
    setFavorites(HistoryService.getFavorites());

    // Subscribe to real-time changes
    const unsubscribe = HistoryService.subscribe(() => {
      setFavorites(HistoryService.getFavorites());
    });

    return unsubscribe;
  }, []);

  const handleExport = () => {
    HistoryService.downloadBackupFile();
    setNotification({
      type: 'success',
      message: 'Backup da biblioteca exportado com sucesso!'
    });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = HistoryService.importBackup(content);
      if (res.success) {
        setNotification({
          type: 'success',
          message: `Restauração concluída! ${res.favoritesAdded} novo(s) favorito(s) e ${res.historyAdded} histórico(s) mesclados.`
        });
      } else {
        setNotification({
          type: 'error',
          message: res.message || 'Falha ao importar o arquivo de backup.'
        });
      }
      setTimeout(() => setNotification(null), 5000);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleRemove = (e: React.MouseEvent, mangaId: string) => {
    e.stopPropagation();
    HistoryService.removeFavorite(mangaId);
  };

  const handleQuickRead = async (mangaId: string) => {
    // If an unread chapter was found via update tracker, prioritize reading it
    const update = updatesMap[mangaId];
    if (update?.hasNew && update.latestChapterId && onReadChapter) {
      onReadChapter(mangaId, update.latestChapterId);
      return;
    }

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

  const handleCheckUpdates = async () => {
    if (isCheckingUpdates || favorites.length === 0) return;
    setIsCheckingUpdates(true);
    setUpdateCheckProgress('Iniciando verificação...');

    const newUpdates: Record<string, UpdateInfo> = {};
    let newCount = 0;

    for (let i = 0; i < favorites.length; i++) {
      const fav = favorites[i];
      setUpdateCheckProgress(`Verificando ${i + 1}/${favorites.length}: ${fav.title.slice(0, 18)}...`);

      try {
        const chapters = await MangaApi.getChapters(fav.mangaId, { order: 'desc', deduplicate: true });
        if (chapters.length > 0) {
          const latest = chapters[0];
          const progress = HistoryService.getProgress(fav.mangaId);

          let hasNew = false;
          if (progress) {
            const lastNum = parseFloat(progress.chapterNumber);
            const latestNum = parseFloat(latest.chapterNumber);
            if (!isNaN(lastNum) && !isNaN(latestNum)) {
              hasNew = latestNum > lastNum;
            } else {
              hasNew = progress.chapterId !== latest.id;
            }
          } else {
            hasNew = false;
          }

          if (hasNew) newCount++;

          newUpdates[fav.mangaId] = {
            latestChapterId: latest.id,
            latestChapterNumber: latest.chapterNumber,
            hasNew,
            lastReadNumber: progress?.chapterNumber
          };
        }
      } catch (err) {
        console.warn(`Failed to check updates for ${fav.mangaId}:`, err);
      }
    }

    setUpdatesMap(newUpdates);
    setIsCheckingUpdates(false);
    setUpdateCheckProgress(null);

    if (newCount > 0) {
      setNotification({
        type: 'success',
        message: `${newCount} ${newCount === 1 ? 'obra possui capítulos novos' : 'obras possuem capítulos novos'} para leitura!`
      });
    } else {
      setNotification({
        type: 'success',
        message: 'Todas as suas obras favoritas estão em dia!'
      });
    }
    setTimeout(() => setNotification(null), 5000);
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
            fav.mangaId.includes('mangapill') ? 'mangapill' : 'unknown'
          ),
          externalId: '',
          sourceName: fav.sourceName || (
            fav.mangaId.includes('mangadex') ? 'MangaDex' :
            fav.mangaId.includes('comick') ? 'Comick' :
            fav.mangaId.includes('weebcentral') ? 'WeebCentral' :
            fav.mangaId.includes('mangapill') ? 'MangaPill' : 'Manga'
          )
        }
      ],
      rating: fav.rating,
      updatedAt: new Date(fav.updatedAt).toISOString()
    };
  };

  // Filter & sort logic
  const filteredFavorites = favorites
    .filter((fav) => {
      // Search term
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (!fav.title.toLowerCase().includes(q)) return false;
      }
      // Source filter
      if (selectedSource !== 'all') {
        const source = fav.sourceId || (
          fav.mangaId.includes('mangadex') ? 'mangadex' :
          fav.mangaId.includes('comick') ? 'comick' :
          fav.mangaId.includes('weebcentral') ? 'weebcentral' :
          fav.mangaId.includes('mangapill') ? 'mangapill' : ''
        );
        if (source !== selectedSource) return false;
      }
      // Unread only filter
      if (filterOnlyUnread) {
        if (!updatesMap[fav.mangaId]?.hasNew) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'title-asc') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'title-desc') {
        return b.title.localeCompare(a.title);
      }
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

  const unreadCount = Object.values(updatesMap).filter(u => u.hasNew).length;

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
              Suas obras favoritas salvas localmente para acesso rápido, acompanhamento e estatísticas
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Check for New Chapters Button */}
            <button
              onClick={handleCheckUpdates}
              disabled={isCheckingUpdates || favorites.length === 0}
              title="Consultar os provedores ao vivo para verificar se há novos capítulos disponíveis"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-950/40 transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
              <span>{isCheckingUpdates ? 'Verificando...' : 'Verificar Atualizações'}</span>
            </button>

            {/* Hidden file input for restore */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json,application/json"
              className="hidden"
            />

            {/* Export Backup Button */}
            <button
              onClick={handleExport}
              title="Exportar backup completo de favoritos e histórico em arquivo JSON"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 hover:text-white font-medium transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-rose-400" />
              <span className="hidden sm:inline">Exportar</span>
            </button>

            {/* Import Backup Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Importar e mesclar backup de biblioteca de arquivo JSON"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 hover:text-white font-medium transition-colors cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Restaurar</span>
            </button>
          </div>
        </div>

        {/* Checking Updates Progress Banner */}
        {isCheckingUpdates && updateCheckProgress && (
          <div className="mb-6 p-3 rounded-xl bg-zinc-900/90 border border-rose-500/30 flex items-center gap-3 text-xs text-zinc-200 animate-pulse">
            <RefreshCw className="h-4 w-4 text-rose-500 animate-spin shrink-0" />
            <span>{updateCheckProgress}</span>
          </div>
        )}

        {/* Notification Banner */}
        {notification && (
          <div className={`mb-6 p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs animate-in fade-in duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-200'
          }`}>
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? (
                <Check className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Reading Stats Summary Dashboard */}
        <ReadingStatsSummary favoritesCount={favorites.length} />

        {/* Filter & Search Toolbar (Only when library has items) */}
        {favorites.length > 0 && (
          <div className="mb-6 space-y-3.5 p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/70">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              
              {/* Search bar within Favorites */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar por título nos favoritos..."
                  className="w-full pl-9 pr-8 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-rose-500/60"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Sort Selector */}
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <span className="text-xs text-zinc-500 font-medium hidden sm:inline">Ordenar:</span>
                <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300">
                  <ArrowUpDown className="h-3.5 w-3.5 text-zinc-500" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
                  >
                    <option value="recent">Mais Recentes</option>
                    <option value="title-asc">Título (A-Z)</option>
                    <option value="title-desc">Título (Z-A)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Source Filter Pills & Unread Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/60 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-zinc-500 font-medium mr-1">Fonte:</span>
                {[
                  { id: 'all', label: 'Todas' },
                  { id: 'mangadex', label: 'MangaDex' },
                  { id: 'comick', label: 'Comick' },
                  { id: 'weebcentral', label: 'WeebCentral' },
                  { id: 'mangapill', label: 'MangaPill' }
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSource(s.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                      selectedSource === s.id
                        ? 'bg-rose-600 text-white'
                        : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Unread toggle pill */}
              {unreadCount > 0 && (
                <button
                  onClick={() => setFilterOnlyUnread(!filterOnlyUnread)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    filterOnlyUnread
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-sm shadow-rose-950/40'
                      : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-400 border border-zinc-800'
                  }`}
                >
                  <Sparkles className="h-3 w-3 text-rose-400" />
                  <span>Apenas com novos capítulos ({unreadCount})</span>
                </button>
              )}
            </div>
          </div>
        )}

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
              Você ainda não adicionou nenhum mangá aos seus favoritos. Ao explorar obras, clique no botão &quot;Favoritar&quot; para guardá-las aqui e acompanhar novos capítulos.
            </p>
            <button
              onClick={onNavigateToCatalog}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg shadow-rose-950/50 transition-all cursor-pointer"
            >
              <BookOpen className="h-4 w-4" />
              <span>Explorar Catálogo de Mangás</span>
            </button>
          </div>
        ) : filteredFavorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-zinc-900/20 rounded-2xl border border-zinc-800/40 my-6">
            <Search className="h-8 w-8 text-zinc-600 mb-2" />
            <h3 className="text-sm font-semibold text-zinc-300">Nenhuma obra encontrada nos filtros</h3>
            <p className="text-xs text-zinc-500 mt-1">Tente ajustar o termo de pesquisa ou a fonte selecionada.</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedSource('all');
                setFilterOnlyUnread(false);
              }}
              className="mt-4 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium cursor-pointer"
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          /* Favorites Grid */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
            {filteredFavorites.map((fav) => {
              const updateInfo = updatesMap[fav.mangaId];
              const progress = HistoryService.getProgress(fav.mangaId);

              return (
                <div key={fav.mangaId} className="group relative flex flex-col">
                  <div className="relative">
                    <MangaCard
                      manga={mapFavoriteToManga(fav)}
                      onSelect={onSelectManga}
                      onQuickRead={handleQuickRead}
                    />
                    
                    {/* Floating New Chapter Badge */}
                    {updateInfo?.hasNew && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onReadChapter) {
                            onReadChapter(fav.mangaId, updateInfo.latestChapterId);
                          } else {
                            onSelectManga(fav.mangaId);
                          }
                        }}
                        className="absolute top-2 left-2 z-20 flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold shadow-lg shadow-rose-950/80 animate-pulse hover:bg-rose-500 transition-colors cursor-pointer"
                        title={`Novo capítulo disponível: Cap. ${updateInfo.latestChapterNumber}. Clique para ler!`}
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>Novo Cap. {updateInfo.latestChapterNumber}</span>
                      </button>
                    )}

                    {/* Remove button badge */}
                    <button
                      onClick={(e) => handleRemove(e, fav.mangaId)}
                      title="Remover dos favoritos"
                      className="absolute top-2 right-2 z-20 p-1.5 rounded-lg bg-zinc-950/80 hover:bg-rose-950/90 text-zinc-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-500/50 opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer shadow-md backdrop-blur-sm"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Reading Progress Indicator underneath card */}
                  {progress && (
                    <div className="mt-1.5 px-1 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-rose-400/80" />
                        Lido: Cap. {progress.chapterNumber}
                      </span>
                      {updateInfo?.latestChapterNumber && (
                        <span className="text-zinc-500">
                          Recente: {updateInfo.latestChapterNumber}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
