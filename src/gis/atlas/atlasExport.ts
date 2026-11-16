import { downloadBlob } from '../../utils/geoMath';
import { captureDomToCanvas } from '../captureDomCanvas';
import { captureSheetCanvas } from '../mapFormatExport';
import {
  DEFAULT_ATLAS_EXPORT_DECORATIONS,
  paintAtlasExportDecorations,
  type AtlasExportDecorationFlags,
  type AtlasExportLegendItem,
} from './atlasExportDecorations';

export type AtlasExportFormat = 'png' | 'jpeg';
export type AtlasExportResolution = 'standard' | 'high';

export type {
  AtlasExportDecorationFlags,
  AtlasExportLegendItem,
};
export { DEFAULT_ATLAS_EXPORT_DECORATIONS };

export async function exportAtlasMapImage(options: {
  mapEl: HTMLElement;
  format: AtlasExportFormat;
  resolution: AtlasExportResolution;
  fileBaseName: string;
  decorations?: AtlasExportDecorationFlags;
  legendItems?: AtlasExportLegendItem[];
}): Promise<{ fileName: string }> {
  const scale = options.resolution === 'high' ? 3 : 2;
  const decorations = options.decorations ?? DEFAULT_ATLAS_EXPORT_DECORATIONS;

  // Prefer the Leaflet map pane (tiles + vectors) so app chrome CSS is excluded.
  const captureTarget =
    (options.mapEl.querySelector('.leaflet-container') as HTMLElement | null) ?? options.mapEl;

  const canvas = await captureDomToCanvas(captureTarget, {
    scale,
    backgroundColor: '#ffffff',
  });

  if (canvas.width < 32 || canvas.height < 32) {
    throw new Error('Export canvas is empty — wait for the map and layers to finish loading');
  }

  paintAtlasExportDecorations(canvas, {
    decorations,
    legendItems: options.legendItems ?? [],
  });

  const mime = options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = options.format === 'jpeg' ? 0.92 : undefined;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode map image'))),
      mime,
      quality
    );
  });

  const ext = options.format === 'jpeg' ? 'jpg' : 'png';
  const fileName = `${options.fileBaseName}.${ext}`;
  downloadBlob(fileName, blob);
  return { fileName };
}

/** Prefer map host node; falls back to captureSheetCanvas for non-map sheets. */
export async function captureAtlasMapOrSheet(el: HTMLElement): Promise<HTMLCanvasElement> {
  return captureSheetCanvas(el);
}
