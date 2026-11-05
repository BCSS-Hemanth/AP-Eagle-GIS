import React from 'react';
import { GeoJSON, ImageOverlay, TileLayer, WMSTileLayer } from 'react-leaflet';
import type { IngestedLayer } from '../../gis/ingest';
import { formatFeatureTooltip } from '../../gis/featureLabel';

const VECTOR_STYLE = {
  color: '#6d28d9',
  weight: 2,
  fillColor: '#7c3aed',
  fillOpacity: 0.22,
};

export const IngestedOverlays: React.FC<{ layers: IngestedLayer[] }> = ({ layers }) => {
  return (
    <>
      {layers
        .filter((layer) => layer.enabled)
        .map((layer) => {
          const opacity = layer.opacity / 100;
          if (layer.kind === 'vector' && layer.collection) {
            return (
              <GeoJSON
                key={layer.id}
                data={layer.collection}
                style={() => ({ ...VECTOR_STYLE, opacity, fillOpacity: 0.22 * opacity })}
                onEachFeature={(feature, leafletLayer) => {
                  const props = (feature.properties ?? {}) as Record<string, unknown>;
                  const name = formatFeatureTooltip(props, layer.name || 'Feature');
                  leafletLayer.bindTooltip(
                    `${name} · ${layer.driver} · ${layer.displayCrs}`,
                    { sticky: true, direction: 'top', opacity: 0.96 }
                  );
                }}
              />
            );
          }
          if (layer.kind === 'raster' && layer.raster?.dataUrl) {
            return (
              <ImageOverlay
                key={layer.id}
                url={layer.raster.dataUrl}
                bounds={layer.raster.bounds}
                opacity={opacity}
              />
            );
          }
          if (layer.kind === 'tiles' && layer.tiles?.wms) {
            return (
              <WMSTileLayer
                key={layer.id}
                url={layer.tiles.url}
                layers={layer.tiles.wms.layers}
                format={layer.tiles.wms.format}
                transparent={layer.tiles.wms.transparent}
                version={layer.tiles.wms.version}
                opacity={opacity}
                attribution={layer.tiles.attribution}
              />
            );
          }
          if (layer.kind === 'tiles' && layer.tiles) {
            return (
              <TileLayer
                key={layer.id}
                url={layer.tiles.url}
                attribution={layer.tiles.attribution}
                opacity={opacity}
                maxZoom={layer.tiles.maxZoom}
                minZoom={layer.tiles.minZoom}
              />
            );
          }
          return null;
        })}
    </>
  );
};
