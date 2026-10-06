import React from 'react';
import { BookOpen, Search, Layers, Clock, Bookmark, Sparkles } from 'lucide-react';

interface NavbarProps {
  currentTab: 'home' | 'catalog' | 'search' | 'api' | 'detail' | 'reader';
  onNavigate: (tab: 'home' | 'catalog' | 'search' | 'api') => void;
  onOpenHistory: () => void;
  historyCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onNavigate,
  onOpenHistory,
  historyCount
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

        {/* Zone 2: 4 clean text navigation links */}
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
            onClick={() => onNavigate('api')}
            className={`transition-colors hover:text-zinc-100 cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'api' ? 'text-rose-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            <Layers className="h-4 w-4" />
            API & Fontes
          </button>
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('search')}
            aria-label="Pesquisar mangás"
            className="md:hidden p-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-900 transition-colors"
          >
            <Search className="h-5 w-5" />
          </button>

          <button
            onClick={onOpenHistory}
            className="relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 hover:text-zinc-100 border border-zinc-800 transition-colors cursor-pointer"
          >
            <Clock className="h-3.5 w-3.5 text-rose-400" />
            <span>Continuar Lendo</span>
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
