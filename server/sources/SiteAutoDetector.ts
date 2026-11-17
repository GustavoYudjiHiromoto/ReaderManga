import * as cheerio from 'cheerio';
import {
  CustomHtmlSelectors,
  MirrorProbeCandidate,
  SiteDetectionResult
} from '../../src/types/manga.js';
import { HttpError } from '../errors/HttpError.js';
import {
  isSafeExternalRelayUrl,
  residentialRelayService
} from '../services/ResidentialRelayService.js';
import { DynamicTemplateProvider, normalizeBaseUrl } from './DynamicTemplateProvider.js';

const DEFAULT_PROBE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
};

export interface HtmlTemplateAnalysis {
  suggestedName: string;
  lang: string;
  template: 'madara' | 'themesia' | 'custom_html';
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
  cloudflareBlocked: boolean;
  selectors?: CustomHtmlSelectors;
}

function isCloudflareChallenge(status: number, body: string): boolean {
  const lower = (body || '').toLowerCase();
  if (
    lower.includes('just a moment...') ||
    lower.includes('cf-browser-verification') ||
    lower.includes('challenge-platform') ||
    lower.includes('attention required! | cloudflare')
  ) {
    return true;
  }
  return status === 403 && lower.includes('cloudflare');
}

function deriveHostTitle(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.replace(/^www\./i, '');
    const stem = host.split('.')[0] || host;
    return stem
      .split(/[-_]+/)
      .filter(Boolean)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  } catch {
    return 'Nova Scan';
  }
}

export function analyzeSiteHtml(html: string, baseUrl: string): HtmlTemplateAnalysis {
  const raw = html || '';
  const lower = raw.toLowerCase();

  if (isCloudflareChallenge(200, raw)) {
    return {
      suggestedName: deriveHostTitle(baseUrl),
      lang: 'pt-br',
      template: 'madara',
      confidence: 'low',
      signals: ['Desafio Cloudflare detectado no HTML'],
      cloudflareBlocked: true
    };
  }

  const $ = cheerio.load(raw);
  const rawTitle = ($('meta[property="og:site_name"]').attr('content') || $('title').first().text() || '')
    .split(/[|\-–—]/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  const suggestedName = rawTitle && rawTitle.length >= 2 && rawTitle.length <= 48
    ? rawTitle
    : deriveHostTitle(baseUrl);

  const htmlLang = ($('html').attr('lang') || '').toLowerCase();
  let lang = 'pt-br';
  if (htmlLang.startsWith('pt')) lang = 'pt-br';
  else if (htmlLang.startsWith('es')) lang = 'es';
  else if (htmlLang.startsWith('ja')) lang = 'ja';
  else if (htmlLang.startsWith('en')) lang = 'en';
  else if (lower.includes('capítulo') || lower.includes('ler mangá') || lower.includes('mangás')) {
    lang = 'pt-br';
  } else if (lower.includes('chapter') || lower.includes('read manga')) {
    lang = 'en';
  }

  const madaraSignals: string[] = [];
  if (lower.includes('themes/madara') || lower.includes('madara_load_more') || lower.includes('wp-manga')) {
    madaraSignals.push('Assinatura WP-Madara');
  }
  if ($('.c-tabs-item__content, .page-item-detail, .manga_updates').length > 0) {
    madaraSignals.push('Containers de catálogo Madara (.page-item-detail / .c-tabs-item__content)');
  }
  if ($('input[name="post_type"][value="wp-manga"]').length > 0 || lower.includes('post_type=wp-manga')) {
    madaraSignals.push('Endpoint de busca wp-manga');
  }

  const themesiaSignals: string[] = [];
  if (lower.includes('ts_reader.run') || lower.includes('themesia') || lower.includes('mangareader-child')) {
    themesiaSignals.push('Assinatura MangaThemesia (ts_reader)');
  }
  if ($('.listupd .bsx, .bs .bsx, #chapterlist .eph-num').length > 0) {
    themesiaSignals.push('Cards Themesia (.listupd .bsx)');
  }

  if (themesiaSignals.length >= madaraSignals.length && themesiaSignals.length > 0) {
    return {
      suggestedName,
      lang,
      template: 'themesia',
      confidence: themesiaSignals.length >= 2 ? 'high' : 'medium',
      signals: themesiaSignals,
      cloudflareBlocked: false
    };
  }

  if (madaraSignals.length > 0) {
    return {
      suggestedName,
      lang,
      template: 'madara',
      confidence: madaraSignals.length >= 2 ? 'high' : 'medium',
      signals: madaraSignals,
      cloudflareBlocked: false
    };
  }

  // Fallback heuristics for custom HTML themes
  const candidateSearchItems = [
    '.manga-card',
    '.manga-item',
    '.series-card',
    '.list-item',
    'article.post',
    '.grid a[href*="/manga/"]'
  ];
  const matchedSearchSel = candidateSearchItems.find(sel => $(sel).length > 0) || '.manga-card';

  const candidateChapterItems = [
    '.chapter-list a',
    '.chapters-list a',
    'ul.chapters a',
    '.chapter-item a',
    'a[href*="chapter"], a[href*="capitulo"]'
  ];
  const matchedChapterSel = candidateChapterItems.find(sel => $(sel).length > 0) || '.chapter-item a';

  const customSignals: string[] = [];
  if ($(matchedSearchSel).length > 0) {
    customSignals.push(`Cards encontrados (${matchedSearchSel})`);
  } else {
    customSignals.push('Nenhuma assinatura Madara/Themesia direta; usando heurística Custom HTML');
  }

  return {
    suggestedName,
    lang,
    template: 'custom_html',
    confidence: $(matchedSearchSel).length > 0 ? 'medium' : 'low',
    signals: customSignals,
    cloudflareBlocked: false,
    selectors: {
      searchPath: '/?s={query}',
      searchItem: matchedSearchSel,
      title: 'h3, h4, .title, a',
      link: 'a',
      cover: 'img',
      chapterItem: matchedChapterSel,
      pageImg: '.reader-pages img, .reading-content img, #readerarea img, img'
    }
  };
}

async function fetchUrlWithOptionalRelay(url: string, referer: string): Promise<{
  ok: boolean;
  status: number;
  html: string;
}> {
  if (!isSafeExternalRelayUrl(url)) {
    throw new HttpError(400, 'URL bloqueada pela política de segurança de rede.');
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      headers: {
        ...DEFAULT_PROBE_HEADERS,
        Referer: referer
      }
    });
    const html = await res.text().catch(() => '');

    if ((res.ok && !isCloudflareChallenge(res.status, html)) || !residentialRelayService.isRelayReady()) {
      return { ok: res.ok, status: res.status, html };
    }
  } catch (err) {
    if (!residentialRelayService.isRelayReady()) {
      throw new HttpError(502, `Falha ao acessar ${url}: ${(err as Error).message}`);
    }
  }

  // Fallback via Residential IP Bridge if online
  const relayed = await residentialRelayService.fetchThroughRelay(url, {
    headers: {
      ...DEFAULT_PROBE_HEADERS,
      Referer: referer
    },
    responseType: 'text',
    timeoutMs: 11000
  });
  return {
    ok: relayed.ok,
    status: relayed.status,
    html: relayed.bodyText || ''
  };
}

