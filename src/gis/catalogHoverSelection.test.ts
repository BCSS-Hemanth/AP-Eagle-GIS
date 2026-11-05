import { describe, expect, it } from 'vitest';
import { INITIAL_GIS_LAYERS } from '../data/apGisData';
import {
  EMPTY_CATALOG_HOVER_EXCLUSIONS,
  clearLayerHoverExclusions,
  excludeLayersFromHover,
  layersForCatalogHover,
} from './catalogHoverSelection';

describe('catalogHoverSelection', () => {
  it('shows enabled layers on a destination until that destination excludes them', () => {
    const layers = INITIAL_GIS_LAYERS.map((l) =>
      l.id === 'lyr-highways' || l.id === 'lyr-districts'
        ? { ...l, enabled: true }
        : { ...l, enabled: false }
    );
    expect(layersForCatalogHover(layers, {}).map((l) => l.id).sort()).toEqual([
      'lyr-districts',
      'lyr-highways',
    ]);
    expect(
      layersForCatalogHover(layers, { 'lyr-highways': true }).map((l) => l.id)
    ).toEqual(['lyr-districts']);
  });

  it('only turns off Visible when excluded from all three destinations', () => {
    const step1 = excludeLayersFromHover(EMPTY_CATALOG_HOVER_EXCLUSIONS, 'dashboard', [
      'lyr-highways',
    ]);
    expect(step1.turnOffLayerIds).toEqual([]);
    expect(step1.next.dashboard['lyr-highways']).toBe(true);

    const step2 = excludeLayersFromHover(step1.next, 'roadsRouting', ['lyr-highways']);
    expect(step2.turnOffLayerIds).toEqual([]);

    const step3 = excludeLayersFromHover(step2.next, 'roadsRoutingNew', ['lyr-highways']);
    expect(step3.turnOffLayerIds).toEqual(['lyr-highways']);
    expect(step3.next.dashboard['lyr-highways']).toBeUndefined();
  });

  it('clears exclusions when a layer is re-selected in the catalog', () => {
    const excluded = excludeLayersFromHover(EMPTY_CATALOG_HOVER_EXCLUSIONS, 'dashboard', [
      'lyr-highways',
    ]).next;
    const cleared = clearLayerHoverExclusions(excluded, 'lyr-highways');
    expect(cleared.dashboard['lyr-highways']).toBeUndefined();
  });
});
