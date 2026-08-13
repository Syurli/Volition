import { describe, expect, it } from 'vitest';
import { createGrid, gridKey } from '../../Apps/Workbench/src/simulation/navigation';
import {
  buildDirectionalSearchWaypoints,
  classifyContactTarget,
  deriveEgressDirection,
} from '../../Apps/Workbench/src/simulation/contactMemory';

describe('V15 contact-memory primitives', () => {
  it('derives a normalized egress direction only from confirmed movement samples', () => {
    expect(deriveEgressDirection({ x: 10, y: 10 }, { x: 13, y: 14 })).toEqual({ x: 0.6, y: 0.8 });
    expect(deriveEgressDirection({ x: 10, y: 10 }, { x: 10.1, y: 10.1 })).toBeNull();
  });

  it('revokes direct-fire semantics once a last-known point is stale or verified empty', () => {
    const common = {
      target: { x: 12, y: 8 },
      currentTick: 20,
      lastConfirmedTick: 17,
      lastConfirmedPosition: { x: 12, y: 8 },
      confirmedVisiblePosition: null,
      coarseFireSector: null,
      searchFrontier: [],
      freshLkpTicks: 6,
    } as const;
    expect(classifyContactTarget({ ...common, lkpCleared: false })).toBe('fresh_lkp');
    expect(classifyContactTarget({ ...common, currentTick: 30, lkpCleared: false })).toBe('stale_lkp');
    expect(classifyContactTarget({ ...common, lkpCleared: true })).toBe('cleared_lkp');
  });

  it('builds separated forward-biased search lanes and preserves cleared nodes', () => {
    const grid = createGrid(24, 24, []);
    const lkp = { x: 8, y: 8 };
    const direction = { x: 1, y: 0 };
    const lead = buildDirectionalSearchWaypoints(grid, lkp, direction, 0, new Set());
    const cover = buildDirectionalSearchWaypoints(grid, lkp, direction, 1, new Set());
    expect(lead.length).toBeGreaterThanOrEqual(3);
    expect(cover.length).toBeGreaterThanOrEqual(3);
    expect(lead.every((point) => point.x > lkp.x)).toBe(true);
    expect(cover.every((point) => point.x > lkp.x)).toBe(true);
    expect(new Set(lead.map(gridKey))).not.toEqual(new Set(cover.map(gridKey)));

    const cleared = new Set([gridKey(lead[0]!)]);
    const replanned = buildDirectionalSearchWaypoints(grid, lkp, direction, 0, cleared);
    expect(replanned.map(gridKey)).not.toContain(gridKey(lead[0]!));
  });
});
