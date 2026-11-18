import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  featureBbox,
  STATE_ADMIN_DRILL,
  type AdminDrill,
} from '../../gis/adminHierarchy';
import {
  LOCUS_DEFAULT_DISTRICT_ID,
  LOCUS_DISTRICTS,
  isLocusDistrictSelectable,
  locusDistrictById,
} from '../../gis/locus/locusDistricts';
import {
  emptyLocusDistrictConfig,
  getLocusDistrictConfig,
  loadLocusConfig,
  locusHasPendingChanges,
  persistLocusConfig,
  upsertLocusDistrictConfig,
} from '../../gis/locus/locusConfig';
import { loadLocusDistrictFeature } from '../../gis/locus/locusDistrictGeometry';
import {
  locusInventoryForDistrict,
  locusLayersByCategory,
} from '../../gis/locus/locusInventory';
import { locusLeafletFlags, locusVisibleAppliedIds } from '../../gis/locus/locusMapFlags';
import type {
  LocusConfig,
  LocusDistrictConfig,
  LocusExportScope,
  LocusLayerCategory,
} from '../../gis/locus/locusTypes';
import { LOCUS_CATEGORY_LABEL } from '../../gis/locus/locusTypes';
import { downloadLocusKmz, resolveLocusExportLayerIds } from '../../gis/locusExport';
import { useAuth } from '../../auth/AuthContext';

const CATEGORIES: LocusLayerCategory[] = [
  'administrative',
  'operational',
  'road-network',
];

interface LocusWorkspaceProps {
  onTriggerToast: (msg: string) => void;
  mapExpanded?: boolean;
  onMapExpandedChange?: (expanded: boolean) => void;
}

