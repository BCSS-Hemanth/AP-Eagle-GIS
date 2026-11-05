/** Common GIS attribute keys used across Admin / OPS / network layers. */
const NAME_KEYS = [
  'name',
  'NAME',
  'Name',
  // Prefer the most specific admin name when several are present on one feature.
  'village_name',
  'VIL_NAME',
  'mandal_name',
  'TALUK',
  'district_name',
  'DISTRICT',
  'DIST',
  'POLICE_STA',
  'from-to',
  'MAP_NO',
  'RD_TYPE',
  'RD_SUB_TYP',
  'NAME_1',
  'st_nm',
  'ST_NM',
  'ref',
  'folder',
] as const;

function clean(value: unknown): string {
  if (value == null) return '';
  const s = String(value).trim();
  return s && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined' ? s : '';
}

export function pickFeatureName(
  props: Record<string, unknown> | null | undefined,
  fallback = 'Feature'
): string {
  if (!props) return fallback;
  for (const key of NAME_KEYS) {
    const v = clean(props[key]);
    if (v) {
      if (key === 'MAP_NO') return `SOI ${v}`;
      return v;
    }
  }
  return fallback;
}

/** Single-name hover label (no “District · Mandal” compound tips). */
export function formatFeatureTooltip(
  props: Record<string, unknown> | null | undefined,
  fallback = 'Feature'
): string {
  return pickFeatureName(props, fallback);
}

export type LayerNameFallback =
  | 'District'
  | 'Mandal'
  | 'Village'
  | 'Police Station'
  | 'Border Police Station'
  | 'Highway'
  | 'Major Road'
  | 'Main Road'
  | 'Internal Road'
  | 'Drug Route'
  | 'River'
  | 'Water body'
  | 'Foot Track'
  | 'Indian Railway'
  | 'Hotspot'
  | 'Check Post'
  | 'Toll Plaza'
  | 'Seizure'
  | 'Pharma Hub'
  | 'DDAC'
  | 'Entry / Exit'
  | 'Stock Point'
  | 'ASR Boundary'
  | 'Taluk'
  | 'State'
  | 'SOI Map No'
  | 'Feature';
