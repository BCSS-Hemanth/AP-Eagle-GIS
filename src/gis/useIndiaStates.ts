import { useEffect, useState } from 'react';
import { featureCentroid } from './adminHierarchy';

export interface IndiaStateProperties {
  state_name: string;
  TYPE_1?: string;
  label_lon?: number;
  label_lat?: number;
  area_deg2?: number;
}

let cachedStates: GeoJSON.FeatureCollection | null = null;
let cachedOutline: GeoJSON.Feature | null = null;
let loadPromise: Promise<void> | null = null;

async function loadIndia() {
  if (cachedStates && cachedOutline) return;
  const [states, outline] = await Promise.all([
    fetch('/geo/india-states.geojson').then((r) => {
      if (!r.ok) throw new Error('Failed to load India state boundaries');
      return r.json();
    }),
    fetch('/geo/india-outline.geojson').then((r) => {
      if (!r.ok) throw new Error('Failed to load India outline');
      return r.json();
    }),
  ]);
  cachedStates = states;
  cachedOutline =
    outline?.type === 'Feature'
      ? outline
      : outline?.type === 'FeatureCollection'
        ? (outline.features?.[0] ?? null)
        : null;
}

export function useIndiaStates() {
  const [states, setStates] = useState<GeoJSON.FeatureCollection | null>(cachedStates);
  const [outline, setOutline] = useState<GeoJSON.Feature | null>(cachedOutline);
  const [ready, setReady] = useState(Boolean(cachedStates && cachedOutline));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!loadPromise) loadPromise = loadIndia();
    loadPromise
      .then(() => {
        if (cancelled) return;
        setStates(cachedStates);
        setOutline(cachedOutline);
        setReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { states, outline, ready, error };
}

export function stateDisplayName(feature: GeoJSON.Feature | undefined | null): string {
  return String(
    (feature?.properties as IndiaStateProperties | null)?.state_name ??
      (feature?.properties as { st_nm?: string } | null)?.st_nm ??
      ''
  ).trim();
}

/** Exact current Andhra Pradesh only — never Telangana or undivided legacy names. */
export function isAndhraPradesh(feature: GeoJSON.Feature | undefined | null): boolean {
  const name = stateDisplayName(feature).toLowerCase().replace(/\s+/g, ' ');
  return name === 'andhra pradesh';
}

/**
 * Map label text for the dashboard India overview.
 * Keeps official names; shortens only ultra-long UT strings so they fit like the reference.
 */
export function stateMapLabel(feature: GeoJSON.Feature | undefined | null): string {
  const name = stateDisplayName(feature);
  const key = name.toLowerCase();
  if (key.includes('dadra') && key.includes('daman')) return 'DNH & DD';
  if (key.includes('andaman')) return 'A & N Islands';
  return name;
}

/**
 * Visual label anchors [lat, lon] for states whose GeoJSON label_* / bbox center
 * sits away from the readable map center (elongated or multipolygon shapes).
 */
const LABEL_ANCHOR_OVERRIDES: Record<string, [number, number]> = {
  Assam: [26.32, 92.9],
  Gujarat: [22.9, 71.7],
  'West Bengal': [23.4, 87.9],
};

/** Label anchor [lat, lon] — override → curated label_* → polygon centroid. */
export function stateLabelLatLng(
  feature: GeoJSON.Feature | undefined | null
): [number, number] | null {
  if (!feature) return null;
  const name = stateDisplayName(feature);
  const override = LABEL_ANCHOR_OVERRIDES[name];
  if (override) return override;
  const props = feature.properties as IndiaStateProperties | null;
  const lon = Number(props?.label_lon);
  const lat = Number(props?.label_lat);
  if (Number.isFinite(lon) && Number.isFinite(lat)) return [lat, lon];
  const c = featureCentroid(feature);
  return c ? [c[1], c[0]] : null;
}

const CROWDED_STATE_LABEL =
  /^(sikkim|nagaland|manipur|mizoram|tripura|meghalaya|goa|delhi|chandigarh|puducherry|dadra|daman|lakshadweep|andaman|ladakh|jammu)/i;

export type CleanOverviewLabelTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * Dashboard political-clean label size by state area + zoom (reference-style hierarchy).
 */
export function cleanOverviewLabelTier(
  zoom: number,
  opts: { ap: boolean; areaDeg2: number }
): CleanOverviewLabelTier {
  const area = Number.isFinite(opts.areaDeg2) ? opts.areaDeg2 : 0;
  const order: CleanOverviewLabelTier[] = ['xs', 'sm', 'md', 'lg', 'xl'];
  let idx = area >= 14 ? 3 : area >= 5 ? 2 : area >= 1.2 ? 1 : 0;
  if (opts.ap) idx = Math.min(idx + 1, 4);
  if (zoom >= 6.8) {
    idx = Math.min(Math.max(idx + 1, 1), 4);
  } else if (zoom >= 5.8 && area >= 1.2) {
    idx = Math.min(idx + 1, 4);
  } else if (zoom >= 4.5 && area >= 3.5) {
    idx = Math.min(idx + 1, 4);
  }
  return order[idx]!;
}

/**
 * Permanent India-overview labels (non-clean maps): keep large states + AP readable;
 * defer NE/UT clutter to hover until closer zoom. Political-clean dashboard is hover-only.
 */
export function shouldShowPermanentStateLabel(
  zoom: number,
  opts: { ap: boolean; areaDeg2: number; name: string }
): boolean {
  if (opts.ap) return zoom >= 4;
  const crowded = CROWDED_STATE_LABEL.test(opts.name.trim());
  if (crowded) return zoom >= 6.8;
  if (zoom < 4.8) return opts.areaDeg2 >= 14;
  if (zoom < 5.8) return opts.areaDeg2 >= 3.5;
  if (zoom < 6.5) return opts.areaDeg2 >= 1.2;
  return true;
}
