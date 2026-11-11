import { describe, expect, it } from 'vitest';
import {
  atlasHasPendingChanges,
  defaultAtlasConfig,
  emptyAtlasDistrictConfig,
  loadAtlasConfig,
  persistAtlasConfig,
  upsertDistrictConfig,
} from './atlasConfig';
import { ATLAS_LAYER_STORAGE_KEY } from './atlasTypes';

describe('atlasConfig', () => {
  it('detects pending vs applied selection', () => {
    const d = emptyAtlasDistrictConfig('asr');
    expect(atlasHasPendingChanges(d)).toBe(false);
    d.selectedLayerIds = ['lyr-hotspots'];
    expect(atlasHasPendingChanges(d)).toBe(true);
    d.appliedLayerIds = ['lyr-hotspots'];
    expect(atlasHasPendingChanges(d)).toBe(false);
  });

  it('persists and reloads independent Atlas storage key', () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    };
    let cfg = defaultAtlasConfig();
    cfg = upsertDistrictConfig(cfg, {
      ...emptyAtlasDistrictConfig('asr'),
      selectedLayerIds: ['lyr-pss'],
      appliedLayerIds: ['lyr-pss'],
      layerVisibility: { 'lyr-pss': true },
    });
    cfg = { ...cfg, activeDistrictId: 'asr' };
    expect(persistAtlasConfig(cfg, storage)).toBe(true);
    expect(mem.get(ATLAS_LAYER_STORAGE_KEY)).toBeTruthy();
    const loaded = loadAtlasConfig(storage);
    expect(loaded.activeDistrictId).toBe('asr');
    expect(loaded.districts.asr.appliedLayerIds).toEqual(['lyr-pss']);
  });
});
