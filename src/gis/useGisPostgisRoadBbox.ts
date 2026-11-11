import { useEffect, useState } from 'react';
import type { GisPostgisRoadLayer } from './gisPostgisRoads';
import { fetchRoadsGeojson } from './gisPostgisRoads';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export type MapBbox = { west: number; south: number; east: number; north: number };

/**
 * Loads a PostGIS road layer clipped to the current map bbox (for full / VSP).
 */
export function useGisPostgisRoadBbox(
  layer: GisPostgisRoadLayer,
  enabled: boolean,
  bbox: MapBbox | null,
  padDeg = 0.05,
  /** Client-side fetch cap — keeps full/VSP responses drawable. */
  limit = 8000
): GeoJSON.FeatureCollection {
  const [fc, setFc] = useState<GeoJSON.FeatureCollection>(EMPTY_FC);

  useEffect(() => {
    if (!enabled || !bbox) {
      setFc(EMPTY_FC);
      return;
    }
    let cancelled = false;
    const padded = {
      west: bbox.west - padDeg,
      south: bbox.south - padDeg,
      east: bbox.east + padDeg,
      north: bbox.north + padDeg,
    };
    const t = window.setTimeout(() => {
      void fetchRoadsGeojson(layer, padded, limit)
        .then((data) => {
          if (!cancelled) setFc(data);
        })
        .catch((err) => {
          if (!cancelled) setFc(EMPTY_FC);
          // Surface once per failure window so Eye-on empty maps are diagnosable.
          console.warn(`[gis-roads] ${layer} failed:`, err);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [layer, enabled, bbox?.west, bbox?.south, bbox?.east, bbox?.north, padDeg, limit]);

  return fc;
}
