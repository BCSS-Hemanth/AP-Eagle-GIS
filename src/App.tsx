import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Info } from 'lucide-react';
import {
  AuditLogEntry,
  BasemapId,
  CrsId,
  DigitizedFeature,
  GisLayer,
  TacticalAlert,
  WorkspaceId,
} from './types/gis';
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_GIS_JOBS,
  INITIAL_GIS_LAYERS,
  INITIAL_TACTICAL_ALERTS,
  INSPECTABLE_FEATURES,
} from './data/apGisData';
import { TopCommandHeader } from './components/TopCommandHeader';
import { LeftNavigationRail } from './components/LeftNavigationRail';
import { MapViewerWorkspace } from './components/MapViewerWorkspace';
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
  loadDashboardLayerConfig,
  persistDashboardLayerConfig,
  type DashboardLayerConfig,
} from './gis/dashboardLayers';
import {
  countRoutingLayers,
  loadRoadsRoutingLayerConfig,
  persistRoadsRoutingLayerConfig,
  type RoadsRoutingLayerConfig,
} from './gis/roadsRoutingLayers';
import {
  countRoutingNewLayers,
  isRoadsRoutingNewCatalogLayer,
  loadRoadsRoutingNewLayerConfig,
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
import type { IngestedLayer } from './gis/ingest';
import { RoadsRoutingWorkspace } from './components/workspaces/RoadsRoutingWorkspace';
import { RoadsRoutingNewWorkspace } from './components/workspaces/RoadsRoutingNewWorkspace';

function AppShell() {
  const { user, canOpen, can, logout } = useAuth();
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('ndps-spatial-dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(true);
  const [dashboardMapExpanded, setDashboardMapExpanded] = useState(false);
  const kmzStations = usePoliceStations(true);
  const kmzRows = useMemo(() => policeStationsToRows(kmzStations), [kmzStations]);
  const searchTargets = useMemo(
    () => buildSearchTargets(INSPECTABLE_FEATURES, kmzRows),
    [kmzRows]
  );

  // Global Spatial State
  const [layers, setLayers] = useState<GisLayer[]>(() => {
    const saved = loadDashboardLayerConfig();
    const next = saved ? applyLayerConfig(INITIAL_GIS_LAYERS, saved) : INITIAL_GIS_LAYERS;
    return next.map((layer) => (layer.id === 'lyr-pss' ? { ...layer, enabled: false } : layer));
  });
  const [dashboardLayerConfig, setDashboardLayerConfig] = useState<DashboardLayerConfig>(() => {
    const loaded = loadDashboardLayerConfig() ?? defaultDashboardLayerConfig(INITIAL_GIS_LAYERS);
    return {
      ...loaded,
      'lyr-pss': { enabled: false, opacity: loaded['lyr-pss']?.opacity ?? 100 },
    };
  });
  const [roadsRoutingConfig, setRoadsRoutingConfig] = useState<RoadsRoutingLayerConfig>(
    () => loadRoadsRoutingLayerConfig() ?? {}
  );
  const [roadsRoutingNewConfig, setRoadsRoutingNewConfig] = useState<RoadsRoutingNewLayerConfig>(
    () => loadRoadsRoutingNewLayerConfig() ?? {}
  );
  /** Independent sticky labels after each Save click (not cleared by hover remove / new ticks). */
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
  const [basemap, setBasemap] = useState<BasemapId>('maplibre');
  const crs: CrsId = 'EPSG:4326';
  const [centerCoords, setCenterCoords] = useState<{ lat: number; lon: number }>({
    lat: 16.5062,
    lon: 80.648,
  });
  const [selectedFeatureId, setSelectedFeatureId] = useState<string>('');
  const [selectedPsId, setSelectedPsId] = useState<string | null>(null);
  const [externalFocus, setExternalFocus] = useState<{
    lat: number;
    lon: number;
    zoom: number;
  } | null>(null);

  // Map Viewer Dock States
  const [leftOpen, setLeftOpen] = useState<boolean>(true);
  const [rightOpen, setRightOpen] = useState<boolean>(true);
  const [bottomMode, setBottomMode] = useState<'expanded' | 'minimized' | 'closed'>('expanded');

  // Dynamic Platform State
  const jobs = INITIAL_GIS_JOBS;
  const [alerts, setAlerts] = useState<TacticalAlert[]>(INITIAL_TACTICAL_ALERTS);
  const [digitizedFeatures, setDigitizedFeatures] = useState<DigitizedFeature[]>([]);
  const [ingestedLayers, setIngestedLayers] = useState<IngestedLayer[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const appendAudit = useCallback((action: string, resource: string) => {
    const now = new Date();
    const ts = `2026-10-28 ${String(now.getHours()).padStart(2, '0')}:${String(
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

  // Keyboard shortcuts when on Interactive Map Viewer (ignore when typing in inputs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (activeWorkspace !== 'interactive-map') return;

      if (e.key.toLowerCase() === 'l') {
        setLeftOpen((v) => !v);
      } else if (e.key.toLowerCase() === 'r') {
        setRightOpen((v) => !v);
      } else if (e.key.toLowerCase() === 't') {
        setBottomMode((m) => (m === 'expanded' ? 'closed' : 'expanded'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeWorkspace]);

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
    if (target) {
      appendAudit(target.enabled ? 'DISABLE_LAYER' : 'ENABLE_LAYER', target.sourceTable);
    }
  };

  const handleExcludeFromCatalogHover = (
    destination: CatalogHoverDestination,
    layerIds: string[]
  ) => {
    if (layerIds.length === 0) return;
    setCatalogHoverExclusions((prev) => {
      const { next, turnOffLayerIds } = excludeLayersFromHover(prev, destination, layerIds);
      if (turnOffLayerIds.length > 0) {
        const off = new Set(turnOffLayerIds);
        setLayers((layersPrev) =>
          layersPrev.map((l) => (off.has(l.id) && l.enabled ? { ...l, enabled: false } : l))
        );
      }
      return next;
    });
  };

  const handleChangeLayerOpacity = (layerId: string, opacity: number) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, opacity } : l))
    );
  };

  const selectedIdsFor = (destination: CatalogHoverDestination) =>
    new Set(
      layers
        .filter((layer) => layer.enabled && !catalogHoverExclusions[destination][layer.id])
        .map((layer) => layer.id)
    );

  const handleSaveDashboardLayers = () => {
    const selected = selectedIdsFor('dashboard');
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
    const beforeIds = new Set(Object.keys(roadsRoutingConfig));
    const next = destinationConfigFromSelection(layers, selected, 'assigned', undefined, roadsRoutingConfig);
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
    if (!resolved) return;
    const { feature, stationId } = resolved;
    setSelectedPsId(stationId);
    if (INSPECTABLE_FEATURES[featureId] || INSPECTABLE_FEATURES[feature.id]) {
      setSelectedFeatureId(INSPECTABLE_FEATURES[featureId]?.id ?? feature.id);
    }
    setExternalFocus({ lat: feature.lat, lon: feature.lon, zoom: 13 });
    setCenterCoords({ lat: feature.lat, lon: feature.lon });
    setRightOpen(true);
    setActiveWorkspace('interactive-map');
    triggerToast(`Focused spatial target: ${feature.name}`);
  };

  const handleFlyToLocation = (lat: number, lon: number, label: string) => {
    setSelectedPsId(null);
    setExternalFocus({ lat, lon, zoom: 10 });
    setCenterCoords({ lat, lon });
    setActiveWorkspace('interactive-map');
    triggerToast(`Focused spatial target: ${label}`);
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
    );
    appendAudit('ACKNOWLEDGE_ALERT', alertId);
    triggerToast(`Alert ${alertId} acknowledged and logged to NOC dispatch`);
  };

  const handleAddDigitizedFeature = (df: DigitizedFeature) => {
    if (!can('digitize') && !can('import')) {
      triggerToast('Vector write denied for your RBAC clearance');
      return;
    }
    setDigitizedFeatures((prev) => [df, ...prev]);
    appendAudit('COMMIT_VECTOR_GEOMETRY', `${df.name} (${df.type})`);
  };

  const handlePublishIngested = (incoming: IngestedLayer[]) => {
    if (!can('import')) {
      triggerToast('Import denied for your RBAC clearance');
      return;
    }
    setIngestedLayers((prev) => [...incoming, ...prev]);
    const first = incoming[0];
    if (first?.bbox) {
      const lat = (first.bbox[1] + first.bbox[3]) / 2;
      const lon = (first.bbox[0] + first.bbox[2]) / 2;
      setExternalFocus({ lat, lon, zoom: 10 });
      setCenterCoords({ lat, lon });
    }
    appendAudit(
      'INGEST_LAYER',
      incoming.map((layer) => `${layer.driver}:${layer.name}`).join(', ')
    );
    triggerToast(
      `Mounted ${incoming.length} ingested layer${incoming.length === 1 ? '' : 's'} without replacing catalog data`
    );
    setActiveWorkspace('interactive-map');
  };

  const handleToggleIngested = (id: string) => {
    setIngestedLayers((prev) =>
      prev.map((layer) => (layer.id === id ? { ...layer, enabled: !layer.enabled } : layer))
    );
  };

  const handleIngestedOpacity = (id: string, opacity: number) => {
    setIngestedLayers((prev) =>
      prev.map((layer) => (layer.id === id ? { ...layer, opacity } : layer))
    );
  };

  const handleRemoveIngested = (id: string) => {
    setIngestedLayers((prev) => prev.filter((layer) => layer.id !== id));
  };

  const handleDeleteDigitizedFeature = (id: string) => {
    setDigitizedFeatures((prev) => prev.filter((f) => f.id !== id));
    triggerToast('Removed custom digitized geometry from map');
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
    if (activeWorkspace !== 'ndps-spatial-dashboard' && dashboardMapExpanded) {
      setDashboardMapExpanded(false);
    }
  }, [activeWorkspace, dashboardMapExpanded]);

  if (!user) return <LoginScreen />;

  const handleSelectWorkspace = (ws: WorkspaceId) => {
    if (!canOpen(ws)) {
      triggerToast('Access denied for your RBAC clearance');
      return;
    }
    setDashboardMapExpanded(false);
    setActiveWorkspace(ws);
  };

  const fillViewportWorkspace =
    activeWorkspace === 'ndps-spatial-dashboard' ||
    activeWorkspace === 'ndps-analytics' ||
    activeWorkspace === 'interactive-map' ||
    activeWorkspace === 'roads-routing' ||
    activeWorkspace === 'roads-routing-new';

  return (
    <div className="h-dvh max-h-dvh min-h-0 bg-background text-on-surface flex flex-col overflow-hidden">
      {!dashboardMapExpanded && (
        <TopCommandHeader
          jobs={jobs}
          alerts={alerts}
          onAcknowledgeAlert={handleAcknowledgeAlert}
          onSelectFeatureAndFly={handleSelectFeatureAndFly}
          allFeatures={searchTargets}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
          onSwitchWorkspace={handleSelectWorkspace}
          userName={user.displayName}
          userRole={user.role}
          userUnit={user.unit}
          onLogout={logout}
        />
      )}

      {!dashboardMapExpanded && (
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
          dashboardMapExpanded
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
          token={`${sidebarCollapsed ? 'rail-sm' : 'rail-lg'}:${activeWorkspace}:${dashboardMapExpanded ? 'full' : 'shell'}`}
        >
        <div className={fillViewportWorkspace || dashboardMapExpanded ? 'h-full min-h-0' : undefined}>
        <WorkspaceErrorBoundary workspaceLabel={activeWorkspace}>
        {activeWorkspace === 'interactive-map' && (
          <MapViewerWorkspace
            layers={layers}
            onToggleLayer={handleToggleLayer}
            onChangeLayerOpacity={handleChangeLayerOpacity}
            basemap={basemap}
            onChangeBasemap={setBasemap}
            crs={crs}
            selectedFeatureId={selectedFeatureId}
            onSelectFeature={setSelectedFeatureId}
            selectedPsId={selectedPsId}
            onSelectPsId={setSelectedPsId}
            externalFocus={externalFocus}
            featuresMap={INSPECTABLE_FEATURES}
            psRows={kmzRows}
            digitizedFeatures={digitizedFeatures}
            ingestedLayers={ingestedLayers}
            onToggleIngested={handleToggleIngested}
            onChangeIngestedOpacity={handleIngestedOpacity}
            onRemoveIngested={handleRemoveIngested}
            onPublishIngested={handlePublishIngested}
            onUpdateCenterCoords={(lat, lon) => setCenterCoords({ lat, lon })}
            onSwitchWorkspace={handleSelectWorkspace}
            onTriggerToast={triggerToast}
            leftOpen={leftOpen}
            setLeftOpen={setLeftOpen}
            rightOpen={rightOpen}
            setRightOpen={setRightOpen}
            bottomMode={bottomMode}
            setBottomMode={setBottomMode}
          />
        )}

        {activeWorkspace === 'ndps-spatial-dashboard' && (
          <CoreOpsWorkspaces
            workspace={activeWorkspace}
            dashboardLayers={dashboardLayers}
            onSelectFeatureAndFly={handleSelectFeatureAndFly}
            onFlyToLocation={handleFlyToLocation}
            onSwitchWorkspace={handleSelectWorkspace}
            onTriggerToast={triggerToast}
            dashboardMapExpanded={dashboardMapExpanded}
            onDashboardMapExpandedChange={setDashboardMapExpanded}
          />
        )}

        {activeWorkspace === 'ndps-analytics' && <NdpsAnalyticsWorkspace />}

        {activeWorkspace === 'roads-routing' && (
          <RoadsRoutingWorkspace
            allLayers={INITIAL_GIS_LAYERS}
            routingConfig={roadsRoutingConfig}
            onChangeRoutingLayerVisibility={(layerId, enabled) => {
              setRoadsRoutingConfig((prev) => {
                const cur = prev[layerId];
                if (!cur) return prev;
                const next = { ...prev, [layerId]: { ...cur, enabled } };
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
            }}
            onClearSavedLayers={() => {
              setRoadsRoutingConfig({});
              persistRoadsRoutingLayerConfig({});
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
            onRemoveLayer={(layerId) => {
              setRoadsRoutingNewConfig((prev) => {
                const next = { ...prev };
                delete next[layerId];
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

        {(activeWorkspace === 'administrative-layers' ||
          activeWorkspace === 'operational-layers' ||
          activeWorkspace === 'road-network-layers' ||
          activeWorkspace === 'import-export' ||
          activeWorkspace === 'feature-editor' ||
          activeWorkspace === 'raster-imagery') && (
          <DataLayerWorkspaces
            workspace={activeWorkspace}
            layers={layers}
            onToggleLayer={handleToggleLayer}
            onChangeLayerOpacity={handleChangeLayerOpacity}
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
            digitizedFeatures={digitizedFeatures}
            ingestedLayers={ingestedLayers}
            onAddDigitizedFeature={handleAddDigitizedFeature}
            onDeleteDigitizedFeature={handleDeleteDigitizedFeature}
            onPublishIngested={handlePublishIngested}
            onSwitchWorkspace={handleSelectWorkspace}
            onTriggerToast={triggerToast}
            onFlyToLocation={handleFlyToLocation}
          />
        )}

        {(activeWorkspace === 'mobile-locus-export' ||
          activeWorkspace === 'atlas-map-books' ||
          activeWorkspace === 'reports-seizure-analytics' ||
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

      {/* Floating Tactical Toast Notification */}
      <div
        className={`fixed bottom-10 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-3.5 py-2 rounded shadow-xl border border-secondary text-xs flex items-center gap-2 pointer-events-none transition-opacity duration-200 z-50 ${
          toastMessage ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <Info className="w-4 h-4 text-secondary-fixed shrink-0" />
        <span className="font-medium whitespace-nowrap" data-testid="toast">
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
