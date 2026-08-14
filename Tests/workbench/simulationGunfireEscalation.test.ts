import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV4';

describe('Tactical Wizard gunfire escalation regression', () => {
  it('promotes repeated audible rifle fire into the fixed-hierarchy combat alert without requiring direct vision', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 9.32, y: 19.73 })).toBe(true);
    expect(simulation.getState().agents.some((agent) => agent.targetVisible)).toBe(false);

    expect(simulation.playerFireAt({ x: 16.55, y: 9.83 })).toBe(true);
    let state = simulation.getState();
    expect(state.squad.alertState).toBe('idle');
    expect(state.threatAwareness.level).toBe('suspicious');
    expect(state.threatAwareness.evidenceCounts.gunshot).toBe(1);

    expect(simulation.playerFireAt({ x: 16.55, y: 9.83 })).toBe(true);
    state = simulation.getState();
    expect(state.squad.alertState).toBe('active');
    expect(state.threatAwareness.level).toBe('threatened');
    expect(state.threatAwareness.evidenceCounts.gunshot).toBe(2);
    expect(state.threatAwareness.responseEscalations).toBeGreaterThanOrEqual(1);
    expect(state.squad.sharedLastKnownPosition).not.toBeNull();
    expect(distance(state.squad.sharedLastKnownPosition!, state.player)).toBeGreaterThan(0.5);
    expect(state.executionAuthority.contracts.some((contract) => contract.movementOwner === 'tactical')).toBe(true);
  });

  it('treats a rifle trajectory passing close to the squad as an immediate near-miss threat', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 9.32, y: 19.73 })).toBe(true);

    expect(simulation.playerFireAt({ x: 3, y: 3 })).toBe(true);
    const state = simulation.getState();

    expect(state.agents.every((agent) => agent.health === 100)).toBe(true);
    expect(state.threatAwareness.evidenceCounts.near_miss).toBe(1);
    expect(state.squad.alertState).toBe('active');
    expect(state.threatAwareness.level).toBe('threatened');
  });
});

function distance(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
