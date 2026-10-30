import { MAPLIBRE_TERRAIN_TILES } from '../data/apGeo';

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
  '3D uses MapLibre GL: OSM raster on a tilted globe. Right-drag rotates, the pitch slider tilts, scroll zooms. Terrain uses Mapzen/AWS DEM only after a tile loads. Buildings extrude only where OSM records height. Not Google Photorealistic 3D.';

export const MAP_VIEW_3D_LAYER_LIMITS =
  'Works in 3D: district→mandal→village isolation, boundaries, labels, police stations, markers, inspect, measure, routes, rotate/tilt/zoom, terrain when DEM loads, overlay rasters (roads, rail, trails, imagery, places) when those layers are on. 2D-only: box-zoom rectangle, Leaflet digitizer, SOI graticule, 2D basemap picker. Fallback: no WebGL stays on 2D; DEM failure keeps tilt on a flat globe; buildings omit footprints without OSM height.';

/** Web-mercator tile index for a WGS84 lon/lat (used to probe Terrarium DEM). */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number; z: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y, z };
}

/** True only if a real Terrarium PNG for that location loads. Does not invent elevation. */
export function probeTerrariumDem(lat: number, lon: number, z = 10): Promise<boolean> {
  const tile = lonLatToTile(lon, lat, z);
  const url = MAPLIBRE_TERRAIN_TILES.replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y));
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok: boolean) => {
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.crossOrigin = 'anonymous';
    img.onload = () => done(img.naturalWidth > 0);
    img.onerror = () => done(false);
    img.src = url;
  });
}
