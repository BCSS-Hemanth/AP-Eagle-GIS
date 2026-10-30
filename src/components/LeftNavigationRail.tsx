import React from 'react';
import {
  BookOpen,
  Compass,
  Edit3,
  FileBarChart2,
  Grid,
  Layers,
  LayoutDashboard,
  Map as MapIcon,
  Network,
  Radar,
  Share2,
  ShieldCheck,
  Sliders,
  Upload,
} from 'lucide-react';
import { WorkspaceId } from '../types/gis';

interface NavItem {
  id: WorkspaceId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeTone?: 'live' | 'neutral';
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Core Workspaces',
    items: [
      { id: 'gis-dashboard', label: 'GIS Dashboard', icon: LayoutDashboard, badge: 'LIVE', badgeTone: 'live' },
      { id: 'interactive-map-viewer', label: 'Interactive Map Viewer', icon: MapIcon },
      { id: 'spatial-analysis-and-geoprocessing', label: 'Spatial Analysis & Geoprocessing', icon: Radar },
      { id: 'map-designer-and-layout-composer', label: 'Map Designer & Layout Composer', icon: Compass },
    ],
  },
  {
    title: 'Data & Layer Management',
    items: [
      { id: 'administrative-and-operational-layers', label: 'Administrative & Operational', icon: Layers },
      { id: 'vector-and-raster-data-import', label: 'Vector & Raster Import', icon: Upload, badge: 'Wizard' },
      { id: 'feature-editor-and-digitizer', label: 'Feature Editor & Digitizer', icon: Edit3 },
      { id: 'raster-management-and-toposheets', label: 'Raster & Toposheets', icon: Grid },
    ],
  },
  {
    title: 'Outputs & Field Deployment',
    items: [
      { id: 'mobile-gis-export', label: 'Mobile GIS Export', icon: Share2, badge: 'GPKG' },
      { id: 'atlas-map-book-generator', label: 'Atlas Map Book Generator', icon: BookOpen, badge: 'Conditional' },
      { id: 'reports-and-seizure-analytics', label: 'Reports & Seizure Analytics', icon: FileBarChart2 },
    ],
  },
  {
    title: 'Governance & System',
    items: [
      { id: 'data-quality-and-topology-audits', label: 'Data Quality & Topology', icon: Sliders },
      {
        id: 'conditional-capabilities-and-dependency-register',
        label: 'Capabilities & Dependencies',
        icon: Network,
      },
      { id: 'user-roles-and-audit-trail', label: 'User Roles & Audit Trail', icon: ShieldCheck },
    ],
  },
];

interface LeftNavigationRailProps {
  activeWorkspace: WorkspaceId;
  onSelectWorkspace: (ws: WorkspaceId) => void;
  collapsed: boolean;
  allowedWorkspaces?: WorkspaceId[];
}

export const LeftNavigationRail: React.FC<LeftNavigationRailProps> = ({
  activeWorkspace,
  onSelectWorkspace,
  collapsed,
  allowedWorkspaces,
}) => {
  return (
    <aside
      className={`fixed left-0 top-14 bottom-0 bg-surface-container-lowest border-r border-outline-variant/35 z-40 flex flex-col justify-between transition-all duration-200 select-none ${
        collapsed ? 'w-14' : 'w-64'
      }`}
    >
      <div className="flex-1 overflow-y-auto gis-scroll py-3 space-y-3.5">
        {NAV_SECTIONS.map((section) => {
          const items = allowedWorkspaces
            ? section.items.filter((item) => allowedWorkspaces.includes(item.id))
            : section.items;
          if (items.length === 0) return null;
          return (
          <div key={section.title}>
            {!collapsed && (
              <div className="px-3 mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
                  {section.title}
                </span>
              </div>
            )}
            <nav className="px-2 flex flex-col gap-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = activeWorkspace === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`nav-${item.id}`}
                    title={collapsed ? item.label : undefined}
                    onClick={() => onSelectWorkspace(item.id)}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-primary-container text-on-primary font-semibold'
                        : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface font-normal'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-secondary-fixed' : 'text-on-surface-variant'
                        }`}
                      />
                      {!collapsed && (
                        <span className="text-[12.5px] leading-snug truncate">{item.label}</span>
                      )}
                    </div>
                    {!collapsed && item.badge && (
                      <span
                        className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded shrink-0 ml-1 ${
                          item.badgeTone === 'live'
                            ? isActive
                              ? 'bg-secondary text-white'
                              : 'bg-secondary-container/50 text-on-secondary-container'
                            : isActive
                              ? 'bg-white/15 text-white'
                              : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        );
        })}
      </div>

      {/* Node Telemetry Footer */}
      <div className="p-2.5 border-t border-outline-variant/35 bg-surface-container-low/60">
        {collapsed ? (
          <div className="flex justify-center" title="NODE: AP-POL-GIS-01 • ONLINE">
            <span className="w-2 h-2 rounded-full bg-secondary" />
          </div>
        ) : (
          <div className="flex items-center justify-between text-[10px] font-bold tracking-wide text-on-surface-variant tabular-coord">
            <span>NODE: AP-POL-GIS-01</span>
            <span className="flex items-center gap-1 text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              ONLINE
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};
