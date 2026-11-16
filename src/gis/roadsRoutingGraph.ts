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

export interface RoadGraph {
  nodes: Map<NodeKey, LonLat>;
  adj: Map<NodeKey, GraphEdge[]>;
}

type Graph = RoadGraph;

const EARTH_M = 6371000;

/** Default node budget per input line — edges still keep full original vertices between nodes. */
export const ROAD_GRAPH_MAX_VERTICES_PER_LINE = 800;
/** Soft-join nearby layer seams / T-junctions. */
export const ROAD_GRAPH_ENDPOINT_SNAP_M = 120;

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

function polylineMeters(coords: LonLat[]): number {
  let meters = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    meters += haversineM(coords[i], coords[i + 1]);
  }
  return meters;
}

function addUndirected(graph: Graph, a: NodeKey, b: NodeKey, layerId: string, coords: LonLat[]) {
  if (a === b || coords.length < 2) return;
  // Length along the stored polyline (not chord) so costs match drawn geometry.
  const meters = polylineMeters(coords);
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

/**
 * Build a routing graph from any LineString/MultiLineString layers.
 * Layer-agnostic: every saved / future road FC uses the same geometry-preserving rules.
 * Graph nodes may be subsampled for Dijkstra; each edge keeps the full original polyline
 * between its endpoints so drawn routes hug the mapped network.
 */
export function buildRoadGraph(
  layers: Array<{ layerId: string; fc: GeoJSON.FeatureCollection }>,
  options?: { maxVerticesPerLine?: number; endpointSnapM?: number }
): Graph {
  const maxVerts = options?.maxVerticesPerLine ?? ROAD_GRAPH_MAX_VERTICES_PER_LINE;
  const snapM = options?.endpointSnapM ?? ROAD_GRAPH_ENDPOINT_SNAP_M;
  const graph: Graph = { nodes: new Map(), adj: new Map() };
  const endpoints: NodeKey[] = [];

  for (const { layerId, fc } of layers) {
    for (const feature of fc.features) {
      if (!feature.geometry) continue;
      for (const line of lineCoords(feature.geometry)) {
        if (line.length < 2) continue;
        const step = line.length > maxVerts ? Math.ceil(line.length / maxVerts) : 1;
        const nodeIdx: number[] = [];
        for (let i = 0; i < line.length; i += step) nodeIdx.push(i);
        if (nodeIdx[nodeIdx.length - 1] !== line.length - 1) {
          nodeIdx.push(line.length - 1);
        }

        endpoints.push(keyOf(line[nodeIdx[0]]), keyOf(line[nodeIdx[nodeIdx.length - 1]]));
        for (let i = 0; i < nodeIdx.length - 1; i++) {
          const i0 = nodeIdx[i];
          const i1 = nodeIdx[i + 1];
          const a = line[i0];
          const b = line[i1];
          const ka = keyOf(a);
          const kb = keyOf(b);
          const edgeCoords = line.slice(i0, i1 + 1);
          graph.nodes.set(ka, a);
          graph.nodes.set(kb, b);
          addUndirected(graph, ka, kb, layerId, edgeCoords);
        }
      }
    }
  }

  // Soft-connect nearby endpoints (and T-junctions onto nearby vertices) across layers.
  const uniqueEnds = [...new Set(endpoints)].filter((k) => graph.nodes.has(k));
  const cellSize = 500;
  const buckets = new Map<string, NodeKey[]>();
  for (const [k, p] of graph.nodes) {
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
          if (other === k) continue;
          const b = graph.nodes.get(other)!;
          const d = haversineM(a, b);
          if (d > 0 && d <= snapM) addUndirected(graph, k, other, 'snap-join', [a, b]);
        }
      }
    }
  }
  return graph;
}

function closestOnSegment(
  p: LonLat,
  a: LonLat,
  b: LonLat
): { point: LonLat; dist: number; t: number } {
  const lat0 = ((a.lat + b.lat + p.lat) / 3) * (Math.PI / 180);
  const mx = Math.cos(lat0) * 111320;
  const my = 110540;
  const ax = a.lon * mx;
  const ay = a.lat * my;
  const bx = b.lon * mx;
  const by = b.lat * my;
  const px = p.lon * mx;
  const py = p.lat * my;
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / ab2));
  const point = {
    lon: a.lon + (b.lon - a.lon) * t,
    lat: a.lat + (b.lat - a.lat) * t,
  };
  return { point, dist: haversineM(p, point), t };
}

