import React from 'react';
import { BookOpen, Search, Layers, Clock, Bookmark, Sparkles } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  currentTab: 'home' | 'catalog' | 'search' | 'favorites' | 'api' | 'detail' | 'reader';
  onNavigate: (tab: 'home' | 'catalog' | 'search' | 'favorites' | 'api') => void;
  onOpenHistory: () => void;
  historyCount: number;
  favoritesCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onNavigate,
  onOpenHistory,
  historyCount,
  favoritesCount = 0
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Zone 1: Single text element wordmark */}
        <button
          onClick={() => onNavigate('home')}
          className="text-left group flex items-center gap-2 cursor-pointer focus:outline-none"
        >
          <span className="font-serif text-xl font-bold tracking-tight text-zinc-100 group-hover:text-rose-400 transition-colors">
            MangaReader
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        </button>

        {/* Zone 2: Clean text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          <button
            onClick={() => onNavigate('home')}
            className={`transition-colors hover:text-zinc-100 cursor-pointer ${
              currentTab === 'home' ? 'text-rose-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            Início
          </button>
          <button
            onClick={() => onNavigate('catalog')}
            className={`transition-colors hover:text-zinc-100 cursor-pointer ${
              currentTab === 'catalog' ? 'text-rose-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            Catálogo
          </button>
          <button
            onClick={() => onNavigate('search')}
            className={`transition-colors hover:text-zinc-100 cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'search' ? 'text-rose-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            <Search className="h-4 w-4" />
            Pesquisa
          </button>
          <button
            onClick={() => onNavigate('favorites')}
            className={`transition-colors hover:text-zinc-100 cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'favorites' ? 'text-rose-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            <Bookmark className={`h-4 w-4 ${currentTab === 'favorites' ? 'fill-rose-400/30' : ''}`} />
            <span>Favoritos</span>
            {favoritesCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono tabular-nums">
                {favoritesCount}
              </span>
            )}
          </button>
          <button
            onClick={() => onNavigate('api')}
            className={`transition-colors hover:text-zinc-100 cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'api' ? 'text-rose-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            <Layers className="h-4 w-4" />
            API & Fontes
          </button>
        </nav>

        {/* Zone 3: Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('search')}
            aria-label="Pesquisar mangás"
            className="md:hidden p-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-900 transition-colors"
          >
            <Search className="h-5 w-5" />
          </button>

          <button
            onClick={() => onNavigate('favorites')}
            aria-label="Minha biblioteca de favoritos"
            className="md:hidden relative p-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-900 transition-colors"
          >
            <Bookmark className="h-5 w-5" />
            {favoritesCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500" />
            )}
          </button>

          <PWAInstallButton />

          <button
            onClick={onOpenHistory}
            className="relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 hover:text-zinc-100 border border-zinc-800 transition-colors cursor-pointer"
          >
            <Clock className="h-3.5 w-3.5 text-rose-400" />
            <span className="hidden sm:inline">Continuar Lendo</span>
            <span className="sm:hidden">Histórico</span>
            {historyCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono tabular-nums">
                {historyCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
