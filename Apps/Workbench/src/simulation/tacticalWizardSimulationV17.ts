import { findPath, hasLineOfSight, isWalkable, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from './tacticalWizardTestMapV7';
import type { RunLogCategory, RunLogEvent, RunLogValue } from './tacticalWizardSimulationV3';
import {
  TacticalWizardSimulation as TacticalWizardSimulationV16,
  type TacticalWizardSimulationState as TacticalWizardSimulationStateV16,
} from './tacticalWizardSimulationV16';

export * from './tacticalWizardSimulationV16';

export type ThreatEvidenceKind = 'gunshot' | 'bullet_impact' | 'near_miss' | 'hit';
export type ThreatAwarenessLevel = 'none' | 'suspicious' | 'threatened' | 'confirmed';
export type HealthBand = 'healthy' | 'wounded' | 'critical' | 'downed';
export type LogisticsLifecycleState = 'idle' | 'assigned' | 'suspended';

export interface ThreatAwarenessView {
  readonly level: ThreatAwarenessLevel;
  readonly confidence: number;
  readonly bearing: GridPoint | null;
  readonly estimatedSector: GridPoint | null;
  readonly lastEvidenceTick: number | null;
  readonly lastEvidenceKind: ThreatEvidenceKind | null;
  readonly evidenceCount: number;
  readonly evidenceCounts: Readonly<Record<ThreatEvidenceKind, number>>;
  readonly affectedAgentIds: readonly string[];
  readonly responseEscalations: number;
}

export interface CohesionView {
  readonly active: boolean;
  readonly patientId: string | null;
  readonly patientBand: HealthBand | null;
  readonly buddyId: string | null;
  readonly securityId: string | null;
  readonly reason: 'none' | 'critical_health' | 'wounded_isolation';
  readonly rallyPoint: GridPoint | null;
  readonly buddySupportPoint: GridPoint | null;
  readonly buddyDistance: number | null;
  readonly maxBuddyDistance: number;
}

export interface LeadershipView {
  readonly nominalCommanderId: string;
  readonly actingCommanderId: string | null;
  readonly livingCount: number;
  readonly capability: 'full_squad' | 'reduced_pair' | 'single_survivor' | 'combat_ineffective';
  readonly successionActive: boolean;
}

export interface LogisticsLifecycleView {
  readonly state: LogisticsLifecycleState;
  readonly agentId: string | null;
  readonly supplyId: string | null;
  readonly task: string | null;
  readonly suspendedUntilTick: number | null;
  readonly suppressedPlanningCalls: number;
}

export interface TacticalWizardSimulationState extends TacticalWizardSimulationStateV16 {
  readonly threatAwareness: ThreatAwarenessView;
  readonly cohesion: CohesionView;
  readonly leadership: LeadershipView;
  readonly logisticsLifecycle: LogisticsLifecycleView;
}

interface HostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  facing: GridPoint;
  firePulse: number;
  fireBlockedByFriend: string | null;
  fireOrigin?: GridPoint | null;
  targetVisible: boolean;
  task: string;
  role: string;
  tacticalTarget: GridPoint | null;
  locomotionMode?: string;
  grenadeCount: number;
  grenadeCooldownUntilTick: number;
  specialAction: string;
  specialActionPulse: number;
  coverSlot?: { readonly position: GridPoint; readonly peekPosition: GridPoint } | null;
}

interface MutableGrenade {
  readonly id: number;
  readonly ownerId: string;
  readonly kind: 'flash' | 'frag' | 'smoke';
  readonly from: GridPoint;
  readonly to: GridPoint;
  readonly radius: number;
  remainingFrames: number;
  readonly totalFrames: number;
  readonly flightFrames: number;
}

