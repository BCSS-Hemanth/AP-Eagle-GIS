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
      layerColors: { 'lyr-pss': '#aabbcc' },
    });
    cfg = { ...cfg, activeDistrictId: 'asr' };
    expect(persistAtlasConfig(cfg, storage)).toBe(true);
    expect(mem.get(ATLAS_LAYER_STORAGE_KEY)).toBeTruthy();
    const loaded = loadAtlasConfig(storage);
    expect(loaded.activeDistrictId).toBe('asr');
    expect(loaded.districts.asr.appliedLayerIds).toEqual(['lyr-pss']);
    expect(loaded.districts.asr.layerColors).toEqual({ 'lyr-pss': '#aabbcc' });
  });

  it('starts with empty layerColors and ignores invalid hex on load', () => {
    expect(emptyAtlasDistrictConfig('asr').layerColors).toEqual({});
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    };
    mem.set(
      ATLAS_LAYER_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeDistrictId: 'asr',
        districts: {
          asr: {
            districtId: 'asr',
            selectedLayerIds: ['lyr-pss'],
            appliedLayerIds: ['lyr-pss'],
            layerVisibility: {},
            layerOpacity: {},
            layerColors: { 'lyr-pss': 'not-a-color', 'lyr-hotspots': '#ff00aa' },
          },
        },
      })
    );
    const loaded = loadAtlasConfig(storage);
    expect(loaded.districts.asr.layerColors).toEqual({ 'lyr-hotspots': '#ff00aa' });
  });
});
