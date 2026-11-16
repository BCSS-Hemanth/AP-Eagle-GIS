import type { RasterDistrictInventory, RasterInventoryLayer } from './rasterTypes';

/**
 * Verified ASR Raster inventory from GIS-Source Phase 1C manifests / catalog.
 * Counts are product overlay totals — not invented.
 */
const ASR_LAYERS: RasterInventoryLayer[] = [
  {
    layerId: 'lyr-soi-topo',
    name: 'SOI Toposheet Mosaic',
    featureCount: 239,
    countNote: 'LOD GroundOverlays · zoom for sheet detail',
  },
];

const BY_DISTRICT: Record<string, RasterDistrictInventory> = {
  asr: { districtId: 'asr', layers: ASR_LAYERS },
};

export function rasterInventoryForDistrict(
  districtId: string | null | undefined
): RasterDistrictInventory | null {
  if (!districtId) return null;
  return BY_DISTRICT[districtId] ?? null;
}
