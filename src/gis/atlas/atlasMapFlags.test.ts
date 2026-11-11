import { describe, expect, it } from 'vitest';
import { atlasLeafletFlags, atlasVisibleAppliedIds } from './atlasMapFlags';

describe('atlasMapFlags', () => {
  it('honours Eye-off while keeping applied selection separate', () => {
    const visible = atlasVisibleAppliedIds(
      ['lyr-hotspots', 'lyr-pss'],
      { 'lyr-hotspots': true, 'lyr-pss': false }
    );
    expect(visible.has('lyr-hotspots')).toBe(true);
    expect(visible.has('lyr-pss')).toBe(false);
    const flags = atlasLeafletFlags(visible);
    expect(flags.showHotspots).toBe(true);
    expect(flags.showPoliceStations).toBe(false);
  });
});
