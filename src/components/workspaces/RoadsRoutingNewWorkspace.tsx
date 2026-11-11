import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Navigation2, Plus, Satellite, Trash2, X } from 'lucide-react';
import type { GisLayer, WorkspaceId } from '../../types/gis';
import { ApLeafletMap } from '../gis/ApLeafletMap';
import { GIS_SOURCE_ADMIN_LAYERS, GIS_SOURCE_OPS_LAYERS } from '../../gis/gisSourceCatalog';
import { groupLayersByCatalogModule } from '../../gis/catalogWorkspaces';
import { INDIA_CENTER, INDIA_DEFAULT_ZOOM } from '../../data/apGeo';
import { featureBbox } from '../../gis/adminHierarchy';
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
  'lyr-ops-vsp-roads': '/api/gis-roads/geojson?layer=vsp',
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
  onEnableAllSavedLayers: () => void;
  onRemoveLayer: (layerId: string) => void;
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

function apiLayerKey(layerId: string): 'nh' | 'full' | 'vsp' | null {
  if (layerId === 'lyr-highways') return 'nh';
  if (layerId === 'lyr-ap-roads-full') return 'full';
  if (layerId === 'lyr-ops-vsp-roads') return 'vsp';
  return null;
}

function nextPoiId(existing: PoiRef[]): string {
  let n = existing.length + 1;
  const ids = new Set(existing.map((p) => p.id));
  while (ids.has(`poi-${n}`)) n += 1;
  return `poi-${n}`;
}

