import React from 'react';
import { FileDown } from 'lucide-react';
import type { GisLayer } from '../../types/gis';
import { MAP_EXPORT_FORMATS, queueMapFormatExport } from '../../gis/mapFormatExport';

interface MapFormatExportButtonsProps {
  layers: GisLayer[];
  context: string;
  canExport: boolean;
  onDenied: () => void;
  onToast: (msg: string) => void;
}

/** DOCX §7 — JPEG · TIFF · IMG · KMZ · KML (manifest until full render pipeline). */
export const MapFormatExportButtons: React.FC<MapFormatExportButtonsProps> = ({
  layers,
  context,
  canExport,
  onDenied,
  onToast,
}) => {
  const enabledCount = layers.filter((l) => l.enabled).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-on-surface-variant">
        <FileDown className="w-3.5 h-3.5" />
        <span>Export / download / print — JPEG · TIFF · IMG · KMZ · KML</span>
        <span className="font-mono font-semibold text-secondary normal-case tracking-normal">
          ({enabledCount} layer{enabledCount === 1 ? '' : 's'} on)
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MAP_EXPORT_FORMATS.map((fmt) => (
          <button
            key={fmt.id}
            type="button"
            title={fmt.note}
            disabled={!canExport}
            onClick={() => {
              if (!canExport) {
                onDenied();
                return;
              }
              const { enabledCount: n } = queueMapFormatExport({
                formatId: fmt.id,
                formatLabel: fmt.label,
                layers,
                context,
              });
              onToast(`Queued ${fmt.label} map export (${n} layers)`);
            }}
            className="px-2.5 py-1 rounded border border-outline-variant/50 bg-surface-container-lowest text-[11px] font-bold text-primary hover:bg-surface-container-low cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fmt.label}
          </button>
        ))}
      </div>
    </div>
  );
};
