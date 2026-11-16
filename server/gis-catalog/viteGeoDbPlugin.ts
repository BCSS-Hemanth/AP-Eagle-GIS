/**
 * Vite middleware: prefer Postgres-backed /geo/*.geojson via roads API,
 * fall back to public/ disk when the layer is not seeded yet.
 * Raster paths are never intercepted.
 */
import type { Plugin } from 'vite';
import http from 'node:http';

function shouldIntercept(urlPath: string): boolean {
  if (!urlPath.startsWith('/geo/')) return false;
  if (urlPath.toLowerCase().includes('/raster/')) return false;
  return /\.(geojson|json)(\?|$)/i.test(urlPath);
}

export function geoFromDbPlugin(): Plugin {
  return {
    name: 'geo-from-db-proxy',
    configureServer(server) {
      const port = Number(process.env.ROADS_API_PORT || 8787);
      const host = process.env.ROADS_API_HOST || '127.0.0.1';

      server.middlewares.use((req, res, next) => {
        const raw = req.url ?? '';
        const urlPath = raw.split('?')[0] ?? '';
        if (!shouldIntercept(urlPath)) {
          next();
          return;
        }

        const opts: http.RequestOptions = {
          host,
          port,
          path: raw,
          method: 'GET',
          headers: { Accept: 'application/json' },
          timeout: 120_000,
        };

        const proxyReq = http.request(opts, (proxyRes) => {
          if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
            // Not in DB (or API down) — let Vite serve public/geo if present.
            proxyRes.resume();
            next();
            return;
          }
          res.statusCode = proxyRes.statusCode ?? 200;
          for (const [k, v] of Object.entries(proxyRes.headers)) {
            if (v == null) continue;
            if (k.toLowerCase() === 'transfer-encoding') continue;
            res.setHeader(k, v);
          }
          proxyRes.pipe(res);
        });

        proxyReq.on('error', () => {
          // Roads API not running — fall back to static files.
          next();
        });
        proxyReq.on('timeout', () => {
          proxyReq.destroy();
          next();
        });
        proxyReq.end();
      });
    },
  };
}
