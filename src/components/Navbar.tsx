import React, { useState, useRef, useEffect } from 'react';
import { Search, Layers, Clock, Bookmark, SlidersHorizontal, HardDriveDownload, Sliders, ChevronDown, Download, User } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton.js';
import { UserCloudSyncMenu } from './UserCloudSyncMenu.js';

interface NavbarProps {
  currentTab: 'home' | 'catalog' | 'search' | 'favorites' | 'api' | 'detail' | 'reader' | 'profile';
  onNavigate: (tab: 'home' | 'catalog' | 'search' | 'favorites' | 'api' | 'profile') => void;
  onOpenHistory: () => void;
  onOpenDownloads?: () => void;
  onOpenTrackers?: () => void;
  historyCount: number;
  favoritesCount?: number;
  offlineCount?: number;
  unreadUpdatesCount?: number;
  trackersCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onNavigate,
  onOpenHistory,
  onOpenDownloads,
  onOpenTrackers,
  historyCount,
  favoritesCount = 0,
  offlineCount = 0,
  unreadUpdatesCount = 0,
  trackersCount = 0
}) => {
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  // Close tools dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) {
        setShowToolsMenu(false);
      }
    }
    if (showToolsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showToolsMenu]);

  const hasToolsActive = offlineCount > 0 || trackersCount > 0;

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
            {unreadUpdatesCount > 0 ? (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-medium animate-pulse" title={`${unreadUpdatesCount} obra(s) com novos capítulos`}>
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                <span>{unreadUpdatesCount} novo{unreadUpdatesCount > 1 ? 's' : ''}</span>
              </span>
            ) : favoritesCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-mono tabular-nums">
                {favoritesCount}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => onNavigate('profile')}
            className={`transition-colors hover:text-zinc-100 cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'profile' ? 'text-rose-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            <User className="h-4 w-4" />
            Perfil
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

        {/* Zone 3: Streamlined Actions (Zero Clutter) */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Mobile Quick Nav */}
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
            {unreadUpdatesCount > 0 ? (
              <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              </span>
            ) : favoritesCount > 0 ? (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-zinc-500" />
            ) : null}
          </button>

          {/* Primary Action: Continuar Lendo (Histórico) */}
          <button
            onClick={onOpenHistory}
            className="relative flex items-center gap-2 px-3 py-1.5 sm:px-3.5 rounded-lg text-xs font-medium text-zinc-200 bg-zinc-900/90 hover:bg-zinc-800 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
            title="Acessar histórico de leitura e retomar de onde parou"
          >
            <Clock className="h-3.5 w-3.5 text-rose-400" />
            <span className="hidden sm:inline">Continuar Lendo</span>
            <span className="sm:hidden text-xs">Histórico</span>
            {historyCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono tabular-nums">
                {historyCount}
              </span>
            )}
          </button>

          {/* Consolidated Quick Tools Menu (Offline, Trackers, PWA) */}
          <div className="relative" ref={toolsMenuRef}>
            <button
              onClick={() => setShowToolsMenu(!showToolsMenu)}
              className={`relative flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                showToolsMenu
                  ? 'bg-zinc-800 text-white border-zinc-700 shadow-md'
                  : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-800'
              }`}
              title="Ferramentas e integrações (Offline, AniList, MAL)"
              aria-label="Ferramentas e opções adicionais"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" />
              <span className="hidden sm:inline text-xs">Ferramentas</span>
              <ChevronDown className={`hidden sm:inline h-3 w-3 text-zinc-500 transition-transform duration-200 ${showToolsMenu ? 'rotate-180' : ''}`} />
              
              {/* Subtle status dot if offline downloads or trackers are active */}
              {hasToolsActive && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
            </button>

            {/* Dropdown Popover */}
            {showToolsMenu && (
              <div className="absolute right-0 top-11 w-64 rounded-xl bg-zinc-950/95 border border-zinc-800 shadow-2xl p-2 z-50 text-xs backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800/80 mb-1">
                  Ferramentas & Integrações
                </div>

                {onOpenDownloads && (
                  <button
                    onClick={() => {
                      setShowToolsMenu(false);
                      onOpenDownloads();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2">
                      <HardDriveDownload className="h-3.5 w-3.5 text-emerald-400" />
                      <div>
                        <div className="font-medium text-zinc-200">Leitura Offline</div>
                        <div className="text-[10px] text-zinc-500">Capítulos baixados no cache</div>
                      </div>
                    </div>
                    {offlineCount > 0 ? (
                      <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono tabular-nums">
                        {offlineCount}
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-600 font-mono">0</span>
                    )}
                  </button>
                )}

                {onOpenTrackers && (
                  <button
                    onClick={() => {
                      setShowToolsMenu(false);
                      onOpenTrackers();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Sliders className="h-3.5 w-3.5 text-sky-400" />
                      <div>
                        <div className="font-medium text-zinc-200">AniList & MyAnimeList</div>
                        <div className="text-[10px] text-zinc-500">Sincronização de progresso</div>
                      </div>
                    </div>
                    {trackersCount > 0 ? (
                      <span className="px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-mono tabular-nums">
                        {trackersCount} ativo{trackersCount > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-600 font-mono">Off</span>
                    )}
                  </button>
                )}

                {/* Quick Link to Profile Page */}
                <button
                  onClick={() => {
                    setShowToolsMenu(false);
                    onNavigate('profile');
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-rose-400" />
                    <div>
                      <div className="font-medium text-zinc-200">Painel do Perfil</div>
                      <div className="text-[10px] text-zinc-500">Estatísticas, preferências e nuvem</div>
                    </div>
                  </div>
                  <span className="text-[10px] text-rose-400 font-mono">&rarr;</span>
                </button>

                {/* Subtle PWA helper link inside menu */}
                <div className="border-t border-zinc-850 mt-1 pt-1">
                  <PWAInstallButton />
                </div>
              </div>
            )}
          </div>

          {/* Google Auth & Cloud Sync Profile Menu */}
          <UserCloudSyncMenu onNavigateToProfile={() => onNavigate('profile')} />
        </div>
      </div>
    </header>
  );
};

