import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  AP_STATE_FOCUS_DRILL,
  STATE_ADMIN_DRILL,
  type AdminDrill,
  type AdminDrillLevel,
  adminDrillTo,
  adminDrillUp,
  isApStateFocus,
  isIndiaOverview,
} from '../../gis/adminHierarchy';

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
  if (isApStateFocus(drill)) return 'Back to India';
  return 'Back';
}

export const AdminDrillBar: React.FC<AdminDrillBarProps> = ({ drill, onChange }) => {
  const parent = adminDrillUp(drill);
  const onIndia = isIndiaOverview(drill);
  const onAp = isApStateFocus(drill);

  type Crumb =
    | { kind: 'india'; label: string }
    | { kind: 'ap'; label: string }
    | { kind: 'level'; level: AdminDrillLevel; label: string };

  const crumbs: Crumb[] = [{ kind: 'india', label: 'India' }];
  if (!onIndia) {
    crumbs.push({ kind: 'ap', label: 'Andhra Pradesh' });
  }
  if (drill.districtName && (drill.level === 'district' || drill.level === 'mandal' || drill.level === 'village')) {
    crumbs.push({ kind: 'level', level: 'district', label: drill.districtName });
  }
  if (drill.mandalName && (drill.level === 'mandal' || drill.level === 'village')) {
    crumbs.push({ kind: 'level', level: 'mandal', label: drill.mandalName });
  }
  if (drill.villageName && drill.level === 'village') {
    crumbs.push({ kind: 'level', level: 'village', label: drill.villageName });
  }

  const goCrumb = (crumb: Crumb) => {
    if (crumb.kind === 'india') onChange(STATE_ADMIN_DRILL);
    else if (crumb.kind === 'ap') onChange(AP_STATE_FOCUS_DRILL);
    else onChange(adminDrillTo(drill, crumb.level));
  };

  const isCurrent = (crumb: Crumb) => {
    if (crumb.kind === 'india') return onIndia;
    if (crumb.kind === 'ap') return onAp;
    return crumb.level === drill.level;
  };

  return (
    <div
      data-testid="admin-drill-bar"
      className="pointer-events-auto inline-flex items-center gap-1 min-w-0 max-w-full bg-white/95 rounded-md px-1.5 py-1 shadow-[0_4px_14px_rgba(11,28,48,0.12)] border border-outline-variant/45 backdrop-blur-sm"
      title={ADMIN_DRILL_SOURCE_NOTE}
    >
      {!onIndia && (
        <button
          type="button"
          data-testid="admin-drill-back"
          onClick={() => onChange(parent)}
          className="shrink-0 h-7 px-1.5 flex items-center gap-0.5 text-on-surface hover:bg-surface-container-low cursor-pointer text-[11px] font-bold rounded-md"
          title={backLabel(drill)}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          {backLabel(drill)}
        </button>
      )}
      <nav className="flex items-center gap-0.5 min-w-0 overflow-x-auto text-[11px] font-semibold">
        {crumbs.map((crumb, index) => {
          const current = isCurrent(crumb);
          const key =
            crumb.kind === 'level' ? crumb.level : crumb.kind === 'ap' ? 'ap' : 'india';
          return (
            <React.Fragment key={key}>
              {index > 0 && <ChevronRight className="w-3 h-3 text-outline shrink-0" />}
              <button
                type="button"
                data-testid={`admin-drill-${key}`}
                disabled={current}
                onClick={() => goCrumb(crumb)}
                className={`shrink-0 px-1.5 py-0.5 rounded-md cursor-pointer ${
                  current
                    ? 'bg-secondary-container/70 text-secondary'
                    : 'text-on-surface hover:bg-surface-container-low'
                }`}
              >
                {crumb.label}
              </button>
            </React.Fragment>
          );
        })}
      </nav>
    </div>
  );
};
