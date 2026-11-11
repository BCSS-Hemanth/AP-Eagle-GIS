import type { LocusConfig, LocusDistrictConfig } from './locusTypes';
import { LOCUS_LAYER_STORAGE_KEY } from './locusTypes';
import type { JsonStorage } from '../dashboardLayers';

export function emptyLocusDistrictConfig(districtId: string): LocusDistrictConfig {
  return {
    districtId,
    selectedLayerIds: [],
    appliedLayerIds: [],
    layerVisibility: {},
    layerOpacity: {},
  };
}

export function defaultLocusConfig(): LocusConfig {
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

export function loadLocusConfig(storage: JsonStorage | null = browserStorage()): LocusConfig {
  if (!storage) return defaultLocusConfig();
  try {
    const raw = storage.getItem(LOCUS_LAYER_STORAGE_KEY);
    if (!raw) return defaultLocusConfig();
    const parsed = JSON.parse(raw) as Partial<LocusConfig>;
    if (!parsed || parsed.version !== 1 || typeof parsed.districts !== 'object') {
      return defaultLocusConfig();
    }
    const districts: Record<string, LocusDistrictConfig> = {};
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
    return defaultLocusConfig();
  }
}

export function persistLocusConfig(
  config: LocusConfig,
  storage: JsonStorage | null = browserStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LOCUS_LAYER_STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function getLocusDistrictConfig(
  config: LocusConfig,
  districtId: string
): LocusDistrictConfig {
  return config.districts[districtId] ?? emptyLocusDistrictConfig(districtId);
}

export function upsertLocusDistrictConfig(
  config: LocusConfig,
  district: LocusDistrictConfig
): LocusConfig {
  return {
    ...config,
    districts: { ...config.districts, [district.districtId]: district },
  };
}

export function locusHasPendingChanges(district: LocusDistrictConfig): boolean {
  const a = [...district.selectedLayerIds].sort().join(',');
  const b = [...district.appliedLayerIds].sort().join(',');
  return a !== b;
}
