import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  cleanOverviewLabelTier,
  isAndhraPradesh,
  shouldShowPermanentStateLabel,
  stateLabelLatLng,
  stateMapLabel,
} from './useIndiaStates';

describe('India states overview assets', () => {
  it('ships post-bifurcation DataMeet states with separate AP and Telangana', () => {
    const root = resolve(process.cwd(), 'public/geo');
    const statesPath = resolve(root, 'india-states.geojson');
    const outlinePath = resolve(root, 'india-outline.geojson');
    expect(existsSync(statesPath)).toBe(true);
    expect(existsSync(outlinePath)).toBe(true);
    const states = JSON.parse(readFileSync(statesPath, 'utf8'));
    expect(states.features.length).toBe(36);
    const names = states.features.map(
      (f: GeoJSON.Feature) => (f.properties as { state_name?: string }).state_name
    );
    expect(names).toContain('Andhra Pradesh');
    expect(names).toContain('Telangana');
    expect(names).toContain('Ladakh');
    const ap = states.features.find((f: GeoJSON.Feature) => isAndhraPradesh(f));
    expect(ap).toBeTruthy();
    const tg = states.features.find(
      (f: GeoJSON.Feature) =>
        (f.properties as { state_name?: string }).state_name === 'Telangana'
    );
    expect(tg).toBeTruthy();
    expect(isAndhraPradesh(tg)).toBe(false);
    expect(String(states.meta?.source ?? '')).toMatch(/DataMeet/i);
    const outline = JSON.parse(readFileSync(outlinePath, 'utf8'));
    expect(outline.type).toBe('Feature');
    expect(outline.geometry).toBeTruthy();
  });

  it('keeps India overview labels sparse at low zoom', () => {
    expect(
      shouldShowPermanentStateLabel(5, { ap: true, areaDeg2: 10, name: 'Andhra Pradesh' })
    ).toBe(true);
    expect(
      shouldShowPermanentStateLabel(5, { ap: false, areaDeg2: 0.4, name: 'Nagaland' })
    ).toBe(false);
    expect(
      shouldShowPermanentStateLabel(5, { ap: false, areaDeg2: 20, name: 'Rajasthan' })
    ).toBe(true);
    expect(
      shouldShowPermanentStateLabel(7, { ap: false, areaDeg2: 0.4, name: 'Nagaland' })
    ).toBe(true);
  });

  it('sizes political-clean labels by area and zoom', () => {
    expect(cleanOverviewLabelTier(4, { ap: false, areaDeg2: 31 })).toBe('lg');
    expect(cleanOverviewLabelTier(4, { ap: true, areaDeg2: 13.77 })).toBe('lg');
    expect(cleanOverviewLabelTier(7, { ap: false, areaDeg2: 0.05 })).toBe('sm');
  });

  it('anchors labels on curated label_lon/lat and shortens ultra-long UT names', () => {
    const ft: GeoJSON.Feature = {
      type: 'Feature',
      properties: {
        state_name: 'Dadra and Nagar Haveli and Daman and Diu',
        label_lon: 72.95,
        label_lat: 20.25,
        area_deg2: 0.05,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [72.9, 20.2],
            [73.0, 20.2],
            [73.0, 20.3],
            [72.9, 20.3],
            [72.9, 20.2],
          ],
        ],
      },
    };
    expect(stateMapLabel(ft)).toBe('DNH & DD');
    expect(stateLabelLatLng(ft)).toEqual([20.25, 72.95]);
  });

  it('overrides Assam / Gujarat / West Bengal label anchors to visual centers', () => {
    const mk = (state_name: string, label_lon: number, label_lat: number): GeoJSON.Feature => ({
      type: 'Feature',
      properties: { state_name, label_lon, label_lat },
      geometry: { type: 'Point', coordinates: [label_lon, label_lat] },
    });
    expect(stateLabelLatLng(mk('Assam', 90.761, 26.0544))).toEqual([26.32, 92.9]);
    expect(stateLabelLatLng(mk('Gujarat', 72.0125, 22.4163))).toEqual([22.9, 71.7]);
    expect(stateLabelLatLng(mk('West Bengal', 88.0977, 24.3894))).toEqual([23.4, 87.9]);
  });
});