function poiLabel(index: number): string {
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

const EMPTY_ROUTING_NEW_CONFIG: RoadsRoutingNewLayerConfig = {};

export const RoadsRoutingNewWorkspace: React.FC<RoadsRoutingNewWorkspaceProps> = ({
  allLayers,
  routingNewConfig,
  onChangeLayerVisibility,
  onEnableAllSavedLayers: _onEnableAllSavedLayers,
  onRemoveLayer,
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

  useEffect(() => {
    if (!dropSaved || clearedConfigSigRef.current == null) return;
    const sig = JSON.stringify(routingNewConfig);
    if (sig !== clearedConfigSigRef.current && Object.keys(routingNewConfig).length > 0) {
      setDropSaved(false);
    }
  }, [dropSaved, routingNewConfig]);

  const [pois, setPois] = useState<PoiRef[]>([]);
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
    onTriggerToast(
      `${name} zoomed in. Neighbouring states stay visible — click the map to place POIs.`
    );
  };

  const handleMapClick = (lat: number, lon: number) => {
    if (suppressMapClickRef.current) {
      suppressMapClickRef.current = false;
      return;
    }
    if (!placing) return;
    setPois((prev) => {
      const id = nextPoiId(prev);
      const label = poiLabel(prev.length);
      const next = [...prev, { id, label, lat, lon }];
      onTriggerToast(
        `${label} set (${lat.toFixed(4)}, ${lon.toFixed(4)}) — add more points or Display Road Networks`
      );
      return next;
    });
    setFetchStates({});
    setHasDisplayed(false);
  };

  const removePoi = (id: string) => {
    setPois((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      return filtered.map((p, i) => ({ ...p, label: poiLabel(i) }));
    });
    setFetchStates({});
    setHasDisplayed(false);
  };

  const clearPoints = () => {
    setPois([]);
    setPlacing(false);
    onTriggerToast('Cleared pins');
  };

  const clearAllLayers = () => {
    const savedIds = routingNewLayersFromConfig(allLayers, routingNewConfig).map((l) => l.id);
    loadGenRef.current += 1;
    clearedConfigSigRef.current = JSON.stringify(routingNewConfig);
    setDropSaved(true);
    setFetchStates({});
    setHasDisplayed(false);
    setBusy(false);
    fcCacheRef.current.clear();
    onClearSavedLayers(savedIds);
    onTriggerToast('Cleared all layers');
  };

  const fitIndia = () => {
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
                const fetchUrl = `/api/gis-roads/geojson?layer=${apiLayer}&bbox=${box.west},${box.south},${box.east},${box.north}&limit=25000`;
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
    (fc: GeoJSON.FeatureCollection) => {
      if (!poiLonLats.length) return { type: 'FeatureCollection', features: [] };
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
        return {
          id: l.id,
          color: colorForRoutingNewLayer(l.id),
          weight: ROAD_NETWORK_WEIGHT,
          opacity: 1,
          fill: false,
          visible: Boolean(st && !st.loading && st.count > 0),
          data: poiLonLats.length
            ? filterCollectionToPoiAoi(raw, poiLonLats, POI_CORRIDOR_HALF_WIDTH_KM)
            : raw,
          featureStyle: (feature: GeoJSON.Feature) => {
            const stroke = routeStrokeForProperties(feature.properties);
            return stroke ? { color: stroke.color, weight: ROAD_NETWORK_WEIGHT } : null;
          },
        };
      })
      .filter((o) => o.visible && o.data.features.length > 0);
  }, [savedLayers, fetchStates, poiLonLats]);

  const markers = useMemo(() => {
    return pois.map((p, i) => ({
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      kind: MARKER_KINDS[i % MARKER_KINDS.length],
      badge: p.label,
      label: `${p.label} (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})`,
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
  const legendRows = useMemo(() => {
    const rows: Array<{ key: string; label: string; color: string; dim: boolean }> = [];
    const classified = savedLayers.filter((layer) => {
      const entries = routingNewLegendEntries(layer.id, layer.name);
      return entries.length > 1 || layer.id === 'lyr-highways';
    });
    const classSource = classified.filter((layer) => layer.enabled);
    const seenClass = new Set<string>();
    for (const layer of classSource.length ? classSource : classified) {
      for (const entry of routingNewLegendEntries(layer.id, layer.name)) {
        if (seenClass.has(entry.label)) continue;
        seenClass.add(entry.label);
        rows.push({
          key: `class-${entry.label}`,
          label: classSource.length ? entry.label : `${entry.label} · hidden`,
          color: entry.color,
          dim: classSource.length === 0,
        });
      }
    }
    for (const layer of savedLayers) {
      if (classified.includes(layer)) continue;
      const entries = routingNewLegendEntries(layer.id, layer.name);
      rows.push({
        key: layer.id,
        label: layer.enabled ? layer.name : `${layer.name} · hidden`,
        color: entries[0]?.color ?? colorForRoutingNewLayer(layer.id),
        dim: !layer.enabled,
      });
    }
    return rows;
  }, [savedLayers]);
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
    if (loadingAny) return 'Loading road networks…';
    if (placing && pickedState) {
      return pois.length
        ? `Point placement — click the map to add ${poiLabel(pois.length)}`
        : `Point placement in ${pickedState.name} — click the map to place ${poiLabel(0)}`;
    }
    if (pois.length && hasDisplayed) {
      return 'Pin corridor active — Eye-on layers show road networks between the pins';
    }
    if (pois.length) {
      return 'Pins set — Display Road Networks, then Eye-on layers (corridor between pins only)';
    }
    return 'Click a state to zoom in. Pins are placed only after that zoom.';
  })();

  return (
    <div className="h-full min-h-0 flex flex-col lg:flex-row overflow-hidden bg-[#1a1f24]">
      <aside className="w-full lg:w-[340px] shrink-0 border-b lg:border-b-0 lg:border-r border-outline-variant/40 bg-surface-container-lowest flex flex-col max-h-[46vh] lg:max-h-none overflow-hidden">
        <div className="p-3 border-b border-outline-variant/35 space-y-2">
          <div className="flex items-center gap-2">
            <Satellite className="w-4 h-4 text-secondary" />
            <h1 className="text-sm font-bold text-primary tracking-tight">Roads Routing New</h1>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={`h-7 px-2 rounded border text-[10px] font-semibold cursor-pointer inline-flex items-center gap-1 ${
                placing
                  ? 'border-secondary bg-secondary/15 text-secondary'
                  : 'border-outline-variant/50'
              }`}
              onClick={() => {
                if (!pickedState) {
                  onTriggerToast('Click a state on the map to zoom in before placing points');
                  return;
                }
                setPlacing(true);
                onTriggerToast(`Click the map inside ${pickedState.name} to add a POI`);
              }}
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

          <div className="rounded border border-outline-variant/40 bg-white/80 max-h-28 overflow-y-auto">
            {!pois.length ? (
              <p className="px-2 py-1.5 text-[10px] text-on-surface-variant">No POIs yet</p>
            ) : (
              <ul className="divide-y divide-outline-variant/25">
                {pois.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono"
                  >
                    <span className="font-bold text-primary shrink-0 w-6">{p.label}</span>
                    <span className="flex-1 truncate text-on-surface-variant">
                      {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
                    </span>
                    <button
                      type="button"
                      className="cursor-pointer text-error p-0.5"
                      title={`Remove ${p.label}`}
                      onClick={() => removePoi(p.id)}
                    >
                      <X className="w-3 h-3" />
                    </button>
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
            <button
              type="button"
              className="text-[10px] font-semibold text-secondary cursor-pointer"
              onClick={() => onSwitchWorkspace('administrative-layers')}
            >
              Admin layers
            </button>
            <span className="text-outline-variant">·</span>
            <button
              type="button"
              className="text-[10px] font-semibold text-secondary cursor-pointer"
              onClick={() => onSwitchWorkspace('operational-layers')}
            >
              OPS layers
            </button>
            <span className="text-outline-variant">·</span>
            <button
              type="button"
              className="text-[10px] font-semibold text-secondary cursor-pointer"
              onClick={() => onSwitchWorkspace('road-network-layers')}
            >
              Road network
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
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
                {groupLayersByCatalogModule(savedLayers).map((group) => (
                <div key={group.id}>
                  <h3 className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    {group.label}
                  </h3>
                <ul className="space-y-1.5">
                {group.layers.map((layer) => {
                  const st = fetchStates[layer.id];
                  const poiHits = st
                    ? Object.entries(st.byPoi)
                        .filter(([, n]) => n > 0)
                        .map(([id]) => pois.find((p) => p.id === id)?.label ?? id)
                    : [];
                  return (
                    <li
                      key={layer.id}
                      className="rounded border border-outline-variant/40 bg-white px-2 py-1.5 text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex w-3 shrink-0 flex-col gap-px" title="Legend colour">
                          {routingNewLegendEntries(layer.id, layer.name).map((entry) => (
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
                          aria-label={layer.enabled ? `Hide ${layer.name}` : `Show ${layer.name}`}
                          data-testid={`roads-routing-new-visibility-${layer.id}`}
                          onClick={() => onChangeLayerVisibility(layer.id, !layer.enabled)}
                        >
                          {layer.enabled ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-on-surface-variant" />
                          )}
                        </button>
                        <span className="flex-1 truncate font-medium">{layer.name}</span>
                        <button
                          type="button"
                          className="cursor-pointer text-error"
                          title="Remove from Roads Routing New"
                          onClick={() => onRemoveLayer(layer.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="mt-0.5 text-[9px] text-on-surface-variant pl-5 space-y-0.5">
                        {!layer.enabled && <div>Status: Hidden</div>}
                        {st?.loading && <div>Status: Loading…</div>}
                        {!st?.loading && st?.error && (
                          <div className="text-error">Status: Error — {st.error}</div>
                        )}
                        {!st?.loading && !st?.error && st && usesRoutingNewRadiusMatch(layer.id) && (
                          <>
                            <div>
                              Matching road features:{' '}
                              <strong className="text-primary">{st.count.toLocaleString()}</strong>
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
                          <div>Status: {hasDisplayed ? 'No load yet' : 'Click Display Road Networks'}</div>
                        )}
                        {layer.enabled && !usesRoutingNewRadiusMatch(layer.id) && (
                          <div>Status: On map</div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
                </div>
                ))}
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

          <section>
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
              Colour legend
            </h2>
            <ul className="space-y-1">
              {legendRows.map((row) => (
                <li
                  key={row.key}
                  className={`flex items-center gap-2 text-[10px] ${row.dim ? 'opacity-40' : ''}`}
                >
                  <span className="w-4 h-1 rounded-full" style={{ background: row.color }} />
                  <span className="truncate text-on-surface-variant">{row.label}</span>
                </li>
              ))}
            </ul>
            {totalFeatures > 0 && (
              <p className="mt-2 text-[10px] text-on-surface-variant">
                Total unique features drawn: {totalFeatures.toLocaleString()}
              </p>
            )}
          </section>
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
          markers={markers}
          geoJsonOverlays={geoJsonOverlays}
          filterMapLayers={poiLonLats.length ? filterMapLayers : undefined}
          layerClipFeature={corridorClipFeature}
          suppressUnclippedRoadTiles={poiLonLats.length > 0}
          showStateBorder={mapOn('lyr-state-border')}
          showDistricts={mapOn('lyr-districts')}
          showMandals={mapOn('lyr-mandals')}
          showVillages={mapOn('lyr-villages')}
          showPoliceStations={mapOn('lyr-pss')}
          showBorderPs={mapOn('lyr-border-ps')}
          showTalukGis={mapOn('lyr-taluk-gis')}
          showVspVillagePts={mapOn('lyr-vsp-village-pts')}
          showDistrictsGisHist={mapOn('lyr-districts-gis-hist')}
          showStateGisHist={mapOn('lyr-state-gis-hist')}
          showGraticule={mapOn('lyr-soi-grid')}
          showHighways={mapOn('lyr-highways')}
          showTrails={mapOn('lyr-forest-trails')}
          roadNetworkAlwaysOn
          showOpsMainRoads={mapOn('lyr-ops-main-roads')}
          showOpsInternalRoads={mapOn('lyr-ops-internal-roads')}
          showApRoadsMajor={mapOn('lyr-ap-roads-major')}
          showApRoadsFull={mapOn('lyr-ap-roads-full')}
          showOpsVspRoads={mapOn('lyr-ops-vsp-roads')}
          showRailways={mapOn('lyr-railways')}
          showRivers={mapOn('lyr-rivers')}
          showWaterbodies={mapOn('lyr-waterbodies')}
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
          layoutRevision={`roads-routing-new:npoi:${pois.length}:${savedLayers.map((l) => `${l.id}:${l.enabled ? 1 : 0}`).join(',')}:${totalFeatures}:${pickedState?.name ?? ''}:${placing ? 'place' : 'browse'}:corridor`}
        />
        <div
          data-testid="roads-routing-new-map-hint"
          className="absolute top-2 left-2 z-[500] pointer-events-none rounded bg-black/70 text-white px-2 py-1 text-[10px] font-semibold shadow-sm"
        >
          {mapHint}
        </div>
        {loadingAny && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[500] rounded bg-black/75 text-white px-3 py-1.5 text-[11px] font-semibold">
            Spatially matching road geometries to POIs…
          </div>
        )}
      </div>
    </div>
  );
};
