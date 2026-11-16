/**
 * Portable GIS vector catalog — FeatureCollections stored in Postgres/PostGIS.
 * Runtime URLs stay /geo/...; modules do not change.
 */
import type pg from 'pg';
import { hasPostgis } from '../roads/db';

export type CatalogStorageMode = 'postgis' | 'jsonb';

export async function ensureGisCatalogSchema(
  client: pg.PoolClient
): Promise<{ mode: CatalogStorageMode }> {
  const usePostgis = await hasPostgis(client);

  await client.query(`
    CREATE TABLE IF NOT EXISTS gis_vector_layers (
      layer_path text PRIMARY KEY,
      feature_count integer NOT NULL DEFAULT 0,
      source_bytes integer,
      seeded_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS gis_vector_documents (
      doc_path text PRIMARY KEY,
      content jsonb NOT NULL,
      seeded_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Old jsonb table cannot host PostGIS geom (and vice versa) — recreate when mismatched.
  const cols = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gis_vector_features'
  `);
  const names = new Set(cols.rows.map((r) => String(r.column_name)));
  if (names.size > 0) {
    const wrongForPostgis = usePostgis && !names.has('geom');
    const wrongForJsonb = !usePostgis && names.has('geom');
    if (wrongForPostgis || wrongForJsonb) {
      await client.query('DROP TABLE IF EXISTS gis_vector_features CASCADE');
      // Clear layer rows so empty catalog falls through to disk until reseed.
      await client.query('DELETE FROM gis_vector_layers');
    }
  }

  if (usePostgis) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS gis_vector_features (
        id bigserial PRIMARY KEY,
        layer_path text NOT NULL REFERENCES gis_vector_layers(layer_path) ON DELETE CASCADE,
        feature_index integer NOT NULL,
        feature_id text,
        properties jsonb NOT NULL DEFAULT '{}'::jsonb,
        geom geometry(Geometry, 4326),
        geom_json jsonb
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS gis_vector_features_layer_idx
      ON gis_vector_features (layer_path)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS gis_vector_features_geom_idx
      ON gis_vector_features USING GIST (geom)
    `);
  } else {
    await client.query(`
      CREATE TABLE IF NOT EXISTS gis_vector_features (
        id bigserial PRIMARY KEY,
        layer_path text NOT NULL REFERENCES gis_vector_layers(layer_path) ON DELETE CASCADE,
        feature_index integer NOT NULL,
        feature_id text,
        properties jsonb NOT NULL DEFAULT '{}'::jsonb,
        geom_json jsonb NOT NULL
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS gis_vector_features_layer_idx
      ON gis_vector_features (layer_path)
    `);
  }

  return { mode: usePostgis ? 'postgis' : 'jsonb' };
}
