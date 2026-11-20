import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { ZipArchive } from 'archiver';
import PDFDocument from 'pdfkit';
import zlib from 'zlib';
import { sourceRegistry } from '../sources/SourceRegistry.js';
import { HttpError } from '../errors/HttpError.js';
import { globalCache } from '../cache/CacheService.js';
import {
  findHybridSimilarMangas,
  findHybridPersonalizedRecommendations
} from '../services/aiSimilarityService.js';
import { extensionRepositoryService } from '../sources/ExtensionRepositoryService.js';
import { residentialRelayService, isSafeExternalRelayUrl } from '../services/ResidentialRelayService.js';
import { detectSiteExtension, probeAlternativeMirrors } from '../sources/SiteAutoDetector.js';

export const apiRouter = Router();

const SERVER_BOOT_TIME = new Date().toISOString();
const SERVER_BOOT_STAMP = (() => {
  const d = new Date(SERVER_BOOT_TIME);
  const p = (n: number) => String(n).padStart(2, '0');
  return `1.0.0+${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}.${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
})();

let cachedProdVersionInfo: { version: string; buildId: string; buildTime: string } | null = null;

function getActiveBuildInfo(): { version: string; buildId: string; buildTime: string } {
  if (process.env.NODE_ENV === 'production') {
    if (cachedProdVersionInfo) return cachedProdVersionInfo;
    try {
      const versionFile = path.resolve(process.cwd(), 'dist', 'version.json');
      if (fs.existsSync(versionFile)) {
        const parsed = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
        if (parsed?.version && parsed?.buildId) {
          cachedProdVersionInfo = {
            version: String(parsed.version),
            buildId: String(parsed.buildId),
            buildTime: String(parsed.buildTime || SERVER_BOOT_TIME)
          };
          return cachedProdVersionInfo;
        }
      }
    } catch {
      // ignore read errors and fallback cleanly
    }
  }

  return {
    version: process.env.MANGAREADER_APP_VERSION || '1.0.0',
    buildId: process.env.MANGAREADER_BUILD_ID || SERVER_BOOT_STAMP,
    buildTime: process.env.MANGAREADER_BUILD_TIME || SERVER_BOOT_TIME
  };
}

function sendApiError(res: Response, err: unknown) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      success: false,
      error: err.message
    });
  }
  const message = (err as Error)?.message || 'Erro inesperado do servidor.';
  return res.status(500).json({
    success: false,
    error: message
  });
}

function buildImageHeaders(targetUrl: string, explicitReferer?: string): Record<string, string> {
  const isMangaDex = targetUrl.includes('mangadex.org') || targetUrl.includes('mangadex.network');
  const headers: Record<string, string> = {
    'User-Agent': isMangaDex
      ? 'MangaReader/1.0'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  if (explicitReferer && /^https?:\/\//i.test(explicitReferer)) {
    headers['Referer'] = explicitReferer;
    return headers;
  }

  if (targetUrl.includes('comick.pictures') || targetUrl.includes('comick.io')) {
    headers['Referer'] = 'https://comick.io/';
  } else if (targetUrl.includes('weebcentral') || targetUrl.includes('planeptune.us') || targetUrl.includes('compsci88.com')) {
    headers['Referer'] = 'https://weebcentral.com/';
  } else if (targetUrl.includes('cdn.readdetectiveconan.com') || targetUrl.includes('mangapill.com')) {
    headers['Referer'] = 'https://mangapill.com/';
  } else if (targetUrl.includes('mangafire.to') || targetUrl.includes('mangafire')) {
    headers['Referer'] = 'https://mangafire.to/';
  } else if (targetUrl.includes('mangaball.net') || targetUrl.includes('mangaball')) {
    headers['Referer'] = 'https://mangaball.net/';
  } else {
    try {
      const targetHost = new URL(targetUrl).hostname;
      const matchedSource = sourceRegistry.getSources().find(s => {
        if (!s.baseUrl) return false;
        try {
          return new URL(s.baseUrl).hostname === targetHost;
        } catch {
          return false;
        }
      });
      if (matchedSource?.baseUrl) {
        headers['Referer'] = `${matchedSource.baseUrl.replace(/\/+$/, '')}/`;
      }
    } catch {
      // ignore invalid URL
    }
  }

  return headers;
}

interface CachedImagePayload {
  buffer: Buffer;
  contentType: string;
}

const IMAGE_CACHE_MAX_ENTRIES = 250;
const IMAGE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos
const IMAGE_CACHE_MAX_BYTES = 1_500_000; // ~1.5 MB por imagem (ideal para capas)
const imageBufferCache = new Map<string, { payload: CachedImagePayload; expiresAt: number }>();
const inFlightImageFetches = new Map<string, Promise<{ status: number; payload?: CachedImagePayload }>>();

// Semaphore for uploads.mangadex.org bursts (prevents 429 / connection drops on 30+ simultaneous cards)
const MAX_CONCURRENT_MANGADEX_IMAGES = 6;
let activeMangaDexImages = 0;
const mangaDexImageWaiters: Array<() => void> = [];

async function withHostConcurrencyLimit<T>(targetUrl: string, fn: () => Promise<T>): Promise<T> {
  if (!targetUrl.includes('uploads.mangadex.org')) {
    return fn();
  }
  if (activeMangaDexImages >= MAX_CONCURRENT_MANGADEX_IMAGES) {
    await new Promise<void>(resolve => mangaDexImageWaiters.push(resolve));
  }
  activeMangaDexImages++;
  try {
    return await fn();
  } finally {
    activeMangaDexImages--;
    const next = mangaDexImageWaiters.shift();
    if (next) next();
  }
}

function getCachedImage(key: string): CachedImagePayload | undefined {
  const entry = imageBufferCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    imageBufferCache.delete(key);
    return undefined;
  }
  // Refresh LRU order
  imageBufferCache.delete(key);
  imageBufferCache.set(key, entry);
  return entry.payload;
}

function setCachedImage(key: string, payload: CachedImagePayload): void {
  if (!payload.buffer || payload.buffer.byteLength === 0 || payload.buffer.byteLength > IMAGE_CACHE_MAX_BYTES) {
    return;
  }
  if (imageBufferCache.size >= IMAGE_CACHE_MAX_ENTRIES) {
    const oldestKey = imageBufferCache.keys().next().value;
    if (oldestKey) imageBufferCache.delete(oldestKey);
  }
  imageBufferCache.set(key, {
    payload,
    expiresAt: Date.now() + IMAGE_CACHE_TTL_MS
  });
}

async function fetchWithTimeoutAndRetry(
  url: string,
  headers: Record<string, string>,
  retries = 2,
  timeoutMs = 8000
): Promise<globalThis.Response | null> {
  return withHostConcurrencyLimit(url, async () => {
    let lastRes: globalThis.Response | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { headers, signal: controller.signal });
        lastRes = res;
        if (res.ok) return res;
        // Retry only on transient rate-limits or server glitches
        if (![429, 500, 502, 503, 504].includes(res.status) || attempt === retries) {
          return res;
        }
      } catch {
        if (attempt === retries) return lastRes;
      } finally {
        clearTimeout(timer);
      }
      const backoffMs = (attempt + 1) * 220 + Math.floor(Math.random() * 140);
      await new Promise(r => setTimeout(r, backoffMs));
    }
    return lastRes;
  });
}

function buildImageCandidateUrls(imageUrl: string): string[] {
  const candidates = [imageUrl];
  if (imageUrl.includes('mangadex.network')) {
    candidates.push(imageUrl.replace(/https:\/\/[^/]+\.mangadex\.network/, 'https://uploads.mangadex.org'));
  }
  if (imageUrl.includes('uploads.mangadex.org/covers/')) {
    if (/\.512\.jpg$/i.test(imageUrl)) {
      candidates.push(imageUrl.replace(/\.512\.jpg$/i, '.256.jpg'));
      candidates.push(imageUrl.replace(/\.512\.jpg$/i, ''));
    } else if (/\.256\.jpg$/i.test(imageUrl)) {
      candidates.push(imageUrl.replace(/\.256\.jpg$/i, ''));
    }
  }
  return Array.from(new Set(candidates));
}

async function fetchUpstreamImageWithFallback(
  imageUrl: string,
  explicitReferer?: string
): Promise<{ status: number; payload?: CachedImagePayload }> {
  const cacheKey = `${imageUrl}||${explicitReferer || ''}`;
  const cached = getCachedImage(cacheKey);
  if (cached) {
    return { status: 200, payload: cached };
  }

  const existingInFlight = inFlightImageFetches.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const task = (async (): Promise<{ status: number; payload?: CachedImagePayload }> => {
    const candidates = buildImageCandidateUrls(imageUrl);
    let lastStatus = 502;

    for (const candidateUrl of candidates) {
      const headers = buildImageHeaders(candidateUrl, explicitReferer);
      const response = await fetchWithTimeoutAndRetry(candidateUrl, headers, 2, 8000);

      if (response && response.ok) {
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const arrayBuf = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        if (buffer.byteLength > 0) {
          const payload: CachedImagePayload = { buffer, contentType };
          setCachedImage(cacheKey, payload);
          return { status: 200, payload };
        }
      } else if (response) {
        lastStatus = response.status;
      }
    }

    // Optional residential relay fallback for anti-hotlink/Cloudflare 403/503 protected images
    if (residentialRelayService.isRelayReady() && isSafeExternalRelayUrl(imageUrl)) {
      try {
        const headers = buildImageHeaders(imageUrl, explicitReferer);
        const relayed = await residentialRelayService.fetchThroughRelay(imageUrl, {
          headers,
          responseType: 'binary',
          timeoutMs: 9000
        });
        if (relayed.ok && relayed.bodyBase64) {
          const buffer = Buffer.from(relayed.bodyBase64, 'base64');
          const contentType = relayed.headers?.['content-type'] || 'image/jpeg';
          const payload: CachedImagePayload = { buffer, contentType };
          setCachedImage(cacheKey, payload);
          return { status: 200, payload };
        }
      } catch {
        // relay fallback failed
      }
    }

    return { status: lastStatus };
  })();

  inFlightImageFetches.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inFlightImageFetches.delete(cacheKey);
  }
}

async function fetchImageBuffer(imageUrl: string): Promise<CachedImagePayload | null> {
  let actualUrl = imageUrl;
  let explicitReferer: string | undefined;
  if (actualUrl.startsWith('/api/proxy/image?')) {
    const qs = actualUrl.substring('/api/proxy/image?'.length);
    const params = new URLSearchParams(qs);
    actualUrl = params.get('url') || actualUrl;
    explicitReferer = params.get('referer') || undefined;
  }

  const result = await fetchUpstreamImageWithFallback(actualUrl, explicitReferer);
  return result.payload || null;
}

// 0. Cache stats endpoint
apiRouter.get('/cache/stats', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: globalCache.getStats()
  });
});

// 0.1 Version endpoint (always uncached so mobile PWAs can verify latest build)
apiRouter.get('/version', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({
    success: true,
    data: getActiveBuildInfo()
  });
});

// 0.2 Healthcheck and server diagnostic endpoint (Fase 5)
apiRouter.get('/health', (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  const buildInfo = getActiveBuildInfo();
  res.json({
    status: 'healthy',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    version: buildInfo.version,
    buildId: buildInfo.buildId,
    buildTime: buildInfo.buildTime,
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024)
    },
    cache: globalCache.getStats(),
    sources: sourceRegistry.getSources().map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      isAvailable: s.isAvailable
    }))
  });
});

// 1. Sources endpoint (cached for 1 hour)
apiRouter.get('/sources', (req: Request, res: Response) => {
  try {
    const cacheKey = 'sources';
    const cached = globalCache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const sources = sourceRegistry.getSources();
    const payload = {
      success: true,
      data: sources
    };
    globalCache.set(cacheKey, payload, 3600);
    res.setHeader('X-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 1.1 Source ping endpoints (Connectivity, latency and health check for extensions)
apiRouter.get('/sources/ping/all', async (_req: Request, res: Response) => {
  try {
    const sources = sourceRegistry.getSources();
    const pingPromises = sources.map(s => sourceRegistry.pingSource(s.id));
    const results = await Promise.all(pingPromises);
    res.json({
      success: true,
      data: results
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.get('/sources/:id/ping', async (req: Request, res: Response) => {
  try {
    const sourceId = req.params.id;
    const result = await sourceRegistry.pingSource(sourceId);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

// 1.1b Single-source catalog endpoint (Popular or Latest Releases per extension)
apiRouter.get('/sources/:id/catalog', async (req: Request, res: Response) => {
  try {
    const sourceId = req.params.id;
    const mode = req.query.mode === 'latest' ? 'latest' : 'popular';
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
    const limit = Math.min(60, Math.max(1, parseInt((req.query.limit as string) || '24', 10) || 24));
    const includeAdult = req.query.includeAdult === 'true';
    const onlyAvailable = req.query.onlyAvailable !== 'false';
    const genre = req.query.genre as string | undefined;

    const cacheKey = `catalog:${sourceId}:${mode}:${page}:${limit}:${includeAdult}:${onlyAvailable}:${genre || 'all'}`;
    const cached = globalCache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const items = await sourceRegistry.getSourceCatalog(sourceId, mode, {
      page,
      limit,
      includeAdult,
      onlyAvailable,
      genre
    });

    const payload = {
      success: true,
      sourceId,
      mode,
      page,
      total: items.length,
      hasMore: items.length >= Math.min(limit, 18),
      data: items
    };
    globalCache.set(cacheKey, payload, 300);
    res.setHeader('X-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    sendApiError(res, err);
  }
});

// 1.2 Extension Repositories & Dynamic Template Extensions (Mihon-style)
apiRouter.get('/extensions/repos', (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: extensionRepositoryService.getRepos()
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.post('/extensions/repos', async (req: Request, res: Response) => {
  try {
    const url = req.body?.url as string;
    const repo = await extensionRepositoryService.addOrRefreshRepo(url);
    res.json({
      success: true,
      data: repo
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.delete('/extensions/repos', (req: Request, res: Response) => {
  try {
    const url = (req.query.url as string) || (req.body?.url as string);
    if (!url) {
      throw new HttpError(400, 'Parâmetro url do repositório é obrigatório.');
    }
    const removed = extensionRepositoryService.removeRepo(url);
    res.json({
      success: true,
      removed
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.get('/extensions/installed', (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: extensionRepositoryService.getInstalledExtensions()
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.post('/extensions/install', (req: Request, res: Response) => {
  try {
    const rawManifest = req.body?.manifest || req.body;
    const installed = extensionRepositoryService.installExtension(rawManifest);
    res.json({
      success: true,
      data: installed
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.patch('/extensions/:id/mirror', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const baseUrl = req.body?.baseUrl ?? null;
    const updated = extensionRepositoryService.updateMirror(id, baseUrl);
    res.json({
      success: true,
      data: updated
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.delete('/extensions/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const removed = extensionRepositoryService.uninstallExtension(id);
    if (!removed) {
      return res.status(404).json({
        success: false,
        error: `Extensão dinâmica '${id}' não encontrada.`
      });
    }
    res.json({
      success: true,
      id
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

// 1.2b Passo 4: Site Auto-Detection, Live Selector Test, Repo Auto-Sync, Export & Mirror Probing
apiRouter.post('/extensions/detect', async (req: Request, res: Response) => {
  try {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    const query = typeof req.body?.query === 'string' ? req.body.query : undefined;
    const template = req.body?.template;
    const selectors = req.body?.selectors;
    const result = await detectSiteExtension(rawUrl, {
      query,
      template:
        template === 'madara' || template === 'themesia' || template === 'custom_html'
          ? template
          : undefined,
      selectors: selectors && typeof selectors === 'object' ? selectors : undefined
    });
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.post('/extensions/repos/sync-all', async (_req: Request, res: Response) => {
  try {
    const summary = await extensionRepositoryService.syncAllRepos();
    res.json({
      success: true,
      data: summary
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.get('/extensions/export-repo', (_req: Request, res: Response) => {
  try {
    const exported = extensionRepositoryService.exportRepoJson();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mangareader-repo.json"');
    res.json(exported);
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.post('/extensions/:id/probe-mirrors', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const sourceInfo = sourceRegistry.getSource(id)?.getInfo();
    const baseUrl =
      (typeof req.body?.baseUrl === 'string' && req.body.baseUrl.trim()) ||
      sourceInfo?.baseUrl ||
      sourceInfo?.websiteUrl;
    if (!baseUrl) {
      throw new HttpError(404, `URL base não encontrada para a fonte '${id}'.`);
    }
    const candidates = await probeAlternativeMirrors(baseUrl);
    res.json({
      success: true,
      data: candidates
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

// 1.3 Opt-in Residential IP Bridge (Ponte Residencial)
function extractRelayToken(req: Request): string {
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  if (queryToken) return queryToken;
  const auth = req.headers.authorization;
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
}

apiRouter.get('/relay/status', (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: residentialRelayService.getStatus()
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.patch('/relay/config', (req: Request, res: Response) => {
  try {
    const status = residentialRelayService.updateConfig({
      mode: req.body?.mode,
      customProxyUrl: req.body?.customProxyUrl
    });
    res.json({
      success: true,
      data: status
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.post('/relay/token/rotate', (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: residentialRelayService.rotateToken()
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.post('/relay/disconnect', (_req: Request, res: Response) => {
  try {
    residentialRelayService.disconnectBridge();
    res.json({
      success: true,
      data: residentialRelayService.getStatus()
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.get('/relay/script', (req: Request, res: Response) => {
  try {
    let serverBaseUrl = '';
    const requestedBase = typeof req.query.baseUrl === 'string' ? req.query.baseUrl.trim() : '';
    if (requestedBase) {
      try {
        const parsed = new URL(requestedBase);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          serverBaseUrl = parsed.origin;
        }
      } catch {
        // fallback to request host
      }
    }

    if (!serverBaseUrl) {
      const forwardedProto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim();
      const proto = forwardedProto || req.protocol || 'http';
      const host = req.get('host') || 'localhost:3000';
      serverBaseUrl = `${proto}://${host}`;
    }

    const script = residentialRelayService.generateBridgeScript(serverBaseUrl);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mangareader-bridge.mjs"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(script);
  } catch (err) {
    sendApiError(res, err);
  }
});

