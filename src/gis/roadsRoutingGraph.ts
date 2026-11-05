/** Client-side network routing on GeoJSON LineStrings (WGS84). */

export type LonLat = { lon: number; lat: number };

export interface NetworkRouteResult {
  points: LonLat[];
  distanceKm: number;
  layerIds: string[];
  usedSnapConnectors: boolean;
  notes: string[];
}

type NodeKey = string;

interface GraphEdge {
  to: NodeKey;
  meters: number;
  layerId: string;
  coords: LonLat[];
  undirectedId: string;
}

interface Graph {
  nodes: Map<NodeKey, LonLat>;
  adj: Map<NodeKey, GraphEdge[]>;
}

const EARTH_M = 6371000;

export function haversineM(a: LonLat, b: LonLat): number {
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLon = toR(b.lon - a.lon);
  const lat1 = toR(a.lat);
  const lat2 = toR(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function keyOf(p: LonLat, decimals = 5): NodeKey {
  return `${p.lon.toFixed(decimals)},${p.lat.toFixed(decimals)}`;
}

function undirectedEdgeId(a: NodeKey, b: NodeKey, layerId: string): string {
  return a < b ? `${a}|${b}|${layerId}` : `${b}|${a}|${layerId}`;
}

function lineCoords(geom: GeoJSON.Geometry): LonLat[][] {
  if (geom.type === 'LineString') {
    return [geom.coordinates.map(([lon, lat]) => ({ lon, lat }))];
  }
  if (geom.type === 'MultiLineString') {
    return geom.coordinates.map((line) => line.map(([lon, lat]) => ({ lon, lat })));
  }
  return [];
}

function pointInPadBox(p: LonLat, minLon: number, minLat: number, maxLon: number, maxLat: number) {
  return p.lon >= minLon && p.lon <= maxLon && p.lat >= minLat && p.lat <= maxLat;
}

/** Keep features that intersect an A–B corridor bbox (with padding). */
export function filterFcByCorridor(
  fc: GeoJSON.FeatureCollection,
  from: LonLat,
  to: LonLat,
  padDeg = 0.35
): GeoJSON.FeatureCollection {
  const minLon = Math.min(from.lon, to.lon) - padDeg;
  const maxLon = Math.max(from.lon, to.lon) + padDeg;
  const minLat = Math.min(from.lat, to.lat) - padDeg;
  const maxLat = Math.max(from.lat, to.lat) + padDeg;
  const features = fc.features.filter((feature) => {
    if (!feature.geometry) return false;
    for (const line of lineCoords(feature.geometry)) {
      for (const p of line) {
        if (pointInPadBox(p, minLon, minLat, maxLon, maxLat)) return true;
      }
    }
    return false;
  });
  return { type: 'FeatureCollection', features };
}

function addUndirected(graph: Graph, a: NodeKey, b: NodeKey, layerId: string, coords: LonLat[]) {
  if (a === b || coords.length < 2) return;
  const meters = haversineM(coords[0], coords[coords.length - 1]);
  if (!Number.isFinite(meters) || meters <= 0) return;
  const uid = undirectedEdgeId(a, b, layerId);
  if (!graph.adj.has(a)) graph.adj.set(a, []);
  if (!graph.adj.has(b)) graph.adj.set(b, []);
  graph.adj.get(a)!.push({ to: b, meters, layerId, coords, undirectedId: uid });
  graph.adj.get(b)!.push({
    to: a,
    meters,
    layerId,
    coords: [...coords].reverse(),
    undirectedId: uid,
  });
}

/** Build a graph from one or more line FeatureCollections tagged by layer id. */
export function buildRoadGraph(
  layers: Array<{ layerId: string; fc: GeoJSON.FeatureCollection }>,
  options?: { maxVerticesPerLine?: number; endpointSnapM?: number }
): Graph {
  const maxVerts = options?.maxVerticesPerLine ?? 280;
  const snapM = options?.endpointSnapM ?? 55;
  const graph: Graph = { nodes: new Map(), adj: new Map() };
  const endpoints: NodeKey[] = [];

  for (const { layerId, fc } of layers) {
    for (const feature of fc.features) {
      if (!feature.geometry) continue;
      for (const line of lineCoords(feature.geometry)) {
        if (line.length < 2) continue;
        const step = line.length > maxVerts ? Math.ceil(line.length / maxVerts) : 1;
        const sampled: LonLat[] = [];
        for (let i = 0; i < line.length; i += step) sampled.push(line[i]);
        const last = line[line.length - 1];
        const tail = sampled[sampled.length - 1];
        if (!tail || tail.lon !== last.lon || tail.lat !== last.lat) sampled.push(last);

        endpoints.push(keyOf(sampled[0]), keyOf(sampled[sampled.length - 1]));
        for (let i = 0; i < sampled.length - 1; i++) {
          const a = sampled[i];
          const b = sampled[i + 1];
          const ka = keyOf(a);
          const kb = keyOf(b);
          graph.nodes.set(ka, a);
          graph.nodes.set(kb, b);
          addUndirected(graph, ka, kb, layerId, [a, b]);
        }
      }
    }
  }

  // Soft-connect nearby endpoints across layers (real junctions / dataset seams only).
  const uniqueEnds = [...new Set(endpoints)].filter((k) => graph.nodes.has(k));
  const cellSize = 500; // ~0.002 deg
  const buckets = new Map<string, NodeKey[]>();
  for (const k of uniqueEnds) {
    const p = graph.nodes.get(k)!;
    const c = `${Math.round(p.lon * cellSize)}:${Math.round(p.lat * cellSize)}`;
    if (!buckets.has(c)) buckets.set(c, []);
    buckets.get(c)!.push(k);
  }
  for (const k of uniqueEnds) {
    const a = graph.nodes.get(k)!;
    const cx = Math.round(a.lon * cellSize);
    const cy = Math.round(a.lat * cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of buckets.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (other <= k) continue;
          const b = graph.nodes.get(other)!;
          const d = haversineM(a, b);
          if (d > 0 && d <= snapM) addUndirected(graph, k, other, 'snap-join', [a, b]);
        }
      }
    }
  }
  return graph;
}

