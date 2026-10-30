import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Info } from 'lucide-react';
import {
  AuditLogEntry,
  BasemapId,
  CrsId,
  DigitizedFeature,
  GisJob,
  GisLayer,
  TacticalAlert,
  TopologyAuditRule,
  WorkspaceId,
} from './types/gis';
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_GIS_JOBS,
  INITIAL_GIS_LAYERS,
  INITIAL_TACTICAL_ALERTS,
  INITIAL_TOPOLOGY_RULES,
  INSPECTABLE_FEATURES,
} from './data/apGisData';
import { TopCommandHeader } from './components/TopCommandHeader';
import { LeftNavigationRail } from './components/LeftNavigationRail';
import { MapViewerWorkspace } from './components/MapViewerWorkspace';
import { CoreOpsWorkspaces } from './components/workspaces/CoreOpsWorkspaces';
import { DataLayerWorkspaces } from './components/workspaces/DataLayerWorkspaces';
import { OutputsGovernanceWorkspaces } from './components/workspaces/OutputsGovernanceWorkspaces';
import { MapLayoutProvider } from './components/gis/ApLeafletMap';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { allowedWorkspaces, defaultWorkspace } from './auth/rbac';
import { policeStationsToRows, usePoliceStations } from './gis/usePoliceStations';
import { buildSearchTargets, resolveFlyTarget } from './gis/searchTargets';

