import React, { useCallback, useMemo, useRef, useState } from 'react';
import { MapPin, Navigation, Route, Trash2, Eye, EyeOff } from 'lucide-react';
import type { GisLayer, WorkspaceId } from '../../types/gis';
import { ApLeafletMap } from '../gis/ApLeafletMap';
import {
  isRoutableRoadLayer,
  isRoutingLocationLayer,
  routingMapFlags,
  routingLayersFromConfig,
  type RoadsRoutingLayerConfig,
} from '../../gis/roadsRoutingLayers';
import { groupLayersByCatalogModule } from '../../gis/catalogWorkspaces';
import { decimateRoutePoints } from '../../gis/mapRoadRenderSafety';
import {
  buildRoadGraph,
  estimateDurationMin,
  filterFcByCorridor,
  findNetworkRoutes,
  graphStats,
  type LonLat,
} from '../../gis/roadsRoutingGraph';
import { analyseOpsNearRoute, type OpsNearRoute } from '../../gis/roadsRoutingOps';
import { osrmDrivingRouteAlternatives } from '../../gis/osmServices';
import { GIS_SOURCE_ADMIN_LAYERS, GIS_SOURCE_OPS_LAYERS } from '../../gis/gisSourceCatalog';
import { featureBbox } from '../../gis/adminHierarchy';
import { INDIA_CENTER, INDIA_DEFAULT_ZOOM } from '../../data/apGeo';
const ROUTE_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed'] as const;

const LAYER_FC_URL: Record<string, string> = {
  'lyr-highways': '/api/gis-roads/geojson?layer=nh',
  'lyr-ap-roads-full': '/api/gis-roads/geojson?layer=full',
  'lyr-ops-vsp-roads': '/api/gis-roads/geojson?layer=vsp',
  'lyr-ap-roads-major': GIS_SOURCE_ADMIN_LAYERS.roadsMajor,
  'lyr-ops-main-roads': GIS_SOURCE_OPS_LAYERS.mainRoads,
  'lyr-ops-internal-roads': GIS_SOURCE_OPS_LAYERS.internalRoads,
  'lyr-forest-trails': GIS_SOURCE_OPS_LAYERS.footTracks,
  'lyr-checkposts': GIS_SOURCE_OPS_LAYERS.checkPosts,
  'lyr-toll-plazas': GIS_SOURCE_OPS_LAYERS.tollPlazas,
  'lyr-entry-exit': GIS_SOURCE_OPS_LAYERS.entryExit,
  'lyr-stock-points': GIS_SOURCE_OPS_LAYERS.stockPoints,
  'lyr-ddacs': GIS_SOURCE_OPS_LAYERS.ddacs,
  'lyr-pharma-hubs': GIS_SOURCE_OPS_LAYERS.pharmaHubs,
  'lyr-hotspots': GIS_SOURCE_OPS_LAYERS.hotspots,
  'lyr-seizure-polys': GIS_SOURCE_OPS_LAYERS.ganjaSeized,
  'lyr-border-ps': GIS_SOURCE_ADMIN_LAYERS.borderPs,
  'lyr-drug-routes': GIS_SOURCE_OPS_LAYERS.dRoutes,
  'lyr-railways': GIS_SOURCE_ADMIN_LAYERS.rail,
};

export interface CalculatedRoute {
  id: string;
  name: string;
  color: string;
  points: Array<{ lat: number; lon: number }>;
  distanceKm: number;
  durationMin?: number;
  layerIds: string[];
  layerNames: string[];
  source: 'gis-network' | 'osrm';
  usedSnapConnectors: boolean;
  notes: string[];
  ops: OpsNearRoute[];
  visible: boolean;
}

interface RoadsRoutingWorkspaceProps {
  allLayers: GisLayer[];
  routingConfig: RoadsRoutingLayerConfig;
  onChangeRoutingLayerVisibility: (layerId: string, enabled: boolean) => void;
  /** Turn Eye on for every saved layer in one update (Find Routes / show networks). */
  onEnableAllSavedRoutingLayers: () => void;
  onRemoveRoutingLayer: (layerId: string) => void;
  onClearSavedLayers: () => void;
  onSwitchWorkspace: (ws: WorkspaceId) => void;
  onTriggerToast: (msg: string) => void;
}

