/**
 * External GIS resources aligned with QGIS defaults / QuickMapServices,
 * filtered to what this browser GIS can actually consume without API keys.
 * Operational NDPS, Cartosat-3, Bhuvan WMS, and APSAC GeoServer are listed
 * only where they remain unavailable (CORS, licence, or no dataset in-repo).
 */

export interface GisSourceRecord {
  id: string;
  name: string;
  kind: 'xyz' | 'vector-tiles' | 'dem' | 'api' | 'local-geojson' | 'unavailable';
  url: string;
  license: string;
  apiKey: false | string;
  cost: 'free' | 'not configured';
  usedBy: string;
  status: 'live' | 'local' | 'not connected';
}

export const QGIS_ALIGNED_SOURCES: GisSourceRecord[] = [
  {
    id: 'osm-xyz',
    name: 'OpenStreetMap raster (QGIS default XYZ)',
    kind: 'xyz',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    license: 'ODbL — © OpenStreetMap contributors. Tile usage policy applies.',
    apiKey: false,
    cost: 'free',
    usedBy: '2D vector basemap, 3D globe, high-zoom road boost',
    status: 'live',
  },
  {
    id: 'openfreemap',
    name: 'OpenFreeMap Liberty / planet',
    kind: 'vector-tiles',
    url: 'https://tiles.openfreemap.org/styles/liberty',
    license: 'OSM ODbL via OpenFreeMap. No API key.',
    apiKey: false,
    cost: 'free',
    usedBy: 'MapLibre vector basemap and 3D building extrusion where OSM height exists',
    status: 'live',
  },
  {
    id: 'mapzen-terrarium',
    name: 'Mapzen Global Terrain (QGIS default DEM XYZ)',
    kind: 'dem',
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    license: 'Mapzen / AWS public elevation tiles (Terrarium encoding).',
    apiKey: false,
    cost: 'free',
    usedBy: '3D terrain mesh + hillshade after a probe tile loads',
    status: 'live',
  },
  {
    id: 'esri-imagery',
    name: 'Esri World Imagery',
    kind: 'xyz',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    license: 'Esri, Maxar, Earthstar Geographics. Attribution required. Not ISRO Cartosat-3.',
    apiKey: false,
    cost: 'free',
    usedBy: 'Satellite / hybrid basemap and village-level overlay',
    status: 'live',
  },
  {
    id: 'esri-hillshade',
    name: 'Esri World Hillshade',
    kind: 'xyz',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
    license: 'Esri public ArcGIS Online tiles. Attribution required. No API key.',
    apiKey: false,
    cost: 'free',
    usedBy: '2D/3D terrain relief overlay (QGIS XYZ catalog staple)',
    status: 'live',
  },
  {
    id: 'opentopomap',
    name: 'OpenTopoMap',
    kind: 'xyz',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    license: 'OSM + SRTM; cartography CC-BY-SA. Not SOI 1:50K GeoTIFF.',
    apiKey: false,
    cost: 'free',
    usedBy: 'Topo basemap',
    status: 'live',
  },
  {
    id: 'openrailway',
    name: 'OpenRailwayMap',
    kind: 'xyz',
    url: 'https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
    license: 'OSM ODbL + OpenRailwayMap.',
    apiKey: false,
    cost: 'free',
    usedBy: 'Railway overlay',
    status: 'live',
  },
  {
    id: 'waymarked',
    name: 'Waymarked Trails hiking',
    kind: 'xyz',
    url: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
    license: 'OSM ODbL / Waymarked Trails.',
    apiKey: false,
    cost: 'free',
    usedBy: 'Forest track overlay',
    status: 'live',
  },
  {
    id: 'nominatim',
    name: 'Nominatim geocoder',
    kind: 'api',
    url: 'https://nominatim.openstreetmap.org/search',
    license: 'OSM ODbL. Usage policy: identify app, 1 req/s.',
    apiKey: false,
    cost: 'free',
    usedBy: 'Map search fallback inside Andhra Pradesh viewbox',
    status: 'live',
  },
  {
    id: 'osrm',
    name: 'Project OSRM driving',
    kind: 'api',
    url: 'https://router.project-osrm.org/route/v1/driving/',
    license: 'OSM ODbL via public demo server (no SLA).',
    apiKey: false,
    cost: 'free',
    usedBy: 'Nearest-station routes and geoprocess driving line',
    status: 'live',
  },
  {
    id: 'open-meteo',
    name: 'Open-Meteo elevation (SRTM)',
    kind: 'api',
    url: 'https://api.open-meteo.com/v1/elevation',
    license: 'Open-Meteo open API. SRTM-derived point samples.',
    apiKey: false,
    cost: 'free',
    usedBy: 'Coordinate inspector and cursor elevation',
    status: 'live',
  },
  {
    id: 'nwic-soi-admin',
    name: 'NWIC / SOI AP village boundaries',
    kind: 'local-geojson',
    url: 'public/geo/villages/ + ap-mandals.geojson + ap-districts-2022.geojson',
    license: 'NWIC dataset vb_soi_ap (Survey of India village boundaries). Stored locally as WGS84 GeoJSON.',
    apiKey: false,
    cost: 'free',
    usedBy: 'District → mandal → village drill-down',
    status: 'local',
  },
  {
    id: 'osm-overpass-hydro',
    name: 'OSM Overpass rivers & water bodies',
    kind: 'local-geojson',
    url: 'https://overpass-api.de/api/interpreter',
    license: 'OSM ODbL. Cached as public/geo/ap-rivers.geojson and ap-waterbodies.geojson.',
    apiKey: false,
    cost: 'free',
    usedBy: 'River centerlines and named lakes/reservoirs',
    status: 'local',
  },
  {
    id: 'kmz-ps',
    name: 'Police Stations KMZ',
    kind: 'local-geojson',
    url: 'public/geo/ap-police-stations.geojson',
    license: 'User-supplied KMZ converted to 99 WGS84 points. Not a full AP station inventory.',
    apiKey: false,
    cost: 'free',
    usedBy: 'Police station layer, search, geodesic buffers',
    status: 'local',
  },
  {
    id: 'bhuvan-cartosat',
    name: 'Bhuvan / Cartosat-3',
    kind: 'unavailable',
    url: 'not configured',
    license: 'ISRO Bhuvan terms; typically requires registration. Not in this repo.',
    apiKey: 'ISRO / Bhuvan login if enabled later',
    cost: 'not configured',
    usedBy: 'Not wired (no CORS-safe WMS, no local GeoTIFF)',
    status: 'not connected',
  },
  {
    id: 'user-ingest',
    name: 'User ingest (QGIS OGR/GDAL/WMS/WFS analog)',
    kind: 'api',
    url: 'browser providers: GeoJSON, Shapefile, KML/KMZ, GPX, GML, CSV/XLSX, DXF, GPKG, GeoTIFF, ASCII Grid, SRTM HGT, WMS/WMTS, WFS, XYZ, ArcGIS REST',
    license: 'Depends on the file or service the operator loads. Existing AP catalog is never overwritten.',
    apiKey: false,
    cost: 'free',
    usedBy: 'Add Layer / Vector & Raster Data Import',
    status: 'live',
  },
  {
    id: 'apsac-geoserver',
    name: 'APSAC GeoServer mandal/village WFS',
    kind: 'unavailable',
    url: 'https://apsac.ap.gov.in/geoserver/',
    license: 'Andhra Pradesh Space Applications Centre. Browser CORS blocked; not a public tile API.',
    apiKey: false,
    cost: 'not configured',
    usedBy: 'Probed in scripts only — not consumed by the map',
    status: 'not connected',
  },
  {
    id: 'google-3d',
    name: 'Google Photorealistic 3D',
    kind: 'unavailable',
    url: 'not configured',
    license: 'Google Maps Platform; paid API key. Explicitly out of scope.',
    apiKey: 'Google Maps Platform key',
    cost: 'not configured',
    usedBy: 'Not used',
    status: 'not connected',
  },
];

export function liveGisSources(): GisSourceRecord[] {
  return QGIS_ALIGNED_SOURCES.filter((row) => row.status !== 'not connected');
}

export function unavailableGisSources(): GisSourceRecord[] {
  return QGIS_ALIGNED_SOURCES.filter((row) => row.status === 'not connected');
}
