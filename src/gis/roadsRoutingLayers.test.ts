import { describe, expect, it } from 'vitest';
import { INITIAL_GIS_LAYERS } from '../data/apGisData';
import {
  mergeEnabledLayersIntoRoutingConfig,
  routingLayersFromConfig,
  isRoutableRoadLayer,
} from './roadsRoutingLayers';

describe('roadsRoutingLayers', () => {
  it('merges enabled catalog layers without dropping prior saves', () => {
    const layers = INITIAL_GIS_LAYERS.map((l) =>
      l.id === 'lyr-pss' || l.id === 'lyr-checkposts'
        ? { ...l, enabled: true }
        : { ...l, enabled: false }
    );
    const first = mergeEnabledLayersIntoRoutingConfig({}, layers, ['grp-admin']);
    expect(first['lyr-pss']?.enabled).toBe(false);
    expect(first['lyr-checkposts']).toBeUndefined();

    const withOps = layers.map((l) =>
      l.id === 'lyr-checkposts' ? { ...l, enabled: true } : l
    );
    const second = mergeEnabledLayersIntoRoutingConfig(first, withOps, ['grp-ops']);
    expect(second['lyr-pss']?.enabled).toBe(false);
    expect(second['lyr-checkposts']?.enabled).toBe(false);
  });

  it('keeps saved layers in the list when map visibility is toggled off', () => {
    const config = {
      'lyr-highways': { enabled: false, opacity: 85 },
    };
    const rows = routingLayersFromConfig(INITIAL_GIS_LAYERS, config);
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(false);
    expect(isRoutableRoadLayer('lyr-highways')).toBe(true);
    expect(isRoutableRoadLayer('lyr-pss')).toBe(false);
  });
});
