/**
 * QGIS analogs:
 *  - QgsWmsProvider (src/providers/wms/) covers WMS, WMTS, and raster XYZ
 *  - QgsWFSProvider / QgsOapifProvider (src/providers/wfs/)
 *  - QgsAfsProvider / QgsAmsProvider (ArcGIS FeatureServer / MapServer)
 */
import { AP_ENVELOPE } from './types';
import type { IngestedTiles } from './types';
import { parseGml, parseKml } from './xmlVectors';

function localName(node: Element): string {
  return (node.localName || node.nodeName).replace(/^.*:/, '').toLowerCase();
}

function allBy(el: ParentNode, tag: string): Element[] {
  return Array.from((el as Element).getElementsByTagName?.('*') ?? []).filter(
    (node) => localName(node) === tag.toLowerCase()
  );
}

export function classifyServiceUri(uri: string): {
  provider:
    | 'wms'
    | 'wfs'
    | 'xyz'
    | 'arcgisfeatureserver'
    | 'arcgismapserver'
    | null;
} {
  const raw = uri.trim();
  const lower = raw.toLowerCase();
  if (!raw) return { provider: null };
  if (/featureserver/i.test(lower)) return { provider: 'arcgisfeatureserver' };
  if (/mapserver/i.test(lower) && /\/tile\//i.test(lower) === false && !/\{z\}/i.test(lower)) {
    if (/\/MapServer\/?\d*$/i.test(raw) || /\/MapServer/i.test(lower)) return { provider: 'arcgismapserver' };
  }
  if (/\{z\}/i.test(raw) && /\{x\}/i.test(raw) && /\{y\}/i.test(raw)) return { provider: 'xyz' };
  if (/[?&]service=wfs\b/i.test(lower) || /\/wfs\b/i.test(lower) || /outputformat=/i.test(lower) && /wfs/i.test(lower)) {
    return { provider: 'wfs' };
  }
  if (/[?&]service=wms\b/i.test(lower) || /\/wms\b/i.test(lower) || /wmts/i.test(lower)) {
    return { provider: 'wms' };
  }
  if (/\/MapServer\/tile\//i.test(raw) || /arcgisonline\.com/i.test(lower)) return { provider: 'xyz' };
  return { provider: null };
}

export function xyzTiles(url: string, attribution = 'User XYZ / WMTS'): IngestedTiles {
  return { url, attribution, minZoom: 0, maxZoom: 22 };
}

export function arcgisMapServerTiles(url: string): IngestedTiles {
  const base = url.replace(/\/+$/, '').replace(/\/tile\/.*$/i, '');
  return {
    url: `${base}/tile/{z}/{y}/{x}`,
    attribution: 'ArcGIS REST MapServer',
    maxZoom: 23,
  };
}

export function wmsTiles(baseUrl: string, layers: string, crs = 'EPSG:3857'): IngestedTiles {
  const root = baseUrl.split('?')[0];
  return {
    url: root,
    attribution: 'OGC WMS',
    wms: {
      layers,
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      crs,
    },
  };
}

export function parseWmsCapabilities(xml: string): Array<{ name: string; title: string; crs: string[] }> {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const layers: Array<{ name: string; title: string; crs: string[] }> = [];
  for (const layer of allBy(doc, 'layer')) {
    const nameEl = Array.from(layer.children).find((c) => localName(c) === 'name');
    const titleEl = Array.from(layer.children).find((c) => localName(c) === 'title');
    const name = (nameEl?.textContent ?? '').trim();
    if (!name) continue;
    const crs = Array.from(layer.children)
      .filter((c) => localName(c) === 'crs' || localName(c) === 'srs')
      .map((c) => (c.textContent ?? '').trim())
      .filter(Boolean);
    layers.push({ name, title: (titleEl?.textContent ?? name).trim(), crs });
  }
  return layers;
}

export function wmsGetCapabilitiesUrl(uri: string): string {
  const url = new URL(uri, 'https://local.invalid');
  url.searchParams.set('SERVICE', 'WMS');
  url.searchParams.set('REQUEST', 'GetCapabilities');
  if (!url.searchParams.get('VERSION')) url.searchParams.set('VERSION', '1.3.0');
  return uri.startsWith('http') ? url.toString() : `${uri}${uri.includes('?') ? '&' : '?'}SERVICE=WMS&REQUEST=GetCapabilities`;
}

export function wfsGetFeatureUrl(uri: string, typeName?: string): string {
  try {
    const url = new URL(uri);
    url.searchParams.set('SERVICE', 'WFS');
    url.searchParams.set('REQUEST', 'GetFeature');
    if (!url.searchParams.get('VERSION')) url.searchParams.set('VERSION', '2.0.0');
    if (typeName && !url.searchParams.get('TYPENAMES') && !url.searchParams.get('TYPENAME')) {
      url.searchParams.set('TYPENAMES', typeName);
    }
    if (!url.searchParams.get('OUTPUTFORMAT') && !url.searchParams.get('outputFormat')) {
      url.searchParams.set('OUTPUTFORMAT', 'application/json');
    }
    if (!url.searchParams.get('COUNT') && !url.searchParams.get('MAXFEATURES')) {
      url.searchParams.set('COUNT', '5000');
    }
    const bbox = `${AP_ENVELOPE.west},${AP_ENVELOPE.south},${AP_ENVELOPE.east},${AP_ENVELOPE.north},EPSG:4326`;
    if (!url.searchParams.get('BBOX')) url.searchParams.set('BBOX', bbox);
    return url.toString();
  } catch {
    return uri;
  }
}

export function arcgisQueryUrl(uri: string): string {
  const base = uri.replace(/\/query\/?$/i, '').replace(/\/+$/, '');
  const url = new URL(`${base}/query`);
  url.searchParams.set('f', 'geojson');
  url.searchParams.set('where', '1=1');
  url.searchParams.set('outFields', '*');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('resultRecordCount', '5000');
  url.searchParams.set(
    'geometry',
    `${AP_ENVELOPE.west},${AP_ENVELOPE.south},${AP_ENVELOPE.east},${AP_ENVELOPE.north}`
  );
  url.searchParams.set('geometryType', 'esriGeometryEnvelope');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  return url.toString();
}

export async function fetchJsonCollection(url: string): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(url, { headers: { Accept: 'application/json, application/geo+json, text/xml' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (contentType.includes('json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    const data = JSON.parse(text) as GeoJSON.GeoJsonObject | GeoJSON.FeatureCollection;
    if ((data as GeoJSON.FeatureCollection).type === 'FeatureCollection') {
      return data as GeoJSON.FeatureCollection;
    }
    if ((data as GeoJSON.Feature).type === 'Feature') {
      return { type: 'FeatureCollection', features: [data as GeoJSON.Feature] };
    }
    throw new Error('JSON response is not GeoJSON');
  }
  if (text.includes('<kml') || text.includes('<KML')) return parseKml(text);
  return parseGml(text);
}

export async function openWms(uri: string): Promise<{ title: string; tiles: IngestedTiles; warnings: string[] }> {
  const warnings: string[] = [];
  const capsUrl = wmsGetCapabilitiesUrl(uri);
  let layers: Array<{ name: string; title: string; crs: string[] }> = [];
  try {
    const res = await fetch(capsUrl);
    if (res.ok) layers = parseWmsCapabilities(await res.text());
    else warnings.push(`WMS GetCapabilities HTTP ${res.status}`);
  } catch (err) {
    warnings.push(`WMS GetCapabilities blocked or failed (${(err as Error).message}). Using URL layer list if present.`);
  }
  const url = new URL(uri, 'https://local.invalid');
  const requested = url.searchParams.get('LAYERS') || url.searchParams.get('layers') || layers[0]?.name;
  if (!requested) throw new Error('WMS URL has no LAYERS and capabilities listed none');
  const title = layers.find((l) => l.name === requested)?.title ?? requested;
  const crs = layers.find((l) => l.name === requested)?.crs.includes('EPSG:3857')
    ? 'EPSG:3857'
    : 'EPSG:4326';
  return { title, tiles: wmsTiles(uri, requested, crs), warnings };
}

export async function openWfs(uri: string): Promise<GeoJSON.FeatureCollection> {
  return fetchJsonCollection(wfsGetFeatureUrl(uri));
}

export async function openArcgisFeatureServer(uri: string): Promise<GeoJSON.FeatureCollection> {
  return fetchJsonCollection(arcgisQueryUrl(uri));
}
