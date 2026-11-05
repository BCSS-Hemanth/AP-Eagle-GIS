import type { GisLayer } from '../types/gis';
import { catalogModuleForLayer } from './catalogWorkspaces';
import type { DashboardLayerConfig, DashboardLayerEntry, JsonStorage } from './dashboardLayers';
import {
  mergeEnabledLayersIntoRoutingConfig,
  routingLayersFromConfig,
  countRoutingLayers,
  type RoadsRoutingLayerConfig,
} from './roadsRoutingLayers';

/** Independent from Roads Routing (`ap-eagle.roads-routing-layers.v1`). */
export const ROADS_ROUTING_NEW_LAYER_STORAGE_KEY = 'ap-eagle.roads-routing-new-layers.v1';

export type RoadsRoutingNewLayerConfig = RoadsRoutingLayerConfig;

/** Road geometries visualised in Roads Routing New (no pathfinding). */
export const ROADS_ROUTING_NEW_VISUAL_LAYER_IDS = [
  'lyr-highways',
  'lyr-ap-roads-full',
  'lyr-ops-vsp-roads',
  'lyr-ap-roads-major',
  'lyr-ops-main-roads',
  'lyr-ops-internal-roads',
  'lyr-forest-trails',
] as const;

/** Fallback swatch when a feature has no road class. */
export const ROADS_ROUTING_NEW_LAYER_COLORS: Record<string, string> = {
  'lyr-highways': '#dc2626',
  'lyr-ap-roads-full': '#7c3aed',
  'lyr-ops-vsp-roads': '#7c3aed',
  'lyr-ap-roads-major': '#16a34a',
  'lyr-ops-main-roads': '#ea580c',
  'lyr-ops-internal-roads': '#2563eb',
  'lyr-forest-trails': '#ca8a04',
};

/** Classified through-routes. Village roads, tracks, and footpaths are not drawn. */
export const ROAD_ROUTE_CLASS_STROKES = {
  national: { label: 'National Highway', color: '#dc2626', weight: 3.6 },
  state: { label: 'State Highway', color: '#16a34a', weight: 2.8 },
  district: { label: 'District Road', color: '#7c3aed', weight: 2.2 },
} as const;

export type RoadRouteStroke = { color: string; weight: number };

const CLASSIFIED_NETWORK_LAYER_IDS = new Set([
  'lyr-ap-roads-full',
  'lyr-ops-vsp-roads',
  'lyr-ap-roads-major',
  'lyr-highways',
]);

