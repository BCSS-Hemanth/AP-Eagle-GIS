/** Indian Railway (rail_nt) — distinct from orange/brown road network. */
export const RAIL_LINE_COLOR = '#6d28d9';
export const RAIL_CASING_COLOR = '#faf5ff';
export const RAIL_LABEL = 'Indian Railway';

export function railWeightForZoom(zoom: number): { casing: number; line: number } {
  if (zoom >= 11) return { casing: 7, line: 3.4 };
  if (zoom >= 9) return { casing: 5.5, line: 2.8 };
  if (zoom >= 7) return { casing: 4.2, line: 2.2 };
  return { casing: 3.2, line: 1.6 };
}

/** Leaflet / MapLibre dash: short tick pattern reads as track, not road. */
export const RAIL_DASH_ARRAY = '10 5 2 5';
export const RAIL_DASH_MAPLIBRE = [2.5, 1.2, 0.5, 1.2] as const;

export type RailFeatureProps = {
  'from-to'?: string;
  track_type?: string;
  division?: string;
} | null;

/** Primary label is always "Indian Railway"; route meta is secondary. */
export function formatRailTooltip(props: RailFeatureProps): string {
  const meta = [props?.['from-to'], props?.track_type, props?.division]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .join(' · ');
  return meta ? `${RAIL_LABEL} — ${meta}` : RAIL_LABEL;
}
