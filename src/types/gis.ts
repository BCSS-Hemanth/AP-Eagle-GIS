export type WorkspaceId =
  | 'gis-dashboard'
  | 'interactive-map-viewer'
  | 'spatial-analysis-and-geoprocessing'
  | 'map-designer-and-layout-composer'
  | 'administrative-and-operational-layers'
  | 'vector-and-raster-data-import'
  | 'feature-editor-and-digitizer'
  | 'raster-management-and-toposheets'
  | 'mobile-gis-export'
  | 'atlas-map-book-generator'
  | 'reports-and-seizure-analytics'
  | 'data-quality-and-topology-audits'
  | 'conditional-capabilities-and-dependency-register'
  | 'user-roles-and-audit-trail';

export type RasterBasemapId = 'vector' | 'topo' | 'satellite' | 'hybrid';
export type BasemapId = RasterBasemapId | 'maplibre';
export type MapViewMode = '2d' | '3d';

export type CrsId = 'EPSG:4326' | 'EPSG:32644' | 'EPSG:3857' | 'EPSG:7755';

export type MapToolId =
  | 'pan'
  | 'boxzoom'
  | 'dist'
  | 'area'
  | 'inspect'
  | 'buffer'
  | 'coord';

export type AttributeTableMode = 'pss' | 'checkposts' | 'hotspots' | 'seizures';

export interface GisLayer {
  id: string;
  groupId: 'grp-admin' | 'grp-ops' | 'grp-transport' | 'grp-raster';
  name: string;
  codeName: string;
  enabled: boolean;
  opacity: number;
  swatchType:
    | 'line-navy'
    | 'poly-navy'
    | 'poly-slate'
    | 'poly-dotted'
    | 'point-ps'
    | 'pulse-red'
    | 'line-dashed-red'
    | 'icon-shield'
    | 'poly-indigo'
    | 'poly-agency'
    | 'icon-factory'
    | 'line-highway'
    | 'line-trail'
    | 'line-rail'
    | 'grid-topo'
    | 'satellite-raster';
  metaRight: string;
  geometryType: 'Polygon' | 'MultiPolygon' | 'LineString' | 'Point' | 'RasterGrid';
  featureCount: number;
  crs: string;
  sourceTable: string;
  highlightTone?: 'secondary' | 'error' | 'tertiary' | 'primary';
}

export interface CaseFileRecord {
  firNumber: string;
  date: string;
  contrabandType: string;
  quantityKg: number;
  vehicleReg: string;
  status: 'Charge Sheeted' | 'Under Investigation' | 'Interception Seized';
  leadOfficer: string;
  corridor: string;
}

export interface InspectableFeature {
  id: string;
  code: string;
  name: string;
  shortLabel: string;
  category:
    | 'Check Post'
    | 'Police Station'
    | 'Contraband Hotspot'
    | 'Transit Corridor'
    | 'Seizure Polygon'
    | 'District'
    | 'Mandal'
    | 'Village'
    | 'OSM Building'
    | 'Highway'
    | 'River';
  statusBadge: string;
  liveIndicator: string;
  severity: 'operational' | 'critical' | 'warning' | 'intel';
  geometryLabel: string;
  lat: number;
  lon: number;
  elevationM: number;
  soiGrid: string;
  svgX: number;
  svgY: number;
  district: string;
  jurisdictionPs: string;
  roadClassification: string;
  manningDetail: string;
  sensorId: string;
  seizuresSummary: string;
  lastInspection: string;
  inspectingOfficer: string;
  nearestPsName: string;
  nearestPsDistanceKm: number;
  nearestPsSvgX: number;
  nearestPsSvgY: number;
  camLabel: string;
  camSublabel: string;
  camTag: string;
  imageUrl?: string;
  sceneTheme: 'ghat-checkpost' | 'forest-hotspot' | 'urban-hq' | 'highway-plaza' | 'valley-polygon';
  cases: CaseFileRecord[];
}

export interface PoliceStationRow {
  id: string;
  psCode: string;
  name: string;
  district: string;
  circle: string;
  contact: string;
  stationType: string;
  lat: number;
  lon: number;
  svgX: number;
  svgY: number;
  featureId: string;
}

export interface GisJob {
  id: string;
  title: string;
  algorithm: string;
  progress: number;
  status: 'Running' | 'Completed' | 'Queued';
  startedAt: string;
  targetLayer: string;
  outputFeatures?: number;
}

export interface TacticalAlert {
  id: string;
  timestamp: string;
  severity: 'CRITICAL' | 'HIGH' | 'ADVISORY';
  title: string;
  location: string;
  featureId: string;
  acknowledged: boolean;
}

export interface DigitizedFeature {
  id: string;
  name: string;
  type: 'Point' | 'LineString' | 'Polygon';
  category: 'Tactical Check Post' | 'Patrol Corridor' | 'Containment Cordon';
  points: Array<{ lat: number; lon: number }>;
  createdAt: string;
  officer: string;
  notes: string;
}

export interface TopologyAuditRule {
  id: string;
  ruleName: string;
  layerName: string;
  checkedFeatures: number;
  violations: number;
  severity: 'Pass' | 'Warning' | 'Critical';
  description: string;
  fixed?: boolean;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  ipNode: string;
  action: string;
  resource: string;
  signatureHash: string;
}
