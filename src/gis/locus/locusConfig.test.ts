import { describe, expect, it } from 'vitest';
import {
  emptyLocusDistrictConfig,
  locusHasPendingChanges,
  loadLocusConfig,
  persistLocusConfig,
  upsertLocusDistrictConfig,
} from './locusConfig';
import { LOCUS_LAYER_STORAGE_KEY } from './locusTypes';

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe('locusConfig', () => {
  it('detects pending checkbox vs applied composition', () => {
    const d = emptyLocusDistrictConfig('asr');
    expect(locusHasPendingChanges(d)).toBe(false);
    d.selectedLayerIds = ['lyr-hotspots'];
    expect(locusHasPendingChanges(d)).toBe(true);
    d.appliedLayerIds = ['lyr-hotspots'];
    expect(locusHasPendingChanges(d)).toBe(false);
  });

  it('round-trips config through storage', () => {
    const storage = memoryStorage();
    let cfg = loadLocusConfig(storage);
    cfg = upsertLocusDistrictConfig(cfg, {
      ...emptyLocusDistrictConfig('asr'),
      selectedLayerIds: ['lyr-pss'],
      appliedLayerIds: ['lyr-pss'],
      layerVisibility: { 'lyr-pss': true },
    });
    expect(persistLocusConfig(cfg, storage)).toBe(true);
    expect(storage.getItem(LOCUS_LAYER_STORAGE_KEY)).toBeTruthy();
    const loaded = loadLocusConfig(storage);
    expect(loaded.districts.asr.appliedLayerIds).toEqual(['lyr-pss']);
  });
});
