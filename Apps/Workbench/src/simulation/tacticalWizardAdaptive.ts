import { findPath, type GridPoint } from './navigation';
import {
  TacticalWizardSimulation,
  type GrenadeKind,
  type TacticalWizardSimulationState,
} from './tacticalWizardSimulation';
import { TacticalWizardDynamicCombatWorld, type DynamicCombatWorldView } from './dynamicCombatWorld';
import {
  choosePressureProposal,
  deterministicPressureRoll,
  leaseStillOwnsResponse,
  localEffectForBand,
  nextPressureBand,
  opportunityForPressureAction,
  pressureReasonForAction,
  selectUnderFireReposition,
  type FirePressureBand,
  type PressureLocalEffect,
  type PressureOpportunityKind,
  type PressureResponseLease,
  type PressureTacticalAction,
} from './incomingFirePressure';
import {
  DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE,
  type TacticalWizardCombatProfile,
} from './tacticalWizardProfiles';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from './tacticalWizardTestMap';

export type { FirePressureBand, PressureTacticalAction } from './incomingFirePressure';

export interface AdaptiveAgentPressureView {
  readonly agentId: string;
  readonly pressure: number;
  readonly band: FirePressureBand;
  readonly incomingBearing: GridPoint | null;
  readonly localEffect: PressureLocalEffect;
}

export interface AdaptivePressureLeaseView {
  readonly id: string;
  readonly action: PressureTacticalAction;
  readonly opportunity: PressureOpportunityKind;
  readonly pressuredAgentId: string;
  readonly maneuverAgentId: string | null;
  readonly supportAgentId: string | null;
  readonly origin: GridPoint | null;
  readonly target: GridPoint | null;
  readonly startedTick: number;
  readonly untilTick: number;
  readonly expectedTactic: string | null;
  readonly planRevision: number;
  readonly plannerTargetDisplacement: number | null;
  readonly plannerAngleGainDegrees: number | null;
  readonly softStableTicks: number;
  readonly reason: string;
}

export interface PressurePlannerAttemptView {
  readonly candidateId: PressureTacticalAction;
  readonly opportunity: PressureOpportunityKind;
  readonly utilityScore: number;
  readonly accepted: boolean;
  readonly reason: string;
  readonly planRevision: number;
  readonly maneuverAgentId: string | null;
  readonly target: GridPoint | null;
  readonly displacement: number | null;
  readonly angleGainDegrees: number | null;
}

export interface PressurePlannerTraceView {
  readonly logicalTick: number;
  readonly source: 'shot_evidence' | 'pressure_tick';
  readonly currentTactic: string;
  readonly currentPlanProgress: number;
  readonly safeFireLanes: number;
  readonly geometryQuality: number;
  readonly reasonerSelectedAction: PressureTacticalAction;
  readonly committedAction: PressureTacticalAction;
  readonly candidateScores: readonly { readonly candidateId: PressureTacticalAction; readonly available: boolean; readonly score: number }[];
  readonly attempts: readonly PressurePlannerAttemptView[];
}

export interface TacticalWizardAdaptiveState extends TacticalWizardSimulationState {
  readonly adaptiveCombat: {
    readonly enemiesEnabled: boolean;
    readonly profile: TacticalWizardCombatProfile;
    readonly squadPressure: number;
    readonly pressureBand: FirePressureBand;
    readonly agentPressure: readonly AdaptiveAgentPressureView[];
    /** Active response only. When no lease owns a pressure response this is `none`. */
    readonly tacticalAction: PressureTacticalAction;
    readonly tacticalActionReason: string | null;
    readonly tacticalActionUntilTick: number | null;
    readonly activeResponseLease: AdaptivePressureLeaseView | null;
    readonly lastTacticalAction: PressureTacticalAction;
    readonly lastTacticalActionReason: string | null;
    readonly lastTacticalActionTick: number | null;
    readonly lastPlannerTrace: PressurePlannerTraceView | null;
    readonly plannerRejections: number;
    readonly pressureResponses: number;
    readonly pressureProposalsDeferredByLease: number;
    readonly pressureHardInvalidations: number;
    readonly formationHoldAgentIds: readonly string[];
    readonly formationCatchUpAgentIds: readonly string[];
  };
  readonly dynamicWorld: DynamicCombatWorldView;
}

interface InternalMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  facing: GridPoint;
  selectedIntent: string;
  role: string;
  task: string;
  tacticalTarget: GridPoint | null;
  coverSlot?: unknown;
  coverState?: string;
  searchLookTarget?: GridPoint | null;
  buddyRole?: string;
  opportunityPurpose?: string;
}

interface InternalHost {
  members: InternalMember[];
  logicalTick: number;
  motionFrame: number;
  alertState: 'idle' | 'pending' | 'active';
  tactic: string;
  patrolIndex: number;
  sharedLastKnownPosition: GridPoint | null;
  suppressorId: string | null;
  moverId: string | null;
  observerId: string | null;
  getPatrolTarget?: (member: InternalMember) => GridPoint;
  transitionTactic?: (next: string, reason: string, rotateRoles: boolean) => void;
  refreshTacticalPlan?: () => void;
  planRevision?: number;
  log: (...args: unknown[]) => void;
  pushEvent: (message: string) => void;
}

interface InternalRuntimeAccess {
  readonly tacticalHost: InternalHost;
  readonly contracts?: Map<string, unknown>;
  readonly recoveryPlan?: unknown;
  replanRecoveryGeometry?: (state: TacticalWizardSimulationState, reason: string, force: boolean) => void;
}

interface PlannerAttemptResult extends PressurePlannerAttemptView {
  readonly expectedTactic: string | null;
  readonly origin: GridPoint | null;
  readonly supportAgentId: string | null;
}

interface HostPlanTransactionSnapshot {
  readonly hostFields: Readonly<Record<string, unknown>>;
  readonly members: readonly { readonly id: string; readonly fields: Readonly<Record<string, unknown>> }[];
  readonly eventLog: readonly string[];
  readonly runLog: readonly unknown[];
  readonly runLogSequence: number;
  readonly contracts: readonly (readonly [string, unknown])[];
}

const FORMATION_ARRIVAL = 0.55;
const FORMATION_CATCH_UP_TICKS = 10;
const PRESSURE_DECAY_PER_SECOND = 0.14;
const PRESSURE_RESPONSE_COOLDOWN_TICKS = 6;
const PRESSURE_RESPONSE_LEASE_TICKS = 12;
const TRADE_FIRE_LEASE_TICKS = 6;
const RESPONSE_SOFT_RELEASE_STABLE_TICKS = 3;
const TRADE_FIRE_SOFT_RELEASE_STABLE_TICKS = 2;
const REPOSITION_ARRIVAL = 0.75;
const MIN_PLANNED_MOVE_DISPLACEMENT = 2.75;
const MIN_FLANK_ANGLE_GAIN_DEGREES = 18;
const STRONG_FLANK_DISPLACEMENT = 4.5;
const RECENT_FLANK_MEMORY_TICKS = 32;
const MIN_REPEAT_FLANK_TARGET_NOVELTY = 2;

/**
 * Tactical Wizard game-first adaptive combat sandbox.
 *
 * IAUS is a Reasoner only. It ranks opportunities, Tactical Planning is the sole
 * owner of roles/targets/geometry, a bounded lease preserves commitment, and the
 * existing fixed hierarchy remains the only execution authority.
 */
