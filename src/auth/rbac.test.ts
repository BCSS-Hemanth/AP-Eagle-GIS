import { describe, expect, it } from 'vitest';
import {
  authenticate,
  canAccessWorkspace,
  hasPermission,
  allowedWorkspaces,
} from './rbac.ts';

describe('authenticate', () => {
  it('accepts demo accounts', () => {
    expect(authenticate('admin', 'admin123')?.role).toBe('STATE_SPATIAL_ADMIN');
    expect(authenticate('eagle', 'eagle123')?.role).toBe('FIELD_COMMANDER_EAGLE');
    expect(authenticate('asr', 'asr123')?.role).toBe('DISTRICT_NODAL_ASR');
    expect(authenticate('viewer', 'viewer123')?.role).toBe('ANALYST_VIEWER');
  });

  it('rejects invalid credentials', () => {
    expect(authenticate('admin', 'wrong')).toBeNull();
    expect(authenticate('unknown', 'admin123')).toBeNull();
  });
});

describe('RBAC workspace matrix', () => {
  it('gives state admin every workspace', () => {
    expect(allowedWorkspaces('STATE_SPATIAL_ADMIN')).toContain('atlas');
    expect(canAccessWorkspace('STATE_SPATIAL_ADMIN', 'users-audit-trail')).toBe(true);
    expect(canAccessWorkspace('STATE_SPATIAL_ADMIN', 'administrative-layers')).toBe(true);
    expect(canAccessWorkspace('STATE_SPATIAL_ADMIN', 'atlas')).toBe(true);
  });

  it('hides write workspaces from analyst viewers', () => {
    expect(canAccessWorkspace('ANALYST_VIEWER', 'ndps-spatial-dashboard')).toBe(true);
    expect(canAccessWorkspace('ANALYST_VIEWER', 'atlas')).toBe(true);
    expect(canAccessWorkspace('ANALYST_VIEWER', 'mobile-locus-export')).toBe(false);
    expect(canAccessWorkspace('ANALYST_VIEWER', 'users-audit-trail')).toBe(false);
  });

  it('lets field commanders access ops maps but not user admin', () => {
    expect(canAccessWorkspace('FIELD_COMMANDER_EAGLE', 'operational-layers')).toBe(true);
    expect(canAccessWorkspace('FIELD_COMMANDER_EAGLE', 'users-audit-trail')).toBe(false);
  });
});

describe('RBAC action permissions', () => {
  it('enforces write vs view permissions', () => {
    expect(hasPermission('STATE_SPATIAL_ADMIN', 'digitize')).toBe(true);
    expect(hasPermission('FIELD_COMMANDER_EAGLE', 'digitize')).toBe(true);
    expect(hasPermission('FIELD_COMMANDER_EAGLE', 'import')).toBe(false);
    expect(hasPermission('DISTRICT_NODAL_ASR', 'export')).toBe(true);
    expect(hasPermission('DISTRICT_NODAL_ASR', 'geoprocess')).toBe(false);
    expect(hasPermission('ANALYST_VIEWER', 'export')).toBe(false);
    expect(hasPermission('ANALYST_VIEWER', 'digitize')).toBe(false);
  });
});
