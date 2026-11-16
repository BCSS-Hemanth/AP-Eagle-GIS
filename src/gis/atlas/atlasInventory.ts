import type { AtlasDistrictInventory, AtlasInventoryLayer } from './atlasTypes';

/**
 * Verified ASR (2022) inventory — spatial filter against ap-districts-2022 ASR polygon.
 * Zero-feature layers (e.g. Pharma Hubs, National Highways) are omitted.
 * Counts must not be invented; update only after re-verification.
 */
const ASR_LAYERS: AtlasInventoryLayer[] = [
  // Administrative
  {
    layerId: 'lyr-districts',
    category: 'administrative',
    name: 'District Boundaries (2022)',
    featureCount: 1,
    countNote: 'ASR polygon only',
  },
  {
    layerId: 'lyr-mandals',
    category: 'administrative',
    name: 'Mandals',
    featureCount: 22,
  },
  {
    layerId: 'lyr-villages',
    category: 'administrative',
    name: 'Revenue Villages',
    featureCount: 3493,
  },
  {
    layerId: 'lyr-pss',
    category: 'administrative',
    name: 'Police Stations',
    featureCount: 22,
  },
  {
    layerId: 'lyr-border-ps',
    category: 'administrative',
    name: 'Border Police Stations',
    featureCount: 14,
  },
  {
    layerId: 'lyr-proposed-anpr',
    category: 'administrative',
    name: 'Proposed ANPR Locations',
    featureCount: 38,
    countNote: 'Points and route lines intersecting ASR',
  },
  {
    layerId: 'lyr-ap-neighbor-states',
    category: 'administrative',
    name: 'AP & Neighboring States (KMZ)',
    featureCount: 4,
  },
  {
    layerId: 'lyr-aob-dists',
    category: 'administrative',
    name: 'AOB Districts (KMZ)',
    featureCount: 13,
  },
  {
    layerId: 'lyr-kmz-villages',
    category: 'administrative',
    name: 'Major Towns & Villages (KMZ)',
    featureCount: 182,
  },
  {
    layerId: 'lyr-ps-border-area',
    category: 'administrative',
    name: 'Police Stations — Border Area (KMZ)',
    featureCount: 22,
  },
  {
    layerId: 'lyr-atlas-map-data',
    category: 'administrative',
    name: 'Atlas Map Data Bundle (KMZ)',
    featureCount: 707,
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
    category: 'administrative',
    name: 'ASR Dist-Admin Boundary',
    featureCount: 1,
  },
  // Operational
  {
    layerId: 'lyr-hotspots',
    category: 'operational',
    name: 'Mapped Hotspots',
    featureCount: 37,
  },
  {
    layerId: 'lyr-drug-routes',
    category: 'operational',
    name: 'Drug Routes',
    featureCount: 69,
  },
  {
    layerId: 'lyr-checkposts',
    category: 'operational',
    name: 'Check Posts',
    featureCount: 5,
  },
  {
    layerId: 'lyr-stock-points',
    category: 'operational',
    name: 'Stock Points',
    featureCount: 13,
  },
  {
    layerId: 'lyr-ddacs',
    category: 'operational',
    name: 'DDACs',
    featureCount: 6,
  },
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
  {
    layerId: 'lyr-toll-plazas',
    category: 'operational',
    name: 'Toll Plazas',
    featureCount: 2,
  },
  // Road Network — lyr-highways omitted (0 NH in ASR)
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
    layerId: 'lyr-ganja-transport-routes',
    category: 'road-network',
    name: 'D - Routes (Ganja Transport)',
    featureCount: 157,
    countNote: 'Lines, points, and polygons intersecting ASR',
  },
  {
    layerId: 'lyr-roads-asr-classified',
    category: 'road-network',
    name: 'ASR Roads — Main / Metal / Cart / Foot (KMZ)',
    featureCount: 182,
  },
  {
    layerId: 'lyr-asr-road-network',
    category: 'road-network',
    name: 'ASR Road Network (KMZ)',
    featureCount: 5611,
  },
  {
    layerId: 'lyr-route-modeling',
    category: 'road-network',
    name: 'Route Modeling (KMZ)',
    featureCount: 5644,
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
    layerId: 'lyr-rivers',
    category: 'road-network',
    name: 'Major Rivers',
    featureCount: 9,
  },
];

/**
 * Verified Guntur (2022) inventory.
 * Polygons: largest-part centroid inside the Guntur polygon (the map clip rule).
 * Lines and points: geometry intersects that polygon.
 * Zero-feature layers are omitted. Counts must not be invented.
 */
