import { describe, expect, it } from 'vitest';
import { stripUnsupportedColorFunctions } from './html2canvasSafe';

describe('html2canvasSafe', () => {
  it('strips oklab / oklch / color-mix so html2canvas can parse CSS', () => {
    const css =
      'color: oklab(0.5 0.1 0.1); background: oklch(60% 0.1 40); border-color: color-mix(in oklab, red, blue);';
    const out = stripUnsupportedColorFunctions(css, 'transparent');
    expect(out).not.toMatch(/oklab|oklch|color-mix/i);
    expect(out).toContain('transparent');
  });
});
