import { describe, expect, it } from 'vitest';
import { createGrid, hasLineOfSight } from '../../Apps/Workbench/src/simulation/navigation';
import { selectRecoveryGeometry } from '../../Apps/Workbench/src/simulation/recoverySafety';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulation';

describe('world-consistent fire and recovery geometry', () => {
  it('stops player rifle damage at hard world geometry', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 14, y: 6 })).toBe(true);
    const before = simulation.getState().agents.find((agent) => agent.id === 'twr:rifle-squad:alpha')!;
    expect(simulation.playerFireAt({ x: 2, y: 2 })).toBe(true);
    const after = simulation.getState();
    expect(after.agents.find((agent) => agent.id === before.id)?.health).toBe(before.health);
    expect(after.playerCombat.shotBlockedByWorld).toBe(true);
    expect(after.runLog.some((entry) => entry.event === 'fire' && entry.actorId === 'player' && entry.data.blockedByWorld === true)).toBe(true);
  });

  it('still damages the first agent on an unobstructed rifle trace', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 2, y: 10 })).toBe(true);
    const before = simulation.getState().agents.find((agent) => agent.id === 'twr:rifle-squad:bravo')!.health;
    expect(simulation.playerFireAt({ x: 2, y: 4 })).toBe(true);
    const after = simulation.getState();
    expect(after.agents.find((agent) => agent.id === 'twr:rifle-squad:bravo')!.health).toBeLessThan(before);
    expect(after.playerCombat.shotBlockedByWorld).toBe(false);
  });

  it('prefers a covered treatment side and scores exposed approach cells', () => {
    const wall = Array.from({ length: 9 }, (_, y) => ({ x: 5, y }));
    const grid = createGrid(12, 12, wall);
    const solution = selectRecoveryGeometry({
      grid,
      casualty: { x: 4, y: 5 },
      rescuer: { x: 2, y: 5 },
      security: null,
      threat: { x: 8, y: 5 },
      failedTreatmentCells: new Set(),
      failedSecurityCells: new Set(),
    });
    expect(solution).not.toBeNull();
    expect(solution!.treatmentExposed).toBe(false);
    expect(hasLineOfSight(grid, solution!.treatmentPoint, { x: 8, y: 5 })).toBe(false);
    expect(Math.hypot(solution!.treatmentPoint.x - 4, solution!.treatmentPoint.y - 5)).toBeLessThanOrEqual(1.45);
  });

  it('creates a distinct treatment position and freezes normal maneuver doctrine during rescue', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 6, y: 2 })).toBe(true);
    for (let index = 0; index < 4; index += 1) simulation.step();
    expect(simulation.setAgentVitals('twr:rifle-squad:alpha', { health: 0 })).toBe(true);
    let state = simulation.getState();
    expect(state.recovery.phase).not.toBe('none');
    expect(state.dynamicRecovery.treatmentPoint).not.toBeNull();
    const patient = state.agents.find((agent) => agent.id === 'twr:rifle-squad:alpha')!;
    expect(Math.hypot(state.dynamicRecovery.treatmentPoint!.x - patient.position.x, state.dynamicRecovery.treatmentPoint!.y - patient.position.y)).toBeGreaterThan(0.5);
    expect(state.dynamicRecovery.tacticalPlanningSuspended).toBe(true);
    const tactic = state.squad.tactic;
    const tacticTicks = state.squad.tacticTicks;
    for (let index = 0; index < 2; index += 1) simulation.step();
    state = simulation.getState();
    expect(state.recovery.phase).not.toBe('none');
    expect(state.squad.tactic).toBe(tactic);
    expect(state.squad.tacticTicks).toBeLessThanOrEqual(tacticTicks + 1);
    expect([state.squad.suppressorId, state.squad.moverId, state.squad.observerId]).not.toContain('twr:rifle-squad:alpha');
    expect(state.command.order).toContain('suspended');
  });

  it('does not build recovery pressure through a wall', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:alpha', { health: 0 })).toBe(true);
    expect(simulation.setPlayerPosition({ x: 14, y: 6 })).toBe(true);
    for (let index = 0; index < 3; index += 1) expect(simulation.playerFireAt({ x: 2, y: 2 })).toBe(true);
    expect(simulation.getState().recoverySafety.pressure).toBeLessThan(0.2);
  });
});
