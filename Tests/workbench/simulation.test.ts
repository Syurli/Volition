import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation, tacticalWizardTestMap } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV3';
import { occupiedPositionsAreUnique } from '../../Apps/Workbench/src/simulation/squadTactics';

describe('Tactical Wizard interactive Workbench example V3', () => {
  it('executes patrol -> investigate -> engage -> search from real simulation stimuli', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 4, y: 7 })).toBe(true); simulation.emitNoise();
    const investigated = simulation.step(); expect(investigated.selectedIntent).toBe('investigate'); expect(investigated.latestTrace?.observations.some((entry) => entry.kind === 'noise')).toBe(true);
    expect(simulation.setPlayerPosition({ x: 6, y: 2 })).toBe(true); const engaged = simulation.step(); expect(engaged.selectedIntent).toBe('engage'); expect(engaged.targetVisible).toBe(true);
    expect(simulation.setPlayerPosition({ x: 14, y: 6 })).toBe(true); const searched = simulation.step(); expect(searched.selectedIntent).toBe('search'); expect(searched.targetVisible).toBe(false);
    const lostVisual = searched.latestTrace?.observations.find((entry) => entry.kind === 'visual_actor'); expect(lostVisual?.position).toBeUndefined(); expect(searched.lastKnownPosition).toEqual({ x: 6, y: 2 });
  });

  it('decays individual search belief without leaking hidden live position into the source agent', () => {
    const simulation = new TacticalWizardSimulation(); expect(simulation.setPlayerPosition({ x: 5, y: 2 })).toBe(true); const engaged = simulation.step(); expect(engaged.selectedIntent).toBe('engage');
    expect(simulation.setPlayerPosition({ x: 14, y: 6 })).toBe(true); const searched = simulation.step(); expect(searched.selectedIntent).toBe('search'); expect(searched.latestTrace?.observations.find((entry) => entry.kind === 'visual_actor')?.position).toBeUndefined();
    let state = simulation.getState(); for (let index = 0; index < 24; index += 1) state = simulation.step(); expect(state.beliefConfidence).toBeLessThan(0.35);
  });

  it('runs a three-member squad on the expanded map without overlapping positions', () => {
    const simulation = new TacticalWizardSimulation(); expect(tacticalWizardTestMap.width).toBeGreaterThanOrEqual(40); expect(tacticalWizardTestMap.height).toBeGreaterThanOrEqual(24);
    let state = simulation.getState(); expect(state.agents).toHaveLength(3); for (let index = 0; index < 100; index += 1) state = simulation.step(); expect(occupiedPositionsAreUnique(state.agents.map((agent) => agent.position))).toBe(true);
  });

  it('breaks a stationary firing loop with flank, crossfire, assault and regroup', () => {
    const simulation = new TacticalWizardSimulation(); expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.getState(); const seenTactics = new Set<string>(); const rolesByAgent = new Map<string, Set<string>>(); const visualIdentity = new Map(state.agents.map((agent) => [agent.id, agent.visualKey]));
    for (let index = 0; index < 180; index += 1) {
      state = simulation.step(); seenTactics.add(state.squad.tactic);
      for (const agent of state.agents) { const roles = rolesByAgent.get(agent.id) ?? new Set<string>(); roles.add(agent.role); rolesByAgent.set(agent.id, roles); expect(agent.visualKey).toBe(visualIdentity.get(agent.id)); }
      if (seenTactics.has('flank') && seenTactics.has('crossfire') && seenTactics.has('assault') && seenTactics.has('regroup')) break;
    }
    expect(seenTactics).toEqual(expect.objectContaining(new Set(['bounding', 'flank', 'crossfire', 'assault', 'regroup'])));
    expect([...rolesByAgent.values()].every((roles) => roles.size >= 2)).toBe(true);
    expect(state.runLog.some((entry) => entry.category === 'squad' && entry.event === 'tactic' && entry.data.to === 'crossfire')).toBe(true);
  });

  it('creates visibly separated tactical targets during crossfire instead of orbiting one point', () => {
    const simulation = new TacticalWizardSimulation(); expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.getState();
    for (let index = 0; index < 180 && state.squad.tactic !== 'crossfire'; index += 1) state = simulation.step();
    expect(state.squad.tactic).toBe('crossfire');
    const crossfire = state.agents.filter((agent) => agent.role === 'crossfire'); expect(crossfire).toHaveLength(2);
    const targets = crossfire.map((agent) => agent.tacticalTarget).filter((point): point is { x: number; y: number } => point !== null); expect(targets).toHaveLength(2);
    expect(Math.hypot(targets[0]!.x - targets[1]!.x, targets[0]!.y - targets[1]!.y)).toBeGreaterThan(3);
    expect(state.squad.spread).toBeGreaterThan(1);
  });

  it('records player, squad and soldier-agent actions in an exportable structured run log', () => {
    const simulation = new TacticalWizardSimulation(); expect(simulation.setPlayerPosition({ x: 4, y: 7 })).toBe(true); expect(simulation.nudgePlayer(1, 0)).toBe(true); simulation.emitNoise();
    let state = simulation.step(); for (let index = 0; index < 5; index += 1) state = simulation.step();
    expect(state.runLog.some((entry) => entry.category === 'player' && entry.event === 'player_move')).toBe(true);
    expect(state.runLog.some((entry) => entry.category === 'player' && entry.event === 'player_noise')).toBe(true);
    expect(state.runLog.some((entry) => entry.category === 'agent' && entry.event === 'decision')).toBe(true);
    expect(state.runLog.every((entry, index) => entry.sequence === index)).toBe(true);
    expect(state.runLog.some((entry) => entry.actorId === 'twr:rifle-squad:alpha')).toBe(true);
  });

  it('uses quarter-cell direct-control resolution and still creates footstep stimuli', () => {
    const simulation = new TacticalWizardSimulation(); expect(simulation.setPlayerPosition({ x: 4, y: 6 })).toBe(true); const before = simulation.getState().player; expect(simulation.nudgePlayer(0, -1)).toBe(true);
    const moved = simulation.getState(); expect(moved.movementResolution).toBe(0.25); expect(moved.player.y).toBe(before.y - 0.25); const state = simulation.step(); expect(state.latestTrace?.observations.some((entry) => entry.kind === 'noise' && entry.detail === 'footstep')).toBe(true);
  });
});
