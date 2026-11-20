import { useEffect, useState } from 'react';

export interface ApDistrictProperties {
  district_name: string;
  district_id: string;
  code: string;
}

let cachedDistricts: GeoJSON.FeatureCollection | null = null;
let cachedState: GeoJSON.FeatureCollection | null = null;
let loadPromise: Promise<void> | null = null;

async function loadBoundaries() {
  if (cachedDistricts && cachedState) return;
  // SAFETY: do not load gis-source/admin undivided districts/state for primary drill.
  // See ADMIN_GIS_SOURCE_SAFETY.primaryDistrictDrill / primaryStateBorder.
  const [districts, state] = await Promise.all([
    fetch('/geo/ap-districts-2022.geojson').then((r) => {
      if (!r.ok) throw new Error('Failed to load AP district boundaries');
      return r.json();
    }),
    fetch('/geo/ap-state.geojson').then((r) => {
      if (!r.ok) throw new Error('Failed to load AP state boundary');
      return r.json();
    }),
  ]);
  cachedDistricts = districts;
  cachedState = state;
}

export function useApBoundaries() {
  const [districts, setDistricts] = useState<GeoJSON.FeatureCollection | null>(cachedDistricts);
  const [state, setState] = useState<GeoJSON.FeatureCollection | null>(cachedState);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(Boolean(cachedDistricts && cachedState));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!loadPromise) loadPromise = loadBoundaries();
    loadPromise
      .then(() => {
        if (cancelled) return;
        setError(null);
        setDistricts(cachedDistricts);
        setState(cachedState);
        setReady(true);
      })
      .catch((err: Error) => {
        loadPromise = null; // allow retry after a failed load
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setError(null);
    setAttempt((n) => n + 1);
  };

  return { districts, state, ready, error, retry };
}
