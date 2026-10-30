import type { RasterBasemapId } from '../types/gis';

/** WGS84 envelope of Andhra Pradesh (post-2014, 26-district state). */
export const AP_BOUNDS: [[number, number], [number, number]] = [
  [12.62, 76.75],
  [19.22, 84.78],
];

export const AP_CENTER: [number, number] = [15.9129, 79.74];
export const AP_DEFAULT_ZOOM = 7;

/** OSM vector tiles via MapLibre GL — OpenFreeMap, no API key. Not Google. */
export const MAPLIBRE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const MAPLIBRE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://openfreemap.org">OpenFreeMap</a>';

/** Mapzen/Amazon Terrarium DEM — used only by the standalone 3D MapLibre view. */
export const MAPLIBRE_TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const MAPLIBRE_3D_ATTRIBUTION =
  'Terrain &copy; Mapzen / AWS elevation tiles. 3D buildings from OpenStreetMap where heights exist. Not Google.';

export const BASEMAP_TILES: Record<
  RasterBasemapId,
  { url: string; attribution: string; maxZoom: number; labelsUrl?: string }
> = {
  vector: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap, SRTM | &copy; OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 23,
  },
  hybrid: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri | Labels &copy; CARTO',
    maxZoom: 23,
    labelsUrl:
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
  },
};

export const OPENRAILWAY_TILES = {
  url: 'https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap | OpenRailwayMap',
  maxZoom: 19,
};

/** Esri World Transportation — authentic road casings over imagery / choropleth. */
export const ESRI_TRANSPORT_TILES = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Roads &copy; Esri',
  maxZoom: 19,
};

/** Esri place / boundary annotation (mandals, towns, landmarks). */
export const ESRI_PLACES_TILES = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Places &copy; Esri',
  maxZoom: 19,
};

/** OSM hiking / forest tracks (Waymarked Trails). */
export const HIKING_TRAIL_TILES = {
  url: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
  attribution: '&copy; Waymarked Trails / OSM',
  maxZoom: 18,
};

export const AGENCY_DISTRICT_NAMES = ['Alluri Sitharama Raju', 'Parvathipuram Manyam'];

/** NH-16 / Golden Quadrilateral coastal-andhra waypoints (WGS84). */
export const NH16_SPINE: [number, number][] = [
  [19.1138, 84.6872], // Ichchapuram
  [18.6725, 84.4596], // Palasa
  [18.2949, 83.8938], // Srikakulam
  [18.1067, 83.3956], // Vizianagaram
  [17.6868, 83.2185], // Visakhapatnam
  [17.6896, 83.0024], // Anakapalli
  [17.2789, 82.401], // Tuni
  [17.0005, 81.7799], // Rajahmundry
  [16.7107, 81.0952], // Eluru
  [16.5062, 80.648], // Vijayawada
  [16.3067, 80.4365], // Guntur
  [15.5057, 80.0499], // Ongole
  [14.4426, 79.9864], // Nellore
  [13.6288, 79.4192], // Tirupati approach
];

export const MAJOR_CITIES: Array<{
  name: string;
  lat: number;
  lon: number;
  kind: 'city' | 'airport' | 'seaport' | 'hq';
}> = [
  { name: 'Visakhapatnam', lat: 17.6868, lon: 83.2185, kind: 'seaport' },
  { name: 'Vijayawada', lat: 16.5062, lon: 80.648, kind: 'city' },
  { name: 'Guntur', lat: 16.3067, lon: 80.4365, kind: 'city' },
  { name: 'Tirupati', lat: 13.6288, lon: 79.4192, kind: 'city' },
  { name: 'Kurnool', lat: 15.8281, lon: 78.0373, kind: 'city' },
  { name: 'Kakinada', lat: 16.9891, lon: 82.2475, kind: 'seaport' },
  { name: 'Rajahmundry', lat: 17.0005, lon: 81.7799, kind: 'city' },
  { name: 'Nellore', lat: 14.4426, lon: 79.9864, kind: 'city' },
  { name: 'Anantapur', lat: 14.6819, lon: 77.6006, kind: 'city' },
  { name: 'Chittoor', lat: 13.2172, lon: 79.1003, kind: 'city' },
  { name: 'Srikakulam', lat: 18.2949, lon: 83.8938, kind: 'hq' },
  { name: 'Vizianagaram', lat: 18.1067, lon: 83.3956, kind: 'hq' },
  { name: 'Eluru', lat: 16.7107, lon: 81.0952, kind: 'hq' },
  { name: 'Ongole', lat: 15.5057, lon: 80.0499, kind: 'hq' },
  { name: 'Amaravati', lat: 16.513, lon: 80.518, kind: 'hq' },
];
