import type { LocusDistrictInventory, LocusInventoryLayer } from './locusTypes';

/**
 * Verified ASR inventory (same counts as Atlas — re-verified, not invented).
 * Zero-feature layers are omitted by the filter below.
 */
const ASR_LAYERS: LocusInventoryLayer[] = [
  {
    layerId: 'lyr-districts',
    category: 'administrative',
    name: 'District Boundaries (2022)',
    featureCount: 1,
    countNote: 'ASR polygon only',
  },
  { layerId: 'lyr-mandals', category: 'administrative', name: 'Mandals', featureCount: 22 },
  {
    layerId: 'lyr-villages',
    category: 'administrative',
    name: 'Revenue Villages',
    featureCount: 3493,
  },
  { layerId: 'lyr-pss', category: 'administrative', name: 'Police Stations', featureCount: 22 },
  {
    layerId: 'lyr-border-ps',
    category: 'administrative',
    name: 'Border Police Stations',
    featureCount: 14,
  },
  {
    layerId: 'lyr-vsp-village-pts',
    category: 'administrative',
    name: 'VSP / AOB Village Points',
    featureCount: 3006,
  },
  {
    layerId: 'lyr-taluk-gis',
    category: 'administrative',
    name: 'Taluks / Mandals (GIS-Source)',
    featureCount: 6,
  },
  {
    layerId: 'lyr-soi-grid',
    category: 'administrative',
    name: 'SOI 1:50K Map-No Points',
    featureCount: 17,
  },
  {
    layerId: 'lyr-state-border',
    category: 'administrative',
    name: 'State Border (AP, post-2014)',
    featureCount: 1,
  },
  {
    layerId: 'lyr-districts-gis-hist',
    category: 'administrative',
    name: 'GIS-Source Historical Districts',
    featureCount: 5,
    countNote: 'Overlay only · undivided',
  },
  {
    layerId: 'lyr-state-gis-hist',
    category: 'administrative',
    name: 'GIS-Source Historical State',
    featureCount: 1,
    countNote: 'Overlay only · undivided',
  },
  {
    layerId: 'lyr-asr-agency',
    category: 'operational',
    name: 'ASR Dist-Admin Boundary',
    featureCount: 1,
  },
  { layerId: 'lyr-hotspots', category: 'operational', name: 'Mapped Hotspots', featureCount: 37 },
  { layerId: 'lyr-drug-routes', category: 'operational', name: 'Drug Routes', featureCount: 69 },
  { layerId: 'lyr-checkposts', category: 'operational', name: 'Check Posts', featureCount: 5 },
  { layerId: 'lyr-stock-points', category: 'operational', name: 'Stock Points', featureCount: 13 },
  { layerId: 'lyr-ddacs', category: 'operational', name: 'DDACs', featureCount: 6 },
  {
    layerId: 'lyr-seizure-polys',
    category: 'operational',
    name: 'Ganja Seized Points',
    featureCount: 4,
  },
  {
    layerId: 'lyr-entry-exit',
    category: 'operational',
    name: 'Entry & Exit Points',
    featureCount: 6,
    countNote: 'Entry points only in ASR',
  },
  { layerId: 'lyr-toll-plazas', category: 'operational', name: 'Toll Plazas', featureCount: 2 },
  {
    layerId: 'lyr-ops-internal-roads',
    category: 'road-network',
    name: 'OPS Internal Roads',
    featureCount: 391,
  },
  {
    layerId: 'lyr-ops-main-roads',
    category: 'road-network',
    name: 'OPS Main Roads',
    featureCount: 34,
  },
  {
    layerId: 'lyr-forest-trails',
    category: 'road-network',
    name: 'Foot Tracks',
    featureCount: 113,
  },
  {
    layerId: 'lyr-railways',
    category: 'road-network',
    name: 'Indian Railway (GIS-Source, 43)',
    featureCount: 1,
  },
  {
    layerId: 'lyr-ap-roads-major',
    category: 'road-network',
    name: 'AP Major Roads (NH/SH/MDR)',
    featureCount: 299,
    countNote: 'State Highway only in ASR',
  },
  {
    layerId: 'lyr-ap-roads-full',
    category: 'road-network',
    name: 'AP Roads Full Network',
    featureCount: 10577,
    countNote: 'Approx · PostGIS bbox',
  },
  {
    layerId: 'lyr-ops-vsp-roads',
    category: 'road-network',
    name: 'OPS VSP Roads',
    featureCount: 7094,
    countNote: 'Approx · PostGIS bbox',
  },
  { layerId: 'lyr-rivers', category: 'road-network', name: 'Major Rivers', featureCount: 9 },
  {
    layerId: 'lyr-waterbodies',
    category: 'road-network',
    name: 'Lakes & Reservoirs',
    featureCount: 13,
  },
];

const INVENTORIES: Record<string, LocusDistrictInventory> = {
  asr: { districtId: 'asr', layers: ASR_LAYERS },
};

export function locusInventoryForDistrict(districtId: string): LocusDistrictInventory | null {
  const inv = INVENTORIES[districtId];
  if (!inv) return null;
  return {
    districtId: inv.districtId,
    layers: inv.layers.filter((l) => l.featureCount > 0),
  };
}

export function locusLayersByCategory(
  inventory: LocusDistrictInventory | null,
  category: LocusInventoryLayer['category']
): LocusInventoryLayer[] {
  if (!inventory) return [];
  return inventory.layers.filter((l) => l.category === category);
}
