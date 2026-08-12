import { findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid } from './tacticalWizardTestMapV7';
import type { RunLogCategory, RunLogEvent, RunLogValue } from './tacticalWizardSimulationV3';
import {
  TacticalWizardSimulation as TacticalWizardSimulationV9,
  tacticalWizardTestMap,
  type BuddyRole,
  type CombatReaction,
  type CommandRank,
  type CoverState,
  type GrenadeKind,
  type GrenadeTacticalEffect,
  type GrenadeVisual,
  type LocomotionMode,
  type LogisticsTask,
  type PlayerCombatView,
  type SimulationOverlaySettings,
  type SpecialAction,
  type SupplyCacheKind,
  type SupplyCacheView as SupplyCacheViewV9,
  type TacticalEffectView,
  type TacticalOpportunityPurpose,
  type TacticalTask,
  type TacticalWizardAgentView as TacticalWizardAgentViewV9,
  type TacticalWizardSimulationState as TacticalWizardSimulationStateV9,
} from './tacticalWizardSimulationV9';

export type {
  BuddyRole,
  CombatReaction,
  CommandRank,
  CoverState,
  GrenadeKind,
  GrenadeTacticalEffect,
  GrenadeVisual,
  LocomotionMode,
  LogisticsTask,
  PlayerCombatView,
  SimulationOverlaySettings,
  SpecialAction,
  SupplyCacheKind,
  TacticalEffectView,
  TacticalOpportunityPurpose,
  TacticalTask,
};
export { tacticalWizardTestMap };

export type RecoveryTask =
  | 'none'
  | 'self_treat'
  | 'rescue_cover'
  | 'rescue_wait_cover'
  | 'rescue_move'
  | 'rescue_treat'
  | 'resupply_medical';

export type RescuePhase = 'none' | 'establish_cover' | 'approach' | 'treat';

export interface SupplyCacheView extends SupplyCacheViewV9 {
  readonly medkits: number;
}

export interface MovementSpeedFactors {
  readonly base: number;
  readonly locomotion: number;
  readonly health: number;
  readonly firing: number;
  readonly task: number;
  readonly reaction: number;
  readonly recovery: number;
}

export interface TacticalWizardAgentView extends TacticalWizardAgentViewV9 {
  readonly moveSpeed: number;
  readonly medkitCount: number;
  readonly medkitCapacity: number;
  readonly recoveryTask: RecoveryTask;
  readonly recoveryTargetId: string | null;
  readonly recoveryProgress: number;
  readonly speedFactors: MovementSpeedFactors;
}

export interface RecoveryCoordinationView {
  readonly phase: RescuePhase;
  readonly downedAgentId: string | null;
  readonly rescuerId: string | null;
  readonly covererId: string | null;
  readonly approachTarget: GridPoint | null;
  readonly treatmentProgress: number;
  readonly medicalResupplyAgentId: string | null;
  readonly medicalResupplySupplyId: string | null;
}

export interface TacticalWizardSimulationState extends Omit<TacticalWizardSimulationStateV9, 'agents' | 'supplies'> {
  readonly agents: readonly TacticalWizardAgentView[];
  readonly supplies: readonly SupplyCacheView[];
  readonly recovery: RecoveryCoordinationView;
}

interface HostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  facing: GridPoint;
  firePulse: number;
  targetVisible: boolean;
  task: TacticalTask;
  role: string;
}

interface HostAccess {
  members: HostMember[];
  logicalTick: number;
  motionFrame: number;
  alertState: 'idle' | 'pending' | 'active';
  suppressorId: string | null;
  moverId: string | null;
  observerId: string | null;
  movementTarget: (member: HostMember) => GridPoint | null;
  tryFire: (member: HostMember, target: GridPoint, reason: string) => void;
  tryGrenade: (member: HostMember) => boolean;
  applyRoles: () => void;
  refreshTacticalPlan: () => void;
  pushEvent: (message: string) => void;
  log: (
    category: RunLogCategory,
    actorId: string,
    actorLabel: string,
    event: RunLogEvent,
    summary: string,
    data: Readonly<Record<string, RunLogValue>>,
  ) => void;
}

interface V9Internals {
  reactions: Map<string, { readonly kind: CombatReaction; readonly target: GridPoint | null; readonly source: string; readonly untilTick: number }>;
}

