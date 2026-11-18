import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Layer as LeafletLayer } from 'leaflet';
import {
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Minimize2,
  Pin,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { ApLeafletMap, type ApLeafletMapHandle } from '../gis/ApLeafletMap';
import { SavedLayerColorPicker } from '../gis/SavedLayerColorPicker';
import { WorkspaceSidebarSplit } from '../gis/WorkspaceSidebarSplit';
import { normalizeLayerColorMap, normalizeLayerHexColor } from '../../gis/layerColor';
import type { BasemapId } from '../../types/gis';
import {
  featureBbox,
  filterCollectionToParent,
  STATE_ADMIN_DRILL,
  type AdminDrill,
} from '../../gis/adminHierarchy';
import {
  ATLAS_DISTRICTS,
  ATLAS_DEFAULT_DISTRICT_ID,
  atlasDistrictById,
  isAtlasDistrictSelectable,
} from '../../gis/atlas/atlasDistricts';
import {
  atlasHasPendingChanges,
  emptyAtlasDistrictConfig,
  getDistrictConfig,
  loadAtlasConfig,
  persistAtlasConfig,
  upsertDistrictConfig,
} from '../../gis/atlas/atlasConfig';
import { loadAtlasDistrictFeature } from '../../gis/atlas/atlasDistrictGeometry';
import {
  ATLAS_PEDAKURAPADU_ROADS_ID,
  atlasInventoryForDistrict,
  atlasLayersByCategory,
} from '../../gis/atlas/atlasInventory';
import {
  DEFAULT_ATLAS_EXPORT_DECORATIONS,
  exportAtlasMapImage,
  type AtlasExportDecorationFlags,
  type AtlasExportFormat,
  type AtlasExportResolution,
} from '../../gis/atlas/atlasExport';
import { atlasExportLegendItems } from '../../gis/atlas/atlasExportLegend';
import {
  atlasRoadHoverLabel,
  atlasRoadPathStyle,
} from '../../gis/atlas/atlasRoadClassStyles';
import { atlasLeafletFlags, atlasVisibleAppliedIds } from '../../gis/atlas/atlasMapFlags';
import type {
  AtlasConfig,
  AtlasDistrictConfig,
  AtlasLayerCategory,
} from '../../gis/atlas/atlasTypes';
import { ATLAS_CATEGORY_LABEL } from '../../gis/atlas/atlasTypes';

const CATEGORIES: AtlasLayerCategory[] = [
  'administrative',
  'operational',
  'road-network',
];

/**
 * Atlas map views:
 * 1 satellite · 2 OSM roads · 3 Esri topo · 4 Esri street
 */
export type AtlasMapViewId = 'view1' | 'view2' | 'view3' | 'view4';

const ATLAS_VIEW_BASEMAP: Record<AtlasMapViewId, BasemapId> = {
  view1: 'satellite',
  view2: 'vector',
  view3: 'esri-topo',
  view4: 'esri-street',
};

const ATLAS_VIEW_META: Record<
  AtlasMapViewId,
  { label: string; hint: string; caption: string; exportLabel: string }
> = {
  view1: {
    label: 'View 1',
    hint: 'Esri World Imagery',
    caption: 'Esri satellite',
    exportLabel: 'View 1 · satellite',
  },
  view2: {
    label: 'View 2',
    hint: 'OpenStreetMap roads',
    caption: 'OpenStreetMap roads',
    exportLabel: 'View 2 · OSM roads',
  },
  view3: {
    label: 'View 3',
    hint: 'Esri World Topographic',
    caption: 'Esri World Topographic',
    exportLabel: 'View 3 · Esri topo',
  },
  view4: {
    label: 'View 4',
    hint: 'Esri World Street Map',
    caption: 'Esri World Street Map',
    exportLabel: 'View 4 · Esri street',
  },
};

const ATLAS_VIEW_OPTIONS = (
  Object.keys(ATLAS_VIEW_META) as AtlasMapViewId[]
).map((id) => ({ id, ...ATLAS_VIEW_META[id] }));

interface AtlasWorkspaceProps {
  onTriggerToast: (msg: string) => void;
  mapExpanded?: boolean;
  onMapExpandedChange?: (expanded: boolean) => void;
}

export const AtlasWorkspace: React.FC<AtlasWorkspaceProps> = ({
  onTriggerToast,
  mapExpanded = false,
  onMapExpandedChange,
}) => {
  const mapRef = useRef<ApLeafletMapHandle>(null);
  const mapHostRef = useRef<HTMLDivElement>(null);

  // Boot clears Atlas localStorage; always start with empty composition.
  const [config, setConfig] = useState<AtlasConfig>(() => loadAtlasConfig());
  const [districtId, setDistrictId] = useState<string | null>(null);
  const [districtFeature, setDistrictFeature] = useState<GeoJSON.Feature | null>(null);
  const [loadingDistrict, setLoadingDistrict] = useState(false);
  const [displaying, setDisplaying] = useState(false);
  /** Bumps on Display / Fit district so the map reframes without isolating. */
  const [fitToken, setFitToken] = useState(0);
  /** World overview until the user clicks the map (then India isolation). */
  const [indiaIsolated, setIndiaIsolated] = useState(false);
  const setMapExpanded = (expanded: boolean) => onMapExpandedChange?.(expanded);
  const [atlasView, setAtlasView] = useState<AtlasMapViewId>('view1');
  const [viewTarget, setViewTarget] = useState<{
    lat: number;
    lon: number;
    zoom: number;
    token: number;
  } | null>(null);
  const [openCats, setOpenCats] = useState<Record<AtlasLayerCategory, boolean>>({
    administrative: false,
    operational: false,
    'road-network': false,
  });
  /** When pinned, category stays expanded and ignores hover mouse-out collapse. */
  const [pinnedCats, setPinnedCats] = useState<Record<AtlasLayerCategory, boolean>>({
    administrative: false,
    operational: false,
    'road-network': false,
  });
  const pinnedCatsRef = useRef(pinnedCats);
  pinnedCatsRef.current = pinnedCats;
  /** Debounce hover-collapse so pin↔scrollbar moves do not flicker the section. */
  const hoverCloseTimersRef = useRef<Partial<Record<AtlasLayerCategory, number>>>({});

  const clearCatHoverClose = useCallback((id: AtlasLayerCategory) => {
    const timer = hoverCloseTimersRef.current[id];
    if (timer == null) return;
    window.clearTimeout(timer);
    delete hoverCloseTimersRef.current[id];
  }, []);

  const openCatOnHover = useCallback(
    (id: AtlasLayerCategory) => {
      clearCatHoverClose(id);
      setOpenCats((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
    },
    [clearCatHoverClose]
  );

  const scheduleCatHoverClose = useCallback(
    (id: AtlasLayerCategory) => {
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

  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<AtlasExportFormat>('png');
  const [exportRes, setExportRes] = useState<AtlasExportResolution>('high');
  /** Which Atlas map view to capture on download. */
  const [exportView, setExportView] = useState<AtlasMapViewId>('view1');
  const [exportDecorations, setExportDecorations] = useState<AtlasExportDecorationFlags>(
    () => ({ ...DEFAULT_ATLAS_EXPORT_DECORATIONS })
  );
  const [exporting, setExporting] = useState(false);
  const [pedakurapaduRoads, setPedakurapaduRoads] = useState<GeoJSON.FeatureCollection | null>(null);

  const meta = atlasDistrictById(districtId ?? undefined);
  const inventory = districtId ? atlasInventoryForDistrict(districtId) : null;
  const districtCfg: AtlasDistrictConfig = districtId
    ? getDistrictConfig(config, districtId)
    : emptyAtlasDistrictConfig('');

  const selected = useMemo(
    () => new Set(districtCfg.selectedLayerIds),
    [districtCfg.selectedLayerIds]
  );
  const applied = useMemo(
    () => new Set(districtCfg.appliedLayerIds),
    [districtCfg.appliedLayerIds]
  );
  const pending = atlasHasPendingChanges(districtCfg);
  const compositionActive = districtCfg.appliedLayerIds.length > 0 && Boolean(districtFeature);
  const showWorldOverview = !indiaIsolated && !compositionActive;
  const allAppliedVisible =
    districtCfg.appliedLayerIds.length > 0 &&
    districtCfg.appliedLayerIds.every((id) => districtCfg.layerVisibility[id] !== false);

  const visibleIds = useMemo(
    () =>
      compositionActive
        ? atlasVisibleAppliedIds(districtCfg.appliedLayerIds, districtCfg.layerVisibility)
        : new Set<string>(),
    [compositionActive, districtCfg.appliedLayerIds, districtCfg.layerVisibility]
  );
  const mapFlags = useMemo(() => atlasLeafletFlags(visibleIds), [visibleIds]);
  const layerColorOverrides = useMemo(
    () => normalizeLayerColorMap(districtCfg.layerColors),
    [districtCfg.layerColors]
  );
  const showPedakurapaduRoads = visibleIds.has(ATLAS_PEDAKURAPADU_ROADS_ID);

  useEffect(() => {
    if (!showPedakurapaduRoads) return;
    let cancelled = false;
    fetch('/geo/atlas/pedakurapadu-roads.geojson')
      .then((res) => {
        if (!res.ok) throw new Error(`Pedakurapadu roads ${res.status}`);
        return res.json() as Promise<GeoJSON.FeatureCollection>;
      })
      .then((data) => {
        if (!cancelled) setPedakurapaduRoads(data);
      })
      .catch(() => {
        if (!cancelled) setPedakurapaduRoads(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showPedakurapaduRoads]);

  const pedakurapaduClipped = useMemo(
    () => (showPedakurapaduRoads ? filterCollectionToParent(pedakurapaduRoads, districtFeature) : null),
    [showPedakurapaduRoads, pedakurapaduRoads, districtFeature]
  );

  /**
   * Fit the selected district into most of the viewport with padding so
   * neighboring districts / satellite context stay visible (no clip mask).
   */
  const boundsView = useMemo(() => {
    if (!compositionActive || !districtFeature) return null;
    const bbox = featureBbox(districtFeature);
    if (!bbox) return null;
    const [west, south, east, north] = bbox;
    return {
      west,
      south,
      east,
      north,
      token: `atlas-fit:${districtId}:${fitToken}`,
      // Tight pad: selected district fills most of the view; neighbors stay visible.
      padRatio: 0.08,
      maxZoom: 11,
      lock: false,
    };
  }, [compositionActive, districtFeature, districtId, fitToken]);

  /**
   * Yellow composition frame when District Boundaries Eye is off.
   * When Eye is on, the navy districts layer alone draws the outline (no double line).
   */
  const districtHighlightOverlays = useMemo(() => {
    if (!compositionActive || !districtFeature || mapFlags.showDistricts) return [];
    return [
      {
        id: 'atlas-selected-district',
        data: {
          type: 'FeatureCollection' as const,
          features: [districtFeature],
        },
        color: '#facc15',
        weight: 3.2,
        opacity: 0.95,
        fill: false,
        fillOpacity: 0,
      },
    ];
  }, [compositionActive, districtFeature, mapFlags.showDistricts]);

  const atlasMapOverlays = useMemo(() => {
    if (!pedakurapaduClipped?.features.length) return districtHighlightOverlays;
    return [
      ...districtHighlightOverlays,
      {
        id: ATLAS_PEDAKURAPADU_ROADS_ID,
        data: pedakurapaduClipped,
        color: '#0e7490',
        weight: 2,
        opacity: 0.95,
        fill: false as const,
        fillOpacity: 0,
        interactive: true,
        featureStyle: (feature: GeoJSON.Feature) => {
          const s = atlasRoadPathStyle(feature.properties);
          return { color: s.color, weight: s.weight };
        },
        onEachFeature: (feature: GeoJSON.Feature, layer: LeafletLayer) => {
          layer.bindTooltip(atlasRoadHoverLabel(feature.properties, 'Road'), {
            sticky: true,
            direction: 'top',
            opacity: 0.96,
          });
        },
      },
    ];
  }, [districtHighlightOverlays, pedakurapaduClipped]);

  /** District-level drill so every Atlas layer is spatially restricted to the selection. */
  const atlasAdminDrill = useMemo<AdminDrill>(() => {
    if (!compositionActive || !districtFeature || !meta) return STATE_ADMIN_DRILL;
    return {
      level: 'district',
      apFocused: true,
      districtName: meta.districtName,
      districtFeature,
    };
  }, [compositionActive, districtFeature, meta]);

  const persist = (next: AtlasConfig) => {
    setConfig(next);
    persistAtlasConfig(next);
  };

  const writeDistrict = (nextDistrict: AtlasDistrictConfig, activeId = districtId) => {
    const next = upsertDistrictConfig(
      { ...config, activeDistrictId: activeId },
      nextDistrict
    );
    persist(next);
  };

  // Load district geometry when selection changes
  useEffect(() => {
    let cancelled = false;
    if (!meta || meta.status !== 'ready') {
      setDistrictFeature(null);
      return;
    }
    setLoadingDistrict(true);
    loadAtlasDistrictFeature(meta)
      .then((feature) => {
        if (cancelled) return;
        setDistrictFeature(feature);
        if (!feature) onTriggerToast(`District boundary unavailable for ${meta.name}`);
      })
      .catch(() => {
        if (!cancelled) {
          setDistrictFeature(null);
          onTriggerToast('Failed to load district boundary');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDistrict(false);
      });
    return () => {
      cancelled = true;
    };
  }, [meta, onTriggerToast]);

  const handleDistrictChange = (nextId: string) => {
    if (!isAtlasDistrictSelectable(nextId)) {
      onTriggerToast('This district inventory is not configured yet');
      return;
    }
    if (districtId && atlasHasPendingChanges(getDistrictConfig(config, districtId))) {
      const ok = window.confirm(
        'You have unapplied Atlas layer selections for the current district. Changing district will discard those pending checkboxes (saved applied maps are kept per district). Continue?'
      );
      if (!ok) return;
      // Revert pending selection to last applied for current district
      const cur = getDistrictConfig(config, districtId);
      writeDistrict({
        ...cur,
        selectedLayerIds: [...cur.appliedLayerIds],
      });
    }
    setDistrictId(nextId);
    const nextCfg = getDistrictConfig(config, nextId);
    persist({
      ...config,
      activeDistrictId: nextId,
      districts: {
        ...config.districts,
        [nextId]: nextCfg,
        ...(districtId
          ? {
              [districtId]: {
                ...getDistrictConfig(config, districtId),
                selectedLayerIds: [
                  ...getDistrictConfig(config, districtId).appliedLayerIds,
                ],
              },
            }
          : {}),
      },
    });
    onTriggerToast(
      `Atlas district: ${atlasDistrictById(nextId)?.name ?? nextId} — select layers, then Display the Layers`
    );
  };

  const toggleSelected = (layerId: string) => {
    if (!districtId || !inventory) return;
    const nextSelected = new Set(districtCfg.selectedLayerIds);
    if (nextSelected.has(layerId)) nextSelected.delete(layerId);
    else nextSelected.add(layerId);
    writeDistrict({
      ...districtCfg,
      selectedLayerIds: [...nextSelected],
    });
  };

  /** Select or clear every layer in one Atlas category (independent of other sections). */
  const setCategorySelected = (cat: AtlasLayerCategory, selectAll: boolean) => {
    if (!districtId || !inventory) return;
    const ids = atlasLayersByCategory(inventory, cat).map((row) => row.layerId);
    if (!ids.length) return;
    const nextSelected = new Set(districtCfg.selectedLayerIds);
    for (const id of ids) {
      if (selectAll) nextSelected.add(id);
      else nextSelected.delete(id);
    }
    writeDistrict({
      ...districtCfg,
      selectedLayerIds: [...nextSelected],
    });
  };

  const handleDisplayLayers = async () => {
    if (!districtId || !meta || !inventory) {
      onTriggerToast('Select a configured district first');
      return;
    }
    if (!districtCfg.selectedLayerIds.length) {
      onTriggerToast('Select at least one layer');
      return;
    }
    if (!districtFeature) {
      onTriggerToast('District boundary is still loading');
      return;
    }
    setDisplaying(true);
    try {
      const visibility: Record<string, boolean> = { ...districtCfg.layerVisibility };
      const opacity: Record<string, number> = { ...districtCfg.layerOpacity };
      const colors: Record<string, string> = { ...districtCfg.layerColors };
      for (const id of districtCfg.selectedLayerIds) {
        if (visibility[id] === undefined) visibility[id] = true;
        if (opacity[id] === undefined) opacity[id] = 100;
      }
      // Drop visibility / colours for layers no longer selected
      for (const id of Object.keys(visibility)) {
        if (!districtCfg.selectedLayerIds.includes(id)) delete visibility[id];
      }
      for (const id of Object.keys(colors)) {
        if (!districtCfg.selectedLayerIds.includes(id)) delete colors[id];
      }
      writeDistrict({
        ...districtCfg,
        appliedLayerIds: [...districtCfg.selectedLayerIds],
        layerVisibility: visibility,
        layerOpacity: opacity,
        layerColors: colors,
      });
      setFitToken((n) => n + 1);
      onTriggerToast(
        `Displayed ${districtCfg.selectedLayerIds.length} layer(s) for ${meta.name}`
      );
    } finally {
      setDisplaying(false);
    }
  };

  const setEye = (layerId: string, on: boolean) => {
    if (!districtId || !applied.has(layerId)) return;
    writeDistrict({
      ...districtCfg,
      layerVisibility: { ...districtCfg.layerVisibility, [layerId]: on },
    });
  };

  const setLayerColor = (layerId: string, color: string) => {
    if (!districtId || !applied.has(layerId)) return;
    const normalized = normalizeLayerHexColor(color);
    if (!normalized) return;
    writeDistrict({
      ...districtCfg,
      layerColors: { ...districtCfg.layerColors, [layerId]: normalized },
    });
  };

  /** Hide/show every Displayed (applied) layer — same as toggling each Eye. */
  const setAllEyes = (on: boolean) => {
    if (!districtId || !districtCfg.appliedLayerIds.length) return;
    const layerVisibility = { ...districtCfg.layerVisibility };
    for (const id of districtCfg.appliedLayerIds) {
      layerVisibility[id] = on;
    }
    writeDistrict({
      ...districtCfg,
      layerVisibility,
    });
  };

  /** Hide/show Displayed layers in one category only — does not touch other sections. */
  const setCategoryEyes = (cat: AtlasLayerCategory, on: boolean) => {
    if (!districtId || !inventory) return;
    const ids = atlasLayersByCategory(inventory, cat)
      .map((row) => row.layerId)
      .filter((id) => applied.has(id));
    if (!ids.length) return;
    const layerVisibility = { ...districtCfg.layerVisibility };
    for (const id of ids) {
      layerVisibility[id] = on;
    }
    writeDistrict({
      ...districtCfg,
      layerVisibility,
    });
  };

  const removeLayer = (layerId: string) => {
    if (!districtId) return;
    const selectedLayerIds = districtCfg.selectedLayerIds.filter((id) => id !== layerId);
    const appliedLayerIds = districtCfg.appliedLayerIds.filter((id) => id !== layerId);
    const layerVisibility = { ...districtCfg.layerVisibility };
    const layerOpacity = { ...districtCfg.layerOpacity };
    const layerColors = { ...districtCfg.layerColors };
    delete layerVisibility[layerId];
    delete layerOpacity[layerId];
    delete layerColors[layerId];
    writeDistrict({
      ...districtCfg,
      selectedLayerIds,
      appliedLayerIds,
      layerVisibility,
      layerOpacity,
      layerColors,
    });
  };

  const handleClear = () => {
    if (!districtId) return;
    writeDistrict(emptyAtlasDistrictConfig(districtId));
    onTriggerToast('Atlas layers cleared for this district');
  };

  const handleResetView = () => {
    if (!districtFeature) return;
    setFitToken((n) => n + 1);
  };

  const handleAtlasViewChange = (next: AtlasMapViewId) => {
    if (next === atlasView) return;
    const current = mapRef.current?.getView();
    if (current) {
      setViewTarget({
        lat: current.lat,
        lon: current.lon,
        zoom: current.zoom,
        token: Date.now(),
      });
    }
    setAtlasView(next);
  };

  const waitForExportView = (ms = 900) =>
    new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.setTimeout(resolve, ms);
      });
    });

  const handleExport = async () => {
    if (!compositionActive) {
      onTriggerToast('Display layers before downloading the map');
      return;
    }
    if (!visibleIds.size) {
      onTriggerToast('Turn on at least one Eye (visible layer) before export');
      return;
    }
    const el = mapHostRef.current;
    if (!el) {
      onTriggerToast('Map container not ready');
      return;
    }
    setExporting(true);
    try {
      // Switch map to the selected download view so capture matches the chosen view.
      if (exportView !== atlasView) {
        handleAtlasViewChange(exportView);
        await waitForExportView(exportView === 'view1' ? 1100 : 900);
      } else {
        await waitForExportView(200);
      }
      const base = `eagle_atlas_${districtId ?? 'map'}_${exportView}_${exportRes}`;
      const legendItems =
        exportDecorations.legend && inventory
          ? atlasExportLegendItems(visibleIds, inventory.layers)
          : [];
      const { fileName } = await exportAtlasMapImage({
        mapEl: el,
        format: exportFormat,
        resolution: exportRes,
        fileBaseName: base,
        decorations: exportDecorations,
        legendItems,
      });
      setExportOpen(false);
      onTriggerToast(
        `Downloaded ${fileName} (${ATLAS_VIEW_META[exportView].exportLabel})`
      );
    } catch (err) {
      onTriggerToast(
        err instanceof Error ? err.message : 'Map export failed — check tiles and try again'
      );
    } finally {
      setExporting(false);
    }
  };

  const canDisplay =
    Boolean(districtId) &&
    Boolean(inventory) &&
    districtCfg.selectedLayerIds.length > 0 &&
    Boolean(districtFeature) &&
    !loadingDistrict;

  useEffect(() => {
    if (!mapExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMapExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapExpanded]);

  const viewSwitcher = (
    <div
      className={`shrink-0 flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-outline-variant/40 ${
        mapExpanded
          ? 'bg-white/95 text-on-surface border-outline-variant/40 shadow-sm rounded-br-md'
          : 'bg-surface-container-lowest'
      }`}
      data-testid="atlas-view-switcher"
    >
      <span className="text-[10px] font-bold uppercase tracking-wide mr-1 text-on-surface-variant">
        Map view
      </span>
      {ATLAS_VIEW_OPTIONS.map((opt) => {
        const active = atlasView === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            data-testid={`atlas-${opt.id}`}
            title={opt.hint}
            aria-pressed={active}
            onClick={() => handleAtlasViewChange(opt.id)}
            className={`h-7 px-2.5 rounded text-[11px] font-bold transition-colors ${
              active
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container border border-outline-variant/50 text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
      <span className="text-[10px] ml-1 truncate text-on-surface-variant">
        {ATLAS_VIEW_META[atlasView].caption}
      </span>
    </div>
  );

  const mapStage = (
    <div className="flex-1 h-full min-h-0 min-w-0 relative" ref={mapHostRef} data-testid="atlas-map-host">
      <ApLeafletMap
        ref={mapRef}
        className="h-full w-full"
        basemap={ATLAS_VIEW_BASEMAP[atlasView]}
        fitToState={indiaIsolated && !compositionActive}
        unconstrainedWorldView={showWorldOverview}
        suppressIndiaOverviewMask={showWorldOverview}
        interactive
        highlightApFill={false}
        autoSatelliteOverlay={false}
        autoPlaceLabelsOnDrill={false}
        maskOutsideDrill={false}
        autoAdminOverlays={false}
        classifyAtlasRoadTypes
        showScale={false}
        apOnlyPermanentStateLabels
        compactApStateLabel
        layerColorOverrides={layerColorOverrides}
        showDistricts={mapFlags.showDistricts}
        districtOpacity={mapFlags.districtOpacity}
        stateOpacity={mapFlags.stateOpacity}
        showMandals={mapFlags.showMandals}
        showVillages={mapFlags.showVillages}
        mandalOpacity={mapFlags.mandalOpacity}
        villageOpacity={mapFlags.villageOpacity}
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
        showDistrictsGisHist={mapFlags.showDistrictsGisHist}
        showStateGisHist={mapFlags.showStateGisHist}
        showHighways={mapFlags.showHighways}
        showApRoadsFull={mapFlags.showApRoadsFull}
        showApRoadsMajor={mapFlags.showApRoadsMajor}
        showTrails={mapFlags.showTrails}
        showOpsMainRoads={mapFlags.showOpsMainRoads}
        showOpsInternalRoads={mapFlags.showOpsInternalRoads}
        showGanjaTransportRoutes={mapFlags.showGanjaTransportRoutes}
        showRoadsAsrClassified={mapFlags.showRoadsAsrClassified}
        showAsrRoadNetwork={mapFlags.showAsrRoadNetwork}
        showRouteModeling={mapFlags.showRouteModeling}
        showRailways={mapFlags.showRailways}
        showRivers={mapFlags.showRivers}
        showAgencyRoutes={mapFlags.showAgencyRoutes}
        showAsrBoundary={mapFlags.showAsrBoundary}
        showCheckPosts={mapFlags.showCheckPosts}
        showTollPlazas={mapFlags.showTollPlazas}
        showEntryExit={mapFlags.showEntryExit}
        entryExitTypeLabels={mapFlags.showEntryExit}
        showStockPoints={mapFlags.showStockPoints}
        showDdacs={mapFlags.showDdacs}
        showPharmaHubs={mapFlags.showPharmaHubs}
        showHotspots={mapFlags.showHotspots}
        showGanjaSeized={mapFlags.showGanjaSeized}
        showPlaces={false}
        adminDrill={atlasAdminDrill}
        boundsView={boundsView}
        viewTarget={viewTarget ?? undefined}
        geoJsonOverlays={atlasMapOverlays}
        onMapClick={() => {
          if (!indiaIsolated) setIndiaIsolated(true);
        }}
        layoutRevision={`atlas:${districtId ?? 'none'}:${atlasView}:${[...visibleIds].sort().join(',')}:${compositionActive ? 'on' : 'off'}:${fitToken}:${mapExpanded ? 'full' : 'shell'}:${indiaIsolated ? 'in' : 'world'}:${Object.entries(layerColorOverrides)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, c]) => `${id}:${c}`)
          .join('|')}`}
      />
      <div className="absolute top-2 left-2 z-[500] pointer-events-none rounded bg-black/70 text-white px-2 py-1 text-[10px] font-semibold shadow-sm">
        {showWorldOverview
          ? 'World view — click the map to isolate India'
          : !districtId
            ? 'Select a district to compose an Atlas map'
            : loadingDistrict
              ? 'Loading district boundary…'
              : !compositionActive
                ? 'Select layers, then Display the Layers'
                : `${meta?.name ?? 'District'} · ${visibleIds.size} visible`}
      </div>
      {compositionActive && (
        <button
          type="button"
          className="absolute top-2 right-2 z-[500] h-8 px-2.5 rounded bg-black/70 text-white text-[10px] font-semibold"
          onClick={handleResetView}
        >
          Fit district
        </button>
      )}
    </div>
  );

  return (
    <div
      className={
        mapExpanded
          ? 'fixed inset-0 z-[900] bg-white flex flex-col'
          : 'h-full min-h-0 flex flex-col'
      }
      data-testid={mapExpanded ? 'atlas-workspace-fullscreen' : 'atlas-workspace'}
    >
      {!mapExpanded ? (
        <header className="ws-page-header shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-secondary">
              M3 · Atlas
            </div>
            <h1 className="text-[15px] font-bold text-primary truncate leading-tight">
              Atlas
              {meta ? (
                <span className="text-on-surface-variant font-semibold">
                  {' '}
                  — {meta.name}
                </span>
              ) : null}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="ws-btn"
              onClick={handleClear}
              disabled={!districtId}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear
            </button>
            <button
              type="button"
              className="ws-btn"
              onClick={() => setMapExpanded(true)}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Full map
            </button>
            <button
              type="button"
              data-testid="atlas-download-map"
              className="ws-btn ws-btn-primary"
              disabled={!compositionActive || !visibleIds.size}
              onClick={() => {
                setExportView(atlasView);
                setExportOpen(true);
              }}
            >
              <Download className="w-3.5 h-3.5" />
              Download Map
            </button>
          </div>
        </header>
      ) : (
        <button
          type="button"
          data-testid="atlas-exit-fullscreen"
          onClick={() => setMapExpanded(false)}
          title="Exit full screen (Esc)"
          className="absolute top-2 right-3 z-[910] ws-btn shadow-[0_6px_18px_rgba(11,28,48,0.14)]"
        >
          <Minimize2 className="w-3.5 h-3.5" />
          Exit full screen
        </button>
      )}

      <WorkspaceSidebarSplit
        testId="atlas-sidebar-split"
        hideSidebar={mapExpanded}
        asideClassName="w-full lg:w-[340px] shrink-0 border-b lg:border-b-0 lg:border-r border-outline-variant/40 ws-aside overflow-y-auto [scrollbar-gutter:stable] max-h-[42vh] lg:max-h-none"
        sidebar={
          <>
          <div className="p-3 space-y-3">
            <label className="block">
              <span className="text-[10.5px] font-bold uppercase tracking-wide text-on-surface-variant">
                Select District
              </span>
              <select
                data-testid="atlas-district-select"
                className="mt-1 ws-field"
                value={districtId ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) handleDistrictChange(v);
                  else {
                    setDistrictId(null);
                    persist({ ...config, activeDistrictId: null });
                  }
                }}
              >
                <option value="">— Choose district —</option>
                {ATLAS_DISTRICTS.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.status !== 'ready'}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>

            {!districtId && (
              <p className="text-[11px] text-on-surface-variant">
                Select a district to enable layer configuration. Currently configured:{' '}
                <button
                  type="button"
                  className="underline font-semibold text-primary"
                  onClick={() => handleDistrictChange(ATLAS_DEFAULT_DISTRICT_ID)}
                >
                  Alluri Sitharama Raju
                </button>
                .
              </p>
            )}

            {districtId && !inventory && (
              <p className="text-[11px] text-error font-semibold">
                No verified layer inventory for this district yet.
              </p>
            )}

            {inventory && (
              <>
                <button
                  type="button"
                  data-testid="atlas-display-layers"
                  disabled={!canDisplay || displaying}
                  onClick={() => void handleDisplayLayers()}
                  className="w-full h-9 rounded bg-secondary text-on-secondary text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-45"
                >
                  <Layers className="w-3.5 h-3.5" />
                  {displaying ? 'Displaying…' : 'Display the Layers'}
                </button>
                {districtCfg.appliedLayerIds.length > 0 && (
                  <button
                    type="button"
                    data-testid="atlas-hide-unhide-all"
                    onClick={() => setAllEyes(!allAppliedVisible)}
                    className="w-full h-8 rounded border border-sky-300 bg-sky-100 text-sky-900 text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-sky-200/80"
                  >
                    {allAppliedVisible ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        Hide All Layers
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        Unhide All Layers
                      </>
                    )}
                  </button>
                )}
                {pending && (
                  <p
                    data-testid="atlas-pending-hint"
                    className="text-[10.5px] text-tertiary font-semibold"
                  >
                    Pending changes — click Display the Layers to apply.
                  </p>
                )}

                {CATEGORIES.map((cat) => {
                  const rows = atlasLayersByCategory(inventory, cat);
                  if (!rows.length) return null;
                  const open = openCats[cat];
                  const pinned = pinnedCats[cat];
                  const allSelected =
                    rows.length > 0 && rows.every((row) => selected.has(row.layerId));
                  const appliedInCat = rows.filter((row) => applied.has(row.layerId));
                  const allAppliedVisibleInCat =
                    appliedInCat.length > 0 &&
                    appliedInCat.every(
                      (row) => districtCfg.layerVisibility[row.layerId] !== false
                    );
                  return (
                    <section
                      key={cat}
                      className="rounded border border-outline-variant/40 overflow-hidden"
                      onMouseEnter={() => openCatOnHover(cat)}
                      onMouseLeave={() => scheduleCatHoverClose(cat)}
                    >
                      <div className="flex items-stretch bg-surface-container-lowest">
                        <button
                          type="button"
                          className="min-w-0 flex-1 flex items-center justify-between px-2.5 py-2 text-left"
                          onClick={() =>
                            setOpenCats((prev) => ({ ...prev, [cat]: !prev[cat] }))
                          }
                        >
                          <span className="text-[11px] font-bold text-primary">
                            {ATLAS_CATEGORY_LABEL[cat]}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-on-surface-variant">
                            {rows.length}
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition ${open ? 'rotate-180' : ''}`}
                            />
                          </span>
                        </button>
                        <button
                          type="button"
                          data-testid={`atlas-pin-${cat}`}
                          title={pinned ? 'Unpin section' : 'Pin section open'}
                          aria-pressed={pinned}
                          aria-label={
                            pinned
                              ? `Unpin ${ATLAS_CATEGORY_LABEL[cat]}`
                              : `Pin ${ATLAS_CATEGORY_LABEL[cat]} open`
                          }
                          className="shrink-0 px-2 py-2 border-l border-outline-variant/30 hover:bg-surface-container-high"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearCatHoverClose(cat);
                            setPinnedCats((prev) => {
                              const nextPinned = !prev[cat];
                              const next = { ...prev, [cat]: nextPinned };
                              pinnedCatsRef.current = next;
                              if (nextPinned) {
                                setOpenCats((openPrev) =>
                                  openPrev[cat] ? openPrev : { ...openPrev, [cat]: true }
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
                        <ul className="divide-y divide-outline-variant/30 bg-surface">
                          <li className="px-2.5 py-1.5 bg-surface-container-lowest/80 flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              data-testid={`atlas-select-all-${cat}`}
                              disabled={!districtId || rows.length === 0}
                              onClick={() => setCategorySelected(cat, !allSelected)}
                              className="h-7 px-2.5 rounded border border-sky-300 bg-sky-100 text-sky-900 text-[10.5px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sky-200/80"
                            >
                              {allSelected ? 'Unselect All' : 'Select All'}
                            </button>
                            {appliedInCat.length > 0 && (
                              <button
                                type="button"
                                data-testid={`atlas-hide-unhide-${cat}`}
                                onClick={() =>
                                  setCategoryEyes(cat, !allAppliedVisibleInCat)
                                }
                                className="h-7 px-2.5 rounded border border-sky-300 bg-sky-100 text-sky-900 text-[10.5px] font-semibold inline-flex items-center gap-1 hover:bg-sky-200/80"
                              >
                                {allAppliedVisibleInCat ? (
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
                          </li>
                          {rows.map((row) => {
                            const isSelected = selected.has(row.layerId);
                            const isApplied = applied.has(row.layerId);
                            const eyeOn = districtCfg.layerVisibility[row.layerId] !== false;
                            return (
                              <li
                                key={row.layerId}
                                className={`flex items-stretch text-[11px] ${
                                  districtId ? 'hover:bg-surface-container-low/80' : 'opacity-70'
                                }`}
                                data-testid={`atlas-layer-${row.layerId}`}
                              >
                                <label
                                  className={`flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2 ${
                                    districtId ? 'cursor-pointer' : 'cursor-not-allowed'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 accent-primary"
                                    checked={isSelected}
                                    disabled={!districtId}
                                    onChange={() => toggleSelected(row.layerId)}
                                    aria-label={`Select ${row.name}`}
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block font-semibold text-on-surface leading-snug">
                                      {row.name}
                                    </span>
                                    <span className="block text-[10px] text-on-surface-variant tabular-nums">
                                      {row.featureCount.toLocaleString()} features
                                      {row.countNote ? ` · ${row.countNote}` : ''}
                                    </span>
                                  </span>
                                </label>
                                {isApplied && (
                                  <div className="flex shrink-0 items-center gap-0.5 pr-2.5 py-2">
                                    <button
                                      type="button"
                                      title={eyeOn ? 'Hide layer' : 'Show layer'}
                                      className="p-1 rounded hover:bg-surface-container-high"
                                      onClick={() => setEye(row.layerId, !eyeOn)}
                                    >
                                      {eyeOn ? (
                                        <Eye className="w-3.5 h-3.5 text-primary" />
                                      ) : (
                                        <EyeOff className="w-3.5 h-3.5 text-on-surface-variant" />
                                      )}
                                    </button>
                                    <SavedLayerColorPicker
                                      layerId={row.layerId}
                                      color={districtCfg.layerColors[row.layerId]}
                                      title={`Colour for ${row.name}`}
                                      onChange={(color) => setLayerColor(row.layerId, color)}
                                    />
                                    <button
                                      type="button"
                                      title="Remove from Atlas"
                                      className="p-1 rounded hover:bg-surface-container-high"
                                      onClick={() => removeLayer(row.layerId)}
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-error" />
                                    </button>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </>
            )}
          </div>
          </>
        }
      >
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          {viewSwitcher}
          {mapStage}
        </div>
      </WorkspaceSidebarSplit>

      {exportOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/45 flex items-center justify-center p-4"
          role="dialog"
          aria-modal
          aria-label="Download Atlas map"
        >
          <div className="w-full max-w-md rounded-lg bg-surface-container-lowest border border-outline-variant/50 p-4 space-y-3 shadow-xl">
            <h2 className="text-sm font-bold text-primary">Download Map</h2>
            <p className="text-[11px] text-on-surface-variant">
              Exports the map viewport for the selected view (layers on, app chrome excluded).
            </p>
            <label className="block text-[11px] font-semibold">
              View
              <select
                data-testid="atlas-export-view"
                className="mt-1 w-full h-9 px-2 rounded border border-outline-variant/50 text-xs"
                value={exportView}
                onChange={(e) => setExportView(e.target.value as AtlasMapViewId)}
                disabled={exporting}
              >
                <option value="view1">View 1 — Esri satellite</option>
                <option value="view2">View 2 — OpenStreetMap roads</option>
                <option value="view3">View 3 — Esri World Topographic</option>
                <option value="view4">View 4 — Esri World Street Map</option>
              </select>
            </label>
            <label className="block text-[11px] font-semibold">
              Format
              <select
                className="mt-1 w-full h-9 px-2 rounded border border-outline-variant/50 text-xs"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as AtlasExportFormat)}
                disabled={exporting}
              >
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
              </select>
            </label>
            <label className="block text-[11px] font-semibold">
              Resolution
              <select
                className="mt-1 w-full h-9 px-2 rounded border border-outline-variant/50 text-xs"
                value={exportRes}
                onChange={(e) => setExportRes(e.target.value as AtlasExportResolution)}
                disabled={exporting}
              >
                <option value="standard">Standard</option>
                <option value="high">High</option>
              </select>
            </label>
            <fieldset className="space-y-1.5" data-testid="atlas-export-decorations">
              <legend className="text-[11px] font-semibold text-on-surface">
                Include on map
              </legend>
              <p className="text-[10px] text-on-surface-variant">
                Only checked elements are drawn onto the downloaded snapshot.
              </p>
              {(
                [
                  { key: 'northArrow' as const, label: 'North arrow' },
                  { key: 'legend' as const, label: 'Legend' },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.key}
                  className="flex items-center gap-2 text-[11px] font-medium text-on-surface cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    data-testid={`atlas-export-${opt.key}`}
                    checked={exportDecorations[opt.key]}
                    disabled={exporting}
                    onChange={(e) =>
                      setExportDecorations((prev) => ({
                        ...prev,
                        [opt.key]: e.target.checked,
                      }))
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="h-8 px-3 rounded border border-outline-variant/50 text-[11px] font-semibold"
                onClick={() => setExportOpen(false)}
                disabled={exporting}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="atlas-export-confirm"
                className="h-8 px-3 rounded bg-primary text-on-primary text-[11px] font-bold disabled:opacity-50"
                onClick={() => void handleExport()}
                disabled={exporting}
              >
                {exporting ? 'Exporting…' : 'Download'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
