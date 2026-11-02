/**
 * QGIS analog: QgsDataProvider / QgsProviderMetadata layer descriptors.
 * QGIS keys live in src/core/providers/qgsproviderregistry.cpp
 * (ogr, gdal, memory, wms, wfs, delimitedtext, postgres, spatialite, …).
 */

export type IngestProviderKey =
  | 'ogr'
  | 'gdal'
  | 'delimitedtext'
  | 'wms'
  | 'wfs'
  | 'xyz'
  | 'arcgisfeatureserver'
  | 'arcgismapserver'
  | 'spatialite'
  | 'memory';

export type IngestLayerKind = 'vector' | 'raster' | 'tiles';

export type IngestStatus = 'ready' | 'unavailable';

export interface IngestSourceFile {
  name: string;
  bytes: Uint8Array;
}

export interface IngestedRaster {
  dataUrl: string;
  bounds: [[number, number], [number, number]];
  width: number;
  height: number;
}

export interface IngestedTiles {
  url: string;
  attribution: string;
  minZoom?: number;
  maxZoom?: number;
  wms?: {
    layers: string;
    format: string;
    transparent: boolean;
    version: string;
    crs: string;
  };
}

export interface IngestedLayer {
  id: string;
  name: string;
  providerKey: IngestProviderKey;
  driver: string;
  qgisAnalog: string;
  kind: IngestLayerKind;
  status: IngestStatus;
  sourceCrs: string;
  displayCrs: 'EPSG:4326';
  featureCount: number;
  geometryTypes: string[];
  bbox: [number, number, number, number] | null;
  collection?: GeoJSON.FeatureCollection;
  raster?: IngestedRaster;
  tiles?: IngestedTiles;
  warnings: string[];
  enabled: boolean;
  opacity: number;
  sourceUri: string;
  attributes: string[];
}

export interface ProviderDescriptor {
  key: IngestProviderKey;
  qgisClass: string;
  qgisPath: string;
  title: string;
  formats: string[];
  feasible: boolean;
  reason: string;
  requirementFit: string;
}

export interface IngestError {
  sourceUri: string;
  message: string;
}

export interface IngestBatch {
  layers: IngestedLayer[];
  errors: IngestError[];
}

export const AP_ENVELOPE = {
  west: 76.75,
  south: 12.62,
  east: 84.78,
  north: 19.22,
};

export const DISPLAY_CRS = 'EPSG:4326' as const;
