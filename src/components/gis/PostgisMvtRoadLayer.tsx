import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import '@maplibre/maplibre-gl-leaflet';
import type { GisPostgisRoadLayer } from '../../gis/gisPostgisRoads';
import { roadsMvtUrlTemplate } from '../../gis/gisPostgisRoads';

type LeafletGlLayer = L.Layer & {
  _update?: () => void;
  getMaplibreMap?: () => { resize: () => void; remove?: () => void };
};

type Props = {
  layer: GisPostgisRoadLayer;
  enabled: boolean;
  color?: string;
  weight?: number;
  /** Hide below this zoom (default: show at statewide cameras; MVT stays cheap). */
  minZoom?: number;
};

/**
 * Full AP roads as MapLibre vector tiles over Leaflet.
 * Only mounts when the roads API is in PostGIS mode (MVT endpoint live).
 */
export function PostgisMvtRoadLayer({
  layer,
  enabled,
  color = '#1e3a8a',
  weight = 1.25,
  minZoom = 5,
}: Props) {
  const map = useMap();
  const layerRef = useRef<LeafletGlLayer | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const syncVisibility = () => {
      const gl = layerRef.current;
      if (!gl) return;
      const show = map.getZoom() >= minZoom;
      const container = (gl as unknown as { getContainer?: () => HTMLElement }).getContainer?.();
      if (container) container.style.display = show ? '' : 'none';
    };

    const tiles = `${window.location.origin}${roadsMvtUrlTemplate(layer)}`;
    const style = {
      version: 8 as const,
      sources: {
        'gis-roads': {
          type: 'vector' as const,
          tiles: [tiles],
          minzoom: 0,
          maxzoom: 16,
        },
      },
      layers: [
        {
          id: 'gis-roads-line',
          type: 'line' as const,
          source: 'gis-roads',
          'source-layer': 'roads',
          layout: {
            'line-cap': 'round' as const,
            'line-join': 'round' as const,
          },
          paint: {
            'line-color': color,
            'line-width': weight,
            'line-opacity': 0.9,
          },
        },
      ],
    };

    const glLayer = L.maplibreGL({
      style,
      interactive: false,
      attributionControl: false,
      pane: 'overlayPane',
    } as unknown as L.LeafletMaplibreGLOptions) as LeafletGlLayer;
    glLayer.addTo(map);
    layerRef.current = glLayer;
    syncVisibility();

    const onView = () => {
      try {
        glLayer.getMaplibreMap?.()?.resize();
        glLayer._update?.();
      } catch {
        /* disposing */
      }
      syncVisibility();
    };
    map.on('zoomend moveend resize', onView);
    const t1 = window.setTimeout(onView, 120);
    const t2 = window.setTimeout(onView, 500);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      map.off('zoomend moveend resize', onView);
      map.removeLayer(glLayer);
      layerRef.current = null;
    };
  }, [map, enabled, layer, color, weight, minZoom]);

  return null;
}
