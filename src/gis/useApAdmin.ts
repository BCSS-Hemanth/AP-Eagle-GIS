import { useEffect, useState } from 'react';
import { applyCurrentMandalSpellings } from './adminHierarchy';

export interface MandalProperties {
  mandal_name: string;
  district_name: string;
  village_count?: number;
}

export interface VillageProperties {
  village_name: string;
  mandal_name: string;
  district_name: string;
}

export interface VillageIndexEntry {
  district_name: string;
  file: string;
  count: number;
  bbox: [number, number, number, number];
}

let cachedMandals: GeoJSON.FeatureCollection | null = null;
let mandalPromise: Promise<GeoJSON.FeatureCollection> | null = null;
let villageIndex: VillageIndexEntry[] | null = null;
const villageCache = new Map<string, GeoJSON.FeatureCollection>();

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json() as Promise<T>;
}

export function useApMandals(enabled: boolean) {
  const [mandals, setMandals] = useState<GeoJSON.FeatureCollection | null>(cachedMandals);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    if (!mandalPromise) {
      mandalPromise = loadJson<GeoJSON.FeatureCollection>('/geo/ap-mandals.geojson').then((data) => {
        cachedMandals = applyCurrentMandalSpellings(data);
        return cachedMandals;
      });
    }
    mandalPromise.then((data) => {
      if (!cancelled) setMandals(data);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return mandals;
}

function intersects(
  a: [number, number, number, number],
  b: [number, number, number, number]
): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

export function useVillagePolygons(
  enabled: boolean,
  viewBbox: [number, number, number, number] | null,
  zoom: number,
  minZoom = 9
) {
  const [collection, setCollection] = useState<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    if (!enabled || !viewBbox || zoom < minZoom) {
      setCollection(null);
      return;
    }
    let cancelled = false;
    (async () => {
      if (!villageIndex) {
        const idx = await loadJson<{ districts: VillageIndexEntry[] }>('/geo/ap-villages-index.json');
        villageIndex = idx.districts;
      }
      const needed = villageIndex.filter((d) => intersects(d.bbox, viewBbox));
      const parts = await Promise.all(
        needed.map(async (d) => {
          if (!villageCache.has(d.file)) {
            villageCache.set(
              d.file,
              applyCurrentMandalSpellings(await loadJson<GeoJSON.FeatureCollection>(d.file))
            );
          }
          return villageCache.get(d.file)!;
        })
      );
      if (cancelled) return;
      setCollection({
        type: 'FeatureCollection',
        features: parts.flatMap((p) => p.features),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, viewBbox?.[0], viewBbox?.[1], viewBbox?.[2], viewBbox?.[3], zoom, minZoom]);

  return collection;
}
