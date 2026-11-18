/** Optional per-layer hex colours (Roads Routing / Atlas / Locus — each module stores its own). */

export function normalizeLayerColorMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    const c = normalizeLayerHexColor(raw);
    if (c) out[id] = c;
  }
  return out;
}

export function normalizeLayerHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    const r = t[1];
    const g = t[2];
    const b = t[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return undefined;
}

/** Build map-only overrides from a destination layer config. */
export function layerColorOverridesFromConfig(
  config: Record<string, { color?: string } | undefined> | null | undefined
): Record<string, string> {
  if (!config) return {};
  const out: Record<string, string> = {};
  for (const [id, entry] of Object.entries(config)) {
    const c = normalizeLayerHexColor(entry?.color);
    if (c) out[id] = c;
  }
  return out;
}

/** Picker swatch when the user has not saved a custom colour yet. */
export const LAYER_PICKER_DEFAULT_COLORS: Record<string, string> = {
  'lyr-districts': '#0f2942',
  'lyr-mandals': '#000000',
  'lyr-villages': '#000000',
  'lyr-pss': '#0f766e',
  'lyr-state-gis-hist': '#431407',
  'lyr-districts-gis-hist': '#78350f',
  'lyr-taluk-gis': '#f97316',
  'lyr-border-ps': '#14b8a6',
  'lyr-proposed-anpr': '#f59e0b',
  'lyr-ap-neighbor-states': '#7dd3fc',
  'lyr-aob-dists': '#38bdf8',
  'lyr-kmz-villages': '#94a3b8',
  'lyr-ps-border-area': '#22d3ee',
  'lyr-vsp-village-pts': '#cbd5e1',
  'lyr-rivers': '#0284c7',
  'lyr-highways': '#ef4444',
  'lyr-ap-roads-full': '#60a5fa',
  'lyr-ap-roads-major': '#facc15',
  'lyr-ops-main-roads': '#fb923c',
  'lyr-ops-internal-roads': '#a78bfa',
  'lyr-ganja-transport-routes': '#fb7185',
  'lyr-roads-asr-classified': '#ff1f8f',
  'lyr-asr-road-network': '#00e8ff',
  'lyr-route-modeling': '#7c3aed',
  'lyr-forest-trails': '#a3e635',
  'lyr-drug-routes': '#dc2626',
  'lyr-railways': '#111827',
  'lyr-asr-agency': '#5b21b6',
  'lyr-hotspots': '#7f1d1d',
  'lyr-checkposts': '#0f766e',
  'lyr-toll-plazas': '#1e3a8a',
  'lyr-seizure-polys': '#4338ca',
  'lyr-pharma-hubs': '#a16207',
  'lyr-ddacs': '#0369a1',
  'lyr-entry-exit': '#b45309',
  'lyr-stock-points': '#15803d',
};

export function pickerColorForLayer(layerId: string, override?: string | null): string {
  return (
    normalizeLayerHexColor(override) ?? LAYER_PICKER_DEFAULT_COLORS[layerId] ?? '#64748b'
  );
}

export function resolveLayerPaintColor(
  overrides: Record<string, string> | undefined,
  layerId: string,
  fallback: string
): string {
  return overrides?.[layerId] ?? fallback;
}
