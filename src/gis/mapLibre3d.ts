export function webglIsAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export const MAP_VIEW_3D_NOTE =
  '3D uses MapLibre GL: OSM raster on a tilted globe, AWS/Mapzen elevation when DEM tiles load, and OSM building extrusion where footprints exist. This is not Google Photorealistic 3D.';

export const MAP_VIEW_3D_LAYER_LIMITS =
  'Works in 3D: district→mandal→village isolation, boundaries, labels, police stations, markers, inspect, measure, routes, rotate/tilt/zoom, terrain when DEM loads, overlay rasters (roads, rail, trails, imagery, places) when those layers are on. 2D-only: box-zoom rectangle, Leaflet digitizer, SOI graticule, 2D basemap picker. Fallback: no WebGL stays on 2D; DEM failure keeps tilt on a flat globe; buildings omit areas without OSM building footprints.';
