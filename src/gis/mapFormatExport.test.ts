import { describe, expect, it } from 'vitest';
import { MAP_EXPORT_FORMATS } from './mapFormatExport';

describe('mapFormatExport', () => {
  it('lists DOCX §7 formats', () => {
    expect(MAP_EXPORT_FORMATS.map((f) => f.id)).toEqual(['jpeg', 'tiff', 'img', 'kmz', 'kml']);
  });
});
