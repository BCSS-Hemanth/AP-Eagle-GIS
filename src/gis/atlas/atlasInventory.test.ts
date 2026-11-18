import { describe, expect, it } from 'vitest';
import { atlasInventoryForDistrict, atlasLayersByCategory } from './atlasInventory';
import { isAtlasDistrictSelectable } from './atlasDistricts';

describe('atlasInventory', () => {
  it('returns only non-empty verified ASR layers', () => {
    const inv = atlasInventoryForDistrict('asr');
    expect(inv).not.toBeNull();
    expect(inv!.layers.every((l) => l.featureCount > 0)).toBe(true);
    expect(inv!.layers.some((l) => l.layerId === 'lyr-pharma-hubs')).toBe(false);
    expect(inv!.layers.some((l) => l.layerId === 'lyr-highways')).toBe(false);
    expect(atlasLayersByCategory(inv, 'operational').some((l) => l.layerId === 'lyr-hotspots')).toBe(
      true
    );
    expect(atlasLayersByCategory(inv, 'administrative').some((l) => l.layerId === 'lyr-asr-agency')).toBe(
      true
    );
    expect(atlasLayersByCategory(inv, 'operational').some((l) => l.layerId === 'lyr-asr-agency')).toBe(
      false
    );
  });

  it('keeps verified Guntur inventory but locks the district in the dropdown', () => {
    expect(isAtlasDistrictSelectable('asr')).toBe(true);
    expect(isAtlasDistrictSelectable('guntur')).toBe(false);
    const inv = atlasInventoryForDistrict('guntur');
    expect(inv).not.toBeNull();
    expect(inv!.layers.every((l) => l.featureCount > 0)).toBe(true);
    expect(inv!.layers.find((l) => l.layerId === 'lyr-mandals')?.featureCount).toBe(16);
    expect(inv!.layers.find((l) => l.layerId === 'lyr-villages')?.featureCount).toBe(222);
    expect(inv!.layers.find((l) => l.layerId === 'lyr-ap-roads-major')?.featureCount).toBe(110);
    expect(atlasLayersByCategory(inv, 'operational').map((l) => l.layerId)).toEqual(['lyr-toll-plazas']);
    expect(atlasLayersByCategory(inv, 'administrative').length).toBeGreaterThan(0);
    expect(atlasLayersByCategory(inv, 'road-network').length).toBeGreaterThan(0);
    expect(inv!.layers.some((l) => l.layerId === 'lyr-hotspots')).toBe(false);
    expect(inv!.layers.some((l) => l.layerId === 'atlas-pedakurapadu-roads')).toBe(false);
    expect(atlasInventoryForDistrict('anakapalli')).toBeNull();
    expect(isAtlasDistrictSelectable('anakapalli')).toBe(false);
  });

  it('lists Proposed ANPR on ASR administrative inventory', () => {
    const anpr = atlasInventoryForDistrict('asr')!.layers.find((l) => l.layerId === 'lyr-proposed-anpr');
    expect(anpr?.featureCount).toBe(38);
    expect(anpr?.category).toBe('administrative');
    expect(atlasInventoryForDistrict('guntur')!.layers.some((l) => l.layerId === 'lyr-proposed-anpr')).toBe(
      false
    );
    expect(atlasInventoryForDistrict('palnadu')!.layers.some((l) => l.layerId === 'lyr-proposed-anpr')).toBe(
      false
    );
  });

  it('lists verified partial-match KMZ overlays on district inventories', () => {
    const asr = atlasInventoryForDistrict('asr')!;
    expect(asr.layers.find((l) => l.layerId === 'lyr-ps-border-area')?.featureCount).toBe(22);
    expect(asr.layers.find((l) => l.layerId === 'lyr-asr-road-network')?.featureCount).toBe(5611);
    expect(asr.layers.find((l) => l.layerId === 'lyr-route-modeling')?.featureCount).toBe(5644);
    expect(atlasInventoryForDistrict('guntur')!.layers.find((l) => l.layerId === 'lyr-kmz-villages')?.featureCount).toBe(
      1
    );
    expect(
      atlasInventoryForDistrict('palnadu')!.layers.find((l) => l.layerId === 'lyr-ap-neighbor-states')?.featureCount
    ).toBe(3);
    expect(atlasInventoryForDistrict('guntur')!.layers.some((l) => l.layerId === 'lyr-asr-road-network')).toBe(
      false
    );
  });

  it('maps the provided Pedakurapadu roads on Palnadu and keeps Guntur inventory', () => {
    expect(isAtlasDistrictSelectable('palnadu')).toBe(true);
    expect(isAtlasDistrictSelectable('guntur')).toBe(false);
    const palnadu = atlasInventoryForDistrict('palnadu');
    const roads = palnadu!.layers.find((l) => l.layerId === 'atlas-pedakurapadu-roads');
    expect(roads?.featureCount).toBe(916);
    expect(roads?.category).toBe('road-network');
    expect(atlasInventoryForDistrict('guntur')!.layers.find((l) => l.layerId === 'lyr-mandals')?.featureCount).toBe(16);
    expect(atlasInventoryForDistrict('asr')!.layers.some((l) => l.layerId === 'atlas-pedakurapadu-roads')).toBe(false);
  });

  it('records ASR major roads as SH-only note', () => {
    const major = atlasInventoryForDistrict('asr')!.layers.find(
      (l) => l.layerId === 'lyr-ap-roads-major'
    );
    expect(major?.featureCount).toBe(299);
    expect(major?.countNote).toMatch(/State Highway/i);
  });
});
