/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QGIS_INGEST_PROVIDERS, QGIS_UNAVAILABLE_IN_BROWSER } from './catalog';
import { toLonLat } from './crs';
import { parseDelimitedText } from './delimitedText';
import { parseDxf } from './dxf';
import { envelopeWarning } from './geometry';
import { parseGpkgGeometry } from './gpkg';
import {
  ingestFiles,
  ingestGeoJsonText,
  ingestUri,
} from './registry';
import { parseAsciiGrid, parseWorldFile } from './raster';
import { parseShapefile, writePointShapefile } from './shapefile';
import {
  arcgisQueryUrl,
  classifyServiceUri,
  wfsGetFeatureUrl,
  wmsGetCapabilitiesUrl,
  xyzTiles,
} from './webServices';
import { parseGpx, parseKml } from './xmlVectors';

const root = process.cwd();

describe('QGIS-aligned ingest providers', () => {
  it('maps the QGIS registry keys we actually implement', () => {
    const keys = QGIS_INGEST_PROVIDERS.map((p) => p.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'ogr',
        'gdal',
        'delimitedtext',
        'wms',
        'wfs',
        'xyz',
        'arcgisfeatureserver',
        'arcgismapserver',
      ])
    );
    expect(QGIS_UNAVAILABLE_IN_BROWSER.some((p) => p.key === 'postgres')).toBe(true);
    expect(QGIS_UNAVAILABLE_IN_BROWSER.some((p) => p.key === 'openfilegdb')).toBe(true);
  });
});

