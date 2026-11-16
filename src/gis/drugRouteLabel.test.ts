import { describe, expect, it } from 'vitest';
import { drugRouteHoverLabel } from './drugRouteLabel';

describe('drugRouteHoverLabel', () => {
  it('shows only Drug Route when the KMZ name is Route', () => {
    expect(drugRouteHoverLabel({ name: 'Route' })).toBe('Drug Route');
    expect(drugRouteHoverLabel({ name: 'route' })).toBe('Drug Route');
    expect(drugRouteHoverLabel({ Name: '  Route  ' })).toBe('Drug Route');
  });

  it('prefixes a real name like Check Post style compound labels', () => {
    expect(drugRouteHoverLabel({ name: 'Waddadi' })).toBe('Drug Route - Waddadi');
    expect(drugRouteHoverLabel({ name: 'Konam Check Post' })).toBe(
      'Drug Route - Konam Check Post'
    );
  });

  it('falls back to Drug Route when name is missing', () => {
    expect(drugRouteHoverLabel({})).toBe('Drug Route');
    expect(drugRouteHoverLabel(null)).toBe('Drug Route');
    expect(drugRouteHoverLabel({ folder: 'd-routes / 5 D-Routes' })).toBe('Drug Route');
  });
});
