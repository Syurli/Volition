import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV5';

describe('V5 tactical task progression diagnostics', () => {
  it('eventually advances a static-contact squad beyond flank without deadlocking on fire-lane avoidance', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.getState();
    let previous = state.squad.tactic;
    const transitions: string[] = [];
    for (let index = 0; index < 520; index += 1) {
      state = simulation.step();
      if (state.squad.tactic !== previous) {
        transitions.push(`T${state.logicalTick}:${previous}->${state.squad.tactic}: spread=${state.squad.spread} lanes=${state.safeFireLanes} tasks=${state.agents.map((agent) => `${agent.label}/${agent.task}/${agent.coverState}/stall${agent.stalledTicks}`).join('|')}`);
        previous = state.squad.tactic;
      }
      if (state.squad.tactic === 'crossfire' || state.squad.tactic === 'assault') break;
    }
    console.log('V5 progression', transitions, 'final', {
      tick: state.logicalTick,
      tactic: state.squad.tactic,
      reason: state.squad.tacticReason,
      spread: state.squad.spread,
      safeFireLanes: state.safeFireLanes,
      agents: state.agents.map((agent) => ({ label: agent.label, task: agent.task, cover: agent.coverState, position: agent.position, target: agent.tacticalTarget, stalled: agent.stalledTicks })),
    });
    expect(['crossfire', 'assault']).toContain(state.squad.tactic);
  });
});
