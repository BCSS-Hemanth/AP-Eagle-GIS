import { describe, expect, it } from 'vitest';
import { INITIAL_GIS_LAYERS } from '../data/apGisData';
import {
  applyLayerConfig,
  configsEqual,
  countEnabledLayers,
  defaultDashboardLayerConfig,
  layerConfigFromGisLayers,
  destinationConfigFromSelection,
  hoverLayersForDestination,
  layersEnabledInConfig,
  leafletFlagsFromLayers,
  loadDashboardLayerConfig,
  persistDashboardLayerConfig,
  type DashboardLayerConfig,
  type JsonStorage,
} from './dashboardLayers';

function memoryStorage(seed?: Record<string, string>): JsonStorage {
  const data = { ...(seed ?? {}) };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe('dashboard layer catalog save', () => {
  it('defaults the dashboard to state border only (no district clutter)', () => {
    const config = defaultDashboardLayerConfig();
    expect(config['lyr-state-border']?.enabled).toBe(true);
    expect(config['lyr-districts']?.enabled).toBe(false);
    expect(config['lyr-mandals']?.enabled).toBe(false);
    expect(config['lyr-pss']?.enabled).toBe(false);
    expect(config['lyr-highways']?.enabled).toBe(false);
    const flags = leafletFlagsFromLayers(applyLayerConfig(INITIAL_GIS_LAYERS, config));
    expect(flags.showDistricts).toBe(false);
    expect(flags.showPoliceStations).toBe(false);
    expect(flags.showHighways).toBe(false);
    expect(flags.showWaterbodies).toBe(false);
    expect(flags.showHillshade).toBe(false);
  });

  it('applies a catalog snapshot onto dashboard flags including opacity', () => {
    const catalog = INITIAL_GIS_LAYERS.map((layer) =>
      layer.id === 'lyr-highways'
        ? { ...layer, enabled: true }
        : layer.id === 'lyr-waterbodies' || layer.id === 'lyr-hillshade'
          ? { ...layer, enabled: true }
        : layer.id === 'lyr-pss'
          ? { ...layer, enabled: true, opacity: 40 }
          : layer
    );
    const saved = layerConfigFromGisLayers(catalog);
    const applied = applyLayerConfig(INITIAL_GIS_LAYERS, saved);
    const flags = leafletFlagsFromLayers(applied);
    expect(flags.showHighways).toBe(true);
    expect(flags.showWaterbodies).toBe(true);
    expect(flags.showHillshade).toBe(true);
    expect(flags.showPoliceStations).toBe(true);
    expect(flags.policeStationOpacity).toBeCloseTo(0.4);
    expect(countEnabledLayers(applied)).toBeGreaterThan(countEnabledLayers(applyLayerConfig(INITIAL_GIS_LAYERS, defaultDashboardLayerConfig())));
  });

  it('round-trips through storage so a refresh keeps the dashboard snapshot', () => {
    const storage = memoryStorage();
    const config: DashboardLayerConfig = {
      'lyr-districts': { enabled: true, opacity: 100 },
      'lyr-highways': { enabled: true, opacity: 80 },
    };
    expect(persistDashboardLayerConfig(config, storage)).toBe(true);
    expect(loadDashboardLayerConfig(storage)).toEqual(config);
  });

  it('rejects corrupt storage instead of inventing layers', () => {
    expect(loadDashboardLayerConfig(memoryStorage({ 'ap-eagle.dashboard-layers.v1': 'not-json' }))).toBeNull();
    expect(loadDashboardLayerConfig(memoryStorage({ 'ap-eagle.dashboard-layers.v1': '[]' }))).toBeNull();
  });

  it('hover assignment lists only config-enabled layers (ignores catalog checkboxes)', () => {
    const catalogOn = INITIAL_GIS_LAYERS.map((l) =>
      l.id === 'lyr-highways' || l.id === 'lyr-districts' ? { ...l, enabled: true } : l
    );
    const destination: DashboardLayerConfig = {
      'lyr-state-border': { enabled: true, opacity: 100 },
      'lyr-highways': { enabled: false, opacity: 100 },
    };
    const assigned = layersEnabledInConfig(catalogOn, destination);
    expect(assigned.map((l) => l.id)).toEqual(['lyr-state-border']);
    expect(layersEnabledInConfig(catalogOn, { 'lyr-highways': { enabled: false, opacity: 80 } })).toEqual(
      []
    );
    expect(layersEnabledInConfig(catalogOn, null)).toEqual([]);
  });

  it('rewrites a destination from the current selection so unselected layers are removed', () => {
    const layers = INITIAL_GIS_LAYERS.map((l) =>
      l.id === 'lyr-highways' || l.id === 'lyr-districts' || l.id === 'lyr-ap-roads-major'
        ? { ...l, enabled: true }
        : { ...l, enabled: false }
    );
    const selected = new Set(['lyr-districts']);
    const snapshot = destinationConfigFromSelection(layers, selected, 'snapshot');
    expect(snapshot['lyr-districts']?.enabled).toBe(true);
    expect(snapshot['lyr-highways']?.enabled).toBe(false);
    expect(snapshot['lyr-state-border']?.enabled).toBe(false);

    const assigned = destinationConfigFromSelection(layers, selected, 'assigned', (layer) =>
      layer.id === 'lyr-highways' || layer.id === 'lyr-ap-roads-major' || layer.id === 'lyr-districts'
    );
    expect(assigned).toEqual({
      'lyr-districts': { enabled: false, opacity: layers.find((l) => l.id === 'lyr-districts')!.opacity },
    });
    const roadsOnly = destinationConfigFromSelection(layers, new Set(['lyr-highways', 'lyr-districts']), 'assigned', (layer) =>
      layer.id === 'lyr-highways' || layer.id === 'lyr-ap-roads-major'
    );
    expect(Object.keys(roadsOnly)).toEqual(['lyr-highways']);
    expect(roadsOnly['lyr-highways']?.enabled).toBe(false);
    expect(roadsOnly['lyr-ap-roads-major']).toBeUndefined();

    const keepEye = destinationConfigFromSelection(
      layers,
      new Set(['lyr-highways']),
      'assigned',
      (layer) => layer.id === 'lyr-highways',
      { 'lyr-highways': { enabled: true, opacity: 80 } }
    );
    expect(keepEye['lyr-highways']).toEqual({ enabled: true, opacity: layers.find((l) => l.id === 'lyr-highways')!.opacity });
  });

  it('hover lists show live catalog selection immediately plus saved destination layers', () => {
    const catalogOn = INITIAL_GIS_LAYERS.map((l) =>
      l.id === 'lyr-highways' || l.id === 'lyr-ap-roads-full' ? { ...l, enabled: true } : { ...l, enabled: false }
    );
    const destination: DashboardLayerConfig = {
      'lyr-state-border': { enabled: true, opacity: 100 },
    };
    const hover = hoverLayersForDestination(catalogOn, destination);
    expect(hover.map((l) => l.id).sort()).toEqual(
      ['lyr-ap-roads-full', 'lyr-highways', 'lyr-state-border'].sort()
    );
    expect(hoverLayersForDestination(catalogOn, null).map((l) => l.id).sort()).toEqual(
      ['lyr-ap-roads-full', 'lyr-highways'].sort()
    );
  });

  it('destination enabled:false keeps live catalog ticks off that hover only', () => {
    const catalogOn = INITIAL_GIS_LAYERS.map((l) =>
      l.id === 'lyr-highways' || l.id === 'lyr-ap-roads-full' ? { ...l, enabled: true } : { ...l, enabled: false }
    );
    const dashboardOff: DashboardLayerConfig = {
      'lyr-highways': { enabled: false, opacity: 100 },
      'lyr-ap-roads-full': { enabled: false, opacity: 100 },
    };
    const roadsStillOn: DashboardLayerConfig = {};
    expect(hoverLayersForDestination(catalogOn, dashboardOff).map((l) => l.id)).toEqual([]);
    expect(hoverLayersForDestination(catalogOn, roadsStillOn).map((l) => l.id).sort()).toEqual(
      ['lyr-ap-roads-full', 'lyr-highways'].sort()
    );
  });

  it('detects unsaved catalog edits against the last dashboard snapshot', () => {
    const saved = defaultDashboardLayerConfig();
    const dirty = { ...saved, 'lyr-highways': { enabled: true, opacity: 100 } };
    expect(configsEqual(saved, saved)).toBe(true);
    expect(configsEqual(saved, dirty)).toBe(false);
  });

  it('maps OPS KMZ legend ids to independent leaflet flags', () => {
    const catalog = INITIAL_GIS_LAYERS.map((layer) =>
      [
        'lyr-drug-routes',
        'lyr-forest-trails',
        'lyr-asr-agency',
        'lyr-hotspots',
        'lyr-checkposts',
        'lyr-toll-plazas',
        'lyr-ddacs',
        'lyr-ops-main-roads',
      ].includes(layer.id)
        ? { ...layer, enabled: true }
        : layer
    );
    const flags = leafletFlagsFromLayers(catalog);
    expect(flags.showAgencyRoutes).toBe(true);
    expect(flags.showTrails).toBe(true);
    expect(flags.showAsrBoundary).toBe(true);
    expect(flags.showHotspots).toBe(true);
    expect(flags.showCheckPosts).toBe(true);
    expect(flags.showTollPlazas).toBe(true);
    expect(flags.showDdacs).toBe(true);
    expect(flags.showOpsMainRoads).toBe(true);
  });
});
