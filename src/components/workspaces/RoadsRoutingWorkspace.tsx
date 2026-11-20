import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Car,
  ChevronDown,
  Eye,
  EyeOff,
  Info,
  Motorbike,
  Navigation,
  PersonStanding,
  Pin,
  Plus,
  Route,
  Trash2,
  X,
} from 'lucide-react';
import type { GisLayer, WorkspaceId } from '../../types/gis';
import { ApLeafletMap } from '../gis/ApLeafletMap';
import { SavedLayerColorPicker } from '../gis/SavedLayerColorPicker';
import { WorkspaceSidebarSplit } from '../gis/WorkspaceSidebarSplit';
import { layerColorOverridesFromConfig } from '../../gis/layerColor';
import {
  isRoutableRoadLayer,
  isRoutingLocationLayer,
  isUnroutableDisplayRoadLayer,
  isPostgisRoadGeoJsonUrl,
  resolveLayerGeoJsonUrl,
  routingMapFlags,
  routingLayersFromConfig,
  type RoadsRoutingLayerConfig,
} from '../../gis/roadsRoutingLayers';
import {
  groupLayersByCatalogModule,
  type CatalogModuleSectionId,
} from '../../gis/catalogWorkspaces';
import { decimateRoutePoints } from '../../gis/mapRoadRenderSafety';
import {
  buildRoadGraph,
  estimateDurationMin,
  filterFcByCorridor,
  findNetworkRoutes,
  graphStats,
  type LonLat,
} from '../../gis/roadsRoutingGraph';
import {
  filterFcForTravelMode,
  ROUTING_TRAVEL_MODE_LABEL,
  ROUTING_TRAVEL_MODE_LAYER_LABELS,
  travelModeSpeedKmh,
  type RoutingTravelMode,
} from '../../gis/roadsRoutingTravelMode';
import { analyseOpsNearRoute, type OpsNearRoute } from '../../gis/roadsRoutingOps';
import { osrmAlignRoutePolyline, osrmDrivingRouteAlternatives } from '../../gis/osmServices';
import { featureBbox } from '../../gis/adminHierarchy';
import { INDIA_CENTER, INDIA_DEFAULT_ZOOM } from '../../data/apGeo';

const TRAVEL_MODE_OPTIONS: Array<{
  id: RoutingTravelMode;
  label: string;
  Icon: typeof Car;
}> = [
  { id: 'four-wheeler', label: 'Four-Wheeler', Icon: Car },
  { id: 'two-wheeler', label: 'Two-Wheeler', Icon: Motorbike },
  { id: 'on-foot', label: 'On Foot', Icon: PersonStanding },
];
const ROUTE_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed'] as const;
const MARKER_KINDS = ['hq', 'station', 'checkpost', 'hotspot', 'seizure', 'city'] as const;

interface RoutePointEntry {
  id: string;
  label: string;
  latText: string;
  lonText: string;
}