export class TacticalWizardAdaptiveSimulation {
  readonly stepSeconds: number;
  readonly agentMoveSpeed: number;

  private readonly simulation: TacticalWizardSimulation;
  private readonly world: TacticalWizardDynamicCombatWorld;
  private enemiesEnabled = true;
  private profile: TacticalWizardCombatProfile = { ...DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE };
  private readonly pressureByAgent = new Map<string, number>();
  private readonly pressureBandByAgent = new Map<string, FirePressureBand>();
  private readonly incomingBearingByAgent = new Map<string, GridPoint>();
  private readonly lastShotOriginByAgent = new Map<string, GridPoint>();
  private readonly formationHoldSince = new Map<string, number>();
  private readonly formationHoldIds = new Set<string>();
  private readonly formationCatchUpIds = new Set<string>();
  private squadBand: FirePressureBand = 'stable';
  private responseSerial = 0;
  private responseCooldownUntilTick = -999;
  private pressureResponses = 0;
  private pressureProposalsDeferredByLease = 0;
  private pressureHardInvalidations = 0;
  private plannerRejections = 0;
  private lastPressureAction: PressureTacticalAction = 'none';
  private lastPressureActionReason: string | null = null;
  private lastPressureActionTick: number | null = null;
  private lastPlannerTrace: PressurePlannerTraceView | null = null;
  private activeResponse: PressureResponseLease | null = null;
  private lastLeaseEscalationBand: FirePressureBand = 'stable';
  private lastCommittedAction: PressureTacticalAction = 'none';
  private lastCommittedActionTick = -999;
  private lastCommittedTarget: GridPoint | null = null;
  private lastCommittedThreatAnchor: GridPoint | null = null;

  constructor() {
    this.world = new TacticalWizardDynamicCombatWorld();
    this.simulation = new TacticalWizardSimulation();
    this.stepSeconds = this.simulation.stepSeconds;
    this.agentMoveSpeed = this.simulation.agentMoveSpeed;
    const state = this.simulation.getState();
    this.seedPressure(state);
    this.applyFormationHold(state);
    this.updatePressureBands(this.simulation.getState());
  }

  /** Observation only: state reads never change roles, targets, leases or counters. */
  getState(): TacticalWizardAdaptiveState {
    return this.decorate(this.simulation.getState());
  }

  reset(): TacticalWizardAdaptiveState {
    this.world.reset();
    this.simulation.reset();
    this.pressureByAgent.clear();
    this.pressureBandByAgent.clear();
    this.incomingBearingByAgent.clear();
    this.lastShotOriginByAgent.clear();
    this.formationHoldSince.clear();
    this.formationHoldIds.clear();
    this.formationCatchUpIds.clear();
    this.squadBand = 'stable';
    this.responseSerial = 0;
    this.responseCooldownUntilTick = -999;
    this.pressureResponses = 0;
    this.pressureProposalsDeferredByLease = 0;
    this.pressureHardInvalidations = 0;
    this.plannerRejections = 0;
    this.lastPressureAction = 'none';
    this.lastPressureActionReason = null;
    this.lastPressureActionTick = null;
    this.lastPlannerTrace = null;
    this.activeResponse = null;
    this.lastLeaseEscalationBand = 'stable';
    this.lastCommittedAction = 'none';
    this.lastCommittedActionTick = -999;
    this.lastCommittedTarget = null;
    this.lastCommittedThreatAnchor = null;
    const state = this.simulation.getState();
    this.seedPressure(state);
    this.applyFormationHold(state);
    this.updatePressureBands(this.simulation.getState());
    return this.getState();
  }

  step(): TacticalWizardAdaptiveState { return this.advance(this.stepSeconds); }

  advance(deltaSeconds: number): TacticalWizardAdaptiveState {
    const delta = Math.max(0, Math.min(1, deltaSeconds));
    this.decayPressure(delta);
    if (!this.enemiesEnabled) return this.getState();
    const beforeTick = this.simulation.getState().logicalTick;
    this.simulation.advance(delta);
    const state = this.simulation.getState();
    this.applyFormationHold(state);
    this.updatePressureBands(this.simulation.getState());
    this.maintainPressureResponse(this.simulation.getState());
    const afterMaintenance = this.simulation.getState();
    if (afterMaintenance.logicalTick !== beforeTick) this.evaluatePressureProposal(afterMaintenance, false);
    return this.getState();
  }

  emitNoise(): void { this.simulation.emitNoise(); }
  setPlayerPosition(point: GridPoint): boolean { return this.simulation.setPlayerPosition(point); }
  nudgePlayer(dx: number, dy: number): boolean { return this.simulation.nudgePlayer(dx, dy); }
  setPlayerAimTarget(point: GridPoint): boolean { return this.simulation.setPlayerAimTarget(point); }
  cyclePlayerGrenade(delta: number): GrenadeKind { return this.simulation.cyclePlayerGrenade(delta); }

  playerFireAt(point: GridPoint): boolean {
    const before = this.simulation.getState();
    const fired = this.simulation.playerFireAt(point);
    if (!fired) return false;
    const after = this.simulation.getState();
    this.registerIncomingFirePressure(before, after);
    const from = after.playerCombat.shotFrom;
    const to = after.playerCombat.shotTo;
    if (from !== null && to !== null) {
      const worldDamage = this.world.damageRay(from, to, 1);
      if (worldDamage.destroyed) this.invalidateWorldGeometry(worldDamage.point, 'rifle');
    }
    this.updatePressureBands(this.simulation.getState());
    this.maintainPressureResponse(this.simulation.getState());
    this.evaluatePressureProposal(this.simulation.getState(), true);
    return true;
  }

  playerThrowGrenadeAt(point: GridPoint): boolean {
    const kind = this.simulation.getState().playerCombat.selectedGrenade;
    const fired = this.simulation.playerThrowGrenadeAt(point);
    if (!fired) return false;
    if (kind === 'frag') {
      const results = this.world.damageBlast(point, 2.4, 1);
      if (results.some((entry) => entry.destroyed)) this.invalidateWorldGeometry(point, 'frag');
      this.registerBlastPressure(point, 2.8, 0.24);
    } else if (kind === 'flash') {
      this.registerBlastPressure(point, 3.2, 0.18);
    }
    this.updatePressureBands(this.simulation.getState());
    this.maintainPressureResponse(this.simulation.getState());
    this.evaluatePressureProposal(this.simulation.getState(), true);
    return true;
  }

  setAgentEquipment(agentId: string, values: { readonly ammoRounds?: number; readonly grenades?: number }): boolean {
    return this.simulation.setAgentEquipment(agentId, values);
  }

  setAgentVitals(agentId: string, values: { readonly health?: number }): boolean {
    const changed = this.simulation.setAgentVitals(agentId, values);
    if (changed) {
      this.updatePressureBands(this.simulation.getState());
      this.maintainPressureResponse(this.simulation.getState());
    }
    return changed;
  }

  applyGrenadeDoctrineForTest(kind: GrenadeKind, center: GridPoint, ownerId?: string): void {
    this.simulation.applyGrenadeDoctrineForTest(kind, center, ownerId);
    this.maintainPressureResponse(this.simulation.getState());
  }

