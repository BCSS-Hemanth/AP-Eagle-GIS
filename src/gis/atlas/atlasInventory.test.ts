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
  });

  it('has no inventory for unverified districts', () => {
    expect(atlasInventoryForDistrict('guntur')).toBeNull();
    expect(isAtlasDistrictSelectable('asr')).toBe(true);
    expect(isAtlasDistrictSelectable('guntur')).toBe(false);
  });

  it('records ASR major roads as SH-only note', () => {
    const major = atlasInventoryForDistrict('asr')!.layers.find(
      (l) => l.layerId === 'lyr-ap-roads-major'
    );
    expect(major?.featureCount).toBe(299);
    expect(major?.countNote).toMatch(/State Highway/i);
  });
});
