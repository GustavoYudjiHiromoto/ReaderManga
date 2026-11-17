import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Response } from 'express';
import { RelayMode, RelayStatus } from '../../src/types/manga.js';
import { HttpError } from '../errors/HttpError.js';

interface PersistedRelayState {
  mode: RelayMode;
  token: string;
  customProxyUrl?: string;
  updatedAt: number;
}

export interface RelayFetchResult {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  bodyText?: string;
  bodyBase64?: string;
}

export interface RelayJobPayload {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  responseType: 'text' | 'binary';
}

interface PendingJob extends RelayJobPayload {
  resolve: (result: RelayFetchResult) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  createdAt: number;
}

interface PollWaiter {
  res: Response;
  timer: NodeJS.Timeout;
  clientLabel: string;
}

const BRIDGE_PRESENCE_TTL_MS = 45_000;
const LONG_POLL_TIMEOUT_MS = 20_000;
const DEFAULT_RELAY_TIMEOUT_MS = 12_000;
const MAX_RELAY_BODY_BYTES = 15 * 1024 * 1024;

export function isSafeExternalRelayUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL((rawUrl || '').trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return false;

    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.')
    ) {
      return false;
    }

    const rfc1918Match = host.match(/^172\.(\d+)\./);
    if (rfc1918Match) {
      const second = parseInt(rfc1918Match[1], 10);
      if (second >= 16 && second <= 31) return false;
    }

    return true;
  } catch {
    return false;
  }
}

export class ResidentialRelayService {
  private readonly storePath: string;
  private state: PersistedRelayState;
  private connectedSince: number | undefined;
  private lastSeenAt: number | undefined;
  private clientLabel: string | undefined;

  private stats: RelayStatus['stats'] = {
    requestsServed: 0,
    requestsSucceeded: 0,
    requestsFailed: 0
  };

  private pendingJobs: PendingJob[] = [];
  private inFlightJobs = new Map<string, PendingJob>();
  private pollWaiters: PollWaiter[] = [];

  constructor(customStorePath?: string) {
    this.storePath =
      customStorePath || path.resolve(process.cwd(), 'server', 'data', 'relay.json');
    this.state = {
      mode: 'fallback',
      token: this.generateToken(),
      updatedAt: Date.now()
    };
    this.loadFromDisk();
  }

