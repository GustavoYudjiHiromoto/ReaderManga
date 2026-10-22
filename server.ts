process.env.DISABLE_HMR = 'true';

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiRouter } from './server/api/routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // Mount API routes
  app.use('/api', apiRouter);

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
