/**
 * QGIS analog: OGR XLSX / ODS drivers. Workbooks are ZIP packages; we extract the
 * first sheet to a delimited table and reuse QgsDelimitedText-style lat/lon detection.
 */
import JSZip from 'jszip';
import { parseDelimitedText } from './delimitedText';
import { decodeText } from './geometry';

function xmlLocal(name: string): string {
  return name.replace(/^.*:/, '').toLowerCase();
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'text/xml');
}

function cellRefToIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

export async function parseXlsx(bytes: Uint8Array): Promise<GeoJSON.FeatureCollection> {
  const zip = await JSZip.loadAsync(bytes);
  const shared = zip.file('xl/sharedStrings.xml');
  const strings: string[] = [];
  if (shared) {
    const xml = parseXml(await shared.async('text'));
    for (const si of Array.from(xml.getElementsByTagName('*'))) {
      if (xmlLocal(si.nodeName) === 'si') strings.push((si.textContent ?? '').trim());
    }
  }
  const sheetFile =
    zip.file('xl/worksheets/sheet1.xml') ??
    Object.values(zip.files).find((f) => /xl\/worksheets\/sheet\d+\.xml$/i.test(f.name));
  if (!sheetFile) throw new Error('XLSX has no worksheet');
  const sheet = parseXml(await sheetFile.async('text'));
  const rows: string[][] = [];
  for (const row of Array.from(sheet.getElementsByTagName('*'))) {
    if (xmlLocal(row.nodeName) !== 'row') continue;
    const cells: string[] = [];
    for (const cell of Array.from(row.children)) {
      if (xmlLocal(cell.nodeName) !== 'c') continue;
      const ref = cell.getAttribute('r') ?? '';
      const idx = cellRefToIndex(ref);
      const type = cell.getAttribute('t');
      let value = '';
      for (const child of Array.from(cell.getElementsByTagName('*'))) {
        if (xmlLocal(child.nodeName) === 'v' || xmlLocal(child.nodeName) === 't') {
          value = (child.textContent ?? '').trim();
          break;
        }
      }
      if (type === 's') value = strings[Number(value)] ?? value;
      cells[idx] = value;
    }
    rows.push(cells.map((c) => c ?? ''));
  }
  const csv = rows.map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  return parseDelimitedText(csv);
}

export async function parseOds(bytes: Uint8Array): Promise<GeoJSON.FeatureCollection> {
  const zip = await JSZip.loadAsync(bytes);
  const contentFile = zip.file('content.xml');
  if (!contentFile) throw new Error('ODS missing content.xml');
  const xml = parseXml(await contentFile.async('text'));
  const rows: string[][] = [];
  for (const row of Array.from(xml.getElementsByTagName('*'))) {
    if (xmlLocal(row.nodeName) !== 'table-row') continue;
    const cells: string[] = [];
    for (const cell of Array.from(row.children)) {
      if (xmlLocal(cell.nodeName) !== 'table-cell') continue;
      const repeat = Number(cell.getAttribute('table:number-columns-repeated') ?? '1');
      const value = (cell.textContent ?? '').trim();
      for (let i = 0; i < Math.min(repeat, 32); i += 1) cells.push(value);
    }
    if (cells.some((c) => c)) rows.push(cells);
  }
  const csv = rows.map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  return parseDelimitedText(csv);
}

export function parseCsvBytes(bytes: Uint8Array, sourceCrs = 'EPSG:4326'): GeoJSON.FeatureCollection {
  return parseDelimitedText(decodeText(bytes), sourceCrs);
}
