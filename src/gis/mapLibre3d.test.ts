import { describe, expect, it } from 'vitest';
import { MAP_VIEW_3D_LAYER_LIMITS, MAP_VIEW_3D_NOTE, webglIsAvailable } from './mapLibre3d';

describe('mapLibre3d view-mode notes', () => {
  it('documents 3D fallback when WebGL or DEM is missing', () => {
    expect(MAP_VIEW_3D_NOTE).toMatch(/not Google/i);
    expect(MAP_VIEW_3D_NOTE).toMatch(/OSM raster/i);
    expect(MAP_VIEW_3D_LAYER_LIMITS).toMatch(/no WebGL stays on 2D/);
    expect(MAP_VIEW_3D_LAYER_LIMITS).toMatch(/DEM failure/);
    expect(MAP_VIEW_3D_LAYER_LIMITS).toMatch(/box-zoom rectangle/);
    expect(MAP_VIEW_3D_LAYER_LIMITS).toMatch(/district→mandal→village isolation/);
  });

  it('reports WebGL from a canvas probe', () => {
    expect(typeof webglIsAvailable()).toBe('boolean');
  });
});
