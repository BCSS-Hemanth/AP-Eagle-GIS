import React, { useEffect, type ReactNode } from 'react';
import { Minimize2 } from 'lucide-react';

type MapFullscreenFrameProps = {
  testId: string;
  onExit: () => void;
  /** Optional floating content (e.g. AdminDrillBar) centered at the top. */
  topCenter?: ReactNode;
  /** Optional floating content under topCenter (e.g. close / clear). */
  topCenterBelow?: ReactNode;
  /** Optional floating strip along the top (view switcher, etc.). */
  topBar?: ReactNode;
  children: ReactNode;
  exitTestId?: string;
};

/**
 * True full-viewport map chrome: shell header/nav stay hidden by App;
 * Exit + optional drill controls float over the map (no solid header strip).
 */
export const MapFullscreenFrame: React.FC<MapFullscreenFrameProps> = ({
  testId,
  onExit,
  topCenter,
  topCenterBelow,
  topBar,
  children,
  exitTestId = 'map-exit-fullscreen',
}) => {
  useEffect(() => {
    const timers = [0, 100, 300].map((ms) =>
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), ms)
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  return (
    <div
      className="fixed inset-0 z-[900] bg-white flex flex-col"
      data-testid={testId}
    >
      {/* Absolute fill so Leaflet hosts with h-full / flex-1 get a real viewport size. */}
      <div className="absolute inset-0 flex flex-col min-h-0 min-w-0 h-full w-full">
        {children}
      </div>

      {topBar ? (
        <div className="absolute top-0 left-0 right-14 z-[910] pointer-events-none">
          <div className="pointer-events-auto">{topBar}</div>
        </div>
      ) : null}

      {(topCenter || topCenterBelow) && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[910] flex flex-col items-center gap-1.5 pointer-events-none">
          {topCenter ? <div className="pointer-events-auto">{topCenter}</div> : null}
          {topCenterBelow ? <div className="pointer-events-auto">{topCenterBelow}</div> : null}
        </div>
      )}

      <div className="absolute top-2 right-3 z-[910]">
        <button
          type="button"
          data-testid={exitTestId}
          onClick={onExit}
          title="Exit full screen (Esc)"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer bg-surface-container-lowest/95 text-primary border border-outline-variant/50 shadow-[0_6px_18px_rgba(11,28,48,0.14)] hover:bg-secondary-container/35 hover:border-secondary/40 backdrop-blur-sm"
        >
          <Minimize2 className="w-3.5 h-3.5" />
          <span>Exit full screen</span>
        </button>
      </div>
    </div>
  );
};
