import { WorkspaceId } from '../types/gis';
import { ALL_APP_WORKSPACES } from '../nav/appModules';

export type RoleId =
  | 'STATE_SPATIAL_ADMIN'
  | 'FIELD_COMMANDER_EAGLE'
  | 'DISTRICT_NODAL_ASR'
  | 'ANALYST_VIEWER';

export type Permission =
  | 'digitize'
  | 'import'
  | 'export'
  | 'geoprocess'
  | 'manageUsers'
  | 'viewAudit';

export interface GisUser {
  username: string;
  password: string;
  role: RoleId;
  displayName: string;
  unit: string;
}

export const GIS_USERS: GisUser[] = [
  {
    username: 'admin',
    password: 'admin123',
    role: 'STATE_SPATIAL_ADMIN',
    displayName: 'Administrator',
    unit: 'RBAC demo',
  },
  {
    username: 'eagle',
    password: 'eagle123',
    role: 'FIELD_COMMANDER_EAGLE',
    displayName: 'Eagle operator',
    unit: 'RBAC demo',
  },
  {
    username: 'asr',
    password: 'asr123',
    role: 'DISTRICT_NODAL_ASR',
    displayName: 'District operator',
    unit: 'RBAC demo',
  },
  {
    username: 'viewer',
    password: 'viewer123',
    role: 'ANALYST_VIEWER',
    displayName: 'Viewer',
    unit: 'RBAC demo',
  },
];

const ALL_WORKSPACES: WorkspaceId[] = [...ALL_APP_WORKSPACES];

const ROLE_WORKSPACES: Record<RoleId, WorkspaceId[]> = {
  STATE_SPATIAL_ADMIN: ALL_WORKSPACES,
  FIELD_COMMANDER_EAGLE: [
    'ndps-spatial-dashboard',
    'interactive-map',
    'feature-editor',
    'mobile-locus-export',
    'reports-seizure-analytics',
    'raster-imagery',
    'operational-layers',
    'road-network-layers',
    'roads-routing',
    'roads-routing-new',
  ],
  DISTRICT_NODAL_ASR: [
    'ndps-spatial-dashboard',
    'interactive-map',
    'administrative-layers',
    'operational-layers',
    'road-network-layers',
    'roads-routing',
    'roads-routing-new',
    'reports-seizure-analytics',
    'mobile-locus-export',
  ],
  ANALYST_VIEWER: ['ndps-spatial-dashboard', 'interactive-map', 'reports-seizure-analytics'],
};

const ROLE_PERMISSIONS: Record<RoleId, Permission[]> = {
  STATE_SPATIAL_ADMIN: [
    'digitize',
    'import',
    'export',
    'geoprocess',
    'manageUsers',
    'viewAudit',
  ],
  FIELD_COMMANDER_EAGLE: ['digitize', 'export', 'geoprocess'],
  DISTRICT_NODAL_ASR: ['export'],
  ANALYST_VIEWER: [],
};

export function authenticate(username: string, password: string): GisUser | null {
  const user = GIS_USERS.find(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password
  );
  return user ?? null;
}

export function canAccessWorkspace(role: RoleId, workspace: WorkspaceId): boolean {
  return ROLE_WORKSPACES[role].includes(workspace);
}

export function allowedWorkspaces(role: RoleId): WorkspaceId[] {
  return ROLE_WORKSPACES[role];
}

export function hasPermission(role: RoleId, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function defaultWorkspace(role: RoleId): WorkspaceId {
  return ROLE_WORKSPACES[role][0] ?? 'ndps-spatial-dashboard';
}
