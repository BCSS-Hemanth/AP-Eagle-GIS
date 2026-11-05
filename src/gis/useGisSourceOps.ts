import { useEffect, useState } from 'react';
import { GIS_SOURCE_OPS_LAYERS } from './gisSourceCatalog';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const cache = new Map<string, GeoJSON.FeatureCollection>();
const inflight = new Map<string, Promise<GeoJSON.FeatureCollection>>();

async function loadFc(path: string): Promise<GeoJSON.FeatureCollection> {
  if (cache.has(path)) return cache.get(path)!;
  if (!inflight.has(path)) {
    inflight.set(
      path,
      fetch(path)
        .then(async (res) => {
          if (!res.ok) return EMPTY;
          const json = await res.json();
          if (json?.type === 'FeatureCollection') return json as GeoJSON.FeatureCollection;
          if (json?.type === 'Feature') {
            return {
              type: 'FeatureCollection',
              features: [json as GeoJSON.Feature],
            } satisfies GeoJSON.FeatureCollection;
          }
          return EMPTY;
        })
        .catch(() => EMPTY)
        .then((fc) => {
          cache.set(path, fc);
          inflight.delete(path);
          return fc;
        })
    );
  }
  return inflight.get(path)!;
}

function useOptionalFc(path: string, enabled: boolean) {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(
    enabled ? cache.get(path) ?? null : null
  );

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    let cancelled = false;
    loadFc(path).then((fc) => {
      if (!cancelled) setData(fc);
    });
    return () => {
      cancelled = true;
    };
  }, [path, enabled]);

  return data;
}

/** Lazy loaders for Phase 1B independent GIS-Source OPS KMZ overlays. */
export function useGisSourceOps(flags: {
  showAsrBoundary?: boolean;
  showPharmaHubs?: boolean;
  showCheckPosts?: boolean;
  showDRoutes?: boolean;
  showDdacs?: boolean;
  showEntryExit?: boolean;
  showGanjaSeized?: boolean;
  showHotspots?: boolean;
  showFootTracks?: boolean;
  showInternalRoads?: boolean;
  showMainRoads?: boolean;
  showStockPoints?: boolean;
  showTollPlazas?: boolean;
}) {
  return {
    asrBoundary: useOptionalFc(GIS_SOURCE_OPS_LAYERS.asrBoundary, Boolean(flags.showAsrBoundary)),
    pharmaHubs: useOptionalFc(GIS_SOURCE_OPS_LAYERS.pharmaHubs, Boolean(flags.showPharmaHubs)),
    checkPosts: useOptionalFc(GIS_SOURCE_OPS_LAYERS.checkPosts, Boolean(flags.showCheckPosts)),
    dRoutes: useOptionalFc(GIS_SOURCE_OPS_LAYERS.dRoutes, Boolean(flags.showDRoutes)),
    ddacs: useOptionalFc(GIS_SOURCE_OPS_LAYERS.ddacs, Boolean(flags.showDdacs)),
    entryExit: useOptionalFc(GIS_SOURCE_OPS_LAYERS.entryExit, Boolean(flags.showEntryExit)),
    ganjaSeized: useOptionalFc(GIS_SOURCE_OPS_LAYERS.ganjaSeized, Boolean(flags.showGanjaSeized)),
    hotspots: useOptionalFc(GIS_SOURCE_OPS_LAYERS.hotspots, Boolean(flags.showHotspots)),
    footTracks: useOptionalFc(GIS_SOURCE_OPS_LAYERS.footTracks, Boolean(flags.showFootTracks)),
    internalRoads: useOptionalFc(
      GIS_SOURCE_OPS_LAYERS.internalRoads,
      Boolean(flags.showInternalRoads)
    ),
    mainRoads: useOptionalFc(GIS_SOURCE_OPS_LAYERS.mainRoads, Boolean(flags.showMainRoads)),
    stockPoints: useOptionalFc(GIS_SOURCE_OPS_LAYERS.stockPoints, Boolean(flags.showStockPoints)),
    tollPlazas: useOptionalFc(GIS_SOURCE_OPS_LAYERS.tollPlazas, Boolean(flags.showTollPlazas)),
  };
}
