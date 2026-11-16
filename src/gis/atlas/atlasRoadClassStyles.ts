/**
 * Atlas road-type colours (NH / SH / MDR / village / track / path).
 * Matches the gisconvert.org-style classified network look.
 */

export type AtlasRoadClassKey =
  | 'national'
  | 'state'
  | 'major'
  | 'other'
  | 'village'
  | 'track'
  | 'path'
  | 'unclassed';

export type AtlasRoadClassStyle = {
  key: AtlasRoadClassKey;
  label: string;
  color: string;
  weight: number;
};

/** Brighter strokes for satellite basemaps (national red → footpath lavender). */
export const ATLAS_ROAD_CLASS_STYLES: Record<AtlasRoadClassKey, AtlasRoadClassStyle> = {
  national: { key: 'national', label: 'National highway', color: '#ff2b2b', weight: 3.8 },
  state: { key: 'state', label: 'State highway', color: '#ff8a1a', weight: 3.4 },
  major: { key: 'major', label: 'Major district road', color: '#ffe01a', weight: 3.0 },
  other: { key: 'other', label: 'Other district road', color: '#f59e0b', weight: 2.6 },
  village: { key: 'village', label: 'Village road', color: '#38bdf8', weight: 2.15 },
  track: { key: 'track', label: 'Cart track', color: '#a78bfa', weight: 1.85 },
  path: { key: 'path', label: 'Footpath', color: '#e9d5ff', weight: 1.55 },
  unclassed: { key: 'unclassed', label: 'Road', color: '#94a3b8', weight: 1.9 },
};

function fromClassKey(raw: string): AtlasRoadClassKey | null {
  const k = raw.trim().toLowerCase();
  if (!k) return null;
  if (k === 'national' || k === 'nh') return 'national';
  if (k === 'state' || k === 'sh') return 'state';
  if (k === 'major' || k === 'mdr') return 'major';
  if (k === 'other' || k === 'odr' || k === 'district') return 'other';
  if (k === 'village' || k === 'vr') return 'village';
  if (k === 'track' || k === 'cart') return 'track';
  if (k === 'path' || k === 'foot' || k === 'footpath') return 'path';
  if (k === 'unclassed' || k === 'unknown') return 'unclassed';
  return null;
}

function fromText(raw: string): AtlasRoadClassKey | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  if (t.includes('national highway') || /\bnh\b/.test(t)) return 'national';
  if (t.includes('state highway') || /\bsh\b/.test(t)) return 'state';
  if (t.includes('major district') || t.includes('mdr')) return 'major';
  if (t.includes('other district') || (t.includes('district road') && !t.includes('major'))) {
    return 'other';
  }
  if (t.includes('village')) return 'village';
  if (t.includes('cart track') || t.includes('cart tracks') || t.includes('motorble')) {
    return 'track';
  }
  if (
    t.includes('foot track') ||
    t.includes('footpath') ||
    t.includes('foot path') ||
    t.includes('sub tracks') ||
    t.includes('jantri') ||
    t.includes('bejingi') ||
    t.includes('bhihangurhi')
  ) {
    return 'path';
  }
  if (t.includes('metal road') || t.includes('katcha')) return 'other';
  if (t.includes('main road') || t.includes('bt- nh') || t.includes('nh-sh')) return 'national';
  return null;
}

/** Resolve Atlas road class from feature properties (class_key, road_class, rd_sub_typ, folder). */
export function classifyAtlasRoadProperties(
  properties: GeoJSON.GeoJsonProperties
): AtlasRoadClassStyle {
  const props = (properties ?? {}) as Record<string, unknown>;
  const byKey = fromClassKey(String(props.class_key ?? ''));
  if (byKey) {
    const base = ATLAS_ROAD_CLASS_STYLES[byKey];
    const roadClass = String(props.road_class ?? '').trim();
    return roadClass ? { ...base, label: roadClass } : base;
  }

  const candidates = [
    String(props.road_class ?? ''),
    String(props.rd_sub_typ ?? props.RD_SUB_TYP ?? ''),
    String(props.RD_TYPE ?? ''),
    String(props.folder ?? ''),
    String(props.name ?? ''),
    String(props.description ?? ''),
  ];
  for (const c of candidates) {
    const hit = fromText(c);
    if (hit) {
      const base = ATLAS_ROAD_CLASS_STYLES[hit];
      // Prefer a clean road_class / rd_sub_typ label when present.
      const preferred = String(props.road_class ?? props.rd_sub_typ ?? props.RD_SUB_TYP ?? '').trim();
      return preferred ? { ...base, label: preferred } : base;
    }
  }
  return ATLAS_ROAD_CLASS_STYLES.unclassed;
}

export function atlasRoadPathStyle(
  properties: GeoJSON.GeoJsonProperties
): { color: string; weight: number; opacity: number; fill: false } {
  const style = classifyAtlasRoadProperties(properties);
  return {
    color: style.color,
    weight: style.weight,
    opacity: 1,
    fill: false,
  };
}

/**
 * Former Atlas road hover text (`Village road · Name` / `Road · …`).
 * Road Network layers no longer bind map tooltips; kept for tests / exporters.
 */
export function atlasRoadHoverLabel(
  properties: GeoJSON.GeoJsonProperties,
  fallback = 'Road'
): string {
  const style = classifyAtlasRoadProperties(properties);
  const props = (properties ?? {}) as Record<string, unknown>;
  const name = String(props.name ?? props.ref ?? '').trim();
  if (name && name.toLowerCase() !== 'placemark 1') {
    return `${style.label} · ${name}`;
  }
  return style.label || fallback;
}

export const ATLAS_ROAD_LEGEND_ROWS: Array<{ label: string; color: string }> = [
  ATLAS_ROAD_CLASS_STYLES.national,
  ATLAS_ROAD_CLASS_STYLES.state,
  ATLAS_ROAD_CLASS_STYLES.major,
  ATLAS_ROAD_CLASS_STYLES.other,
  ATLAS_ROAD_CLASS_STYLES.village,
  ATLAS_ROAD_CLASS_STYLES.track,
  ATLAS_ROAD_CLASS_STYLES.path,
].map((s) => ({ label: s.label, color: s.color }));
