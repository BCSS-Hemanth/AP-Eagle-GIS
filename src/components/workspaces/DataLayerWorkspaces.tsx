import React, { useState } from 'react';
import {
  Edit3,
  Eye,
  Grid,
  MapPin,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { DigitizedFeature, GisLayer, WorkspaceId } from '../../types/gis';
import type { IngestedLayer } from '../../gis/ingest';
import { IngestPanel } from '../gis/IngestPanel';
import { ApLeafletMap } from '../gis/ApLeafletMap';
import { useAuth } from '../../auth/AuthContext';
import {
  CATALOG_SCOPE,
  CATALOG_WORKSPACE_IDS,
  canSaveToRoadsModules,
  layersInCatalogScope,
  type CatalogWorkspaceId,
} from '../../gis/catalogWorkspaces';
import {
  EMPTY_CATALOG_HOVER_EXCLUSIONS,
  layersForCatalogHover,
  type CatalogHoverExclusions,
} from '../../gis/catalogHoverSelection';
import { isRoadsRoutingNewVisualLayer } from '../../gis/roadsRoutingNewLayers';
import { SavedLayersHoverMenu } from '../gis/SavedLayersHoverMenu';

type DataLayerWorkspaceId =
  | CatalogWorkspaceId
  | 'import-export'
  | 'feature-editor'
  | 'raster-imagery';

interface DataLayerProps {
  workspace: DataLayerWorkspaceId;
  layers: GisLayer[];
  onToggleLayer: (id: string) => void;
  onChangeLayerOpacity: (id: string, opacity: number) => void;
  onSaveDashboardLayers?: () => void;
  onSaveRoadsRoutingLayers?: () => void;
  onSaveRoadsRoutingNewLayers?: () => void;
  /** Sticky per-destination “Saved to …” label after a successful Save click. */
  dashboardSaveAck?: boolean;
  roadsRoutingSaveAck?: boolean;
  roadsRoutingNewSaveAck?: boolean;
  /** Per-button hover opt-outs (independent until cleared from all three). */
  catalogHoverExclusions?: CatalogHoverExclusions;
  /** Turn off a layer on the Dashboard destination (does not add layers). */
  onRemoveDashboardLayer?: (layerId: string) => void;
  /** Remove a layer from Roads Routing saved set. */
  onRemoveRoadsRoutingLayer?: (layerId: string) => void;
  /** Remove a layer from Roads Routing New saved set. */
  onRemoveRoadsRoutingNewLayer?: (layerId: string) => void;
  /** Clear every layer currently listed for a destination hover. */
  onUnselectAllDashboardLayers?: (layerIds: string[]) => void;
  onUnselectAllRoadsRoutingLayers?: (layerIds: string[]) => void;
  onUnselectAllRoadsRoutingNewLayers?: (layerIds: string[]) => void;
  digitizedFeatures: DigitizedFeature[];
  ingestedLayers?: IngestedLayer[];
  onAddDigitizedFeature: (f: DigitizedFeature) => void;
  onPublishIngested?: (layers: IngestedLayer[]) => void;
  onDeleteDigitizedFeature: (id: string) => void;
  onSwitchWorkspace: (ws: WorkspaceId) => void;
  onTriggerToast: (msg: string) => void;
  onFlyToLocation?: (lat: number, lon: number, label: string) => void;
}

export const DataLayerWorkspaces: React.FC<DataLayerProps> = ({
  workspace,
  layers,
  onToggleLayer,
  onChangeLayerOpacity: _onChangeLayerOpacity,
  onSaveDashboardLayers,
  onSaveRoadsRoutingLayers,
  onSaveRoadsRoutingNewLayers,
  dashboardSaveAck = false,
  roadsRoutingSaveAck = false,
  roadsRoutingNewSaveAck = false,
  catalogHoverExclusions = EMPTY_CATALOG_HOVER_EXCLUSIONS,
  onRemoveDashboardLayer,
  onRemoveRoadsRoutingLayer,
  onRemoveRoadsRoutingNewLayer,
  onUnselectAllDashboardLayers,
  onUnselectAllRoadsRoutingLayers,
  onUnselectAllRoadsRoutingNewLayers,
  digitizedFeatures,
  ingestedLayers = [],
  onAddDigitizedFeature,
  onPublishIngested,
  onDeleteDigitizedFeature,
  onSwitchWorkspace,
  onTriggerToast,
  onFlyToLocation,
}) => {
  const { can } = useAuth();
  // Catalog filter
  const [catalogSearch, setCatalogSearch] = useState('');

  // Digitizer state
  const [drawGeometryType, setDrawGeometryType] = useState<'Point' | 'LineString' | 'Polygon'>('Point');
  const [draftPoints, setDraftPoints] = useState<Array<{ lat: number; lon: number }>>([]);
  const [draftName, setDraftName] = useState('Untitled feature');
  const [draftCategory, setDraftCategory] = useState<
    'Tactical Check Post' | 'Patrol Corridor' | 'Containment Cordon'
  >('Tactical Check Post');
  const [draftNotes, setDraftNotes] = useState('');

  if ((CATALOG_WORKSPACE_IDS as readonly string[]).includes(workspace)) {
    const catalogId = workspace as CatalogWorkspaceId;
    const meta = CATALOG_SCOPE[catalogId];
    const scoped = layersInCatalogScope(catalogId, layers);
    const filtered = scoped
      .filter(
        (l) =>
          l.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
          l.sourceTable.toLowerCase().includes(catalogSearch.toLowerCase())
      )
      // Road line layers for Roads Routing New first so they are easy to tick before Save.
      .slice()
      .sort((a, b) => {
        const ar = isRoadsRoutingNewVisualLayer(a.id) ? 0 : 1;
        const br = isRoadsRoutingNewVisualLayer(b.id) ? 0 : 1;
        return ar - br;
      });
    const showRoadsSave = canSaveToRoadsModules(catalogId);
    // Each Save button has an independent hover list (Visible minus that button's exclusions).
    const dashboardHoverLayers = layersForCatalogHover(
      layers,
      catalogHoverExclusions.dashboard
    );
    const roadsRoutingHoverLayers = layersForCatalogHover(
      layers,
      catalogHoverExclusions.roadsRouting
    );
    const roadsRoutingNewHoverLayers = layersForCatalogHover(
      layers,
      catalogHoverExclusions.roadsRoutingNew
    );

    return (
      <div className="p-4 pb-10 lg:p-6 lg:pb-12 space-y-4 max-w-[1440px] mx-auto">
        <div className="space-y-3 border-b border-outline-variant/35 pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              {meta.eyebrow ? (
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
                  {meta.eyebrow}
                </span>
              ) : null}
              <h1 className="text-xl font-bold text-primary tracking-tight">
                {meta.title}
              </h1>
              {meta.blurb ? (
                <p className="text-[11px] text-on-surface-variant mt-1">{meta.blurb}</p>
              ) : null}
            </div>
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Filter layers or PostGIS table..."
              className="h-8 w-64 max-w-full shrink-0 px-2.5 rounded border border-outline-variant/50 bg-surface-container-lowest text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <SavedLayersHoverMenu
                testId="catalog-save-dashboard-menu"
                title="On Dashboard"
                layers={dashboardHoverLayers}
                onRemove={(id) => onRemoveDashboardLayer?.(id)}
                onUnselectAll={() =>
                  onUnselectAllDashboardLayers?.(dashboardHoverLayers.map((l) => l.id))
                }
                emptyHint="No layers selected."
              >
                <button
                  type="button"
                  data-testid="catalog-save-dashboard"
                  data-saved={dashboardSaveAck ? 'true' : 'false'}
                  onClick={() => onSaveDashboardLayers?.()}
                  className={`h-8 px-3 rounded text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 shadow-sm ${
                    dashboardSaveAck
                      ? 'bg-secondary/85 text-on-secondary ring-1 ring-secondary/40'
                      : 'bg-secondary text-on-secondary'
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  {dashboardSaveAck ? 'Saved to Dashboard' : 'Save to Dashboard'}
                  {dashboardHoverLayers.length > 0 ? ` (${dashboardHoverLayers.length})` : ''}
                </button>
              </SavedLayersHoverMenu>
              {showRoadsSave && (
                <>
                  <SavedLayersHoverMenu
                    testId="catalog-save-roads-routing-menu"
                    title="In Roads Routing"
                    layers={roadsRoutingHoverLayers}
                    onRemove={(id) => onRemoveRoadsRoutingLayer?.(id)}
                    onUnselectAll={() =>
                      onUnselectAllRoadsRoutingLayers?.(
                        roadsRoutingHoverLayers.map((l) => l.id)
                      )
                    }
                    emptyHint="No layers selected."
                  >
                    <button
                      type="button"
                      data-testid="catalog-save-roads-routing"
                      data-saved={roadsRoutingSaveAck ? 'true' : 'false'}
                      onClick={() => onSaveRoadsRoutingLayers?.()}
                      className={`h-8 px-3 rounded text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 shadow-sm ${
                        roadsRoutingSaveAck
                          ? 'bg-primary/85 text-on-primary ring-1 ring-primary/35'
                          : 'bg-primary text-on-primary'
                      }`}
                    >
                      <Save className="w-3.5 h-3.5" />
                      {roadsRoutingSaveAck ? 'Saved to Roads Routing' : 'Save to Roads Routing'}
                      {roadsRoutingHoverLayers.length > 0
                        ? ` (${roadsRoutingHoverLayers.length})`
                        : ''}
                    </button>
                  </SavedLayersHoverMenu>
                  <SavedLayersHoverMenu
                    testId="catalog-save-roads-routing-new-menu"
                    title="In Roads Routing New"
                    layers={roadsRoutingNewHoverLayers}
                    onRemove={(id) => onRemoveRoadsRoutingNewLayer?.(id)}
                    onUnselectAll={() =>
                      onUnselectAllRoadsRoutingNewLayers?.(
                        roadsRoutingNewHoverLayers.map((l) => l.id)
                      )
                    }
                    emptyHint="No layers selected."
                  >
                    <button
                      type="button"
                      data-testid="catalog-save-roads-routing-new"
                      data-saved={roadsRoutingNewSaveAck ? 'true' : 'false'}
                      onClick={() => {
                        if (!onSaveRoadsRoutingNewLayers) {
                          onTriggerToast('Save to Roads Routing New is unavailable in this view');
                          return;
                        }
                        onSaveRoadsRoutingNewLayers();
                      }}
                      className={`h-8 px-3 rounded border-2 text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 shadow-sm ${
                        roadsRoutingNewSaveAck
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-primary/70 bg-primary/10 text-primary'
                      }`}
                    >
                      <Save className="w-3.5 h-3.5" />
                      {roadsRoutingNewSaveAck
                        ? 'Saved to Roads Routing New'
                        : 'Save to Roads Routing New'}
                      {roadsRoutingNewHoverLayers.length > 0
                        ? ` (${roadsRoutingNewHoverLayers.length})`
                        : ''}
                    </button>
                  </SavedLayersHoverMenu>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
              <button
                type="button"
                onClick={() => onSwitchWorkspace('ndps-spatial-dashboard')}
                className="h-8 px-3 rounded border border-outline-variant/60 bg-surface-container-lowest text-xs font-semibold cursor-pointer"
              >
                Open Dashboard
              </button>
              <button
                type="button"
                onClick={() => onSwitchWorkspace('interactive-map')}
                className="h-8 px-3 rounded bg-primary text-on-primary text-xs font-semibold cursor-pointer"
              >
                View Active Map
              </button>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded border border-outline-variant/40 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs tabular-coord whitespace-nowrap">
            <thead className="bg-surface-container text-[10.5px] font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/35">
              <tr>
                <th className="py-2.5 px-3">Visible</th>
                <th className="py-2.5 px-3">Layer Name</th>
                <th className="py-2.5 px-3">PostGIS Source Table</th>
                <th className="py-2.5 px-3">Geometry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/25">
              {filtered.map((lyr) => {
                const forRoutingNew = isRoadsRoutingNewVisualLayer(lyr.id);
                return (
                <tr
                  key={lyr.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={lyr.enabled}
                  onClick={() => onToggleLayer(lyr.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onToggleLayer(lyr.id);
                    }
                  }}
                  className={`cursor-pointer hover:bg-surface-container-low/50 ${forRoutingNew ? 'bg-primary/[0.03]' : ''}`}
                  title="Click row to toggle layer visibility"
                >
                  <td className="py-2 px-3">
                    <input
                      type="checkbox"
                      checked={lyr.enabled}
                      readOnly
                      tabIndex={-1}
                      className="w-4 h-4 accent-primary pointer-events-none"
                      title={
                        forRoutingNew
                          ? 'Road line layer — use with Save to Roads Routing New'
                          : 'Catalog visibility (not a Roads Routing New road geometry)'
                      }
                    />
                  </td>
                  <td className="py-2 px-3 font-semibold text-primary">
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      {lyr.name}
                      {forRoutingNew && (
                        <span
                          className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/15 text-primary"
                          title="Eligible for Save to Roads Routing New"
                        >
                          Road · New
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px] text-secondary">{lyr.sourceTable}</td>
                  <td className="py-2 px-3">{lyr.geometryType}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (workspace === 'import-export') {
    return (
      <div className="p-4 pb-10 lg:p-6 lg:pb-12 space-y-5 max-w-5xl mx-auto">
        <div className="border-b border-outline-variant/35 pb-3">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
            Data layer &amp; raster import
          </span>
          <h1 className="text-xl font-bold text-primary tracking-tight">
            Import &amp; Export
          </h1>
          <p className="text-[11px] text-on-surface-variant mt-1">
            Import GIS layers and raster datasets in supported file formats. Imported layers overlay the map
            without replacing catalog data.
          </p>
        </div>
        {ingestedLayers.length > 0 && (
          <div className="text-[11px] font-mono text-secondary">
            {ingestedLayers.length} ingested overlay{ingestedLayers.length === 1 ? '' : 's'} currently on the map
          </div>
        )}
        <div className="bg-surface-container-lowest rounded border border-outline-variant/40 p-5">
          <IngestPanel
            canImport={can('import')}
            onToast={onTriggerToast}
            onPublish={(layers) => {
              onPublishIngested?.(layers);
            }}
          />
        </div>
      </div>
    );
  }

  if (workspace === 'feature-editor') {
    const handleCanvasClick = (lat: number, lon: number) => {
      if (!can('digitize')) {
        onTriggerToast('Digitize denied for your RBAC clearance');
        return;
      }
      if (drawGeometryType === 'Point') {
        setDraftPoints([{ lat, lon }]);
      } else {
        setDraftPoints((prev) => [...prev, { lat, lon }]);
      }
    };

    const handleCommitFeature = (e: React.FormEvent) => {
      e.preventDefault();
      if (!can('digitize')) {
        onTriggerToast('Digitize denied for your RBAC clearance');
        return;
      }
      if (draftPoints.length === 0) {
        onTriggerToast('Click on the digitizing canvas to place at least 1 vertex first');
        return;
      }
      onAddDigitizedFeature({
        id: `DIG-${Date.now()}`,
        name: draftName,
        type: drawGeometryType,
        category: draftCategory,
        points: draftPoints,
        createdAt: '2026-10-28 04:43 IST',
        officer: 'GIS Lead Analyst',
        notes: draftNotes,
      });
      setDraftPoints([]);
      onTriggerToast(`Committed "${draftName}" to PostGIS & live map canvas`);
    };

    return (
      <div className="p-4 pb-10 lg:p-6 lg:pb-12 space-y-4 max-w-[1440px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/35 pb-3">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
              Interactive Vector Topology Digitizer
            </span>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Feature Editor &amp; Tactical Digitizer (ASR Eastern Ghats Sector)
            </h1>
          </div>
          <button
            type="button"
            onClick={() => onSwitchWorkspace('interactive-map')}
            className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold cursor-pointer"
          >
            Inspect on Main Map →
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Interactive Sector Digitizing Canvas */}
          <div className="lg:col-span-7 bg-surface-container-lowest rounded border border-outline-variant/40 overflow-hidden flex flex-col">
            <div className="px-3 py-2 bg-surface-container-low border-b border-outline-variant/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                {(['Point', 'LineString', 'Polygon'] as const).map((gt) => (
                  <button
                    key={gt}
                    type="button"
                    onClick={() => {
                      setDrawGeometryType(gt);
                      setDraftPoints([]);
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                      drawGeometryType === gt
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {gt}
                  </button>
                ))}
              </div>
              <span className="text-[10.5px] font-mono text-secondary">
                Click canvas to place vertices ({draftPoints.length} plotted)
              </span>
            </div>

            <div className="gis-map-host h-[22rem] bg-[#eaf2fb]">
              <ApLeafletMap
                basemap="hybrid"
                showStateBorder
                showDistricts
                showHighways
                showPoliceStations
                digitizedFeatures={digitizedFeatures}
                draftPoints={draftPoints}
                draftType={drawGeometryType}
                clickMode="draw"
                onMapClick={handleCanvasClick}
                initialCenter={[18.2, 82.7]}
                initialZoom={11}
              />
            </div>
          </div>

          {/* Attribute Form & Committed List */}
          <div className="lg:col-span-5 space-y-4">
            <form
              onSubmit={handleCommitFeature}
              className="bg-surface-container-lowest rounded border border-outline-variant/40 p-4 space-y-3 text-xs"
            >
              <div className="font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 border-b border-outline-variant/25 pb-2">
                <Edit3 className="w-3.5 h-3.5 text-secondary" />
                <span>New Vector Feature Attributes</span>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                  Feature Callsign / Name
                </label>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="w-full h-8 px-2.5 rounded border border-outline-variant/50 bg-surface-container-low"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                  Operational Class
                </label>
                <select
                  value={draftCategory}
                  onChange={(e) =>
                    setDraftCategory(
                      e.target.value as
                        | 'Tactical Check Post'
                        | 'Patrol Corridor'
                        | 'Containment Cordon'
                    )
                  }
                  className="w-full h-8 px-2 rounded border border-outline-variant/50 bg-surface-container-low"
                >
                  <option value="Tactical Check Post">Tactical Check Post</option>
                  <option value="Patrol Corridor">Patrol Corridor</option>
                  <option value="Containment Cordon">Containment Cordon</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                  Tactical Briefing Notes
                </label>
                <input
                  type="text"
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  className="w-full h-8 px-2.5 rounded border border-outline-variant/50 bg-surface-container-low"
                />
              </div>
              <button
                type="submit"
                data-testid="digitize-commit"
                disabled={!can('digitize')}
                className="w-full py-2 rounded bg-secondary text-on-secondary font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Commit Geometry to Map</span>
              </button>
            </form>

            <div className="bg-surface-container-lowest rounded border border-outline-variant/40 p-3.5 space-y-2 text-xs">
              <div className="font-bold uppercase tracking-wider text-primary text-[11px]">
                Session Digitized Features ({digitizedFeatures.length})
              </div>
              {digitizedFeatures.length === 0 ? (
                <p className="text-[11px] text-on-surface-variant">
                  No custom tactical geometries digitized yet. Click the live OSM map to plot vertices.
                </p>
              ) : (
                <div className="divide-y divide-outline-variant/25">
                  {digitizedFeatures.map((df) => {
                    const ll = df.points[0] ?? { lat: 18.3, lon: 82.8 };
                    return (
                      <div key={df.id} className="py-2 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-primary flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-secondary" />
                            <span>{df.name}</span>
                          </div>
                          <div className="text-[10px] font-mono text-on-surface-variant tabular-coord">
                            {df.type} • {ll.lat}°N, {ll.lon}°E
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteDigitizedFeature(df.id)}
                          className="p-1 text-error hover:bg-error-container/30 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // RASTER & TOPOSHEETS
  const toposheets = [
    { sheet: '65J/16', sector: 'Araku Valley & Sunkarimetta Ghat', scale: '1:50,000', rmse: '0.42m', cloud: '0%', layerId: 'lyr-soi-topo', lat: 18.3273, lon: 82.8775 },
    { sheet: '65J/12', sector: 'Paderu & G.Madugula Ridge', scale: '1:50,000', rmse: '0.38m', cloud: '2%', layerId: 'lyr-soi-topo', lat: 18.0833, lon: 82.6667 },
    { sheet: '65K/05', sector: 'Chintapalle & Darakonda Forest', scale: '1:50,000', rmse: '0.51m', cloud: '4%', layerId: 'lyr-soi-topo', lat: 17.8745, lon: 82.3512 },
    { sheet: '65O/01', sector: 'Anakapalli & NH-16 Corridor', scale: '1:50,000', rmse: '0.29m', cloud: '0%', layerId: 'lyr-cartosat', lat: 17.6896, lon: 83.0024 },
    { sheet: '65D/11', sector: 'Amaravati Capital & Mangalagiri', scale: '1:50,000', rmse: '0.21m', cloud: '0%', layerId: 'lyr-soi-grid', lat: 16.513, lon: 80.518 },
    { sheet: '57O/06', sector: 'Tirupati & Seshachalam Biosphere', scale: '1:50,000', rmse: '0.44m', cloud: '1%', layerId: 'lyr-soi-grid', lat: 13.6288, lon: 79.4192 },
  ];

  return (
    <div className="p-4 pb-10 lg:p-6 lg:pb-12 space-y-4 max-w-[1440px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/35 pb-3">
        <div>
          <h1 className="text-xl font-bold text-primary tracking-tight">
            Raster Imagery &amp; SOI Toposheet Mosaic
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            onToggleLayer('lyr-cartosat');
            onSwitchWorkspace('interactive-map');
            onTriggerToast('Satellite: Esri World Imagery statewide (no GIS-Source sat AOI stack).');
          }}
          className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Toggle GIS-Source Satellite on Map</span>
        </button>
      </div>

      <div className="gis-map-host h-72 rounded border border-outline-variant/40">
        <ApLeafletMap
          basemap="topo"
          showStateBorder
          showDistricts
          showPoliceStations
          showSoiTopo
          showImageryOverlay={layers.find((l) => l.id === 'lyr-cartosat')?.enabled ?? false}
          initialCenter={[17.88, 82.12]}
          initialZoom={9}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 tabular-coord">
        {toposheets.map((tp) => (
          <div
            key={tp.sheet}
            className="bg-surface-container-lowest rounded border border-outline-variant/40 p-4 flex flex-col justify-between gap-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-xs font-bold text-secondary flex items-center gap-1">
                  <Grid className="w-3.5 h-3.5" />
                  SOI SHEET {tp.sheet}
                </span>
                <h3 className="text-sm font-bold text-primary mt-0.5">{tp.sector}</h3>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">
                {tp.scale}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-surface-container-low p-2 rounded">
              <div>Georef RMSE: {tp.rmse}</div>
              <div>Cloud Cover: {tp.cloud}</div>
            </div>

            <button
              type="button"
              onClick={() => {
                onFlyToLocation?.(tp.lat, tp.lon, `SOI ${tp.sheet}`);
                onSwitchWorkspace('interactive-map');
                onTriggerToast(`Loaded SOI Sheet ${tp.sheet} (${tp.sector}) in Map Viewer`);
              }}
              className="w-full py-1.5 rounded bg-surface-container hover:bg-primary hover:text-on-primary text-xs font-semibold transition-colors cursor-pointer"
            >
              Mount Sheet in Map Viewer →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
