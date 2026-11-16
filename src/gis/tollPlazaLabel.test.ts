import { describe, expect, it } from 'vitest';
import { tollPlazaHoverLabel } from './tollPlazaLabel';

describe('tollPlazaHoverLabel', () => {
  it('shows only Toll Plaza for generic KMZ route names', () => {
    expect(tollPlazaHoverLabel({ name: 'Route' })).toBe('Toll Plaza');
    expect(tollPlazaHoverLabel({ name: 'route' })).toBe('Toll Plaza');
    expect(tollPlazaHoverLabel({ name: 'NH' })).toBe('Toll Plaza');
  });

  it('prefixes a real name like Check Post style compound labels', () => {
    expect(tollPlazaHoverLabel({ name: 'Vempadu' })).toBe('Toll Plaza - Vempadu');
    expect(tollPlazaHoverLabel({ name: 'NH-16' })).toBe('Toll Plaza - NH-16');
    expect(tollPlazaHoverLabel({ name: 'NH-16-Icp to Kolkata' })).toBe(
      'Toll Plaza - NH-16-Icp to Kolkata'
    );
  });

  it('falls back to Toll Plaza when name is missing', () => {
    expect(tollPlazaHoverLabel({})).toBe('Toll Plaza');
    expect(tollPlazaHoverLabel(null)).toBe('Toll Plaza');
  });
});
