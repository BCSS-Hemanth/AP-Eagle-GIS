/** Spatial helpers for district → mandal → village drill-down on real GeoJSON. */

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

export function adminNamesEqual(a?: string | null, b?: string | null): boolean {
  const left = adminNameKey(a);
  const right = adminNameKey(b);
  return Boolean(left && right && left === right);
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
  return children.filter((child) => {
    const c = featureCentroid(child);
    if (!c) return false;
    const [lon, lat] = c;
    if (lon < west || lon > east || lat < south || lat > north) return false;
    return pointInFeature(c, parent);
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
