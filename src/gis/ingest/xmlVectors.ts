/**
 * QGIS analog: OGR KML / LIBKML / GPX / GML drivers (qgsogrprovider.cpp).
 * KMZ is a ZIP of KML — QGIS opens it via GDAL /vsizip/.
 */
import { asFeature, emptyCollection } from './geometry';

function localName(node: Element): string {
  return (node.localName || node.nodeName).replace(/^.*:/, '').toLowerCase();
}

function childText(el: Element, tag: string): string {
  const wanted = tag.toLowerCase();
  for (const child of Array.from(el.children)) {
    if (localName(child as Element) === wanted) return (child.textContent ?? '').trim();
  }
  return '';
}

function allDescendants(el: Element, tag: string): Element[] {
  const wanted = tag.toLowerCase();
  return Array.from(el.getElementsByTagName('*')).filter((node) => localName(node) === wanted);
}

function parseCoordTuples(raw: string): GeoJSON.Position[] {
  return raw
    .trim()
    .split(/[\s\n]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const parts = token.split(',').map(Number);
      return parts.filter((n) => Number.isFinite(n)) as GeoJSON.Position;
    })
    .filter((pos) => pos.length >= 2);
}

function parseGmlPosList(raw: string, swapXy: boolean): GeoJSON.Position[] {
  const nums = raw.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  const out: GeoJSON.Position[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push(swapXy ? [nums[i + 1], nums[i]] : [nums[i], nums[i + 1]]);
  }
  return out;
}