interface HostAccess {
  members: HostMember[];
  logicalTick: number;
  tactic: string;
  alertState: 'idle' | 'pending' | 'active';
  suppressorId: string | null;
  moverId: string | null;
  observerId: string | null;
  sharedLastKnownPosition: GridPoint | null;
  activeGrenades: MutableGrenade[];
  lastSquadGrenadeTick: number;
  movementTarget: (member: HostMember) => GridPoint | null;
  tryFire: (member: HostMember, target: GridPoint, reason: string) => void;
  tryGrenade: (member: HostMember) => boolean;
  canSeePlayer: (member: HostMember) => boolean;
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

interface LogisticsAssignment {
  readonly agentId: string;
  readonly supplyId: string;
  readonly task: string;
}

interface V8LifecycleAccess {
  assignment: LogisticsAssignment | null;
  planResupplyIfNeeded: () => void;
  updateCommandOrder: () => void;
}

interface WoundedSupportPlan {
  readonly patientId: string;
  readonly buddyId: string;
  readonly securityId: string | null;
  readonly reason: 'critical_health' | 'wounded_isolation';
  readonly startedTick: number;
  rallyPoint: GridPoint;
  buddySupportPoint: GridPoint;
}

interface ThreatAccumulator {
  confidence: number;
  bearing: GridPoint | null;
  sector: GridPoint | null;
  lastEvidenceTick: number | null;
  lastKind: ThreatEvidenceKind | null;
  count: number;
  counts: Record<ThreatEvidenceKind, number>;
  affectedIds: Set<string>;
}

const NOMINAL_COMMANDER_ID = 'twr:rifle-squad:alpha';
const PLAYER_NEAR_MISS_STRONG = 0.9;
const PLAYER_NEAR_MISS_WEAK = 2.1;
const PLAYER_IMPACT_AWARENESS = 3.8;
const PLAYER_GUNSHOT_HEARING = 18;
const THREAT_SUSPICIOUS = 0.24;
const THREAT_ESCALATE = 0.66;
const THREAT_DECAY_PER_TICK = 0.045;
const THREAT_RESPONSE_COOLDOWN_TICKS = 10;
const THREAT_SECTOR_RANGE = 8;
const CRITICAL_HEALTH_RATIO = 0.25;
const WOUNDED_HEALTH_RATIO = 0.5;
const WOUNDED_ISOLATION_DISTANCE = 10;
const WOUNDED_SUPPORT_MAX_DISTANCE = 6.5;
const WOUNDED_SUPPORT_DESIRED_DISTANCE = 3.8;
const WOUNDED_RALLY_RADIUS = 5;
const LOGISTICS_RESUME_DELAY_TICKS = 14;
const CRITICAL_AMMO = 12;
const SEARCH_FLASH_FRESH_TICKS = 5;
const FRIENDLY_FLASH_MARGIN = 0.8;
const FRIENDLY_FRAG_MARGIN = 1.05;

/**
 * V17 adds three missing pieces of combat common sense to the Workbench Host:
 *
 * 1. Threat evidence is no longer synonymous with damage. A sequence of audible
 *    shots, impacts and near misses can raise a coarse incoming-fire hypothesis
 *    and reuse V11's counter-ambush response without exposing the hidden live
 *    shooter coordinate to cognition.
 * 2. Critical or isolated wounded members create a bounded mutual-support
 *    contract. One buddy closes the support gap while a third soldier, when
 *    available, remains the security element. The wounded member stops accepting
 *    long aggressive movement targets until stabilized.
 * 3. Offensive throwable commits receive a final effect-area safety check.
 *    Flash/frag cannot be committed onto friendlies, live-contact throws cannot
 *    land far away from the confirmed target, and stale LKP flashes are rejected.
 *
 * V17 also wraps V8 logistics planning so combat/search/recovery suspension is a
 * lifecycle state rather than an assignment-create/preempt loop every frame.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationV16 {
  private threat: ThreatAccumulator = createThreatAccumulator();
  private lastThreatDecayTick = -1;
  private lastThreatResponseTick = -999;
  private threatResponseEscalations = 0;
  private woundedPlan: WoundedSupportPlan | null = null;
  private lastCohesionPlanKey: string | null = null;
  private logisticsSuspendedUntilTick = -1;
  private logisticsSuppressedPlanningCalls = 0;
  private lastLogisticsLifecycleState: LogisticsLifecycleState = 'idle';

  constructor() {
    super();
    this.installV17Hooks();
    const host = this.v17Host();
    host.pushEvent('V17: threat evidence, wounded mutual support, throwable effect safety and lifecycle logistics enabled.');
    host.log('system', 'simulation', 'Volition Simulation', 'session', 'V17 threat-awareness / cohesion / throwable-safety layer enabled.', {
      threatEscalationThreshold: THREAT_ESCALATE,
      criticalHealthRatio: CRITICAL_HEALTH_RATIO,
      woundedIsolationDistance: WOUNDED_ISOLATION_DISTANCE,
      throwableSafety: 'precheck_plus_final_effect_area_validation',
      logisticsPolicy: 'suspend_then_resume_without_reassignment_churn',
      hiddenTargetPolicy: 'coarse_directional_evidence_only_without_visual',
    });
  }

  override reset(): TacticalWizardSimulationState {
    super.reset();
    this.threat = createThreatAccumulator();
    this.lastThreatDecayTick = -1;
    this.lastThreatResponseTick = -999;
    this.threatResponseEscalations = 0;
    this.woundedPlan = null;
    this.lastCohesionPlanKey = null;
    this.logisticsSuspendedUntilTick = -1;
    this.logisticsSuppressedPlanningCalls = 0;
    this.lastLogisticsLifecycleState = 'idle';
    this.v17Host().pushEvent('V17: threat/cohesion/logistics lifecycle state reset.');
    return this.getState();
  }

  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    this.decayThreat(this.baseState());
    this.maintainWoundedSupport(this.baseState());
    super.advance(deltaSeconds);
    const state = this.baseState();
    this.decayThreat(state);
    this.maintainWoundedSupport(state);
    this.observeLogisticsLifecycle(state);
    return this.getState();
  }

  override playerFireAt(point: GridPoint): boolean {
    const before = this.baseState();
    const beforeHealth = new Map(before.agents.map((agent) => [agent.id, agent.health]));
    const result = super.playerFireAt(point);
    const after = this.baseState();
    this.observePlayerShotEvidence(before, after, beforeHealth);
    this.maintainWoundedSupport(after);
    this.observeLogisticsLifecycle(after);
    return result;
  }

  override getState(): TacticalWizardSimulationState {
    const base = super.getState();
    const visualIds = this.confirmedVisualIds(base);
    const leadership = this.leadershipFor(base);
    const threatLevel: ThreatAwarenessLevel = visualIds.length > 0
      ? 'confirmed'
      : this.threat.confidence >= THREAT_ESCALATE
        ? 'threatened'
        : this.threat.confidence >= THREAT_SUSPICIOUS
          ? 'suspicious'
          : 'none';
    const patient = this.woundedPlan === null ? null : base.agents.find((agent) => agent.id === this.woundedPlan!.patientId) ?? null;
    const buddy = this.woundedPlan === null ? null : base.agents.find((agent) => agent.id === this.woundedPlan!.buddyId) ?? null;
    const assignment = this.v17V8().assignment;
    const lifecycleState: LogisticsLifecycleState = assignment !== null
      ? 'assigned'
      : base.logicalTick < this.logisticsSuspendedUntilTick
        ? 'suspended'
        : 'idle';
    const commandOrder = leadership.actingCommanderId === null
      ? 'Squad combat ineffective; no living command element remains.'
      : leadership.successionActive
        ? `${labelFor(base, leadership.actingCommanderId)} is acting commander; preserve mutual support and recover combat capability before complex maneuver.`
        : base.command.order;

    return {
      ...base,
      commanderId: leadership.actingCommanderId ?? base.commanderId,
      command: {
        ...base.command,
        commanderId: leadership.actingCommanderId ?? base.command.commanderId,
        order: commandOrder,
      },
      threatAwareness: {
        level: threatLevel,
        confidence: Number(this.threat.confidence.toFixed(3)),
        bearing: clonePoint(this.threat.bearing),
        estimatedSector: clonePoint(this.threat.sector),
        lastEvidenceTick: this.threat.lastEvidenceTick,
        lastEvidenceKind: this.threat.lastKind,
        evidenceCount: this.threat.count,
        evidenceCounts: { ...this.threat.counts },
        affectedAgentIds: [...this.threat.affectedIds].sort(),
        responseEscalations: this.threatResponseEscalations,
      },
      cohesion: {
        active: this.woundedPlan !== null,
        patientId: this.woundedPlan?.patientId ?? null,
        patientBand: patient === null ? null : healthBand(patient.health, patient.maxHealth),
        buddyId: this.woundedPlan?.buddyId ?? null,
        securityId: this.woundedPlan?.securityId ?? null,
        reason: this.woundedPlan?.reason ?? 'none',
        rallyPoint: clonePoint(this.woundedPlan?.rallyPoint ?? null),
        buddySupportPoint: clonePoint(this.woundedPlan?.buddySupportPoint ?? null),
        buddyDistance: patient === null || buddy === null ? null : Number(distance(patient.position, buddy.position).toFixed(2)),
        maxBuddyDistance: WOUNDED_SUPPORT_MAX_DISTANCE,
      },
      leadership,
      logisticsLifecycle: {
        state: lifecycleState,
        agentId: assignment?.agentId ?? null,
        supplyId: assignment?.supplyId ?? null,
        task: assignment?.task ?? null,
        suspendedUntilTick: lifecycleState === 'suspended' ? this.logisticsSuspendedUntilTick : null,
        suppressedPlanningCalls: this.logisticsSuppressedPlanningCalls,
      },
    };
  }

  /** Deterministic scenario hook for editor/regression tests. */
  injectThreatEvidenceForTest(agentId: string, kind: ThreatEvidenceKind, confidence: number, bearing: GridPoint): boolean {
    const state = this.baseState();
    const agent = state.agents.find((entry) => entry.id === agentId && entry.alive);
    if (agent === undefined) return false;
    this.recordThreatEvidence(kind, agent.id, agent.position, bearing, Math.max(0, Math.min(1, confidence)), state.logicalTick);
    this.maybeEscalateThreat(state, agent.id, { x: agent.position.x + bearing.x * 10, y: agent.position.y + bearing.y * 10 });
    return true;
  }

