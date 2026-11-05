import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INITIAL_GIS_LAYERS } from '../data/apGisData';
import {
  aoiBboxFromPoints,
  aoiBboxFromPoiPoints,
  associateFeaturesWithPois,
  colorForRoutingNewLayer,
  dedupeRoadFeatures,
  displayRoadsForLayer,
  isRoadsRoutingNewCatalogLayer,
  isRoadsRoutingNewVisualLayer,
  usesRoutingNewRadiusMatch,
  mergeEnabledLayersIntoRoutingNewConfig,
  midViewForAoiPoints,
  routeStrokeForProperties,
  routingNewLayersFromConfig,
} from './roadsRoutingNewLayers';

describe('roadsRoutingNewLayers', () => {
  it('merges only visual road layers into Roads Routing New config', () => {
    const layers = INITIAL_GIS_LAYERS.map((l) =>
      l.id === 'lyr-highways' || l.id === 'lyr-checkposts' || l.id === 'lyr-ap-roads-major'
        ? { ...l, enabled: true }
        : { ...l, enabled: false }
    );
    const next = mergeEnabledLayersIntoRoutingNewConfig({}, layers, ['grp-transport', 'grp-ops']);
    expect(next['lyr-highways']?.enabled).toBe(true);
    expect(next['lyr-ap-roads-major']?.enabled).toBe(true);
    expect(next['lyr-checkposts']).toBeUndefined();
  });

  it('merges Admin-scoped roads when groupFilter is null (pre-scoped catalog)', () => {
    const layers = INITIAL_GIS_LAYERS.map((l) =>
      l.id === 'lyr-ap-roads-full' || l.id === 'lyr-ops-main-roads'
        ? { ...l, enabled: true }
        : { ...l, enabled: false }
    );
    const adminScoped = layers.filter(
      (l) => l.groupId === 'grp-admin' || l.id === 'lyr-ap-roads-full' || l.id === 'lyr-highways'
    );
    const next = mergeEnabledLayersIntoRoutingNewConfig({}, adminScoped, null);
    expect(next['lyr-ap-roads-full']?.enabled).toBe(true);
    expect(next['lyr-ops-main-roads']).toBeUndefined();
  });

  it('keeps independent colours and visual-layer classification', () => {
    expect(isRoadsRoutingNewVisualLayer('lyr-ops-vsp-roads')).toBe(true);
    expect(isRoadsRoutingNewVisualLayer('lyr-pss')).toBe(false);
    expect(usesRoutingNewRadiusMatch('lyr-highways')).toBe(false);
    expect(usesRoutingNewRadiusMatch('lyr-forest-trails')).toBe(false);
    expect(usesRoutingNewRadiusMatch('lyr-ops-main-roads')).toBe(false);
    expect(usesRoutingNewRadiusMatch('lyr-ap-roads-full')).toBe(true);
    const districts = INITIAL_GIS_LAYERS.find((layer) => layer.id === 'lyr-districts')!;
    const checkposts = INITIAL_GIS_LAYERS.find((layer) => layer.id === 'lyr-checkposts')!;
    expect(isRoadsRoutingNewCatalogLayer(districts)).toBe(true);
    expect(isRoadsRoutingNewCatalogLayer(checkposts)).toBe(true);
    expect(colorForRoutingNewLayer('lyr-highways')).toMatch(/^#/);
    const rows = routingNewLayersFromConfig(INITIAL_GIS_LAYERS, {
      'lyr-highways': { enabled: false, opacity: 80 },
      'lyr-pss': { enabled: true, opacity: 100 },
      'lyr-districts': { enabled: true, opacity: 100 },
    });
    expect(rows.map((row) => row.id).sort()).toEqual(['lyr-districts', 'lyr-highways', 'lyr-pss']);
    expect(rows.find((row) => row.id === 'lyr-pss')?.enabled).toBe(true);
  });

  it('builds an A–B area of interest bbox with buffer', () => {
    const a = { lon: 83.0, lat: 18.5 };
    const b = { lon: 83.4, lat: 18.1 };
    const aoi = aoiBboxFromPoints(a, b, 25);
    expect(aoi.west).toBeLessThan(83.0);
    expect(aoi.east).toBeGreaterThan(83.4);
    expect(aoi.south).toBeLessThan(18.1);
    expect(aoi.north).toBeGreaterThan(18.5);
    expect(aoi.padDeg).toBeCloseTo(25 / 111, 3);
  });

  it('builds AOI from one or many POI points', () => {
    const one = aoiBboxFromPoiPoints([{ lon: 83.2, lat: 18.3 }], 25);
    expect(one.west).toBeLessThan(83.2);
    expect(one.east).toBeGreaterThan(83.2);
    const many = aoiBboxFromPoiPoints(
      [
        { lon: 83.0, lat: 18.5 },
        { lon: 83.4, lat: 18.1 },
        { lon: 82.8, lat: 18.2 },
      ],
      25
    );
    expect(many.west).toBeLessThan(82.8);
    expect(many.east).toBeGreaterThan(83.4);
    const mid = midViewForAoiPoints([{ lon: 83.2, lat: 18.3 }], 25);
    expect(mid.lat).toBeCloseTo(18.3, 5);
  });

  it('associates road features with POI buffers and dedupes overlaps', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'r1' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [83.2, 18.3],
              [83.21, 18.31],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { id: 'r1' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [83.2, 18.3],
              [83.21, 18.31],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { id: 'r2' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [80.0, 15.0],
              [80.01, 15.01],
            ],
          },
        },
      ],
    };
    const pois = [
      { id: 'p1', label: 'P1', lon: 83.2, lat: 18.3 },
      { id: 'p2', label: 'P2', lon: 83.205, lat: 18.305 },
    ];
    const result = associateFeaturesWithPois(fc, pois, 25);
    expect(result.count).toBe(1);
    expect(result.byPoi.p1).toBeGreaterThan(0);
    expect(result.sharedCount).toBeGreaterThanOrEqual(1);
    expect(dedupeRoadFeatures(fc.features)).toHaveLength(2);
  });

  it('keeps distinct segments that share a road name and clips them to the radius', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Route' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [82.3541, 16.0],
              [82.3541, 19.5],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { name: 'Route' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [81.8832, 17.5],
              [81.8832, 18.0],
            ],
          },
        },
      ],
    };
    const pois = [
      { id: 'a', label: 'A', lon: 81.8832, lat: 17.7484 },
      { id: 'b', label: 'B', lon: 82.3541, lat: 17.8649 },
    ];
    const result = associateFeaturesWithPois(fc, pois, 25);
    expect(result.count).toBe(2);
    expect(result.byPoi.a).toBe(1);
    expect(result.byPoi.b).toBe(1);
    expect(result.sharedCount).toBe(0);
    for (const feature of result.features) {
      const lines =
        feature.geometry.type === 'LineString'
          ? [feature.geometry.coordinates]
          : feature.geometry.type === 'MultiLineString'
            ? feature.geometry.coordinates
            : [];
      for (const line of lines) {
        for (const [lon, lat] of line) {
          const dA = Math.hypot((lon - 81.8832) * 105, (lat - 17.7484) * 110.6);
          const dB = Math.hypot((lon - 82.3541) * 105, (lat - 17.8649) * 110.6);
          expect(Math.min(dA, dB)).toBeLessThanOrEqual(26);
        }
      }
    }
  });

  it('counts every OPS main-road segment inside the radius of B', () => {
    const gj = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/geo/gis-source/ops/main_roads.geojson'), 'utf8')
    ) as GeoJSON.FeatureCollection;
    const result = associateFeaturesWithPois(
      gj,
      [{ id: 'b', label: 'B', lon: 82.3541, lat: 17.8649 }],
      25
    );
    expect(result.byPoi.b).toBeGreaterThanOrEqual(8);
  });

  it('draws national, state, and district roads as whole routes and drops village tracks', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { rd_sub_typ: 'Village Road' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [82.57, 18.18],
              [82.58, 18.19],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { rd_sub_typ: 'National Highway' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [82.57, 17.4],
              [82.57, 18.8],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { RD_SUB_TYP: 'State Highway' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [82.65, 17.9],
              [82.65, 18.4],
            ],
          },
        },
      ],
    };
    expect(routeStrokeForProperties(fc.features[0].properties)).toBeNull();
    expect(routeStrokeForProperties(fc.features[1].properties)?.color).toBe('#dc2626');
    expect(routeStrokeForProperties(fc.features[2].properties)?.color).toBe('#16a34a');
    const display = displayRoadsForLayer('lyr-ap-roads-full', fc);
    expect(display.clip).toBe(false);
    expect(display.fc.features).toHaveLength(2);
    const result = associateFeaturesWithPois(
      display.fc,
      [{ id: 'a', label: 'A', lon: 82.5749, lat: 18.1841 }],
      25,
      { clip: display.clip }
    );
    expect(result.count).toBe(2);
    const highway = result.features.find(
      (feature) => routeStrokeForProperties(feature.properties)?.color === '#dc2626'
    );
    expect(highway?.geometry.type).toBe('LineString');
    if (highway?.geometry.type === 'LineString') {
      expect(highway.geometry.coordinates[0][1]).toBeCloseTo(17.4, 4);
      expect(highway.geometry.coordinates[1][1]).toBeCloseTo(18.8, 4);
    }
  });
});
