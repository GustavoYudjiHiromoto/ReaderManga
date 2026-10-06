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
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const searchResult = await sourceRegistry.search(q, {
      sourceId,
      genre,
      limit
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

    let chapters = await sourceRegistry.getChapters(internalMangaId, lang);

    // Sort chapters
    chapters.sort((a, b) => {
      const numA = parseFloat(a.chapterNumber) || 0;
      const numB = parseFloat(b.chapterNumber) || 0;
      return order === 'desc' ? numB - numA : numA - numB;
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

// 7. Chapter info and pages endpoint
apiRouter.get('/chapters/:id/pages', async (req: Request, res: Response) => {
  try {
    const internalChapterId = req.params.id;
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

// 8. Image proxy to prevent CORS or hotlinking issues on remote hosts
apiRouter.get('/proxy/image', async (req: Request, res: Response) => {
  try {
    const imageUrl = req.query.url as string;
    if (!imageUrl) {
      return res.status(400).send('Missing url parameter');
    }

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': imageUrl
      }
    });

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch upstream image');
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    res.status(500).send('Proxy error');
  }
});
