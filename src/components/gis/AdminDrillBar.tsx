import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type AdminDrill, type AdminDrillLevel, adminDrillTo, adminDrillUp } from '../../gis/adminHierarchy';

export const ADMIN_DRILL_SOURCE_NOTE =
  'Districts: 26 polygons (2022). Mandals: 654 dissolved from NWIC/SOI revenue villages (not official 679 cadastral; pre-2022 13-district names). Villages: 18,100 NWIC revenue polygons. Children are parented by centroid-in-polygon, not by the vintage district_name field.';

interface AdminDrillBarProps {
  drill: AdminDrill;
  onChange: (next: AdminDrill) => void;
}

function backLabel(drill: AdminDrill): string {
  if (drill.level === 'village') return `Back to ${drill.mandalName ?? 'mandal'}`;
  if (drill.level === 'mandal') return `Back to ${drill.districtName ?? 'district'}`;
  if (drill.level === 'district') return 'Back to Andhra Pradesh';
  return 'Back';
}

export const AdminDrillBar: React.FC<AdminDrillBarProps> = ({ drill, onChange }) => {
  const go = (level: AdminDrillLevel) => onChange(adminDrillTo(drill, level));
  const crumbs: Array<{ level: AdminDrillLevel; label: string }> = [
    { level: 'state', label: 'Andhra Pradesh' },
  ];
  if (drill.districtName) crumbs.push({ level: 'district', label: drill.districtName });
  if (drill.mandalName) crumbs.push({ level: 'mandal', label: drill.mandalName });
  if (drill.villageName) crumbs.push({ level: 'village', label: drill.villageName });
  const parent = adminDrillUp(drill);

  return (
    <div
      data-testid="admin-drill-bar"
      className="pointer-events-auto max-w-[min(760px,calc(100%-6.5rem))] rounded shadow-md border border-outline-variant/45 bg-surface-container-lowest/95 backdrop-blur-xs px-2 py-1.5"
      title={ADMIN_DRILL_SOURCE_NOTE}
    >
      <div className="flex items-center gap-1 min-w-0">
        {drill.level !== 'state' && (
          <button
            type="button"
            data-testid="admin-drill-back"
            onClick={() => onChange(parent)}
            className="shrink-0 h-7 px-2 rounded flex items-center gap-0.5 text-on-surface hover:bg-surface-container cursor-pointer text-[11px] font-bold"
            title={backLabel(drill)}
          >
            <ChevronLeft className="w-4 h-4" />
            {backLabel(drill)}
          </button>
        )}
        <nav className="flex items-center gap-0.5 min-w-0 overflow-x-auto text-[11px] font-semibold">
          {crumbs.map((crumb, index) => {
            const current = crumb.level === drill.level;
            return (
              <React.Fragment key={crumb.level}>
                {index > 0 && <ChevronRight className="w-3 h-3 text-outline shrink-0" />}
                <button
                  type="button"
                  data-testid={`admin-drill-${crumb.level}`}
                  disabled={current}
                  onClick={() => go(crumb.level)}
                  className={`shrink-0 px-1.5 py-0.5 rounded cursor-pointer ${
                    current
                      ? 'bg-secondary-container/50 text-secondary'
                      : 'text-on-surface hover:bg-surface-container'
                  }`}
                >
                  {crumb.label}
                </button>
              </React.Fragment>
            );
          })}
        </nav>
      </div>
      <p className="px-1 pt-0.5 text-[9px] leading-snug text-on-surface-variant">
        {drill.level === 'state'
          ? 'Click a district to isolate it. Surrounding areas are hidden.'
          : drill.level === 'district'
            ? 'Only this district is on the map. Click a mandal, or go back to all districts.'
            : drill.level === 'mandal'
              ? 'Only this mandal is on the map. Click a village, or go back to the district.'
              : 'Only this village boundary is on the map. Go back to the mandal when needed.'}
      </p>
    </div>
  );
};
