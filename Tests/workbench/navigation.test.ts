import { describe, expect, it } from 'vitest';
import { createGrid, findPath, gridKey, hasLineOfSight } from '../../Apps/Workbench/src/simulation/navigation';

describe('Workbench grid navigation', () => {
  it('finds a deterministic A* path around blocked cells', () => {
    const grid = createGrid(6, 5, [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }]);
    const first = findPath(grid, { x: 0, y: 1 }, { x: 5, y: 1 });
    const second = findPath(grid, { x: 0, y: 1 }, { x: 5, y: 1 });
    expect(first).toEqual(second);
    expect(first[0]).toEqual({ x: 0, y: 1 });
    expect(first.at(-1)).toEqual({ x: 5, y: 1 });
    expect(first.some((cell) => cell.x === 2 && cell.y < 4)).toBe(false);
  });

  it('routes around transient squad occupancy instead of retrying the same blocked next cell forever', () => {
    const grid = createGrid(7, 5, []);
    const transient = new Set([gridKey({ x: 2, y: 2 })]);
    const path = findPath(grid, { x: 1, y: 2 }, { x: 5, y: 2 }, transient);
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((cell) => cell.x === 2 && cell.y === 2)).toBe(false);
    expect(path.at(-1)).toEqual({ x: 5, y: 2 });
  });

  it('reports LOS blocked by map geometry', () => {
    const grid = createGrid(8, 5, [{ x: 3, y: 2 }]);
    expect(hasLineOfSight(grid, { x: 1, y: 2 }, { x: 6, y: 2 })).toBe(false);
    expect(hasLineOfSight(grid, { x: 1, y: 1 }, { x: 6, y: 1 })).toBe(true);
  });
});
