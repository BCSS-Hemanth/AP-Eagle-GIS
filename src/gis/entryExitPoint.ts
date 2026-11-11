/** Classify OPS Entry & Exit KMZ points for hover labels / marker colour. */

export type EntryExitKind = 'entry' | 'exit' | 'both' | 'unknown';

function rawName(props: GeoJSON.GeoJsonProperties): string {
  if (!props || typeof props !== 'object') return '';
  const record = props as Record<string, unknown>;
  for (const key of ['name', 'Name', 'NAME', 'description', 'Description']) {
    const v = record[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

/**
 * Source KMZ uses `name`: "Entry", "Exit", or "Entry/Exit".
 */
export function classifyEntryExit(props: GeoJSON.GeoJsonProperties): EntryExitKind {
  const name = rawName(props).toLowerCase().replace(/\s+/g, ' ');
  if (!name) return 'unknown';

  const hasEntry = /\bentr(?:y|ies)\b/.test(name) || name.includes('entry');
  const hasExit = /\bexits?\b/.test(name);

  if (hasEntry && hasExit) return 'both';
  if (hasEntry) return 'entry';
  if (hasExit) return 'exit';
  return 'unknown';
}

/** Hover label for Dashboard (and other maps that opt in). */
export function entryExitHoverLabel(props: GeoJSON.GeoJsonProperties): string {
  switch (classifyEntryExit(props)) {
    case 'entry':
      return 'Entry Point';
    case 'exit':
      return 'Exit Point';
    case 'both':
      return 'Entry / Exit Point';
    default:
      return 'Entry / Exit Point';
  }
}

export function colorForEntryExitKind(kind: EntryExitKind): string {
  switch (kind) {
    case 'entry':
      return '#0369a1';
    case 'exit':
      return '#c2410c';
    case 'both':
      return '#7c3aed';
    default:
      return '#0369a1';
  }
}
