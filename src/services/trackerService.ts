import { HistoryService } from './history.js';
import { FavoriteManga, LibraryCategory } from '../types/manga.js';

export interface TrackerAccount {
  provider: 'anilist' | 'mal';
  connected: boolean;
  username?: string;
  avatarUrl?: string;
  token?: string;
  refreshToken?: string;
  clientId?: string;
  autoScrobble: boolean;
  lastSyncAt?: string;
}

export interface TrackerMatch {
  id: number;
  title: string;
  coverImage?: string;
  totalChapters?: number;
  status?: string;
  provider: 'anilist' | 'mal';
}

export type TrackerServiceSyncState = 'synced' | 'error' | 'unlinked' | 'disconnected';

export interface TrackerMediaMapping {
  mangaId: string;
  anilistId?: number;
  anilistTitle?: string;
  anilistStatus?: 'synced' | 'error' | 'unlinked';
  anilistError?: string;
  malId?: number;
  malTitle?: string;
  malStatus?: 'synced' | 'error' | 'unlinked';
  malError?: string;
  lastScrobbledChapter?: string;
  lastSyncAt?: number;
  updatedAt: number;
}

export interface MangaTrackerStatusInfo {
  overallStatus: TrackerServiceSyncState;
  hasTrackersConnected: boolean;
  isLinked: boolean;
  anilist: {
    connected: boolean;
    linked: boolean;
    id?: number;
    title?: string;
    status: TrackerServiceSyncState;
    error?: string;
  };
  mal: {
    connected: boolean;
    linked: boolean;
    id?: number;
    title?: string;
    status: TrackerServiceSyncState;
    error?: string;
  };
  lastScrobbledChapter?: string;
  lastSyncAt?: number;
  label: string;
  tooltip: string;
}

const ANILIST_ACCOUNT_KEY = 'manga_reader_anilist_account_v1';
const MAL_ACCOUNT_KEY = 'manga_reader_mal_account_v1';
const TRACKER_MAPPINGS_KEY = 'manga_reader_tracker_mappings_v1';

type TrackerListener = () => void;
const trackerListeners = new Set<TrackerListener>();

function notifyTrackerListeners() {
  trackerListeners.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.warn('Tracker listener error', e);
    }
  });
}

function cleanTitleForSearch(title: string): string {
  if (!title) return '';
  return title
    .replace(/^mr_[^_]+_/, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[-_]/g, ' ')
    .trim();
}

