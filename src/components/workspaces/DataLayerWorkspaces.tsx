import React, { useState } from 'react';
import { Grid, Save } from 'lucide-react';
import { DigitizedFeature, GisLayer, WorkspaceId } from '../../types/gis';
import type { IngestedLayer } from '../../gis/ingest';
import { ApLeafletMap } from '../gis/ApLeafletMap';
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

type DataLayerWorkspaceId = CatalogWorkspaceId | 'raster-imagery';

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
  digitizedFeatures: _digitizedFeatures,
  ingestedLayers: _ingestedLayers = [],
  onAddDigitizedFeature: _onAddDigitizedFeature,
  onPublishIngested: _onPublishIngested,
  onDeleteDigitizedFeature: _onDeleteDigitizedFeature,
  onSwitchWorkspace,
  onTriggerToast,
  onFlyToLocation: _onFlyToLocation,
}) => {
  // Catalog filter
  const [catalogSearch, setCatalogSearch] = useState('');

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
                onClick={() => onSwitchWorkspace('ndps-spatial-dashboard')}
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

  return (
    <div className="p-4 pb-10 lg:p-6 lg:pb-12 space-y-4 max-w-[1440px] mx-auto">
      <div className="border-b border-outline-variant/35 pb-3">
        <h1 className="text-xl font-bold text-primary tracking-tight">
          Raster Imagery &amp; SOI Toposheet Mosaic
        </h1>
      </div>

      <div className="gis-map-host h-72 rounded border border-outline-variant/40">
        <ApLeafletMap
          basemap="topo"
          showStateBorder
          showDistricts={false}
          showPoliceStations={false}
          showSoiTopo={false}
          showImageryOverlay={false}
          initialCenter={[17.88, 82.12]}
          initialZoom={9}
        />
      </div>

      <div className="rounded border border-dashed border-outline-variant/50 bg-surface-container-lowest px-4 py-8 text-center">
        <Grid className="w-6 h-6 mx-auto text-on-surface-variant/70 mb-2" />
        <p className="text-sm font-semibold text-primary">No raster or toposheet data</p>
        <p className="text-[11px] text-on-surface-variant mt-1">
          Sheet inventory and imagery overlays have been cleared from this module.
        </p>
      </div>
    </div>
  );
};
