import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV15';

const IDS = ['twr:rifle-squad:alpha', 'twr:rifle-squad:bravo', 'twr:rifle-squad:charlie'] as const;

describe('Tactical Wizard V15 contact hypotheses and directional search', () => {
  it('records observed movement, verifies the old LKP empty, and stops direct fire at that cleared point', () => {
    const simulation = new TacticalWizardSimulation();
    for (const id of IDS) expect(simulation.setAgentEquipment(id, { grenades: 0 })).toBe(true);

    expect(simulation.setPlayerPosition({ x: 12.25, y: 9.61 })).toBe(true);
    let state = advanceUntil(simulation, (candidate) => candidate.contactTrack.status === 'confirmed', 3000);
    expect(state.contactTrack.status).toBe('confirmed');
    expect(state.contactTrack.lastConfirmedPosition).not.toBeNull();

    // Use short in-LOS steps and wait for the contact track itself to confirm
    // each sample. The test therefore validates observed movement, not a test
    // teleport that happened to occur between perception ticks.
    expect(simulation.setPlayerPosition({ x: 12.65, y: 9.61 })).toBe(true);
    state = advanceUntil(simulation, (candidate) => near(candidate.contactTrack.lastConfirmedPosition, { x: 12.65, y: 9.61 }), 240);
    expect(near(state.contactTrack.lastConfirmedPosition, { x: 12.65, y: 9.61 })).toBe(true);

    expect(simulation.setPlayerPosition({ x: 13.05, y: 9.61 })).toBe(true);
    state = advanceUntil(simulation, (candidate) => near(candidate.contactTrack.lastConfirmedPosition, { x: 13.05, y: 9.61 }), 240);
    expect(near(state.contactTrack.lastConfirmedPosition, { x: 13.05, y: 9.61 })).toBe(true);
    expect(state.contactTrack.egressDirection).not.toBeNull();
    expect(state.contactTrack.egressDirection!.x).toBeGreaterThan(0.65);

    const lkp = { ...state.contactTrack.lastConfirmedPosition! };
    expect(simulation.setPlayerPosition({ x: 46, y: 27 })).toBe(true);

    state = advanceUntil(simulation, (candidate) => candidate.contactTrack.lkpCleared, 4800);
    expect(state.squad.tactic).toBe('sweep');
    expect(state.contactTrack.lkpCleared).toBe(true);
    expect(state.contactTrack.verifiedBy.length).toBeGreaterThan(0);
    expect(state.contactTrack.frontier.length).toBeGreaterThan(0);
    expect(state.contactTrack.frontier.some((point) => point.x > lkp.x)).toBe(true);
    expect(state.runLog.some((entry) => /Negative visual evidence verified the last confirmed point empty/i.test(entry.summary))).toBe(true);

    const clearedSequence = state.runLog.at(-1)?.sequence ?? 0;
    for (let frame = 0; frame < 360; frame += 1) state = simulation.advance(1 / 30);
    const postClearDirectFire = state.runLog.filter((entry) => entry.sequence > clearedSequence
      && entry.event === 'fire'
      && /^.+ fired:/i.test(entry.summary)
      && isSamePoint(entry.data.target, lkp));
    expect(postClearDirectFire).toHaveLength(0);
  }, 35000);

  it('never copies a hidden live player coordinate into the exact contact track after Host LOS is gone', () => {
    const simulation = new TacticalWizardSimulation();
    for (const id of IDS) expect(simulation.setAgentEquipment(id, { grenades: 0 })).toBe(true);
    expect(simulation.setPlayerPosition({ x: 12.25, y: 9.61 })).toBe(true);

    let state = advanceUntil(simulation, (candidate) => candidate.contactTrack.status === 'confirmed', 3000);
    expect(state.contactTrack.status).toBe('confirmed');
    const lastSeen = { ...state.contactTrack.lastConfirmedPosition! };

    expect(simulation.setPlayerPosition({ x: 46, y: 27 })).toBe(true);
    state = advanceUntil(simulation, (candidate) => candidate.contactTrack.status !== 'confirmed', 240);
    expect(state.contactTrack.status).not.toBe('confirmed');
    for (let frame = 0; frame < 120; frame += 1) state = simulation.advance(1 / 30);

    expect(state.contactTrack.lastConfirmedPosition).toEqual(lastSeen);
    expect(state.contactTrack.lastConfirmedPosition).not.toEqual(state.player);
  }, 20000);
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

function near(value: { readonly x: number; readonly y: number } | null, expected: { readonly x: number; readonly y: number }): boolean {
  return value !== null && Math.hypot(value.x - expected.x, value.y - expected.y) <= 0.15;
}

function isSamePoint(value: unknown, expected: { readonly x: number; readonly y: number }): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const point = value as { readonly x?: unknown; readonly y?: unknown };
  return typeof point.x === 'number' && typeof point.y === 'number'
    && Math.hypot(point.x - expected.x, point.y - expected.y) <= 1.1;
}
