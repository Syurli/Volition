import { describe, expect, it } from 'vitest';
import {
  TacticalWizardSimulation,
  shouldForceTravelFacing,
} from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV18';

describe('Tactical Wizard V18 dynamic recovery / acoustic awareness', () => {
  it('replans treatment and security geometry when the inferred threat direction materially changes', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true);

    let state = advanceUntil(simulation, (candidate) => candidate.dynamicRecovery.active, 360);
    expect(state.dynamicRecovery.active).toBe(true);
    expect(state.dynamicRecovery.stagePoint).not.toBeNull();
    expect(state.dynamicRecovery.treatmentPoint).not.toBeNull();
    expect(state.dynamicRecovery.securityPoint).not.toBeNull();

    expect(simulation.injectIncomingFireForTest('twr:rifle-squad:alpha', { x: 8, y: 18 })).toBe(true);
    state = advanceUntil(simulation, (candidate) => candidate.dynamicRecovery.threatSource === 'incoming_sector', 180);
    const firstRevision = state.dynamicRecovery.revision;
    const firstThreat = state.dynamicRecovery.threatAnchor;
    expect(firstThreat).not.toBeNull();

    expect(simulation.injectIncomingFireForTest('twr:rifle-squad:alpha', { x: 31, y: 4 })).toBe(true);
    state = advanceUntil(simulation, (candidate) => candidate.dynamicRecovery.revision > firstRevision, 240);

    expect(state.dynamicRecovery.revision).toBeGreaterThan(firstRevision);
    expect(state.dynamicRecovery.threatAnchor).not.toEqual(firstThreat);
    expect(['incoming_fire_shift', 'security_lane_lost']).toContain(state.dynamicRecovery.lastReplanReason);
    expect(state.runLog.some((entry) => /Dynamic recovery geometry replanned/i.test(entry.summary))).toBe(true);
  }, 30000);

  it('lets the rescuer stage toward the casualty while final security is still being established', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true);

    let state = advanceUntil(simulation, (candidate) => candidate.dynamicRecovery.active, 360);
    const rescuerId = state.recovery.rescuerId;
    expect(rescuerId).not.toBeNull();
    const start = state.agents.find((agent) => agent.id === rescuerId)!.position;
    const stage = state.dynamicRecovery.stagePoint!;
    const startDistance = distance(start, stage);

    for (let frame = 0; frame < 90 && state.recovery.phase === 'establish_cover'; frame += 1) {
      state = simulation.advance(1 / 30);
    }
    const end = state.agents.find((agent) => agent.id === rescuerId)!.position;

    expect(state.recovery.phase !== 'establish_cover' || distance(end, stage) < startDistance).toBe(true);
    expect(state.dynamicRecovery.treatmentPoint).not.toBeNull();
  }, 20000);

  it('turns each rifle shot into a long-range acoustic stimulus without requiring a hit', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 11.15, y: 17.66 })).toBe(true);
    expect(simulation.playerFireAt({ x: 31, y: 17.66 })).toBe(true);

    let state = simulation.getState();
    expect(state.acousticAwareness.hearingRadius).toBe(28);
    expect(state.acousticAwareness.visionRange).toBe(16);
    expect(state.acousticAwareness.playerWeaponRange).toBe(26);
    expect(state.acousticAwareness.aiSupportRange).toBe(24);
    expect(state.acousticAwareness.episodeId).toBe(1);
    expect(state.runLog.some((entry) => entry.event === 'player_noise' && /rifle shot emitted an acoustic stimulus/i.test(entry.summary))).toBe(true);

    state = simulation.advance(0.25);
    expect(state.acousticAwareness.lastListenerIds.length).toBeGreaterThan(0);
  });

  it('forces long search/recovery travel to face the route instead of backpedaling indefinitely', () => {
    expect(shouldForceTravelFacing({
      locomotionMode: 'backpedal',
      hasVisual: false,
      breakContact: false,
      task: 'search_sector',
      targetDistance: 8,
      consecutiveBackpedalFrames: 1,
    })).toBe(true);

    expect(shouldForceTravelFacing({
      locomotionMode: 'backpedal',
      hasVisual: true,
      breakContact: false,
      task: 'suppress',
      targetDistance: 3,
      consecutiveBackpedalFrames: 25,
    })).toBe(true);

    expect(shouldForceTravelFacing({
      locomotionMode: 'backpedal',
      hasVisual: false,
      breakContact: true,
      task: 'search_sector',
      targetDistance: 9,
      consecutiveBackpedalFrames: 80,
    })).toBe(false);
  });
});

function advanceUntil(
  simulation: TacticalWizardSimulation,
  predicate: (state: ReturnType<TacticalWizardSimulation['getState']>) => boolean,
  maxFrames: number,
): ReturnType<TacticalWizardSimulation['getState']> {
  let state = simulation.getState();
  for (let frame = 0; frame < maxFrames && !predicate(state); frame += 1) state = simulation.advance(1 / 30);
  return state;
}

function distance(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
