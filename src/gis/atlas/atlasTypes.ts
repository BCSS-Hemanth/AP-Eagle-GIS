/** Atlas module types — independent of Dashboard / Roads Routing configs. */

export type AtlasLayerCategory = 'administrative' | 'operational' | 'road-network';

export type AtlasDistrictStatus = 'ready' | 'pending';

export interface AtlasDistrictMeta {
  id: string;
  name: string;
  code: string;
  /** Matches ap-districts-2022.geojson district_name */
  districtName: string;
  status: AtlasDistrictStatus;
}

export interface AtlasInventoryLayer {
  layerId: string;
  category: AtlasLayerCategory;
  name: string;
  /** Verified feature count inside / intersecting the district (never invented). */
  featureCount: number;
  /** Short note when count is approximate (e.g. PostGIS bbox). */
  countNote?: string;
}

export interface AtlasDistrictInventory {
  districtId: string;
  layers: AtlasInventoryLayer[];
}

export interface AtlasDistrictConfig {
  districtId: string;
  /** Checkbox selection (pending until Display). */
  selectedLayerIds: string[];
  /** Last applied composition (after Display the Layers). */
  appliedLayerIds: string[];
  layerVisibility: Record<string, boolean>;
  layerOpacity: Record<string, number>;
}

export interface AtlasConfig {
  version: 1;
  activeDistrictId: string | null;
  districts: Record<string, AtlasDistrictConfig>;
}

export const ATLAS_LAYER_STORAGE_KEY = 'ap-eagle.atlas-layers.v1';

export const ATLAS_CATEGORY_LABEL: Record<AtlasLayerCategory, string> = {
  administrative: 'Administrative Layers',
  operational: 'Operational Layers',
  'road-network': 'Road Network Layers',
};
