import React from 'react';
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
  
  if (workspace === 'reports-seizure-analytics') {
    const rows = INITIAL_SEIZURE_REPORT_ROWS;

    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const handleDownloadCsv = () => {
      const csv = [
        'Seizure_Location,FIRs,Seized_Kg,Vehicles_Impounded,Remarks',
        ...rows.map((r) => `${q(r.location)},${r.firs},${r.cannabisKg},${r.vehicles},${q(r.remarks)}`),
      ].join('\n');
      downloadTextFile('eagle_ap_seizure_report.csv', csv, 'text/csv');
      onTriggerToast('Downloaded seizure report (.csv)');
    };

    return (
      <div className="p-4 pb-10 lg:p-6 lg:pb-12 space-y-4 max-w-[1440px] mx-auto">
        <div className="ws-panel px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-secondary block">
              Reports, Downloads and Planning Support
            </span>
            <h1 className="text-xl font-bold text-primary tracking-tight leading-tight">
              Reports &amp; Seizure Analytics
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded bg-amber-100 text-amber-900 text-[10px] font-bold uppercase tracking-wide">
              Demo sample data
            </span>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="ws-btn ws-btn-primary"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="ws-panel overflow-x-auto">
          <table className="ws-table tabular-coord whitespace-nowrap">
            <thead>
              <tr>
                <th>Seizure location</th>
                <th className="text-right">Registered FIRs</th>
                <th className="text-right">Seized quantity (kg)</th>
                <th className="text-right">Vehicles impounded</th>
                <th className="text-right">Remarks</th>
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
      <div className="ws-panel px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-secondary block">
            System &amp; Governance
          </span>
          <h1 className="text-xl font-bold text-primary tracking-tight leading-tight">
            Users &amp; Audit Trail
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            downloadTextFile('eagle_gis_audit_trail.json', JSON.stringify(auditLogs, null, 2));
            onTriggerToast('Exported GIS audit log');
          }}
          className="ws-btn ws-btn-primary"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Audit Log</span>
        </button>
      </div>

      <div className="ws-panel overflow-x-auto">
        <table className="ws-table tabular-coord whitespace-nowrap">
          <thead>
            <tr>
              <th>Audit ID</th>
              <th>Timestamp (IST)</th>
              <th>Officer / Actor</th>
              <th>RBAC Clearance</th>
              <th>Action</th>
              <th>Target Spatial Resource</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/25">
            {auditLogs.map((entry) => (
              <tr key={entry.id} className="hover:bg-surface-container-low/50">
                <td className="py-2 px-3 font-mono font-bold text-primary">{entry.id}</td>
                <td className="py-2 px-3 font-mono text-on-surface-variant">{entry.timestamp}</td>
                <td className="py-2 px-3 font-semibold text-primary">
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-secondary" />
                    <span>{entry.actor}</span>
                  </span>
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