export const LocusWorkspace: React.FC<LocusWorkspaceProps> = ({
  onTriggerToast,
  mapExpanded = false,
  onMapExpandedChange,
}) => {
  const { can } = useAuth();
  const mapRef = useRef<ApLeafletMapHandle>(null);

  const [config, setConfig] = useState<LocusConfig>(() => loadLocusConfig());
  const [districtId, setDistrictId] = useState<string | null>(null);
  const [districtFeature, setDistrictFeature] = useState<GeoJSON.Feature | null>(null);
  const [loadingDistrict, setLoadingDistrict] = useState(false);
  const [displaying, setDisplaying] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  /** World overview until the user clicks the map (then India isolation). */
  const [indiaIsolated, setIndiaIsolated] = useState(false);
  const setMapExpanded = (expanded: boolean) => onMapExpandedChange?.(expanded);
  const [openCats, setOpenCats] = useState<Record<LocusLayerCategory, boolean>>({
    administrative: false,
    operational: false,
    'road-network': false,
  });
  /** When pinned, category stays expanded and ignores hover mouse-out collapse. */
  const [pinnedCats, setPinnedCats] = useState<Record<LocusLayerCategory, boolean>>({
    administrative: false,
    operational: false,
    'road-network': false,
  });
  const pinnedCatsRef = useRef(pinnedCats);
  pinnedCatsRef.current = pinnedCats;
  /** Debounce hover-collapse so pin↔scrollbar moves do not flicker the section. */
  const hoverCloseTimersRef = useRef<Partial<Record<LocusLayerCategory, number>>>({});

  const clearCatHoverClose = useCallback((id: LocusLayerCategory) => {
    const timer = hoverCloseTimersRef.current[id];
    if (timer == null) return;
    window.clearTimeout(timer);
    delete hoverCloseTimersRef.current[id];
  }, []);

  const openCatOnHover = useCallback(
    (id: LocusLayerCategory) => {
      clearCatHoverClose(id);
      setOpenCats((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
    },
    [clearCatHoverClose]
  );

  const scheduleCatHoverClose = useCallback(
    (id: LocusLayerCategory) => {
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
  const [exportScope, setExportScope] = useState<LocusExportScope>('visible');
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');

  const meta = locusDistrictById(districtId ?? undefined);
  const inventory = districtId ? locusInventoryForDistrict(districtId) : null;
  const districtCfg: LocusDistrictConfig = districtId
    ? getLocusDistrictConfig(config, districtId)
    : emptyLocusDistrictConfig('');

  const selected = useMemo(
    () => new Set(districtCfg.selectedLayerIds),
    [districtCfg.selectedLayerIds]
  );
  const applied = useMemo(
    () => new Set(districtCfg.appliedLayerIds),
    [districtCfg.appliedLayerIds]
  );
  const pending = locusHasPendingChanges(districtCfg);
  const compositionActive = districtCfg.appliedLayerIds.length > 0 && Boolean(districtFeature);
  const showWorldOverview = !indiaIsolated && !compositionActive;
  const allAppliedVisible =
    districtCfg.appliedLayerIds.length > 0 &&
    districtCfg.appliedLayerIds.every((id) => districtCfg.layerVisibility[id] !== false);

  const visibleIds = useMemo(
    () =>
      compositionActive
        ? locusVisibleAppliedIds(districtCfg.appliedLayerIds, districtCfg.layerVisibility)
        : new Set<string>(),
    [compositionActive, districtCfg.appliedLayerIds, districtCfg.layerVisibility]
  );
  const mapFlags = useMemo(() => locusLeafletFlags(visibleIds), [visibleIds]);
  const layerColorOverrides = useMemo(
    () => normalizeLayerColorMap(districtCfg.layerColors),
    [districtCfg.layerColors]
  );

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
      token: `locus-fit:${districtId}:${fitToken}`,
      padRatio: 0.08,
      maxZoom: 11,
      lock: false,
    };
  }, [compositionActive, districtFeature, districtId, fitToken]);

  const districtHighlightOverlays = useMemo(() => {
    if (!compositionActive || !districtFeature || mapFlags.showDistricts) return [];
    return [
      {
        id: 'locus-selected-district',
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

  const locusAdminDrill = useMemo<AdminDrill>(() => {
    if (!compositionActive || !districtFeature || !meta) return STATE_ADMIN_DRILL;
    return {
      level: 'district',
      apFocused: true,
      districtName: meta.districtName,
      districtFeature,
    };
  }, [compositionActive, districtFeature, meta]);

  const persist = (next: LocusConfig) => {
    setConfig(next);
    persistLocusConfig(next);
  };

  const writeDistrict = (nextDistrict: LocusDistrictConfig, activeId = districtId) => {
    const next = upsertLocusDistrictConfig(
      { ...config, activeDistrictId: activeId },
      nextDistrict
    );
    persist(next);
  };

  useEffect(() => {
    let cancelled = false;
    if (!meta || meta.status !== 'ready') {
      setDistrictFeature(null);
      return;
    }
    setLoadingDistrict(true);
    loadLocusDistrictFeature(meta)
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
    if (!isLocusDistrictSelectable(nextId)) {
      onTriggerToast('This district inventory is not configured yet');
      return;
    }
    if (districtId && locusHasPendingChanges(getLocusDistrictConfig(config, districtId))) {
      const ok = window.confirm(
        'You have unapplied Locus layer selections. Changing district will discard pending checkboxes (saved applied maps are kept per district). Continue?'
      );
      if (!ok) return;
      const cur = getLocusDistrictConfig(config, districtId);
      writeDistrict({
        ...cur,
        selectedLayerIds: [...cur.appliedLayerIds],
      });
    }
    setDistrictId(nextId);
    const nextCfg = getLocusDistrictConfig(config, nextId);
    persist({
      ...config,
      activeDistrictId: nextId,
      districts: {
        ...config.districts,
        [nextId]: nextCfg,
        ...(districtId
          ? {
              [districtId]: {
                ...getLocusDistrictConfig(config, districtId),
                selectedLayerIds: [
                  ...getLocusDistrictConfig(config, districtId).appliedLayerIds,
                ],
              },
            }
          : {}),
      },
    });
    onTriggerToast(
      `Locus district: ${locusDistrictById(nextId)?.name ?? nextId} — select layers, then Display the Layers`
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

  /** Select or clear every layer in one Locus category (independent of other sections). */
  const setCategorySelected = (cat: LocusLayerCategory, selectAll: boolean) => {
    if (!districtId || !inventory) return;
    const ids = locusLayersByCategory(inventory, cat).map((row) => row.layerId);
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

  const handleDisplayLayers = () => {
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
  const setCategoryEyes = (cat: LocusLayerCategory, on: boolean) => {
    if (!districtId || !inventory) return;
    const ids = locusLayersByCategory(inventory, cat)
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
    writeDistrict(emptyLocusDistrictConfig(districtId));
    onTriggerToast('Locus layers cleared for this district');
  };

  const exportLayerIds = useMemo(
    () =>
      resolveLocusExportLayerIds({
        appliedLayerIds: districtCfg.appliedLayerIds,
        layerVisibility: districtCfg.layerVisibility,
        scope: exportScope,
      }),
    [districtCfg.appliedLayerIds, districtCfg.layerVisibility, exportScope]
  );

  const handleDownloadKmz = async () => {
    if (!can('export')) {
      onTriggerToast('Export denied for your RBAC clearance');
      return;
    }
    if (!compositionActive || !districtFeature || !meta || !inventory) {
      onTriggerToast('Display layers before downloading KMZ');
      return;
    }
    if (!exportLayerIds.length) {
      onTriggerToast('No layers in the selected export scope');
      return;
    }
    setExporting(true);
    setExportProgress('Preparing geometries…');
    try {
      const result = await downloadLocusKmz({
        title: `EAGLE GIS — ${meta.name}`,
        districtFeature,
        layerIds: exportLayerIds,
        inventoryLayers: inventory.layers,
        onProgress: (_r, label) => setExportProgress(label),
      });
      setExportOpen(false);
      const skipNote = result.skippedLayerIds.length
        ? ` · ${result.skippedLayerIds.length} skipped (unavailable)`
        : '';
      onTriggerToast(
        `Downloaded ${result.fileName} · ${result.layerCount} layers · ${result.featureCount.toLocaleString()} features${skipNote}`
      );
    } catch (err) {
      onTriggerToast(err instanceof Error ? err.message : 'KMZ export failed');
    } finally {
      setExporting(false);
      setExportProgress('');
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

  const mapStage = (
    <div className="flex-1 h-full min-h-0 min-w-0 relative" data-testid="locus-map-host">
      <ApLeafletMap
        ref={mapRef}
        className="h-full w-full"
        basemap="satellite"
        fitToState={indiaIsolated && !compositionActive}
        unconstrainedWorldView={showWorldOverview}
        suppressIndiaOverviewMask={showWorldOverview}
        interactive
        highlightApFill={false}
        autoSatelliteOverlay={false}
        maskOutsideDrill={false}
        autoAdminOverlays={false}
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
        showPlaces={mapFlags.showPlaces}
        adminDrill={locusAdminDrill}
        boundsView={boundsView}
        geoJsonOverlays={districtHighlightOverlays}
        onMapClick={() => {
          if (!indiaIsolated) setIndiaIsolated(true);
        }}
        layoutRevision={`locus:${districtId ?? 'none'}:${[...visibleIds].sort().join(',')}:${compositionActive ? 'on' : 'off'}:${fitToken}:${mapExpanded ? 'full' : 'shell'}:${indiaIsolated ? 'in' : 'world'}:${Object.entries(layerColorOverrides)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, c]) => `${id}:${c}`)
          .join('|')}`}
      />
      <div className="absolute top-2 left-2 z-[500] pointer-events-none rounded bg-black/70 text-white px-2 py-1 text-[10px] font-semibold shadow-sm">
        {showWorldOverview
          ? 'World view — click the map to isolate India'
          : !districtId
            ? 'Select a district to compose a Locus map'
            : loadingDistrict
              ? 'Loading district boundary…'
              : !compositionActive
                ? 'Select layers, then Display the Layers'
                : `${meta?.name ?? 'District'} · ${visibleIds.size} visible`}
      </div>
    </div>
  );

  return (
    <div
      className={
        mapExpanded
          ? 'fixed inset-0 z-[900] bg-white flex flex-col'
          : 'h-full min-h-0 flex flex-col'
      }
      data-testid={mapExpanded ? 'locus-workspace-fullscreen' : 'locus-workspace'}
    >
      {!mapExpanded ? (
        <header className="ws-page-header shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-secondary">
              M3 · Locus
            </div>
            <h1 className="text-[15px] font-bold text-primary truncate leading-tight">
              Locus
              {meta ? (
                <span className="text-on-surface-variant font-semibold"> — {meta.name}</span>
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
              data-testid="locus-download-kmz"
              className="ws-btn ws-btn-primary"
              disabled={!compositionActive || !districtCfg.appliedLayerIds.length}
              onClick={() => setExportOpen(true)}
            >
              <Download className="w-3.5 h-3.5" />
              Download KMZ
            </button>
          </div>
        </header>
      ) : (
        <>
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[910] rounded bg-white/95 border border-outline-variant/40 shadow-sm px-2.5 py-1 text-[11px] font-semibold text-on-surface truncate max-w-[min(90vw,28rem)]">
            Locus{meta ? ` — ${meta.name}` : ''}
            {compositionActive ? ` · ${visibleIds.size} visible` : ''}
          </div>
          <button
            type="button"
            data-testid="locus-exit-fullscreen"
            onClick={() => setMapExpanded(false)}
            title="Exit full screen (Esc)"
            className="absolute top-2 right-3 z-[910] ws-btn shadow-[0_6px_18px_rgba(11,28,48,0.14)]"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            Exit full screen
          </button>
        </>
      )}

      <WorkspaceSidebarSplit
        testId="locus-sidebar-split"
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
                data-testid="locus-district-select"
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
                {LOCUS_DISTRICTS.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.status !== 'ready'}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>

            {!districtId && (
              <p className="text-[11px] text-on-surface-variant">
                Select a district to compose a Locus map. Currently configured:{' '}
                <button
                  type="button"
                  className="underline font-semibold text-primary"
                  onClick={() => handleDistrictChange(LOCUS_DEFAULT_DISTRICT_ID)}
                >
                  Alluri Sitharama Raju
                </button>
                .
              </p>
            )}

            {inventory && (
              <>
                <button
                  type="button"
                  data-testid="locus-display-layers"
                  disabled={!canDisplay || displaying}
                  onClick={handleDisplayLayers}
                  className="w-full h-9 rounded bg-secondary text-on-secondary text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-45"
                >
                  <Layers className="w-3.5 h-3.5" />
                  {displaying ? 'Displaying…' : 'Display the Layers'}
                </button>
                {districtCfg.appliedLayerIds.length > 0 && (
                  <button
                    type="button"
                    data-testid="locus-hide-unhide-all"
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
                  <p className="text-[10.5px] text-tertiary font-semibold" data-testid="locus-pending-hint">
                    Pending changes — click Display the Layers to apply.
                  </p>
                )}

                {CATEGORIES.map((cat) => {
                  const rows = locusLayersByCategory(inventory, cat);
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
                          onClick={() => setOpenCats((prev) => ({ ...prev, [cat]: !prev[cat] }))}
                        >
                          <span className="text-[11px] font-bold text-primary">
                            {LOCUS_CATEGORY_LABEL[cat]}
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
                          data-testid={`locus-pin-${cat}`}
                          title={pinned ? 'Unpin section' : 'Pin section open'}
                          aria-pressed={pinned}
                          aria-label={
                            pinned
                              ? `Unpin ${LOCUS_CATEGORY_LABEL[cat]}`
                              : `Pin ${LOCUS_CATEGORY_LABEL[cat]} open`
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
                              data-testid={`locus-select-all-${cat}`}
                              disabled={!districtId || rows.length === 0}
                              onClick={() => setCategorySelected(cat, !allSelected)}
                              className="h-7 px-2.5 rounded border border-sky-300 bg-sky-100 text-sky-900 text-[10.5px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sky-200/80"
                            >
                              {allSelected ? 'Unselect All' : 'Select All'}
                            </button>
                            {appliedInCat.length > 0 && (
                              <button
                                type="button"
                                data-testid={`locus-hide-unhide-${cat}`}
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
                                data-testid={`locus-layer-${row.layerId}`}
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
                                      title="Remove from Locus"
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
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">{mapStage}</div>
      </WorkspaceSidebarSplit>

      {exportOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/45 flex items-center justify-center p-4"
          role="dialog"
          aria-modal
          aria-label="Download Locus KMZ"
        >
          <div className="w-full max-w-md rounded-lg bg-surface-container-lowest border border-outline-variant/50 p-4 space-y-3 shadow-xl">
            <h2 className="text-sm font-bold text-primary">Download KMZ</h2>
            <p className="text-[11px] text-on-surface-variant">
              Exports real GIS geometries for import into Locus Map / Pradhan / Google Earth Pro
              (district-clipped). Not a screenshot.
            </p>
            <div className="text-[11px] space-y-1 rounded border border-outline-variant/40 bg-surface p-2.5">
              <div>
                <span className="font-semibold">District:</span> {meta?.name ?? '—'}
              </div>
              <div>
                <span className="font-semibold">Layers in scope:</span> {exportLayerIds.length}
              </div>
            </div>
            <label className="block text-[11px] font-semibold">
              Export scope
              <select
                data-testid="locus-export-scope"
                className="mt-1 w-full h-9 px-2.5 rounded border border-outline-variant/50 bg-surface text-xs"
                value={exportScope}
                onChange={(e) => setExportScope(e.target.value as LocusExportScope)}
              >
                <option value="visible">Visible applied layers (Eye on)</option>
                <option value="applied">All applied layers</option>
              </select>
            </label>
            {exportProgress ? (
              <p className="text-[10.5px] text-secondary font-semibold">{exportProgress}</p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="h-8 px-3 rounded border border-outline-variant/50 text-[11px] font-semibold"
                disabled={exporting}
                onClick={() => setExportOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="locus-export-confirm"
                className="h-8 px-3 rounded bg-primary text-on-primary text-[11px] font-bold disabled:opacity-50"
                disabled={exporting || !exportLayerIds.length}
                onClick={() => void handleDownloadKmz()}
              >
                {exporting ? 'Exporting…' : 'Download KMZ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
