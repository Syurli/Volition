import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV4';

describe('Tactical Wizard fixed-hierarchy behavior parity', () => {
  it('exposes a self-identifying semantic runtime and executable single-shot acoustic investigation', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 9.32, y: 19.73 })).toBe(true);

    expect(simulation.playerFireAt({ x: 16.55, y: 9.83 })).toBe(true);
    let state = simulation.getState();
    expect(state.runtimeIdentity.entrypoint).toBe('TacticalWizardSimulationV4');
    expect(state.runtimeIdentity.behaviorRevision).toBe('fixed-hierarchy-parity-r1');
    expect(state.runtimeIdentity.features.contactMemory).toBe(true);
    expect(state.runLog.some((entry) => entry.event === 'session' && entry.data.behaviorRevision === 'fixed-hierarchy-parity-r1')).toBe(true);
    expect(state.perceptionIntegration.hearingRadius).toBe(28);
    expect(state.perceptionIntegration.visionRange).toBe(20);
    expect(state.perceptionIntegration.acousticInvestigationActive).toBe(true);
    expect(state.perceptionIntegration.responderIds).toHaveLength(1);
    expect(state.squad.alertState).toBe('idle');
    expect(state.threatAwareness.level).toBe('suspicious');

    simulation.step();
    state = simulation.getState();
    expect(state.executionAuthority.contracts.some((contract) => String(contract.movementOwner) === 'investigation')).toBe(true);
  });

  it('escalates a repeated rifle episode while preserving coarse rather than exact shooter knowledge', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 9.32, y: 19.73 })).toBe(true);
    expect(simulation.playerFireAt({ x: 16.55, y: 9.83 })).toBe(true);
    expect(simulation.playerFireAt({ x: 16.55, y: 9.83 })).toBe(true);

    const state = simulation.getState();
    expect(state.squad.alertState).toBe('active');
    expect(state.threatAwareness.evidenceCounts.gunshot).toBe(2);
    expect(state.threatAwareness.level).toBe('threatened');
    expect(state.perceptionIntegration.acousticShots).toBeGreaterThanOrEqual(2);
    expect(state.perceptionIntegration.acousticInvestigationActive).toBe(false);
    expect(state.squad.sharedLastKnownPosition).not.toBeNull();
    expect(Math.hypot(
      state.squad.sharedLastKnownPosition!.x - state.player.x,
      state.squad.sharedLastKnownPosition!.y - state.player.y,
    )).toBeGreaterThan(0.5);
  });

  it('records real confirmed-contact motion instead of treating a coarse threat sector as an exact LKP', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 6, y: 2 })).toBe(true);
    for (let index = 0; index < 4; index += 1) simulation.step();
    let state = simulation.getState();
    expect(state.contactTrack.lastConfirmedPosition).not.toBeNull();
    expect(state.contactTrack.lastConfirmedTick).not.toBeNull();

    expect(simulation.setPlayerPosition({ x: 7, y: 2 })).toBe(true);
    simulation.step();
    state = simulation.getState();
    expect(state.contactTrack.previousConfirmedPosition).not.toBeNull();
    expect(state.contactTrack.egressDirection).not.toBeNull();
    expect(state.contactTrack.egressDirection!.x).toBeGreaterThan(0.5);
  });

  it('does not grant a field-resupply lease to an armed member while confirmed direct combat owns execution', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 6, y: 2 })).toBe(true);
    for (let index = 0; index < 4; index += 1) simulation.step();
    let state = simulation.getState();
    expect(state.squad.alertState).toBe('active');
    expect(state.agents.some((agent) => agent.targetVisible)).toBe(true);

    expect(simulation.setAgentEquipment('twr:rifle-squad:alpha', { ammoRounds: 12 })).toBe(true);
    for (let index = 0; index < 3; index += 1) simulation.step();
    state = simulation.getState();
    expect(state.command.activeResupplyAgentId).toBeNull();
    expect(state.agents.find((agent) => agent.id === 'twr:rifle-squad:alpha')?.logisticsTask).toBe('none');
    expect(state.logisticsLifecycle.suppressedPlanningCalls).toBeGreaterThan(0);
  });
});
