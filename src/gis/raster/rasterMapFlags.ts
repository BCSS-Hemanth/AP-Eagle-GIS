import type { GisLayer } from '../../types/gis';
import { INITIAL_GIS_LAYERS } from '../../data/apGisData';
import { leafletFlagsFromLayers } from '../dashboardLayers';

/** Build Leaflet show* flags from Raster applied+visible layer ids. */
export function rasterLeafletFlags(
  appliedVisibleIds: ReadonlySet<string>,
  catalog: GisLayer[] = INITIAL_GIS_LAYERS
) {
  const layers = catalog.map((layer) => ({
    ...layer,
    enabled: appliedVisibleIds.has(layer.id),
  }));
  return leafletFlagsFromLayers(layers);
}

export function rasterVisibleAppliedIds(
  appliedLayerIds: readonly string[],
  layerVisibility: Record<string, boolean>
): Set<string> {
  const out = new Set<string>();
  for (const id of appliedLayerIds) {
    if (layerVisibility[id] !== false) out.add(id);
  }
  return out;
}
