import { describe, expect, it } from 'vitest';
import type { GridPoint } from '../../Apps/Workbench/src/simulation/navigation';
import { isWalkable } from '../../Apps/Workbench/src/simulation/navigation';
import { tacticalWizardNavigationGrid } from '../../Apps/Workbench/src/simulation/tacticalWizardTestMapV7';
import {
  TacticalWizardSimulation,
  acousticResponderCount,
  activeAttentionHalfFov,
  selectAcousticObservationPoint,
  shouldAccelerateLostContactSearch,
} from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationPerceptionIntegrated';
import { searchResupplyMayDetach } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationExecutionIntegrated';

describe('Tactical Wizard perception / investigation integration', () => {
  it('turns rifle-shot hearing into a bounded movement investigation instead of cognition-only investigate', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 10, y: 19 })).toBe(true);

    simulation.playerFireAt({ x: 20, y: 19 });
    simulation.advance(0.25);

    let state = simulation.getState();
    expect(state.acousticAwareness.visionRange).toBe(20);
    expect(state.perceptionIntegration.acousticInvestigationActive).toBe(true);
    expect(state.perceptionIntegration.acousticShots).toBe(1);
    expect(state.perceptionIntegration.responderIds).toHaveLength(1);

    const runtime = simulation as unknown as RuntimeAccess;
    const responder = runtime.members.find((member) => member.id === state.perceptionIntegration.responderIds[0])!;
    const proposal = runtime.movementTarget(responder);
    expect(proposal).not.toBeNull();
    expect(distance(proposal!, state.perceptionIntegration.acousticInvestigationTarget!)).toBeLessThanOrEqual(8.5);

    simulation.playerFireAt({ x: 20, y: 19 });
    simulation.advance(0.25);
    state = simulation.getState();
    expect(state.perceptionIntegration.acousticShots).toBeGreaterThanOrEqual(2);
    expect(state.perceptionIntegration.responderIds).toHaveLength(2);
  });

  it('uses short-range active attention instead of globally widening the normal combat cone', () => {
    expect(activeAttentionHalfFov(7.5)).toBe(105);
    expect(activeAttentionHalfFov(10)).toBe(85);
    expect(activeAttentionHalfFov(12)).toBe(85);
    expect(activeAttentionHalfFov(12.1)).toBeNull();
  });

  it('accelerates close lost-contact search after three decision ticks but not for distant contact', () => {
    expect(shouldAccelerateLostContactSearch(2, 8)).toBe(false);
    expect(shouldAccelerateLostContactSearch(3, 8)).toBe(true);
    expect(shouldAccelerateLostContactSearch(3, 20)).toBe(true);
    expect(shouldAccelerateLostContactSearch(3, 20.1)).toBe(false);
  });

  it('chooses a walkable observation point around acoustic uncertainty instead of walking onto the sound coordinate', () => {
    const acoustic = { x: 38, y: 37 };
    const point = selectAcousticObservationPoint({ x: 38, y: 31 }, acoustic, 0);
    expect(isWalkable(tacticalWizardNavigationGrid, point)).toBe(true);
    expect(distance(point, acoustic)).toBeGreaterThanOrEqual(3);
    expect(distance(point, acoustic)).toBeLessThanOrEqual(8.5);
  });

  it('scales a gunshot episode from one investigator to a two-member response', () => {
    expect(acousticResponderCount(1)).toBe(1);
    expect(acousticResponderCount(2)).toBe(2);
    expect(acousticResponderCount(8)).toBe(2);
  });

  it('lets a dry search element escape logistics starvation without detaching armed searchers', () => {
    const mixed = [
      { id: 'alpha', alive: true, ammoRounds: 0 },
      { id: 'bravo', alive: true, ammoRounds: 15 },
      { id: 'charlie', alive: true, ammoRounds: 12 },
    ];
    expect(searchResupplyMayDetach('alpha', mixed)).toBe(true);
    expect(searchResupplyMayDetach('bravo', mixed)).toBe(false);

    const allDry = [
      { id: 'alpha', alive: true, ammoRounds: 0 },
      { id: 'bravo', alive: true, ammoRounds: 0 },
      { id: 'charlie', alive: true, ammoRounds: 0 },
    ];
    expect(searchResupplyMayDetach('alpha', allDry)).toBe(true);
    expect(searchResupplyMayDetach('bravo', allDry)).toBe(false);
    expect(searchResupplyMayDetach('charlie', allDry)).toBe(false);
  });
});

interface RuntimeMember {
  readonly id: string;
  position: GridPoint;
}

interface RuntimeAccess {
  members: RuntimeMember[];
  movementTarget: (member: RuntimeMember) => GridPoint | null;
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
