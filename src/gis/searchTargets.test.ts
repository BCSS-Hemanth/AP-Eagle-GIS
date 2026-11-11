import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INSPECTABLE_FEATURES } from '../data/apGisData.ts';
import { policeStationsToRows } from './usePoliceStations.ts';
import { buildSearchTargets, osmFeatureToInspectable, resolveFlyTarget } from './searchTargets.ts';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

describe('global search targets', () => {
  const data = JSON.parse(
    readFileSync(resolve(root, 'public/geo/ap-police-stations.geojson'), 'utf8')
  ) as GeoJSON.FeatureCollection;
  const rows = policeStationsToRows(data);

  it('excludes KMZ police stations from header search targets', () => {
    const targets = buildSearchTargets(INSPECTABLE_FEATURES, rows);
    expect(targets).toHaveLength(0);
    expect(targets.some((t) => t.id === 'ps_maredumilli')).toBe(false);
    expect(targets.some((t) => t.id === 'ps_chintapalli')).toBe(false);
    expect(targets.some((t) => t.id === 'ps_bhupalpalli')).toBe(false);
  });

  it('still resolves a KMZ station id for map fly (not via search index)', () => {
    const targets = buildSearchTargets(INSPECTABLE_FEATURES, rows);
    const resolved = resolveFlyTarget('ps_chintapalli', INSPECTABLE_FEATURES, rows, targets);
    expect(resolved?.stationId).toBe('ps_chintapalli');
    expect(resolved?.feature.name).toBe('PS-Chintapalli');
    expect(resolved?.feature.lat).toBeCloseTo(17.8698, 3);
    expect(resolved?.feature.lon).toBeCloseTo(82.3499, 3);
  });

  it('does not resolve invented inspectable station ids', () => {
    const targets = buildSearchTargets(INSPECTABLE_FEATURES, rows);
    const resolved = resolveFlyTarget('ps-araku', INSPECTABLE_FEATURES, rows, targets);
    expect(resolved).toBeNull();
  });

  it('inspects OSM buildings only from recorded height, not a default', () => {
    const building = osmFeatureToInspectable({
      name: 'OSM building',
      kind: 'OSM Building',
      lat: 16.5062,
      lon: 80.648,
      detail: 'OSM Building • 18 m OSM height',
      heightM: 18,
    });
    expect(building.category).toBe('OSM Building');
    expect(building.elevationM).toBe(18);
    expect(building.manningDetail).toMatch(/recorded height/);
  });
});