  injectIncomingFireForTest(agentId: string, from: GridPoint): boolean {
    const state = this.simulation.getState();
    const accepted = this.simulation.injectIncomingFireForTest(agentId, from);
    if (!accepted) return false;
    const agent = state.agents.find((entry) => entry.id === agentId);
    if (agent !== undefined) this.recordIncomingDirection(agentId, agent.position, from, 1);
    this.raisePressure(agentId, 0.42);
    this.updatePressureBands(this.simulation.getState());
    this.maintainPressureResponse(this.simulation.getState());
    this.evaluatePressureProposal(this.simulation.getState(), true);
    return true;
  }

  setEnemiesEnabled(enabled: boolean): void {
    if (this.enemiesEnabled === enabled) return;
    if (!enabled && this.activeResponse !== null) this.releasePressureResponse('enemy_simulation_paused', false);
    this.enemiesEnabled = enabled;
    const host = this.internal().tacticalHost;
    host.pushEvent(`T${host.logicalTick}: combat sandbox enemies ${enabled ? 'enabled' : 'paused by test control'}.`);
    host.log('system', 'simulation', 'Combat Sandbox', 'session', enabled ? 'Enemy simulation enabled.' : 'Enemy simulation paused by sandbox control.', { enemiesEnabled: enabled });
  }

  setCombatProfile(profile: TacticalWizardCombatProfile): void {
    const normalized = normalizeProfile(profile);
    const changed = JSON.stringify(normalized) !== JSON.stringify(this.profile);
    this.profile = normalized;
    if (!changed) return;
    const host = this.internal().tacticalHost;
    this.updatePressureBands(this.simulation.getState());
    host.log('system', 'simulation', 'Combat Sandbox', 'session', 'Tactical Wizard combat profile applied to the sandbox.', {
      profileId: normalized.id,
      mindset: normalized.mindset,
      aggression: normalized.aggression,
      suppressionTolerance: normalized.suppressionTolerance,
      flankBias: normalized.flankBias,
      repositionBias: normalized.repositionBias,
      coordination: normalized.coordination,
      holdGroundBias: normalized.holdGroundBias,
      counterManeuverBias: normalized.counterManeuverBias,
      breakContactBias: normalized.breakContactBias,
      utilityTradeFireWeight: normalized.utilityTradeFireWeight,
      utilityRepositionWeight: normalized.utilityRepositionWeight,
      utilityFlankWeight: normalized.utilityFlankWeight,
      utilityRegroupWeight: normalized.utilityRegroupWeight,
      utilityAssaultWeight: normalized.utilityAssaultWeight,
    });
  }

  private decorate(base: TacticalWizardSimulationState): TacticalWizardAdaptiveState {
    const pressures = base.agents.map((agent) => ({
      agentId: agent.id,
      pressure: Number((this.pressureByAgent.get(agent.id) ?? 0).toFixed(3)),
      band: this.pressureBandByAgent.get(agent.id) ?? 'stable',
      incomingBearing: clonePoint(this.incomingBearingByAgent.get(agent.id) ?? null),
      localEffect: localEffectForBand(this.pressureBandByAgent.get(agent.id) ?? 'stable'),
    }));
    const squadPressure = this.squadPressure(base);
    const active = this.activeResponse;
    const attention = base.perceptionIntegration.attention.map((sample) => {
      const agent = base.agents.find((entry) => entry.id === sample.agentId);
      if (agent?.targetVisible !== true) return sample;
      const anchor = clonePoint(base.contactTrack.lastConfirmedPosition ?? base.player)!;
      return {
        ...sample,
        mode: 'track_visual' as const,
        anchor,
        scanPhase: 0,
        facing: { ...agent.facing },
        lookTarget: { ...anchor },
      };
    });
    return {
      ...base,
      perceptionIntegration: { ...base.perceptionIntegration, attention },
      adaptiveCombat: {
        enemiesEnabled: this.enemiesEnabled,
        profile: { ...this.profile },
        squadPressure: Number(squadPressure.toFixed(3)),
        pressureBand: this.squadBand,
        agentPressure: pressures,
        tacticalAction: active?.action ?? 'none',
        tacticalActionReason: active?.reason ?? null,
        tacticalActionUntilTick: active?.untilTick ?? null,
        activeResponseLease: active === null ? null : {
          id: active.id,
          action: active.action,
          opportunity: active.opportunity,
          pressuredAgentId: active.pressuredAgentId,
          maneuverAgentId: active.maneuverAgentId,
          supportAgentId: active.supportAgentId,
          origin: clonePoint(active.origin),
          target: clonePoint(active.target),
          startedTick: active.startedTick,
          untilTick: active.untilTick,
          expectedTactic: active.expectedTactic,
          planRevision: active.planRevision,
          plannerTargetDisplacement: active.plannerTargetDisplacement,
          plannerAngleGainDegrees: active.plannerAngleGainDegrees,
          softStableTicks: active.softStableTicks,
          reason: active.reason,
        },
        lastTacticalAction: this.lastPressureAction,
        lastTacticalActionReason: this.lastPressureActionReason,
        lastTacticalActionTick: this.lastPressureActionTick,
        lastPlannerTrace: clonePlannerTrace(this.lastPlannerTrace),
        plannerRejections: this.plannerRejections,
        pressureResponses: this.pressureResponses,
        pressureProposalsDeferredByLease: this.pressureProposalsDeferredByLease,
        pressureHardInvalidations: this.pressureHardInvalidations,
        formationHoldAgentIds: [...this.formationHoldIds].sort(),
        formationCatchUpAgentIds: [...this.formationCatchUpIds].sort(),
      },
      dynamicWorld: this.world.view(),
    };
  }

  private seedPressure(state: TacticalWizardSimulationState): void {
    for (const agent of state.agents) {
      this.pressureByAgent.set(agent.id, 0);
      this.pressureBandByAgent.set(agent.id, 'stable');
    }
  }

  private decayPressure(deltaSeconds: number): void {
    const decay = PRESSURE_DECAY_PER_SECOND * deltaSeconds;
    for (const [id, pressure] of this.pressureByAgent) {
      const next = Math.max(0, pressure - decay);
      this.pressureByAgent.set(id, next);
      if (next < 0.12) {
        this.incomingBearingByAgent.delete(id);
        this.lastShotOriginByAgent.delete(id);
      }
    }
    this.updatePressureBands(this.simulation.getState());
  }

  private updatePressureBands(state: TacticalWizardSimulationState): void {
    for (const agent of state.agents) {
      const previous = this.pressureBandByAgent.get(agent.id) ?? 'stable';
      const next = agent.alive
        ? nextPressureBand(previous, this.pressureByAgent.get(agent.id) ?? 0, this.profile.suppressionTolerance)
        : 'stable';
      this.pressureBandByAgent.set(agent.id, next);
    }
    this.squadBand = nextPressureBand(this.squadBand, this.squadPressure(state), this.profile.suppressionTolerance);
  }

  private registerIncomingFirePressure(before: TacticalWizardSimulationState, after: TacticalWizardSimulationState): void {
    const from = after.playerCombat.shotFrom;
    const to = after.playerCombat.shotTo;
    if (from === null || to === null) return;
    const beforeById = new Map(before.agents.map((agent) => [agent.id, agent]));
    for (const agent of after.agents) {
      if (!agent.alive && !beforeById.get(agent.id)?.alive) continue;
      const previous = beforeById.get(agent.id);
      const hit = previous !== undefined && agent.health < previous.health;
      const missDistance = pointSegmentDistance(agent.position, from, to);
      let amount = hit ? 0.56 : missDistance <= 0.8 ? 0.32 : missDistance <= 1.6 ? 0.2 : missDistance <= 3 ? 0.09 : 0;
      if (amount <= 0) continue;
      if (agent.coverState === 'covered') amount *= 0.68;
      if (agent.targetVisible) amount += 0.035;
      amount += Math.min(0.08, after.playerCombat.firePressure * 0.06);
      this.raisePressure(agent.id, amount);
      this.recordIncomingDirection(agent.id, agent.position, from, amount);
    }
  }

