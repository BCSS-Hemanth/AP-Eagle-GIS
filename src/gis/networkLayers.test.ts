import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INITIAL_GIS_LAYERS } from '../data/apGisData';
import { liveGisSources, QGIS_ALIGNED_SOURCES } from './gisSources';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

function lonLatFromGeometry(geometry: GeoJSON.Geometry): [number, number] {
  if (geometry.type === 'Point') return geometry.coordinates as [number, number];
  if (geometry.type === 'LineString') return geometry.coordinates[0] as [number, number];
  if (geometry.type === 'Polygon') return geometry.coordinates[0][0] as [number, number];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates[0][0][0] as [number, number];
  throw new Error(geometry.type);
}

describe('OSM / OSRM network overlays', () => {
  it('stores NH-16, NH-40, and NH-44 OSRM alignments', () => {
    const data = JSON.parse(readFileSync(resolve(root, 'public/geo/ap-highways.geojson'), 'utf8')) as GeoJSON.FeatureCollection;
    const names = data.features.map((f) => String(f.properties?.name ?? ''));
    expect(names).toEqual(['NH-16', 'NH-40', 'NH-44']);
    const nh16 = data.features.find((f) => f.properties?.name === 'NH-16');
    expect(nh16?.geometry.type).toBe('LineString');
    expect((nh16?.properties as { length_km?: number }).length_km).toBeGreaterThan(500);
  });

  it('stores OSM river centerlines for Godavari and Krishna', () => {
    const data = JSON.parse(readFileSync(resolve(root, 'public/geo/ap-rivers.geojson'), 'utf8')) as GeoJSON.FeatureCollection;
    expect(data.features.length).toBe(127);
    const names = new Set(data.features.map((f) => String(f.properties?.name ?? '')));
    expect(names.has('Godavari')).toBe(true);
    expect(names.has('Krishna')).toBe(true);
    const [lon, lat] = lonLatFromGeometry(data.features[0].geometry);
    expect(lon).toBeGreaterThan(76);
    expect(lat).toBeGreaterThan(12);
  });

  it('stores named OSM lakes and reservoirs including Srisailam and Pulicat', () => {
    const data = JSON.parse(
      readFileSync(resolve(root, 'public/geo/ap-waterbodies.geojson'), 'utf8')
    ) as GeoJSON.FeatureCollection;
    expect(data.features.length).toBe(353);
    const names = data.features.map((f) => String(f.properties?.name ?? '').toLowerCase());
    expect(names.some((n) => n.includes('srisailam'))).toBe(true);
    expect(names.some((n) => n.includes('pulicat'))).toBe(true);
    expect(names.some((n) => n.includes('nagarjuna'))).toBe(true);
    expect(names.some((n) => n.includes('somasila'))).toBe(true);
    for (const feature of data.features.slice(0, 40)) {
      const [lon, lat] = lonLatFromGeometry(feature.geometry);
      expect(lon).toBeGreaterThan(76.4);
      expect(lon).toBeLessThan(85.1);
      expect(lat).toBeGreaterThan(12.3);
      expect(lat).toBeLessThan(19.6);
      expect(['Polygon', 'MultiPolygon']).toContain(feature.geometry.type);
    }
  });
});

describe('layer catalog and QGIS-aligned sources', () => {
  it('lists rivers, water bodies, and hillshade against real files', () => {
    const byId = Object.fromEntries(INITIAL_GIS_LAYERS.map((layer) => [layer.id, layer]));
    expect(byId['lyr-rivers']?.featureCount).toBe(127);
    expect(byId['lyr-rivers']?.sourceTable).toBe('public/geo/ap-rivers.geojson');
    expect(byId['lyr-waterbodies']?.featureCount).toBe(353);
    expect(byId['lyr-highways']?.featureCount).toBe(3);
    expect(byId['lyr-hillshade']?.sourceTable).toMatch(/World_Hillshade/);
    expect(byId['lyr-cartosat']?.metaRight).toMatch(/not Cartosat-3/);
  });

  it('does not require API keys for live or local sources', () => {
    for (const source of liveGisSources()) {
      expect(source.apiKey).toBe(false);
      expect(source.cost).toBe('free');
    }
    expect(QGIS_ALIGNED_SOURCES.some((s) => s.id === 'esri-hillshade' && s.status === 'live')).toBe(true);
    expect(QGIS_ALIGNED_SOURCES.some((s) => s.id === 'bhuvan-cartosat' && s.status === 'not connected')).toBe(
      true
    );
  });
});