interface RescuePlan {
  readonly downedAgentId: string;
  readonly rescuerId: string;
  readonly covererId: string | null;
  readonly startedTick: number;
  readonly coverReadyTick: number;
  readonly approachTarget: GridPoint;
  phase: Exclude<RescuePhase, 'none'>;
  treatmentSeconds: number;
}

interface SelfTreatment {
  seconds: number;
}

interface MedicalResupply {
  readonly agentId: string;
  readonly supplyId: string;
}

const BASE_MOVE_SPEED = 4.8;
const MEDKIT_CAPACITY = 2;
const DEFAULT_MEDKITS = 1;
const SUPPLY_MEDKITS = 2;
const SELF_TREAT_HEALTH = 40;
const SELF_TREAT_SECONDS = 1.35;
const SELF_TREAT_HEAL = 38;
const RESCUE_COVER_TICKS = 4;
const RESCUE_TREAT_SECONDS = 2.2;
const RESCUE_HEALTH = 55;
const RESCUE_APPROACH_RADIUS = 0.78;
const SUPPLY_PICKUP_RADIUS = 0.78;
const MEDICAL_RESUPPLY_HEALTH = 45;

/**
 * V10 adds Host-owned medical recovery and state-dependent locomotion.
 *
 * The long-lived cognition/tactical plan remains unchanged. Recovery is a
 * coordination layer: establish a base-of-fire, move one rescuer, treat, then
 * return all surviving members to the normal squad plan. Movement speed is an
 * actual motion-frame budget, not display metadata: V7 keeps its directional
 * forward/lateral/backpedal scaling while V10 gates motion frames for health,
 * firing, task, reaction and recovery costs.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationV9 {
  private medkits = new Map<string, number>();
  private supplyMedkits = new Map<string, number>();
  private rescuePlan: RescuePlan | null = null;
  private selfTreatments = new Map<string, SelfTreatment>();
  private medicalResupply: MedicalResupply | null = null;
  private movementCredits = new Map<string, number>();

  constructor() {
    super();
    this.initializeMedicalState();
    this.installRecoveryHooks();
    const host = this.recoveryHost();
    host.pushEvent('V10: medical supplies, cover-then-rescue coordination and state-dependent movement speed enabled.');
    host.log('system', 'simulation', 'Volition Simulation', 'session', 'V10 medical recovery / dynamic locomotion layer enabled.', {
      defaultMedkits: DEFAULT_MEDKITS,
      supplyMedkits: SUPPLY_MEDKITS,
      rescueHealth: RESCUE_HEALTH,
      baseMoveSpeed: BASE_MOVE_SPEED,
    });
  }

  override reset(): TacticalWizardSimulationState {
    super.reset();
    this.rescuePlan = null;
    this.selfTreatments.clear();
    this.medicalResupply = null;
    this.movementCredits.clear();
    this.initializeMedicalState();
    this.recoveryHost().pushEvent('V10: medical inventory / rescue coordination reset.');
    return this.getState();
  }

  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    const delta = Math.max(0, Math.min(1, deltaSeconds));
    this.ensureRecoveryPlanning();
    super.advance(delta);
    this.pickupMedicalSupplies();
    this.ensureRecoveryPlanning();
    this.advanceRecovery(delta);
    this.advanceSelfTreatment(delta);
    return this.getState();
  }

  override getState(): TacticalWizardSimulationState {
    const base = super.getState();
    const rescue = this.rescuePlan;
    return {
      ...base,
      agents: base.agents.map((agent): TacticalWizardAgentView => {
        const recoveryTask = this.recoveryTaskFor(agent.id);
        const factors = this.speedFactorsFor(agent, recoveryTask);
        return {
          ...agent,
          moveSpeed: Number((BASE_MOVE_SPEED * factors.locomotion * factors.health * factors.firing * factors.task * factors.reaction * factors.recovery).toFixed(2)),
          medkitCount: this.medkits.get(agent.id) ?? 0,
          medkitCapacity: MEDKIT_CAPACITY,
          recoveryTask,
          recoveryTargetId: recoveryTask === 'rescue_move' || recoveryTask === 'rescue_treat' || recoveryTask === 'rescue_wait_cover'
            ? rescue?.downedAgentId ?? null
            : recoveryTask === 'resupply_medical'
              ? this.medicalResupply?.supplyId ?? null
              : null,
          recoveryProgress: recoveryTask === 'self_treat'
            ? Math.min(1, (this.selfTreatments.get(agent.id)?.seconds ?? 0) / SELF_TREAT_SECONDS)
            : recoveryTask === 'rescue_treat'
              ? Math.min(1, (rescue?.treatmentSeconds ?? 0) / RESCUE_TREAT_SECONDS)
              : 0,
          speedFactors: factors,
        };
      }),
      supplies: base.supplies.map((supply): SupplyCacheView => ({
        ...supply,
        medkits: this.supplyMedkits.get(supply.id) ?? 0,
        depleted: supply.depleted && (this.supplyMedkits.get(supply.id) ?? 0) <= 0,
      })),
      recovery: {
        phase: rescue?.phase ?? 'none',
        downedAgentId: rescue?.downedAgentId ?? null,
        rescuerId: rescue?.rescuerId ?? null,
        covererId: rescue?.covererId ?? null,
        approachTarget: rescue === null ? null : { ...rescue.approachTarget },
        treatmentProgress: rescue === null ? 0 : Math.min(1, rescue.treatmentSeconds / RESCUE_TREAT_SECONDS),
        medicalResupplyAgentId: this.medicalResupply?.agentId ?? null,
        medicalResupplySupplyId: this.medicalResupply?.supplyId ?? null,
      },
    };
  }

  setAgentMedkits(agentId: string, count: number): boolean {
    if (!this.medkits.has(agentId)) return false;
    this.medkits.set(agentId, Math.max(0, Math.min(MEDKIT_CAPACITY, Math.round(count))));
    return true;
  }

  private initializeMedicalState(): void {
    const state = super.getState();
    this.medkits = new Map(state.agents.map((agent) => [agent.id, DEFAULT_MEDKITS]));
    this.supplyMedkits = new Map(state.supplies.map((supply) => [supply.id, SUPPLY_MEDKITS]));
  }

  private installRecoveryHooks(): void {
    const host = this.recoveryHost();
    const originalMovementTarget = host.movementTarget.bind(this);
    host.movementTarget = (member: HostMember): GridPoint | null => {
      const criticalReaction = super.getState().agents.find((agent) => agent.id === member.id)?.reactionState;
      if (criticalReaction === 'stunned' || criticalReaction === 'dodge' || criticalReaction === 'smoke_retreat' || criticalReaction === 'smoke_reposition') {
        return this.gateMovement(member, originalMovementTarget(member));
      }

      const rescueTarget = this.rescueMovementTarget(member);
      if (rescueTarget.handled) return this.gateMovement(member, rescueTarget.target);
      if (this.selfTreatments.has(member.id)) return null;
      if (this.medicalResupply?.agentId === member.id) {
        const supply = super.getState().supplies.find((entry) => entry.id === this.medicalResupply!.supplyId);
        return this.gateMovement(member, supply?.position ?? null);
      }
      return this.gateMovement(member, originalMovementTarget(member));
    };

    const originalTryFire = host.tryFire.bind(this);
    host.tryFire = (member: HostMember, target: GridPoint, reason: string): void => {
      const recoveryTask = this.recoveryTaskFor(member.id);
      if (recoveryTask === 'self_treat' || recoveryTask === 'rescue_wait_cover' || recoveryTask === 'rescue_move' || recoveryTask === 'rescue_treat' || recoveryTask === 'resupply_medical') return;
      originalTryFire(member, target, reason);
    };

    const originalTryGrenade = host.tryGrenade.bind(this);
    host.tryGrenade = (member: HostMember): boolean => {
      const recoveryTask = this.recoveryTaskFor(member.id);
      if (recoveryTask !== 'none' && recoveryTask !== 'rescue_cover') return false;
      return originalTryGrenade(member);
    };
  }

  private gateMovement(member: HostMember, target: GridPoint | null): GridPoint | null {
    if (target === null) {
      this.movementCredits.set(member.id, 0);
      return null;
    }
    const state = super.getState();
    const agent = state.agents.find((entry) => entry.id === member.id);
    if (agent === undefined || !agent.alive) return null;
    const factors = this.speedFactorsFor(agent, this.recoveryTaskFor(member.id));
    const externalFactor = clamp01(factors.health * factors.firing * factors.task * factors.reaction * factors.recovery);
    if (externalFactor <= 0.001) return null;
    const credit = (this.movementCredits.get(member.id) ?? 0) + externalFactor;
    if (credit + 1e-9 < 1) {
      this.movementCredits.set(member.id, credit);
      return null;
    }
    this.movementCredits.set(member.id, Math.min(1, credit - 1));
    return target;
  }

  private speedFactorsFor(agent: TacticalWizardAgentViewV9, recoveryTask: RecoveryTask): MovementSpeedFactors {
    const locomotion = agent.locomotionMode === 'lateral' ? 0.78 : agent.locomotionMode === 'backpedal' ? 0.58 : 1;
    const healthRatio = agent.maxHealth <= 0 ? 0 : agent.health / agent.maxHealth;
    const health = healthRatio >= 0.75 ? 1 : healthRatio >= 0.5 ? 0.9 : healthRatio >= 0.25 ? 0.75 : healthRatio > 0 ? 0.58 : 0;
    const hostMember = this.recoveryHost().members.find((member) => member.id === agent.id);
    const firing = (hostMember?.firePulse ?? 0) > 0 ? 0.58 : 1;
    const task = agent.task === 'search_sector' || agent.task === 'overwatch'
      ? 0.8
      : agent.task === 'suppress' || agent.task === 'hold_cover' || agent.task === 'crossfire'
        ? 0.76
        : agent.task === 'regroup'
          ? 0.9
          : 1;
    const reaction = agent.reactionState === 'dodge'
      ? 1
      : agent.reactionState === 'flash_push'
        ? 0.94
        : agent.reactionState === 'smoke_retreat' || agent.reactionState === 'smoke_reposition'
          ? 0.92
          : agent.reactionState === 'grenade_suppress' || agent.reactionState === 'stunned' || agent.reactionState === 'downed'
            ? 0
            : 1;
    const recovery = recoveryTask === 'rescue_move'
      ? 0.72
      : recoveryTask === 'resupply_medical'
        ? 0.82
        : recoveryTask === 'self_treat' || recoveryTask === 'rescue_wait_cover' || recoveryTask === 'rescue_treat'
          ? 0
          : 1;
    return { base: BASE_MOVE_SPEED, locomotion, health, firing, task, reaction, recovery };
  }

  private ensureRecoveryPlanning(): void {
    const state = super.getState();
    this.validateRescuePlan(state);
    if (this.rescuePlan === null) this.tryCreateRescuePlan(state);
    this.validateMedicalResupply(state);
    if (this.rescuePlan === null && this.medicalResupply === null) this.tryCreateMedicalResupply(state);
    this.ensureSelfTreatment(state);
  }

  private validateRescuePlan(state: TacticalWizardSimulationStateV9): void {
    const plan = this.rescuePlan;
    if (plan === null) return;
    const downed = state.agents.find((agent) => agent.id === plan.downedAgentId);
    const rescuer = state.agents.find((agent) => agent.id === plan.rescuerId);
    if (downed === undefined || downed.alive || rescuer === undefined || !rescuer.alive || (this.medkits.get(rescuer.id) ?? 0) <= 0) {
      this.rescuePlan = null;
    }
  }

  private tryCreateRescuePlan(state: TacticalWizardSimulationStateV9): void {
    const downed = state.agents.find((agent) => !agent.alive);
    if (downed === undefined) return;
    const alive = state.agents.filter((agent) => agent.alive);
    if (alive.length === 0) return;
    const equipped = alive.filter((agent) => (this.medkits.get(agent.id) ?? 0) > 0);
    if (equipped.length === 0) return;

    const preferredCoverer = alive.find((agent) => agent.id === state.squad.suppressorId) ?? alive[0]!;
    const rescuer = equipped.find((agent) => agent.id !== preferredCoverer.id)
      ?? (alive.length === 1 ? equipped[0]! : equipped.find((agent) => agent.id !== state.squad.suppressorId) ?? equipped[0]!);
    const coverer = alive.find((agent) => agent.id !== rescuer.id && agent.id === preferredCoverer.id)
      ?? alive.find((agent) => agent.id !== rescuer.id)
      ?? null;
    const approachTarget = selectRescueApproachPoint(downed.position, rescuer.position, state.squad.sharedLastKnownPosition, alive.map((agent) => agent.position));
    if (approachTarget === null) return;

    const host = this.recoveryHost();
    this.selfTreatments.delete(rescuer.id);
    if (coverer !== null) this.selfTreatments.delete(coverer.id);
    this.medicalResupply = null;
    this.rescuePlan = {
      downedAgentId: downed.id,
      rescuerId: rescuer.id,
      covererId: coverer?.id ?? null,
      startedTick: state.logicalTick,
      coverReadyTick: state.logicalTick + RESCUE_COVER_TICKS,
      approachTarget,
      phase: coverer === null ? 'approach' : 'establish_cover',
      treatmentSeconds: 0,
    };

    if (coverer !== null) {
      host.suppressorId = coverer.id;
      host.moverId = rescuer.id;
      host.observerId = null;
      host.applyRoles();
      host.refreshTacticalPlan();
    }
    host.pushEvent(`T${state.logicalTick}: ${downed.label} down — ${coverer?.label ?? 'no coverer'} establishes cover before ${rescuer.label} moves to treat.`);
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Cover-then-rescue contract committed for a downed member.', {
      downedId: downed.id,
      rescuerId: rescuer.id,
      covererId: coverer?.id ?? null,
      phase: this.rescuePlan.phase,
      approachTarget: { ...approachTarget },
    });
  }

  private rescueMovementTarget(member: HostMember): { readonly handled: boolean; readonly target: GridPoint | null } {
    const plan = this.rescuePlan;
    if (plan === null) return { handled: false, target: null };
    if (member.id === plan.downedAgentId) return { handled: true, target: null };
    if (member.id === plan.covererId) {
      if (plan.phase === 'establish_cover') return { handled: false, target: null };
      return { handled: true, target: null };
    }
    if (member.id !== plan.rescuerId) return { handled: false, target: null };
    if (plan.phase === 'establish_cover' || plan.phase === 'treat') return { handled: true, target: null };
    return { handled: true, target: plan.approachTarget };
  }

  private advanceRecovery(deltaSeconds: number): void {
    const plan = this.rescuePlan;
    if (plan === null) return;
    const state = super.getState();
    const rescuer = state.agents.find((agent) => agent.id === plan.rescuerId);
    const coverer = plan.covererId === null ? null : state.agents.find((agent) => agent.id === plan.covererId) ?? null;
    const downed = state.agents.find((agent) => agent.id === plan.downedAgentId);
    if (rescuer === undefined || downed === undefined || !rescuer.alive) return;

    if (plan.phase === 'establish_cover') {
      const coverReady = coverer === null || coverer.targetVisible || coverer.firePulse > 0 || state.logicalTick >= plan.coverReadyTick;
      if (!coverReady) return;
      plan.phase = 'approach';
      this.recoveryHost().pushEvent(`T${state.logicalTick}: cover established; ${rescuer.label} begins casualty approach.`);
      return;
    }

    if (plan.phase === 'approach') {
      if (distance(rescuer.position, plan.approachTarget) > RESCUE_APPROACH_RADIUS) return;
      plan.phase = 'treat';
      plan.treatmentSeconds = 0;
      this.recoveryHost().pushEvent(`T${state.logicalTick}: ${rescuer.label} reached ${downed.label}; treatment started under cover.`);
      return;
    }

    if (plan.phase !== 'treat') return;
    if (rescuer.reactionState === 'stunned' || rescuer.reactionState === 'dodge' || rescuer.reactionState === 'smoke_retreat') return;
    plan.treatmentSeconds += Math.max(0, deltaSeconds);
    if (plan.treatmentSeconds + 1e-9 < RESCUE_TREAT_SECONDS) return;
    if ((this.medkits.get(rescuer.id) ?? 0) <= 0) {
      this.rescuePlan = null;
      return;
    }

    this.medkits.set(rescuer.id, (this.medkits.get(rescuer.id) ?? 0) - 1);
    super.setAgentVitals(downed.id, { health: RESCUE_HEALTH });
    this.v9Internals().reactions.delete(downed.id);
    const host = this.recoveryHost();
    const survivors = super.getState().agents.filter((agent) => agent.alive || agent.id === downed.id).map((agent) => agent.id);
    if (!survivors.includes(host.suppressorId ?? '')) host.suppressorId = plan.covererId ?? downed.id;
    if (!survivors.includes(host.moverId ?? '') || host.moverId === null) host.moverId = rescuer.id === host.suppressorId ? downed.id : rescuer.id;
    host.observerId = survivors.find((id) => id !== host.suppressorId && id !== host.moverId) ?? null;
    host.applyRoles();
    host.refreshTacticalPlan();
    host.pushEvent(`T${state.logicalTick}: ${rescuer.label} stabilized ${downed.label}; casualty returns at ${RESCUE_HEALTH} HP.`);
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Casualty treatment completed; recovered member rejoined the tactical plan.', {
      downedId: downed.id,
      rescuerId: rescuer.id,
      covererId: plan.covererId,
      restoredHealth: RESCUE_HEALTH,
      rescuerMedkits: this.medkits.get(rescuer.id) ?? 0,
    });
    this.rescuePlan = null;
  }

  private ensureSelfTreatment(state: TacticalWizardSimulationStateV9): void {
    for (const [agentId] of this.selfTreatments) {
      const agent = state.agents.find((entry) => entry.id === agentId);
      if (agent === undefined || !agent.alive || agent.targetVisible || state.playerCombat.firePressure >= 0.5 || this.rescuePlan !== null) this.selfTreatments.delete(agentId);
    }
    if (this.rescuePlan !== null) return;
    for (const agent of state.agents) {
      if (!agent.alive || agent.health > SELF_TREAT_HEALTH || (this.medkits.get(agent.id) ?? 0) <= 0 || this.selfTreatments.has(agent.id)) continue;
      if (agent.targetVisible || state.playerCombat.firePressure >= 0.4 || agent.reactionState !== 'none') continue;
      this.selfTreatments.set(agent.id, { seconds: 0 });
      this.recoveryHost().log('agent', agent.id, agent.label, 'plan', `${agent.label} began field self-treatment.`, {
        health: agent.health,
        medkits: this.medkits.get(agent.id) ?? 0,
      });
    }
  }

  private advanceSelfTreatment(deltaSeconds: number): void {
    const state = super.getState();
    for (const [agentId, treatment] of [...this.selfTreatments]) {
      const agent = state.agents.find((entry) => entry.id === agentId);
      if (agent === undefined || !agent.alive || agent.targetVisible || state.playerCombat.firePressure >= 0.5) continue;
      treatment.seconds += Math.max(0, deltaSeconds);
      if (treatment.seconds + 1e-9 < SELF_TREAT_SECONDS) continue;
      if ((this.medkits.get(agentId) ?? 0) <= 0) {
        this.selfTreatments.delete(agentId);
        continue;
      }
      this.medkits.set(agentId, (this.medkits.get(agentId) ?? 0) - 1);
      const restored = Math.min(agent.maxHealth, agent.health + SELF_TREAT_HEAL);
      super.setAgentVitals(agentId, { health: restored });
      this.recoveryHost().log('agent', agent.id, agent.label, 'plan', `${agent.label} completed field self-treatment.`, {
        fromHealth: agent.health,
        toHealth: restored,
        medkits: this.medkits.get(agentId) ?? 0,
      });
      this.selfTreatments.delete(agentId);
    }
  }

  private tryCreateMedicalResupply(state: TacticalWizardSimulationStateV9): void {
    const unrescuedDowned = state.agents.some((agent) => !agent.alive);
    const aliveWithKit = state.agents.some((agent) => agent.alive && (this.medkits.get(agent.id) ?? 0) > 0);
    let candidate = unrescuedDowned && !aliveWithKit
      ? state.agents.find((agent) => agent.alive && agent.id !== state.squad.suppressorId) ?? state.agents.find((agent) => agent.alive)
      : state.agents.find((agent) => agent.alive && agent.health <= MEDICAL_RESUPPLY_HEALTH && (this.medkits.get(agent.id) ?? 0) === 0 && agent.logisticsTask === 'none' && !agent.targetVisible);
    if (candidate === undefined) return;
    const supply = nearestMedicalSupply(candidate.position, state.supplies, this.supplyMedkits);
    if (supply === null) return;
    this.medicalResupply = { agentId: candidate.id, supplyId: supply.id };
    this.recoveryHost().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', `${candidate.label} assigned to replenish medical supplies.`, {
      agentId: candidate.id,
      supplyId: supply.id,
      reason: unrescuedDowned && !aliveWithKit ? 'rescue_requires_medkit' : 'low_health_without_medkit',
    });
  }

  private validateMedicalResupply(state: TacticalWizardSimulationStateV9): void {
    const assignment = this.medicalResupply;
    if (assignment === null) return;
    const agent = state.agents.find((entry) => entry.id === assignment.agentId);
    if (agent === undefined || !agent.alive || (this.medkits.get(agent.id) ?? 0) >= MEDKIT_CAPACITY || (this.supplyMedkits.get(assignment.supplyId) ?? 0) <= 0 || this.rescuePlan !== null) this.medicalResupply = null;
  }

  private pickupMedicalSupplies(): void {
    const state = super.getState();
    for (const agent of state.agents) {
      if (!agent.alive || (this.medkits.get(agent.id) ?? 0) >= MEDKIT_CAPACITY) continue;
      for (const supply of state.supplies) {
        if (distance(agent.position, supply.position) > SUPPLY_PICKUP_RADIUS) continue;
        const available = this.supplyMedkits.get(supply.id) ?? 0;
        if (available <= 0) continue;
        const wanted = MEDKIT_CAPACITY - (this.medkits.get(agent.id) ?? 0);
        const taken = Math.min(wanted, available);
        this.medkits.set(agent.id, (this.medkits.get(agent.id) ?? 0) + taken);
        this.supplyMedkits.set(supply.id, available - taken);
        this.recoveryHost().log('agent', agent.id, agent.label, 'plan', `${agent.label} picked up ${taken} medical kit(s) from ${supply.id}.`, {
          supplyId: supply.id,
          medkitsTaken: taken,
          medkits: this.medkits.get(agent.id) ?? 0,
        });
        if (this.medicalResupply?.agentId === agent.id && this.medicalResupply.supplyId === supply.id) this.medicalResupply = null;
        break;
      }
    }
  }

  private recoveryTaskFor(agentId: string): RecoveryTask {
    const rescue = this.rescuePlan;
    if (rescue !== null) {
      if (agentId === rescue.downedAgentId) return 'none';
      if (agentId === rescue.covererId) return 'rescue_cover';
      if (agentId === rescue.rescuerId) {
        if (rescue.phase === 'establish_cover') return 'rescue_wait_cover';
        if (rescue.phase === 'approach') return 'rescue_move';
        return 'rescue_treat';
      }
    }
    if (this.selfTreatments.has(agentId)) return 'self_treat';
    if (this.medicalResupply?.agentId === agentId) return 'resupply_medical';
    return 'none';
  }

  private v9Internals(): V9Internals {
    return this as unknown as V9Internals;
  }

  private recoveryHost(): HostAccess {
    return this as unknown as HostAccess;
  }
}

function selectRescueApproachPoint(downed: GridPoint, rescuer: GridPoint, threat: GridPoint | null, occupied: readonly GridPoint[]): GridPoint | null {
  const candidates: Array<{ point: GridPoint; score: number }> = [];
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const point = { x: downed.x + dx, y: downed.y + dy };
      const range = distance(point, downed);
      if (range < 0.8 || range > 2.1 || !isWalkable(tacticalWizardNavigationGrid, toCell(point))) continue;
      if (occupied.some((entry) => distance(entry, point) < 0.68)) continue;
      const path = findPath(tacticalWizardNavigationGrid, toCell(rescuer), toCell(point));
      if (path.length === 0) continue;
      const coverBonus = threat === null || !hasLineOfSight(tacticalWizardNavigationGrid, toCell(threat), toCell(point)) ? 50 : 0;
      candidates.push({ point: toCell(point), score: coverBonus - path.length * 2 - Math.abs(range - 1.2) * 5 });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.point.y - b.point.y || a.point.x - b.point.x);
  return candidates[0]?.point ?? null;
}

function nearestMedicalSupply(from: GridPoint, supplies: readonly SupplyCacheViewV9[], medical: ReadonlyMap<string, number>): SupplyCacheViewV9 | null {
  const candidates = supplies
    .filter((supply) => (medical.get(supply.id) ?? 0) > 0)
    .map((supply) => ({ supply, path: findPath(tacticalWizardNavigationGrid, toCell(from), toCell(supply.position)) }))
    .filter((entry) => entry.path.length > 0)
    .sort((a, b) => a.path.length - b.path.length || a.supply.id.localeCompare(b.supply.id, 'en'));
  return candidates[0]?.supply ?? null;
}

function toCell(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))),
  };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
