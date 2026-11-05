import type { RasterBasemapId } from '../types/gis';
import { featureBbox, pointInFeature, type LonLat } from './adminHierarchy';

export const MAP_CAMERA_MIN_ZOOM = 3;

/**
 * Camera ceiling = the highest zoom any public tile set in this app still serves.
 * Esri World Imagery goes to 23; OSM raster stops at 19 and then overzooms.
 * Do not pick a lower number as an arbitrary UI cap.
 */
export const MAP_DETAIL_MAX_ZOOM = 23;
export const MAP_CAMERA_MAX_ZOOM = MAP_DETAIL_MAX_ZOOM;

export function clampMapZoom(zoom: number, fallback = 7): number {
  if (!Number.isFinite(zoom)) return fallback;
  return Math.min(MAP_CAMERA_MAX_ZOOM, Math.max(MAP_CAMERA_MIN_ZOOM, zoom));
}

/** Leaflet: request native tiles up to `nativeMax`, then scale them through the camera ceiling. */
export function leafletOverzoom(nativeMax: number): { maxNativeZoom: number; maxZoom: number } {
  return {
    maxNativeZoom: nativeMax,
    maxZoom: MAP_CAMERA_MAX_ZOOM,
  };
}

/**
 * Zoom bands for basemap detail and admin identify.
 * Values are inclusive minimums. Nothing below a band is invented.
 */
export const MAP_ZOOM = {
  /** District name from 2022 polygons. */
  districtIdentify: 3,
  /** Mandal name from NWIC mandal polygons. */
  mandalIdentify: 8,
  /** Village polygons may load (bbox-tiled). */
  villagePolygons: 9,
  /** Village name from pointer-in-polygon. */
  villageIdentify: 10,
  /** OSM raster over sparse MapLibre Liberty so streets remain visible. */
  osmRasterBoost: 11,
  /** Esri transportation / local road casings. */
  localRoads: 8,
  /** Esri World Imagery for rooftops, fields, and water. */
  satelliteDetail: 14,
  /** OSM raster draws building footprints (not extruded 3D). */
  osmBuildings: 16,
} as const;

export type MapZoomBand = 'state' | 'district' | 'mandal' | 'village' | 'settlement';

export function mapZoomBand(zoom: number): MapZoomBand {
  if (zoom >= MAP_ZOOM.osmBuildings) return 'settlement';
  if (zoom >= MAP_ZOOM.villageIdentify) return 'village';
  if (zoom >= MAP_ZOOM.mandalIdentify) return 'mandal';
  if (zoom >= 6) return 'district';
  return 'state';
}

export interface AdminIdentifyHit {
  zoom: number;
  band: MapZoomBand;
  district?: string;
  mandal?: string;
  village?: string;
}

export function findContainingFeature(
  point: LonLat,
  features: GeoJSON.Feature[]
): GeoJSON.Feature | null {
  let best: GeoJSON.Feature | null = null;
  let bestArea = Infinity;
  for (const feature of features) {
    if (!pointInFeature(point, feature)) continue;
    const box = featureBbox(feature);
    const area = box ? Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]) : Infinity;
    if (area < bestArea) {
      bestArea = area;
      best = feature;
    }
  }
  return best;
}

export function identifyAdminAtPoint(
  point: LonLat,
  zoom: number,
  districts: GeoJSON.Feature[],
  mandals: GeoJSON.Feature[],
  villages: GeoJSON.Feature[]
): AdminIdentifyHit {
  const band = mapZoomBand(zoom);
  const hit: AdminIdentifyHit = { zoom, band };
  const district = findContainingFeature(point, districts);
  if (district) {
    hit.district = String(
      (district.properties as { district_name?: string } | null)?.district_name ?? ''
    );
  }
  if (zoom >= MAP_ZOOM.mandalIdentify) {
    const mandal = findContainingFeature(point, mandals);
    if (mandal) {
      const props = (mandal.properties ?? {}) as { mandal_name?: string; district_name?: string };
      hit.mandal = props.mandal_name;
      if (!hit.district && props.district_name) hit.district = props.district_name;
    }
  }
  if (zoom >= MAP_ZOOM.villageIdentify) {
    const village = findContainingFeature(point, villages);
    if (village) {
      const props = (village.properties ?? {}) as {
        village_name?: string;
        mandal_name?: string;
        district_name?: string;
      };
      hit.village = props.village_name;
      if (!hit.mandal && props.mandal_name) hit.mandal = props.mandal_name;
      if (!hit.district && props.district_name) hit.district = props.district_name;
    }
  }
  return hit;
}

export function formatIdentifyLines(hit: AdminIdentifyHit): string[] {
  const lines: string[] = [];
  if (hit.village) lines.push(`Village: ${hit.village}`);
  if (hit.mandal) lines.push(`Mandal: ${hit.mandal}`);
  if (hit.district) lines.push(`District: ${hit.district}`);
  return lines;
}

export function formatIdentifyHtml(hit: AdminIdentifyHit): string {
  const lines = formatIdentifyLines(hit);
  if (!lines.length) return '';
  const title = hit.village ? hit.village : hit.mandal ? hit.mandal : hit.district ?? '';
  const kind = hit.village ? 'Village' : hit.mandal ? 'Mandal' : 'District';
  const path = lines.join('<br/>');
  return `<div class="ap-admin-identify"><div class="ap-admin-identify-kind">${kind}</div><div class="ap-admin-identify-title">${title}</div><div class="ap-admin-identify-path">${path}</div></div>`;
}

