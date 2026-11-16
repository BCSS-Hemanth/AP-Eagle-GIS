import { describe, expect, it } from 'vitest';
import { INITIAL_GIS_LAYERS } from '../data/apGisData';
import { layersInCatalogScope } from './catalogWorkspaces';
import {
  isRoutableRoadLayer,
  listRoutableRoadLayerIds,
  mergeEnabledLayersIntoRoutingConfig,
  resolveLayerGeoJsonUrl,
  routingLayersFromConfig,
  routingMapFlags,
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
  });

  it('treats every Road Network LineString as routable except rail/water/intel corridors', () => {
    expect(isRoutableRoadLayer('lyr-highways')).toBe(true);
    expect(isRoutableRoadLayer('lyr-ap-roads-major')).toBe(true);
    expect(isRoutableRoadLayer('lyr-ops-main-roads')).toBe(true);
    expect(isRoutableRoadLayer('lyr-ops-internal-roads')).toBe(true);
    expect(isRoutableRoadLayer('lyr-forest-trails')).toBe(true);
    expect(isRoutableRoadLayer('lyr-roads-asr-classified')).toBe(true);
    expect(isRoutableRoadLayer('lyr-asr-road-network')).toBe(true);
    expect(isRoutableRoadLayer('lyr-route-modeling')).toBe(true);

    expect(isRoutableRoadLayer('lyr-railways')).toBe(false);
    expect(isRoutableRoadLayer('lyr-rivers')).toBe(false);
    expect(isRoutableRoadLayer('lyr-ganja-transport-routes')).toBe(false);
    expect(isRoutableRoadLayer('lyr-pss')).toBe(false);

    const roadNet = layersInCatalogScope('road-network-layers', INITIAL_GIS_LAYERS);
    for (const layer of roadNet) {
      if (layer.geometryType !== 'LineString') {
        expect(isRoutableRoadLayer(layer)).toBe(false);
        continue;
      }
      if (
        layer.id === 'lyr-railways' ||
        layer.id === 'lyr-rivers' ||
        layer.id === 'lyr-ganja-transport-routes'
      ) {
        expect(isRoutableRoadLayer(layer)).toBe(false);
      } else {
        expect(isRoutableRoadLayer(layer)).toBe(true);
      }
    }

    const ids = listRoutableRoadLayerIds();
    expect(ids.length).toBeGreaterThan(8);
    expect(ids).not.toContain('lyr-railways');
  });

  it('resolves catalog sourceTable paths to fetchable GeoJSON URLs', () => {
    const major = INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-ap-roads-major')!;
    expect(resolveLayerGeoJsonUrl(major)).toBe(
      '/geo/gis-source/admin/ap_roads_major.geojson'
    );
    const nh = INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-highways')!;
    expect(resolveLayerGeoJsonUrl(nh)).toContain('/api/gis-roads/geojson');
  });

  it('exposes admin Eye flags for mandals/villages/GIS-Source hist like Routing New', () => {
    const layers = INITIAL_GIS_LAYERS.map((l) =>
      [
        'lyr-districts',
        'lyr-mandals',
        'lyr-villages',
        'lyr-districts-gis-hist',
        'lyr-state-gis-hist',
      ].includes(l.id)
        ? { ...l, enabled: true }
        : { ...l, enabled: false }
    );
    const flags = routingMapFlags(layers);
    expect(flags.showDistricts).toBe(true);
    expect(flags.showMandals).toBe(true);
    expect(flags.showVillages).toBe(true);
    expect(flags.showDistrictsGisHist).toBe(true);
    expect(flags.showStateGisHist).toBe(true);
    // Sparse routing lists must not default-on state border.
    expect(flags.showStateBorder).toBe(false);
  });
});
