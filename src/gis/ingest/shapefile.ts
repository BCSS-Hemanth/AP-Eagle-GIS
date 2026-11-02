/**
 * QGIS analog: QgsOgrProvider (formerly qgsshapefileprovider.cpp).
 * Reads ESRI Shapefile + DBF + PRJ without GDAL, then reprojects to EPSG:4326.
 */
import { parsePrjWkt } from './crs';
import { asFeature, emptyCollection } from './geometry';

const SHAPE_NULL = 0;
const SHAPE_POINT = 1;
const SHAPE_POLYLINE = 3;
const SHAPE_POLYGON = 5;
const SHAPE_MULTIPOINT = 8;
const SHAPE_POINTZ = 11;
const SHAPE_POLYLINEZ = 13;
const SHAPE_POLYGONZ = 15;
const SHAPE_MULTIPOINTZ = 18;
const SHAPE_POINTM = 21;
const SHAPE_POLYLINEM = 23;
const SHAPE_POLYGONM = 25;

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readCString(bytes: Uint8Array, offset: number, length: number): string {
  let end = offset;
  const last = Math.min(bytes.length, offset + length);
  while (end < last && bytes[end] !== 0) end += 1;
  return new TextDecoder('latin1').decode(bytes.subarray(offset, end)).trim();
}

export function parseDbf(bytes: Uint8Array): Record<string, unknown>[] {
  if (bytes.length < 32) return [];
  const view = viewOf(bytes);
  const recordCount = view.getInt32(4, true);
  const headerLen = view.getUint16(8, true);
  const recordLen = view.getUint16(10, true);
  const fields: Array<{ name: string; type: string; length: number; decimal: number }> = [];
  let cursor = 32;
  while (cursor + 32 <= headerLen && bytes[cursor] !== 0x0d) {
    const name = readCString(bytes, cursor, 11);
    const type = String.fromCharCode(bytes[cursor + 11] ?? 67);
    const length = bytes[cursor + 16] ?? 0;
    const decimal = bytes[cursor + 17] ?? 0;
    if (name) fields.push({ name, type, length, decimal });
    cursor += 32;
  }
  const rows: Record<string, unknown>[] = [];
  let offset = headerLen;
  for (let i = 0; i < recordCount && offset + recordLen <= bytes.length; i += 1) {
    const deleted = bytes[offset] === 0x2a;
    let fieldOffset = offset + 1;
    if (!deleted) {
      const row: Record<string, unknown> = {};
      for (const field of fields) {
        const raw = new TextDecoder('latin1').decode(bytes.subarray(fieldOffset, fieldOffset + field.length)).trim();
        if (field.type === 'N' || field.type === 'F') {
          const num = Number(raw);
          row[field.name] = raw === '' || Number.isNaN(num) ? null : num;
        } else if (field.type === 'L') {
          row[field.name] = /^[ty1]/i.test(raw);
        } else {
          row[field.name] = raw;
        }
        fieldOffset += field.length;
      }
      rows.push(row);
    }
    offset += recordLen;
  }
  return rows;
}

function readPoint(view: DataView, offset: number): GeoJSON.Position {
  return [view.getFloat64(offset, true), view.getFloat64(offset + 8, true)];
}

function readParts(view: DataView, start: number): { parts: number[]; points: GeoJSON.Position[]; next: number } {
  const numParts = view.getInt32(start + 32, true);
  const numPoints = view.getInt32(start + 36, true);
  const parts: number[] = [];
  let offset = start + 40;
  for (let i = 0; i < numParts; i += 1) {
    parts.push(view.getInt32(offset, true));
    offset += 4;
  }
  const points: GeoJSON.Position[] = [];
  for (let i = 0; i < numPoints; i += 1) {
    points.push(readPoint(view, offset));
    offset += 16;
  }
  return { parts, points, next: offset };
}

function lineFromParts(parts: number[], points: GeoJSON.Position[]): GeoJSON.Geometry {
  const rings = parts.map((start, idx) => {
    const end = idx + 1 < parts.length ? parts[idx + 1] : points.length;
    return points.slice(start, end);
  });
  if (rings.length === 1) return { type: 'LineString', coordinates: rings[0] };
  return { type: 'MultiLineString', coordinates: rings };
}

function polygonFromParts(parts: number[], points: GeoJSON.Position[]): GeoJSON.Geometry {
  const rings = parts.map((start, idx) => {
    const end = idx + 1 < parts.length ? parts[idx + 1] : points.length;
    const ring = points.slice(start, end);
    if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
      ring.push(ring[0]);
    }
    return ring;
  });
  if (rings.length === 1) return { type: 'Polygon', coordinates: rings };
  return { type: 'MultiPolygon', coordinates: rings.map((ring) => [ring]) };
}

