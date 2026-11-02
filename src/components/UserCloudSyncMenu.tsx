import React, { useState, useRef, useEffect } from 'react';
import { Cloud, CloudCheck, CloudUpload, RefreshCw, LogOut, Check, AlertCircle, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';

interface UserCloudSyncMenuProps {
  onNavigateToProfile?: () => void;
}

export const UserCloudSyncMenu: React.FC<UserCloudSyncMenuProps> = ({ onNavigateToProfile }) => {
  const { user, loading, syncStatus, lastSynced, syncError, loginWithGoogle, logout, syncNow } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSyncingManual, setIsSyncingManual] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogin = async () => {
    try {
      setIsLoggingIn(true);
      await loginWithGoogle();
      setIsOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      setIsSyncingManual(true);
      await syncNow();
    } finally {
      setTimeout(() => setIsSyncingManual(false), 600);
    }
  };

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Ainda não sincronizado';
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 10) return 'Agora mesmo';
    if (diffSec < 60) return `Há ${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Há ${diffMin} min`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="h-8 w-8 rounded-full bg-zinc-800/60 animate-pulse border border-zinc-700/50" />
    );
  }

  // Not signed in state
  if (!user) {
    return (
      <button
        onClick={handleLogin}
        disabled={isLoggingIn}
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-200 bg-gradient-to-r from-zinc-800 to-zinc-900 hover:from-zinc-700 hover:to-zinc-800 border border-zinc-700/80 hover:border-rose-500/50 transition-all cursor-pointer shadow-sm group"
        title="Entrar com o Google para sincronizar favoritos e progresso de leitura entre dispositivos"
      >
        {isLoggingIn ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-rose-400" />
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
        )}
        <span className="hidden sm:inline">Sincronizar</span>
        <Cloud className="h-3 w-3 text-zinc-400 group-hover:text-rose-400 transition-colors" />
      </button>
    );
  }

  // Signed in state
  const isSyncing = syncStatus === 'syncing' || isSyncingManual;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-full bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer group focus:outline-none"
        title="Conta do Google & Sincronização em Nuvem"
      >
        {/* User avatar / initials */}
        <div className="relative">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'Usuário'}
              className="h-7 w-7 rounded-full object-cover border border-zinc-700/60"
            />
          ) : (
            <div className="h-7 w-7 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center justify-center text-xs font-bold">
              {user.displayName ? user.displayName.slice(0, 1).toUpperCase() : user.email?.slice(0, 1).toUpperCase() || 'U'}
            </div>
          )}

          {/* Cloud sync status indicator badge */}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-zinc-950 border border-zinc-800">
            {isSyncing ? (
              <RefreshCw className="h-2 w-2 animate-spin text-blue-400" />
            ) : syncStatus === 'error' ? (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            )}
          </span>
        </div>

        <span className="hidden sm:inline text-xs font-medium text-zinc-200 max-w-[90px] truncate">
          {user.displayName?.split(' ')[0] || user.email?.split('@')[0]}
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl z-50 p-3 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* User info header */}
          <div className="flex items-center gap-3 pb-3 border-b border-zinc-800">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Avatar'}
                className="h-10 w-10 rounded-full object-cover border border-zinc-700"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center justify-center font-bold">
                {user.displayName?.slice(0, 1).toUpperCase() || 'U'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-100 truncate">
                {user.displayName || 'Leitor MangaReader'}
              </p>
              <p className="text-xs text-zinc-400 truncate">
                {user.email}
              </p>
            </div>
          </div>

          {/* Sync Status Section */}
          <div className="py-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 flex items-center gap-1.5">
                <Cloud className="h-3.5 w-3.5 text-zinc-500" />
                Sincronização Nuvem:
              </span>
              <span className="flex items-center gap-1 font-medium">
                {isSyncing ? (
                  <span className="text-blue-400 flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Sincronizando...
                  </span>
                ) : syncStatus === 'error' ? (
                  <span className="text-amber-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Atenção
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Em tempo real
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span>Última sincronização:</span>
              <span className="text-zinc-400 font-mono">
                {formatLastSync(lastSynced)}
              </span>
            </div>

            {syncError && (
              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                {syncError}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="pt-2 border-t border-zinc-800 space-y-1.5">
            {onNavigateToProfile && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onNavigateToProfile();
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors cursor-pointer shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <UserIcon className="h-3.5 w-3.5" />
                  <span>Meu Perfil</span>
                </div>
                <span className="text-[10px] text-rose-200">Ver painel &rarr;</span>
              </button>
            )}

            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-zinc-200 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-blue-400' : 'text-zinc-400'}`} />
              <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
            </button>

            <button
              onClick={async () => {
                await logout();
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Desconectar Conta</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
