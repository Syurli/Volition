import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation, tacticalWizardTestMap } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV4';
import { occupiedPositionsAreUnique } from '../../Apps/Workbench/src/simulation/squadTactics';

describe('Tactical Wizard Workbench simulation V4', () => {
  it('runs motion at 30 Hz independently from the 4 Hz decision clock', () => {
    const simulation = new TacticalWizardSimulation(); const before = simulation.getState();
    for (let index = 0; index < 7; index += 1) simulation.advance(1 / 30);
    const motionOnly = simulation.getState(); expect(motionOnly.logicalTick).toBe(before.logicalTick);
    expect(Math.hypot(motionOnly.agents[0]!.position.x - before.agents[0]!.position.x, motionOnly.agents[0]!.position.y - before.agents[0]!.position.y)).toBeGreaterThan(0.5);
    simulation.advance(1 / 30); expect(simulation.getState().logicalTick).toBe(1);
  });

  it('uses a faster default movement speed while preserving non-overlap', () => {
    const simulation = new TacticalWizardSimulation(); expect(simulation.agentMoveSpeed).toBeGreaterThanOrEqual(4); const before = simulation.getState().agents[0]!.position;
    const state = simulation.step(); expect(Math.hypot(state.agents[0]!.position.x - before.x, state.agents[0]!.position.y - before.y)).toBeGreaterThan(0.8);
    expect(occupiedPositionsAreUnique(state.agents.map((agent) => agent.position))).toBe(true); expect(tacticalWizardTestMap.width).toBeGreaterThanOrEqual(40);
  });

  it('does not time-switch the first flank before the committed maneuver gate is satisfied', () => {
    const simulation = new TacticalWizardSimulation(); expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.getState(); let flankTick: number | null = null; let crossfireTick: number | null = null; let crossfireReason = '';
    for (let index = 0; index < 240; index += 1) {
      state = simulation.step();
      const transitions = state.runLog.filter((entry) => entry.category === 'squad' && entry.event === 'tactic');
      const flank = transitions.find((entry) => entry.data.to === 'flank'); const crossfire = transitions.find((entry) => entry.data.to === 'crossfire');
      if (flank) flankTick = flank.logicalTick;
      if (crossfire) { crossfireTick = crossfire.logicalTick; crossfireReason = String(crossfire.data.reason ?? ''); break; }
    }
    expect(flankTick).not.toBeNull(); expect(crossfireTick).not.toBeNull();
    expect(crossfireTick! - flankTick!).toBeGreaterThanOrEqual(6);
    expect(crossfireReason).toContain('reached its committed sector');
  });

  it('resolves a committed maneuver without forcing an unsafe assault or one-tick tactic oscillation', () => {
    const simulation = new TacticalWizardSimulation(); expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true); let state = simulation.getState();
    const transitions: Array<{ tick: number; from: unknown; to: unknown; reason: string }> = [];
    for (let index = 0; index < 320; index += 1) {
      state = simulation.step(); const latest = [...state.runLog].reverse().find((entry) => entry.category === 'squad' && entry.event === 'tactic');
      if (latest && !transitions.some((entry) => entry.tick === latest.logicalTick && entry.to === latest.data.to)) {
        transitions.push({ tick: latest.logicalTick, from: latest.data.from, to: latest.data.to, reason: String(latest.data.reason ?? '') });
      }
      if (transitions.some((entry) => entry.to === 'crossfire') && transitions.some((entry) => entry.from === 'crossfire' && (entry.to === 'assault' || entry.to === 'regroup'))) break;
    }
    const sequence = transitions.map((entry) => entry.to);
    expect(sequence).toEqual(expect.arrayContaining(['flank', 'crossfire']));
    const crossfireResolution = transitions.find((entry) => entry.from === 'crossfire' && (entry.to === 'assault' || entry.to === 'regroup'));
    expect(crossfireResolution).toBeDefined();
    if (crossfireResolution?.to === 'regroup') {
      expect(crossfireResolution.reason).toMatch(/could not settle|target state has not changed|physically stalled/i);
    }
    for (let index = 1; index < transitions.length; index += 1) expect(transitions[index]!.tick - transitions[index - 1]!.tick).toBeGreaterThanOrEqual(2);
  }, 15000);

  it('logs decoupled motion samples with real elapsed time', () => {
    const simulation = new TacticalWizardSimulation(); simulation.advance(0.5); const state = simulation.getState(); const moves = state.runLog.filter((entry) => entry.category === 'agent' && entry.event === 'move');
    expect(moves.length).toBeGreaterThan(0); expect(moves.some((entry) => typeof entry.data.motionFrame === 'number')).toBe(true);
    expect(moves.some((entry) => entry.timeSeconds > 0 && entry.timeSeconds !== entry.logicalTick * 0.25)).toBe(true);
  });
});
