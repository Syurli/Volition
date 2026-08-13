import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV16';
import type { GridPoint } from '../../Apps/Workbench/src/simulation/navigation';

interface UnsafeMember {
  readonly id: string;
  position: GridPoint;
  facing: GridPoint;
  firePulse: number;
  targetVisible: boolean;
  task: string;
  role: string;
  tacticalTarget: GridPoint | null;
  locomotionMode: string;
  grenadeCount: number;
  coverSlot: null;
}

interface UnsafeHost {
  members: UnsafeMember[];
  alertState: 'idle' | 'pending' | 'active';
  tactic: string;
  sharedLastKnownPosition: GridPoint | null;
  suppressorId: string | null;
  moverId: string | null;
  observerId: string | null;
  tryFire: (member: UnsafeMember, target: GridPoint, reason: string) => void;
  tryGrenade: (member: UnsafeMember) => boolean;
  canSeePlayer: (member: UnsafeMember) => boolean;
}

describe('Tactical Wizard V16 combat authority', () => {
  it('preempts grenade resupply while current visual contact is the higher operational commitment', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentEquipment('twr:rifle-squad:bravo', { ammoRounds: 96, grenades: 0 })).toBe(true);

    let state = simulation.advance(0.25);
    expect(state.command.activeResupplyAgentId).toBe('twr:rifle-squad:bravo');
    expect(state.command.activeResupplySupplyId).not.toBeNull();

    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    state = advanceUntil(simulation, (candidate) => candidate.combatAuthority.confirmedVisualIds.length > 0
      && candidate.command.activeResupplyAgentId !== 'twr:rifle-squad:bravo'
      && candidate.combatAuthority.logisticsPreemptions > 0, 480);

    expect(state.combatAuthority.confirmedVisualIds.length).toBeGreaterThan(0);
    expect(state.command.activeResupplyAgentId).not.toBe('twr:rifle-squad:bravo');
    expect(state.combatAuthority.logisticsPreemptions).toBeGreaterThan(0);
    expect(state.runLog.some((entry) => /Lower-priority logistics was preempted/i.test(entry.summary))).toBe(true);
  }, 20000);

  it('allows a fire-support member to shoot a live squad-confirmed target without requiring that member to be the visual reporter', () => {
    const simulation = new TacticalWizardSimulation();
    const host = simulation as unknown as UnsafeHost;
    const alpha = member(host, 'twr:rifle-squad:alpha');
    const bravo = member(host, 'twr:rifle-squad:bravo');
    const charlie = member(host, 'twr:rifle-squad:charlie');

    // Keep Bravo's weapon line on the known-open patrol row while Charlie
    // reports the same live target from an offset row. Bravo deliberately faces
    // away so this exercises squad-confirmed fire authority rather than self FOV.
    alpha.position = { x: 6, y: 4 };
    alpha.facing = { x: -1, y: 0 };
    alpha.coverSlot = null;
    bravo.position = { x: 10, y: 2 };
    bravo.facing = { x: -1, y: 0 };
    bravo.coverSlot = null;
    charlie.position = { x: 14, y: 4 };
    charlie.facing = { x: 0, y: -1 };
    charlie.coverSlot = null;

    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.advance(1 / 30);
    expect(host.canSeePlayer(charlie)).toBe(true);
    // The motion/posture layer may orient support members during the frame.
    // Re-establish the deliberate non-reporter FOV before exercising the fire
    // authorization call itself.
    bravo.facing = { x: -1, y: 0 };
    expect(host.canSeePlayer(bravo)).toBe(false);
    expect(state.combatAuthority.confirmedVisualIds).toContain(charlie.id);

    const beforeAmmo = state.agents.find((agent) => agent.id === bravo.id)!.ammoRounds;
    bravo.firePulse = 0;
    host.tryFire(bravo, state.player, 'rescue security squad-confirmed covering fire');
    state = simulation.getState();

    expect(bravo.firePulse).toBeGreaterThan(0);
    expect(state.agents.find((agent) => agent.id === bravo.id)!.ammoRounds).toBe(beforeAmmo - 3);
    expect(state.runLog.some((entry) => entry.actorId === bravo.id && /fired: rescue security squad-confirmed covering fire/i.test(entry.summary))).toBe(true);
  }, 10000);

  it('gives rifle fire priority over close-range grenades and forbids grenades during regroup', () => {
    const simulation = new TacticalWizardSimulation();
    const host = simulation as unknown as UnsafeHost;
    const alpha = member(host, 'twr:rifle-squad:alpha');
    const bravo = member(host, 'twr:rifle-squad:bravo');

    alpha.position = { x: 10, y: 2 };
    alpha.facing = { x: 1, y: 0 };
    alpha.coverSlot = null;
    bravo.position = { x: 10, y: 4 };
    bravo.facing = { x: 1, y: 0 };
    bravo.coverSlot = null;
    bravo.task = 'suppress';
    bravo.role = 'suppressor';
    bravo.grenadeCount = 5;

    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    simulation.advance(1 / 30);
    host.alertState = 'active';
    host.tactic = 'bounding';
    host.sharedLastKnownPosition = { x: 14, y: 2 };

    const beforeClose = bravo.grenadeCount;
    expect(host.tryGrenade(bravo)).toBe(false);
    expect(bravo.grenadeCount).toBe(beforeClose);

    bravo.position = { x: 6, y: 2 };
    bravo.facing = { x: 1, y: 0 };
    bravo.task = 'regroup';
    host.tactic = 'regroup';
    host.sharedLastKnownPosition = { x: 14, y: 2 };
    const beforeRegroup = bravo.grenadeCount;
    expect(host.tryGrenade(bravo)).toBe(false);
    expect(bravo.grenadeCount).toBe(beforeRegroup);
  }, 10000);

  it('adds an explicit support burst when a support shooter has a clean live line but has not fully settled', () => {
    const simulation = new TacticalWizardSimulation();
    const host = simulation as unknown as UnsafeHost & { maintainFireSupport: (state: ReturnType<TacticalWizardSimulation['getState']>) => void };
    const alpha = member(host, 'twr:rifle-squad:alpha');
    const bravo = member(host, 'twr:rifle-squad:bravo');

    alpha.position = { x: 10, y: 2 };
    alpha.facing = { x: 1, y: 0 };
    alpha.coverSlot = null;
    alpha.task = 'suppress';
    alpha.role = 'suppressor';
    alpha.tacticalTarget = { x: 11.5, y: 2 };
    alpha.locomotionMode = 'lateral';
    alpha.firePulse = 0;

    bravo.position = { x: 8, y: 4 };
    bravo.facing = { x: -1, y: 0 };
    bravo.coverSlot = null;

    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    simulation.advance(1 / 30);
    host.alertState = 'active';
    host.tactic = 'bounding';
    host.suppressorId = alpha.id;
    host.moverId = bravo.id;
    host.sharedLastKnownPosition = { x: 14, y: 2 };

    const state = simulation.getState();
    const beforeAmmo = state.agents.find((agent) => agent.id === alpha.id)!.ammoRounds;
    host.maintainFireSupport(state);
    const after = simulation.getState();

    expect(alpha.firePulse).toBeGreaterThan(0);
    expect(after.agents.find((agent) => agent.id === alpha.id)!.ammoRounds).toBe(beforeAmmo - 3);
    expect(after.combatAuthority.supplementalBursts).toBeGreaterThan(0);
    expect(after.runLog.some((entry) => /combat authority squad-confirmed support burst/i.test(entry.summary))).toBe(true);
  }, 10000);
});

function member(host: UnsafeHost, id: string): UnsafeMember {
  const value = host.members.find((entry) => entry.id === id);
  if (value === undefined) throw new Error(`Missing member ${id}`);
  return value;
}

function advanceUntil(
  simulation: TacticalWizardSimulation,
  predicate: (state: ReturnType<TacticalWizardSimulation['getState']>) => boolean,
  maxFrames: number,
): ReturnType<TacticalWizardSimulation['getState']> {
  let state = simulation.getState();
  for (let frame = 0; frame < maxFrames && !predicate(state); frame += 1) state = simulation.advance(1 / 30);
  return state;
}