describe('OGR analog — GeoJSON / Shapefile / KML / GPX / DXF', () => {
  it('ingests the real KMZ-derived police station GeoJSON without fabricating points', async () => {
    const bytes = readFileSync(resolve(root, 'public/geo/ap-police-stations.geojson'));
    const batch = await ingestFiles([{ name: 'ap-police-stations.geojson', bytes }]);
    expect(batch.errors).toEqual([]);
    expect(batch.layers).toHaveLength(1);
    const layer = batch.layers[0];
    expect(layer.driver).toBe('GeoJSON');
    expect(layer.providerKey).toBe('ogr');
    expect(layer.featureCount).toBe(99);
    expect(layer.displayCrs).toBe('EPSG:4326');
    const araku = layer.collection?.features.find((f) =>
      String(f.properties?.name ?? '').toLowerCase().includes('araku')
    );
    expect(araku?.geometry?.type).toBe('Point');
    const [lon, lat] = (araku?.geometry as GeoJSON.Point).coordinates;
    expect(lon).toBeGreaterThan(82.7);
    expect(lon).toBeLessThan(83.1);
    expect(lat).toBeGreaterThan(18.2);
    expect(lat).toBeLessThan(18.5);
  });

  it('round-trips a WGS84 point shapefile the way QgsOgrProvider reads .shp+.dbf+.prj', () => {
    const written = writePointShapefile([
      { lon: 80.648, lat: 16.5062, name: 'Vijayawada' },
      { lon: 82.8775, lat: 18.3273, name: 'Araku' },
    ]);
    const parsed = parseShapefile(written.shp, written.dbf, written.prj);
    expect(parsed.sourceCrs).toBe('EPSG:4326');
    expect(parsed.collection.features).toHaveLength(2);
    expect(parsed.collection.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [80.648, 16.5062],
    });
    expect(parsed.collection.features[0].properties).toMatchObject({ NAME: 'Vijayawada' });
  });

  it('parses KML placemarks (LIBKML analog) in lon,lat order', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2"><Document>
        <Placemark><name>Tirupati PS</name>
          <Point><coordinates>79.4192,13.6288,0</coordinates></Point>
        </Placemark>
      </Document></kml>`;
    const fc = parseKml(kml);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [79.4192, 13.6288, 0],
    });
  });

  it('parses GPX waypoints and tracks for GPS ingest', () => {
    const gpx = `<?xml version="1.0"?>
      <gpx><wpt lat="17.6868" lon="83.2185"><name>Visakhapatnam</name></wpt>
      <trk><name>NH-16</name><trkseg>
        <trkpt lat="16.5062" lon="80.6480"/>
        <trkpt lat="17.0000" lon="81.8000"/>
      </trkseg></trk></gpx>`;
    const fc = parseGpx(gpx);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry?.type).toBe('Point');
    expect(fc.features[1].geometry?.type).toBe('LineString');
  });

  it('reads ASCII DXF POINT entities', () => {
    const dxf = `0\nSECTION\n2\nENTITIES\n0\nPOINT\n8\nPS\n10\n78.0373\n20\n15.8281\n0\nENDSEC\n0\nEOF\n`;
    const fc = parseDxf(dxf);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [78.0373, 15.8281] });
  });
});

describe('QgsDelimitedText analog', () => {
  it('sniffs lat/lon columns used by GPS and CCTV CSVs', () => {
    const csv = `device_id,latitude,longitude,kind
ANPR-01,16.5062,80.648,ANPR
GPS-02,18.3273,82.8775,patrol`;
    const fc = parseDelimitedText(csv);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [80.648, 16.5062] });
    expect(fc.features[1].properties).toMatchObject({ device_id: 'GPS-02' });
  });

  it('reads WKT geometry columns', () => {
    const csv = `name,wkt
Krishna,"LINESTRING (80.6 16.5, 80.7 16.4)"`;
    const fc = parseDelimitedText(csv);
    expect(fc.features[0].geometry?.type).toBe('LineString');
  });
});

describe('GDAL analog — grids and world files', () => {
  it('computes world-file bounds from affine coefficients', () => {
    const { bounds } = parseWorldFile('0.001\n0\n0\n-0.001\n80.648\n16.5062\n', 100, 50);
    expect(bounds[0][1]).toBeCloseTo(80.6475, 3);
    expect(bounds[1][0]).toBeCloseTo(16.5067, 3);
  });

  it('reads an ESRI ASCII Grid over Vijayawada', () => {
    const asc = `ncols 2
nrows 2
xllcorner 80.64
yllcorner 16.50
cellsize 0.01
NODATA_value -9999
12 18
9 14
`;
    const raster = parseAsciiGrid(asc);
    expect(raster.width).toBe(2);
    expect(raster.bounds[0][1]).toBeCloseTo(80.64, 4);
    expect(raster.bounds[1][0]).toBeCloseTo(16.52, 4);
  });
});

describe('CRS transform (PROJ analog)', () => {
  it('converts UTM 44N metres near Vijayawada back to WGS84', () => {
    const [lon, lat] = toLonLat(462000, 1825000, 'EPSG:32644');
    expect(lon).toBeGreaterThan(80);
    expect(lon).toBeLessThan(81.5);
    expect(lat).toBeGreaterThan(16);
    expect(lat).toBeLessThan(17);
  });
});

describe('GeoPackage binary (OGR GPKG)', () => {
  it('decodes a GeoPackage Binary point', () => {
    const wkb = new Uint8Array(5 + 16);
    const view = new DataView(wkb.buffer);
    wkb[0] = 1;
    view.setUint32(1, 1, true);
    view.setFloat64(5, 82.8775, true);
    view.setFloat64(13, 18.3273, true);
    const gpb = new Uint8Array(8 + wkb.length);
    gpb[0] = 0x47;
    gpb[1] = 0x50;
    gpb[3] = 0x01;
    new DataView(gpb.buffer).setInt32(4, 4326, true);
    gpb.set(wkb, 8);
    expect(parseGpkgGeometry(gpb)).toEqual({ type: 'Point', coordinates: [82.8775, 18.3273] });
  });
});

describe('QgsWmsProvider / QgsWFSProvider / ArcGIS REST URL builders', () => {
  it('classifies XYZ, WMS, WFS, and ArcGIS URIs the way QGIS provider keys do', () => {
    expect(classifyServiceUri('https://tile.openstreetmap.org/{z}/{x}/{y}.png').provider).toBe('xyz');
    expect(
      classifyServiceUri('https://ows.example/wms?SERVICE=WMS&LAYERS=ap_districts').provider
    ).toBe('wms');
    expect(classifyServiceUri('https://apsac.example/geoserver/wfs?SERVICE=WFS').provider).toBe('wfs');
    expect(
      classifyServiceUri('https://gis.example/arcgis/rest/services/PS/FeatureServer/0').provider
    ).toBe('arcgisfeatureserver');
    expect(
      classifyServiceUri('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer').provider
    ).toBe('arcgismapserver');
  });

  it('builds GetCapabilities / GetFeature / query URLs', () => {
    expect(wmsGetCapabilitiesUrl('https://ows.example/wms')).toMatch(/REQUEST=GetCapabilities/);
    expect(wfsGetFeatureUrl('https://ows.example/wfs')).toMatch(/OUTPUTFORMAT=/);
    expect(wfsGetFeatureUrl('https://ows.example/wfs')).toMatch(/76\.75/);
    expect(arcgisQueryUrl('https://gis.example/arcgis/rest/services/PS/FeatureServer/0')).toMatch(
      /f=geojson/
    );
    expect(xyzTiles('https://tile.example/{z}/{x}/{y}.png').url).toContain('{z}');
  });

  it('does not invent a postgres connection for a database URI', async () => {
    const batch = await ingestUri('postgres://localhost:5432/eagle');
    expect(batch.layers).toHaveLength(0);
    expect(batch.errors[0].message).toMatch(/not recognised|backend/i);
  });
});

describe('memory provider and envelope', () => {
  it('parses pasted GeoJSON and warns when it is outside AP', () => {
    const layer = ingestGeoJsonText(
      JSON.stringify({
        type: 'Feature',
        properties: { name: 'London' },
        geometry: { type: 'Point', coordinates: [-0.12, 51.5] },
      }),
      'scratch'
    );
    expect(layer.providerKey).toBe('memory');
    expect(layer.featureCount).toBe(1);
    expect(envelopeWarning(layer.bbox)?.toLowerCase()).toMatch(/outside/);
  });

  it('keeps AP coordinates without an envelope warning', () => {
    const layer = ingestGeoJsonText(
      JSON.stringify({
        type: 'Feature',
        properties: { name: 'Kurnool' },
        geometry: { type: 'Point', coordinates: [78.0373, 15.8281] },
      })
    );
    expect(envelopeWarning(layer.bbox)).toBeNull();
  });
});
