import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  adminNamesEqual,
  applyCurrentMandalSpellings,
  currentMandalSpelling,
} from './adminHierarchy';
import { CURRENT_MANDAL_SPELLING } from './mandalSpellings';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

describe('current mandal spellings', () => {
  it('maps older NWIC/SOI forms to the current official names', () => {
    expect(currentMandalSpelling('Tadpatri')).toBe('Tadipatri');
    expect(currentMandalSpelling('Markapur Mandal')).toBe('Markapuram');
    expect(currentMandalSpelling('Cherukupalle H/O Arumbaka')).toBe('Cherukupalle');
    expect(currentMandalSpelling('Chilakaluripet H/O.Purushotha Patnam')).toBe('Chilakaluripet');
    expect(currentMandalSpelling('Piduguralla')).toBe('Piduguralla');
  });

  it('treats old and current spellings as the same admin name', () => {
    expect(adminNamesEqual('Palacole', 'Palakollu')).toBe(true);
    expect(adminNamesEqual('Savalyapuram H/O Kanamarlapudi', 'Savalyapuram')).toBe(true);
    expect(adminNamesEqual('Anakapalle', 'Anakapalli')).toBe(true);
  });

  it('rewrites mandal_name on loaded features', () => {
    const updated = applyCurrentMandalSpellings({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { mandal_name: 'Zarugumalli', district_name: 'Prakasam' },
          geometry: { type: 'Point', coordinates: [79.8, 15.3] },
        },
      ],
    });
    expect(updated.features[0].properties).toMatchObject({ mandal_name: 'Zarugumilli' });
  });

  it('stores the current spellings on shipped mandal polygons', () => {
    const data = JSON.parse(
      readFileSync(resolve(root, 'public/geo/ap-mandals.geojson'), 'utf8')
    ) as { features: Array<{ properties: { mandal_name?: string } }> };
    const names = new Set(data.features.map((f) => f.properties.mandal_name));
    for (const [from, to] of Object.entries(CURRENT_MANDAL_SPELLING)) {
      expect(names.has(from)).toBe(false);
      expect(names.has(to)).toBe(true);
    }
  });
});
