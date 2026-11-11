import { adminNamesEqual } from '../adminHierarchy';
import type { AtlasDistrictMeta } from './atlasTypes';

const DISTRICTS_URL = '/geo/ap-districts-2022.geojson';

let cache: GeoJSON.FeatureCollection | null = null;

export async function loadApDistricts2022(): Promise<GeoJSON.FeatureCollection> {
  if (cache) return cache;
  const res = await fetch(DISTRICTS_URL);
  if (!res.ok) throw new Error(`Failed to load districts (${res.status})`);
  cache = (await res.json()) as GeoJSON.FeatureCollection;
  return cache;
}

export async function loadAtlasDistrictFeature(
  meta: AtlasDistrictMeta
): Promise<GeoJSON.Feature | null> {
  const fc = await loadApDistricts2022();
  const hit = fc.features.find((f) => {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const code = String(props.code ?? '').toUpperCase();
    const name = String(props.district_name ?? props.DISTRICT ?? props.name ?? '');
    return code === meta.code.toUpperCase() || adminNamesEqual(name, meta.districtName);
  });
  return hit ?? null;
}
