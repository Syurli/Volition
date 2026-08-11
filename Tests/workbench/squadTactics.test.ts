import { describe, expect, it } from 'vitest';
import { createGrid, hasLineOfSight } from '../../Apps/Workbench/src/simulation/navigation';
import { discoverCoverSlots, occupiedPositionsAreUnique, selectCoverSlot } from '../../Apps/Workbench/src/simulation/squadTactics';

describe('Workbench squad tactics reference host', () => {
  it('discovers cover with a hidden hold cell and exposed peek cell', () => {
    const grid = createGrid(10, 8, [{ x: 5, y: 4 }]);
    const threat = { x: 8, y: 4 };
    const slots = discoverCoverSlots(grid, threat, 1, 10);
    expect(slots.length).toBeGreaterThan(0);
    const slot = selectCoverSlot(grid, slots, { x: 2, y: 4 }, threat, new Set(), 'advance');
    expect(slot).not.toBeNull();
    expect(hasLineOfSight(grid, slot!.position, threat)).toBe(false);
    expect(hasLineOfSight(grid, slot!.peekPosition, threat)).toBe(true);
  });

  it('respects cover reservations and exposes the no-overlap invariant helper', () => {
    const grid = createGrid(10, 8, [{ x: 5, y: 4 }]);
    const threat = { x: 8, y: 4 };
    const slots = discoverCoverSlots(grid, threat, 1, 10);
    const first = selectCoverSlot(grid, slots, { x: 2, y: 4 }, threat, new Set(), 'support');
    expect(first).not.toBeNull();
    const second = selectCoverSlot(grid, slots, { x: 2, y: 5 }, threat, new Set([first!.id]), 'support');
    expect(second?.id).not.toBe(first!.id);
    expect(occupiedPositionsAreUnique([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }])).toBe(true);
    expect(occupiedPositionsAreUnique([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toBe(false);
  });
});
