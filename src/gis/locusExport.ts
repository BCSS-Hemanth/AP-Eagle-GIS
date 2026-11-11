/**
 * Shared Locus KML/KMZ export engine.
 * Consumes existing GisLayer catalog + GeoJSON; produces real geometries (not stubs).
 */
import JSZip from 'jszip';
import type { GisLayer } from '../types/gis';
import { INITIAL_GIS_LAYERS } from '../data/apGisData';
import { featureBbox, filterCollectionToParent } from './adminHierarchy';
import { classifyEntryExit } from './entryExitPoint';
import { OPS_INTERNAL_ROADS_COLOR } from './opsRoadStyles';
import { downloadBlob } from '../utils/geoMath';
import type { LocusExportScope, LocusInventoryLayer, LocusLayerCategory } from './locus/locusTypes';
import { LOCUS_CATEGORY_LABEL } from './locus/locusTypes';

export function locusLayerFetchUrl(sourceTable: string): string | null {
  const t = sourceTable.trim();
  if (!t || t.endsWith('/')) return null;
  if (/\.(tif|tiff|png|jpg|jpeg|mbtiles|gpkg)$/i.test(t)) return null;
  if (t.startsWith('public/')) return `/${t.slice('public/'.length)}`;
  if (t.startsWith('/')) return t;
  return null;
}

export function isLocusExportableLayer(layer: GisLayer): boolean {
  if (layer.geometryType === 'RasterGrid') return false;
  if (layer.id === 'lyr-villages') return true;
  return Boolean(locusLayerFetchUrl(layer.sourceTable));
}

export function locusExportableLayers(layers: GisLayer[]): GisLayer[] {
  return layers.filter(isLocusExportableLayer);
}

export function defaultLocusSelection(layers: GisLayer[]): string[] {
  return locusExportableLayers(layers)
    .filter((l) => l.enabled)
    .map((l) => l.id);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** CSS #RRGGBB (or rgb) → KML aabbggrr. */
export function cssHexToKmlColor(hex: string, alpha = 0xff): string {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || !/^[0-9a-fA-F]+$/.test(h)) return 'ff0000ff';
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  const a = Math.max(0, Math.min(255, alpha)).toString(16).padStart(2, '0');
  return `${a}${b}${g}${r}`.toLowerCase();
}

type LayerStyle = {
  lineColor: string;
  lineWidth: number;
  polyFill: string;
  polyOutline: string;
  pointColor: string;
  iconHref?: string;
};

const LAYER_STYLES: Record<string, Partial<LayerStyle>> = {
  'lyr-districts': { lineColor: '#0f2942', lineWidth: 2.5, polyFill: '00000000', polyOutline: '#0f2942' },
  'lyr-mandals': { lineColor: '#000000', lineWidth: 1.6, polyFill: '00000000', polyOutline: '#000000' },
  'lyr-villages': { lineColor: '#000000', lineWidth: 1.0, polyFill: '00000000', polyOutline: '#000000' },
  'lyr-state-border': { lineColor: '#0b1c30', lineWidth: 2.2, polyFill: '00000000', polyOutline: '#0b1c30' },
  'lyr-pss': { pointColor: '#0b1c30', iconHref: 'files/icons/ps.png' },
  'lyr-border-ps': { pointColor: '#0f766e', iconHref: 'files/icons/ps.png' },
  'lyr-hotspots': { pointColor: '#ba1a1a' },
  'lyr-checkposts': { pointColor: '#0d9488', iconHref: 'files/icons/checkpost.png' },
  'lyr-entry-exit': { pointColor: '#0f766e', iconHref: 'files/icons/entry.png' },
  'lyr-stock-points': { pointColor: '#a16207' },
  'lyr-ddacs': { pointColor: '#7c2d12' },
  'lyr-seizure-polys': { pointColor: '#4338ca' },
  'lyr-toll-plazas': { pointColor: '#0f766e' },
  'lyr-drug-routes': { lineColor: '#b91c1c', lineWidth: 2.2 },
  'lyr-ops-internal-roads': { lineColor: OPS_INTERNAL_ROADS_COLOR, lineWidth: 1.6 },
  'lyr-ops-main-roads': { lineColor: '#1d4ed8', lineWidth: 2 },
  'lyr-forest-trails': { lineColor: '#15803d', lineWidth: 1.2 },
  'lyr-ap-roads-major': { lineColor: '#334155', lineWidth: 1.8 },
  'lyr-ap-roads-full': { lineColor: '#64748b', lineWidth: 1.1 },
  'lyr-ops-vsp-roads': { lineColor: '#475569', lineWidth: 1.1 },
  'lyr-rivers': { lineColor: '#0284c7', lineWidth: 1.8 },
  'lyr-waterbodies': { lineColor: '#0369a1', lineWidth: 1, polyFill: cssHexToKmlColor('#38bdf8', 0x66), polyOutline: '#0369a1' },
  'lyr-asr-agency': { lineColor: '#5b21b6', lineWidth: 2, polyFill: cssHexToKmlColor('#7c3aed', 0x40), polyOutline: '#5b21b6' },
};

