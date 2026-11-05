import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  ChartLine,
  Link2,
  Target,
  UserRound,
} from 'lucide-react';
import { ApLeafletMap } from '../gis/ApLeafletMap';
import { AP_STATE_FOCUS_DRILL, type AdminDrill } from '../../gis/adminHierarchy';
import { useApBoundaries } from '../../gis/useApBoundaries';
import { AP_BOUNDS, AP_CENTER, AP_DEFAULT_ZOOM } from '../../data/apGeo';
import {
  NDPS_DISTRICT_STATS,
  NDPS_HEAT_POINTS,
  NDPS_OFFENDER_SUMMARY,
  NDPS_RECENT_HIGH_RISK,
  NDPS_RISK_DISTRIBUTION,
  NDPS_SPATIAL_INSIGHTS,
  NDPS_TOP_DISTRICTS,
  type NdpsRiskLevel,
} from '../../data/ndpsAnalyticsDummy';

const HEAT_MARKERS = NDPS_HEAT_POINTS.map((pt) => ({
  id: pt.id,
  lat: pt.lat,
  lon: pt.lon,
  kind: 'location' as const,
  label: pt.district,
  detail: `NDPS cases: ${pt.cases.toLocaleString()}`,
}));

const GUNTUR_DISTRICT = 'Guntur';
const GUNTUR_MARKER_ID = NDPS_HEAT_POINTS.find((pt) => pt.district === GUNTUR_DISTRICT)?.id ?? 'h2';
const GUNTUR_CASES = NDPS_HEAT_POINTS.find((pt) => pt.district === GUNTUR_DISTRICT)?.cases ?? 611;
/** Towns inside the 2022 Guntur polygon (Sattenapalle is Palnadu, so it is not used). */
const GUNTUR_PLACES = [
  { name: 'Mangalagiri', lat: 16.4308, lon: 80.5686 },
  { name: 'Tenali', lat: 16.2428, lon: 80.64 },
  { name: 'Ponnur', lat: 16.066, lon: 80.548 },
] as const;
/** Case split is stable for a page load and always sums to the district total. */
const GUNTUR_SEED = Math.floor(Math.random() * 1_000_000_000);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function splitCases(total: number, parts: number, rand: () => number): number[] {
  const weights = Array.from({ length: parts }, () => 0.4 + rand());
  const sumW = weights.reduce((sum, w) => sum + w, 0);
  const counts = weights.slice(0, parts - 1).map((w) => Math.max(1, Math.floor((w / sumW) * total)));
  const used = counts.reduce((sum, n) => sum + n, 0);
  counts.push(Math.max(1, total - used));
  const drift = total - counts.reduce((sum, n) => sum + n, 0);
  counts[counts.length - 1] += drift;
  return counts;
}

const TOP_DISTRICT_MAX = Math.max(...NDPS_TOP_DISTRICTS.map((d) => d.cases), 1);

const RANK_COLORS = ['#0f766e', '#0e7490', '#1d4ed8', '#7c3aed', '#b45309'] as const;

function insightIcon(kind: string) {
  switch (kind) {
    case 'target':
      return <Target className="w-3.5 h-3.5 text-teal-700" />;
    case 'trend':
      return <ChartLine className="w-3.5 h-3.5 text-sky-700" />;
    case 'warn':
      return <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />;
    case 'anchor':
      return <Anchor className="w-3.5 h-3.5 text-indigo-700" />;
    default:
      return <Link2 className="w-3.5 h-3.5 text-slate-600" />;
  }
}

function insightTone(kind: string) {
  switch (kind) {
    case 'target':
      return 'border-teal-200 bg-teal-50/90';
    case 'trend':
      return 'border-sky-200 bg-sky-50/90';
    case 'warn':
      return 'border-amber-200 bg-amber-50/90';
    case 'anchor':
      return 'border-indigo-200 bg-indigo-50/90';
    default:
      return 'border-slate-200 bg-slate-50/90';
  }
}

