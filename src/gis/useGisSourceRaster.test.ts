import { describe, expect, it } from 'vitest';
import type { GisRasterOverlay } from './gisSourceCatalog';
import { pickRasterOverlays } from './useGisSourceRaster';

function tile(
  id: string,
  level: number,
  box: { west: number; south: number; east: number; north: number }
): GisRasterOverlay {
  const areaDeg2 = Math.max(0, box.east - box.west) * Math.max(0, box.north - box.south);
  return {
    id,
    name: id,
    url: `/geo/${id}.jpg`,
    level,
    west: box.west,
    south: box.south,
    east: box.east,
    north: box.north,
    rotation: 0,
    areaDeg2,
    sourceKmz: 'test.kmz',
  };
}

const VIEW = { west: 80, south: 16, east: 81, north: 17 };

const OVERLAYS: GisRasterOverlay[] = [
  tile('c1', 0, { west: 79.5, south: 15.5, east: 81.5, north: 17.5 }),
  tile('f1', 1, { west: 80, south: 16, east: 80.5, north: 16.5 }),
  tile('f2', 1, { west: 80.5, south: 16, east: 81, north: 16.5 }),
  tile('f3', 1, { west: 80, south: 16.5, east: 80.5, north: 17 }),
  tile('f4', 1, { west: 80.5, south: 16.5, east: 81, north: 17 }),
];

describe('pickRasterOverlays', () => {
  it('returns preferred LOD only by default', () => {
    const picked = pickRasterOverlays(OVERLAYS, VIEW, 12, 48);
    expect(picked.every((t) => t.level === 1)).toBe(true);
    expect(picked).toHaveLength(4);
  });

  it('stacks one coarser LOD under preferred when requested', () => {
    const picked = pickRasterOverlays(OVERLAYS, VIEW, 12, { stackCoarser: true });
    const levels = new Set(picked.map((t) => t.level));
    expect(levels.has(0)).toBe(true);
    expect(levels.has(1)).toBe(true);
    expect(picked.some((t) => t.id === 'c1')).toBe(true);
    expect(picked.filter((t) => t.level === 1)).toHaveLength(4);
  });
});