function resolveStyle(layerId: string): LayerStyle {
  const s = LAYER_STYLES[layerId] ?? {};
  return {
    lineColor: s.lineColor ?? '#2563eb',
    lineWidth: s.lineWidth ?? 1.5,
    polyFill: s.polyFill ?? '00000000',
    polyOutline: s.polyOutline ?? s.lineColor ?? '#2563eb',
    pointColor: s.pointColor ?? '#e11d48',
    iconHref: s.iconHref,
  };
}

function coordPair(c: GeoJSON.Position): string {
  const lon = Number(c[0]);
  const lat = Number(c[1]);
  const alt = c.length > 2 ? Number(c[2]) : 0;
  return `${lon},${lat},${Number.isFinite(alt) ? alt : 0}`;
}

function ringToKml(ring: GeoJSON.Position[]): string {
  return ring.map(coordPair).join(' ');
}

function geometryToKml(geom: GeoJSON.Geometry): string {
  switch (geom.type) {
    case 'Point':
      return `<Point><coordinates>${coordPair(geom.coordinates)}</coordinates></Point>`;
    case 'MultiPoint':
      return `<MultiGeometry>${geom.coordinates
        .map((c) => `<Point><coordinates>${coordPair(c)}</coordinates></Point>`)
        .join('')}</MultiGeometry>`;
    case 'LineString':
      return `<LineString><tessellate>1</tessellate><coordinates>${ringToKml(geom.coordinates)}</coordinates></LineString>`;
    case 'MultiLineString':
      return `<MultiGeometry>${geom.coordinates
        .map(
          (line) =>
            `<LineString><tessellate>1</tessellate><coordinates>${ringToKml(line)}</coordinates></LineString>`
        )
        .join('')}</MultiGeometry>`;
    case 'Polygon': {
      const [outer, ...holes] = geom.coordinates;
      if (!outer) return '';
      const inners = holes
        .map((h) => `<innerBoundaryIs><LinearRing><coordinates>${ringToKml(h)}</coordinates></LinearRing></innerBoundaryIs>`)
        .join('');
      return `<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${ringToKml(outer)}</coordinates></LinearRing></outerBoundaryIs>${inners}</Polygon>`;
    }
    case 'MultiPolygon':
      return `<MultiGeometry>${geom.coordinates
        .map((poly) => geometryToKml({ type: 'Polygon', coordinates: poly }))
        .join('')}</MultiGeometry>`;
    case 'GeometryCollection':
      return `<MultiGeometry>${geom.geometries.map(geometryToKml).join('')}</MultiGeometry>`;
    default:
      return '';
  }
}

