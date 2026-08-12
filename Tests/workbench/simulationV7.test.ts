import { describe, expect, it } from 'vitest';
import { createGrid, findPath, gridKey, isWalkable } from '../../Apps/Workbench/src/simulation/navigation';
import { selectCoordinatedCoverSlot, tacticalSlotsConflict } from '../../Apps/Workbench/src/simulation/tacticalPositioning';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from '../../Apps/Workbench/src/simulation/tacticalWizardTestMapV7';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV7';
import type { CoverSlot } from '../../Apps/Workbench/src/simulation/squadTactics';

describe('Tactical Wizard V7 fire-lane deconfliction and compound map', () => {
  it('keeps every authored tactical test point walkable and reachable from the legacy yard', () => {
    expect(tacticalWizardTestMap.width).toBeGreaterThan(48);
    expect(tacticalWizardTestMap.height).toBeGreaterThan(30);
    expect(tacticalWizardTestMap.zones.length).toBeGreaterThanOrEqual(7);
    expect(tacticalWizardTestMap.testPoints.length).toBeGreaterThanOrEqual(6);

    for (const testPoint of tacticalWizardTestMap.testPoints) {
      expect(isWalkable(tacticalWizardNavigationGrid, testPoint.position), testPoint.id).toBe(true);
      expect(findPath(tacticalWizardNavigationGrid, { x: 2, y: 2 }, testPoint.position).length, testPoint.id).toBeGreaterThan(0);
    }
  });

  it('rejects an individually valid cover slot when it crowds or blocks an already-reserved firing lane', () => {
    const grid = createGrid(14, 10, []);
    const threat = { x: 10, y: 5 };
    const reserved: CoverSlot = { id: 'cover:3,5->4,5', position: { x: 3, y: 5 }, peekPosition: { x: 4, y: 5 }, threatDistance: 7 };
    const blocked: CoverSlot = { id: 'cover:5,5->6,5', position: { x: 5, y: 5 }, peekPosition: { x: 6, y: 5 }, threatDistance: 5 };
    const separated: CoverSlot = { id: 'cover:4,2->5,2', position: { x: 4, y: 2 }, peekPosition: { x: 5, y: 2 }, threatDistance: Math.hypot(6, 3) };
    const slots = [reserved, blocked, separated];

    expect(tacticalSlotsConflict(blocked, reserved, threat, 'flank')).toBe(true);
    expect(tacticalSlotsConflict(separated, reserved, threat, 'flank')).toBe(false);
    const selected = selectCoordinatedCoverSlot(grid, slots, { x: 1, y: 2 }, threat, new Set([reserved.id]), 'flank', -1);
    expect(selected?.id).toBe(separated.id);
  });

  it('forms separated crossfire targets instead of assigning adjacent firing positions', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.getState();
    for (let index = 0; index < 260 && state.squad.tactic !== 'crossfire'; index += 1) state = simulation.step();
    expect(state.squad.tactic).toBe('crossfire');

    const shooters = state.agents.filter((agent) => agent.task === 'crossfire');
    expect(shooters).toHaveLength(2);
    expect(shooters.every((agent) => agent.tacticalTarget !== null)).toBe(true);
    const left = shooters[0]!.tacticalTarget!;
    const right = shooters[1]!.tacticalTarget!;
    expect(distance(left, right)).toBeGreaterThanOrEqual(2);
    expect(gridKey({ x: Math.round(left.x), y: Math.round(left.y) })).not.toBe(gridKey({ x: Math.round(right.x), y: Math.round(right.y) }));

    let sawTwoSafeLanes = state.safeFireLanes >= 2;
    for (let frame = 0; frame < 360 && state.squad.alertState === 'active'; frame += 1) {
      state = simulation.advance(1 / 30);
      if (state.safeFireLanes >= 2) sawTwoSafeLanes = true;
      if (state.squad.tactic !== 'crossfire') break;
    }
    expect(sawTwoSafeLanes).toBe(true);
  });

  it('keeps grenade events visible through an explicit flight and effect window', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.getState();
    for (let index = 0; index < 24; index += 1) state = simulation.step();
    expect(simulation.setPlayerPosition({ x: 46, y: 27 })).toBe(true);
    for (let index = 0; index < 80 && state.squad.tactic !== 'sweep'; index += 1) state = simulation.step();
    expect(state.squad.tactic).toBe('sweep');

    let first = state.grenadeEvents[0] ?? null;
    for (let frame = 0; frame < 450 && first === null; frame += 1) {
      state = simulation.advance(1 / 30);
      first = state.grenadeEvents[0] ?? null;
    }
    expect(first).not.toBeNull();
    expect(first!.totalFrames).toBe(72);
    expect(first!.flightFrames).toBe(18);
    expect(first!.remainingFrames).toBeGreaterThan(30);
  });
});

function distance(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
