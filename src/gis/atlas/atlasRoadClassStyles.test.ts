import { describe, expect, it } from 'vitest';
import {
  atlasRoadHoverLabel,
  atlasRoadPathStyle,
  classifyAtlasRoadProperties,
} from './atlasRoadClassStyles';

describe('Atlas road class styles', () => {
  it('uses class_key / road_class when present', () => {
    expect(
      classifyAtlasRoadProperties({ class_key: 'national', road_class: 'National highway' }).color
    ).toBe('#ff2b2b');
    expect(classifyAtlasRoadProperties({ class_key: 'village' }).label).toMatch(/Village/i);
    expect(classifyAtlasRoadProperties({ class_key: 'major' }).color).toBe('#ffe01a');
  });

  it('infers KMZ folder classes for ASR classified roads', () => {
    expect(
      classifyAtlasRoadProperties({ folder: 'Roads / Cart Tracks ( Motorble)' }).key
    ).toBe('track');
    expect(
      classifyAtlasRoadProperties({ folder: 'Roads / Foot Tracks / tracks' }).key
    ).toBe('path');
    expect(
      classifyAtlasRoadProperties({ folder: 'Roads / Main Roads (BT- NH-SH)' }).key
    ).toBe('national');
  });

  it('reads PostGIS rd_sub_typ and builds hover labels', () => {
    expect(classifyAtlasRoadProperties({ rd_sub_typ: 'State Highway' }).key).toBe('state');
    expect(atlasRoadPathStyle({ class_key: 'other' }).weight).toBeGreaterThan(1);
    expect(atlasRoadHoverLabel({ class_key: 'village', name: 'Balusupadu Rd' })).toContain(
      'Village'
    );
    expect(atlasRoadHoverLabel({ class_key: 'village', name: 'Balusupadu Rd' })).toContain(
      'Balusupadu'
    );
  });
});
