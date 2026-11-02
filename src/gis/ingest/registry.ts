/**
 * QGIS analog: QgsProviderRegistry — detect URI/files, pick a provider, open layers.
 * Does not embed GDAL; each driver below is the browser-feasible subset of the
 * QGIS provider that EAGLE actually needs.
 */
import JSZip from 'jszip';
import { transformGeometry } from './crs';
import { parseDelimitedText } from './delimitedText';
import { parseDxf } from './dxf';
import {
  attributeKeys,
  collectionBbox,
  decodeText,
  dropInvalidFeatures,
  emptyCollection,
  envelopeWarning,
  fileExt,
  fileStem,
  geometryTypesOf,
  nextIngestId,
} from './geometry';
import { parseGeoPackage, parseGpkgGeometry, parseMbTilesMetadata } from './gpkg';
import {
  parseAsciiGrid,
  parseGeoTiff,
  parseSrtmHgt,
  parseWorldFile,
  rasterFromImageWithWorldFile,
} from './raster';
import { parseShapefile } from './shapefile';
import { parseOds, parseXlsx } from './spreadsheet';
import type {
  IngestBatch,
  IngestedLayer,
  IngestProviderKey,
  IngestSourceFile,
} from './types';
import {
  arcgisMapServerTiles,
  classifyServiceUri,
  openArcgisFeatureServer,
  openWfs,
  openWms,
  xyzTiles,
} from './webServices';
import { parseGml, parseGpx, parseKml } from './xmlVectors';

export async function filesFromBrowser(list: FileList | File[]): Promise<IngestSourceFile[]> {
  const files = Array.from(list);
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    }))
  );
}

function finalizeVector(opts: {
  name: string;
  driver: string;
  providerKey: IngestProviderKey;
  qgisAnalog: string;
  sourceUri: string;
  sourceCrs: string;
  collection: GeoJSON.FeatureCollection;
  extraWarnings?: string[];
}): IngestedLayer {
  const reprojected: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: opts.collection.features.map((feature) => ({
      ...feature,
      geometry: feature.geometry ? transformGeometry(feature.geometry, opts.sourceCrs) : feature.geometry,
    })),
  };
  const cleaned = dropInvalidFeatures(reprojected);
  const bbox = collectionBbox(cleaned.collection);
  const warnings = [...(opts.extraWarnings ?? [])];
  if (cleaned.dropped) warnings.push(`Dropped ${cleaned.dropped} features with empty or invalid geometry`);
  const env = envelopeWarning(bbox);
  if (env) warnings.push(env);
  return {
    id: nextIngestId('ing'),
    name: opts.name,
    providerKey: opts.providerKey,
    driver: opts.driver,
    qgisAnalog: opts.qgisAnalog,
    kind: 'vector',
    status: 'ready',
    sourceCrs: opts.sourceCrs,
    displayCrs: 'EPSG:4326',
    featureCount: cleaned.collection.features.length,
    geometryTypes: geometryTypesOf(cleaned.collection),
    bbox,
    collection: cleaned.collection,
    warnings,
    enabled: true,
    opacity: 85,
    sourceUri: opts.sourceUri,
    attributes: attributeKeys(cleaned.collection),
  };
}

function finalizeRaster(
  name: string,
  driver: string,
  sourceUri: string,
  raster: IngestedLayer['raster'],
  warnings: string[] = []
): IngestedLayer {
  const bbox = raster
    ? ([
        raster.bounds[0][1],
        raster.bounds[0][0],
        raster.bounds[1][1],
        raster.bounds[1][0],
      ] as [number, number, number, number])
    : null;
  const env = envelopeWarning(bbox);
  return {
    id: nextIngestId('ing'),
    name,
    providerKey: 'gdal',
    driver,
    qgisAnalog: 'QgsGdalProvider',
    kind: 'raster',
    status: 'ready',
    sourceCrs: 'EPSG:4326',
    displayCrs: 'EPSG:4326',
    featureCount: 1,
    geometryTypes: ['RasterGrid'],
    bbox,
    raster,
    warnings: env ? [...warnings, env] : warnings,
    enabled: true,
    opacity: 80,
    sourceUri,
    attributes: [],
  };
}

