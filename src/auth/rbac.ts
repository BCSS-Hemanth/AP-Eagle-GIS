import { WorkspaceId } from '../types/gis';

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
  | 'fixTopology'
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

const ALL_WORKSPACES: WorkspaceId[] = [
  'gis-dashboard',
  'interactive-map-viewer',
  'spatial-analysis-and-geoprocessing',
  'map-designer-and-layout-composer',
  'administrative-and-operational-layers',
  'vector-and-raster-data-import',
  'feature-editor-and-digitizer',
  'raster-management-and-toposheets',
  'mobile-gis-export',
  'atlas-map-book-generator',
  'reports-and-seizure-analytics',
  'data-quality-and-topology-audits',
  'conditional-capabilities-and-dependency-register',
  'user-roles-and-audit-trail',
];

const ROLE_WORKSPACES: Record<RoleId, WorkspaceId[]> = {
  STATE_SPATIAL_ADMIN: ALL_WORKSPACES,
  FIELD_COMMANDER_EAGLE: [
    'gis-dashboard',
    'interactive-map-viewer',
    'spatial-analysis-and-geoprocessing',
    'feature-editor-and-digitizer',
    'mobile-gis-export',
    'reports-and-seizure-analytics',
    'raster-management-and-toposheets',
  ],
  DISTRICT_NODAL_ASR: [
    'gis-dashboard',
    'interactive-map-viewer',
    'administrative-and-operational-layers',
    'reports-and-seizure-analytics',
    'mobile-gis-export',
  ],
  ANALYST_VIEWER: ['gis-dashboard', 'interactive-map-viewer', 'reports-and-seizure-analytics'],
};

const ROLE_PERMISSIONS: Record<RoleId, Permission[]> = {
  STATE_SPATIAL_ADMIN: [
    'digitize',
    'import',
    'export',
    'geoprocess',
    'fixTopology',
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
  return ROLE_WORKSPACES[role][0] ?? 'gis-dashboard';
}
