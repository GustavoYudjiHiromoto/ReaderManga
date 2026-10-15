import { Router, Request, Response } from 'express';
import { sourceRegistry } from '../sources/SourceRegistry.js';
import { HttpError } from '../errors/HttpError.js';

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

// 1. Sources endpoint
apiRouter.get('/sources', (req: Request, res: Response) => {
  try {
    const sources = sourceRegistry.getSources();
    res.json({
      success: true,
      data: sources
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 2. Search endpoint
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

    const searchResult = await sourceRegistry.search(q, {
      sourceId,
      genre,
      limit,
      offset,
      page,
      includeAdult,
      onlyAvailable
    });

    res.json({
      success: true,
      query: q,
      total: searchResult.total,
      sourcesQueried: searchResult.sourcesQueried,
      data: searchResult.results
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

// 3. Featured / Discovery endpoint
apiRouter.get('/manga/featured', async (req: Request, res: Response) => {
  try {
    const featured = await sourceRegistry.getFeatured();
    res.json({
      success: true,
      data: featured
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 4. Recommendation system feed endpoint (Spec items 9 & 10)
apiRouter.get('/recommendation-feed', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const feed = await sourceRegistry.getRecommendationFeed({ limit });
    res.json({
      success: true,
      ...feed
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 5. Manga detail by internal ID
apiRouter.get('/manga/:id', async (req: Request, res: Response) => {
  try {
    const internalId = req.params.id;
    const manga = await sourceRegistry.getMangaById(internalId);

    if (!manga) {
      return res.status(404).json({
        success: false,
        error: `Mangá com identificador '${internalId}' não foi encontrado.`
      });
    }

    res.json({
      success: true,
      data: manga
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

// 6. Chapters list for a manga
apiRouter.get('/manga/:id/chapters', async (req: Request, res: Response) => {
  try {
    const internalMangaId = req.params.id;
    const lang = req.query.lang as string | undefined;
    const order = (req.query.order as string) || 'asc'; // 'asc' or 'desc'
    const deduplicate = req.query.deduplicate !== 'false';

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

    res.json({
      success: true,
      mangaId: internalMangaId,
      total: chapters.length,
      data: chapters
    });
  } catch (err) {
    sendApiError(res, err);
  }
});

// 7. Chapter info and pages endpoint (matches any chapter ID, including composite or encoded tokens)
apiRouter.get(/^\/chapters\/(.+)\/pages$/, async (req: Request, res: Response) => {
  try {
    const internalChapterId = req.params[0] || (req.params as any).id;
    const pages = await sourceRegistry.getChapterPages(internalChapterId);

    res.json({
      success: true,
      chapterId: internalChapterId,
      total: pages.length,
      data: pages
    });
  } catch (err) {
    sendApiError(res, err);
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
    } else if (imageUrl.includes('guya.cubari.moe') || imageUrl.includes('guya.moe')) {
      headers['Referer'] = 'https://guya.cubari.moe/';
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
