import { describe, expect, it } from 'vitest';
import { haversineKm } from '../utils/geoMath';
import {
  DEFAULT_INSPECT_BUFFER_KM,
  destinationPoint,
  geodesicBufferCoordinates,
  geodesicBufferFeature,
  multiRingBufferRadii,
  ringsFromPoint,
} from './geodesicBuffer';

describe('geodesic buffer (QGIS native:buffer analog)', () => {
  it('places a point 5 km north of Vijayawada on the WGS84 sphere', () => {
    const origin = { lat: 16.5062, lon: 80.648 };
    const north = destinationPoint(origin.lat, origin.lon, 0, 5);
    expect(haversineKm(origin, north)).toBeCloseTo(5, 2);
    expect(north.lat).toBeGreaterThan(origin.lat);
    expect(north.lon).toBeCloseTo(origin.lon, 3);
  });

  it('closes a 64-vertex ring whose vertices sit on the requested radius', () => {
    const lat = 18.3273;
    const lon = 82.8775;
    const ring = geodesicBufferCoordinates(lat, lon, 2, 64);
    expect(ring.length).toBe(65);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const sample = ring[16];
    expect(haversineKm({ lat, lon }, { lat: sample[1], lon: sample[0] })).toBeCloseTo(2, 1);
  });

  it('emits a GeoJSON polygon in lon,lat order inside the AP envelope', () => {
    const feature = geodesicBufferFeature(15.8281, 78.0373, 1, { name: 'Kurnool 1 km' });
    expect(feature.geometry?.type).toBe('Polygon');
    const coords = (feature.geometry as GeoJSON.Polygon).coordinates[0];
    for (const [lon, lat] of coords) {
      expect(lon).toBeGreaterThan(77.9);
      expect(lon).toBeLessThan(78.2);
      expect(lat).toBeGreaterThan(15.7);
      expect(lat).toBeLessThan(16.0);
    }
  });

  it('builds 1/2/5 km inspect rings and 0.5×/1×/2× geoprocess radii', () => {
    expect([...DEFAULT_INSPECT_BUFFER_KM]).toEqual([1, 2, 5]);
    expect(multiRingBufferRadii(5)).toEqual([2.5, 5, 10]);
    const rings = ringsFromPoint(16.5062, 80.648, DEFAULT_INSPECT_BUFFER_KM, 'vj', 'Vijayawada');
    expect(rings).toHaveLength(3);
    expect(rings.map((r) => r.radiusKm)).toEqual([1, 2, 5]);
  });
});
