import { describe, expect, it } from 'vitest';
import { findPath, gridKey, isWalkable } from '../../Apps/Workbench/src/simulation/navigation';
import { tacticalWizardNavigationGrid } from '../../Apps/Workbench/src/simulation/tacticalWizardTestMapV7';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV8';

describe('Tactical Wizard V8 command hierarchy and logistics', () => {
  it('spawns deterministic-random reachable supply caches and exposes burst budget', () => {
    const simulation = new TacticalWizardSimulation();
    const state = simulation.getState();

    expect(state.supplies).toHaveLength(8);
    expect(new Set(state.supplies.map((supply) => gridKey(supply.position))).size).toBe(state.supplies.length);
    for (const supply of state.supplies) {
      expect(isWalkable(tacticalWizardNavigationGrid, supply.position), supply.id).toBe(true);
      expect(findPath(tacticalWizardNavigationGrid, { x: 2, y: 2 }, supply.position).length, supply.id).toBeGreaterThan(0);
    }
    expect(state.agents.every((agent) => agent.grenadeCount === 3)).toBe(true);
    expect(state.agents.every((agent) => agent.ammoRounds === 96)).toBe(true);
    expect(state.agents.every((agent) => agent.burstsRemaining === 32)).toBe(true);
  });

  it('keeps Alpha as commander without pinning commander identity to the support slot', () => {
    const simulation = new TacticalWizardSimulation();
    const commanderId = 'twr:rifle-squad:alpha';
    let state = simulation.getState();
    expect(state.commanderId).toBe(commanderId);
    expect(state.agents.find((agent) => agent.id === commanderId)?.commandRank).toBe('commander');
    expect(state.agents.filter((agent) => agent.commandRank === 'subordinate')).toHaveLength(2);

    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    const commanderRoles = new Set<string>();
    const commanderCells = new Set<string>();
    for (let index = 0; index < 120; index += 1) {
      state = simulation.step();
      const commander = state.agents.find((agent) => agent.id === commanderId)!;
      if (state.squad.alertState === 'active') {
        commanderRoles.add(commander.role);
        commanderCells.add(`${Math.round(commander.position.x)},${Math.round(commander.position.y)}`);
      }
      const maneuverRoleSeen = [...commanderRoles].some((role) => ['mover', 'flanker', 'crossfire', 'assaulter', 'sweeper'].includes(role));
      if (maneuverRoleSeen && commanderCells.size > 2) break;
    }

    expect([...commanderRoles].some((role) => ['mover', 'flanker', 'crossfire', 'assaulter', 'sweeper'].includes(role))).toBe(true);
    expect(commanderCells.size).toBeGreaterThan(2);
  });

  it('does not replay the same full maneuver choreography against a stationary visible target', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 24, y: 13 })).toBe(true);

    let state = simulation.getState();
    let tacticTransitions: string[] = [];
    for (let tick = 0; tick < 220; tick += 1) {
      state = simulation.step();
      tacticTransitions = state.runLog
        .filter((entry) => entry.category === 'squad' && entry.event === 'tactic')
        .map((entry) => entry.summary);
      if (tacticTransitions.includes('Tactic bounding → crossfire.') && tacticTransitions.includes('Tactic crossfire → regroup.') && state.squad.maneuverCycle >= 2) break;
    }

    expect(tacticTransitions).toContain('Tactic bounding → crossfire.');
    expect(tacticTransitions).toContain('Tactic crossfire → regroup.');
    expect(state.squad.maneuverCycle).toBeGreaterThanOrEqual(2);
  }, 10000);

  it('hands off an empty base-of-fire instead of leaving a dry suppressor in place', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.getState();
    for (let tick = 0; tick < 80 && state.squad.alertState !== 'active'; tick += 1) state = simulation.step();
    expect(state.squad.alertState).toBe('active');

    const oldSuppressor = state.squad.suppressorId!;
    expect(simulation.setAgentEquipment(oldSuppressor, { ammoRounds: 0 })).toBe(true);
    state = simulation.advance(0.25);

    expect(state.squad.suppressorId).not.toBe(oldSuppressor);
    expect(state.command.supportHandoffCount).toBeGreaterThan(0);
    expect(state.runLog.some((entry) => entry.category === 'squad' && entry.event === 'roles' && entry.summary.includes('Fire-support responsibility handed'))).toBe(true);
  });

  it('uses 42 rounds as a planning reserve but waits for low reserve before detaching', () => {
    const simulation = new TacticalWizardSimulation();
    const commanderId = 'twr:rifle-squad:alpha';
    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.getState();
    for (let tick = 0; tick < 80 && state.squad.alertState !== 'active'; tick += 1) state = simulation.step();
    expect(state.squad.alertState).toBe('active');

    expect(simulation.setAgentEquipment(commanderId, { ammoRounds: 42, grenades: 3 })).toBe(true);
    state = simulation.advance(1 / 30);
    expect(state.command.activeResupplyAgentId).toBeNull();

    expect(simulation.setAgentEquipment(commanderId, { ammoRounds: 30, grenades: 3 })).toBe(true);
    state = simulation.advance(1 / 30);
    expect(state.command.activeResupplyAgentId).toBe(commanderId);
    expect(state.agents.find((agent) => agent.id === commanderId)?.logisticsTask).toBe('resupply_ammo');

    for (let frame = 0; frame < 1800; frame += 1) {
      state = simulation.advance(1 / 30);
      const commander = state.agents.find((agent) => agent.id === commanderId)!;
      if (commander.ammoRounds > 42 && state.command.activeResupplyAgentId === null) break;
    }
    const commander = state.agents.find((agent) => agent.id === commanderId)!;
    expect(commander.ammoRounds).toBeGreaterThan(42);
    expect(state.command.activeResupplyAgentId).toBeNull();
    expect(state.runLog.some((entry) => entry.category === 'squad' && entry.event === 'plan' && entry.summary.includes('completed field resupply') && entry.data.agentId === commanderId)).toBe(true);
  });

  it('regresses the T411 symptom with a focused parked-commander recovery scenario', () => {
    const simulation = new TacticalWizardSimulation();
    const commanderId = 'twr:rifle-squad:alpha';
    expect(simulation.setPlayerPosition({ x: 15, y: 16 })).toBe(true);

    let state = simulation.getState();
    for (let tick = 0; tick < 100 && state.squad.alertState !== 'active'; tick += 1) state = simulation.step();
    expect(state.squad.alertState).toBe('active');
    const before = state.agents.find((agent) => agent.id === commanderId)!.position;

    expect(simulation.setAgentEquipment(commanderId, { ammoRounds: 30, grenades: 3 })).toBe(true);
    state = simulation.advance(1 / 30);
    expect(state.command.activeResupplyAgentId).toBe(commanderId);

    let maxDistance = 0;
    for (let frame = 0; frame < 1800; frame += 1) {
      state = simulation.advance(1 / 30);
      const commander = state.agents.find((agent) => agent.id === commanderId)!;
      maxDistance = Math.max(maxDistance, Math.hypot(commander.position.x - before.x, commander.position.y - before.y));
      if (commander.ammoRounds > 42 && state.command.activeResupplyAgentId === null) break;
    }

    expect(maxDistance).toBeGreaterThan(2);
    expect(state.agents.find((agent) => agent.id === commanderId)!.ammoRounds).toBeGreaterThan(42);
    expect(state.command.activeResupplyAgentId).toBeNull();
  });

  it('detaches one subordinate at a time to refill ammo and grenades, then returns it to tactical control', () => {
    const simulation = new TacticalWizardSimulation();
    const bravoId = 'twr:rifle-squad:bravo';

    expect(simulation.setAgentEquipment(bravoId, { ammoRounds: 0, grenades: 3 })).toBe(true);
    let state = simulation.advance(1 / 30);
    expect(state.command.activeResupplyAgentId).toBe(bravoId);
    expect(state.agents.find((agent) => agent.id === bravoId)?.logisticsTask).toBe('resupply_ammo');

    for (let frame = 0; frame < 1800; frame += 1) {
      state = simulation.advance(1 / 30);
      const bravo = state.agents.find((agent) => agent.id === bravoId)!;
      if (bravo.ammoRounds > 42 && state.command.activeResupplyAgentId === null) break;
    }
    expect(state.agents.find((agent) => agent.id === bravoId)!.ammoRounds).toBeGreaterThan(42);
    expect(state.command.activeResupplyAgentId).toBeNull();

    expect(simulation.setAgentEquipment(bravoId, { ammoRounds: 120, grenades: 0 })).toBe(true);
    state = simulation.advance(1 / 30);
    expect(state.command.activeResupplyAgentId).toBe(bravoId);
    expect(state.agents.find((agent) => agent.id === bravoId)?.logisticsTask).toBe('resupply_grenades');

    for (let frame = 0; frame < 1800; frame += 1) {
      state = simulation.advance(1 / 30);
      const bravo = state.agents.find((agent) => agent.id === bravoId)!;
      if (bravo.grenadeCount > 1 && state.command.activeResupplyAgentId === null) break;
    }
    expect(state.agents.find((agent) => agent.id === bravoId)!.grenadeCount).toBeGreaterThan(1);
    expect(state.command.activeResupplyAgentId).toBeNull();
  });
});