function closeRing(ring: GeoJSON.Position[]): GeoJSON.Position[] {
  if (ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return [...ring, first];
  return ring;
}

function extendedData(pm: Element): Record<string, string> {
  const props: Record<string, string> = {};
  for (const data of allDescendants(pm, 'data')) {
    const key = data.getAttribute('name') || childText(data, 'displayName');
    const value = childText(data, 'value') || (data.textContent ?? '').trim();
    if (key) props[key] = value;
  }
  for (const data of allDescendants(pm, 'simpledata')) {
    const key = data.getAttribute('name');
    if (key) props[key] = (data.textContent ?? '').trim();
  }
  return props;
}

function kmlGeometry(el: Element): GeoJSON.Geometry | null {
  const points = allDescendants(el, 'point');
  const lines = allDescendants(el, 'linestring');
  const rings = allDescendants(el, 'linearring');
  const polygons = allDescendants(el, 'polygon');
  if (polygons.length) {
    const coords = polygons.map((poly) => {
      const polyRings = allDescendants(poly, 'linearring')
        .map((ring) => closeRing(parseCoordTuples(childText(ring, 'coordinates'))))
        .filter((ring) => ring.length >= 4);
      return polyRings;
    }).filter((poly) => poly.length);
    if (!coords.length) return null;
    return coords.length === 1
      ? { type: 'Polygon', coordinates: coords[0] }
      : { type: 'MultiPolygon', coordinates: coords };
  }
  if (lines.length) {
    const coords = lines
      .map((line) => parseCoordTuples(childText(line, 'coordinates')))
      .filter((c) => c.length >= 2);
    if (!coords.length) return null;
    return coords.length === 1
      ? { type: 'LineString', coordinates: coords[0] }
      : { type: 'MultiLineString', coordinates: coords };
  }
  if (rings.length) {
    const ring = closeRing(parseCoordTuples(childText(rings[0], 'coordinates')));
    if (ring.length < 4) return null;
    return { type: 'Polygon', coordinates: [ring] };
  }
  if (points.length) {
    const coords = points
      .map((pt) => parseCoordTuples(childText(pt, 'coordinates'))[0])
      .filter(Boolean);
    if (!coords.length) return null;
    return coords.length === 1
      ? { type: 'Point', coordinates: coords[0] }
      : { type: 'MultiPoint', coordinates: coords };
  }
  return null;
}

export function parseKml(xml: string): GeoJSON.FeatureCollection {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('KML XML is not well-formed');
  const placemarks = allDescendants(doc.documentElement, 'placemark');
  const features: GeoJSON.Feature[] = [];
  placemarks.forEach((pm, idx) => {
    const geometry = kmlGeometry(pm);
    if (!geometry) return;
    const name = childText(pm, 'name') || `Placemark ${idx + 1}`;
    features.push(
      asFeature(
        geometry,
        {
          name,
          description: childText(pm, 'description'),
          ...extendedData(pm),
        },
        idx + 1
      )
    );
  });
  return features.length ? { type: 'FeatureCollection', features } : emptyCollection();
}

export function parseGpx(xml: string): GeoJSON.FeatureCollection {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('GPX XML is not well-formed');
  const features: GeoJSON.Feature[] = [];
  const wpts = allDescendants(doc.documentElement, 'wpt');
  wpts.forEach((wpt, idx) => {
    const lat = Number(wpt.getAttribute('lat'));
    const lon = Number(wpt.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    features.push(
      asFeature(
        { type: 'Point', coordinates: [lon, lat] },
        {
          name: childText(wpt, 'name') || `WPT ${idx + 1}`,
          desc: childText(wpt, 'desc'),
          ele: childText(wpt, 'ele'),
          time: childText(wpt, 'time'),
          kind: 'waypoint',
        },
        `wpt-${idx + 1}`
      )
    );
  });
  const tracks = allDescendants(doc.documentElement, 'trk');
  tracks.forEach((trk, idx) => {
    const pts = allDescendants(trk, 'trkpt')
      .map((pt) => [Number(pt.getAttribute('lon')), Number(pt.getAttribute('lat'))] as GeoJSON.Position)
      .filter((pos) => Number.isFinite(pos[0]) && Number.isFinite(pos[1]));
    if (pts.length < 2) return;
    features.push(
      asFeature(
        { type: 'LineString', coordinates: pts },
        { name: childText(trk, 'name') || `Track ${idx + 1}`, kind: 'track' },
        `trk-${idx + 1}`
      )
    );
  });
  const routes = allDescendants(doc.documentElement, 'rte');
  routes.forEach((rte, idx) => {
    const pts = allDescendants(rte, 'rtept')
      .map((pt) => [Number(pt.getAttribute('lon')), Number(pt.getAttribute('lat'))] as GeoJSON.Position)
      .filter((pos) => Number.isFinite(pos[0]) && Number.isFinite(pos[1]));
    if (pts.length < 2) return;
    features.push(
      asFeature(
        { type: 'LineString', coordinates: pts },
        { name: childText(rte, 'name') || `Route ${idx + 1}`, kind: 'route' },
        `rte-${idx + 1}`
      )
    );
  });
  return features.length ? { type: 'FeatureCollection', features } : emptyCollection();
}

function gmlSrsSwap(el: Element): boolean {
  const srs = (el.getAttribute('srsName') || el.getAttribute('srsname') || '').toUpperCase();
  if (srs.includes('CRS84') || srs.includes('OGC:1.3:CRS84')) return false;
  return srs.includes('URN:OGC:DEF:CRS:EPSG::4326') || srs.includes('EPSG::4326');
}

function gmlPositions(el: Element): GeoJSON.Position[] {
  const posList = allDescendants(el, 'poslist')[0] ?? allDescendants(el, 'posList')[0];
  if (posList) {
    const srs = posList.getAttribute('srsName') || el.getAttribute('srsName') || '';
    const swap = /EPSG:?4326/i.test(srs) && !/CRS84/i.test(srs);
    return parseGmlPosList(posList.textContent ?? '', swap || gmlSrsSwap(el));
  }
  const posNodes = allDescendants(el, 'pos');
  if (posNodes.length) {
    return posNodes.flatMap((node) => parseGmlPosList(node.textContent ?? '', gmlSrsSwap(el)));
  }
  const coords = allDescendants(el, 'coordinates')[0];
  if (coords) return parseCoordTuples((coords.textContent ?? '').replace(/\s+/g, ' '));
  return [];
}

export function parseGml(xml: string): GeoJSON.FeatureCollection {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('GML XML is not well-formed');
  const features: GeoJSON.Feature[] = [];
  const members = [
    ...allDescendants(doc.documentElement, 'featuremember'),
    ...allDescendants(doc.documentElement, 'member'),
  ];
  const targets = members.length ? members : [doc.documentElement];
  targets.forEach((member, idx) => {
    const points = allDescendants(member, 'point');
    const lines = allDescendants(member, 'linestring');
    const polys = allDescendants(member, 'polygon');
    let geometry: GeoJSON.Geometry | null = null;
    if (polys.length) {
      const rings = allDescendants(polys[0], 'linearring')
        .map((ring) => closeRing(gmlPositions(ring)))
        .filter((ring) => ring.length >= 4);
      if (rings.length) geometry = { type: 'Polygon', coordinates: rings };
    } else if (lines.length) {
      const coords = gmlPositions(lines[0]);
      if (coords.length >= 2) geometry = { type: 'LineString', coordinates: coords };
    } else if (points.length) {
      const coords = gmlPositions(points[0])[0];
      if (coords) geometry = { type: 'Point', coordinates: coords };
    }
    if (!geometry) return;
    const name =
      childText(member, 'name') ||
      member.getAttribute('fid') ||
      member.getAttribute('gml:id') ||
      `GML ${idx + 1}`;
    features.push(asFeature(geometry, { name }, idx + 1));
  });
  return features.length ? { type: 'FeatureCollection', features } : emptyCollection();
}