  private registerBlastPressure(center: GridPoint, radius: number, amount: number): void {
    const state = this.simulation.getState();
    for (const agent of state.agents) {
      if (!agent.alive) continue;
      const range = distance(agent.position, center);
      if (range > radius) continue;
      const applied = amount * (1 - range / Math.max(radius * 1.4, 0.01));
      this.raisePressure(agent.id, applied);
      this.recordIncomingDirection(agent.id, agent.position, center, applied);
    }
  }

  private recordIncomingDirection(agentId: string, agentPosition: GridPoint, source: GridPoint, weight: number): void {
    const sample = normalizedDelta(agentPosition, source);
    const previous = this.incomingBearingByAgent.get(agentId);
    const blend = previous === undefined
      ? sample
      : normalizedDelta({ x: 0, y: 0 }, { x: previous.x * 0.68 + sample.x * Math.max(0.2, weight), y: previous.y * 0.68 + sample.y * Math.max(0.2, weight) });
    this.incomingBearingByAgent.set(agentId, blend);
    this.lastShotOriginByAgent.set(agentId, { ...source });
  }

  private raisePressure(agentId: string, amount: number): void {
    this.pressureByAgent.set(agentId, clamp01((this.pressureByAgent.get(agentId) ?? 0) + Math.max(0, amount)));
  }

  private squadPressure(state: TacticalWizardSimulationState): number {
    const living = state.agents.filter((agent) => agent.alive);
    if (living.length === 0) return 0;
    const values = living.map((agent) => this.pressureByAgent.get(agent.id) ?? 0);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const maximum = Math.max(...values);
    return clamp01(maximum * 0.58 + average * 0.42);
  }

  private evaluatePressureProposal(state: TacticalWizardSimulationState, fromShot: boolean): void {
    if (!this.enemiesEnabled || state.squad.alertState !== 'active' || state.recovery.phase !== 'none') return;
    const host = this.internal().tacticalHost;
    const tick = host.logicalTick;
    if (this.activeResponse !== null && leaseStillOwnsResponse(this.activeResponse, tick)) {
      if (fromShot) this.pressureProposalsDeferredByLease += 1;
      this.logLeaseEscalationIfNeeded();
      return;
    }
    if (this.activeResponse !== null) this.releasePressureResponse('lease_expired', false);
    if (tick < this.responseCooldownUntilTick) return;

    const living = state.agents.filter((agent) => agent.alive);
    if (living.length === 0) return;
    const pressured = living
      .map((agent) => ({ agent, pressure: this.pressureByAgent.get(agent.id) ?? 0, band: this.pressureBandByAgent.get(agent.id) ?? 'stable' }))
      .filter((entry) => entry.band === 'suppressed' || entry.band === 'pinned')
      .sort((a, b) => b.pressure - a.pressure || a.agent.id.localeCompare(b.agent.id, 'en'));
    if (pressured.length === 0) return;

    const primary = pressured[0]!;
    const pressure = this.squadPressure(state);
    const planProgress = this.currentPlanProgress(state);
    const geometryQuality = this.currentGeometryQuality(state, planProgress);
    const recentGeometryNovelty = this.recentGeometryNovelty(host.sharedLastKnownPosition);
    const roll = deterministicPressureRoll(this.profile.id, tick, this.responseSerial + pressured.length);
    const proposal = choosePressureProposal({
      band: primary.band,
      pressure,
      pressuredAgentId: primary.agent.id,
      livingCount: living.length,
      pressuredCount: pressured.length,
      currentTactic: host.tactic,
      currentPlanProgress: planProgress,
      safeFireLanes: state.safeFireLanes,
      geometryQuality,
      currentTacticTicks: state.squad.tacticTicks,
      recentAction: this.lastCommittedAction,
      recentActionAgeTicks: tick - this.lastCommittedActionTick,
      recentGeometryNovelty,
      profile: this.profile,
      roll,
    });

    const candidates = [...proposal.utility.candidates]
      .filter((entry) => entry.available)
      .sort((a, b) => b.score - a.score || a.candidateId.localeCompare(b.candidateId, 'en'));
    const attempts: PressurePlannerAttemptView[] = [];
    let committedAction: PressureTacticalAction = 'none';

    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'IAUS ranked incoming-fire opportunities; Tactical Planning now validates role and geometry ownership.', {
      pressure: Number(pressure.toFixed(3)),
      band: primary.band,
      reasonerWinner: proposal.action,
      pressuredAgentId: proposal.pressuredAgentId,
      currentTactic: host.tactic,
      currentPlanProgress: Number(planProgress.toFixed(3)),
      safeFireLanes: state.safeFireLanes,
      geometryQuality: Number(geometryQuality.toFixed(3)),
      source: fromShot ? 'shot_evidence' : 'pressure_tick',
      candidates: candidates.map((entry) => `${entry.candidateId}:${entry.score.toFixed(3)}`).join('|'),
    });

