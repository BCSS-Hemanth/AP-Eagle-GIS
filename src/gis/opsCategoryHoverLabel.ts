/** Shared OPS point hover labels: `{Category}` or `{Category} - {name}`. */

function rawPointName(props: GeoJSON.GeoJsonProperties): string {
  if (!props || typeof props !== 'object') return '';
  const record = props as Record<string, unknown>;
  for (const key of ['name', 'Name', 'NAME']) {
    const v = record[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

/**
 * Toll-plaza-style sticky hover text.
 * - Missing / generic name → category only
 * - Otherwise → `{category} - {name}`
 */
export function opsCategoryHoverLabel(
  category: string,
  props: GeoJSON.GeoJsonProperties,
  genericNames: readonly string[] = []
): string {
  const name = rawPointName(props);
  if (!name) return category;
  const generics = new Set(
    [category, ...genericNames].map((s) => s.trim().toLowerCase()).filter(Boolean)
  );
  if (generics.has(name.toLowerCase())) return category;
  return `${category} - ${name}`;
}

export function ganjaSeizedHoverLabel(props: GeoJSON.GeoJsonProperties): string {
  return opsCategoryHoverLabel('Ganja Seized Point', props, ['Ganja Seized', 'Seizure']);
}

export function pharmaHubHoverLabel(props: GeoJSON.GeoJsonProperties): string {
  return opsCategoryHoverLabel('Pharma Hub', props);
}

export function ddacHoverLabel(props: GeoJSON.GeoJsonProperties): string {
  return opsCategoryHoverLabel('DDAC', props, ['DDAC']);
}
