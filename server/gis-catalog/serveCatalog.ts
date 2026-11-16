/**
 * Express routes: serve seeded /geo/*.geojson (and JSON docs) from Postgres.
 * Falls through with next() is not used here — returns 404 so Vite can fall back to disk.
 */
import type { Express, Request, Response } from 'express';
import { getPool, withClient } from '../roads/db';
import { ensureGisCatalogSchema, type CatalogStorageMode } from './schema';

function normalizeGeoPath(raw: string): string | null {
  let p = decodeURIComponent(raw).replace(/^\/+/, '');
  if (p.startsWith('geo/')) p = p.slice(4);
  p = p.replace(/\\/g, '/');
  if (!p || p.includes('..')) return null;
  if (p.toLowerCase().includes('/raster/')) return null;
  if (!/\.(geojson|json)$/i.test(p)) return null;
  return p;
}

async function loadFeatureCollection(
  mode: CatalogStorageMode,
  layerPath: string
): Promise<GeoJSON.FeatureCollection | null> {
  const layer = await getPool().query(
    `SELECT layer_path FROM gis_vector_layers WHERE layer_path = $1`,
    [layerPath]
  );
  if (!layer.rowCount) return null;

  if (mode === 'postgis') {
    const result = await getPool().query(
      `
      SELECT coalesce(jsonb_agg(feature ORDER BY feature_index), '[]'::jsonb) AS features
      FROM (
        SELECT
          feature_index,
          jsonb_build_object(
            'type', 'Feature',
            'id', coalesce(feature_id, feature_index::text),
            'properties', properties,
            'geometry', coalesce(
              CASE WHEN geom IS NOT NULL THEN ST_AsGeoJSON(geom)::jsonb END,
              geom_json
            )
          ) AS feature
        FROM gis_vector_features
        WHERE layer_path = $1
      ) q
      `,
      [layerPath]
    );
    return {
      type: 'FeatureCollection',
      features: (result.rows[0]?.features ?? []) as GeoJSON.Feature[],
    };
  }

  const result = await getPool().query(
    `
    SELECT coalesce(jsonb_agg(feature ORDER BY feature_index), '[]'::jsonb) AS features
    FROM (
      SELECT
        feature_index,
        jsonb_build_object(
          'type', 'Feature',
          'id', coalesce(feature_id, feature_index::text),
          'properties', properties,
          'geometry', geom_json
        ) AS feature
      FROM gis_vector_features
      WHERE layer_path = $1
    ) q
    `,
    [layerPath]
  );
  return {
    type: 'FeatureCollection',
    features: (result.rows[0]?.features ?? []) as GeoJSON.Feature[],
  };
}

async function loadDocument(docPath: string): Promise<unknown | null> {
  const result = await getPool().query(
    `SELECT content FROM gis_vector_documents WHERE doc_path = $1`,
    [docPath]
  );
  if (!result.rowCount) return null;
  return result.rows[0].content;
}

export async function mountGisCatalogRoutes(app: Express): Promise<CatalogStorageMode> {
  const { mode } = await withClient((client) => ensureGisCatalogSchema(client));

  app.get('/api/gis-catalog/health', async (_req, res) => {
    try {
      const counts = await getPool().query(`
        SELECT
          (SELECT count(*)::int FROM gis_vector_layers) AS layers,
          (SELECT count(*)::int FROM gis_vector_features) AS features,
          (SELECT count(*)::int FROM gis_vector_documents) AS documents
      `);
      res.json({ ok: true, mode, counts: counts.rows[0] });
    } catch (err) {
      res.status(503).json({ ok: false, error: (err as Error).message });
    }
  });

  app.get('/api/gis-catalog/layers', async (_req, res) => {
    try {
      const rows = await getPool().query(
        `
        SELECT layer_path, feature_count, source_bytes, seeded_at
        FROM gis_vector_layers
        ORDER BY layer_path
        `
      );
      res.json({ mode, layers: rows.rows });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  const handleGeo = async (req: Request, res: Response) => {
    const fromQuery = typeof req.query.path === 'string' ? req.query.path : '';
    const fromParams = typeof req.params[0] === 'string' ? req.params[0] : '';
    const layerPath = normalizeGeoPath(fromQuery || fromParams);
    if (!layerPath) {
      res.status(400).json({ error: 'Invalid geo path' });
      return;
    }

    try {
      if (layerPath.toLowerCase().endsWith('.geojson')) {
        const fc = await loadFeatureCollection(mode, layerPath);
        if (!fc) {
          res.status(404).json({ error: 'Layer not in database', path: layerPath });
          return;
        }
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.setHeader('X-Gis-Catalog', 'db');
        res.json(fc);
        return;
      }

      const doc = await loadDocument(layerPath);
      if (doc == null) {
        res.status(404).json({ error: 'Document not in database', path: layerPath });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.setHeader('X-Gis-Catalog', 'db');
      res.json(doc);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  };

  app.get('/api/gis-catalog/geojson', handleGeo);
  // Same paths the browser already requests: /geo/ap-state.geojson etc.
  app.get('/geo/*', async (req, res, next) => {
    const rel = String((req.params as { 0?: string })[0] ?? '');
    if (!/\.(geojson|json)$/i.test(rel) || rel.toLowerCase().includes('/raster/')) {
      next();
      return;
    }
    (req.params as { 0?: string })[0] = rel;
    await handleGeo(req, res);
  });

  return mode;
}
