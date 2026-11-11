/** Dummy NDPS Hotspot & Spatial Analytics payload (demo module). */

export type NdpsRiskLevel = 'High' | 'Medium' | 'Low';

export const NDPS_ANALYTICS_META = {
  title: 'EAGLE | NDPS Hotspot & Spatial Analytics',
  region: 'Andhra Pradesh',
  period: 'Last 12 Months',
} as const;

export const NDPS_OFFENDER_SUMMARY = {
  totalCases: 3412,
  activeMonitored: 1987,
  highRisk: 612,
  moderateRisk: 1052,
  lowRisk: 1748,
} as const;

/** Top districts — heat-intensity districts (Guntur, ASR, Srikakulam) rank above plain dots. */
export const NDPS_TOP_DISTRICTS: Array<{ rank: number; district: string; cases: number }> = [
  { rank: 1, district: 'Guntur', cases: 680 },
  { rank: 2, district: 'Alluri Sitharama Raju', cases: 640 },
  { rank: 3, district: 'Srikakulam', cases: 590 },
  { rank: 4, district: 'Visakhapatnam', cases: 450 },
  { rank: 5, district: 'East Godavari', cases: 400 },
];

/** Shared demo mugshot for Recent High Risk Offenders (NDPS Analytics). */
export const NDPS_OFFENDER_PHOTO_URL = '/ndps/offender-photo.png';

export const NDPS_RECENT_HIGH_RISK: Array<{
  id: string;
  name: string;
  alias: string;
  location: string;
  risk: 'HIGH';
  photoUrl: string;
}> = [
  {
    id: 'off-1',
    name: 'Ravi Kumar',
    alias: 'RK',
    location: 'Visakhapatnam Urban',
    risk: 'HIGH',
    photoUrl: NDPS_OFFENDER_PHOTO_URL,
  },
  {
    id: 'off-2',
    name: 'Suresh Naidu',
    alias: 'SN',
    location: 'Anakapalli Belt',
    risk: 'HIGH',
    photoUrl: NDPS_OFFENDER_PHOTO_URL,
  },
  {
    id: 'off-3',
    name: 'Praveen Reddy',
    alias: 'PR',
    location: 'Guntur Rural',
    risk: 'HIGH',
    photoUrl: NDPS_OFFENDER_PHOTO_URL,
  },
  {
    id: 'off-4',
    name: 'Mahesh Babu',
    alias: 'MB',
    location: 'ASR – Paderu',
    risk: 'HIGH',
    photoUrl: NDPS_OFFENDER_PHOTO_URL,
  },
];

export const NDPS_DISTRICT_STATS: Array<{
  district: string;
  cases: number;
  activeOffenders: number;
  highRisk: number;
  seizuresKg: number;
  arrests: number;
  hotspot: NdpsRiskLevel;
}> = [
  {
    district: 'Guntur',
    cases: 680,
    activeOffenders: 372,
    highRisk: 108,
    seizuresKg: 1265,
    arrests: 338,
    hotspot: 'High',
  },
  {
    district: 'Alluri Sitharama Raju',
    cases: 640,
    activeOffenders: 348,
    highRisk: 102,
    seizuresKg: 1520,
    arrests: 312,
    hotspot: 'High',
  },
  {
    district: 'Srikakulam',
    cases: 590,
    activeOffenders: 305,
    highRisk: 94,
    seizuresKg: 720,
    arrests: 278,
    hotspot: 'High',
  },
  {
    district: 'Visakhapatnam',
    cases: 450,
    activeOffenders: 248,
    highRisk: 68,
    seizuresKg: 980,
    arrests: 236,
    hotspot: 'Medium',
  },
  {
    district: 'East Godavari',
    cases: 400,
    activeOffenders: 220,
    highRisk: 58,
    seizuresKg: 845,
    arrests: 201,
    hotspot: 'Medium',
  },
  {
    district: 'Krishna',
    cases: 350,
    activeOffenders: 192,
    highRisk: 49,
    seizuresKg: 710,
    arrests: 174,
    hotspot: 'Medium',
  },
  {
    district: 'Vizianagaram',
    cases: 280,
    activeOffenders: 148,
    highRisk: 41,
    seizuresKg: 410,
    arrests: 133,
    hotspot: 'Low',
  },
];

export const NDPS_SPATIAL_INSIGHTS: Array<{ id: string; icon: string; text: string }> = [
  {
    id: 'i1',
    icon: 'target',
    text: 'High NDPS activity corridor Visakhapatnam – Vizianagaram – Srikakulam.',
  },
  {
    id: 'i2',
    icon: 'trend',
    text: 'Case density rose 18% YoY along the ASR Eastern Ghats belt.',
  },
  {
    id: 'i3',
    icon: 'warn',
    text: 'Seasonal spike expected in cultivation hotspots (Jun–Sep).',
  },
  {
    id: 'i4',
    icon: 'anchor',
    text: 'Coastal landing points near Vizag & Kakinada show elevated transport risk.',
  },
  {
    id: 'i5',
    icon: 'link',
    text: 'Guntur ↔ Vijayawada ↔ Visakhapatnam remains the dominant movement chain.',
  },
];

/** Simplified movement chain (lon, lat) for the mini map. */
export const NDPS_MOVEMENT_PATH: Array<{ name: string; lon: number; lat: number }> = [
  { name: 'Guntur', lon: 80.4365, lat: 16.3067 },
  { name: 'Vijayawada', lon: 80.648, lat: 16.5062 },
  { name: 'Visakhapatnam', lon: 83.2185, lat: 17.6868 },
];

/**
 * One heat-map point per district (centroids from ap-districts-2022).
 * Heat-glow districts (Guntur, ASR, Srikakulam) always carry higher case counts
 * than plain red-dot districts.
 */
export const NDPS_HEAT_POINTS: Array<{
  id: string;
  district: string;
  lon: number;
  lat: number;
  cases: number;
}> = [
  { id: 'h2', district: 'Guntur', lon: 80.4189, lat: 16.2313, cases: 680 },
  { id: 'h5', district: 'Alluri Sitharama Raju', lon: 82.3006, lat: 17.9075, cases: 640 },
  { id: 'h7', district: 'Srikakulam', lon: 84.0895, lat: 18.7027, cases: 590 },
  { id: 'h1', district: 'Visakhapatnam', lon: 83.3011, lat: 17.8518, cases: 450 },
  { id: 'h3', district: 'East Godavari', lon: 81.7509, lat: 17.0329, cases: 400 },
  { id: 'h4', district: 'Krishna', lon: 81.0028, lat: 16.4115, cases: 350 },
  { id: 'h6', district: 'Vizianagaram', lon: 83.4259, lat: 18.3332, cases: 280 },
];

export const NDPS_RISK_DISTRIBUTION = [
  {
    level: 'High Risk' as const,
    count: NDPS_OFFENDER_SUMMARY.highRisk,
    pct: 17.9,
    color: '#dc2626',
  },
  {
    level: 'Moderate Risk' as const,
    count: NDPS_OFFENDER_SUMMARY.moderateRisk,
    pct: 30.8,
    color: '#ea580c',
  },
  {
    level: 'Low Risk' as const,
    count: NDPS_OFFENDER_SUMMARY.lowRisk,
    pct: 51.3,
    color: '#16a34a',
  },
];
