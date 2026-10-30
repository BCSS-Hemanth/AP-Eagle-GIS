import { useEffect, useState } from 'react';
import { InspectableFeature, PoliceStationRow } from '../types/gis';

export interface PoliceStationProperties {
  id: string;
  name: string;
  district: string;
  state: string;
  group: string;
  station_type: string;
  map_no: string;
  sector: string;
  sl_no: string;
}

let cached: GeoJSON.FeatureCollection | null = null;
let pending: Promise<GeoJSON.FeatureCollection> | null = null;

async function loadStations(): Promise<GeoJSON.FeatureCollection> {
  if (cached) return cached;
  if (!pending) {
    pending = fetch('/geo/ap-police-stations.geojson').then(async (res) => {
      if (!res.ok) throw new Error('Failed to load police stations');
      cached = (await res.json()) as GeoJSON.FeatureCollection;
      return cached;
    });
  }
  return pending;
}

export function usePoliceStations(enabled: boolean) {
  const [stations, setStations] = useState<GeoJSON.FeatureCollection | null>(cached);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadStations().then((data) => {
      if (!cancelled) setStations(data);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return stations;
}

export function normalizePsName(value: string): string {
  return value
    .toLowerCase()
    .replace(/police\s*station/g, ' ')
    .replace(/\b(ps|out\s*post|agency|valley|town|urban|city|command)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

export function namesMatch(a: string, b: string): boolean {
  const left = normalizePsName(a);
  const right = normalizePsName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length >= 5 && longer.includes(shorter)) return true;
  return Math.abs(left.length - right.length) <= 1 && levenshtein(left, right) <= 1;
}

export function matchInspectableStation(
  row: PoliceStationRow,
  features: Record<string, InspectableFeature>
): InspectableFeature | null {
  const stations = Object.values(features).filter((f) => f.category === 'Police Station');
  return (
    stations.find(
      (f) =>
        namesMatch(row.name, f.name) ||
        namesMatch(row.name, f.shortLabel) ||
        namesMatch(row.name, f.id.replace(/^ps-/, ''))
    ) ?? null
  );
}

export function findLinkedStation(
  feature: InspectableFeature,
  rows: PoliceStationRow[]
): PoliceStationRow | null {
  if (feature.category !== 'Police Station') return null;
  return (
    rows.find(
      (row) =>
        namesMatch(row.name, feature.name) ||
        namesMatch(row.name, feature.shortLabel) ||
        namesMatch(row.name, feature.id.replace(/^ps-/, ''))
    ) ?? null
  );
}

export function stationToInspectable(
  row: PoliceStationRow,
  linked?: InspectableFeature | null
): InspectableFeature {
  const geometryLabel = `Point (${row.lat.toFixed(4)}° N, ${row.lon.toFixed(4)}° E)`;
  if (linked?.category === 'Police Station') {
    return {
      ...linked,
      id: row.id,
      name: row.name,
      shortLabel: row.name.toUpperCase(),
      lat: row.lat,
      lon: row.lon,
      geometryLabel,
      district: row.district !== 'Unspecified' ? row.district : linked.district,
      jurisdictionPs: row.circle || linked.jurisdictionPs,
      soiGrid: row.contact.startsWith('SOI') ? row.contact : linked.soiGrid,
    };
  }
  return {
    id: row.id,
    code: row.psCode,
    name: row.name,
    shortLabel: row.name.toUpperCase(),
    category: 'Police Station',
    statusBadge: `${row.stationType.toUpperCase()} / KMZ`,
    liveIndicator: row.circle || 'KMZ POINT',
    severity: 'operational',
    geometryLabel,
    lat: row.lat,
    lon: row.lon,
    elevationM: 0,
    soiGrid: row.contact !== '—' ? row.contact : '—',
    svgX: 0,
    svgY: 0,
    district: row.district,
    jurisdictionPs: row.circle,
    roadClassification: row.stationType,
    manningDetail: 'Source: Police Stations.kmz point location',
    sensorId: '—',
    seizuresSummary: 'Not present in KMZ',
    lastInspection: '—',
    inspectingOfficer: '—',
    nearestPsName: '—',
    nearestPsDistanceKm: 0,
    nearestPsSvgX: 0,
    nearestPsSvgY: 0,
    camLabel: row.name,
    camSublabel: [row.district, row.circle].filter(Boolean).join(' • ') || 'KMZ',
    camTag: 'KMZ',
    sceneTheme: 'ghat-checkpost',
    cases: [],
  };
}

export function policeStationsToRows(
  collection: GeoJSON.FeatureCollection | null
): PoliceStationRow[] {
  if (!collection) return [];
  return collection.features.flatMap((feature, idx) => {
    if (!feature.geometry || feature.geometry.type !== 'Point') return [];
    const [lon, lat] = feature.geometry.coordinates;
    const props = (feature.properties ?? {}) as Partial<PoliceStationProperties>;
    const id = props.id || String(feature.id || `ps-${idx + 1}`);
    return [
      {
        id,
        psCode: props.map_no || props.sl_no || id.toUpperCase(),
        name: props.name || id,
        district: props.district || 'Unspecified',
        circle: [props.state, props.sector || props.group].filter(Boolean).join(' / ') || '—',
        contact: props.map_no ? `SOI ${props.map_no}` : '—',
        stationType: props.station_type || 'Border PS',
        lat,
        lon,
        svgX: 0,
        svgY: 0,
        featureId: id,
      },
    ];
  });
}