function finalizeTiles(
  name: string,
  providerKey: IngestProviderKey,
  driver: string,
  qgisAnalog: string,
  sourceUri: string,
  tiles: NonNullable<IngestedLayer['tiles']>,
  warnings: string[] = []
): IngestedLayer {
  return {
    id: nextIngestId('ing'),
    name,
    providerKey,
    driver,
    qgisAnalog,
    kind: 'tiles',
    status: 'ready',
    sourceCrs: 'EPSG:3857',
    displayCrs: 'EPSG:4326',
    featureCount: 0,
    geometryTypes: ['RasterGrid'],
    bbox: null,
    tiles,
    warnings,
    enabled: true,
    opacity: 80,
    sourceUri,
    attributes: [],
  };
}

function parseGeoJsonText(text: string): GeoJSON.FeatureCollection {
  const data = JSON.parse(text) as GeoJSON.GeoJsonObject;
  if (data.type === 'FeatureCollection') return data as GeoJSON.FeatureCollection;
  if (data.type === 'Feature') {
    return { type: 'FeatureCollection', features: [data as GeoJSON.Feature] };
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: data as GeoJSON.Geometry }],
  };
}

function sidecarMap(files: IngestSourceFile[]): Map<string, Map<string, IngestSourceFile>> {
  const map = new Map<string, Map<string, IngestSourceFile>>();
  for (const file of files) {
    const stem = fileStem(file.name).toLowerCase();
    const ext = fileExt(file.name);
    if (!map.has(stem)) map.set(stem, new Map());
    map.get(stem)!.set(ext, file);
  }
  return map;
}

async function expandZips(files: IngestSourceFile[]): Promise<IngestSourceFile[]> {
  const out: IngestSourceFile[] = [];
  for (const file of files) {
    const ext = fileExt(file.name);
    if (ext !== 'zip' && ext !== 'kmz') {
      out.push(file);
      continue;
    }
    if (ext === 'kmz') {
      out.push(file);
      continue;
    }
    const zip = await JSZip.loadAsync(file.bytes);
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    for (const entry of entries) {
      const bytes = await entry.async('uint8array');
      out.push({ name: `${fileStem(file.name)}/${entry.name}`, bytes });
    }
  }
  return out;
}

async function openKmz(file: IngestSourceFile): Promise<GeoJSON.FeatureCollection> {
  const zip = await JSZip.loadAsync(file.bytes);
  const kmlEntry =
    zip.file(/\.kml$/i)[0] ??
    Object.values(zip.files).find((entry) => !entry.dir && /\.kml$/i.test(entry.name));
  if (!kmlEntry) throw new Error('KMZ archive contains no KML document');
  return parseKml(await kmlEntry.async('text'));
}