export const TrackerService = {
  subscribe(listener: TrackerListener): () => void {
    trackerListeners.add(listener);
    return () => {
      trackerListeners.delete(listener);
    };
  },

  getAniListAccount(): TrackerAccount {
    try {
      const data = localStorage.getItem(ANILIST_ACCOUNT_KEY);
      if (!data) return { provider: 'anilist', connected: false, autoScrobble: true };
      const parsed = JSON.parse(data);
      return { provider: 'anilist', autoScrobble: true, ...parsed };
    } catch {
      return { provider: 'anilist', connected: false, autoScrobble: true };
    }
  },

  getMalAccount(): TrackerAccount {
    try {
      const data = localStorage.getItem(MAL_ACCOUNT_KEY);
      if (!data) return { provider: 'mal', connected: false, autoScrobble: true };
      const parsed = JSON.parse(data);
      return { provider: 'mal', autoScrobble: true, ...parsed };
    } catch {
      return { provider: 'mal', connected: false, autoScrobble: true };
    }
  },

  getMappings(): Record<string, TrackerMediaMapping> {
    try {
      const data = localStorage.getItem(TRACKER_MAPPINGS_KEY);
      if (!data) return {};
      return JSON.parse(data) || {};
    } catch {
      return {};
    }
  },

  getMapping(mangaId: string): TrackerMediaMapping | undefined {
    return this.getMappings()[mangaId];
  },

  setMapping(mangaId: string, partial: Partial<TrackerMediaMapping>): void {
    const all = this.getMappings();
    const current = all[mangaId] || { mangaId, updatedAt: Date.now() };

    // Auto-resolve default status when IDs are provided without explicit errors
    let nextAnilistStatus = partial.anilistStatus !== undefined ? partial.anilistStatus : current.anilistStatus;
    if (partial.anilistId && !nextAnilistStatus) {
      nextAnilistStatus = 'synced';
    }
    let nextMalStatus = partial.malStatus !== undefined ? partial.malStatus : current.malStatus;
    if (partial.malId && !nextMalStatus) {
      nextMalStatus = 'synced';
    }

    all[mangaId] = {
      ...current,
      ...partial,
      anilistStatus: nextAnilistStatus,
      malStatus: nextMalStatus,
      lastSyncAt: Date.now(),
      mangaId,
      updatedAt: Date.now()
    };
    try {
      localStorage.setItem(TRACKER_MAPPINGS_KEY, JSON.stringify(all));
      notifyTrackerListeners();
    } catch (e) {
      console.warn('Failed to save tracker mapping', e);
    }
  },

  getMangaSyncStatus(mangaId: string): MangaTrackerStatusInfo {
    const anilistAcc = this.getAniListAccount();
    const malAcc = this.getMalAccount();
    const hasTrackersConnected = anilistAcc.connected || malAcc.connected;
    const mapping = this.getMapping(mangaId);

    const anilistLinked = Boolean(mapping?.anilistId);
    const malLinked = Boolean(mapping?.malId);
    const isLinked = anilistLinked || malLinked;

    const anilistStatus: TrackerServiceSyncState = !anilistAcc.connected
      ? 'disconnected'
      : (mapping?.anilistStatus || (anilistLinked ? 'synced' : 'unlinked'));

    const malStatus: TrackerServiceSyncState = !malAcc.connected
      ? 'disconnected'
      : (mapping?.malStatus || (malLinked ? 'synced' : 'unlinked'));

    let overallStatus: TrackerServiceSyncState = 'disconnected';
    let label = 'Desconectado';
    let tooltip = 'AniList e MyAnimeList não conectados.';

    if (!hasTrackersConnected) {
      overallStatus = 'disconnected';
      label = 'Rastreamento Desconectado';
      tooltip = 'Conecte sua conta do AniList ou MyAnimeList para rastrear leituras automaticamente.';
    } else {
      // Collect connected statuses
      const connectedItems: { name: string; status: TrackerServiceSyncState; error?: string; id?: number }[] = [];
      if (anilistAcc.connected) {
        connectedItems.push({ name: 'AniList', status: anilistStatus, error: mapping?.anilistError, id: mapping?.anilistId });
      }
      if (malAcc.connected) {
        connectedItems.push({ name: 'MyAnimeList', status: malStatus, error: mapping?.malError, id: mapping?.malId });
      }

      const hasError = connectedItems.some(i => i.status === 'error');
      const allSynced = connectedItems.length > 0 && connectedItems.every(i => i.status === 'synced');
      const anySynced = connectedItems.some(i => i.status === 'synced');
      const allUnlinked = connectedItems.every(i => i.status === 'unlinked');

      if (hasError) {
        overallStatus = 'error';
        label = 'Erro de Sincronização';
        const errors = connectedItems.filter(i => i.status === 'error').map(i => `${i.name}: ${i.error || 'Falha de comunicação'}`).join(' · ');
        tooltip = `Falha ao sincronizar com serviços externos (${errors}). Clique para corrigir ou revincular.`;
      } else if (allSynced || (anySynced && !hasError)) {
        overallStatus = 'synced';
        label = 'Sincronizado';
        const syncedNames = connectedItems.filter(i => i.status === 'synced').map(i => i.name).join(' e ');
        const chapterStr = mapping?.lastScrobbledChapter ? ` (Último lido: Cap. ${mapping.lastScrobbledChapter})` : '';
        tooltip = `Obra vinculada e sincronizada com ${syncedNames || 'serviços externos'}${chapterStr}.`;
      } else if (allUnlinked) {
        overallStatus = 'unlinked';
        label = 'Não vinculado';
        tooltip = `Obra ainda não vinculada a ${connectedItems.map(i => i.name).join(' nem ')}. Clique para buscar e vincular.`;
      } else {
        overallStatus = isLinked ? 'synced' : 'unlinked';
        label = isLinked ? 'Sincronizado' : 'Não vinculado';
        tooltip = isLinked ? 'Vinculado com serviços externos.' : 'Não vinculado.';
      }
    }

    return {
      overallStatus,
      hasTrackersConnected,
      isLinked,
      anilist: {
        connected: anilistAcc.connected,
        linked: anilistLinked,
        id: mapping?.anilistId,
        title: mapping?.anilistTitle,
        status: anilistStatus,
        error: mapping?.anilistError
      },
      mal: {
        connected: malAcc.connected,
        linked: malLinked,
        id: mapping?.malId,
        title: mapping?.malTitle,
        status: malStatus,
        error: mapping?.malError
      },
      lastScrobbledChapter: mapping?.lastScrobbledChapter,
      lastSyncAt: mapping?.lastSyncAt,
      label,
      tooltip
    };
  },

  // --------------------------------------------------------------------------
  // ANILIST INTEGRATION
  // --------------------------------------------------------------------------

  async connectAniListWithToken(token: string): Promise<TrackerAccount> {
    const cleanToken = token.trim();
    if (!cleanToken) throw new Error('Token do AniList não pode ser vazio.');

    // Fetch Viewer Profile via GraphQL
    const query = `
      query {
        Viewer {
          id
          name
          avatar {
            medium
            large
          }
        }
      }
    `;

    const res = await fetch('/api/trackers/anilist/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanToken}`
      },
      body: JSON.stringify({ query })
    });

    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors[0]?.message || 'Token inválido ou expirado do AniList.');
    }

    const viewer = json.data?.Viewer;
    if (!viewer) {
      throw new Error('Não foi possível obter dados do usuário AniList.');
    }

    const account: TrackerAccount = {
      provider: 'anilist',
      connected: true,
      username: viewer.name,
      avatarUrl: viewer.avatar?.medium || viewer.avatar?.large,
      token: cleanToken,
      autoScrobble: true,
      lastSyncAt: new Date().toISOString()
    };

    localStorage.setItem(ANILIST_ACCOUNT_KEY, JSON.stringify(account));
    notifyTrackerListeners();
    return account;
  },

  disconnectAniList(): void {
    localStorage.removeItem(ANILIST_ACCOUNT_KEY);
    notifyTrackerListeners();
  },

  toggleAniListAutoScrobble(enabled: boolean): void {
    const account = this.getAniListAccount();
    account.autoScrobble = enabled;
    localStorage.setItem(ANILIST_ACCOUNT_KEY, JSON.stringify(account));
    notifyTrackerListeners();
  },

  async searchAniListManga(title: string): Promise<TrackerMatch[]> {
    const clean = cleanTitleForSearch(title);
    if (!clean) return [];

    const query = `
      query ($search: String) {
        Page(page: 1, perPage: 8) {
          media(search: $search, type: MANGA) {
            id
            title {
              romaji
              english
              native
            }
            coverImage {
              medium
              large
            }
            chapters
            status
          }
        }
      }
    `;

    const res = await fetch('/api/trackers/anilist/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { search: clean } })
    });

    const json = await res.json();
    const mediaList = json.data?.Page?.media || [];
    return mediaList.map((m: any) => ({
      id: m.id,
      title: m.title?.english || m.title?.romaji || m.title?.native || 'Sem Título',
      coverImage: m.coverImage?.medium || m.coverImage?.large,
      totalChapters: m.chapters || undefined,
      status: m.status,
      provider: 'anilist'
    }));
  },

  // --------------------------------------------------------------------------
  // MYANIMELIST (MAL) INTEGRATION
  // --------------------------------------------------------------------------

  async connectMalWithToken(token: string, clientId?: string): Promise<TrackerAccount> {
    const cleanToken = token.trim();
    if (!cleanToken) throw new Error('Token do MyAnimeList não pode ser vazio.');

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${cleanToken}`
    };
    if (clientId) {
      headers['x-mal-client-id'] = clientId;
    }

    const res = await fetch('/api/trackers/mal/proxy/users/@me', { headers });
    const json = await res.json();

    if (json.error) {
      throw new Error(json.message || 'Falha ao autenticar com MyAnimeList. Verifique o token.');
    }

    const account: TrackerAccount = {
      provider: 'mal',
      connected: true,
      username: json.name || 'Usuário MAL',
      avatarUrl: json.picture || undefined,
      token: cleanToken,
      clientId: clientId?.trim(),
      autoScrobble: true,
      lastSyncAt: new Date().toISOString()
    };

    localStorage.setItem(MAL_ACCOUNT_KEY, JSON.stringify(account));
    notifyTrackerListeners();
    return account;
  },

  async exchangeMalCode(code: string, codeVerifier: string, clientId: string, redirectUri: string, clientSecret?: string): Promise<TrackerAccount> {
    const res = await fetch('/api/trackers/mal/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        clientSecret,
        code,
        codeVerifier,
        redirectUri
      })
    });

    const data = await res.json();
    if (!data.access_token) {
      throw new Error(data.error_description || data.error || 'Falha ao obter token do MyAnimeList');
    }

    return this.connectMalWithToken(data.access_token, clientId);
  },

  disconnectMal(): void {
    localStorage.removeItem(MAL_ACCOUNT_KEY);
    notifyTrackerListeners();
  },

  toggleMalAutoScrobble(enabled: boolean): void {
    const account = this.getMalAccount();
    account.autoScrobble = enabled;
    localStorage.setItem(MAL_ACCOUNT_KEY, JSON.stringify(account));
    notifyTrackerListeners();
  },

  async searchMalManga(title: string): Promise<TrackerMatch[]> {
    const clean = cleanTitleForSearch(title);
    if (!clean) return [];

    const malAcc = this.getMalAccount();
    const headers: Record<string, string> = {};
    if (malAcc.token) {
      headers['Authorization'] = `Bearer ${malAcc.token}`;
    }
    if (malAcc.clientId) {
      headers['x-mal-client-id'] = malAcc.clientId;
    }

    const encoded = encodeURIComponent(clean);
    const res = await fetch(`/api/trackers/mal/proxy/manga?q=${encoded}&limit=8&fields=num_chapters,status,main_picture`, {
      headers
    });

    const json = await res.json();
    const dataList = json.data || [];
    return dataList.map((item: any) => {
      const node = item.node || {};
      return {
        id: node.id,
        title: node.title || 'Sem Título',
        coverImage: node.main_picture?.medium || node.main_picture?.large,
        totalChapters: node.num_chapters || undefined,
        status: node.status,
        provider: 'mal'
      };
    });
  },

  // --------------------------------------------------------------------------
  // AUTO-SCROBBLE (SYNC CHAPTER PROGRESS)
  // --------------------------------------------------------------------------

  async scrobbleChapter(mangaId: string, mangaTitle: string, chapterNumberStr: string, force = false): Promise<{
    anilistSuccess?: boolean;
    malSuccess?: boolean;
    anilistError?: string;
    malError?: string;
  }> {
    const parsedNum = Math.floor(parseFloat(chapterNumberStr));
    if (isNaN(parsedNum) || parsedNum <= 0) {
      return {};
    }

    const anilistAcc = this.getAniListAccount();
    const malAcc = this.getMalAccount();

    if (!anilistAcc.connected && !malAcc.connected) {
      return {};
    }

    const mapping = this.getMapping(mangaId) || { mangaId, updatedAt: Date.now() };

    // Don't duplicate scrobble if already sent for this exact or higher chapter,
    // unless force is true or previous sync for this manga had an error
    const hasExistingError = mapping.anilistStatus === 'error' || mapping.malStatus === 'error';
    const lastScrobbled = mapping.lastScrobbledChapter ? parseFloat(mapping.lastScrobbledChapter) : 0;
    if (!force && !hasExistingError && parsedNum <= lastScrobbled) {
      return {};
    }

    let anilistSuccess = false;
    let anilistError: string | undefined;
    let malSuccess = false;
    let malError: string | undefined;

    // 1. Scrobble AniList
    if (anilistAcc.connected && anilistAcc.autoScrobble && anilistAcc.token) {
      try {
        let anilistId = mapping.anilistId;
        if (!anilistId) {
          // Auto resolve ID by searching
          const matches = await this.searchAniListManga(mangaTitle);
          if (matches.length > 0) {
            anilistId = matches[0].id;
            mapping.anilistId = anilistId;
            mapping.anilistTitle = matches[0].title;
          }
        }

        if (anilistId) {
          const mutation = `
            mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
              SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
                id
                mediaId
                progress
                status
              }
            }
          `;

          const res = await fetch('/api/trackers/anilist/graphql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${anilistAcc.token}`
            },
            body: JSON.stringify({
              query: mutation,
              variables: {
                mediaId: anilistId,
                progress: parsedNum,
                status: 'CURRENT'
              }
            })
          });

          const json = await res.json();
          if (json.errors && json.errors.length > 0) {
            anilistError = json.errors[0]?.message;
            mapping.anilistStatus = 'error';
            mapping.anilistError = anilistError;
          } else {
            anilistSuccess = true;
            mapping.anilistStatus = 'synced';
            delete mapping.anilistError;
          }
        } else {
          mapping.anilistStatus = 'unlinked';
        }
      } catch (err: any) {
        anilistError = err?.message || 'Falha ao enviar capítulo para o AniList';
        mapping.anilistStatus = 'error';
        mapping.anilistError = anilistError;
      }
    }

    // 2. Scrobble MyAnimeList (MAL)
    if (malAcc.connected && malAcc.autoScrobble && malAcc.token) {
      try {
        let malId = mapping.malId;
        if (!malId) {
          const matches = await this.searchMalManga(mangaTitle);
          if (matches.length > 0) {
            malId = matches[0].id;
            mapping.malId = malId;
            mapping.malTitle = matches[0].title;
          }
        }

        if (malId) {
          const headers: Record<string, string> = {
            'Authorization': `Bearer ${malAcc.token}`
          };
          if (malAcc.clientId) {
            headers['x-mal-client-id'] = malAcc.clientId;
          }

          const res = await fetch(`/api/trackers/mal/proxy/manga/${malId}/my_list_status`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              status: 'reading',
              num_chapters_read: parsedNum
            })
          });

          const json = await res.json();
          if (json.error) {
            malError = json.message || json.error;
            mapping.malStatus = 'error';
            mapping.malError = malError;
          } else {
            malSuccess = true;
            mapping.malStatus = 'synced';
            delete mapping.malError;
          }
        } else {
          mapping.malStatus = 'unlinked';
        }
      } catch (err: any) {
        malError = err?.message || 'Falha ao enviar capítulo para o MyAnimeList';
        mapping.malStatus = 'error';
        mapping.malError = malError;
      }
    }

    if (anilistSuccess || malSuccess) {
      mapping.lastScrobbledChapter = String(parsedNum);
    }
    mapping.lastSyncAt = Date.now();
    this.setMapping(mangaId, mapping);

    return { anilistSuccess, malSuccess, anilistError, malError };
  },

  // --------------------------------------------------------------------------
  // SYNC STATUS & RATING TO TRACKERS
  // --------------------------------------------------------------------------

  async updateTrackerStatus(mangaId: string, mangaTitle: string, category: LibraryCategory, score?: number): Promise<void> {
    const anilistAcc = this.getAniListAccount();
    const malAcc = this.getMalAccount();

    if (!anilistAcc.connected && !malAcc.connected) return;

    const mapping = this.getMapping(mangaId) || { mangaId, updatedAt: Date.now() };

    // Convert category
    const anilistStatus = 
      category === 'reading' ? 'CURRENT' :
      category === 'completed' ? 'COMPLETED' :
      category === 'plan_to_read' ? 'PLANNING' :
      category === 'on_hold' ? 'PAUSED' :
      category === 'dropped' ? 'DROPPED' : 'CURRENT';

    const malStatus = 
      category === 'reading' ? 'reading' :
      category === 'completed' ? 'completed' :
      category === 'plan_to_read' ? 'plan_to_read' :
      category === 'on_hold' ? 'on_hold' :
      category === 'dropped' ? 'dropped' : 'reading';

    // 1. Update AniList
    if (anilistAcc.connected && anilistAcc.token) {
      try {
        let anilistId = mapping.anilistId;
        if (!anilistId) {
          const matches = await this.searchAniListManga(mangaTitle);
          if (matches.length > 0) {
            anilistId = matches[0].id;
            mapping.anilistId = anilistId;
            mapping.anilistTitle = matches[0].title;
          }
        }

        if (anilistId) {
          const variables: Record<string, any> = {
            mediaId: anilistId,
            status: anilistStatus
          };
          if (typeof score === 'number' && score > 0) {
            variables.scoreRaw = score * 10; // AniList 100-point scale
          }

          const mutation = `
            mutation ($mediaId: Int, $status: MediaListStatus, $scoreRaw: Int) {
              SaveMediaListEntry(mediaId: $mediaId, status: $status, scoreRaw: $scoreRaw) {
                id
                status
                score
              }
            }
          `;

          const res = await fetch('/api/trackers/anilist/graphql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${anilistAcc.token}`
            },
            body: JSON.stringify({ query: mutation, variables })
          });

          const json = await res.json();
          if (json.errors && json.errors.length > 0) {
            mapping.anilistStatus = 'error';
            mapping.anilistError = json.errors[0]?.message;
          } else {
            mapping.anilistStatus = 'synced';
            delete mapping.anilistError;
          }
        } else {
          mapping.anilistStatus = 'unlinked';
        }
      } catch (e: any) {
        console.warn('Failed to update AniList status', e);
        mapping.anilistStatus = 'error';
        mapping.anilistError = e?.message || 'Falha ao atualizar status no AniList';
      }
    }

    // 2. Update MAL
    if (malAcc.connected && malAcc.token) {
      try {
        let malId = mapping.malId;
        if (!malId) {
          const matches = await this.searchMalManga(mangaTitle);
          if (matches.length > 0) {
            malId = matches[0].id;
            mapping.malId = malId;
            mapping.malTitle = matches[0].title;
          }
        }

        if (malId) {
          const payload: Record<string, any> = {
            status: malStatus
          };
          if (typeof score === 'number' && score > 0) {
            payload.score = Math.round(score);
          }

          const headers: Record<string, string> = {
            'Authorization': `Bearer ${malAcc.token}`
          };
          if (malAcc.clientId) {
            headers['x-mal-client-id'] = malAcc.clientId;
          }

          const res = await fetch(`/api/trackers/mal/proxy/manga/${malId}/my_list_status`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload)
          });

          const json = await res.json();
          if (json.error) {
            mapping.malStatus = 'error';
            mapping.malError = json.message || json.error;
          } else {
            mapping.malStatus = 'synced';
            delete mapping.malError;
          }
        } else {
          mapping.malStatus = 'unlinked';
        }
      } catch (e: any) {
        console.warn('Failed to update MAL status', e);
        mapping.malStatus = 'error';
        mapping.malError = e?.message || 'Falha ao atualizar status no MyAnimeList';
      }
    }

    mapping.lastSyncAt = Date.now();
    this.setMapping(mangaId, mapping);
  },

  async retrySync(mangaId: string, mangaTitle: string): Promise<MangaTrackerStatusInfo> {
    const prog = HistoryService.getProgress(mangaId);
    if (prog?.chapterNumber) {
      await this.scrobbleChapter(mangaId, mangaTitle, prog.chapterNumber);
    }
    const fav = HistoryService.getFavorites().find(f => f.mangaId === mangaId);
    if (fav) {
      await this.updateTrackerStatus(mangaId, mangaTitle, fav.userCategory || 'reading', fav.userScore);
    }
    return this.getMangaSyncStatus(mangaId);
  },

  // --------------------------------------------------------------------------
  // IMPORT LIBRARY FROM ANILIST / MAL INTO FAVORITES
  // --------------------------------------------------------------------------

  async importFromAniList(): Promise<{ importedCount: number; message: string }> {
    const acc = this.getAniListAccount();
    if (!acc.connected || !acc.token) {
      throw new Error('Conecte sua conta do AniList antes de importar.');
    }

    // Get current Viewer's media list
    const query = `
      query {
        Viewer {
          id
          name
          mediaListOptions {
            scoreFormat
          }
        }
      }
    `;

    const userRes = await fetch('/api/trackers/anilist/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${acc.token}`
      },
      body: JSON.stringify({ query })
    });
    const userJson = await userRes.json();
    const userId = userJson.data?.Viewer?.id;
    if (!userId) {
      throw new Error('Não foi possível obter ID de usuário do AniList.');
    }

    const listQuery = `
      query ($userId: Int) {
        MediaListCollection(userId: $userId, type: MANGA) {
          lists {
            name
            entries {
              status
              score
              progress
              media {
                id
                title {
                  romaji
                  english
                  native
                }
                coverImage {
                  large
                  medium
                }
                status
                genres
              }
            }
          }
        }
      }
    `;

    const listRes = await fetch('/api/trackers/anilist/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${acc.token}`
      },
      body: JSON.stringify({ query: listQuery, variables: { userId } })
    });

    const listJson = await listRes.json();
    const lists = listJson.data?.MediaListCollection?.lists || [];

    const importedFavs: FavoriteManga[] = [];
    const mappings = this.getMappings();

    lists.forEach((list: any) => {
      const entries = list.entries || [];
      entries.forEach((entry: any) => {
        const media = entry.media;
        if (!media) return;

        const title = media.title?.english || media.title?.romaji || media.title?.native || 'Mangá AniList';
        const mangaId = `mr_anilist_${media.id}`;

        let cat: LibraryCategory = 'reading';
        if (entry.status === 'COMPLETED') cat = 'completed';
        else if (entry.status === 'PLANNING') cat = 'plan_to_read';
        else if (entry.status === 'PAUSED') cat = 'on_hold';
        else if (entry.status === 'DROPPED') cat = 'dropped';

        importedFavs.push({
          mangaId,
          title,
          coverUrl: media.coverImage?.large || media.coverImage?.medium || '',
          sourceName: 'AniList',
          sourceId: 'anilist',
          genres: media.genres || [],
          status: media.status === 'FINISHED' ? 'completed' : 'ongoing',
          userCategory: cat,
          userScore: typeof entry.score === 'number' && entry.score > 0 ? (entry.score > 10 ? Math.round(entry.score / 10) : entry.score) : undefined,
          updatedAt: Date.now()
        });

        // Store mapping
        mappings[mangaId] = {
          mangaId,
          anilistId: media.id,
          anilistTitle: title,
          lastScrobbledChapter: entry.progress ? String(entry.progress) : undefined,
          updatedAt: Date.now()
        };
      });
    });

    if (importedFavs.length > 0) {
      localStorage.setItem(TRACKER_MAPPINGS_KEY, JSON.stringify(mappings));
      HistoryService.importBackup({ favorites: importedFavs });
    }

    return {
      importedCount: importedFavs.length,
      message: `${importedFavs.length} mangás importados com sucesso do seu AniList!`
    };
  },

  async importFromMal(): Promise<{ importedCount: number; message: string }> {
    const acc = this.getMalAccount();
    if (!acc.connected || !acc.token) {
      throw new Error('Conecte sua conta do MyAnimeList antes de importar.');
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${acc.token}`
    };
    if (acc.clientId) {
      headers['x-mal-client-id'] = acc.clientId;
    }

    const res = await fetch('/api/trackers/mal/proxy/users/@me/mangalist?fields=list_status,num_chapters,main_picture,genres,status&limit=100', {
      headers
    });
    const json = await res.json();
    const dataList = json.data || [];

    const importedFavs: FavoriteManga[] = [];
    const mappings = this.getMappings();

    dataList.forEach((item: any) => {
      const node = item.node;
      const statusObj = item.list_status || {};
      if (!node) return;

      const title = node.title || 'Mangá MAL';
      const mangaId = `mr_mal_${node.id}`;

      let cat: LibraryCategory = 'reading';
      const malSt = statusObj.status;
      if (malSt === 'completed') cat = 'completed';
      else if (malSt === 'plan_to_read') cat = 'plan_to_read';
      else if (malSt === 'on_hold') cat = 'on_hold';
      else if (malSt === 'dropped') cat = 'dropped';

      importedFavs.push({
        mangaId,
        title,
        coverUrl: node.main_picture?.large || node.main_picture?.medium || '',
        sourceName: 'MyAnimeList',
        sourceId: 'mal',
        genres: Array.isArray(node.genres) ? node.genres.map((g: any) => g.name) : [],
        status: node.status === 'finished' ? 'completed' : 'ongoing',
        userCategory: cat,
        userScore: typeof statusObj.score === 'number' && statusObj.score > 0 ? statusObj.score : undefined,
        updatedAt: Date.now()
      });

      mappings[mangaId] = {
        mangaId,
        malId: node.id,
        malTitle: title,
        lastScrobbledChapter: statusObj.num_chapters_read ? String(statusObj.num_chapters_read) : undefined,
        updatedAt: Date.now()
      };
    });

    if (importedFavs.length > 0) {
      localStorage.setItem(TRACKER_MAPPINGS_KEY, JSON.stringify(mappings));
      HistoryService.importBackup({ favorites: importedFavs });
    }

    return {
      importedCount: importedFavs.length,
      message: `${importedFavs.length} mangás importados com sucesso do seu MyAnimeList!`
    };
  }
};
