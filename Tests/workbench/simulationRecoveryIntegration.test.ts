import { describe, expect, it } from 'vitest';
import type { GridPoint } from '../../Apps/Workbench/src/simulation/navigation';
import {
  TacticalWizardSimulation,
  recoveryReactionMayPreempt,
  shouldPreserveRecoveryPhaseOnReplan,
} from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationExecutionIntegrated';

describe('Tactical Wizard recovery execution integration', () => {
  it('keeps an active rescuer on the rescue route when smoke/dodge style reactions are active', () => {
    const simulation = new TacticalWizardSimulation();
    const runtime = simulation as unknown as RuntimeAccess;
    const alpha = runtime.members.find((member) => member.id === 'twr:rifle-squad:alpha')!;
    const bravo = runtime.members.find((member) => member.id === 'twr:rifle-squad:bravo')!;
    const charlie = runtime.members.find((member) => member.id === 'twr:rifle-squad:charlie')!;
    const approachTarget = { x: alpha.position.x + 4, y: alpha.position.y };
    const retreatTarget = { x: alpha.position.x - 4, y: alpha.position.y };

    runtime.rescuePlan = {
      downedAgentId: charlie.id,
      rescuerId: alpha.id,
      covererId: bravo.id,
      startedTick: runtime.logicalTick,
      coverReadyTick: runtime.logicalTick,
      approachTarget: { ...approachTarget },
      phase: 'approach',
      treatmentSeconds: 0,
    };
    runtime.reactions.set(alpha.id, {
      kind: 'smoke_retreat',
      target: { ...retreatTarget },
      source: 'regression_smoke',
      untilTick: runtime.logicalTick + 20,
    });

    const proposals = Array.from({ length: 4 }, () => runtime.movementTarget(alpha)).filter((point): point is GridPoint => point !== null);
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals.some((point) => distance(point, approachTarget) < 0.01)).toBe(true);
    expect(proposals.every((point) => distance(point, retreatTarget) > 0.01)).toBe(true);
    expect(runtime.reactions.get(alpha.id)?.kind).toBe('smoke_retreat');
  });

  it('preserves approach/treat commitment across non-structural recovery geometry replans', () => {
    const simulation = new TacticalWizardSimulation();
    const runtime = simulation as unknown as RuntimeAccess;
    const alpha = runtime.members.find((member) => member.id === 'twr:rifle-squad:alpha')!;
    const bravo = runtime.members.find((member) => member.id === 'twr:rifle-squad:bravo')!;
    const charlie = runtime.members.find((member) => member.id === 'twr:rifle-squad:charlie')!;

    runtime.rescuePlan = {
      downedAgentId: charlie.id,
      rescuerId: alpha.id,
      covererId: bravo.id,
      startedTick: runtime.logicalTick,
      coverReadyTick: runtime.logicalTick,
      approachTarget: { x: charlie.position.x - 1, y: charlie.position.y },
      phase: 'treat',
      treatmentSeconds: 1.1,
    };

    runtime.maintainDynamicRecovery(simulation.getState(), true, 'confirmed_threat_shift');

    expect(runtime.rescuePlan?.phase).toBe('treat');
    expect(runtime.rescuePlan?.treatmentSeconds).toBeCloseTo(1.1, 6);
  });

  it('denies lower-priority logistics admission during recovery and ignores the casualty as a lane-replan trigger', () => {
    const simulation = new TacticalWizardSimulation();
    const runtime = simulation as unknown as RuntimeAccess;
    const alpha = runtime.members.find((member) => member.id === 'twr:rifle-squad:alpha')!;
    const bravo = runtime.members.find((member) => member.id === 'twr:rifle-squad:bravo')!;
    const charlie = runtime.members.find((member) => member.id === 'twr:rifle-squad:charlie')!;

    runtime.rescuePlan = {
      downedAgentId: charlie.id,
      rescuerId: alpha.id,
      covererId: bravo.id,
      startedTick: runtime.logicalTick,
      coverReadyTick: runtime.logicalTick,
      approachTarget: { x: charlie.position.x - 1, y: charlie.position.y },
      phase: 'establish_cover',
      treatmentSeconds: 0,
    };

    expect(runtime.canDetachForResupply(alpha.id, simulation.getState())).toBe(false);

    const before = simulation.getState().combatAuthority.rescueLaneReplans;
    runtime.handleBlockedFire(bravo, 'rescue security squad-confirmed covering fire', charlie.id);
    runtime.handleBlockedFire(bravo, 'rescue security squad-confirmed covering fire', charlie.id);
    expect(simulation.getState().combatAuthority.rescueLaneReplans).toBe(before);
  });

  it('distinguishes true recovery interruptions from soft reactions and structural replans', () => {
    expect(recoveryReactionMayPreempt('stunned')).toBe(true);
    expect(recoveryReactionMayPreempt('downed')).toBe(true);
    expect(recoveryReactionMayPreempt('smoke_retreat')).toBe(false);
    expect(recoveryReactionMayPreempt('dodge')).toBe(false);

    expect(shouldPreserveRecoveryPhaseOnReplan('confirmed_threat_shift')).toBe(true);
    expect(shouldPreserveRecoveryPhaseOnReplan('incoming_fire_shift')).toBe(true);
    expect(shouldPreserveRecoveryPhaseOnReplan('manual_refresh')).toBe(true);
    expect(shouldPreserveRecoveryPhaseOnReplan('route_invalid')).toBe(false);
    expect(shouldPreserveRecoveryPhaseOnReplan('security_lane_lost')).toBe(false);
    expect(shouldPreserveRecoveryPhaseOnReplan('treatment_invalid')).toBe(false);
  });
});

interface RuntimeMember {
  readonly id: string;
  position: GridPoint;
}

interface RuntimeAccess {
  members: RuntimeMember[];
  logicalTick: number;
  movementTarget: (member: RuntimeMember) => GridPoint | null;
  reactions: Map<string, {
    readonly kind: string;
    readonly target: GridPoint | null;
    readonly source: string;
    readonly untilTick: number;
  }>;
  rescuePlan: {
    readonly downedAgentId: string;
    readonly rescuerId: string;
    readonly covererId: string | null;
    readonly startedTick: number;
    readonly coverReadyTick: number;
    approachTarget: GridPoint;
    phase: 'establish_cover' | 'approach' | 'treat';
    treatmentSeconds: number;
  } | null;
  maintainDynamicRecovery: (
    state: ReturnType<TacticalWizardSimulation['getState']>,
    force: boolean,
    reason: 'confirmed_threat_shift',
  ) => void;
  canDetachForResupply: (agentId: string, state: unknown) => boolean;
  handleBlockedFire: (member: RuntimeMember, reason: string, blockerId: string) => void;
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
