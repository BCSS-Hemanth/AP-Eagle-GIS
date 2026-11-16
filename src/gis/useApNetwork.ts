import { useEffect, useState } from 'react';
import { fetchNationalHighwaysPreferPostgis } from './gisPostgisRoads';
import { repairLineJumpFeatureCollection } from './splitLineJumps';

let cachedHighways: GeoJSON.FeatureCollection | null = null;
let cachedRivers: GeoJSON.FeatureCollection | null = null;
let cachedAgency: GeoJSON.FeatureCollection | null = null;
let cachedHighwaySource: 'postgis' | 'osrm-fallback' | null = null;
let loadPromise: Promise<void> | null = null;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

async function loadJson(path: string) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function asCollection(json: GeoJSON.FeatureCollection | GeoJSON.Feature | null): GeoJSON.FeatureCollection {
  if (!json) return EMPTY_FC;
  if (json.type === 'FeatureCollection') return json;
  return { type: 'FeatureCollection', features: [json] };
}

async function loadNetwork() {
  if (cachedHighways && cachedRivers && cachedAgency) return;
  const [highwaysHit, rivers, agency] = await Promise.all([
    fetchNationalHighwaysPreferPostgis(),
    loadJson('/geo/ap-rivers.geojson'),
    // Conflict policy: GIS-Source ops d_routes replaces OSRM agency corridor stub.
    loadJson('/geo/gis-source/ops/d_routes.geojson'),
  ]);
  cachedHighways = highwaysHit.fc;
  cachedHighwaySource = highwaysHit.source;
  // OSM Overpass rivers sometimes concatenate distant relation members into one
  // LineString (~1000 km jumps) — that draws long straight chords across India.
  cachedRivers = repairLineJumpFeatureCollection(asCollection(rivers));
  cachedAgency = asCollection(agency);
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

  return {
    highways,
    rivers,
    agency,
    ready,
    highwaySource: cachedHighwaySource,
  };
}
