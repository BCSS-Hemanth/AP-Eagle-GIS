import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import '@maplibre/maplibre-gl-leaflet';
import { MAPLIBRE_ATTRIBUTION, MAPLIBRE_STYLE_URL } from '../../data/apGeo';

type LeafletGlLayer = L.Layer & {
  _update?: () => void;
  getMaplibreMap?: () => { resize: () => void };
};

/** MapLibre GL vector canvas hosted as a Leaflet tile-pane layer. GIS overlays stay on Leaflet. */
export const MapLibreBasemap: React.FC<{ viewSync?: string }> = ({ viewSync = '' }) => {
  const map = useMap();
  const layerRef = useRef<LeafletGlLayer | null>(null);

  useEffect(() => {
    const layer = L.maplibreGL({
      style: MAPLIBRE_STYLE_URL,
      interactive: false,
      attributionControl: false,
      pane: 'tilePane',
    } as L.LeafletMaplibreGLOptions) as LeafletGlLayer;
    layer.addTo(map);
    layerRef.current = layer;
    map.attributionControl?.addAttribution(MAPLIBRE_ATTRIBUTION);

    const gl = layer.getMaplibreMap?.();
    const sync = () => {
      try {
        gl?.resize();
        layer._update?.();
      } catch {
        /* disposing */
      }
    };
    map.on('resize zoomend moveend', sync);
    const timer = window.setTimeout(sync, 180);
    const later = window.setTimeout(sync, 600);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(later);
      map.off('resize zoomend moveend', sync);
      map.attributionControl?.removeAttribution(MAPLIBRE_ATTRIBUTION);
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const gl = layer.getMaplibreMap?.();
    const sync = () => {
      try {
        gl?.resize();
        layer._update?.();
      } catch {
        /* disposing */
      }
    };
    sync();
    const timer = window.setTimeout(sync, 200);
    const later = window.setTimeout(sync, 700);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(later);
    };
  }, [viewSync]);

  return <div data-testid="maplibre-basemap-ready" hidden />;
};
