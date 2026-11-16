import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GIS_SOURCE_ADMIN_LAYERS,
  GIS_SOURCE_OPS_LAYERS,
  GIS_SOURCE_RASTER_PRODUCTS,
  GIS_SOURCE_ROAD_KMZ_LAYERS,
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
      'lyr-proposed-anpr',
      'lyr-ap-neighbor-states',
      'lyr-aob-dists',
      'lyr-kmz-villages',
      'lyr-ps-border-area',
      'lyr-atlas-map-data',
      'lyr-taluk-gis',
      'lyr-vsp-village-pts',
      'lyr-ap-roads-major',
      'lyr-roads-asr-classified',
      'lyr-asr-road-network',
      'lyr-route-modeling',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
    expect(INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-proposed-anpr')?.groupId).toBe('grp-admin');
    expect(INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-proposed-anpr')?.featureCount).toBe(42);
    expect(INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-ap-neighbor-states')?.groupId).toBe('grp-admin');
    expect(INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-roads-asr-classified')?.groupId).toBe(
      'grp-transport'
    );
    expect(INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-asr-road-network')?.featureCount).toBe(5768);
    expect(INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-soi-grid')).toBeUndefined();
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
    // ASR Dist-Admin Boundary keeps OPS KMZ geometry but lives under Administrative.
    expect(byId['lyr-asr-agency']?.groupId).toBe('grp-admin');
    expect(byId['lyr-asr-agency']?.sourceTable).toContain('gis-source/ops/asr_boundary');
    expect(byId['lyr-asr-agency']?.featureCount).toBe(1);
    expect(byId['lyr-drug-routes'].sourceTable).not.toContain('ap-agency-route');
    expect(byId['lyr-ganja-transport-routes'].groupId).toBe('grp-transport');
    expect(byId['lyr-ganja-transport-routes'].name).toBe('D - Routes (Ganja Transport)');
    expect(byId['lyr-ganja-transport-routes'].featureCount).toBe(234);
    expect(byId['lyr-forest-trails'].sourceTable).not.toContain('Waymarked');
  });
});

const EXPECTED_RASTER_COUNTS: Record<keyof typeof GIS_SOURCE_RASTER_PRODUCTS, number> = {
  soiTopo: 239,
};

describe('Proposed ANPR Admin KMZ', () => {
  it('keeps converted ANPR locations under Administrative GIS-Source admin', () => {
    const root = resolve(process.cwd(), 'public');
    const disk = resolve(root, GIS_SOURCE_ADMIN_LAYERS.proposedAnpr.replace(/^\//, ''));
    expect(existsSync(disk), disk).toBe(true);
    const json = JSON.parse(readFileSync(disk, 'utf8'));
    expect(json.features.length).toBe(42);
    const types = new Set(json.features.map((f: { geometry: { type: string } }) => f.geometry.type));
    expect(types.has('Point')).toBe(true);
    expect(types.has('LineString')).toBe(true);
  });
});

describe('Road Network Ganja Transport KMZ', () => {
  it('keeps the converted KMZ as its own Road Network layer', () => {
    const root = resolve(process.cwd(), 'public');
    const disk = resolve(root, GIS_SOURCE_ROAD_KMZ_LAYERS.ganjaTransportRoutes.replace(/^\//, ''));
    expect(existsSync(disk), disk).toBe(true);
    const json = JSON.parse(readFileSync(disk, 'utf8'));
    expect(json.type).toBe('FeatureCollection');
    expect(json.features.length).toBe(234);
    const types = new Set(json.features.map((f: { geometry: { type: string } }) => f.geometry.type));
    expect(types.has('LineString')).toBe(true);
    expect(types.has('Point')).toBe(true);
    expect(types.has('Polygon')).toBe(true);
    const line = json.features.find(
      (f: { geometry: { type: string } }) => f.geometry.type === 'LineString'
    );
    const [lon, lat] = line.geometry.coordinates[0];
    expect(lon).toBeGreaterThan(76);
    expect(lon).toBeLessThan(86);
    expect(lat).toBeGreaterThan(12);
    expect(lat).toBeLessThan(20);
    expect(json.features[0].properties.source_kmz).toContain('Ganja');
  });
});

const EXPECTED_PARTIAL_ADMIN_COUNTS = {
  apNeighborStates: 15,
  aobDists: 31,
  kmzVillages: 266,
  psBorderArea: 99,
  atlasMapData: 1005,
} as const;

const EXPECTED_PARTIAL_ROAD_COUNTS = {
  roadsAsrClassified: 261,
  asrRoadNetwork: 5768,
  routeModeling: 5823,
} as const;

describe('Partial-match KMZ layers (separate catalog overlays)', () => {
  it('registers converted admin partial KMZs with expected feature counts', () => {
    const root = resolve(process.cwd(), 'public');
    for (const [id, count] of Object.entries(EXPECTED_PARTIAL_ADMIN_COUNTS) as Array<
      [keyof typeof EXPECTED_PARTIAL_ADMIN_COUNTS, number]
    >) {
      const disk = resolve(root, GIS_SOURCE_ADMIN_LAYERS[id].replace(/^\//, ''));
      expect(existsSync(disk), disk).toBe(true);
      const json = JSON.parse(readFileSync(disk, 'utf8'));
      expect(json.features.length).toBe(count);
    }
  });

  it('registers converted road partial KMZs with expected feature counts', () => {
    const root = resolve(process.cwd(), 'public');
    for (const [id, count] of Object.entries(EXPECTED_PARTIAL_ROAD_COUNTS) as Array<
      [keyof typeof EXPECTED_PARTIAL_ROAD_COUNTS, number]
    >) {
      const disk = resolve(root, GIS_SOURCE_ROAD_KMZ_LAYERS[id].replace(/^\//, ''));
      expect(existsSync(disk), disk).toBe(true);
      const json = JSON.parse(readFileSync(disk, 'utf8'));
      expect(json.features.length).toBe(count);
    }
  });
});

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

  it('points SOI topo legend row at GIS-Source (sat packs removed)', () => {
    const byId = Object.fromEntries(INITIAL_GIS_LAYERS.map((l) => [l.id, l]));
    expect(byId['lyr-cartosat']).toBeUndefined();
    expect(byId['lyr-hillshade']).toBeUndefined();
    expect(byId['lyr-google-roadmap']).toBeUndefined();
    expect(byId['lyr-soi-topo'].featureCount).toBe(239);
    expect(byId['lyr-soi-topo'].sourceTable).toContain('soi_topo');
  });
});
