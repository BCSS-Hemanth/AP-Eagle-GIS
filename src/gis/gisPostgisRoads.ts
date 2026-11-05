/** Client helpers for PostGIS-backed GIS road layers. */

export type GisPostgisRoadLayer = 'full' | 'vsp' | 'nh';

export const GIS_POSTGIS_ROADS = {
  nh: {
    id: 'lyr-highways' as const,
    apiLayer: 'nh' as const,
    /** NH can load statewide (~2.5k); bbox optional. */
    requireBbox: false,
  },
  full: {
    id: 'lyr-ap-roads-full' as const,
    apiLayer: 'full' as const,
    requireBbox: true,
  },
  vsp: {
    id: 'lyr-ops-vsp-roads' as const,
    apiLayer: 'vsp' as const,
    requireBbox: true,
  },
} as const;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function roadsGeojsonUrl(
  layer: GisPostgisRoadLayer,
  bbox?: { west: number; south: number; east: number; north: number } | null,
  limit?: number
): string {
  const params = new URLSearchParams({ layer });
  if (bbox) {
    params.set(
      'bbox',
      `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`
    );
  }
  if (limit != null) params.set('limit', String(limit));
  return `/api/gis-roads/geojson?${params.toString()}`;
}

export function roadsMvtUrlTemplate(layer: GisPostgisRoadLayer): string {
  return `/api/gis-roads/mvt/${layer}/{z}/{x}/{y}`;
}

export async function fetchRoadsGeojson(
  layer: GisPostgisRoadLayer,
  bbox?: { west: number; south: number; east: number; north: number } | null,
  limit?: number
): Promise<GeoJSON.FeatureCollection> {
  const url = roadsGeojsonUrl(layer, bbox, limit);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Roads API ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json?.type === 'FeatureCollection') return json as GeoJSON.FeatureCollection;
  return EMPTY_FC;
}

export async function fetchNationalHighwaysPreferPostgis(): Promise<{
  fc: GeoJSON.FeatureCollection;
  source: 'postgis' | 'osrm-fallback';
}> {
  try {
    const fc = await fetchRoadsGeojson('nh');
    if (fc.features.length > 0) return { fc, source: 'postgis' };
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch('/geo/ap-highways.geojson');
    if (!res.ok) return { fc: EMPTY_FC, source: 'osrm-fallback' };
    const json = await res.json();
    if (json?.type === 'FeatureCollection') {
      return { fc: json as GeoJSON.FeatureCollection, source: 'osrm-fallback' };
    }
  } catch {
    /* empty */
  }
  return { fc: EMPTY_FC, source: 'osrm-fallback' };
}
