import { findPath, hasLineOfSight, isWalkable, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from './tacticalWizardTestMapV7';
import {
  TacticalWizardSimulation as TacticalWizardSimulationThreatAuthority,
  type TacticalWizardSimulationState as TacticalWizardSimulationStateThreatAuthority,
} from './tacticalWizardSimulationThreatAuthority';

export * from './tacticalWizardSimulationThreatAuthority';

export type RecoverySafetyBand = 'stable' | 'pressured' | 'unsafe';
export type RecoverySafetyDecision = 'none' | 'continue' | 'pause' | 'reposition' | 'abort';

export interface RecoverySecurityCapabilityView {
  readonly agentId: string | null;
  readonly positionReady: boolean;
  readonly lineOfSightReady: boolean;
  readonly fireLaneReady: boolean;
  readonly weaponReady: boolean;
  readonly reactionReady: boolean;
  readonly effective: boolean;
  readonly blockedBy: string | null;
}

export interface RecoverySafetyView {
  readonly active: boolean;
  readonly runtimeVersion: 'current';
  readonly pressure: number;
  readonly band: RecoverySafetyBand;
  readonly decision: RecoverySafetyDecision;
  readonly unsafeSinceTick: number | null;
  readonly ineffectiveSinceTick: number | null;
  readonly security: RecoverySecurityCapabilityView;
  readonly safetyReplans: number;
  readonly safetyAborts: number;
  readonly nearMissesDuringRecovery: number;
  readonly failedSecurityPointCount: number;
}

export interface TacticalWizardSimulationState extends TacticalWizardSimulationStateThreatAuthority {
  readonly recoverySafety: RecoverySafetyView;
}

interface HostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  facing: GridPoint;
  task: string;
  role: string;
  tacticalTarget: GridPoint | null;
}

interface MutableRescuePlan {
  downedAgentId: string;
  rescuerId: string;
  covererId: string | null;
  startedTick: number;
  coverReadyTick: number;
  approachTarget: GridPoint;
  phase: 'establish_cover' | 'approach' | 'treat';
  treatmentSeconds: number;
}

interface MutableRecoveryGeometry {
  planIdentity: string;
  revision: number;
  stagePoint: GridPoint;
  treatmentPoint: GridPoint;
  securityPoint: GridPoint;
  threatAnchor: GridPoint | null;
  threatSource: string;
  lastReplanTick: number;
  lastReplanReason: string;
}

interface ReactionAccess {
  readonly kind: string;
  readonly target?: GridPoint | null;
  readonly source?: string;
  readonly untilTick: number;
}

interface CurrentInternals {
  members: HostMember[];
  logicalTick: number;
  suppressorId: string | null;
  moverId: string | null;
  observerId: string | null;
  tacticReason: string;
  rescuePlan: MutableRescuePlan | null;
  dynamicRecoveryGeometry: MutableRecoveryGeometry | null;
  recoveryRevisionCounter: number;
  rescueSupportPlanKey: string | null;
  rescueSupportPosition: GridPoint | null;
  rescueSupportTarget: GridPoint | null;
  rescueCoverTarget: GridPoint | null;
  medkits: Map<string, number>;
  reactions: Map<string, ReactionAccess>;
  tryCreateRescuePlan: (state: unknown) => void;
  advanceRecovery: (deltaSeconds: number) => void;
  maintainDynamicRecovery: (state: TacticalWizardSimulationStateThreatAuthority, force: boolean, reason?: string) => void;
  applyDynamicRecoveryToHost: (state: TacticalWizardSimulationStateThreatAuthority) => void;
  handleBlockedFire: (member: HostMember, reason: string, blockerId: string) => void;
  canDetachForResupply: (agentId: string, state: unknown) => boolean;
  planResupplyIfNeeded?: () => void;
  abortRescue: (reason: string) => void;
  applyRoles: () => void;
  refreshTacticalPlan: () => void;
  log: (...args: any[]) => void;
  pushEvent: (message: string) => void;
}

interface FailedPointRecord {
  readonly point: GridPoint;
  expiresTick: number;
}

const RECOVERY_SECURITY_ARRIVAL = 1.0;
const RECOVERY_SECURITY_MIN_DISTANCE = 2.2;
const RECOVERY_SECURITY_MAX_DISTANCE = 5.5;
const RECOVERY_SECURITY_DESIRED_DISTANCE = 3.5;
const RECOVERY_SECURITY_SEARCH_RADIUS = 6;
const RECOVERY_WEAPON_READY_ROUNDS = 3;
const FRIENDLY_LANE_RADIUS = 0.68;
const FRIENDLY_BLOCK_STREAK_TO_REPLAN = 2;
const SAFETY_REPLAN_COOLDOWN_TICKS = 3;
const FAILED_SECURITY_POINT_TTL_TICKS = 24;
const RECOVERY_PRESSURE_UNSAFE = 0.8;
const RECOVERY_PRESSURE_PRESSURED = 0.45;
const RECOVERY_UNSAFE_ABORT_TICKS = 4;
const RECOVERY_INEFFECTIVE_ABORT_TICKS = 8;
const RECOVERY_RETREAT_TICKS = 8;
const RECOVERY_RETREAT_RADIUS = 5;
const NEAR_MISS_STRONG = 0.9;
const NEAR_MISS_WEAK = 2.1;

