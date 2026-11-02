/**
 * QGIS analog: QgsCoordinateReferenceSystem + QgsCoordinateTransform (PROJ).
 * EAGLE always paints in EPSG:4326 for Leaflet / MapLibre.
 */
import proj4 from 'proj4';

proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs(
  'EPSG:3857',
  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs'
);
proj4.defs('EPSG:32643', '+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32644', '+proj=utm +zone=44 +datum=WGS84 +units=m +no_defs');
proj4.defs(
  'EPSG:7755',
  '+proj=lcc +lat_1=12 +lat_2=35 +lat_0=24 +lon_0=80 +x_0=4000000 +y_0=4000000 +ellps=WGS84 +units=m +no_defs'
);

const KNOWN: Record<string, string> = {
  '4326': 'EPSG:4326',
  '3857': 'EPSG:3857',
  '900913': 'EPSG:3857',
  '32643': 'EPSG:32643',
  '32644': 'EPSG:32644',
  '7755': 'EPSG:7755',
  crs84: 'EPSG:4326',
  wgs84: 'EPSG:4326',
};

export function normalizeCrs(raw: string | null | undefined): string {
  if (!raw) return 'EPSG:4326';
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  const epsg = compact.match(/EPSG::?(\d+)/i) ?? compact.match(/(\d{4,5})/);
  if (epsg) {
    const mapped = KNOWN[epsg[1]];
    if (mapped) return mapped;
    return `EPSG:${epsg[1]}`;
  }
  const lower = raw.toLowerCase();
  if (lower.includes('crs84') || lower.includes('wgs 84') || lower.includes('wgs84')) {
    return 'EPSG:4326';
  }
  if (lower.includes('web mercator') || lower.includes('pseudo-mercator')) return 'EPSG:3857';
  return raw.trim() || 'EPSG:4326';
}

export function parsePrjWkt(wkt: string): string {
  const authority = wkt.match(/AUTHORITY\s*\[\s*"EPSG"\s*,\s*"(\d+)"\s*\]/i);
  if (authority) return normalizeCrs(`EPSG:${authority[1]}`);
  const upper = wkt.toUpperCase();
  if (upper.includes('WGS_1984') || upper.includes('WGS 84') || upper.includes('GCS_WGS')) {
    if (upper.includes('UTM_ZONE_44')) return 'EPSG:32644';
    if (upper.includes('UTM_ZONE_43')) return 'EPSG:32643';
    if (upper.includes('MERCATOR')) return 'EPSG:3857';
    return 'EPSG:4326';
  }
  return normalizeCrs(wkt);
}

export function canTransform(crs: string): boolean {
  const code = normalizeCrs(crs);
  try {
    proj4(code, 'EPSG:4326', [80.648, 16.5062]);
    return true;
  } catch {
    return code === 'EPSG:4326';
  }
}

export function toLonLat(x: number, y: number, sourceCrs: string): [number, number] {
  const code = normalizeCrs(sourceCrs);
  if (code === 'EPSG:4326') {
    if (Math.abs(x) <= 90 && Math.abs(y) > 90) return [y, x];
    return [x, y];
  }
  const [lon, lat] = proj4(code, 'EPSG:4326', [x, y]);
  return [lon, lat];
}

export function transformGeometry(geometry: GeoJSON.Geometry, sourceCrs: string): GeoJSON.Geometry {
  const code = normalizeCrs(sourceCrs);
  if (code === 'EPSG:4326') return geometry;
  const mapPos = (pos: GeoJSON.Position): GeoJSON.Position => {
    const [lon, lat] = toLonLat(pos[0], pos[1], code);
    return pos.length > 2 ? [lon, lat, pos[2]] : [lon, lat];
  };
  switch (geometry.type) {
    case 'Point':
      return { type: 'Point', coordinates: mapPos(geometry.coordinates) };
    case 'MultiPoint':
      return { type: 'MultiPoint', coordinates: geometry.coordinates.map(mapPos) };
    case 'LineString':
      return { type: 'LineString', coordinates: geometry.coordinates.map(mapPos) };
    case 'MultiLineString':
      return {
        type: 'MultiLineString',
        coordinates: geometry.coordinates.map((line) => line.map(mapPos)),
      };
    case 'Polygon':
      return {
        type: 'Polygon',
        coordinates: geometry.coordinates.map((ring) => ring.map(mapPos)),
      };
    case 'MultiPolygon':
      return {
        type: 'MultiPolygon',
        coordinates: geometry.coordinates.map((poly) => poly.map((ring) => ring.map(mapPos))),
      };
    case 'GeometryCollection':
      return {
        type: 'GeometryCollection',
        geometries: geometry.geometries.map((g) => transformGeometry(g, code)),
      };
    default:
      return geometry;
  }
}
