/**
 * Guards against Leaflet SVG crashes when too many road vectors are mounted
 * at India / statewide camera scales (`appendChild` on undefined path root).
 */

import { routeStrokeForProperties } from './roadsRoutingNewLayers';

export const HEAVY_ROAD_MIN_ZOOM = 8;
export const HEAVY_ROAD_MAX_BBOX_SPAN_DEG = 3.5;
/** Soft cap — keep the most useful roads; never blank the whole layer. */
export const HEAVY_ROAD_MAX_FEATURES = 5000;
/** Max vertices kept on a displayed route polyline. */
export const ROUTE_POLYLINE_MAX_POINTS = 600;

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

export function decimateRoutePoints<T extends { lat: number; lon: number }>(
  pts: T[],
  maxPts = ROUTE_POLYLINE_MAX_POINTS
): T[] {
  if (pts.length <= maxPts) return pts;
  const step = Math.ceil(pts.length / maxPts);
  const out = pts.filter((_, i) => i % step === 0);
  const last = pts[pts.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
