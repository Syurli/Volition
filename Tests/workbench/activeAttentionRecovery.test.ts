import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulation';

describe('semantic active attention and recovery safety', () => {
  it('keeps one visual-contact fact for agent view and combat authority', () => {
    const simulation = new TacticalWizardSimulation();
    let state = simulation.getState();
    for (let frame = 0; frame < 180; frame += 1) {
      state = simulation.advance(1 / 30);
      const fromAgents = state.agents.filter((agent) => agent.alive && agent.targetVisible).map((agent) => agent.id).sort();
      expect([...state.combatAuthority.confirmedVisualIds].sort()).toEqual(fromAgents);
    }
  });

  it('publishes active attention state and a real moving gaze target during investigation/search', () => {
    const simulation = new TacticalWizardSimulation();
    simulation.emitNoise();
    let state = simulation.getState();
    let sawScan = false;
    let sawChangingFacing = false;
    const firstFacing = new Map(state.agents.map((agent) => [agent.id, { ...agent.facing }]));
    for (let frame = 0; frame < 420; frame += 1) {
      state = simulation.advance(1 / 30);
      for (const attention of state.perceptionIntegration.attention) {
        if ((attention.mode === 'scan_search' || attention.mode === 'scan_acoustic') && attention.lookTarget !== null) sawScan = true;
        const initial = firstFacing.get(attention.agentId);
        if (initial !== undefined && Math.hypot(attention.facing.x - initial.x, attention.facing.y - initial.y) > 0.1) sawChangingFacing = true;
      }
      if (sawScan && sawChangingFacing) break;
    }
    expect(sawScan).toBe(true);
    expect(sawChangingFacing).toBe(true);
  });

  it('raises rescue pressure and interrupts treatment under sustained incoming fire', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:bravo', { health: 0 })).toBe(true);
    let state = simulation.getState();
    for (let frame = 0; frame < 180 && state.recovery.phase === 'none'; frame += 1) state = simulation.advance(1 / 30);
    expect(state.recovery.phase).not.toBe('none');
    const casualty = state.agents.find((agent) => agent.id === state.recovery.downedAgentId)!;
    let maxPressure = state.recoverySafety.pressure;
    let observedSafetyAction = false;
    for (let burst = 0; burst < 8; burst += 1) {
      simulation.playerFireAt(casualty.position);
      for (let frame = 0; frame < 8; frame += 1) {
        state = simulation.advance(1 / 30);
        maxPressure = Math.max(maxPressure, state.recoverySafety.pressure);
        observedSafetyAction ||= state.recoverySafety.decision === 'pause'
          || state.recoverySafety.decision === 'reposition'
          || state.recoverySafety.decision === 'abort'
          || state.recoverySafety.safetyReplans > 0
          || state.recoverySafety.safetyAborts > 0
          || state.threatResponse.rescueInterruptedCount > 0;
      }
    }
    expect(maxPressure).toBeGreaterThan(0.3);
    expect(observedSafetyAction).toBe(true);
  });
});
