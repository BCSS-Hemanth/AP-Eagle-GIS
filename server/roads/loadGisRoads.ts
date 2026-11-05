/**
 * Load GIS-Source road shapefiles into Postgres (PostGIS if available, else JSONB+bbox).
 *
 *   npm run db:ensure
 *   npm run db:load-roads
 */
import fs from 'node:fs';
import proj4 from 'proj4';
import { open as openShapefile } from 'shapefile';
import {
  VSP_LCC_PROJ4,
  apRoadsShpPath,
  vspRoadsShpPath,
} from './config';
import {
  ensureRoadsSchema,
  geometryBbox,
  withClient,
} from './db';

proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs('VSP_LCC', VSP_LCC_PROJ4);

type Props = Record<string, unknown>;
type Mode = 'postgis' | 'bbox';

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function lineWgs84(
  coords: number[][],
  reproject: boolean
): GeoJSON.LineString | null {
  if (!coords || coords.length < 2) return null;
  const out: [number, number][] = [];
  for (const c of coords) {
    if (!c || c.length < 2) continue;
    let x = c[0];
    let y = c[1];
    if (reproject) {
      const [lon, lat] = proj4('VSP_LCC', 'EPSG:4326', [x, y]);
      x = lon;
      y = lat;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (Math.abs(x) > 180 || Math.abs(y) > 90) continue;
    out.push([x, y]);
  }
  if (out.length < 2) return null;
  return { type: 'LineString', coordinates: out };
}

async function* readLines(
  shpPath: string
): AsyncGenerator<{ props: Props; geom: GeoJSON.LineString | GeoJSON.MultiLineString }> {
  const dbfPath = shpPath.replace(/\.shp$/i, '.dbf');
  if (!fs.existsSync(shpPath)) throw new Error(`Missing shapefile: ${shpPath}`);
  if (!fs.existsSync(dbfPath)) throw new Error(`Missing DBF: ${dbfPath}`);

  const source = await openShapefile(shpPath, dbfPath);
  while (true) {
    const result = await source.read();
    if (result.done) break;
    const feature = result.value as GeoJSON.Feature;
    if (!feature?.geometry) continue;
    const g = feature.geometry;
    if (g.type === 'LineString' || g.type === 'MultiLineString') {
      yield { props: (feature.properties ?? {}) as Props, geom: g };
    }
  }
}

type Row = {
  objectid: number | null;
  rd_code: string | null;
  rd_type: string | null;
  rd_sub_typ: string | null;
  shape_leng: number | null;
  geojson: string;
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
};

async function insertBatch(
  mode: Mode,
  source: 'ap_full' | 'vsp',
  rows: Row[]
): Promise<number> {
  if (!rows.length) return 0;
  return withClient(async (client) => {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let i = 1;
    for (const row of rows) {
      if (mode === 'postgis') {
        placeholders.push(
          `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, ST_SetSRID(ST_GeomFromGeoJSON($${i++}), 4326))`
        );
        values.push(
          source,
          row.objectid,
          row.rd_code,
          row.rd_type,
          row.rd_sub_typ,
          row.shape_leng,
          row.geojson
        );
      } else {
        placeholders.push(
          `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}::jsonb)`
        );
        values.push(
          source,
          row.objectid,
          row.rd_code,
          row.rd_type,
          row.rd_sub_typ,
          row.shape_leng,
          row.minx,
          row.miny,
          row.maxx,
          row.maxy,
          row.geojson
        );
      }
    }

    if (mode === 'postgis') {
      await client.query(
        `INSERT INTO gis_road_segments
          (source, objectid, rd_code, rd_type, rd_sub_typ, shape_leng, geom)
         VALUES ${placeholders.join(',')}`,
        values
      );
    } else {
      await client.query(
        `INSERT INTO gis_road_segments
          (source, objectid, rd_code, rd_type, rd_sub_typ, shape_leng, minx, miny, maxx, maxy, geom_json)
         VALUES ${placeholders.join(',')}`,
        values
      );
    }
    return rows.length;
  });
}

async function loadSource(
  mode: Mode,
  label: string,
  source: 'ap_full' | 'vsp',
  shpPath: string,
  reproject: boolean
): Promise<{ inserted: number; skipped: number }> {
  console.log(`\n→ Loading ${label}\n  ${shpPath}`);
  await withClient(async (client) => {
    await client.query(`DELETE FROM gis_road_segments WHERE source = $1`, [source]);
  });

  let inserted = 0;
  let skipped = 0;
  let batch: Row[] = [];

  const flush = async () => {
    if (!batch.length) return;
    inserted += await insertBatch(mode, source, batch);
    process.stdout.write(`\r  inserted ${inserted} (skipped ${skipped})`);
    batch = [];
  };

  for await (const { props, geom } of readLines(shpPath)) {
    const parts: GeoJSON.LineString[] = [];
    if (geom.type === 'LineString') {
      const line = lineWgs84(geom.coordinates as number[][], reproject);
      if (line) parts.push(line);
    } else {
      for (const ring of geom.coordinates as number[][][]) {
        const line = lineWgs84(ring, reproject);
        if (line) parts.push(line);
      }
    }
    if (!parts.length) {
      skipped++;
      continue;
    }

    const payload =
      parts.length === 1
        ? parts[0]
        : ({
            type: 'MultiLineString',
            coordinates: parts.map((p) => p.coordinates),
          } as GeoJSON.MultiLineString);

    const bbox = geometryBbox(payload);
    if (!bbox) {
      skipped++;
      continue;
    }

    batch.push({
      objectid: num(props.OBJECTID ?? props.objectid),
      rd_code: str(props.RD_CODE ?? props.rd_code),
      rd_type: str(props.RD_TYPE ?? props.rd_type),
      rd_sub_typ: str(props.RD_SUB_TYP ?? props.rd_sub_typ),
      shape_leng: num(props.Shape_Leng ?? props.SHAPE_Leng ?? props.LENGTH),
      geojson: JSON.stringify(payload),
      ...bbox,
    });

    if (batch.length >= 200) await flush();
  }
  await flush();
  console.log(`\n  done ${label}: ${inserted} rows`);
  return { inserted, skipped };
}

async function main() {
  const { mode } = await withClient(async (client) => ensureRoadsSchema(client));
  console.log(`Storage mode: ${mode}${mode === 'bbox' ? ' (PostGIS not installed — JSONB+bbox)' : ''}`);

  // Drop incompatible leftover table if switching modes mid-setup.
  await withClient(async (client) => {
    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'gis_road_segments'
    `);
    const names = new Set(cols.rows.map((r) => String(r.column_name)));
    const needPostgis = mode === 'postgis' && !names.has('geom');
    const needBbox = mode === 'bbox' && !names.has('geom_json');
    if (needPostgis || needBbox) {
      console.log('Recreating gis_road_segments for current mode…');
      await client.query('DROP TABLE IF EXISTS gis_road_segments');
      await ensureRoadsSchema(client);
    }
  });

  const ap = apRoadsShpPath();
  const vsp = vspRoadsShpPath();
  if (!fs.existsSync(ap)) throw new Error(`ap_roads.shp not found at ${ap}`);
  if (!fs.existsSync(vsp)) throw new Error(`VSP.shp not found at ${vsp}`);

  const a = await loadSource(mode, 'Admin ap_roads (full)', 'ap_full', ap, false);
  const v = await loadSource(mode, 'OPS VSP roads (LCC→WGS84)', 'vsp', vsp, true);

  const stats = await withClient(async (client) => {
    const full = await client.query(
      `SELECT count(*)::int AS n FROM gis_road_segments WHERE source = 'ap_full'`
    );
    const nh = await client.query(
      `SELECT count(*)::int AS n FROM gis_road_segments
       WHERE source = 'ap_full' AND rd_sub_typ = 'National Highway'`
    );
    const vspN = await client.query(
      `SELECT count(*)::int AS n FROM gis_road_segments WHERE source = 'vsp'`
    );
    return {
      full: full.rows[0].n as number,
      nh: nh.rows[0].n as number,
      vsp: vspN.rows[0].n as number,
    };
  });

  console.log('\nLoad complete:');
  console.log(`  mode              ${mode}`);
  console.log(`  ap_full          ${stats.full} (skipped ${a.skipped})`);
  console.log(`  national highway ${stats.nh}  ← replaces OSRM NH sketch in app`);
  console.log(`  vsp              ${stats.vsp} (skipped ${v.skipped})`);
  console.log(`\nNext: npm run server:roads`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
