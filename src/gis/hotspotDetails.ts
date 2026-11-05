/**
 * Hot Spot Details hover card — compact fixed layout + field mapping.
 *
 * Popup dimensions (consistent for every hotspot):
 * - Card width: 196px
 * - Title: 11px / padding 5px 7px 2px
 * - Table cells: 9.5px / padding 1px 4px
 * - Photo: 168×105 (object-fit: cover, no distortion)
 *
 * Fields shown (in order):
 * Sl.No, Hotspot Name, Hotspot Type, Near Land Mark,
 * Panchayat/Municipality/Ward, PS Limits, Mandal, District, City, State,
 * Eagle Cell identified HS, Latitude, Longitude
 */

import { findContainingFeature } from './mapDetail';
import type { LonLat } from './adminHierarchy';
import { pointInFeature } from './adminHierarchy';

export const HOTSPOT_POPUP = {
  widthPx: 196,
  photoWidthPx: 168,
  photoHeightPx: 105,
  imageSrc: '/geo/gis-source/ops/hotspot-reference.png',
} as const;

export type HotspotDetails = {
  title: string;
  slNo: string;
  hotspotName: string;
  hotspotType: string;
  nearLandMark: string;
  panchayat: string;
  psLimits: string;
  mandal: string;
  district: string;
  city: string;
  state: string;
  eagleCell: string;
  latitude: string;
  longitude: string;
};

/** Spatial admin context resolved from the hotspot point. */
export type HotspotAdminContext = {
  district?: string;
  mandal?: string;
  village?: string;
  /** True when the point falls inside the AP state polygon. */
  inAndhraPradesh?: boolean;
};

const DISPLAY = (v: string) => {
  const s = v.trim();
  if (!s || s === '0' || s.toLowerCase() === 'null') return '—';
  return s;
};

const UNDERLINE_KEYS = new Set<keyof HotspotDetails>([
  'panchayat',
  'psLimits',
  'mandal',
  'district',
  'state',
]);

const TYPE_ONLY_NAMES = new Set(
  ['consumer', 'cultivation', 'selling', 'transport', 'hotspot'].map((s) => s)
);

function clean(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/<[^>]+>/g, '').trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseDescriptionTable(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<tr>\s*<td>\s*<strong>(.*?)<\/strong>\s*<\/td>\s*<td>(.*?)<\/td>\s*<\/tr>/gis;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const key = clean(m[1]);
    const val = clean(m[2]);
    if (key) out[key] = val;
  }
  return out;
}

function splitNameType(raw: string): { name: string; type: string } {
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { name: m[1].trim(), type: m[2].trim() };
  return { name: raw.trim(), type: '' };
}

function typeFromFolder(folder: string): string {
  const parts = folder.split('/').map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

export function coordsFromFeature(feature: GeoJSON.Feature): LonLat | null {
  const g = feature.geometry;
  if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) return null;
  const [lon, lat] = g.coordinates;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
}

/** Resolve district / mandal / village / state from live admin polygons at the point. */
export function resolveHotspotAdminContext(
  point: LonLat,
  districts: GeoJSON.Feature[],
  mandals: GeoJSON.Feature[],
  villages: GeoJSON.Feature[] = [],
  stateFeature?: GeoJSON.Feature | null
): HotspotAdminContext {
  const districtFt = findContainingFeature(point, districts);
  const mandalFt = findContainingFeature(point, mandals);
  const villageFt = villages.length ? findContainingFeature(point, villages) : null;
  const districtProps = (districtFt?.properties ?? {}) as { district_name?: string };
  const mandalProps = (mandalFt?.properties ?? {}) as {
    mandal_name?: string;
    district_name?: string;
  };
  const villageProps = (villageFt?.properties ?? {}) as {
    village_name?: string;
    mandal_name?: string;
    district_name?: string;
  };

  const inAp = stateFeature
    ? pointInFeature(point, stateFeature)
    : Boolean(districtFt || mandalFt);

  return {
    district:
      clean(districtProps.district_name) ||
      clean(mandalProps.district_name) ||
      clean(villageProps.district_name) ||
      undefined,
    mandal: clean(mandalProps.mandal_name) || clean(villageProps.mandal_name) || undefined,
    village: clean(villageProps.village_name) || undefined,
    inAndhraPradesh: inAp,
  };
}

function pickAttr(
  fromDesc: Record<string, string>,
  descKey: string,
  ...propVals: string[]
): string {
  return clean(fromDesc[descKey]) || propVals.map(clean).find(Boolean) || '';
}

export type HotspotDetailsOptions = {
  /** 1-based serial used when the source has no Sl.No */
  serial?: number;
  admin?: HotspotAdminContext | null;
};

