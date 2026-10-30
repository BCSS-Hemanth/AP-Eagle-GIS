import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INSPECTABLE_FEATURES } from '../data/apGisData.ts';
import { policeStationsToRows } from './usePoliceStations.ts';
import { buildSearchTargets, resolveFlyTarget } from './searchTargets.ts';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

describe('global search targets', () => {
  const data = JSON.parse(
    readFileSync(resolve(root, 'public/geo/ap-police-stations.geojson'), 'utf8')
  ) as GeoJSON.FeatureCollection;
  const rows = policeStationsToRows(data);

  it('includes KMZ Araku-PS and no invented inspectable station', () => {
    const targets = buildSearchTargets(INSPECTABLE_FEATURES, rows);
    const arakuHits = targets.filter((t) => /araku/i.test(t.name));
    expect(arakuHits.some((t) => t.id === 'araku_ps')).toBe(true);
    expect(arakuHits.some((t) => t.id === 'ps-araku')).toBe(false);
  });

  it('flies header search for Araku-PS to the KMZ point', () => {
    const targets = buildSearchTargets(INSPECTABLE_FEATURES, rows);
    const resolved = resolveFlyTarget('araku_ps', INSPECTABLE_FEATURES, rows, targets);
    expect(resolved?.stationId).toBe('araku_ps');
    expect(resolved?.feature.name).toBe('Araku-PS');
    expect(resolved?.feature.lat).toBeCloseTo(18.3236, 3);
    expect(resolved?.feature.lon).toBeCloseTo(82.8864, 3);
  });

  it('does not resolve invented inspectable station ids', () => {
    const targets = buildSearchTargets(INSPECTABLE_FEATURES, rows);
    const resolved = resolveFlyTarget('ps-araku', INSPECTABLE_FEATURES, rows, targets);
    expect(resolved).toBeNull();
  });
});
