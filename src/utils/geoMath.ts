import { CrsId } from '../types/gis';

/**
 * Convert SVG canvas coordinates (viewBox 1200x800) to realistic Andhra Pradesh WGS84 Lat/Lon
 */
export function svgToLatLon(svgX: number, svgY: number): { lat: number; lon: number } {
  const clampedX = Math.max(0, Math.min(1200, svgX));
  const clampedY = Math.max(0, Math.min(800, svgY));
  const lat = 19.62 - (clampedY / 800) * 6.95;
  const lon = 76.25 + (clampedX / 1200) * 8.85;
  return {
    lat: Number(lat.toFixed(4)),
    lon: Number(lon.toFixed(4)),
  };
}

/**
 * Convert Andhra Pradesh Lat/Lon to approximate SVG coordinates (1200x800)
 */
export function latLonToSvg(lat: number, lon: number): { x: number; y: number } {
  const y = ((19.62 - lat) / 6.95) * 800;
  const x = ((lon - 76.25) / 8.85) * 1200;
  return {
    x: Math.max(40, Math.min(1160, Number(x.toFixed(1)))),
    y: Math.max(30, Math.min(770, Number(y.toFixed(1)))),
  };
}

/**
 * Estimate elevation in meters MSL based on Eastern Ghats & Seshachalam topography
 */
export function estimateElevation(svgX: number, svgY: number): number {
  // Eastern Ghats Agency high elevation zone around (650, 145)
  const dxGhats = svgX - 675;
  const dyGhats = svgY - 145;
  const distGhats = Math.sqrt(dxGhats * dxGhats + dyGhats * dyGhats);
  if (distGhats < 130) {
    return Math.round(980 - distGhats * 5.2);
  }
  // Seshachalam hills around (430, 590)
  const dxSesh = svgX - 430;
  const dySesh = svgY - 590;
  const distSesh = Math.sqrt(dxSesh * dxSesh + dySesh * dySesh);
  if (distSesh < 110) {
    return Math.round(760 - distSesh * 4.5);
  }
  // Bay of Bengal sea surface
  if (svgX > 860 && svgY > 250) {
    return 0;
  }
  // Deccan plateau / coastal plains
  return Math.max(8, Math.round(320 - svgX * 0.32));
}

/**
 * Format Lat/Lon into selected Coordinate Reference System (CRS)
 */
export function formatCoordinates(lat: number, lon: number, crs: CrsId, dmsMode = false): string {
  if (crs === 'EPSG:32644') {
    // Approximate UTM Zone 44N Easting / Northing for Andhra Pradesh
    const centralMeridian = 81.0;
    const easting = Math.round(500000 + (lon - centralMeridian) * 106800);
    const northing = Math.round(lat * 110680);
    return `44Q ${easting}m E, ${northing}m N`;
  }
  if (crs === 'EPSG:3857') {
    const x = Math.round((lon * 20037508.34) / 180);
    const yRad = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
    const y = Math.round((yRad * 20037508.34) / 180);
    return `X: ${x.toLocaleString()}, Y: ${y.toLocaleString()}`;
  }
  if (crs === 'EPSG:7755') {
    // India NSF LCC meters approximation
    const falseE = Math.round(4000000 + (lon - 80.0) * 105200);
    const falseN = Math.round(4000000 + (lat - 24.0) * 110500);
    return `E ${falseE.toLocaleString()}m, N ${falseN.toLocaleString()}m`;
  }

  if (dmsMode) {
    return `${toDms(lat, 'N')}, ${toDms(lon, 'E')}`;
  }
  return `${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`;
}

function toDms(deg: number, dirPos: string): string {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const minFloat = (abs - d) * 60;
  const m = Math.floor(minFloat);
  const s = Math.round((minFloat - m) * 60);
  return `${d}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"${dirPos}`;
}

export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLon * sinLon;
  return R * (2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export function geodesicPathKm(points: Array<{ lat: number; lon: number }>): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1], points[i]);
  return Number(total.toFixed(2));
}

export function geodesicPolygonAreaSqKm(points: Array<{ lat: number; lon: number }>): number {
  if (points.length < 3) return 0;
  const origin = points[0];
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  const kmPts = points.map((pt) => ({
    x: (pt.lon - origin.lon) * 111.32 * cosLat,
    y: (pt.lat - origin.lat) * 110.57,
  }));
  let area = 0;
  for (let i = 0; i < kmPts.length; i++) {
    const j = (i + 1) % kmPts.length;
    area += kmPts[i].x * kmPts[j].y - kmPts[j].x * kmPts[i].y;
  }
  return Number(Math.abs(area / 2).toFixed(2));
}

/**
 * Haversine geodesic distance in kilometers between two SVG points
 */
export function calculateGeodesicDistanceKm(
  points: Array<{ x: number; y: number }>
): number {
  if (points.length < 2) return 0;
  let totalKm = 0;
  const R = 6371;
  for (let i = 1; i < points.length; i++) {
    const p1 = svgToLatLon(points[i - 1].x, points[i - 1].y);
    const p2 = svgToLatLon(points[i].x, points[i].y);
    const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
    const dLon = ((p2.lon - p1.lon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((p1.lat * Math.PI) / 180) *
        Math.cos((p2.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    totalKm += R * c;
  }
  return Number(totalKm.toFixed(2));
}

/**
 * Calculate geodesic polygon area in square kilometers
 */
export function calculatePolygonAreaSqKm(points: Array<{ x: number; y: number }>): number {
  if (points.length < 3) return 0;
  // Shoelace in projected km relative to first point
  const origin = svgToLatLon(points[0].x, points[0].y);
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  const kmPts = points.map((pt) => {
    const ll = svgToLatLon(pt.x, pt.y);
    return {
      x: (ll.lon - origin.lon) * 111.32 * cosLat,
      y: (ll.lat - origin.lat) * 110.57,
    };
  });

  let area = 0;
  for (let i = 0; i < kmPts.length; i++) {
    const j = (i + 1) % kmPts.length;
    area += kmPts[i].x * kmPts[j].y;
    area -= kmPts[j].x * kmPts[i].y;
  }
  return Number(Math.abs(area / 2).toFixed(2));
}

/**
 * Trigger a clean client-side file download (CSV / GeoJSON / JSON) without window.open
 */
export function downloadTextFile(filename: string, content: string, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