  private installV17Hooks(): void {
    const host = this.v17Host();
    const v8 = this.v17V8();

    const originalPlanResupply = v8.planResupplyIfNeeded.bind(this);
    v8.planResupplyIfNeeded = (): void => {
      const state = this.baseState();
      if (this.suppressNewLogistics(state)) {
        this.logisticsSuppressedPlanningCalls += 1;
        return;
      }
      originalPlanResupply();
    };

    const originalMovementTarget = host.movementTarget.bind(this);
    host.movementTarget = (member: HostMember): GridPoint | null => {
      const baseTarget = originalMovementTarget(member);
      const plan = this.woundedPlan;
      if (plan === null) return baseTarget;
      const state = this.baseState();
      const patient = state.agents.find((agent) => agent.id === plan.patientId);
      const buddy = state.agents.find((agent) => agent.id === plan.buddyId);
      if (patient === undefined || buddy === undefined || !patient.alive || !buddy.alive) return baseTarget;

      if (member.id === plan.patientId) {
        if (distance(patient.position, plan.rallyPoint) > 0.8) return { ...plan.rallyPoint };
        return null;
      }
      if (member.id === plan.buddyId) {
        const buddyTooFar = distance(buddy.position, patient.position) > WOUNDED_SUPPORT_DESIRED_DISTANCE + 0.7;
        const baseWouldBreakSupport = baseTarget !== null && distance(baseTarget, patient.position) > WOUNDED_SUPPORT_MAX_DISTANCE + 1;
        if (buddyTooFar || baseWouldBreakSupport) return { ...plan.buddySupportPoint };
      }
      return baseTarget;
    };

    const originalTryGrenade = host.tryGrenade.bind(this);
    host.tryGrenade = (member: HostMember): boolean => {
      const state = this.baseState();
      if (!this.throwablePrecheck(member, state)) return false;

      const beforeGrenadeCount = member.grenadeCount;
      const beforeCooldown = member.grenadeCooldownUntilTick;
      const beforeAction = member.specialAction;
      const beforeActionPulse = member.specialActionPulse;
      const beforeLastSquadGrenadeTick = host.lastSquadGrenadeTick;
      const beforeIds = new Set(host.activeGrenades.map((grenade) => grenade.id));
      const committed = originalTryGrenade(member);
      if (!committed) return false;
      const grenade = [...host.activeGrenades].reverse().find((entry) => entry.ownerId === member.id && !beforeIds.has(entry.id));
      if (grenade === undefined) return committed;

      const safety = this.validateCommittedThrowable(member, grenade, state);
      if (safety.safe) {
        host.log('agent', member.id, member.label, 'plan', `${member.label} throwable passed V17 effect-area safety.`, {
          grenadeKind: grenade.kind,
          target: { ...grenade.to },
          targetClass: safety.targetClass,
          friendliesAtRisk: [],
          safety: 'clear',
        });
        return true;
      }

      const index = host.activeGrenades.findIndex((entry) => entry.id === grenade.id);
      if (index >= 0) host.activeGrenades.splice(index, 1);
      member.grenadeCount = beforeGrenadeCount;
      member.grenadeCooldownUntilTick = beforeCooldown;
      member.specialAction = beforeAction;
      member.specialActionPulse = beforeActionPulse;
      host.lastSquadGrenadeTick = beforeLastSquadGrenadeTick;
      host.pushEvent(`T${state.logicalTick}: ${member.label} cancelled ${grenade.kind} throw — ${safety.reason}.`);
      host.log('agent', member.id, member.label, 'plan', `${member.label} throwable was cancelled by final V17 safety validation.`, {
        grenadeKind: grenade.kind,
        target: { ...grenade.to },
        targetClass: safety.targetClass,
        friendliesAtRisk: safety.friendliesAtRisk,
        reason: safety.reason,
        safety: 'rejected_and_refunded',
      });
      return false;
    };
  }