    for (const candidate of candidates) {
      const reason = pressureReasonForAction(candidate.candidateId, primary.band, pressure, this.profile, proposal.utility);
      const attempt = this.tryCommitPressureCandidate(state, candidate.candidateId, primary.agent.id, candidate.score, reason);
      attempts.push(attempt);
      if (attempt.accepted) {
        this.commitPressureLease(state, attempt, primary.agent.id, reason);
        committedAction = candidate.candidateId;
        break;
      }
      this.plannerRejections += 1;
      host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Tactical Planner rejected an IAUS candidate; the next ranked opportunity may be considered.', {
        candidate: candidate.candidateId,
        utilityScore: Number(candidate.score.toFixed(3)),
        reason: attempt.reason,
        planRevision: attempt.planRevision,
        target: attempt.target,
        displacement: attempt.displacement,
        angleGainDegrees: attempt.angleGainDegrees,
      });
    }

    this.lastPlannerTrace = {
      logicalTick: tick,
      source: fromShot ? 'shot_evidence' : 'pressure_tick',
      currentTactic: state.squad.tactic,
      currentPlanProgress: Number(planProgress.toFixed(3)),
      safeFireLanes: state.safeFireLanes,
      geometryQuality: Number(geometryQuality.toFixed(3)),
      reasonerSelectedAction: proposal.action,
      committedAction,
      candidateScores: proposal.utility.candidates.map((entry) => ({ candidateId: entry.candidateId, available: entry.available, score: Number(entry.score.toFixed(4)) })),
      attempts: attempts.map(clonePlannerAttempt),
    };

    if (committedAction === 'none') {
      this.responseCooldownUntilTick = tick + 2;
      host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'IAUS produced candidates but Tactical Planning rejected all executable geometry; current plan remains authoritative.', {
        reasonerWinner: proposal.action,
        attempts: attempts.map((entry) => `${entry.candidateId}:${entry.reason}`).join('|'),
      });
    }
  }

  private tryCommitPressureCandidate(
    state: TacticalWizardSimulationState,
    action: PressureTacticalAction,
    pressuredAgentId: string,
    utilityScore: number,
    reason: string,
  ): PlannerAttemptResult {
    const host = this.internal().tacticalHost;
    const previousTactic = host.tactic;
    const previousPlanRevision = state.coordination.planRevision;
    const opportunity = opportunityForPressureAction(action);
    const rejected = (why: string, values: Partial<PlannerAttemptResult> = {}): PlannerAttemptResult => ({ candidateId: action, opportunity, utilityScore, accepted: false, reason: why, planRevision: values.planRevision ?? previousPlanRevision, maneuverAgentId: values.maneuverAgentId ?? null, supportAgentId: values.supportAgentId ?? null, origin: clonePoint(values.origin ?? null), target: clonePoint(values.target ?? null), displacement: values.displacement ?? null, angleGainDegrees: values.angleGainDegrees ?? null, expectedTactic: values.expectedTactic ?? previousTactic });
    const accepted = (values: Omit<PlannerAttemptResult, 'candidateId' | 'opportunity' | 'utilityScore' | 'accepted'>): PlannerAttemptResult => ({ candidateId: action, opportunity, utilityScore, accepted: true, ...values });
    if (action === 'trade_fire') return accepted({ reason: 'planner_accepted_hold_current_plan', planRevision: previousPlanRevision, maneuverAgentId: null, supportAgentId: host.suppressorId, origin: null, target: null, displacement: null, angleGainDegrees: null, expectedTactic: previousTactic });
    const ownerBand = this.pressureBandByAgent.get(pressuredAgentId) ?? 'stable';
    const planProgress = this.currentPlanProgress(state);
    const geometryQuality = this.currentGeometryQuality(state, planProgress);
    const maturePlan = (previousTactic === 'crossfire' || previousTactic === 'assault') && planProgress >= 0.5 && state.safeFireLanes >= 1 && geometryQuality >= 0.4;
    if (maturePlan && ownerBand !== 'pinned' && (action === 'flank' || action === 'regroup')) return rejected('mature_plan_requires_pinned_pressure_or_geometry_loss');
    if (action === 'flank') {
      if (previousTactic === 'flank' && planProgress < 0.96) return rejected('current_flank_already_committed');
      return this.withTacticalPlanPreview('flank', reason, () => {
        const plannedState = this.simulation.getState();
        const canonical = plannedState.agents.filter((agent) => agent.alive && agent.role === 'flanker' && agent.task === 'flank_to_cover');
        if (canonical.length !== 1) return rejected('canonical_flanker_count_invalid', { planRevision: plannedState.coordination.planRevision });
        const flanker = canonical[0]!;
        const origin = state.agents.find((agent) => agent.id === flanker.id)?.position ?? flanker.position;
        const target = flanker.tacticalTarget;
        if (target === null) return rejected('planner_missing_flank_target', { planRevision: plannedState.coordination.planRevision, maneuverAgentId: flanker.id, origin });
        const displacement = distance(origin, target);
        const threat = host.sharedLastKnownPosition ?? state.player;
        const angleGainDegrees = flankAngleGainDegrees(origin, target, threat);
        const path = findPath(tacticalWizardNavigationGrid, navCell(origin), navCell(target));
        const recentRepeat = this.lastCommittedAction === 'flank' && host.logicalTick - this.lastCommittedActionTick < RECENT_FLANK_MEMORY_TICKS;
        const targetNovelty = this.lastCommittedTarget === null ? Number.POSITIVE_INFINITY : distance(target, this.lastCommittedTarget);
        const contactNovelty = this.recentGeometryNovelty(host.sharedLastKnownPosition);
        const invalidReason = displacement < MIN_PLANNED_MOVE_DISPLACEMENT ? 'flank_displacement_below_minimum' : path.length < 2 ? 'flank_path_unreachable_or_zero_length' : angleGainDegrees < MIN_FLANK_ANGLE_GAIN_DEGREES && displacement < STRONG_FLANK_DISPLACEMENT ? 'flank_angle_gain_too_small' : recentRepeat && targetNovelty < MIN_REPEAT_FLANK_TARGET_NOVELTY && contactNovelty < 0.42 ? 'recent_flank_repeats_same_geometry' : null;
        if (invalidReason !== null) return rejected(invalidReason, { planRevision: plannedState.coordination.planRevision, maneuverAgentId: flanker.id, supportAgentId: plannedState.squad.suppressorId, origin, target, displacement: Number(displacement.toFixed(3)), angleGainDegrees: Number(angleGainDegrees.toFixed(2)), expectedTactic: 'flank' });
        return accepted({ reason: 'planner_accepted_canonical_flank_geometry', planRevision: plannedState.coordination.planRevision, maneuverAgentId: flanker.id, supportAgentId: plannedState.squad.suppressorId, origin: { ...origin }, target: { ...target }, displacement: Number(displacement.toFixed(3)), angleGainDegrees: Number(angleGainDegrees.toFixed(2)), expectedTactic: 'flank' });
      });
    }
    if (action === 'reposition') {
      if (previousTactic === 'sweep') return rejected('local_reposition_deferred_during_coordinated_search');
      const agent = state.agents.find((entry) => entry.id === pressuredAgentId && entry.alive);
      if (agent === undefined) return rejected('planner_missing_reposition_owner');
      const origin = { ...agent.position };
      const threatOrigin = clonePoint(this.lastShotOriginByAgent.get(pressuredAgentId) ?? host.sharedLastKnownPosition ?? state.player)!;
      const squadMatePositions = state.agents.filter((entry) => entry.alive && entry.id !== pressuredAgentId).map((entry) => entry.position);
      const candidate = selectUnderFireReposition(tacticalWizardNavigationGrid, navCell(origin), navCell(threatOrigin), squadMatePositions, MIN_PLANNED_MOVE_DISPLACEMENT, 8);
      if (candidate === null) return rejected('planner_missing_reposition_geometry', { maneuverAgentId: pressuredAgentId, origin });
      if (!candidate.coveredFromThreat && ownerBand !== 'pinned') return rejected('reposition_no_covered_destination', { maneuverAgentId: pressuredAgentId, origin, target: candidate.point, displacement: Number(candidate.distance.toFixed(3)) });
      const path = findPath(tacticalWizardNavigationGrid, navCell(origin), navCell(candidate.point));
      if (candidate.distance < MIN_PLANNED_MOVE_DISPLACEMENT || path.length < 2) return rejected(candidate.distance < MIN_PLANNED_MOVE_DISPLACEMENT ? 'reposition_displacement_below_minimum' : 'reposition_path_unreachable_or_zero_length', { maneuverAgentId: pressuredAgentId, supportAgentId: host.suppressorId, origin, target: candidate.point, displacement: Number(candidate.distance.toFixed(3)) });
      return accepted({ reason: 'planner_accepted_local_reposition_geometry', planRevision: previousPlanRevision + 1, maneuverAgentId: pressuredAgentId, supportAgentId: host.suppressorId, origin, target: { ...candidate.point }, displacement: Number(candidate.distance.toFixed(3)), angleGainDegrees: null, expectedTactic: previousTactic });
    }
    if (action === 'regroup') return this.withTacticalPlanPreview('regroup', reason, () => { const plannedState = this.simulation.getState(); return accepted({ reason: 'planner_accepted_contract_regroup', planRevision: plannedState.coordination.planRevision, maneuverAgentId: pressuredAgentId, supportAgentId: plannedState.squad.suppressorId, origin: null, target: null, displacement: null, angleGainDegrees: null, expectedTactic: 'regroup' }); });
    if (action === 'assault') return this.withTacticalPlanPreview('assault', reason, () => { const plannedState = this.simulation.getState(); if (!plannedState.agents.some((agent) => agent.alive && agent.role === 'assaulter' && agent.task === 'assault')) return rejected('planner_missing_assault_owner', { planRevision: plannedState.coordination.planRevision, expectedTactic: 'assault' }); return accepted({ reason: 'planner_accepted_aggressive_close', planRevision: plannedState.coordination.planRevision, maneuverAgentId: plannedState.squad.moverId, supportAgentId: plannedState.squad.suppressorId, origin: null, target: null, displacement: null, angleGainDegrees: null, expectedTactic: 'assault' }); });
    return rejected('no_pressure_response_action');
  }

  private withTacticalPlanPreview<T>(nextTactic: string, reason: string, evaluate: () => T): T {
    const host = this.internal().tacticalHost;
    const snapshot = this.captureHostPlanTransaction();
    try {
      if (host.tactic !== nextTactic) host.transitionTactic?.(nextTactic, `[preview] ${reason}`, false);
      return evaluate();
    } finally {
      this.restoreHostPlanTransaction(snapshot);
    }
  }

  private captureHostPlanTransaction(): HostPlanTransactionSnapshot {
    const internal = this.internal();
    const host = internal.tacticalHost;
    const record = host as unknown as Record<string, unknown>;
    const hostFieldNames = ['tactic', 'tacticStartedTick', 'tacticReason', 'maneuverCycle', 'boundingPhase', 'suppressorId', 'moverId', 'observerId', 'searchLeadId', 'searchCoverId', 'searchOverwatchId', 'coverSlots', 'planRevision', 'lastPlanReplanTick'];
    const hostFields: Record<string, unknown> = {};
    for (const key of hostFieldNames) hostFields[key] = record[key];
    const eventLog = [...((record.eventLog as string[] | undefined) ?? [])];
    const runLog = [...((record.runLog as unknown[] | undefined) ?? [])];
    const runLogSequence = Number(record.runLogSequence ?? 0);
    const members = host.members.map((member) => ({ id: member.id, fields: { ...(member as unknown as Record<string, unknown>) } }));
    const contracts = internal.contracts === undefined ? [] : [...internal.contracts.entries()].map(([key, value]) => [key, value] as const);
    return { hostFields, members, eventLog, runLog, runLogSequence, contracts };
  }

  private restoreHostPlanTransaction(snapshot: HostPlanTransactionSnapshot): void {
    const internal = this.internal();
    const host = internal.tacticalHost;
    const record = host as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(snapshot.hostFields)) record[key] = value;
    const currentEvents = (record.eventLog as string[] | undefined) ?? [];
    currentEvents.splice(0, currentEvents.length, ...snapshot.eventLog);
    const currentRunLog = (record.runLog as unknown[] | undefined) ?? [];
    currentRunLog.splice(0, currentRunLog.length, ...snapshot.runLog);
    record.runLogSequence = snapshot.runLogSequence;
    for (const saved of snapshot.members) { const member = host.members.find((entry) => entry.id === saved.id); if (member !== undefined) Object.assign(member as unknown as Record<string, unknown>, saved.fields); }
    if (internal.contracts !== undefined) { internal.contracts.clear(); for (const [key, value] of snapshot.contracts) internal.contracts.set(key, value); }
  }

  private commitPressureLease(state: TacticalWizardSimulationState, attempt: PlannerAttemptResult, pressuredAgentId: string, reason: string): void {
    const host = this.internal().tacticalHost;
    const tick = host.logicalTick;
    if (attempt.candidateId === 'flank' || attempt.candidateId === 'regroup' || attempt.candidateId === 'assault') {
      if (attempt.expectedTactic !== null && host.tactic !== attempt.expectedTactic) host.transitionTactic?.(attempt.expectedTactic, reason, false);
    } else if (attempt.candidateId === 'reposition' && attempt.maneuverAgentId !== null && attempt.target !== null) {
      const member = host.members.find((entry) => entry.id === attempt.maneuverAgentId);
      if (member !== undefined) {
        member.tacticalTarget = { ...attempt.target };
        member.coverSlot = null;
        member.coverState = 'moving';
        host.planRevision = (host.planRevision ?? state.coordination.planRevision) + 1;
        this.internal().contracts?.delete(member.id);
        host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Tactical Planning committed one local reposition without replacing the squad doctrine.', { agentId: member.id, tactic: host.tactic, target: { ...attempt.target }, displacement: attempt.displacement, planRevision: host.planRevision });
      }
    }
    const committedState = this.simulation.getState();
    const duration = attempt.candidateId === 'trade_fire' ? TRADE_FIRE_LEASE_TICKS : PRESSURE_RESPONSE_LEASE_TICKS;
    const lease: PressureResponseLease = { id: `pressure-${++this.responseSerial}`, action: attempt.candidateId, opportunity: attempt.opportunity, pressuredAgentId, maneuverAgentId: attempt.maneuverAgentId, supportAgentId: attempt.supportAgentId, origin: clonePoint(attempt.origin), target: clonePoint(attempt.target), startedTick: tick, untilTick: tick + duration, startedPressure: this.squadPressure(committedState), startedBand: this.pressureBandByAgent.get(pressuredAgentId) ?? 'suppressed', expectedTactic: attempt.expectedTactic, worldRevision: this.world.view().geometryRevision, planRevision: committedState.coordination.planRevision, plannerTargetDisplacement: attempt.displacement, plannerAngleGainDegrees: attempt.angleGainDegrees, softStableTicks: 0, reason };
    this.activeResponse = lease;
    this.lastLeaseEscalationBand = lease.startedBand;
    this.lastPressureAction = lease.action;
    this.lastPressureActionReason = reason;
    this.lastPressureActionTick = tick;
    this.lastCommittedAction = lease.action;
    this.lastCommittedActionTick = tick;
    this.lastCommittedTarget = clonePoint(lease.target);
    this.lastCommittedThreatAnchor = clonePoint(host.sharedLastKnownPosition);
    this.pressureResponses += 1;
    this.responseCooldownUntilTick = lease.untilTick + PRESSURE_RESPONSE_COOLDOWN_TICKS;
    host.pushEvent(`T${tick}: IAUS ${lease.opportunity} accepted by Tactical Planning as ${lease.id} until T${lease.untilTick}.`);
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Tactical Planner accepted the IAUS opportunity; one bounded response lease now owns the committed response intent.', { leaseId: lease.id, action: lease.action, opportunity: lease.opportunity, pressuredAgentId: lease.pressuredAgentId, maneuverAgentId: lease.maneuverAgentId, supportAgentId: lease.supportAgentId, origin: lease.origin, target: lease.target, displacement: lease.plannerTargetDisplacement, angleGainDegrees: lease.plannerAngleGainDegrees, planRevision: lease.planRevision, startedTick: lease.startedTick, untilTick: lease.untilTick, expectedTactic: lease.expectedTactic, worldRevision: lease.worldRevision });
  }

  private maintainPressureResponse(state: TacticalWizardSimulationState): void {
    const lease = this.activeResponse;
    if (lease === null) return;
    const host = this.internal().tacticalHost;
    if (state.recovery.phase !== 'none') {
      this.releasePressureResponse('recovery_preempted', true);
      return;
    }
    const ownerAlive = state.agents.some((agent) => agent.id === lease.pressuredAgentId && agent.alive);
    const maneuverAlive = lease.maneuverAgentId === null || state.agents.some((agent) => agent.id === lease.maneuverAgentId && agent.alive);
    if (!ownerAlive || !maneuverAlive) {
      this.releasePressureResponse('assigned_member_unavailable', true);
      return;
    }
    if (lease.target !== null && !isTargetWalkable(lease.target)) {
      this.releasePressureResponse('response_geometry_invalid', true);
      return;
    }
    if (lease.worldRevision !== this.world.view().geometryRevision) {
      this.releasePressureResponse('world_geometry_changed', true);
      return;
    }
    if (lease.action === 'reposition' && lease.expectedTactic !== null && host.tactic !== lease.expectedTactic) {
      this.releasePressureResponse('base_tactic_changed_during_local_reposition', false);
      return;
    }
    if (lease.expectedTactic === 'flank' && host.tactic !== 'flank') {
      if (host.tactic === 'crossfire' || host.tactic === 'assault') this.releasePressureResponse('flank_completed_into_followup', false);
      else this.releasePressureResponse('base_tactic_invalidated_flank', true);
      return;
    }
    if (lease.expectedTactic === 'regroup' && host.tactic !== 'regroup') {
      this.releasePressureResponse('regroup_completed_or_reseeded', false);
      return;
    }
    if (lease.expectedTactic === 'assault' && host.tactic !== 'assault') {
      this.releasePressureResponse('assault_completed_or_replanned', false);
      return;
    }

    const ownerBand = this.pressureBandByAgent.get(lease.pressuredAgentId) ?? 'stable';
    const stableNow = ownerBand === 'stable' && this.squadPressure(state) < 0.22;
    const updated: PressureResponseLease = { ...lease, softStableTicks: stableNow ? lease.softStableTicks + 1 : 0 };
    this.activeResponse = updated;
    const geometryComplete = this.responseGeometryComplete(state, updated);

    if (updated.action === 'reposition' && geometryComplete) {
      this.releasePressureResponse('reposition_completed', false);
      return;
    }
    if (updated.action === 'trade_fire' && updated.softStableTicks >= TRADE_FIRE_SOFT_RELEASE_STABLE_TICKS) {
      this.releasePressureResponse('pressure_stabilized_hold_complete', false);
      return;
    }
    if (geometryComplete && updated.softStableTicks >= RESPONSE_SOFT_RELEASE_STABLE_TICKS) {
      this.releasePressureResponse('response_goal_completed_under_stable_pressure', false);
      return;
    }
    if (!leaseStillOwnsResponse(updated, host.logicalTick)) this.releasePressureResponse('lease_expired', false);
  }

  private responseGeometryComplete(state: TacticalWizardSimulationState, lease: PressureResponseLease): boolean {
    if (lease.maneuverAgentId === null || lease.target === null) return lease.action === 'trade_fire' || lease.action === 'regroup' || lease.action === 'assault';
    const agent = state.agents.find((entry) => entry.id === lease.maneuverAgentId);
    return agent !== undefined && distance(agent.position, lease.target) <= REPOSITION_ARRIVAL;
  }

  private releasePressureResponse(reason: string, hardInvalidation: boolean): void {
    const lease = this.activeResponse;
    if (lease === null) return;
    const host = this.internal().tacticalHost;
    const shouldReseedLocalPlan = lease.action === 'reposition' && reason === 'reposition_completed' && host.alertState === 'active' && this.simulation.getState().recovery.phase === 'none';
    if (hardInvalidation) this.pressureHardInvalidations += 1;
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Incoming-fire response lease released.', { leaseId: lease.id, action: lease.action, opportunity: lease.opportunity, reason, hardInvalidation, heldTicks: Math.max(0, host.logicalTick - lease.startedTick), softStableTicks: lease.softStableTicks, pressureNow: Number(this.squadPressure(this.simulation.getState()).toFixed(3)) });
    this.activeResponse = null;
    this.lastLeaseEscalationBand = 'stable';
    if (shouldReseedLocalPlan) {
      host.refreshTacticalPlan?.();
      host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Local reposition completed; Tactical Planning reseeded the unchanged squad doctrine from the new firing position.', { tactic: host.tactic, agentId: lease.maneuverAgentId });
    }
  }

  private logLeaseEscalationIfNeeded(): void {
    const lease = this.activeResponse;
    if (lease === null) return;
    const band = this.pressureBandByAgent.get(lease.pressuredAgentId) ?? 'stable';
    if (band !== 'pinned' || this.lastLeaseEscalationBand === 'pinned') return;
    this.lastLeaseEscalationBand = 'pinned';
    this.internal().tacticalHost.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'alert', 'Incoming fire escalated the active response to pinned pressure without replacing its lease.', {
      leaseId: lease.id,
      action: lease.action,
      pressuredAgentId: lease.pressuredAgentId,
      pressure: Number((this.pressureByAgent.get(lease.pressuredAgentId) ?? 0).toFixed(3)),
      band,
      leaseUntilTick: lease.untilTick,
    });
  }

  private currentPlanProgress(state: TacticalWizardSimulationState): number {
    const living = state.agents.filter((agent) => agent.alive);
    if (living.length === 0 || state.squad.alertState !== 'active') return 0;
    if (state.squad.tactic === 'sweep') {
      const searchers = living.filter((agent) => agent.task === 'search_sector');
      return searchers.length === 0 ? 0 : clamp01(searchers.reduce((sum, agent) => sum + agent.searchProgress, 0) / searchers.length);
    }
    const relevant = state.squad.tactic === 'flank'
      ? living.filter((agent) => agent.role === 'flanker')
      : state.squad.tactic === 'crossfire'
        ? living.filter((agent) => agent.role === 'crossfire')
        : state.squad.tactic === 'assault'
          ? living.filter((agent) => agent.role === 'assaulter')
          : state.squad.tactic === 'bounding'
            ? living.filter((agent) => agent.role === 'mover')
            : living;
    if (relevant.length === 0) return 0;
    return clamp01(relevant.reduce((sum, agent) => {
      if (agent.tacticalTarget === null) return sum;
      const remaining = distance(agent.position, agent.tacticalTarget);
      return sum + clamp01(1 - remaining / 6);
    }, 0) / relevant.length);
  }

  private currentGeometryQuality(state: TacticalWizardSimulationState, planProgress: number): number {
    const laneQuality = clamp01(state.safeFireLanes / 2);
    const spreadQuality = clamp01(state.squad.spread / 10);
    if (state.squad.tactic === 'crossfire') return clamp01(laneQuality * 0.55 + planProgress * 0.3 + spreadQuality * 0.15);
    if (state.squad.tactic === 'flank') return clamp01(laneQuality * 0.35 + planProgress * 0.42 + spreadQuality * 0.23);
    if (state.squad.tactic === 'assault') return clamp01(laneQuality * 0.35 + planProgress * 0.5 + 0.15);
    return clamp01(laneQuality * 0.25 + planProgress * 0.45 + spreadQuality * 0.15 + 0.15);
  }

  private recentGeometryNovelty(currentThreat: GridPoint | null): number {
    if (this.lastCommittedThreatAnchor === null || currentThreat === null) return 1;
    return clamp01(distance(this.lastCommittedThreatAnchor, currentThreat) / 6);
  }

  private restoreTactic(previousTactic: string, reason: string): void {
    const host = this.internal().tacticalHost;
    if (host.tactic === previousTactic) return;
    host.transitionTactic?.(previousTactic, reason, false);
  }

  private applyFormationHold(state: TacticalWizardSimulationState): void {
    const host = this.internal().tacticalHost;
    this.formationHoldIds.clear();
    this.formationCatchUpIds.clear();
    if (host.alertState !== 'idle' || typeof host.getPatrolTarget !== 'function') {
      this.formationHoldSince.clear();
      return;
    }
    const livingIds = new Set(state.agents.filter((agent) => agent.alive).map((agent) => agent.id));
    const livingMembers = host.members.filter((member) => livingIds.has(member.id));
    if (livingMembers.length === 0) return;

    for (const member of livingMembers) {
      member.role = 'patrol';
      member.task = 'patrol';
      member.tacticalTarget = null;
      member.coverSlot = null;
      member.coverState = 'none';
      member.buddyRole = 'none';
      member.opportunityPurpose = 'none';
    }

    const targets = new Map(livingMembers.map((member) => [member.id, host.getPatrolTarget!(member)]));
    const arrived = livingMembers.filter((member) => distance(member.position, targets.get(member.id)!) <= FORMATION_ARRIVAL);
    if (arrived.length === livingMembers.length) {
      this.formationHoldSince.clear();
      return;
    }
    const lagging = livingMembers
      .filter((member) => !arrived.includes(member))
      .sort((left, right) => distance(right.position, targets.get(right.id)!) - distance(left.position, targets.get(left.id)!));
    const longestHold = Math.max(0, ...arrived.map((member) => host.logicalTick - (this.formationHoldSince.get(member.id) ?? host.logicalTick)));

    for (const [index, member] of arrived.entries()) {
      const started = this.formationHoldSince.get(member.id) ?? host.logicalTick;
      if (!this.formationHoldSince.has(member.id)) {
        this.formationHoldSince.set(member.id, started);
        host.log('agent', member.id, member.label, 'decision', `${member.label} entered formation hold while the patrol element closes distance.`, { patrolIndex: host.patrolIndex, reason: 'arrived_before_squad' });
      }
      this.formationHoldIds.add(member.id);
      member.selectedIntent = 'formation_hold';
      const nextPatrol = tacticalWizardTestMap.patrolPoints[(host.patrolIndex + 1) % tacticalWizardTestMap.patrolPoints.length] ?? member.position;
      const lagger = lagging[index % Math.max(1, lagging.length)] ?? lagging[0];
      const phase = Math.floor((host.motionFrame + index * 19) / 24) % 3;
      const anchor = phase === 1 && lagger !== undefined ? lagger.position : nextPatrol;
      const offset = phase === 0 ? -42 : phase === 2 ? 42 : 0;
      const look = offsetLook(member.position, anchor, offset, 5.5);
      member.searchLookTarget = look;
      member.facing = normalizedDelta(member.position, look);
    }

    for (const member of lagging) {
      this.formationHoldSince.delete(member.id);
      if (longestHold < FORMATION_CATCH_UP_TICKS) continue;
      this.formationCatchUpIds.add(member.id);
      member.selectedIntent = 'formation_catch_up';
      member.searchLookTarget = targets.get(member.id) ?? null;
    }
  }

  private invalidateWorldGeometry(point: GridPoint | null, source: string): void {
    const internal = this.internal();
    const host = internal.tacticalHost;
    internal.contracts?.clear();
    if (this.activeResponse !== null) this.releasePressureResponse('world_geometry_changed', true);
    if (host.alertState === 'active' && host.sharedLastKnownPosition !== null) host.refreshTacticalPlan?.();
    if (internal.recoveryPlan !== undefined && internal.recoveryPlan !== null && typeof internal.replanRecoveryGeometry === 'function') {
      internal.replanRecoveryGeometry(this.simulation.getState(), 'world_geometry_changed', true);
    }
    host.pushEvent(`T${host.logicalTick}: destructible cover changed navigation / LOS geometry.`);
    host.log('system', 'simulation', 'Combat Sandbox', 'plan', 'World geometry revision invalidated cached tactical positions.', {
      source,
      point: point === null ? null : { ...point },
      geometryRevision: this.world.view().geometryRevision,
      nextPolicy: 'requery_navigation_los_cover_recovery_pressure_response',
    });
  }

  private internal(): InternalRuntimeAccess { return this.simulation as unknown as InternalRuntimeAccess; }
}