  private generateToken(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const validMode: RelayMode =
            parsed.mode === 'off' || parsed.mode === 'always' || parsed.mode === 'fallback'
              ? parsed.mode
              : 'fallback';
          const token =
            typeof parsed.token === 'string' && parsed.token.trim().length >= 16
              ? parsed.token.trim()
              : this.generateToken();
          this.state = {
            mode: validMode,
            token,
            customProxyUrl:
              typeof parsed.customProxyUrl === 'string' && parsed.customProxyUrl.trim()
                ? parsed.customProxyUrl.trim()
                : undefined,
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now()
          };
          return;
        }
      }
      this.saveToDisk();
    } catch (err) {
      console.warn('[ResidentialRelayService] Failed to read relay config:', err);
    }
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (err) {
      console.warn('[ResidentialRelayService] Failed to save relay config:', err);
    }
  }

  public validateToken(candidate: string | undefined): boolean {
    if (!candidate || typeof candidate !== 'string') return false;
    const expected = Buffer.from(this.state.token, 'utf8');
    const provided = Buffer.from(candidate.trim(), 'utf8');
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(expected, provided);
  }

  public isBridgeOnline(): boolean {
    return Boolean(this.lastSeenAt && Date.now() - this.lastSeenAt < BRIDGE_PRESENCE_TTL_MS);
  }

  public isRelayReady(): boolean {
    if (this.state.mode === 'off') return false;
    return this.isBridgeOnline() || Boolean(this.state.customProxyUrl || process.env.FLARESOLVERR_URL);
  }

  public getMode(): RelayMode {
    return this.state.mode;
  }

  public getStatus(): RelayStatus {
    const online = this.isBridgeOnline();
    return {
      mode: this.state.mode,
      bridgeOnline: online,
      customProxyConfigured: Boolean(this.state.customProxyUrl || process.env.FLARESOLVERR_URL),
      customProxyUrl: this.state.customProxyUrl,
      clientLabel: online ? this.clientLabel : undefined,
      connectedSince: online ? this.connectedSince : undefined,
      lastSeenAt: this.lastSeenAt,
      token: this.state.token,
      stats: { ...this.stats }
    };
  }

  public updateConfig(patch: { mode?: RelayMode; customProxyUrl?: string | null }): RelayStatus {
    if (patch.mode !== undefined) {
      if (patch.mode !== 'off' && patch.mode !== 'fallback' && patch.mode !== 'always') {
        throw new HttpError(400, "Modo de ponte inválido. Use 'off', 'fallback' ou 'always'.");
      }
      this.state.mode = patch.mode;
    }

    if (patch.customProxyUrl !== undefined) {
      if (patch.customProxyUrl === null || patch.customProxyUrl.trim() === '') {
        this.state.customProxyUrl = undefined;
      } else {
        const trimmed = patch.customProxyUrl.trim().replace(/\/+$/, '');
        let parsed: URL;
        try {
          parsed = new URL(trimmed);
        } catch {
          throw new HttpError(400, 'URL da ponte externa inválida. Informe http:// ou https://');
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new HttpError(400, 'A URL da ponte externa deve usar http:// ou https://.');
        }
        this.state.customProxyUrl = trimmed;
      }
    }

    this.state.updatedAt = Date.now();
    this.saveToDisk();
    return this.getStatus();
  }

  public rotateToken(): RelayStatus {
    this.state.token = this.generateToken();
    this.state.updatedAt = Date.now();
    this.saveToDisk();
    this.disconnectBridge();
    return this.getStatus();
  }

  public disconnectBridge(): void {
    this.lastSeenAt = undefined;
    this.connectedSince = undefined;
    this.clientLabel = undefined;

    for (const waiter of this.pollWaiters.splice(0)) {
      clearTimeout(waiter.timer);
      if (!waiter.res.headersSent) {
        waiter.res.json({ success: true, job: null, disconnected: true });
      }
    }

    for (const job of this.pendingJobs.splice(0)) {
      clearTimeout(job.timer);
      job.reject(new Error('Ponte residencial desconectada.'));
    }

    for (const [id, job] of this.inFlightJobs.entries()) {
      clearTimeout(job.timer);
      job.reject(new Error('Ponte residencial desconectada.'));
      this.inFlightJobs.delete(id);
    }
  }

  public handlePoll(clientLabel: string, res: Response): void {
    const now = Date.now();
    if (!this.isBridgeOnline()) {
      this.connectedSince = now;
    }
    this.lastSeenAt = now;
    this.clientLabel = (clientLabel || 'Ponte Residencial').slice(0, 64);

    // Dispatch immediately if a job is waiting in the queue
    const nextJob = this.pendingJobs.shift();
    if (nextJob) {
      this.inFlightJobs.set(nextJob.id, nextJob);
      res.json({
        success: true,
        job: {
          id: nextJob.id,
          url: nextJob.url,
          method: nextJob.method,
          headers: nextJob.headers,
          body: nextJob.body,
          responseType: nextJob.responseType
        }
      });
      return;
    }

    const timer = setTimeout(() => {
      const idx = this.pollWaiters.findIndex(w => w.res === res);
      if (idx >= 0) this.pollWaiters.splice(idx, 1);
      if (!res.headersSent) {
        res.json({ success: true, job: null });
      }
    }, LONG_POLL_TIMEOUT_MS);

    const waiter: PollWaiter = { res, timer, clientLabel: this.clientLabel };
    this.pollWaiters.push(waiter);

    res.on('close', () => {
      clearTimeout(timer);
      const idx = this.pollWaiters.indexOf(waiter);
      if (idx >= 0) this.pollWaiters.splice(idx, 1);
    });
  }

  public handleRespond(payload: {
    jobId: string;
    ok?: boolean;
    status?: number;
    headers?: Record<string, string>;
    bodyText?: string;
    bodyBase64?: string;
    error?: string;
  }): boolean {
    this.lastSeenAt = Date.now();
    const job = this.inFlightJobs.get(payload.jobId);
    if (!job) return false;

    this.inFlightJobs.delete(payload.jobId);
    clearTimeout(job.timer);

    if (payload.error && !payload.status) {
      this.stats.requestsFailed++;
      job.reject(new HttpError(502, `Ponte residencial falhou: ${payload.error}`));
      return true;
    }

    const sizeCheck = (payload.bodyText?.length || 0) + (payload.bodyBase64?.length || 0);
    if (sizeCheck > MAX_RELAY_BODY_BYTES * 1.4) {
      this.stats.requestsFailed++;
      job.reject(new HttpError(502, 'Resposta da ponte residencial excedeu o limite permitido.'));
      return true;
    }

    this.stats.requestsSucceeded++;
    job.resolve({
      ok: payload.ok !== false && (payload.status || 200) < 400,
      status: payload.status || 200,
      headers: payload.headers || {},
      bodyText: payload.bodyText,
      bodyBase64: payload.bodyBase64
    });
    return true;
  }

  public async fetchThroughRelay(
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      responseType?: 'text' | 'binary';
      timeoutMs?: number;
    }
  ): Promise<RelayFetchResult> {
    if (this.state.mode === 'off') {
      throw new HttpError(503, 'Ponte residencial desativada.');
    }

    if (!isSafeExternalRelayUrl(url)) {
      throw new HttpError(400, 'URL bloqueada pela proteção de rede da ponte residencial.');
    }

    const timeoutMs = options?.timeoutMs || DEFAULT_RELAY_TIMEOUT_MS;
    const method = (options?.method || 'GET').toUpperCase();
    const responseType = options?.responseType || 'text';
    const headers = options?.headers || {};

    try {
      const u = new URL(url);
      this.stats.lastBlockedDomain = u.hostname;
    } catch {
      // ignore
    }
    this.stats.lastRoutedAt = Date.now();
    this.stats.requestsServed++;

    // 1. Prefer live connected residential bridge client
    if (this.isBridgeOnline()) {
      return await new Promise<RelayFetchResult>((resolve, reject) => {
        const id = `job_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
        const timer = setTimeout(() => {
          const pIdx = this.pendingJobs.findIndex(j => j.id === id);
          if (pIdx >= 0) this.pendingJobs.splice(pIdx, 1);
          this.inFlightJobs.delete(id);
          this.stats.requestsFailed++;
          reject(new HttpError(504, 'Tempo limite excedido aguardando resposta da ponte residencial.'));
        }, timeoutMs);

        const job: PendingJob = {
          id,
          url,
          method,
          headers,
          body: options?.body,
          responseType,
          resolve,
          reject,
          timer,
          createdAt: Date.now()
        };

        const waiter = this.pollWaiters.shift();
        if (waiter) {
          clearTimeout(waiter.timer);
          this.inFlightJobs.set(id, job);
          if (!waiter.res.headersSent) {
            waiter.res.json({
              success: true,
              job: {
                id: job.id,
                url: job.url,
                method: job.method,
                headers: job.headers,
                body: job.body,
                responseType: job.responseType
              }
            });
            return;
          }
          this.inFlightJobs.delete(id);
        }

        this.pendingJobs.push(job);
      });
    }

    // 2. Fallback to configured FlareSolverr / external residential relay URL if set
    const externalUrl = this.state.customProxyUrl || process.env.FLARESOLVERR_URL;
    if (externalUrl) {
      try {
        const res = await fetch(`${externalUrl}/v1`, {
          method: 'POST',
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cmd: method === 'POST' ? 'request.post' : 'request.get',
            url,
            postData: options?.body,
            maxTimeout: timeoutMs
          })
        });
        if (!res.ok) {
          this.stats.requestsFailed++;
          throw new HttpError(502, `Ponte externa respondeu HTTP ${res.status}`);
        }
        const json: any = await res.json();
        const solution = json?.solution;
        if (solution && typeof solution.response === 'string') {
          this.stats.requestsSucceeded++;
          return {
            ok: (solution.status || 200) < 400,
            status: solution.status || 200,
            headers: {},
            bodyText: solution.response
          };
        }
        this.stats.requestsFailed++;
        throw new HttpError(502, 'Resposta inválida da ponte externa.');
      } catch (err) {
        this.stats.requestsFailed++;
        if (err instanceof HttpError) throw err;
        throw new HttpError(502, `Erro na ponte externa: ${(err as Error).message}`);
      }
    }

    this.stats.requestsFailed++;
    throw new HttpError(503, 'Nenhuma ponte residencial conectada no momento.');
  }

  /**
   * Generates a standalone Node 18+ script (zero dependencies) that runs on the user's
   * PC, Mac, Linux, or Android Termux to route blocked requests via their residential IP.
   */
  public generateBridgeScript(serverBaseUrl: string): string {
    const cleanBase = (serverBaseUrl || 'http://localhost:3000').replace(/\/+$/, '');
    return `#!/usr/bin/env node
// MangaReader - Ponte Residencial Opcional (Zero Dependências - Node 18+)
// Execute com: node mangareader-bridge.mjs

const SERVER_URL = ${JSON.stringify(cleanBase)};
const RELAY_TOKEN = ${JSON.stringify(this.state.token)};
const CLIENT_LABEL = (process.env.HOSTNAME || 'PC/Dispositivo Local').slice(0, 48);

let running = true;
process.on('SIGINT', () => {
  running = false;
  console.log('\\n[MangaReader Bridge] Encerrando ponte residencial...');
  process.exit(0);
});

async function runJob(job) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 11000);
    const resp = await fetch(job.url, {
      method: job.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        ...(job.headers || {})
      },
      body: job.method === 'POST' && job.body ? job.body : undefined,
      signal: controller.signal
    }).finally(() => clearTimeout(timer));

    const contentType = resp.headers.get('content-type') || '';
    const outHeaders = { 'content-type': contentType };

    if (job.responseType === 'binary') {
      const buf = Buffer.from(await resp.arrayBuffer());
      return {
        jobId: job.id,
        ok: resp.ok,
        status: resp.status,
        headers: outHeaders,
        bodyBase64: buf.toString('base64')
      };
    }

    const text = await resp.text();
    return {
      jobId: job.id,
      ok: resp.ok,
      status: resp.status,
      headers: outHeaders,
      bodyText: text
    };
  } catch (err) {
    return {
      jobId: job.id,
      ok: false,
      error: err?.message || 'Erro de rede residencial'
    };
  }
}

