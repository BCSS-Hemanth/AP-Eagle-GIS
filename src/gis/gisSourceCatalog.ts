/**
 * Catalog of converted GIS-Source sample layers under public/geo/gis-source/.
 * Phase 1A = Admin (see ADMIN_GIS_SOURCE_SAFETY for blocked primary-drill replacements).
 * Phase 1B = independent OPS KMZs (ops_lyrs placemarks).
 *
 * Independent OPS KMZ features (standalone map overlays; no VSP.shp / raster / analytics):
 * asr_boundary, pharma_hubs, check_posts, d_routes, ddacs, entry_exit, ganja_seized,
 * hotspots, foot_tracks, internal_roads, main_roads, stock_points, toll_plazas.
 *
 * Conflict resolution (GIS-Source wins):
 * - d_routes → lyr-drug-routes (replaces public/geo/ap-agency-route.geojson)
 * - foot_tracks → lyr-forest-trails (replaces Waymarked Trails OSM tiles)
 * - check_posts → lyr-checkposts (tolls split to lyr-toll-plazas)
 * - hotspots / ganja_seized / asr_boundary / pharma_hubs fill former empty stubs
 * - Admin ap_roads_major stays Admin; OPS main_roads / internal_roads are separate OPS layers
 * - OPS VSP.shp roads: PostGIS load (`npm run db:load-roads`) reprojects LCC→WGS84; API layer=vsp
 * - Full ap_roads + National Highways: PostGIS (`layer=full` / `layer=nh`); replaces OSRM NH sketch when API is up
 *
 * Phase 1C = Raster KMZ GroundOverlays (WGS84 LatLonBox; no GeoTIFF/DEM in source).
 * Conflict resolution (GIS-Source wins):
 * - lyr-cartosat → google_sat + aob + nt_cg (removes Esri World Imagery overlay)
 * - lyr-hillshade → google_terrain (removes Esri World Hillshade)
 * - basemap topo AOI → soi_topo (OpenTopoMap demoted; OSM underlay only outside coverage)
 * - basemap satellite/hybrid → Esri World Imagery only (GIS-Source sat AOI not stacked; avoids rectangular patch)
 */
export const GIS_SOURCE_ADMIN_BASE = '/geo/gis-source/admin';
export const GIS_SOURCE_OPS_BASE = '/geo/gis-source/ops';
export const GIS_SOURCE_RASTER_BASE = '/geo/gis-source/raster';

export const GIS_SOURCE_ADMIN_LAYERS = {
  state: `${GIS_SOURCE_ADMIN_BASE}/ap_state_gis_source.geojson`,
  districts: `${GIS_SOURCE_ADMIN_BASE}/ap_districts_gis_source.geojson`,
  taluk: `${GIS_SOURCE_ADMIN_BASE}/ap_taluk_gis_source.geojson`,
  vspVillages: `${GIS_SOURCE_ADMIN_BASE}/vsp_villages_pts.geojson`,
  borderPs: `${GIS_SOURCE_ADMIN_BASE}/border_ps.geojson`,
  soi50k: `${GIS_SOURCE_ADMIN_BASE}/soi_50k_grid.geojson`,
  rail: `${GIS_SOURCE_ADMIN_BASE}/rail_nt.geojson`,
  roadsMajor: `${GIS_SOURCE_ADMIN_BASE}/ap_roads_major.geojson`,
} as const;

export const GIS_SOURCE_OPS_LAYERS = {
  asrBoundary: `${GIS_SOURCE_OPS_BASE}/asr_boundary.geojson`,
  pharmaHubs: `${GIS_SOURCE_OPS_BASE}/pharma_hubs.geojson`,
  checkPosts: `${GIS_SOURCE_OPS_BASE}/check_posts.geojson`,
  dRoutes: `${GIS_SOURCE_OPS_BASE}/d_routes.geojson`,
  ddacs: `${GIS_SOURCE_OPS_BASE}/ddacs.geojson`,
  entryExit: `${GIS_SOURCE_OPS_BASE}/entry_exit.geojson`,
  ganjaSeized: `${GIS_SOURCE_OPS_BASE}/ganja_seized.geojson`,
  hotspots: `${GIS_SOURCE_OPS_BASE}/hotspots.geojson`,
  footTracks: `${GIS_SOURCE_OPS_BASE}/foot_tracks.geojson`,
  internalRoads: `${GIS_SOURCE_OPS_BASE}/internal_roads.geojson`,
  mainRoads: `${GIS_SOURCE_OPS_BASE}/main_roads.geojson`,
  stockPoints: `${GIS_SOURCE_OPS_BASE}/stock_points.geojson`,
  tollPlazas: `${GIS_SOURCE_OPS_BASE}/toll_plazas.geojson`,
} as const;

export const GIS_SOURCE_RASTER_PRODUCTS = {
  googleRoadmap: `${GIS_SOURCE_RASTER_BASE}/google_roadmap/manifest.json`,
  googleSat: `${GIS_SOURCE_RASTER_BASE}/google_sat/manifest.json`,
  googleTerrain: `${GIS_SOURCE_RASTER_BASE}/google_terrain/manifest.json`,
  aob: `${GIS_SOURCE_RASTER_BASE}/aob/manifest.json`,
  ntCg: `${GIS_SOURCE_RASTER_BASE}/nt_cg/manifest.json`,
  soiTopo: `${GIS_SOURCE_RASTER_BASE}/soi_topo/manifest.json`,
} as const;

export type GisSourceAdminLayerId = keyof typeof GIS_SOURCE_ADMIN_LAYERS;
export type GisSourceOpsLayerId = keyof typeof GIS_SOURCE_OPS_LAYERS;
export type GisSourceRasterProductId = keyof typeof GIS_SOURCE_RASTER_PRODUCTS;

export type GisRasterOverlay = {
  id: string;
  name: string;
  url: string;
  north: number;
  south: number;
  east: number;
  west: number;
  rotation: number;
  level: number;
  areaDeg2: number;
  sourceKmz: string;
};

export type GisRasterManifest = {
  id: string;
  label: string;
  role: string;
  overlayCount: number;
  levels: number[];
  coverage: { north: number; south: number; east: number; west: number };
  overlays: GisRasterOverlay[];
};
