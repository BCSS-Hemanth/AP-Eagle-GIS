import { describe, expect, it } from 'vitest';
import { fullRoadsFetchLimit, roadsGeojsonUrl, roadsMvtUrlTemplate } from './gisPostgisRoads';

describe('gisPostgisRoads helpers', () => {
  it('builds bbox GeoJSON and MVT URLs for the full network', () => {
    expect(
      roadsGeojsonUrl('full', { west: 82, south: 17, east: 83, north: 18 }, 2500)
    ).toBe('/api/gis-roads/geojson?layer=full&bbox=82%2C17%2C83%2C18&limit=2500');
    expect(roadsMvtUrlTemplate('full')).toBe('/api/gis-roads/mvt/full/{z}/{x}/{y}');
  });

  it('caps full-network GeoJSON fetches by zoom instead of dumping 153k', () => {
    expect(fullRoadsFetchLimit(8)).toBe(1200);
    expect(fullRoadsFetchLimit(10)).toBe(2500);
    expect(fullRoadsFetchLimit(12)).toBe(4500);
    expect(fullRoadsFetchLimit(14)).toBe(7000);
    expect(fullRoadsFetchLimit(14, true)).toBe(8000);
    expect(fullRoadsFetchLimit(8, true)).toBeLessThan(fullRoadsFetchLimit(14, true));
  });
});
