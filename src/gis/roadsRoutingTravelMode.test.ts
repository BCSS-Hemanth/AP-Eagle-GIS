import { describe, expect, it } from 'vitest';
import {
  featureEligibleForTravelMode,
  filterFcForTravelMode,
  travelModeSpeedKmh,
} from './roadsRoutingTravelMode';

describe('roadsRoutingTravelMode', () => {
  it('allows NH / metal classes for four and two, not foot', () => {
    const props = { class_key: 'national' };
    expect(featureEligibleForTravelMode('lyr-asr-road-network', props, 'four-wheeler')).toBe(true);
    expect(featureEligibleForTravelMode('lyr-asr-road-network', props, 'two-wheeler')).toBe(true);
    expect(featureEligibleForTravelMode('lyr-asr-road-network', props, 'on-foot')).toBe(false);
  });

  it('allows cart / track for two and foot, not four', () => {
    const props = { folder: 'Roads / Cart Tracks ( Motorble)' };
    expect(featureEligibleForTravelMode('lyr-roads-asr-classified', props, 'four-wheeler')).toBe(
      false
    );
    expect(featureEligibleForTravelMode('lyr-roads-asr-classified', props, 'two-wheeler')).toBe(
      true
    );
    expect(featureEligibleForTravelMode('lyr-roads-asr-classified', props, 'on-foot')).toBe(true);
  });

  it('allows footpath class for on-foot only', () => {
    const props = { class_key: 'path', road_class: 'Footpath' };
    expect(featureEligibleForTravelMode('lyr-asr-road-network', props, 'four-wheeler')).toBe(false);
    expect(featureEligibleForTravelMode('lyr-asr-road-network', props, 'two-wheeler')).toBe(false);
    expect(featureEligibleForTravelMode('lyr-asr-road-network', props, 'on-foot')).toBe(true);
  });

  it('uses layer defaults for unclassed OPS / foot tracks', () => {
    expect(featureEligibleForTravelMode('lyr-ops-main-roads', {}, 'four-wheeler')).toBe(true);
    expect(featureEligibleForTravelMode('lyr-ops-internal-roads', {}, 'four-wheeler')).toBe(false);
    expect(featureEligibleForTravelMode('lyr-ops-internal-roads', {}, 'two-wheeler')).toBe(true);
    expect(featureEligibleForTravelMode('lyr-forest-trails', {}, 'on-foot')).toBe(true);
    expect(featureEligibleForTravelMode('lyr-forest-trails', {}, 'four-wheeler')).toBe(false);
  });

  it('filters FeatureCollections by mode', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { class_key: 'national' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [80, 17],
              [80.1, 17.1],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { class_key: 'path' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [80, 17],
              [80.01, 17.01],
            ],
          },
        },
      ],
    };
    expect(filterFcForTravelMode('lyr-asr-road-network', fc, 'four-wheeler').features).toHaveLength(
      1
    );
    expect(filterFcForTravelMode('lyr-asr-road-network', fc, 'on-foot').features).toHaveLength(1);
    expect(travelModeSpeedKmh('on-foot')).toBe(5);
  });
});