function clonePlannerTrace(trace: PressurePlannerTraceView | null): PressurePlannerTraceView | null {
  if (trace === null) return null;
  return {
    ...trace,
    candidateScores: trace.candidateScores.map((entry) => ({ ...entry })),
    attempts: trace.attempts.map(clonePlannerAttempt),
  };
}

function clonePlannerAttempt(attempt: PressurePlannerAttemptView): PressurePlannerAttemptView {
  return { ...attempt, target: clonePoint(attempt.target) };
}

function normalizeProfile(profile: TacticalWizardCombatProfile): TacticalWizardCombatProfile {
  return {
    ...profile,
    aggression: clamp01(profile.aggression),
    suppressionTolerance: clamp01(profile.suppressionTolerance),
    flankBias: clamp01(profile.flankBias),
    repositionBias: clamp01(profile.repositionBias),
    coordination: clamp01(profile.coordination),
    holdGroundBias: clamp01(profile.holdGroundBias),
    counterManeuverBias: clamp01(profile.counterManeuverBias),
    breakContactBias: clamp01(profile.breakContactBias),
    utilityTradeFireWeight: clamp(profile.utilityTradeFireWeight, 0.25, 1.75),
    utilityRepositionWeight: clamp(profile.utilityRepositionWeight, 0.25, 1.75),
    utilityFlankWeight: clamp(profile.utilityFlankWeight, 0.25, 1.75),
    utilityRegroupWeight: clamp(profile.utilityRegroupWeight, 0.25, 1.75),
    utilityAssaultWeight: clamp(profile.utilityAssaultWeight, 0.25, 1.75),
  };
}

