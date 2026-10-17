import { Router, Request, Response } from 'express';
import { ZipArchive } from 'archiver';
import { sourceRegistry } from '../sources/SourceRegistry.js';
import { HttpError } from '../errors/HttpError.js';
import { globalCache } from '../cache/CacheService.js';

export const apiRouter = Router();

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

async function fetchImageBuffer(imageUrl: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  if (imageUrl.includes('comick.pictures') || imageUrl.includes('comick.io')) {
    headers['Referer'] = 'https://comick.io/';
  } else if (imageUrl.includes('weebcentral') || imageUrl.includes('planeptune.us') || imageUrl.includes('compsci88.com')) {
    headers['Referer'] = 'https://weebcentral.com/';
  } else if (imageUrl.includes('cdn.readdetectiveconan.com') || imageUrl.includes('mangapill.com')) {
    headers['Referer'] = 'https://mangapill.com/';
  }

  let response = await fetch(imageUrl, { headers }).catch(() => null);

  if ((!response || !response.ok) && imageUrl.includes('mangadex.network')) {
    const fallbackUrl = imageUrl.replace(/https:\/\/[^/]+\.mangadex\.network/, 'https://uploads.mangadex.org');
    response = await fetch(fallbackUrl, { headers }).catch(() => null);
  }

  if (!response || !response.ok) {
    return null;
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const arrayBuf = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuf),
    contentType
  };
}

// 0. Cache stats endpoint
apiRouter.get('/cache/stats', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: globalCache.getStats()
  });
});

// 0.1 Healthcheck and server diagnostic endpoint (Fase 5)
apiRouter.get('/health', (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'healthy',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    version: '1.0.0',
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

// 2. Search endpoint (cached for 5 minutes)
apiRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    const sourceId = req.query.source as string;
    const genre = req.query.genre as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 24;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;

    const includeAdult = req.query.includeAdult === 'true';
    const onlyAvailable = req.query.onlyAvailable === 'true';

    const cacheKey = `search:${q}:${sourceId || 'all'}:${genre || 'all'}:${limit}:${offset || 0}:${page || 1}:${includeAdult}:${onlyAvailable}`;
    const cached = globalCache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const searchResult = await sourceRegistry.search(q, {
      sourceId,
      genre,
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
    const cacheKey = 'manga:featured';
    const cached = globalCache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const featured = await sourceRegistry.getFeatured();
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

    const cacheKey = `chapters:${internalMangaId}:${lang || 'all'}:${order}:${deduplicate}`;
    const cached = globalCache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    let chapters = await sourceRegistry.getChapters(internalMangaId, lang, { deduplicate });

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
    globalCache.set(cacheKey, payload, 1800);
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
    const format = (req.query.format as string) === 'zip' ? 'zip' : 'cbz';
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
    if (!imageUrl) {
      return res.status(400).send('Missing url parameter');
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    if (imageUrl.includes('comick.pictures') || imageUrl.includes('comick.io')) {
      headers['Referer'] = 'https://comick.io/';
    } else if (imageUrl.includes('weebcentral') || imageUrl.includes('planeptune.us') || imageUrl.includes('compsci88.com')) {
      headers['Referer'] = 'https://weebcentral.com/';
    } else if (imageUrl.includes('cdn.readdetectiveconan.com') || imageUrl.includes('mangapill.com')) {
      headers['Referer'] = 'https://mangapill.com/';
    }

    let response = await fetch(imageUrl, { headers });

    // Fallback if ephemeral MangaDex@Home node returned 404 or failed
    if (!response.ok && imageUrl.includes('mangadex.network')) {
      const fallbackUrl = imageUrl.replace(/https:\/\/[^/]+\.mangadex\.network/, 'https://uploads.mangadex.org');
      try {
        const fallbackRes = await fetch(fallbackUrl, { headers });
        if (fallbackRes.ok) {
          response = fallbackRes;
        }
      } catch {
        // keep original response
      }
    }

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch upstream image');
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    res.status(500).send('Proxy error');
  }
});

// 9. Catch-all for undefined API routes (always returns JSON 404, never falls through to HTML)
apiRouter.all('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Endpoint de API não encontrado: ${req.method} ${req.originalUrl}`
  });
});
