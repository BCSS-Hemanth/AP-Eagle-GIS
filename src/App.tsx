import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Info } from 'lucide-react';
import { AuditLogEntry, GisLayer, TacticalAlert, WorkspaceId } from './types/gis';
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_GIS_LAYERS,
  INITIAL_TACTICAL_ALERTS,
  INSPECTABLE_FEATURES,
} from './data/apGisData';
import { TopCommandHeader } from './components/TopCommandHeader';
import { LeftNavigationRail } from './components/LeftNavigationRail';
import { CoreOpsWorkspaces } from './components/workspaces/CoreOpsWorkspaces';
import { NdpsAnalyticsWorkspace } from './components/workspaces/NdpsAnalyticsWorkspace';
import { DataLayerWorkspaces } from './components/workspaces/DataLayerWorkspaces';
import { OutputsGovernanceWorkspaces } from './components/workspaces/OutputsGovernanceWorkspaces';
import { WorkspaceErrorBoundary } from './components/WorkspaceErrorBoundary';
import { MapLayoutProvider } from './components/gis/ApLeafletMap';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { allowedWorkspaces, defaultWorkspace } from './auth/rbac';
import { policeStationsToRows, usePoliceStations } from './gis/usePoliceStations';
import { buildSearchTargets, resolveFlyTarget } from './gis/searchTargets';
import {
  applyLayerConfig,
  defaultDashboardLayerConfig,
  destinationConfigFromSelection,
  persistDashboardLayerConfig,
  type DashboardLayerConfig,
} from './gis/dashboardLayers';
import {
  countRoutingLayers,
  isUnroutableDisplayRoadLayer,
  persistRoadsRoutingLayerConfig,
  type RoadsRoutingLayerConfig,
} from './gis/roadsRoutingLayers';
import {
  countRoutingNewLayers,
  isRoadsRoutingNewCatalogLayer,
  persistRoadsRoutingNewLayerConfig,
  type RoadsRoutingNewLayerConfig,
} from './gis/roadsRoutingNewLayers';
import {
  canSaveToRoadsModules,
  isCatalogWorkspace,
} from './gis/catalogWorkspaces';
import {
  EMPTY_CATALOG_HOVER_EXCLUSIONS,
  clearLayerHoverExclusions,
  excludeLayersFromHover,
  type CatalogHoverDestination,
  type CatalogHoverExclusions,
} from './gis/catalogHoverSelection';
import { RoadsRoutingWorkspace } from './components/workspaces/RoadsRoutingWorkspace';
import { RoadsRoutingNewWorkspace } from './components/workspaces/RoadsRoutingNewWorkspace';
import { AtlasWorkspace } from './components/workspaces/AtlasWorkspace';
import { LocusWorkspace } from './components/workspaces/LocusWorkspace';
import { RasterWorkspace } from './components/workspaces/RasterWorkspace';

