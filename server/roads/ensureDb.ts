import pg from 'pg';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';

loadDotenv({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const base = {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
  };

  const admin = new pg.Client({ ...base, database: 'postgres' });
  await admin.connect();
  const r = await admin.query(`SELECT 1 FROM pg_database WHERE datname = 'eagle_gis'`);
  if (!r.rowCount) {
    await admin.query('CREATE DATABASE eagle_gis');
    console.log('created database eagle_gis');
  } else {
    console.log('database eagle_gis already exists');
  }
  await admin.end();

  const db = new pg.Client({ ...base, database: 'eagle_gis' });
  await db.connect();
  try {
    await db.query('CREATE EXTENSION IF NOT EXISTS postgis');
    const v = await db.query('SELECT PostGIS_Version() AS v');
    console.log('PostGIS', v.rows[0].v);
  } catch {
    console.log(
      'PostGIS not installed — roads will use JSONB + bbox mode (GeoJSON API still works; MVT disabled).'
    );
  }
  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
