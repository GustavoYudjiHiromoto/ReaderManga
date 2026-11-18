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
  Home,
  Bell,
  MessageSquarePlus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { PWAInstallButton } from './PWAInstallButton.js';

interface NavbarProps {
  currentTab: 'home' | 'catalog' | 'search' | 'updates' | 'favorites' | 'api' | 'detail' | 'reader' | 'profile';
  onNavigate: (tab: 'home' | 'catalog' | 'search' | 'updates' | 'favorites' | 'api' | 'profile') => void;
  onOpenHistory: () => void;
  onOpenDownloads?: () => void;
  onOpenTrackers?: () => void;
  onOpenExtensions?: () => void;
  onOpenFeedback?: () => void;
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
  onOpenFeedback,
  favoritesCount = 0,
  offlineCount = 0,
  unreadUpdatesCount = 0,
  trackersCount = 0,
  enabledSourcesCount = 6,
  totalSourcesCount = 6
}) => {
  const { user, syncStatus, loginWithGoogle, logout, syncNow } = useAuth();
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

  const hasSpecialStatus = offlineCount > 0 || trackersCount > 0 || enabledSourcesCount < totalSourcesCount;

  return (
    <>
      {/* =====================================================================
          TOP APPLICATION BAR (Desktop 3-Zone Header / Clean Compact Mobile Header)
          ===================================================================== */}
      <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/92 backdrop-blur-md pt-safe">
        <div className="mx-auto flex h-12 sm:h-14 max-w-7xl items-center justify-between gap-3 md:gap-8 px-3 sm:px-6 lg:px-8">

          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center shrink-0">
            <button
              onClick={() => onNavigate('home')}
              className="group flex items-center cursor-pointer focus:outline-none py-1.5 whitespace-nowrap shrink-0"
              aria-label="Ir para o início"
            >
              <span className="font-serif text-base sm:text-xl font-bold tracking-tight text-white group-hover:text-rose-400 transition-colors whitespace-nowrap">
                MangaReader
              </span>
            </button>
          </div>

          {/* Zone 2: Desktop Primary Navigation Tabs (Hidden on < md, moved to thumb bottom bar on mobile) */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium" aria-label="Navegação principal">
            <button
              onClick={() => onNavigate('home')}
              className={`transition-colors cursor-pointer py-1.5 px-2 rounded-lg whitespace-nowrap shrink-0 ${
                currentTab === 'home' || currentTab === 'catalog'
                  ? 'text-rose-400 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              Início
            </button>

            <button
              onClick={() => onNavigate('search')}
              className={`transition-colors cursor-pointer flex items-center gap-1.5 py-1.5 px-2 rounded-lg whitespace-nowrap shrink-0 ${
                currentTab === 'search'
                  ? 'text-rose-400 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Search className="h-4 w-4 shrink-0" />
              <span>Pesquisa</span>
            </button>

            <button
              onClick={() => onNavigate('updates')}
              className={`transition-colors cursor-pointer flex items-center gap-1.5 py-1.5 px-2 rounded-lg whitespace-nowrap shrink-0 ${
                currentTab === 'updates'
                  ? 'text-rose-400 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Bell className="h-4 w-4 shrink-0" />
              <span>Lançamentos</span>
              {unreadUpdatesCount > 0 && (
                <span
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-medium font-mono tabular-nums"
                  title={`${unreadUpdatesCount} obra(s) com capítulos novos`}
                >
                  {unreadUpdatesCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onNavigate('favorites')}
              className={`transition-colors cursor-pointer flex items-center gap-1.5 py-1.5 px-2 rounded-lg whitespace-nowrap shrink-0 ${
                currentTab === 'favorites'
                  ? 'text-rose-400 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Bookmark className={`h-4 w-4 shrink-0 ${currentTab === 'favorites' ? 'fill-rose-400/30' : ''}`} />
              <span>Favoritos</span>

              {favoritesCount > 0 && (
                <span className="text-zinc-500 text-xs font-mono tabular-nums">
                  ({favoritesCount})
                </span>
              )}
            </button>
          </nav>

          {/* Zone 3: Quick Actions (History + Consolidated User & Settings Menu) */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Quick Mobile Search Trigger on Top Bar (helpful while scrolling deep pages) */}
            <button
              onClick={() => onNavigate('search')}
              className={`md:hidden min-h-[40px] min-w-[40px] p-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center focus:outline-none ${
                currentTab === 'search'
                  ? 'text-rose-400 bg-rose-500/10'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
              }`}
              title="Pesquisar mangás"
              aria-label="Pesquisar mangás"
            >
              <Search className="h-4 w-4" />
            </button>

            {/* Quick Reading History Icon Button */}
            <button
              onClick={onOpenHistory}
              className="min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] p-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors cursor-pointer flex items-center justify-center focus:outline-none"
              title="Histórico de leitura"
              aria-label="Abrir histórico de leitura"
            >
              <Clock className="h-4 w-4 text-rose-400" />
            </button>

            {/* Consolidated 'Settings' & 'User' Menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className={`relative flex items-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer focus:outline-none whitespace-nowrap shrink-0 ${
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

                <span className="hidden sm:inline text-xs text-zinc-300 font-medium truncate max-w-[96px]">
                  {user?.displayName ? user.displayName.split(' ')[0] : 'Menu'}
                </span>

                <ChevronDown className={`h-3 w-3 text-zinc-400 transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`} />

                {hasSpecialStatus && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2" aria-hidden="true">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                )}
              </button>

              {/* Consolidated Dropdown Popover */}
              {isMenuOpen && (
                <div className="absolute right-0 top-12 w-72 max-w-[calc(100vw-1rem)] rounded-2xl bg-zinc-950/95 border border-zinc-800 shadow-2xl p-2 z-50 text-xs backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">

                  {/* Section A: User Identity & Cloud Sync */}
                  <div className="p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-850/80 mb-2 space-y-2">
                    {user ? (
                      <div>
                        <div className="flex items-center justify-between gap-2">
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
                            className="p-2 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer shrink-0"
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
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors cursor-pointer text-left ${
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
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors cursor-pointer text-left ${
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
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
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
                        className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2">
                          <Blocks className="h-3.5 w-3.5 text-rose-400" />
                          <div>
                            <div className="font-medium text-zinc-200">Extensões & Fontes</div>
                            <div className="text-[10px] text-zinc-500">Prioridade e teste de conexões</div>
                          </div>
                        </div>
                        <span className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono tabular-nums">
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
                        className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2">
                          <HardDriveDownload className="h-3.5 w-3.5 text-emerald-400" />
                          <div>
                            <div className="font-medium text-zinc-200">Leitura Offline</div>
                            <div className="text-[10px] text-zinc-500">Capítulos salvos em cache</div>
                          </div>
                        </div>
                        {offlineCount > 0 ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono tabular-nums">
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
                        className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2">
                          <Sliders className="h-3.5 w-3.5 text-sky-400" />
                          <div>
                            <div className="font-medium text-zinc-200">Trackers (AniList / MAL)</div>
                            <div className="text-[10px] text-zinc-500">Sincronização de progresso</div>
                          </div>
                        </div>
                        {trackersCount > 0 ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-mono tabular-nums">
                            {trackersCount}
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-600 font-mono">Off</span>
                        )}
                      </button>
                    )}

                    {onOpenFeedback && (
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          onOpenFeedback();
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2">
                          <MessageSquarePlus className="h-3.5 w-3.5 text-rose-400" />
                          <div>
                            <div className="font-medium text-zinc-200">Feedback &amp; Reportar Bug</div>
                            <div className="text-[10px] text-zinc-500">Sugestões, fontes ou erros</div>
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono">&rarr;</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onNavigate('api');
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors cursor-pointer text-left ${
                        currentTab === 'api' ? 'bg-zinc-850 text-rose-400 font-medium' : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-zinc-400" />
                        <span>API &amp; Documentação</span>
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

      {/* =====================================================================
          MOBILE FIXED BOTTOM TAB BAR (Thumb-Zone Ergonomics for < md screens)
          ===================================================================== */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-zinc-800/90 bg-zinc-950/95 backdrop-blur-xl pb-safe"
        aria-label="Navegação mobile"
      >
        <div className="grid grid-cols-5 items-center h-14">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className={`flex flex-col items-center justify-center min-h-[48px] transition-colors cursor-pointer ${
              currentTab === 'home' || currentTab === 'catalog'
                ? 'text-rose-400'
                : 'text-zinc-400 active:text-zinc-200'
            }`}
          >
            <Home className={`h-5 w-5 ${currentTab === 'home' || currentTab === 'catalog' ? 'stroke-[2.25]' : ''}`} />
            <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap">Início</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('search')}
            className={`flex flex-col items-center justify-center min-h-[48px] transition-colors cursor-pointer ${
              currentTab === 'search'
                ? 'text-rose-400'
                : 'text-zinc-400 active:text-zinc-200'
            }`}
          >
            <Search className={`h-5 w-5 ${currentTab === 'search' ? 'stroke-[2.25]' : ''}`} />
            <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap">Pesquisa</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('updates')}
            className={`relative flex flex-col items-center justify-center min-h-[48px] transition-colors cursor-pointer ${
              currentTab === 'updates'
                ? 'text-rose-400'
                : 'text-zinc-400 active:text-zinc-200'
            }`}
          >
            <div className="relative">
              <Bell className={`h-5 w-5 ${currentTab === 'updates' ? 'fill-rose-500/20 stroke-[2.25]' : ''}`} />
              {unreadUpdatesCount > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold font-mono flex items-center justify-center tabular-nums shadow-sm">
                  {unreadUpdatesCount > 99 ? '99+' : unreadUpdatesCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap">Lançamentos</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('favorites')}
            className={`relative flex flex-col items-center justify-center min-h-[48px] transition-colors cursor-pointer ${
              currentTab === 'favorites'
                ? 'text-rose-400'
                : 'text-zinc-400 active:text-zinc-200'
            }`}
          >
            <Bookmark className={`h-5 w-5 ${currentTab === 'favorites' ? 'fill-rose-500/25 stroke-[2.25]' : ''}`} />
            <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap">Favoritos</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className={`flex flex-col items-center justify-center min-h-[48px] transition-colors cursor-pointer ${
              currentTab === 'profile'
                ? 'text-rose-400'
                : 'text-zinc-400 active:text-zinc-200'
            }`}
          >
            <User className={`h-5 w-5 ${currentTab === 'profile' ? 'stroke-[2.25]' : ''}`} />
            <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap">Perfil</span>
          </button>
        </div>
      </nav>
    </>
  );
};
