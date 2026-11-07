process.env.DISABLE_HMR = 'true';

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiRouter } from './server/api/routes.js';
import { trackerRouter } from './server/trackers/TrackerRouter.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // Mount Tracker API routes (AniList & MyAnimeList)
  app.use('/api/trackers', trackerRouter);

  // Mount API routes
  app.use('/api', apiRouter);

  // OAuth Callback Route for AniList (Implicit Grant)
  app.get(['/auth/anilist/callback', '/auth/anilist/callback/'], (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>AniList Conectado</title>
    <style>
      body { background: #09090b; color: #f4f4f5; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
      .card { text-align: center; padding: 24px; border-radius: 16px; background: #18181b; border: 1px solid #27272a; max-width: 360px; }
      h2 { color: #38bdf8; margin: 0 0 8px 0; font-size: 18px; }
      p { color: #a1a1aa; font-size: 13px; margin: 0; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>✓ AniList Conectado</h2>
      <p>Retornando ao MangaReader...</p>
    </div>
    <script>
      try {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        if (window.opener) {
          window.opener.postMessage({ type: 'ANILIST_AUTH_SUCCESS', token, hash: window.location.hash }, '*');
          setTimeout(() => window.close(), 600);
        } else {
          window.location.href = '/';
        }
      } catch (e) {
        console.error(e);
      }
    </script>
  </body>
</html>`);
  });

  // OAuth Callback Route for MyAnimeList (PKCE)
  app.get(['/auth/mal/callback', '/auth/mal/callback/'], (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    res.send(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>MyAnimeList Conectado</title>
    <style>
      body { background: #09090b; color: #f4f4f5; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
      .card { text-align: center; padding: 24px; border-radius: 16px; background: #18181b; border: 1px solid #27272a; max-width: 360px; }
      h2 { color: #60a5fa; margin: 0 0 8px 0; font-size: 18px; }
      p { color: #a1a1aa; font-size: 13px; margin: 0; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>✓ MyAnimeList Conectado</h2>
      <p>Processando autorização...</p>
    </div>
    <script>
      try {
        const code = ${JSON.stringify(code || '')};
        const state = ${JSON.stringify(state || '')};
        if (window.opener) {
          window.opener.postMessage({ type: 'MAL_AUTH_SUCCESS', code, state }, '*');
          setTimeout(() => window.close(), 600);
        } else {
          window.location.href = '/';
        }
      } catch (e) {
        console.error(e);
      }
    </script>
  </body>
</html>`);
  });

  // Guarantee that unmatched /api/* requests NEVER fall through to Vite SPA middleware
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      error: `Endpoint de API não encontrado: ${req.method} ${req.originalUrl}`
    });
  });

  if (!isProduction) {
    // Vite middleware for development
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Static file serving for production
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MangaReader server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start MangaReader server:', err);
  process.exit(1);
});
