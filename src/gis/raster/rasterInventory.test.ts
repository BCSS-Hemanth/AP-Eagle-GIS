import { describe, expect, it } from 'vitest';
import { isRasterDistrictSelectable, RASTER_DISTRICTS } from './rasterDistricts';
import { rasterInventoryForDistrict } from './rasterInventory';
import { emptyRasterDistrictConfig, rasterHasPendingChanges } from './rasterConfig';
import { rasterLeafletFlags, rasterVisibleAppliedIds } from './rasterMapFlags';

describe('Raster module inventory', () => {
  it('marks only ASR as selectable among 26 districts', () => {
    expect(RASTER_DISTRICTS).toHaveLength(26);
    expect(isRasterDistrictSelectable('asr')).toBe(true);
    expect(isRasterDistrictSelectable('guntur')).toBe(false);
  });

  it('exposes verified ASR SOI topo mosaic only', () => {
    const inv = rasterInventoryForDistrict('asr');
    expect(inv).not.toBeNull();
    const byId = Object.fromEntries((inv?.layers ?? []).map((l) => [l.layerId, l]));
    expect(byId['lyr-soi-topo']?.featureCount).toBe(239);
    expect(byId['lyr-cartosat']).toBeUndefined();
    expect(rasterInventoryForDistrict('palnadu')).toBeNull();
  });

  it('maps visible SOI layers to Leaflet raster flags only', () => {
    const ids = rasterVisibleAppliedIds(['lyr-soi-topo'], {
      'lyr-soi-topo': true,
    });
    expect([...ids]).toEqual(['lyr-soi-topo']);
    const flags = rasterLeafletFlags(new Set(['lyr-soi-topo']));
    expect(flags.showSoiTopo).toBe(true);
  });

  it('detects pending checkbox changes before Display', () => {
    const empty = emptyRasterDistrictConfig('asr');
    expect(rasterHasPendingChanges(empty)).toBe(false);
    expect(
      rasterHasPendingChanges({
        ...empty,
        selectedLayerIds: ['lyr-soi-topo'],
        appliedLayerIds: [],
      })
    ).toBe(true);
  });
});
