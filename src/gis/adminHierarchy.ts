/** Spatial helpers for district → mandal → village drill-down on real GeoJSON. */

import { CURRENT_MANDAL_SPELLING } from './mandalSpellings';

export type LonLat = [number, number];

export function adminNameKey(value: string | undefined | null): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(district|mandal|taluk|tehsil|village)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MANDAL_SPELLING_BY_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(CURRENT_MANDAL_SPELLING).map(([from, to]) => [adminNameKey(from), to])
);

export function currentMandalSpelling(name: string | undefined | null): string {
  const raw = String(name ?? '');
  if (!raw) return raw;
  return MANDAL_SPELLING_BY_KEY[adminNameKey(raw)] ?? raw;
}

function comparableAdminKey(value: string | undefined | null): string {
  const key = adminNameKey(value);
  const mapped = MANDAL_SPELLING_BY_KEY[key];
  return mapped ? adminNameKey(mapped) : key;
}

export function adminNamesEqual(a?: string | null, b?: string | null): boolean {
  const left = comparableAdminKey(a);
  const right = comparableAdminKey(b);
  return Boolean(left && right && left === right);
}

export function applyCurrentMandalSpellings(collection: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    ...collection,
    features: collection.features.map((feature) => {
      const props = feature.properties as Record<string, unknown> | null;
      if (!props || typeof props.mandal_name !== 'string') return feature;
      const next = currentMandalSpelling(props.mandal_name);
      if (next === props.mandal_name) return feature;
      return { ...feature, properties: { ...props, mandal_name: next } };
    }),
  };
}

function outerRings(geometry: GeoJSON.Geometry | null | undefined): LonLat[][] {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    return [(geometry.coordinates[0] ?? []) as LonLat[]];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((poly) => (poly[0] ?? []) as LonLat[]);
  }
  return [];
}

function allRings(geometry: GeoJSON.Geometry | null | undefined): LonLat[][][] {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates as LonLat[][]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as LonLat[][][];
  return [];
}

export function featureBbox(feature: GeoJSON.Feature): [number, number, number, number] | null {
  const rings = outerRings(feature.geometry);
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  if (!Number.isFinite(west)) return null;
  return [west, south, east, north];
}

export function featureCentroid(feature: GeoJSON.Feature): LonLat | null {
  const ring = outerRings(feature.geometry)[0];
  if (!ring || ring.length < 3) {
    if (feature.geometry?.type === 'Point') {
      const [lon, lat] = feature.geometry.coordinates;
      return [lon, lat];
    }
    return null;
  }
  let x = 0;
  let y = 0;
  let n = 0;
  const limit = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.length - 1
    : ring.length;
  for (let i = 0; i < limit; i += 1) {
    x += ring[i][0];
    y += ring[i][1];
    n += 1;
  }
  if (!n) return null;
  return [x / n, y / n];
}

function pointInRing(point: LonLat, ring: LonLat[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInFeature(point: LonLat, feature: GeoJSON.Feature): boolean {
  const polys = allRings(feature.geometry);
  for (const rings of polys) {
    const [outer, ...holes] = rings;
    if (!outer || !pointInRing(point, outer)) continue;
    if (holes.some((hole) => pointInRing(point, hole))) continue;
    return true;
  }
  return false;
}

export function filterFeaturesInParent(
  children: GeoJSON.Feature[],
  parent: GeoJSON.Feature
): GeoJSON.Feature[] {
  const pb = featureBbox(parent);
  if (!pb) return [];
  const [west, south, east, north] = pb;
  return children.flatMap((child) => {
    const clipped = clipFeatureToParent(child, parent);
    const c = featureCentroid(clipped);
    if (!c) return [];
    const [lon, lat] = c;
    if (lon < west || lon > east || lat < south || lat > north) return [];
    return pointInFeature(c, parent) ? [clipped] : [];
  });
}

export function filterByAdminName(
  children: GeoJSON.Feature[],
  key: 'mandal_name' | 'village_name' | 'district_name',
  name: string
): GeoJSON.Feature[] {
  return children.filter((child) =>
    adminNamesEqual(String((child.properties as Record<string, unknown> | null)?.[key] ?? ''), name)
  );
}

export function asFeatureCollection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

function polygonSpanArea(coords: GeoJSON.Position[][]): number {
  const ring = coords[0];
  if (!ring || ring.length < 3) return 0;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const pos of ring) {
    const lon = Number(pos[0]);
    const lat = Number(pos[1]);
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  if (!Number.isFinite(west)) return 0;
  return Math.max(0, east - west) * Math.max(0, north - south);
}

function asPolygonFeature(feature: GeoJSON.Feature, coordinates: GeoJSON.Position[][]): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: feature.properties,
    geometry: { type: 'Polygon', coordinates },
  };
}

