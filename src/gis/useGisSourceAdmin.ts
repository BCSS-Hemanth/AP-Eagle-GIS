import { useEffect, useState } from 'react';
import { GIS_SOURCE_ADMIN_LAYERS } from './gisSourceCatalog';

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

/** Lazy loaders for Phase 1A GIS-Source Admin overlays. */
export function useGisSourceAdmin(flags: {
  showTaluk?: boolean;
  showVspVillages?: boolean;
  showBorderPs?: boolean;
  /** Proposed ANPR camera locations (Admin catalog opt-in). */
  showProposedAnpr?: boolean;
  showApNeighborStates?: boolean;
  showAobDists?: boolean;
  showKmzVillages?: boolean;
  showPsBorderArea?: boolean;
  showRailVector?: boolean;
  showRoadsMajor?: boolean;
  /** Pre-2014 undivided AP+TG districts — overlay only; never drives admin drill. */
  showDistrictsHist?: boolean;
  /** IND_adm1 undivided AP polygon — historical overlay only. */
  showStateHist?: boolean;
}) {
  const taluk = useOptionalFc(GIS_SOURCE_ADMIN_LAYERS.taluk, Boolean(flags.showTaluk));
  const vspVillages = useOptionalFc(
    GIS_SOURCE_ADMIN_LAYERS.vspVillages,
    Boolean(flags.showVspVillages)
  );
  const borderPs = useOptionalFc(GIS_SOURCE_ADMIN_LAYERS.borderPs, Boolean(flags.showBorderPs));
  const proposedAnpr = useOptionalFc(
    GIS_SOURCE_ADMIN_LAYERS.proposedAnpr,
    Boolean(flags.showProposedAnpr)
  );
  const apNeighborStates = useOptionalFc(
    GIS_SOURCE_ADMIN_LAYERS.apNeighborStates,
    Boolean(flags.showApNeighborStates)
  );
  const aobDists = useOptionalFc(GIS_SOURCE_ADMIN_LAYERS.aobDists, Boolean(flags.showAobDists));
  const kmzVillages = useOptionalFc(
    GIS_SOURCE_ADMIN_LAYERS.kmzVillages,
    Boolean(flags.showKmzVillages)
  );
  const psBorderArea = useOptionalFc(
    GIS_SOURCE_ADMIN_LAYERS.psBorderArea,
    Boolean(flags.showPsBorderArea)
  );
  const rail = useOptionalFc(GIS_SOURCE_ADMIN_LAYERS.rail, Boolean(flags.showRailVector));
  const roadsMajor = useOptionalFc(
    GIS_SOURCE_ADMIN_LAYERS.roadsMajor,
    Boolean(flags.showRoadsMajor)
  );
  const districtsHist = useOptionalFc(
    GIS_SOURCE_ADMIN_LAYERS.districts,
    Boolean(flags.showDistrictsHist)
  );
  const stateHist = useOptionalFc(GIS_SOURCE_ADMIN_LAYERS.state, Boolean(flags.showStateHist));

  return {
    taluk,
    vspVillages,
    borderPs,
    proposedAnpr,
    apNeighborStates,
    aobDists,
    kmzVillages,
    psBorderArea,
    rail,
    roadsMajor,
    districtsHist,
    stateHist,
  };
}
