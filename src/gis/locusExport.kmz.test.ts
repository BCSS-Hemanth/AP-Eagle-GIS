import { describe, expect, it } from 'vitest';
import { cssHexToKmlColor, resolveLocusExportLayerIds } from './locusExport';

describe('locusExport helpers', () => {
  it('converts CSS hex to KML aabbggrr', () => {
    expect(cssHexToKmlColor('#ba1a1a', 0xff)).toBe('ff1a1aba');
    expect(cssHexToKmlColor('#7c3aed', 0x80).endsWith('ed3a7c')).toBe(true);
  });

  it('resolves export scope for applied vs visible', () => {
    const applied = ['lyr-pss', 'lyr-hotspots', 'lyr-checkposts'];
    const visibility = { 'lyr-pss': true, 'lyr-hotspots': false, 'lyr-checkposts': true };
    expect(
      resolveLocusExportLayerIds({
        appliedLayerIds: applied,
        layerVisibility: visibility,
        scope: 'applied',
      })
    ).toEqual(applied);
    expect(
      resolveLocusExportLayerIds({
        appliedLayerIds: applied,
        layerVisibility: visibility,
        scope: 'visible',
      })
    ).toEqual(['lyr-pss', 'lyr-checkposts']);
  });
});
