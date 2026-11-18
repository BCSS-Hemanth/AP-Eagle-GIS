import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Eye,
  EyeOff,
  Navigation2,
  Pin,
  Plus,
  Satellite,
  Trash2,
  X,
} from 'lucide-react';
import type { GisLayer, WorkspaceId } from '../../types/gis';
import { ApLeafletMap } from '../gis/ApLeafletMap';
import { SavedLayerColorPicker } from '../gis/SavedLayerColorPicker';
import { WorkspaceSidebarSplit } from '../gis/WorkspaceSidebarSplit';
import { GIS_SOURCE_ADMIN_LAYERS, GIS_SOURCE_OPS_LAYERS } from '../../gis/gisSourceCatalog';
import {
  groupLayersByCatalogModule,
  type CatalogModuleSectionId,
} from '../../gis/catalogWorkspaces';
import { INDIA_CENTER, INDIA_DEFAULT_ZOOM } from '../../data/apGeo';
import { featureBbox } from '../../gis/adminHierarchy';
import { layerColorOverridesFromConfig, normalizeLayerHexColor } from '../../gis/layerColor';
import {
  associateFeaturesWithPois,
  colorForRoutingNewLayer,
  displayRoadsForLayer,
  filterCollectionToPoiAoi,
  midViewForAoiPoints,
  POI_CORRIDOR_HALF_WIDTH_KM,
  poiCorridorClipFeature,
  radiusQueryBbox,
  routeStrokeForProperties,
  routingNewLayersFromConfig,
  routingNewLegendEntries,
  usesRoutingNewRadiusMatch,
  type PoiRef,
  type RoadsRoutingNewLayerConfig,
} from '../../gis/roadsRoutingNewLayers';

/** Known static / API sources for saved visual road layers (ids come from catalog saves). */
const LAYER_FC_URL: Record<string, string> = {
  'lyr-highways': '/api/gis-roads/geojson?layer=nh',
  'lyr-ap-roads-full': '/api/gis-roads/geojson?layer=full',
  'lyr-ap-roads-major': GIS_SOURCE_ADMIN_LAYERS.roadsMajor,
  'lyr-ops-main-roads': GIS_SOURCE_OPS_LAYERS.mainRoads,
  'lyr-ops-internal-roads': GIS_SOURCE_OPS_LAYERS.internalRoads,
  'lyr-forest-trails': GIS_SOURCE_OPS_LAYERS.footTracks,
};

const MARKER_KINDS = ['hq', 'station', 'checkpost', 'hotspot', 'seizure', 'city'] as const;

interface LayerFetchState {
  layerId: string;
  fc: GeoJSON.FeatureCollection;
  count: number;
  byPoi: Record<string, number>;
  sharedCount: number;
  error: string | null;
  loading: boolean;
}

interface RoadsRoutingNewWorkspaceProps {
  allLayers: GisLayer[];
  routingNewConfig: RoadsRoutingNewLayerConfig;
  onChangeLayerVisibility: (layerId: string, enabled: boolean) => void;
  /** Set Eye on/off for a subset of saved layers (per-section Hide All / Unhide All). */
  onSetLayersVisibility: (layerIds: string[], enabled: boolean) => void;
  onEnableAllSavedLayers: () => void;
  onRemoveLayer: (layerId: string) => void;
  /** Remove a subset of saved layers in one update (per-section Clear All). */
  onRemoveLayers: (layerIds: string[]) => void;
  onChangeLayerColor: (layerId: string, color: string) => void;
  onClearSavedLayers: (layerIds: string[]) => void;
  onSwitchWorkspace: (ws: WorkspaceId) => void;
  onTriggerToast: (msg: string) => void;
}

async function loadFc(url: string): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json?.type === 'FeatureCollection') return json as GeoJSON.FeatureCollection;
  throw new Error('Not a FeatureCollection');
}

function apiLayerKey(layerId: string): 'nh' | 'full' | null {
  if (layerId === 'lyr-highways') return 'nh';
  if (layerId === 'lyr-ap-roads-full') return 'full';
  return null;
}

