import { describe, expect, it } from 'vitest';
import { ATLAS_LAYER_STORAGE_KEY } from './atlas/atlasTypes';
import { LOCUS_LAYER_STORAGE_KEY } from './locus/locusTypes';
import {
  clearPersistedLayerSelections,
  PERSISTED_LAYER_STORAGE_KEYS,
} from './clearPersistedLayerSelections';
import { DASHBOARD_LAYER_STORAGE_KEY } from './dashboardLayers';

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    key(i: number) {
      return [...map.keys()][i] ?? null;
    },
    getItem(k: string) {
      return map.has(k) ? map.get(k)! : null;
    },
    setItem(k: string, v: string) {
      map.set(k, v);
    },
    removeItem(k: string) {
      map.delete(k);
    },
  };
}

describe('clearPersistedLayerSelections', () => {
  it('removes dashboard, routing, atlas, and locus layer keys', () => {
    const storage = memoryStorage({
      [DASHBOARD_LAYER_STORAGE_KEY]: '{"lyr-mandals":{"enabled":true,"opacity":100}}',
      [ATLAS_LAYER_STORAGE_KEY]: '{"version":1,"districts":{}}',
      [LOCUS_LAYER_STORAGE_KEY]: '{"version":1,"districts":{}}',
      'ap-eagle.unrelated-pref': 'keep',
      other: 'keep',
    });
    clearPersistedLayerSelections(storage);
    for (const key of PERSISTED_LAYER_STORAGE_KEYS) {
      expect(storage.getItem(key)).toBeNull();
    }
    expect(storage.getItem('ap-eagle.unrelated-pref')).toBe('keep');
    expect(storage.getItem('other')).toBe('keep');
  });
});
