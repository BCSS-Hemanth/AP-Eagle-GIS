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
  padDeg = 0.05
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
      void fetchRoadsGeojson(layer, padded)
        .then((data) => {
          if (!cancelled) setFc(data);
        })
        .catch(() => {
          if (!cancelled) setFc(EMPTY_FC);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [layer, enabled, bbox?.west, bbox?.south, bbox?.east, bbox?.north, padDeg]);

  return fc;
}