/**
 * Current production authority for the Tactical Wizard reference simulation.
 *
 * Historical Vxx classes remain available as compatibility fixtures, but the
 * Workbench production entry is expected to terminate here. Overlapping rescue
 * decisions are reconciled once at this boundary so legacy implementation
 * generations cannot independently own recovery safety.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationThreatAuthority {
  private recoverySafetyPressure = 0;
  private recoverySafetyDecision: RecoverySafetyDecision = 'none';
  private recoveryUnsafeSinceTick: number | null = null;
  private recoveryIneffectiveSinceTick: number | null = null;
  private recoverySafetyLastPressureTick = -1;
  private recoverySafetyReplans = 0;
  private recoverySafetyAborts = 0;
  private recoveryNearMisses = 0;
  private recoveryLastReplanTick = -999;
  private recoveryLastPlanIdentity: string | null = null;
  private recoveryFriendlyBlocker: string | null = null;
  private recoveryFriendlyBlockStreak = 0;
  private recoveryLastDecisionLog = '';
  private readonly failedRecoverySecurityPoints = new Map<string, FailedPointRecord>();

  constructor() {
    super();
    this.installCurrentRecoveryAuthority();
    this.currentInternals().log('system', 'simulation', 'Volition Simulation', 'session', 'Current runtime recovery-safety authority enabled.', {
      runtimeVersion: 'current',
      productionAuthority: 'recovery_safety_current',
      legacyVxxPolicy: 'compatibility_substrate_not_independent_authority',
      safetyPolicy: 'continue_or_reposition_or_pause_or_abort',
      weaponReadyRounds: RECOVERY_WEAPON_READY_ROUNDS,
      unsafeAbortTicks: RECOVERY_UNSAFE_ABORT_TICKS,
    });
  }

  override reset(): TacticalWizardSimulationState {
    super.reset();
    this.recoverySafetyPressure = 0;
    this.recoverySafetyDecision = 'none';
    this.recoveryUnsafeSinceTick = null;
    this.recoveryIneffectiveSinceTick = null;
    this.recoverySafetyLastPressureTick = -1;
    this.recoverySafetyReplans = 0;
    this.recoverySafetyAborts = 0;
    this.recoveryNearMisses = 0;
    this.recoveryLastReplanTick = -999;
    this.recoveryLastPlanIdentity = null;
    this.recoveryFriendlyBlocker = null;
    this.recoveryFriendlyBlockStreak = 0;
    this.recoveryLastDecisionLog = '';
    this.failedRecoverySecurityPoints.clear();
    return this.getState();
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    const before = this.currentBaseState();
    this.updateRecoveryPressureForTick(before);
    this.evaluateRecoverySafety(before, 'pre_frame');
    super.advance(deltaSeconds);
    const after = this.currentBaseState();
    this.updateRecoveryPressureForTick(after);
    this.evaluateRecoverySafety(after, 'post_frame');
    return this.getState();
  }

  override playerFireAt(point: GridPoint): boolean {
    const before = this.currentBaseState();
    const result = super.playerFireAt(point);
    const after = this.currentBaseState();
    this.observeRecoveryShot(before, after);
    this.evaluateRecoverySafety(after, 'player_fire');
    return result;
  }

  override getState(): TacticalWizardSimulationState {
    const base = super.getState();
    const security = this.assessRecoverySecurity(base);
    const active = base.recovery.phase !== 'none';
    return {
      ...base,
      recoverySafety: {
        active,
        runtimeVersion: 'current',
        pressure: Number((this.recoverySafetyPressure ?? 0).toFixed(3)),
        band: recoveryPressureBand(this.recoverySafetyPressure ?? 0),
        decision: active ? (this.recoverySafetyDecision ?? 'continue') : 'none',
        unsafeSinceTick: active ? this.recoveryUnsafeSinceTick ?? null : null,
        ineffectiveSinceTick: active ? this.recoveryIneffectiveSinceTick ?? null : null,
        security,
        safetyReplans: this.recoverySafetyReplans ?? 0,
        safetyAborts: this.recoverySafetyAborts ?? 0,
        nearMissesDuringRecovery: this.recoveryNearMisses ?? 0,
        failedSecurityPointCount: this.failedRecoverySecurityPoints?.size ?? 0,
      },
    };
  }

  private installCurrentRecoveryAuthority(): void {
    const runtime = this.currentInternals();

    const originalTryCreate = runtime.tryCreateRescuePlan.bind(this);
    runtime.tryCreateRescuePlan = (state: unknown): void => {
      const hadPlan = runtime.rescuePlan !== null;
      originalTryCreate(state);
      if (hadPlan || runtime.rescuePlan === null) return;

      this.rebalanceRecoveryRoles(this.currentBaseState());
      const current = this.currentBaseState();
      runtime.maintainDynamicRecovery(current, true, 'manual_refresh');
      if (runtime.dynamicRecoveryGeometry === null) {
        runtime.abortRescue('current recovery authority could not atomically establish stage/treatment/security geometry');
        return;
      }
      runtime.applyDynamicRecoveryToHost(current);
      this.resetRecoverySafetyForPlan(runtime.rescuePlan);
      runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Recovery contract committed atomically with current stage/treatment/security geometry.', {
        rescuerId: runtime.rescuePlan?.rescuerId ?? null,
        covererId: runtime.rescuePlan?.covererId ?? null,
        securityPoint: clonePoint(runtime.dynamicRecoveryGeometry?.securityPoint ?? null),
        runtimeVersion: 'current',
      });
    };

    const originalAdvanceRecovery = runtime.advanceRecovery.bind(this);
    runtime.advanceRecovery = (deltaSeconds: number): void => {
      if (runtime.rescuePlan !== null && (this.recoverySafetyDecision === 'pause' || this.recoverySafetyDecision === 'reposition')) return;
      originalAdvanceRecovery(deltaSeconds);
    };

    const originalHandleBlockedFire = runtime.handleBlockedFire.bind(this);
    runtime.handleBlockedFire = (member: HostMember, reason: string, blockerId: string): void => {
      const plan = runtime.rescuePlan;
      const casualtyBlock = plan !== null && blockerId === plan.downedAgentId;
      originalHandleBlockedFire(member, reason, blockerId);
      if (plan === null || casualtyBlock || plan.covererId !== member.id) return;
      this.noteFriendlyLaneBlock(blockerId);
      if (this.recoveryFriendlyBlockStreak >= FRIENDLY_BLOCK_STREAK_TO_REPLAN) {
        this.requestAlternateSecurityPoint(this.currentBaseState(), 'friendly_lane_blocked', blockerId);
      }
    };

    const originalCanDetach = runtime.canDetachForResupply.bind(this);
    runtime.canDetachForResupply = (agentId: string, state: unknown): boolean => {
      if (this.hasPendingRecoverableCasualty(this.currentBaseState())) return false;
      return originalCanDetach(agentId, state);
    };

    if (typeof runtime.planResupplyIfNeeded === 'function') {
      const originalPlanResupply = runtime.planResupplyIfNeeded.bind(this);
      runtime.planResupplyIfNeeded = (): void => {
        if (this.hasPendingRecoverableCasualty(this.currentBaseState())) return;
        originalPlanResupply();
      };
    }

    const originalMovementTarget = (runtime as unknown as { movementTarget?: (member: HostMember) => GridPoint | null }).movementTarget?.bind(this);
    if (originalMovementTarget !== undefined) {
      (runtime as unknown as { movementTarget: (member: HostMember) => GridPoint | null }).movementTarget = (member: HostMember): GridPoint | null => {
        const plan = runtime.rescuePlan;
        if (plan !== null && member.id === plan.rescuerId && (this.recoverySafetyDecision === 'pause' || this.recoverySafetyDecision === 'reposition')) {
          const geometry = runtime.dynamicRecoveryGeometry;
          if (geometry !== null && distance(member.position, geometry.stagePoint) > 0.85) return { ...geometry.stagePoint };
          return null;
        }
        return originalMovementTarget(member);
      };
    }
  }

  private observeRecoveryShot(before: TacticalWizardSimulationStateThreatAuthority, after: TacticalWizardSimulationStateThreatAuthority): void {
    if (after.recovery.phase === 'none') return;
    const from = after.playerCombat.shotFrom;
    const to = after.playerCombat.shotTo;
    if (from === null || to === null) return;

    const ownerIds = [after.recovery.rescuerId, after.recovery.covererId].filter((id): id is string => id !== null);
    const ownerAgents = after.agents.filter((agent) => ownerIds.includes(agent.id) && agent.alive);
    if (ownerAgents.length === 0) return;

    const ownerHit = ownerAgents.some((agent) => {
      const previous = before.agents.find((entry) => entry.id === agent.id);
      return previous !== undefined && agent.health < previous.health;
    });
    const closest = Math.min(...ownerAgents.map((agent) => pointToSegmentDistance(agent.position, from, to)));
    let contribution = 0.08;
    if (ownerHit) contribution = 0.55;
    else if (closest <= NEAR_MISS_STRONG) {
      contribution = 0.34;
      this.recoveryNearMisses += 1;
    } else if (closest <= NEAR_MISS_WEAK) {
      contribution = 0.2;
      this.recoveryNearMisses += 1;
    }
    this.recoverySafetyPressure = Math.min(1.5, Math.max(this.recoverySafetyPressure, after.playerCombat.firePressure) + contribution);
  }

  private updateRecoveryPressureForTick(state: TacticalWizardSimulationStateThreatAuthority): void {
    if (state.logicalTick === this.recoverySafetyLastPressureTick) return;
    const elapsed = this.recoverySafetyLastPressureTick < 0 ? 0 : Math.max(0, state.logicalTick - this.recoverySafetyLastPressureTick);
    this.recoverySafetyLastPressureTick = state.logicalTick;
    if (state.recovery.phase === 'none') {
      this.recoverySafetyPressure = 0;
      this.recoveryUnsafeSinceTick = null;
      this.recoveryIneffectiveSinceTick = null;
      return;
    }
    if (elapsed <= 0) {
      this.recoverySafetyPressure = Math.max(this.recoverySafetyPressure, state.playerCombat.firePressure);
      return;
    }
    const decay = Math.pow(0.78, elapsed);
    this.recoverySafetyPressure = Math.max(state.playerCombat.firePressure, this.recoverySafetyPressure * decay);
  }

  private evaluateRecoverySafety(state: TacticalWizardSimulationStateThreatAuthority, source: string): void {
    const runtime = this.currentInternals();
    const plan = runtime.rescuePlan;
    if (plan === null || state.recovery.phase === 'none') {
      this.recoverySafetyDecision = 'none';
      this.recoveryUnsafeSinceTick = null;
      this.recoveryIneffectiveSinceTick = null;
      this.recoveryFriendlyBlocker = null;
      this.recoveryFriendlyBlockStreak = 0;
      this.recoveryLastPlanIdentity = null;
      return;
    }

    const identity = rescuePlanIdentity(plan);
    if (this.recoveryLastPlanIdentity !== identity) this.resetRecoverySafetyForPlan(plan);
    this.expireFailedSecurityPoints(state.logicalTick);

    let security = this.assessRecoverySecurity(state);
    if (security.blockedBy !== null) this.noteFriendlyLaneBlock(security.blockedBy);
    else {
      this.recoveryFriendlyBlocker = null;
      this.recoveryFriendlyBlockStreak = 0;
    }

    if (security.blockedBy !== null && this.recoveryFriendlyBlockStreak >= FRIENDLY_BLOCK_STREAK_TO_REPLAN) {
      this.requestAlternateSecurityPoint(state, 'friendly_lane_blocked', security.blockedBy);
      security = this.assessRecoverySecurity(this.currentBaseState());
    }

    const requiresCombatSecurity = recoveryRequiresCombatSecurity(state);
    const band = recoveryPressureBand(this.recoverySafetyPressure);

    if (security.effective) {
      this.recoveryUnsafeSinceTick = null;
      this.recoveryIneffectiveSinceTick = null;
      this.setRecoveryDecision('continue', source, state, security);
      return;
    }

    if (requiresCombatSecurity) {
      this.recoveryIneffectiveSinceTick ??= state.logicalTick;
    } else {
      this.recoveryIneffectiveSinceTick = null;
    }

    const needsGeometry = security.weaponReady && (!security.positionReady || !security.lineOfSightReady || !security.fireLaneReady);
    if (needsGeometry) {
      if (security.positionReady && (!security.lineOfSightReady || !security.fireLaneReady)) {
        this.requestAlternateSecurityPoint(state, 'security_geometry_invalid', security.blockedBy);
      }
      this.setRecoveryDecision('reposition', source, state, security);
      return;
    }

    if (band === 'unsafe') {
      this.recoveryUnsafeSinceTick ??= state.logicalTick;
      const unsafeTicks = state.logicalTick - this.recoveryUnsafeSinceTick;
      if (requiresCombatSecurity && !security.effective && unsafeTicks >= RECOVERY_UNSAFE_ABORT_TICKS) {
        this.abortUnsafeRecovery(state, security, `sustained recovery fire pressure (${this.recoverySafetyPressure.toFixed(2)}) exceeded safe commitment window`);
        return;
      }
      this.setRecoveryDecision('pause', source, state, security);
      return;
    }

    this.recoveryUnsafeSinceTick = null;
    if (requiresCombatSecurity && this.recoveryIneffectiveSinceTick !== null
      && state.logicalTick - this.recoveryIneffectiveSinceTick >= RECOVERY_INEFFECTIVE_ABORT_TICKS) {
      this.abortUnsafeRecovery(state, security, 'recovery security remained combat-ineffective under an active threat');
      return;
    }

    if (requiresCombatSecurity && !security.weaponReady) {
      this.setRecoveryDecision('pause', source, state, security);
      return;
    }

    this.setRecoveryDecision('continue', source, state, security);
  }

  private rebalanceRecoveryRoles(state: TacticalWizardSimulationStateThreatAuthority): void {
    const runtime = this.currentInternals();
    const plan = runtime.rescuePlan;
    if (plan === null) return;
    const living = state.agents.filter((agent) => agent.alive && agent.id !== plan.downedAgentId);
    if (living.length < 2) return;

    const rescuerCandidates = living.filter((agent) => (runtime.medkits.get(agent.id) ?? 0) > 0);
    if (rescuerCandidates.length === 0) return;

    const pairs: Array<{ rescuerId: string; covererId: string; score: number }> = [];
    for (const rescuer of rescuerCandidates) {
      for (const coverer of living) {
        if (coverer.id === rescuer.id) continue;
        const ammoScore = coverer.ammoRounds >= RECOVERY_WEAPON_READY_ROUNDS ? 100 : coverer.ammoRounds;
        const keepScore = rescuer.id === plan.rescuerId && coverer.id === plan.covererId ? 12 : 0;
        const proximityScore = -distance(rescuer.position, state.agents.find((agent) => agent.id === plan.downedAgentId)?.position ?? rescuer.position);
        pairs.push({ rescuerId: rescuer.id, covererId: coverer.id, score: ammoScore + keepScore + proximityScore * 0.25 });
      }
    }
    pairs.sort((left, right) => right.score - left.score || left.covererId.localeCompare(right.covererId, 'en') || left.rescuerId.localeCompare(right.rescuerId, 'en'));
    const best = pairs[0];
    if (best === undefined || (best.rescuerId === plan.rescuerId && best.covererId === plan.covererId)) return;

    const previous = { rescuerId: plan.rescuerId, covererId: plan.covererId };
    plan.rescuerId = best.rescuerId;
    plan.covererId = best.covererId;
    runtime.suppressorId = best.covererId;
    runtime.moverId = best.rescuerId;
    runtime.observerId = null;
    runtime.applyRoles();
    runtime.refreshTacticalPlan();
    runtime.dynamicRecoveryGeometry = null;
    runtime.rescueSupportPlanKey = null;
    runtime.rescueSupportPosition = null;
    runtime.rescueCoverTarget = null;
    runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'roles', 'Current recovery authority selected the combat-capable security element before committing geometry.', {
      previous,
      next: { rescuerId: best.rescuerId, covererId: best.covererId },
      covererAmmo: state.agents.find((agent) => agent.id === best.covererId)?.ammoRounds ?? 0,
    });
  }

  private requestAlternateSecurityPoint(
    state: TacticalWizardSimulationStateThreatAuthority,
    reason: string,
    blockerId: string | null,
  ): boolean {
    const runtime = this.currentInternals();
    const plan = runtime.rescuePlan;
    const geometry = runtime.dynamicRecoveryGeometry;
    if (plan === null || geometry === null || plan.covererId === null) return false;
    if (state.logicalTick - this.recoveryLastReplanTick < SAFETY_REPLAN_COOLDOWN_TICKS) return false;

    const casualty = state.agents.find((agent) => agent.id === plan.downedAgentId);
    const coverer = state.agents.find((agent) => agent.id === plan.covererId);
    if (casualty === undefined || coverer === undefined || !coverer.alive) return false;

    const failedPoint = { ...geometry.securityPoint };
    this.failedRecoverySecurityPoints.set(gridKey(failedPoint), { point: failedPoint, expiresTick: state.logicalTick + FAILED_SECURITY_POINT_TTL_TICKS });
    const excluded = new Set([...this.failedRecoverySecurityPoints.keys()]);
    const threat = geometry.threatAnchor;
    const alternate = selectCurrentRecoverySecurityPoint({
      coverer: coverer.position,
      casualty: casualty.position,
      threat,
      agents: state.agents.filter((agent) => agent.alive).map((agent) => ({ id: agent.id, position: agent.position })),
      covererId: coverer.id,
      excluded,
    });
    if (alternate === null || distance(alternate, failedPoint) < 0.5) return false;

    const nextRevision = Math.max(runtime.recoveryRevisionCounter, geometry.revision) + 1;
    runtime.recoveryRevisionCounter = nextRevision;
    geometry.revision = nextRevision;
    geometry.securityPoint = { ...alternate };
    geometry.lastReplanTick = state.logicalTick;
    geometry.lastReplanReason = 'security_lane_lost';
    plan.phase = 'establish_cover';
    plan.treatmentSeconds = 0;
    runtime.applyDynamicRecoveryToHost(state);
    this.recoveryLastReplanTick = state.logicalTick;
    this.recoverySafetyReplans += 1;
    this.recoveryFriendlyBlocker = null;
    this.recoveryFriendlyBlockStreak = 0;
    runtime.pushEvent(`T${state.logicalTick}: recovery security moved to alternate geometry (${reason}).`);
    runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Current recovery authority replaced a failed security point instead of allowing a legacy layer to restore it.', {
      reason,
      blockerId,
      failedSecurityPoint: failedPoint,
      alternateSecurityPoint: alternate,
      revision: nextRevision,
      excludedPointCount: excluded.size,
    });
    return true;
  }

  private abortUnsafeRecovery(
    state: TacticalWizardSimulationStateThreatAuthority,
    security: RecoverySecurityCapabilityView,
    reason: string,
  ): void {
    const runtime = this.currentInternals();
    const plan = runtime.rescuePlan;
    if (plan === null) return;
    const ownerIds = [plan.rescuerId, plan.covererId].filter((id): id is string => id !== null);
    const threat = runtime.dynamicRecoveryGeometry?.threatAnchor ?? state.player;
    runtime.abortRescue(`current recovery safety abort: ${reason}`);
    this.recoverySafetyAborts += 1;
    this.recoverySafetyDecision = 'abort';
    this.recoveryUnsafeSinceTick = null;
    this.recoveryIneffectiveSinceTick = null;

    for (const id of ownerIds) {
      const agent = state.agents.find((entry) => entry.id === id && entry.alive);
      if (agent === undefined) continue;
      const target = selectRetreatPoint(agent.position, threat);
      if (target === null) continue;
      runtime.reactions.set(id, {
        kind: 'smoke_retreat',
        target,
        source: 'recovery_safety_abort',
        untilTick: state.logicalTick + RECOVERY_RETREAT_TICKS,
      });
    }
    runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Recovery was aborted after sustained unsafe pressure because the security element could not provide effective cover.', {
      reason,
      pressure: Number(this.recoverySafetyPressure.toFixed(3)),
      security,
      response: 'abort_then_short_break_contact_reaction',
    });
  }

  private assessRecoverySecurity(state: TacticalWizardSimulationStateThreatAuthority): RecoverySecurityCapabilityView {
    const runtime = this.currentInternals();
    const plan = runtime.rescuePlan;
    const geometry = runtime.dynamicRecoveryGeometry;
    if (plan === null || plan.covererId === null || geometry === null) return emptySecurity();
    const coverer = state.agents.find((agent) => agent.id === plan.covererId);
    if (coverer === undefined || !coverer.alive) return { ...emptySecurity(), agentId: plan.covererId };

    const positionReady = distance(coverer.position, geometry.securityPoint) <= RECOVERY_SECURITY_ARRIVAL;
    const lineOfSightReady = geometry.threatAnchor === null
      || hasLineOfSight(tacticalWizardNavigationGrid, toCell(coverer.position), toCell(geometry.threatAnchor));
    const blockedBy = geometry.threatAnchor === null
      ? null
      : friendlyBlockerForLane(
          coverer.position,
          geometry.threatAnchor,
          state.agents.filter((agent) => agent.alive && agent.id !== coverer.id).map((agent) => ({ id: agent.id, position: agent.position })),
        );
    const fireLaneReady = blockedBy === null;
    const weaponReady = coverer.ammoRounds >= RECOVERY_WEAPON_READY_ROUNDS;
    const reactionReady = coverer.reactionState !== 'stunned' && coverer.reactionState !== 'downed';
    const requiresCombatSecurity = recoveryRequiresCombatSecurity(state);
    const effective = positionReady
      && lineOfSightReady
      && fireLaneReady
      && reactionReady
      && (!requiresCombatSecurity || weaponReady);
    return { agentId: coverer.id, positionReady, lineOfSightReady, fireLaneReady, weaponReady, reactionReady, effective, blockedBy };
  }

  private noteFriendlyLaneBlock(blockerId: string): void {
    if (this.recoveryFriendlyBlocker === blockerId) this.recoveryFriendlyBlockStreak += 1;
    else {
      this.recoveryFriendlyBlocker = blockerId;
      this.recoveryFriendlyBlockStreak = 1;
    }
  }

  private setRecoveryDecision(
    decision: RecoverySafetyDecision,
    source: string,
    state: TacticalWizardSimulationStateThreatAuthority,
    security: RecoverySecurityCapabilityView,
  ): void {
    this.recoverySafetyDecision = decision;
    const signature = `${rescueViewIdentity(state)}:${decision}:${security.blockedBy ?? '-'}:${security.weaponReady}:${recoveryPressureBand(this.recoverySafetyPressure)}`;
    if (signature === this.recoveryLastDecisionLog) return;
    this.recoveryLastDecisionLog = signature;
    this.currentInternals().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'decision', `Recovery safety decision: ${decision}.`, {
      source,
      pressure: Number(this.recoverySafetyPressure.toFixed(3)),
      band: recoveryPressureBand(this.recoverySafetyPressure),
      security,
    });
  }

  private resetRecoverySafetyForPlan(plan: MutableRescuePlan | null): void {
    this.recoveryLastPlanIdentity = plan === null ? null : rescuePlanIdentity(plan);
    this.recoverySafetyPressure = 0;
    this.recoverySafetyDecision = plan === null ? 'none' : 'continue';
    this.recoveryUnsafeSinceTick = null;
    this.recoveryIneffectiveSinceTick = null;
    this.recoveryFriendlyBlocker = null;
    this.recoveryFriendlyBlockStreak = 0;
    this.recoveryLastDecisionLog = '';
  }

  private hasPendingRecoverableCasualty(state: TacticalWizardSimulationStateThreatAuthority): boolean {
    if (this.currentInternals().rescuePlan !== null) return true;
    const downed = state.agents.some((agent) => !agent.alive);
    if (!downed) return false;
    return state.agents.some((agent) => agent.alive && (this.currentInternals().medkits.get(agent.id) ?? 0) > 0);
  }

  private expireFailedSecurityPoints(tick: number): void {
    for (const [key, record] of [...this.failedRecoverySecurityPoints.entries()]) {
      if (record.expiresTick < tick) this.failedRecoverySecurityPoints.delete(key);
    }
  }

  private currentBaseState(): TacticalWizardSimulationStateThreatAuthority {
    return super.getState();
  }

  private currentInternals(): CurrentInternals {
    return this as unknown as CurrentInternals;
  }
}

export function recoveryPressureBand(pressure: number): RecoverySafetyBand {
  if (pressure >= RECOVERY_PRESSURE_UNSAFE) return 'unsafe';
  if (pressure >= RECOVERY_PRESSURE_PRESSURED) return 'pressured';
  return 'stable';
}

export function recoverySecurityIsEffective(input: {
  readonly positionReady: boolean;
  readonly lineOfSightReady: boolean;
  readonly fireLaneReady: boolean;
  readonly weaponReady: boolean;
  readonly reactionReady: boolean;
  readonly requiresCombatSecurity: boolean;
}): boolean {
  return input.positionReady
    && input.lineOfSightReady
    && input.fireLaneReady
    && input.reactionReady
    && (!input.requiresCombatSecurity || input.weaponReady);
}

export function selectCurrentRecoverySecurityPoint(input: {
  readonly coverer: GridPoint;
  readonly casualty: GridPoint;
  readonly threat: GridPoint | null;
  readonly agents: readonly { readonly id: string; readonly position: GridPoint }[];
  readonly covererId: string;
  readonly excluded: ReadonlySet<string>;
}): GridPoint | null {
  const center = toCell(input.casualty);
  const start = toCell(input.coverer);
  const candidates: Array<{ readonly point: GridPoint; readonly score: number }> = [];
  for (let y = center.y - RECOVERY_SECURITY_SEARCH_RADIUS; y <= center.y + RECOVERY_SECURITY_SEARCH_RADIUS; y += 1) {
    for (let x = center.x - RECOVERY_SECURITY_SEARCH_RADIUS; x <= center.x + RECOVERY_SECURITY_SEARCH_RADIUS; x += 1) {
      const point = { x, y };
      if (!inBounds(point) || !isWalkable(tacticalWizardNavigationGrid, point) || input.excluded.has(gridKey(point))) continue;
      const casualtyDistance = distance(point, input.casualty);
      if (casualtyDistance < RECOVERY_SECURITY_MIN_DISTANCE || casualtyDistance > RECOVERY_SECURITY_MAX_DISTANCE) continue;
      const occupied = input.agents.some((agent) => agent.id !== input.covererId && distance(agent.position, point) < 1.05);
      if (occupied) continue;
      if (input.threat !== null && !hasLineOfSight(tacticalWizardNavigationGrid, point, toCell(input.threat))) continue;
      if (input.threat !== null) {
        const blocker = friendlyBlockerForLane(point, input.threat, input.agents.filter((agent) => agent.id !== input.covererId));
        if (blocker !== null) continue;
      }
      const path = findPath(tacticalWizardNavigationGrid, start, point);
      if (path.length === 0) continue;
      const cover = blockedNeighbourCount(point);
      const desiredPenalty = Math.abs(casualtyDistance - RECOVERY_SECURITY_DESIRED_DISTANCE);
      const movementCost = Math.max(0, path.length - 1);
      candidates.push({ point, score: cover * 20 - desiredPenalty * 4 - movementCost * 0.75 });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.point.y - right.point.y || left.point.x - right.point.x);
  return candidates[0]?.point ?? null;
}

function recoveryRequiresCombatSecurity(state: TacticalWizardSimulationStateThreatAuthority): boolean {
  return state.combatAuthority.confirmedVisualIds.length > 0
    || state.threatResponse.active
    || state.playerCombat.firePressure >= 0.35;
}

function friendlyBlockerForLane(
  from: GridPoint,
  to: GridPoint,
  friendlies: readonly { readonly id: string; readonly position: GridPoint }[],
): string | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) return null;
  const ranked = friendlies
    .map((friendly) => {
      const t = ((friendly.position.x - from.x) * dx + (friendly.position.y - from.y) * dy) / lengthSquared;
      if (t <= 0.08 || t >= 0.92) return null;
      const closest = { x: from.x + dx * t, y: from.y + dy * t };
      return { id: friendly.id, distance: distance(friendly.position, closest), t };
    })
    .filter((entry): entry is { readonly id: string; readonly distance: number; readonly t: number } => entry !== null && entry.distance <= FRIENDLY_LANE_RADIUS)
    .sort((left, right) => left.distance - right.distance || left.t - right.t || left.id.localeCompare(right.id, 'en'));
  return ranked[0]?.id ?? null;
}

function selectRetreatPoint(from: GridPoint, threat: GridPoint): GridPoint | null {
  const away = normalize({ x: from.x - threat.x, y: from.y - threat.y });
  const start = toCell(from);
  const candidates: Array<{ point: GridPoint; score: number }> = [];
  for (let y = start.y - RECOVERY_RETREAT_RADIUS; y <= start.y + RECOVERY_RETREAT_RADIUS; y += 1) {
    for (let x = start.x - RECOVERY_RETREAT_RADIUS; x <= start.x + RECOVERY_RETREAT_RADIUS; x += 1) {
      const point = { x, y };
      if (!inBounds(point) || !isWalkable(tacticalWizardNavigationGrid, point)) continue;
      const path = findPath(tacticalWizardNavigationGrid, start, point);
      if (path.length === 0) continue;
      const direction = normalize({ x: point.x - from.x, y: point.y - from.y });
      const awayAlignment = direction.x * away.x + direction.y * away.y;
      const threatDistance = distance(point, threat);
      candidates.push({ point, score: awayAlignment * 18 + threatDistance - Math.max(0, path.length - 1) * 0.5 + blockedNeighbourCount(point) * 3 });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.point.y - right.point.y || left.point.x - right.point.x);
  return candidates[0]?.point ?? null;
}

function pointToSegmentDistance(point: GridPoint, from: GridPoint, to: GridPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) return distance(point, from);
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return distance(point, { x: from.x + dx * t, y: from.y + dy * t });
}

function rescuePlanIdentity(plan: MutableRescuePlan): string {
  return `${plan.downedAgentId}:${plan.rescuerId}:${plan.covererId}:${plan.startedTick}`;
}

function rescueViewIdentity(state: TacticalWizardSimulationStateThreatAuthority): string {
  return `${state.recovery.downedAgentId}:${state.recovery.rescuerId}:${state.recovery.covererId}:${state.recovery.phase}`;
}

function gridKey(point: GridPoint): string {
  const cell = toCell(point);
  return `${cell.x},${cell.y}`;
}

function toCell(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))),
  };
}

function inBounds(point: GridPoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < tacticalWizardTestMap.width && point.y < tacticalWizardTestMap.height;
}

function blockedNeighbourCount(point: GridPoint): number {
  const offsets = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  return offsets.reduce((count, offset) => {
    const next = { x: point.x + offset.x, y: point.y + offset.y };
    return count + (!inBounds(next) || !isWalkable(tacticalWizardNavigationGrid, next) ? 1 : 0);
  }, 0);
}

function emptySecurity(): RecoverySecurityCapabilityView {
  return {
    agentId: null,
    positionReady: false,
    lineOfSightReady: false,
    fireLaneReady: false,
    weaponReady: false,
    reactionReady: false,
    effective: false,
    blockedBy: null,
  };
}

function clonePoint(point: GridPoint | null): GridPoint | null {
  return point === null ? null : { ...point };
}

function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-9 ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
