import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

function firstLonLat(geometry: {
  type: string;
  coordinates: unknown;
}): [number, number] {
  if (geometry.type === 'Polygon') {
    return (geometry.coordinates as number[][][])[0][0] as [number, number];
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][])[0][0][0] as [number, number];
  }
  throw new Error(`Unexpected geometry ${geometry.type}`);
}

describe('Andhra Pradesh admin polygons', () => {
  it('stores 654 mandal polygons in WGS84', () => {
    const data = JSON.parse(
      readFileSync(resolve(root, 'public/geo/ap-mandals.geojson'), 'utf8')
    ) as {
      features: Array<{
        geometry: { type: string; coordinates: unknown };
        properties: { mandal_name?: string };
      }>;
    };
    expect(data.features.length).toBe(654);
    const named = data.features.filter((f) => f.properties.mandal_name).length;
    expect(named).toBe(654);
    const [lon, lat] = firstLonLat(data.features[0].geometry);
    expect(lon).toBeGreaterThan(76);
    expect(lon).toBeLessThan(85);
    expect(lat).toBeGreaterThan(12);
    expect(lat).toBeLessThan(20);
  });

  it('indexes 18,100 revenue-village polygons by district bbox', () => {
    const index = JSON.parse(
      readFileSync(resolve(root, 'public/geo/ap-villages-index.json'), 'utf8')
    ) as {
      total: number;
      districts: Array<{
        district_name: string;
        file: string;
        count: number;
        bbox: [number, number, number, number];
      }>;
    };
    expect(index.total).toBe(18100);
    expect(index.districts).toHaveLength(13);
    const summed = index.districts.reduce((sum, d) => sum + d.count, 0);
    expect(summed).toBe(18100);
    for (const district of index.districts) {
      const [west, south, east, north] = district.bbox;
      expect(west).toBeGreaterThan(76);
      expect(east).toBeLessThan(86);
      expect(south).toBeGreaterThan(12);
      expect(north).toBeLessThan(20);
      expect(district.file).toMatch(/^\/geo\/villages\/.+\.geojson$/);
    }
  });

  it('keeps a Chittoor village tile in geographic coordinates', () => {
    const data = JSON.parse(
      readFileSync(resolve(root, 'public/geo/villages/chittoor.geojson'), 'utf8')
    ) as {
      features: Array<{ geometry: { type: string; coordinates: unknown } }>;
    };
    expect(data.features.length).toBeGreaterThan(1000);
    const [lon, lat] = firstLonLat(data.features[0].geometry);
    expect(lon).toBeGreaterThan(78);
    expect(lon).toBeLessThan(81);
    expect(lat).toBeGreaterThan(12);
    expect(lat).toBeLessThan(14.5);
  });
});
