import { describe, expect, it } from 'vitest';
import { INITIAL_GIS_LAYERS } from '../data/apGisData';
import {
  applyLayerConfig,
  configsEqual,
  countEnabledLayers,
  defaultDashboardLayerConfig,
  layerConfigFromGisLayers,
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
  it('defaults the dashboard to state + district borders only', () => {
    const config = defaultDashboardLayerConfig();
    expect(config['lyr-state-border']?.enabled).toBe(true);
    expect(config['lyr-districts']?.enabled).toBe(true);
    expect(config['lyr-mandals']?.enabled).toBe(false);
    expect(config['lyr-pss']?.enabled).toBe(false);
    expect(config['lyr-highways']?.enabled).toBe(false);
    const flags = leafletFlagsFromLayers(applyLayerConfig(INITIAL_GIS_LAYERS, config));
    expect(flags.showDistricts).toBe(true);
    expect(flags.showPoliceStations).toBe(false);
    expect(flags.showHighways).toBe(false);
  });

  it('applies a catalog snapshot onto dashboard flags including opacity', () => {
    const catalog = INITIAL_GIS_LAYERS.map((layer) =>
      layer.id === 'lyr-highways'
        ? { ...layer, enabled: true }
        : layer.id === 'lyr-pss'
          ? { ...layer, enabled: true, opacity: 40 }
          : layer
    );
    const saved = layerConfigFromGisLayers(catalog);
    const applied = applyLayerConfig(INITIAL_GIS_LAYERS, saved);
    const flags = leafletFlagsFromLayers(applied);
    expect(flags.showHighways).toBe(true);
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

  it('detects unsaved catalog edits against the last dashboard snapshot', () => {
    const saved = defaultDashboardLayerConfig();
    const dirty = { ...saved, 'lyr-highways': { enabled: true, opacity: 100 } };
    expect(configsEqual(saved, saved)).toBe(true);
    expect(configsEqual(saved, dirty)).toBe(false);
  });
});
