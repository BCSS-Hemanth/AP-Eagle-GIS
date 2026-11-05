import type { LonLat } from './roadsRoutingGraph';

export interface OpsNearRoute {
  id: string;
  name: string;
  layerId: string;
  layerName: string;
  lat: number;
  lon: number;
  distanceM: number;
  relation: 'along' | 'detour';
}

const EARTH_M = 6371000;

function haversineM(a: LonLat, b: LonLat): number {
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLon = toR(b.lon - a.lon);
  const lat1 = toR(a.lat);
  const lat2 = toR(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function minDistToPolylineM(point: LonLat, line: LonLat[]): number {
  let best = Infinity;
  for (const p of line) {
    const d = haversineM(point, p);
    if (d < best) best = d;
  }
  return best;
}

function featurePoint(feature: GeoJSON.Feature): LonLat | null {
  const g = feature.geometry;
  if (!g) return null;
  if (g.type === 'Point') return { lon: g.coordinates[0], lat: g.coordinates[1] };
  if (g.type === 'MultiPoint' && g.coordinates[0]) {
    return { lon: g.coordinates[0][0], lat: g.coordinates[0][1] };
  }
  return null;
}

function featureName(props: Record<string, unknown> | null | undefined, fallback: string): string {
  if (!props) return fallback;
  for (const key of ['name', 'NAME', 'POLICE_STA', 'VIL_NAME', 'folder']) {
    const v = props[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return fallback;
}

/** Associate ops/admin point layers with a route — along-route vs short detour. */
export function analyseOpsNearRoute(
  routePoints: LonLat[],
  layers: Array<{ layerId: string; layerName: string; fc: GeoJSON.FeatureCollection }>,
  alongMaxM = 450,
  detourMaxM = 2500
): OpsNearRoute[] {
  if (routePoints.length < 2) return [];
  const out: OpsNearRoute[] = [];
  for (const { layerId, layerName, fc } of layers) {
    fc.features.forEach((feature, idx) => {
      const pt = featurePoint(feature);
      if (!pt) return;
      const distanceM = minDistToPolylineM(pt, routePoints);
      if (distanceM > detourMaxM) return;
      const relation: 'along' | 'detour' = distanceM <= alongMaxM ? 'along' : 'detour';
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      out.push({
        id: String(props.id ?? `${layerId}-${idx}`),
        name: featureName(props, layerName),
        layerId,
        layerName,
        lat: pt.lat,
        lon: pt.lon,
        distanceM: Math.round(distanceM),
        relation,
      });
    });
  }
  out.sort((a, b) => a.distanceM - b.distanceM);
  return out.slice(0, 40);
}