function featureLabel(props: Record<string, unknown> | null, fallback: string): string {
  if (!props) return fallback;
  for (const key of [
    'name',
    'Name',
    'NAME',
    'district_name',
    'mandal_name',
    'village_name',
    'hotspot_name',
    'Hotspot Name',
    'ps_name',
    'label',
  ]) {
    const v = props[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return fallback;
}

function extendedDataXml(props: Record<string, unknown> | null): string {
  if (!props) return '';
  const entries = Object.entries(props)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .slice(0, 24);
  if (!entries.length) return '';
  return `<ExtendedData>${entries
    .map(
      ([k, v]) =>
        `<Data name="${escapeXml(k)}"><value>${escapeXml(String(v))}</value></Data>`
    )
    .join('')}</ExtendedData>`;
}

function styleBlock(layerId: string, style: LayerStyle): string {
  const line = cssHexToKmlColor(style.lineColor, 0xff);
  const outline = cssHexToKmlColor(style.polyOutline, 0xff);
  const fill =
    style.polyFill.length === 8 ? style.polyFill : cssHexToKmlColor(style.polyFill, 0x55);
  const point = cssHexToKmlColor(style.pointColor, 0xff);
  const icon =
    style.iconHref != null
      ? `<IconStyle><scale>0.9</scale><Icon><href>${escapeXml(style.iconHref)}</href></Icon></IconStyle>`
      : `<IconStyle><color>${point}</color><scale>0.85</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon></IconStyle>`;
  return `<Style id="style-${escapeXml(layerId)}">
  ${icon}
  <LabelStyle><scale>0.8</scale></LabelStyle>
  <LineStyle><color>${line}</color><width>${style.lineWidth}</width></LineStyle>
  <PolyStyle><color>${fill}</color><outline>1</outline></PolyStyle>
</Style>`;
}

function placemarkXml(
  feature: GeoJSON.Feature,
  layerId: string,
  index: number,
  fallbackName: string
): string {
  if (!feature.geometry) return '';
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  let styleUrl = `#style-${layerId}`;
  if (layerId === 'lyr-entry-exit') {
    const kind = classifyEntryExit(props);
    styleUrl = kind === 'exit' ? '#style-lyr-entry-exit-exit' : '#style-lyr-entry-exit-entry';
  }
  const name = featureLabel(props, `${fallbackName} ${index + 1}`);
  const geom = geometryToKml(feature.geometry);
  if (!geom) return '';
  return `<Placemark>
  <name>${escapeXml(name)}</name>
  <styleUrl>${styleUrl}</styleUrl>
  ${extendedDataXml(props)}
  ${geom}
</Placemark>`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return (await res.json()) as T;
}

async function loadVillagesForDistrict(
  districtFeature: GeoJSON.Feature
): Promise<GeoJSON.FeatureCollection> {
  const bbox = featureBbox(districtFeature);
  if (!bbox) return { type: 'FeatureCollection', features: [] };
  const index = await fetchJson<{ districts: Array<{ file: string; bbox: number[] }> }>(
    '/geo/ap-villages-index.json'
  );
  const needed = index.districts.filter((d) => {
    const b = d.bbox;
    if (!b || b.length < 4) return false;
    return !(b[2] < bbox[0] || b[0] > bbox[2] || b[3] < bbox[1] || b[1] > bbox[3]);
  });
  const parts = await Promise.all(
    needed.map((d) => fetchJson<GeoJSON.FeatureCollection>(d.file))
  );
  const merged: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: parts.flatMap((p) => p.features),
  };
  return filterCollectionToParent(merged, districtFeature) ?? merged;
}

export async function loadLayerFeatureCollection(
  layer: GisLayer,
  districtFeature: GeoJSON.Feature | null
): Promise<GeoJSON.FeatureCollection> {
  if (layer.id === 'lyr-villages') {
    if (!districtFeature) return { type: 'FeatureCollection', features: [] };
    return loadVillagesForDistrict(districtFeature);
  }
  const url = locusLayerFetchUrl(layer.sourceTable);
  if (!url) return { type: 'FeatureCollection', features: [] };
  const fc = await fetchJson<GeoJSON.FeatureCollection>(url);
  if (!districtFeature) return fc;
  return filterCollectionToParent(fc, districtFeature) ?? { type: 'FeatureCollection', features: [] };
}

export type LocusKmzBuildInput = {
  title: string;
  districtFeature: GeoJSON.Feature;
  layerIds: string[];
  inventoryLayers: LocusInventoryLayer[];
  catalog?: GisLayer[];
  /** Optional progress callback (0–1). */
  onProgress?: (ratio: number, label: string) => void;
};

export type LocusKmzBuildResult = {
  blob: Blob;
  fileName: string;
  featureCount: number;
  layerCount: number;
  skippedLayerIds: string[];
};

const ICON_ASSETS: Array<{ zipPath: string; url: string }> = [
  { zipPath: 'files/icons/ps.png', url: '/geo/gis-source/ops/police-station-marker.jpg' },
  { zipPath: 'files/icons/checkpost.png', url: '/geo/gis-source/ops/checkpost-marker.png' },
  { zipPath: 'files/icons/entry.png', url: '/geo/gis-source/ops/entry-point-marker.jpg' },
  { zipPath: 'files/icons/exit.png', url: '/geo/gis-source/ops/exit-point-marker.jpg' },
];

export async function buildLocusKmz(input: LocusKmzBuildInput): Promise<LocusKmzBuildResult> {
  const catalog = input.catalog ?? INITIAL_GIS_LAYERS;
  const byId = new Map(catalog.map((l) => [l.id, l]));
  const invById = new Map(input.inventoryLayers.map((l) => [l.layerId, l]));

  const folders: Record<LocusLayerCategory, string[]> = {
    administrative: [],
    operational: [],
    'road-network': [],
  };
  const styles: string[] = [];
  const skipped: string[] = [];
  let featureCount = 0;
  const total = Math.max(1, input.layerIds.length);

  styles.push(styleBlock('lyr-entry-exit-entry', { ...resolveStyle('lyr-entry-exit'), iconHref: 'files/icons/entry.png' }));
  styles.push(
    styleBlock('lyr-entry-exit-exit', {
      ...resolveStyle('lyr-entry-exit'),
      pointColor: '#dc2626',
      iconHref: 'files/icons/exit.png',
    })
  );

  for (let i = 0; i < input.layerIds.length; i += 1) {
    const layerId = input.layerIds[i]!;
    const layer = byId.get(layerId);
    const inv = invById.get(layerId);
    input.onProgress?.((i + 0.2) / total, inv?.name ?? layerId);

    if (!layer || !isLocusExportableLayer(layer)) {
      skipped.push(layerId);
      continue;
    }

    styles.push(styleBlock(layerId, resolveStyle(layerId)));

    let fc: GeoJSON.FeatureCollection;
    try {
      fc = await loadLayerFeatureCollection(layer, input.districtFeature);
    } catch {
      skipped.push(layerId);
      continue;
    }

    const placemarks = fc.features
      .map((f, idx) => placemarkXml(f, layerId, idx, inv?.name ?? layer.name))
      .filter(Boolean);
    featureCount += placemarks.length;

    const category = (inv?.category ?? 'operational') as LocusLayerCategory;
    const folderName = inv?.name ?? layer.name;
    folders[category].push(
      `<Folder>
  <name>${escapeXml(folderName)}</name>
  <open>0</open>
  ${placemarks.join('\n')}
</Folder>`
    );
    input.onProgress?.((i + 1) / total, folderName);
  }

  const categoryFolders = (Object.keys(folders) as LocusLayerCategory[])
    .filter((c) => folders[c].length > 0)
    .map(
      (c) => `<Folder>
  <name>${escapeXml(LOCUS_CATEGORY_LABEL[c])}</name>
  <open>1</open>
  ${folders[c].join('\n')}
</Folder>`
    )
    .join('\n');

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(input.title)}</name>
  <description>EAGLE GIS Locus export · EPSG:4326 · ${featureCount} features · ${input.layerIds.length - skipped.length} layers</description>
  ${styles.join('\n')}
  ${categoryFolders}
</Document>
</kml>
`;

  const zip = new JSZip();
  zip.file('doc.kml', kml);

  await Promise.all(
    ICON_ASSETS.map(async (asset) => {
      try {
        const res = await fetch(asset.url);
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        zip.file(asset.zipPath, buf);
      } catch {
        /* optional icons */
      }
    })
  );

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `eagle_locus_${stamp}.kmz`;
  return {
    blob,
    fileName,
    featureCount,
    layerCount: input.layerIds.length - skipped.length,
    skippedLayerIds: skipped,
  };
}

export async function downloadLocusKmz(input: LocusKmzBuildInput): Promise<LocusKmzBuildResult> {
  const result = await buildLocusKmz(input);
  downloadBlob(result.fileName, result.blob);
  return result;
}

export function resolveLocusExportLayerIds(options: {
  appliedLayerIds: readonly string[];
  layerVisibility: Record<string, boolean>;
  scope: LocusExportScope;
}): string[] {
  if (options.scope === 'applied') return [...options.appliedLayerIds];
  return options.appliedLayerIds.filter((id) => options.layerVisibility[id] !== false);
}
