import { describe, expect, it } from 'vitest';
import { ALL_APP_WORKSPACES, APP_NAV_SECTIONS } from './appModules';

describe('app module hierarchy', () => {
  it('defines four main modules with expected submodule counts', () => {
    expect(APP_NAV_SECTIONS.map((s) => s.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(APP_NAV_SECTIONS.find((s) => s.id === 'm1')?.items).toHaveLength(3);
    expect(APP_NAV_SECTIONS.find((s) => s.id === 'm2')?.items).toHaveLength(5);
    expect(APP_NAV_SECTIONS.find((s) => s.id === 'm3')?.items).toHaveLength(3);
    expect(APP_NAV_SECTIONS.find((s) => s.id === 'm4')?.items).toHaveLength(1);
  });

  it('exposes unique workspace ids covering DOCX-aligned catalogs', () => {
    expect(new Set(ALL_APP_WORKSPACES).size).toBe(ALL_APP_WORKSPACES.length);
    for (const id of [
      'ndps-spatial-dashboard',
      'ndps-analytics',
      'reports-seizure-analytics',
      'administrative-layers',
      'operational-layers',
      'road-network-layers',
      'roads-routing',
      'roads-routing-new',
      'atlas',
      'mobile-locus-export',
      'raster-imagery',
      'users-audit-trail',
    ]) {
      expect(ALL_APP_WORKSPACES).toContain(id);
    }
    const m1Ids = APP_NAV_SECTIONS.find((s) => s.id === 'm1')?.items.map((i) => i.id) ?? [];
    expect(m1Ids.indexOf('ndps-analytics')).toBeLessThan(
      m1Ids.indexOf('reports-seizure-analytics')
    );
    const m3Ids = APP_NAV_SECTIONS.find((s) => s.id === 'm3')?.items.map((i) => i.id) ?? [];
    expect(m3Ids.indexOf('mobile-locus-export')).toBeLessThan(m3Ids.indexOf('raster-imagery'));
    expect(ALL_APP_WORKSPACES).not.toContain('interactive-map');
    expect(ALL_APP_WORKSPACES).not.toContain('import-export');
    expect(ALL_APP_WORKSPACES).not.toContain('feature-editor');
    expect(ALL_APP_WORKSPACES).not.toContain('map-export');
    expect(ALL_APP_WORKSPACES).not.toContain('source-capability-register');
    expect(ALL_APP_WORKSPACES).not.toContain('data-quality');
  });
});
