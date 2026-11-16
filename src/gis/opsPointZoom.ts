/**
 * Zoom-scaled radii for dense OPS point layers (hotspots / drug-route pins).
 * Smaller when zoomed out so clusters stay readable across every module map.
 */
export function opsHotspotRadiusForZoom(zoom: number): number {
  const z = Number.isFinite(zoom) ? zoom : 7;
  if (z <= 6) return 2.4;
  if (z <= 8) return 3.2;
  if (z <= 10) return 4.2;
  if (z <= 12) return 5.2;
  if (z <= 14) return 6.2;
  return 7.2;
}

export function opsDrugRoutePointRadiusForZoom(zoom: number): number {
  const z = Number.isFinite(zoom) ? zoom : 7;
  if (z <= 6) return 2.2;
  if (z <= 8) return 3;
  if (z <= 10) return 3.8;
  if (z <= 12) return 4.8;
  if (z <= 14) return 5.8;
  return 6.8;
}

export function opsDrugRouteLineWeightForZoom(zoom: number): number {
  const z = Number.isFinite(zoom) ? zoom : 7;
  if (z <= 6) return 1.4;
  if (z <= 8) return 1.8;
  if (z <= 10) return 2.2;
  if (z <= 12) return 2.6;
  return 3;
}
