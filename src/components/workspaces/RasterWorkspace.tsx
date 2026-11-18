import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { ApLeafletMap, type ApLeafletMapHandle } from '../gis/ApLeafletMap';
import { WorkspaceSidebarSplit } from '../gis/WorkspaceSidebarSplit';
import {
  featureBbox,
  STATE_ADMIN_DRILL,
  type AdminDrill,
} from '../../gis/adminHierarchy';
import {
  RASTER_DEFAULT_DISTRICT_ID,
  RASTER_DISTRICTS,
  isRasterDistrictSelectable,
  rasterDistrictById,
} from '../../gis/raster/rasterDistricts';
import {
  emptyRasterDistrictConfig,
  getRasterDistrictConfig,
  loadRasterConfig,
  persistRasterConfig,
  rasterHasPendingChanges,
  upsertRasterDistrictConfig,
} from '../../gis/raster/rasterConfig';
import { loadRasterDistrictFeature } from '../../gis/raster/rasterDistrictGeometry';
import { rasterInventoryForDistrict } from '../../gis/raster/rasterInventory';
import { rasterLeafletFlags, rasterVisibleAppliedIds } from '../../gis/raster/rasterMapFlags';
import type { RasterConfig, RasterDistrictConfig } from '../../gis/raster/rasterTypes';
import type { BasemapId } from '../../types/gis';

interface RasterWorkspaceProps {
  onTriggerToast: (msg: string) => void;
  mapExpanded?: boolean;
  onMapExpandedChange?: (expanded: boolean) => void;
}

