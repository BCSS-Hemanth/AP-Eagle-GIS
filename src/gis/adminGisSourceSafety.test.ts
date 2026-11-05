import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADMIN_GIS_SOURCE_SAFETY, assertAdminReplaceAllowed } from './adminGisSourceSafety';
import { INITIAL_GIS_LAYERS } from '../data/apGisData';
import { GIS_SOURCE_ADMIN_LAYERS } from './gisSourceCatalog';

describe('Admin GIS-Source safety gates', () => {
  it('blocks replacing primary district drill and India overview with undivided source', () => {
    expect(ADMIN_GIS_SOURCE_SAFETY.primaryDistrictDrill.replaceAllowed).toBe(false);
    expect(ADMIN_GIS_SOURCE_SAFETY.primaryStateBorder.replaceAllowed).toBe(false);
    expect(ADMIN_GIS_SOURCE_SAFETY.indiaOverview.replaceAllowed).toBe(false);
    expect(ADMIN_GIS_SOURCE_SAFETY.fullApRoads.replaceAllowed).toBe(false);
    expect(() => assertAdminReplaceAllowed('primaryDistrictDrill')).toThrow(/blocked/i);
  });

  it('keeps useApBoundaries on 2022 districts / post-2014 state files', () => {
    const root = resolve(process.cwd(), 'public/geo');
    expect(existsSync(resolve(root, 'ap-districts-2022.geojson'))).toBe(true);
    expect(existsSync(resolve(root, 'ap-state.geojson'))).toBe(true);
    const districts = JSON.parse(
      readFileSync(resolve(root, 'ap-districts-2022.geojson'), 'utf8')
    );
    expect(districts.features.length).toBe(26);
    const drill = INITIAL_GIS_LAYERS.find((l) => l.id === 'lyr-districts');
    expect(drill?.sourceTable).toContain('ap-districts-2022');
    expect(drill?.sourceTable).not.toContain('gis-source/admin');
  });

  it('exposes GIS-Source undivided products as overlay-only legend rows', () => {
    const byId = Object.fromEntries(INITIAL_GIS_LAYERS.map((l) => [l.id, l]));
    expect(byId['lyr-districts-gis-hist']?.sourceTable).toContain('ap_districts_gis_source');
    expect(byId['lyr-districts-gis-hist']?.featureCount).toBe(25);
    expect(byId['lyr-state-gis-hist']?.sourceTable).toContain('ap_state_gis_source');
    expect(byId['lyr-soi-grid']?.geometryType).toBe('Point');
    const disk = resolve(
      process.cwd(),
      'public',
      GIS_SOURCE_ADMIN_LAYERS.soi50k.replace(/^\//, '')
    );
    const soi = JSON.parse(readFileSync(disk, 'utf8'));
    expect(soi.features[0]?.geometry?.type).toBe('Point');
  });
});
