import { ATLAS_LAYER_STORAGE_KEY } from './atlas/atlasTypes';
import { LOCUS_LAYER_STORAGE_KEY } from './locus/locusTypes';
import { DASHBOARD_LAYER_STORAGE_KEY } from './dashboardLayers';
import { ROADS_ROUTING_LAYER_STORAGE_KEY } from './roadsRoutingLayers';
import { ROADS_ROUTING_NEW_LAYER_STORAGE_KEY } from './roadsRoutingNewLayers';

/** Known localStorage keys that hold layer / Atlas / Locus composition selections. */
export const PERSISTED_LAYER_STORAGE_KEYS = [
  DASHBOARD_LAYER_STORAGE_KEY,
  ROADS_ROUTING_LAYER_STORAGE_KEY,
  ROADS_ROUTING_NEW_LAYER_STORAGE_KEY,
  ATLAS_LAYER_STORAGE_KEY,
  LOCUS_LAYER_STORAGE_KEY,
] as const;

/**
 * Drop saved layer selections so a page load (incl. hard refresh) starts clean —
 * same as a new session: no previously checked / Displayed layers.
 * Does not touch auth sessionStorage.
 */
export function clearPersistedLayerSelections(
  storage: Pick<Storage, 'removeItem' | 'length' | 'key'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null
): string[] {
  if (!storage) return [];
  const removed: string[] = [];
  const known = new Set<string>(PERSISTED_LAYER_STORAGE_KEYS);

  for (const key of PERSISTED_LAYER_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {
      /* private mode / quota */
    }
  }

  // Future ap-eagle.* layer keys (keep auth and unrelated prefs out — only layer-ish names).
  try {
    const extras: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key || known.has(key)) continue;
      if (!key.startsWith('ap-eagle.')) continue;
      if (!/layer|atlas|locus|routing/i.test(key)) continue;
      extras.push(key);
    }
    for (const key of extras) {
      storage.removeItem(key);
      removed.push(key);
    }
  } catch {
    /* ignore */
  }

  return removed;
}