function closestOnPolyline(
  p: LonLat,
  line: LonLat[]
): { point: LonLat; dist: number; index: number } | null {
  if (line.length < 2) return null;
  let best: { point: LonLat; dist: number; index: number } | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const hit = closestOnSegment(p, line[i], line[i + 1]);
    if (!best || hit.dist < best.dist) {
      best = { point: hit.point, dist: hit.dist, index: i };
    }
  }
  return best;
}

type NetworkAttach = {
  key: NodeKey;
  dist: number;
  point: LonLat;
};

/**
 * Snap a pin onto the nearest point on any edge polyline (not only sparse graph nodes).
 * Injects a temporary node and splits the edge so routes leave/join along the mapped road.
 */
function attachPinToNetwork(graph: Graph, point: LonLat, maxM: number): NetworkAttach | null {
  let best: {
    dist: number;
    point: LonLat;
    fromKey: NodeKey;
    edge: GraphEdge;
    index: number;
  } | null = null;

  for (const [fromKey, edges] of graph.adj) {
    for (const edge of edges) {
      // Process each undirected edge once.
      if (fromKey > edge.to) continue;
      const hit = closestOnPolyline(point, edge.coords);
      if (!hit || hit.dist > maxM) continue;
      if (!best || hit.dist < best.dist) {
        best = {
          dist: hit.dist,
          point: hit.point,
          fromKey,
          edge,
          index: hit.index,
        };
      }
    }
  }
  if (!best) return null;

  const snapKey = keyOf(best.point);
  // Already essentially on an existing node.
  if (graph.nodes.has(snapKey)) {
    return { key: snapKey, dist: best.dist, point: graph.nodes.get(snapKey)! };
  }

  const coords = best.edge.coords;
  const i = best.index;
  const before = [...coords.slice(0, i + 1), best.point];
  const after = [best.point, ...coords.slice(i + 1)];
  // Drop duplicate if projection landed on a vertex.
  const cleanBefore =
    before.length >= 2 &&
    before[before.length - 2].lon === best.point.lon &&
    before[before.length - 2].lat === best.point.lat
      ? before.slice(0, -1)
      : before;
  const cleanAfter =
    after.length >= 2 && after[1].lon === best.point.lon && after[1].lat === best.point.lat
      ? after.slice(1)
      : after;

  const uid = best.edge.undirectedId;
  for (const [node, list] of graph.adj) {
    graph.adj.set(
      node,
      list.filter((e) => e.undirectedId !== uid)
    );
  }

  graph.nodes.set(snapKey, best.point);
  const toKey = best.edge.to;
  if (cleanBefore.length >= 2) {
    addUndirected(graph, best.fromKey, snapKey, best.edge.layerId, cleanBefore);
  }
  if (cleanAfter.length >= 2) {
    addUndirected(graph, snapKey, toKey, best.edge.layerId, cleanAfter);
  }
  return { key: snapKey, dist: best.dist, point: best.point };
}

function cloneGraph(graph: Graph): Graph {
  const nodes = new Map(graph.nodes);
  const adj = new Map<NodeKey, GraphEdge[]>();
  for (const [k, edges] of graph.adj) {
    adj.set(
      k,
      edges.map((e) => ({ ...e, coords: e.coords.map((c) => ({ ...c })) }))
    );
  }
  return { nodes, adj };
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
 * Works for every LineString layer fed into {@link buildRoadGraph} (existing + future).
 * Pins attach onto edge geometry so routes follow mapped centerlines on the map.
 */
export function findNetworkRoutes(
  graph: Graph,
  from: LonLat,
  to: LonLat,
  k = 5,
  snapMaxM = 1200
): NetworkRouteResult[] {
  if (graph.nodes.size === 0) return [];

  // Clone so pin attachment splits do not mutate the caller's reusable graph.
  const work = cloneGraph(graph);
  const startNear = attachPinToNetwork(work, from, snapMaxM);
  const endNear = attachPinToNetwork(work, to, snapMaxM);
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
    const hit = dijkstra(work, startNear.key, endNear.key, { penalties });
    if (!hit || hit.coords.length < 2) break;

    const sig = pathSignature(hit.coords);
    const tooSimilarGeom =
      seen.has(sig) ||
      resultEdgeSets.some((prev) => overlapRatio(prev, hit.edgeIds) >= 0.88);

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
          'Path uses short junction seams where selected road layers meet — not invented corridors.'
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
