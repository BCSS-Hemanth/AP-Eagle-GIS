import { describe, expect, it } from 'vitest';
import {
  layerColorOverridesFromConfig,
  normalizeLayerHexColor,
  pickerColorForLayer,
  resolveLayerPaintColor,
} from './layerColor';

describe('layerColor', () => {
  it('normalizes hex colours', () => {
    expect(normalizeLayerHexColor('#AbC')).toBe('#aabbcc');
    expect(normalizeLayerHexColor('#Ff6600')).toBe('#ff6600');
    expect(normalizeLayerHexColor('red')).toBeUndefined();
  });

  it('builds overrides only for saved colours', () => {
    expect(
      layerColorOverridesFromConfig({
        'lyr-highways': { enabled: true, opacity: 100, color: '#EF4444' },
        'lyr-rivers': { enabled: false, opacity: 80 },
      })
    ).toEqual({ 'lyr-highways': '#ef4444' });
  });

  it('resolves paint with fallback when no override', () => {
    expect(resolveLayerPaintColor(undefined, 'lyr-highways', '#111111')).toBe('#111111');
    expect(resolveLayerPaintColor({ 'lyr-highways': '#ef4444' }, 'lyr-highways', '#111111')).toBe(
      '#ef4444'
    );
  });

  it('picker falls back to known defaults', () => {
    expect(pickerColorForLayer('lyr-aob-dists')).toBe('#38bdf8');
    expect(pickerColorForLayer('lyr-aob-dists', '#abcdef')).toBe('#abcdef');
  });
});
