import React, { useState } from 'react';
import { Download, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { AuditLogEntry, GisLayer, WorkspaceId } from '../../types/gis';
import { INITIAL_SEIZURE_REPORT_ROWS } from '../../data/apGisData';
import { downloadTextFile } from '../../utils/geoMath';
import { useAuth } from '../../auth/AuthContext';

interface OutputsGovProps {
  workspace: 'reports-seizure-analytics' | 'users-audit-trail';
  layers: GisLayer[];
  auditLogs: AuditLogEntry[];
  onSwitchWorkspace: (ws: WorkspaceId) => void;
  onTriggerToast: (msg: string) => void;
}

export const OutputsGovernanceWorkspaces: React.FC<OutputsGovProps> = ({
  workspace,
  layers: _layers,
  auditLogs,
  onSwitchWorkspace,
  onTriggerToast,
}) => {
  const { can } = useAuth();
  const [reportPeriod, setReportPeriod] = useState<'FY25-26' | 'Q3-2026'>('FY25-26');

  if (workspace === 'reports-seizure-analytics') {
    const rows = INITIAL_SEIZURE_REPORT_ROWS;

    const handleDownloadCsv = () => {
      const csv = [
        'Seizure_Location,FIRs,Seized_Kg,Vehicles_Impounded,Remarks',
        ...rows.map((r) => `"${r.location}",${r.firs},${r.cannabisKg},${r.vehicles},"${r.remarks}"`),
      ].join('\n');
      downloadTextFile(`eagle_ap_seizure_report_${reportPeriod}.csv`, csv, 'text/csv');
      onTriggerToast('Downloaded seizure report (.csv)');
    };

    return (
      <div className="p-4 pb-10 lg:p-6 lg:pb-12 space-y-4 max-w-[1440px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/35 pb-3">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
              Reports, Downloads and Planning Support
            </span>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Reports &amp; Seizure Analytics
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
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded border border-outline-variant/40 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs tabular-coord whitespace-nowrap">
            <thead className="bg-surface-container text-[10.5px] font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/35">
              <tr>
                <th className="py-2.5 px-4">Seizure location</th>
                <th className="py-2.5 px-4 text-right">Registered FIRs</th>
                <th className="py-2.5 px-4 text-right">Seized quantity (kg)</th>
                <th className="py-2.5 px-4 text-right">Vehicles impounded</th>
                <th className="py-2.5 px-4 text-right">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/25">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 px-4 text-on-surface-variant">
                    No seizure report rows yet. Load verified ganja seizure / FIR data to populate this table.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.location} className="hover:bg-surface-container-low/50">
                  <td className="py-2.5 px-4 font-semibold text-primary">{r.location}</td>
                  <td className="py-2.5 px-4 text-right font-mono">{r.firs}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-error">
                    {r.cannabisKg.toLocaleString()} kg
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono">{r.vehicles}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold text-secondary">
                    {r.remarks}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // USER ROLES & AUDIT TRAIL
  return (
    <div className="p-4 pb-10 lg:p-6 lg:pb-12 space-y-5 max-w-[1440px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/35 pb-3">
        <div>
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-secondary block">
            System &amp; Governance
          </span>
          <h1 className="text-xl font-bold text-primary tracking-tight">
            Users &amp; Audit Trail
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            downloadTextFile('eagle_gis_audit_trail.json', JSON.stringify(auditLogs, null, 2));
            onTriggerToast('Exported GIS audit log');
          }}
          className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Audit Log</span>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