  private observePlayerShotEvidence(
    before: TacticalWizardSimulationStateV16,
    after: TacticalWizardSimulationStateV16,
    beforeHealth: ReadonlyMap<string, number>,
  ): void {
    const from = after.playerCombat.shotFrom;
    const to = after.playerCombat.shotTo;
    if (from === null || to === null) return;
    const hitIds = after.agents.filter((agent) => agent.health < (beforeHealth.get(agent.id) ?? agent.health)).map((agent) => agent.id);
    if (hitIds.length > 0) {
      for (const id of hitIds) {
        const agent = after.agents.find((entry) => entry.id === id);
        if (agent === undefined) continue;
        const bearing = quantizeDirection(normalize({ x: from.x - agent.position.x, y: from.y - agent.position.y }));
        this.recordThreatEvidence('hit', id, agent.position, bearing, 1, after.logicalTick);
      }
      return;
    }

    const candidates = after.agents
      .filter((agent) => agent.alive)
      .map((agent) => ({ agent, sample: pointToSegment(agent.position, from, to) }))
      .filter(({ sample }) => sample.t >= 0 && sample.t <= 1)
      .sort((left, right) => left.sample.distance - right.sample.distance || left.agent.id.localeCompare(right.agent.id, 'en'));

    let strongest: { readonly agentId: string; readonly weight: number; readonly kind: ThreatEvidenceKind } | null = null;
    for (const { agent, sample } of candidates) {
      let kind: ThreatEvidenceKind | null = null;
      let weight = 0;
      if (sample.distance <= PLAYER_NEAR_MISS_STRONG) {
        kind = 'near_miss';
        weight = 0.52;
      } else if (sample.distance <= PLAYER_NEAR_MISS_WEAK) {
        kind = 'near_miss';
        weight = 0.34;
      } else if (distance(agent.position, to) <= PLAYER_IMPACT_AWARENESS) {
        kind = 'bullet_impact';
        weight = 0.2;
      } else if (distance(agent.position, from) <= PLAYER_GUNSHOT_HEARING) {
        kind = 'gunshot';
        weight = 0.11;
      }
      if (kind === null) continue;

      const bearing = quantizeDirection(normalize({ x: from.x - agent.position.x, y: from.y - agent.position.y }));
      this.recordThreatEvidence(kind, agent.id, agent.position, bearing, weight, after.logicalTick);
      if (strongest === null || weight > strongest.weight) strongest = { agentId: agent.id, weight, kind };
    }

    if (strongest !== null) this.maybeEscalateThreat(after, strongest.agentId, from);
  }

