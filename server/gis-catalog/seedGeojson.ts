/**
 * Seed portable vector GeoJSON (+ JSON indexes) under public/geo into Postgres.
 *
 *   npm run db:ensure
 *   npm run db:seed-geo
 *
 * Skips raster tile trees. Does not require GIS_SOURCE_ROOT.
 * After seeding, another machine only needs a DB dump + DATABASE_URL / PG* env.
 */
import fs from 'node:fs';
import path from 'node:path';
import { withClient } from '../roads/db';
import { ensureGisCatalogSchema, type CatalogStorageMode } from './schema';

const GEO_ROOT = path.resolve(process.cwd(), 'public', 'geo');

function toPosixRel(abs: string): string {
  return path.relative(GEO_ROOT, abs).split(path.sep).join('/');
}

function shouldSkip(relPosix: string): boolean {
  const lower = relPosix.toLowerCase();
  return lower.includes('/raster/');
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function featureId(props: Record<string, unknown> | null, index: number): string {
  if (props) {
    for (const key of ['id', 'ID', 'objectid', 'OBJECTID', 'fid', 'FID', 'name', 'NAME']) {
      const v = props[key];
      if (v != null && String(v).trim()) return String(v).trim();
    }
  }
  return String(index);
}

async function seedFeatureCollection(
  mode: CatalogStorageMode,
  layerPath: string,
  fc: GeoJSON.FeatureCollection,
  sourceBytes: number
): Promise<number> {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(`DELETE FROM gis_vector_layers WHERE layer_path = $1`, [layerPath]);
      await client.query(
        `
        INSERT INTO gis_vector_layers (layer_path, feature_count, source_bytes, seeded_at)
        VALUES ($1, $2, $3, now())
        `,
        [layerPath, fc.features.length, sourceBytes]
      );

      const batchSize = 250;
      for (let i = 0; i < fc.features.length; i += batchSize) {
        const slice = fc.features.slice(i, i + batchSize);
        const values: unknown[] = [];
        const rows: string[] = [];
        let p = 1;
        for (let j = 0; j < slice.length; j++) {
          const feature = slice[j];
          const idx = i + j;
          const props = (feature.properties ?? {}) as Record<string, unknown>;
          const geomJson = feature.geometry ? JSON.stringify(feature.geometry) : 'null';
          const fid = featureId(props, idx);
          if (mode === 'postgis') {
            // Store JSON always; geom filled best-effort after batch.
            rows.push(
              `($${p++}, $${p++}, $${p++}, $${p++}::jsonb, NULL, $${p++}::jsonb)`
            );
            values.push(layerPath, idx, fid, JSON.stringify(props), geomJson);
          } else {
            rows.push(`($${p++}, $${p++}, $${p++}, $${p++}::jsonb, $${p++}::jsonb)`);
            values.push(layerPath, idx, fid, JSON.stringify(props), geomJson);
          }
        }
        if (!rows.length) continue;
        if (mode === 'postgis') {
          await client.query(
            `
            INSERT INTO gis_vector_features
              (layer_path, feature_index, feature_id, properties, geom, geom_json)
            VALUES ${rows.join(',')}
            `,
            values
          );
        } else {
          await client.query(
            `
            INSERT INTO gis_vector_features
              (layer_path, feature_index, feature_id, properties, geom_json)
            VALUES ${rows.join(',')}
            `,
            values
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    if (mode === 'postgis') {
      // Outside the insert txn — one bad geometry must not roll back the layer.
      await client.query(
        `
        UPDATE gis_vector_features
        SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geom_json::text), 4326)
        WHERE layer_path = $1
          AND geom_json IS NOT NULL
          AND jsonb_typeof(geom_json) = 'object'
          AND geom IS NULL
          AND coalesce(geom_json->>'type', '') <> 'GeometryCollection'
        `,
        [layerPath]
      ).catch(() => {
        /* serve via geom_json */
      });
    }

    return fc.features.length;
  });
}

async function seedDocument(docPath: string, content: unknown): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `
      INSERT INTO gis_vector_documents (doc_path, content, seeded_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (doc_path) DO UPDATE
        SET content = EXCLUDED.content, seeded_at = now()
      `,
      [docPath, JSON.stringify(content)]
    );
  });
}

async function main() {
  if (!fs.existsSync(GEO_ROOT)) {
    throw new Error(
      `Missing ${GEO_ROOT} — run seed on a machine that has public/geo, then share a Postgres dump.`
    );
  }

  const { mode } = await withClient((client) => ensureGisCatalogSchema(client));
  console.log(`Catalog storage mode: ${mode}`);
  console.log(`Scanning ${GEO_ROOT}`);

  const files = walkFiles(GEO_ROOT).filter((abs) => {
    const rel = toPosixRel(abs);
    if (shouldSkip(rel)) return false;
    const lower = rel.toLowerCase();
    return lower.endsWith('.geojson') || lower.endsWith('.json');
  });

  let layers = 0;
  let features = 0;
  let docs = 0;
  let skipped = 0;

  for (const abs of files.sort()) {
    const rel = toPosixRel(abs);
    const raw = fs.readFileSync(abs, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(`  skip (invalid JSON): ${rel}`);
      skipped += 1;
      continue;
    }

    const obj = parsed as { type?: string; features?: unknown[]; geometry?: unknown };
    let fc: GeoJSON.FeatureCollection | null = null;
    if (obj?.type === 'FeatureCollection' && Array.isArray(obj.features)) {
      fc = obj as GeoJSON.FeatureCollection;
    } else if (obj?.type === 'Feature' && obj.geometry) {
      fc = { type: 'FeatureCollection', features: [obj as GeoJSON.Feature] };
    } else if (obj?.type && obj.geometry == null && (obj as GeoJSON.Geometry).type) {
      // bare Geometry → one feature
      fc = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: obj as unknown as GeoJSON.Geometry,
          },
        ],
      };
    }

    if (fc) {
      try {
        const n = await seedFeatureCollection(
          mode,
          rel,
          fc,
          Buffer.byteLength(raw, 'utf8')
        );
        layers += 1;
        features += n;
        console.log(`  layer ${rel}  (${n} features)`);
      } catch (err) {
        console.warn(`  FAIL ${rel}: ${(err as Error).message}`);
        skipped += 1;
      }
      continue;
    }

    if (rel.toLowerCase().endsWith('.json')) {
      await seedDocument(rel, parsed);
      docs += 1;
      console.log(`  document ${rel}`);
      continue;
    }

    skipped += 1;
    console.warn(`  skip (not FeatureCollection): ${rel}`);
  }

  const stats = await withClient(async (client) => {
    const layersR = await client.query(`SELECT count(*)::int AS n FROM gis_vector_layers`);
    const featsR = await client.query(`SELECT count(*)::int AS n FROM gis_vector_features`);
    const docsR = await client.query(`SELECT count(*)::int AS n FROM gis_vector_documents`);
    return {
      layers: layersR.rows[0].n as number,
      features: featsR.rows[0].n as number,
      documents: docsR.rows[0].n as number,
    };
  });

  console.log('\nSeed complete:');
  console.log(`  layers written this run   ${layers}`);
  console.log(`  features written this run ${features}`);
  console.log(`  documents this run        ${docs}`);
  console.log(`  skipped                   ${skipped}`);
  console.log(`  DB totals                 layers=${stats.layers} features=${stats.features} docs=${stats.documents}`);
  console.log(`\nNext: npm run server:roads`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
