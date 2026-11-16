import { describe, expect, it } from 'vitest';
import {
  opsDrugRouteLineWeightForZoom,
  opsDrugRoutePointRadiusForZoom,
  opsHotspotRadiusForZoom,
} from './opsPointZoom';

describe('ops point zoom sizing', () => {
  it('grows hotspot radius with zoom', () => {
    expect(opsHotspotRadiusForZoom(5)).toBeLessThan(opsHotspotRadiusForZoom(9));
    expect(opsHotspotRadiusForZoom(9)).toBeLessThan(opsHotspotRadiusForZoom(13));
    expect(opsHotspotRadiusForZoom(15)).toBeGreaterThan(6);
  });

  it('grows drug-route pin radius and line weight with zoom', () => {
    expect(opsDrugRoutePointRadiusForZoom(5)).toBeLessThan(opsDrugRoutePointRadiusForZoom(11));
    expect(opsDrugRouteLineWeightForZoom(5)).toBeLessThan(opsDrugRouteLineWeightForZoom(12));
  });
});
