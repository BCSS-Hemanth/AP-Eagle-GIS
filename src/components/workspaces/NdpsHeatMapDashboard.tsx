import React, { useRef, useState } from 'react';
import { WorkspaceId } from '../../types/gis';
import { ApLeafletMap, ApLeafletMapHandle } from '../gis/ApLeafletMap';
import { AdminDrillBar } from '../gis/AdminDrillBar';
import { type AdminDrill, STATE_ADMIN_DRILL } from '../../gis/adminHierarchy';

interface NdpsHeatMapDashboardProps {
  onSelectFeatureAndFly: (featureId: string) => void;
  onFlyToLocation?: (lat: number, lon: number, label: string) => void;
  onSwitchWorkspace: (ws: WorkspaceId) => void;
  onTriggerToast: (msg: string) => void;
}

const EmptyPanel: React.FC<{ title: string; children: string }> = ({ title, children }) => (
  <section className="bg-white rounded-sm overflow-hidden border border-[#9eb4c9]">
    <header className="bg-[#0b3d7a] text-white px-3 py-1.5 text-[11px] font-extrabold tracking-[0.14em] uppercase">
      {title}
    </header>
    <p className="px-3 py-4 text-[12px] text-slate-600 leading-relaxed">{children}</p>
  </section>
);

export const NdpsHeatMapDashboard: React.FC<NdpsHeatMapDashboardProps> = ({
  onFlyToLocation,
  onTriggerToast,
}) => {
  const mapRef = useRef<ApLeafletMapHandle>(null);
  const [adminDrill, setAdminDrill] = useState<AdminDrill>(STATE_ADMIN_DRILL);

  return (
    <div className="h-full min-h-0 bg-[#c5d4e2] flex flex-col overflow-hidden">
      <header className="h-[52px] bg-[#0b3d7a] text-white flex items-center justify-center px-3 shrink-0 border-b-[3px] border-[#f5c518]">
        <h1
          className="text-[16px] xl:text-[20px] font-bold tracking-[0.03em] uppercase text-center"
          style={{ fontFamily: 'Oswald, Inter, sans-serif' }}
        >
          GIS Dashboard — Andhra Pradesh
        </h1>
      </header>

      <div className="flex-1 min-h-0 min-w-[1080px] grid grid-cols-[280px_minmax(0,1fr)_280px] gap-2 p-2 overflow-auto">
        <div className="flex flex-col gap-2 min-h-0">
          <EmptyPanel title="NDPS Offender Summary">
            No offender counts, risk totals, or case statistics were provided. This panel stays empty until a verified dataset is loaded.
          </EmptyPanel>
          <EmptyPanel title="Top Districts — NDPS Cases">
            No district case ledger was provided. District polygons on the map are administrative boundaries only.
          </EmptyPanel>
        </div>

        <div className="flex flex-col gap-2 min-h-0 min-w-0 h-full">
          <section className="gis-map-host relative flex-1 min-h-[480px] bg-[#8eb9d6] rounded-sm border border-[#6f97b3]">
            <div className="absolute top-1.5 left-0 right-0 z-10 text-center pointer-events-none">
              <h2
                className="text-[#0b3d7a] text-[14px] xl:text-[16px] font-extrabold tracking-[0.08em] uppercase"
                style={{ fontFamily: 'Oswald, Inter, sans-serif' }}
              >
                Administrative map — no NDPS case layer
              </h2>
            </div>
            <div className="absolute top-10 left-3 right-3 z-20 flex justify-center pointer-events-none">
              <AdminDrillBar
                drill={adminDrill}
                onChange={(next) => {
                  setAdminDrill(next);
                  if (next.level === 'state') onTriggerToast('Returned to Andhra Pradesh district view');
                }}
              />
            </div>
            <ApLeafletMap
              ref={mapRef}
              basemap="vector"
              fitToState
              showStateBorder
              showDistricts
              showHighways={false}
              showRivers={false}
              showPlaces
              adminDrill={adminDrill}
              onDistrictClick={(name, lat, lon, feature) => {
                setAdminDrill({
                  level: 'district',
                  districtName: name,
                  districtFeature: feature,
                });
                onFlyToLocation?.(lat, lon, name);
                onTriggerToast(`District: ${name}. Mandals are NWIC vintage, parented spatially.`);
              }}
              onMandalClick={(name, lat, lon, district, feature) => {
                setAdminDrill((prev) => ({
                  level: 'mandal',
                  districtName: prev.districtName ?? district,
                  districtFeature: prev.districtFeature,
                  mandalName: name,
                  mandalFeature: feature,
                }));
                onTriggerToast(`Mandal: ${name}`);
              }}
              onVillageClick={(name, lat, lon, mandal, district, feature) => {
                setAdminDrill((prev) => ({
                  level: 'village',
                  districtName: prev.districtName ?? district,
                  districtFeature: prev.districtFeature,
                  mandalName: prev.mandalName ?? mandal,
                  mandalFeature: prev.mandalFeature,
                  villageName: name,
                  villageFeature: feature,
                }));
                onTriggerToast(`Village: ${name}`);
              }}
            />
          </section>
          <EmptyPanel title="Hotspot Districts — Key Statistics">
            No hotspot, seizure, or arrest figures were supplied. Nothing is plotted as NDPS activity.
          </EmptyPanel>
        </div>

        <div className="flex flex-col gap-2 min-h-0">
          <EmptyPanel title="Spatial Analytics Insights">
            No operational insights were supplied. Previous corridor text was placeholder and has been removed.
          </EmptyPanel>
          <EmptyPanel title="Offender Movement Pattern">
            No movement tracks were supplied. The inset map is omitted until a verified route file exists.
          </EmptyPanel>
        </div>
      </div>
    </div>
  );
};
