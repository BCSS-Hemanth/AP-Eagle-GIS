import { describe, expect, it } from 'vitest';
import {
  MAP_CAMERA_MAX_ZOOM,
  MAP_CAMERA_MIN_ZOOM,
  MAP_COMPONENT_ACCEPTANCE,
  MAP_DETAIL_MAX_ZOOM,
  MAP_DETAIL_SOURCES,
  MAP_ZOOM,
  clampMapZoom,
  findContainingFeature,
  formatIdentifyLines,
  identifyAdminAtPoint,
  mapDetailCaption,
  mapZoomBand,
  shouldDrawMandals,
  shouldDrawVillages,
  shouldOverlayOsmRaster,
  shouldOverlayPlaces,
  shouldOverlayRoads,
  shouldOverlaySatellite,
} from './mapDetail';

function square(
  west: number,
  south: number,
  east: number,
  north: number,
  props: Record<string, string>
): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: props,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  };
}

const palnadu = square(79.5, 16.1, 80.3, 16.7, { district_name: 'Palnadu' });
const piduguralla = square(79.8, 16.4, 80.0, 16.55, {
  mandal_name: 'Piduguralla',
  district_name: 'Palnadu',
});
const janapadu = square(79.83, 16.46, 79.88, 16.5, {
  village_name: 'Janapadu',
  mandal_name: 'Piduguralla',
  district_name: 'Palnadu',
});

describe('map zoom bands and overlays', () => {
  it('lets the camera reach Esri imagery LOD 23 instead of an arbitrary 19 cap', () => {
    expect(MAP_DETAIL_MAX_ZOOM).toBe(23);
    expect(MAP_CAMERA_MAX_ZOOM).toBe(23);
    expect(clampMapZoom(19)).toBe(19);
    expect(clampMapZoom(22.4)).toBe(22.4);
    expect(clampMapZoom(30)).toBe(23);
    expect(clampMapZoom(1)).toBe(MAP_CAMERA_MIN_ZOOM);
  });

  it('names bands used by the three map surfaces', () => {
    expect(mapZoomBand(5)).toBe('state');
    expect(mapZoomBand(7)).toBe('district');
    expect(mapZoomBand(8)).toBe('mandal');
    expect(mapZoomBand(12)).toBe('village');
    expect(mapZoomBand(16)).toBe('settlement');
  });

  it('stacks OSM raster over MapLibre from z11, not only during drill', () => {
    expect(shouldOverlayOsmRaster(10, true, false)).toBe(false);
    expect(shouldOverlayOsmRaster(11, true, false)).toBe(true);
    expect(shouldOverlayOsmRaster(9, true, true)).toBe(true);
    expect(shouldOverlayOsmRaster(18, false, false)).toBe(false);
  });

  it('overlays Esri imagery at village isolation and at z≥14, never as Cartosat', () => {
    expect(shouldOverlaySatellite(12, 'vector', 'village', false)).toBe(true);
    expect(shouldOverlaySatellite(13, 'vector', 'mandal', false)).toBe(true);
    expect(shouldOverlaySatellite(13, 'vector', 'district', false)).toBe(false);
    expect(shouldOverlaySatellite(14, 'vector', 'state', false)).toBe(true);
    expect(shouldOverlaySatellite(18, 'satellite', 'village', false)).toBe(false);
    expect(MAP_DETAIL_SOURCES.esriImagery).toMatch(/Not ISRO Cartosat-3/);
  });

  it('keeps road casings off on the statewide district view', () => {
    expect(shouldOverlayRoads(7, false, false, false)).toBe(false);
    expect(shouldOverlayRoads(8, false, false, false)).toBe(false);
    expect(shouldOverlayRoads(6, false, true, false)).toBe(false);
    expect(shouldOverlayRoads(11, false, true, false)).toBe(true);
    expect(shouldOverlayRoads(7, true, false, false)).toBe(true);
    expect(shouldOverlayRoads(7, false, false, true)).toBe(true);
  });

  it('draws mandals and villages only after a district click, not statewide', () => {
    expect(shouldDrawMandals('state')).toBe(false);
    expect(shouldDrawVillages('state')).toBe(false);
    expect(shouldDrawMandals('district')).toBe(true);
    expect(shouldDrawVillages('district')).toBe(false);
    expect(shouldDrawMandals('mandal')).toBe(true);
    expect(shouldDrawVillages('mandal')).toBe(true);
    expect(shouldDrawVillages('village')).toBe(true);
    expect(shouldOverlayPlaces(7, false, false)).toBe(false);
    expect(shouldOverlayPlaces(8, false, true)).toBe(true);
  });

  it('captions the live stack without claiming Cartosat', () => {
    const text = mapDetailCaption(15, 'vector', true, true);
    expect(text).toContain('Esri World Imagery');
    expect(text).toContain('not Cartosat-3');
  });
});

describe('pointer identify', () => {
  it('reports only the district below mandal zoom', () => {
    const hit = identifyAdminAtPoint(
      [79.85, 16.48],
      7,
      [palnadu],
      [piduguralla],
      [janapadu]
    );
    expect(hit.district).toBe('Palnadu');
    expect(hit.mandal).toBeUndefined();
    expect(hit.village).toBeUndefined();
  });

  it('adds mandal then village as zoom crosses the published bands', () => {
    const atMandal = identifyAdminAtPoint(
      [79.85, 16.48],
      MAP_ZOOM.mandalIdentify,
      [palnadu],
      [piduguralla],
      [janapadu]
    );
    expect(atMandal.mandal).toBe('Piduguralla');
    expect(atMandal.village).toBeUndefined();

    const atVillage = identifyAdminAtPoint(
      [79.85, 16.48],
      MAP_ZOOM.villageIdentify,
      [palnadu],
      [piduguralla],
      [janapadu]
    );
    expect(formatIdentifyLines(atVillage)).toEqual([
      'Village: Janapadu',
      'Mandal: Piduguralla',
      'District: Palnadu',
    ]);
  });

  it('prefers the smallest containing polygon when admin units nest', () => {
    const inner = findContainingFeature(
      [79.85, 16.48],
      [palnadu, piduguralla, janapadu]
    );
    expect((inner?.properties as { village_name?: string }).village_name).toBe('Janapadu');
  });

  it('lists acceptance criteria for dashboard, map viewer, and digitizer', () => {
    expect(MAP_COMPONENT_ACCEPTANCE.dashboard.length).toBeGreaterThan(2);
    expect(MAP_COMPONENT_ACCEPTANCE.mapViewer.length).toBeGreaterThan(2);
    expect(MAP_COMPONENT_ACCEPTANCE.digitizer.length).toBeGreaterThan(2);
  });
});
