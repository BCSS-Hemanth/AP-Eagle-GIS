import type { GisLayer } from '../types/gis';
import type { DashboardLayerConfig, DashboardLayerEntry, JsonStorage } from './dashboardLayers';
import { leafletFlagsFromLayers } from './dashboardLayers';

/** Persist layers explicitly saved into Roads Routing (union across catalog modules). */
export const ROADS_ROUTING_LAYER_STORAGE_KEY = 'ap-eagle.roads-routing-layers.v1';

export type RoadsRoutingLayerConfig = DashboardLayerConfig;

/** Line layers that can contribute to continuous road-network routing. */
export const ROUTABLE_ROAD_LAYER_IDS = [
  'lyr-highways',
  'lyr-ap-roads-full',
  'lyr-ops-vsp-roads',
  'lyr-ap-roads-major',
  'lyr-ops-main-roads',
  'lyr-ops-internal-roads',
  'lyr-forest-trails',
] as const;

/** Shown on the routing map / analysed near routes — not used as road topology. */
export const ROUTING_LOCATION_LAYER_IDS = [
  'lyr-pss',
  'lyr-border-ps',
  'lyr-checkposts',
  'lyr-toll-plazas',
  'lyr-entry-exit',
  'lyr-stock-points',
  'lyr-ddacs',
  'lyr-pharma-hubs',
  'lyr-hotspots',
  'lyr-seizure-polys',
] as const;

/** Corridor / rail overlays — display only; never treated as verified driving roads. */
export const ROUTING_OVERLAY_ONLY_LAYER_IDS = [
  'lyr-drug-routes',
  'lyr-railways',
  'lyr-asr-agency',
] as const;

export function isRoutableRoadLayer(id: string): boolean {
  return (ROUTABLE_ROAD_LAYER_IDS as readonly string[]).includes(id);
}

export function isRoutingLocationLayer(id: string): boolean {
  return (ROUTING_LOCATION_LAYER_IDS as readonly string[]).includes(id);
}

/**
 * Merge currently enabled layers from a catalog scope into Roads Routing.
 * Previously saved layers outside this batch are kept (additive).
 */
export function mergeEnabledLayersIntoRoutingConfig(
  current: RoadsRoutingLayerConfig,
  layers: GisLayer[],
  groupFilter: Array<GisLayer['groupId']> | null
): RoadsRoutingLayerConfig {
  const next: RoadsRoutingLayerConfig = { ...current };
  for (const layer of layers) {
    if (groupFilter && !groupFilter.includes(layer.groupId)) continue;
    if (!layer.enabled) continue;
    next[layer.id] = { enabled: false, opacity: layer.opacity };
  }
  return next;
}

export function routingLayersFromConfig(
  allLayers: GisLayer[],
  config: RoadsRoutingLayerConfig
): GisLayer[] {
  return allLayers
    .filter((layer) => Boolean(config[layer.id]))
    .map((layer) => {
      const saved = config[layer.id] as DashboardLayerEntry;
      return { ...layer, enabled: Boolean(saved.enabled), opacity: saved.opacity };
    });
}

/** Count of layers assigned to Roads Routing (includes Eye-hidden). */
export function countRoutingLayers(config: RoadsRoutingLayerConfig): number {
  return Object.keys(config).length;
}

export function persistRoadsRoutingLayerConfig(
  config: RoadsRoutingLayerConfig,
  storage: JsonStorage | null = browserStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(ROADS_ROUTING_LAYER_STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function loadRoadsRoutingLayerConfig(
  storage: JsonStorage | null = browserStorage()
): RoadsRoutingLayerConfig | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ROADS_ROUTING_LAYER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: RoadsRoutingLayerConfig = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const row = value as { enabled?: unknown; opacity?: unknown };
      if (typeof row.enabled !== 'boolean') continue;
      out[id] = {
        enabled: row.enabled,
        opacity:
          typeof row.opacity === 'number'
            ? Math.min(100, Math.max(15, Math.round(row.opacity)))
            : 100,
      };
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

export function routingMapFlags(layers: GisLayer[]) {
  return leafletFlagsFromLayers(layers);
}

function browserStorage(): JsonStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}
