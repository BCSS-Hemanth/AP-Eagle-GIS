import { describe, expect, it } from 'vitest';
import { INITIAL_GIS_LAYERS } from '../data/apGisData';
import {
  ADMIN_CATALOG_EXTRA_LAYER_IDS,
  canSaveToRoadsModules,
  catalogModuleForLayer,
  groupLayersByCatalogModule,
  layersInCatalogScope,
} from './catalogWorkspaces';
import { isRoadsRoutingNewVisualLayer } from './roadsRoutingNewLayers';
import { mergeEnabledLayersIntoRoutingNewConfig } from './roadsRoutingNewLayers';

describe('catalogWorkspaces', () => {
  it('includes Admin blurb road layers in Administrative Layers scope', () => {
    const scoped = layersInCatalogScope('administrative-layers', INITIAL_GIS_LAYERS);
    const ids = new Set(scoped.map((l) => l.id));
    expect(ids.has('lyr-districts')).toBe(true);
    for (const id of ADMIN_CATALOG_EXTRA_LAYER_IDS) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('allows Save to Roads* from the three theme catalogs', () => {
    expect(canSaveToRoadsModules('administrative-layers')).toBe(true);
    expect(canSaveToRoadsModules('operational-layers')).toBe(true);
    expect(canSaveToRoadsModules('road-network-layers')).toBe(true);
    expect(canSaveToRoadsModules('raster-imagery')).toBe(false);
  });

  it('keeps OPS main/internal roads in Road Network, not Operational', () => {
    const roadNet = new Set(
      layersInCatalogScope('road-network-layers', INITIAL_GIS_LAYERS).map((l) => l.id)
    );
    const ops = new Set(
      layersInCatalogScope('operational-layers', INITIAL_GIS_LAYERS).map((l) => l.id)
    );
    expect(roadNet.has('lyr-ops-main-roads')).toBe(true);
    expect(roadNet.has('lyr-ops-internal-roads')).toBe(true);
    expect(roadNet.has('lyr-highways')).toBe(true);
    expect(roadNet.has('lyr-ap-roads-major')).toBe(true);
    expect(roadNet.has('lyr-ap-roads-full')).toBe(true);
    const admin = new Set(
      layersInCatalogScope('administrative-layers', INITIAL_GIS_LAYERS).map((l) => l.id)
    );
    expect(admin.has('lyr-highways')).toBe(false);
    expect(admin.has('lyr-ap-roads-major')).toBe(false);
    expect(admin.has('lyr-ap-roads-full')).toBe(false);
    expect(admin.has('lyr-railways')).toBe(false);
    expect(roadNet.has('lyr-railways')).toBe(true);
    expect(ops.has('lyr-ops-main-roads')).toBe(false);
    expect(ops.has('lyr-ops-internal-roads')).toBe(false);
  });

  it('segregates hover layers by Administrative / Operational / Road Network', () => {
    const districts = INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-districts')!;
    const checkposts = INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-checkposts')!;
    const highways = INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-highways')!;
    const opsInternal = INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-ops-internal-roads')!;
    expect(catalogModuleForLayer(districts)).toBe('administrative-layers');
    expect(catalogModuleForLayer(checkposts)).toBe('operational-layers');
    expect(catalogModuleForLayer(highways)).toBe('road-network-layers');
    expect(catalogModuleForLayer(opsInternal)).toBe('road-network-layers');
    const groups = groupLayersByCatalogModule([districts, checkposts, highways, opsInternal]);
    expect(groups.map((g) => g.label)).toEqual([
      'Administrative',
      'Operational',
      'Road Network',
    ]);
    expect(groups.find((g) => g.id === 'administrative-layers')?.layers.map((l) => l.id)).toEqual([
      'lyr-districts',
    ]);
    expect(groups.find((g) => g.id === 'road-network-layers')?.layers.map((l) => l.id)).toEqual([
      'lyr-highways',
      'lyr-ops-internal-roads',
    ]);
  });

  it('saves Road Network AP major roads into Roads Routing New', () => {
    const layers = INITIAL_GIS_LAYERS.map((l) =>
      l.id === 'lyr-ap-roads-major' || l.id === 'lyr-districts'
        ? { ...l, enabled: true }
        : { ...l, enabled: false }
    );
    const scoped = layersInCatalogScope('road-network-layers', layers);
    const next = mergeEnabledLayersIntoRoutingNewConfig({}, scoped, null);
    expect(next['lyr-ap-roads-major']?.enabled).toBe(false);
    expect(next['lyr-districts']).toBeUndefined();
    expect(isRoadsRoutingNewVisualLayer('lyr-ap-roads-major')).toBe(true);
  });

  it('saves globally enabled roads even when current module has only OPS points ticked', () => {
    const layers = INITIAL_GIS_LAYERS.map((l) =>
      l.id === 'lyr-checkposts' ||
      l.id === 'lyr-toll-plazas' ||
      l.id === 'lyr-ap-roads-major'
        ? { ...l, enabled: true }
        : { ...l, enabled: false }
    );
    // Dashboard-style: merge from full catalog, not OPS-only scope.
    const next = mergeEnabledLayersIntoRoutingNewConfig({}, layers, null);
    expect(next['lyr-ap-roads-major']?.enabled).toBe(false);
    expect(next['lyr-checkposts']).toBeUndefined();
    expect(next['lyr-toll-plazas']).toBeUndefined();
  });
});
