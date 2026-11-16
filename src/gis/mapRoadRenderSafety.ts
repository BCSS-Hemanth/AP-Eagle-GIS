/**
 * Guards against Leaflet SVG crashes when too many road vectors are mounted
 * at India / statewide camera scales (`appendChild` on undefined path root).
 */

import { routeStrokeForProperties } from './roadsRoutingNewLayers';

export const HEAVY_ROAD_MIN_ZOOM = 8;
export const HEAVY_ROAD_MAX_BBOX_SPAN_DEG = 3.5;
/** Soft cap — keep the most useful roads; never blank the whole layer. */
export const HEAVY_ROAD_MAX_FEATURES = 5000;
/** Max vertices kept on a displayed route polyline (shape-preserving RDP when over). */
export const ROUTE_POLYLINE_MAX_POINTS = 2500;

/** Prefer NH → SH → district → other when capping dense extracts. */
export function prioritizeClassifiedRoadFeatures(
  features: GeoJSON.Feature[],
  maxFeatures: number
): GeoJSON.Feature[] {
  if (features.length <= maxFeatures) return features;
  const rank = (feature: GeoJSON.Feature): number => {
    const stroke = routeStrokeForProperties(feature.properties);
    if (!stroke) return 9;
    if (stroke.label === 'National Highway') return 0;
    if (stroke.label === 'State Highway') return 1;
    if (stroke.label === 'District Road') return 2;
    return 5;
  };
  return [...features].sort((a, b) => rank(a) - rank(b)).slice(0, maxFeatures);
}

export function mapBboxSpanDeg(bounds: {
  west: number;
  south: number;
  east: number;
  north: number;
}): number {
  return Math.max(Math.abs(bounds.east - bounds.west), Math.abs(bounds.north - bounds.south));
}

/** True when the camera is close enough to mount dense road GeoJSON safely. */
export function mapAllowsHeavyRoadVectors(
  zoom: number,
  bounds: { west: number; south: number; east: number; north: number }
): boolean {
  if (!Number.isFinite(zoom) || zoom < HEAVY_ROAD_MIN_ZOOM) return false;
  return mapBboxSpanDeg(bounds) <= HEAVY_ROAD_MAX_BBOX_SPAN_DEG;
}

function ringIntersectsBbox(
  ring: number[][],
  west: number,
  south: number,
  east: number,
  north: number
): boolean {
  for (const c of ring) {
    const lon = c[0];
    const lat = c[1];
    if (lon >= west && lon <= east && lat >= south && lat <= north) return true;
  }
  return false;
}

function geometryIntersectsBbox(
  geometry: GeoJSON.Geometry | null | undefined,
  west: number,
  south: number,
  east: number,
  north: number
): boolean {
  if (!geometry) return false;
  if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates;
    return lon >= west && lon <= east && lat >= south && lat <= north;
  }
  if (geometry.type === 'MultiPoint') {
    return geometry.coordinates.some(
      ([lon, lat]) => lon >= west && lon <= east && lat >= south && lat <= north
    );
  }
  if (geometry.type === 'LineString') {
    return ringIntersectsBbox(geometry.coordinates, west, south, east, north);
  }
  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates.some((line) =>
      ringIntersectsBbox(line, west, south, east, north)
    );
  }
  if (geometry.type === 'Polygon') {
    return ringIntersectsBbox(geometry.coordinates[0] ?? [], west, south, east, north);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) =>
      ringIntersectsBbox(poly[0] ?? [], west, south, east, north)
    );
  }
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.some((g) =>
      geometryIntersectsBbox(g, west, south, east, north)
    );
  }
  return false;
}

/** Keep only features that touch the current map bbox (cheap vertex test). */
export function filterFcToBbox(
  fc: GeoJSON.FeatureCollection | null | undefined,
  bounds: { west: number; south: number; east: number; north: number },
  padRatio = 0.05
): GeoJSON.FeatureCollection {
  if (!fc?.features?.length) {
    return { type: 'FeatureCollection', features: [] };
  }
  const padLon = Math.abs(bounds.east - bounds.west) * padRatio;
  const padLat = Math.abs(bounds.north - bounds.south) * padRatio;
  const west = bounds.west - padLon;
  const south = bounds.south - padLat;
  const east = bounds.east + padLon;
  const north = bounds.north + padLat;
  return {
    type: 'FeatureCollection',
    features: fc.features.filter((f) =>
      geometryIntersectsBbox(f.geometry, west, south, east, north)
    ),
  };
}

