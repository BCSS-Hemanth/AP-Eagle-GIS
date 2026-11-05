import type { GisLayer, WorkspaceId } from '../types/gis';

export type CatalogWorkspaceId =
  | 'administrative-layers'
  | 'operational-layers'
  | 'road-network-layers';

export const CATALOG_WORKSPACE_IDS = [
  'administrative-layers',
  'operational-layers',
  'road-network-layers',
] as const satisfies readonly CatalogWorkspaceId[];

export function isCatalogWorkspace(ws: WorkspaceId): ws is CatalogWorkspaceId {
  return (CATALOG_WORKSPACE_IDS as readonly string[]).includes(ws);
}

/** Modules that can push layers into Roads Routing / Roads Routing New. */
export const ROADS_SAVE_CATALOG_IDS = [
  'administrative-layers',
  'operational-layers',
  'road-network-layers',
] as const satisfies readonly CatalogWorkspaceId[];

export function canSaveToRoadsModules(ws: WorkspaceId): boolean {
  return (ROADS_SAVE_CATALOG_IDS as readonly string[]).includes(ws);
}

export type CatalogScope = {
  eyebrow: string;
  title: string;
  blurb: string;
  /** null = full catalog (unused; theme catalogs set group filters). */
  groups: Array<GisLayer['groupId']> | null;
  /**
   * Extra layer ids shown/saved with this catalog even when groupId differs
   * (e.g. Admin blurb includes AP road network / rail / SOI grid).
   */
  extraLayerIds?: readonly string[];
};

/**
 * Layers stored outside grp-admin that still belong on the Administrative catalog.
 * National highways and AP major roads live under Road Network.
 */
export const ADMIN_CATALOG_EXTRA_LAYER_IDS = [
  'lyr-railways',
  'lyr-soi-grid',
] as const;

/** Road layers whose group is not grp-transport, plus the statewide highway products. */
export const ROAD_NETWORK_CATALOG_EXTRA_LAYER_IDS = [
  'lyr-ops-main-roads',
  'lyr-ops-internal-roads',
  'lyr-highways',
  'lyr-ap-roads-major',
  'lyr-ap-roads-full',
] as const;

export const CATALOG_SCOPE: Record<CatalogWorkspaceId, CatalogScope> = {
  'administrative-layers': {
    eyebrow: '',
    title: 'Administrative Layers',
    blurb: '',
    groups: ['grp-admin'],
    extraLayerIds: ADMIN_CATALOG_EXTRA_LAYER_IDS,
  },
  'operational-layers': {
    eyebrow: '',
    title: 'Operational Layers',
    blurb: '',
    groups: ['grp-ops'],
  },
  'road-network-layers': {
    eyebrow: '',
    title: 'Road Network Layers',
    blurb: '',
    groups: ['grp-transport'],
    extraLayerIds: ROAD_NETWORK_CATALOG_EXTRA_LAYER_IDS,
  },
};

/** Layers visible in a catalog module (same set used for Save to Roads*). */
export function layersInCatalogScope(
  workspace: CatalogWorkspaceId,
  layers: GisLayer[]
): GisLayer[] {
  const scope = CATALOG_SCOPE[workspace];
  if (!scope.groups) return layers;
  const extras = new Set(scope.extraLayerIds ?? []);
  return layers.filter(
    (layer) => scope.groups!.includes(layer.groupId) || extras.has(layer.id)
  );
}

/** Group filter for merge helpers; null = already scoped / full catalog. */
export function catalogGroupFilter(
  workspace: CatalogWorkspaceId
): Array<GisLayer['groupId']> | null {
  return CATALOG_SCOPE[workspace].groups;
}

/** Hover-menu module buckets (Admin / OPS / Road Network). */
export type CatalogModuleSectionId =
  | 'administrative-layers'
  | 'operational-layers'
  | 'road-network-layers'
  | 'other';

export const CATALOG_MODULE_SECTIONS: ReadonlyArray<{
  id: CatalogModuleSectionId;
  label: string;
}> = [
  { id: 'administrative-layers', label: 'Administrative' },
  { id: 'operational-layers', label: 'Operational' },
  { id: 'road-network-layers', label: 'Road Network' },
  { id: 'other', label: 'Other' },
];

/**
 * Primary catalog module for a layer (for hover segregation).
 * Dual-listed extras prefer the module that lists them as extras when that
 * differs from a coarser group (e.g. OPS roads under Road Network).
 */
export function catalogModuleForLayer(layer: GisLayer): CatalogModuleSectionId {
  const id = layer.id;
  if ((ROAD_NETWORK_CATALOG_EXTRA_LAYER_IDS as readonly string[]).includes(id)) {
    return 'road-network-layers';
  }
  if ((ADMIN_CATALOG_EXTRA_LAYER_IDS as readonly string[]).includes(id)) {
    return 'administrative-layers';
  }
  if (layer.groupId === 'grp-admin') return 'administrative-layers';
  if (layer.groupId === 'grp-ops') return 'operational-layers';
  if (layer.groupId === 'grp-transport') return 'road-network-layers';
  return 'other';
}

export type CatalogModuleLayerGroup = {
  id: CatalogModuleSectionId;
  label: string;
  layers: GisLayer[];
};

/** Group assigned layers under Administrative / Operational / Road Network (skip empty). */
export function groupLayersByCatalogModule(layers: GisLayer[]): CatalogModuleLayerGroup[] {
  const buckets = new Map<CatalogModuleSectionId, GisLayer[]>();
  for (const section of CATALOG_MODULE_SECTIONS) {
    buckets.set(section.id, []);
  }
  for (const layer of layers) {
    const moduleId = catalogModuleForLayer(layer);
    buckets.get(moduleId)!.push(layer);
  }
  return CATALOG_MODULE_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    layers: buckets.get(section.id) ?? [],
  })).filter((section) => section.layers.length > 0);
}