  private recordThreatEvidence(
    kind: ThreatEvidenceKind,
    agentId: string,
    agentPosition: GridPoint,
    bearing: GridPoint,
    weight: number,
    tick: number,
  ): void {
    const previousLevel = this.threat.confidence >= THREAT_ESCALATE ? 'threatened' : this.threat.confidence >= THREAT_SUSPICIOUS ? 'suspicious' : 'none';
    this.threat.confidence = Math.max(0, Math.min(1, this.threat.confidence + weight));
    this.threat.bearing = { ...bearing };
    this.threat.sector = clampPoint({
      x: Math.round(agentPosition.x + bearing.x * THREAT_SECTOR_RANGE),
      y: Math.round(agentPosition.y + bearing.y * THREAT_SECTOR_RANGE),
    });
    this.threat.lastEvidenceTick = tick;
    this.threat.lastKind = kind;
    this.threat.count += 1;
    this.threat.counts[kind] += 1;
    this.threat.affectedIds.add(agentId);

    const nextLevel = this.threat.confidence >= THREAT_ESCALATE ? 'threatened' : this.threat.confidence >= THREAT_SUSPICIOUS ? 'suspicious' : 'none';
    if (nextLevel === previousLevel) return;
    this.v17Host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'alert', `Incoming-fire evidence raised squad threat awareness ${previousLevel} → ${nextLevel}.`, {
      from: previousLevel,
      to: nextLevel,
      evidenceKind: kind,
      affectedAgentId: agentId,
      bearing: { x: Number(bearing.x.toFixed(3)), y: Number(bearing.y.toFixed(3)) },
      estimatedSector: clonePoint(this.threat.sector),
      confidence: Number(this.threat.confidence.toFixed(3)),
      sourcePrecision: 'directional_evidence_only',
    });
  }

  private maybeEscalateThreat(state: TacticalWizardSimulationStateV16, agentId: string, exactShotOrigin: GridPoint): void {
    if (this.threat.confidence < THREAT_ESCALATE) return;
    if (this.confirmedVisualIds(state).length > 0) return;
    if (state.logicalTick - this.lastThreatResponseTick < THREAT_RESPONSE_COOLDOWN_TICKS) return;
    if (!state.agents.some((agent) => agent.id === agentId && agent.alive)) return;

    this.lastThreatResponseTick = state.logicalTick;
    this.threatResponseEscalations += 1;
    // V11 consumes the exact origin only inside the Host to derive its already
    // privacy-preserving coarse sector. No exact hidden coordinate is retained in
    // V17 state or copied into Agent cognition.
    super.injectIncomingFireForTest(agentId, exactShotOrigin);
    this.v17Host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'alert', 'Accumulated miss/impact evidence escalated into the existing counter-ambush response without requiring damage.', {
      agentId,
      confidence: Number(this.threat.confidence.toFixed(3)),
      evidenceCount: this.threat.count,
      bearing: clonePoint(this.threat.bearing),
      estimatedSector: clonePoint(this.threat.sector),
      trigger: 'non_hit_threat_evidence',
    });
  }

  private decayThreat(state: TacticalWizardSimulationStateV16): void {
    if (state.logicalTick === this.lastThreatDecayTick) return;
    const elapsed = this.lastThreatDecayTick < 0 ? 0 : Math.max(0, state.logicalTick - this.lastThreatDecayTick);
    this.lastThreatDecayTick = state.logicalTick;
    if (this.confirmedVisualIds(state).length > 0) return;
    if (elapsed <= 0 || this.threat.confidence <= 0) return;
    this.threat.confidence = Math.max(0, this.threat.confidence - THREAT_DECAY_PER_TICK * elapsed);
    if (this.threat.confidence < 0.05 && this.threat.lastEvidenceTick !== state.logicalTick) {
      this.threat.bearing = null;
      this.threat.sector = null;
      this.threat.affectedIds.clear();
    }
  }

  private maintainWoundedSupport(state: TacticalWizardSimulationStateV16): void {
    const living = state.agents.filter((agent) => agent.alive);
    const candidates = living
      .map((agent) => ({
        agent,
        band: healthBand(agent.health, agent.maxHealth),
        nearest: nearestTeammateDistance(agent.id, agent.position, living),
      }))
      .filter((entry) => entry.band === 'critical' || (entry.band === 'wounded' && entry.nearest > WOUNDED_ISOLATION_DISTANCE))
      .sort((left, right) => left.agent.health - right.agent.health || right.nearest - left.nearest || left.agent.id.localeCompare(right.agent.id, 'en'));

    const chosen = candidates[0];
    if (chosen === undefined || living.length < 2) {
      this.clearWoundedPlan(state.logicalTick, 'support_not_required');
      return;
    }

    const patient = chosen.agent;
    const others = living
      .filter((agent) => agent.id !== patient.id)
      .sort((left, right) => distance(left.position, patient.position) - distance(right.position, patient.position) || left.id.localeCompare(right.id, 'en'));
    const buddy = others[0];
    if (buddy === undefined) {
      this.clearWoundedPlan(state.logicalTick, 'no_buddy_available');
      return;
    }
    const security = others[1] ?? null;
    const reason = chosen.band === 'critical' ? 'critical_health' as const : 'wounded_isolation' as const;
    const threat = this.currentThreatPoint(state);
    const rallyPoint = selectWoundedRallyPoint(patient.position, buddy.position, threat);
    const supportPoint = selectBuddySupportPoint(patient.position, buddy.position, threat);
    const key = `${patient.id}:${buddy.id}:${security?.id ?? '-'}:${reason}:${rallyPoint.x},${rallyPoint.y}:${supportPoint.x},${supportPoint.y}`;

    if (this.woundedPlan === null || this.woundedPlan.patientId !== patient.id || this.woundedPlan.buddyId !== buddy.id) {
      this.woundedPlan = {
        patientId: patient.id,
        buddyId: buddy.id,
        securityId: security?.id ?? null,
        reason,
        startedTick: state.logicalTick,
        rallyPoint,
        buddySupportPoint: supportPoint,
      };
    } else {
      this.woundedPlan.rallyPoint = rallyPoint;
      this.woundedPlan.buddySupportPoint = supportPoint;
    }

    const host = this.v17Host();
    const patientMember = host.members.find((member) => member.id === patient.id);
    if (patientMember !== undefined) {
      patientMember.task = 'hold_cover';
      patientMember.role = 'support';
      patientMember.tacticalTarget = { ...rallyPoint };
    }

    if (key !== this.lastCohesionPlanKey) {
      this.lastCohesionPlanKey = key;
      host.pushEvent(`T${state.logicalTick}: ${patient.label} wounded — ${buddy.label} closes for mutual support${security === null ? '' : ` while ${security.label} remains security`}.`);
      host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Wounded mutual-support contract committed before the casualty becomes downed.', {
        patientId: patient.id,
        patientHealth: patient.health,
        healthBand: chosen.band,
        reason,
        buddyId: buddy.id,
        securityId: security?.id ?? null,
        buddyDistance: Number(distance(buddy.position, patient.position).toFixed(2)),
        rallyPoint: { ...rallyPoint },
        buddySupportPoint: { ...supportPoint },
      });
    }
  }

  private clearWoundedPlan(tick: number, reason: string): void {
    if (this.woundedPlan === null) return;
    const prior = this.woundedPlan;
    this.woundedPlan = null;
    this.lastCohesionPlanKey = null;
    this.v17Host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Wounded mutual-support contract released.', {
      patientId: prior.patientId,
      buddyId: prior.buddyId,
      securityId: prior.securityId,
      reason,
      tick,
    });
  }

  private throwablePrecheck(member: HostMember, state: TacticalWizardSimulationStateV16): boolean {
    const visuals = this.confirmedVisualIds(state);
    const liveContact = visuals.length > 0;
    if (liveContact) {
      const friendlyRisk = state.agents.some((agent) => agent.alive && agent.id !== member.id && distance(agent.position, state.player) <= 4.0);
      if (friendlyRisk) {
        this.logThrowableRejection(member, state, 'live target effect area contains a friendly', 'confirmed_visual', state.player);
        return false;
      }
      return true;
    }

    if (state.squad.tactic === 'sweep' && !state.contactTrack.lkpCleared) {
      const age = state.contactTrack.lastConfirmedTick === null ? Number.MAX_SAFE_INTEGER : state.logicalTick - state.contactTrack.lastConfirmedTick;
      if (state.contactTrack.status !== 'lost_fresh' || age > SEARCH_FLASH_FRESH_TICKS) {
        this.logThrowableRejection(member, state, 'old LKP is no longer a valid flash/frag target', 'stale_lkp', state.contactTrack.lastConfirmedPosition);
        return false;
      }
    }
    return true;
  }

  private validateCommittedThrowable(
    member: HostMember,
    grenade: MutableGrenade,
    state: TacticalWizardSimulationStateV16,
  ): { readonly safe: boolean; readonly reason: string; readonly friendliesAtRisk: readonly string[]; readonly targetClass: string } {
    const targetClass = this.throwableTargetClass(grenade.to, state);
    const friendliesAtRisk = grenade.kind === 'smoke'
      ? []
      : state.agents
        .filter((agent) => agent.alive && agent.id !== member.id)
        .filter((agent) => distance(agent.position, grenade.to) <= grenade.radius + (grenade.kind === 'flash' ? FRIENDLY_FLASH_MARGIN : FRIENDLY_FRAG_MARGIN))
        .map((agent) => agent.id);
    if (friendliesAtRisk.length > 0) return { safe: false, reason: 'friendly inside throwable effect clearance', friendliesAtRisk, targetClass };

    const liveContact = this.confirmedVisualIds(state).length > 0;
    if (liveContact && grenade.kind !== 'smoke' && distance(grenade.to, state.player) > 2.25) {
      return { safe: false, reason: 'live target is confirmed elsewhere; offensive throwable target is stale', friendliesAtRisk, targetClass };
    }
    if (grenade.kind === 'flash' && targetClass === 'stale_lkp') {
      return { safe: false, reason: 'flash cannot probe a stale/verified historical point', friendliesAtRisk, targetClass };
    }
    if (grenade.kind === 'flash' && state.squad.tactic === 'sweep' && state.contactTrack.lkpCleared && targetClass !== 'search_frontier') {
      return { safe: false, reason: 'search flash must target an uncleared frontier after LKP verification', friendliesAtRisk, targetClass };
    }
    return { safe: true, reason: 'clear', friendliesAtRisk, targetClass };
  }

  private throwableTargetClass(target: GridPoint, state: TacticalWizardSimulationStateV16): string {
    if (this.confirmedVisualIds(state).length > 0 && near(target, state.player, 2.25)) return 'confirmed_visual';
    if (state.contactTrack.frontier.some((point) => near(target, point, 1.5))) return 'search_frontier';
    if (state.contactTrack.lastConfirmedPosition !== null && near(target, state.contactTrack.lastConfirmedPosition, 1.5)) {
      if (state.contactTrack.lkpCleared) return 'cleared_lkp';
      const age = state.contactTrack.lastConfirmedTick === null ? Number.MAX_SAFE_INTEGER : state.logicalTick - state.contactTrack.lastConfirmedTick;
      return age <= SEARCH_FLASH_FRESH_TICKS ? 'fresh_lkp' : 'stale_lkp';
    }
    if (state.threatResponse.estimatedSector !== null && near(target, state.threatResponse.estimatedSector, 1.5)) return 'coarse_threat_sector';
    return 'unknown';
  }

  private logThrowableRejection(member: HostMember, state: TacticalWizardSimulationStateV16, reason: string, targetClass: string, target: GridPoint | null): void {
    this.v17Host().log('agent', member.id, member.label, 'plan', `${member.label} withheld throwable before commit.`, {
      reason,
      targetClass,
      target: clonePoint(target),
      tactic: state.squad.tactic,
      contactStatus: state.contactTrack.status,
    });
  }

  private suppressNewLogistics(state: TacticalWizardSimulationStateV16): boolean {
    const urgentAmmo = state.agents.some((agent) => agent.alive && agent.ammoRounds <= CRITICAL_AMMO);
    if (urgentAmmo) return false;
    if (state.logicalTick < this.logisticsSuspendedUntilTick) return true;
    const highPriority = state.recovery.phase !== 'none'
      || state.threatResponse.active
      || state.squad.tactic === 'sweep'
      || this.confirmedVisualIds(state).length > 0
      || this.woundedPlan !== null;
    if (!highPriority) return false;
    this.logisticsSuspendedUntilTick = Math.max(this.logisticsSuspendedUntilTick, state.logicalTick + LOGISTICS_RESUME_DELAY_TICKS);
    return true;
  }

  private observeLogisticsLifecycle(state: TacticalWizardSimulationStateV16): void {
    const assignment = this.v17V8().assignment;
    const nextState: LogisticsLifecycleState = assignment !== null
      ? 'assigned'
      : state.logicalTick < this.logisticsSuspendedUntilTick
        ? 'suspended'
        : 'idle';
    if (nextState === this.lastLogisticsLifecycleState) return;
    const previous = this.lastLogisticsLifecycleState;
    this.lastLogisticsLifecycleState = nextState;
    this.v17Host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', `Logistics lifecycle ${previous} → ${nextState}.`, {
      from: previous,
      to: nextState,
      assignmentAgentId: assignment?.agentId ?? null,
      supplyId: assignment?.supplyId ?? null,
      task: assignment?.task ?? null,
      suspendedUntilTick: nextState === 'suspended' ? this.logisticsSuspendedUntilTick : null,
    });
  }

  private currentThreatPoint(state: TacticalWizardSimulationStateV16): GridPoint | null {
    if (this.confirmedVisualIds(state).length > 0) return { ...state.player };
    return clonePoint(state.threatResponse.estimatedSector ?? this.threat.sector ?? state.squad.sharedLastKnownPosition);
  }

  private confirmedVisualIds(state: TacticalWizardSimulationStateV16): readonly string[] {
    const alive = new Set(state.agents.filter((agent) => agent.alive).map((agent) => agent.id));
    const host = this.v17Host();
    return host.members.filter((member) => alive.has(member.id) && host.canSeePlayer(member)).map((member) => member.id);
  }

  private leadershipFor(state: TacticalWizardSimulationStateV16): LeadershipView {
    const living = state.agents.filter((agent) => agent.alive).sort((left, right) => left.id.localeCompare(right.id, 'en'));
    const nominalAlive = living.some((agent) => agent.id === NOMINAL_COMMANDER_ID);
    const acting = nominalAlive ? NOMINAL_COMMANDER_ID : living[0]?.id ?? null;
    return {
      nominalCommanderId: NOMINAL_COMMANDER_ID,
      actingCommanderId: acting,
      livingCount: living.length,
      capability: living.length >= 3 ? 'full_squad' : living.length === 2 ? 'reduced_pair' : living.length === 1 ? 'single_survivor' : 'combat_ineffective',
      successionActive: acting !== null && acting !== NOMINAL_COMMANDER_ID,
    };
  }

  private baseState(): TacticalWizardSimulationStateV16 {
    return super.getState();
  }

  private v17Host(): HostAccess {
    return this as unknown as HostAccess;
  }

  private v17V8(): V8LifecycleAccess {
    return this as unknown as V8LifecycleAccess;
  }
}