function hotspotBadge(level: NdpsRiskLevel) {
  const cls =
    level === 'High'
      ? 'bg-red-600 text-white'
      : level === 'Medium'
        ? 'bg-orange-500 text-white'
        : 'bg-emerald-600 text-white';
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${cls}`}>
      {level}
    </span>
  );
}

function rowAccent(level: NdpsRiskLevel) {
  return level === 'High'
    ? 'border-l-red-500 bg-red-50/40'
    : level === 'Medium'
      ? 'border-l-orange-400 bg-orange-50/30'
      : 'border-l-emerald-500 bg-emerald-50/30';
}

const RiskDonut: React.FC = () => {
  const total = NDPS_OFFENDER_SUMMARY.totalCases;
  const gradient = useMemo(() => {
    let start = 0;
    const parts = NDPS_RISK_DISTRIBUTION.map((slice) => {
      const end = start + (slice.count / total) * 360;
      const seg = `${slice.color} ${start}deg ${end}deg`;
      start = end;
      return seg;
    });
    return `conic-gradient(${parts.join(', ')})`;
  }, [total]);

  return (
    <div className="h-full min-h-0 flex flex-col items-center gap-3">
      <div
        className="relative w-32 h-32 rounded-full shrink-0 shadow-inner ring-4 ring-slate-100"
        style={{ background: gradient }}
        aria-hidden
      >
        <div className="absolute inset-[22%] rounded-full bg-white flex flex-col items-center justify-center shadow-sm">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total</div>
          <div className="text-base font-bold text-slate-900 tabular-nums leading-none">
            {total.toLocaleString()}
          </div>
        </div>
      </div>
      <ul className="w-full flex-1 min-h-0 flex flex-col justify-evenly text-[13px]">
        {NDPS_RISK_DISTRIBUTION.map((slice) => (
          <li
            key={slice.level}
            className="flex items-center gap-2 rounded-md px-2.5 py-2 border border-slate-100"
            style={{ background: `${slice.color}14` }}
          >
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: slice.color }}
            />
            <span className="text-slate-800 font-semibold truncate">{slice.level}</span>
            <span className="ml-auto font-mono font-bold text-slate-900">{slice.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const HeatMapPanel: React.FC = () => {
  const { districts } = useApBoundaries();
  const [gunturIsolated, setGunturIsolated] = useState(false);
  const [apViewToken, setApViewToken] = useState(0);

  const gunturFeature = useMemo(
    () =>
      districts?.features.find((feature) => {
        const name = String(
          (feature.properties as { district_name?: string } | null)?.district_name ?? ''
        );
        return name.toLowerCase() === GUNTUR_DISTRICT.toLowerCase();
      }) ?? null,
    [districts]
  );

  const gunturMarkers = useMemo(() => {
    if (!gunturFeature) return [];
    const counts = splitCases(GUNTUR_CASES, GUNTUR_PLACES.length, mulberry32(GUNTUR_SEED + 17));
    return GUNTUR_PLACES.map((place, index) => ({
      id: `guntur-hot-${place.name}`,
      lat: place.lat,
      lon: place.lon,
      kind: 'location' as const,
      label: place.name,
      detail: `NDPS cases: ${counts[index]?.toLocaleString() ?? '0'}`,
    }));
  }, [gunturFeature]);

  const drill: AdminDrill =
    gunturIsolated && gunturFeature
      ? {
          level: 'district',
          apFocused: true,
          districtName: GUNTUR_DISTRICT,
          districtFeature: gunturFeature,
        }
      : AP_STATE_FOCUS_DRILL;

  return (
    <div className="relative rounded-lg border border-slate-300 overflow-hidden bg-[#e8eef2] h-full min-h-0 shadow-sm">
      <div className="absolute top-2 left-2 z-[500] px-2 py-0.5 rounded-md bg-[#0b1c30]/92 text-[10px] font-bold text-white shadow">
        NDPS Cases Heat Map
      </div>
      {gunturIsolated && (
        <button
          type="button"
          className="absolute top-2 right-2 z-[500] px-2 py-0.5 rounded-md bg-white text-[10px] font-bold text-slate-800 shadow border border-slate-200 cursor-pointer"
          onClick={() => {
            setGunturIsolated(false);
            setApViewToken((n) => n + 1);
          }}
        >
          Andhra Pradesh
        </button>
      )}
      <div className="gis-map-host h-full min-h-0">
        <ApLeafletMap
          basemap="vector"
          showStateBorder
          showDistricts
          districtOpacity={1}
          stateOpacity={1}
          fitToState
          adminHoverIdentify={false}
          highlightApFill={false}
          maskOutsideAp
          hideApStateLabel
          labelFreeBasemap
          showScale={false}
          showAttribution={false}
          adminDrill={drill}
          initialCenter={AP_CENTER}
          initialZoom={AP_DEFAULT_ZOOM}
          markers={gunturIsolated ? gunturMarkers : HEAT_MARKERS}
          onMarkerClick={(id) => {
            if (id === GUNTUR_MARKER_ID && gunturFeature) setGunturIsolated(true);
          }}
          boundsView={
            gunturIsolated
              ? null
              : {
                  token: `ndps-analytics-ap-heat-masked-${apViewToken}`,
                  south: AP_BOUNDS[0][0],
                  west: AP_BOUNDS[0][1],
                  north: AP_BOUNDS[1][0],
                  east: AP_BOUNDS[1][1],
                  padRatio: 0.04,
                  lockPadRatio: 0.1,
                  lock: true,
                  maxZoom: 9,
                }
          }
        />
      </div>
    </div>
  );
};

function Panel({
  title,
  accent,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`bg-white rounded-lg border border-slate-200/90 shadow-sm overflow-hidden flex flex-col min-h-0 ${className}`}
    >
      <div
        className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0"
        style={{ background: accent }}
      >
        {title}
      </div>
      <div className={`p-2 min-h-0 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export const NdpsAnalyticsWorkspace: React.FC = () => (
  <div
    className="h-full min-h-0 overflow-hidden bg-gradient-to-br from-slate-100 via-[#e8f2f7] to-[#dceeea]"
    data-testid="ndps-analytics-workspace"
  >
    <div className="h-full min-h-0 p-2 lg:p-2.5">
      <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-2">
        {/* Left */}
        <aside className="xl:col-span-3 h-full min-h-0 flex flex-col gap-2 overflow-hidden">
          <Panel title="NDPS Offender Summary" accent="#0f766e" className="shrink-0">
            <ul className="space-y-1 text-[11px]">
              <li className="flex justify-between gap-2 rounded bg-slate-50 border border-slate-100 px-2 py-1">
                <span className="text-slate-600 font-medium">Total NDPS Cases</span>
                <span className="font-bold font-mono text-slate-900">
                  {NDPS_OFFENDER_SUMMARY.totalCases.toLocaleString()}
                </span>
              </li>
              <li className="flex justify-between gap-2 rounded bg-sky-50 border border-sky-100 px-2 py-1">
                <span className="text-sky-800 font-medium">Active (Monitored)</span>
                <span className="font-bold font-mono text-sky-900">
                  {NDPS_OFFENDER_SUMMARY.activeMonitored.toLocaleString()}
                </span>
              </li>
              <li className="flex justify-between gap-2 rounded bg-red-50 border border-red-100 px-2 py-1">
                <span className="text-red-800 font-medium">High Risk</span>
                <span className="font-bold font-mono text-red-700">
                  {NDPS_OFFENDER_SUMMARY.highRisk.toLocaleString()}
                </span>
              </li>
              <li className="flex justify-between gap-2 rounded bg-orange-50 border border-orange-100 px-2 py-1">
                <span className="text-orange-800 font-medium">Moderate Risk</span>
                <span className="font-bold font-mono text-orange-700">
                  {NDPS_OFFENDER_SUMMARY.moderateRisk.toLocaleString()}
                </span>
              </li>
              <li className="flex justify-between gap-2 rounded bg-emerald-50 border border-emerald-100 px-2 py-1">
                <span className="text-emerald-800 font-medium">Low Risk</span>
                <span className="font-bold font-mono text-emerald-700">
                  {NDPS_OFFENDER_SUMMARY.lowRisk.toLocaleString()}
                </span>
              </li>
            </ul>
          </Panel>

          <Panel title="Top 5 Districts — NDPS Cases" accent="#0369a1" className="shrink-0">
            <ol className="space-y-1.5 text-[11px]">
              {NDPS_TOP_DISTRICTS.map((d, i) => (
                <li key={d.district} className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white shrink-0"
                      style={{ background: RANK_COLORS[i] ?? '#64748b' }}
                    >
                      {d.rank}
                    </span>
                    <span className="text-slate-800 font-semibold truncate">{d.district}</span>
                    <span className="ml-auto font-mono font-bold text-slate-900">{d.cases}</span>
                  </div>
                  <div className="h-1 rounded-full bg-slate-100 overflow-hidden ml-5">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(8, (d.cases / TOP_DISTRICT_MAX) * 100)}%`,
                        background: RANK_COLORS[i] ?? '#64748b',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel
            title="Recent High Risk Offenders"
            accent="#b91c1c"
            className="flex-1"
            bodyClassName="overflow-y-auto"
          >
            <ul className="space-y-1.5">
              {NDPS_RECENT_HIGH_RISK.map((o) => (
                <li
                  key={o.id}
                  className="flex items-end gap-1.5 rounded-md border border-red-100 bg-gradient-to-r from-red-50 to-white px-1.5 py-1"
                >
                  <div className="w-6 h-6 rounded-full bg-sky-600 text-white flex items-center justify-center shrink-0">
                    <UserRound className="w-3 h-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-slate-900 truncate">
                      {o.name}{' '}
                      <span className="text-slate-500 font-medium">@{o.alias}</span>
                    </div>
                    <div className="text-[9px] text-slate-500 truncate">{o.location}</div>
                  </div>
                  <span className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white shrink-0 self-end">
                    Risk: {o.risk}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>

        {/* Center */}
        <section className="xl:col-span-6 h-full min-h-0 flex flex-col gap-2 overflow-hidden">
          <div className="flex-[1.65] min-h-0">
            <HeatMapPanel />
          </div>
          <div className="flex-1 min-h-0 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-2.5 py-1.5 bg-[#0f2942] text-[10px] font-bold uppercase tracking-wider text-white shrink-0">
              District NDPS scorecard
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[10px] min-w-[560px]">
                <thead className="bg-teal-50 text-teal-900 uppercase tracking-wider text-[9px] sticky top-0 z-[1]">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-bold">District</th>
                    <th className="text-right px-2 py-1.5 font-bold">NDPS Cases</th>
                    <th className="text-right px-2 py-1.5 font-bold">Active</th>
                    <th className="text-right px-2 py-1.5 font-bold">High Risk</th>
                    <th className="text-right px-2 py-1.5 font-bold">Seizures (Kg)</th>
                    <th className="text-right px-2 py-1.5 font-bold">Arrests</th>
                    <th className="text-left px-2 py-1.5 font-bold">Hotspot</th>
                  </tr>
                </thead>
                <tbody>
                  {NDPS_DISTRICT_STATS.map((row) => (
                    <tr
                      key={row.district}
                      className={`border-t border-slate-100 border-l-4 ${rowAccent(row.hotspot)}`}
                    >
                      <td className="px-2 py-1.5 font-semibold text-slate-800">{row.district}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-slate-900">
                        {row.cases}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-sky-800">
                        {row.activeOffenders}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-red-600">
                        {row.highRisk}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-indigo-800">
                        {row.seizuresKg}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-800">
                        {row.arrests}
                      </td>
                      <td className="px-2 py-1.5">{hotspotBadge(row.hotspot)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Right — equal split so bottom lines up with left/center */}
        <aside className="xl:col-span-3 h-full min-h-0 flex flex-col gap-2 overflow-hidden">
          <Panel
            title="Spatial Analytics Insights"
            accent="#5b21b6"
            className="flex-1"
            bodyClassName="overflow-y-auto !p-1.5"
          >
            <ul className="space-y-1">
              {NDPS_SPATIAL_INSIGHTS.map((insight) => (
                <li
                  key={insight.id}
                  className={`flex gap-1.5 text-[10px] text-slate-700 leading-snug rounded-md border px-1.5 py-1 ${insightTone(insight.icon)}`}
                >
                  <span className="mt-0.5 shrink-0">{insightIcon(insight.icon)}</span>
                  <span>{insight.text}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Risk Level Distribution"
            accent="#b45309"
            className="flex-1"
            bodyClassName="flex-1 flex flex-col min-h-0 !p-3"
          >
            <RiskDonut />
          </Panel>
        </aside>
      </div>
    </div>
  </div>
);
