import { describe, expect, it } from 'vitest';
import { atlasFrameForDistrict } from './atlasDistrictFrame';

describe('atlasFrameForDistrict', () => {
  it('uses curated ASR briefing frame (not full elongated district bbox alone)', () => {
    const frame = atlasFrameForDistrict('asr', null);
    expect(frame).toBeTruthy();
    expect(frame!.west).toBeGreaterThan(81);
    expect(frame!.east).toBeGreaterThan(83.2);
    expect(frame!.north).toBeGreaterThan(18.8);
    expect(frame!.south).toBeGreaterThan(17.4);
    // Tighter than full ASR west tip (~80.88) so Telangana/Chhattisgarh stay out.
    expect(frame!.west).toBeGreaterThan(81.2);
  });

  it('falls back to feature bbox for districts without a curated frame', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [79, 15],
            [80, 15],
            [80, 16],
            [79, 16],
            [79, 15],
          ],
        ],
      },
    };
    const frame = atlasFrameForDistrict('guntur', feature);
    expect(frame).toEqual({
      west: 79,
      south: 15,
      east: 80,
      north: 16,
      maxZoom: 10,
      padRatio: 0.1,
    });
  });
});
