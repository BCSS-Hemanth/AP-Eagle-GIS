import React, { useState } from 'react';
import {
  Activity,
  Compass,
  Download,
  Layers,
  Play,
  Printer,
  Radar,
  Sliders,
} from 'lucide-react';
import { GisJob, WorkspaceId } from '../../types/gis';
import { downloadTextFile } from '../../utils/geoMath';
import { NdpsHeatMapDashboard } from './NdpsHeatMapDashboard';
import { ApLeafletMap } from '../gis/ApLeafletMap';
import { osrmDrivingRoute } from '../../gis/osmServices';
import { useAuth } from '../../auth/AuthContext';
import { policeStationsToRows, usePoliceStations } from '../../gis/usePoliceStations';

interface CoreOpsProps {
  workspace:
    | 'gis-dashboard'
    | 'spatial-analysis-and-geoprocessing'
    | 'map-designer-and-layout-composer';
  jobs: GisJob[];
  onAddJob: (job: GisJob) => void;
  onSelectFeatureAndFly: (featureId: string) => void;
  onFlyToLocation?: (lat: number, lon: number, label: string) => void;
  onSwitchWorkspace: (ws: WorkspaceId) => void;
  onTriggerToast: (msg: string) => void;
}

export const CoreOpsWorkspaces: React.FC<CoreOpsProps> = ({
  workspace,
  jobs,
  onAddJob,
  onSelectFeatureAndFly,
  onFlyToLocation,
  onSwitchWorkspace,
  onTriggerToast,
}) => {
  const { can } = useAuth();
  const kmzStations = usePoliceStations(workspace === 'spatial-analysis-and-geoprocessing');
  const kmzRows = kmzStations ? policeStationsToRows(kmzStations) : [];
  // Spatial Analysis state
  const [selectedAlgo, setSelectedAlgo] = useState<string>('buffer');
  const [targetLayer, setTargetLayer] = useState<string>('ops.interception_checkposts');
  const [distanceParam, setDistanceParam] = useState<number>(5.0);
  const [analysisAlgo, setAnalysisAlgo] = useState<string>('buffer');
  const [analysisRoute, setAnalysisRoute] = useState<Array<{ lat: number; lon: number }>>([]);

  // Map Designer state
  const [sheetTitle, setSheetTitle] = useState<string>(
    'Andhra Pradesh administrative map'
  );
  const [sheetScale, setSheetScale] = useState<string>('1 : 25,000');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [showGraticule, setShowGraticule] = useState<boolean>(true);
  const [showLegendBox, setShowLegendBox] = useState<boolean>(true);
  const [showNorthRose, setShowNorthRose] = useState<boolean>(true);

  if (workspace === 'gis-dashboard') {
    return (
      <NdpsHeatMapDashboard
        onSelectFeatureAndFly={onSelectFeatureAndFly}
        onFlyToLocation={onFlyToLocation}
        onSwitchWorkspace={onSwitchWorkspace}
        onTriggerToast={onTriggerToast}
      />
    );
  }

  if (workspace === 'spatial-analysis-and-geoprocessing') {
    const algorithms = [
      {
        id: 'buffer',
        name: 'Geodesic Multi-Ring Buffer (ST_Buffer)',
        desc: 'Generate 2.5km / 5km / 10km tactical containment rings around checkposts or hotspots.',
      },
      {
        id: 'kde',
        name: 'Contraband Hotspot Kernel Density (KDE)',
        desc: 'Compute continuous spatial risk surface weighted by NDPS seizure volume (kg).',
      },
      {
        id: 'isochrone',
        name: 'Highway Escape Isochrone (pgRouting)',
        desc: 'Model 15, 30, and 45-minute vehicle travel reach from any interception alert point.',
      },
      {
        id: 'ndvi',
        name: 'Eastern Ghats Canopy NDVI Anomaly Diff',
        desc: 'Compare multi-date Cartosat-3 & Sentinel-2 bands to flag forest clearings.',
      },
    ];

    const handleRunAlgorithm = (e: React.FormEvent) => {
      e.preventDefault();
      if (!can('geoprocess')) {
        onTriggerToast('Geoprocessing denied for your RBAC clearance');
        return;
      }
      const algoObj = algorithms.find((a) => a.id === selectedAlgo) || algorithms[0];
      const newJob: GisJob = {
        id: `JOB-${Math.floor(8850 + Math.random() * 140)}`,
        title: `${algoObj.name.split('(')[0].trim()} (${distanceParam} km)`,
        algorithm: algoObj.name,
        progress: 100,
        status: 'Completed',
        startedAt: 'Just now',
        targetLayer,
        outputFeatures: selectedAlgo === 'buffer' ? kmzRows.length : 0,
      };
      onAddJob(newJob);
      setAnalysisAlgo(selectedAlgo);
      if (selectedAlgo === 'isochrone' && kmzRows.length >= 2) {
        const origin = kmzRows[0];
        const dest = kmzRows[1];
        void osrmDrivingRoute(
          { lat: origin.lat, lon: origin.lon },
          { lat: dest.lat, lon: dest.lon }
        ).then((route) => {
          if (route) setAnalysisRoute(route.points);
        });
      }
      onTriggerToast(`Completed geoprocessing job ${newJob.id} on KMZ police stations`);
    };

    const analysisMarkers = kmzRows.map((f) => ({
      id: f.id,
      lat: f.lat,
      lon: f.lon,
      kind: 'station' as const,
      label: f.name,
    }));

    return (
      <div className="p-4 lg:p-6 space-y-5 max-w-[1440px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/35 pb-3">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
              PostGIS &amp; Raster Spatial Engine
            </span>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Spatial Analysis &amp; Geoprocessing Workbench
            </h1>
          </div>
          <button
            type="button"
            onClick={() => onSwitchWorkspace('interactive-map-viewer')}
            className="px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-primary text-xs font-semibold cursor-pointer"
          >
            Return to Map Canvas
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Algorithm Parameter Form */}
          <form
            onSubmit={handleRunAlgorithm}
            className="lg:col-span-5 bg-surface-container-lowest rounded border border-outline-variant/40 p-4 space-y-4"
          >
            <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider border-b border-outline-variant/25 pb-2">
              <Sliders className="w-4 h-4 text-secondary" />
              <span>Configure Geoprocessing Task</span>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-primary">Spatial Algorithm</label>
              <div className="space-y-1.5">
                {algorithms.map((alg) => (
                  <label
                    key={alg.id}
                    className={`block p-2.5 rounded border cursor-pointer transition-colors ${
                      selectedAlgo === alg.id
                        ? 'border-secondary bg-secondary-container/20'
                        : 'border-outline-variant/40 hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="algo"
                        checked={selectedAlgo === alg.id}
                        onChange={() => setSelectedAlgo(alg.id)}
                        className="accent-secondary"
                      />
                      <span className="text-xs font-bold text-primary">{alg.name}</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant mt-1 pl-5">{alg.desc}</p>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                  Input Vector / Raster Layer
                </label>
                <select
                  value={targetLayer}
                  onChange={(e) => setTargetLayer(e.target.value)}
                  className="w-full h-8 px-2 rounded border border-outline-variant/50 bg-surface-container-low text-xs font-mono"
                >
                  <option value="ops.interception_checkposts">ops.interception_checkposts</option>
                  <option value="intel.contraband_hotspots">intel.contraband_hotspots</option>
                  <option value="intel.transit_corridors">intel.transit_corridors</option>
                  <option value="ops.police_station_jurisdictions">ops.police_station_jurisdictions</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                  Search Radius / Bandwidth (km)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="50"
                  value={distanceParam}
                  onChange={(e) => setDistanceParam(Number(e.target.value))}
                  className="w-full h-8 px-2.5 rounded border border-outline-variant/50 bg-surface-container-low text-xs font-mono tabular-coord"
                />
              </div>
            </div>

            <button
              type="submit"
              data-testid="geoprocess-execute"
              disabled={!can('geoprocess')}
              className="w-full py-2 px-4 rounded bg-primary text-on-primary text-xs font-bold hover:bg-primary-container transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Execute Spatial Operation</span>
            </button>
          </form>

          {/* Job Execution Monitor */}
          <div className="lg:col-span-7 bg-surface-container-lowest rounded border border-outline-variant/40 overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-secondary" />
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Execution Queue &amp; Output Geometry Register
                </span>
              </div>
              <span className="text-[11px] font-mono text-secondary font-bold tabular-coord">
                {jobs.length} Total Tasks
              </span>
            </div>

            <div className="divide-y divide-outline-variant/25 flex-1 overflow-y-auto">
              {jobs.map((job) => (
                <div key={job.id} className="p-3.5 space-y-2 tabular-coord">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-[10.5px] font-bold text-secondary mr-2">
                        {job.id}
                      </span>
                      <span className="text-xs font-bold text-primary">{job.title}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        job.status === 'Completed'
                          ? 'bg-secondary-container/50 text-on-secondary-container'
                          : 'bg-surface-container-high text-primary'
                      }`}
                    >
                      {job.status} ({job.progress}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-on-surface-variant font-mono">
                    <span>Input: {job.targetLayer}</span>
                    <span>Started: {job.startedAt}</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                    <div
                      className="h-full bg-secondary transition-all duration-300"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  {job.status === 'Completed' && (
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          onSwitchWorkspace('interactive-map-viewer');
                          onTriggerToast(`Loaded output layer from ${job.id} onto map viewport`);
                        }}
                        className="px-2.5 py-1 rounded bg-surface-container hover:bg-primary hover:text-on-primary text-[10.5px] font-semibold transition-colors cursor-pointer"
                      >
                        Render Output on Map →
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded border border-outline-variant/40 overflow-hidden">
          <div className="px-4 py-2.5 bg-surface-container-low border-b border-outline-variant/30 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Output on authentic OSM / district geometry
            </span>
            <span className="text-[10.5px] font-mono text-on-surface-variant">
              {analysisAlgo.toUpperCase()} • WGS84 • SRTM/OSM
            </span>
          </div>
          <div className="gis-map-host h-80">
            <ApLeafletMap
              basemap={analysisAlgo === 'ndvi' ? 'satellite' : 'vector'}
              showStateBorder
              showDistricts
              showPoliceStations
              route={analysisAlgo === 'isochrone' ? analysisRoute : []}
              markers={analysisMarkers}
              onMarkerClick={(id) => onSelectFeatureAndFly(id)}
              onPoliceStationClick={(id) => onSelectFeatureAndFly(id)}
              initialCenter={[17.8, 82.4]}
              initialZoom={8}
            />
          </div>
        </div>
      </div>
    );
  }

  // MAP DESIGNER & LAYOUT COMPOSER
  const handleExportSvgBriefing = () => {
    const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="840" viewBox="0 0 1200 840">
      <rect width="1200" height="840" fill="#ffffff" stroke="#001428" stroke-width="6"/>
      <rect x="24" y="24" width="1152" height="72" fill="#001428"/>
      <text x="48" y="56" fill="#86f2e4" font-family="sans-serif" font-size="14" font-weight="bold">EAGLE FORCE ANDHRA PRADESH • OFFICIAL TACTICAL BRIEFING SHEET</text>
      <text x="48" y="80" fill="#ffffff" font-family="sans-serif" font-size="20" font-weight="bold">${sheetTitle}</text>
      <rect x="24" y="110" width="1152" height="680" fill="#eaf2fb" stroke="#0f2942" stroke-width="2"/>
      <text x="600" y="450" text-anchor="middle" fill="#001428" font-family="monospace" font-size="18">Scale ${sheetScale} • WGS84 EPSG:4326 • Generated by AP-POL-GIS-01</text>
    </svg>`;
    downloadTextFile('eagle_ap_tactical_map_sheet.svg', svgMarkup, 'image/svg+xml');
    onTriggerToast('Exported high-resolution SOI Briefing Map Sheet (.svg)');
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1440px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/35 pb-3">
        <div>
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
            Cartographic Publishing &amp; Operational Orders
          </span>
          <h1 className="text-xl font-bold text-primary tracking-tight">
            Map Designer &amp; Briefing Layout Composer
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-primary text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet</span>
          </button>
          <button
            type="button"
            onClick={handleExportSvgBriefing}
            className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Vector Sheet (.SVG)</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Controls */}
        <div className="lg:col-span-4 bg-surface-container-lowest rounded border border-outline-variant/40 p-4 space-y-3.5 text-xs">
          <div className="font-bold uppercase tracking-wider text-primary border-b border-outline-variant/25 pb-2">
            Sheet Marginalia &amp; Frame Settings
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
              Operational Map Sheet Title
            </label>
            <input
              type="text"
              value={sheetTitle}
              onChange={(e) => setSheetTitle(e.target.value)}
              className="w-full h-8 px-2.5 rounded border border-outline-variant/50 bg-surface-container-low text-xs font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                Target Scale
              </label>
              <select
                value={sheetScale}
                onChange={(e) => setSheetScale(e.target.value)}
                className="w-full h-8 px-2 rounded border border-outline-variant/50 bg-surface-container-low text-xs font-mono"
              >
                <option value="1 : 25,000">1 : 25,000 (Tactical)</option>
                <option value="1 : 50,000">1 : 50,000 (SOI Std)</option>
                <option value="1 : 250,000">1 : 250,000 (District)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                ISO A3 Orientation
              </label>
              <select
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
                className="w-full h-8 px-2 rounded border border-outline-variant/50 bg-surface-container-low text-xs"
              >
                <option value="landscape">A3 Landscape</option>
                <option value="portrait">A3 Portrait</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <span className="block text-[11px] font-semibold text-on-surface-variant">
              Cartographic Furniture Elements
            </span>
            {[
              { label: 'SOI 15-Minute Graticule Collar', checked: showGraticule, set: setShowGraticule },
              { label: 'Embedded Vector Symbology Legend', checked: showLegendBox, set: setShowLegendBox },
              { label: 'Tactical Compass Rose & Magnetic Declination', checked: showNorthRose, set: setShowNorthRose },
            ].map((item) => (
              <label key={item.label} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.set(e.target.checked)}
                  className="accent-primary"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Live Print Sheet Preview */}
        <div className="lg:col-span-8 bg-surface-container rounded border border-outline-variant/40 p-5 flex items-center justify-center">
          <div
            className={`bg-white shadow-xl border-2 border-primary p-4 flex flex-col justify-between transition-all ${
              orientation === 'landscape' ? 'w-full aspect-16/10' : 'w-2/3 aspect-3/4'
            }`}
          >
            {/* Top Classification & Title Collar */}
            <div className="border-b-2 border-primary pb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-secondary">
                  GOVERNMENT OF ANDHRA PRADESH • EAGLE FORCE SPATIAL CELL
                </div>
                <div className="text-sm font-bold text-primary uppercase">{sheetTitle}</div>
              </div>
              <div className="text-right font-mono text-[10px] tabular-coord">
                <div className="font-bold text-error">FOR OFFICIAL LAW ENFORCEMENT USE</div>
                <div>SCALE {sheetScale} • WGS84</div>
              </div>
            </div>

            {/* Map Frame Preview */}
            <div className="gis-map-host flex-1 my-2.5 bg-[#eaf2fb] border border-primary min-h-[280px]">
              <ApLeafletMap
                basemap="topo"
                showStateBorder
                showDistricts
                showPoliceStations
                showGraticule={showGraticule}
                initialZoom={8}
                initialCenter={[18.1, 82.7]}
              />
              {showNorthRose && (
                <div className="absolute top-2.5 right-2.5 bg-white/90 border border-primary/30 px-2 py-1 rounded text-center">
                  <div className="text-[10px] font-bold text-primary">▲ N</div>
                  <div className="text-[8px] font-mono text-outline">-0°42&apos; W</div>
                </div>
              )}

              {showLegendBox && (
                <div className="absolute bottom-2.5 left-2.5 bg-white/95 border border-primary p-2 text-[9px] space-y-1">
                  <div className="font-bold text-primary uppercase">Legend</div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary inline-block" />
                    <span>Police station (KMZ)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 border-t-2 border-dashed border-error inline-block" />
                    <span>District boundary</span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Title Block */}
            <div className="grid grid-cols-3 gap-2 text-[9.5px] font-mono text-on-surface-variant border-t border-outline-variant pt-1.5 tabular-coord">
              <div>PREPARED BY: EAGLE GIS NOC AMARAVATI</div>
              <div className="text-center">DATUM: WGS84 / SOI OSM 65J/16</div>
              <div className="text-right">DATE: 2026-10-28 IST</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
