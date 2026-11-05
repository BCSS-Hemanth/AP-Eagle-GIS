import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { GisLayer, WorkspaceId } from '../../types/gis';
import { ApLeafletMap, ApLeafletMapHandle } from '../gis/ApLeafletMap';
import { AdminDrillBar } from '../gis/AdminDrillBar';
import {
  type AdminDrill,
  AP_STATE_FOCUS_DRILL,
  STATE_ADMIN_DRILL,
  isolateChildFeature,
  isIndiaOverview,
} from '../../gis/adminHierarchy';
import { leafletFlagsFromLayers } from '../../gis/dashboardLayers';

interface NdpsHeatMapDashboardProps {
  layers: GisLayer[];
  onSelectFeatureAndFly: (featureId: string) => void;
  onFlyToLocation?: (lat: number, lon: number, label: string) => void;
  onSwitchWorkspace: (ws: WorkspaceId) => void;
  onTriggerToast: (msg: string) => void;
  /** When true, app chrome (header/nav) is hidden by the parent shell. */
  mapExpanded?: boolean;
  onMapExpandedChange?: (expanded: boolean) => void;
}

export const NdpsHeatMapDashboard: React.FC<NdpsHeatMapDashboardProps> = ({
  layers,
  onTriggerToast,
  mapExpanded = false,
  onMapExpandedChange,
}) => {
  const mapRef = useRef<ApLeafletMapHandle>(null);
  const [adminDrill, setAdminDrill] = useState<AdminDrill>(STATE_ADMIN_DRILL);
  const mapFlags = leafletFlagsFromLayers(layers);
  const indiaOverview = isIndiaOverview(adminDrill);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mapExpanded) onMapExpandedChange?.(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapExpanded, onMapExpandedChange]);

  const toggleExpanded = () => onMapExpandedChange?.(!mapExpanded);

  const mapBlock = (
    <section
      className={`gis-map-host relative ${
        indiaOverview ? 'bg-white' : 'bg-[#8eb9d6]'
      } ${
        mapExpanded || indiaOverview
          ? 'flex-1 min-h-0 h-full rounded-none border-0'
          : 'flex-1 min-h-0 rounded-sm border border-[#6f97b3]'
      }`}
      data-testid="dashboard-map"
      data-expanded={mapExpanded ? 'true' : 'false'}
      data-india-overview={indiaOverview ? 'clean' : 'off'}
      data-highways={mapFlags.showHighways ? 'on' : 'off'}
      data-ps={mapFlags.showPoliceStations ? 'on' : 'off'}
      data-mandals={mapFlags.showMandals ? 'on' : 'off'}
    >
      <ApLeafletMap
        ref={mapRef}
        basemap="vector"
        cleanIndiaOverview
        fitToState
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
        showHighways={mapFlags.showHighways}
        showApRoadsFull={mapFlags.showApRoadsFull}
        showOpsVspRoads={mapFlags.showOpsVspRoads}
        showApRoadsMajor={mapFlags.showApRoadsMajor}
        showAgencyRoutes={mapFlags.showAgencyRoutes}
        showRivers={mapFlags.showRivers}
        showWaterbodies={mapFlags.showWaterbodies}
        showHillshade={mapFlags.showHillshade}
        showRailways={mapFlags.showRailways}
        showTrails={mapFlags.showTrails}
        showPlaces={mapFlags.showPlaces}
        showAsrBoundary={mapFlags.showAsrBoundary}
        showHotspots={mapFlags.showHotspots}
        showCheckPosts={mapFlags.showCheckPosts}
        showTollPlazas={mapFlags.showTollPlazas}
        showGanjaSeized={mapFlags.showGanjaSeized}
        showPharmaHubs={mapFlags.showPharmaHubs}
        showDdacs={mapFlags.showDdacs}
        showEntryExit={mapFlags.showEntryExit}
        showStockPoints={mapFlags.showStockPoints}
        showOpsMainRoads={mapFlags.showOpsMainRoads}
        showOpsInternalRoads={mapFlags.showOpsInternalRoads}
        showGraticule={mapFlags.showGraticule}
        showBorderPs={mapFlags.showBorderPs}
        showTalukGis={mapFlags.showTalukGis}
        showVspVillagePts={mapFlags.showVspVillagePts}
        showImageryOverlay={mapFlags.showImageryOverlay}
        showGoogleRoadmap={mapFlags.showGoogleRoadmap}
        showSoiTopo={mapFlags.showSoiTopo}
        showDistrictsGisHist={mapFlags.showDistrictsGisHist}
        showStateGisHist={mapFlags.showStateGisHist}
        adminDrill={adminDrill}
        layoutRevision={mapExpanded ? 'dash-full' : 'dash-normal'}
        onApStateFocus={() => {
          setAdminDrill(AP_STATE_FOCUS_DRILL);
          onTriggerToast('Andhra Pradesh state view — surrounding states remain visible');
        }}
        onDistrictClick={(name, _lat, _lon, feature) => {
          setAdminDrill({
            level: 'district',
            apFocused: true,
            districtName: name,
            districtFeature: feature,
          });
          onTriggerToast(`Isolated ${name}. Click a mandal inside, or go back to Andhra Pradesh.`);
        }}
        onMandalClick={(name, lat, lon, district, feature) => {
          setAdminDrill((prev) => ({
            level: 'mandal',
            apFocused: true,
            districtName: prev.districtName ?? district,
            districtFeature: prev.districtFeature,
            mandalName: name,
            mandalFeature: isolateChildFeature(feature, [lon, lat], prev.districtFeature),
          }));
          onTriggerToast(`Mandal: ${name}`);
        }}
        onVillageClick={(name, lat, lon, mandal, district, feature) => {
          setAdminDrill((prev) => ({
            level: 'village',
            apFocused: true,
            districtName: prev.districtName ?? district,
            districtFeature: prev.districtFeature,
            mandalName: prev.mandalName ?? mandal,
            mandalFeature: prev.mandalFeature,
            villageName: name,
            villageFeature: isolateChildFeature(
              feature,
              [lon, lat],
              prev.mandalFeature ?? prev.districtFeature
            ),
          }));
          onTriggerToast(`Village: ${name}`);
        }}
      />
    </section>
  );

  const dashboardButton = (
    <button
      type="button"
      data-testid="dashboard-fullscreen-toggle"
      onClick={toggleExpanded}
      title={mapExpanded ? 'Exit full screen (Esc)' : 'Expand map to full screen'}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${
        mapExpanded
          ? 'bg-white text-[#0b3d7a] border border-[#0b3d7a]/30 shadow-md'
          : 'bg-[#0b3d7a] text-white hover:bg-[#0a3366]'
      }`}
    >
      {mapExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
      <span>{mapExpanded ? 'Exit full screen' : 'Full screen'}</span>
    </button>
  );

  const onDrillChange = (next: AdminDrill) => {
    setAdminDrill(next);
    if (next.level === 'state') {
      onTriggerToast(
        next.apFocused ? 'Andhra Pradesh state view' : 'Returned to India overview'
      );
    }
  };

  const drillBarRow = (
    <div className="shrink-0 flex justify-center items-center py-0.5 px-1">
      <AdminDrillBar drill={adminDrill} onChange={onDrillChange} />
    </div>
  );

  if (mapExpanded) {
    return (
      <div
        className="fixed inset-0 z-[90] bg-[#0b1c30] flex flex-col"
        data-testid="dashboard-map-fullscreen"
      >
        <div className="shrink-0 relative flex justify-center items-center py-0.5 px-2 bg-[#0b1c30]">
          <AdminDrillBar drill={adminDrill} onChange={onDrillChange} />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-[100]">
            {dashboardButton}
          </div>
        </div>
        <div className="flex-1 min-h-0">{mapBlock}</div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 max-h-full bg-white flex flex-col overflow-hidden">
      <header className="h-[52px] shrink-0 bg-[#0b3d7a] text-white flex items-center justify-between gap-3 px-3 border-b-[3px] border-[#f5c518]">
        <div className="w-[7.5rem]" />
        <h1
          className="text-[16px] xl:text-[20px] font-bold tracking-[0.03em] uppercase text-center flex-1"
          style={{ fontFamily: 'Oswald, Inter, sans-serif' }}
        >
          GIS Dashboard — Andhra Pradesh
        </h1>
        <div className="shrink-0">{dashboardButton}</div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col gap-0 p-0 overflow-hidden bg-white">
        {drillBarRow}
        {mapBlock}
      </div>
    </div>
  );
};
