import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  adminDrillTo,
  adminDrillUp,
  adminNamesEqual,
  asFeatureCollection,
  drillFocusFeature,
  featureCentroid,
  filterByAdminName,
  filterFeaturesInParent,
  invertMaskGeoJSON,
  invertMaskLatLngs,
  pointInFeature,
  STATE_ADMIN_DRILL,
  WORLD_MASK_RING,
} from './adminHierarchy';

const root = resolvePath(fileURLToPath(new URL('.', import.meta.url)), '../..');

function square(west: number, south: number, east: number, north: number, props: Record<string, string>): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: props,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ]],
    },
  };
}

describe('admin hierarchy spatial join', () => {
  it('keeps child polygons whose centroid lies in the parent', () => {
    const parent = square(0, 0, 10, 10, { district_name: 'Parent' });
    const inside = square(2, 2, 3, 3, { mandal_name: 'Inside' });
    const outside = square(20, 20, 21, 21, { mandal_name: 'Outside' });
    const hole = square(0, 0, 1, 1, {
      mandal_name: 'Hole',
    });
    expect(pointInFeature([2.5, 2.5], parent)).toBe(true);
    expect(filterFeaturesInParent([inside, outside, hole], parent).map((f) => f.properties?.mandal_name)).toEqual([
      'Inside',
      'Hole',
    ]);
  });

  it('matches mandal names after stripping administrative tokens', () => {
    const children = asFeatureCollection([
      square(0, 0, 1, 1, { mandal_name: 'Markapur Mandal' }),
    ]).features;
    expect(filterByAdminName(children, 'mandal_name', 'markapur').length).toBe(1);
    expect(adminNamesEqual('Y.S.R.', 'YSR')).toBe(true);
  });

  it('parents Konakanamitla inside Prakasam using 2022 district polygons', () => {
    const districts = JSON.parse(
      readFileSync(resolvePath(root, 'public/geo/ap-districts-2022.geojson'), 'utf8')
    ) as GeoJSON.FeatureCollection;
    const mandals = JSON.parse(
      readFileSync(resolvePath(root, 'public/geo/ap-mandals.geojson'), 'utf8')
    ) as GeoJSON.FeatureCollection;
    const prakasam = districts.features.find((f) =>
      adminNamesEqual(String((f.properties as { district_name?: string }).district_name), 'Prakasam')
    );
    expect(prakasam).toBeTruthy();
    const inside = filterFeaturesInParent(mandals.features, prakasam!);
    expect(inside.length).toBeGreaterThan(10);
    expect(inside.some((f) => adminNamesEqual(String((f.properties as { mandal_name?: string }).mandal_name), 'Konakanamitla'))).toBe(
      true
    );
  });

  it('parents Palnadu mandals by centroid-in-polygon even when district_name is still Guntur', () => {
    const districts = JSON.parse(
      readFileSync(resolvePath(root, 'public/geo/ap-districts-2022.geojson'), 'utf8')
    ) as GeoJSON.FeatureCollection;
    const mandals = JSON.parse(
      readFileSync(resolvePath(root, 'public/geo/ap-mandals.geojson'), 'utf8')
    ) as GeoJSON.FeatureCollection;
    const palnadu = districts.features.find((f) =>
      adminNamesEqual(String((f.properties as { district_name?: string }).district_name), 'Palnadu')
    );
    expect(palnadu).toBeTruthy();
    const inside = filterFeaturesInParent(mandals.features, palnadu!);
    expect(inside.length).toBeGreaterThan(5);
    const vintage = new Set(
      inside.map((f) => String((f.properties as { district_name?: string }).district_name ?? ''))
    );
    expect([...vintage].some((name) => adminNamesEqual(name, 'Guntur') || adminNamesEqual(name, 'Palnadu'))).toBe(
      true
    );
  });

  it('walks village → mandal → district → state without dropping parent geometry', () => {
    const district = square(0, 0, 10, 10, { district_name: 'Demo' });
    const mandal = square(2, 2, 4, 4, { mandal_name: 'Inner' });
    const village = square(2.5, 2.5, 3, 3, { village_name: 'Hamlet' });
    const drilled = {
      level: 'village' as const,
      districtName: 'Demo',
      districtFeature: district,
      mandalName: 'Inner',
      mandalFeature: mandal,
      villageName: 'Hamlet',
      villageFeature: village,
    };
    expect(drillFocusFeature(drilled)?.properties).toMatchObject({ village_name: 'Hamlet' });
    const mandalLevel = adminDrillUp(drilled);
    expect(mandalLevel.level).toBe('mandal');
    expect(mandalLevel.villageFeature).toBeUndefined();
    expect(mandalLevel.mandalFeature).toBe(mandal);
    expect(adminDrillTo(mandalLevel, 'district').level).toBe('district');
    expect(adminDrillUp(adminDrillUp(mandalLevel))).toEqual(STATE_ADMIN_DRILL);
    expect(featureCentroid(village)).toEqual([2.75, 2.75]);
  });

  it('builds an invert mask whose hole is the selected polygon', () => {
    const selected = square(78, 15, 80, 17, { district_name: 'Clip' });
    const mask = invertMaskLatLngs(selected);
    expect(mask[0]).toEqual(WORLD_MASK_RING);
    expect(mask.length).toBe(2);
    const hole = mask[1];
    expect(hole.some(([lat, lon]) => lat === 15 && lon === 78)).toBe(true);
    expect(hole.some(([lat, lon]) => lat === 17 && lon === 80)).toBe(true);
  });

  it('builds a GeoJSON invert mask with lon/lat world ring and feature hole', () => {
    const selected = square(78, 15, 80, 17, { district_name: 'Clip' });
    const mask = invertMaskGeoJSON(selected);
    expect(mask?.geometry.type).toBe('Polygon');
    const rings = (mask?.geometry as GeoJSON.Polygon).coordinates;
    expect(rings[0][0]).toEqual([-180, 85]);
    expect(rings.length).toBe(2);
    expect(rings[1].some(([lon, lat]) => lon === 78 && lat === 15)).toBe(true);
  });
});