export function healthBand(health: number, maxHealth: number): HealthBand {
  if (health <= 0 || maxHealth <= 0) return 'downed';
  const ratio = health / maxHealth;
  if (ratio <= CRITICAL_HEALTH_RATIO) return 'critical';
  if (ratio <= WOUNDED_HEALTH_RATIO) return 'wounded';
  return 'healthy';
}

function createThreatAccumulator(): ThreatAccumulator {
  return {
    confidence: 0,
    bearing: null,
    sector: null,
    lastEvidenceTick: null,
    lastKind: null,
    count: 0,
    counts: { gunshot: 0, bullet_impact: 0, near_miss: 0, hit: 0 },
    affectedIds: new Set<string>(),
  };
}

function nearestTeammateDistance(agentId: string, position: GridPoint, living: readonly { readonly id: string; readonly position: GridPoint }[]): number {
  const values = living.filter((agent) => agent.id !== agentId).map((agent) => distance(position, agent.position));
  return values.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...values);
}

function selectWoundedRallyPoint(patient: GridPoint, buddy: GridPoint, threat: GridPoint | null): GridPoint {
  const candidates = walkableReachableCandidates(patient, WOUNDED_RALLY_RADIUS);
  if (candidates.length === 0) return toCell(patient);
  const threatPoint = threat ?? { x: patient.x - (buddy.x - patient.x), y: patient.y - (buddy.y - patient.y) };
  return candidates
    .map((point) => ({
      point,
      score: distance(point, threatPoint) * 2.2
        - distance(point, buddy) * 0.55
        + (hasLineOfSight(tacticalWizardNavigationGrid, toCell(point), toCell(threatPoint)) ? 0 : 5)
        - distance(point, patient) * 0.2,
    }))
    .sort((left, right) => right.score - left.score || left.point.y - right.point.y || left.point.x - right.point.x)[0]!.point;
}

