import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  Menu,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import { TacticalAlert, WorkspaceId } from '../types/gis';
import { EagleCrest } from './EagleCrest';

interface TopCommandHeaderProps {
  alerts: TacticalAlert[];
  onAcknowledgeAlert: (id: string) => void;
  onSelectFeatureAndFly: (featureId: string) => void;
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
  sidebarCollapsed,
  onToggleSidebar,
  onSwitchWorkspace,
  userName = 'GIS Lead Analyst',
  userRole,
  userUnit = 'Amaravati HQ (Full Jurisdiction)',
  onLogout,
}) => {
  const [alertsMenuOpen, setAlertsMenuOpen] = useState(false);

  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setAlertsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const unreadAlertsCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 right-0 h-14 app-shell-chrome border-b border-outline-variant/35 z-50 flex items-center justify-between px-3 gap-3 select-none"
    >
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-secondary via-secondary/40 to-transparent pointer-events-none" />

      {/* Zone 1: Brand Lockup & Sidebar Toggle */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Expand Workspace Navigation' : 'Collapse Workspace Navigation'}
          className="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-colors cursor-pointer"
        >
          <Menu className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onSwitchWorkspace('ndps-spatial-dashboard')}
          className="flex items-center gap-2.5 text-left cursor-pointer group"
        >
          <EagleCrest className="w-9 h-9 shrink-0 drop-shadow-sm" />
          <div className="flex flex-col justify-center leading-tight">
            <span className="font-display text-[13px] font-semibold text-primary uppercase tracking-[0.04em] whitespace-nowrap group-hover:text-primary-container">
              EAGLE Force AP | GIS Monitoring &amp; Spatial Intelligence
            </span>
            <span className="text-[10px] font-medium text-on-surface-variant whitespace-nowrap hidden sm:block">
              Government of Andhra Pradesh • Law Enforcement &amp; Spatial Operations
            </span>
          </div>
        </button>
      </div>

      {/* Zone 2: Notifications & Analyst Badge */}
      <div className="flex items-center gap-2.5 shrink-0 ml-auto">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setAlertsMenuOpen((v) => !v);
            }}
            title="Tactical Interception Alerts"
            className="relative w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {unreadAlertsCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error ring-2 ring-surface-container-lowest" />
            )}
          </button>

          {alertsMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-88 rounded-lg shadow-xl border border-outline-variant/45 overflow-hidden z-50 bg-surface-container-lowest">
              <div className="px-3 py-2.5 bg-primary text-on-primary border-b border-white/10 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Tactical Spatial Alerts ({unreadAlertsCount} Unread)
                </span>
                <span className="text-[10px] font-mono text-secondary-fixed font-bold">LIVE FEED</span>
              </div>
              <div className="divide-y divide-outline-variant/20 max-h-72 overflow-y-auto gis-scroll">
                {alerts.map((alt) => (
                  <div
                    key={alt.id}
                    className={`p-2.5 text-xs space-y-1.5 ${
                      alt.acknowledged ? 'opacity-65 bg-surface-container-lowest' : 'bg-error-container/20'
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
                          className="px-1.5 py-0.5 rounded-md bg-primary text-on-primary text-[10px] font-semibold hover:bg-primary-container cursor-pointer"
                        >
                          Locate
                        </button>
                        {!alt.acknowledged && (
                          <button
                            type="button"
                            onClick={() => onAcknowledgeAlert(alt.id)}
                            className="px-1.5 py-0.5 rounded-md bg-surface-container hover:bg-surface-container-high text-[10px] font-medium cursor-pointer"
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

        <div className="hidden sm:flex items-center gap-2 pl-2.5 border-l border-outline-variant/40">
          <div className="flex flex-col text-right leading-tight">
            <span className="text-[11px] font-bold text-primary whitespace-nowrap" data-testid="session-user">
              {userName}
            </span>
            <span className="text-[9.5px] font-medium text-on-surface-variant whitespace-nowrap">
              {userRole ?? userUnit}
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm ring-2 ring-secondary/25">
            <UserCheck className="w-4 h-4" />
          </div>
          {onLogout && (
            <button
              type="button"
              data-testid="logout"
              onClick={onLogout}
              className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant hover:text-error cursor-pointer px-1.5 py-1 rounded-md hover:bg-error-container/40"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
