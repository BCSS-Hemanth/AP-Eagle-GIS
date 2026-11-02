import type { Map as MapLibreMap } from 'maplibre-gl';
import type { IngestedLayer } from './types';
import { EMPTY_FC } from '../mapLibre3d';

const PREFIX = 'ingest-';

function wmsTemplate(layer: IngestedLayer): string {
  const wms = layer.tiles?.wms;
  const base = (layer.tiles?.url ?? '').split('?')[0];
  if (!wms) return layer.tiles?.url ?? '';
  const crs = wms.crs || 'EPSG:3857';
  const bbox = crs === 'EPSG:4326' ? '{bbox-epsg-4326}' : '{bbox-epsg-3857}';
  return `${base}?SERVICE=WMS&REQUEST=GetMap&LAYERS=${encodeURIComponent(wms.layers)}&STYLES=&FORMAT=${encodeURIComponent(wms.format)}&TRANSPARENT=${wms.transparent ? 'TRUE' : 'FALSE'}&VERSION=${wms.version}&CRS=${crs}&WIDTH=256&HEIGHT=256&BBOX=${bbox}`;
}

function removePrefixed(map: MapLibreMap) {
  const style = map.getStyle();
  if (!style) return;
  for (const layer of [...(style.layers ?? [])].reverse()) {
    if (layer.id.startsWith(PREFIX) && map.getLayer(layer.id)) map.removeLayer(layer.id);
  }
  for (const id of Object.keys(style.sources ?? {})) {
    if (id.startsWith(PREFIX) && map.getSource(id)) map.removeSource(id);
  }
}

export function syncMapLibreIngested(map: MapLibreMap, layers: IngestedLayer[]) {
  removePrefixed(map);
  for (const layer of layers) {
    if (!layer.enabled) continue;
    const sourceId = `${PREFIX}${layer.id}`;
    const opacity = layer.opacity / 100;
    if (layer.kind === 'vector' && layer.collection) {
      map.addSource(sourceId, { type: 'geojson', data: layer.collection });
      map.addLayer({
        id: `${sourceId}-fill`,
        type: 'fill',
        source: sourceId,
        filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
        paint: { 'fill-color': '#6d28d9', 'fill-opacity': 0.22 * opacity },
      });
      map.addLayer({
        id: `${sourceId}-line`,
        type: 'line',
        source: sourceId,
        paint: { 'line-color': '#6d28d9', 'line-width': 2, 'line-opacity': opacity },
      });
      map.addLayer({
        id: `${sourceId}-circle`,
        type: 'circle',
        source: sourceId,
        filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
        paint: {
          'circle-radius': 6,
          'circle-color': '#6d28d9',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
          'circle-opacity': opacity,
        },
      });
    } else if (layer.kind === 'raster' && layer.raster) {
      const [[south, west], [north, east]] = layer.raster.bounds;
      map.addSource(sourceId, {
        type: 'image',
        url: layer.raster.dataUrl,
        coordinates: [
          [west, north],
          [east, north],
          [east, south],
          [west, south],
        ],
      });
      map.addLayer({
        id: `${sourceId}-raster`,
        type: 'raster',
        source: sourceId,
        paint: { 'raster-opacity': opacity },
      });
    } else if (layer.kind === 'tiles' && layer.tiles) {
      const tiles = layer.tiles.wms ? [wmsTemplate(layer)] : [layer.tiles.url];
      map.addSource(sourceId, {
        type: 'raster',
        tiles,
        tileSize: 256,
        attribution: layer.tiles.attribution,
      });
      map.addLayer({
        id: `${sourceId}-raster`,
        type: 'raster',
        source: sourceId,
        paint: { 'raster-opacity': opacity },
      });
    }
  }
}

export function clearMapLibreIngested(map: MapLibreMap) {
  removePrefixed(map);
  if (!map.getSource(`${PREFIX}empty`)) {
    map.addSource(`${PREFIX}empty`, { type: 'geojson', data: EMPTY_FC });
  }
}
