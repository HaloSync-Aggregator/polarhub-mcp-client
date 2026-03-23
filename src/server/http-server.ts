/**
 * HTTP Server with Vite middleware (dev) or static file serving (prod)
 *
 * Dev mode: Vite middleware for HMR + React hot reload
 * Prod mode: Express static serving from frontend/dist/
 */

import express from 'express';
import { createServer, type Server as HttpServer } from 'http';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = resolve(__dirname, '../../packages/frontend/dist');
const FRONTEND_ROOT = resolve(__dirname, '../../packages/frontend');

export async function createHttpServer(isDev: boolean): Promise<HttpServer> {
  const app = express();
  const httpServer = createServer(app);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', mode: isDev ? 'development' : 'production' });
  });

  if (isDev) {
    // Vite middleware mode — HMR support
    // httpServer is passed to hmr.server so Vite HMR WebSocket shares the same server
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: FRONTEND_ROOT,
      configFile: resolve(FRONTEND_ROOT, 'vite.config.ts'),
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production — static files + SPA fallback
    app.use(express.static(FRONTEND_DIST));
    app.get('*', (_req, res) => {
      res.sendFile(resolve(FRONTEND_DIST, 'index.html'));
    });
  }

  return httpServer;
}
