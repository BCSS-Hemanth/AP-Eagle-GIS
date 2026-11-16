/** Hover labels for OPS Toll Plazas (`lyr-toll-plazas` / toll_plazas.kmz). */

function rawTollName(props: GeoJSON.GeoJsonProperties): string {
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
 * Checkpost-style sticky hover text for toll-plaza points and routes.
 * - Generic KMZ name `"Route"` / `"NH"` → `"Toll Plaza"`
 * - Any other name → `"Toll Plaza - {name}"`
 * - Missing name → `"Toll Plaza"`
 */
export function tollPlazaHoverLabel(props: GeoJSON.GeoJsonProperties): string {
  const name = rawTollName(props);
  if (!name || /^route$/i.test(name) || /^nh$/i.test(name)) return 'Toll Plaza';
  return `Toll Plaza - ${name}`;
}
