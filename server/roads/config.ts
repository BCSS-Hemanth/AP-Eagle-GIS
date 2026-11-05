import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: path.resolve(process.cwd(), '.env') });

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v == null || v === '') {
    throw new Error(`Missing env ${name}. Copy .env.example → .env and fill values.`);
  }
  return v;
}

export function roadsDbConfig() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return { connectionString: url };

  return {
    host: required('PGHOST', 'localhost'),
    port: Number(process.env.PGPORT ?? 5432),
    database: required('PGDATABASE', 'eagle_gis'),
    user: required('PGUSER', 'postgres'),
    password: process.env.PGPASSWORD ?? '',
  };
}

export function gisSourceRoot(): string {
  return required('GIS_SOURCE_ROOT', 'c:\\AP-GIS\\GIS-Source');
}

export function apRoadsShpPath(): string {
  return path.join(gisSourceRoot(), 'Admin', 'Admin', 'ap_road network', 'ap_roads.shp');
}

export function vspRoadsShpPath(): string {
  return path.join(gisSourceRoot(), 'ops_lyrs', 'ops_lyrs', 'vsp road', 'VSP.shp');
}

export function roadsApiPort(): number {
  return Number(process.env.ROADS_API_PORT ?? 8787);
}

export function roadsApiHost(): string {
  return process.env.ROADS_API_HOST ?? '127.0.0.1';
}

export function geojsonFeatureLimit(): number {
  return Number(process.env.ROADS_GEOJSON_FEATURE_LIMIT ?? 25000);
}

/** APSAC / SOI Lambert for OPS VSP.shp */
export const VSP_LCC_PROJ4 =
  '+proj=lcc +lat_1=13.75 +lat_2=18.75 +lat_0=16.25543305555556 +lon_0=80.875 +x_0=1000000 +y_0=1000000 +datum=WGS84 +units=m +no_defs';