function parseRecord(view: DataView, offset: number, contentLen: number): GeoJSON.Geometry | null {
  if (contentLen < 4) return null;
  const type = view.getInt32(offset, true);
  if (type === SHAPE_NULL) return null;
  if (type === SHAPE_POINT || type === SHAPE_POINTZ || type === SHAPE_POINTM) {
    return { type: 'Point', coordinates: readPoint(view, offset + 4) };
  }
  if (type === SHAPE_MULTIPOINT || type === SHAPE_MULTIPOINTZ) {
    const n = view.getInt32(offset + 36, true);
    const coords: GeoJSON.Position[] = [];
    let cursor = offset + 40;
    for (let i = 0; i < n; i += 1) {
      coords.push(readPoint(view, cursor));
      cursor += 16;
    }
    return { type: 'MultiPoint', coordinates: coords };
  }
  if (
    type === SHAPE_POLYLINE ||
    type === SHAPE_POLYLINEZ ||
    type === SHAPE_POLYLINEM
  ) {
    const { parts, points } = readParts(view, offset);
    return lineFromParts(parts, points);
  }
  if (type === SHAPE_POLYGON || type === SHAPE_POLYGONZ || type === SHAPE_POLYGONM) {
    const { parts, points } = readParts(view, offset);
    return polygonFromParts(parts, points);
  }
  return null;
}

export function parseShapefile(
  shp: Uint8Array,
  dbf?: Uint8Array,
  prj?: string
): { collection: GeoJSON.FeatureCollection; sourceCrs: string } {
  if (shp.length < 100) throw new Error('Shapefile header is truncated');
  const view = viewOf(shp);
  const code = view.getInt32(0, false);
  if (code !== 9994) throw new Error('Not an ESRI Shapefile (file code 9994 expected)');
  const attrs = dbf ? parseDbf(dbf) : [];
  const features: GeoJSON.Feature[] = [];
  let offset = 100;
  let index = 0;
  while (offset + 8 <= shp.length) {
    const contentLen = view.getInt32(offset + 4, false) * 2;
    offset += 8;
    if (contentLen <= 0 || offset + contentLen > shp.length) break;
    const geometry = parseRecord(view, offset, contentLen);
    if (geometry) {
      features.push(asFeature(geometry, attrs[index] ?? {}, index + 1));
    }
    offset += contentLen;
    index += 1;
  }
  return {
    collection: features.length ? { type: 'FeatureCollection', features } : emptyCollection(),
    sourceCrs: prj ? parsePrjWkt(prj) : 'EPSG:4326',
  };
}

/** Test helper: write a point shapefile (WGS84) without GDAL. */
export function writePointShapefile(
  points: Array<{ lon: number; lat: number; name?: string }>
): { shp: Uint8Array; dbf: Uint8Array; prj: string } {
  const recCount = points.length;
  const shpLen = 100 + recCount * (8 + 20);
  const shp = new Uint8Array(shpLen);
  const view = viewOf(shp);
  view.setInt32(0, 9994, false);
  view.setInt32(24, shpLen / 2, false);
  view.setInt32(28, 1000, true);
  view.setInt32(32, 1, true);
  let xmin = Infinity;
  let ymin = Infinity;
  let xmax = -Infinity;
  let ymax = -Infinity;
  points.forEach((p) => {
    xmin = Math.min(xmin, p.lon);
    xmax = Math.max(xmax, p.lon);
    ymin = Math.min(ymin, p.lat);
    ymax = Math.max(ymax, p.lat);
  });
  view.setFloat64(36, xmin, true);
  view.setFloat64(44, ymin, true);
  view.setFloat64(52, xmax, true);
  view.setFloat64(60, ymax, true);
  let offset = 100;
  points.forEach((p, i) => {
    view.setInt32(offset, i + 1, false);
    view.setInt32(offset + 4, 10, false);
    view.setInt32(offset + 8, 1, true);
    view.setFloat64(offset + 12, p.lon, true);
    view.setFloat64(offset + 20, p.lat, true);
    offset += 28;
  });

  const nameLen = 32;
  const recordLen = 1 + nameLen;
  const headerLen = 32 + 32 + 1;
  const dbf = new Uint8Array(headerLen + recCount * recordLen);
  const dbfView = viewOf(dbf);
  dbf[0] = 0x03;
  dbfView.setInt32(4, recCount, true);
  dbfView.setUint16(8, headerLen, true);
  dbfView.setUint16(10, recordLen, true);
  const nameBytes = new TextEncoder().encode('NAME');
  dbf.set(nameBytes, 32);
  dbf[32 + 11] = 'C'.charCodeAt(0);
  dbf[32 + 16] = nameLen;
  dbf[32 + 32] = 0x0d;
  points.forEach((p, i) => {
    const recOff = headerLen + i * recordLen;
    dbf[recOff] = 0x20;
    const value = (p.name ?? `pt-${i + 1}`).padEnd(nameLen, ' ').slice(0, nameLen);
    for (let c = 0; c < nameLen; c += 1) dbf[recOff + 1 + c] = value.charCodeAt(c);
  });

  const prj =
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]';
  return { shp, dbf, prj };
}