function AppShell() {
  const { user, canOpen, can, logout } = useAuth();
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('gis-dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(true);
  const kmzStations = usePoliceStations(true);
  const kmzRows = useMemo(() => policeStationsToRows(kmzStations), [kmzStations]);
  const searchTargets = useMemo(
    () => buildSearchTargets(INSPECTABLE_FEATURES, kmzRows),
    [kmzRows]
  );

  // Global Spatial State
  const [layers, setLayers] = useState<GisLayer[]>(INITIAL_GIS_LAYERS);
  const [basemap, setBasemap] = useState<BasemapId>('maplibre');
  const [crs, setCrs] = useState<CrsId>('EPSG:4326');
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
  const [jobs, setJobs] = useState<GisJob[]>(INITIAL_GIS_JOBS);
  const [alerts, setAlerts] = useState<TacticalAlert[]>(INITIAL_TACTICAL_ALERTS);
  const [digitizedFeatures, setDigitizedFeatures] = useState<DigitizedFeature[]>([]);
  const [topologyRules, setTopologyRules] = useState<TopologyAuditRule[]>(INITIAL_TOPOLOGY_RULES);
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
    const hashSuffix = Math.floor(1000 + Math.random() * 8999).toString(16);
    setAuditLogs((prev) => [
      {
        id: `AUD-${9042 + prev.length}`,
        timestamp: ts,
        actor: user?.displayName ?? 'local user',
        role: user?.role ?? 'STATE_SPATIAL_ADMIN',
        ipNode: 'local session',
        action,
        resource,
        signatureHash: `local:${hashSuffix}`,
      },
      ...prev,
    ]);
  }, [user]);

  // Keyboard shortcuts when on Interactive Map Viewer (ignore when typing in inputs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (activeWorkspace !== 'interactive-map-viewer') return;

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
    if (target) {
      appendAudit(target.enabled ? 'DISABLE_LAYER' : 'ENABLE_LAYER', target.sourceTable);
    }
  };

  const handleChangeLayerOpacity = (layerId: string, opacity: number) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, opacity } : l))
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
    setActiveWorkspace('interactive-map-viewer');
    triggerToast(`Focused spatial target: ${feature.name}`);
  };

  const handleFlyToLocation = (lat: number, lon: number, label: string) => {
    setSelectedPsId(null);
    setExternalFocus({ lat, lon, zoom: 10 });
    setCenterCoords({ lat, lon });
    setActiveWorkspace('interactive-map-viewer');
    triggerToast(`Focused spatial target: ${label}`);
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
    );
    appendAudit('ACKNOWLEDGE_ALERT', alertId);
    triggerToast(`Alert ${alertId} acknowledged and logged to NOC dispatch`);
  };

  const handleAddJob = (job: GisJob) => {
    if (!can('geoprocess')) {
      triggerToast('Geoprocessing denied for your RBAC clearance');
      return;
    }
    setJobs((prev) => [job, ...prev]);
    appendAudit('RUN_GEOPROCESSING', `${job.algorithm} -> ${job.targetLayer}`);
  };

  const handleAddDigitizedFeature = (df: DigitizedFeature) => {
    if (!can('digitize') && !can('import')) {
      triggerToast('Vector write denied for your RBAC clearance');
      return;
    }
    setDigitizedFeatures((prev) => [df, ...prev]);
    appendAudit('COMMIT_VECTOR_GEOMETRY', `${df.name} (${df.type})`);
  };

  const handleDeleteDigitizedFeature = (id: string) => {
    setDigitizedFeatures((prev) => prev.filter((f) => f.id !== id));
    triggerToast('Removed custom digitized geometry from map');
  };

  const handleFixTopologyRule = (ruleId: string) => {
    if (!can('fixTopology')) {
      triggerToast('Topology repair denied for your RBAC clearance');
      return;
    }
    setTopologyRules((prev) =>
      prev.map((r) =>
        r.id === ruleId
          ? {
              ...r,
              violations: 0,
              severity: 'Pass',
              description: `${r.description} [Auto-snapped & validated via PostGIS ST_Snap]`,
            }
          : r
      )
    );
    appendAudit('RESOLVE_TOPOLOGY_SLIVER', ruleId);
    triggerToast(`Topology rule ${ruleId} resolved with zero remaining violations`);
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

  if (!user) return <LoginScreen />;

  const handleSelectWorkspace = (ws: WorkspaceId) => {
    if (!canOpen(ws)) {
      triggerToast('Access denied for your RBAC clearance');
      return;
    }
    setActiveWorkspace(ws);
  };

  return (
    <div className="h-full min-h-0 bg-background text-on-surface flex flex-col overflow-hidden">
      {/* Global Command Header */}
      <TopCommandHeader
        centerLat={centerCoords.lat}
        centerLon={centerCoords.lon}
        crs={crs}
        onChangeCrs={(nextCrs) => {
          setCrs(nextCrs);
          appendAudit('SWITCH_CRS', nextCrs);
        }}
        jobs={jobs}
        alerts={alerts}
        onAcknowledgeAlert={handleAcknowledgeAlert}
        onSelectFeatureAndFly={handleSelectFeatureAndFly}
        allFeatures={searchTargets}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        onSwitchWorkspace={handleSelectWorkspace}
        onTriggerToast={triggerToast}
        userName={user.displayName}
        userRole={user.role}
        userUnit={user.unit}
        onLogout={logout}
      />

      {/* Left Workspace Navigation Rail */}
      <LeftNavigationRail
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        collapsed={sidebarCollapsed}
        allowedWorkspaces={allowedWorkspaces(user.role)}
      />

      {/* Main Content Shell */}
      <main
        className={`pt-14 flex-1 min-h-0 min-w-0 overflow-hidden transition-[padding] duration-200 ${
          sidebarCollapsed ? 'pl-14' : 'pl-64'
        }`}
      >
        <MapLayoutProvider token={`${sidebarCollapsed ? 'rail-sm' : 'rail-lg'}:${activeWorkspace}`}>
        {activeWorkspace === 'interactive-map-viewer' && (
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

        {(activeWorkspace === 'gis-dashboard' ||
          activeWorkspace === 'spatial-analysis-and-geoprocessing' ||
          activeWorkspace === 'map-designer-and-layout-composer') && (
          <CoreOpsWorkspaces
            workspace={activeWorkspace}
            jobs={jobs}
            onAddJob={handleAddJob}
            onSelectFeatureAndFly={handleSelectFeatureAndFly}
            onFlyToLocation={handleFlyToLocation}
            onSwitchWorkspace={handleSelectWorkspace}
            onTriggerToast={triggerToast}
          />
        )}

        {(activeWorkspace === 'administrative-and-operational-layers' ||
          activeWorkspace === 'vector-and-raster-data-import' ||
          activeWorkspace === 'feature-editor-and-digitizer' ||
          activeWorkspace === 'raster-management-and-toposheets') && (
          <DataLayerWorkspaces
            workspace={activeWorkspace}
            layers={layers}
            onToggleLayer={handleToggleLayer}
            onChangeLayerOpacity={handleChangeLayerOpacity}
            digitizedFeatures={digitizedFeatures}
            onAddDigitizedFeature={handleAddDigitizedFeature}
            onDeleteDigitizedFeature={handleDeleteDigitizedFeature}
            onSwitchWorkspace={handleSelectWorkspace}
            onTriggerToast={triggerToast}
            onFlyToLocation={handleFlyToLocation}
          />
        )}

        {(activeWorkspace === 'mobile-gis-export' ||
          activeWorkspace === 'atlas-map-book-generator' ||
          activeWorkspace === 'reports-and-seizure-analytics' ||
          activeWorkspace === 'data-quality-and-topology-audits' ||
          activeWorkspace === 'conditional-capabilities-and-dependency-register' ||
          activeWorkspace === 'user-roles-and-audit-trail') && (
          <OutputsGovernanceWorkspaces
            workspace={activeWorkspace}
            layers={layers}
            topologyRules={topologyRules}
            onFixTopologyRule={handleFixTopologyRule}
            auditLogs={auditLogs}
            onSwitchWorkspace={handleSelectWorkspace}
            onTriggerToast={triggerToast}
          />
        )}
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
