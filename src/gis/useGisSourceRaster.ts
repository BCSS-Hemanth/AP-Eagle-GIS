import { useEffect, useMemo, useState } from 'react';
import {
  GIS_SOURCE_RASTER_PRODUCTS,
  type GisRasterManifest,
  type GisRasterOverlay,
  type GisSourceRasterProductId,
} from './gisSourceCatalog';

const cache = new Map<string, GisRasterManifest>();
const inflight = new Map<string, Promise<GisRasterManifest | null>>();

async function loadManifest(path: string): Promise<GisRasterManifest | null> {
  if (cache.has(path)) return cache.get(path)!;
  if (!inflight.has(path)) {
    inflight.set(
      path,
      fetch(path)
        .then(async (res) => {
          if (!res.ok) return null;
          const json = (await res.json()) as GisRasterManifest;
          if (!json?.overlays?.length) return null;
          cache.set(path, json);
          return json;
        })
        .catch(() => null)
        .finally(() => {
          inflight.delete(path);
        })
    );
  }
  return inflight.get(path)!;
}

function useManifest(product: GisSourceRasterProductId, enabled: boolean) {
  const path = GIS_SOURCE_RASTER_PRODUCTS[product];
  const [data, setData] = useState<GisRasterManifest | null>(
    enabled ? cache.get(path) ?? null : null
  );

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    let cancelled = false;
    loadManifest(path).then((m) => {
      if (!cancelled) setData(m);
    });
    return () => {
      cancelled = true;
    };
  }, [path, enabled]);

  return data;
}

export type GisRasterViewBox = {
  north: number;
  south: number;
  east: number;
  west: number;
};

function intersects(o: GisRasterOverlay, view: GisRasterViewBox): boolean {
  return !(o.west > view.east || o.east < view.west || o.south > view.north || o.north < view.south);
}

/** Pick LOD tiles that intersect the view; cap count for browser performance. */
export function pickRasterOverlays(
  overlays: GisRasterOverlay[],
  view: GisRasterViewBox | null,
  zoom: number,
  maxTiles = 48
): GisRasterOverlay[] {
  if (!overlays.length) return [];
  if (overlays.length === 1) return overlays;
  const pad = Math.max(0.01, (view ? view.north - view.south : 0.2) * 0.15);
  const padded: GisRasterViewBox | null = view
    ? {
        north: view.north + pad,
        south: view.south - pad,
        east: view.east + pad,
        west: view.west - pad,
      }
    : null;
  const candidates = padded ? overlays.filter((o) => intersects(o, padded)) : overlays;
  if (!candidates.length) return [];

  const levels = [...new Set(candidates.map((o) => o.level))].sort((a, b) => a - b);
  const preferIdx =
    zoom < 9 ? 0 : zoom < 11 ? Math.min(levels.length - 1, Math.floor(levels.length / 2)) : levels.length - 1;

  for (let i = preferIdx; i >= 0; i -= 1) {
    const level = levels[i];
    const tiles = candidates.filter((o) => o.level === level);
    if (tiles.length <= maxTiles) return tiles;
  }

  return [...candidates]
    .filter((o) => o.level === levels[0])
    .sort((a, b) => b.areaDeg2 - a.areaDeg2)
    .slice(0, maxTiles);
}

/** Lazy loaders for Phase 1C GIS-Source Raster KMZ products. */
export function useGisSourceRaster(flags: {
  showGoogleRoadmap?: boolean;
  showSatellitePack?: boolean;
  showTerrain?: boolean;
  showSoiTopo?: boolean;
}) {
  const googleRoadmap = useManifest('googleRoadmap', Boolean(flags.showGoogleRoadmap));
  const googleSat = useManifest('googleSat', Boolean(flags.showSatellitePack));
  const aob = useManifest('aob', Boolean(flags.showSatellitePack));
  const ntCg = useManifest('ntCg', Boolean(flags.showSatellitePack));
  const googleTerrain = useManifest('googleTerrain', Boolean(flags.showTerrain));
  const soiTopo = useManifest('soiTopo', Boolean(flags.showSoiTopo));

  return useMemo(
    () => ({
      googleRoadmap,
      googleSat,
      aob,
      ntCg,
      googleTerrain,
      soiTopo,
    }),
    [googleRoadmap, googleSat, aob, ntCg, googleTerrain, soiTopo]
  );
}
