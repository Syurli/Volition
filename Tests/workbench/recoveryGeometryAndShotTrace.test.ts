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

  it('never holds active Recovery authority without valid distinct treatment geometry', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 46, y: 27 })).toBe(true);
    for (let index = 0; index < 4; index += 1) simulation.step();
    expect(simulation.setAgentVitals('twr:rifle-squad:alpha', { health: 0 })).toBe(true);
    let state = simulation.getState();
    expect(state.recovery.phase).not.toBe('none');
    expect(state.dynamicRecovery.treatmentPoint).not.toBeNull();
    if (state.recoverySafety.ownershipMode === 'active') {
      const patient = state.agents.find((agent) => agent.id === 'twr:rifle-squad:alpha')!;
      expect(Math.hypot(state.dynamicRecovery.treatmentPoint!.x - patient.position.x, state.dynamicRecovery.treatmentPoint!.y - patient.position.y)).toBeGreaterThan(0.5);
      expect(state.recoverySafety.geometryViability).toBe('valid');
      expect(state.dynamicRecovery.tacticalPlanningSuspended).toBe(true);
      const tactic = state.squad.tactic;
      for (let index = 0; index < 2; index += 1) simulation.step();
      state = simulation.getState();
      expect(state.recovery.phase).not.toBe('none');
      expect(state.squad.tactic).toBe(tactic);
      expect(state.dynamicRecovery.tacticalPlanningSuspended).toBe(true);
      expect([state.squad.suppressorId, state.squad.moverId, state.squad.observerId]).not.toContain('twr:rifle-squad:alpha');
    } else {
      expect(state.recoverySafety.ownershipMode).toBe('deferred');
      expect(state.dynamicRecovery.tacticalPlanningSuspended).toBe(false);
      expect(state.recoverySafety.geometryViability).not.toBe('valid');
    }
  });

  it('does not build recovery pressure through a wall', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:alpha', { health: 0 })).toBe(true);
    expect(simulation.setPlayerPosition({ x: 14, y: 6 })).toBe(true);
    for (let index = 0; index < 3; index += 1) expect(simulation.playerFireAt({ x: 2, y: 2 })).toBe(true);
    expect(simulation.getState().recoverySafety.pressure).toBeLessThan(0.2);
  });

  it('lets a solo rescuer keep casualty ownership and complete treatment after historical threat becomes stale', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 8, y: 2 })).toBe(true);
    for (let index = 0; index < 10; index += 1) simulation.step();
    expect(simulation.setPlayerPosition({ x: 59, y: 28 })).toBe(true);
    for (let index = 0; index < 24; index += 1) simulation.step();

    expect(simulation.setAgentVitals('twr:rifle-squad:alpha', { health: 0 })).toBe(true);
    expect(simulation.setAgentVitals('twr:rifle-squad:bravo', { health: 0 })).toBe(true);

    let state = simulation.getState();
    expect(state.leadership.capability).toBe('single_survivor');
    for (let index = 0; index < 220 && state.leadership.livingCount === 1; index += 1) {
      simulation.step();
      state = simulation.getState();
    }

    expect(state.leadership.livingCount).toBeGreaterThan(1);
    expect(state.agents.some((agent) => agent.id !== 'twr:rifle-squad:charlie' && agent.health > 0)).toBe(true);
    expect(state.recoverySafety.threatSource === 'none' || state.recoverySafety.threatAgeTicks === 0).toBe(true);
  });

  it('does not treat an absent solo security role as ineffective fire support', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:alpha', { health: 0 })).toBe(true);
    expect(simulation.setAgentVitals('twr:rifle-squad:bravo', { health: 0 })).toBe(true);
    let state = simulation.getState();
    for (let index = 0; index < 12; index += 1) { simulation.step(); state = simulation.getState(); }
    expect(state.recoverySafety.mode === 'solo' || state.leadership.livingCount > 1).toBe(true);
    if (state.recoverySafety.mode === 'solo') {
      expect(state.recoverySafety.pauseReason).not.toBe('paired_security_ineffective');
      expect(state.recoverySafety.security.agentId).toBeNull();
    }
  });

});
