import React, { useState } from 'react';
import {
  BookOpen,
  Download,
  FileSpreadsheet,
  Network,
  RefreshCw,
  Share2,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { AuditLogEntry, GisLayer, TopologyAuditRule, WorkspaceId } from '../../types/gis';
import { downloadTextFile } from '../../utils/geoMath';
import { useAuth } from '../../auth/AuthContext';

interface OutputsGovProps {
  workspace:
    | 'mobile-gis-export'
    | 'atlas-map-book-generator'
    | 'reports-and-seizure-analytics'
    | 'data-quality-and-topology-audits'
    | 'conditional-capabilities-and-dependency-register'
    | 'user-roles-and-audit-trail';
  layers: GisLayer[];
  topologyRules: TopologyAuditRule[];
  onFixTopologyRule: (id: string) => void;
  auditLogs: AuditLogEntry[];
  onSwitchWorkspace: (ws: WorkspaceId) => void;
  onTriggerToast: (msg: string) => void;
}

export const OutputsGovernanceWorkspaces: React.FC<OutputsGovProps> = ({
  workspace,
  layers,
  topologyRules,
  onFixTopologyRule,
  auditLogs,
  onSwitchWorkspace,
  onTriggerToast,
}) => {
  const { can } = useAuth();
  // Mobile GPKG state
  const [selectedSector, setSelectedSector] = useState('ASR Agency Full Extent (Paderu + Araku + Chintapalle)');
  const [includeMbTiles, setIncludeMbTiles] = useState(true);

  // Atlas Map Book state
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);

  // Reports horizon
  const [reportPeriod, setReportPeriod] = useState<'FY25-26' | 'Q3-2026'>('FY25-26');

  if (workspace === 'mobile-gis-export') {
    const enabledCount = layers.filter((l) => l.enabled).length;
    const estSizeMb = (enabledCount * 3.4 + (includeMbTiles ? 64.5 : 0)).toFixed(1);

    const handleDownloadGpkgManifest = () => {
      if (!can('export')) {
        onTriggerToast('Export denied for your RBAC clearance');
        return;
      }
      const manifest = {
        packageFormat: 'OGC GeoPackage 1.3 (.gpkg)',
        targetPlatform: 'EAGLE Force QField / ATAK Field Tablet',
        sectorExtent: selectedSector,
        crs: 'EPSG:4326',
        offlineSatelliteTilesIncluded: includeMbTiles,
        bundledLayers: layers.filter((l) => l.enabled).map((l) => l.sourceTable),
        estimatedSizeMB: Number(estSizeMb),
        generatedAt: '2026-10-28T04:44:00+05:30',
      };
      downloadTextFile('eagle_field_deployment_gpkg_manifest.json', JSON.stringify(manifest, null, 2));
      onTriggerToast(`Generated Offline Field GeoPackage bundle (${estSizeMb} MB)`);
    };

    return (
      <div className="p-4 lg:p-6 space-y-5 max-w-5xl mx-auto">
        <div className="border-b border-outline-variant/35 pb-3">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
            Zero-Connectivity Eastern Ghats Field Sync
          </span>
          <h1 className="text-xl font-bold text-primary tracking-tight">
            Mobile GIS Offline Package Builder (OGC GeoPackage / MBTiles)
          </h1>
        </div>

        <div className="bg-surface-container-lowest rounded border border-outline-variant/40 p-5 space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-primary mb-1">
                Operational Bounding Extent
              </label>
              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="w-full h-9 px-2.5 rounded border border-outline-variant/50 bg-surface-container-low"
              >
                <option>ASR Agency Full Extent (Paderu + Araku + Chintapalle)</option>
                <option>NH-16 Coastal Interception Corridor (Srikakulam – Nellore)</option>
                <option>Odisha–AP Koraput–Malkangiri Border Buffer (25km)</option>
              </select>
            </div>
            <div className="p-3 rounded bg-surface-container-low border border-outline-variant/35 flex items-center justify-between tabular-coord">
              <div>
                <div className="text-[10.5px] text-on-surface-variant font-semibold uppercase">
                  Estimated Tablet Bundle
                </div>
                <div className="text-lg font-bold font-mono text-primary">{estSizeMb} MB</div>
              </div>
              <span className="px-2 py-1 rounded bg-secondary-container/50 text-on-secondary-container font-bold">
                {enabledCount} Vector Layers
              </span>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={includeMbTiles}
              onChange={(e) => setIncludeMbTiles(e.target.checked)}
              className="accent-primary"
            />
            <span className="font-medium">
              Embed SOI 1:50K + Cartosat-3 Pyramid Raster Tiles (.mbtiles Zoom 10–17) for VHF-only forest zones
            </span>
          </label>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              data-testid="export-gpkg"
              disabled={!can('export')}
              onClick={handleDownloadGpkgManifest}
              className="px-4 py-2 rounded bg-primary text-on-primary font-bold flex items-center gap-1.5 hover:bg-primary-container cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Generate &amp; Download Field GPKG Bundle</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (workspace === 'atlas-map-book-generator') {
    const sheets: Array<{
      id: string;
      circle: string;
      checkposts: number;
      hotspots: number;
      grid: string;
    }> = [];
    const current = sheets[activeSheetIdx];

    return (
      <div className="p-4 lg:p-6 space-y-4 max-w-[1440px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/35 pb-3">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
              Data-Driven Multi-Sheet Cartography
            </span>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Circle &amp; Jurisdiction Atlas Map Book Generator
            </h1>
          </div>
          <button
            type="button"
            onClick={() => onTriggerToast('No atlas sheets were provided')}
            className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Compile Full Circle Atlas</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 space-y-2">
            {sheets.map((sh, idx) => (
              <button
                key={sh.id}
                type="button"
                onClick={() => setActiveSheetIdx(idx)}
                className={`w-full p-3 rounded border text-left transition-colors cursor-pointer ${
                  activeSheetIdx === idx
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-surface-container-lowest border-outline-variant/40 hover:bg-surface-container-low'
                }`}
              >
                <div className="text-[10.5px] font-mono opacity-80">
                  ATLAS PAGE {sh.id} • SOI {sh.grid}
                </div>
                <div className="text-xs font-bold mt-0.5">{sh.circle}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-8 bg-surface-container-lowest rounded border border-outline-variant/40 p-5 space-y-3 tabular-coord">
            {!current ? (
              <p className="text-sm text-on-surface-variant">
                No circle atlas pages were provided. Nothing is generated until a jurisdiction sheet list exists.
              </p>
            ) : (
              <>
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2">
              <div>
                <span className="text-[10px] font-mono font-bold text-secondary">
                  PREVIEWING PAGE {activeSheetIdx + 1} OF {sheets.length}
                </span>
                <h2 className="text-base font-bold text-primary">{current.circle}</h2>
              </div>
              <span className="text-xs font-mono bg-surface-container px-2 py-1 rounded">
                Grid {current.grid}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded bg-surface-container-low">
                <div className="text-on-surface-variant text-[10.5px]">Active Check Posts</div>
                <div className="text-lg font-bold font-mono text-primary">{current.checkposts}</div>
              </div>
              <div className="p-3 rounded bg-surface-container-low">
                <div className="text-on-surface-variant text-[10.5px]">Mapped Hotspots</div>
                <div className="text-lg font-bold font-mono text-error">{current.hotspots}</div>
              </div>
              <div className="p-3 rounded bg-surface-container-low">
                <div className="text-on-surface-variant text-[10.5px]">Scale Standard</div>
                <div className="text-lg font-bold font-mono text-secondary">1:25,000</div>
              </div>
            </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (workspace === 'reports-and-seizure-analytics') {
    const rows: Array<{
      corridor: string;
      firs: number;
      cannabisKg: number;
      vehicles: number;
      hitRate: string;
    }> = [];

    const handleDownloadCsv = () => {
      const csv = [
        'Corridor,FIRs,Seized_Kg,Vehicles_Impounded,ANPR_Hit_Rate',
        ...rows.map((r) => `"${r.corridor}",${r.firs},${r.cannabisKg},${r.vehicles},${r.hitRate}`),
      ].join('\n');
      downloadTextFile(`eagle_ap_seizure_analytics_${reportPeriod}.csv`, csv, 'text/csv');
      onTriggerToast('Downloaded NDPS Seizure Corridor Report (.csv)');
    };

    return (
      <div className="p-4 lg:p-6 space-y-4 max-w-[1440px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/35 pb-3">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
              NDPS Enforcement Telemetry &amp; Corridor Attribution
            </span>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Reports &amp; Contraband Seizure Analytics
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-surface-container p-0.5 rounded">
              {(['FY25-26', 'Q3-2026'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setReportPeriod(p)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                    reportPeriod === p ? 'bg-white text-primary shadow-xs' : 'text-on-surface-variant'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export CSV Ledger</span>
            </button>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded border border-outline-variant/40 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs tabular-coord whitespace-nowrap">
            <thead className="bg-surface-container text-[10.5px] font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/35">
              <tr>
                <th className="py-2.5 px-4">Strategic Transit Corridor</th>
                <th className="py-2.5 px-4 text-right">Registered FIRs</th>
                <th className="py-2.5 px-4 text-right">Seized Contraband (kg)</th>
                <th className="py-2.5 px-4 text-right">Vehicles Impounded</th>
                <th className="py-2.5 px-4 text-right">ANPR Correlation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/25">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 px-4 text-on-surface-variant">
                    No seizure or FIR ledger was provided. This table stays empty until a verified file is loaded.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.corridor} className="hover:bg-surface-container-low/50">
                  <td className="py-2.5 px-4 font-semibold text-primary">{r.corridor}</td>
                  <td className="py-2.5 px-4 text-right font-mono">{r.firs}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-error">
                    {r.cannabisKg.toLocaleString()} kg
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono">{r.vehicles}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold text-secondary">
                    {r.hitRate}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (workspace === 'data-quality-and-topology-audits') {
    return (
      <div className="p-4 lg:p-6 space-y-4 max-w-[1440px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/35 pb-3">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
              OGC Simple Features &amp; PostGIS Topology Engine
            </span>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Data Quality &amp; Spatial Topology Audits
            </h1>
          </div>
          <button
            type="button"
            onClick={() => onTriggerToast('No topology engine is connected. Only loaded KMZ points are listed.')}
            className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Re-Run Topology Audit</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 tabular-coord">
          {topologyRules.map((rule) => (
            <div
              key={rule.id}
              className="bg-surface-container-lowest rounded border border-outline-variant/40 p-4 space-y-2.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-primary text-sm">{rule.ruleName}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    rule.violations === 0
                      ? 'bg-secondary-container/50 text-on-secondary-container'
                      : 'bg-error-container text-on-error-container'
                  }`}
                >
                  {rule.violations === 0 ? '0 VIOLATIONS (PASS)' : `${rule.violations} VIOLATIONS`}
                </span>
              </div>
              <div className="font-mono text-[11px] text-secondary">{rule.layerName}</div>
              <p className="text-on-surface-variant leading-relaxed">{rule.description}</p>
              <div className="pt-1 flex items-center justify-between border-t border-outline-variant/25">
                <span className="font-mono text-[10.5px] text-outline">
                  Checked: {rule.checkedFeatures.toLocaleString()} features
                </span>
                {rule.violations > 0 && (
                  <button
                    type="button"
                    data-testid={`topology-fix-${rule.id}`}
                    disabled={!can('fixTopology')}
                    onClick={() => onFixTopologyRule(rule.id)}
                    className="px-2.5 py-1 rounded bg-secondary text-on-secondary text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Wrench className="w-3 h-3" />
                    <span>Auto-Snap &amp; Resolve</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (workspace === 'conditional-capabilities-and-dependency-register') {
    const services = [
      { name: 'PostGIS', endpoint: 'not configured', status: 'NOT CONNECTED', latency: '—' },
      { name: 'GeoServer', endpoint: 'not configured', status: 'NOT CONNECTED', latency: '—' },
      { name: 'ANPR / CCTV', endpoint: 'not configured', status: 'NOT CONNECTED', latency: '—' },
      { name: 'Bhuvan / Cartosat', endpoint: 'not configured', status: 'NOT CONNECTED', latency: '—' },
      { name: 'CCTNS NDPS', endpoint: 'not configured', status: 'NOT CONNECTED', latency: '—' },
    ];

    return (
      <div className="p-4 lg:p-6 space-y-4 max-w-[1440px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/35 pb-3">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
              OGC &amp; Inter-Agency Upstream Connectors
            </span>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Capabilities &amp; Spatial Dependency Register
            </h1>
          </div>
          <button
            type="button"
            onClick={() => onTriggerToast('No upstream endpoints are configured')}
            className="px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-primary text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Network className="w-3.5 h-3.5" />
            <span>Ping All Endpoints</span>
          </button>
        </div>

        <div className="bg-surface-container-lowest rounded border border-outline-variant/40 divide-y divide-outline-variant/25 text-xs tabular-coord">
          {services.map((svc) => (
            <div key={svc.name} className="p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold text-primary">{svc.name}</div>
                <div className="font-mono text-[11px] text-on-surface-variant">{svc.endpoint}</div>
              </div>
              <div className="flex items-center gap-3 font-mono">
                <span className="text-on-surface-variant">{svc.latency}</span>
                <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px] font-bold">
                  {svc.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // USER ROLES & AUDIT TRAIL
  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1440px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/35 pb-3">
        <div>
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
            Zero-Trust Spatial Governance &amp; Chain of Custody
          </span>
          <h1 className="text-xl font-bold text-primary tracking-tight">
            Law Enforcement RBAC &amp; Cryptographic GIS Audit Trail
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            downloadTextFile('eagle_gis_audit_trail.json', JSON.stringify(auditLogs, null, 2));
            onTriggerToast('Exported signed cryptographic GIS audit ledger');
          }}
          className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Signed Audit Log</span>
        </button>
      </div>

      <div className="bg-surface-container-lowest rounded border border-outline-variant/40 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs tabular-coord whitespace-nowrap">
          <thead className="bg-surface-container text-[10.5px] font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/35">
            <tr>
              <th className="py-2.5 px-3">Audit ID</th>
              <th className="py-2.5 px-3">Timestamp (IST)</th>
              <th className="py-2.5 px-3">Officer / Actor</th>
              <th className="py-2.5 px-3">RBAC Clearance</th>
              <th className="py-2.5 px-3">Action</th>
              <th className="py-2.5 px-3">Target Spatial Resource</th>
              <th className="py-2.5 px-3">Integrity Hash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/25">
            {auditLogs.map((entry) => (
              <tr key={entry.id} className="hover:bg-surface-container-low/50">
                <td className="py-2 px-3 font-mono font-bold text-primary">{entry.id}</td>
                <td className="py-2 px-3 font-mono text-on-surface-variant">{entry.timestamp}</td>
                <td className="py-2 px-3 font-semibold text-primary flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-secondary" />
                  <span>{entry.actor}</span>
                </td>
                <td className="py-2 px-3 font-mono text-[10.5px]">{entry.role}</td>
                <td className="py-2 px-3 font-mono font-semibold text-secondary">{entry.action}</td>
                <td className="py-2 px-3 font-mono text-[11px]">{entry.resource}</td>
                <td className="py-2 px-3 font-mono text-[10.5px] text-outline">{entry.signatureHash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
