/**
 * QGIS analog: QgsGdalProvider (src/core/providers/gdal/qgsgdalprovider.cpp).
 * GeoTIFF via geotiff.js; ESRI ASCII Grid, SRTM HGT, and world-file images parsed natively.
 */
import { fromArrayBuffer } from 'geotiff';
import { toLonLat } from './crs';
import type { IngestedRaster } from './types';

export function parseWorldFile(text: string, width: number, height: number): {
  bounds: [[number, number], [number, number]];
} {
  const nums = text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((n) => Number.isFinite(n));
  if (nums.length < 6) throw new Error('World file needs 6 affine coefficients');
  const [a, d, b, e, c, f] = nums;
  const west = c - a / 2 - b / 2;
  const north = f - d / 2 - e / 2;
  const east = west + a * width + b * height;
  const south = north + d * width + e * height;
  return {
    bounds: [
      [Math.min(south, north), Math.min(west, east)],
      [Math.max(south, north), Math.max(west, east)],
    ],
  };
}

export function parseAsciiGrid(text: string, sourceCrs = 'EPSG:4326'): IngestedRaster {
  const lines = text.replace(/\r/g, '\n').split('\n').filter((line) => line.trim());
  const header: Record<string, number> = {};
  let dataStart = 0;
  for (let i = 0; i < Math.min(10, lines.length); i += 1) {
    const match = lines[i].trim().match(/^([A-Za-z_]+)\s+(.+)$/);
    if (!match) {
      dataStart = i;
      break;
    }
    header[match[1].toLowerCase()] = Number(match[2]);
    dataStart = i + 1;
  }
  const ncols = header.ncols;
  const nrows = header.nrows;
  const cell = header.cellsize;
  if (!ncols || !nrows || !cell) throw new Error('ASCII Grid header missing ncols/nrows/cellsize');
  const west = header.xllcorner ?? (header.xllcenter ?? 0) - cell / 2;
  const south = header.yllcorner ?? (header.yllcenter ?? 0) - cell / 2;
  const nodata = header.nodata_value ?? -9999;
  const values: number[] = [];
  for (let i = dataStart; i < lines.length; i += 1) {
    for (const token of lines[i].trim().split(/\s+/)) {
      if (token) values.push(Number(token));
    }
  }
  const east = west + ncols * cell;
  const north = south + nrows * cell;
  const sw = toLonLat(west, south, sourceCrs);
  const ne = toLonLat(east, north, sourceCrs);
  const bounds: IngestedRaster['bounds'] = [
    [Math.min(sw[1], ne[1]), Math.min(sw[0], ne[0])],
    [Math.max(sw[1], ne[1]), Math.max(sw[0], ne[0])],
  ];
  let dataUrl = '';
  try {
    const canvas = rasterCanvas(ncols, nrows, (x, y) => values[y * ncols + x] ?? nodata, nodata);
    dataUrl = canvas.toDataURL('image/png');
  } catch {
    dataUrl = '';
  }
  return { dataUrl, bounds, width: ncols, height: nrows };
}

export function parseSrtmHgt(bytes: Uint8Array, fileName: string): IngestedRaster {
  const match = fileName.toUpperCase().match(/([NS])(\d{2})([EW])(\d{3})/);
  if (!match) throw new Error('SRTM HGT file name must look like N18E082.hgt');
  const lat0 = (match[1] === 'N' ? 1 : -1) * Number(match[2]);
  const lon0 = (match[3] === 'E' ? 1 : -1) * Number(match[4]);
  const samples = Math.round(Math.sqrt(bytes.byteLength / 2));
  if (samples !== 1201 && samples !== 3601) {
    throw new Error(`Unexpected SRTM size ${bytes.byteLength} (${samples}²)`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const canvas = rasterCanvas(samples, samples, (x, y) => view.getInt16((y * samples + x) * 2, false), -32768);
  return {
    dataUrl: canvas.toDataURL('image/png'),
    bounds: [
      [lat0, lon0],
      [lat0 + 1, lon0 + 1],
    ],
    width: samples,
    height: samples,
  };
}

function rasterCanvas(
  width: number,
  height: number,
  valueAt: (x: number, y: number) => number,
  nodata: number
): HTMLCanvasElement {
  const max = 1024;
  const scale = Math.min(1, max / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable for raster ingest');
  const image = ctx.createImageData(w, h);
  let min = Infinity;
  let maxv = -Infinity;
  const sampled: number[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const sy = Math.min(height - 1, Math.floor(y / scale));
      const v = valueAt(sx, sy);
      sampled.push(v);
      if (v !== nodata && Number.isFinite(v)) {
        min = Math.min(min, v);
        maxv = Math.max(maxv, v);
      }
    }
  }
  const range = maxv - min || 1;
  sampled.forEach((v, i) => {
    const off = i * 4;
    if (v === nodata || !Number.isFinite(v)) {
      image.data[off + 3] = 0;
      return;
    }
    const t = (v - min) / range;
    const shade = Math.round(255 * t);
    image.data[off] = shade;
    image.data[off + 1] = shade;
    image.data[off + 2] = shade;
    image.data[off + 3] = 220;
  });
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error('Raster preview needs a canvas (browser) environment');
}

export async function parseGeoTiff(bytes: Uint8Array, sourceCrs = 'EPSG:4326'): Promise<IngestedRaster> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const tiff = await fromArrayBuffer(copy.buffer);
  const image = await tiff.getImage();
  const bbox = image.getBoundingBox();
  const width = image.getWidth();
  const height = image.getHeight();
  const maxEdge = 1024;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  const rasters = (await image.readRasters({
    width: outW,
    height: outH,
    resampleMethod: 'nearest',
    interleave: false,
  })) as unknown as ArrayLike<ArrayLike<number>>;
  const band0 = rasters[0];
  const band1 = rasters[1] ?? band0;
  const band2 = rasters[2] ?? band0;
  const canvas = createCanvas(outW, outH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable for GeoTIFF');
  const imageData = ctx.createImageData(outW, outH);
  for (let i = 0; i < outW * outH; i += 1) {
    const off = i * 4;
    imageData.data[off] = Number(band0[i] ?? 0);
    imageData.data[off + 1] = Number(band1[i] ?? 0);
    imageData.data[off + 2] = Number(band2[i] ?? 0);
    imageData.data[off + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  const sw = toLonLat(bbox[0], bbox[1], sourceCrs);
  const ne = toLonLat(bbox[2], bbox[3], sourceCrs);
  return {
    dataUrl: canvas.toDataURL('image/png'),
    bounds: [
      [Math.min(sw[1], ne[1]), Math.min(sw[0], ne[0])],
      [Math.max(sw[1], ne[1]), Math.max(sw[0], ne[0])],
    ],
    width: outW,
    height: outH,
  };
}

export async function rasterFromImageWithWorldFile(
  imageBytes: Uint8Array,
  worldText: string,
  mime: string
): Promise<IngestedRaster> {
  const blob = new Blob([imageBytes as BlobPart], { type: mime });
  const bitmap = await createImageBitmap(blob);
  const { bounds } = parseWorldFile(worldText, bitmap.width, bitmap.height);
  const canvas = createCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable for world-file image');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return {
    dataUrl: canvas.toDataURL('image/png'),
    bounds,
    width: canvas.width,
    height: canvas.height,
  };
}