export const RasterWorkspace: React.FC<RasterWorkspaceProps> = ({
  onTriggerToast,
  mapExpanded = false,
  onMapExpandedChange,
}) => {
  const mapRef = useRef<ApLeafletMapHandle>(null);

  const [config, setConfig] = useState<RasterConfig>(() => loadRasterConfig());
  const [districtId, setDistrictId] = useState<string | null>(null);
  const [districtFeature, setDistrictFeature] = useState<GeoJSON.Feature | null>(null);
  const [loadingDistrict, setLoadingDistrict] = useState(false);
  const [displaying, setDisplaying] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  /** World overview until the user clicks the map (then India isolation, same as before). */
  const [indiaIsolated, setIndiaIsolated] = useState(false);
  const setMapExpanded = (expanded: boolean) => onMapExpandedChange?.(expanded);
  const [layersOpen, setLayersOpen] = useState(true);

  const meta = rasterDistrictById(districtId ?? undefined);
  const inventory = districtId ? rasterInventoryForDistrict(districtId) : null;
  const districtCfg: RasterDistrictConfig = districtId
    ? getRasterDistrictConfig(config, districtId)
    : emptyRasterDistrictConfig('');

  const selected = useMemo(
    () => new Set(districtCfg.selectedLayerIds),
    [districtCfg.selectedLayerIds]
  );
  const applied = useMemo(
    () => new Set(districtCfg.appliedLayerIds),
    [districtCfg.appliedLayerIds]
  );
  const pending = rasterHasPendingChanges(districtCfg);
  const compositionActive = districtCfg.appliedLayerIds.length > 0 && Boolean(districtFeature);
  const allAppliedVisible =
    districtCfg.appliedLayerIds.length > 0 &&
    districtCfg.appliedLayerIds.every((id) => districtCfg.layerVisibility[id] !== false);
  const allSelected =
    (inventory?.layers.length ?? 0) > 0 &&
    (inventory?.layers.every((row) => selected.has(row.layerId)) ?? false);

  const visibleIds = useMemo(
    () =>
      compositionActive
        ? rasterVisibleAppliedIds(districtCfg.appliedLayerIds, districtCfg.layerVisibility)
        : new Set<string>(),
    [compositionActive, districtCfg.appliedLayerIds, districtCfg.layerVisibility]
  );
  const mapFlags = useMemo(() => rasterLeafletFlags(visibleIds), [visibleIds]);
  const showWorldOverview = !indiaIsolated && !compositionActive;

  /** SOI topo reads best over satellite underlay. */
  const basemap: BasemapId = 'satellite';

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
      token: `raster-fit:${districtId}:${fitToken}`,
      padRatio: 0.08,
      maxZoom: 12,
      lock: false,
    };
  }, [compositionActive, districtFeature, districtId, fitToken]);

  const districtHighlightOverlays = useMemo(() => {
    if (!compositionActive || !districtFeature || mapFlags.showDistricts) return [];
    return [
      {
        id: 'raster-selected-district',
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

  const rasterAdminDrill = useMemo<AdminDrill>(() => {
    if (!compositionActive || !districtFeature || !meta) return STATE_ADMIN_DRILL;
    return {
      level: 'district',
      apFocused: true,
      districtName: meta.districtName,
      districtFeature,
    };
  }, [compositionActive, districtFeature, meta]);

  const persist = (next: RasterConfig) => {
    setConfig(next);
    persistRasterConfig(next);
  };

  const writeDistrict = (nextDistrict: RasterDistrictConfig, activeId = districtId) => {
    const next = upsertRasterDistrictConfig(
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
    loadRasterDistrictFeature(meta)
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
    if (!isRasterDistrictSelectable(nextId)) {
      onTriggerToast('This district Raster inventory is not configured yet');
      return;
    }
    if (districtId && rasterHasPendingChanges(getRasterDistrictConfig(config, districtId))) {
      const ok = window.confirm(
        'You have unapplied Raster layer selections. Changing district will discard pending checkboxes (saved applied maps are kept per district). Continue?'
      );
      if (!ok) return;
      const cur = getRasterDistrictConfig(config, districtId);
      writeDistrict({
        ...cur,
        selectedLayerIds: [...cur.appliedLayerIds],
      });
    }
    setDistrictId(nextId);
    const nextCfg = getRasterDistrictConfig(config, nextId);
    persist({
      ...config,
      activeDistrictId: nextId,
      districts: {
        ...config.districts,
        [nextId]: nextCfg,
        ...(districtId
          ? {
              [districtId]: {
                ...getRasterDistrictConfig(config, districtId),
                selectedLayerIds: [
                  ...getRasterDistrictConfig(config, districtId).appliedLayerIds,
                ],
              },
            }
          : {}),
      },
    });
    onTriggerToast(
      `Raster district: ${rasterDistrictById(nextId)?.name ?? nextId} — select layers, then Display the Layers`
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

  /** Select or clear every layer in the Raster & Imagery section. */
  const setSectionSelected = (selectAll: boolean) => {
    if (!districtId || !inventory) return;
    const ids = inventory.layers.map((row) => row.layerId);
    if (!ids.length) return;
    writeDistrict({
      ...districtCfg,
      selectedLayerIds: selectAll ? [...ids] : [],
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
        `Displayed ${districtCfg.selectedLayerIds.length} raster layer(s) for ${meta.name}`
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
    writeDistrict(emptyRasterDistrictConfig(districtId));
    onTriggerToast('Raster layers cleared for this district');
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
    <div className="flex-1 h-full min-h-0 min-w-0 relative" data-testid="raster-map-host">
      <ApLeafletMap
        ref={mapRef}
        className="h-full w-full"
        basemap={basemap}
        fitToState={indiaIsolated && !compositionActive}
        unconstrainedWorldView={showWorldOverview}
        /** World overview only — after click, use Atlas/Locus India isolation (mask + bounds). */
        suppressIndiaOverviewMask={showWorldOverview}
        interactive
        highlightApFill={false}
        autoSatelliteOverlay={false}
        maskOutsideDrill={false}
        autoAdminOverlays={false}
        apOnlyPermanentStateLabels
        compactApStateLabel
        showDistricts={false}
        showMandals={false}
        showVillages={false}
        showPoliceStations={false}
        showSoiTopo={mapFlags.showSoiTopo}
        soiStableComposition={mapFlags.showSoiTopo}
        adminDrill={rasterAdminDrill}
        boundsView={boundsView}
        geoJsonOverlays={districtHighlightOverlays}
        onMapClick={() => {
          if (!indiaIsolated) setIndiaIsolated(true);
        }}
        layoutRevision={`raster:${districtId ?? 'none'}:${[...visibleIds].sort().join(',')}:${compositionActive ? 'on' : 'off'}:${fitToken}:${basemap}:${mapExpanded ? 'full' : 'shell'}:${indiaIsolated ? 'in' : 'world'}`}
      />
      <div className="absolute top-2 left-2 z-[500] pointer-events-none rounded bg-black/70 text-white px-2 py-1 text-[10px] font-semibold shadow-sm">
        {showWorldOverview
          ? 'World view — click the map to isolate India'
          : !districtId
            ? 'Select a district to compose a Raster map'
            : loadingDistrict
              ? 'Loading district boundary…'
              : !compositionActive
                ? 'Select layers, then Display the Layers'
                : `${meta?.name ?? 'District'} · ${visibleIds.size} visible · zoom for SOI LOD`}
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
      data-testid={mapExpanded ? 'raster-workspace-fullscreen' : 'raster-workspace'}
    >
      {!mapExpanded ? (
        <header className="ws-page-header shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-secondary">
              M3 · Raster
            </div>
            <h1 className="text-[15px] font-bold text-primary truncate leading-tight">
              Raster
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
          </div>
        </header>
      ) : (
        <>
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[910] rounded bg-white/95 border border-outline-variant/40 shadow-sm px-2.5 py-1 text-[11px] font-semibold text-on-surface truncate max-w-[min(90vw,28rem)]">
            Raster{meta ? ` — ${meta.name}` : ''}
            {compositionActive ? ` · ${visibleIds.size} visible` : ''}
          </div>
          <button
            type="button"
            data-testid="raster-exit-fullscreen"
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
        testId="raster-sidebar-split"
        hideSidebar={mapExpanded}
        sidebar={
          <>
          <div className="p-3 space-y-3">
            <label className="block">
              <span className="text-[10.5px] font-bold uppercase tracking-wide text-on-surface-variant">
                Select District
              </span>
              <select
                data-testid="raster-district-select"
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
                {RASTER_DISTRICTS.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.status !== 'ready'}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>

            {!districtId && (
              <p className="text-[11px] text-on-surface-variant">
                Select a district to view SOI toposheet mosaics and other Raster packs. Currently
                configured:{' '}
                <button
                  type="button"
                  className="underline font-semibold text-primary"
                  onClick={() => handleDistrictChange(RASTER_DEFAULT_DISTRICT_ID)}
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
                  data-testid="raster-display-layers"
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
                    data-testid="raster-hide-unhide-all"
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
                    className="text-[10.5px] text-tertiary font-semibold"
                    data-testid="raster-pending-hint"
                  >
                    Pending changes — click Display the Layers to apply.
                  </p>
                )}

                <section className="rounded border border-outline-variant/40 overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-2.5 py-2 bg-surface-container-lowest text-left"
                    onClick={() => setLayersOpen((o) => !o)}
                  >
                    <span className="text-[11px] font-bold text-primary">Raster & Imagery</span>
                    <span className="flex items-center gap-1 text-[10px] text-on-surface-variant">
                      {inventory.layers.length}
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition ${layersOpen ? 'rotate-180' : ''}`}
                      />
                    </span>
                  </button>
                  {layersOpen && (
                    <ul className="divide-y divide-outline-variant/30 bg-surface">
                      <li className="px-2.5 py-1.5 bg-surface-container-lowest/80 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          data-testid="raster-select-all"
                          disabled={!districtId || inventory.layers.length === 0}
                          onClick={() => setSectionSelected(!allSelected)}
                          className="h-7 px-2.5 rounded border border-sky-300 bg-sky-100 text-sky-900 text-[10.5px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sky-200/80"
                        >
                          {allSelected ? 'Unselect All' : 'Select All'}
                        </button>
                        {districtCfg.appliedLayerIds.length > 0 && (
                          <button
                            type="button"
                            data-testid="raster-hide-unhide-section"
                            onClick={() => setAllEyes(!allAppliedVisible)}
                            className="h-7 px-2.5 rounded border border-sky-300 bg-sky-100 text-sky-900 text-[10.5px] font-semibold inline-flex items-center gap-1 hover:bg-sky-200/80"
                          >
                            {allAppliedVisible ? (
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
                      {inventory.layers.map((row) => {
                        const isSelected = selected.has(row.layerId);
                        const isApplied = applied.has(row.layerId);
                        const eyeOn = districtCfg.layerVisibility[row.layerId] !== false;
                        return (
                          <li
                            key={row.layerId}
                            className="flex items-stretch text-[11px] hover:bg-surface-container-low/80"
                            data-testid={`raster-layer-${row.layerId}`}
                          >
                            <label className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2 cursor-pointer">
                              <input
                                type="checkbox"
                                className="mt-0.5 accent-primary"
                                checked={isSelected}
                                onChange={() => toggleSelected(row.layerId)}
                                aria-label={`Select ${row.name}`}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block font-semibold text-on-surface leading-snug">
                                  {row.name}
                                </span>
                                <span className="block text-[10px] text-on-surface-variant tabular-nums">
                                  {row.featureCount.toLocaleString()} tiles/features
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
                                  title="Remove from Raster"
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
              </>
            )}
          </div>
          </>
        }
      >
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">{mapStage}</div>
      </WorkspaceSidebarSplit>
    </div>
  );
};