async function loop() {
  console.log('[MangaReader Bridge] Conectando em ' + SERVER_URL + ' (' + CLIENT_LABEL + ')...');
  let announced = false;
  while (running) {
    try {
      const pollUrl = SERVER_URL + '/api/relay/poll?token=' + encodeURIComponent(RELAY_TOKEN) + '&label=' + encodeURIComponent(CLIENT_LABEL);
      const res = await fetch(pollUrl, { headers: { Accept: 'application/json' } });
      if (res.status === 401 || res.status === 403) {
        console.error('[MangaReader Bridge] Token inválido ou rotacionado. Baixe o script atualizado na aba Extensões.');
        await new Promise(r => setTimeout(r, 8000));
        continue;
      }
      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }
      if (!announced) {
        announced = true;
        console.log('[MangaReader Bridge] Online! Seu IP residencial está pronto para desbloquear fontes.');
      }
      const data = await res.json();
      if (data && data.job) {
        console.log('[Bridge] Atendendo: ' + data.job.url);
        const result = await runJob(data.job);
        await fetch(SERVER_URL + '/api/relay/respond?token=' + encodeURIComponent(RELAY_TOKEN), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result)
        });
      }
    } catch (err) {
      announced = false;
      console.warn('[MangaReader Bridge] Reconectando em 3s (' + (err?.message || 'erro') + ')...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

loop();
`;
  }
}

export const residentialRelayService = new ResidentialRelayService();
