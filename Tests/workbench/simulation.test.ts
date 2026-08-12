import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation, tacticalWizardTestMap } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulation';
import { occupiedPositionsAreUnique } from '../../Apps/Workbench/src/simulation/squadTactics';

describe('Tactical Wizard interactive Workbench example', () => {
  it('executes patrol -> investigate -> engage -> search from real simulation stimuli', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 4, y: 7 })).toBe(true); simulation.emitNoise();
    const investigated = simulation.step(); expect(investigated.selectedIntent).toBe('investigate'); expect(investigated.latestTrace?.observations.some((entry) => entry.kind === 'noise')).toBe(true);
    expect(simulation.setPlayerPosition({ x: 6, y: 2 })).toBe(true); const engaged = simulation.step(); expect(engaged.selectedIntent).toBe('engage'); expect(engaged.targetVisible).toBe(true);
    expect(simulation.setPlayerPosition({ x: 14, y: 6 })).toBe(true); const searched = simulation.step(); expect(searched.selectedIntent).toBe('search'); expect(searched.targetVisible).toBe(false);
    const lostVisual = searched.latestTrace?.observations.find((entry) => entry.kind === 'visual_actor'); expect(lostVisual?.position).toBeUndefined(); expect(searched.lastKnownPosition).toEqual({ x: 6, y: 2 });
  });

  it('decays individual search belief back to patrol without leaking hidden live position', () => {
    const simulation = new TacticalWizardSimulation(); expect(simulation.setPlayerPosition({ x: 5, y: 2 })).toBe(true); const engaged = simulation.step(); expect(engaged.selectedIntent).toBe('engage');
    expect(simulation.setPlayerPosition({ x: 14, y: 6 })).toBe(true); const searched = simulation.step(); expect(searched.selectedIntent).toBe('search'); expect(searched.latestTrace?.observations.find((entry) => entry.kind === 'visual_actor')?.position).toBeUndefined();
    let state = simulation.getState(); for (let index = 0; index < 24; index += 1) state = simulation.step(); expect(state.selectedIntent).toBe('patrol'); expect(state.beliefConfidence).toBeLessThan(0.2);
  });

  it('runs a three-member squad on the expanded map without overlapping positions', () => {
    const simulation = new TacticalWizardSimulation(); expect(tacticalWizardTestMap.width).toBeGreaterThanOrEqual(40); expect(tacticalWizardTestMap.height).toBeGreaterThanOrEqual(24);
    let state = simulation.getState(); expect(state.agents).toHaveLength(3); for (let index = 0; index < 80; index += 1) state = simulation.step(); expect(occupiedPositionsAreUnique(state.agents.map((agent) => agent.position))).toBe(true);
  });

  it('continues bounded movement without deadlocking behind another member', () => {
    const simulation = new TacticalWizardSimulation(); expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.step(); state = simulation.step(); state = simulation.step(); expect(state.squad.alertState).toBe('active'); expect(state.squad.tactic).toBe('bounding'); expect(new Set(state.agents.map((agent) => agent.role))).toEqual(new Set(['suppressor', 'mover', 'observer']));
    const moverPositions = new Set<string>(); let highestPhase = state.squad.phase;
    for (let index = 0; index < 120 && state.squad.tactic === 'bounding'; index += 1) { const mover = state.agents.find((agent) => agent.id === state.squad.moverId); if (mover) moverPositions.add(`${mover.position.x.toFixed(2)},${mover.position.y.toFixed(2)}`); state = simulation.step(); highestPhase = Math.max(highestPhase, state.squad.phase); }
    expect(highestPhase).toBeGreaterThanOrEqual(1); expect(moverPositions.size).toBeGreaterThan(6); expect(occupiedPositionsAreUnique(state.agents.map((agent) => agent.position))).toBe(true);
  });

  it('breaks a stationary cover-fire loop by escalating through flank, assault and regroup with full role rotation', () => {
    const simulation = new TacticalWizardSimulation(); expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.getState(); const seenTactics = new Set<string>(); const rolesByAgent = new Map<string, Set<string>>(); const visualIdentity = new Map(state.agents.map((agent) => [agent.id, agent.visualKey]));
    for (let index = 0; index < 100; index += 1) {
      state = simulation.step(); seenTactics.add(state.squad.tactic);
      for (const agent of state.agents) { const roles = rolesByAgent.get(agent.id) ?? new Set<string>(); roles.add(agent.role); rolesByAgent.set(agent.id, roles); expect(agent.visualKey).toBe(visualIdentity.get(agent.id)); }
      if (seenTactics.has('flank') && seenTactics.has('assault') && seenTactics.has('regroup')) break;
    }
    expect(seenTactics.has('flank')).toBe(true); expect(seenTactics.has('assault')).toBe(true); expect(seenTactics.has('regroup')).toBe(true);
    expect([...rolesByAgent.values()].every((roles) => roles.size >= 2)).toBe(true);
    expect(rolesByAgent.get('twr:rifle-squad:charlie')?.has('suppressor')).toBe(true);
  });

  it('uses quarter-cell direct-control resolution and still creates footstep stimuli', () => {
    const simulation = new TacticalWizardSimulation(); expect(simulation.setPlayerPosition({ x: 4, y: 6 })).toBe(true); const before = simulation.getState().player; expect(simulation.nudgePlayer(0, -1)).toBe(true);
    const moved = simulation.getState(); expect(moved.movementResolution).toBe(0.25); expect(moved.player.y).toBe(before.y - 0.25); const state = simulation.step(); expect(state.latestTrace?.observations.some((entry) => entry.kind === 'noise' && entry.detail === 'footstep')).toBe(true);
  });
});
