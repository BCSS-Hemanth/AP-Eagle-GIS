import React, { useMemo, useState } from 'react';
import { FileUp, Link2, Upload } from 'lucide-react';
import {
  filesFromBrowser,
  ingestFiles,
  ingestGeoJsonText,
  ingestUri,
  QGIS_INGEST_PROVIDERS,
  QGIS_UNAVAILABLE_IN_BROWSER,
  type IngestedLayer,
} from '../../gis/ingest';

const ACCEPT = [
  '.geojson',
  '.json',
  '.shp',
  '.dbf',
  '.shx',
  '.prj',
  '.kml',
  '.kmz',
  '.gpx',
  '.gml',
  '.csv',
  '.tsv',
  '.txt',
  '.xlsx',
  '.ods',
  '.dxf',
  '.gpkg',
  '.tif',
  '.tiff',
  '.asc',
  '.hgt',
  '.png',
  '.jpg',
  '.jpeg',
  '.zip',
  '.pgw',
  '.jgw',
  '.wld',
].join(',');

interface IngestPanelProps {
  canImport: boolean;
  onPublish: (layers: IngestedLayer[]) => void;
  onToast: (msg: string) => void;
  compact?: boolean;
}

export const IngestPanel: React.FC<IngestPanelProps> = ({
  canImport,
  onPublish,
  onToast,
  compact = false,
}) => {
  const [busy, setBusy] = useState(false);
  const [uri, setUri] = useState('');
  const [paste, setPaste] = useState('');
  const [preview, setPreview] = useState<IngestedLayer[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [title, setTitle] = useState('User layer');

  const readyCount = useMemo(
    () => preview.reduce((n, layer) => n + layer.featureCount, 0),
    [preview]
  );

  const mergeBatch = (layers: IngestedLayer[], errs: Array<{ sourceUri: string; message: string }>) => {
    setPreview((prev) => [...layers, ...prev]);
    setErrors(errs.map((e) => `${e.sourceUri}: ${e.message}`));
    if (layers[0] && title === 'User layer') setTitle(layers[0].name);
  };

  const handleFiles = async (list: FileList | null) => {
    if (!canImport) {
      onToast('Import denied for your RBAC clearance');
      return;
    }
    if (!list?.length) return;
    setBusy(true);
    try {
      const sources = await filesFromBrowser(list);
      const batch = await ingestFiles(sources);
      mergeBatch(batch.layers, batch.errors);
      if (batch.layers.length) {
        onToast(`Parsed ${batch.layers.length} layer(s) via QGIS-style providers`);
      } else if (batch.errors.length) {
        onToast(batch.errors[0].message);
      }
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleUri = async () => {
    if (!canImport) {
      onToast('Import denied for your RBAC clearance');
      return;
    }
    if (!uri.trim()) return;
    setBusy(true);
    try {
      const batch = await ingestUri(uri.trim(), title);
      mergeBatch(batch.layers, batch.errors);
      if (batch.layers.length) onToast(`Connected ${batch.layers[0].driver} source`);
      else onToast(batch.errors[0]?.message ?? 'URI ingest failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePaste = () => {
    if (!canImport) {
      onToast('Import denied for your RBAC clearance');
      return;
    }
    try {
      const layer = ingestGeoJsonText(paste, title);
      if (!layer.featureCount) {
        onToast('Pasted JSON has no valid geometries');
        return;
      }
      setPreview((prev) => [layer, ...prev]);
      setErrors([]);
    } catch (err) {
      onToast((err as Error).message);
    }
  };

  const handlePublish = () => {
    if (!preview.length) {
      onToast('Load a file, URI, or GeoJSON first');
      return;
    }
    const named = preview.map((layer) => ({
      ...layer,
      name: preview.length === 1 ? title || layer.name : layer.name,
    }));
    onPublish(named);
    setPreview([]);
    setErrors([]);
  };

  return (
    <div className={`space-y-4 text-xs ${compact ? '' : ''}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label
          className="rounded border border-dashed border-secondary/50 bg-secondary-container/10 p-4 flex flex-col items-center gap-2 cursor-pointer"
          data-testid="ingest-dropzone"
        >
          <FileUp className="w-5 h-5 text-secondary" />
          <div className="font-bold text-primary">Drop OGR / GDAL files</div>
          <div className="text-[10.5px] text-on-surface-variant text-center">
            GeoJSON, Shapefile (+DBF/PRJ), KML/KMZ, GPX, GML, CSV, XLSX/ODS, DXF, GPKG, GeoTIFF, ASCII Grid, SRTM HGT, ZIP
          </div>
          <input
            data-testid="ingest-file-input"
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            disabled={!canImport || busy}
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>
        <div className="rounded border border-outline-variant/40 p-3 space-y-2">
          <div className="font-bold text-primary flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-secondary" />
            WMS / WMTS / WFS / XYZ / ArcGIS REST
          </div>
          <input
            data-testid="ingest-uri-input"
            type="text"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="https://…?SERVICE=WMS&LAYERS=… or FeatureServer/0"
            className="w-full h-8 px-2 rounded border border-outline-variant/50 bg-surface-container-low font-mono text-[11px]"
          />
          <button
            type="button"
            data-testid="ingest-uri-connect"
            disabled={!canImport || busy}
            onClick={() => void handleUri()}
            className="h-8 px-3 rounded bg-primary text-on-primary font-semibold cursor-pointer disabled:opacity-50"
          >
            Connect service
          </button>
        </div>
      </div>

      <div>
        <label className="block font-semibold text-primary mb-1">Layer title</label>
        <input
          data-testid="ingest-layer-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full h-8 px-2.5 rounded border border-outline-variant/50 bg-surface-container-low"
        />
      </div>

      <div>
        <label className="block font-semibold text-primary mb-1">Paste GeoJSON (QGIS memory provider)</label>
        <textarea
          data-testid="ingest-geojson-paste"
          rows={compact ? 4 : 6}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          className="w-full p-2.5 rounded border border-outline-variant/50 bg-surface-container-low font-mono text-[11px]"
          placeholder='{"type":"FeatureCollection","features":[…]}'
        />
        <button
          type="button"
          className="mt-1.5 h-8 px-3 rounded border border-outline-variant/50 font-semibold cursor-pointer"
          onClick={handlePaste}
          disabled={!canImport}
        >
          Parse pasted JSON
        </button>
      </div>

      {preview.length > 0 && (
        <div className="rounded border border-outline-variant/40 divide-y divide-outline-variant/25" data-testid="ingest-preview">
          {preview.map((layer) => (
            <div key={layer.id} className="p-2.5 flex flex-wrap justify-between gap-2">
              <div>
                <div className="font-bold text-primary">{layer.name}</div>
                <div className="font-mono text-[10.5px] text-on-surface-variant">
                  {layer.driver} · {layer.qgisAnalog} · {layer.sourceCrs} → EPSG:4326 · {layer.featureCount} feat
                </div>
                {layer.warnings[0] && (
                  <div className="text-[10.5px] text-error mt-0.5">{layer.warnings[0]}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {errors.map((err) => (
        <div key={err} className="text-[11px] text-error">
          {err}
        </div>
      ))}

      <button
        type="button"
        data-testid="import-publish"
        disabled={!canImport || busy || preview.length === 0}
        onClick={handlePublish}
        className="w-full py-2 rounded bg-secondary text-on-secondary font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Upload className="w-3.5 h-3.5" />
        Publish {preview.length ? `${preview.length} layer${preview.length === 1 ? '' : 's'}` : 'layers'} to map
        {readyCount ? ` (${readyCount} features)` : ''}
      </button>

      {!compact && (
        <div className="rounded border border-outline-variant/35 p-3 space-y-1 text-[10.5px] text-on-surface-variant">
          <div className="font-bold text-primary text-[11px]">QGIS providers in this browser build</div>
          {QGIS_INGEST_PROVIDERS.filter((p) => p.feasible).map((p) => (
            <div key={p.key}>
              <span className="font-mono text-secondary">{p.key}</span> — {p.title}
            </div>
          ))}
          <div className="font-bold text-primary text-[11px] pt-1">Not available without a GIS server</div>
          {QGIS_UNAVAILABLE_IN_BROWSER.map((p) => (
            <div key={p.key}>
              <span className="font-mono">{p.key}</span> — {p.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