function bboxOverlaps(
  a: [number, number, number, number],
  b: [number, number, number, number]
): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

/**
 * Same mandal names exist in more than one district in the NWIC vintage, so the
 * dissolved file can be a MultiPolygon of distant parts. Isolation must use the
 * part the user actually clicked — not the combined envelope.
 */
export function focusPolygonAtPoint(feature: GeoJSON.Feature, point: LonLat): GeoJSON.Feature {
  const geom = feature.geometry;
  if (!geom || geom.type === 'Polygon') return feature;
  if (geom.type !== 'MultiPolygon') return feature;
  for (const coords of geom.coordinates) {
    const part = asPolygonFeature(feature, coords);
    if (pointInFeature(point, part)) return part;
  }
  let best: GeoJSON.Position[][] | null = null;
  let bestDist = Infinity;
  for (const coords of geom.coordinates) {
    const part = asPolygonFeature(feature, coords);
    const centroid = featureCentroid(part);
    if (!centroid) continue;
    const dist =
      (centroid[0] - point[0]) * (centroid[0] - point[0]) +
      (centroid[1] - point[1]) * (centroid[1] - point[1]);
    if (dist < bestDist) {
      bestDist = dist;
      best = coords;
    }
  }
  if (!best) {
    let bestArea = -1;
    for (const coords of geom.coordinates) {
      const area = polygonSpanArea(coords);
      if (area > bestArea) {
        bestArea = area;
        best = coords;
      }
    }
  }
  return best ? asPolygonFeature(feature, best) : feature;
}

/** Drop MultiPolygon parts that do not overlap the parent admin unit. */
export function clipFeatureToParent(child: GeoJSON.Feature, parent: GeoJSON.Feature): GeoJSON.Feature {
  const geom = child.geometry;
  if (!geom || geom.type !== 'MultiPolygon') return child;
  const parentBox = featureBbox(parent);
  const kept = geom.coordinates.filter((coords) => {
    const part = asPolygonFeature(child, coords);
    const centroid = featureCentroid(part);
    if (centroid && pointInFeature(centroid, parent)) return true;
    const partBox = featureBbox(part);
    return Boolean(parentBox && partBox && bboxOverlaps(partBox, parentBox));
  });
  if (kept.length === 1) return asPolygonFeature(child, kept[0]);
  if (kept.length > 1) {
    return {
      type: 'Feature',
      properties: child.properties,
      geometry: { type: 'MultiPolygon', coordinates: kept },
    };
  }
  return child;
}

/** Clip to parent (when known), then keep only the part at `point`. */
export function isolateChildFeature(
  feature: GeoJSON.Feature,
  point: LonLat,
  parent?: GeoJSON.Feature | null
): GeoJSON.Feature {
  const clipped = parent ? clipFeatureToParent(feature, parent) : feature;
  return focusPolygonAtPoint(clipped, point);
}

/** Clockwise world ring in Leaflet [lat, lon] order, used as the invert-mask outer. */
export const WORLD_MASK_RING: Array<[number, number]> = [
  [85, -180],
  [85, 180],
  [-85, 180],
  [-85, -180],
];

function toLeafletRing(ring: LonLat[]): Array<[number, number]> {
  const latlngs: Array<[number, number]> = [];
  for (const [lon, lat] of ring) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const prev = latlngs[latlngs.length - 1];
    if (prev && prev[0] === lat && prev[1] === lon) continue;
    latlngs.push([lat, lon]);
  }
  if (
    latlngs.length > 1 &&
    latlngs[0][0] === latlngs[latlngs.length - 1][0] &&
    latlngs[0][1] === latlngs[latlngs.length - 1][1]
  ) {
    latlngs.pop();
  }
  return latlngs;
}