async function ingestFlatFiles(files: IngestSourceFile[]): Promise<IngestBatch> {
  const layers: IngestedLayer[] = [];
  const errors: IngestBatch['errors'] = [];
  const grouped = sidecarMap(files);
  const consumed = new Set<string>();

  for (const [stem, group] of grouped) {
    if (group.has('shp')) {
      const shp = group.get('shp')!;
      try {
        const prj = group.get('prj') ? decodeText(group.get('prj')!.bytes) : undefined;
        const parsed = parseShapefile(shp.bytes, group.get('dbf')?.bytes, prj);
        layers.push(
          finalizeVector({
            name: stem,
            driver: 'ESRI Shapefile',
            providerKey: 'ogr',
            qgisAnalog: 'QgsOgrProvider (ESRI Shapefile)',
            sourceUri: shp.name,
            sourceCrs: parsed.sourceCrs,
            collection: parsed.collection,
            extraWarnings: group.has('prj') ? [] : ['No .prj file; assumed EPSG:4326'],
          })
        );
      } catch (err) {
        errors.push({ sourceUri: shp.name, message: (err as Error).message });
      }
      ['shp', 'shx', 'dbf', 'prj', 'cpg', 'sbn', 'sbx', 'shp.xml'].forEach((ext) => {
        if (group.has(ext)) consumed.add(group.get(ext)!.name);
      });
    }
  }

  for (const file of files) {
    if (consumed.has(file.name)) continue;
    const ext = fileExt(file.name);
    const name = fileStem(file.name);
    try {
      if (ext === 'geojson' || ext === 'json') {
        layers.push(
          finalizeVector({
            name,
            driver: 'GeoJSON',
            providerKey: 'ogr',
            qgisAnalog: 'QgsOgrProvider (GeoJSON)',
            sourceUri: file.name,
            sourceCrs: 'EPSG:4326',
            collection: parseGeoJsonText(decodeText(file.bytes)),
          })
        );
        continue;
      }
      if (ext === 'kml') {
        layers.push(
          finalizeVector({
            name,
            driver: 'KML',
            providerKey: 'ogr',
            qgisAnalog: 'QgsOgrProvider (KML/LIBKML)',
            sourceUri: file.name,
            sourceCrs: 'EPSG:4326',
            collection: parseKml(decodeText(file.bytes)),
          })
        );
        continue;
      }
      if (ext === 'kmz') {
        layers.push(
          finalizeVector({
            name,
            driver: 'KMZ',
            providerKey: 'ogr',
            qgisAnalog: 'QgsOgrProvider (KML via /vsizip/)',
            sourceUri: file.name,
            sourceCrs: 'EPSG:4326',
            collection: await openKmz(file),
          })
        );
        continue;
      }
      if (ext === 'gpx') {
        layers.push(
          finalizeVector({
            name,
            driver: 'GPX',
            providerKey: 'ogr',
            qgisAnalog: 'QgsOgrProvider (GPX)',
            sourceUri: file.name,
            sourceCrs: 'EPSG:4326',
            collection: parseGpx(decodeText(file.bytes)),
          })
        );
        continue;
      }
      if (ext === 'gml' || ext === 'xml') {
        const text = decodeText(file.bytes);
        const collection = text.includes('<kml') ? parseKml(text) : parseGml(text);
        layers.push(
          finalizeVector({
            name,
            driver: text.includes('<kml') ? 'KML' : 'GML',
            providerKey: 'ogr',
            qgisAnalog: 'QgsOgrProvider (GML/KML)',
            sourceUri: file.name,
            sourceCrs: 'EPSG:4326',
            collection,
          })
        );
        continue;
      }
      if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
        layers.push(
          finalizeVector({
            name,
            driver: 'Delimited text',
            providerKey: 'delimitedtext',
            qgisAnalog: 'QgsDelimitedTextProvider',
            sourceUri: file.name,
            sourceCrs: 'EPSG:4326',
            collection: parseDelimitedText(decodeText(file.bytes)),
          })
        );
        continue;
      }
      if (ext === 'xlsx') {
        layers.push(
          finalizeVector({
            name,
            driver: 'XLSX',
            providerKey: 'delimitedtext',
            qgisAnalog: 'OGR XLSX → delimited text',
            sourceUri: file.name,
            sourceCrs: 'EPSG:4326',
            collection: await parseXlsx(file.bytes),
          })
        );
        continue;
      }
      if (ext === 'ods') {
        layers.push(
          finalizeVector({
            name,
            driver: 'ODS',
            providerKey: 'delimitedtext',
            qgisAnalog: 'OGR ODS → delimited text',
            sourceUri: file.name,
            sourceCrs: 'EPSG:4326',
            collection: await parseOds(file.bytes),
          })
        );
        continue;
      }
      if (ext === 'dxf') {
        layers.push(
          finalizeVector({
            name,
            driver: 'DXF',
            providerKey: 'ogr',
            qgisAnalog: 'QgsOgrProvider (DXF)',
            sourceUri: file.name,
            sourceCrs: 'EPSG:4326',
            collection: parseDxf(decodeText(file.bytes)),
          })
        );
        continue;
      }
      if (ext === 'gpkg' || ext === 'sqlite' || ext === 'db') {
        const gpkg = await parseGeoPackage(file.bytes);
        if (!gpkg.layers.length) {
          errors.push({
            sourceUri: file.name,
            message: 'SQLite file has no gpkg_contents feature tables',
          });
          continue;
        }
        for (const layer of gpkg.layers) {
          layers.push(
            finalizeVector({
              name: `${name}/${layer.name}`,
              driver: 'GPKG',
              providerKey: 'ogr',
              qgisAnalog: 'QgsOgrProvider (GPKG)',
              sourceUri: `${file.name}|layername=${layer.name}`,
              sourceCrs: layer.srs,
              collection: layer.collection,
            })
          );
        }
        continue;
      }
      if (ext === 'mbtiles') {
        const meta = await parseMbTilesMetadata(file.bytes);
        errors.push({
          sourceUri: file.name,
          message: `MBTiles "${meta.name}" metadata read (format ${meta.format}). Tile serving from in-memory SQLite is not mounted — export XYZ or a GeoTIFF for overlay.`,
        });
        continue;
      }
      if (ext === 'asc' || ext === 'grd') {
        layers.push(finalizeRaster(name, 'AAIGrid', file.name, parseAsciiGrid(decodeText(file.bytes))));
        continue;
      }
      if (ext === 'hgt') {
        layers.push(finalizeRaster(name, 'SRTM HGT', file.name, parseSrtmHgt(file.bytes, file.name)));
        continue;
      }
      if (ext === 'tif' || ext === 'tiff') {
        layers.push(finalizeRaster(name, 'GTiff', file.name, await parseGeoTiff(file.bytes)));
        continue;
      }
      if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
        const world =
          grouped.get(name.toLowerCase())?.get('pgw') ||
          grouped.get(name.toLowerCase())?.get('jgw') ||
          grouped.get(name.toLowerCase())?.get('wld') ||
          grouped.get(name.toLowerCase())?.get('tfw');
        if (!world) {
          errors.push({
            sourceUri: file.name,
            message: 'PNG/JPEG needs a world file (.pgw/.jgw/.wld) or use GeoTIFF',
          });
          continue;
        }
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        layers.push(
          finalizeRaster(
            name,
            'GDAL world-file image',
            file.name,
            await rasterFromImageWithWorldFile(file.bytes, decodeText(world.bytes), mime)
          )
        );
        continue;
      }
      if (['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(ext)) continue;
      errors.push({
        sourceUri: file.name,
        message: `No browser provider for .${ext} (QGIS would use GDAL/OGR). Convert in QGIS to GeoJSON, GPKG, or GeoTIFF.`,
      });
    } catch (err) {
      errors.push({ sourceUri: file.name, message: (err as Error).message });
    }
  }

  return { layers, errors };
}

