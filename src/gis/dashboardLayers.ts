import type { GisLayer } from '../types/gis';
import { INITIAL_GIS_LAYERS } from '../data/apGisData';

/** Last catalog snapshot applied to the GIS Dashboard map. */
export const DASHBOARD_LAYER_STORAGE_KEY = 'ap-eagle.dashboard-layers.v1';

export type DashboardLayerEntry = { enabled: boolean; opacity: number };
export type DashboardLayerConfig = Record<string, DashboardLayerEntry>;

export type JsonStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/** Dashboard stays district-only until the catalog Save button publishes a snapshot. */
export const DASHBOARD_DEFAULT_ON = ['lyr-state-border', 'lyr-districts'] as const;

export function layerConfigFromGisLayers(layers: GisLayer[]): DashboardLayerConfig {
  const out: DashboardLayerConfig = {};
  for (const layer of layers) {
    out[layer.id] = { enabled: layer.enabled, opacity: layer.opacity };
  }
  return out;
}

export function defaultDashboardLayerConfig(
  layers: GisLayer[] = INITIAL_GIS_LAYERS
): DashboardLayerConfig {
  const out: DashboardLayerConfig = {};
  for (const layer of layers) {
    out[layer.id] = {
      enabled: (DASHBOARD_DEFAULT_ON as readonly string[]).includes(layer.id),
      opacity: layer.opacity,
    };
  }
  return out;
}

export function applyLayerConfig(layers: GisLayer[], config: DashboardLayerConfig): GisLayer[] {
  return layers.map((layer) => {
    const saved = config[layer.id];
    if (!saved) return layer;
    return {
      ...layer,
      enabled: Boolean(saved.enabled),
      opacity: clampOpacity(saved.opacity, layer.opacity),
    };
  });
}

export function configsEqual(a: DashboardLayerConfig, b: DashboardLayerConfig): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    const left = a[id];
    const right = b[id];
    if (!left || !right) return false;
    if (left.enabled !== right.enabled) return false;
    if (left.opacity !== right.opacity) return false;
  }
  return true;
}

export function isLayerOn(layers: GisLayer[], id: string, fallback = false): boolean {
  return layers.find((layer) => layer.id === id)?.enabled ?? fallback;
}

export function layerOpacity(layers: GisLayer[], id: string, fallback = 1): number {
  const value = layers.find((layer) => layer.id === id)?.opacity;
  return value == null ? fallback : clampOpacity(value, fallback * 100) / 100;
}

/** Map flags the Dashboard (and catalog preview) can actually render from catalog rows. */
export function leafletFlagsFromLayers(layers: GisLayer[]) {
  return {
    showStateBorder: isLayerOn(layers, 'lyr-state-border', true),
    showDistricts: isLayerOn(layers, 'lyr-districts', true),
    districtOpacity: layerOpacity(layers, 'lyr-districts'),
    stateOpacity: layerOpacity(layers, 'lyr-state-border'),
    showMandals: isLayerOn(layers, 'lyr-mandals'),
    showVillages: isLayerOn(layers, 'lyr-villages'),
    mandalOpacity: layerOpacity(layers, 'lyr-mandals'),
    villageOpacity: layerOpacity(layers, 'lyr-villages'),
    showPoliceStations: isLayerOn(layers, 'lyr-pss'),
    policeStationOpacity: layerOpacity(layers, 'lyr-pss'),
    showHighways: isLayerOn(layers, 'lyr-highways'),
    showAgencyRoutes: isLayerOn(layers, 'lyr-drug-routes'),
    showRivers: isLayerOn(layers, 'lyr-rivers'),
    showRailways: isLayerOn(layers, 'lyr-railways'),
    showTrails: isLayerOn(layers, 'lyr-forest-trails'),
    highlightAgency: isLayerOn(layers, 'lyr-asr-agency'),
    showGraticule: isLayerOn(layers, 'lyr-soi-grid'),
    showImageryOverlay: isLayerOn(layers, 'lyr-cartosat'),
    showPlaces: isLayerOn(layers, 'lyr-mandals') || isLayerOn(layers, 'lyr-villages'),
  };
}

export function countEnabledLayers(layers: GisLayer[]): number {
  return layers.filter((layer) => layer.enabled).length;
}

export function persistDashboardLayerConfig(
  config: DashboardLayerConfig,
  storage: JsonStorage | null = browserStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(DASHBOARD_LAYER_STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function loadDashboardLayerConfig(
  storage: JsonStorage | null = browserStorage()
): DashboardLayerConfig | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DASHBOARD_LAYER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: DashboardLayerConfig = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const row = value as { enabled?: unknown; opacity?: unknown };
      if (typeof row.enabled !== 'boolean') continue;
      out[id] = {
        enabled: row.enabled,
        opacity: clampOpacity(typeof row.opacity === 'number' ? row.opacity : 100, 100),
      };
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

function clampOpacity(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(15, Math.round(value)));
}

function browserStorage(): JsonStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}
