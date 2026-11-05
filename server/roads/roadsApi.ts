/**
 * Roads API — bbox GeoJSON (+ MVT when PostGIS is available).
 *
 *   npm run server:roads
 */
import express from 'express';
import {
  geojsonFeatureLimit,
  roadsApiHost,
  roadsApiPort,
} from './config';
import {
  ensureRoadsSchema,
  getPool,
  layerWhere,
  type RoadLayerId,
  withClient,
} from './db';

const LAYERS = new Set<RoadLayerId>(['full', 'vsp', 'nh']);
let storageMode: 'postgis' | 'bbox' = 'bbox';

function parseLayer(raw: string): RoadLayerId | null {
  const v = raw.toLowerCase() as RoadLayerId;
  return LAYERS.has(v) ? v : null;
}

function parseBbox(raw: unknown): [number, number, number, number] | null {
  if (typeof raw !== 'string') return null;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [w, s, e, n] = parts;
  if (w >= e || s >= n) return null;
  if (w < -180 || e > 180 || s < -90 || n > 90) return null;
  return [w, s, e, n];
}

async function main() {
  storageMode = (
    await withClient(async (client) => ensureRoadsSchema(client))
  ).mode;

  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', async (_req, res) => {
    try {
      const counts = await getPool().query(`
        SELECT
          count(*) FILTER (WHERE source = 'ap_full')::int AS full,
          count(*) FILTER (WHERE source = 'ap_full' AND rd_sub_typ = 'National Highway')::int AS nh,
          count(*) FILTER (WHERE source = 'vsp')::int AS vsp
        FROM gis_road_segments
      `);
      res.json({
        ok: true,
        mode: storageMode,
        postgis: storageMode === 'postgis',
        counts: counts.rows[0],
      });
    } catch (err) {
      res.status(503).json({ ok: false, error: (err as Error).message });
    }
  });

  app.get('/api/gis-roads/layers', (_req, res) => {
    res.json({
      mode: storageMode,
      layers: [
        {
          id: 'nh',
          name: 'National Highways (GIS-Source ap_roads)',
          filter: "source=ap_full AND rd_sub_typ='National Highway'",
          replaces: 'public/geo/ap-highways.geojson (OSRM sketch)',
        },
        { id: 'full', name: 'AP roads full (~153k)', filter: "source=ap_full" },
        { id: 'vsp', name: 'OPS VSP roads (reprojected WGS84)', filter: "source=vsp" },
      ],
    });
  });

  app.get('/api/gis-roads/geojson', async (req, res) => {
    const layer = parseLayer(String(req.query.layer ?? ''));
    if (!layer) {
      res.status(400).json({ error: 'layer must be full | vsp | nh' });
      return;
    }
    const bbox = parseBbox(req.query.bbox);
    if (!bbox && layer === 'full') {
      res.status(400).json({
        error: 'bbox=west,south,east,north is required for layer=full',
      });
      return;
    }

    const where = layerWhere(layer);
    const limit = Math.min(
      Number(req.query.limit ?? geojsonFeatureLimit()) || geojsonFeatureLimit(),
      geojsonFeatureLimit()
    );

    try {
      const params: unknown[] = [...where.params];
      let sql: string;

      if (storageMode === 'postgis') {
        sql = `
          SELECT jsonb_build_object(
            'type', 'FeatureCollection',
            'features', coalesce(jsonb_agg(feature), '[]'::jsonb)
          ) AS fc
          FROM (
            SELECT jsonb_build_object(
              'type', 'Feature',
              'id', id,
              'geometry', ST_AsGeoJSON(geom)::jsonb,
              'properties', jsonb_build_object(
                'source', source,
                'objectid', objectid,
                'rd_code', rd_code,
                'rd_type', rd_type,
                'rd_sub_typ', rd_sub_typ,
                'shape_leng', shape_leng
              )
            ) AS feature
            FROM gis_road_segments
            WHERE ${where.sql}
        `;
        if (bbox) {
          const i = params.length;
          params.push(bbox[0], bbox[1], bbox[2], bbox[3]);
          sql += ` AND geom && ST_MakeEnvelope($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, 4326)`;
        }
      } else {
        sql = `
          SELECT jsonb_build_object(
            'type', 'FeatureCollection',
            'features', coalesce(jsonb_agg(feature), '[]'::jsonb)
          ) AS fc
          FROM (
            SELECT jsonb_build_object(
              'type', 'Feature',
              'id', id,
              'geometry', geom_json,
              'properties', jsonb_build_object(
                'source', source,
                'objectid', objectid,
                'rd_code', rd_code,
                'rd_type', rd_type,
                'rd_sub_typ', rd_sub_typ,
                'shape_leng', shape_leng
              )
            ) AS feature
            FROM gis_road_segments
            WHERE ${where.sql}
        `;
        if (bbox) {
          const i = params.length;
          params.push(bbox[0], bbox[1], bbox[2], bbox[3]);
          // Axis-aligned bbox overlap
          sql += ` AND maxx >= $${i + 1} AND minx <= $${i + 3} AND maxy >= $${i + 2} AND miny <= $${i + 4}`;
        }
      }

      params.push(limit);
      sql += ` LIMIT $${params.length}
        ) q
      `;

      const result = await getPool().query(sql, params);
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json(result.rows[0]?.fc ?? { type: 'FeatureCollection', features: [] });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/gis-roads/mvt/:layer/:z/:x/:y', async (req, res) => {
    if (storageMode !== 'postgis') {
      res.status(501).json({
        error: 'MVT requires PostGIS. Use /api/gis-roads/geojson?layer=…&bbox=… instead.',
        mode: storageMode,
      });
      return;
    }
    const layer = parseLayer(req.params.layer);
    if (!layer) {
      res.status(400).send('layer must be full | vsp | nh');
      return;
    }
    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number(req.params.y);
    if (![z, x, y].every((n) => Number.isInteger(n) && n >= 0) || z > 22) {
      res.status(400).send('invalid tile');
      return;
    }

    const where = layerWhere(layer);
    try {
      const result = await getPool().query(
        `
        WITH bounds AS (
          SELECT ST_TileEnvelope($1, $2, $3) AS geom
        ),
        mvtgeom AS (
          SELECT
            id,
            rd_code,
            rd_type,
            rd_sub_typ,
            ST_AsMVTGeom(
              ST_Transform(r.geom, 3857),
              bounds.geom,
              4096,
              64,
              true
            ) AS geom
          FROM gis_road_segments r, bounds
          WHERE ${where.sql}
            AND ST_Transform(r.geom, 3857) && bounds.geom
        )
        SELECT ST_AsMVT(mvtgeom, 'roads', 4096, 'geom') AS tile
        FROM mvtgeom
        `,
        [z, x, y]
      );
      const tile: Buffer | null = result.rows[0]?.tile ?? null;
      res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile');
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.send(tile && tile.length ? tile : Buffer.alloc(0));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  const host = roadsApiHost();
  const port = roadsApiPort();
  app.listen(port, host, () => {
    console.log(`Roads API http://${host}:${port}  mode=${storageMode}`);
    console.log(`  GET /api/health`);
    console.log(`  GET /api/gis-roads/geojson?layer=nh|vsp|full&bbox=w,s,e,n`);
    if (storageMode === 'postgis') {
      console.log(`  GET /api/gis-roads/mvt/:layer/:z/:x/:y`);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