function nearestNode(
  graph: Graph,
  point: LonLat,
  maxM: number
): { key: NodeKey; dist: number } | null {
  let best: { key: NodeKey; dist: number } | null = null;
  for (const [key, coord] of graph.nodes) {
    const dist = haversineM(point, coord);
    if (dist > maxM) continue;
    if (!best || dist < best.dist) best = { key, dist };
  }
  return best;
}

function dijkstra(
  graph: Graph,
  start: NodeKey,
  end: NodeKey,
  opts?: {
    blocked?: Set<string>;
    /** Multiplier per undirected edge id (>1 pushes alternatives away). */
    penalties?: Map<string, number>;
  }
): { path: NodeKey[]; meters: number; layerIds: Set<string>; coords: LonLat[]; edgeIds: string[] } | null {
  const blocked = opts?.blocked;
  const penalties = opts?.penalties;
  const dist = new Map<NodeKey, number>();
  const prev = new Map<NodeKey, { from: NodeKey; edge: GraphEdge }>();
  const pq: Array<{ key: NodeKey; d: number }> = [{ key: start, d: 0 }];
  dist.set(start, 0);

  while (pq.length) {
    pq.sort((a, b) => a.d - b.d);
    const cur = pq.shift()!;
    if (cur.key === end) break;
    if ((dist.get(cur.key) ?? Infinity) < cur.d) continue;
    for (const edge of graph.adj.get(cur.key) ?? []) {
      if (blocked?.has(edge.undirectedId)) continue;
      const penalty = penalties?.get(edge.undirectedId) ?? 1;
      const nd = cur.d + edge.meters * penalty;
      if (nd < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nd);
        prev.set(edge.to, { from: cur.key, edge });
        pq.push({ key: edge.to, d: nd });
      }
    }
  }

  if (!dist.has(end)) return null;
  const path: NodeKey[] = [];
  const layerIds = new Set<string>();
  const coords: LonLat[] = [];
  const edgeIds: string[] = [];
  let walk: NodeKey | undefined = end;
  const stack: GraphEdge[] = [];
  while (walk && walk !== start) {
    const step = prev.get(walk);
    if (!step) return null;
    stack.push(step.edge);
    layerIds.add(step.edge.layerId);
    edgeIds.push(step.edge.undirectedId);
    path.push(walk);
    walk = step.from;
  }
  path.push(start);
  path.reverse();
  stack.reverse();
  edgeIds.reverse();
  let trueMeters = 0;
  for (const edge of stack) {
    trueMeters += edge.meters;
    const c = edge.coords;
    if (!coords.length) coords.push(...c);
    else coords.push(...c.slice(1));
  }
  return { path, meters: trueMeters, layerIds, coords, edgeIds };
}

