import type { GisLayer } from '../types/gis';
import { catalogModuleForLayer } from './catalogWorkspaces';
import type { DashboardLayerConfig, DashboardLayerEntry, JsonStorage } from './dashboardLayers';
import { isLayerOn, leafletFlagsFromLayers } from './dashboardLayers';
import { INITIAL_GIS_LAYERS } from '../data/apGisData';

/** Persist layers explicitly saved into Roads Routing (union across catalog modules). */
export const ROADS_ROUTING_LAYER_STORAGE_KEY = 'ap-eagle.roads-routing-layers.v1';

export type RoadsRoutingLayerConfig = DashboardLayerConfig;

/**
 * Road Network line layers that must never enter the driving graph
 * (rail, water, intel corridors — not traversable road centerlines).
 * New road LineStrings in the Road Network catalog are routable by default.
 */
export const ROUTING_NON_ROUTABLE_LINE_IDS = [
  'lyr-railways',
  'lyr-rivers',
  'lyr-ganja-transport-routes',
  'lyr-drug-routes',
] as const;

/** Shown on the routing map / analysed near routes — not used as road topology. */
export const ROUTING_LOCATION_LAYER_IDS = [
  'lyr-pss',
  'lyr-border-ps',
  'lyr-proposed-anpr',
  'lyr-ps-border-area',
  'lyr-kmz-villages',
  'lyr-checkposts',
  'lyr-toll-plazas',
  'lyr-entry-exit',
  'lyr-stock-points',
  'lyr-ddacs',
  'lyr-pharma-hubs',
  'lyr-hotspots',
  'lyr-seizure-polys',
] as const;

/** Non-line / non-road overlays — display only. */
export const ROUTING_OVERLAY_ONLY_LAYER_IDS = [
  'lyr-drug-routes',
  'lyr-ganja-transport-routes',
  'lyr-railways',
  'lyr-rivers',
  'lyr-asr-agency',
  'lyr-ap-neighbor-states',
  'lyr-aob-dists',
  'lyr-atlas-map-data',
] as const;

function isNonRoutableLineId(id: string): boolean {
  return (ROUTING_NON_ROUTABLE_LINE_IDS as readonly string[]).includes(id);
}

/**
 * True when a layer can contribute edges to the GIS routing graph.
 * Rule: Road Network catalog + LineString − explicit non-road denylist.
 * Future Road Network line layers are included automatically and use the same
 * geometry-preserving graph builder ({@link buildRoadGraph}) as existing layers.
 */
export function isRoutableRoadLayer(layerOrId: GisLayer | string): boolean {
  if (typeof layerOrId === 'string') {
    const hit = INITIAL_GIS_LAYERS.find((l) => l.id === layerOrId);
    return hit ? isRoutableRoadLayer(hit) : false;
  }
  const layer = layerOrId;
  if (layer.geometryType !== 'LineString') return false;
  if (isNonRoutableLineId(layer.id)) return false;
  if (catalogModuleForLayer(layer) !== 'road-network-layers') return false;
  return true;
}

/** Snapshot of current catalog ids that satisfy {@link isRoutableRoadLayer} (tests / diagnostics). */
export function listRoutableRoadLayerIds(
  catalog: readonly GisLayer[] = INITIAL_GIS_LAYERS
): string[] {
  return catalog.filter((l) => isRoutableRoadLayer(l)).map((l) => l.id);
}

/** @deprecated Prefer {@link listRoutableRoadLayerIds} — kept for older call sites/tests. */
export const ROUTABLE_ROAD_LAYER_IDS = listRoutableRoadLayerIds();

export function isRoutingLocationLayer(id: string): boolean {
  return (ROUTING_LOCATION_LAYER_IDS as readonly string[]).includes(id);
}

/**
 * Resolve a fetchable GeoJSON URL from the layer catalog `sourceTable`.
 * Supports `/api/...`, `/geo/...`, and `public/geo/...` forms used in GIS-Source.
 */
export function resolveLayerGeoJsonUrl(layer: GisLayer): string | null {
  const raw = (layer.sourceTable ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('/api/') || raw.startsWith('/geo/')) return raw;
  if (raw.startsWith('public/geo/')) return `/${raw.slice('public/'.length)}`;
  if (raw.startsWith('geo/')) return `/${raw}`;
  return null;
}

/** PostGIS road extracts that require a bbox query param. */
export function isPostgisRoadGeoJsonUrl(url: string): boolean {
  return url.startsWith('/api/gis-roads');
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
  const base = leafletFlagsFromLayers(layers);
  // Saved-layer lists are sparse — do not inherit Dashboard “default on” for admin borders.
  return {
    ...base,
    showStateBorder: isLayerOn(layers, 'lyr-state-border'),
    showDistricts: isLayerOn(layers, 'lyr-districts'),
  };
}

function browserStorage(): JsonStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}
