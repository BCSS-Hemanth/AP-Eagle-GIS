import { describe, expect, it } from 'vitest';
import {
  MAP_VIEW_3D_LAYER_LIMITS,
  MAP_VIEW_3D_NOTE,
  lonLatToTile,
  webglIsAvailable,
} from './mapLibre3d';

describe('mapLibre3d view-mode notes', () => {
  it('documents 3D fallback when WebGL or DEM is missing', () => {
    expect(MAP_VIEW_3D_NOTE).toMatch(/not Google/i);
    expect(MAP_VIEW_3D_NOTE).toMatch(/OSM raster/i);
    expect(MAP_VIEW_3D_NOTE).toMatch(/OSM records height/);
    expect(MAP_VIEW_3D_LAYER_LIMITS).toMatch(/no WebGL stays on 2D/);
    expect(MAP_VIEW_3D_LAYER_LIMITS).toMatch(/DEM failure/);
    expect(MAP_VIEW_3D_LAYER_LIMITS).toMatch(/box-zoom rectangle/);
    expect(MAP_VIEW_3D_LAYER_LIMITS).toMatch(/district→mandal→village isolation/);
  });

  it('reports WebGL from a canvas probe', () => {
    expect(typeof webglIsAvailable()).toBe('boolean');
  });

  it('converts WGS84 lon/lat to web-mercator tile indices', () => {
    expect(lonLatToTile(0, 0, 1)).toEqual({ x: 1, y: 1, z: 1 });
    const ongole = lonLatToTile(80.0499, 15.5057, 10);
    expect(ongole.z).toBe(10);
    expect(ongole.x).toBeGreaterThan(700);
    expect(ongole.x).toBeLessThan(900);
    expect(ongole.y).toBeGreaterThan(400);
    expect(ongole.y).toBeLessThan(600);
  });
});