function pointSegmentDistance(point: GridPoint, start: GridPoint, end: GridPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
}

function flankAngleGainDegrees(origin: GridPoint, target: GridPoint, threat: GridPoint): number {
  const before = normalizedDelta(threat, origin);
  const after = normalizedDelta(threat, target);
  const dot = clamp(before.x * after.x + before.y * after.y, -1, 1);
  return Math.acos(dot) * 180 / Math.PI;
}

function navCell(point: GridPoint): GridPoint { return { x: Math.round(point.x), y: Math.round(point.y) }; }
function normalizedDelta(from: GridPoint, to: GridPoint): GridPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length <= 1e-6 ? { x: 1, y: 0 } : { x: dx / length, y: dy / length };
}
function offsetLook(from: GridPoint, anchor: GridPoint, degrees: number, range: number): GridPoint {
  const direction = normalizedDelta(from, anchor);
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotated = { x: direction.x * cos - direction.y * sin, y: direction.x * sin + direction.y * cos };
  return { x: from.x + rotated.x * range, y: from.y + rotated.y * range };
}
function clonePoint(point: GridPoint | null): GridPoint | null { return point === null ? null : { ...point }; }
function clamp01(value: number): number { return clamp(value, 0, 1); }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }
function distance(a: GridPoint, b: GridPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function isTargetWalkable(point: GridPoint): boolean {
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  return x >= 0 && y >= 0 && x < tacticalWizardNavigationGrid.width && y < tacticalWizardNavigationGrid.height && !tacticalWizardNavigationGrid.blocked.has(`${x},${y}`);
}
