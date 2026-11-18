import { describe, expect, it } from 'vitest';
import {
  featureEligibleForTravelMode,
  filterFcForTravelMode,
  layerEligibleForTravelMode,
  ROUTING_TRAVEL_MODE_LAYER_IDS,
  travelModeSpeedKmh,
} from './roadsRoutingTravelMode';

describe('roadsRoutingTravelMode', () => {
  it('configures Four-Wheeler with the four specified Road Network layers', () => {
    expect([...ROUTING_TRAVEL_MODE_LAYER_IDS['four-wheeler']].sort()).toEqual(
      [
        'lyr-ap-roads-major',
        'lyr-highways',
        'lyr-ops-main-roads',
        'lyr-roads-asr-classified',
      ].sort()
    );
    expect(layerEligibleForTravelMode('lyr-ops-main-roads', 'four-wheeler')).toBe(true);
    expect(layerEligibleForTravelMode('lyr-ops-internal-roads', 'four-wheeler')).toBe(false);
    expect(layerEligibleForTravelMode('lyr-forest-trails', 'four-wheeler')).toBe(false);
    expect(layerEligibleForTravelMode('lyr-ap-roads-full', 'four-wheeler')).toBe(false);
  });

  it('configures Two-Wheeler with the nine specified Road Network layers', () => {
    expect([...ROUTING_TRAVEL_MODE_LAYER_IDS['two-wheeler']].sort()).toEqual(
      [
        'lyr-ap-roads-full',
        'lyr-ap-roads-major',
        'lyr-asr-road-network',
        'lyr-ganja-transport-routes',
        'lyr-highways',
        'lyr-ops-internal-roads',
        'lyr-ops-main-roads',
        'lyr-roads-asr-classified',
        'lyr-route-modeling',
      ].sort()
    );
    expect(layerEligibleForTravelMode('lyr-ganja-transport-routes', 'two-wheeler')).toBe(true);
    expect(layerEligibleForTravelMode('lyr-forest-trails', 'two-wheeler')).toBe(false);
  });

  it('configures On Foot with Foot Tracks only', () => {
    expect([...ROUTING_TRAVEL_MODE_LAYER_IDS['on-foot']]).toEqual(['lyr-forest-trails']);
    expect(layerEligibleForTravelMode('lyr-forest-trails', 'on-foot')).toBe(true);
    expect(layerEligibleForTravelMode('lyr-highways', 'on-foot')).toBe(false);
    expect(layerEligibleForTravelMode('lyr-ops-main-roads', 'on-foot')).toBe(false);
  });

  it('includes whole allowed layers regardless of road-class attributes', () => {
    expect(
      featureEligibleForTravelMode(
        'lyr-roads-asr-classified',
        { folder: 'Roads / Cart Tracks ( Motorble)' },
        'four-wheeler'
      )
    ).toBe(true);
    expect(
      featureEligibleForTravelMode(
        'lyr-asr-road-network',
        { class_key: 'path', road_class: 'Footpath' },
        'two-wheeler'
      )
    ).toBe(true);
    expect(
      featureEligibleForTravelMode(
        'lyr-asr-road-network',
        { class_key: 'national' },
        'four-wheeler'
      )
    ).toBe(false);
  });

  it('filters FeatureCollections by mode layer allowlist', () => {
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
    expect(filterFcForTravelMode('lyr-highways', fc, 'four-wheeler').features).toHaveLength(2);
    expect(filterFcForTravelMode('lyr-asr-road-network', fc, 'four-wheeler').features).toHaveLength(
      0
    );
    expect(filterFcForTravelMode('lyr-forest-trails', fc, 'on-foot').features).toHaveLength(2);
    expect(filterFcForTravelMode('lyr-highways', fc, 'on-foot').features).toHaveLength(0);
    expect(travelModeSpeedKmh('on-foot')).toBe(5);
  });
});
