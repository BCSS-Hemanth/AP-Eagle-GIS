import { describe, expect, it } from 'vitest';
import { DEFAULT_ATLAS_EXPORT_DECORATIONS } from './atlasExportDecorations';
import { atlasExportLegendItems } from './atlasExportLegend';

describe('Atlas export decorations', () => {
  it('defaults to north arrow + legend only (no scale chrome)', () => {
    expect(DEFAULT_ATLAS_EXPORT_DECORATIONS).toEqual({
      northArrow: true,
      legend: true,
    });
    expect(DEFAULT_ATLAS_EXPORT_DECORATIONS).not.toHaveProperty('scaleBar');
    expect(DEFAULT_ATLAS_EXPORT_DECORATIONS).not.toHaveProperty('ratio');
  });
});

describe('Atlas export legend', () => {
  it('expands classified road layers into coloured road-type lines', () => {
    const items = atlasExportLegendItems(
      new Set(['lyr-ap-roads-major', 'lyr-districts']),
      [
        { layerId: 'lyr-districts', name: 'Districts', category: 'administrative', featureCount: 1 },
        { layerId: 'lyr-ap-roads-major', name: 'AP major roads', category: 'road-network', featureCount: 10 },
      ]
    );
    expect(items.some((i) => i.name === 'Districts' && i.kind === 'poly')).toBe(true);
    expect(items.some((i) => i.name === 'National highway' && i.kind === 'line')).toBe(true);
    expect(items.some((i) => i.name === 'Village road' && i.kind === 'line')).toBe(true);
    expect(items.some((i) => i.name === 'AP major roads')).toBe(false);
  });
});
