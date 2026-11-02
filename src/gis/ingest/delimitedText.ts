/**
 * QGIS analog: QgsDelimitedTextProvider (src/providers/delimitedtext/).
 * Detects lat/lon, X/Y, WKT, or GeoJSON geometry columns — the path GPS / CCTV / ANPR
 * CSVs use in QGIS.
 */
import { toLonLat } from './crs';
import { asFeature, emptyCollection, isValidLonLat } from './geometry';

const LAT_KEYS = ['lat', 'latitude', 'y', 'northing', 'n', 'gps_lat'];
const LON_KEYS = ['lon', 'lng', 'long', 'longitude', 'x', 'easting', 'e', 'gps_lon', 'gps_lng'];
const WKT_KEYS = ['wkt', 'the_geom', 'geom', 'geometry', 'shape', 'wkb_wkt'];
const NAME_KEYS = ['name', 'title', 'station', 'ps_name', 'label', 'device_id', 'camera', 'anpr', 'id'];

function sniffDelimiter(headerLine: string): string {
  const counts = [
    { d: ',', n: (headerLine.match(/,/g) ?? []).length },
    { d: '\t', n: (headerLine.match(/\t/g) ?? []).length },
    { d: ';', n: (headerLine.match(/;/g) ?? []).length },
    { d: '|', n: (headerLine.match(/\|/g) ?? []).length },
  ].sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ',';
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

function keyMatch(header: string[], aliases: string[]): number {
  const lower = header.map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, ''));
  for (const alias of aliases) {
    const idx = lower.indexOf(alias.replace(/[^a-z0-9]+/g, ''));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseWkt(wkt: string): GeoJSON.Geometry | null {
  const text = wkt.trim();
  const typeMatch = text.match(/^(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON)\s*\(/i);
  if (!typeMatch) return null;
  const type = typeMatch[1].toUpperCase();
  const inner = text.slice(text.indexOf('('));
  const nums = [...inner.matchAll(/(-?\d+\.?\d*)/g)].map((m) => Number(m[1]));
  if (nums.length < 2) return null;
  const pairs: GeoJSON.Position[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pairs.push([nums[i], nums[i + 1]]);
  if (type === 'POINT') return { type: 'Point', coordinates: pairs[0] };
  if (type === 'LINESTRING') return { type: 'LineString', coordinates: pairs };
  if (type === 'POLYGON') {
    const ring = pairs[0][0] === pairs[pairs.length - 1][0] && pairs[0][1] === pairs[pairs.length - 1][1]
      ? pairs
      : [...pairs, pairs[0]];
    return { type: 'Polygon', coordinates: [ring] };
  }
  if (type === 'MULTIPOINT') return { type: 'MultiPoint', coordinates: pairs };
  return { type: 'LineString', coordinates: pairs };
}

export function parseDelimitedText(
  text: string,
  sourceCrs = 'EPSG:4326'
): GeoJSON.FeatureCollection {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line) => line.trim());
  if (lines.length < 2) return emptyCollection();
  const delimiter = sniffDelimiter(lines[0]);
  const header = splitCsvLine(lines[0], delimiter);
  const latIdx = keyMatch(header, LAT_KEYS);
  const lonIdx = keyMatch(header, LON_KEYS);
  const wktIdx = keyMatch(header, WKT_KEYS);
  const nameIdx = keyMatch(header, NAME_KEYS);
  const features: GeoJSON.Feature[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i], delimiter);
    const props: Record<string, string | number> = {};
    header.forEach((key, idx) => {
      if (!key) return;
      const value = cols[idx] ?? '';
      const num = Number(value);
      props[key] = value !== '' && Number.isFinite(num) && /^-?\d/.test(value) ? num : value;
    });
    let geometry: GeoJSON.Geometry | null = null;
    if (wktIdx >= 0 && cols[wktIdx]) geometry = parseWkt(cols[wktIdx]);
    if (!geometry && latIdx >= 0 && lonIdx >= 0) {
      let x = Number(cols[lonIdx]);
      let y = Number(cols[latIdx]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (sourceCrs !== 'EPSG:4326') {
        [x, y] = toLonLat(x, y, sourceCrs);
      } else if (Math.abs(x) <= 90 && Math.abs(y) > 90) {
        const swap = x;
        x = y;
        y = swap;
      }
      if (!isValidLonLat(x, y)) continue;
      geometry = { type: 'Point', coordinates: [x, y] };
    }
    if (!geometry) continue;
    const name = nameIdx >= 0 ? String(cols[nameIdx] ?? '') : '';
    features.push(asFeature(geometry, { ...props, ...(name ? { name } : {}) }, i));
  }
  return features.length ? { type: 'FeatureCollection', features } : emptyCollection();
}
