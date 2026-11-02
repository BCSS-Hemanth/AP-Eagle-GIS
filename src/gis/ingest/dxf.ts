/**
 * QGIS analog: OGR DXF driver. Reads ASCII DXF POINT / LINE / LWPOLYLINE / POLYLINE.
 * CAD files of station compounds and road centreline traces land here.
 */
import { toLonLat } from './crs';
import { asFeature, emptyCollection } from './geometry';

interface DxfEntity {
  type: string;
  pairs: Array<[number, string]>;
}

function parseEntities(text: string): DxfEntity[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim());
  const entities: DxfEntity[] = [];
  let inEntities = false;
  let current: DxfEntity | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]);
    const value = lines[i + 1] ?? '';
    if (Number.isNaN(code)) continue;
    if (code === 0 && value === 'SECTION') continue;
    if (code === 2 && value === 'ENTITIES') {
      inEntities = true;
      continue;
    }
    if (code === 0 && value === 'ENDSEC' && inEntities) break;
    if (!inEntities && value === 'POINT') inEntities = true;
    if (code === 0) {
      if (current) entities.push(current);
      current = { type: value, pairs: [] };
    } else if (current) {
      current.pairs.push([code, value]);
    }
  }
  if (current) entities.push(current);
  return entities;
}

function groupPairs(pairs: Array<[number, string]>, xCode: number, yCode: number): GeoJSON.Position[] {
  const xs = pairs.filter(([c]) => c === xCode).map(([, v]) => Number(v));
  const ys = pairs.filter(([c]) => c === yCode).map(([, v]) => Number(v));
  const n = Math.min(xs.length, ys.length);
  const out: GeoJSON.Position[] = [];
  for (let i = 0; i < n; i += 1) {
    if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) out.push([xs[i], ys[i]]);
  }
  return out;
}

export function parseDxf(text: string, sourceCrs = 'EPSG:4326'): GeoJSON.FeatureCollection {
  const entities = parseEntities(text);
  const features: GeoJSON.Feature[] = [];
  entities.forEach((entity, idx) => {
    const layer = entity.pairs.find(([c]) => c === 8)?.[1] ?? '0';
    const name = entity.pairs.find(([c]) => c === 1)?.[1] ?? `${entity.type} ${idx + 1}`;
    let geometry: GeoJSON.Geometry | null = null;
    if (entity.type === 'POINT') {
      const pt = groupPairs(entity.pairs, 10, 20)[0];
      if (pt) geometry = { type: 'Point', coordinates: pt };
    } else if (entity.type === 'LINE') {
      const start = groupPairs(entity.pairs, 10, 20)[0];
      const end = groupPairs(entity.pairs, 11, 21)[0];
      if (start && end) geometry = { type: 'LineString', coordinates: [start, end] };
    } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE' || entity.type === 'VERTEX') {
      const pts = groupPairs(entity.pairs, 10, 20);
      const closed = entity.pairs.some(([c, v]) => c === 70 && (Number(v) & 1) === 1);
      if (pts.length >= 2) {
        geometry = closed && pts.length >= 3
          ? { type: 'Polygon', coordinates: [[...pts, pts[0]]] }
          : { type: 'LineString', coordinates: pts };
      }
    }
    if (!geometry) return;
    if (sourceCrs !== 'EPSG:4326' && geometry.type === 'Point') {
      const [lon, lat] = toLonLat(geometry.coordinates[0], geometry.coordinates[1], sourceCrs);
      geometry = { type: 'Point', coordinates: [lon, lat] };
    }
    features.push(asFeature(geometry, { name, layer, dxf: entity.type }, idx + 1));
  });
  return features.length ? { type: 'FeatureCollection', features } : emptyCollection();
}
