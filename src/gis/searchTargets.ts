import { InspectableFeature, PoliceStationRow } from '../types/gis';
import { MAJOR_CITIES } from '../data/apGeo';
import {
  findLinkedStation,
  matchInspectableStation,
  stationToInspectable,
} from './usePoliceStations';

export function placeToInspectable(args: {
  id: string;
  kind: 'District' | 'Mandal' | 'Village';
  name: string;
  lat: number;
  lon: number;
  district?: string;
  parent?: string;
}): InspectableFeature {
  const district = args.district || (args.kind === 'District' ? args.name : '—');
  return {
    id: args.id,
    code: args.id.toUpperCase(),
    name: args.name,
    shortLabel: args.name.toUpperCase(),
    category: args.kind,
    statusBadge: `${args.kind.toUpperCase()} / ADMIN POLYGON`,
    liveIndicator: args.parent || args.kind.toUpperCase(),
    severity: 'intel',
    geometryLabel: `Polygon click (${args.lat.toFixed(4)}° N, ${args.lon.toFixed(4)}° E)`,
    lat: args.lat,
    lon: args.lon,
    elevationM: 0,
    soiGrid: '—',
    svgX: 0,
    svgY: 0,
    district,
    jurisdictionPs: args.parent || '—',
    roadClassification: args.kind === 'District' ? 'District boundary' : `${args.kind} polygon`,
    manningDetail: 'SOI/NWIC administrative geometry',
    sensorId: '—',
    seizuresSummary: 'No operational record on this admin unit',
    lastInspection: '—',
    inspectingOfficer: '—',
    nearestPsName: '—',
    nearestPsDistanceKm: 0,
    nearestPsSvgX: 0,
    nearestPsSvgY: 0,
    camLabel: args.name,
    camSublabel: [args.kind, district, args.parent].filter(Boolean).join(' • '),
    camTag: args.kind.toUpperCase(),
    sceneTheme: 'valley-polygon',
    cases: [],
  };
}

export function osmFeatureToInspectable(args: {
  name: string;
  kind: 'OSM Building' | 'Highway' | 'River';
  lat: number;
  lon: number;
  detail: string;
  heightM?: number;
}): InspectableFeature {
  return {
    id: `${args.kind}:${args.lat.toFixed(5)},${args.lon.toFixed(5)}`,
    code: args.kind.toUpperCase(),
    name: args.name,
    shortLabel: args.name.toUpperCase(),
    category: args.kind,
    statusBadge: `${args.kind.toUpperCase()} / MAP FEATURE`,
    liveIndicator: args.kind.toUpperCase(),
    severity: 'intel',
    geometryLabel: args.detail || `${args.lat.toFixed(4)}° N, ${args.lon.toFixed(4)}° E`,
    lat: args.lat,
    lon: args.lon,
    elevationM: args.heightM ?? 0,
    soiGrid: '—',
    svgX: 0,
    svgY: 0,
    district: '—',
    jurisdictionPs: '—',
    roadClassification: args.detail,
    manningDetail: args.kind === 'OSM Building' ? 'OSM footprint with recorded height' : 'Loaded GIS geometry',
    sensorId: '—',
    seizuresSummary: 'No operational record on this map feature',
    lastInspection: '—',
    inspectingOfficer: '—',
    nearestPsName: '—',
    nearestPsDistanceKm: 0,
    nearestPsSvgX: 0,
    nearestPsSvgY: 0,
    camLabel: args.name,
    camSublabel: args.detail,
    camTag: args.kind.toUpperCase(),
    sceneTheme: args.kind === 'Highway' ? 'highway-plaza' : 'valley-polygon',
    cases: [],
  };
}

export function featureToStationRow(feature: InspectableFeature): PoliceStationRow {
  return {
    id: feature.id,
    psCode: feature.code,
    name: feature.name,
    district: feature.district,
    circle: feature.jurisdictionPs,
    contact: feature.sensorId,
    stationType: feature.category,
    lat: feature.lat,
    lon: feature.lon,
    svgX: 0,
    svgY: 0,
    featureId: feature.id,
  };
}

export function buildSearchTargets(
  inspectable: Record<string, InspectableFeature>,
  kmzRows: PoliceStationRow[]
): InspectableFeature[] {
  const kmzFeatures = kmzRows.map((row) =>
    stationToInspectable(row, matchInspectableStation(row, inspectable))
  );
  const linkedIds = new Set(
    kmzRows
      .map((row) => matchInspectableStation(row, inspectable)?.id)
      .filter((id): id is string => Boolean(id))
  );
  const rest = Object.values(inspectable).filter((feature) => !linkedIds.has(feature.id));
  const cities = MAJOR_CITIES.map((city) =>
    placeToInspectable({
      id: `city:${city.name}`,
      kind: 'District',
      name: city.name,
      lat: city.lat,
      lon: city.lon,
      district: city.name,
      parent: city.kind.toUpperCase(),
    })
  );
  return [...kmzFeatures, ...rest, ...cities];
}

export function resolveFlyTarget(
  featureId: string,
  inspectable: Record<string, InspectableFeature>,
  kmzRows: PoliceStationRow[],
  searchTargets: InspectableFeature[]
): { feature: InspectableFeature; stationId: string | null } | null {
  const station = kmzRows.find((row) => row.id === featureId);
  if (station) {
    return {
      feature: stationToInspectable(station, matchInspectableStation(station, inspectable)),
      stationId: station.id,
    };
  }
  const inspectFeat = inspectable[featureId];
  if (inspectFeat) {
    const linked = findLinkedStation(inspectFeat, kmzRows);
    return {
      feature: linked
        ? stationToInspectable(linked, inspectFeat)
        : inspectFeat,
      stationId: linked?.id ?? null,
    };
  }
  const searchFeat = searchTargets.find((feature) => feature.id === featureId);
  if (!searchFeat) return null;
  return { feature: searchFeat, stationId: null };
}