function pathSignature(coords: LonLat[]): string {
  if (coords.length < 2) return '';
  const mid = coords[Math.floor(coords.length / 2)];
  const q = (n: number) => n.toFixed(3);
  return `${q(coords[0].lon)},${q(coords[0].lat)}>${q(mid.lon)},${q(mid.lat)}>${q(coords[coords.length - 1].lon)},${q(coords[coords.length - 1].lat)}:${coords.length}`;
}

/** Rough driving ETA from distance (rural ~45 km/h). */
export function estimateDurationMin(distanceKm: number, kmh = 45): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  return Math.max(1, Math.round((distanceKm / kmh) * 60));
}

/**
 * Shortest + diversified alternatives on a combined multi-layer road graph.
 * Unverified A/B snap connectors are flagged; snap-join edges between datasets are junction seams.
 */
export function findNetworkRoutes(
  graph: Graph,
  from: LonLat,
  to: LonLat,
  k = 5,
  snapMaxM = 1200
): NetworkRouteResult[] {
  if (graph.nodes.size === 0) return [];
  const startNear = nearestNode(graph, from, snapMaxM);
  const endNear = nearestNode(graph, to, snapMaxM);
  if (!startNear || !endNear) return [];

  const notesBase: string[] = [];
  let usedSnap = false;
  if (startNear.dist > 40) {
    usedSnap = true;
    notesBase.push(
      `Origin linked to the saved road network with a ${Math.round(startNear.dist)} m unverified connector (not a mapped road).`
    );
  }
  if (endNear.dist > 40) {
    usedSnap = true;
    notesBase.push(
      `Destination linked to the saved road network with a ${Math.round(endNear.dist)} m unverified connector (not a mapped road).`
    );
  }

  const results: NetworkRouteResult[] = [];
  const resultEdgeSets: string[][] = [];
  const penalties = new Map<string, number>();
  const seen = new Set<string>();

  const overlapRatio = (a: string[], b: string[]) => {
    if (!a.length || !b.length) return 0;
    const setB = new Set(b);
    let shared = 0;
    for (const id of a) if (setB.has(id)) shared += 1;
    return shared / Math.min(a.length, b.length);
  };

  for (let i = 0; i < k * 3 && results.length < k; i++) {
    const hit = dijkstra(graph, startNear.key, endNear.key, { penalties });
    if (!hit || hit.coords.length < 2) break;

    const sig = pathSignature(hit.coords);
    const tooSimilarGeom =
      seen.has(sig) ||
      resultEdgeSets.some((prev) => overlapRatio(prev, hit.edgeIds) >= 0.72);

    if (!tooSimilarGeom) {
      seen.add(sig);
      resultEdgeSets.push(hit.edgeIds);
      const points: LonLat[] = [];
      if (startNear.dist > 1) points.push(from);
      points.push(...hit.coords);
      if (endNear.dist > 1) points.push(to);

      const layerIds = [...hit.layerIds].filter((id) => id !== 'snap-join');
      const notes = [...notesBase];
      if (hit.layerIds.has('snap-join')) {
        notes.push(
          'Path uses short junction seams (<~60 m) where selected road layers meet — not invented corridors.'
        );
      }

      results.push({
        points,
        distanceKm: Number((hit.meters / 1000).toFixed(2)),
        layerIds,
        usedSnapConnectors: usedSnap || hit.layerIds.has('snap-join'),
        notes,
      });
    }

    // Penalize used edges so the next search seeks a different corridor.
    for (const id of hit.edgeIds) {
      const prev = penalties.get(id) ?? 1;
      penalties.set(id, prev * (tooSimilarGeom ? 12 : 5));
    }
    const midStart = Math.floor(hit.edgeIds.length * 0.25);
    const midEnd = Math.ceil(hit.edgeIds.length * 0.75);
    for (let e = midStart; e < midEnd; e++) {
      const id = hit.edgeIds[e];
      penalties.set(id, (penalties.get(id) ?? 1) * 8);
    }
  }

  return results;
}

export function graphStats(graph: Graph): { nodes: number; edges: number } {
  let edges = 0;
  for (const list of graph.adj.values()) edges += list.length;
  return { nodes: graph.nodes.size, edges: Math.floor(edges / 2) };
}
