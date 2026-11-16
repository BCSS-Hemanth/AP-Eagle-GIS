/**
 * Travel-mode eligibility for Roads Routing GIS graph edges.
 * Feature class uses Atlas classifiers (class_key / rd_sub_typ / folder / road_class).
 */

import { classifyAtlasRoadProperties, type AtlasRoadClassKey } from './atlas/atlasRoadClassStyles';

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

type ModeAllow = { four: boolean; two: boolean; foot: boolean };

const CLASS_ALLOW: Record<AtlasRoadClassKey, ModeAllow> = {
  national: { four: true, two: true, foot: false },
  state: { four: true, two: true, foot: false },
  major: { four: true, two: true, foot: false },
  other: { four: true, two: true, foot: false },
  village: { four: false, two: true, foot: false },
  track: { four: false, two: true, foot: true },
  path: { four: false, two: false, foot: true },
  unclassed: { four: true, two: true, foot: false },
};

/** Whole-layer defaults when attributes are missing / unclassed. */
const LAYER_DEFAULT_ALLOW: Record<string, ModeAllow> = {
  'lyr-highways': { four: true, two: true, foot: false },
  'lyr-ap-roads-major': { four: true, two: true, foot: false },
  'lyr-ap-roads-full': { four: true, two: true, foot: false },
  'lyr-ops-main-roads': { four: true, two: true, foot: false },
  'lyr-ops-internal-roads': { four: false, two: true, foot: false },
  'lyr-forest-trails': { four: false, two: false, foot: true },
  'lyr-roads-asr-classified': { four: true, two: true, foot: false },
  'lyr-asr-road-network': { four: true, two: true, foot: false },
  'lyr-route-modeling': { four: true, two: true, foot: false },
};

function allowForMode(allow: ModeAllow, mode: RoutingTravelMode): boolean {
  if (mode === 'four-wheeler') return allow.four;
  if (mode === 'two-wheeler') return allow.two;
  return allow.foot;
}

/**
 * Whether a road feature may enter the GIS graph for the selected travel mode.
 * Unknown future Road Network layers fall back to vehicle classes (four + two), not foot.
 */
export function featureEligibleForTravelMode(
  layerId: string,
  properties: GeoJSON.GeoJsonProperties,
  mode: RoutingTravelMode
): boolean {
  const classified = classifyAtlasRoadProperties(properties);
  const layerDefault = LAYER_DEFAULT_ALLOW[layerId] ?? {
    four: true,
    two: true,
    foot: false,
  };

  if (classified.key === 'unclassed') {
    return allowForMode(layerDefault, mode);
  }
  return allowForMode(CLASS_ALLOW[classified.key], mode);
}

/** Keep only mode-eligible LineString features from a layer FeatureCollection. */
export function filterFcForTravelMode(
  layerId: string,
  fc: GeoJSON.FeatureCollection,
  mode: RoutingTravelMode
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.filter((feature) =>
      featureEligibleForTravelMode(layerId, feature.properties, mode)
    ),
  };
}
