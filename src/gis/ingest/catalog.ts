/**
 * QGIS provider inventory vs EAGLE. Source of truth:
 * src/core/providers/qgsproviderregistry.cpp and src/providers/*.
 */
import type { ProviderDescriptor } from './types';

export const QGIS_INGEST_PROVIDERS: ProviderDescriptor[] = [
  {
    key: 'ogr',
    qgisClass: 'QgsOgrProvider',
    qgisPath: 'src/core/providers/ogr/qgsogrprovider.cpp',
    title: 'OGR vector (GeoJSON, Shapefile, KML/KMZ, GML, GPX, DXF, GPKG)',
    formats: ['geojson', 'shp', 'dbf', 'kml', 'kmz', 'gml', 'gpx', 'dxf', 'gpkg', 'zip'],
    feasible: true,
    reason: 'Browser parsers mirror OGR drivers used by QGIS; GPKG uses sql.js as SQLite.',
    requirementFit:
      'AP admin polygons, police KMZ, roads/rail/rivers, GPS tracks, CAD outlines',
  },
  {
    key: 'delimitedtext',
    qgisClass: 'QgsDelimitedTextProvider',
    qgisPath: 'src/providers/delimitedtext/',
    title: 'Delimited text / XLSX / ODS',
    formats: ['csv', 'tsv', 'txt', 'xlsx', 'ods'],
    feasible: true,
    reason: 'Same lat/lon and WKT column sniffing QGIS uses for GPS and CCTV tables.',
    requirementFit: 'Police coordinates, CCTV/ANPR, GPS tracking CSVs',
  },
  {
    key: 'gdal',
    qgisClass: 'QgsGdalProvider',
    qgisPath: 'src/core/providers/gdal/qgsgdalprovider.cpp',
    title: 'GDAL raster (GeoTIFF, ASCII Grid, SRTM HGT, world-file images, MBTiles)',
    formats: ['tif', 'tiff', 'asc', 'grd', 'hgt', 'png', 'jpg', 'jpeg', 'mbtiles'],
    feasible: true,
    reason: 'geotiff.js + native grid/HGT/world-file readers. Not a full GDAL build.',
    requirementFit: 'Satellite scenes, terrain tiles, georeferenced toposheet scans',
  },
  {
    key: 'wms',
    qgisClass: 'QgsWmsProvider',
    qgisPath: 'src/providers/wms/qgswmsprovider.cpp',
    title: 'OGC WMS / WMTS',
    formats: ['wms', 'wmts'],
    feasible: true,
    reason: 'GetCapabilities + Leaflet WMS / MapLibre raster tiles. CORS may block some servers.',
    requirementFit: 'Basemap and agency WMS overlays when the server allows the browser',
  },
  {
    key: 'xyz',
    qgisClass: 'QgsWmsProvider (type=xyz) / QgsXyzVectorTileDataProvider',
    qgisPath: 'src/providers/wms/ + src/core/qgsxyzvectortiledataprovider.cpp',
    title: 'XYZ / WMTS tile templates',
    formats: ['xyz'],
    feasible: true,
    reason: 'Already how EAGLE loads OSM, Esri, OpenTopoMap, hillshade.',
    requirementFit: 'Basemaps, satellite, terrain, roads',
  },
  {
    key: 'wfs',
    qgisClass: 'QgsWFSProvider / QgsOapifProvider',
    qgisPath: 'src/providers/wfs/',
    title: 'OGC WFS / OGC API Features',
    formats: ['wfs'],
    feasible: true,
    reason: 'GetFeature as GeoJSON with AP bbox. WFS-T writes are not enabled.',
    requirementFit: 'Remote district/mandal/village services when CORS allows',
  },
  {
    key: 'arcgisfeatureserver',
    qgisClass: 'QgsAfsProvider',
    qgisPath: 'src/providers/arcgisrest/',
    title: 'ArcGIS REST FeatureServer',
    formats: ['featureserver'],
    feasible: true,
    reason: 'Query f=geojson, outSR=4326 — QGIS ArcGIS Feature Server provider.',
    requirementFit: 'Operational point layers published as ArcGIS REST',
  },
  {
    key: 'arcgismapserver',
    qgisClass: 'QgsAmsProvider',
    qgisPath: 'src/providers/arcgisrest/',
    title: 'ArcGIS REST MapServer tiles',
    formats: ['mapserver'],
    feasible: true,
    reason: 'Same tile pattern QGIS and EAGLE already use for Esri World Imagery.',
    requirementFit: 'Imagery and reference overlays',
  },
  {
    key: 'spatialite',
    qgisClass: 'QgsSpatiaLiteProvider',
    qgisPath: 'src/providers/spatialite/',
    title: 'SQLite / SpatiaLite',
    formats: ['sqlite', 'db'],
    feasible: true,
    reason: 'GeoPackage (OGR) is the supported SQLite spatial path. Bare SpatiaLite DBs share sql.js.',
    requirementFit: 'Field GeoPackage packages',
  },
  {
    key: 'memory',
    qgisClass: 'QgsMemoryProvider',
    qgisPath: 'src/core/providers/memory/qgsmemoryprovider.cpp',
    title: 'Memory / pasted GeoJSON',
    formats: ['json'],
    feasible: true,
    reason: 'In-memory overlay, same role as QGIS scratch layers.',
    requirementFit: 'Ad-hoc paste of GeoJSON waypoints',
  },
];

export const QGIS_UNAVAILABLE_IN_BROWSER: Array<{
  key: string;
  qgisClass: string;
  reason: string;
}> = [
  {
    key: 'postgres',
    qgisClass: 'QgsPostgresProvider',
    reason: 'PostGIS needs a TCP backend. This app is browser-only; export GeoJSON/GPKG instead.',
  },
  {
    key: 'mssql',
    qgisClass: 'QgsMsSqlProvider',
    reason: 'No SQL Server connection from the browser.',
  },
  {
    key: 'oracle',
    qgisClass: 'QgsOracleProvider',
    reason: 'No Oracle Spatial connection from the browser.',
  },
  {
    key: 'wcs',
    qgisClass: 'QgsWcsProvider',
    reason: 'WCS coverage streaming is raster-server specific; use GeoTIFF or WMS.',
  },
  {
    key: 'wfs-t',
    qgisClass: 'QgsWFSProvider (Transaction)',
    reason: 'Transactional WFS writes are out of scope; ingest is read-only.',
  },
  {
    key: 'openfilegdb',
    qgisClass: 'OGR OpenFileGDB',
    reason: 'ESRI File Geodatabase needs GDAL OpenFileGDB; convert to GPKG/GeoJSON in QGIS.',
  },
  {
    key: 'mdal',
    qgisClass: 'QgsMeshDataProvider',
    reason: 'Mesh/MDAL datasets are not used by EAGLE operational mapping.',
  },
  {
    key: 'pdal',
    qgisClass: 'QgsEptProvider / QgsCopcProvider',
    reason: 'Point clouds are not an EAGLE requirement.',
  },
];
