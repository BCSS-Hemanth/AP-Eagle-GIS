import pg from 'pg';
import { roadsDbConfig } from './config';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let postgisAvailable: boolean | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool(roadsDbConfig());
  }
  return pool;
}

export async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function hasPostgis(client: pg.PoolClient): Promise<boolean> {
  if (postgisAvailable != null) return postgisAvailable;
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis');
    postgisAvailable = true;
  } catch {
    postgisAvailable = false;
  }
  return postgisAvailable;
}

export async function ensureRoadsSchema(client: pg.PoolClient): Promise<{ mode: 'postgis' | 'bbox' }> {
  const usePostgis = await hasPostgis(client);

  // Old bbox/jsonb table cannot host PostGIS geom (and vice versa) — recreate when mismatched.
  const cols = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gis_road_segments'
  `);
  const names = new Set(cols.rows.map((r) => String(r.column_name)));
  if (names.size > 0) {
    const wrongForPostgis = usePostgis && !names.has('geom');
    const wrongForBbox = !usePostgis && !names.has('geom_json');
    if (wrongForPostgis || wrongForBbox) {
      await client.query('DROP TABLE IF EXISTS gis_road_segments CASCADE');
    }
  }

  if (usePostgis) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS gis_road_segments (
        id bigserial PRIMARY KEY,
        source text NOT NULL CHECK (source IN ('ap_full', 'vsp')),
        objectid integer,
        rd_code text,
        rd_type text,
        rd_sub_typ text,
        shape_leng double precision,
        geom geometry(Geometry, 4326) NOT NULL
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS gis_road_segments_geom_idx ON gis_road_segments USING GIST (geom)`
    );
  } else {
    await client.query(`
      CREATE TABLE IF NOT EXISTS gis_road_segments (
        id bigserial PRIMARY KEY,
        source text NOT NULL CHECK (source IN ('ap_full', 'vsp')),
        objectid integer,
        rd_code text,
        rd_type text,
        rd_sub_typ text,
        shape_leng double precision,
        minx double precision NOT NULL,
        miny double precision NOT NULL,
        maxx double precision NOT NULL,
        maxy double precision NOT NULL,
        geom_json jsonb NOT NULL
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS gis_road_segments_bbox_idx
      ON gis_road_segments (minx, maxx, miny, maxy)
    `);
  }

  await client.query(
    `CREATE INDEX IF NOT EXISTS gis_road_segments_source_idx ON gis_road_segments (source)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS gis_road_segments_sub_idx ON gis_road_segments (rd_sub_typ)`
  );

  return { mode: usePostgis ? 'postgis' : 'bbox' };
}

export type RoadLayerId = 'full' | 'nh';

export function layerWhere(layer: RoadLayerId): { sql: string; params: unknown[] } {
  if (layer === 'full') return { sql: `source = 'ap_full'`, params: [] };
  return {
    sql: `source = 'ap_full' AND rd_sub_typ = 'National Highway'`,
    params: [],
  };
}

export function ringBbox(coords: number[][]): {
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
} | null {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const c of coords) {
    if (!c || c.length < 2) continue;
    const x = c[0];
    const y = c[1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minx) minx = x;
    if (y < miny) miny = y;
    if (x > maxx) maxx = x;
    if (y > maxy) maxy = y;
  }
  if (!Number.isFinite(minx)) return null;
  return { minx, miny, maxx, maxy };
}

export function geometryBbox(
  geom: GeoJSON.LineString | GeoJSON.MultiLineString
): { minx: number; miny: number; maxx: number; maxy: number } | null {
  if (geom.type === 'LineString') return ringBbox(geom.coordinates as number[][]);
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const line of geom.coordinates as number[][][]) {
    const b = ringBbox(line);
    if (!b) continue;
    if (b.minx < minx) minx = b.minx;
    if (b.miny < miny) miny = b.miny;
    if (b.maxx > maxx) maxx = b.maxx;
    if (b.maxy > maxy) maxy = b.maxy;
  }
  if (!Number.isFinite(minx)) return null;
  return { minx, miny, maxx, maxy };
}
