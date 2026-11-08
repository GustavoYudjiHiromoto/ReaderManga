import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Bookmark, 
  Clock, 
  User, 
  Settings, 
  BookOpen, 
  Blocks, 
  HardDriveDownload, 
  Sliders, 
  Layers, 
  ChevronDown, 
  LogOut, 
  RefreshCw, 
  Cloud, 
  ExternalLink 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { PWAInstallButton } from './PWAInstallButton.js';

interface NavbarProps {
  currentTab: 'home' | 'catalog' | 'search' | 'favorites' | 'api' | 'detail' | 'reader' | 'profile';
  onNavigate: (tab: 'home' | 'catalog' | 'search' | 'favorites' | 'api' | 'profile') => void;
  onOpenHistory: () => void;
  onOpenDownloads?: () => void;
  onOpenTrackers?: () => void;
  onOpenExtensions?: () => void;
  historyCount: number;
  favoritesCount?: number;
  offlineCount?: number;
  unreadUpdatesCount?: number;
  trackersCount?: number;
  enabledSourcesCount?: number;
  totalSourcesCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onNavigate,
  onOpenHistory,
  onOpenDownloads,
  onOpenTrackers,
  onOpenExtensions,
  historyCount,
  favoritesCount = 0,
  offlineCount = 0,
  unreadUpdatesCount = 0,
  trackersCount = 0,
  enabledSourcesCount = 6,
  totalSourcesCount = 6
}) => {
  const { user, syncStatus, lastSynced, loginWithGoogle, logout, syncNow } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  const handleSyncNow = async () => {
    try {
      setIsSyncing(true);
      await syncNow();
    } catch (e) {
      console.warn('Sync failed:', e);
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  };

  const handleLogin = async () => {
    try {
      setIsLoggingIn(true);
      await loginWithGoogle();
      setIsMenuOpen(false);
    } catch (e) {
      console.error('Login error:', e);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const hasSpecialStatus = offlineCount > 0 || trackersCount > 0 || (enabledSourcesCount < totalSourcesCount);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-850 bg-zinc-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => onNavigate('home')}
            className="group flex items-center gap-2 cursor-pointer focus:outline-none"
            aria-label="Ir para o início"
          >
            <span className="font-serif text-lg sm:text-xl font-bold tracking-tight text-white group-hover:text-rose-400 transition-colors">
              MangaReader
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          </button>
        </div>

        {/* Center: Essential Primary Tabs ONLY (Home, Search, Favorites) */}
        <nav className="flex items-center gap-3 sm:gap-7 text-sm font-medium">
          <button
            onClick={() => onNavigate('home')}
            className={`transition-colors cursor-pointer py-1 px-1.5 sm:px-2 rounded-lg ${
              currentTab === 'home' 
                ? 'text-rose-400 font-semibold' 
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Início
          </button>

          <button
            onClick={() => onNavigate('search')}
            className={`transition-colors cursor-pointer flex items-center gap-1.5 py-1 px-1.5 sm:px-2 rounded-lg ${
              currentTab === 'search' 
                ? 'text-rose-400 font-semibold' 
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <Search className="h-4 w-4" />
            <span>Pesquisa</span>
          </button>

          <button
            onClick={() => onNavigate('favorites')}
            className={`transition-colors cursor-pointer flex items-center gap-1.5 py-1 px-1.5 sm:px-2 rounded-lg ${
              currentTab === 'favorites' 
                ? 'text-rose-400 font-semibold' 
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <Bookmark className={`h-4 w-4 ${currentTab === 'favorites' ? 'fill-rose-400/30' : ''}`} />
            <span>Favoritos</span>

            {unreadUpdatesCount > 0 ? (
              <span 
                className="flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-medium animate-pulse" 
                title={`${unreadUpdatesCount} obra(s) com capítulos novos`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                <span className="hidden sm:inline">{unreadUpdatesCount} novo{unreadUpdatesCount > 1 ? 's' : ''}</span>
              </span>
            ) : favoritesCount > 0 ? (
              <span className="hidden sm:inline px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-mono tabular-nums">
                {favoritesCount}
              </span>
            ) : null}
          </button>
        </nav>

        {/* Right: Condensed Quick Actions (History + Consolidated User & Settings Menu) */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          
          {/* 1. Quick Reading History Icon Button (Clean icon only) */}
          <button
            onClick={onOpenHistory}
            className="p-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors cursor-pointer flex items-center justify-center focus:outline-none"
            title="Histórico de leitura"
            aria-label="Abrir histórico de leitura"
          >
            <Clock className="h-4 w-4 text-rose-400" />
          </button>

          {/* 2. Consolidated 'Settings' & 'User' Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer focus:outline-none ${
                isMenuOpen
                  ? 'bg-zinc-800 text-white border-zinc-700 shadow-md ring-1 ring-zinc-700'
                  : 'bg-zinc-900/90 hover:bg-zinc-850 text-zinc-300 hover:text-white border-zinc-800'
              }`}
              title="Menu do Usuário e Configurações"
              aria-label="Configurações e menu do usuário"
              aria-expanded={isMenuOpen}
            >
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Avatar'}
                  className="h-6 w-6 rounded-full object-cover border border-zinc-700 shrink-0"
                />
              ) : user ? (
                <div className="h-6 w-6 rounded-full bg-rose-600 text-white font-bold flex items-center justify-center text-[11px] shrink-0">
                  {user.displayName?.slice(0, 1).toUpperCase() || 'U'}
                </div>
              ) : (
                <Settings className="h-4 w-4 text-zinc-400 shrink-0" />
              )}

              <span className="hidden sm:inline text-xs text-zinc-300 font-medium">
                {user?.displayName ? user.displayName.split(' ')[0] : 'Menu'}
              </span>

              <ChevronDown className={`h-3 w-3 text-zinc-400 transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`} />

              {/* Status indicator badge (active tools or unsynced notice) */}
              {hasSpecialStatus && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
            </button>

            {/* Consolidated Dropdown Popover */}
            {isMenuOpen && (
              <div className="absolute right-0 top-11 w-72 rounded-2xl bg-zinc-950/95 border border-zinc-800 shadow-2xl p-2 z-50 text-xs backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                
                {/* Section A: User Identity & Cloud Sync */}
                <div className="p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-850/80 mb-2 space-y-2">
                  {user ? (
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          {user.photoURL ? (
                            <img src={user.photoURL} alt="Avatar" className="h-7 w-7 rounded-full object-cover border border-zinc-700 shrink-0" />
                          ) : (
                            <div className="h-7 w-7 rounded-full bg-rose-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                              {user.displayName?.slice(0, 1).toUpperCase() || 'U'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-zinc-100 truncate">{user.displayName || 'Leitor'}</div>
                            <div className="text-[10px] text-zinc-400 truncate">{user.email}</div>
                          </div>
                        </div>

                        <button
                          onClick={async () => {
                            await logout();
                            setIsMenuOpen(false);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer"
                          title="Sair da conta"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-400 mt-2">
                        <span className="flex items-center gap-1.5">
                          <Cloud className="h-3 w-3 text-emerald-400" />
                          <span>Google Cloud</span>
                        </span>
                        <button
                          onClick={handleSyncNow}
                          disabled={isSyncing || syncStatus === 'syncing'}
                          className="text-[10px] text-rose-400 hover:text-rose-300 font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className={`h-2.5 w-2.5 ${isSyncing || syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                          <span>Sincronizar</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[11px] text-zinc-300">
                        Sincronize seus favoritos e leituras na nuvem entre dispositivos:
                      </div>
                      <button
                        onClick={handleLogin}
                        disabled={isLoggingIn}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors cursor-pointer shadow-md shadow-rose-950/30"
                      >
                        {isLoggingIn ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                            <path fill="#ffffff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#ffffff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#ffffff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                            <path fill="#ffffff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                          </svg>
                        )}
                        <span>Entrar com o Google</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Section B: Secondary Navigation Tabs */}
                <div className="space-y-0.5 border-b border-zinc-850/80 pb-1 mb-1">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Navegação
                  </div>

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onNavigate('catalog');
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                      currentTab === 'catalog' ? 'bg-zinc-850 text-rose-400 font-medium' : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-3.5 w-3.5 text-zinc-400" />
                      <span>Catálogo Completo</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">&rarr;</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onNavigate('profile');
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                      currentTab === 'profile' ? 'bg-zinc-850 text-rose-400 font-medium' : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-rose-400" />
                      <span>Perfil & Preferências</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">&rarr;</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenHistory();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-rose-400" />
                      <span>Histórico de Leitura</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">&rarr;</span>
                  </button>
                </div>

                {/* Section C: Tools, Extensions & Integrations */}
                <div className="space-y-0.5">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Configurações & Extensões
                  </div>

                  {onOpenExtensions && (
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenExtensions();
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Blocks className="h-3.5 w-3.5 text-rose-400" />
                        <div>
                          <div className="font-medium text-zinc-200">Extensões & Fontes</div>
                          <div className="text-[10px] text-zinc-500">Prioridade e teste de conexões</div>
                        </div>
                      </div>
                      <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono tabular-nums">
                        {enabledSourcesCount}/{totalSourcesCount}
                      </span>
                    </button>
                  )}

                  {onOpenDownloads && (
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenDownloads();
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <HardDriveDownload className="h-3.5 w-3.5 text-emerald-400" />
                        <div>
                          <div className="font-medium text-zinc-200">Leitura Offline</div>
                          <div className="text-[10px] text-zinc-500">Capítulos salvos em cache</div>
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
                        setIsMenuOpen(false);
                        onOpenTrackers();
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Sliders className="h-3.5 w-3.5 text-sky-400" />
                        <div>
                          <div className="font-medium text-zinc-200">Trackers (AniList / MAL)</div>
                          <div className="text-[10px] text-zinc-500">Sincronização de progresso</div>
                        </div>
                      </div>
                      {trackersCount > 0 ? (
                        <span className="px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-mono tabular-nums">
                          {trackersCount}
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-600 font-mono">Off</span>
                      )}
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onNavigate('api');
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                      currentTab === 'api' ? 'bg-zinc-850 text-rose-400 font-medium' : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 text-zinc-400" />
                      <span>API & Documentação</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">&rarr;</span>
                  </button>

                  <div className="pt-1 border-t border-zinc-850/80">
                    <PWAInstallButton />
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};
