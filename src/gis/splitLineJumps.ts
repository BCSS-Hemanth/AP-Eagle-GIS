/** Split polyline rings where consecutive vertices jump farther than maxJumpKm. */

const EARTH_KM = 6371;

function haversineKm(a: [number, number], b: [number, number]): number {
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b[1] - a[1]);
  const dLon = toR(b[0] - a[0]);
  const lat1 = toR(a[1]);
  const lat2 = toR(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Split one LineString coordinate ring into contiguous segments. */
export function splitCoordsOnJumps(
  coords: number[][],
  maxJumpKm = 20
): number[][][] {
  if (coords.length < 2) return coords.length ? [coords] : [];
  const parts: number[][][] = [];
  let current: number[][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const prev = current[current.length - 1] as [number, number];
    const next = coords[i] as [number, number];
    if (haversineKm(prev, next) > maxJumpKm) {
      if (current.length >= 2) parts.push(current);
      current = [coords[i]];
    } else {
      current.push(coords[i]);
    }
  }
  if (current.length >= 2) parts.push(current);
  return parts;
}

/**
 * Repair OSM-style river/road LineStrings that were wrongly concatenated across
 * distant relation members (draws long straight chords on the map).
 */
export function repairLineJumpFeatureCollection(
  fc: GeoJSON.FeatureCollection,
  maxJumpKm = 20
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const feature of fc.features) {
    const g = feature.geometry;
    if (!g) {
      features.push(feature);
      continue;
    }
    if (g.type === 'LineString') {
      const parts = splitCoordsOnJumps(g.coordinates, maxJumpKm);
      if (parts.length <= 1) {
        features.push(
          parts.length === 1
            ? { ...feature, geometry: { type: 'LineString', coordinates: parts[0] } }
            : feature
        );
      } else {
        features.push({
          ...feature,
          geometry: { type: 'MultiLineString', coordinates: parts },
        });
      }
      continue;
    }
    if (g.type === 'MultiLineString') {
      const parts: number[][][] = [];
      for (const line of g.coordinates) {
        parts.push(...splitCoordsOnJumps(line, maxJumpKm));
      }
      if (!parts.length) continue;
      features.push({
        ...feature,
        geometry:
          parts.length === 1
            ? { type: 'LineString', coordinates: parts[0] }
            : { type: 'MultiLineString', coordinates: parts },
      });
      continue;
    }
    features.push(feature);
  }
  return { type: 'FeatureCollection', features };
}
