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
}

export const LocusWorkspace: React.FC<LocusWorkspaceProps> = ({ onTriggerToast }) => {
  const { can } = useAuth();
  const mapRef = useRef<ApLeafletMapHandle>(null);

  const [config, setConfig] = useState<LocusConfig>(() => loadLocusConfig());
  const [districtId, setDistrictId] = useState<string | null>(null);
  const [districtFeature, setDistrictFeature] = useState<GeoJSON.Feature | null>(null);
  const [loadingDistrict, setLoadingDistrict] = useState(false);
  const [displaying, setDisplaying] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [openCats, setOpenCats] = useState<Record<LocusLayerCategory, boolean>>({
    administrative: false,
    operational: false,
    'road-network': false,
  });
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

  const visibleIds = useMemo(
    () =>
      compositionActive
        ? locusVisibleAppliedIds(districtCfg.appliedLayerIds, districtCfg.layerVisibility)
        : new Set<string>(),
    [compositionActive, districtCfg.appliedLayerIds, districtCfg.layerVisibility]
  );
  const mapFlags = useMemo(() => locusLeafletFlags(visibleIds), [visibleIds]);

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
      for (const id of districtCfg.selectedLayerIds) {
        if (visibility[id] === undefined) visibility[id] = true;
        if (opacity[id] === undefined) opacity[id] = 100;
      }
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
    <div className="flex-1 min-h-0 min-w-0 relative" data-testid="locus-map-host">
      <ApLeafletMap
        ref={mapRef}
        className="h-full w-full"
        basemap="satellite"
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
        adminDrill={locusAdminDrill}
        boundsView={boundsView}
        geoJsonOverlays={districtHighlightOverlays}
        layoutRevision={`locus:${districtId ?? 'none'}:${[...visibleIds].sort().join(',')}:${compositionActive ? 'on' : 'off'}:${fitToken}:${mapExpanded ? 'full' : 'shell'}`}
      />
      <div className="absolute top-2 left-2 z-[500] pointer-events-none rounded bg-black/70 text-white px-2 py-1 text-[10px] font-semibold shadow-sm">
        {!districtId
          ? 'Select a district to compose a Locus map'
          : loadingDistrict
            ? 'Loading district boundary…'
            : !compositionActive
              ? 'Select layers, then Display the Layers'
              : `${meta?.name ?? 'District'} · ${visibleIds.size} visible`}
      </div>
    </div>
  );

  if (mapExpanded) {
    return (
      <div
        className="fixed inset-0 z-[100] bg-[#0b1c30] flex flex-col"
        data-testid="locus-workspace-fullscreen"
      >
        <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 bg-[#0b1c30] border-b border-white/10">
          <div className="text-[11px] font-semibold text-white/90 truncate">
            Locus{meta ? ` — ${meta.name}` : ''}
            {compositionActive ? ` · ${visibleIds.size} visible` : ''}
          </div>
          <button
            type="button"
            data-testid="locus-exit-fullscreen"
            className="h-8 px-3 rounded bg-white text-[#0b1c30] text-[11px] font-bold inline-flex items-center gap-1.5"
            onClick={() => setMapExpanded(false)}
            title="Exit full screen (Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            Exit full screen
          </button>
        </div>
        {mapStage}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col" data-testid="locus-workspace">
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-outline-variant/40 bg-surface-container-lowest">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-secondary">
            M3 · Locus
          </div>
          <h1 className="text-base font-bold text-primary truncate">
            Locus
            {meta ? (
              <span className="text-on-surface-variant font-semibold"> — {meta.name}</span>
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
            data-testid="locus-download-kmz"
            className="h-8 px-3 rounded bg-primary text-on-primary text-[11px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
            disabled={!compositionActive || !districtCfg.appliedLayerIds.length}
            onClick={() => setExportOpen(true)}
          >
            <Download className="w-3.5 h-3.5" />
            Download KMZ
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
                data-testid="locus-district-select"
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
                {pending && (
                  <p className="text-[10.5px] text-tertiary font-semibold" data-testid="locus-pending-hint">
                    Pending changes — click Display the Layers to apply.
                  </p>
                )}

                {CATEGORIES.map((cat) => {
                  const rows = locusLayersByCategory(inventory, cat);
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
        </aside>

        <div className="flex-1 min-h-0 min-w-0 flex flex-col">{mapStage}</div>
      </div>

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
