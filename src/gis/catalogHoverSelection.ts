import type { GisLayer } from '../types/gis';

/** Per-destination hover opt-outs (layer still Visible until opted out of all three). */
export type CatalogHoverExclusions = {
  dashboard: Record<string, true>;
  roadsRouting: Record<string, true>;
  roadsRoutingNew: Record<string, true>;
};

export type CatalogHoverDestination = keyof CatalogHoverExclusions;

export const EMPTY_CATALOG_HOVER_EXCLUSIONS: CatalogHoverExclusions = {
  dashboard: {},
  roadsRouting: {},
  roadsRoutingNew: {},
};

export function layersForCatalogHover(
  layers: GisLayer[],
  exclusions: Record<string, true> | undefined
): GisLayer[] {
  return layers.filter((layer) => layer.enabled && !exclusions?.[layer.id]);
}

export function excludeLayersFromHover(
  prev: CatalogHoverExclusions,
  destination: CatalogHoverDestination,
  layerIds: string[]
): { next: CatalogHoverExclusions; turnOffLayerIds: string[] } {
  const next: CatalogHoverExclusions = {
    dashboard: { ...prev.dashboard },
    roadsRouting: { ...prev.roadsRouting },
    roadsRoutingNew: { ...prev.roadsRoutingNew },
  };
  for (const id of layerIds) {
    next[destination][id] = true;
  }
  const turnOffLayerIds = layerIds.filter(
    (id) => next.dashboard[id] && next.roadsRouting[id] && next.roadsRoutingNew[id]
  );
  if (turnOffLayerIds.length > 0) {
    for (const id of turnOffLayerIds) {
      delete next.dashboard[id];
      delete next.roadsRouting[id];
      delete next.roadsRoutingNew[id];
    }
  }
  return { next, turnOffLayerIds };
}

/** Fresh catalog Visible tick — layer appears again on all three Save hovers. */
export function clearLayerHoverExclusions(
  prev: CatalogHoverExclusions,
  layerId: string
): CatalogHoverExclusions {
  if (!prev.dashboard[layerId] && !prev.roadsRouting[layerId] && !prev.roadsRoutingNew[layerId]) {
    return prev;
  }
  const next: CatalogHoverExclusions = {
    dashboard: { ...prev.dashboard },
    roadsRouting: { ...prev.roadsRouting },
    roadsRoutingNew: { ...prev.roadsRoutingNew },
  };
  delete next.dashboard[layerId];
  delete next.roadsRouting[layerId];
  delete next.roadsRoutingNew[layerId];
  return next;
}
