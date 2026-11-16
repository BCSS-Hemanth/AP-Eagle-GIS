import { useEffect, useState } from 'react';

export type RoadsApiMode = {
  ready: boolean;
  ok: boolean;
  /** True when `/api/gis-roads/mvt/...` is available. */
  postgis: boolean;
};

/**
 * One-shot health probe so the map can prefer MVT for the full road network
 * when PostGIS is installed, and fall back to bbox GeoJSON otherwise.
 */
export function useRoadsApiMode(): RoadsApiMode {
  const [state, setState] = useState<RoadsApiMode>({
    ready: false,
    ok: false,
    postgis: false,
  });

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/health')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ ok?: boolean; postgis?: boolean }>;
      })
      .then((json) => {
        if (cancelled) return;
        setState({
          ready: true,
          ok: Boolean(json.ok),
          postgis: Boolean(json.postgis),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ ready: true, ok: false, postgis: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
