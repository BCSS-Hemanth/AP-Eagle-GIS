import { describe, expect, it } from 'vitest';
import {
  buildRoadGraph,
  filterFcByCorridor,
  findNetworkRoutes,
  type LonLat,
} from './roadsRoutingGraph';

function line(
  coords: Array<[number, number]>,
  id: string
): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { id },
    geometry: { type: 'LineString', coordinates: coords },
  };
}

describe('roadsRoutingGraph', () => {
  it('filters features to the A–B corridor', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        line(
          [
            [83.0, 18.0],
            [83.2, 18.1],
          ],
          'near'
        ),
        line(
          [
            [78.0, 14.0],
            [78.1, 14.1],
          ],
          'far'
        ),
      ],
    };
    const from: LonLat = { lon: 83.05, lat: 18.02 };
    const to: LonLat = { lon: 83.18, lat: 18.08 };
    const clipped = filterFcByCorridor(fc, from, to, 0.3);
    expect(clipped.features).toHaveLength(1);
    expect(clipped.features[0].properties?.id).toBe('near');
  });

  it('finds multiple alternatives on a combined diamond network', () => {
    // A -- top -- B
    //  \         /
    //   -- bot --
    const top: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        line(
          [
            [80.0, 16.0],
            [80.1, 16.05],
            [80.2, 16.0],
          ],
          'top'
        ),
      ],
    };
    const bot: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        line(
          [
            [80.0, 16.0],
            [80.1, 15.95],
            [80.2, 16.0],
          ],
          'bot'
        ),
      ],
    };
    const graph = buildRoadGraph(
      [
        { layerId: 'lyr-ops-main-roads', fc: top },
        { layerId: 'lyr-ops-internal-roads', fc: bot },
      ],
      { endpointSnapM: 80 }
    );
    const routes = findNetworkRoutes(
      graph,
      { lon: 80.0, lat: 16.0 },
      { lon: 80.2, lat: 16.0 },
      3,
      500
    );
    expect(routes.length).toBeGreaterThanOrEqual(2);
    const layersUsed = new Set(routes.flatMap((r) => r.layerIds));
    expect(layersUsed.has('lyr-ops-main-roads') || layersUsed.has('lyr-ops-internal-roads')).toBe(
      true
    );
  });
});
