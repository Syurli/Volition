import { describe, expect, it } from 'vitest';
import { buildFireLaneBlockedCells, findFriendlyInFireLane, lookPoint, makeSearchPattern } from '../../Apps/Workbench/src/simulation/combatCoordination';
import { createGrid, gridKey } from '../../Apps/Workbench/src/simulation/navigation';

describe('combat coordination geometry', () => {
  it('withholds fire when a friendly occupies the shooter-target corridor', () => {
    const members = [
      { id: 'shooter', position: { x: 0, y: 0 } },
      { id: 'friendly', position: { x: 5, y: 0.45 } },
      { id: 'clear', position: { x: 5, y: 2 } },
    ];
    expect(findFriendlyInFireLane('shooter', { x: 0, y: 0 }, { x: 10, y: 0 }, members, 0.85)).toBe('friendly');
    expect(findFriendlyInFireLane('shooter', { x: 0, y: 0 }, { x: 10, y: 0 }, members.filter((member) => member.id !== 'friendly'), 0.85)).toBeNull();
  });

  it('reserves active friendly fire corridors as movement obstacles', () => {
    const grid = createGrid(12, 8, []);
    const blocked = buildFireLaneBlockedCells(grid, [{ ownerId: 'alpha', from: { x: 1, y: 3 }, to: { x: 10, y: 3 }, clearance: 0.85 }], 'bravo');
    expect(blocked.has(gridKey({ x: 5, y: 3 }))).toBe(true);
    expect(blocked.has(gridKey({ x: 5, y: 5 }))).toBe(false);
    expect(buildFireLaneBlockedCells(grid, [{ ownerId: 'bravo', from: { x: 1, y: 3 }, to: { x: 10, y: 3 }, clearance: 0.85 }], 'bravo').size).toBe(0);
  });

  it('builds search sectors away from the LKP and scans multiple directions', () => {
    const grid = createGrid(30, 24, []);
    const lkp = { x: 15, y: 12 };
    const left = makeSearchPattern(grid, lkp, 0, 1);
    const right = makeSearchPattern(grid, lkp, 1, 1);
    expect(left.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(right.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(left.waypoints.every((point) => point.x !== lkp.x || point.y !== lkp.y)).toBe(true);
    expect(new Set([...left.waypoints, ...right.waypoints].map(gridKey)).size).toBeGreaterThanOrEqual(4);
    const looks = left.lookOffsetsDegrees.map((offset) => lookPoint(left.waypoints[0]!, lkp, offset));
    expect(new Set(looks.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)).size).toBeGreaterThanOrEqual(3);
  });
});
