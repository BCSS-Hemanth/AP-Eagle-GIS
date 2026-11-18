/**
 * Travel-mode layer allowlists for Roads Routing (Route Alternatives).
 * Find Routes only builds the GIS graph from Eye-on layers in the selected mode’s set.
 */

export type RoutingTravelMode = 'four-wheeler' | 'two-wheeler' | 'on-foot';

export const ROUTING_TRAVEL_MODE_LABEL: Record<RoutingTravelMode, string> = {
  'four-wheeler': 'Four-Wheeler',
  'two-wheeler': 'Two-Wheeler',
  'on-foot': 'On Foot',
};

/** Typical speeds for ETA labels (km/h). */
export function travelModeSpeedKmh(mode: RoutingTravelMode): number {
  if (mode === 'on-foot') return 5;
  if (mode === 'two-wheeler') return 35;
  return 45;
}

/**
 * Road Network layers that may contribute edges for each travel mode.
 * Layers outside a mode’s set are ignored even if Eye-on.
 */
export const ROUTING_TRAVEL_MODE_LAYER_IDS: Record<
  RoutingTravelMode,
  ReadonlySet<string>
> = {
  'four-wheeler': new Set([
    'lyr-ops-main-roads',
    'lyr-highways',
    'lyr-ap-roads-major',
    'lyr-roads-asr-classified',
  ]),
  'two-wheeler': new Set([
    'lyr-ops-main-roads',
    'lyr-ops-internal-roads',
    'lyr-ganja-transport-routes',
    'lyr-roads-asr-classified',
    'lyr-asr-road-network',
    'lyr-route-modeling',
    'lyr-highways',
    'lyr-ap-roads-full',
    'lyr-ap-roads-major',
  ]),
  'on-foot': new Set(['lyr-forest-trails']),
};

/** Human-readable layer names for Route Alternatives hover help. */
export const ROUTING_TRAVEL_MODE_LAYER_LABELS: Record<
  RoutingTravelMode,
  readonly string[]
> = {
  'four-wheeler': [
    'OPS Main Roads (161)',
    'National Highways (2.5k)',
    'AP Major Roads NH/SH/MDR (5,917)',
    'ASR Roads — Main / Metal / Cart / Foot',
  ],
  'two-wheeler': [
    'OPS Main Roads (161)',
    'OPS Internal Roads (404)',
    'D - Routes (Ganja Transport)',
    'ASR Roads — Main / Metal / Cart / Foot',
    'ASR Road Network (5.7k)',
    'Route Modeling (5.8k)',
    'National Highways (2.5k)',
    'AP Roads Full Network (153k)',
    'AP Major Roads NH/SH/MDR',
  ],
  'on-foot': ['Foot Tracks (194)'],
};

export function layerEligibleForTravelMode(
  layerId: string,
  mode: RoutingTravelMode
): boolean {
  return ROUTING_TRAVEL_MODE_LAYER_IDS[mode].has(layerId);
}

/**
 * Whether a road feature may enter the GIS graph for the selected travel mode.
 * Eligibility is by catalog layer allowlist for that mode (whole layer).
 */
export function featureEligibleForTravelMode(
  layerId: string,
  _properties: GeoJSON.GeoJsonProperties,
  mode: RoutingTravelMode
): boolean {
  return layerEligibleForTravelMode(layerId, mode);
}

/** Keep only mode-eligible features from a layer FeatureCollection. */
export function filterFcForTravelMode(
  layerId: string,
  fc: GeoJSON.FeatureCollection,
  mode: RoutingTravelMode
): GeoJSON.FeatureCollection {
  if (!layerEligibleForTravelMode(layerId, mode)) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'FeatureCollection',
    features: fc.features.filter((feature) =>
      featureEligibleForTravelMode(layerId, feature.properties, mode)
    ),
  };
}