function pointLetter(index: number): string {
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

function nextRoutePointId(existing: RoutePointEntry[]): string {
  let n = existing.length + 1;
  const ids = new Set(existing.map((p) => p.id));
  while (ids.has(`pt-${n}`)) n += 1;
  return `pt-${n}`;
}

function parseCoord(text: string): number | null {
  const t = text.trim();
  if (!t || t === '-' || t === '.' || t === '-.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function pointLonLat(p: RoutePointEntry): LonLat | null {
  const lat = parseCoord(p.latText);
  const lon = parseCoord(p.lonText);
  if (lat == null || lon == null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function relabelPoints(points: RoutePointEntry[]): RoutePointEntry[] {
  return points.map((p, i) => ({ ...p, label: pointLetter(i) }));
}

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
  /**
   * Set Eye on/off for a subset of saved layers in one update
   * (per Saved Layers section Hide All / Unhide All).
   */
  onSetRoutingLayersVisibility: (layerIds: string[], enabled: boolean) => void;
  /** Turn Eye on for every saved layer in one update (Find Routes / show networks). */
  onEnableAllSavedRoutingLayers: () => void;
  onRemoveRoutingLayer: (layerId: string) => void;
  /** Remove a subset of saved layers in one update (per-section Clear All). */
  onRemoveRoutingLayers: (layerIds: string[]) => void;
  onChangeRoutingLayerColor: (layerId: string, color: string) => void;
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
  onSetRoutingLayersVisibility,
  onEnableAllSavedRoutingLayers: _onEnableAllSavedRoutingLayers,
  onRemoveRoutingLayer,
  onRemoveRoutingLayers,
  onChangeRoutingLayerColor,
  onClearSavedLayers,
  onSwitchWorkspace,
  onTriggerToast,
}) => {
  const savedLayers = useMemo(
    () => routingLayersFromConfig(allLayers, routingConfig),
    [allLayers, routingConfig]
  );
  const mapFlags = useMemo(() => routingMapFlags(savedLayers), [savedLayers]);
  const layerColorOverrides = useMemo(
    () => layerColorOverridesFromConfig(routingConfig),
    [routingConfig]
  );

  const [points, setPoints] = useState<RoutePointEntry[]>([]);
  /** Explicit opt-in: OSM/OSRM is never used unless the user turns this on. */
  const [osmFallbackEnabled, setOsmFallbackEnabled] = useState(false);
  /** Default: four-wheeler alternatives. Icons live only under Route Alternatives. */
  const [travelMode, setTravelMode] = useState<RoutingTravelMode>('four-wheeler');
  const [placing, setPlacing] = useState(false);
  const travelModeRef = useRef(travelMode);
  travelModeRef.current = travelMode;
  const routeGenRef = useRef(0);
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
  const [openCats, setOpenCats] = useState<Record<CatalogModuleSectionId, boolean>>({
    'administrative-layers': false,
    'operational-layers': false,
    'road-network-layers': false,
    other: false,
  });
  /** World overview until the user clicks the map (then India isolation). */
  const [indiaIsolated, setIndiaIsolated] = useState(false);
  const showWorldOverview = !indiaIsolated;
  /** When pinned, section stays expanded and ignores hover mouse-out collapse. */
  const [pinnedCats, setPinnedCats] = useState<Record<CatalogModuleSectionId, boolean>>({
    'administrative-layers': false,
    'operational-layers': false,
    'road-network-layers': false,
    other: false,
  });
  const pinnedCatsRef = useRef(pinnedCats);
  pinnedCatsRef.current = pinnedCats;
  /** Debounce hover-collapse so pin↔scrollbar moves do not flicker the section. */
  const hoverCloseTimersRef = useRef<Partial<Record<CatalogModuleSectionId, number>>>({});

  const clearCatHoverClose = useCallback((id: CatalogModuleSectionId) => {
    const timer = hoverCloseTimersRef.current[id];
    if (timer == null) return;
    window.clearTimeout(timer);
    delete hoverCloseTimersRef.current[id];
  }, []);

  const openCatOnHover = useCallback(
    (id: CatalogModuleSectionId) => {
      clearCatHoverClose(id);
      setOpenCats((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
    },
    [clearCatHoverClose]
  );

  const scheduleCatHoverClose = useCallback(
    (id: CatalogModuleSectionId) => {
      if (pinnedCatsRef.current[id]) return;
      clearCatHoverClose(id);
      hoverCloseTimersRef.current[id] = window.setTimeout(() => {
        delete hoverCloseTimersRef.current[id];
        if (pinnedCatsRef.current[id]) return;
        setOpenCats((prev) => (!prev[id] ? prev : { ...prev, [id]: false }));
      }, 280);
    },
    [clearCatHoverClose]
  );

  useEffect(
    () => () => {
      for (const timer of Object.values(hoverCloseTimersRef.current)) {
        if (timer != null) window.clearTimeout(timer);
      }
      hoverCloseTimersRef.current = {};
    },
    []
  );

  const resolvedPoints = useMemo(
    () =>
      points
        .map((p) => {
          const ll = pointLonLat(p);
          return ll ? { id: p.id, label: p.label, ...ll } : null;
        })
        .filter((p): p is LonLat & { id: string; label: string } => p != null),
    [points]
  );
  const pointA = resolvedPoints[0] ?? null;
  const pointB = resolvedPoints[1] ?? null;

  const layerName = useCallback(
    (id: string) => allLayers.find((l) => l.id === id)?.name ?? id,
    [allLayers]
  );

  const invalidateRoutes = () => {
    setRoutes([]);
    setSelectedRouteId(null);
    setRouteFit(null);
  };

  /** Same map reset as Clear Pins (pins + routes off the map). */
  const resetMapLikeClearPins = () => {
    setPoints([]);
    setPlacing(false);
    invalidateRoutes();
  };

  /** Remove saved layers; when none remain, reset map like Clear Pins. */
  const removeSavedLayersAndMaybeResetMap = (layerIds: string[]) => {
    if (!layerIds.length) return;
    const removing = new Set(layerIds);
    const remaining = savedLayers.filter((layer) => !removing.has(layer.id)).length;
    if (layerIds.length === 1) {
      onRemoveRoutingLayer(layerIds[0]);
    } else {
      onRemoveRoutingLayers(layerIds);
    }
    if (remaining === 0) {
      resetMapLikeClearPins();
    }
  };

  const addPoint = () => {
    const label = pointLetter(points.length);
    setPoints((prev) =>
      relabelPoints([
        ...prev,
        {
          id: nextRoutePointId(prev),
          label: pointLetter(prev.length),
          latText: '',
          lonText: '',
        },
      ])
    );
    if (pickedState) {
      setPlacing(true);
      onTriggerToast(
        `Point ${label} added — enter coordinates or click the map inside ${pickedState.name}`
      );
    } else {
      onTriggerToast(
        `Point ${label} added — enter latitude/longitude, or click a state to pin on the map`
      );
    }
  };

  const removePoint = (id: string) => {
    setPoints((prev) => relabelPoints(prev.filter((p) => p.id !== id)));
    invalidateRoutes();
  };

  const updatePointCoord = (id: string, field: 'latText' | 'lonText', value: string) => {
    setPoints((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
    invalidateRoutes();
  };

  const isolateIndiaIfNeeded = () => {
    if (!indiaIsolated) setIndiaIsolated(true);
  };

  const handleStatePick = (feature: GeoJSON.Feature, name: string) => {
    isolateIndiaIfNeeded();
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
    onTriggerToast(
      `${name} zoomed in. Neighbouring states stay visible — click Add Point or the map to place pins.`
    );
  };

  const handleMapClick = (lat: number, lon: number) => {
    if (suppressMapClickRef.current) {
      suppressMapClickRef.current = false;
      return;
    }
    if (!indiaIsolated) {
      setIndiaIsolated(true);
      return;
    }
    if (!placing) return;
    const latText = lat.toFixed(6);
    const lonText = lon.toFixed(6);
    setPoints((prev) => {
      const emptyIdx = prev.findIndex((p) => pointLonLat(p) == null);
      if (emptyIdx >= 0) {
        const next = prev.map((p, i) =>
          i === emptyIdx ? { ...p, latText, lonText } : p
        );
        onTriggerToast(
          `Point ${next[emptyIdx].label} set (${lat.toFixed(4)}, ${lon.toFixed(4)})`
        );
        return next;
      }
      const next = relabelPoints([
        ...prev,
        {
          id: nextRoutePointId(prev),
          label: pointLetter(prev.length),
          latText,
          lonText,
        },
      ]);
      const created = next[next.length - 1];
      onTriggerToast(
        `Point ${created.label} set (${lat.toFixed(4)}, ${lon.toFixed(4)})`
      );
      return next;
    });
    invalidateRoutes();
  };

  const clearPoints = () => {
    resetMapLikeClearPins();
    onTriggerToast('Cleared pins and routes');
  };

  const clearAllLayers = () => {
    if (savedLayers.length > 0 && !window.confirm('Remove every saved layer from Roads Routing?')) return;
    onClearSavedLayers();
    resetMapLikeClearPins();
    onTriggerToast('Cleared all layers');
  };

  const fitIndia = () => {
    setIndiaIsolated(true);
    setPlacing(false);
    setPickedState(null);
    setRouteFit(null);
    setViewToken((t) => t + 1);
  };

  const findRoutes = useCallback(async () => {
    if (!pointA || !pointB) {
      onTriggerToast('Add at least Point A and Point B with valid coordinates first');
      return;
    }
    const mode = travelModeRef.current;
    const modeLabel = ROUTING_TRAVEL_MODE_LABEL[mode];
    // Only Eye-on Road Network layers saved into this module (never unsaved / Eye-off).
    const routableSaved = savedLayers.filter(
      (l) => l.enabled && isRoutableRoadLayer(l)
    );
    if (!routableSaved.length) {
      onTriggerToast(
        'Eye-on at least one Road Network line layer in Saved layers, then Find Routes'
      );
      return;
    }
    const gen = ++routeGenRef.current;
    setBusy(true);
    // Drop previous-mode alternatives from the list and map immediately.
    setRoutes([]);
    setSelectedRouteId(null);
    try {
      const collected: CalculatedRoute[] = [];
      let colorIdx = 0;
      const nextColor = () => ROUTE_COLORS[colorIdx++ % ROUTE_COLORS.length];
      const speedKmh = travelModeSpeedKmh(mode);

      // Combined GIS graph from enabled saved Road Network layers (corridor + mode filter).
      const graphLayers: Array<{ layerId: string; fc: GeoJSON.FeatureCollection }> = [];
      const loadNotes: string[] = [];
      const corridorPad = 0.55;
      const bbox = {
        west: Math.min(pointA.lon, pointB.lon) - corridorPad,
        south: Math.min(pointA.lat, pointB.lat) - corridorPad,
        east: Math.max(pointA.lon, pointB.lon) + corridorPad,
        north: Math.max(pointA.lat, pointB.lat) + corridorPad,
      };
      for (const layer of routableSaved) {
        const url = resolveLayerGeoJsonUrl(layer);
        if (!url) {
          loadNotes.push(`${layer.name}: no GeoJSON source on catalog entry.`);
          continue;
        }
        // PostGIS extracts must be requested with bbox (full network is too large otherwise).
        let fetchUrl = url;
        if (isPostgisRoadGeoJsonUrl(url)) {
          const joiner = url.includes('?') ? '&' : '?';
          fetchUrl = `${url}${joiner}bbox=${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
        }
        const full = await loadFc(fetchUrl);
        const clipped = isPostgisRoadGeoJsonUrl(url)
          ? full
          : filterFcByCorridor(full, pointA, pointB, corridorPad);
        const modeFiltered = filterFcForTravelMode(layer.id, clipped, mode);
        if (!modeFiltered.features.length) {
          loadNotes.push(
            `${layer.name}: no ${modeLabel.toLowerCase()}-eligible segments in the A–B corridor.`
          );
          continue;
        }
        loadNotes.push(
          `${layer.name}: ${modeFiltered.features.length} ${modeLabel.toLowerCase()} segments in corridor.`
        );
        graphLayers.push({ layerId: layer.id, fc: modeFiltered });
      }

      if (graphLayers.length) {
        // Shared builder: every current/future routable LineString layer keeps full edge geometry.
        const graph = buildRoadGraph(graphLayers);
        const stats = graphStats(graph);
        // Up to 5 distinct continuous paths on the mode-filtered GIS road graph only.
        const networkHits = findNetworkRoutes(graph, pointA, pointB, 5, 1500);
        for (let i = 0; i < networkHits.length; i++) {
          const hit = networkHits[i];
          const contributing = hit.layerIds.length
            ? hit.layerIds
            : graphLayers.map((g) => g.layerId);
          const rawPoints = hit.points.map((p) => ({ lat: p.lat, lon: p.lon }));
          // Align drawn polyline to pavement on satellite basemaps (GIS graph unchanged).
          const aligned = await osrmAlignRoutePolyline(rawPoints);
          collected.push({
            id: `gis-${mode}-${i + 1}`,
            name: `${modeLabel} alt ${i + 1}`,
            color: nextColor(),
            points: aligned ?? rawPoints,
            distanceKm: hit.distanceKm,
            durationMin: estimateDurationMin(hit.distanceKm, speedKmh),
            layerIds: contributing,
            layerNames: contributing.map(layerName),
            source: 'gis-network',
            usedSnapConnectors: hit.usedSnapConnectors,
            notes: [
              ...hit.notes,
              `Travel mode: ${modeLabel}.`,
              `Combined network graph: ${stats.nodes} nodes / ${stats.edges} edges from ${graphLayers.length} enabled road layer(s).`,
              ...(aligned
                ? ['Display geometry aligned to the OSM driving network for basemap registration.']
                : []),
              ...loadNotes.slice(0, 6),
            ],
            ops: [],
            visible: true,
          });
        }
      }

      // OSM/OSRM only for wheeled modes when the user enables OSM (driving profile — not foot).
      if (osmFallbackEnabled && mode !== 'on-foot') {
        if (collected.length === 0) {
          const osrmHits = await osrmDrivingRouteAlternatives(pointA, pointB, 3);
          for (let i = 0; i < osrmHits.length; i++) {
            const hit = osrmHits[i];
            collected.push({
              id: `osrm-${mode}-${i + 1}`,
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
                `No continuous ${modeLabel.toLowerCase()} path on enabled GIS road layers between A and B.`,
                'This path is a public OSM/OSRM reference — not derived from your saved GIS road geometries.',
                ...loadNotes.slice(0, 4),
              ],
              ops: [],
              visible: i === 0,
            });
          }
        } else if (collected.length < 3) {
          const osrmHits = await osrmDrivingRouteAlternatives(pointA, pointB, 1);
          if (osrmHits[0]) {
            const hit = osrmHits[0];
            collected.push({
              id: `osrm-ref-${mode}`,
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
                'Optional OSM/OSRM comparison only — primary alternatives above use your enabled GIS road geometries.',
              ],
              ops: [],
              visible: false,
            });
          }
        }
      }

      // Ops / admin locations near each route (Eye-on location layers only).
      const locLayers: Array<{
        layerId: string;
        layerName: string;
        fc: GeoJSON.FeatureCollection;
      }> = [];
      for (const layer of savedLayers) {
        if (!layer.enabled) continue;
        if (!isRoutingLocationLayer(layer.id)) continue;
        // Skip KMZ / Border PS — many points are outside AP or mislabeled (e.g. Warangal).
        if (layer.id === 'lyr-pss' || layer.id === 'lyr-border-ps') continue;
        const url = resolveLayerGeoJsonUrl(layer);
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

      if (routeGenRef.current !== gen) return;
      setRoutes(collected);
      const fitPts = [pointA, pointB, ...collected.flatMap((r) => r.points)];
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

      if (!collected.length) {
        onTriggerToast(
          `No continuous ${modeLabel.toLowerCase()} path on enabled GIS road layers between A and B`
        );
      } else {
        const gisCount = collected.filter((r) => r.source === 'gis-network').length;
        onTriggerToast(
          gisCount
            ? `Found ${gisCount} ${modeLabel} alternative(s)` +
                (collected.length > gisCount
                  ? ` + ${collected.length - gisCount} OSM reference`
                  : '')
            : `Found ${collected.length} OSM reference route(s) (${modeLabel} GIS network did not connect A–B)`
        );
        setSelectedRouteId(collected[0].id);
      }
    } finally {
      if (routeGenRef.current === gen) setBusy(false);
    }
  }, [
    pointA,
    pointB,
    savedLayers,
    osmFallbackEnabled,
    layerName,
    onTriggerToast,
  ]);

  const selectTravelMode = (mode: RoutingTravelMode) => {
    if (mode === travelMode) return;
    travelModeRef.current = mode;
    setTravelMode(mode);
    // Drop previous-mode routes from the map immediately, then recalculate if A/B exist.
    setRoutes([]);
    setSelectedRouteId(null);
    setRouteFit(null);
    if (pointA && pointB) {
      void findRoutes();
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
    if (showWorldOverview) {
      return 'World view — click the map to isolate India';
    }
    if (!placing || !pickedState) {
      return points.length
        ? 'Enter coordinates below, or click a state to zoom in before pinning on the map'
        : 'Click Add Point to create Point A, or click a state to zoom in and pin on the map.';
    }
    const nextEmpty = points.find((p) => pointLonLat(p) == null);
    if (nextEmpty) {
      return `Point placement in ${pickedState.name} — click the map for Point ${nextEmpty.label}`;
    }
    if (pointA && pointB) {
      return 'Points set — Find Routes uses Point A → Point B (saved layers stay hidden until Eye-on)';
    }
    return `Point placement in ${pickedState.name} — click the map to add the next point`;
  })();

  const markers = useMemo(
    () =>
      resolvedPoints.map((p, i) => ({
        id: p.id,
        lat: p.lat,
        lon: p.lon,
        kind: MARKER_KINDS[i % MARKER_KINDS.length],
        label: `Point ${p.label} (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})`,
        badge: p.label,
        selected: true,
      })),
    [resolvedPoints]
  );

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
  const allRoutesVisible =
    routes.length > 0 && routes.every((r) => r.visible);

  const setAllRoutesVisible = (on: boolean) => {
    setRoutes((prev) => {
      if (!prev.length) return prev;
      if (prev.every((r) => r.visible === on)) return prev;
      return prev.map((r) => (r.visible === on ? r : { ...r, visible: on }));
    });
  };

  return (
    <div className="h-full min-h-0 overflow-hidden bg-surface flex flex-col">
      <WorkspaceSidebarSplit
        testId="roads-routing-split"
        asideClassName="w-full lg:w-[340px] shrink-0 border-b lg:border-b-0 lg:border-r border-outline-variant/40 ws-aside bg-surface-container-lowest flex flex-col max-h-[42vh] lg:max-h-none overflow-hidden"
        sidebar={
          <>
        <div className="p-3 border-b border-outline-variant/35 space-y-2 bg-surface-container-lowest/90">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-secondary-container/60 text-secondary">
              <Navigation className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-secondary">
                Routing
              </div>
              <h1 className="text-sm font-bold text-primary tracking-tight leading-tight">
                Roads Routing
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={`h-7 px-2 rounded border text-[10px] font-semibold cursor-pointer inline-flex items-center gap-1 ${
                placing
                  ? 'border-secondary bg-secondary/15 text-secondary'
                  : 'border-outline-variant/50'
              }`}
              onClick={addPoint}
            >
              <Plus className="w-3 h-3" />
              Add Point
            </button>
            <button
              type="button"
              className="h-7 px-2 rounded border border-outline-variant/50 text-[10px] font-semibold cursor-pointer"
              onClick={clearPoints}
            >
              Clear pins
            </button>
            <button
              type="button"
              className="h-7 px-2 rounded border border-outline-variant/50 text-[10px] font-semibold cursor-pointer"
              onClick={fitIndia}
              title="Show whole India and return to state selection"
            >
              Fit India
            </button>
            <button
              type="button"
              className="h-7 px-2 rounded border border-outline-variant/50 text-[10px] font-semibold cursor-pointer"
              onClick={clearAllLayers}
              title="Remove every saved layer from this map"
            >
              Clear all layers
            </button>
          </div>
          <div className="rounded border border-outline-variant/40 bg-white/80 max-h-40 overflow-y-auto">
            {!points.length ? (
              <p className="px-2 py-1.5 text-[10px] text-on-surface-variant">No points yet</p>
            ) : (
              <ul className="divide-y divide-outline-variant/25">
                {points.map((p) => (
                  <li key={p.id} className="px-2 py-1.5 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-primary shrink-0">
                        Point {p.label}
                      </span>
                      <button
                        type="button"
                        className="ml-auto cursor-pointer text-error p-0.5"
                        title={`Remove Point ${p.label}`}
                        aria-label={`Remove Point ${p.label}`}
                        onClick={() => removePoint(p.id)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="block">
                        <span className="text-[9px] font-semibold text-on-surface-variant">
                          Latitude
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={p.latText}
                          placeholder="e.g. 17.3850"
                          aria-label={`Point ${p.label} latitude`}
                          onChange={(e) => updatePointCoord(p.id, 'latText', e.target.value)}
                          className="mt-0.5 w-full h-7 rounded border border-outline-variant/50 bg-white px-1.5 text-[10px] font-mono"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[9px] font-semibold text-on-surface-variant">
                          Longitude
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={p.lonText}
                          placeholder="e.g. 78.4867"
                          aria-label={`Point ${p.label} longitude`}
                          onChange={(e) => updatePointCoord(p.id, 'lonText', e.target.value)}
                          className="mt-0.5 w-full h-7 rounded border border-outline-variant/50 bg-white px-1.5 text-[10px] font-mono"
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              data-testid="roads-routing-find"
              disabled={busy || !pointA || !pointB}
              onClick={() => void findRoutes()}
              className="flex-1 h-9 rounded bg-primary text-on-primary text-xs font-bold cursor-pointer disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              <Route className="w-3.5 h-3.5" />
              {busy ? 'Calculating…' : 'Find Routes'}
            </button>
            <button
              type="button"
              data-testid="roads-routing-osm-toggle"
              aria-pressed={osmFallbackEnabled}
              title={
                osmFallbackEnabled
                  ? 'OSM fallback on: use OpenStreetMap if saved GIS layers cannot connect A–B'
                  : 'OSM fallback off: routes use only saved GIS road layers'
              }
              onClick={() => setOsmFallbackEnabled((v) => !v)}
              className={`shrink-0 h-9 px-2.5 rounded text-[11px] font-bold cursor-pointer border transition-colors ${
                osmFallbackEnabled
                  ? 'bg-blue-900 text-white border-blue-900'
                  : 'bg-white text-on-surface border-outline-variant/60'
              }`}
            >
              {osmFallbackEnabled ? 'OSM : On' : 'OSM : Off'}
            </button>
          </div>
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

        <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] p-3 space-y-3">
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
                {groupLayersByCatalogModule(savedLayers).map((group) => {
                  const open = openCats[group.id];
                  const pinned = pinnedCats[group.id];
                  const toggleableLayers = group.layers.filter(
                    (layer) => !isUnroutableDisplayRoadLayer(layer)
                  );
                  const allVisibleInSection =
                    toggleableLayers.length > 0 &&
                    toggleableLayers.every((layer) =>
                      Boolean(routingConfig[layer.id]?.enabled)
                    );
                  return (
                    <section
                      key={group.id}
                      className="rounded border border-outline-variant/40 overflow-hidden"
                      onMouseEnter={() => openCatOnHover(group.id)}
                      onMouseLeave={() => scheduleCatHoverClose(group.id)}
                    >
                      <div className="flex items-stretch bg-surface-container-lowest">
                        <button
                          type="button"
                          className="min-w-0 flex-1 flex items-center justify-between px-2.5 py-2 text-left"
                          onClick={() =>
                            setOpenCats((prev) => ({
                              ...prev,
                              [group.id]: !prev[group.id],
                            }))
                          }
                        >
                          <span className="text-[11px] font-bold text-primary">
                            {group.label}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-on-surface-variant">
                            {group.layers.length}
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition ${open ? 'rotate-180' : ''}`}
                            />
                          </span>
                        </button>
                        <button
                          type="button"
                          data-testid={`roads-routing-pin-${group.id}`}
                          title={pinned ? 'Unpin section' : 'Pin section open'}
                          aria-pressed={pinned}
                          aria-label={
                            pinned
                              ? `Unpin ${group.label}`
                              : `Pin ${group.label} open`
                          }
                          className="shrink-0 px-2 py-2 border-l border-outline-variant/30 hover:bg-surface-container-high"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearCatHoverClose(group.id);
                            setPinnedCats((prev) => {
                              const nextPinned = !prev[group.id];
                              const next = { ...prev, [group.id]: nextPinned };
                              pinnedCatsRef.current = next;
                              if (nextPinned) {
                                setOpenCats((openPrev) =>
                                  openPrev[group.id]
                                    ? openPrev
                                    : { ...openPrev, [group.id]: true }
                                );
                              }
                              return next;
                            });
                          }}
                        >
                          <Pin
                            className={`w-3.5 h-3.5 ${
                              pinned
                                ? 'fill-primary text-primary rotate-45'
                                : 'text-on-surface-variant'
                            }`}
                          />
                        </button>
                      </div>
                      {open && (
                        <div className="bg-surface">
                          <div className="px-2.5 py-1.5 bg-surface-container-lowest/80 flex flex-wrap items-center gap-1.5 border-b border-outline-variant/30">
                            <button
                              type="button"
                              data-testid={`roads-routing-hide-unhide-${group.id}`}
                              disabled={toggleableLayers.length === 0}
                              onClick={() =>
                                onSetRoutingLayersVisibility(
                                  toggleableLayers.map((layer) => layer.id),
                                  !allVisibleInSection
                                )
                              }
                              className="h-7 px-2.5 rounded border border-sky-300 bg-sky-100 text-sky-900 text-[10.5px] font-semibold inline-flex items-center gap-1 hover:bg-sky-200/80 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {allVisibleInSection ? (
                                <>
                                  <EyeOff className="w-3 h-3" />
                                  Hide All
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3 h-3" />
                                  Unhide All
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              data-testid={`roads-routing-clear-all-${group.id}`}
                              onClick={() =>
                                removeSavedLayersAndMaybeResetMap(
                                  group.layers.map((layer) => layer.id)
                                )
                              }
                              className="h-7 px-2.5 rounded border border-error/40 bg-error/10 text-error text-[10.5px] font-semibold inline-flex items-center gap-1 hover:bg-error/15"
                            >
                              <Trash2 className="w-3 h-3" />
                              Clear All
                            </button>
                          </div>
                          <ul className="space-y-1.5 p-1.5">
                            {group.layers.map((layer) => {
                              const unroutable = isUnroutableDisplayRoadLayer(layer);
                              const visible = unroutable
                                ? false
                                : Boolean(routingConfig[layer.id]?.enabled);
                              return (
                                <li
                                  key={layer.id}
                                  className={`rounded border border-outline-variant/40 px-2 py-1.5 text-[11px] ${
                                    unroutable
                                      ? 'bg-surface-container-low/80 opacity-80'
                                      : 'bg-white'
                                  }`}
                                  data-unroutable={unroutable ? 'true' : 'false'}
                                >
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      className={`p-0.5 ${
                                        unroutable
                                          ? 'cursor-not-allowed opacity-50'
                                          : 'cursor-pointer'
                                      }`}
                                      title={
                                        unroutable
                                          ? 'Not routable — removed from map (disabled)'
                                          : visible
                                            ? 'Hide on map'
                                            : 'Show on map'
                                      }
                                      aria-label={
                                        unroutable
                                          ? `${layer.name} not routable`
                                          : visible
                                            ? `Hide ${layer.name}`
                                            : `Show ${layer.name}`
                                      }
                                      aria-disabled={unroutable}
                                      disabled={unroutable}
                                      onClick={() => {
                                        if (unroutable) return;
                                        onChangeRoutingLayerVisibility(layer.id, !visible);
                                      }}
                                    >
                                      {visible ? (
                                        <Eye className="w-3.5 h-3.5 text-primary" />
                                      ) : (
                                        <EyeOff className="w-3.5 h-3.5 text-on-surface-variant" />
                                      )}
                                    </button>
                                    <span
                                      className={`flex-1 truncate font-medium ${
                                        unroutable ? 'text-on-surface-variant' : ''
                                      }`}
                                      title={layer.name}
                                    >
                                      {layer.name}
                                    </span>
                                    {!unroutable && (
                                      <SavedLayerColorPicker
                                        layerId={layer.id}
                                        color={routingConfig[layer.id]?.color}
                                        title={`Colour for ${layer.name}`}
                                        onChange={(color) =>
                                          onChangeRoutingLayerColor(layer.id, color)
                                        }
                                      />
                                    )}
                                    <button
                                      type="button"
                                      className="cursor-pointer text-error"
                                      title="Remove from Roads Routing"
                                      aria-label={`Remove ${layer.name}`}
                                      onClick={() =>
                                        removeSavedLayersAndMaybeResetMap([layer.id])
                                      }
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                  {unroutable ? (
                                    <div className="mt-0.5 text-[9px] text-on-surface-variant pl-5">
                                      Status: Not applied · Not routable (disabled)
                                    </div>
                                  ) : !visible ? (
                                    <div className="mt-0.5 text-[9px] text-on-surface-variant pl-5">
                                      Status: Hidden
                                    </div>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant min-w-0">
                Route alternatives ({routes.length})
              </h2>
              <div className="relative group/travel-help shrink-0">
                <button
                  type="button"
                  data-testid="roads-routing-travel-mode-help"
                  aria-label="Travel mode layer description"
                  title="Travel mode layers"
                  className="h-7 w-7 rounded border border-outline-variant/50 bg-white text-on-surface-variant hover:text-primary hover:bg-surface-container inline-flex items-center justify-center cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
                <div
                  role="tooltip"
                  className="pointer-events-none invisible opacity-0 group-hover/travel-help:visible group-hover/travel-help:opacity-100 transition-opacity absolute left-0 top-full z-[40] mt-1 w-[260px] rounded border border-outline-variant/50 bg-white p-2.5 shadow-lg text-left"
                >
                  <p className="text-[10px] font-bold text-primary mb-1.5">
                    Layers used per travel mode
                  </p>
                  {(
                    [
                      ['four-wheeler', '1. Four-Wheeler'],
                      ['two-wheeler', '2. Two-Wheeler'],
                      ['on-foot', '3. By Foot'],
                    ] as const
                  ).map(([mode, heading]) => (
                    <div key={mode} className="mb-1.5 last:mb-0">
                      <div className="text-[10px] font-semibold text-secondary">{heading}</div>
                      <ul className="mt-0.5 space-y-0.5 pl-2">
                        {ROUTING_TRAVEL_MODE_LAYER_LABELS[mode].map((name) => (
                          <li
                            key={name}
                            className="text-[9.5px] text-on-surface-variant leading-snug list-disc ml-2"
                          >
                            {name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-w-0" />
              {routes.length > 0 && (
                <button
                  type="button"
                  data-testid="roads-routing-hide-unhide-routes"
                  onClick={() => setAllRoutesVisible(!allRoutesVisible)}
                  className="h-7 px-2.5 rounded border border-sky-300 bg-sky-100 text-sky-900 text-[10.5px] font-semibold inline-flex items-center gap-1 hover:bg-sky-200/80"
                >
                  {allRoutesVisible ? (
                    <>
                      <EyeOff className="w-3 h-3" />
                      Hide All
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3" />
                      Unhide All
                    </>
                  )}
                </button>
              )}
              <div
                className="inline-flex items-center gap-0.5 rounded border border-outline-variant/50 bg-white p-0.5"
                role="group"
                aria-label="Travel mode"
              >
                {TRAVEL_MODE_OPTIONS.map(({ id, label, Icon }) => {
                  const selected = travelMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={selected}
                      data-testid={`roads-routing-travel-mode-${id}`}
                      disabled={busy}
                      onClick={() => selectTravelMode(id)}
                      className={`h-7 w-7 rounded inline-flex items-center justify-center cursor-pointer disabled:opacity-50 ${
                        selected
                          ? 'bg-primary text-on-primary'
                          : 'text-on-surface-variant hover:bg-surface-container'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  );
                })}
              </div>
            </div>
            {!routes.length ? (
              <p className="text-[11px] text-on-surface-variant">
                Routes appear here after Find Routes ({ROUTING_TRAVEL_MODE_LABEL[travelMode]}).
              </p>
            ) : (
              <ul className="space-y-1.5">
                {routes.map((r) => (
                  <li key={r.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedRouteId === r.id}
                      onClick={() => setSelectedRouteId(r.id)}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setSelectedRouteId(r.id);
                        }
                      }}
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
                          title={r.visible ? 'Hide route' : 'Show route'}
                          aria-label={r.visible ? `Hide ${r.name}` : `Show ${r.name}`}
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
                    </div>
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
          </>
        }
      >
        <div className="flex-1 min-h-0 min-w-0 relative">
          <ApLeafletMap
            className="h-full w-full"
            basemap="satellite"
            fitToState={indiaIsolated}
            unconstrainedWorldView={showWorldOverview}
            suppressIndiaOverviewMask={showWorldOverview}
            interactive
            clickMode={placing || showWorldOverview ? 'inspect' : 'pan'}
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
            apOnlyPermanentStateLabels
            compactApStateLabel
            showDistricts={mapFlags.showDistricts}
            districtOpacity={mapFlags.districtOpacity}
            showMandals={mapFlags.showMandals}
            showVillages={mapFlags.showVillages}
            villageFetchMinZoom={0}
            layerColorOverrides={layerColorOverrides}
            mandalOpacity={mapFlags.mandalOpacity}
            villageOpacity={mapFlags.villageOpacity}
            showDistrictsGisHist={mapFlags.showDistrictsGisHist}
            showStateGisHist={mapFlags.showStateGisHist}
            showHighways={mapFlags.showHighways}
            roadNetworkAlwaysOn
            showApRoadsFull={mapFlags.showApRoadsFull}
            showApRoadsMajor={mapFlags.showApRoadsMajor}
            showOpsMainRoads={mapFlags.showOpsMainRoads}
            showOpsInternalRoads={mapFlags.showOpsInternalRoads}
            showGanjaTransportRoutes={mapFlags.showGanjaTransportRoutes}
            showRoadsAsrClassified={mapFlags.showRoadsAsrClassified}
            showAsrRoadNetwork={mapFlags.showAsrRoadNetwork}
            showRouteModeling={mapFlags.showRouteModeling}
            showTrails={mapFlags.showTrails}
            showRailways={mapFlags.showRailways}
            showRivers={mapFlags.showRivers}
            showAgencyRoutes={mapFlags.showAgencyRoutes}
            showPoliceStations={mapFlags.showPoliceStations}
            policeStationOpacity={mapFlags.policeStationOpacity}
            showBorderPs={mapFlags.showBorderPs}
            showProposedAnpr={mapFlags.showProposedAnpr}
            showApNeighborStates={mapFlags.showApNeighborStates}
            showAobDists={mapFlags.showAobDists}
            showKmzVillages={mapFlags.showKmzVillages}
            showPsBorderArea={mapFlags.showPsBorderArea}
            showTalukGis={mapFlags.showTalukGis}
            showVspVillagePts={mapFlags.showVspVillagePts}
            showPlaces={mapFlags.showPlaces}
            showCheckPosts={mapFlags.showCheckPosts}
            showTollPlazas={mapFlags.showTollPlazas}
            showEntryExit={mapFlags.showEntryExit}
            showStockPoints={mapFlags.showStockPoints}
            showDdacs={mapFlags.showDdacs}
            showPharmaHubs={mapFlags.showPharmaHubs}
            showHotspots={mapFlags.showHotspots}
            showGanjaSeized={mapFlags.showGanjaSeized}
            showAsrBoundary={mapFlags.showAsrBoundary}
            showSoiTopo={mapFlags.showSoiTopo}
            layoutRevision={`roads-routing:${savedLayers
              .filter((l) => l.enabled)
              .map((l) => l.id)
              .sort()
              .join(',')}:${routes.length}:pts:${resolvedPoints
              .map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lon.toFixed(5)}`)
              .join('|')}:${indiaIsolated ? 'in' : 'world'}`}
          />
          <div
            data-testid="roads-routing-map-hint"
            className="absolute top-2 left-7 z-[500] pointer-events-none rounded bg-white/90 border border-outline-variant/40 px-2 py-1 text-[10px] font-semibold text-primary shadow-sm"
          >
            {mapHint}
          </div>
        </div>
      </WorkspaceSidebarSplit>
    </div>
  );
};