/** Build structured hotspot details from feature attributes + optional spatial admin. */
export function hotspotDetailsFromFeature(
  feature: GeoJSON.Feature,
  options: HotspotDetailsOptions = {}
): HotspotDetails {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const rawDesc = props.description != null ? String(props.description) : '';
  const fromDesc = rawDesc ? parseDescriptionTable(rawDesc) : {};
  const coords = coordsFromFeature(feature);
  const admin = options.admin ?? null;

  const rawName = clean(props.name) || clean(props.Name_of_the_Hotspot) || 'Hotspot';
  const split = splitNameType(rawName);
  const folderType = typeFromFolder(clean(props.folder));

  const hotspotTypeRaw =
    pickAttr(fromDesc, 'Hotspot Type', clean(props.Type_of_Hotspot), split.type, folderType) ||
    'Hotspot';

  let hotspotNameRaw = pickAttr(
    fromDesc,
    'Hotspot Name',
    clean(props.Name_of_the_Hotspot),
    split.name,
    rawName
  );
  // Most KMZ points are named only by type (“Consumer”); prefer village as the place name.
  if (
    (!hotspotNameRaw || TYPE_ONLY_NAMES.has(hotspotNameRaw.toLowerCase())) &&
    admin?.village
  ) {
    hotspotNameRaw = admin.village;
  }

  let nearLandMarkRaw = pickAttr(
    fromDesc,
    'Near Land Mark',
    clean(props.Near_landmark__Village)
  );
  if (!nearLandMarkRaw && admin?.village) nearLandMarkRaw = admin.village;

  // District / Mandal / State: prefer live spatial hierarchy for every point.
  const mandalRaw =
    admin?.mandal ||
    pickAttr(fromDesc, 'Mandal', clean(props.Mandal));
  const districtRaw =
    admin?.district ||
    pickAttr(fromDesc, 'District', clean(props._District));
  // State follows spatial containment when admin context is available.
  const stateRaw = admin
    ? admin.inAndhraPradesh
      ? 'AP'
      : pickAttr(fromDesc, 'State', clean(props.State_))
    : pickAttr(fromDesc, 'State', clean(props.State_));

  const latRaw =
    (coords ? String(Number(coords[1].toFixed(6))) : '') ||
    pickAttr(fromDesc, 'Latitude', clean(props.Latitude));
  const lonRaw =
    (coords ? String(Number(coords[0].toFixed(6))) : '') ||
    pickAttr(fromDesc, 'Longitude', clean(props.Longitudes_));

  const slFromSource = pickAttr(fromDesc, 'Sl.No', fromDesc['SLNo'], clean(props.Sl_No_));
  const slNo =
    slFromSource ||
    (options.serial != null && options.serial > 0 ? String(options.serial) : '');

  const hotspotName = DISPLAY(hotspotNameRaw);
  const hotspotType = DISPLAY(hotspotTypeRaw);
  const nameForTitle = hotspotName === '—' ? 'Hotspot' : hotspotName;
  const typeForTitle = hotspotType === '—' ? '' : hotspotType;
  const title =
    typeForTitle && typeForTitle.toLowerCase() !== nameForTitle.toLowerCase()
      ? `${nameForTitle} (${typeForTitle})`
      : nameForTitle;

  return {
    title,
    slNo: DISPLAY(slNo),
    hotspotName,
    hotspotType,
    nearLandMark: DISPLAY(nearLandMarkRaw),
    panchayat: DISPLAY(
      pickAttr(fromDesc, 'Panchayat/Municipality/Ward', clean(props.Panchayat_Municipality_Ward))
    ),
    psLimits: DISPLAY(pickAttr(fromDesc, 'PS Limits', clean(props._PS__Limits))),
    mandal: DISPLAY(mandalRaw),
    district: DISPLAY(districtRaw),
    city: DISPLAY(pickAttr(fromDesc, 'City', clean(props.City__Town))),
    state: DISPLAY(stateRaw),
    eagleCell: DISPLAY(
      pickAttr(fromDesc, 'Eagle Cell identified HS', clean(props.EAGLE_Cell_Identified))
    ),
    latitude: DISPLAY(latRaw),
    longitude: DISPLAY(lonRaw),
  };
}

function cellValue(key: keyof HotspotDetails, value: string): string {
  const escaped = escapeHtml(value);
  if (UNDERLINE_KEYS.has(key) && value !== '—') {
    return `<span class="ap-hotspot-card__u">${escaped}</span>`;
  }
  return escaped;
}

/** Leaflet / DOM-safe HTML for the Hot Spot Details hover card. */
export function hotspotDetailsHtml(details: HotspotDetails): string {
  const rows: Array<[string, keyof HotspotDetails]> = [
    ['Sl.No', 'slNo'],
    ['Hotspot Name', 'hotspotName'],
    ['Hotspot Type', 'hotspotType'],
    ['Near Land Mark', 'nearLandMark'],
    ['Panchayat/Municipality/Ward', 'panchayat'],
    ['PS Limits', 'psLimits'],
    ['Mandal', 'mandal'],
    ['District', 'district'],
    ['City', 'city'],
    ['State', 'state'],
    ['Eagle Cell identified HS', 'eagleCell'],
    ['Latitude', 'latitude'],
    ['Longitude', 'longitude'],
  ];

  const body = rows
    .map(
      ([label, key]) =>
        `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${cellValue(key, details[key])}</td></tr>`
    )
    .join('');

  const { widthPx, photoWidthPx, photoHeightPx, imageSrc } = HOTSPOT_POPUP;

  return `<div class="ap-hotspot-card" style="width:${widthPx}px">
  <div class="ap-hotspot-card__title">${escapeHtml(details.title)}</div>
  <table class="ap-hotspot-card__table" cellspacing="0" cellpadding="0">
    <thead><tr><th colspan="2">Hot Spot Details</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <div class="ap-hotspot-card__photo">
    <img src="${imageSrc}" alt="" width="${photoWidthPx}" height="${photoHeightPx}" decoding="async" />
  </div>
</div>`;
}
