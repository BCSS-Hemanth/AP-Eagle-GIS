import { describe, expect, it } from 'vitest';
import {
  ddacHoverLabel,
  ganjaSeizedHoverLabel,
  opsCategoryHoverLabel,
  pharmaHubHoverLabel,
} from './opsCategoryHoverLabel';

describe('opsCategoryHoverLabel', () => {
  it('prefixes real names and collapses generics', () => {
    expect(opsCategoryHoverLabel('Toll Plaza', { name: 'Vempadu' })).toBe('Toll Plaza - Vempadu');
    expect(opsCategoryHoverLabel('Toll Plaza', { name: 'Route' }, ['Route', 'NH'])).toBe(
      'Toll Plaza'
    );
    expect(opsCategoryHoverLabel('Toll Plaza', {})).toBe('Toll Plaza');
  });
});

describe('ganjaSeizedHoverLabel', () => {
  it('prefixes place names and collapses generic seizure labels', () => {
    expect(ganjaSeizedHoverLabel({ name: 'valasa' })).toBe('Ganja Seized Point - valasa');
    expect(ganjaSeizedHoverLabel({ name: 'PS-Munchingiputtu' })).toBe(
      'Ganja Seized Point - PS-Munchingiputtu'
    );
    expect(ganjaSeizedHoverLabel({ name: 'Ganja Seized' })).toBe('Ganja Seized Point');
    expect(ganjaSeizedHoverLabel({})).toBe('Ganja Seized Point');
  });
});

describe('pharmaHubHoverLabel', () => {
  it('prefixes hub names', () => {
    expect(pharmaHubHoverLabel({ name: 'JNPC-Parawada' })).toBe('Pharma Hub - JNPC-Parawada');
    expect(pharmaHubHoverLabel({ name: 'Pharma companies' })).toBe(
      'Pharma Hub - Pharma companies'
    );
    expect(pharmaHubHoverLabel(null)).toBe('Pharma Hub');
  });
});

describe('ddacHoverLabel', () => {
  it('prefixes DDAC site names', () => {
    expect(ddacHoverLabel({ name: 'GGH. Paderu' })).toBe('DDAC - GGH. Paderu');
    expect(ddacHoverLabel({ name: 'DDAC (SEED)' })).toBe('DDAC - DDAC (SEED)');
    expect(ddacHoverLabel({ name: 'DDAC' })).toBe('DDAC');
  });
});
