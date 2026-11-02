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
  configsEqual,
  countEnabledLayers,
  layerConfigFromGisLayers,
  leafletFlagsFromLayers,
  type DashboardLayerConfig,
} from '../../gis/dashboardLayers';

interface DataLayerProps {
  workspace:
    | 'administrative-and-operational-layers'
    | 'vector-and-raster-data-import'
    | 'feature-editor-and-digitizer'
    | 'raster-management-and-toposheets';
  layers: GisLayer[];
  dashboardLayerConfig?: DashboardLayerConfig;
  onToggleLayer: (id: string) => void;
  onChangeLayerOpacity: (id: string, opacity: number) => void;
  onSaveDashboardLayers?: () => void;
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
  dashboardLayerConfig,
  onToggleLayer,
  onChangeLayerOpacity,
  onSaveDashboardLayers,
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

  if (workspace === 'administrative-and-operational-layers') {
    const filtered = layers.filter(
      (l) =>
        l.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        l.sourceTable.toLowerCase().includes(catalogSearch.toLowerCase())
    );
    const catalogFlags = leafletFlagsFromLayers(layers);
    const unsaved = dashboardLayerConfig
      ? !configsEqual(layerConfigFromGisLayers(layers), dashboardLayerConfig)
      : true;
    const enabledCount = countEnabledLayers(layers);

    return (
      <div className="p-4 lg:p-6 space-y-4 max-w-[1440px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/35 pb-3">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
              Enterprise PostGIS Spatial Repository
            </span>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Administrative &amp; Operational Layer Catalog
            </h1>
            <p className="text-[11px] text-on-surface-variant mt-1">
              Toggle layers here, then Save to apply them on the GIS Dashboard map.
              {unsaved ? ' Unsaved changes are not on the Dashboard yet.' : ' Dashboard map matches this catalog.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Filter layers or PostGIS table..."
              className="h-8 w-64 px-2.5 rounded border border-outline-variant/50 bg-surface-container-lowest text-xs"
            />
            <button
              type="button"
              data-testid="catalog-save-dashboard"
              onClick={() => onSaveDashboardLayers?.()}
              className="h-8 px-3 rounded bg-secondary text-on-secondary text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
              title="Apply these catalog layers to the GIS Dashboard map"
            >
              <Save className="w-3.5 h-3.5" />
              Save to Dashboard
              {unsaved ? '' : ` (${enabledCount} on)`}
            </button>
            <button
              type="button"
              onClick={() => onSwitchWorkspace('gis-dashboard')}
              className="h-8 px-3 rounded border border-outline-variant/60 bg-surface-container-lowest text-xs font-semibold cursor-pointer"
            >
              Open Dashboard
            </button>
            <button
              type="button"
              onClick={() => onSwitchWorkspace('interactive-map-viewer')}
              className="h-8 px-3 rounded bg-primary text-on-primary text-xs font-semibold cursor-pointer"
            >
              View Active Map
            </button>
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
                <th className="py-2.5 px-3 text-right">Features</th>
                <th className="py-2.5 px-3">Native CRS</th>
                <th className="py-2.5 px-3 w-44">Render Opacity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/25">
              {filtered.map((lyr) => (
                <tr key={lyr.id} className="hover:bg-surface-container-low/50">
                  <td className="py-2 px-3">
                    <input
                      type="checkbox"
                      checked={lyr.enabled}
                      onChange={() => onToggleLayer(lyr.id)}
                      className="w-4 h-4 accent-primary cursor-pointer"
                    />
                  </td>
                  <td className="py-2 px-3 font-semibold text-primary">{lyr.name}</td>
                  <td className="py-2 px-3 font-mono text-[11px] text-secondary">{lyr.sourceTable}</td>
                  <td className="py-2 px-3">{lyr.geometryType}</td>
                  <td className="py-2 px-3 text-right font-mono font-semibold">
                    {lyr.featureCount.toLocaleString()}
                  </td>
                  <td className="py-2 px-3 font-mono">{lyr.crs}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={15}
                        max={100}
                        value={lyr.opacity}
                        onChange={(e) => onChangeLayerOpacity(lyr.id, Number(e.target.value))}
                        className="w-28 h-1.5 accent-primary cursor-pointer"
                      />
                      <span className="font-mono text-[10.5px] w-8 text-right">{lyr.opacity}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="gis-map-host h-80 rounded border border-outline-variant/40">
          <ApLeafletMap
            basemap="vector"
            showStateBorder={catalogFlags.showStateBorder}
            showDistricts={catalogFlags.showDistricts}
            districtOpacity={catalogFlags.districtOpacity}
            stateOpacity={catalogFlags.stateOpacity}
            showHighways={catalogFlags.showHighways}
            showAgencyRoutes={catalogFlags.showAgencyRoutes}
            showRivers={catalogFlags.showRivers}
            showWaterbodies={catalogFlags.showWaterbodies}
            showHillshade={catalogFlags.showHillshade}
            showRailways={catalogFlags.showRailways}
            showTrails={catalogFlags.showTrails}
            showPlaces={catalogFlags.showPlaces}
            showMandals={catalogFlags.showMandals}
            showVillages={catalogFlags.showVillages}
            mandalOpacity={catalogFlags.mandalOpacity}
            villageOpacity={catalogFlags.villageOpacity}
            showPoliceStations={catalogFlags.showPoliceStations}
            policeStationOpacity={catalogFlags.policeStationOpacity}
            highlightAgency={catalogFlags.highlightAgency}
            showGraticule={catalogFlags.showGraticule}
            showImageryOverlay={catalogFlags.showImageryOverlay}
          />
        </div>
      </div>
    );
  }

  if (workspace === 'vector-and-raster-data-import') {
    return (
      <div className="p-4 lg:p-6 space-y-5 max-w-5xl mx-auto">
        <div className="border-b border-outline-variant/35 pb-3">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
            QGIS OGR / GDAL / WMS / WFS providers in the browser
          </span>
          <h1 className="text-xl font-bold text-primary tracking-tight">
            Vector &amp; Raster Data Import
          </h1>
          <p className="text-[11px] text-on-surface-variant mt-1">
            Ingested layers overlay the map. Existing AP districts, mandals, villages, KMZ stations, and OSM
            networks are not replaced. PostGIS and FileGDB stay unavailable without a GIS server.
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

  if (workspace === 'feature-editor-and-digitizer') {
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
      <div className="p-4 lg:p-6 space-y-4 max-w-[1440px] mx-auto">
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
            onClick={() => onSwitchWorkspace('interactive-map-viewer')}
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
    { sheet: '65J/16', sector: 'Araku Valley & Sunkarimetta Ghat', scale: '1:50,000', rmse: '0.42m', cloud: '0%', layerId: 'lyr-soi-grid', lat: 18.3273, lon: 82.8775 },
    { sheet: '65J/12', sector: 'Paderu & G.Madugula Ridge', scale: '1:50,000', rmse: '0.38m', cloud: '2%', layerId: 'lyr-cartosat', lat: 18.0833, lon: 82.6667 },
    { sheet: '65K/05', sector: 'Chintapalle & Darakonda Forest', scale: '1:50,000', rmse: '0.51m', cloud: '4%', layerId: 'lyr-cartosat', lat: 17.8745, lon: 82.3512 },
    { sheet: '65O/01', sector: 'Anakapalli & NH-16 Corridor', scale: '1:50,000', rmse: '0.29m', cloud: '0%', layerId: 'lyr-soi-grid', lat: 17.6896, lon: 83.0024 },
    { sheet: '65D/11', sector: 'Amaravati Capital & Mangalagiri', scale: '1:50,000', rmse: '0.21m', cloud: '0%', layerId: 'lyr-soi-grid', lat: 16.513, lon: 80.518 },
    { sheet: '57O/06', sector: 'Tirupati & Seshachalam Biosphere', scale: '1:50,000', rmse: '0.44m', cloud: '1%', layerId: 'lyr-soi-grid', lat: 13.6288, lon: 79.4192 },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1440px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/35 pb-3">
        <div>
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
            OpenStreetMap, OpenTopoMap, and Esri World Imagery
          </span>
          <h1 className="text-xl font-bold text-primary tracking-tight">
            Raster Imagery &amp; 1:50K Toposheet Index
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            onToggleLayer('lyr-cartosat');
            onSwitchWorkspace('interactive-map-viewer');
            onTriggerToast('Esri World Imagery overlay (Maxar/Earthstar). No Cartosat-3 file is in this project.');
          }}
          className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Toggle Esri World Imagery on Map</span>
        </button>
      </div>

      <div className="gis-map-host h-72 rounded border border-outline-variant/40">
        <ApLeafletMap
          basemap="topo"
          showStateBorder
          showDistricts
          showPoliceStations
          showImageryOverlay={layers.find((l) => l.id === 'lyr-cartosat')?.enabled ?? false}
          initialCenter={[18.1, 82.7]}
          initialZoom={8}
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
                onSwitchWorkspace('interactive-map-viewer');
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
