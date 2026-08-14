import { describe, expect, it } from 'vitest';
import type { GridPoint } from '../../Apps/Workbench/src/simulation/navigation';
import {
  TacticalWizardSimulation as CurrentSimulation,
  recoveryPressureBand,
  recoverySecurityIsEffective,
} from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationCurrent';
import { TacticalWizardSimulation as WorkbenchSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV4';

describe('Tactical Wizard current runtime / recovery safety authority', () => {
  it('routes the production Workbench entry through one current runtime surface', () => {
    const simulation = new WorkbenchSimulation();
    const state = simulation.getState();
    expect(state.recoverySafety.runtimeVersion).toBe('current');
    expect(state.recoverySafety.active).toBe(false);
    expect(state.threatAuthority.bodyAttentionSeparated).toBe(true);
  });

  it('treats position, firing lane, weapon capability, and reaction readiness as separate security requirements', () => {
    expect(recoverySecurityIsEffective({
      positionReady: true,
      lineOfSightReady: true,
      fireLaneReady: true,
      weaponReady: true,
      reactionReady: true,
      requiresCombatSecurity: true,
    })).toBe(true);

    expect(recoverySecurityIsEffective({
      positionReady: true,
      lineOfSightReady: true,
      fireLaneReady: true,
      weaponReady: false,
      reactionReady: true,
      requiresCombatSecurity: true,
    })).toBe(false);

    expect(recoverySecurityIsEffective({
      positionReady: true,
      lineOfSightReady: true,
      fireLaneReady: true,
      weaponReady: false,
      reactionReady: true,
      requiresCombatSecurity: false,
    })).toBe(true);

    expect(recoveryPressureBand(0.2)).toBe('stable');
    expect(recoveryPressureBand(0.55)).toBe('pressured');
    expect(recoveryPressureBand(1)).toBe('unsafe');
  });

  it('commits rescue roles and dynamic geometry atomically instead of exposing an empty first recovery frame', () => {
    const simulation = new CurrentSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true);

    const state = advanceUntil(simulation, (candidate) => candidate.recovery.phase !== 'none', 360);
    expect(state.recovery.phase).not.toBe('none');
    expect(state.recoverySafety.active).toBe(true);
    expect(state.dynamicRecovery.active).toBe(true);
    expect(state.dynamicRecovery.stagePoint).not.toBeNull();
    expect(state.dynamicRecovery.treatmentPoint).not.toBeNull();
    expect(state.dynamicRecovery.securityPoint).not.toBeNull();
    expect(state.runLog.some((entry) => /committed atomically/i.test(entry.summary))).toBe(true);
  }, 20000);

  it('prefers an armed living member as rescue security when role choice permits it', () => {
    const simulation = new CurrentSimulation();
    expect(simulation.setAgentEquipment('twr:rifle-squad:alpha', { ammoRounds: 0 })).toBe(true);
    expect(simulation.setAgentEquipment('twr:rifle-squad:bravo', { ammoRounds: 60 })).toBe(true);
    expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true);

    const state = advanceUntil(simulation, (candidate) => candidate.recovery.phase !== 'none', 360);
    expect(state.recovery.covererId).toBe('twr:rifle-squad:bravo');
    expect(state.recoverySafety.security.agentId).toBe('twr:rifle-squad:bravo');
    expect(state.recoverySafety.security.weaponReady).toBe(true);
  }, 20000);

  it('turns repeated friendly-blocked rescue fire into a real alternate security point, while casualty blockage remains non-replanning', () => {
    const simulation = new CurrentSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true);
    let state = advanceUntil(simulation, (candidate) => candidate.dynamicRecovery.active, 360);
    const covererId = state.recovery.covererId;
    const rescuerId = state.recovery.rescuerId;
    const casualtyId = state.recovery.downedAgentId;
    expect(covererId).not.toBeNull();
    expect(rescuerId).not.toBeNull();
    expect(casualtyId).not.toBeNull();

    const runtime = simulation as unknown as RuntimeAccess;
    const coverer = runtime.members.find((member) => member.id === covererId)!;
    const initial = { ...state.dynamicRecovery.securityPoint! };
    const beforeCasualtyBlock = state.recoverySafety.safetyReplans;

    runtime.handleBlockedFire(coverer, 'rescue security squad-confirmed covering fire', casualtyId!);
    runtime.handleBlockedFire(coverer, 'rescue security squad-confirmed covering fire', casualtyId!);
    state = simulation.getState();
    expect(state.recoverySafety.safetyReplans).toBe(beforeCasualtyBlock);

    runtime.handleBlockedFire(coverer, 'rescue security squad-confirmed covering fire', rescuerId!);
    runtime.handleBlockedFire(coverer, 'rescue security squad-confirmed covering fire', rescuerId!);
    state = simulation.getState();

    expect(state.recoverySafety.safetyReplans).toBeGreaterThan(beforeCasualtyBlock);
    expect(state.dynamicRecovery.securityPoint).not.toEqual(initial);
    expect(state.recovery.phase).toBe('establish_cover');
    expect(state.runLog.some((entry) => /replaced a failed security point/i.test(entry.summary))).toBe(true);
  }, 20000);

  it('pauses and then aborts a rescue under sustained unsafe pressure when every surviving security option is dry', () => {
    const simulation = new CurrentSimulation();
    expect(simulation.setAgentEquipment('twr:rifle-squad:alpha', { ammoRounds: 0 })).toBe(true);
    expect(simulation.setAgentEquipment('twr:rifle-squad:bravo', { ammoRounds: 0 })).toBe(true);
    expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true);

    let state = advanceUntil(simulation, (candidate) => candidate.recovery.phase !== 'none', 360);
    expect(state.recoverySafety.security.weaponReady).toBe(false);
    expect(simulation.injectIncomingFireForTest(state.recovery.rescuerId!, { x: 8, y: 18 })).toBe(true);

    const runtime = simulation as unknown as RuntimeAccess;
    for (let cycle = 0; cycle < 8 && simulation.getState().recovery.phase !== 'none'; cycle += 1) {
      runtime.recoverySafetyPressure = 1.1;
      runtime.evaluateRecoverySafety(simulation.getState(), 'regression_sustained_pressure');
      simulation.advance(0.25);
    }
    state = simulation.getState();

    expect(state.recovery.phase).toBe('none');
    expect(state.recoverySafety.safetyAborts).toBeGreaterThan(0);
    expect(state.runLog.some((entry) => /aborted after sustained unsafe pressure/i.test(entry.summary))).toBe(true);
  }, 20000);

  it('keeps the previous soft-reaction recovery ownership contract in the current production runtime', () => {
    const simulation = new CurrentSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true);
    const state = advanceUntil(simulation, (candidate) => candidate.dynamicRecovery.active, 360);
    const rescuerId = state.recovery.rescuerId!;
    const runtime = simulation as unknown as RuntimeAccess;
    const rescuer = runtime.members.find((member) => member.id === rescuerId)!;
    const retreat = { x: rescuer.position.x - 5, y: rescuer.position.y };
    runtime.reactions.set(rescuerId, {
      kind: 'smoke_retreat',
      target: retreat,
      source: 'regression_soft_reaction',
      untilTick: runtime.logicalTick + 20,
    });

    const target = runtime.movementTarget(rescuer);
    if (target !== null) expect(distance(target, retreat)).toBeGreaterThan(0.01);
    expect(runtime.reactions.get(rescuerId)?.kind).toBe('smoke_retreat');
  }, 20000);
});

interface RuntimeMember {
  readonly id: string;
  position: GridPoint;
}

interface RuntimeAccess {
  members: RuntimeMember[];
  logicalTick: number;
  recoverySafetyPressure: number;
  reactions: Map<string, { readonly kind: string; readonly target: GridPoint | null; readonly source: string; readonly untilTick: number }>;
  handleBlockedFire: (member: RuntimeMember, reason: string, blockerId: string) => void;
  movementTarget: (member: RuntimeMember) => GridPoint | null;
  evaluateRecoverySafety: (state: ReturnType<CurrentSimulation['getState']>, source: string) => void;
}

function advanceUntil(
  simulation: CurrentSimulation,
  predicate: (state: ReturnType<CurrentSimulation['getState']>) => boolean,
  maxFrames: number,
): ReturnType<CurrentSimulation['getState']> {
  let state = simulation.getState();
  for (let frame = 0; frame < maxFrames && !predicate(state); frame += 1) state = simulation.advance(1 / 30);
  return state;
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