export async function detectSiteExtension(
  rawUrl: string,
  options?: {
    query?: string;
    template?: 'madara' | 'themesia' | 'custom_html';
    selectors?: CustomHtmlSelectors;
  }
): Promise<SiteDetectionResult> {
  const baseUrl = normalizeBaseUrl(rawUrl);
  if (!baseUrl) {
    throw new HttpError(400, 'Informe uma URL válida com http:// ou https://');
  }
  if (!isSafeExternalRelayUrl(baseUrl)) {
    throw new HttpError(400, 'URL inválida ou endereço de rede privada bloqueado.');
  }

  let homepage = { ok: false, status: 0, html: '' };
  try {
    homepage = await fetchUrlWithOptionalRelay(`${baseUrl}/`, `${baseUrl}/`);
  } catch (err) {
    return {
      detected: false,
      suggestedName: deriveHostTitle(baseUrl),
      baseUrl,
      lang: 'pt-br',
      template: options?.template || 'madara',
      confidence: 'low',
      signals: ['Site inacessível diretamente pelo servidor'],
      cloudflareBlocked: false,
      probeSearchCount: 0,
      probeSampleTitles: [],
      error: (err as Error).message
    };
  }

  const analysis = analyzeSiteHtml(homepage.html, baseUrl);
  const effectiveTemplate = options?.template || analysis.template;
  const effectiveSelectors = options?.selectors || analysis.selectors;

  if (analysis.cloudflareBlocked || (homepage.status === 403 && !homepage.ok)) {
    return {
      detected: false,
      suggestedName: analysis.suggestedName,
      baseUrl,
      lang: analysis.lang,
      template: effectiveTemplate,
      confidence: 'low',
      signals: [...analysis.signals, `HTTP ${homepage.status || 403}`],
      cloudflareBlocked: true,
      probeSearchCount: 0,
      probeSampleTitles: [],
      selectors: effectiveSelectors,
      error: 'Site protegido por Cloudflare no IP do servidor. Ative a Ponte Residencial opcional ou escolha outro espelho.'
    };
  }

  const probeQuery = (options?.query || 'one').trim() || 'one';
  const tempProvider = new DynamicTemplateProvider({
    id: 'probe-preview',
    name: analysis.suggestedName,
    baseUrl,
    template: effectiveTemplate,
    lang: analysis.lang,
    version: '1.0.0',
    selectors: effectiveTemplate === 'custom_html' ? effectiveSelectors : undefined
  });

  let probeSearchCount = 0;
  let probeSampleTitles: string[] = [];
  let probeChapterCount: number | undefined;
  let probeError: string | undefined;

  try {
    const searchRes = await Promise.race([
      tempProvider.search(probeQuery, { limit: 6 }),
      new Promise<{ mangaList: []; total: 0; hasMore: false }>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout na busca de teste')), 8000)
      )
    ]);
    probeSearchCount = searchRes.mangaList.length;
    probeSampleTitles = searchRes.mangaList.slice(0, 4).map(m => m.title);

    if (searchRes.mangaList.length > 0) {
      const firstExtId = searchRes.mangaList[0].sources[0]?.externalId;
      if (firstExtId) {
        const chs = await Promise.race([
          tempProvider.getChapters(firstExtId).catch(() => []),
          new Promise<[]>(resolve => setTimeout(() => resolve([]), 5000))
        ]);
        probeChapterCount = chs.length;
      }
    }
  } catch (err) {
    probeError = (err as Error).message;
  }

  const detected = probeSearchCount > 0 || (analysis.confidence !== 'low' && homepage.ok);

  return {
    detected,
    suggestedName: analysis.suggestedName,
    baseUrl,
    lang: analysis.lang,
    template: effectiveTemplate,
    confidence:
      probeSearchCount > 0
        ? 'high'
        : analysis.confidence,
    signals: [
      ...analysis.signals,
      ...(probeSearchCount > 0
        ? [`Busca de teste retornou ${probeSearchCount} obra(s)`]
        : ['Busca de teste retornou 0 itens — tente ajustar o motor ou seletores'])
    ],
    cloudflareBlocked: probeError?.toLowerCase().includes('cloudflare') || false,
    probeSearchCount,
    probeSampleTitles,
    probeChapterCount,
    selectors: effectiveSelectors,
    error: probeError
  };
}