/** World polygon with the feature outer rings as holes — hides everything outside the selection. */
export function invertMaskLatLngs(feature: GeoJSON.Feature): Array<Array<[number, number]>> {
  const holes = outerRings(feature.geometry)
    .map(toLeafletRing)
    .filter((ring) => ring.length >= 3);
  if (!holes.length) return [];
  return [WORLD_MASK_RING, ...holes];
}

const WORLD_GEOJSON_RING: LonLat[] = [
  [-180, 85],
  [180, 85],
  [180, -85],
  [-180, -85],
  [-180, 85],
];

function closeRing(ring: LonLat[]): LonLat[] {
  const copy = ring.map(([lon, lat]) => [lon, lat] as LonLat);
  const first = copy[0];
  const last = copy[copy.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    copy.push([first[0], first[1]]);
  }
  return copy;
}

/** GeoJSON invert mask for MapLibre (lon/lat rings, first ring is the world). */
export function invertMaskGeoJSON(feature: GeoJSON.Feature): GeoJSON.Feature | null {
  const holes = outerRings(feature.geometry)
    .map(closeRing)
    .filter((ring) => ring.length >= 4);
  if (!holes.length) return null;
  return {
    type: 'Feature',
    properties: { kind: 'invert-mask' },
    geometry: {
      type: 'Polygon',
      coordinates: [WORLD_GEOJSON_RING, ...holes],
    },
  };
}

/** MapLibre cannot fill a ±180 world ring. Pad a local envelope and punch the feature hole. */
export function invertMaskLocalGeoJSON(
  feature: GeoJSON.Feature,
  padDeg = 8
): GeoJSON.Feature | null {
  const world = invertMaskGeoJSON(feature);
  if (!world || world.geometry.type !== 'Polygon') return null;
  const box = featureBbox(feature);
  if (!box) return world;
  const outer: LonLat[] = [
    [box[0] - padDeg, box[1] - padDeg],
    [box[2] + padDeg, box[1] - padDeg],
    [box[2] + padDeg, box[3] + padDeg],
    [box[0] - padDeg, box[3] + padDeg],
    [box[0] - padDeg, box[1] - padDeg],
  ];
  return {
    type: 'Feature',
    properties: { kind: 'invert-mask' },
    geometry: {
      type: 'Polygon',
      coordinates: [outer, ...world.geometry.coordinates.slice(1)],
    },
  };
}

export type AdminDrillLevel = 'state' | 'district' | 'mandal' | 'village';

export interface AdminDrill {
  level: AdminDrillLevel;
  districtName?: string;
  districtFeature?: GeoJSON.Feature;
  mandalName?: string;
  mandalFeature?: GeoJSON.Feature;
  villageName?: string;
  villageFeature?: GeoJSON.Feature;
}

export const STATE_ADMIN_DRILL: AdminDrill = { level: 'state' };

export function drillFocusFeature(drill: AdminDrill): GeoJSON.Feature | null {
  if (drill.level === 'village') return drill.villageFeature ?? null;
  if (drill.level === 'mandal') return drill.mandalFeature ?? null;
  if (drill.level === 'district') return drill.districtFeature ?? null;
  return null;
}

export function adminDrillUp(drill: AdminDrill): AdminDrill {
  if (drill.level === 'village') {
    return {
      level: 'mandal',
      districtName: drill.districtName,
      districtFeature: drill.districtFeature,
      mandalName: drill.mandalName,
      mandalFeature: drill.mandalFeature,
    };
  }
  if (drill.level === 'mandal') {
    return {
      level: 'district',
      districtName: drill.districtName,
      districtFeature: drill.districtFeature,
    };
  }
  return STATE_ADMIN_DRILL;
}

export function adminDrillTo(drill: AdminDrill, level: AdminDrillLevel): AdminDrill {
  if (level === 'state') return STATE_ADMIN_DRILL;
  if (level === 'district') {
    return {
      level: 'district',
      districtName: drill.districtName,
      districtFeature: drill.districtFeature,
    };
  }
  if (level === 'mandal') {
    return {
      level: 'mandal',
      districtName: drill.districtName,
      districtFeature: drill.districtFeature,
      mandalName: drill.mandalName,
      mandalFeature: drill.mandalFeature,
    };
  }
  return drill;
}
