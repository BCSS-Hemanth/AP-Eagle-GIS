import type { AtlasConfig, AtlasDistrictConfig } from './atlasTypes';
import { ATLAS_LAYER_STORAGE_KEY } from './atlasTypes';
import type { JsonStorage } from '../dashboardLayers';

export function emptyAtlasDistrictConfig(districtId: string): AtlasDistrictConfig {
  return {
    districtId,
    selectedLayerIds: [],
    appliedLayerIds: [],
    layerVisibility: {},
    layerOpacity: {},
  };
}

export function defaultAtlasConfig(): AtlasConfig {
  return { version: 1, activeDistrictId: null, districts: {} };
}

function browserStorage(): JsonStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadAtlasConfig(storage: JsonStorage | null = browserStorage()): AtlasConfig {
  if (!storage) return defaultAtlasConfig();
  try {
    const raw = storage.getItem(ATLAS_LAYER_STORAGE_KEY);
    if (!raw) return defaultAtlasConfig();
    const parsed = JSON.parse(raw) as Partial<AtlasConfig>;
    if (!parsed || parsed.version !== 1 || typeof parsed.districts !== 'object') {
      return defaultAtlasConfig();
    }
    const districts: Record<string, AtlasDistrictConfig> = {};
    for (const [id, row] of Object.entries(parsed.districts ?? {})) {
      if (!row || typeof row !== 'object') continue;
      districts[id] = {
        districtId: id,
        selectedLayerIds: Array.isArray(row.selectedLayerIds)
          ? row.selectedLayerIds.filter((x): x is string => typeof x === 'string')
          : [],
        appliedLayerIds: Array.isArray(row.appliedLayerIds)
          ? row.appliedLayerIds.filter((x): x is string => typeof x === 'string')
          : [],
        layerVisibility:
          row.layerVisibility && typeof row.layerVisibility === 'object'
            ? Object.fromEntries(
                Object.entries(row.layerVisibility).filter(([, v]) => typeof v === 'boolean')
              )
            : {},
        layerOpacity:
          row.layerOpacity && typeof row.layerOpacity === 'object'
            ? Object.fromEntries(
                Object.entries(row.layerOpacity).filter(([, v]) => typeof v === 'number')
              )
            : {},
      };
    }
    return {
      version: 1,
      activeDistrictId:
        typeof parsed.activeDistrictId === 'string' ? parsed.activeDistrictId : null,
      districts,
    };
  } catch {
    return defaultAtlasConfig();
  }
}

export function persistAtlasConfig(
  config: AtlasConfig,
  storage: JsonStorage | null = browserStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(ATLAS_LAYER_STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function getDistrictConfig(
  config: AtlasConfig,
  districtId: string
): AtlasDistrictConfig {
  return config.districts[districtId] ?? emptyAtlasDistrictConfig(districtId);
}

export function upsertDistrictConfig(
  config: AtlasConfig,
  district: AtlasDistrictConfig
): AtlasConfig {
  return {
    ...config,
    districts: { ...config.districts, [district.districtId]: district },
  };
}

/** True when checkbox selection differs from last applied composition. */
export function atlasHasPendingChanges(district: AtlasDistrictConfig): boolean {
  const a = [...district.selectedLayerIds].sort().join(',');
  const b = [...district.appliedLayerIds].sort().join(',');
  return a !== b;
}
