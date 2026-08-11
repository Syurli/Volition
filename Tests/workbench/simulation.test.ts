import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation, tacticalWizardTestMap } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulation';
import { occupiedPositionsAreUnique } from '../../Apps/Workbench/src/simulation/squadTactics';

describe('Tactical Wizard interactive Workbench example', () => {
  it('executes patrol -> investigate -> engage -> search from real simulation stimuli', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 4, y: 7 })).toBe(true);
    simulation.emitNoise();
    const investigated = simulation.step();
    expect(investigated.selectedIntent).toBe('investigate');
    expect(investigated.latestTrace?.observations.some((entry) => entry.kind === 'noise')).toBe(true);

    expect(simulation.setPlayerPosition({ x: 6, y: 2 })).toBe(true);
    const engaged = simulation.step();
    expect(engaged.selectedIntent).toBe('engage');
    expect(engaged.targetVisible).toBe(true);

    expect(simulation.setPlayerPosition({ x: 14, y: 6 })).toBe(true);
    const searched = simulation.step();
    expect(searched.selectedIntent).toBe('search');
    expect(searched.targetVisible).toBe(false);
    const lostVisual = searched.latestTrace?.observations.find((entry) => entry.kind === 'visual_actor');
    expect(lostVisual?.position).toBeUndefined();
    expect(searched.lastKnownPosition).toEqual({ x: 6, y: 2 });
  });

  it('decays individual search belief back to patrol without leaking hidden live position', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 5, y: 2 })).toBe(true);
    const engaged = simulation.step();
    expect(engaged.selectedIntent).toBe('engage');

    expect(simulation.setPlayerPosition({ x: 14, y: 6 })).toBe(true);
    const searched = simulation.step();
    expect(searched.selectedIntent).toBe('search');
    expect(searched.latestTrace?.observations.find((entry) => entry.kind === 'visual_actor')?.position).toBeUndefined();

    let state = simulation.getState();
    for (let index = 0; index < 24; index += 1) state = simulation.step();
    expect(state.selectedIntent).toBe('patrol');
    expect(state.beliefConfidence).toBeLessThan(0.2);
  });

  it('runs a three-member squad on the expanded map without overlapping positions', () => {
    const simulation = new TacticalWizardSimulation();
    expect(tacticalWizardTestMap.width).toBeGreaterThanOrEqual(40);
    expect(tacticalWizardTestMap.height).toBeGreaterThanOrEqual(24);
    let state = simulation.getState();
    expect(state.agents).toHaveLength(3);
    for (let index = 0; index < 40; index += 1) state = simulation.step();
    expect(occupiedPositionsAreUnique(state.agents.map((agent) => agent.position))).toBe(true);
  });

  it('propagates confirmed contact into squad roles and alternates bounding overwatch', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.step();
    expect(state.squad.alertState).toBe('pending');
    state = simulation.step();
    state = simulation.step();
    expect(state.squad.alertState).toBe('active');
    expect(new Set(state.agents.map((agent) => agent.role))).toEqual(new Set(['suppressor', 'mover', 'observer']));
    expect(state.coverSlots.length).toBeGreaterThan(0);
    const firstSuppressor = state.squad.suppressorId;

    for (let index = 0; index < 36 && state.squad.phase === 0; index += 1) state = simulation.step();
    expect(state.squad.phase).toBeGreaterThan(0);
    expect(state.squad.suppressorId).not.toBe(firstSuppressor);
    expect(occupiedPositionsAreUnique(state.agents.map((agent) => agent.position))).toBe(true);
  });

  it('keyboard-style movement creates a low-intensity footstep stimulus when close enough', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 4, y: 6 })).toBe(true);
    expect(simulation.nudgePlayer(0, -1)).toBe(true);
    const state = simulation.step();
    expect(state.latestTrace?.observations.some((entry) => entry.kind === 'noise' && entry.detail === 'footstep')).toBe(true);
  });
});
