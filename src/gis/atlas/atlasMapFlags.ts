import type { GisLayer } from '../../types/gis';
import { INITIAL_GIS_LAYERS } from '../../data/apGisData';
import { leafletFlagsFromLayers } from '../dashboardLayers';

/**
 * Build Leaflet show* flags from Atlas applied+visible layer ids.
 * Unselected / Eye-off layers stay off. Does not mutate global catalog state.
 */
export function atlasLeafletFlags(
  appliedVisibleIds: ReadonlySet<string>,
  catalog: GisLayer[] = INITIAL_GIS_LAYERS
) {
  const layers = catalog.map((layer) => ({
    ...layer,
    enabled: appliedVisibleIds.has(layer.id),
  }));
  return leafletFlagsFromLayers(layers);
}

export function atlasVisibleAppliedIds(
  appliedLayerIds: readonly string[],
  layerVisibility: Record<string, boolean>
): Set<string> {
  const out = new Set<string>();
  for (const id of appliedLayerIds) {
    if (layerVisibility[id] !== false) out.add(id);
  }
  return out;
}
