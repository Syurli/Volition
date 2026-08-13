import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV15';

const IDS = ['twr:rifle-squad:alpha', 'twr:rifle-squad:bravo', 'twr:rifle-squad:charlie'] as const;

describe('Tactical Wizard V15 contact hypotheses and directional search', () => {
  it('records a last-seen movement direction, verifies the old LKP empty, and stops direct fire at that cleared point', () => {
    const simulation = new TacticalWizardSimulation();
    for (const id of IDS) expect(simulation.setAgentEquipment(id, { grenades: 0 })).toBe(true);

    expect(simulation.setPlayerPosition({ x: 12.25, y: 9.61 })).toBe(true);
    let state = simulation.getState();
    for (let frame = 0; frame < 2400 && !state.agents.some((agent) => agent.alive && agent.targetVisible); frame += 1) {
      state = simulation.advance(1 / 30);
    }
    expect(state.agents.some((agent) => agent.alive && agent.targetVisible)).toBe(true);

    expect(simulation.setPlayerPosition({ x: 13.25, y: 9.61 })).toBe(true);
    for (let frame = 0; frame < 18; frame += 1) state = simulation.advance(1 / 30);
    expect(simulation.setPlayerPosition({ x: 14.25, y: 9.61 })).toBe(true);
    for (let frame = 0; frame < 18; frame += 1) state = simulation.advance(1 / 30);

    expect(state.contactTrack.lastConfirmedPosition).not.toBeNull();
    expect(state.contactTrack.egressDirection).not.toBeNull();
    expect(state.contactTrack.egressDirection!.x).toBeGreaterThan(0.65);

    const lkp = { ...state.contactTrack.lastConfirmedPosition! };
    expect(simulation.setPlayerPosition({ x: 46, y: 27 })).toBe(true);

    let clearedSequence = -1;
    for (let frame = 0; frame < 4200; frame += 1) {
      state = simulation.advance(1 / 30);
      if (state.contactTrack.lkpCleared) {
        clearedSequence = state.runLog.at(-1)?.sequence ?? 0;
        break;
      }
    }

    expect(state.squad.tactic).toBe('sweep');
    expect(state.contactTrack.lkpCleared).toBe(true);
    expect(state.contactTrack.verifiedBy.length).toBeGreaterThan(0);
    expect(state.contactTrack.frontier.length).toBeGreaterThan(0);
    expect(state.contactTrack.frontier.some((point) => point.x > lkp.x)).toBe(true);

    for (let frame = 0; frame < 360; frame += 1) state = simulation.advance(1 / 30);
    const postClearDirectFire = state.runLog.filter((entry) => entry.sequence > clearedSequence
      && entry.event === 'fire'
      && /^.+ fired:/i.test(entry.summary)
      && isSamePoint(entry.data.target, lkp));
    expect(postClearDirectFire).toHaveLength(0);
    expect(state.runLog.some((entry) => /is not a valid direct-fire target/i.test(entry.summary)
      && (entry.data.targetKind === 'cleared_lkp' || entry.data.targetKind === 'stale_lkp'))).toBe(true);
  }, 30000);

  it('keeps exact hidden player coordinates out of the contact track after visual loss', () => {
    const simulation = new TacticalWizardSimulation();
    for (const id of IDS) expect(simulation.setAgentEquipment(id, { grenades: 0 })).toBe(true);
    expect(simulation.setPlayerPosition({ x: 12.25, y: 9.61 })).toBe(true);

    let state = simulation.getState();
    for (let frame = 0; frame < 2400 && !state.agents.some((agent) => agent.targetVisible); frame += 1) state = simulation.advance(1 / 30);
    expect(state.agents.some((agent) => agent.targetVisible)).toBe(true);
    const lastSeen = { ...state.contactTrack.lastConfirmedPosition! };

    expect(simulation.setPlayerPosition({ x: 46, y: 27 })).toBe(true);
    for (let frame = 0; frame < 120; frame += 1) state = simulation.advance(1 / 30);

    expect(state.agents.every((agent) => !agent.targetVisible)).toBe(true);
    expect(state.contactTrack.lastConfirmedPosition).toEqual(lastSeen);
    expect(state.contactTrack.lastConfirmedPosition).not.toEqual(state.player);
  }, 20000);
});

function isSamePoint(value: unknown, expected: { readonly x: number; readonly y: number }): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const point = value as { readonly x?: unknown; readonly y?: unknown };
  return typeof point.x === 'number' && typeof point.y === 'number'
    && Math.hypot(point.x - expected.x, point.y - expected.y) <= 1.1;
}