interface PoiEntry {
  id: string;
  label: string;
  latText: string;
  lonText: string;
}

function nextPoiId(existing: { id: string }[]): string {
  let n = existing.length + 1;
  const ids = new Set(existing.map((p) => p.id));
  while (ids.has(`poi-${n}`)) n += 1;
  return `poi-${n}`;
}

function poiLabel(index: number): string {
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

function parseCoord(text: string): number | null {
  const t = text.trim();
  if (!t || t === '-' || t === '.' || t === '-.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function entryLonLat(p: PoiEntry): { lat: number; lon: number } | null {
  const lat = parseCoord(p.latText);
  const lon = parseCoord(p.lonText);
  if (lat == null || lon == null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function relabelPois(pois: PoiEntry[]): PoiEntry[] {
  return pois.map((p, i) => ({ ...p, label: poiLabel(i) }));
}

const EMPTY_ROUTING_NEW_CONFIG: RoadsRoutingNewLayerConfig = {};

export const RoadsRoutingNewWorkspace: React.FC<RoadsRoutingNewWorkspaceProps> = ({
  allLayers,
  routingNewConfig,
  onChangeLayerVisibility,
  onSetLayersVisibility,
  onEnableAllSavedLayers: _onEnableAllSavedLayers,
  onRemoveLayer,
  onRemoveLayers,
  onChangeLayerColor,
  onClearSavedLayers,
  onSwitchWorkspace,
  onTriggerToast,
}) => {
  const [dropSaved, setDropSaved] = useState(false);
  const clearedConfigSigRef = useRef<string | null>(null);
  const loadGenRef = useRef(0);
  const activeConfig = dropSaved ? EMPTY_ROUTING_NEW_CONFIG : routingNewConfig;
  const savedLayers = useMemo(
    () => routingNewLayersFromConfig(allLayers, activeConfig),
    [allLayers, activeConfig]
  );
  const layerColorOverrides = useMemo(
    () => layerColorOverridesFromConfig(activeConfig),
    [activeConfig]
  );
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

  useEffect(() => {
    if (!dropSaved || clearedConfigSigRef.current == null) return;
    const sig = JSON.stringify(routingNewConfig);
    if (sig !== clearedConfigSigRef.current && Object.keys(routingNewConfig).length > 0) {
      setDropSaved(false);
    }
  }, [dropSaved, routingNewConfig]);

  const [poiEntries, setPoiEntries] = useState<PoiEntry[]>([]);
  const [placing, setPlacing] = useState(false);
  const [pickedState, setPickedState] = useState<{
    name: string;
    bbox: [number, number, number, number];
  } | null>(null);
  const [boundsToken, setBoundsToken] = useState(0);
  const suppressMapClickRef = useRef(false);
  const [fetchStates, setFetchStates] = useState<Record<string, LayerFetchState>>({});
  const [busy, setBusy] = useState(false);
  const [viewToken, setViewToken] = useState(1);
  const [viewMode, setViewMode] = useState<'india' | 'aoi'>('india');
  const [hasDisplayed, setHasDisplayed] = useState(false);
  const fcCacheRef = useRef<Map<string, GeoJSON.FeatureCollection>>(new Map());

  const pois = useMemo((): PoiRef[] => {
    return poiEntries
      .map((p) => {
        const ll = entryLonLat(p);
        return ll ? { id: p.id, label: p.label, lat: ll.lat, lon: ll.lon } : null;
      })
      .filter((p): p is PoiRef => p != null);
  }, [poiEntries]);

  const invalidateNetworks = () => {
    setFetchStates({});
    setHasDisplayed(false);
  };

  /** Same map reset as Clear Pins (pins off + network matches cleared). */
  const resetMapLikeClearPins = () => {
    setPoiEntries([]);
    setPlacing(false);
    invalidateNetworks();
  };

  /** Remove saved layers; when none remain, reset map like Clear Pins. */
  const removeSavedLayersAndMaybeResetMap = (layerIds: string[]) => {
    if (!layerIds.length) return;
    const removing = new Set(layerIds);
    const remaining = savedLayers.filter((layer) => !removing.has(layer.id)).length;
    setFetchStates((prev) => {
      const next = { ...prev };
      for (const id of layerIds) delete next[id];
      return next;
    });
    if (layerIds.length === 1) {
      onRemoveLayer(layerIds[0]);
    } else {
      onRemoveLayers(layerIds);
    }
    if (remaining === 0) {
      loadGenRef.current += 1;
      setBusy(false);
      fcCacheRef.current.clear();
      resetMapLikeClearPins();
    }
  };

  const addPoint = () => {
    const label = poiLabel(poiEntries.length);
    setPoiEntries((prev) =>
      relabelPois([
        ...prev,
        {
          id: nextPoiId(prev),
          label: poiLabel(prev.length),
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

  const updatePoiCoord = (id: string, field: 'latText' | 'lonText', value: string) => {
    setPoiEntries((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
    invalidateNetworks();
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
      `${name} zoomed in. Neighbouring states stay visible — click Add Point or the map to place POIs.`
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
    setPoiEntries((prev) => {
      const emptyIdx = prev.findIndex((p) => entryLonLat(p) == null);
      if (emptyIdx >= 0) {
        const next = prev.map((p, i) =>
          i === emptyIdx ? { ...p, latText, lonText } : p
        );
        onTriggerToast(
          `Point ${next[emptyIdx].label} set (${lat.toFixed(4)}, ${lon.toFixed(4)}) — add more points or Display Road Networks`
        );
        return next;
      }
      const next = relabelPois([
        ...prev,
        {
          id: nextPoiId(prev),
          label: poiLabel(prev.length),
          latText,
          lonText,
        },
      ]);
      const created = next[next.length - 1];
      onTriggerToast(
        `Point ${created.label} set (${lat.toFixed(4)}, ${lon.toFixed(4)}) — add more points or Display Road Networks`
      );
      return next;
    });
    invalidateNetworks();
  };

  const removePoi = (id: string) => {
    setPoiEntries((prev) => relabelPois(prev.filter((p) => p.id !== id)));
    invalidateNetworks();
  };

  const clearPoints = () => {
    resetMapLikeClearPins();
    onTriggerToast('Cleared pins');
  };

  const clearAllLayers = () => {
    const savedIds = routingNewLayersFromConfig(allLayers, routingNewConfig).map((l) => l.id);
    loadGenRef.current += 1;
    clearedConfigSigRef.current = JSON.stringify(routingNewConfig);
    setDropSaved(true);
    setBusy(false);
    fcCacheRef.current.clear();
    onClearSavedLayers(savedIds);
    resetMapLikeClearPins();
    onTriggerToast('Cleared all layers');
  };

  const fitIndia = () => {
    setIndiaIsolated(true);
    setPlacing(false);
    setPickedState(null);
    setViewMode('india');
    setViewToken((t) => t + 1);
  };

  const loadNetworks = useCallback(async () => {
    if (!pois.length) {
      onTriggerToast('Place at least one POI on the map first');
      return;
    }
    if (!savedLayers.length) {
      onTriggerToast('Save layers from Admin, OPS, or Road Network, then Display Road Networks');
      return;
    }
    // Zoom to the pin corridor first — enabling dense networks at India scale
    // loads tens of thousands of SVG paths and crashes Leaflet (appendChild).
    // Layers stay Eye-off after load; user turns them on from Saved layers.
    setViewMode('aoi');
    setViewToken((t) => t + 1);

    const candidates = savedLayers.filter((l) => usesRoutingNewRadiusMatch(l.id));
    if (!candidates.length) {
      setHasDisplayed(true);
      onTriggerToast(
        `Layers loaded for ${pois.length} POI${pois.length === 1 ? '' : 's'} — Eye-on to show (no radius road networks to match)`
      );
      return;
    }

    const gen = ++loadGenRef.current;
    setBusy(true);

    const next: Record<string, LayerFetchState> = {};
    for (const layer of candidates) {
      next[layer.id] = {
        layerId: layer.id,
        fc: { type: 'FeatureCollection', features: [] },
        count: 0,
        byPoi: {},
        sharedCount: 0,
        error: null,
        loading: true,
      };
    }
    setFetchStates(next);

    await Promise.all(
      candidates.map(async (layer) => {
        const baseUrl = LAYER_FC_URL[layer.id];
        if (!baseUrl) {
          setFetchStates((prev) => {
            if (loadGenRef.current !== gen) return prev;
            return {
              ...prev,
              [layer.id]: {
                layerId: layer.id,
                fc: { type: 'FeatureCollection', features: [] },
                count: 0,
                byPoi: {},
                sharedCount: 0,
                error: 'No geometry source configured for this saved layer',
                loading: false,
              },
            };
          });
          return;
        }
        try {
          const isApi = baseUrl.startsWith('/api/gis-roads');
          let full: GeoJSON.FeatureCollection;
          if (isApi) {
            const apiLayer = apiLayerKey(layer.id);
            if (!apiLayer) throw new Error('Unknown API layer');
            const parts = await Promise.all(
              pois.map(async (poi) => {
                const box = radiusQueryBbox(poi, POI_CORRIDOR_HALF_WIDTH_KM);
                const fetchUrl = `/api/gis-roads/geojson?layer=${apiLayer}&bbox=${box.west},${box.south},${box.east},${box.north}&limit=8000`;
                const cached = fcCacheRef.current.get(fetchUrl);
                if (cached) return cached;
                const fc = await loadFc(fetchUrl);
                fcCacheRef.current.set(fetchUrl, fc);
                return fc;
              })
            );
            full = {
              type: 'FeatureCollection',
              features: parts.flatMap((part) => part.features),
            };
          } else {
            let cached = fcCacheRef.current.get(baseUrl);
            if (!cached) {
              cached = await loadFc(baseUrl);
              fcCacheRef.current.set(baseUrl, cached);
            }
            full = cached;
          }

          const display = displayRoadsForLayer(layer.id, full);
          const associated = associateFeaturesWithPois(
            display.fc,
            pois,
            POI_CORRIDOR_HALF_WIDTH_KM,
            { clip: display.clip }
          );
          const fc: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: associated.features,
          };
          setFetchStates((prev) => {
            if (loadGenRef.current !== gen) return prev;
            return {
              ...prev,
              [layer.id]: {
                layerId: layer.id,
                fc,
                count: associated.count,
                byPoi: associated.byPoi,
                sharedCount: associated.sharedCount,
                error: null,
                loading: false,
              },
            };
          });
        } catch (err) {
          setFetchStates((prev) => {
            if (loadGenRef.current !== gen) return prev;
            return {
              ...prev,
              [layer.id]: {
                layerId: layer.id,
                fc: { type: 'FeatureCollection', features: [] },
                count: 0,
                byPoi: {},
                sharedCount: 0,
                error: (err as Error).message || 'Failed to load',
                loading: false,
              },
            };
          });
        }
      })
    );

    if (loadGenRef.current !== gen) return;
    setBusy(false);
    setHasDisplayed(true);
    const n = pois.length;
    onTriggerToast(
      `Road networks loaded for ${n} POI${n === 1 ? '' : 's'} (pin corridor) — Eye-on to show`
    );
  }, [pois, savedLayers, onTriggerToast]);

  /** Half of Roads Routing route-alternative weight (6 → 3). */
  const ROAD_NETWORK_WEIGHT = 3;

  const poiLonLats = useMemo(
    () => pois.map((p) => ({ lon: p.lon, lat: p.lat })),
    [pois]
  );

  const corridorClipFeature = useMemo(
    () => (poiLonLats.length ? poiCorridorClipFeature(poiLonLats) : null),
    [poiLonLats]
  );

  const filterMapLayers = useCallback(
    (fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection => {
      if (!poiLonLats.length) {
        return { type: 'FeatureCollection', features: [] };
      }
      return filterCollectionToPoiAoi(fc, poiLonLats, POI_CORRIDOR_HALF_WIDTH_KM);
    },
    [poiLonLats]
  );

  const geoJsonOverlays = useMemo(() => {
    return savedLayers
      .filter((l) => l.enabled)
      .map((l) => {
        const st = fetchStates[l.id];
        const raw = st?.fc ?? { type: 'FeatureCollection' as const, features: [] };
        const custom = normalizeLayerHexColor(activeConfig[l.id]?.color);
        const baseColor = custom ?? colorForRoutingNewLayer(l.id);
        return {
          id: l.id,
          color: baseColor,
          weight: ROAD_NETWORK_WEIGHT,
          opacity: 1,
          fill: false,
          visible: Boolean(st && !st.loading && st.count > 0),
          data: poiLonLats.length
            ? filterCollectionToPoiAoi(raw, poiLonLats, POI_CORRIDOR_HALF_WIDTH_KM)
            : raw,
          featureStyle: (feature: GeoJSON.Feature) => {
            const stroke = routeStrokeForProperties(feature.properties);
            if (!stroke) return null;
            return {
              color: custom ?? stroke.color,
              weight: ROAD_NETWORK_WEIGHT,
            };
          },
        };
      })
      .filter((o) => o.visible && o.data.features.length > 0);
  }, [savedLayers, fetchStates, poiLonLats, activeConfig]);

  const markers = useMemo(() => {
    return pois.map((p, i) => ({
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      kind: MARKER_KINDS[i % MARKER_KINDS.length],
      badge: p.label,
      label: `Point ${p.label} (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})`,
      selected: true,
    }));
  }, [pois]);

  const viewTarget = useMemo(() => {
    if (viewMode === 'india' || !pois.length) {
      return {
        lat: INDIA_CENTER[0],
        lon: INDIA_CENTER[1],
        zoom: INDIA_DEFAULT_ZOOM,
        token: viewToken,
      };
    }
    const mid = midViewForAoiPoints(pois, POI_CORRIDOR_HALF_WIDTH_KM);
    return { ...mid, token: viewToken };
  }, [pois, viewToken, viewMode]);

  const savedCount = savedLayers.length;
  const mapOn = (id: string) => savedLayers.some((layer) => layer.id === id && layer.enabled);
  const visibleSavedIds = useMemo(
    () => new Set(savedLayers.filter((layer) => layer.enabled).map((layer) => layer.id)),
    [savedLayers]
  );
  const loadingAny = Object.values(fetchStates).some((s) => s.loading) || busy;
  const totalFeatures = Object.entries(fetchStates).reduce(
    (n, [id, s]) => n + (visibleSavedIds.has(id) ? s.count : 0),
    0
  );
  const layersWithMatches = Object.entries(fetchStates).filter(
    ([id, s]) =>
      savedLayers.some((layer) => layer.id === id) && !s.loading && !s.error && s.count > 0
  ).length;

  const boundsView = useMemo(() => {
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
  }, [pickedState, boundsToken]);

  const mapHint = (() => {
    if (showWorldOverview) return 'World view — click the map to isolate India';
    if (loadingAny) return 'Loading road networks…';
    if (placing && pickedState) {
      const nextEmpty = poiEntries.find((p) => entryLonLat(p) == null);
      if (nextEmpty) {
        return `Point placement in ${pickedState.name} — click the map for Point ${nextEmpty.label}`;
      }
      return `Point placement — click the map to add Point ${poiLabel(poiEntries.length)}`;
    }
    if (pois.length && hasDisplayed) {
      return 'Pin corridor active — Eye-on layers show road networks between the pins';
    }
    if (pois.length) {
      return 'Pins set — Display Road Networks, then Eye-on layers (corridor between pins only)';
    }
    if (poiEntries.length) {
      return 'Enter coordinates below, or click a state to zoom in before pinning on the map';
    }
    return 'Click Add Point to create Point A, or click a state to zoom in and pin on the map.';
  })();

  return (
    <div className="h-full min-h-0 overflow-hidden bg-surface flex flex-col">
      <WorkspaceSidebarSplit
        testId="roads-routing-new-split"
        asideClassName="w-full lg:w-[340px] shrink-0 border-b lg:border-b-0 lg:border-r border-outline-variant/40 ws-aside bg-surface-container-lowest flex flex-col max-h-[46vh] lg:max-h-none overflow-hidden"
        sidebar={
          <>
        <div className="p-3 border-b border-outline-variant/35 space-y-2 bg-surface-container-lowest/90">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-secondary-container/60 text-secondary">
              <Satellite className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-secondary">
                Routing
              </div>
              <h1 className="text-sm font-bold text-primary tracking-tight leading-tight">
                Roads Routing New
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
              onClick={clearAllLayers}
              title="Remove every saved layer from this map"
            >
              Clear all layers
            </button>
            <button
              type="button"
              className="h-7 px-2 rounded border border-outline-variant/50 text-[10px] font-semibold cursor-pointer"
              onClick={fitIndia}
              title="Show whole India on satellite map"
            >
              Fit India
            </button>
          </div>

          <div className="rounded border border-outline-variant/40 bg-white/80 max-h-40 overflow-y-auto">
            {!poiEntries.length ? (
              <p className="px-2 py-1.5 text-[10px] text-on-surface-variant">No points yet</p>
            ) : (
              <ul className="divide-y divide-outline-variant/25">
                {poiEntries.map((p) => (
                  <li key={p.id} className="px-2 py-1.5 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-primary shrink-0">
                        Point {p.label}
                      </span>
                      <button
                        type="button"
                        className="ml-auto cursor-pointer text-error p-0.5"
                        title={`Remove Point ${p.label}`}
                        onClick={() => removePoi(p.id)}
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
                          onChange={(e) => updatePoiCoord(p.id, 'latText', e.target.value)}
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
                          onChange={(e) => updatePoiCoord(p.id, 'lonText', e.target.value)}
                          className="mt-0.5 w-full h-7 rounded border border-outline-variant/50 bg-white px-1.5 text-[10px] font-mono"
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            data-testid="roads-routing-new-display"
            disabled={busy || pois.length === 0}
            onClick={() => {
              void loadNetworks();
            }}
            className="w-full h-9 rounded bg-secondary text-on-secondary text-xs font-bold cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <Navigation2 className="w-3.5 h-3.5" />
            {loadingAny ? 'Discovering networks…' : 'Display Road Networks'}
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

        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-3 space-y-3">
          <section>
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
              Saved layers ({savedCount})
              {hasDisplayed ? ` · ${layersWithMatches} with matches` : ''}
            </h2>
            {!savedLayers.length ? (
              <p className="text-[11px] text-on-surface-variant">
                Enable layers in Admin, OPS, or Road Network, then{' '}
                <strong>Save to Roads Routing New</strong>.
              </p>
            ) : (
              <div className="space-y-2">
                {groupLayersByCatalogModule(savedLayers).map((group) => {
                  const open = openCats[group.id];
                  const pinned = pinnedCats[group.id];
                  const allVisibleInSection =
                    group.layers.length > 0 && group.layers.every((layer) => layer.enabled);
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
                          data-testid={`roads-routing-new-pin-${group.id}`}
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
                              data-testid={`roads-routing-new-hide-unhide-${group.id}`}
                              onClick={() =>
                                onSetLayersVisibility(
                                  group.layers.map((layer) => layer.id),
                                  !allVisibleInSection
                                )
                              }
                              className="h-7 px-2.5 rounded border border-sky-300 bg-sky-100 text-sky-900 text-[10.5px] font-semibold inline-flex items-center gap-1 hover:bg-sky-200/80"
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
                              data-testid={`roads-routing-new-clear-all-${group.id}`}
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
                              const st = fetchStates[layer.id];
                              const poiHits = st
                                ? Object.entries(st.byPoi)
                                    .filter(([, n]) => n > 0)
                                    .map(
                                      ([id]) => pois.find((p) => p.id === id)?.label ?? id
                                    )
                                : [];
                              return (
                                <li
                                  key={layer.id}
                                  className="rounded border border-outline-variant/40 bg-white px-2 py-1.5 text-[11px]"
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="flex w-3 shrink-0 flex-col gap-px"
                                      title="Legend colour"
                                    >
                                      {(activeConfig[layer.id]?.color
                                        ? [
                                            {
                                              label: layer.name,
                                              color: activeConfig[layer.id]!.color!,
                                            },
                                          ]
                                        : routingNewLegendEntries(layer.id, layer.name)
                                      ).map((entry) => (
                                          <span
                                            key={entry.label}
                                            className="h-1 w-3 rounded-sm border border-black/10"
                                            style={{ background: entry.color }}
                                          />
                                        ))}
                                    </span>
                                    <button
                                      type="button"
                                      className="cursor-pointer p-0.5"
                                      title={layer.enabled ? 'Hide on map' : 'Show on map'}
                                      aria-label={
                                        layer.enabled
                                          ? `Hide ${layer.name}`
                                          : `Show ${layer.name}`
                                      }
                                      data-testid={`roads-routing-new-visibility-${layer.id}`}
                                      onClick={() =>
                                        onChangeLayerVisibility(layer.id, !layer.enabled)
                                      }
                                    >
                                      {layer.enabled ? (
                                        <Eye className="w-3.5 h-3.5 text-primary" />
                                      ) : (
                                        <EyeOff className="w-3.5 h-3.5 text-on-surface-variant" />
                                      )}
                                    </button>
                                    <span
                                      className="flex-1 truncate font-medium"
                                      title={layer.name}
                                    >
                                      {layer.name}
                                    </span>
                                    <SavedLayerColorPicker
                                      layerId={layer.id}
                                      color={activeConfig[layer.id]?.color}
                                      title={`Colour for ${layer.name}`}
                                      onChange={(color) => onChangeLayerColor(layer.id, color)}
                                    />
                                    <button
                                      type="button"
                                      className="cursor-pointer text-error"
                                      title="Remove from Roads Routing New"
                                      onClick={() =>
                                        removeSavedLayersAndMaybeResetMap([layer.id])
                                      }
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <div className="mt-0.5 text-[9px] text-on-surface-variant pl-5 space-y-0.5">
                                    {!layer.enabled && <div>Status: Hidden</div>}
                                    {st?.loading && <div>Status: Loading…</div>}
                                    {!st?.loading && st?.error && (
                                      <div className="text-error">
                                        Status: Error — {st.error}
                                      </div>
                                    )}
                                    {!st?.loading &&
                                      !st?.error &&
                                      st &&
                                      usesRoutingNewRadiusMatch(layer.id) && (
                                        <>
                                          <div>
                                            Matching road features:{' '}
                                            <strong className="text-primary">
                                              {st.count.toLocaleString()}
                                            </strong>
                                          </div>
                                          <div>
                                            {st.count > 0
                                              ? 'Loaded · matches in corridor'
                                              : 'Loaded · no matching features'}
                                            {layer.enabled ? '' : ' · hidden'}
                                          </div>
                                          {poiHits.length > 0 && (
                                            <div>
                                              Near: {poiHits.join(', ')}
                                              {st.sharedCount > 0
                                                ? ` · ${st.sharedCount.toLocaleString()} shared across POIs`
                                                : ''}
                                            </div>
                                          )}
                                        </>
                                      )}
                                    {!st && usesRoutingNewRadiusMatch(layer.id) && (
                                      <div>
                                        Status:{' '}
                                        {hasDisplayed
                                          ? 'No load yet'
                                          : 'Click Display Road Networks'}
                                      </div>
                                    )}
                                    {layer.enabled &&
                                      !usesRoutingNewRadiusMatch(layer.id) && (
                                        <div>Status: On map</div>
                                      )}
                                  </div>
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
            {hasDisplayed &&
              !loadingAny &&
              layersWithMatches === 0 &&
              savedLayers.some((l) => l.enabled && usesRoutingNewRadiusMatch(l.id)) && (
              <p className="mt-2 text-[10px] text-on-surface-variant">
                No radius-matched road features near the selected point
                {pois.length === 1 ? '' : 's'} at this buffer. Zoom in for Full / OPS map layers,
                or try a larger buffer.
              </p>
            )}
          </section>
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
            markers={markers}
            geoJsonOverlays={geoJsonOverlays}
            filterMapLayers={poiLonLats.length ? filterMapLayers : undefined}
            layerClipFeature={corridorClipFeature}
            suppressUnclippedRoadTiles={poiLonLats.length > 0}
            apOnlyPermanentStateLabels
            compactApStateLabel
            showDistricts={mapOn('lyr-districts')}
            showMandals={mapOn('lyr-mandals')}
            showVillages={mapOn('lyr-villages')}
            villageFetchMinZoom={0}
            layerColorOverrides={layerColorOverrides}
            showPoliceStations={mapOn('lyr-pss')}
            showBorderPs={mapOn('lyr-border-ps')}
            showProposedAnpr={mapOn('lyr-proposed-anpr')}
            showApNeighborStates={mapOn('lyr-ap-neighbor-states')}
            showAobDists={mapOn('lyr-aob-dists')}
            showKmzVillages={mapOn('lyr-kmz-villages')}
            showPsBorderArea={mapOn('lyr-ps-border-area')}
            showTalukGis={mapOn('lyr-taluk-gis')}
          showVspVillagePts={mapOn('lyr-vsp-village-pts')}
          showDistrictsGisHist={mapOn('lyr-districts-gis-hist')}
          showStateGisHist={mapOn('lyr-state-gis-hist')}
          showHighways={mapOn('lyr-highways')}
          showTrails={mapOn('lyr-forest-trails')}
          roadNetworkAlwaysOn
          showOpsMainRoads={mapOn('lyr-ops-main-roads')}
          showOpsInternalRoads={mapOn('lyr-ops-internal-roads')}
          showGanjaTransportRoutes={mapOn('lyr-ganja-transport-routes')}
          showRoadsAsrClassified={mapOn('lyr-roads-asr-classified')}
          showAsrRoadNetwork={mapOn('lyr-asr-road-network')}
          showRouteModeling={mapOn('lyr-route-modeling')}
          showApRoadsMajor={mapOn('lyr-ap-roads-major')}
          showApRoadsFull={mapOn('lyr-ap-roads-full')}
          showRailways={mapOn('lyr-railways')}
          showRivers={mapOn('lyr-rivers')}
          showAgencyRoutes={mapOn('lyr-drug-routes')}
          showAsrBoundary={mapOn('lyr-asr-agency')}
          showCheckPosts={mapOn('lyr-checkposts')}
          showTollPlazas={mapOn('lyr-toll-plazas')}
          showEntryExit={mapOn('lyr-entry-exit')}
          showStockPoints={mapOn('lyr-stock-points')}
          showDdacs={mapOn('lyr-ddacs')}
          showPharmaHubs={mapOn('lyr-pharma-hubs')}
          showHotspots={mapOn('lyr-hotspots')}
          showGanjaSeized={mapOn('lyr-seizure-polys')}
          initialCenter={INDIA_CENTER}
          initialZoom={INDIA_DEFAULT_ZOOM}
          viewTarget={viewTarget}
            layoutRevision={`roads-routing-new:npoi:${pois.length}:${poiEntries.length}:${savedLayers.map((l) => `${l.id}:${l.enabled ? 1 : 0}`).join(',')}:${totalFeatures}:${pickedState?.name ?? ''}:${placing ? 'place' : 'browse'}:corridor:${pois
              .map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lon.toFixed(5)}`)
              .join('|')}:${indiaIsolated ? 'in' : 'world'}`}
          />
          <div
            data-testid="roads-routing-new-map-hint"
            className="absolute top-2 left-7 z-[500] pointer-events-none rounded bg-black/70 text-white px-2 py-1 text-[10px] font-semibold shadow-sm"
          >
            {mapHint}
          </div>
          {loadingAny && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[500] rounded bg-black/75 text-white px-3 py-1.5 text-[11px] font-semibold">
              Spatially matching road geometries to POIs…
            </div>
          )}
        </div>
      </WorkspaceSidebarSplit>
    </div>
  );
};
