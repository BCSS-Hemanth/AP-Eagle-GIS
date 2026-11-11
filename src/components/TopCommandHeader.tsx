import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  Menu,
  Search,
  UserCheck,
  AlertTriangle,
  MapPin,
} from 'lucide-react';
import { InspectableFeature, TacticalAlert, WorkspaceId } from '../types/gis';
import { EagleCrest } from './EagleCrest';

interface TopCommandHeaderProps {
  alerts: TacticalAlert[];
  onAcknowledgeAlert: (id: string) => void;
  onSelectFeatureAndFly: (featureId: string) => void;
  allFeatures: InspectableFeature[];
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onSwitchWorkspace: (ws: WorkspaceId) => void;
  userName?: string;
  userRole?: string;
  userUnit?: string;
  onLogout?: () => void;
}

export const TopCommandHeader: React.FC<TopCommandHeaderProps> = ({
  alerts,
  onAcknowledgeAlert,
  onSelectFeatureAndFly,
  allFeatures,
  sidebarCollapsed,
  onToggleSidebar,
  onSwitchWorkspace,
  userName = 'GIS Lead Analyst',
  userRole,
  userUnit = 'Amaravati HQ (Full Jurisdiction)',
  onLogout,
}) => {
  const [globalQuery, setGlobalQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [alertsMenuOpen, setAlertsMenuOpen] = useState(false);

  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setAlertsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const filteredTargets = globalQuery.trim()
    ? allFeatures.filter((f) => {
        const q = globalQuery.toLowerCase();
        return (
          f.name.toLowerCase().includes(q) ||
          f.code.toLowerCase().includes(q) ||
          f.district.toLowerCase().includes(q) ||
          f.roadClassification.toLowerCase().includes(q)
        );
      })
    : allFeatures.slice(0, 5);

  const unreadAlertsCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 right-0 h-14 bg-surface-container-lowest border-b border-outline-variant/40 z-50 flex items-center justify-between px-3 gap-3 select-none"
    >
      {/* Zone 1: Brand Lockup & Sidebar Toggle */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Expand Workspace Navigation' : 'Collapse Workspace Navigation'}
          className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-colors cursor-pointer"
        >
          <Menu className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onSwitchWorkspace('ndps-spatial-dashboard')}
          className="flex items-center gap-2.5 text-left cursor-pointer group"
        >
          <EagleCrest className="w-9 h-9 shrink-0" />
          <div className="flex flex-col justify-center leading-tight">
            <span className="text-[12.5px] font-bold text-primary uppercase tracking-tight whitespace-nowrap">
              EAGLE Force AP | GIS Monitoring &amp; Spatial Intelligence
            </span>
            <span className="text-[10px] font-medium text-on-surface-variant whitespace-nowrap hidden sm:block">
              Government of Andhra Pradesh • Law Enforcement &amp; Spatial Operations
            </span>
          </div>
        </button>
      </div>

      {/* Zone 2: Global Search */}
      <div className="hidden lg:flex items-center gap-2 flex-1 max-w-2xl mx-2">
        {/* Global Spatial Quick-Jump Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            type="text"
            value={globalQuery}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              setGlobalQuery(e.target.value);
              setSearchOpen(true);
            }}
            data-testid="header-search"
            placeholder="Search district, mandal, PS, route, coordinate..."
            className="w-full h-8 pl-8 pr-3 bg-surface-container-low border border-outline-variant/45 rounded text-[12px] text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:bg-surface-container-lowest transition-colors"
          />
          {searchOpen && (filteredTargets.length > 0 || globalQuery.trim()) && (
            <div className="absolute left-0 right-0 mt-1 bg-surface-container-lowest rounded-md shadow-xl border border-outline-variant/50 overflow-hidden z-50">
              <div className="max-h-60 overflow-y-auto divide-y divide-outline-variant/20">
                {filteredTargets.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-on-surface-variant">
                    No matching vector target for &ldquo;{globalQuery}&rdquo;
                  </div>
                ) : (
                  filteredTargets.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectFeatureAndFly(item.id);
                        setGlobalQuery('');
                        setSearchOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 text-left hover:bg-surface-container-low flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-primary truncate flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-secondary shrink-0" />
                          <span>{item.name}</span>
                        </div>
                        <div className="text-[10px] text-on-surface-variant truncate">
                          {item.code} • {item.district} • {item.roadClassification}
                        </div>
                      </div>
                      <span className="font-mono text-[10px] text-secondary shrink-0 tabular-coord">
                        {item.lat.toFixed(2)}°N
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Zone 3: Notifications & Analyst Badge */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Tactical Alerts Bell */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setAlertsMenuOpen((v) => !v);
            }}
            title="Tactical Interception Alerts"
            className="relative w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {unreadAlertsCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error ring-2 ring-surface-container-lowest" />
            )}
          </button>

          {alertsMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-88 bg-surface-container-lowest rounded-md shadow-xl border border-outline-variant/50 overflow-hidden z-50">
              <div className="px-3 py-2 bg-surface-container-low border-b border-outline-variant/30 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  Tactical Spatial Alerts ({unreadAlertsCount} Unread)
                </span>
                <span className="text-[10px] font-mono text-error font-bold">LIVE FEED</span>
              </div>
              <div className="divide-y divide-outline-variant/20 max-h-72 overflow-y-auto">
                {alerts.map((alt) => (
                  <div
                    key={alt.id}
                    className={`p-2.5 text-xs space-y-1.5 ${
                      alt.acknowledged ? 'opacity-65 bg-surface-container-lowest' : 'bg-error-container/15'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-error">
                        <AlertTriangle className="w-3 h-3" />
                        {alt.severity}
                      </span>
                      <span className="font-mono text-[10px] text-on-surface-variant tabular-coord">
                        {alt.timestamp}
                      </span>
                    </div>
                    <p className="text-[11.5px] font-semibold text-primary leading-snug">{alt.title}</p>
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-[10px] text-on-surface-variant truncate">{alt.location}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectFeatureAndFly(alt.featureId);
                            setAlertsMenuOpen(false);
                          }}
                          className="px-1.5 py-0.5 rounded bg-primary text-on-primary text-[10px] font-semibold hover:bg-primary-container cursor-pointer"
                        >
                          Locate
                        </button>
                        {!alt.acknowledged && (
                          <button
                            type="button"
                            onClick={() => onAcknowledgeAlert(alt.id)}
                            className="px-1.5 py-0.5 rounded bg-surface-container hover:bg-surface-container-high text-[10px] font-medium cursor-pointer"
                          >
                            Ack
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Analyst Identity */}
        <div className="hidden sm:flex items-center gap-2 pl-2.5 border-l border-outline-variant/40">
          <div className="flex flex-col text-right leading-tight">
            <span className="text-[11px] font-bold text-primary whitespace-nowrap" data-testid="session-user">
              {userName}
            </span>
            <span className="text-[9.5px] font-medium text-on-surface-variant whitespace-nowrap">
              {userRole ?? userUnit}
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4" />
          </div>
          {onLogout && (
            <button
              type="button"
              data-testid="logout"
              onClick={onLogout}
              className="text-[10px] font-bold uppercase text-on-surface-variant hover:text-error cursor-pointer"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
