import { AP_ENVELOPE } from './types';

export function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

export function asFeature(
  geometry: GeoJSON.Geometry,
  properties: GeoJSON.GeoJsonProperties = {},
  id?: string | number
): GeoJSON.Feature {
  return { type: 'Feature', id, properties: properties ?? {}, geometry };
}

export function featureBbox(geometry: GeoJSON.Geometry | null | undefined): [number, number, number, number] | null {
  if (!geometry) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visit = (pos: GeoJSON.Position) => {
    const [x, y] = pos;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < west) west = x;
    if (x > east) east = x;
    if (y < south) south = y;
    if (y > north) north = y;
  };
  const walk = (geom: GeoJSON.Geometry) => {
    switch (geom.type) {
      case 'Point':
        visit(geom.coordinates);
        break;
      case 'MultiPoint':
      case 'LineString':
        geom.coordinates.forEach(visit);
        break;
      case 'MultiLineString':
      case 'Polygon':
        geom.coordinates.forEach((ring) => ring.forEach(visit));
        break;
      case 'MultiPolygon':
        geom.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach(visit)));
        break;
      case 'GeometryCollection':
        geom.geometries.forEach(walk);
        break;
      default:
        break;
    }
  };
  walk(geometry);
  if (!Number.isFinite(west)) return null;
  return [west, south, east, north];
}

export function collectionBbox(collection: GeoJSON.FeatureCollection): [number, number, number, number] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const feature of collection.features) {
    const box = featureBbox(feature.geometry);
    if (!box) continue;
    west = Math.min(west, box[0]);
    south = Math.min(south, box[1]);
    east = Math.max(east, box[2]);
    north = Math.max(north, box[3]);
  }
  if (!Number.isFinite(west)) return null;
  return [west, south, east, north];
}

export function geometryTypesOf(collection: GeoJSON.FeatureCollection): string[] {
  return [...new Set(collection.features.map((f) => f.geometry?.type).filter(Boolean) as string[])];
}

export function attributeKeys(collection: GeoJSON.FeatureCollection, limit = 24): string[] {
  const keys = new Set<string>();
  for (const feature of collection.features) {
    if (!feature.properties) continue;
    for (const key of Object.keys(feature.properties)) {
      keys.add(key);
      if (keys.size >= limit) return [...keys];
    }
  }
  return [...keys];
}

export function isValidLonLat(lon: number, lat: number): boolean {
  return Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
}

export function envelopeWarning(bbox: [number, number, number, number] | null): string | null {
  if (!bbox) return 'No spatial extent could be computed';
  const [west, south, east, north] = bbox;
  const overlaps =
    east >= AP_ENVELOPE.west &&
    west <= AP_ENVELOPE.east &&
    north >= AP_ENVELOPE.south &&
    south <= AP_ENVELOPE.north;
  if (overlaps) return null;
  return `Extent ${west.toFixed(3)},${south.toFixed(3)} → ${east.toFixed(3)},${north.toFixed(3)} is outside the Andhra Pradesh envelope`;
}

export function dropInvalidFeatures(collection: GeoJSON.FeatureCollection): {
  collection: GeoJSON.FeatureCollection;
  dropped: number;
} {
  const features = collection.features.filter((feature) => {
    if (!feature.geometry) return false;
    const box = featureBbox(feature.geometry);
    if (!box) return false;
    return isValidLonLat(box[0], box[1]) && isValidLonLat(box[2], box[3]);
  });
  return {
    collection: { type: 'FeatureCollection', features },
    dropped: collection.features.length - features.length,
  };
}

let ingestSeq = 0;
export function nextIngestId(prefix = 'ing'): string {
  ingestSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${ingestSeq}`;
}

export function fileStem(name: string): string {
  return name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
}

export function fileExt(name: string): string {
  const base = name.replace(/^.*[\\/]/, '').toLowerCase();
  const parts = base.split('.');
  if (parts.length < 2) return '';
  if (base.endsWith('.geojson')) return 'geojson';
  if (base.endsWith('.shp.xml')) return 'shp.xml';
  return parts[parts.length - 1] ?? '';
}

export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
}

export function looksLikeUtf16(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));
}
