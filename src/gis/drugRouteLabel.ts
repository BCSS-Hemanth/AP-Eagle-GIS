/** Hover labels for OPS Drug Routes (`lyr-drug-routes` / d_routes.kmz). */

function rawRouteName(props: GeoJSON.GeoJsonProperties): string {
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
 * Checkpost-style sticky hover text for drug-route lines and pins.
 * - Generic KMZ name `"Route"` → `"Drug Route"`
 * - Any other name → `"Drug Route - {name}"`
 * - Missing name → `"Drug Route"`
 */
export function drugRouteHoverLabel(props: GeoJSON.GeoJsonProperties): string {
  const name = rawRouteName(props);
  if (!name || /^route$/i.test(name)) return 'Drug Route';
  return `Drug Route - ${name}`;
}