/**
 * Viewport-filter then soft-cap. Returns null only when the camera is too wide
 * or nothing intersects the view — never because the layer is merely dense.
 */
export function prepareHeavyRoadFc(
  fc: GeoJSON.FeatureCollection | null | undefined,
  zoom: number,
  bounds: { west: number; south: number; east: number; north: number },
  maxFeatures = HEAVY_ROAD_MAX_FEATURES
): GeoJSON.FeatureCollection | null {
  if (!mapAllowsHeavyRoadVectors(zoom, bounds)) return null;
  const clipped = filterFcToBbox(fc, bounds);
  if (!clipped.features.length) return null;
  return {
    type: 'FeatureCollection',
    features: prioritizeClassifiedRoadFeatures(clipped.features, maxFeatures),
  };
}

/**
 * NH / SH / district only, then soft-cap. No zoom gate — for always-on / corridor
 * fetches that are already spatially scoped.
 */
export function prepareClassifiedRoadFc(
  fc: GeoJSON.FeatureCollection | null | undefined,
  maxFeatures = HEAVY_ROAD_MAX_FEATURES
): GeoJSON.FeatureCollection | null {
  if (!fc?.features?.length) return null;
  const classified = fc.features.filter((feature) =>
    routeStrokeForProperties(feature.properties)
  );
  if (!classified.length) return null;
  return {
    type: 'FeatureCollection',
    features: prioritizeClassifiedRoadFeatures(classified, maxFeatures),
  };
}

/**
 * Full / VSP PostGIS extracts: keep NH/SH/district through-routes only, then soft-cap.
 * Village tracks and footpaths are omitted so the layer stays readable and loadable.
 */
export function preparePostgisFullNetworkFc(
  fc: GeoJSON.FeatureCollection | null | undefined,
  zoom: number,
  bounds: { west: number; south: number; east: number; north: number },
  maxFeatures = HEAVY_ROAD_MAX_FEATURES
): GeoJSON.FeatureCollection | null {
  if (!mapAllowsHeavyRoadVectors(zoom, bounds)) return null;
  if (!fc?.features?.length) return null;
  const classified: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: fc.features.filter((feature) => routeStrokeForProperties(feature.properties)),
  };
  const clipped = filterFcToBbox(classified, bounds);
  return prepareClassifiedRoadFc(clipped, maxFeatures);
}

function perpendicularDistM<T extends { lat: number; lon: number }>(
  p: T,
  a: T,
  b: T
): number {
  const lat0 = ((a.lat + b.lat + p.lat) / 3) * (Math.PI / 180);
  const mx = Math.cos(lat0) * 111320;
  const my = 110540;
  const ax = a.lon * mx;
  const ay = a.lat * my;
  const bx = b.lon * mx;
  const by = b.lat * my;
  const px = p.lon * mx;
  const py = p.lat * my;
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 < 1e-12) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / ab2));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

/** Ramer–Douglas–Peucker; keeps bends so route overlays stay on the road network. */
function rdpKeep<T extends { lat: number; lon: number }>(
  pts: T[],
  epsilonM: number
): T[] {
  if (pts.length <= 2) return pts;
  let maxDist = 0;
  let maxIdx = 0;
  const first = pts[0];
  const last = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicularDistM(pts[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist <= epsilonM) return [first, last];
  const left = rdpKeep(pts.slice(0, maxIdx + 1), epsilonM);
  const right = rdpKeep(pts.slice(maxIdx), epsilonM);
  return left.slice(0, -1).concat(right);
}

/**
 * Cap route vertex count without chord-cutting.
 * Uses RDP so overlays still hug mapped LineStrings (any layer, anywhere on the map).
 */
export function decimateRoutePoints<T extends { lat: number; lon: number }>(
  pts: T[],
  maxPts = ROUTE_POLYLINE_MAX_POINTS
): T[] {
  if (pts.length <= maxPts) return pts;
  // Binary-search epsilon (metres) until under maxPts while keeping shape.
  let lo = 0.5;
  let hi = 200;
  let best = pts;
  for (let iter = 0; iter < 14; iter++) {
    const mid = (lo + hi) / 2;
    const simplified = rdpKeep(pts, mid);
    if (simplified.length > maxPts) lo = mid;
    else {
      best = simplified;
      hi = mid;
    }
  }
  if (best.length <= maxPts) return best;
  // Extreme fallback: still prefer denser uniform sample over aggressive step chords.
  const step = Math.ceil(best.length / maxPts);
  const out = best.filter((_, i) => i % step === 0);
  const last = best[best.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
