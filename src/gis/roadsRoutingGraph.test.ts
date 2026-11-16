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

  it('keeps intermediate vertices on edges so routes follow road shape (not chords)', () => {
    // Curved line: graph may subsample nodes, but the returned path must keep the bend.
    const bend: LonLat = { lon: 80.05, lat: 16.08 };
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        line(
          [
            [80.0, 16.0],
            [80.02, 16.02],
            [80.04, 16.05],
            [bend.lon, bend.lat],
            [80.08, 16.05],
            [80.1, 16.02],
            [80.12, 16.0],
          ],
          'curve'
        ),
      ],
    };
    const graph = buildRoadGraph([{ layerId: 'lyr-asr-road-network', fc }], {
      maxVerticesPerLine: 3,
      endpointSnapM: 40,
    });
    const routes = findNetworkRoutes(
      graph,
      { lon: 80.0, lat: 16.0 },
      { lon: 80.12, lat: 16.0 },
      1,
      500
    );
    expect(routes.length).toBe(1);
    const hitBend = routes[0].points.some(
      (p) => Math.abs(p.lon - bend.lon) < 1e-6 && Math.abs(p.lat - bend.lat) < 1e-6
    );
    expect(hitBend).toBe(true);
    // Path should have more than the two endpoints (full polyline shape).
    expect(routes[0].points.length).toBeGreaterThan(3);
  });

  it('snaps pins onto edge geometry for any layer id (future layers included)', () => {
    // Long straight segment; pin sits mid-edge, not on a graph node.
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        line(
          [
            [81.0, 17.0],
            [81.05, 17.0],
            [81.1, 17.0],
            [81.15, 17.0],
            [81.2, 17.0],
          ],
          'future-layer-road'
        ),
      ],
    };
    const graph = buildRoadGraph([{ layerId: 'lyr-future-any-road', fc }], {
      maxVerticesPerLine: 2,
      endpointSnapM: 30,
    });
    const routes = findNetworkRoutes(
      graph,
      { lon: 81.07, lat: 17.0002 },
      { lon: 81.18, lat: 16.9998 },
      1,
      500
    );
    expect(routes.length).toBe(1);
    // Route should travel along the line (lat ≈ 17), not a long north/south chord.
    const offLine = routes[0].points.filter((p) => Math.abs(p.lat - 17) > 0.002);
    expect(offLine.length).toBeLessThanOrEqual(2); // allow tiny pin connectors only
  });

  it('soft-joins a T-junction endpoint onto a nearby mid-line vertex', () => {
    // Horizontal spine; spur ends ~40 m north of mid-point (no shared vertex).
    const spine: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        line(
          [
            [80.0, 16.0],
            [80.1, 16.0],
            [80.2, 16.0],
          ],
          'spine'
        ),
      ],
    };
    const spur: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        line(
          [
            [80.1, 16.05],
            [80.1, 16.0004],
          ],
          'spur'
        ),
      ],
    };
    const graph = buildRoadGraph(
      [
        { layerId: 'lyr-roads-asr-classified', fc: spine },
        { layerId: 'lyr-forest-trails', fc: spur },
      ],
      { endpointSnapM: 120 }
    );
    const routes = findNetworkRoutes(
      graph,
      { lon: 80.1, lat: 16.05 },
      { lon: 80.2, lat: 16.0 },
      2,
      500
    );
    expect(routes.length).toBeGreaterThanOrEqual(1);
  });
});