function AppShell() {
  const { user, canOpen, logout } = useAuth();
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('ndps-spatial-dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(true);
  /** Hides header + left nav so Full Screen / Full map fills the viewport (all modules). */
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const kmzStations = usePoliceStations(true);
  const kmzRows = useMemo(() => policeStationsToRows(kmzStations), [kmzStations]);
  const searchTargets = useMemo(
    () => buildSearchTargets(INSPECTABLE_FEATURES, kmzRows),
    [kmzRows]
  );

  // Global Spatial State — boot clears localStorage layer keys, so these start fresh.
  const [layers, setLayers] = useState<GisLayer[]>(() => {
    const fresh = applyLayerConfig(INITIAL_GIS_LAYERS, defaultDashboardLayerConfig(INITIAL_GIS_LAYERS));
    return fresh.map((layer) => (layer.id === 'lyr-pss' ? { ...layer, enabled: false } : layer));
  });
  const [dashboardLayerConfig, setDashboardLayerConfig] = useState<DashboardLayerConfig>(() => {
    const loaded = defaultDashboardLayerConfig(INITIAL_GIS_LAYERS);
    return {
      ...loaded,
      'lyr-pss': { enabled: false, opacity: loaded['lyr-pss']?.opacity ?? 100 },
    };
  });
  const [roadsRoutingConfig, setRoadsRoutingConfig] = useState<RoadsRoutingLayerConfig>(() => ({}));
  const [roadsRoutingNewConfig, setRoadsRoutingNewConfig] = useState<RoadsRoutingNewLayerConfig>(
    () => ({})
  );
  /**
   * Sticky “Saved to …” labels after each Save click.
   * Cleared when any catalog Visible layer is selected/deselected (all three buttons).
   */
  const [catalogSaveAck, setCatalogSaveAck] = useState({
    dashboard: false,
    roadsRouting: false,
    roadsRoutingNew: false,
  });
  /** Per-Save-button hover opt-outs; Visible clears only when opted out of all three. */
  const [catalogHoverExclusions, setCatalogHoverExclusions] = useState<CatalogHoverExclusions>(
    EMPTY_CATALOG_HOVER_EXCLUSIONS
  );
  const dashboardLayers = useMemo(
    () => applyLayerConfig(INITIAL_GIS_LAYERS, dashboardLayerConfig),
    [dashboardLayerConfig]
  );
  const [externalFocus, setExternalFocus] = useState<{
    lat: number;
    lon: number;
    zoom: number;
    token: number;
  } | null>(null);

  const [alerts, setAlerts] = useState<TacticalAlert[]>(INITIAL_TACTICAL_ALERTS);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS);

  // Toast Notification
  // Message text is kept after hide so it does not blank out during the fade.
  const [toast, setToast] = useState<{ text: string; visible: boolean; seq: number }>({
    text: '',
    visible: false,
    seq: 0,
  });
  const toastMessage = toast.text;

  const triggerToast = useCallback((msg: string) => {
    setToast((prev) => ({ text: msg, visible: true, seq: prev.seq + 1 }));
  }, []);

  useEffect(() => {
    if (!toast.visible) return;
    const t = setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3200);
    return () => clearTimeout(t);
  }, [toast.seq, toast.visible]);

  const appendAudit = useCallback((action: string, resource: string) => {
    const now = new Date();
    const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
    const ts = `${ymd} ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} IST`;
    setAuditLogs((prev) => [
      {
        id: `AUD-${9042 + prev.length}`,
        timestamp: ts,
        actor: user?.displayName ?? 'local user',
        role: user?.role ?? 'STATE_SPATIAL_ADMIN',
        ipNode: 'local session',
        action,
        resource,
      },
      ...prev,
    ]);
  }, [user]);

  const handleToggleLayer = (layerId: string) => {
    const target = layers.find((l) => l.id === layerId);
    if (layerId === 'lyr-pharma-hubs' && target && !target.enabled) {
      triggerToast('Pharma hub points are not in the loaded source files yet');
    }
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, enabled: !l.enabled } : l))
    );
    // Catalog Visible changes reset hover opt-outs so a fresh tick shows on all three buttons.
    setCatalogHoverExclusions((prev) => clearLayerHoverExclusions(prev, layerId));
    // Any select/deselect returns Save buttons to “Save to …” (Admin / OPS / Road Network).
    setCatalogSaveAck({
      dashboard: false,
      roadsRouting: false,
      roadsRoutingNew: false,
    });
    if (target) {
      appendAudit(target.enabled ? 'DISABLE_LAYER' : 'ENABLE_LAYER', target.sourceTable);
    }
  };

  const handleExcludeFromCatalogHover = (
    destination: CatalogHoverDestination,
    layerIds: string[]
  ) => {
    if (layerIds.length === 0) return;
    // Compute outside the state updater so no setState runs inside another updater.
    const { next, turnOffLayerIds } = excludeLayersFromHover(
      catalogHoverExclusions,
      destination,
      layerIds
    );
    setCatalogHoverExclusions(next);
    if (turnOffLayerIds.length > 0) {
      const off = new Set(turnOffLayerIds);
      setLayers((layersPrev) =>
        layersPrev.map((l) => (off.has(l.id) && l.enabled ? { ...l, enabled: false } : l))
      );
    }
  };

  /** Bulk select/unselect for catalog "Select All" — one audit entry instead of one per layer. */
  const handleSetLayersEnabled = (layerIds: string[], enabled: boolean) => {
    if (!layerIds.length) return;
    const ids = new Set(layerIds);
    setLayers((prev) => prev.map((l) => (ids.has(l.id) ? { ...l, enabled } : l)));
    setCatalogHoverExclusions((prev) => layerIds.reduce(clearLayerHoverExclusions, prev));
    setCatalogSaveAck({ dashboard: false, roadsRouting: false, roadsRoutingNew: false });
    appendAudit(enabled ? 'ENABLE_LAYERS_BULK' : 'DISABLE_LAYERS_BULK', `${layerIds.length} layers`);
  };

  const selectedIdsFor = (destination: CatalogHoverDestination) =>
    new Set(
      layers
        .filter((layer) => layer.enabled && !catalogHoverExclusions[destination][layer.id])
        .map((layer) => layer.id)
    );

  const handleSaveDashboardLayers = () => {
    const selected = selectedIdsFor('dashboard');
    if (selected.size === 0) {
      triggerToast('No layers selected — tick layers under Visible before saving to the Dashboard');
      return;
    }
    const before = new Set(
      Object.entries(dashboardLayerConfig)
        .filter(([, entry]) => entry?.enabled)
        .map(([id]) => id)
    );
    const config = destinationConfigFromSelection(layers, selected, 'snapshot');
    setDashboardLayerConfig(config);
    const persisted = persistDashboardLayerConfig(config);
    const enabled = selected.size;
    const removed = [...before].filter((id) => !selected.has(id)).length;
    setCatalogSaveAck((prev) => ({ ...prev, dashboard: true }));
    appendAudit('SAVE_DASHBOARD_LAYERS', `catalog → dashboard (${enabled} on, ${removed} removed)`);
    triggerToast(
      persisted
        ? `Saved ${enabled} layer${enabled === 1 ? '' : 's'} to the Dashboard${removed ? ` (removed ${removed})` : ''}`
        : `Applied ${enabled} layer${enabled === 1 ? '' : 's'} to the Dashboard (this browser blocked persistence)`
    );
  };

  const handleSaveRoadsRoutingLayers = () => {
    if (!canSaveToRoadsModules(activeWorkspace) || !isCatalogWorkspace(activeWorkspace)) {
      triggerToast(
        'Save to Roads Routing is only available from Admin, OPS, or Road Network catalogs'
      );
      return;
    }
    const selected = selectedIdsFor('roadsRouting');
    if (selected.size === 0) {
      triggerToast('No layers selected — tick layers under Visible before saving to Roads Routing');
      return;
    }
    const beforeIds = new Set(Object.keys(roadsRoutingConfig));
    const next = destinationConfigFromSelection(layers, selected, 'assigned', undefined, roadsRoutingConfig);
    // Unroutable road lines stay in the saved list but are never applied on the map.
    for (const id of Object.keys(next)) {
      if (isUnroutableDisplayRoadLayer(id)) {
        next[id] = { ...next[id], enabled: false };
      }
    }
    setRoadsRoutingConfig(next);
    const persisted = persistRoadsRoutingLayerConfig(next);
    const n = countRoutingLayers(next);
    const removed = [...beforeIds].filter((id) => !next[id]).length;
    setCatalogSaveAck((prev) => ({ ...prev, roadsRouting: true }));
    appendAudit('SAVE_ROADS_ROUTING_LAYERS', `${activeWorkspace} → roads-routing (${n} total, ${removed} removed)`);
    triggerToast(
      persisted
        ? `Saved to Roads Routing (${n} layer${n === 1 ? '' : 's'}${removed ? `; removed ${removed}` : ''})`
        : `Saved to Roads Routing (${n} total; persistence blocked in this browser)`
    );
  };

  const handleSaveRoadsRoutingNewLayers = () => {
    if (!canSaveToRoadsModules(activeWorkspace) || !isCatalogWorkspace(activeWorkspace)) {
      triggerToast(
        'Save to Roads Routing New is only available from Admin, OPS, or Road Network catalogs'
      );
      return;
    }
    const selected = selectedIdsFor('roadsRoutingNew');
    if (selected.size === 0) {
      triggerToast('No layers selected — tick layers under Visible before saving to Roads Routing New');
      return;
    }
    const beforeIds = new Set(Object.keys(roadsRoutingNewConfig));
    const next = destinationConfigFromSelection(
      layers,
      selected,
      'assigned',
      (layer) => isRoadsRoutingNewCatalogLayer(layer),
      roadsRoutingNewConfig
    );
    setRoadsRoutingNewConfig(next);
    const persisted = persistRoadsRoutingNewLayerConfig(next);
    const n = countRoutingNewLayers(next);
    const removed = [...beforeIds].filter((id) => !next[id]).length;
    setCatalogSaveAck((prev) => ({ ...prev, roadsRoutingNew: true }));
    appendAudit(
      'SAVE_ROADS_ROUTING_NEW_LAYERS',
      `${activeWorkspace} → roads-routing-new (${n} total, ${removed} removed)`
    );
    triggerToast(
      persisted
        ? `Saved to Roads Routing New (${n} layer${n === 1 ? '' : 's'}${removed ? `; removed ${removed}` : ''})`
        : `Saved to Roads Routing New (${n} total; persistence blocked in this browser)`
    );
  };

  const handleSelectFeatureAndFly = (featureId: string) => {
    const resolved = resolveFlyTarget(featureId, INSPECTABLE_FEATURES, kmzRows, searchTargets);
    if (!resolved) {
      triggerToast('Could not locate that feature on the map');
      return;
    }
    const { feature } = resolved;
    setExternalFocus({ lat: feature.lat, lon: feature.lon, zoom: 13, token: Date.now() });
    setActiveWorkspace('ndps-spatial-dashboard');
    triggerToast(`Focused spatial target: ${feature.name}`);
  };

  const handleFlyToLocation = (lat: number, lon: number, label: string) => {
    setExternalFocus({ lat, lon, zoom: 10, token: Date.now() });
    setActiveWorkspace('ndps-spatial-dashboard');
    triggerToast(`Focused spatial target: ${label}`);
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
    );
    appendAudit('ACKNOWLEDGE_ALERT', alertId);
    triggerToast(`Alert ${alertId} acknowledged and logged to NOC dispatch`);
  };

  useEffect(() => {
    if (!user) return;
    setActiveWorkspace(defaultWorkspace(user.role));
  }, [user]);

  useEffect(() => {
    if (user && !canOpen(activeWorkspace)) {
      setActiveWorkspace(defaultWorkspace(user.role));
    }
  }, [user, activeWorkspace, canOpen]);

  useEffect(() => {
    setMapFullscreen(false);
  }, [activeWorkspace]);

  /** Enter/exit browser fullscreen so tabs + address bar hide with Full Screen / Full map. */
  useEffect(() => {
    const root = document.documentElement;
    const isFs = () => Boolean(document.fullscreenElement);

    const enter = async () => {
      if (isFs()) return;
      try {
        await root.requestFullscreen?.();
      } catch {
        /* user gesture / permission denied — app chrome still expands */
      }
    };
    const exit = async () => {
      if (!isFs()) return;
      try {
        await document.exitFullscreen?.();
      } catch {
        /* already exited */
      }
    };

    if (mapFullscreen) void enter();
    else void exit();

    const onFsChange = () => {
      if (!document.fullscreenElement) setMapFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, [mapFullscreen]);

  if (!user) return <LoginScreen />;

  const handleSelectWorkspace = (ws: WorkspaceId) => {
    if (!canOpen(ws)) {
      triggerToast('Access denied for your RBAC clearance');
      return;
    }
    setMapFullscreen(false);
    setActiveWorkspace(ws);
  };

  const fillViewportWorkspace =
    activeWorkspace === 'ndps-spatial-dashboard' ||
    activeWorkspace === 'ndps-analytics' ||
    activeWorkspace === 'roads-routing' ||
    activeWorkspace === 'roads-routing-new' ||
    activeWorkspace === 'atlas' ||
    activeWorkspace === 'mobile-locus-export' ||
    activeWorkspace === 'raster-imagery';

  return (
    <div className="h-dvh max-h-dvh min-h-0 bg-background text-on-surface flex flex-col overflow-hidden">
      {!mapFullscreen && (
        <TopCommandHeader
          alerts={alerts}
          onAcknowledgeAlert={handleAcknowledgeAlert}
          onSelectFeatureAndFly={handleSelectFeatureAndFly}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
          onSwitchWorkspace={handleSelectWorkspace}
          userName={user.displayName}
          userRole={user.role}
          userUnit={user.unit}
          onLogout={logout}
        />
      )}

      {!mapFullscreen && (
        <LeftNavigationRail
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={handleSelectWorkspace}
          collapsed={sidebarCollapsed}
          allowedWorkspaces={allowedWorkspaces(user.role)}
        />
      )}

      {/* Main Content Shell */}
      <main
        className={
          mapFullscreen
            ? 'flex-1 min-h-0 min-w-0 overflow-hidden p-0'
            : fillViewportWorkspace
              ? `pt-14 flex-1 min-h-0 min-w-0 overflow-hidden transition-[padding] duration-200 ${
                  sidebarCollapsed ? 'pl-14' : 'pl-64'
                }`
              : `pt-14 flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto transition-[padding] duration-200 ${
                  sidebarCollapsed ? 'pl-14' : 'pl-64'
                }`
        }
      >
        <MapLayoutProvider
          token={`${sidebarCollapsed ? 'rail-sm' : 'rail-lg'}:${activeWorkspace}:${mapFullscreen ? 'full' : 'shell'}`}
        >
        <div className={fillViewportWorkspace || mapFullscreen ? 'h-full min-h-0' : undefined}>
        <WorkspaceErrorBoundary workspaceLabel={activeWorkspace}>
        {activeWorkspace === 'ndps-spatial-dashboard' && (
          <CoreOpsWorkspaces
            workspace={activeWorkspace}
            dashboardLayers={dashboardLayers}
            onSelectFeatureAndFly={handleSelectFeatureAndFly}
            onFlyToLocation={handleFlyToLocation}
            onSwitchWorkspace={handleSelectWorkspace}
            onTriggerToast={triggerToast}
            focusRequest={externalFocus}
            dashboardMapExpanded={mapFullscreen}
            onDashboardMapExpandedChange={setMapFullscreen}
          />
        )}

        {activeWorkspace === 'ndps-analytics' && <NdpsAnalyticsWorkspace />}

        {activeWorkspace === 'roads-routing' && (
          <RoadsRoutingWorkspace
            allLayers={INITIAL_GIS_LAYERS}
            routingConfig={roadsRoutingConfig}
            onChangeRoutingLayerVisibility={(layerId, enabled) => {
              // Unroutable road lines stay off the map + disabled in the UI — ignore Eye toggles.
              if (isUnroutableDisplayRoadLayer(layerId)) return;
              setRoadsRoutingConfig((prev) => {
                const cur = prev[layerId];
                if (!cur) return prev;
                const next = { ...prev, [layerId]: { ...cur, enabled } };
                persistRoadsRoutingLayerConfig(next);
                return next;
              });
            }}
            onSetRoutingLayersVisibility={(layerIds, enabled) => {
              setRoadsRoutingConfig((prev) => {
                let changed = false;
                const next: typeof prev = { ...prev };
                for (const id of layerIds) {
                  if (isUnroutableDisplayRoadLayer(id)) continue;
                  const cur = next[id];
                  if (!cur || cur.enabled === enabled) continue;
                  next[id] = { ...cur, enabled };
                  changed = true;
                }
                if (!changed) return prev;
                persistRoadsRoutingLayerConfig(next);
                return next;
              });
            }}
            onEnableAllSavedRoutingLayers={() => {
              setRoadsRoutingConfig((prev) => {
                let changed = false;
                const next: typeof prev = { ...prev };
                for (const [id, cur] of Object.entries(next)) {
                  if (isUnroutableDisplayRoadLayer(id)) continue;
                  if (!cur.enabled) {
                    next[id] = { ...cur, enabled: true };
                    changed = true;
                  }
                }
                if (!changed) return prev;
                persistRoadsRoutingLayerConfig(next);
                return next;
              });
            }}
            onRemoveRoutingLayer={(layerId) => {
              setRoadsRoutingConfig((prev) => {
                const next = { ...prev };
                delete next[layerId];
                persistRoadsRoutingLayerConfig(next);
                return next;
              });
              // Opt out of Save→Roads Routing only; catalog Visible stays until all three destinations drop it.
              handleExcludeFromCatalogHover('roadsRouting', [layerId]);
            }}
            onRemoveRoutingLayers={(layerIds) => {
              setRoadsRoutingConfig((prev) => {
                let changed = false;
                const next: typeof prev = { ...prev };
                for (const id of layerIds) {
                  if (!(id in next)) continue;
                  delete next[id];
                  changed = true;
                }
                if (!changed) return prev;
                persistRoadsRoutingLayerConfig(next);
                return next;
              });
              handleExcludeFromCatalogHover('roadsRouting', layerIds);
            }}
            onChangeRoutingLayerColor={(layerId, color) => {
              setRoadsRoutingConfig((prev) => {
                const cur = prev[layerId];
                if (!cur) return prev;
                const next = { ...prev, [layerId]: { ...cur, color } };
                persistRoadsRoutingLayerConfig(next);
                return next;
              });
            }}
            onClearSavedLayers={() => {
              const ids = Object.keys(roadsRoutingConfig);
              setRoadsRoutingConfig({});
              persistRoadsRoutingLayerConfig({});
              handleExcludeFromCatalogHover('roadsRouting', ids);
            }}
            onSwitchWorkspace={handleSelectWorkspace}
            onTriggerToast={triggerToast}
          />
        )}

        {activeWorkspace === 'roads-routing-new' && (
          <RoadsRoutingNewWorkspace
            allLayers={layers}
            routingNewConfig={roadsRoutingNewConfig}
            onChangeLayerVisibility={(layerId, enabled) => {
              setRoadsRoutingNewConfig((prev) => {
                const cur = prev[layerId];
                if (!cur) return prev;
                const next = { ...prev, [layerId]: { ...cur, enabled } };
                persistRoadsRoutingNewLayerConfig(next);
                return next;
              });
            }}
            onSetLayersVisibility={(layerIds, enabled) => {
              setRoadsRoutingNewConfig((prev) => {
                let changed = false;
                const next: typeof prev = { ...prev };
                for (const id of layerIds) {
                  const cur = next[id];
                  if (!cur || cur.enabled === enabled) continue;
                  next[id] = { ...cur, enabled };
                  changed = true;
                }
                if (!changed) return prev;
                persistRoadsRoutingNewLayerConfig(next);
                return next;
              });
            }}
            onEnableAllSavedLayers={() => {
              setRoadsRoutingNewConfig((prev) => {
                let changed = false;
                const next: typeof prev = { ...prev };
                for (const [id, cur] of Object.entries(next)) {
                  if (!cur.enabled) {
                    next[id] = { ...cur, enabled: true };
                    changed = true;
                  }
                }
                if (!changed) return prev;
                persistRoadsRoutingNewLayerConfig(next);
                return next;
              });
            }}
            onRemoveLayer={(layerId) => {
              setRoadsRoutingNewConfig((prev) => {
                const next = { ...prev };
                delete next[layerId];
                persistRoadsRoutingNewLayerConfig(next);
                return next;
              });
              handleExcludeFromCatalogHover('roadsRoutingNew', [layerId]);
            }}
            onRemoveLayers={(layerIds) => {
              setRoadsRoutingNewConfig((prev) => {
                let changed = false;
                const next: typeof prev = { ...prev };
                for (const id of layerIds) {
                  if (!(id in next)) continue;
                  delete next[id];
                  changed = true;
                }
                if (!changed) return prev;
                persistRoadsRoutingNewLayerConfig(next);
                return next;
              });
              handleExcludeFromCatalogHover('roadsRoutingNew', layerIds);
            }}
            onChangeLayerColor={(layerId, color) => {
              setRoadsRoutingNewConfig((prev) => {
                const cur = prev[layerId];
                if (!cur) return prev;
                const next = { ...prev, [layerId]: { ...cur, color } };
                persistRoadsRoutingNewLayerConfig(next);
                return next;
              });
            }}
            onClearSavedLayers={(layerIds) => {
              setRoadsRoutingNewConfig({});
              persistRoadsRoutingNewLayerConfig({});
              handleExcludeFromCatalogHover('roadsRoutingNew', layerIds);
            }}
            onSwitchWorkspace={handleSelectWorkspace}
            onTriggerToast={triggerToast}
          />
        )}

        {activeWorkspace === 'atlas' && (
          <AtlasWorkspace
            onTriggerToast={triggerToast}
            mapExpanded={mapFullscreen}
            onMapExpandedChange={setMapFullscreen}
          />
        )}

        {activeWorkspace === 'mobile-locus-export' && (
          <LocusWorkspace
            onTriggerToast={triggerToast}
            mapExpanded={mapFullscreen}
            onMapExpandedChange={setMapFullscreen}
          />
        )}

        {activeWorkspace === 'raster-imagery' && (
          <RasterWorkspace
            onTriggerToast={triggerToast}
            mapExpanded={mapFullscreen}
            onMapExpandedChange={setMapFullscreen}
          />
        )}

        {(activeWorkspace === 'administrative-layers' ||
          activeWorkspace === 'operational-layers' ||
          activeWorkspace === 'road-network-layers') && (
          <DataLayerWorkspaces
            workspace={activeWorkspace}
            layers={layers}
            onToggleLayer={handleToggleLayer}
            onSetLayersEnabled={handleSetLayersEnabled}
            onSaveDashboardLayers={handleSaveDashboardLayers}
            onSaveRoadsRoutingLayers={handleSaveRoadsRoutingLayers}
            onSaveRoadsRoutingNewLayers={handleSaveRoadsRoutingNewLayers}
            dashboardSaveAck={catalogSaveAck.dashboard}
            roadsRoutingSaveAck={catalogSaveAck.roadsRouting}
            roadsRoutingNewSaveAck={catalogSaveAck.roadsRoutingNew}
            catalogHoverExclusions={catalogHoverExclusions}
            onRemoveDashboardLayer={(layerId) => {
              handleExcludeFromCatalogHover('dashboard', [layerId]);
              setDashboardLayerConfig((prev) => {
                const cur = prev[layerId];
                if (!cur?.enabled) return prev;
                const next = {
                  ...prev,
                  [layerId]: { ...cur, enabled: false, opacity: cur.opacity },
                };
                persistDashboardLayerConfig(next);
                return next;
              });
              triggerToast(
                `Removed from Dashboard: ${INITIAL_GIS_LAYERS.find((l) => l.id === layerId)?.name ?? layerId}`
              );
            }}
            onUnselectAllDashboardLayers={(layerIds) => {
              handleExcludeFromCatalogHover('dashboard', layerIds);
              setDashboardLayerConfig((prev) => {
                const next = { ...prev };
                for (const id of layerIds) {
                  const opacity =
                    next[id]?.opacity ?? layers.find((l) => l.id === id)?.opacity ?? 100;
                  next[id] = { enabled: false, opacity };
                }
                persistDashboardLayerConfig(next);
                return next;
              });
              triggerToast(`Unselected ${layerIds.length} layer(s) from Dashboard`);
            }}
            onRemoveRoadsRoutingLayer={(layerId) => {
              handleExcludeFromCatalogHover('roadsRouting', [layerId]);
              setRoadsRoutingConfig((prev) => {
                if (!prev[layerId]) return prev;
                const next = { ...prev };
                delete next[layerId];
                persistRoadsRoutingLayerConfig(next);
                return next;
              });
              triggerToast(
                `Removed from Roads Routing: ${INITIAL_GIS_LAYERS.find((l) => l.id === layerId)?.name ?? layerId}`
              );
            }}
            onUnselectAllRoadsRoutingLayers={(layerIds) => {
              handleExcludeFromCatalogHover('roadsRouting', layerIds);
              setRoadsRoutingConfig((prev) => {
                const next = { ...prev };
                for (const id of layerIds) delete next[id];
                persistRoadsRoutingLayerConfig(next);
                return next;
              });
              triggerToast(`Unselected ${layerIds.length} layer(s) from Roads Routing`);
            }}
            onRemoveRoadsRoutingNewLayer={(layerId) => {
              handleExcludeFromCatalogHover('roadsRoutingNew', [layerId]);
              setRoadsRoutingNewConfig((prev) => {
                if (!prev[layerId]) return prev;
                const next = { ...prev };
                delete next[layerId];
                persistRoadsRoutingNewLayerConfig(next);
                return next;
              });
              triggerToast(
                `Removed from Roads Routing New: ${INITIAL_GIS_LAYERS.find((l) => l.id === layerId)?.name ?? layerId}`
              );
            }}
            onUnselectAllRoadsRoutingNewLayers={(layerIds) => {
              handleExcludeFromCatalogHover('roadsRoutingNew', layerIds);
              setRoadsRoutingNewConfig((prev) => {
                const next = { ...prev };
                for (const id of layerIds) delete next[id];
                persistRoadsRoutingNewLayerConfig(next);
                return next;
              });
              triggerToast(`Unselected ${layerIds.length} layer(s) from Roads Routing New`);
            }}
            onSwitchWorkspace={handleSelectWorkspace}
            onTriggerToast={triggerToast}
          />
        )}

        {(activeWorkspace === 'reports-seizure-analytics' ||
          activeWorkspace === 'users-audit-trail') && (
          <OutputsGovernanceWorkspaces
            workspace={activeWorkspace}
            layers={layers}
            auditLogs={auditLogs}
            onSwitchWorkspace={handleSelectWorkspace}
            onTriggerToast={triggerToast}
          />
        )}
        </WorkspaceErrorBoundary>
        </div>
        </MapLayoutProvider>
      </main>

      {/* Floating Tactical Toast — z above full-screen map frames (z-[900]) */}
      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-10 left-1/2 -translate-x-1/2 max-w-[min(92vw,40rem)] bg-primary/95 text-on-primary px-3.5 py-2.5 rounded-lg shadow-[0_12px_32px_rgba(7,25,41,0.35)] border border-secondary/70 text-xs flex items-center gap-2 pointer-events-none transition-all duration-200 z-[1100] backdrop-blur-sm ${
          toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        <Info className="w-4 h-4 text-secondary-fixed shrink-0" />
        <span className="font-semibold tracking-wide" data-testid="toast">
          {toastMessage}
        </span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
