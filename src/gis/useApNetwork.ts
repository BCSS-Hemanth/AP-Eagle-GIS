import { useEffect, useState } from 'react';

let cachedHighways: GeoJSON.FeatureCollection | null = null;
let cachedRivers: GeoJSON.FeatureCollection | null = null;
let cachedAgency: GeoJSON.FeatureCollection | null = null;
let cachedWater: GeoJSON.FeatureCollection | null = null;
let loadPromise: Promise<void> | null = null;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

async function loadJson(path: string) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

async function loadJsonOptional(path: string): Promise<GeoJSON.FeatureCollection> {
  try {
    const res = await fetch(path);
    if (!res.ok) return EMPTY_FC;
    const json = await res.json();
    if (json?.type === 'FeatureCollection') return json;
    if (json?.type === 'Feature') return { type: 'FeatureCollection', features: [json] };
    return EMPTY_FC;
  } catch {
    return EMPTY_FC;
  }
}

function asCollection(json: GeoJSON.FeatureCollection | GeoJSON.Feature | null): GeoJSON.FeatureCollection {
  if (!json) return EMPTY_FC;
  if (json.type === 'FeatureCollection') return json;
  return { type: 'FeatureCollection', features: [json] };
}

async function loadNetwork() {
  if (cachedHighways && cachedRivers && cachedAgency && cachedWater) return;
  const [highways, rivers, agency, water] = await Promise.all([
    loadJson('/geo/ap-highways.geojson'),
    loadJson('/geo/ap-rivers.geojson'),
    loadJson('/geo/ap-agency-route.geojson'),
    loadJsonOptional('/geo/ap-waterbodies.geojson'),
  ]);
  cachedHighways = highways;
  cachedRivers = rivers;
  cachedAgency = asCollection(agency);
  cachedWater = water;
}

export function useApNetwork() {
  const [highways, setHighways] = useState<GeoJSON.FeatureCollection | null>(cachedHighways);
  const [rivers, setRivers] = useState<GeoJSON.FeatureCollection | null>(cachedRivers);
  const [agency, setAgency] = useState<GeoJSON.FeatureCollection | null>(cachedAgency);
  const [water, setWater] = useState<GeoJSON.FeatureCollection | null>(cachedWater);
  const [ready, setReady] = useState(Boolean(cachedHighways && cachedRivers && cachedAgency));

  useEffect(() => {
    let cancelled = false;
    if (!loadPromise) loadPromise = loadNetwork();
    loadPromise
      .then(() => {
        if (cancelled) return;
        setHighways(cachedHighways);
        setRivers(cachedRivers);
        setAgency(cachedAgency);
        setWater(cachedWater);
        setReady(true);
      })
      .catch(() => {
        /* overlays remain off; OSM basemap still provides roads/rivers */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { highways, rivers, agency, water, ready };
}