export function shouldOverlayOsmRaster(zoom: number, useMapLibre: boolean, drillActive: boolean): boolean {
  return useMapLibre && (drillActive || zoom >= MAP_ZOOM.osmRasterBoost);
}

export function shouldOverlaySatellite(
  zoom: number,
  rasterId: RasterBasemapId,
  drillLevel: string,
  forced: boolean
): boolean {
  if (forced) return true;
  if (rasterId === 'satellite' || rasterId === 'hybrid') return false;
  if (drillLevel === 'village') return true;
  if (drillLevel === 'mandal' && zoom >= 13) return true;
  return zoom >= MAP_ZOOM.satelliteDetail;
}

export function shouldDrawMandals(drillLevel: string): boolean {
  return drillLevel === 'district' || drillLevel === 'mandal';
}

export function shouldDrawVillages(drillLevel: string): boolean {
  return drillLevel === 'mandal' || drillLevel === 'village';
}

export function shouldOverlayRoads(zoom: number, showHighways: boolean, useMapLibre: boolean, drillActive: boolean): boolean {
  if (showHighways || drillActive) return true;
  return useMapLibre && zoom >= MAP_ZOOM.osmRasterBoost;
}

/** Place labels stay off on the statewide district view so 26 borders stay readable. */
export function shouldOverlayPlaces(zoom: number, showPlaces: boolean, drillActive: boolean): boolean {
  if (!(showPlaces || drillActive)) return false;
  return zoom >= (drillActive ? 6 : 10);
}

export const MAP_DETAIL_SOURCES = {
  osmRaster: 'OpenStreetMap raster tiles (roads, water, landcover, building footprints at z≥16).',
  maplibreLiberty: 'OpenFreeMap Liberty vector style (no API key). Sparse at high zoom — OSM raster is stacked from z11.',
  esriImagery:
    'Esri World Imagery is the statewide gap-fill underlay. GIS-Source google_sat + AOB + NT_CG GroundOverlays paint on top only inside their AOIs (not full AP).',
  esriRoads: 'Esri World Transportation reference overlay.',
  esriPlaces: 'Esri World Boundaries and Places labels.',
  buildings2d: 'Building outlines come from OSM raster at z≥16. They are not extruded.',
  buildings3d: '3D extrusion only where OSM records height or render_height. No default fake height.',
  adminDistricts: '26-district 2022 GeoJSON, WGS84.',
  adminMandals: '654 NWIC/SOI mandal polygons (vintage names; spatially parented to 2022 districts).',
  adminVillages: '18,100 NWIC/SOI village polygons, loaded by view bbox from z9.',
  osmRivers: 'OSM Overpass centerlines for Godavari, Krishna, Penna, Nagavali, Vamsadhara, Tungabhadra.',
  osmWater: 'OSM Overpass named lakes and reservoirs in the AP envelope (ODbL).',
  esriHillshade:
    'Replaced by GIS-Source google_terrain GroundOverlay. Esri World Hillshade is no longer used.',
  geodesicBuffer: 'Client-side geodesic multi-ring buffer (QGIS native:multiringconstantbuffer analog) on WGS84.',
  unavailable: 'ISRO Cartosat-3 native GeoTIFF and DEM float grids were not in GIS-Source Raster.',
} as const;

export const MAP_COMPONENT_ACCEPTANCE = {
  dashboard: [
    'Hover at z≥8 names the mandal under the pointer, not only the district.',
    'Hover at z≥10 names the village when that village polygon is loaded for the view.',
    'Zoom z≥11 shows OSM roads; z≥14 shows Esri imagery statewide with GIS-Source sat overlays in AOI.',
    'District→mandal→village isolation still hides other admin units.',
  ],
  mapViewer: [
    'Same identify rules as the dashboard, on both 2D Leaflet and 3D MapLibre.',
    'MapLibre Liberty is not the only high-zoom surface: OSM raster and Esri roads/places stack above it.',
    'Village isolation shows imagery + roads inside the hole; 2D stays mounted when switching 3D.',
  ],
  digitizer: [
    'ASR Eastern Ghats canvas uses GIS-Source satellite / SOI mosaics plus road/place overlays.',
    'Zooming into AOB / NT_CG / SOI coverage reveals KMZ GroundOverlay LODs from GIS-Source Raster.',
    'Hover reports district, mandal, and village from real polygons at the matching zoom band.',
    'Draw clicks still place vertices; identify tooltip is not a draw target.',
  ],
} as const;

export function mapDetailCaption(
  zoom: number,
  rasterId: RasterBasemapId,
  useMapLibre: boolean,
  imageryOn: boolean
): string {
  const band = mapZoomBand(zoom);
  const tiles: string[] = [];
  if (rasterId === 'satellite' || rasterId === 'hybrid') {
    tiles.push('Esri imagery');
  } else if (imageryOn) {
    tiles.push('Esri imagery + GIS-Source sat AOI');
  }
  if (useMapLibre) tiles.push(zoom >= MAP_ZOOM.osmRasterBoost ? 'OSM raster' : 'OpenFreeMap Liberty');
  else if (rasterId === 'topo') tiles.push('GIS-Source SOI topo');
  else if (rasterId === 'vector' && !imageryOn) tiles.push('OSM raster');
  tiles.push('Esri roads/places');
  return `z${zoom.toFixed(0)} · ${band} · ${tiles.join(' + ')}`;
}
