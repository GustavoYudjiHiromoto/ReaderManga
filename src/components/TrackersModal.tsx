import React, { useState, useEffect } from 'react';
import {
  X,
  ExternalLink,
  Check,
  AlertCircle,
  RefreshCw,
  Download,
  Search,
  CheckCircle2,
  Sliders,
  ShieldCheck,
  KeyRound,
  LogOut,
  Clock,
  Zap,
  Play,
  RotateCw,
  CheckCircle,
  Layers,
  ArrowRight
} from 'lucide-react';
import { TrackerService, TrackerAccount, TrackerMatch, TrackerMediaMapping } from '../services/trackerService.js';
import { TrackerBackgroundService, TrackerBackgroundServiceState, TrackerSyncStats } from '../services/trackerBackgroundService.js';
import { HistoryService } from '../services/history.js';

function formatTimeAgo(timestamp: number | null): string {
  if (!timestamp) return 'Ainda não executado nesta sessão';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 45) return 'Há poucos segundos';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Há ${diffMin} min atrás`;
  const diffHours = Math.floor(diffMin / 60);
  return `Há ${diffHours}h atrás`;
}

interface TrackersModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMangaTitle?: string;
  activeMangaId?: string;
}

export const TrackersModal: React.FC<TrackersModalProps> = ({
  isOpen,
  onClose,
  activeMangaTitle,
  activeMangaId
}) => {
  const [activeTab, setActiveTab] = useState<'anilist' | 'mal' | 'match' | 'sync'>('anilist');
  const [bgSyncState, setBgSyncState] = useState<TrackerBackgroundServiceState>(() =>
    TrackerBackgroundService.getState()
  );
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  // AniList States
  const [aniListAccount, setAniListAccount] = useState<TrackerAccount>(() => TrackerService.getAniListAccount());
  const [aniListTokenInput, setAniListTokenInput] = useState('');
  const [isConnectingAniList, setIsConnectingAniList] = useState(false);
  const [aniListError, setAniListError] = useState<string | null>(null);
  const [isImportingAniList, setIsImportingAniList] = useState(false);

  // MyAnimeList (MAL) States
  const [malAccount, setMalAccount] = useState<TrackerAccount>(() => TrackerService.getMalAccount());
  const [malTokenInput, setMalTokenInput] = useState('');
  const [malClientIdInput, setMalClientIdInput] = useState(malAccount.clientId || '');
  const [isConnectingMal, setIsConnectingMal] = useState(false);
  const [malError, setMalError] = useState<string | null>(null);
  const [isImportingMal, setIsImportingMal] = useState(false);

  // Matcher States
  const [matchQuery, setMatchQuery] = useState(activeMangaTitle || '');
  const [aniListMatches, setAniListMatches] = useState<TrackerMatch[]>([]);
  const [malMatches, setMalMatches] = useState<TrackerMatch[]>([]);
  const [isSearchingMatches, setIsSearchingMatches] = useState(false);
  const [isRetryingSync, setIsRetryingSync] = useState(false);
  const [currentMapping, setCurrentMapping] = useState(() =>
    activeMangaId ? TrackerService.getMapping(activeMangaId) : undefined
  );

  // Global Notification
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const unsub = TrackerService.subscribe(() => {
      setAniListAccount(TrackerService.getAniListAccount());
      setMalAccount(TrackerService.getMalAccount());
      if (activeMangaId) {
        setCurrentMapping(TrackerService.getMapping(activeMangaId));
      }
    });
    const unsubBg = TrackerBackgroundService.subscribe(() => {
      setBgSyncState(TrackerBackgroundService.getState());
    });
    return () => {
      unsub();
      unsubBg();
    };
  }, [activeMangaId]);

  // When modal is opened for a specific manga title, automatically focus matcher and query
  useEffect(() => {
    if (isOpen && activeMangaTitle) {
      setMatchQuery(activeMangaTitle);
      setActiveTab('match');
      if (activeMangaId) {
        setCurrentMapping(TrackerService.getMapping(activeMangaId));
      }

      setIsSearchingMatches(true);
      Promise.all([
        TrackerService.searchAniListManga(activeMangaTitle),
        TrackerService.searchMalManga(activeMangaTitle)
      ])
        .then(([ani, mal]) => {
          setAniListMatches(ani);
          setMalMatches(mal);
        })
        .catch(e => {
          console.warn('Auto search matcher error', e);
        })
        .finally(() => {
          setIsSearchingMatches(false);
        });
    }
  }, [isOpen, activeMangaTitle, activeMangaId]);

  // Listen to OAuth popups postMessage events
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'ANILIST_AUTH_SUCCESS') {
        let token = event.data.token;
        if (!token && event.data.hash) {
          const params = new URLSearchParams(event.data.hash.replace(/^#/, ''));
          token = params.get('access_token');
        }
        if (token) {
          TrackerService.connectAniListWithToken(token)
            .then(acc => {
              setNotification({ type: 'success', message: `AniList conectado como @${acc.username}!` });
            })
            .catch(err => {
              setAniListError(err.message);
            });
        }
      } else if (event.data?.type === 'MAL_AUTH_SUCCESS') {
        const code = event.data.code;
        const storedVerifier = sessionStorage.getItem('mal_code_verifier');
        const storedClientId = sessionStorage.getItem('mal_client_id');
        const redirectUri = `${window.location.origin}/auth/mal/callback`;

        if (code && storedVerifier && storedClientId) {
          TrackerService.exchangeMalCode(code, storedVerifier, storedClientId, redirectUri)
            .then(acc => {
              setNotification({ type: 'success', message: `MyAnimeList conectado como @${acc.username}!` });
            })
            .catch(err => {
              setMalError(err.message);
            });
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!isOpen) return null;

  // Handle AniList Token Submission
  const handleConnectAniListToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setAniListError(null);
    if (!aniListTokenInput.trim()) return;

    try {
      setIsConnectingAniList(true);
      const acc = await TrackerService.connectAniListWithToken(aniListTokenInput);
      setNotification({ type: 'success', message: `AniList conectado com sucesso como @${acc.username}!` });
      setAniListTokenInput('');
    } catch (err: any) {
      setAniListError(err.message || 'Erro ao validar token AniList.');
    } finally {
      setIsConnectingAniList(false);
    }
  };

  // Handle AniList 1-Click Popup OAuth
  const handleOpenAniListOAuth = () => {
    // If user has a registered client ID or uses official AniList Implicit Grant URL:
    // AniList allows creating developer clients or using personal token directly.
    // For implicit grant:
    const clientId = '24890'; // Default public client ID or redirect
    const redirectUri = encodeURIComponent(`${window.location.origin}/auth/anilist/callback`);
    const authUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&response_type=token`;

    const popup = window.open(authUrl, 'anilist_oauth', 'width=600,height=720');
    if (!popup) {
      setAniListError('O navegador bloqueou a janela popup. Por favor, autorize popups ou cole seu Personal Token abaixo.');
    }
  };

  // Handle MAL Token Submission
  const handleConnectMalToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setMalError(null);
    if (!malTokenInput.trim()) return;

    try {
      setIsConnectingMal(true);
      const acc = await TrackerService.connectMalWithToken(malTokenInput, malClientIdInput);
      setNotification({ type: 'success', message: `MyAnimeList conectado com sucesso como @${acc.username}!` });
      setMalTokenInput('');
    } catch (err: any) {
      setMalError(err.message || 'Erro ao validar token do MyAnimeList.');
    } finally {
      setIsConnectingMal(false);
    }
  };

  // Handle MAL OAuth PKCE Popup
  const handleOpenMalOAuth = () => {
    const clientId = malClientIdInput.trim();
    if (!clientId) {
      setMalError('Insira seu Client ID do MyAnimeList (disponível gratuitamente em myanimelist.net/apiconfig).');
      return;
    }

    // Generate random 64-char PKCE code verifier
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let verifier = '';
    for (let i = 0; i < 64; i++) {
      verifier += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    sessionStorage.setItem('mal_code_verifier', verifier);
    sessionStorage.setItem('mal_client_id', clientId);

    const redirectUri = encodeURIComponent(`${window.location.origin}/auth/mal/callback`);
    const authUrl = `https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&code_challenge=${verifier}&code_challenge_method=plain&state=mangareader`;

    const popup = window.open(authUrl, 'mal_oauth', 'width=620,height=750');
    if (!popup) {
      setMalError('O navegador bloqueou a janela popup. Autorize popups para prosseguir.');
    }
  };

  // Handle Library Import
  const handleImportAniList = async () => {
    try {
      setIsImportingAniList(true);
      const res = await TrackerService.importFromAniList();
      setNotification({ type: 'success', message: res.message });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Falha ao importar do AniList.' });
    } finally {
      setIsImportingAniList(false);
    }
  };

  const handleImportMal = async () => {
    try {
      setIsImportingMal(true);
      const res = await TrackerService.importFromMal();
      setNotification({ type: 'success', message: res.message });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Falha ao importar do MyAnimeList.' });
    } finally {
      setIsImportingMal(false);
    }
  };

  // Search Title Matches
  const handleSearchMatches = async () => {
    if (!matchQuery.trim()) return;
    try {
      setIsSearchingMatches(true);
      const [ani, mal] = await Promise.all([
        TrackerService.searchAniListManga(matchQuery),
        TrackerService.searchMalManga(matchQuery)
      ]);
      setAniListMatches(ani);
      setMalMatches(mal);
    } catch (e) {
      console.warn('Matcher search error', e);
    } finally {
      setIsSearchingMatches(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-sky-500/20 to-blue-600/20 border border-sky-500/30 text-sky-400">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Rastreamento & Contas Externas
              </h2>
              <p className="text-xs text-zinc-400">
                Sincronize automaticamente capítulos lidos, status e notas com AniList e MyAnimeList
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/40 px-5 pt-3 gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('anilist')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'anilist'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-sky-400 inline-block"></span>
            AniList
            {aniListAccount.connected && (
              <span className="px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300 text-[10px]">
                Conectado
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('mal')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'mal'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
            MyAnimeList (MAL)
            {malAccount.connected && (
              <span className="px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 text-[10px]">
                Conectado
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('match');
              if (activeMangaTitle && aniListMatches.length === 0) {
                handleSearchMatches();
              }
            }}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'match'
                ? 'border-rose-500 text-rose-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            Vincular Obras
          </button>

          <button
            onClick={() => setActiveTab('sync')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'sync'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${bgSyncState.isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
            Auto-Sync em 2º Plano
            {bgSyncState.isSyncing ? (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] animate-pulse">
                Sincronizando
              </span>
            ) : bgSyncState.isEnabled ? (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px]">
                Ativo
              </span>
            ) : (
              <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400 text-[10px]">
                Pausado
              </span>
            )}
          </button>
        </div>

        {/* Notification Alert */}
        {notification && (
          <div className={`mx-5 mt-4 p-3 rounded-xl border flex items-center justify-between text-xs animate-in fade-in duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
              : 'bg-rose-950/40 border-rose-800 text-rose-200'
          }`}>
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? <Check className="h-4 w-4 text-emerald-400" /> : <AlertCircle className="h-4 w-4 text-rose-400" />}
              <span>{notification.message}</span>
            </div>
            <button onClick={() => setNotification(null)} className="text-zinc-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* Active Manga Context & Status Banner */}
          {activeMangaTitle && (
            <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
              currentMapping?.anilistStatus === 'error' || currentMapping?.malStatus === 'error'
                ? 'bg-rose-950/20 border-rose-800/60'
                : 'bg-zinc-950/80 border-zinc-800'
            }`}>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">
                  Obra Selecionada
                </span>
                <p className="font-bold text-white text-sm truncate">{activeMangaTitle}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1">
                    AniList:
                    {currentMapping?.anilistStatus === 'error' ? (
                      <span className="text-rose-400 font-semibold flex items-center gap-0.5">
                        <AlertCircle className="h-3 w-3" /> Erro ({currentMapping.anilistError})
                      </span>
                    ) : currentMapping?.anilistId ? (
                      <span className="text-sky-300 font-semibold flex items-center gap-0.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" /> #{currentMapping.anilistId}
                      </span>
                    ) : (
                      <span className="text-zinc-500">Não vinculado</span>
                    )}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    MAL:
                    {currentMapping?.malStatus === 'error' ? (
                      <span className="text-rose-400 font-semibold flex items-center gap-0.5">
                        <AlertCircle className="h-3 w-3" /> Erro ({currentMapping.malError})
                      </span>
                    ) : currentMapping?.malId ? (
                      <span className="text-blue-300 font-semibold flex items-center gap-0.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" /> #{currentMapping.malId}
                      </span>
                    ) : (
                      <span className="text-zinc-500">Não vinculado</span>
                    )}
                  </span>
                  {currentMapping?.lastScrobbledChapter && (
                    <>
                      <span>•</span>
                      <span>Último cap. sincronizado: {currentMapping.lastScrobbledChapter}</span>
                    </>
                  )}
                </div>
              </div>

              {activeMangaId && (currentMapping?.anilistStatus === 'error' || currentMapping?.malStatus === 'error') && (
                <button
                  type="button"
                  onClick={async () => {
                    setIsRetryingSync(true);
                    try {
                      await TrackerService.retrySync(activeMangaId, activeMangaTitle);
                      setNotification({ type: 'success', message: 'Sincronização reexecutada com sucesso!' });
                    } catch (e: any) {
                      setNotification({ type: 'error', message: e?.message || 'Erro ao sincronizar' });
                    } finally {
                      setIsRetryingSync(false);
                    }
                  }}
                  disabled={isRetryingSync}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-rose-950/40 shrink-0 self-start sm:self-center"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRetryingSync ? 'animate-spin' : ''}`} />
                  <span>{isRetryingSync ? 'Sincronizando...' : 'Tentar Novamente'}</span>
                </button>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* ANILIST TAB */}
          {/* =============================================================== */}
          {activeTab === 'anilist' && (
            <div className="space-y-5">
              {aniListAccount.connected ? (
                /* Connected State */
                <div className="p-4 rounded-xl bg-sky-950/20 border border-sky-800/40 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {aniListAccount.avatarUrl ? (
                        <img
                          src={aniListAccount.avatarUrl}
                          alt="Avatar"
                          className="w-12 h-12 rounded-full border border-sky-500/40 object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center font-bold text-sky-300">
                          AL
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-base">
                            @{aniListAccount.username}
                          </h3>
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[10px] text-emerald-300 font-semibold">
                            <CheckCircle2 className="h-3 w-3" /> Conectado
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          AniList GraphQL API ativa
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => TrackerService.disconnectAniList()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-rose-500/20 border border-zinc-700 hover:border-rose-500/40 text-xs text-zinc-300 hover:text-rose-300 transition-colors cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Desconectar</span>
                    </button>
                  </div>

                  {/* Settings & Scrobble Toggles */}
                  <div className="pt-3 border-t border-sky-900/30 space-y-3 text-xs">
                    <label className="flex items-center justify-between cursor-pointer p-2 rounded-lg bg-zinc-900/60 hover:bg-zinc-900 transition-colors">
                      <div className="space-y-0.5">
                        <span className="font-semibold text-zinc-200 block">
                          Auto-Scrobble de Capítulos Lidos
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          Atualiza automaticamente o progresso no AniList conforme você lê páginas no MangaReader
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={aniListAccount.autoScrobble}
                        onChange={(e) => TrackerService.toggleAniListAutoScrobble(e.target.checked)}
                        className="h-4 w-4 accent-sky-500 rounded cursor-pointer"
                      />
                    </label>

                    {/* Import Library Button */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60">
                      <div>
                        <span className="font-semibold text-zinc-200 block">
                          Importar Mangás do AniList
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          Transfere sua lista completa de leitura do AniList para os Favoritos do MangaReader
                        </span>
                      </div>
                      <button
                        onClick={handleImportAniList}
                        disabled={isImportingAniList}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-all disabled:opacity-50 cursor-pointer"
                      >
                        <Download className={`h-3.5 w-3.5 ${isImportingAniList ? 'animate-bounce' : ''}`} />
                        <span>{isImportingAniList ? 'Importando...' : 'Importar'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Disconnected State */
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
                    <div className="flex items-center gap-2 text-sky-400">
                      <ShieldCheck className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        Opção 1: Conectar com 1 Clique (OAuth Popup)
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Abre a janela de autorização oficial do AniList para autorizar o MangaReader com 1 clique:
                    </p>
                    <button
                      onClick={handleOpenAniListOAuth}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition-all shadow-lg shadow-sky-950/40 cursor-pointer"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>Autorizar Conta AniList</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <KeyRound className="h-4 w-4 text-sky-400" />
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        Opção 2: Inserir Personal Token (Sem Cadastro de App)
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Gere um token pessoal com 1 clique nas configurações da sua conta do AniList em:{' '}
                      <a
                        href="https://anilist.co/settings/developer"
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-400 hover:underline inline-flex items-center gap-1"
                      >
                        anilist.co/settings/developer <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                    <form onSubmit={handleConnectAniListToken} className="space-y-2.5">
                      <input
                        type="password"
                        placeholder="Cole seu token Bearer do AniList aqui..."
                        value={aniListTokenInput}
                        onChange={(e) => setAniListTokenInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-mono"
                      />
                      <button
                        type="submit"
                        disabled={isConnectingAniList || !aniListTokenInput.trim()}
                        className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isConnectingAniList ? 'Validando token...' : 'Salvar e Conectar AniList'}
                      </button>
                    </form>
                  </div>

                  {aniListError && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{aniListError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* MYANIMELIST TAB */}
          {/* =============================================================== */}
          {activeTab === 'mal' && (
            <div className="space-y-5">
              {malAccount.connected ? (
                /* Connected State */
                <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-800/40 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {malAccount.avatarUrl ? (
                        <img
                          src={malAccount.avatarUrl}
                          alt="Avatar"
                          className="w-12 h-12 rounded-full border border-blue-500/40 object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center font-bold text-blue-300">
                          MAL
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-base">
                            @{malAccount.username}
                          </h3>
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[10px] text-emerald-300 font-semibold">
                            <CheckCircle2 className="h-3 w-3" /> Conectado
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          MyAnimeList REST API v2 ativa
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => TrackerService.disconnectMal()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-rose-500/20 border border-zinc-700 hover:border-rose-500/40 text-xs text-zinc-300 hover:text-rose-300 transition-colors cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Desconectar</span>
                    </button>
                  </div>

                  {/* Settings & Scrobble Toggles */}
                  <div className="pt-3 border-t border-blue-900/30 space-y-3 text-xs">
                    <label className="flex items-center justify-between cursor-pointer p-2 rounded-lg bg-zinc-900/60 hover:bg-zinc-900 transition-colors">
                      <div className="space-y-0.5">
                        <span className="font-semibold text-zinc-200 block">
                          Auto-Scrobble no MyAnimeList
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          Incrementa o número de capítulos lidos e altera o status para 'reading' automaticamente
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={malAccount.autoScrobble}
                        onChange={(e) => TrackerService.toggleMalAutoScrobble(e.target.checked)}
                        className="h-4 w-4 accent-blue-500 rounded cursor-pointer"
                      />
                    </label>

                    {/* Import Library Button */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60">
                      <div>
                        <span className="font-semibold text-zinc-200 block">
                          Importar Mangás do MyAnimeList
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          Sincroniza todas as suas obras de mangá do MAL para os Favoritos do MangaReader
                        </span>
                      </div>
                      <button
                        onClick={handleImportMal}
                        disabled={isImportingMal}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all disabled:opacity-50 cursor-pointer"
                      >
                        <Download className={`h-3.5 w-3.5 ${isImportingMal ? 'animate-bounce' : ''}`} />
                        <span>{isImportingMal ? 'Importando...' : 'Importar'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Disconnected State */
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
                    <div className="flex items-center gap-2 text-blue-400">
                      <ShieldCheck className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        Conectar com Client ID (OAuth PKCE Oficial)
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Crie um aplicativo gratuito em{' '}
                      <a
                        href="https://myanimelist.net/apiconfig"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline inline-flex items-center gap-0.5"
                      >
                        myanimelist.net/apiconfig <ExternalLink className="h-3 w-3" />
                      </a>
                      , defina a URL de redirecionamento como <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-200 text-[11px] font-mono">{`${window.location.origin}/auth/mal/callback`}</code> e informe seu Client ID:
                    </p>
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Client ID do MyAnimeList..."
                        value={malClientIdInput}
                        onChange={(e) => setMalClientIdInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono"
                      />
                      <button
                        onClick={handleOpenMalOAuth}
                        disabled={!malClientIdInput.trim()}
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all shadow-lg shadow-blue-950/40 disabled:opacity-50 cursor-pointer"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span>Abrir Login Oficial do MyAnimeList</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <KeyRound className="h-4 w-4 text-blue-400" />
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        Inserir Access Token Direto
                      </span>
                    </div>
                    <form onSubmit={handleConnectMalToken} className="space-y-2.5">
                      <input
                        type="password"
                        placeholder="Cole o Access Token Bearer do MyAnimeList..."
                        value={malTokenInput}
                        onChange={(e) => setMalTokenInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono"
                      />
                      <button
                        type="submit"
                        disabled={isConnectingMal || !malTokenInput.trim()}
                        className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isConnectingMal ? 'Validando token...' : 'Salvar e Conectar MAL'}
                      </button>
                    </form>
                  </div>

                  {malError && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{malError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* MATCHER / LINKING TAB */}
          {/* =============================================================== */}
          {activeTab === 'match' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nome do mangá para vincular..."
                  value={matchQuery}
                  onChange={(e) => setMatchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchMatches()}
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                />
                <button
                  onClick={handleSearchMatches}
                  disabled={isSearchingMatches}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSearchingMatches ? 'animate-spin' : ''}`} />
                  <span>Buscar</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* AniList Matches */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                  <h4 className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                    Correspondências AniList ({aniListMatches.length})
                  </h4>
                  {aniListMatches.length === 0 ? (
                    <p className="text-[11px] text-zinc-500 py-4 text-center">Nenhum resultado ainda</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {aniListMatches.map(m => (
                        <div
                          key={m.id}
                          onClick={() => {
                            if (activeMangaId) {
                              TrackerService.setMapping(activeMangaId, {
                                anilistId: m.id,
                                anilistTitle: m.title
                              });
                              setNotification({
                                type: 'success',
                                message: `Vínculo com AniList atualizado para "${m.title}" (ID: ${m.id})`
                              });
                            }
                          }}
                          className={`flex items-center gap-2.5 p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer border border-zinc-800/80 ${
                            activeMangaId && TrackerService.getMapping(activeMangaId)?.anilistId === m.id
                              ? 'border-sky-500/80 bg-sky-950/20'
                              : ''
                          }`}
                        >
                          {m.coverImage && (
                            <img src={m.coverImage} alt="" className="w-8 h-11 object-cover rounded shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-white truncate">{m.title}</p>
                            <p className="text-[10px] text-zinc-400">
                              ID: {m.id} • {m.totalChapters ? `${m.totalChapters} caps` : 'Em andamento'}
                            </p>
                          </div>
                          {activeMangaId && TrackerService.getMapping(activeMangaId)?.anilistId === m.id && (
                            <Check className="h-4 w-4 text-sky-400 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* MAL Matches */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                  <h4 className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                    Correspondências MyAnimeList ({malMatches.length})
                  </h4>
                  {malMatches.length === 0 ? (
                    <p className="text-[11px] text-zinc-500 py-4 text-center">Nenhum resultado ainda</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {malMatches.map(m => (
                        <div
                          key={m.id}
                          onClick={() => {
                            if (activeMangaId) {
                              TrackerService.setMapping(activeMangaId, {
                                malId: m.id,
                                malTitle: m.title
                              });
                              setNotification({
                                type: 'success',
                                message: `Vínculo com MyAnimeList atualizado para "${m.title}" (ID: ${m.id})`
                              });
                            }
                          }}
                          className={`flex items-center gap-2.5 p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer border border-zinc-800/80 ${
                            activeMangaId && TrackerService.getMapping(activeMangaId)?.malId === m.id
                              ? 'border-blue-500/80 bg-blue-950/20'
                              : ''
                          }`}
                        >
                          {m.coverImage && (
                            <img src={m.coverImage} alt="" className="w-8 h-11 object-cover rounded shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-white truncate">{m.title}</p>
                            <p className="text-[10px] text-zinc-400">
                              ID: {m.id} • {m.totalChapters ? `${m.totalChapters} caps` : 'Em andamento'}
                            </p>
                          </div>
                          {activeMangaId && TrackerService.getMapping(activeMangaId)?.malId === m.id && (
                            <Check className="h-4 w-4 text-blue-400 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* BACKGROUND AUTO-SYNC TAB */}
          {/* =============================================================== */}
          {activeTab === 'sync' && (
            <div className="space-y-5">
              {/* Service Control Card */}
              <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-xl border shrink-0 ${
                      bgSyncState.isSyncing
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : bgSyncState.isEnabled
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                    }`}>
                      <RotateCw className={`h-5 w-5 ${bgSyncState.isSyncing ? 'animate-spin' : ''}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">
                          Sincronização Periódica em Segundo Plano
                        </h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          bgSyncState.isSyncing
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                            : bgSyncState.isEnabled
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}>
                          {bgSyncState.isSyncing ? 'Executando Agora' : bgSyncState.isEnabled ? 'Ativo' : 'Pausado'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                        Verifica silenciosamente o progresso de leitura gravado no MangaReader e envia para o AniList e MyAnimeList, corrigindo qualquer defasagem automaticamente.
                      </p>
                      {bgSyncState.isSyncing && bgSyncState.currentSyncMangaTitle && (
                        <p className="text-xs text-emerald-300 font-medium mt-1 flex items-center gap-1.5 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          Sincronizando: {bgSyncState.currentSyncMangaTitle}...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => TrackerBackgroundService.setEnabled(!bgSyncState.isEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                        bgSyncState.isEnabled ? 'bg-emerald-600' : 'bg-zinc-800'
                      }`}
                      role="switch"
                      aria-checked={bgSyncState.isEnabled}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          bgSyncState.isEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className="text-xs font-semibold text-zinc-200">
                      {bgSyncState.isEnabled ? 'Habilitado' : 'Desabilitado'}
                    </span>
                  </div>
                </div>

                {/* Interval & Trigger Row */}
                <div className="pt-3 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-zinc-400 font-medium flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-zinc-500" />
                      Frequência de Verificação:
                    </span>
                    <select
                      value={bgSyncState.intervalMinutes}
                      onChange={(e) => TrackerBackgroundService.setIntervalMinutes(Number(e.target.value))}
                      disabled={!bgSyncState.isEnabled}
                      className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-200 font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
                    >
                      <option value={2}>A cada 2 minutos</option>
                      <option value={5}>A cada 5 minutos (Recomendado)</option>
                      <option value={10}>A cada 10 minutos</option>
                      <option value={15}>A cada 15 minutos</option>
                      <option value={30}>A cada 30 minutos</option>
                      <option value={60}>A cada 1 hora</option>
                    </select>
                    <span className="text-zinc-500 text-[11px]">
                      • {formatTimeAgo(bgSyncState.lastSyncTimestamp)}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={isManualSyncing || bgSyncState.isSyncing}
                    onClick={async () => {
                      setIsManualSyncing(true);
                      try {
                        const stats = await TrackerBackgroundService.syncAllPending(true);
                        setNotification({
                          type: 'success',
                          message: `Sincronização concluída! ${stats.syncedCount} atualizado(s), ${stats.alreadySyncedCount} já em dia${stats.errorsCount > 0 ? `, ${stats.errorsCount} aviso(s)` : ''}.`
                        });
                      } catch (err: any) {
                        setNotification({ type: 'error', message: err?.message || 'Erro na sincronização.' });
                      } finally {
                        setIsManualSyncing(false);
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-950/40 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isManualSyncing || bgSyncState.isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isManualSyncing || bgSyncState.isSyncing ? 'Sincronizando...' : 'Sincronizar Todas as Obras Agora'}</span>
                  </button>
                </div>
              </div>

              {/* Stats Summary Cards */}
              {bgSyncState.lastSyncStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Verificados</span>
                    <p className="text-base font-bold text-white mt-0.5">{bgSyncState.lastSyncStats.totalChecked}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Atualizados</span>
                    <p className="text-base font-bold text-emerald-400 mt-0.5">{bgSyncState.lastSyncStats.syncedCount}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Já em Dia</span>
                    <p className="text-base font-bold text-zinc-300 mt-0.5">{bgSyncState.lastSyncStats.alreadySyncedCount}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">Avisos / Erros</span>
                    <p className={`text-base font-bold mt-0.5 ${bgSyncState.lastSyncStats.errorsCount > 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
                      {bgSyncState.lastSyncStats.errorsCount}
                    </p>
                  </div>
                </div>
              )}

              {/* Linked Works & Reconciliation Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-emerald-400" />
                    Obras Vinculadas & Status Local vs Remoto
                  </h4>
                  <span className="text-xs text-zinc-500 font-mono">
                    {Object.values(TrackerService.getMappings()).filter(m => m.anilistId || m.malId).length} obras vinculadas
                  </span>
                </div>

                {Object.values(TrackerService.getMappings()).filter(m => m.anilistId || m.malId).length === 0 ? (
                  <div className="p-6 rounded-xl bg-zinc-950/60 border border-zinc-800 text-center space-y-2">
                    <p className="text-xs text-zinc-400 font-medium">Nenhuma obra vinculada ainda.</p>
                    <p className="text-[11px] text-zinc-500">
                      Vá até a aba &quot;Vincular Obras&quot; para associar os mangás do seu catálogo aos IDs correspondentes no AniList ou MyAnimeList.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {Object.entries(TrackerService.getMappings())
                      .filter(([_, m]) => Boolean(m.anilistId || m.malId))
                      .map(([mId, m]) => {
                        const progress = HistoryService.getProgress(mId);
                        const localChapter = progress ? Math.floor(parseFloat(progress.chapterNumber)) : 0;
                        const remoteChapter = m.lastScrobbledChapter ? Math.floor(parseFloat(m.lastScrobbledChapter)) : 0;
                        const isBehind = localChapter > 0 && localChapter > remoteChapter;
                        const hasError = m.anilistStatus === 'error' || m.malStatus === 'error';
                        const displayTitle = m.anilistTitle || m.malTitle || progress?.mangaTitle || mId;

                        return (
                          <div
                            key={mId}
                            className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                              hasError
                                ? 'bg-rose-950/20 border-rose-800/60'
                                : isBehind
                                ? 'bg-amber-950/15 border-amber-800/50'
                                : 'bg-zinc-950 border-zinc-800/80 hover:border-zinc-700'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-white truncate text-xs">{displayTitle}</p>
                                {hasError ? (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 shrink-0">
                                    <AlertCircle className="h-2.5 w-2.5" /> Erro
                                  </span>
                                ) : isBehind ? (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 shrink-0 animate-pulse">
                                    <Zap className="h-2.5 w-2.5" /> Defasado
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 shrink-0">
                                    <CheckCircle2 className="h-2.5 w-2.5" /> Em dia
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-zinc-400 font-mono">
                                <span>Local: <strong className="text-zinc-200">Cap. {localChapter > 0 ? localChapter : 'Nenhum'}</strong></span>
                                <span>•</span>
                                <span>Remoto: <strong className="text-zinc-200">Cap. {remoteChapter > 0 ? remoteChapter : '0'}</strong></span>
                                <span>•</span>
                                <span className="text-zinc-500">
                                  {m.anilistId ? `AniList #${m.anilistId}` : ''}
                                  {m.anilistId && m.malId ? ' | ' : ''}
                                  {m.malId ? `MAL #${m.malId}` : ''}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await TrackerService.retrySync(mId, displayTitle);
                                  setNotification({ type: 'success', message: `Progresso de "${displayTitle}" sincronizado!` });
                                } catch (e: any) {
                                  setNotification({ type: 'error', message: e?.message || 'Falha ao sincronizar' });
                                }
                              }}
                              className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1 cursor-pointer shrink-0 transition-colors"
                            >
                              <RefreshCw className="h-3 w-3" />
                              <span>Sincronizar</span>
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Execution Details Log */}
              {bgSyncState.lastSyncStats?.details && bgSyncState.lastSyncStats.details.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    Log da Última Execução
                  </h4>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-400 space-y-1 max-h-36 overflow-y-auto">
                    {bgSyncState.lastSyncStats.details.map((line, idx) => (
                      <p key={idx} className="flex items-center gap-1.5 truncate">
                        <span className="text-emerald-400">›</span> {line}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-zinc-400">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${aniListAccount.connected ? 'bg-sky-400' : 'bg-zinc-600'}`}></span>
              AniList: {aniListAccount.connected ? `@${aniListAccount.username}` : 'Desconectado'}
            </span>
            <span className="text-zinc-600">•</span>
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${malAccount.connected ? 'bg-blue-400' : 'bg-zinc-600'}`}></span>
              MAL: {malAccount.connected ? `@${malAccount.username}` : 'Desconectado'}
            </span>
            <span className="text-zinc-600">•</span>
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${bgSyncState.isSyncing ? 'bg-emerald-400 animate-ping' : bgSyncState.isEnabled ? 'bg-emerald-400' : 'bg-zinc-600'}`}></span>
              Auto-Sync: {bgSyncState.isSyncing ? 'Sincronizando...' : bgSyncState.isEnabled ? `Ativo (${bgSyncState.intervalMinutes}m)` : 'Pausado'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition-colors cursor-pointer self-end sm:self-auto"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
