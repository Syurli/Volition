import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV5';

describe('V5 tactical execution regressions', () => {
  it('keeps stable contact through cover peek origins long enough to complete flank into crossfire', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.getState();
    const transitions: string[] = [];
    let previous = state.squad.tactic;
    for (let index = 0; index < 220; index += 1) {
      state = simulation.step();
      if (state.squad.tactic !== previous) {
        transitions.push(`${previous}->${state.squad.tactic}`);
        previous = state.squad.tactic;
      }
      if (state.squad.tactic === 'crossfire') break;
    }
    expect(state.squad.tactic).toBe('crossfire');
    expect(transitions).toContain('bounding->flank');
    expect(transitions).toContain('flank->crossfire');
    const flankIndex = transitions.indexOf('bounding->flank');
    const crossfireIndex = transitions.indexOf('flank->crossfire');
    expect(transitions.slice(flankIndex + 1, crossfireIndex)).not.toContain('flank->sweep');
  });

  it('turns a lost-contact sweep into assigned search sectors with changing look directions', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.getState();
    for (let index = 0; index < 24; index += 1) state = simulation.step();
    expect(simulation.setPlayerPosition({ x: 46, y: 27 })).toBe(true);

    for (let index = 0; index < 80 && state.squad.tactic !== 'sweep'; index += 1) state = simulation.step();
    expect(state.squad.tactic).toBe('sweep');
    expect(state.agents.filter((agent) => agent.task === 'search_sector')).toHaveLength(2);
    expect(state.agents.filter((agent) => agent.task === 'overwatch')).toHaveLength(1);

    const lookSamples = new Map<string, Set<string>>();
    let maximumProgress = 0;
    for (let frame = 0; frame < 360; frame += 1) {
      state = simulation.advance(1 / 30);
      if (state.squad.tactic !== 'sweep') break;
      for (const agent of state.agents) {
        maximumProgress = Math.max(maximumProgress, agent.searchProgress);
        if (agent.searchLookTarget === null) continue;
        const samples = lookSamples.get(agent.id) ?? new Set<string>();
        samples.add(`${agent.searchLookTarget.x.toFixed(2)},${agent.searchLookTarget.y.toFixed(2)}`);
        lookSamples.set(agent.id, samples);
      }
    }
    expect(maximumProgress).toBeGreaterThan(0);
    expect([...lookSamples.values()].some((samples) => samples.size >= 2)).toBe(true);
    expect(state.runLog.some((entry) => entry.category === 'agent' && entry.event === 'search' && entry.summary.includes('searching assigned space'))).toBe(true);
  });
});
