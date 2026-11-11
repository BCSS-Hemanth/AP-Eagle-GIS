import JSZip from 'jszip';
import type { GisLayer } from '../types/gis';
import { downloadBlob, downloadTextFile } from '../utils/geoMath';
import { captureDomToCanvas } from './captureDomCanvas';

/** DOCX §7 map export / download / print formats. */
export const MAP_EXPORT_FORMATS = [
  { id: 'jpeg', label: 'JPEG', note: 'Print / briefing raster' },
  { id: 'tiff', label: 'TIFF', note: 'Geo / print archive' },
  { id: 'img', label: 'IMG', note: 'Raster exchange' },
  { id: 'kmz', label: 'KMZ', note: 'Packed KML + overlays' },
  { id: 'kml', label: 'KML', note: 'Placemarks / vectors' },
] as const;

export type MapExportFormatId = (typeof MAP_EXPORT_FORMATS)[number]['id'];

export function queueMapFormatExport(options: {
  formatId: MapExportFormatId;
  formatLabel: string;
  layers: GisLayer[];
  context: string;
}): { fileName: string; enabledCount: number } {
  const enabled = options.layers.filter((l) => l.enabled);
  const manifest = {
    format: options.formatLabel,
    context: options.context,
    layers: enabled.map((l) => ({ id: l.id, name: l.name, source: l.sourceTable })),
    crs: 'EPSG:4326',
    generatedAt: new Date().toISOString(),
  };
  const fileName = `eagle_map_export_${options.formatId}_manifest.json`;
  downloadTextFile(fileName, JSON.stringify(manifest, null, 2));
  return { fileName, enabledCount: enabled.length };
}

/** Capture a composed map sheet DOM node to a PNG canvas (then encode per format). */
export async function captureSheetCanvas(sheetEl: HTMLElement): Promise<HTMLCanvasElement> {
  return captureDomToCanvas(sheetEl, { scale: 2, backgroundColor: '#ffffff' });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      type,
      quality
    );
  });
}

/** Minimal uncompressed RGB TIFF (no georef) for print-archive exchange. */
export function rgbCanvasToTiffBlob(canvas: HTMLCanvasElement): Blob {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  const { data } = ctx.getImageData(0, 0, w, h);
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < data.length; i += 4) {
    rgb[j++] = data[i];
    rgb[j++] = data[i + 1];
    rgb[j++] = data[i + 2];
  }

  const ifdCount = 11;
  const extrasStart = 8 + 2 + ifdCount * 12 + 4;
  const bitsPos = extrasStart;
  const resPos = bitsPos + 6;
  const stripPos = resPos + 8;
  const buffer = new ArrayBuffer(stripPos + rgb.length);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, ifdCount, true);

  let p = 10;
  const entry = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(p, tag, true);
    view.setUint16(p + 2, type, true);
    view.setUint32(p + 4, count, true);
    view.setUint32(p + 8, value, true);
    p += 12;
  };

  entry(256, 3, 1, w);
  entry(257, 3, 1, h);
  entry(258, 3, 3, bitsPos);
  entry(259, 3, 1, 1);
  entry(262, 3, 1, 2);
  entry(273, 4, 1, stripPos);
  entry(277, 3, 1, 3);
  entry(278, 3, 1, h);
  entry(279, 4, 1, rgb.length);
  entry(282, 5, 1, resPos);
  entry(283, 5, 1, resPos);
  view.setUint32(p, 0, true);

  view.setUint16(bitsPos, 8, true);
  view.setUint16(bitsPos + 2, 8, true);
  view.setUint16(bitsPos + 4, 8, true);
  view.setUint32(resPos, 72, true);
  view.setUint32(resPos + 4, 1, true);
  u8.set(rgb, stripPos);

  return new Blob([buffer], { type: 'image/tiff' });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildLayoutKml(options: {
  title: string;
  layers: GisLayer[];
  includeOverlayHref?: string;
}): string {
  const enabled = options.layers.filter((l) => l.enabled);
  const folders = enabled
    .map(
      (l) => `  <Folder>
    <name>${escapeXml(l.name)}</name>
    <description>${escapeXml(l.sourceTable)} · ${escapeXml(l.codeName)} · CRS ${escapeXml(l.crs)}</description>
  </Folder>`
    )
    .join('\n');

  const overlay = options.includeOverlayHref
    ? `  <GroundOverlay>
    <name>${escapeXml(options.title)} — sheet preview</name>
    <Icon><href>${escapeXml(options.includeOverlayHref)}</href></Icon>
    <LatLonBox>
      <north>19.92</north><south>12.60</south>
      <east>84.75</east><west>76.75</west>
    </LatLonBox>
  </GroundOverlay>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(options.title)}</name>
  <description>EAGLE Map Layout export · EPSG:4326 · ${enabled.length} layers</description>
${folders}
${overlay}
</Document>
</kml>
`;
}

export async function exportComposedMapSheet(options: {
  formatId: MapExportFormatId;
  sheetEl: HTMLElement;
  title: string;
  layers: GisLayer[];
  context: string;
}): Promise<string> {
  const enabled = options.layers.filter((l) => l.enabled);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `eagle_map_${options.context}_${stamp}`;

  if (options.formatId === 'kml') {
    const kml = buildLayoutKml({ title: options.title, layers: options.layers });
    downloadTextFile(`${base}.kml`, kml, 'application/vnd.google-earth.kml+xml');
    return `${base}.kml (${enabled.length} layers)`;
  }

  const canvas = await captureSheetCanvas(options.sheetEl);

  if (options.formatId === 'jpeg') {
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    downloadBlob(`${base}.jpg`, blob);
    return `${base}.jpg`;
  }

  if (options.formatId === 'tiff') {
    const blob = rgbCanvasToTiffBlob(canvas);
    downloadBlob(`${base}.tif`, blob);
    return `${base}.tif`;
  }

  if (options.formatId === 'img') {
    // Raster exchange: same RGB as JPEG under .img (browser-friendly stand-in for ERDAS IMG)
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    downloadBlob(`${base}.img`, blob);
    return `${base}.img`;
  }

  // KMZ = KML + sheet JPEG overlay
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.9);
  const kml = buildLayoutKml({
    title: options.title,
    layers: options.layers,
    includeOverlayHref: 'files/map_sheet.jpg',
  });
  const zip = new JSZip();
  zip.file('doc.kml', kml);
  zip.folder('files')?.file('map_sheet.jpg', jpeg);
  const kmz = await zip.generateAsync({ type: 'blob' });
  downloadBlob(`${base}.kmz`, kmz);
  return `${base}.kmz`;
}