export function buildMirrorCandidateUrls(rawBaseUrl: string): string[] {
  const normalized = normalizeBaseUrl(rawBaseUrl);
  if (!normalized) return [];

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return [];
  }

  const host = parsed.hostname.toLowerCase();
  const parts = host.split('.');
  if (parts.length < 2) return [];

  const tlds = ['com', 'net', 'org', 'to', 'gg', 'me', 'tv'];
  const currentTld = parts[parts.length - 1];
  const stemParts = parts.slice(0, -1);
  const candidates = new Set<string>();

  for (const tld of tlds) {
    if (tld === currentTld) continue;
    const candidateHost = [...stemParts, tld].join('.');
    const url = `${parsed.protocol}//${candidateHost}`;
    if (isSafeExternalRelayUrl(url)) {
      candidates.add(url);
    }
  }

  return Array.from(candidates).slice(0, 6);
}

export async function probeAlternativeMirrors(
  rawBaseUrl: string
): Promise<MirrorProbeCandidate[]> {
  const candidateUrls = buildMirrorCandidateUrls(rawBaseUrl);
  if (candidateUrls.length === 0) return [];

  const checks = await Promise.all(
    candidateUrls.map(async (url): Promise<MirrorProbeCandidate> => {
      const start = Date.now();
      try {
        const res = await fetch(`${url}/`, {
          method: 'GET',
          signal: AbortSignal.timeout(3500),
          headers: DEFAULT_PROBE_HEADERS
        });
        const latencyMs = Date.now() - start;
        const text = await res.text().catch(() => '');
        const cf = isCloudflareChallenge(res.status, text);
        return {
          url,
          reachable: res.ok && !cf,
          status: res.status,
          latencyMs,
          cloudflare: cf
        };
      } catch {
        return {
          url,
          reachable: false,
          status: 0,
          latencyMs: Date.now() - start
        };
      }
    })
  );

  return checks.sort((a, b) => {
    if (a.reachable !== b.reachable) return a.reachable ? -1 : 1;
    return a.latencyMs - b.latencyMs;
  });
}
