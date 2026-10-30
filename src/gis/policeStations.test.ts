import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { InspectableFeature } from '../types/gis.ts';
import { matchInspectableStation, namesMatch, policeStationsToRows } from './usePoliceStations.ts';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

describe('Police Stations KMZ points', () => {
  it('stores 99 WGS84 station points from the KMZ', () => {
    const data = JSON.parse(
      readFileSync(resolve(root, 'public/geo/ap-police-stations.geojson'), 'utf8')
    ) as {
      features: Array<{
        geometry: { type: string; coordinates: number[] };
        properties: { name?: string };
      }>;
    };
    expect(data.features).toHaveLength(99);
    const named = data.features.filter((f) => f.properties.name).length;
    expect(named).toBe(99);
    for (const feature of data.features) {
      expect(feature.geometry.type).toBe('Point');
      const [lon, lat] = feature.geometry.coordinates;
      expect(lon).toBeGreaterThan(79);
      expect(lon).toBeLessThan(85);
      expect(lat).toBeGreaterThan(16);
      expect(lat).toBeLessThan(20);
    }
  });

  it('links KMZ Araku-PS and Chintapalli to inspectable police stations by name', () => {
    expect(namesMatch('Araku-PS', 'Araku Valley Police Station')).toBe(true);
    expect(namesMatch('PS-Chintapalli', 'Chintapalle Police Station')).toBe(true);
    expect(namesMatch('PS-Paderu', 'Paderu Town Police Station')).toBe(true);
    expect(namesMatch('Araku-PS', 'Check Post CP-14')).toBe(false);

    const data = JSON.parse(
      readFileSync(resolve(root, 'public/geo/ap-police-stations.geojson'), 'utf8')
    ) as GeoJSON.FeatureCollection;
    const rows = policeStationsToRows(data);
    const araku = rows.find((r) => r.id === 'araku_ps');
    expect(araku).toBeTruthy();
    const linked = matchInspectableStation(araku!, {
      'ps-araku': {
        id: 'ps-araku',
        name: 'Araku Valley Police Station',
        shortLabel: 'ARAKU VALLEY PS',
        category: 'Police Station',
      } as InspectableFeature,
      'cp-14': {
        id: 'cp-14',
        name: 'Check Post CP-14 (Araku Valley Ghat Entrance)',
        shortLabel: 'CP-14',
        category: 'Check Post',
      } as InspectableFeature,
    });
    expect(linked?.id).toBe('ps-araku');
  });
});
