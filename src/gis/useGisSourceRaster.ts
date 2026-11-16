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

export type PickRasterOverlaysOptions = {
  maxTiles?: number;
  /**
   * Keep one coarser LOD under the preferred level so zoom-in does not flash
   * empty basemap while finer sheets load (Raster SOI composition).
   */
  stackCoarser?: boolean;
};

function preferredLevelIndex(levels: number[], zoom: number): number {
  if (zoom < 9) return 0;
  if (zoom < 11) return Math.min(levels.length - 1, Math.floor(levels.length / 2));
  return levels.length - 1;
}

/** Pick LOD tiles that intersect the view; cap count for browser performance. */
export function pickRasterOverlays(
  overlays: GisRasterOverlay[],
  view: GisRasterViewBox | null,
  zoom: number,
  maxTilesOrOpts: number | PickRasterOverlaysOptions = 48
): GisRasterOverlay[] {
  const opts: PickRasterOverlaysOptions =
    typeof maxTilesOrOpts === 'number' ? { maxTiles: maxTilesOrOpts } : maxTilesOrOpts;
  const maxTiles = opts.maxTiles ?? 48;
  const stackCoarser = Boolean(opts.stackCoarser);

  if (!overlays.length) return [];
  if (overlays.length === 1) return overlays;
  const pad = Math.max(0.02, (view ? view.north - view.south : 0.2) * 0.2);
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
  const preferIdx = preferredLevelIndex(levels, zoom);

  let primary: GisRasterOverlay[] = [];
  for (let i = preferIdx; i >= 0; i -= 1) {
    const level = levels[i];
    const tiles = candidates.filter((o) => o.level === level);
    if (tiles.length <= maxTiles) {
      primary = tiles;
      break;
    }
  }
  if (!primary.length) {
    primary = [...candidates]
      .filter((o) => o.level === levels[0])
      .sort((a, b) => b.areaDeg2 - a.areaDeg2)
      .slice(0, maxTiles);
  }

  if (!stackCoarser || preferIdx <= 0) return primary;

  const coarserLevel = levels[Math.max(0, preferIdx - 1)];
  const coarser = candidates.filter((o) => o.level === coarserLevel);
  const byId = new Map<string, GisRasterOverlay>();
  // Coarser first (under), then preferred (on top when rendered by ascending level).
  for (const t of coarser) byId.set(t.id, t);
  for (const t of primary) byId.set(t.id, t);
  const merged = [...byId.values()];
  if (merged.length <= maxTiles * 2) return merged;
  // Prefer keeping all primary tiles; trim largest coarser sheets first.
  const primaryIds = new Set(primary.map((t) => t.id));
  const keptPrimary = merged.filter((t) => primaryIds.has(t.id));
  const keptCoarser = merged
    .filter((t) => !primaryIds.has(t.id))
    .sort((a, b) => b.areaDeg2 - a.areaDeg2)
    .slice(0, Math.max(0, maxTiles * 2 - keptPrimary.length));
  return [...keptCoarser, ...keptPrimary];
}

export function preloadRasterOverlayUrls(urls: string[]): Promise<void> {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        })
    )
  ).then(() => undefined);
}

/** Lazy loaders for remaining Phase 1C GIS-Source Raster KMZ products (SOI topo). */
export function useGisSourceRaster(flags: { showSoiTopo?: boolean }) {
  const soiTopo = useManifest('soiTopo', Boolean(flags.showSoiTopo));

  return useMemo(() => ({ soiTopo }), [soiTopo]);
}