function selectBuddySupportPoint(patient: GridPoint, buddy: GridPoint, threat: GridPoint | null): GridPoint {
  const candidates = walkableReachableCandidates(patient, 4).filter((point) => distance(point, patient) >= 2 && distance(point, patient) <= WOUNDED_SUPPORT_DESIRED_DISTANCE + 0.7);
  if (candidates.length === 0) return toCell(patient);
  const threatPoint = threat ?? patient;
  return candidates
    .map((point) => ({
      point,
      score: -Math.abs(distance(point, patient) - WOUNDED_SUPPORT_DESIRED_DISTANCE) * 2
        - distance(point, buddy) * 0.35
        + (hasLineOfSight(tacticalWizardNavigationGrid, toCell(point), toCell(threatPoint)) ? 1.5 : 3.5),
    }))
    .sort((left, right) => right.score - left.score || left.point.y - right.point.y || left.point.x - right.point.x)[0]!.point;
}

function walkableReachableCandidates(origin: GridPoint, radius: number): GridPoint[] {
  const center = toCell(origin);
  const result: GridPoint[] = [];
  for (let y = Math.max(0, center.y - radius); y <= Math.min(tacticalWizardTestMap.height - 1, center.y + radius); y += 1) {
    for (let x = Math.max(0, center.x - radius); x <= Math.min(tacticalWizardTestMap.width - 1, center.x + radius); x += 1) {
      const point = { x, y };
      if (!isWalkable(tacticalWizardNavigationGrid, point)) continue;
      if (distance(point, center) > radius) continue;
      if (findPath(tacticalWizardNavigationGrid, center, point).length === 0 && !near(point, center, 0.1)) continue;
      result.push(point);
    }
  }
  return result;
}

function quantizeDirection(direction: GridPoint): GridPoint {
  const angle = Math.atan2(direction.y, direction.x);
  const step = Math.PI / 8;
  const quantized = Math.round(angle / step) * step;
  return { x: Math.cos(quantized), y: Math.sin(quantized) };
}

function pointToSegment(point: GridPoint, start: GridPoint, end: GridPoint): { readonly distance: number; readonly t: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 1e-9) return { distance: distance(point, start), t: 0 };
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  const closest = { x: start.x + dx * t, y: start.y + dy * t };
  return { distance: distance(point, closest), t };
}

function toCell(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))),
  };
}

function clampPoint(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, point.x)),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, point.y)),
  };
}

function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-9 ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
}

function clonePoint(point: GridPoint | null): GridPoint | null {
  return point === null ? null : { ...point };
}

function labelFor(state: TacticalWizardSimulationStateV16, agentId: string): string {
  return state.agents.find((agent) => agent.id === agentId)?.label ?? agentId;
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function near(a: GridPoint, b: GridPoint, radius: number): boolean {
  return distance(a, b) <= radius;
}
