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
 * - Full ap_roads + National Highways: PostGIS (`layer=full` / `layer=nh`); replaces OSRM NH sketch when API is up
 *
 * Phase 1C = Raster KMZ GroundOverlays (WGS84 LatLonBox; no GeoTIFF/DEM in source).
 * Conflict resolution (GIS-Source wins):
 * - basemap topo AOI → soi_topo (OpenTopoMap demoted; OSM underlay only outside coverage)
 * - basemap satellite/hybrid → Esri World Imagery (GIS-Source sat AOI packs removed)
 */
export const GIS_SOURCE_ADMIN_BASE = '/geo/gis-source/admin';
export const GIS_SOURCE_OPS_BASE = '/geo/gis-source/ops';
export const GIS_SOURCE_ROADS_BASE = '/geo/gis-source/roads';
export const GIS_SOURCE_RASTER_BASE = '/geo/gis-source/raster';

export const GIS_SOURCE_ADMIN_LAYERS = {
  state: `${GIS_SOURCE_ADMIN_BASE}/ap_state_gis_source.geojson`,
  districts: `${GIS_SOURCE_ADMIN_BASE}/ap_districts_gis_source.geojson`,
  taluk: `${GIS_SOURCE_ADMIN_BASE}/ap_taluk_gis_source.geojson`,
  vspVillages: `${GIS_SOURCE_ADMIN_BASE}/vsp_villages_pts.geojson`,
  borderPs: `${GIS_SOURCE_ADMIN_BASE}/border_ps.geojson`,
  proposedAnpr: `${GIS_SOURCE_ADMIN_BASE}/proposed_anpr_locations.geojson`,
  apNeighborStates: `${GIS_SOURCE_ADMIN_BASE}/ap_neighbor_states.geojson`,
  aobDists: `${GIS_SOURCE_ADMIN_BASE}/aob_dists.geojson`,
  kmzVillages: `${GIS_SOURCE_ADMIN_BASE}/kmz_villages.geojson`,
  psBorderArea: `${GIS_SOURCE_ADMIN_BASE}/ps_border_area.geojson`,
  atlasMapData: `${GIS_SOURCE_ADMIN_BASE}/atlas_map_data.geojson`,
  rail: `${GIS_SOURCE_ADMIN_BASE}/rail_nt.geojson`,
  roadsMajor: `${GIS_SOURCE_ADMIN_BASE}/ap_roads_major.geojson`,
} as const;

/** Road Network KMZ products. Independent of OPS d_routes (`lyr-drug-routes`). */
export const GIS_SOURCE_ROAD_KMZ_LAYERS = {
  ganjaTransportRoutes: `${GIS_SOURCE_ROADS_BASE}/ganja_transport_routes.geojson`,
  roadsAsrClassified: `${GIS_SOURCE_ROADS_BASE}/roads_asr_classified.geojson`,
  asrRoadNetwork: `${GIS_SOURCE_ROADS_BASE}/asr_road_network.geojson`,
  routeModeling: `${GIS_SOURCE_ROADS_BASE}/route_modeling.geojson`,
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
