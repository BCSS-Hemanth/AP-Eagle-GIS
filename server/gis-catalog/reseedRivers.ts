import fs from 'node:fs';
import path from 'node:path';
import { withClient, getPool } from '../roads/db';
import { ensureGisCatalogSchema } from './schema';
import { repairLineJumpFeatureCollection } from '../../src/gis/splitLineJumps';

const layerPath = 'ap-rivers.geojson';

async function main() {
  const file = path.resolve(process.cwd(), 'public/geo/ap-rivers.geojson');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as GeoJSON.FeatureCollection;
  const fc = repairLineJumpFeatureCollection(raw, 20);
  const { mode } = await withClient((c) => ensureGisCatalogSchema(c));

  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(`DELETE FROM gis_vector_layers WHERE layer_path = $1`, [layerPath]);
      await client.query(
        `
        INSERT INTO gis_vector_layers (layer_path, feature_count, source_bytes, seeded_at)
        VALUES ($1, $2, $3, now())
        `,
        [layerPath, fc.features.length, Buffer.byteLength(JSON.stringify(fc), 'utf8')]
      );

      const batchSize = 100;
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
          const fid = String(props.name ?? idx);
          if (mode === 'postgis') {
            rows.push(`($${p++}, $${p++}, $${p++}, $${p++}::jsonb, NULL, $${p++}::jsonb)`);
            values.push(layerPath, idx, fid, JSON.stringify(props), geomJson);
          } else {
            rows.push(`($${p++}, $${p++}, $${p++}, $${p++}::jsonb, $${p++}::jsonb)`);
            values.push(layerPath, idx, fid, JSON.stringify(props), geomJson);
          }
        }
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
  });

  const n = await getPool().query(
    `SELECT feature_count FROM gis_vector_layers WHERE layer_path = $1`,
    [layerPath]
  );
  console.log(`Reseeded ${layerPath}: ${n.rows[0]?.feature_count} features (mode=${mode})`);
  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
