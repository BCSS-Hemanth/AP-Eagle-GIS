/** Locus module types — independent of Atlas / Dashboard / Roads Routing configs. */

export type LocusLayerCategory = 'administrative' | 'operational' | 'road-network';

export type LocusDistrictStatus = 'ready' | 'pending';

export interface LocusDistrictMeta {
  id: string;
  name: string;
  code: string;
  districtName: string;
  status: LocusDistrictStatus;
}

export interface LocusInventoryLayer {
  layerId: string;
  category: LocusLayerCategory;
  name: string;
  featureCount: number;
  countNote?: string;
}

export interface LocusDistrictInventory {
  districtId: string;
  layers: LocusInventoryLayer[];
}

export interface LocusDistrictConfig {
  districtId: string;
  selectedLayerIds: string[];
  appliedLayerIds: string[];
  layerVisibility: Record<string, boolean>;
  layerOpacity: Record<string, number>;
}

export interface LocusConfig {
  version: 1;
  activeDistrictId: string | null;
  districts: Record<string, LocusDistrictConfig>;
}

export const LOCUS_LAYER_STORAGE_KEY = 'ap-eagle.locus-layers.v1';

export const LOCUS_CATEGORY_LABEL: Record<LocusLayerCategory, string> = {
  administrative: 'Administrative Layers',
  operational: 'Operational Layers',
  'road-network': 'Road Network Layers',
};

export type LocusExportScope = 'applied' | 'visible';
