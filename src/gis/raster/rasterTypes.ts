/** Raster module types — independent of Locus / Atlas / Dashboard configs. */

export type RasterDistrictStatus = 'ready' | 'pending';

export interface RasterDistrictMeta {
  id: string;
  name: string;
  code: string;
  districtName: string;
  status: RasterDistrictStatus;
}

export interface RasterInventoryLayer {
  layerId: string;
  name: string;
  featureCount: number;
  countNote?: string;
}

export interface RasterDistrictInventory {
  districtId: string;
  layers: RasterInventoryLayer[];
}

export interface RasterDistrictConfig {
  districtId: string;
  selectedLayerIds: string[];
  appliedLayerIds: string[];
  layerVisibility: Record<string, boolean>;
  layerOpacity: Record<string, number>;
}

export interface RasterConfig {
  version: 1;
  activeDistrictId: string | null;
  districts: Record<string, RasterDistrictConfig>;
}

export const RASTER_LAYER_STORAGE_KEY = 'ap-eagle.raster-layers.v1';
