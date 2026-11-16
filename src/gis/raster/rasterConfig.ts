import type { RasterConfig, RasterDistrictConfig } from './rasterTypes';
import { RASTER_LAYER_STORAGE_KEY } from './rasterTypes';
import type { JsonStorage } from '../dashboardLayers';

export function emptyRasterDistrictConfig(districtId: string): RasterDistrictConfig {
  return {
    districtId,
    selectedLayerIds: [],
    appliedLayerIds: [],
    layerVisibility: {},
    layerOpacity: {},
  };
}

export function defaultRasterConfig(): RasterConfig {
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

export function loadRasterConfig(storage: JsonStorage | null = browserStorage()): RasterConfig {
  if (!storage) return defaultRasterConfig();
  try {
    const raw = storage.getItem(RASTER_LAYER_STORAGE_KEY);
    if (!raw) return defaultRasterConfig();
    const parsed = JSON.parse(raw) as Partial<RasterConfig>;
    if (!parsed || parsed.version !== 1 || typeof parsed.districts !== 'object') {
      return defaultRasterConfig();
    }
    const districts: Record<string, RasterDistrictConfig> = {};
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
    return defaultRasterConfig();
  }
}

export function persistRasterConfig(
  config: RasterConfig,
  storage: JsonStorage | null = browserStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(RASTER_LAYER_STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function getRasterDistrictConfig(
  config: RasterConfig,
  districtId: string
): RasterDistrictConfig {
  return config.districts[districtId] ?? emptyRasterDistrictConfig(districtId);
}

export function upsertRasterDistrictConfig(
  config: RasterConfig,
  district: RasterDistrictConfig
): RasterConfig {
  return {
    ...config,
    districts: { ...config.districts, [district.districtId]: district },
  };
}

export function rasterHasPendingChanges(district: RasterDistrictConfig): boolean {
  const a = [...district.selectedLayerIds].sort().join(',');
  const b = [...district.appliedLayerIds].sort().join(',');
  return a !== b;
}