const GUNTUR_LAYERS: AtlasInventoryLayer[] = [
  {
    layerId: 'lyr-districts',
    category: 'administrative',
    name: 'District Boundaries (2022)',
    featureCount: 1,
    countNote: 'Guntur polygon only',
  },
  {
    layerId: 'lyr-mandals',
    category: 'administrative',
    name: 'Mandals',
    featureCount: 16,
  },
  {
    layerId: 'lyr-villages',
    category: 'administrative',
    name: 'Revenue Villages',
    featureCount: 222,
  },
  {
    layerId: 'lyr-taluk-gis',
    category: 'administrative',
    name: 'Taluks / Mandals (GIS-Source)',
    featureCount: 2,
  },
  {
    layerId: 'lyr-ap-neighbor-states',
    category: 'administrative',
    name: 'AP & Neighboring States (KMZ)',
    featureCount: 1,
  },
  {
    layerId: 'lyr-kmz-villages',
    category: 'administrative',
    name: 'Major Towns & Villages (KMZ)',
    featureCount: 1,
  },
  {
    layerId: 'lyr-atlas-map-data',
    category: 'administrative',
    name: 'Atlas Map Data Bundle (KMZ)',
    featureCount: 2,
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
    featureCount: 1,
    countNote: 'Overlay only · undivided Guntur',
  },
  {
    layerId: 'lyr-state-gis-hist',
    category: 'administrative',
    name: 'GIS-Source Historical State',
    featureCount: 1,
    countNote: 'Overlay only · undivided',
  },
  {
    layerId: 'lyr-toll-plazas',
    category: 'operational',
    name: 'Toll Plazas',
    featureCount: 1,
  },
  {
    layerId: 'lyr-ops-main-roads',
    category: 'road-network',
    name: 'OPS Main Roads',
    featureCount: 1,
  },
  {
    layerId: 'lyr-highways',
    category: 'road-network',
    name: 'National Highways',
    featureCount: 51,
    countNote: 'National Highway',
  },
  {
    layerId: 'lyr-ap-roads-major',
    category: 'road-network',
    name: 'AP Major Roads (NH/SH/MDR)',
    featureCount: 110,
    countNote: 'National Highway 51, State Highway 59',
  },
  {
    layerId: 'lyr-ap-roads-full',
    category: 'road-network',
    name: 'AP Roads Full Network',
    featureCount: 3765,
    countNote: 'Approx · PostGIS bbox',
  },
  {
    layerId: 'lyr-railways',
    category: 'road-network',
    name: 'Indian Railway (GIS-Source, 43)',
    featureCount: 6,
  },
  {
    layerId: 'lyr-rivers',
    category: 'road-network',
    name: 'Major Rivers',
    featureCount: 3,
  },
];

/** Atlas-only. Not a catalog layer, so other modules do not list or draw it. */
export const ATLAS_PEDAKURAPADU_ROADS_ID = 'atlas-pedakurapadu-roads';

/**
 * Verified Palnadu (2022) inventory.
 * Polygons: largest-part centroid inside the Palnadu polygon.
 * Lines and points: a vertex or segment midpoint lies inside that polygon.
 * Pedakurapadu roads are the provided GeoJSON (916 lines, all inside Palnadu).
 * Zero-feature layers are omitted.
 */
const PALNADU_LAYERS: AtlasInventoryLayer[] = [
  {
    layerId: 'lyr-districts',
    category: 'administrative',
    name: 'District Boundaries (2022)',
    featureCount: 1,
    countNote: 'Palnadu polygon only',
  },
  {
    layerId: 'lyr-mandals',
    category: 'administrative',
    name: 'Mandals',
    featureCount: 27,
  },
  {
    layerId: 'lyr-villages',
    category: 'administrative',
    name: 'Revenue Villages',
    featureCount: 398,
  },
  {
    layerId: 'lyr-taluk-gis',
    category: 'administrative',
    name: 'Taluks / Mandals (GIS-Source)',
    featureCount: 4,
  },
  {
    layerId: 'lyr-ap-neighbor-states',
    category: 'administrative',
    name: 'AP & Neighboring States (KMZ)',
    featureCount: 3,
  },
  {
    layerId: 'lyr-atlas-map-data',
    category: 'administrative',
    name: 'Atlas Map Data Bundle (KMZ)',
    featureCount: 2,
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
    featureCount: 1,
    countNote: 'Overlay only · undivided Guntur',
  },
  {
    layerId: 'lyr-state-gis-hist',
    category: 'administrative',
    name: 'GIS-Source Historical State',
    featureCount: 1,
    countNote: 'Overlay only · undivided',
  },
  {
    layerId: 'lyr-toll-plazas',
    category: 'operational',
    name: 'Toll Plazas',
    featureCount: 2,
  },
  {
    layerId: ATLAS_PEDAKURAPADU_ROADS_ID,
    category: 'road-network',
    name: 'Pedakurapadu Roads',
    featureCount: 916,
    countNote: 'Provided GeoJSON · all lines inside Palnadu',
  },
  {
    layerId: 'lyr-ops-main-roads',
    category: 'road-network',
    name: 'OPS Main Roads',
    featureCount: 2,
  },
  {
    layerId: 'lyr-highways',
    category: 'road-network',
    name: 'National Highways',
    featureCount: 11,
    countNote: 'National Highway',
  },
  {
    layerId: 'lyr-ap-roads-major',
    category: 'road-network',
    name: 'AP Major Roads (NH/SH/MDR)',
    featureCount: 378,
    countNote: 'National Highway 11, State Highway 367',
  },
  {
    layerId: 'lyr-ap-roads-full',
    category: 'road-network',
    name: 'AP Roads Full Network',
    featureCount: 7110,
    countNote: 'Approx · PostGIS bbox',
  },
  {
    layerId: 'lyr-railways',
    category: 'road-network',
    name: 'Indian Railway (GIS-Source, 43)',
    featureCount: 2,
  },
  {
    layerId: 'lyr-rivers',
    category: 'road-network',
    name: 'Major Rivers',
    featureCount: 9,
  },
];

const INVENTORIES: Record<string, AtlasDistrictInventory> = {
  asr: { districtId: 'asr', layers: ASR_LAYERS },
  guntur: { districtId: 'guntur', layers: GUNTUR_LAYERS },
  palnadu: { districtId: 'palnadu', layers: PALNADU_LAYERS },
};

export function atlasInventoryForDistrict(districtId: string): AtlasDistrictInventory | null {
  const inv = INVENTORIES[districtId];
  if (!inv) return null;
  return {
    districtId: inv.districtId,
    layers: inv.layers.filter((l) => l.featureCount > 0),
  };
}

export function atlasLayersByCategory(
  inventory: AtlasDistrictInventory | null,
  category: AtlasInventoryLayer['category']
): AtlasInventoryLayer[] {
  if (!inventory) return [];
  return inventory.layers.filter((l) => l.category === category);
}
