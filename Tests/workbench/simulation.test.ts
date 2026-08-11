import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulation';

describe('Tactical Wizard interactive Workbench example', () => {
  it('executes patrol -> investigate -> engage -> search from real simulation stimuli', () => {
    const simulation = new TacticalWizardSimulation();
    simulation.setPlayerPosition({ x: 4, y: 7 }); simulation.emitNoise();
    const investigated = simulation.step();
    expect(investigated.selectedIntent).toBe('investigate');
    expect(investigated.latestTrace?.observations.some((entry) => entry.kind === 'noise')).toBe(true);
    simulation.setPlayerPosition({ x: 6, y: 2 });
    const engaged = simulation.step();
    expect(engaged.selectedIntent).toBe('engage'); expect(engaged.targetVisible).toBe(true);
    simulation.setPlayerPosition({ x: 12, y: 6 });
    const searched = simulation.step();
    expect(searched.selectedIntent).toBe('search'); expect(searched.targetVisible).toBe(false);
    expect(searched.latestTrace?.observations[0]?.position).toBeUndefined();
    expect(searched.lastKnownPosition).toEqual({ x: 6, y: 2 });
  });
  it('decays search belief back to patrol without leaking hidden live position', () => {
    const simulation = new TacticalWizardSimulation();
    simulation.setPlayerPosition({ x: 5, y: 2 });
    const engaged = simulation.step(); expect(engaged.selectedIntent).toBe('engage');
    simulation.setPlayerPosition({ x: 12, y: 6 }); simulation.step();
    let state = simulation.getState(); for (let index = 0; index < 24; index += 1) state = simulation.step();
    expect(state.selectedIntent).toBe('patrol'); expect(state.beliefConfidence).toBeLessThan(0.2);
  });
});