apiRouter.get('/relay/poll', (req: Request, res: Response) => {
  const token = extractRelayToken(req);
  if (!residentialRelayService.validateToken(token)) {
    return res.status(401).json({
      success: false,
      error: 'Token da ponte residencial inválido ou expirado.'
    });
  }
  const clientLabel = typeof req.query.label === 'string' ? req.query.label : 'Ponte Residencial';
  residentialRelayService.handlePoll(clientLabel, res);
});

apiRouter.post('/relay/respond', (req: Request, res: Response) => {
  const token = extractRelayToken(req);
  if (!residentialRelayService.validateToken(token)) {
    return res.status(401).json({
      success: false,
      error: 'Token da ponte residencial inválido ou expirado.'
    });
  }
  const jobId = typeof req.body?.jobId === 'string' ? req.body.jobId : '';
  if (!jobId) {
    return res.status(400).json({
      success: false,
      error: 'Campo jobId obrigatório.'
    });
  }
  const accepted = residentialRelayService.handleRespond(req.body);
  res.json({ success: accepted });
});

apiRouter.post('/relay/test', async (req: Request, res: Response) => {
  try {
    const rawUrl = typeof req.body?.url === 'string' && req.body.url.trim()
      ? req.body.url.trim()
      : 'https://example.com';

    if (!isSafeExternalRelayUrl(rawUrl)) {
      throw new HttpError(400, 'URL de teste inválida ou bloqueada por proteção de rede.');
    }

    const startedAt = Date.now();
    const result = await residentialRelayService.fetchThroughRelay(rawUrl, { timeoutMs: 8000 });
    const latencyMs = Date.now() - startedAt;
    const bytes = result.bodyText
      ? Buffer.byteLength(result.bodyText, 'utf8')
      : result.bodyBase64
      ? Buffer.from(result.bodyBase64, 'base64').length
      : 0;

    res.json({
      success: true,
      data: {
        ok: result.ok,
        status: result.status,
        latencyMs,
        bytes
      }
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

// 2. Search endpoint (cached for 5 minutes)
apiRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    const sourceId = req.query.source as string;
    const enabledSourcesRaw = (req.query.sources as string) || (req.query.enabledSources as string);
    const enabledSources = enabledSourcesRaw ? enabledSourcesRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const genre = req.query.genre as string;
    const genresRaw = req.query.genres as string;
    const genres = genresRaw ? genresRaw.split(',').map(s => s.trim()).filter(Boolean) : (genre && genre !== 'all' ? [genre] : undefined);
    const demographic = req.query.demographic as string;
    const mangaType = (req.query.type as string) || (req.query.format as string);
    const status = req.query.status as string;
    const language = (req.query.language as string) || (req.query.lang as string);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 24;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;

    const includeAdult = req.query.includeAdult === 'true';
    const onlyAvailable = req.query.onlyAvailable !== 'false';

    const cacheKey = `search:${q}:${sourceId || 'all'}:${enabledSourcesRaw || 'all'}:${genre || 'all'}:${genresRaw || 'all'}:${demographic || 'all'}:${mangaType || 'all'}:${status || 'all'}:${language || 'all'}:${limit}:${offset || 0}:${page || 1}:${includeAdult}:${onlyAvailable}`;
    const cached = globalCache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const searchResult = await sourceRegistry.search(q, {
      sourceId,
      enabledSources,
      genre,
      genres,
      demographic,
      type: mangaType,
      status,
      language,
      limit,
      offset,
      page,
      includeAdult,
      onlyAvailable
    });

    const payload = {
      success: true,
      query: q,
      total: searchResult.total,
      sourcesQueried: searchResult.sourcesQueried,
      data: searchResult.results
    };
    globalCache.set(cacheKey, payload, 300);
    res.setHeader('X-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    sendApiError(res, err);
  }
});

// 3. Featured / Discovery endpoint (cached for 10 minutes)
apiRouter.get('/manga/featured', async (req: Request, res: Response) => {
  try {
    const enabledSourcesRaw = (req.query.sources as string) || (req.query.enabledSources as string);
    const enabledSources = enabledSourcesRaw ? enabledSourcesRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const cacheKey = `manga:featured:${enabledSourcesRaw || 'all'}`;
    const cached = globalCache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const featured = await sourceRegistry.getFeatured({ enabledSources });
    const payload = {
      success: true,
      data: featured
    };
    globalCache.set(cacheKey, payload, 600);
    res.setHeader('X-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 4. Recommendation system feed endpoint (cached for 10 minutes)
apiRouter.get('/recommendation-feed', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const cacheKey = `feed:${limit}`;
    const cached = globalCache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const feed = await sourceRegistry.getRecommendationFeed({ limit });
    const payload = {
      success: true,
      ...feed
    };
    globalCache.set(cacheKey, payload, 600);
    res.setHeader('X-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 4.1 Hybrid AI + AniList + Live Source Similarity Matcher
apiRouter.post('/similarity/match', async (req: Request, res: Response) => {
  try {
    const { targetManga, language, localCandidates, ignoredIds, ignoredTitles, focusTags, focusQuery, limit } = req.body || {};
    if (!targetManga || !targetManga.id || !targetManga.title) {
      return res.status(400).json({
        success: false,
        error: 'targetManga (com id e title) é obrigatório para cálculo de similaridade.'
      });
    }

    const result = await findHybridSimilarMangas({
      targetManga,
      language,
      localCandidates: Array.isArray(localCandidates) ? localCandidates.slice(0, 60) : [],
      ignoredIds: Array.isArray(ignoredIds) ? ignoredIds : [],
      ignoredTitles: Array.isArray(ignoredTitles) ? ignoredTitles : [],
      focusTags: Array.isArray(focusTags) ? focusTags.filter((t: unknown) => typeof t === 'string' && t.trim().length > 0).slice(0, 6) : [],
      focusQuery: typeof focusQuery === 'string' ? focusQuery.trim().slice(0, 120) : '',
      limit: typeof limit === 'number' ? limit : 18
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

// 4.2 Hybrid Personalized Recommendations ("Para Você")
apiRouter.post('/recommendations/personalized', async (req: Request, res: Response) => {
  try {
    const { favorites, ignored, language, hideLibrary, limit } = req.body || {};
    const result = await findHybridPersonalizedRecommendations({
      favorites: Array.isArray(favorites) ? favorites : [],
      ignored: Array.isArray(ignored) ? ignored : [],
      language,
      hideLibrary: hideLibrary !== false,
      limit: typeof limit === 'number' ? limit : 12
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

// 5. Manga detail by internal ID (cached for 15 minutes)
apiRouter.get('/manga/:id', async (req: Request, res: Response) => {
  try {
    const internalId = req.params.id;
    const cacheKey = `manga:${internalId}`;
    const cached = globalCache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const manga = await sourceRegistry.getMangaById(internalId);

    if (!manga) {
      return res.status(404).json({
        success: false,
        error: `Mangá com identificador '${internalId}' não foi encontrado.`
      });
    }

    const payload = {
      success: true,
      data: manga
    };
    globalCache.set(cacheKey, payload, 900);
    res.setHeader('X-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    sendApiError(res, err);
  }
});

// 6. Chapters list for a manga (cached for 10 minutes)
apiRouter.get('/manga/:id/chapters', async (req: Request, res: Response) => {
  try {
    const internalMangaId = req.params.id;
    const lang = req.query.lang as string | undefined;
    const order = (req.query.order as string) || 'asc'; // 'asc' or 'desc'
    const deduplicate = req.query.deduplicate !== 'false';
    const titleHint = typeof req.query.title === 'string' ? req.query.title.trim() : undefined;
    const altTitlesRaw = typeof req.query.altTitles === 'string' ? req.query.altTitles : '';
    const altTitlesHint = altTitlesRaw
      ? altTitlesRaw.split('||').map(s => s.trim()).filter(Boolean).slice(0, 6)
      : undefined;
    const forceFederate = req.query.forceFederate === 'true';

    const cacheKey = `chapters:${internalMangaId}:${lang || 'all'}:${order}:${deduplicate}:${forceFederate ? 'fed' : 'std'}`;
    const cached = globalCache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    let chapters = await sourceRegistry.getChapters(internalMangaId, lang, {
      deduplicate,
      titleHint,
      altTitlesHint,
      forceFederate
    });

    // Sort chapters
    chapters.sort((a, b) => {
      const numA = parseFloat(a.chapterNumber);
      const numB = parseFloat(b.chapterNumber);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return order === 'desc' ? numB - numA : numA - numB;
      }
      return order === 'desc'
        ? b.chapterNumber.localeCompare(a.chapterNumber, undefined, { numeric: true })
        : a.chapterNumber.localeCompare(b.chapterNumber, undefined, { numeric: true });
    });

    const payload = {
      success: true,
      mangaId: internalMangaId,
      total: chapters.length,
      data: chapters
    };
    globalCache.set(cacheKey, payload, 600);
    res.setHeader('X-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    sendApiError(res, err);
  }
});

// 7. Chapter info and pages endpoint (cached for 30 minutes)
apiRouter.get(/^\/chapters\/(.+)\/pages$/, async (req: Request, res: Response) => {
  try {
    const internalChapterId = req.params[0] || (req.params as any).id;
    const cacheKey = `pages:${internalChapterId}`;
    const cached = globalCache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const pages = await sourceRegistry.getChapterPages(internalChapterId);

    const payload = {
      success: true,
      chapterId: internalChapterId,
      total: pages.length,
      data: pages
    };
    if (pages.length > 0) {
      globalCache.set(cacheKey, payload, 1800);
    }
    res.setHeader('X-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    sendApiError(res, err);
  }
});

// 7.1 Chapter Download endpoint (.cbz / .zip)
apiRouter.get(/^\/chapters\/(.+)\/download$/, async (req: Request, res: Response) => {
  try {
    const internalChapterId = req.params[0] || (req.params as any).id;
    const reqFormat = (req.query.format as string)?.toLowerCase();
    const format = reqFormat === 'pdf' ? 'pdf' : reqFormat === 'zip' ? 'zip' : 'cbz';
    const pages = await sourceRegistry.getChapterPages(internalChapterId);

    if (!pages || pages.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nenhuma página encontrada para download neste capítulo.'
      });
    }

    // Try to get clean manga title and chapter number
    const parsed = sourceRegistry.parseInternalChapterId(internalChapterId);
    let chapterNum = '1';
    let mangaTitle = parsed.externalMangaId;

    try {
      const manga = await sourceRegistry.getMangaById(`mr_${parsed.sourceId}_${parsed.externalMangaId}`);
      if (manga?.title) {
        mangaTitle = manga.title;
      }
      const chapters = await sourceRegistry.getChapters(`mr_${parsed.sourceId}_${parsed.externalMangaId}`);
      const ch = chapters.find(c => c.id === internalChapterId || c.variants?.some(v => v.id === internalChapterId));
      if (ch) {
        chapterNum = ch.chapterNumber;
      }
    } catch {
      // Fallback to parsed tokens
    }

    const safeTitle = mangaTitle.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 40);
    const filename = `${safeTitle}_cap_${chapterNum}.${format}`;

    // PDF Generation Flow
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache');

      const doc = new PDFDocument({ autoFirstPage: false });
      doc.pipe(res);

      const chunkSize = 4;
      for (let i = 0; i < pages.length; i += chunkSize) {
        const chunk = pages.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map(async (page) => {
            const res = await fetchImageBuffer(page.imageUrl);
            return { pageNumber: page.pageNumber, data: res };
          })
        );

        for (const item of results) {
          if (item.data?.buffer) {
            try {
              let imgBuffer = item.data.buffer;
              if (item.data.contentType.includes('webp')) {
                const { default: sharp } = await import('sharp');
                imgBuffer = await sharp(item.data.buffer).jpeg({ quality: 90 }).toBuffer();
              }
              const img = (doc as any).openImage(imgBuffer);
              doc.addPage({ size: [img.width, img.height], margin: 0 });
              doc.image(img, 0, 0, { width: img.width, height: img.height });
            } catch (pdfErr) {
              console.warn(`PDF error embedding page ${item.pageNumber}:`, pdfErr);
            }
          }
        }
      }

      doc.end();
      return;
    }

    // CBZ / ZIP Archive Flow
    const contentType = format === 'cbz' ? 'application/vnd.comicbook+zip' : 'application/zip';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.pipe(res);

    // ComicInfo.xml metadata for Comic Readers (Mihon, Tachiyomi, Calibre, CDisplayEx)
    const comicInfoXml = `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Series>${mangaTitle}</Series>
  <Number>${chapterNum}</Number>
  <PageCount>${pages.length}</PageCount>
</ComicInfo>`;
    archive.append(comicInfoXml, { name: 'ComicInfo.xml' });

    // Download pages in parallel batches of 4
    const chunkSize = 4;
    for (let i = 0; i < pages.length; i += chunkSize) {
      const chunk = pages.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map(async (page) => {
          const res = await fetchImageBuffer(page.imageUrl);
          return { pageNumber: page.pageNumber, data: res };
        })
      );

      for (const item of results) {
        if (item.data) {
          const ext = item.data.contentType.includes('png')
            ? 'png'
            : item.data.contentType.includes('webp')
            ? 'webp'
            : 'jpg';
          const padNum = String(item.pageNumber).padStart(3, '0');
          archive.append(item.data.buffer, { name: `${padNum}.${ext}` });
        }
      }
    }

    await archive.finalize();
  } catch (err) {
    if (!res.headersSent) {
      sendApiError(res, err);
    }
  }
});

// 8. Image proxy to prevent CORS, expired nodes, or hotlinking issues on remote hosts
apiRouter.get('/proxy/image', async (req: Request, res: Response) => {
  try {
    const imageUrl = req.query.url as string;
    const explicitReferer = req.query.referer as string | undefined;
    if (!imageUrl) {
      return res.status(400).send('Missing url parameter');
    }

    const result = await fetchUpstreamImageWithFallback(imageUrl, explicitReferer);
    if (!result.payload) {
      return res.status(result.status || 502).send('Failed to fetch upstream image');
    }

    res.setHeader('Content-Type', result.payload.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(result.payload.buffer);
  } catch {
    res.status(500).send('Proxy error');
  }
});

// 8b. Descompressor de backup GZIP / .tachibk
apiRouter.post('/backup/decompress', (req: Request, res: Response) => {
  const chunks: Buffer[] = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    try {
      const buffer = Buffer.concat(chunks);
      if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
        const decompressed = zlib.gunzipSync(buffer);
        res.setHeader('Content-Type', 'application/octet-stream');
        return res.send(decompressed);
      }
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.send(buffer);
    } catch (e: any) {
      return res.status(400).json({ success: false, error: 'Falha ao descomprimir arquivo GZIP: ' + e.message });
    }
  });
});

// 8c. Cross-source altTitles resolver for library duplicate detection & "Ocultar Salvos"
async function fetchAnilistSynonymsForTitle(rawTitle: string): Promise<string[]> {
  const cleanTitle = (rawTitle || '').replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim();
  if (cleanTitle.length < 3) return [];
  const normQuery = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cacheKey = `anilist-syn:${normQuery}`;
  const cached = globalCache.get<string[]>(cacheKey);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2800);
    const gql = `query ($search: String) { Media(search: $search, type: MANGA) { title { romaji english } synonyms } }`;
    const resp = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: gql, variables: { search: cleanTitle } })
    }).finally(() => clearTimeout(timer));
    if (!resp.ok) return [];
    const json: any = await resp.json().catch(() => null);
    const media = json?.data?.Media;
    if (!media) return [];

    const candidates = [
      media.title?.english,
      media.title?.romaji,
      ...(Array.isArray(media.synonyms) ? media.synonyms : [])
    ]
      .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length >= 3)
      .map(s => s.trim());

    // Guard: ensure AniList actually matched the requested work before returning its synonyms
    const normCandidates = candidates.map(c => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const isVerifiedMatch = normCandidates.some(
      nc => nc === normQuery || (normQuery.length >= 8 && nc.includes(normQuery)) || (nc.length >= 8 && normQuery.includes(nc))
    );
    const result = isVerifiedMatch
      ? Array.from(new Set(candidates)).filter(c => c.toLowerCase() !== rawTitle.toLowerCase()).slice(0, 12)
      : [];
    globalCache.set(cacheKey, result, 86400);
    return result;
  } catch {
    return [];
  }
}

apiRouter.post('/library/resolve-titles', async (req: Request, res: Response) => {
  try {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const items = rawItems
      .filter((it: any) => it && typeof it.mangaId === 'string' && it.mangaId.trim())
      .slice(0, 30) as Array<{ mangaId: string; title?: string }>;

    const resolved: Record<string, { altTitles: string[]; authors?: string[] }> = {};
    const queue = [...items];
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const cacheKey = `title-resolve:${item.mangaId}`;
        const cached = globalCache.get<{ altTitles: string[]; authors?: string[] }>(cacheKey);
        if (cached) {
          resolved[item.mangaId] = cached;
          continue;
        }

        let altTitles: string[] = [];
        let authors: string[] | undefined;

        try {
          const details = await Promise.race([
            sourceRegistry.getMangaById(item.mangaId),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 3500))
          ]);
          if (details) {
            altTitles = Array.isArray(details.altTitles) ? details.altTitles : [];
            if (Array.isArray(details.authors) && !details.authors.includes('Autor Desconhecido')) {
              authors = details.authors;
            }
          }
        } catch {
          // fallback to AniList title synonyms below
        }

        const normalizedItemTitle = (item.title || '').trim().toLowerCase();
        const latinAltCount = altTitles.filter(
          t => /[a-zA-Z]{3,}/.test(t) && t.trim().toLowerCase() !== normalizedItemTitle
        ).length;
        if (item.title && latinAltCount < 2) {
          const anilistSyns = await fetchAnilistSynonymsForTitle(item.title);
          if (anilistSyns.length > 0) {
            altTitles = Array.from(new Set([...altTitles, ...anilistSyns])).slice(0, 14);
          }
        }

        const entry = { altTitles, authors };
        globalCache.set(cacheKey, entry, altTitles.length > 0 ? 86400 : 1800);
        resolved[item.mangaId] = entry;
      }
    });

    await Promise.all(workers);

    res.json({
      success: true,
      data: resolved
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

// 9. Catch-all for undefined API routes (always returns JSON 404, never falls through to HTML)
apiRouter.all('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Endpoint de API não encontrado: ${req.method} ${req.originalUrl}`
  });
});
