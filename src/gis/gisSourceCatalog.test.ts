import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GIS_SOURCE_ADMIN_LAYERS,
  GIS_SOURCE_OPS_LAYERS,
  GIS_SOURCE_RASTER_PRODUCTS,
} from './gisSourceCatalog';
import { INITIAL_GIS_LAYERS } from '../data/apGisData';

const EXPECTED_OPS_COUNTS: Record<keyof typeof GIS_SOURCE_OPS_LAYERS, number> = {
  asrBoundary: 1,
  pharmaHubs: 4,
  checkPosts: 9,
  dRoutes: 148,
  ddacs: 6,
  entryExit: 12,
  ganjaSeized: 4,
  hotspots: 43,
  footTracks: 194,
  internalRoads: 404,
  mainRoads: 161,
  stockPoints: 13,
  tollPlazas: 37,
};

describe('GIS-Source Admin Phase 1A catalog', () => {
  it('registers converted admin geojson paths', () => {
    const root = resolve(process.cwd(), 'public');
    for (const path of Object.values(GIS_SOURCE_ADMIN_LAYERS)) {
      const disk = resolve(root, path.replace(/^\//, ''));
      expect(existsSync(disk), disk).toBe(true);
      const json = JSON.parse(readFileSync(disk, 'utf8'));
      expect(json.type).toBe('FeatureCollection');
      expect(Array.isArray(json.features)).toBe(true);
      expect(json.features.length).toBeGreaterThan(0);
    }
  });

  it('exposes new admin/transport layers in the legend catalog', () => {
    const ids = new Set(INITIAL_GIS_LAYERS.map((l) => l.id));
    for (const id of [
      'lyr-border-ps',
      'lyr-taluk-gis',
      'lyr-vsp-village-pts',
      'lyr-ap-roads-major',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
    expect(INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-soi-grid')?.sourceTable).toContain(
      'soi_50k_grid'
    );
    expect(INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-railways')?.sourceTable).toContain('rail_nt');
  });
});

describe('GIS-Source OPS Phase 1B independent KMZs', () => {
  it('registers converted OPS geojson with KMZ-matched feature counts', () => {
    const root = resolve(process.cwd(), 'public');
    for (const [id, path] of Object.entries(GIS_SOURCE_OPS_LAYERS) as Array<
      [keyof typeof GIS_SOURCE_OPS_LAYERS, string]
    >) {
      const disk = resolve(root, path.replace(/^\//, ''));
      expect(existsSync(disk), disk).toBe(true);
      const json = JSON.parse(readFileSync(disk, 'utf8'));
      expect(json.type).toBe('FeatureCollection');
      expect(json.features.length).toBe(EXPECTED_OPS_COUNTS[id]);
      for (const f of json.features) {
        expect(f.geometry).toBeTruthy();
        expect(f.properties?.source_kmz).toBeTruthy();
      }
    }
  });

  it('wires OPS layers into the legend and points drug/trails at gis-source', () => {
    const byId = Object.fromEntries(INITIAL_GIS_LAYERS.map((l) => [l.id, l]));
    for (const id of [
      'lyr-hotspots',
      'lyr-drug-routes',
      'lyr-checkposts',
      'lyr-toll-plazas',
      'lyr-seizure-polys',
      'lyr-asr-agency',
      'lyr-pharma-hubs',
      'lyr-ddacs',
      'lyr-entry-exit',
      'lyr-stock-points',
      'lyr-ops-main-roads',
      'lyr-ops-internal-roads',
      'lyr-forest-trails',
    ]) {
      expect(byId[id], id).toBeTruthy();
      expect(byId[id].sourceTable).toContain('gis-source/ops');
      expect(byId[id].featureCount).toBeGreaterThan(0);
    }
    expect(byId['lyr-drug-routes'].sourceTable).not.toContain('ap-agency-route');
    expect(byId['lyr-forest-trails'].sourceTable).not.toContain('Waymarked');
  });
});

const EXPECTED_RASTER_COUNTS: Record<keyof typeof GIS_SOURCE_RASTER_PRODUCTS, number> = {
  googleRoadmap: 1,
  googleSat: 1,
  googleTerrain: 1,
  aob: 356,
  ntCg: 484,
  soiTopo: 239,
};

describe('GIS-Source Raster Phase 1C', () => {
  it('registers converted raster manifests with KMZ-matched overlay counts', () => {
    const root = resolve(process.cwd(), 'public');
    for (const [id, path] of Object.entries(GIS_SOURCE_RASTER_PRODUCTS) as Array<
      [keyof typeof GIS_SOURCE_RASTER_PRODUCTS, string]
    >) {
      const disk = resolve(root, path.replace(/^\//, ''));
      expect(existsSync(disk), disk).toBe(true);
      const json = JSON.parse(readFileSync(disk, 'utf8'));
      expect(json.overlays.length).toBe(EXPECTED_RASTER_COUNTS[id]);
      expect(json.crs).toContain('4326');
      for (const ov of json.overlays.slice(0, 3)) {
        expect(ov.north).toBeGreaterThan(ov.south);
        expect(ov.east).toBeGreaterThan(ov.west);
        expect(ov.url).toContain('/geo/gis-source/raster/');
      }
    }
  });

  it('points cartosat/hillshade/soi legend rows at GIS-Source (not Esri)', () => {
    const byId = Object.fromEntries(INITIAL_GIS_LAYERS.map((l) => [l.id, l]));
    expect(byId['lyr-cartosat'].sourceTable).toContain('gis-source/raster');
    expect(byId['lyr-cartosat'].sourceTable).not.toMatch(/Esri/i);
    expect(byId['lyr-hillshade'].sourceTable).toContain('google_terrain');
    expect(byId['lyr-hillshade'].sourceTable).not.toMatch(/World_Hillshade/);
    expect(byId['lyr-soi-topo'].featureCount).toBe(239);
    expect(byId['lyr-google-roadmap'].featureCount).toBe(1);
  });
});
