import React, { useState } from 'react';
import { LayoutDashboard, Navigation2, Satellite, Save } from 'lucide-react';
import { GisLayer, WorkspaceId } from '../../types/gis';
import {
  CATALOG_SCOPE,
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

interface DataLayerProps {
  workspace: CatalogWorkspaceId;
  layers: GisLayer[];
  onToggleLayer: (id: string) => void;
  /** Bulk select/unselect (one audit entry). */
  onSetLayersEnabled: (ids: string[], enabled: boolean) => void;
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
  onSwitchWorkspace: (ws: WorkspaceId) => void;
  onTriggerToast: (msg: string) => void;
}

export const DataLayerWorkspaces: React.FC<DataLayerProps> = ({
  workspace,
  layers,
  onToggleLayer,
  onSetLayersEnabled,
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
  onSwitchWorkspace,
  onTriggerToast,
}) => {
  // Catalog filter
  const [catalogSearch, setCatalogSearch] = useState('');

  const catalogId = workspace;
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
  const filtering = catalogSearch.trim().length > 0;
  // "Select All" acts on what the user sees (the filtered rows).
  const targetLayers = filtering ? filtered : scoped;
  const allTargetSelected = targetLayers.length > 0 && targetLayers.every((layer) => layer.enabled);

  const handleSelectAllToggle = () => {
    if (!targetLayers.length) {
      onTriggerToast('No layers available in this view');
      return;
    }
    const scopeLabel = filtering ? `${targetLayers.length} filtered` : `all ${targetLayers.length}`;
    if (allTargetSelected) {
      onSetLayersEnabled(
        targetLayers.map((l) => l.id),
        false
      );
      onTriggerToast(`Unselected ${scopeLabel} layer(s) in ${meta.title}`);
      return;
    }
    onSetLayersEnabled(
      targetLayers.filter((l) => !l.enabled).map((l) => l.id),
      true
    );
    onTriggerToast(`Selected ${scopeLabel} layer(s) in ${meta.title}`);
  };
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
        <div className="ws-panel px-4 py-3.5 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              {meta.eyebrow ? (
                <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-secondary block">
                  {meta.eyebrow}
                </span>
              ) : null}
              <h1 className="text-xl font-bold text-primary tracking-tight leading-tight">
                {meta.title}
              </h1>
              {meta.blurb ? (
                <p className="text-[11px] text-on-surface-variant mt-1 max-w-3xl">{meta.blurb}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                data-testid="catalog-select-all-layers"
                onClick={handleSelectAllToggle}
                disabled={!targetLayers.length}
                className="ws-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {allTargetSelected
                  ? filtering
                    ? 'Unselect Filtered'
                    : 'Unselect All Layers'
                  : filtering
                    ? 'Select Filtered'
                    : 'Select All Layers'}
              </button>
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Filter layers or PostGIS table..."
                aria-label="Filter layers"
                className="ws-field !h-8 !w-64 !max-w-full !font-medium"
              />
            </div>
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
            <div className="flex flex-wrap items-center justify-end gap-1.5 ml-auto">
              <button
                type="button"
                data-testid="catalog-open-dashboard"
                onClick={() => onSwitchWorkspace('ndps-spatial-dashboard')}
                title="Open Dashboard"
                aria-label="Open Dashboard"
                className="h-8 w-8 rounded border border-outline-variant/60 bg-surface-container-lowest text-on-surface-variant hover:text-primary hover:bg-surface-container-low inline-flex items-center justify-center cursor-pointer transition-colors"
              >
                <LayoutDashboard className="w-4 h-4" />
              </button>
              <button
                type="button"
                data-testid="catalog-open-roads-routing"
                onClick={() => onSwitchWorkspace('roads-routing')}
                title="Open Roads Routing"
                aria-label="Open Roads Routing"
                className="h-8 w-8 rounded border border-outline-variant/60 bg-surface-container-lowest text-on-surface-variant hover:text-primary hover:bg-surface-container-low inline-flex items-center justify-center cursor-pointer transition-colors"
              >
                <Navigation2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                data-testid="catalog-open-roads-routing-new"
                onClick={() => onSwitchWorkspace('roads-routing-new')}
                title="Open Roads Routing New"
                aria-label="Open Roads Routing New"
                className="h-8 w-8 rounded border border-outline-variant/60 bg-surface-container-lowest text-on-surface-variant hover:text-primary hover:bg-surface-container-low inline-flex items-center justify-center cursor-pointer transition-colors"
              >
                <Satellite className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="ws-panel overflow-x-auto">
          <table className="ws-table tabular-coord whitespace-nowrap">
            <thead>
              <tr>
                <th>Visible</th>
                <th>Layer Name</th>
                <th>PostGIS Source Table</th>
                <th>Geometry</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 px-3 text-on-surface-variant">
                    {filtering ? `No layers match “${catalogSearch}”.` : 'No layers in this module.'}
                  </td>
                </tr>
              )}
              {filtered.map((lyr) => (
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
                  className="cursor-pointer hover:bg-surface-container-low/50"
                  title="Click row to toggle layer visibility"
                >
                  <td className="py-2 px-3">
                    <input
                      type="checkbox"
                      checked={lyr.enabled}
                      readOnly
                      tabIndex={-1}
                      className="w-4 h-4 accent-primary pointer-events-none"
                      title="Toggle layer visibility"
                    />
                  </td>
                  <td className="py-2 px-3 font-semibold text-primary">{lyr.name}</td>
                  <td className="py-2 px-3 font-mono text-[11px] text-secondary">{lyr.sourceTable}</td>
                  <td className="py-2 px-3">{lyr.geometryType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
};
