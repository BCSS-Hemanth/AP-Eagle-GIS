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

/** Dashboard defaults to India/state frame; districts appear after drill-in or catalog enable. */
export const DASHBOARD_DEFAULT_ON = ['lyr-state-border'] as const;

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

/**
 * Layers currently assigned+enabled on a destination (Dashboard / Routing / Routing New).
 * Strict: catalog checkbox state is ignored — only config.enabled === true counts.
 */
/**
 * Config a Save button should write from the current selection.
 * `snapshot` (Dashboard) records every layer: selected on, the rest off.
 * `assigned` (Roads Routing / Roads Routing New) keeps only selected layers,
 * always Eye-off on Save (`enabled: false`). The Eye icon turns them on.
 * Find Routes / Display Road Networks can enable saved layers in bulk.
 * `accept` drops layers that destination cannot store; unselected layers are omitted, so a later Save removes them.
 */
export function destinationConfigFromSelection(
  layers: GisLayer[],
  selectedIds: ReadonlySet<string>,
  mode: 'snapshot' | 'assigned',
  accept?: (layer: GisLayer) => boolean,
  previous?: DashboardLayerConfig | null
): DashboardLayerConfig {
  const out: DashboardLayerConfig = {};
  for (const layer of layers) {
    if (accept && !accept(layer)) continue;
    const selected = selectedIds.has(layer.id);
    if (mode === 'assigned' && !selected) continue;
    if (mode === 'assigned') {
      out[layer.id] = {
        enabled: false,
        opacity: previous?.[layer.id]?.opacity ?? layer.opacity,
      };
      continue;
    }
    out[layer.id] = { enabled: selected, opacity: layer.opacity };
  }
  return out;
}

export function layersEnabledInConfig(
  layers: GisLayer[],
  config: DashboardLayerConfig | null | undefined
): GisLayer[] {
  if (!config) return [];
  const out: GisLayer[] = [];
  for (const layer of layers) {
    const saved = config[layer.id];
    if (!saved?.enabled) continue;
    out.push({
      ...layer,
      enabled: true,
      opacity: clampOpacity(saved.opacity, layer.opacity),
    });
  }
  return out;
}

/**
 * Save-button hover list: live catalog Visible ticks ∪ destination-assigned layers.
 * If this destination explicitly has enabled:false, the layer stays off here even when
 * still Visible / assigned on another destination (independent Unselect All).
 */
export function hoverLayersForDestination(
  layers: GisLayer[],
  config: DashboardLayerConfig | null | undefined,
  predicate?: (layer: GisLayer) => boolean
): GisLayer[] {
  const byId = new Map<string, GisLayer>();
  for (const layer of layersEnabledInConfig(layers, config)) {
    if (predicate && !predicate(layer)) continue;
    byId.set(layer.id, layer);
  }
  for (const layer of layers) {
    if (!layer.enabled) continue;
    if (predicate && !predicate(layer)) continue;
    // Destination-local opt-out (Unselect All / remove) — do not re-add from live ticks.
    if (config?.[layer.id]?.enabled === false) continue;
    const prev = byId.get(layer.id);
    byId.set(layer.id, {
      ...layer,
      enabled: true,
      opacity: prev?.opacity ?? layer.opacity,
    });
  }
  return layers.filter((layer) => byId.has(layer.id)).map((layer) => byId.get(layer.id)!);
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
    showApRoadsFull: isLayerOn(layers, 'lyr-ap-roads-full'),
    showOpsVspRoads: isLayerOn(layers, 'lyr-ops-vsp-roads'),
    showApRoadsMajor: isLayerOn(layers, 'lyr-ap-roads-major'),
    showAgencyRoutes: isLayerOn(layers, 'lyr-drug-routes'),
    showRivers: isLayerOn(layers, 'lyr-rivers'),
    showWaterbodies: isLayerOn(layers, 'lyr-waterbodies'),
    showRailways: isLayerOn(layers, 'lyr-railways'),
    showTrails: isLayerOn(layers, 'lyr-forest-trails'),
    highlightAgency: isLayerOn(layers, 'lyr-asr-agency'),
    showAsrBoundary: isLayerOn(layers, 'lyr-asr-agency'),
    showHotspots: isLayerOn(layers, 'lyr-hotspots'),
    showCheckPosts: isLayerOn(layers, 'lyr-checkposts'),
    showTollPlazas: isLayerOn(layers, 'lyr-toll-plazas'),
    showGanjaSeized: isLayerOn(layers, 'lyr-seizure-polys'),
    showPharmaHubs: isLayerOn(layers, 'lyr-pharma-hubs'),
    showDdacs: isLayerOn(layers, 'lyr-ddacs'),
    showEntryExit: isLayerOn(layers, 'lyr-entry-exit'),
    showStockPoints: isLayerOn(layers, 'lyr-stock-points'),
    showOpsMainRoads: isLayerOn(layers, 'lyr-ops-main-roads'),
    showOpsInternalRoads: isLayerOn(layers, 'lyr-ops-internal-roads'),
    showGraticule: isLayerOn(layers, 'lyr-soi-grid'),
    showBorderPs: isLayerOn(layers, 'lyr-border-ps'),
    showTalukGis: isLayerOn(layers, 'lyr-taluk-gis'),
    showVspVillagePts: isLayerOn(layers, 'lyr-vsp-village-pts'),
    showDistrictsGisHist: isLayerOn(layers, 'lyr-districts-gis-hist'),
    showStateGisHist: isLayerOn(layers, 'lyr-state-gis-hist'),
    showImageryOverlay: isLayerOn(layers, 'lyr-cartosat'),
    showHillshade: isLayerOn(layers, 'lyr-hillshade'),
    showGoogleRoadmap: isLayerOn(layers, 'lyr-google-roadmap'),
    showSoiTopo: isLayerOn(layers, 'lyr-soi-topo'),
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
