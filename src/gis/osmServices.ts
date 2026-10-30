/** Live OpenStreetMap / OSRM / SRTM helpers. All coordinates are WGS84. */

export async function fetchSrtmElevation(lat: number, lon: number): Promise<number> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}`
  );
  if (!res.ok) return 0;
  const json = (await res.json()) as { elevation?: number[] };
  return Math.round(json.elevation?.[0] ?? 0);
}

export interface GeocodeHit {
  lat: number;
  lon: number;
  label: string;
}

export async function nominatimSearch(query: string): Promise<GeocodeHit | null> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'in',
    viewbox: '76.5,19.5,84.9,12.5',
    bounded: '0',
    q: query,
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!json[0]) return null;
  return {
    lat: Number(json[0].lat),
    lon: Number(json[0].lon),
    label: json[0].display_name,
  };
}

export interface DrivingRoute {
  points: Array<{ lat: number; lon: number }>;
  distanceKm: number;
  durationMin: number;
}

export async function osrmDrivingRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): Promise<DrivingRoute | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    code?: string;
    routes?: Array<{
      distance: number;
      duration: number;
      geometry: { coordinates: number[][] };
    }>;
  };
  if (json.code !== 'Ok' || !json.routes?.[0]) return null;
  const route = json.routes[0];
  return {
    points: route.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })),
    distanceKm: Number((route.distance / 1000).toFixed(2)),
    durationMin: Math.round(route.duration / 60),
  };
}