async function loadFc(url: string): Promise<GeoJSON.FeatureCollection> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { type: 'FeatureCollection', features: [] };
    const json = await res.json();
    if (json?.type === 'FeatureCollection') return json as GeoJSON.FeatureCollection;
    return { type: 'FeatureCollection', features: [] };
  } catch {
    return { type: 'FeatureCollection', features: [] };
  }
}

export const RoadsRoutingWorkspace: React.FC<RoadsRoutingWorkspaceProps> = ({
  allLayers,
  routingConfig,
  onChangeRoutingLayerVisibility,
  onEnableAllSavedRoutingLayers: _onEnableAllSavedRoutingLayers,
  onRemoveRoutingLayer,
  onClearSavedLayers,
  onSwitchWorkspace,
  onTriggerToast,
}) => {
  const savedLayers = useMemo(
    () => routingLayersFromConfig(allLayers, routingConfig),
    [allLayers, routingConfig]
  );
  const mapFlags = useMemo(() => routingMapFlags(savedLayers), [savedLayers]);

  const [pointA, setPointA] = useState<LonLat | null>(null);
  const [pointB, setPointB] = useState<LonLat | null>(null);
  const [pinStep, setPinStep] = useState<'a' | 'b' | 'done'>('a');
  const [placing, setPlacing] = useState(false);
  const [pickedState, setPickedState] = useState<{
    name: string;
    bbox: [number, number, number, number];
  } | null>(null);
  const [boundsToken, setBoundsToken] = useState(0);
  const [viewToken, setViewToken] = useState(0);
  const [routeFit, setRouteFit] = useState<{
    west: number;
    south: number;
    east: number;
    north: number;
    token: number;
  } | null>(null);
  const suppressMapClickRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [routes, setRoutes] = useState<CalculatedRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const layerName = useCallback(
    (id: string) => allLayers.find((l) => l.id === id)?.name ?? id,
    [allLayers]
  );

  const handleStatePick = (feature: GeoJSON.Feature, name: string) => {
    if (placing) return;
    const bbox = featureBbox(feature);
    if (!bbox) return;
    suppressMapClickRef.current = true;
    window.setTimeout(() => {
      suppressMapClickRef.current = false;
    }, 350);
    setPickedState({ name, bbox });
    setBoundsToken((t) => t + 1);
    setPlacing(true);
    setPinStep(pointA && !pointB ? 'b' : pointA && pointB ? 'done' : 'a');
    onTriggerToast(
      `${name} zoomed in. Neighbouring states stay visible — click the map to place Point A, then Point B.`
    );
  };

  const handleMapClick = (lat: number, lon: number) => {
    if (suppressMapClickRef.current) {
      suppressMapClickRef.current = false;
      return;
    }
    if (!placing) return;
    if (pinStep === 'a' || (!pointA && !pointB)) {
      setPointA({ lat, lon });
      setPointB(null);
      setPinStep('b');
      setRoutes([]);
      setSelectedRouteId(null);
      setRouteFit(null);
      onTriggerToast('Point A set — click the map for Point B (destination)');
      return;
    }
    if (pinStep === 'b' || (pointA && !pointB)) {
      setPointB({ lat, lon });
      setPinStep('done');
      onTriggerToast('Point B set — save road/ops layers from catalogs, then Find Routes');
    }
  };

  const clearPoints = () => {
    setPointA(null);
    setPointB(null);
    setPinStep('a');
    setPlacing(false);
    setRoutes([]);
    setSelectedRouteId(null);
    setRouteFit(null);
    onTriggerToast('Cleared pins and routes');
  };

  const clearAllLayers = () => {
    onClearSavedLayers();
    onTriggerToast('Cleared all layers');
  };

  const fitIndia = () => {
    setPlacing(false);
    setPickedState(null);
    setRouteFit(null);
    setPinStep(pointA && !pointB ? 'b' : pointA && pointB ? 'done' : 'a');
    setViewToken((t) => t + 1);
  };

  const findRoutes = async () => {
    if (!pointA || !pointB) {
      onTriggerToast('Pin Point A and Point B on the map first');
      return;
    }
    const roadIds = savedLayers.filter((l) => isRoutableRoadLayer(l.id)).map((l) => l.id);
    if (!roadIds.length) {
      onTriggerToast(
        'Save at least one road-network layer (NH, AP major, OPS main/internal, or foot tracks) via Save to Roads Routing'
      );
      return;
    }
    setBusy(true);
    setRoutes([]);
    setSelectedRouteId(null);
    try {
      const collected: CalculatedRoute[] = [];
      let colorIdx = 0;
      const nextColor = () => ROUTE_COLORS[colorIdx++ % ROUTE_COLORS.length];

      // Combined GIS road graph from ALL saved routable layers (corridor-clipped for performance).
      const graphLayers: Array<{ layerId: string; fc: GeoJSON.FeatureCollection }> = [];
      const loadNotes: string[] = [];
      const corridorPad = 0.55;
      const bbox = {
        west: Math.min(pointA.lon, pointB.lon) - corridorPad,
        south: Math.min(pointA.lat, pointB.lat) - corridorPad,
        east: Math.max(pointA.lon, pointB.lon) + corridorPad,
        north: Math.max(pointA.lat, pointB.lat) + corridorPad,
      };
      for (const id of roadIds) {
        const url = LAYER_FC_URL[id];
        if (!url) continue;
        // PostGIS layers must be requested with bbox (full network is too large otherwise).
        let fetchUrl = url;
        if (url.startsWith('/api/gis-roads')) {
          const layer =
            id === 'lyr-highways' ? 'nh' : id === 'lyr-ap-roads-full' ? 'full' : id === 'lyr-ops-vsp-roads' ? 'vsp' : null;
          if (!layer) continue;
          fetchUrl = `/api/gis-roads/geojson?layer=${layer}&bbox=${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
        }
        const full = await loadFc(fetchUrl);
        const clipped = url.startsWith('/api/gis-roads')
          ? full
          : filterFcByCorridor(full, pointA, pointB, corridorPad);
        if (!clipped.features.length) {
          loadNotes.push(`${layerName(id)}: no segments in the A–B corridor.`);
          continue;
        }
        loadNotes.push(
          `${layerName(id)}: ${clipped.features.length} segments in corridor.`
        );
        graphLayers.push({ layerId: id, fc: clipped });
      }

      if (graphLayers.length) {
        const graph = buildRoadGraph(graphLayers, {
          maxVerticesPerLine: 220,
          endpointSnapM: 60,
        });
        const stats = graphStats(graph);
        const networkHits = findNetworkRoutes(graph, pointA, pointB, 5, 1500);
        for (let i = 0; i < networkHits.length; i++) {
          const hit = networkHits[i];
          const contributing = hit.layerIds.length
            ? hit.layerIds
            : graphLayers.map((g) => g.layerId);
          collected.push({
            id: `gis-${i + 1}`,
            name: `GIS network alt ${i + 1}`,
            color: nextColor(),
            points: hit.points.map((p) => ({ lat: p.lat, lon: p.lon })),
            distanceKm: hit.distanceKm,
            durationMin: estimateDurationMin(hit.distanceKm),
            layerIds: contributing,
            layerNames: contributing.map(layerName),
            source: 'gis-network',
            usedSnapConnectors: hit.usedSnapConnectors,
            notes: [
              ...hit.notes,
              `Combined network graph: ${stats.nodes} nodes / ${stats.edges} edges from ${graphLayers.length} saved road layer(s).`,
              ...loadNotes.slice(0, 4),
            ],
            ops: [],
            // Only the first alternative is Eye-on; others stay loaded but hidden.
            visible: i === 0,
          });
        }
      }

      // OSRM only as a labelled reference when GIS found nothing, or as one optional extra.
      if (collected.length === 0) {
        const osrmHits = await osrmDrivingRouteAlternatives(pointA, pointB, 3);
        for (let i = 0; i < osrmHits.length; i++) {
          const hit = osrmHits[i];
          collected.push({
            id: `osrm-${i + 1}`,
            name: `OSM reference alt ${i + 1}`,
            color: nextColor(),
            points: hit.points,
            distanceKm: hit.distanceKm,
            durationMin: hit.durationMin,
            layerIds: [],
            layerNames: [],
            source: 'osrm',
            usedSnapConnectors: false,
            notes: [
              'No continuous path on the saved GIS road layers between A and B.',
              'This path is a public OSM/OSRM reference — not derived from your saved GIS road geometries.',
              ...loadNotes.slice(0, 4),
            ],
            ops: [],
            visible: i === 0,
          });
        }
      } else if (collected.length < 3) {
        // Optional single OSM reference for comparison (does not replace GIS alts).
        const osrmHits = await osrmDrivingRouteAlternatives(pointA, pointB, 1);
        if (osrmHits[0]) {
          const hit = osrmHits[0];
          collected.push({
            id: `osrm-ref`,
            name: 'OSM reference (comparison)',
            color: nextColor(),
            points: hit.points,
            distanceKm: hit.distanceKm,
            durationMin: hit.durationMin,
            layerIds: [],
            layerNames: [],
            source: 'osrm',
            usedSnapConnectors: false,
            notes: [
              'Optional OSM/OSRM comparison only — primary alternatives above use your saved GIS road geometries.',
            ],
            ops: [],
            visible: false,
          });
        }
      }

      // Ops / admin locations near each route
      const locLayers: Array<{
        layerId: string;
        layerName: string;
        fc: GeoJSON.FeatureCollection;
      }> = [];
      for (const layer of savedLayers) {
        if (!isRoutingLocationLayer(layer.id)) continue;
        // Skip KMZ / Border PS — many points are outside AP or mislabeled (e.g. Warangal).
        if (layer.id === 'lyr-pss' || layer.id === 'lyr-border-ps') continue;
        const url = LAYER_FC_URL[layer.id];
        if (!url) continue;
        const fc = await loadFc(url);
        if (fc.features.length) {
          locLayers.push({ layerId: layer.id, layerName: layer.name, fc });
        }
      }
      for (const route of collected) {
        route.ops = analyseOpsNearRoute(
          route.points.map((p) => ({ lon: p.lon, lat: p.lat })),
          locLayers
        );
      }

      setRoutes(collected);
      // Zoom to A–B (+ routes). Saved Admin / OPS / Road layers stay Eye-off until the user
      // turns them on — they remain loaded in the Saved Layers list.
      const fitPts = [
        pointA,
        pointB,
        ...collected.flatMap((r) => r.points),
      ];
      let west = Infinity;
      let south = Infinity;
      let east = -Infinity;
      let north = -Infinity;
      for (const p of fitPts) {
        west = Math.min(west, p.lon);
        south = Math.min(south, p.lat);
        east = Math.max(east, p.lon);
        north = Math.max(north, p.lat);
      }
      if (Number.isFinite(west)) {
        const pad = 0.12;
        setRouteFit({
          west: west - pad,
          south: south - pad,
          east: east + pad,
          north: north + pad,
          token: Date.now(),
        });
      }
      for (const layer of savedLayers) {
        if (layer.enabled) onChangeRoutingLayerVisibility(layer.id, false);
      }

      if (!collected.length) {
        onTriggerToast(
          'No continuous connected path found on the saved GIS road networks between A and B'
        );
      } else {
        const gisCount = collected.filter((r) => r.source === 'gis-network').length;
        onTriggerToast(
          gisCount
            ? `Found ${gisCount} GIS network alternative(s)` +
                (collected.length > gisCount
                  ? ` + ${collected.length - gisCount} OSM reference`
                  : '')
            : `Found ${collected.length} OSM reference route(s) (GIS network did not connect A–B)`
        );
        setSelectedRouteId(collected[0].id);
      }
    } finally {
      setBusy(false);
    }
  };

  const boundsView = useMemo(() => {
    if (routeFit) {
      return {
        west: routeFit.west,
        south: routeFit.south,
        east: routeFit.east,
        north: routeFit.north,
        token: routeFit.token,
        maxZoom: 12,
        padRatio: 0.08,
      };
    }
    if (!pickedState) return null;
    const [west, south, east, north] = pickedState.bbox;
    return {
      west,
      south,
      east,
      north,
      token: boundsToken,
      maxZoom: 10,
      padRatio: 0.06,
    };
  }, [pickedState, boundsToken, routeFit]);

  const viewTarget = useMemo(
    () =>
      viewToken > 0
        ? {
            lat: INDIA_CENTER[0],
            lon: INDIA_CENTER[1],
            zoom: INDIA_DEFAULT_ZOOM,
            token: viewToken,
          }
        : undefined,
    [viewToken]
  );

  const mapHint = (() => {
    if (!placing || !pickedState) {
      return pointA || pointB
        ? 'Click a state to zoom in before placing points'
        : 'Click a state to zoom in. Pins are placed only after that zoom.';
    }
    if (pinStep === 'a') return `Point placement in ${pickedState.name} — click the map for Point A`;
    if (pinStep === 'b') return 'Click the map for Point B (destination)';
    return 'A and B set — Find Routes (saved layers stay hidden until you Eye-on)';
  })();

  const markers = useMemo(() => {
    const list: Array<{
      id: string;
      lat: number;
      lon: number;
      kind: 'hq' | 'station';
      label: string;
      badge: string;
      selected?: boolean;
    }> = [];
    if (pointA) {
      list.push({
        id: 'roads-route-a',
        lat: pointA.lat,
        lon: pointA.lon,
        kind: 'hq',
        label: 'Point A (Origin)',
        badge: 'A',
        selected: true,
      });
    }
    if (pointB) {
      list.push({
        id: 'roads-route-b',
        lat: pointB.lat,
        lon: pointB.lon,
        kind: 'station',
        label: 'Point B (Destination)',
        badge: 'B',
        selected: true,
      });
    }
    return list;
  }, [pointA, pointB]);

  const overlayRoutes = useMemo(
    () =>
      routes.map((r) => ({
        id: r.id,
        points: decimateRoutePoints(r.points),
        color: r.color,
        weight: 6,
        opacity: 0.95,
        dashArray: r.usedSnapConnectors ? '6 4' : undefined,
        visible: r.visible,
      })),
    [routes]
  );

  const selected = routes.find((r) => r.id === selectedRouteId) ?? null;
  const savedCount = savedLayers.length;

  return (
    <div className="h-full min-h-0 flex flex-col lg:flex-row overflow-hidden bg-[#e8eef4]">
      <aside className="w-full lg:w-[340px] shrink-0 border-b lg:border-b-0 lg:border-r border-outline-variant/40 bg-surface-container-lowest flex flex-col max-h-[42vh] lg:max-h-none overflow-hidden">
        <div className="p-3 border-b border-outline-variant/35 space-y-2">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-secondary" />
            <h1 className="text-sm font-bold text-primary tracking-tight">Roads Routing</h1>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={`h-7 px-2 rounded border text-[10px] font-semibold cursor-pointer ${
                placing && pinStep === 'a'
                  ? 'border-secondary bg-secondary/15 text-secondary'
                  : 'border-outline-variant/50'
              }`}
              onClick={() => {
                if (!pickedState) {
                  onTriggerToast('Click a state on the map to zoom in before placing points');
                  return;
                }
                setPlacing(true);
                setPinStep('a');
                onTriggerToast(`Click the map inside ${pickedState.name} to set Point A`);
              }}
            >
              Set A
            </button>
            <button
              type="button"
              className={`h-7 px-2 rounded border text-[10px] font-semibold cursor-pointer ${
                placing && pinStep === 'b'
                  ? 'border-secondary bg-secondary/15 text-secondary'
                  : 'border-outline-variant/50'
              }`}
              onClick={() => {
                if (!pickedState) {
                  onTriggerToast('Click a state on the map to zoom in before placing points');
                  return;
                }
                if (!pointA) {
                  onTriggerToast('Set Point A first');
                  return;
                }
                setPlacing(true);
                setPinStep('b');
                onTriggerToast('Click the map to set Point B');
              }}
            >
              Set B
            </button>
            <button
              type="button"
              className="h-7 px-2 rounded border border-outline-variant/50 text-[10px] font-semibold cursor-pointer inline-flex items-center gap-1"
              onClick={clearPoints}
            >
              <Trash2 className="w-3 h-3" /> Clear pins
            </button>
            <button
              type="button"
              className="h-7 px-2 rounded border border-outline-variant/50 text-[10px] font-semibold cursor-pointer"
              onClick={clearAllLayers}
              title="Remove every saved layer from this map"
            >
              Clear all layers
            </button>
            <button
              type="button"
              className="h-7 px-2 rounded border border-outline-variant/50 text-[10px] font-semibold cursor-pointer"
              onClick={fitIndia}
              title="Show whole India and return to state selection"
            >
              Fit India
            </button>
          </div>
          <div className="text-[10px] font-mono text-on-surface-variant space-y-0.5">
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-blue-700" />
              A:{' '}
              {pointA
                ? `${pointA.lat.toFixed(4)}, ${pointA.lon.toFixed(4)}`
                : 'not set'}
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-teal-700" />
              B:{' '}
              {pointB
                ? `${pointB.lat.toFixed(4)}, ${pointB.lon.toFixed(4)}`
                : 'not set'}
            </div>
          </div>
          <button
            type="button"
            data-testid="roads-routing-find"
            disabled={busy || !pointA || !pointB}
            onClick={() => void findRoutes()}
            className="w-full h-9 rounded bg-primary text-on-primary text-xs font-bold cursor-pointer disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            <Route className="w-3.5 h-3.5" />
            {busy ? 'Calculating…' : 'Find Routes'}
          </button>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['administrative-layers', 'Admin layers'],
                ['operational-layers', 'OPS layers'],
                ['road-network-layers', 'Road network'],
              ] as const
            ).map(([ws, label]) => (
              <button
                key={ws}
                type="button"
                onClick={() => onSwitchWorkspace(ws)}
                className="h-7 px-2 rounded bg-secondary/15 text-secondary text-[10px] font-bold cursor-pointer"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          <section>
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
              Saved layers ({savedCount})
            </h2>
            {!savedCount ? (
              <p className="text-[11px] text-on-surface-variant">
                No layers yet. Enable layers in a catalog module and click{' '}
                <strong>Save to Roads Routing</strong>.
              </p>
            ) : (
              <div className="space-y-2">
                {groupLayersByCatalogModule(savedLayers).map((group) => (
                  <div key={group.id}>
                    <h3 className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                      {group.label}
                    </h3>
                    <ul className="space-y-1.5">
                      {group.layers.map((layer) => {
                        const visible = Boolean(routingConfig[layer.id]?.enabled);
                        return (
                          <li
                            key={layer.id}
                            className="rounded border border-outline-variant/40 bg-white px-2 py-1.5 text-[11px]"
                          >
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="cursor-pointer p-0.5"
                                title={visible ? 'Hide on map' : 'Show on map'}
                                aria-label={visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                                onClick={() =>
                                  onChangeRoutingLayerVisibility(layer.id, !visible)
                                }
                              >
                                {visible ? (
                                  <Eye className="w-3.5 h-3.5 text-primary" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5 text-on-surface-variant" />
                                )}
                              </button>
                              <span className="flex-1 truncate font-medium" title={layer.name}>
                                {layer.name}
                              </span>
                              <button
                                type="button"
                                className="cursor-pointer text-error"
                                title="Remove from Roads Routing"
                                onClick={() => onRemoveRoutingLayer(layer.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            {!visible && (
                              <div className="mt-0.5 text-[9px] text-on-surface-variant pl-5">
                                Status: Hidden
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
              Route alternatives ({routes.length})
            </h2>
            {!routes.length ? (
              <p className="text-[11px] text-on-surface-variant">
                Routes appear here after Find Routes.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {routes.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRouteId(r.id)}
                      className={`w-full text-left rounded border px-2 py-1.5 cursor-pointer ${
                        selectedRouteId === r.id
                          ? 'border-primary bg-primary/5'
                          : 'border-outline-variant/40 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ background: r.color }}
                        />
                        <span className="text-[11px] font-semibold flex-1 truncate">{r.name}</span>
                        <button
                          type="button"
                          className="cursor-pointer p-0.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRoutes((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, visible: !x.visible } : x
                              )
                            );
                          }}
                        >
                          {r.visible ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <div className="text-[10px] text-on-surface-variant mt-0.5">
                        {r.distanceKm} km
                        {r.durationMin != null ? ` · ~${r.durationMin} min` : ''}
                        {' · '}
                        {r.source === 'osrm' ? 'OSM reference' : 'GIS network'}
                      </div>
                      {r.layerNames.length > 0 && (
                        <div className="text-[9px] text-on-surface-variant/90 mt-0.5 truncate">
                          Roads: {r.layerNames.join(' · ')}
                        </div>
                      )}
                      {r.ops.length > 0 && (
                        <div className="text-[9px] text-on-surface-variant/90 mt-0.5">
                          Ops: {r.ops.filter((o) => o.relation === 'along').length} along ·{' '}
                          {r.ops.filter((o) => o.relation === 'detour').length} nearby
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selected && (
            <section className="rounded border border-outline-variant/40 bg-white p-2 space-y-1.5">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-primary">
                Route detail
              </h2>
              <p className="text-[11px] font-semibold" style={{ color: selected.color }}>
                {selected.name}
              </p>
              <p className="text-[10px] text-on-surface-variant">
                Layers: {selected.layerNames.join(', ') || '—'}
              </p>
              {selected.notes.map((n) => (
                <p key={n} className="text-[10px] text-amber-800 bg-amber-50 rounded px-1.5 py-1">
                  {n}
                </p>
              ))}
              {selected.usedSnapConnectors && (
                <p className="text-[10px] text-amber-900 font-semibold">
                  Includes unverified snap connectors (dashed on map) — not mapped roads.
                </p>
              )}
              <div className="text-[10px]">
                <div className="font-bold text-on-surface-variant uppercase tracking-wider mb-0.5">
                  Along route
                </div>
                {selected.ops.filter((o) => o.relation === 'along').length === 0 ? (
                  <p className="text-on-surface-variant">None within ~450 m</p>
                ) : (
                  <ul className="space-y-0.5">
                    {selected.ops
                      .filter((o) => o.relation === 'along')
                      .slice(0, 12)
                      .map((o) => (
                        <li key={`${o.layerId}-${o.id}`}>
                          {o.name}{' '}
                          <span className="text-on-surface-variant">
                            ({o.layerName}, {o.distanceM} m)
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
              <div className="text-[10px]">
                <div className="font-bold text-on-surface-variant uppercase tracking-wider mb-0.5">
                  Detour / nearby
                </div>
                {selected.ops.filter((o) => o.relation === 'detour').length === 0 ? (
                  <p className="text-on-surface-variant">None within ~2.5 km</p>
                ) : (
                  <ul className="space-y-0.5">
                    {selected.ops
                      .filter((o) => o.relation === 'detour')
                      .slice(0, 8)
                      .map((o) => (
                        <li key={`d-${o.layerId}-${o.id}`}>
                          {o.name}{' '}
                          <span className="text-on-surface-variant">
                            ({o.layerName}, {o.distanceM} m)
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                className="text-[10px] font-semibold text-secondary cursor-pointer"
                onClick={() => setSelectedRouteId(null)}
              >
                Back to comparison
              </button>
            </section>
          )}
        </div>
      </aside>

      <div className="flex-1 min-h-0 min-w-0 relative">
        <ApLeafletMap
          className="h-full w-full"
          basemap="satellite"
          fitToState
          interactive
          clickMode={placing ? 'inspect' : 'pan'}
          onMapClick={handleMapClick}
          indiaStatePick={placing ? 'pass' : 'pick'}
          onIndiaStatePick={handleStatePick}
          selectedIndiaStateName={pickedState?.name ?? null}
          boundsView={boundsView}
          viewTarget={viewTarget}
          initialCenter={INDIA_CENTER}
          initialZoom={INDIA_DEFAULT_ZOOM}
          markers={markers}
          overlayRoutes={overlayRoutes}
          showStateBorder={false}
          showDistricts={false}
          showHighways={mapFlags.showHighways}
          roadNetworkAlwaysOn
          showApRoadsFull={mapFlags.showApRoadsFull}
          showOpsVspRoads={mapFlags.showOpsVspRoads}
          showApRoadsMajor={mapFlags.showApRoadsMajor}
          showOpsMainRoads={mapFlags.showOpsMainRoads}
          showOpsInternalRoads={mapFlags.showOpsInternalRoads}
          showTrails={mapFlags.showTrails}
          showRailways={mapFlags.showRailways}
          showAgencyRoutes={mapFlags.showAgencyRoutes}
          showPoliceStations={mapFlags.showPoliceStations}
          policeStationOpacity={mapFlags.policeStationOpacity}
          // Border PS stay off — many are mislabeled (e.g. Warangal as AP).
          showBorderPs={false}
          showCheckPosts={mapFlags.showCheckPosts}
          showTollPlazas={mapFlags.showTollPlazas}
          showEntryExit={mapFlags.showEntryExit}
          showStockPoints={mapFlags.showStockPoints}
          showDdacs={mapFlags.showDdacs}
          showPharmaHubs={mapFlags.showPharmaHubs}
          showHotspots={mapFlags.showHotspots}
          showGanjaSeized={mapFlags.showGanjaSeized}
          showAsrBoundary={mapFlags.showAsrBoundary}
          layoutRevision={`roads-routing:${savedCount}:${routes.length}`}
        />
        <div
          data-testid="roads-routing-map-hint"
          className="absolute top-2 left-2 z-[500] pointer-events-none rounded bg-white/90 border border-outline-variant/40 px-2 py-1 text-[10px] font-semibold text-primary shadow-sm"
        >
          {mapHint}
        </div>
      </div>
    </div>
  );
};
