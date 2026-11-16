import { describe, expect, it } from 'vitest';
import { repairLineJumpFeatureCollection, splitCoordsOnJumps } from './splitLineJumps';

describe('splitLineJumps', () => {
  it('splits a line when consecutive vertices jump hundreds of km', () => {
    const coords = [
      [82.2, 16.6],
      [82.25, 16.65],
      [73.56, 19.96], // ~1000 km jump (Maharashtra ↔ AP)
      [73.58, 20.0],
    ];
    const parts = splitCoordsOnJumps(coords, 20);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(2);
    expect(parts[1]).toHaveLength(2);
  });

  it('converts spiked LineString features to MultiLineString', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Godavari' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [82.2, 16.6],
              [82.3, 16.7],
              [73.5, 19.9],
              [73.6, 20.0],
            ],
          },
        },
      ],
    };
    const fixed = repairLineJumpFeatureCollection(fc, 20);
    expect(fixed.features[0].geometry?.type).toBe('MultiLineString');
    const ml = fixed.features[0].geometry as GeoJSON.MultiLineString;
    expect(ml.coordinates).toHaveLength(2);
  });
});
