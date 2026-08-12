import { describe, expect, it } from 'vitest';
import { findPath, gridKey, isWalkable } from '../../Apps/Workbench/src/simulation/navigation';
import { tacticalWizardNavigationGrid } from '../../Apps/Workbench/src/simulation/tacticalWizardTestMapV7';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV8';

describe('Tactical Wizard V8 command hierarchy and logistics', () => {
  it('spawns deterministic-random reachable supply caches and starts with larger grenade loads', () => {
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
  });

  it('keeps Alpha as commander and biases crossfire/assault command toward support instead of lead maneuver', () => {
    const simulation = new TacticalWizardSimulation();
    let state = simulation.getState();
    expect(state.commanderId).toBe('twr:rifle-squad:alpha');
    expect(state.agents.find((agent) => agent.id === state.commanderId)?.commandRank).toBe('commander');
    expect(state.agents.filter((agent) => agent.commandRank === 'subordinate')).toHaveLength(2);

    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    for (let index = 0; index < 320 && state.squad.tactic !== 'crossfire'; index += 1) state = simulation.step();
    expect(state.squad.tactic).toBe('crossfire');
    expect(state.squad.suppressorId).toBe(state.commanderId);
    expect(state.squad.moverId).not.toBe(state.commanderId);
    expect(state.squad.observerId).not.toBe(state.commanderId);
    expect(state.agents.find((agent) => agent.id === state.commanderId)?.role).toBe('support');
    expect(state.agents.filter((agent) => agent.commandRank === 'subordinate' && agent.role === 'crossfire')).toHaveLength(2);
  });

  it('does not replay the same full maneuver choreography against a stationary visible target', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 24, y: 13 })).toBe(true);

    let state = simulation.getState();
    for (let tick = 0; tick < 220; tick += 1) state = simulation.step();

    const tacticTransitions = state.runLog
      .filter((entry) => entry.category === 'squad' && entry.event === 'tactic')
      .map((entry) => entry.summary);

    // The uploaded regression log used to repeat the exact
    // bounding -> flank -> crossfire -> assault -> regroup chain. Once the
    // engagement has remained static for a full cycle, V8 should exercise at
    // least one adaptive shortcut instead of replaying that choreography.
    expect(tacticTransitions).toContain('Tactic bounding → crossfire.');
    expect(tacticTransitions).toContain('Tactic crossfire → regroup.');
    expect(state.squad.maneuverCycle).toBeGreaterThanOrEqual(2);
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
      if (bravo.ammoRounds > 30 && state.command.activeResupplyAgentId === null) break;
    }
    expect(state.agents.find((agent) => agent.id === bravoId)!.ammoRounds).toBeGreaterThan(30);
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
