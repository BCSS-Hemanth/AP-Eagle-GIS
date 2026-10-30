import { useEffect, useState } from 'react';

let cachedHighways: GeoJSON.FeatureCollection | null = null;
let cachedRivers: GeoJSON.FeatureCollection | null = null;
let cachedAgency: GeoJSON.FeatureCollection | null = null;
let loadPromise: Promise<void> | null = null;

async function loadJson(path: string) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

async function loadNetwork() {
  if (cachedHighways && cachedRivers && cachedAgency) return;
  const [highways, rivers, agency] = await Promise.all([
    loadJson('/geo/ap-highways.geojson'),
    loadJson('/geo/ap-rivers.geojson'),
    loadJson('/geo/ap-agency-route.geojson'),
  ]);
  cachedHighways = highways;
  cachedRivers = rivers;
  cachedAgency =
    agency?.type === 'FeatureCollection'
      ? agency
      : { type: 'FeatureCollection', features: [agency] };
}

export function useApNetwork() {
  const [highways, setHighways] = useState<GeoJSON.FeatureCollection | null>(cachedHighways);
  const [rivers, setRivers] = useState<GeoJSON.FeatureCollection | null>(cachedRivers);
  const [agency, setAgency] = useState<GeoJSON.FeatureCollection | null>(cachedAgency);
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
        setReady(true);
      })
      .catch(() => {
        /* overlays remain off; OSM basemap still provides roads/rivers */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { highways, rivers, agency, ready };
}
