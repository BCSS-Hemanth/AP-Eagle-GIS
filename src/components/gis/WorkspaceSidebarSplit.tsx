import React, { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type WorkspaceSidebarSplitProps = {
  /** Left control panel contents (shown when expanded). */
  sidebar: ReactNode;
  /** Map / main pane. */
  children: ReactNode;
  /**
   * Classes applied to the open aside (width, borders, scroll).
   * Default matches Atlas / Locus / Raster / Roads Routing panels.
   */
  asideClassName?: string;
  testId?: string;
  /** Start with the sidebar visible (default true). */
  defaultOpen?: boolean;
  /**
   * When true (Full map), hide the aside + seam toggle so the map pane fills.
   * Map children stay mounted — avoids a blank Leaflet remount.
   */
  hideSidebar?: boolean;
};

const DEFAULT_ASIDE =
  'w-full lg:w-[340px] shrink-0 border-b lg:border-b-0 lg:border-r border-outline-variant/40 bg-surface-container-low overflow-y-auto max-h-[42vh] lg:max-h-none';

/**
 * Sidebar + map split with a Bhuvan-style seam toggle.
 * Collapsed: map fills the row; Expanded: sidebar restored. Dispatches resize so Leaflet refits.
 * Toggle z-index stays below LeftNavigationRail so hover-expand of the module nav covers it.
 */
export const WorkspaceSidebarSplit: React.FC<WorkspaceSidebarSplitProps> = ({
  sidebar,
  children,
  asideClassName = DEFAULT_ASIDE,
  testId = 'workspace-sidebar-split',
  defaultOpen = true,
  hideSidebar = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const showAside = open && !hideSidebar;

  useEffect(() => {
    const t = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 200);
    return () => window.clearTimeout(t);
  }, [open, hideSidebar]);

  return (
    <div
      className="flex-1 min-h-0 flex flex-col lg:flex-row relative"
      data-testid={testId}
      data-sidebar={showAside ? 'open' : 'closed'}
    >
      {showAside ? (
        <aside className={asideClassName} data-testid={`${testId}-aside`}>
          {sidebar}
        </aside>
      ) : null}

      <div className="relative flex-1 min-h-0 min-w-0 flex flex-col h-full">
        {!hideSidebar ? (
          <button
            type="button"
            data-testid={`${testId}-toggle`}
            aria-expanded={open}
            aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
            title={open ? 'Collapse sidebar' : 'Expand sidebar'}
            onClick={() => setOpen((v) => !v)}
            className="absolute z-30 top-1/2 -translate-y-1/2 left-0 h-12 w-5 rounded-r-md bg-white border border-l-0 border-outline-variant/50 shadow-md text-on-surface hover:bg-sky-50 cursor-pointer inline-flex items-center justify-center"
          >
            {open ? (
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
            )}
          </button>
        ) : null}
        {children}
      </div>
    </div>
  );
};