export function roadSubtype(properties: GeoJSON.GeoJsonProperties): string {
  const props = (properties ?? {}) as Record<string, unknown>;
  const raw = props.rd_sub_typ ?? props.RD_SUB_TYP ?? '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Stroke for a through-route, or null for village roads, tracks, and footpaths. */
export function routeStrokeForProperties(
  properties: GeoJSON.GeoJsonProperties
): (RoadRouteStroke & { label: string }) | null {
  const sub = roadSubtype(properties);
  if (!sub) return null;
  if (sub.includes('national highway') || sub === 'nh') return { ...ROAD_ROUTE_CLASS_STROKES.national };
  if (sub.includes('state highway') || sub === 'sh') return { ...ROAD_ROUTE_CLASS_STROKES.state };
  if (sub.includes('district road') || sub.includes('major district') || sub === 'mdr') {
    return { ...ROAD_ROUTE_CLASS_STROKES.district };
  }
  return null;
}

/**
 * Full and VSP extracts include every cart track. Keep NH, SH, and district roads
 * and draw the whole segment so the line reads as a route.
 * Other layers stay radius-clipped.
 */
export function displayRoadsForLayer(
  layerId: string,
  fc: GeoJSON.FeatureCollection
): { fc: GeoJSON.FeatureCollection; clip: boolean } {
  if (layerId === 'lyr-ap-roads-full' || layerId === 'lyr-ops-vsp-roads') {
    return {
      fc: {
        type: 'FeatureCollection',
        features: fc.features.filter((feature) => routeStrokeForProperties(feature.properties)),
      },
      clip: false,
    };
  }
  return { fc, clip: !CLASSIFIED_NETWORK_LAYER_IDS.has(layerId) };
}

export function routingNewLegendEntries(
  layerId: string,
  layerName: string
): Array<{ label: string; color: string }> {
  if (layerId === 'lyr-highways') {
    return [{ label: ROAD_ROUTE_CLASS_STROKES.national.label, color: '#c2410c' }];
  }
  if (layerId === 'lyr-ap-roads-full' || layerId === 'lyr-ops-vsp-roads' || layerId === 'lyr-ap-roads-major') {
    return [
      { label: ROAD_ROUTE_CLASS_STROKES.national.label, color: ROAD_ROUTE_CLASS_STROKES.national.color },
      { label: ROAD_ROUTE_CLASS_STROKES.state.label, color: ROAD_ROUTE_CLASS_STROKES.state.color },
      { label: ROAD_ROUTE_CLASS_STROKES.district.label, color: ROAD_ROUTE_CLASS_STROKES.district.color },
    ];
  }
  return [{ label: layerName, color: colorForRoutingNewLayer(layerId) }];
}

export function isRoadsRoutingNewVisualLayer(id: string): boolean {
  return (ROADS_ROUTING_NEW_VISUAL_LAYER_IDS as readonly string[]).includes(id);
}

/** Administrative, Operational, or Road Network catalog layer. */
export function isRoadsRoutingNewCatalogLayer(layer: GisLayer): boolean {
  const moduleId = catalogModuleForLayer(layer);
  return (
    moduleId === 'administrative-layers' ||
    moduleId === 'operational-layers' ||
    moduleId === 'road-network-layers'
  );
}

/** Drawn statewide when the Eye is on (same as Roads Routing map flags). */
const ROUTING_NEW_MAP_FLAG_LAYER_IDS = new Set([
  'lyr-highways',
  'lyr-forest-trails',
  'lyr-ops-main-roads',
  'lyr-ops-internal-roads',
  'lyr-ap-roads-major',
]);

/**
 * Road layers matched to each point's radius by Display Road Networks.
 * Map-flag layers are drawn when the Eye is on; they are not re-fetched here.
 */
export function usesRoutingNewRadiusMatch(id: string): boolean {
  return isRoadsRoutingNewVisualLayer(id) && !ROUTING_NEW_MAP_FLAG_LAYER_IDS.has(id);
}

export function colorForRoutingNewLayer(id: string): string {
  return ROADS_ROUTING_NEW_LAYER_COLORS[id] ?? '#64748b';
}

/**
 * Merge enabled catalog layers into Roads Routing New.
 * Only visual road-network layer ids are kept (ops points etc. are ignored).
 */
export function mergeEnabledLayersIntoRoutingNewConfig(
  current: RoadsRoutingNewLayerConfig,
  layers: GisLayer[],
  groupFilter: Array<GisLayer['groupId']> | null
): RoadsRoutingNewLayerConfig {
  const roadOnly = layers.filter((l) => isRoadsRoutingNewVisualLayer(l.id));
  return mergeEnabledLayersIntoRoutingConfig(current, roadOnly, groupFilter);
}

export function routingNewLayersFromConfig(
  allLayers: GisLayer[],
  config: RoadsRoutingNewLayerConfig
): GisLayer[] {
  return routingLayersFromConfig(allLayers, config);
}

export function countRoutingNewLayers(config: RoadsRoutingNewLayerConfig): number {
  return countRoutingLayers(config);
}

export function persistRoadsRoutingNewLayerConfig(
  config: RoadsRoutingNewLayerConfig,
  storage: JsonStorage | null = browserStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(ROADS_ROUTING_NEW_LAYER_STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function loadRoadsRoutingNewLayerConfig(
  storage: JsonStorage | null = browserStorage()
): RoadsRoutingNewLayerConfig | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ROADS_ROUTING_NEW_LAYER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: RoadsRoutingNewLayerConfig = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const row = value as { enabled?: unknown; opacity?: unknown };
      if (typeof row.enabled !== 'boolean') continue;
      out[id] = {
        enabled: row.enabled,
        opacity:
          typeof row.opacity === 'number'
            ? Math.min(100, Math.max(15, Math.round(row.opacity)))
            : 100,
      } as DashboardLayerEntry;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

export type LonLat = { lon: number; lat: number };

export type AoiBbox = {
  west: number;
  south: number;
  east: number;
  north: number;
  padDeg: number;
};

export function bufferPadDeg(bufferKm: number): number {
  return Math.max(0.02, bufferKm / 111);
}

/** Union bbox of 1..N POI points plus buffer (km → approx. degrees). */
export function aoiBboxFromPoiPoints(points: LonLat[], bufferKm: number): AoiBbox {
  if (!points.length) {
    throw new Error('At least one POI is required for an AOI bbox');
  }
  const padDeg = bufferPadDeg(bufferKm);
  let west = points[0].lon;
  let east = points[0].lon;
  let south = points[0].lat;
  let north = points[0].lat;
  for (const p of points) {
    west = Math.min(west, p.lon);
    east = Math.max(east, p.lon);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  return {
    west: west - padDeg,
    east: east + padDeg,
    south: south - padDeg,
    north: north + padDeg,
    padDeg,
  };
}

/** @deprecated Prefer aoiBboxFromPoiPoints — kept for two-point call sites/tests. */
export function aoiBboxFromPoints(
  a: LonLat,
  b: LonLat,
  bufferKm: number
): AoiBbox {
  return aoiBboxFromPoiPoints([a, b], bufferKm);
}

export function midViewForAoiPoints(
  points: LonLat[],
  bufferKm: number
): { lat: number; lon: number; zoom: number } {
  const { west, south, east, north } = aoiBboxFromPoiPoints(points, bufferKm);
  const span = Math.max(east - west, north - south);
  let zoom = 11;
  if (span > 3) zoom = 7;
  else if (span > 1.5) zoom = 8;
  else if (span > 0.8) zoom = 9;
  else if (span > 0.4) zoom = 10;
  else if (span > 0.2) zoom = 11;
  else zoom = 12;
  return {
    lat: (south + north) / 2,
    lon: (west + east) / 2,
    zoom,
  };
}

export function midViewForAoi(
  a: LonLat,
  b: LonLat,
  bufferKm: number
): { lat: number; lon: number; zoom: number } {
  return midViewForAoiPoints([a, b], bufferKm);
}

function lineCoords(geometry: GeoJSON.Geometry | null): number[][][] {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates as number[][]];
  if (geometry.type === 'MultiLineString') return geometry.coordinates as number[][][];
  return [];
}

/** True if any vertex of a line feature falls inside an axis-aligned buffer box. */
export function featureIntersectsBbox(
  feature: GeoJSON.Feature,
  bbox: Pick<AoiBbox, 'west' | 'south' | 'east' | 'north'>
): boolean {
  const lines = lineCoords(feature.geometry);
  for (const line of lines) {
    for (const c of line) {
      if (c[0] >= bbox.west && c[0] <= bbox.east && c[1] >= bbox.south && c[1] <= bbox.north) {
        return true;
      }
    }
  }
  return false;
}

export function filterFcByBbox(
  fc: GeoJSON.FeatureCollection,
  bbox: Pick<AoiBbox, 'west' | 'south' | 'east' | 'north'>
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.filter((f) => featureIntersectsBbox(f, bbox)),
  };
}

/**
 * Identity for overlapping copies of the same segment.
 * Road name is a label (many KMZ parts are all called "Route"), not an id.
 */
export function roadFeatureDedupeKey(feature: GeoJSON.Feature): string {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const idHint = props.id ?? props.gid ?? props.FID ?? props.OBJECTID ?? '';
  if (idHint !== '' && idHint != null) return `id:${String(idHint)}`;
  const lines = lineCoords(feature.geometry);
  if (!lines.length) return `empty:${Math.random()}`;
  const first = lines[0][0];
  const last = lines[lines.length - 1][lines[lines.length - 1].length - 1];
  const n = lines.reduce((s, line) => s + line.length, 0);
  return `g:${first?.[0]?.toFixed(5)},${first?.[1]?.toFixed(5)}:${last?.[0]?.toFixed(5)},${last?.[1]?.toFixed(5)}:${n}`;
}

export function dedupeRoadFeatures(
  features: GeoJSON.Feature[]
): GeoJSON.Feature[] {
  const seen = new Set<string>();
  const out: GeoJSON.Feature[] = [];
  for (const f of features) {
    const key = roadFeatureDedupeKey(f);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export type PoiRef = LonLat & { id: string; label: string };

const KM_PER_DEG_LAT = 110.574;

function kmPerDegLon(lat: number): number {
  return 111.32 * Math.cos((lat * Math.PI) / 180);
}

/** Query box that contains a circle of `bufferKm` around one point. */
export function radiusQueryBbox(
  point: LonLat,
  bufferKm: number
): Pick<AoiBbox, 'west' | 'south' | 'east' | 'north'> {
  const latPad = bufferKm / KM_PER_DEG_LAT;
  const lonPad = bufferKm / kmPerDegLon(point.lat);
  return {
    west: point.lon - lonPad,
    east: point.lon + lonPad,
    south: point.lat - latPad,
    north: point.lat + latPad,
  };
}

type LocalCircle = { x: number; y: number; r: number };

function toLocal(lon: number, lat: number, lat0: number): { x: number; y: number } {
  return { x: lon * kmPerDegLon(lat0), y: lat * KM_PER_DEG_LAT };
}

function fromLocal(x: number, y: number, lat0: number): [number, number] {
  return [x / kmPerDegLon(lat0), y / KM_PER_DEG_LAT];
}

function mergeIntervals(spans: Array<[number, number]>): Array<[number, number]> {
  if (!spans.length) return [];
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const next = sorted[i];
    if (next[0] <= prev[1] + 1e-6) prev[1] = Math.max(prev[1], next[1]);
    else out.push([next[0], next[1]]);
  }
  return out;
}

/** Portions of segment A–B that lie inside any circle, as t in [0, 1]. */
function segmentInsideCircles(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  circles: LocalCircle[]
): Array<[number, number]> {
  const dx = bx - ax;
  const dy = by - ay;
  const spans: Array<[number, number]> = [];
  for (const circle of circles) {
    const fx = ax - circle.x;
    const fy = ay - circle.y;
    const qa = dx * dx + dy * dy;
    const qb = 2 * (fx * dx + fy * dy);
    const qc = fx * fx + fy * fy - circle.r * circle.r;
    if (qa < 1e-8) {
      if (qc <= 0) spans.push([0, 1]);
      continue;
    }
    const disc = qb * qb - 4 * qa * qc;
    if (disc < 0) {
      if (qc <= 0) spans.push([0, 1]);
      continue;
    }
    const root = Math.sqrt(disc);
    const t0 = (-qb - root) / (2 * qa);
    const t1 = (-qb + root) / (2 * qa);
    const lo = Math.max(0, Math.min(t0, t1));
    const hi = Math.min(1, Math.max(t0, t1));
    if (hi >= lo) spans.push([lo, hi]);
  }
  return mergeIntervals(spans);
}

function lerpCoord(a: number[], b: number[], t: number): number[] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function sameCoord(a: number[], b: number[]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
}

/** Keep only the parts of a line that fall inside the POI radius circles. */
export function clipLineToPoiRadius(
  line: number[][],
  points: LonLat[],
  bufferKm: number
): number[][][] {
  if (line.length < 2 || !points.length || bufferKm <= 0) return [];
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const circles: LocalCircle[] = points.map((p) => {
    const c = toLocal(p.lon, p.lat, lat0);
    return { x: c.x, y: c.y, r: bufferKm };
  });
  const parts: number[][][] = [];
  let current: number[][] | null = null;
  const pushCurrent = () => {
    if (current && current.length >= 2) parts.push(current);
    current = null;
  };
  for (let i = 0; i < line.length - 1; i++) {
    const a = toLocal(line[i][0], line[i][1], lat0);
    const b = toLocal(line[i + 1][0], line[i + 1][1], lat0);
    const spans = segmentInsideCircles(a.x, a.y, b.x, b.y, circles);
    let continued = false;
    for (const [lo, hi] of spans) {
      if (hi - lo < 1e-6) continue;
      const p0 = lerpCoord(line[i], line[i + 1], lo);
      const p1 = lerpCoord(line[i], line[i + 1], hi);
      if (current && lo <= 1e-6 && sameCoord(current[current.length - 1], p0)) {
        current.push(p1);
        continued = true;
      } else {
        pushCurrent();
        current = [p0, p1];
        continued = true;
      }
    }
    if (!continued || !spans.some(([, hi]) => hi >= 1 - 1e-6)) pushCurrent();
  }
  pushCurrent();
  return parts;
}

function clipFeatureToPoiRadius(
  feature: GeoJSON.Feature,
  points: LonLat[],
  bufferKm: number
): GeoJSON.Feature | null {
  const parts: number[][][] = [];
  for (const line of lineCoords(feature.geometry)) {
    parts.push(...clipLineToPoiRadius(line, points, bufferKm));
  }
  if (!parts.length) return null;
  const geometry: GeoJSON.Geometry =
    parts.length === 1
      ? { type: 'LineString', coordinates: parts[0] }
      : { type: 'MultiLineString', coordinates: parts };
  return { ...feature, geometry };
}

/** Per-POI buffer boxes (same pad as union AOI). */
export function poiBufferBoxes(
  points: PoiRef[],
  bufferKm: number
): Array<PoiRef & AoiBbox> {
  const padDeg = bufferPadDeg(bufferKm);
  return points.map((p) => ({
    ...p,
    west: p.lon - padDeg,
    east: p.lon + padDeg,
    south: p.lat - padDeg,
    north: p.lat + padDeg,
    padDeg,
  }));
}

/**
 * Tag each road feature with the POI ids whose radius it enters.
 * `clip: true` (default) cuts the line at the radius.
 * `clip: false` keeps the whole segment once any part enters a radius, so a highway reads as a route.
 */
export function associateFeaturesWithPois(
  fc: GeoJSON.FeatureCollection,
  points: PoiRef[],
  bufferKm: number,
  options?: { clip?: boolean }
): {
  features: GeoJSON.Feature[];
  count: number;
  byPoi: Record<string, number>;
  sharedCount: number;
} {
  const clip = options?.clip !== false;
  const tagged: GeoJSON.Feature[] = [];

  for (const feature of fc.features) {
    const hitIds: string[] = [];
    for (const point of points) {
      const clipped = clipFeatureToPoiRadius(feature, [point], bufferKm);
      if (clipped) hitIds.push(point.id);
    }
    if (!hitIds.length) continue;
    const clipped = clip
      ? clipFeatureToPoiRadius(
          feature,
          points.filter((p) => hitIds.includes(p.id)),
          bufferKm
        )
      : feature;
    if (!clipped) continue;
    tagged.push({
      ...clipped,
      properties: {
        ...(feature.properties ?? {}),
        _rrn_poi_ids: hitIds,
        _rrn_poi_labels: hitIds
          .map((id) => points.find((p) => p.id === id)?.label ?? id)
          .join(', '),
      },
    });
  }

  const unique = dedupeRoadFeatures(tagged);
  const byPoi: Record<string, number> = {};
  for (const p of points) byPoi[p.id] = 0;
  let sharedCount = 0;
  for (const feature of unique) {
    const ids = ((feature.properties as { _rrn_poi_ids?: string[] } | null)?._rrn_poi_ids ??
      []) as string[];
    for (const id of ids) byPoi[id] = (byPoi[id] ?? 0) + 1;
    if (ids.length > 1) sharedCount += 1;
  }

  return {
    features: unique,
    count: unique.length,
    byPoi,
    sharedCount,
  };
}

function browserStorage(): JsonStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export type { DashboardLayerConfig };
