import { describe, expect, it } from 'vitest';
import {
  decimateRoutePoints,
  filterFcToBbox,
  mapAllowsHeavyRoadVectors,
  prepareClassifiedRoadFc,
  prepareHeavyRoadFc,
  preparePostgisFullNetworkFc,
} from './mapRoadRenderSafety';

describe('mapRoadRenderSafety', () => {
  const indiaWide = { west: 68, south: 6, east: 98, north: 38 };
  const local = { west: 82.2, south: 17.6, east: 83.0, north: 18.2 };

  it('blocks heavy roads at India / statewide camera', () => {
    expect(mapAllowsHeavyRoadVectors(5, indiaWide)).toBe(false);
    expect(mapAllowsHeavyRoadVectors(10, indiaWide)).toBe(false);
    expect(mapAllowsHeavyRoadVectors(7, local)).toBe(false);
  });

  it('allows heavy roads only when zoomed into a tight bbox', () => {
    expect(mapAllowsHeavyRoadVectors(9, local)).toBe(true);
  });

  it('filters features to the visible bbox', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'in' },
          geometry: { type: 'LineString', coordinates: [[82.5, 17.9], [82.6, 17.95]] },
        },
        {
          type: 'Feature',
          properties: { id: 'out' },
          geometry: { type: 'LineString', coordinates: [[78.0, 15.0], [78.1, 15.1]] },
        },
      ],
    };
    const clipped = filterFcToBbox(fc, local);
    expect(clipped.features.map((f) => f.properties?.id)).toEqual(['in']);
  });

  it('prepareHeavyRoadFc soft-caps dense layers instead of blanking them', () => {
    const features = Array.from({ length: 20 }, (_, i) => ({
      type: 'Feature' as const,
      properties: {
        i,
        rd_sub_typ: i < 5 ? 'National Highway' : i < 12 ? 'State Highway' : 'District Road',
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [82.3 + i * 0.001, 17.7],
          [82.3 + i * 0.001, 17.71],
        ],
      },
    }));
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };
    expect(prepareHeavyRoadFc(fc, 9, local, 10)?.features.length).toBe(10);
    expect(prepareHeavyRoadFc(fc, 9, local, 50)?.features.length).toBe(20);
    expect(prepareHeavyRoadFc(fc, 5, local)).toBeNull();
  });

  it('preparePostgisFullNetworkFc keeps only classified through-routes', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { rd_sub_typ: 'National Highway' },
          geometry: { type: 'LineString', coordinates: [[82.5, 17.9], [82.6, 17.95]] },
        },
        {
          type: 'Feature',
          properties: { rd_sub_typ: 'Village Road' },
          geometry: { type: 'LineString', coordinates: [[82.5, 17.9], [82.51, 17.91]] },
        },
      ],
    };
    const prepared = preparePostgisFullNetworkFc(fc, 9, local);
    expect(prepared?.features).toHaveLength(1);
    expect(prepared?.features[0].properties?.rd_sub_typ).toBe('National Highway');
  });

  it('prepareClassifiedRoadFc drops village tracks without a zoom gate', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { rd_sub_typ: 'State Highway' },
          geometry: { type: 'LineString', coordinates: [[82.5, 17.9], [82.7, 18.0]] },
        },
        {
          type: 'Feature',
          properties: { rd_sub_typ: 'Cart Track' },
          geometry: { type: 'LineString', coordinates: [[82.5, 17.9], [82.52, 17.91]] },
        },
      ],
    };
    const prepared = prepareClassifiedRoadFc(fc, 10);
    expect(prepared?.features).toHaveLength(1);
    expect(prepared?.features[0].properties?.rd_sub_typ).toBe('State Highway');
  });

  it('decimates long route polylines but keeps endpoints', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => ({ lat: i * 0.001, lon: i * 0.001 }));
    const out = decimateRoutePoints(pts, 100);
    expect(out.length).toBeLessThanOrEqual(101);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });
});
