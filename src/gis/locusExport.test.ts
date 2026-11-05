import { describe, expect, it } from 'vitest';
import type { GisLayer } from '../types/gis';
import {
  defaultLocusSelection,
  isLocusExportableLayer,
  locusExportableLayers,
  locusLayerFetchUrl,
} from './locusExport';

function layer(partial: Partial<GisLayer> & Pick<GisLayer, 'id' | 'sourceTable' | 'geometryType'>): GisLayer {
  return {
    groupId: 'grp-admin',
    name: partial.id,
    codeName: partial.id,
    enabled: false,
    opacity: 100,
    swatchType: 'poly-navy',
    metaRight: 'test',
    featureCount: 1,
    crs: 'EPSG:4326',
    ...partial,
  };
}

describe('locusExport', () => {
  it('accepts single-file GeoJSON catalog paths only', () => {
    expect(
      isLocusExportableLayer(
        layer({
          id: 'a',
          geometryType: 'Point',
          sourceTable: 'public/geo/gis-source/ops/hotspots.geojson',
        })
      )
    ).toBe(true);
    expect(
      isLocusExportableLayer(
        layer({
          id: 'b',
          geometryType: 'MultiPolygon',
          sourceTable: 'public/geo/villages/',
        })
      )
    ).toBe(false);
    expect(
      isLocusExportableLayer(
        layer({
          id: 'c',
          geometryType: 'RasterGrid',
          sourceTable: 'public/geo/gis-source/raster/soi_topo/',
        })
      )
    ).toBe(false);
  });

  it('maps public/ paths to Vite URLs', () => {
    expect(locusLayerFetchUrl('public/geo/ap-state.geojson')).toBe('/geo/ap-state.geojson');
  });

  it('defaults selection to enabled exportable layers', () => {
    const layers = [
      layer({
        id: 'lyr-state-border',
        geometryType: 'MultiPolygon',
        sourceTable: 'public/geo/ap-state.geojson',
        enabled: true,
      }),
      layer({
        id: 'lyr-hotspots',
        geometryType: 'Point',
        sourceTable: 'public/geo/gis-source/ops/hotspots.geojson',
        enabled: false,
      }),
    ];
    expect(locusExportableLayers(layers)).toHaveLength(2);
    expect(defaultLocusSelection(layers)).toEqual(['lyr-state-border']);
  });
});
