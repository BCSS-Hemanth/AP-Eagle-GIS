/**
 * Client-side analog of QGIS Processing "native:buffer" / "native:multiringconstantbuffer".
 * Rings are geodesic on the WGS84 sphere (mean Earth radius 6371 km). No fabricated geometry.
 */

export const DEFAULT_INSPECT_BUFFER_KM = [1, 2, 5] as const;

export interface GeodesicBufferRing {
  id: string;
  lat: number;
  lon: number;
  radiusKm: number;
  label: string;
}

export function destinationPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceKm: number
): { lat: number; lon: number } {
  const radius = 6371;
  const angular = distanceKm / radius;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    );
  return {
    lat: (lat2 * 180) / Math.PI,
    lon: ((((lon2 * 180) / Math.PI + 540) % 360) - 180),
  };
}

/** Closed WGS84 ring as [lon, lat] pairs (GeoJSON order). */
export function geodesicBufferCoordinates(
  lat: number,
  lon: number,
  radiusKm: number,
  steps = 64
): number[][] {
  const coords: number[][] = [];
  const count = Math.max(8, Math.round(steps));
  for (let i = 0; i < count; i += 1) {
    const pt = destinationPoint(lat, lon, (i * 360) / count, radiusKm);
    coords.push([Number(pt.lon.toFixed(6)), Number(pt.lat.toFixed(6))]);
  }
  coords.push(coords[0]);
  return coords;
}

export function geodesicBufferFeature(
  lat: number,
  lon: number,
  radiusKm: number,
  properties: Record<string, unknown> = {}
): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { ...properties, radius_km: radiusKm, source: 'geodesic buffer (WGS84)' },
    geometry: {
      type: 'Polygon',
      coordinates: [geodesicBufferCoordinates(lat, lon, radiusKm)],
    },
  };
}

export function multiRingBufferRadii(distanceKm: number): number[] {
  const d = Number.isFinite(distanceKm) ? Math.max(0.25, distanceKm) : 5;
  return [Number((d / 2).toFixed(2)), Number(d.toFixed(2)), Number((d * 2).toFixed(2))];
}

export function ringsFromPoint(
  lat: number,
  lon: number,
  radiiKm: readonly number[],
  idPrefix: string,
  name = 'Buffer'
): GeodesicBufferRing[] {
  return radiiKm.map((radiusKm) => ({
    id: `${idPrefix}-${radiusKm}`,
    lat,
    lon,
    radiusKm,
    label: `${name} · ${radiusKm} km geodesic`,
  }));
}

export function ringsToFeatureCollection(rings: GeodesicBufferRing[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rings.map((ring) =>
      geodesicBufferFeature(ring.lat, ring.lon, ring.radiusKm, {
        id: ring.id,
        name: ring.label,
      })
    ),
  };
}
