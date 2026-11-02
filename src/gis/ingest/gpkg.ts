/**
 * QGIS analog: OGR GeoPackage driver (qgsogrprovidermetadata.cpp special-cases .gpkg).
 * SQLite is loaded via sql.js — the browser stand-in for the libsqlite QGIS links.
 */
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { emptyCollection } from './geometry';

let sqlPromise: Promise<SqlJsStatic> | null = null;

async function loadSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file: string) => {
        try {
          return new URL(`../../node_modules/sql.js/dist/${file}`, import.meta.url).href;
        } catch {
          return `https://sql.js.org/dist/${file}`;
        }
      },
    });
  }
  return sqlPromise;
}

function readU32(view: DataView, offset: number, le: boolean): number {
  return view.getUint32(offset, le);
}

/**
 * GeoPackage Binary header → WKB, per OGC 12-128r15 §2.1.3.
 */
export function parseGpkgGeometry(bytes: Uint8Array): GeoJSON.Geometry | null {
  if (bytes.length < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 0x47 || bytes[1] !== 0x50) {
    return parseWkb(bytes);
  }
  const flags = bytes[3] ?? 0;
  const envelope = (flags >> 1) & 7;
  const le = (flags & 1) === 1;
  let offset = 8;
  const envelopeSizes = [0, 32, 48, 48, 64, 32, 48, 64];
  offset += envelopeSizes[envelope] ?? 0;
  return parseWkb(bytes.subarray(offset), le);
}

function parseWkb(bytes: Uint8Array, littlePref = true): GeoJSON.Geometry | null {
  if (bytes.length < 5) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const le = bytes[0] === 1 ? true : bytes[0] === 0 ? false : littlePref;
  const type = readU32(view, 1, le) % 1000;
  let offset = 5;
  const readPoint = (): GeoJSON.Position => {
    const x = view.getFloat64(offset, le);
    const y = view.getFloat64(offset + 8, le);
    offset += 16;
    return [x, y];
  };
  const readLine = (): GeoJSON.Position[] => {
    const n = readU32(view, offset, le);
    offset += 4;
    const pts: GeoJSON.Position[] = [];
    for (let i = 0; i < n; i += 1) pts.push(readPoint());
    return pts;
  };
  const readPolygon = (): GeoJSON.Position[][] => {
    const n = readU32(view, offset, le);
    offset += 4;
    const rings: GeoJSON.Position[][] = [];
    for (let i = 0; i < n; i += 1) rings.push(readLine());
    return rings;
  };
  if (type === 1) return { type: 'Point', coordinates: readPoint() };
  if (type === 2) return { type: 'LineString', coordinates: readLine() };
  if (type === 3) return { type: 'Polygon', coordinates: readPolygon() };
  if (type === 4) {
    const n = readU32(view, offset, le);
    offset += 4;
    const pts: GeoJSON.Position[] = [];
    for (let i = 0; i < n; i += 1) {
      offset += 5;
      pts.push(readPoint());
    }
    return { type: 'MultiPoint', coordinates: pts };
  }
  if (type === 5) {
    const n = readU32(view, offset, le);
    offset += 4;
    const lines: GeoJSON.Position[][] = [];
    for (let i = 0; i < n; i += 1) {
      offset += 5;
      lines.push(readLine());
    }
    return { type: 'MultiLineString', coordinates: lines };
  }
  if (type === 6) {
    const n = readU32(view, offset, le);
    offset += 4;
    const polys: GeoJSON.Position[][][] = [];
    for (let i = 0; i < n; i += 1) {
      offset += 5;
      polys.push(readPolygon());
    }
    return { type: 'MultiPolygon', coordinates: polys };
  }
  return null;
}

export async function parseGeoPackage(bytes: Uint8Array): Promise<{
  layers: Array<{ name: string; collection: GeoJSON.FeatureCollection; srs: string }>;
}> {
  const SQL = await loadSql();
  const db = new SQL.Database(bytes);
  try {
    const tables = db.exec(
      "SELECT table_name, srs_id FROM gpkg_contents WHERE data_type = 'features'"
    );
    const names = tables[0]?.values ?? [];
    const layers: Array<{ name: string; collection: GeoJSON.FeatureCollection; srs: string }> = [];
    for (const row of names) {
      const table = String(row[0]);
      const srs = `EPSG:${row[1] ?? 4326}`;
      const geomCols = db.exec(
        `SELECT column_name FROM gpkg_geometry_columns WHERE table_name = '${table.replace(/'/g, "''")}'`
      );
      const geomCol = String(geomCols[0]?.values?.[0]?.[0] ?? 'geom');
      const result = db.exec(`SELECT * FROM "${table.replace(/"/g, '""')}"`);
      if (!result[0]) {
        layers.push({ name: table, collection: emptyCollection(), srs });
        continue;
      }
      const cols = result[0].columns;
      const geomIdx = cols.findIndex((c) => c.toLowerCase() === geomCol.toLowerCase());
      const features: GeoJSON.Feature[] = [];
      result[0].values.forEach((values, idx) => {
        const blob = values[geomIdx];
        const geomBytes = blob instanceof Uint8Array ? blob : null;
        const geometry = geomBytes ? parseGpkgGeometry(geomBytes) : null;
        if (!geometry) return;
        const properties: Record<string, unknown> = {};
        cols.forEach((col, i) => {
          if (i === geomIdx) return;
          const value = values[i];
          properties[col] = value instanceof Uint8Array ? `[blob ${value.length}]` : value;
        });
        features.push({ type: 'Feature', id: idx + 1, properties, geometry });
      });
      layers.push({
        name: table,
        collection: { type: 'FeatureCollection', features },
        srs,
      });
    }
    return { layers };
  } finally {
    db.close();
  }
}

export async function parseMbTilesMetadata(bytes: Uint8Array): Promise<{
  name: string;
  bounds: [number, number, number, number] | null;
  format: string;
}> {
  const SQL = await loadSql();
  const db = new SQL.Database(bytes);
  try {
    const result = db.exec('SELECT name, value FROM metadata');
    const meta: Record<string, string> = {};
    for (const row of result[0]?.values ?? []) {
      meta[String(row[0])] = String(row[1] ?? '');
    }
    const boundParts = (meta.bounds ?? '').split(',').map(Number);
    return {
      name: meta.name || 'MBTiles',
      format: meta.format || 'png',
      bounds:
        boundParts.length === 4 && boundParts.every((n) => Number.isFinite(n))
          ? [boundParts[0], boundParts[1], boundParts[2], boundParts[3]]
          : null,
    };
  } finally {
    db.close();
  }
}
