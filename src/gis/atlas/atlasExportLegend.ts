import type { GisLayer } from '../../types/gis';
import { INITIAL_GIS_LAYERS } from '../../data/apGisData';
import { ATLAS_ROAD_LEGEND_ROWS } from './atlasRoadClassStyles';
import type { AtlasInventoryLayer } from './atlasTypes';
import type { AtlasExportLegendItem } from './atlasExportDecorations';

/** Fallback colours aligned with map / KMZ styling for Atlas legend rows. */
const LAYER_LEGEND_COLOR: Record<string, string> = {
  'lyr-districts': '#0f2942',
  'lyr-mandals': '#000000',
  'lyr-villages': '#334155',
  'lyr-pss': '#0b1c30',
  'lyr-border-ps': '#0f766e',
  'lyr-proposed-anpr': '#f59e0b',
  'lyr-ap-neighbor-states': '#1e3a5f',
  'lyr-aob-dists': '#5b21b6',
  'lyr-kmz-villages': '#94a3b8',
  'lyr-ps-border-area': '#22d3ee',
  'lyr-hotspots': '#ba1a1a',
  'lyr-checkposts': '#0d9488',
  'lyr-entry-exit': '#0f766e',
  'lyr-stock-points': '#a16207',
  'lyr-ddacs': '#7c2d12',
  'lyr-seizure-polys': '#4338ca',
  'lyr-toll-plazas': '#1e3a8a',
  'lyr-drug-routes': '#b91c1c',
  'lyr-ops-internal-roads': '#7c3aed',
  'lyr-ops-main-roads': '#1d4ed8',
  'lyr-ganja-transport-routes': '#be185d',
  'lyr-roads-asr-classified': '#ff1f8f',
  'lyr-asr-road-network': '#00e8ff',
  'lyr-route-modeling': '#7c3aed',
  'lyr-forest-trails': '#15803d',
  'lyr-ap-roads-major': '#334155',
  'lyr-ap-roads-full': '#64748b',
  'lyr-rivers': '#0284c7',
  'lyr-asr-agency': '#5b21b6',
};

/** Layers drawn with Atlas road-class colours (NH / SH / MDR / …). */
const ATLAS_CLASSIFIED_ROAD_LAYER_IDS = new Set([
  'lyr-highways',
  'lyr-ap-roads-full',
  'lyr-ap-roads-major',
  'lyr-ops-main-roads',
  'lyr-ops-internal-roads',
  'lyr-forest-trails',
  'lyr-roads-asr-classified',
  'lyr-asr-road-network',
  'atlas-pedakurapadu-roads',
]);

function kindFromGeometry(
  geometryType: GisLayer['geometryType'] | undefined
): AtlasExportLegendItem['kind'] {
  if (geometryType === 'Point') return 'point';
  if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') return 'poly';
  return 'line';
}

/** Build legend rows for currently visible Atlas layers (Eye on). */
export function atlasExportLegendItems(
  visibleIds: ReadonlySet<string>,
  inventoryLayers: readonly AtlasInventoryLayer[],
  catalog: GisLayer[] = INITIAL_GIS_LAYERS
): AtlasExportLegendItem[] {
  const byId = new Map(catalog.map((l) => [l.id, l]));
  const items: AtlasExportLegendItem[] = [];
  let includeRoadClasses = false;

  for (const row of inventoryLayers) {
    if (!visibleIds.has(row.layerId)) continue;
    if (ATLAS_CLASSIFIED_ROAD_LAYER_IDS.has(row.layerId)) {
      includeRoadClasses = true;
      continue;
    }
    const lyr = byId.get(row.layerId);
    items.push({
      name: row.name,
      color: LAYER_LEGEND_COLOR[row.layerId] ?? '#2563eb',
      kind: kindFromGeometry(lyr?.geometryType),
    });
  }

  if (includeRoadClasses) {
    items.push(
      ...ATLAS_ROAD_LEGEND_ROWS.map((r) => ({
        name: r.label,
        color: r.color,
        kind: 'line' as const,
      }))
    );
  }

  return items;
}