export async function ingestFiles(files: IngestSourceFile[]): Promise<IngestBatch> {
  const expanded = await expandZips(files);
  return ingestFlatFiles(expanded);
}

export function ingestGeoJsonText(text: string, name = 'Pasted GeoJSON'): IngestedLayer {
  return finalizeVector({
    name,
    driver: 'GeoJSON',
    providerKey: 'memory',
    qgisAnalog: 'QgsMemoryProvider / OGR GeoJSON',
    sourceUri: 'memory:',
    sourceCrs: 'EPSG:4326',
    collection: parseGeoJsonText(text),
  });
}

export async function ingestUri(uri: string, title?: string): Promise<IngestBatch> {
  const { provider } = classifyServiceUri(uri);
  if (!provider) {
    return {
      layers: [],
      errors: [
        {
          sourceUri: uri,
          message:
            'URI was not recognised as WMS, WMTS, WFS, XYZ, or ArcGIS REST. QGIS postgres:// URIs need a backend.',
        },
      ],
    };
  }
  try {
    if (provider === 'xyz') {
      return {
        layers: [
          finalizeTiles(
            title || 'XYZ tiles',
            'xyz',
            'XYZ',
            'QgsWmsProvider type=xyz',
            uri,
            xyzTiles(uri)
          ),
        ],
        errors: [],
      };
    }
    if (provider === 'arcgismapserver') {
      return {
        layers: [
          finalizeTiles(
            title || 'ArcGIS MapServer',
            'arcgismapserver',
            'AMS',
            'QgsAmsProvider',
            uri,
            arcgisMapServerTiles(uri)
          ),
        ],
        errors: [],
      };
    }
    if (provider === 'wms') {
      const opened = await openWms(uri);
      return {
        layers: [
          finalizeTiles(
            title || opened.title,
            'wms',
            'WMS',
            'QgsWmsProvider',
            uri,
            opened.tiles,
            opened.warnings
          ),
        ],
        errors: [],
      };
    }
    if (provider === 'wfs') {
      const collection = await openWfs(uri);
      return {
        layers: [
          finalizeVector({
            name: title || 'WFS',
            driver: 'WFS',
            providerKey: 'wfs',
            qgisAnalog: 'QgsWFSProvider',
            sourceUri: uri,
            sourceCrs: 'EPSG:4326',
            collection,
          }),
        ],
        errors: [],
      };
    }
    const collection = await openArcgisFeatureServer(uri);
    return {
      layers: [
        finalizeVector({
          name: title || 'ArcGIS FeatureServer',
          driver: 'AFS',
          providerKey: 'arcgisfeatureserver',
          qgisAnalog: 'QgsAfsProvider',
          sourceUri: uri,
          sourceCrs: 'EPSG:4326',
          collection,
        }),
      ],
      errors: [],
    };
  } catch (err) {
    return { layers: [], errors: [{ sourceUri: uri, message: (err as Error).message }] };
  }
}

export { parseGpkgGeometry };
export { emptyCollection };
