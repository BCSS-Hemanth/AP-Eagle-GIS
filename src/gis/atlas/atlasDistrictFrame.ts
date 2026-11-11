import { featureBbox } from '../adminHierarchy';

export type AtlasFrameBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
  /** Leaflet fitBounds maxZoom — higher = closer in. */
  maxZoom: number;
  /** Expand the focus box so neighbors stay in frame. */
  padRatio: number;
};

/**
 * Curated Atlas camera frames (north-up, 2D) when a plain district bbox
 * overshoots the intended briefing composition.
 *
 * ASR: match regional briefing extent — ASR majority with Vizianagaram /
 * Parvathipuram Manyam / Odisha (Koraput–Malkangiri) and coast context —
 * not the wider fit that pulls in Bhadrachalam–Rajahmundry–Kakinada.
 */
const CURATED_FRAMES: Record<string, AtlasFrameBounds> = {
  asr: {
    west: 81.32,
    south: 17.52,
    east: 83.58,
    north: 19.08,
    maxZoom: 10,
    padRatio: 0.02,
  },
};

const DEFAULT_PAD = 0.1;
const DEFAULT_MAX_ZOOM = 10;

/**
 * Geographic frame for Atlas fit / download. Prefers curated district frames.
 */
export function atlasFrameForDistrict(
  districtId: string | null | undefined,
  districtFeature: GeoJSON.Feature | null | undefined
): AtlasFrameBounds | null {
  if (districtId && CURATED_FRAMES[districtId]) {
    return { ...CURATED_FRAMES[districtId] };
  }
  if (!districtFeature) return null;
  const bbox = featureBbox(districtFeature);
  if (!bbox) return null;
  const [west, south, east, north] = bbox;
  return {
    west,
    south,
    east,
    north,
    maxZoom: DEFAULT_MAX_ZOOM,
    padRatio: DEFAULT_PAD,
  };
}
