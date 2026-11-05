import React, { useEffect, useRef, useState } from 'react';
import { WorkspaceId } from '../types/gis';
import { APP_NAV_SECTIONS } from '../nav/appModules';

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
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  // Hover expands the icon rail temporarily; header Menu still pins open/closed.
  const expanded = !collapsed || hovered;

  useEffect(() => {
    return () => {
      if (leaveTimer.current != null) window.clearTimeout(leaveTimer.current);
    };
  }, []);

  const onEnter = () => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    setHovered(true);
  };

  const onLeave = () => {
    if (leaveTimer.current != null) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      setHovered(false);
      leaveTimer.current = null;
    }, 160);
  };

  return (
    <aside
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={`fixed left-0 top-14 bottom-0 bg-surface-container-lowest border-r border-outline-variant/35 flex flex-col transition-all duration-200 select-none ${
        expanded ? 'w-64 shadow-lg' : 'w-14'
      } ${collapsed && hovered ? 'z-50' : 'z-40'}`}
    >
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden gis-scroll py-2 pb-3 space-y-3">
        {APP_NAV_SECTIONS.map((section) => {
          const items = allowedWorkspaces
            ? section.items.filter((item) => allowedWorkspaces.includes(item.id))
            : section.items;
          if (items.length === 0) return null;
          return (
            <div key={section.id}>
              {expanded && (
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
                      title={!expanded ? item.label : undefined}
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
                        {expanded && (
                          <span className="text-[12.5px] leading-snug truncate">{item.label}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
