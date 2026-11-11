import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { ApLeafletMap, type ApLeafletMapHandle } from '../gis/ApLeafletMap';
import type { BasemapId } from '../../types/gis';
import {
  featureBbox,
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
  atlasInventoryForDistrict,
  atlasLayersByCategory,
} from '../../gis/atlas/atlasInventory';
import {
  exportAtlasMapImage,
  type AtlasExportFormat,
  type AtlasExportResolution,
} from '../../gis/atlas/atlasExport';
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

/** View 1 = satellite; View 2 = OSM road-network street map. */
export type AtlasMapViewId = 'view1' | 'view2';

const ATLAS_VIEW_BASEMAP: Record<AtlasMapViewId, BasemapId> = {
  view1: 'satellite',
  view2: 'vector',
};

interface AtlasWorkspaceProps {
  onTriggerToast: (msg: string) => void;
}

export const AtlasWorkspace: React.FC<AtlasWorkspaceProps> = ({ onTriggerToast }) => {
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
  const [mapExpanded, setMapExpanded] = useState(false);
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
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<AtlasExportFormat>('png');
  const [exportRes, setExportRes] = useState<AtlasExportResolution>('high');
  /** Which Atlas map view (1 = satellite, 2 = OSM roads) to capture on download. */
  const [exportView, setExportView] = useState<AtlasMapViewId>('view1');
  const [exporting, setExporting] = useState(false);

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

  const visibleIds = useMemo(
    () =>
      compositionActive
        ? atlasVisibleAppliedIds(districtCfg.appliedLayerIds, districtCfg.layerVisibility)
        : new Set<string>(),
    [compositionActive, districtCfg.appliedLayerIds, districtCfg.layerVisibility]
  );
  const mapFlags = useMemo(() => atlasLeafletFlags(visibleIds), [visibleIds]);

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
      for (const id of districtCfg.selectedLayerIds) {
        if (visibility[id] === undefined) visibility[id] = true;
        if (opacity[id] === undefined) opacity[id] = 100;
      }
      // Drop visibility for layers no longer selected
      for (const id of Object.keys(visibility)) {
        if (!districtCfg.selectedLayerIds.includes(id)) delete visibility[id];
      }
      writeDistrict({
        ...districtCfg,
        appliedLayerIds: [...districtCfg.selectedLayerIds],
        layerVisibility: visibility,
        layerOpacity: opacity,
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

  const removeLayer = (layerId: string) => {
    if (!districtId) return;
    const selectedLayerIds = districtCfg.selectedLayerIds.filter((id) => id !== layerId);
    const appliedLayerIds = districtCfg.appliedLayerIds.filter((id) => id !== layerId);
    const layerVisibility = { ...districtCfg.layerVisibility };
    const layerOpacity = { ...districtCfg.layerOpacity };
    delete layerVisibility[layerId];
    delete layerOpacity[layerId];
    writeDistrict({
      ...districtCfg,
      selectedLayerIds,
      appliedLayerIds,
      layerVisibility,
      layerOpacity,
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
      // Switch map to the selected download view so capture matches View 1 / View 2.
      if (exportView !== atlasView) {
        handleAtlasViewChange(exportView);
        await waitForExportView(exportView === 'view1' ? 1100 : 900);
      } else {
        await waitForExportView(200);
      }
      const base = `eagle_atlas_${districtId ?? 'map'}_${exportView}_${exportRes}`;
      const { fileName } = await exportAtlasMapImage({
        mapEl: el,
        format: exportFormat,
        resolution: exportRes,
        fileBaseName: base,
      });
      setExportOpen(false);
      onTriggerToast(
        `Downloaded ${fileName} (${exportView === 'view1' ? 'View 1 · satellite' : 'View 2 · OSM roads'})`
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
      className={`shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-b border-outline-variant/40 ${
        mapExpanded ? 'bg-[#0b1c30] text-white border-white/10' : 'bg-surface-container-lowest'
      }`}
      data-testid="atlas-view-switcher"
    >
      <span
        className={`text-[10px] font-bold uppercase tracking-wide mr-1 ${
          mapExpanded ? 'text-white/70' : 'text-on-surface-variant'
        }`}
      >
        Map view
      </span>
      {(
        [
          { id: 'view1' as const, label: 'View 1', hint: 'Satellite' },
          { id: 'view2' as const, label: 'View 2', hint: 'Road network' },
        ] as const
      ).map((opt) => {
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
                ? mapExpanded
                  ? 'bg-white text-[#0b1c30]'
                  : 'bg-primary text-on-primary'
                : mapExpanded
                  ? 'bg-white/10 text-white/90 hover:bg-white/20'
                  : 'bg-surface-container border border-outline-variant/50 text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
      <span
        className={`text-[10px] ml-1 truncate ${
          mapExpanded ? 'text-white/70' : 'text-on-surface-variant'
        }`}
      >
        {atlasView === 'view1' ? 'Esri satellite' : 'OpenStreetMap roads'}
      </span>
      {mapExpanded ? (
        <button
          type="button"
          data-testid="atlas-exit-fullscreen"
          className="ml-auto h-8 px-3 rounded bg-white text-[#0b1c30] text-[11px] font-bold inline-flex items-center gap-1.5"
          onClick={() => setMapExpanded(false)}
          title="Exit full screen (Esc)"
        >
          <Minimize2 className="w-3.5 h-3.5" />
          Exit full screen
        </button>
      ) : null}
    </div>
  );

  const mapStage = (
    <div className="flex-1 min-h-0 min-w-0 relative" ref={mapHostRef} data-testid="atlas-map-host">
      <ApLeafletMap
        ref={mapRef}
        className="h-full w-full"
        basemap={ATLAS_VIEW_BASEMAP[atlasView]}
        fitToState={!compositionActive}
        interactive
        highlightApFill={false}
        autoSatelliteOverlay={false}
        maskOutsideDrill={false}
        autoAdminOverlays={false}
        apOnlyPermanentStateLabels
        showStateBorder={mapFlags.showStateBorder}
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
        showTalukGis={mapFlags.showTalukGis}
        showVspVillagePts={mapFlags.showVspVillagePts}
        showDistrictsGisHist={mapFlags.showDistrictsGisHist}
        showStateGisHist={mapFlags.showStateGisHist}
        showGraticule={mapFlags.showGraticule}
        showHighways={mapFlags.showHighways}
        showApRoadsFull={mapFlags.showApRoadsFull}
        showOpsVspRoads={mapFlags.showOpsVspRoads}
        showApRoadsMajor={mapFlags.showApRoadsMajor}
        showTrails={mapFlags.showTrails}
        showOpsMainRoads={mapFlags.showOpsMainRoads}
        showOpsInternalRoads={mapFlags.showOpsInternalRoads}
        showRailways={mapFlags.showRailways}
        showRivers={mapFlags.showRivers}
        showWaterbodies={mapFlags.showWaterbodies}
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
        adminDrill={atlasAdminDrill}
        boundsView={boundsView}
        viewTarget={viewTarget ?? undefined}
        geoJsonOverlays={districtHighlightOverlays}
        layoutRevision={`atlas:${districtId ?? 'none'}:${atlasView}:${[...visibleIds].sort().join(',')}:${compositionActive ? 'on' : 'off'}:${fitToken}:${mapExpanded ? 'full' : 'shell'}`}
      />
      <div className="absolute top-2 left-2 z-[500] pointer-events-none rounded bg-black/70 text-white px-2 py-1 text-[10px] font-semibold shadow-sm">
        {!districtId
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

  if (mapExpanded) {
    return (
      <div
        className="fixed inset-0 z-[100] bg-[#0b1c30] flex flex-col"
        data-testid="atlas-workspace-fullscreen"
      >
        {viewSwitcher}
        {mapStage}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col" data-testid="atlas-workspace">
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-outline-variant/40 bg-surface-container-lowest">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-secondary">
            M3 · Atlas
          </div>
          <h1 className="text-base font-bold text-primary truncate">
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
            className="h-8 px-2.5 rounded border border-outline-variant/50 text-[11px] font-semibold inline-flex items-center gap-1"
            onClick={handleClear}
            disabled={!districtId}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear
          </button>
          <button
            type="button"
            className="h-8 px-2.5 rounded border border-outline-variant/50 text-[11px] font-semibold inline-flex items-center gap-1"
            onClick={() => setMapExpanded(true)}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Full map
          </button>
          <button
            type="button"
            data-testid="atlas-download-map"
            className="h-8 px-3 rounded bg-primary text-on-primary text-[11px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
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

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <aside className="w-full lg:w-[340px] shrink-0 border-b lg:border-b-0 lg:border-r border-outline-variant/40 bg-surface-container-low overflow-y-auto max-h-[42vh] lg:max-h-none">
          <div className="p-3 space-y-3">
            <label className="block">
              <span className="text-[10.5px] font-bold uppercase tracking-wide text-on-surface-variant">
                Select District
              </span>
              <select
                data-testid="atlas-district-select"
                className="mt-1 w-full h-9 px-2.5 rounded border border-outline-variant/50 bg-surface-container-lowest text-xs font-semibold"
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
                  return (
                    <section
                      key={cat}
                      className="rounded border border-outline-variant/40 overflow-hidden"
                      onMouseEnter={() =>
                        setOpenCats((prev) => (prev[cat] ? prev : { ...prev, [cat]: true }))
                      }
                      onMouseLeave={() =>
                        setOpenCats((prev) => (!prev[cat] ? prev : { ...prev, [cat]: false }))
                      }
                    >
                      <button
                        type="button"
                        className="w-full flex items-center justify-between px-2.5 py-2 bg-surface-container-lowest text-left"
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
                      {open && (
                        <ul className="divide-y divide-outline-variant/30 bg-surface">
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
        </aside>

        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          {viewSwitcher}
          {mapStage}
        </div>
      </div>

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
