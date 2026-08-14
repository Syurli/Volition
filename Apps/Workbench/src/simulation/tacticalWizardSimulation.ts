import { TacticalWizardRuntime, type TacticalWizardSimulationState as RuntimeState } from './tacticalWizardRuntime';
import { gridKey, hasLineOfSight, isWalkable, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from './tacticalWizardTestMap';
import { buildDirectionalSearchWaypoints, contactUncertaintyRadius, deriveEgressDirection } from './contactMemory';
import type { ExecutionContract } from './tacticalWizardHierarchy';
import { attentionLookTarget, scanAttention, type AttentionMode, type AttentionSample } from './attention';

export * from './tacticalWizardRuntime';
export * from './tacticalWizardHierarchy';
export type {
  BuddyRole,
  CoverState,
  GrenadeKind,
  GrenadeVisual,
  LocomotionMode,
  SimulationOverlaySettings,
  SpecialAction,
  TacticalOpportunityPurpose,
  TacticalTask,
} from './tacticalWizardHost';

declare const __VOLITION_COMMIT__: string;

type ThreatEvidenceKind = 'gunshot' | 'bullet_impact' | 'near_miss' | 'hit';
type ThreatEvidenceCounts = Record<ThreatEvidenceKind, number>;

export interface RuntimeIdentityView {
  readonly commit: string;
  readonly entrypoint: 'TacticalWizardSimulation';
  readonly architecture: 'fixed_tactical_hierarchy';
  readonly behaviorProfile: 'active_attention_recovery';
  readonly features: {
    readonly gunfireEvidence: true;
    readonly contactMemory: true;
    readonly directionalSearch: true;
    readonly acousticInvestigation: true;
    readonly activeAttention: true;
    readonly logisticsArbitration: true;
    readonly movementContinuity: true;
  };
}

export interface PerceptionIntegrationView {
  readonly visionRange: number;
  readonly hearingRadius: number;
  readonly closeAttentionRange: number;
  readonly acousticInvestigationActive: boolean;
  readonly acousticInvestigationTarget: GridPoint | null;
  readonly acousticEpisodeId: number | null;
  readonly acousticShots: number;
  readonly responderIds: readonly string[];
  readonly searchRedirects: number;
  readonly fastSearchTransitions: number;
  readonly attention: readonly (AttentionSample & { readonly agentId: string })[];
}

export interface TacticalWizardSimulationState extends RuntimeState {
  readonly runtimeIdentity: RuntimeIdentityView;
  readonly perceptionIntegration: PerceptionIntegrationView;
}

interface ThreatHostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  facing: GridPoint;
  targetVisible: boolean;
  task: string;
  tacticalTarget: GridPoint | null;
  buddyRole?: string;
  searchWaypoints?: readonly GridPoint[];
  searchIndex?: number;
  searchScanIndex?: number;
  searchHoldFrames?: number;
  searchComplete?: boolean;
  searchLookTarget?: GridPoint | null;
  locomotionMode?: string;
}

interface ThreatHostAccess {
  members: ThreatHostMember[];
  logicalTick: number;
  motionFrame: number;
  player: GridPoint;
  alertState: 'idle' | 'pending' | 'active';
  alertSourceId: string | null;
  alertExpiresAt: number;
  tactic: string;
  sharedLastKnownPosition: GridPoint | null;
  suppressorId: string | null;
  moverId: string | null;
  observerId: string | null;
  searchLeadId: string | null;
  searchCoverId: string | null;
  searchOverwatchId: string | null;
  visionRange: number;
  hearingRadius: number;
  movementTarget: (member: ThreatHostMember) => GridPoint | null;
  tryFire: (member: ThreatHostMember, target: GridPoint, reason: string) => void;
  canSeePlayer: (member: ThreatHostMember) => boolean;
  resolveLocomotionMode?: (member: ThreatHostMember, movementDirection: GridPoint) => string;
  transitionTactic?: (next: string, reason: string, rotateRoles: boolean) => void;
  applyRoles: () => void;
  refreshTacticalPlan: () => void;
  log: (...args: any[]) => void;
  pushEvent: (message: string) => void;
  updatePostureAndFacing?: (member: ThreatHostMember) => void;
}

interface HostStateLike {
  readonly logicalTick: number;
  readonly agents: readonly {
    readonly id: string;
    readonly label: string;
    readonly position: GridPoint;
    readonly targetVisible: boolean;
  }[];
  readonly squad: {
    readonly alertState: 'idle' | 'pending' | 'active';
    readonly tactic: string;
    readonly suppressorId: string | null;
    readonly lostContactTicks: number;
  };
}

interface RuntimeThreatAccess {
  readonly tacticalHost: ThreatHostAccess;
  readonly contracts: Map<string, ExecutionContract>;
  readonly equipment: Map<string, { ammoRounds: number; health: number }>;
  logistics: { readonly agentId: string; readonly supplyId: string; readonly task: string; readonly target: GridPoint; readonly startedTick: number; readonly reason: string } | null;
  recoveryPlan: { readonly patientId: string; readonly rescuerId: string; readonly covererId: string | null } | null;
  planLogistics: (state: HostStateLike) => void;
  finishLogistics: (reason: string) => void;
}

interface AcousticInvestigation {
  episodeId: number;
  target: GridPoint;
  firstShotTick: number;
  lastShotTick: number;
  shots: number;
  expiresTick: number;
  listeners: Set<string>;
  observationTargets: Map<string, GridPoint>;
}

interface MovementCommitment {
  readonly task: string;
  readonly target: GridPoint;
  readonly untilFrame: number;
}

interface LocomotionCommitment {
  readonly mode: string;
  readonly untilFrame: number;
}

const RIFLE_REPORT_HEARING_RADIUS = 28;
const INTEGRATED_VISION_RANGE = 20;
const CLOSE_ATTENTION_RANGE = 12;
const VERY_CLOSE_ATTENTION_RANGE = 8;
const CLOSE_ATTENTION_HALF_FOV = 85;
const VERY_CLOSE_ATTENTION_HALF_FOV = 105;
const GUNSHOT_EPISODE_GAP_TICKS = 5;
const REPEATED_GUNSHOT_ESCALATION_COUNT = 2;
const SINGLE_SHOT_INVESTIGATION_TICKS = 16;
const REPEATED_SHOT_INVESTIGATION_TICKS = 28;
const BULLET_IMPACT_RADIUS = 3.2;
const NEAR_MISS_RADIUS = 1.6;
const THREAT_EVIDENCE_MEMORY_TICKS = 28;
const COMBAT_ALERT_MEMORY_TICKS = 56;
const FRESH_LKP_FIRE_TICKS = 6;
const LKP_VERIFY_RANGE = 8.5;
const LKP_VERIFY_TICKS = 3;
const FAST_SEARCH_LOST_TICKS = 3;
const FAST_SEARCH_MAX_DISTANCE = 20;
const FIRE_DISCIPLINE_LOG_COOLDOWN = 8;
const MOVEMENT_COMMIT_FRAMES = 12;
const MOVEMENT_SMALL_RETARGET_DISTANCE = 1.5;
const LOCOMOTION_HOLD_FRAMES = 5;
const FACING_MAX_DEGREES_PER_MOTION_FRAME = 16;
const INVESTIGATION_ARRIVAL = 1.1;
const STABLE_TRAVEL_TASKS = new Set(['hold_cover', 'search_sector', 'overwatch', 'regroup']);
const DIRECT_COMBAT_TACTICS = new Set(['bounding', 'flank', 'crossfire', 'assault']);

/**
 * Stable Tactical Wizard semantic entrypoint.
 *
 * Production execution remains the fixed hierarchy. This class restores the
 * validated behavior semantics that were lost when the V15-V18/Integrated
 * inheritance chain was retired: persistent contact memory, negative evidence,
 * directional search, bounded acoustic investigation, active-search attention,
 * operational logistics admission, and short execution continuity budgets.
 *
 * These features do not reintroduce a numbered runtime overlay or a second
 * tactical planner. They feed facts/constraints into the existing Host and keep
 * executionAuthority synchronized with the movement that is actually executed.
 */
export class TacticalWizardSimulation extends TacticalWizardRuntime {
  private gunshotEpisodeLastTick: number | null = null;
  private gunshotEpisodeShots = 0;
  private acousticEpisodeSerial = 0;
  private acousticInvestigation: AcousticInvestigation | null = null;
  private readonly threatEvidenceCounts: ThreatEvidenceCounts = createThreatEvidenceCounts();
  private readonly threatAffectedAgentIds = new Set<string>();
  private threatLastEvidenceTick: number | null = null;
  private threatLastEvidenceKind: ThreatEvidenceKind | null = null;
  private threatEvidenceBearing: GridPoint | null = null;
  private threatEvidenceSector: GridPoint | null = null;
  private threatResponseEscalations = 0;

  private contactEpisodeId = 0;
  private previousConfirmedContact: GridPoint | null = null;
  private lastConfirmedContact: GridPoint | null = null;
  private lastConfirmedContactTick: number | null = null;
  private egressDirection: GridPoint | null = null;
  private contactWasVisible = false;
  private lastContactSampleTick = -1;
  private lkpCleared = false;
  private lkpClearedTick: number | null = null;
  private lkpVerificationTicks = 0;
  private lastVerificationTick = -1;
  private readonly verifiedBy = new Set<string>();
  private readonly clearedSearchNodes = new Map<string, GridPoint>();
  private readonly lastSearchIndex = new Map<string, number>();
  private reacquireStableTicks = 0;
  private lastReacquireTick = -1;
  private searchRedirects = 0;
  private fastSearchTransitions = 0;
  private logisticsPreemptions = 0;
  private logisticsSuppressedPlanningCalls = 0;
  private readonly fireDisciplineLogTick = new Map<string, number>();
  private readonly movementCommitments = new Map<string, MovementCommitment>();
  private readonly locomotionCommitments = new Map<string, LocomotionCommitment>();

  constructor() {
    super();
    this.installPerceptionEnvelope();
    this.installBehaviorHooks();
    this.logSemanticRuntime('enabled');
  }

  override reset(): TacticalWizardSimulationState {
    super.reset();
    this.resetSemanticState();
    this.logSemanticRuntime('reset');
    return this.getState();
  }

  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    const host = this.behaviorHost();
    const beforeFrame = host.motionFrame;
    const beforeFacing = new Map(host.members.map((member) => [member.id, { ...member.facing }]));
    this.preemptLowerPriorityLogistics(super.getState(), 'pre-frame');
    super.advance(deltaSeconds);
    this.applyFacingRateLimit(beforeFacing, Math.max(0, host.motionFrame - beforeFrame));
    this.synchronizeVisualContactFacts();
    const state = super.getState();
    this.observeContactKnowledge(state);
    this.expireAcousticInvestigation(state.logicalTick);
    this.preemptLowerPriorityLogistics(state, 'post-frame');
    return this.getState();
  }

  override playerFireAt(point: GridPoint): boolean {
    const before = super.getState();
    const fired = super.playerFireAt(point);
    if (!fired) return false;
    this.registerPlayerGunfire(before, point);
    return true;
  }

  override getState(): TacticalWizardSimulationState {
    const base = this.decorateThreatAwareness(super.getState());
    return this.decorateBehaviorState(base);
  }

  private installPerceptionEnvelope(): void {
    const host = this.behaviorHost();
    Object.defineProperty(host, 'hearingRadius', { value: RIFLE_REPORT_HEARING_RADIUS, writable: false, configurable: true });
    Object.defineProperty(host, 'visionRange', { value: INTEGRATED_VISION_RANGE, writable: false, configurable: true });
  }

  private installBehaviorHooks(): void {
    this.installMovingAttentionScan();
    this.installActiveAttentionVision();
    this.installMovementAuthorityBridge();
    this.installFireDiscipline();
    this.installLogisticsAdmissionGuard();
    this.installLocomotionHysteresis();
  }


  private installMovingAttentionScan(): void {
    const host = this.behaviorHost();
    if (typeof host.updatePostureAndFacing !== 'function') return;
    const original = host.updatePostureAndFacing.bind(host);
    host.updatePostureAndFacing = (member: ThreatHostMember): void => {
      original(member);
      if (member.targetVisible || !this.shouldUseActiveAttention(member)) return;
      const anchor = this.attentionAnchor(member);
      if (anchor === null || distance(member.position, anchor) < 0.2) return;
      const agentIndex = Math.max(0, host.members.findIndex((entry) => entry.id === member.id));
      const scan = scanAttention(member.position, anchor, host.motionFrame, agentIndex);
      member.facing = { ...scan.facing };
      member.searchLookTarget = { ...scan.lookTarget };
    };
  }

  private installActiveAttentionVision(): void {
    const host = this.behaviorHost();
    const original = host.canSeePlayer.bind(host);
    host.canSeePlayer = (member: ThreatHostMember): boolean => {
      if (original(member)) return true;
      if (!this.shouldUseActiveAttention(member)) return false;
      const range = distance(member.position, host.player);
      const halfFov = range <= VERY_CLOSE_ATTENTION_RANGE
        ? VERY_CLOSE_ATTENTION_HALF_FOV
        : range <= CLOSE_ATTENTION_RANGE
          ? CLOSE_ATTENTION_HALF_FOV
          : null;
      if (halfFov === null) return false;
      if (!hasLineOfSight(tacticalWizardNavigationGrid, navCell(member.position), navCell(host.player))) return false;
      const direction = normalizedDelta(member.position, host.player);
      return angleDegrees(normalize(member.facing), direction) <= halfFov;
    };
  }

  private installMovementAuthorityBridge(): void {
    const host = this.behaviorHost();
    const runtime = this.runtimeAccess();
    const original = host.movementTarget.bind(host);
    host.movementTarget = (member: ThreatHostMember): GridPoint | null => {
      const proposed = original(member);
      const investigation = this.activeInvestigation(host.logicalTick);
      if (investigation !== null && host.alertState !== 'active' && this.investigationResponders(investigation).includes(member.id)) {
        const target = this.investigationObservationTarget(member, investigation);
        if (distance(member.position, target) <= INVESTIGATION_ARRIVAL) return this.overrideMovementContract(member.id, null, 'investigation', 'bounded acoustic investigation observation hold');
        return this.overrideMovementContract(member.id, target, 'investigation', 'perception/contact investigation owns bounded movement');
      }

      const contract = runtime.contracts.get(member.id);
      const movementOwner = contract?.movementOwner as string | undefined;
      if (host.alertState !== 'active' || !STABLE_TRAVEL_TASKS.has(member.task) || member.targetVisible || movementOwner !== 'tactical') {
        this.acceptMovementCommitment(member, proposed);
        return proposed;
      }

      const prior = this.movementCommitments.get(member.id);
      if (proposed === null) {
        if (prior !== undefined && prior.task === member.task && host.motionFrame < prior.untilFrame && distance(member.position, prior.target) > 0.8) {
          return this.overrideMovementContract(member.id, prior.target, 'tactical', 'short tactical movement commitment retained through a transient null proposal');
        }
        this.movementCommitments.delete(member.id);
        return null;
      }
      if (prior === undefined || prior.task !== member.task || host.motionFrame >= prior.untilFrame || distance(prior.target, proposed) <= MOVEMENT_SMALL_RETARGET_DISTANCE) {
        this.acceptMovementCommitment(member, proposed);
        return proposed;
      }
      return this.overrideMovementContract(member.id, prior.target, 'tactical', 'short tactical movement commitment rejected a large transient retarget');
    };
  }

  private installLocomotionHysteresis(): void {
    const host = this.behaviorHost();
    if (typeof host.resolveLocomotionMode !== 'function') return;
    const original = host.resolveLocomotionMode.bind(host);
    host.resolveLocomotionMode = (member: ThreatHostMember, movementDirection: GridPoint): string => {
      const proposed = original(member, movementDirection);
      const owner = this.runtimeAccess().contracts.get(member.id)?.movementOwner as string | undefined;
      const urgent = owner === 'reaction' || owner === 'recovery_rescue' || owner === 'recovery_security' || owner === 'logistics';
      if (urgent || proposed === 'free' || proposed === 'covered_dash' || proposed === 'forward') {
        this.locomotionCommitments.set(member.id, { mode: proposed, untilFrame: host.motionFrame + LOCOMOTION_HOLD_FRAMES });
        return proposed;
      }
      const prior = this.locomotionCommitments.get(member.id);
      if (prior !== undefined && prior.mode !== proposed && host.motionFrame < prior.untilFrame) return prior.mode;
      this.locomotionCommitments.set(member.id, { mode: proposed, untilFrame: host.motionFrame + LOCOMOTION_HOLD_FRAMES });
      return proposed;
    };
  }

  private installFireDiscipline(): void {
    const host = this.behaviorHost();
    const original = host.tryFire.bind(host);
    host.tryFire = (member: ThreatHostMember, target: GridPoint, reason: string): void => {
      if (this.fireAllowed(member, target, reason)) {
        original(member, target, reason);
        return;
      }
      const previous = this.fireDisciplineLogTick.get(member.id) ?? -999;
      if (host.logicalTick - previous >= FIRE_DISCIPLINE_LOG_COOLDOWN) {
        this.fireDisciplineLogTick.set(member.id, host.logicalTick);
        host.log('agent', member.id, member.label, 'fire', `${member.label} withheld fire: contact knowledge invalidated the requested direct-fire target.`, {
          blocked: true,
          target: { ...target },
          reason,
          lkpCleared: this.lkpCleared,
          lastConfirmedPosition: clonePoint(this.lastConfirmedContact),
          lastConfirmedTick: this.lastConfirmedContactTick,
        });
      }
    };
  }

  private installLogisticsAdmissionGuard(): void {
    const runtime = this.runtimeAccess();
    const original = runtime.planLogistics.bind(this);
    runtime.planLogistics = (state: HostStateLike): void => {
      if (this.directCombatBlocksNewLogistics(state)) {
        this.logisticsSuppressedPlanningCalls += 1;
        return;
      }
      original(state);
    };
  }

  private registerPlayerGunfire(before: RuntimeState, shotTo: GridPoint): void {
    const living = before.agents.filter((agent) => agent.alive);
    if (living.length === 0) return;

    const tick = before.logicalTick;
    const newEpisode = this.gunshotEpisodeLastTick === null || tick - this.gunshotEpisodeLastTick > GUNSHOT_EPISODE_GAP_TICKS;
    if (newEpisode) {
      this.gunshotEpisodeShots = 0;
      this.acousticEpisodeSerial += 1;
      this.acousticInvestigation = null;
    }
    this.gunshotEpisodeLastTick = tick;
    this.gunshotEpisodeShots += 1;

    const listeners = living
      .filter((agent) => distance(agent.position, before.player) <= RIFLE_REPORT_HEARING_RADIUS)
      .sort((left, right) => distance(left.position, before.player) - distance(right.position, before.player) || left.id.localeCompare(right.id, 'en'));
    const endpointOrder = living
      .map((agent) => ({ agent, distance: distance(agent.position, shotTo) }))
      .sort((left, right) => left.distance - right.distance || left.agent.id.localeCompare(right.agent.id, 'en'));
    const trajectoryOrder = living
      .map((agent) => ({ agent, distance: pointSegmentDistance(agent.position, before.player, shotTo) }))
      .sort((left, right) => left.distance - right.distance || left.agent.id.localeCompare(right.agent.id, 'en'));

    const hit = endpointOrder[0]?.distance !== undefined && endpointOrder[0].distance <= 0.85 ? endpointOrder[0].agent : null;
    const nearMiss = hit === null && trajectoryOrder[0]?.distance !== undefined && trajectoryOrder[0].distance <= NEAR_MISS_RADIUS ? trajectoryOrder[0].agent : null;
    const impact = hit === null && nearMiss === null && endpointOrder[0]?.distance !== undefined && endpointOrder[0].distance <= BULLET_IMPACT_RADIUS ? endpointOrder[0].agent : null;
    const acousticObserver = listeners[0] ?? null;

    if (listeners.length > 0 && acousticObserver !== null) {
      this.recordThreatEvidence('gunshot', tick, listeners.map((agent) => agent.id), acousticObserver.position, before.player);
      this.registerAcousticInvestigation(listeners.map((agent) => agent.id), acousticObserver.position, before.player, tick);
    }

    if (hit !== null) {
      this.recordThreatEvidence('hit', tick, [hit.id], hit.position, before.player);
      this.escalateGunfireContact(hit.id, hit.position, before.player, 'hit');
      return;
    }
    if (nearMiss !== null) {
      this.recordThreatEvidence('near_miss', tick, [nearMiss.id], nearMiss.position, before.player);
      this.escalateGunfireContact(nearMiss.id, nearMiss.position, before.player, 'near_miss');
      return;
    }
    if (impact !== null) {
      this.recordThreatEvidence('bullet_impact', tick, [impact.id], impact.position, before.player);
      this.escalateGunfireContact(impact.id, impact.position, before.player, 'bullet_impact');
      return;
    }
    if (acousticObserver !== null && this.gunshotEpisodeShots >= REPEATED_GUNSHOT_ESCALATION_COUNT) {
      this.escalateGunfireContact(acousticObserver.id, acousticObserver.position, before.player, 'gunshot');
    }
  }

  private registerAcousticInvestigation(listenerIds: readonly string[], observer: GridPoint, source: GridPoint, tick: number): void {
    const coarse = estimateThreatSector(observer, source);
    const expiry = tick + (this.gunshotEpisodeShots >= 2 ? REPEATED_SHOT_INVESTIGATION_TICKS : SINGLE_SHOT_INVESTIGATION_TICKS);
    if (this.acousticInvestigation === null || this.acousticInvestigation.episodeId !== this.acousticEpisodeSerial) {
      this.acousticInvestigation = {
        episodeId: this.acousticEpisodeSerial,
        target: coarse,
        firstShotTick: tick,
        lastShotTick: tick,
        shots: this.gunshotEpisodeShots,
        expiresTick: expiry,
        listeners: new Set(listenerIds),
        observationTargets: new Map(),
      };
      const host = this.behaviorHost();
      host.pushEvent(`T${tick}: rifle report created a bounded acoustic investigation sector.`);
      host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'perception', 'Rifle-shot hearing created an executable investigation sector before visual confirmation.', {
        episodeId: this.acousticEpisodeSerial,
        shots: this.gunshotEpisodeShots,
        coarseTarget: { ...coarse },
        listenerIds,
        exactShooterPositionWithheld: true,
      });
      return;
    }

    const investigation = this.acousticInvestigation;
    investigation.shots = Math.max(investigation.shots, this.gunshotEpisodeShots);
    investigation.lastShotTick = tick;
    investigation.expiresTick = Math.max(investigation.expiresTick, expiry);
    for (const id of listenerIds) investigation.listeners.add(id);
    investigation.target = quantizePoint({
      x: investigation.target.x * 0.35 + coarse.x * 0.65,
      y: investigation.target.y * 0.35 + coarse.y * 0.65,
    });
    investigation.observationTargets.clear();
  }

  private recordThreatEvidence(kind: ThreatEvidenceKind, tick: number, affectedAgentIds: readonly string[], observerPosition: GridPoint | null, sourcePosition: GridPoint): void {
    this.threatEvidenceCounts[kind] += 1;
    this.threatLastEvidenceTick = tick;
    this.threatLastEvidenceKind = kind;
    for (const id of affectedAgentIds) this.threatAffectedAgentIds.add(id);
    if (observerPosition !== null) {
      this.threatEvidenceBearing = normalizedDelta(observerPosition, sourcePosition);
      this.threatEvidenceSector = estimateThreatSector(observerPosition, sourcePosition);
    }
  }

  private escalateGunfireContact(sourceAgentId: string, observerPosition: GridPoint, sourcePosition: GridPoint, kind: ThreatEvidenceKind): void {
    const runtime = this.runtimeAccess();
    const host = runtime.tacticalHost;
    const source = host.members.find((member) => member.id === sourceAgentId) ?? host.members[0];
    if (source === undefined) return;

    const estimatedSector = estimateThreatSector(observerPosition, sourcePosition);
    const newlyEscalated = host.alertState !== 'active';
    if (host.alertSourceId === null || host.alertState === 'idle') host.alertSourceId = source.id;
    if (host.sharedLastKnownPosition === null || host.alertState === 'idle') host.sharedLastKnownPosition = { ...estimatedSector };
    host.alertExpiresAt = Math.max(host.alertExpiresAt, host.logicalTick + COMBAT_ALERT_MEMORY_TICKS);

    if (newlyEscalated) {
      const activate = (host as unknown as { activateSquad?: () => void }).activateSquad;
      if (typeof activate === 'function') activate.call(host);
    } else {
      host.refreshTacticalPlan();
    }
    runtime.contracts.clear();
    if (newlyEscalated) this.threatResponseEscalations += 1;
    host.pushEvent(`T${host.logicalTick}: hostile rifle ${kind} evidence escalated the squad into combat.`);
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'alert', 'Hostile rifle evidence promoted through perception/contact into the fixed-hierarchy combat alert.', {
      evidenceKind: kind,
      sourceAgentId: source.id,
      episodeShots: this.gunshotEpisodeShots,
      estimatedSector: { ...estimatedSector },
      exactShooterPositionWithheld: true,
      alertEscalated: newlyEscalated,
    });
  }

  private observeContactKnowledge(state: RuntimeState): void {
    if (state.logicalTick === this.lastContactSampleTick) return;
    this.lastContactSampleTick = state.logicalTick;
    const visibleIds = this.confirmedHostVisualIds(state);
    const visible = visibleIds.length > 0;

    if (visible) {
      const point = { ...state.player };
      const startEpisode = !this.contactWasVisible
        && (this.lastConfirmedContact === null || this.lkpCleared || distance(this.lastConfirmedContact, point) > 4.5);
      if (startEpisode) {
        this.contactEpisodeId += 1;
        this.clearedSearchNodes.clear();
        this.lastSearchIndex.clear();
      }
      if (this.lastConfirmedContact === null || distance(this.lastConfirmedContact, point) >= 0.15) {
        this.previousConfirmedContact = clonePoint(this.lastConfirmedContact);
        this.lastConfirmedContact = point;
        const derived = deriveEgressDirection(this.previousConfirmedContact, this.lastConfirmedContact);
        if (derived !== null) this.egressDirection = derived;
      }
      this.lastConfirmedContactTick = state.logicalTick;
      this.contactWasVisible = true;
      this.lkpCleared = false;
      this.lkpClearedTick = null;
      this.lkpVerificationTicks = 0;
      this.lastVerificationTick = -1;
      this.verifiedBy.clear();
      this.maintainReacquisition(state, true);
      return;
    }

    if (this.contactWasVisible) {
      this.contactWasVisible = false;
      this.lkpCleared = false;
      this.lkpClearedTick = null;
      this.lkpVerificationTicks = 0;
      this.lastVerificationTick = -1;
      this.verifiedBy.clear();
      this.behaviorHost().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'perception', 'Visual contact lost; the last confirmed point became a hypothesis pending verification.', {
        episodeId: this.contactEpisodeId,
        lastConfirmedPosition: clonePoint(this.lastConfirmedContact),
        egressDirection: clonePoint(this.egressDirection),
      });
    }

    this.maintainReacquisition(state, false);
    this.maybeAccelerateLostContactSearch(state);
    this.observeSearchProgress(state);
    this.evaluateNegativeEvidence(state);
  }

  private maybeAccelerateLostContactSearch(state: RuntimeState): void {
    if (state.squad.alertState !== 'active' || state.squad.tactic === 'sweep' || this.lastConfirmedContact === null) return;
    if (state.recovery.phase !== 'none') return;
    const lostTicks = this.lastConfirmedContactTick === null ? 0 : Math.max(0, state.logicalTick - this.lastConfirmedContactTick);
    if (lostTicks < FAST_SEARCH_LOST_TICKS) return;
    const living = state.agents.filter((agent) => agent.alive);
    if (living.length === 0) return;
    const nearest = Math.min(...living.map((agent) => distance(agent.position, this.lastConfirmedContact!)));
    if (nearest > FAST_SEARCH_MAX_DISTANCE) return;
    const host = this.behaviorHost();
    if (typeof host.transitionTactic !== 'function') return;
    host.transitionTactic('sweep', 'Close confirmed contact has been absent for three decision ticks; verify the exact LKP before expanding search.', false);
    this.fastSearchTransitions += 1;
  }

  private evaluateNegativeEvidence(state: RuntimeState): void {
    if (this.lastConfirmedContact === null || this.lkpCleared || state.squad.tactic !== 'sweep') return;
    if (this.confirmedHostVisualIds(state).length > 0) return;
    if (state.logicalTick === this.lastVerificationTick) return;
    this.lastVerificationTick = state.logicalTick;

    const lkpCell = navCell(this.lastConfirmedContact);
    const witnesses = state.agents.filter((agent) => agent.alive
      && (agent.task === 'search_sector' || agent.task === 'overwatch' || agent.buddyRole === 'cover')
      && distance(agent.position, this.lastConfirmedContact!) <= LKP_VERIFY_RANGE
      && hasLineOfSight(tacticalWizardNavigationGrid, navCell(agent.position), lkpCell)
      && (agent.searchProgress > 0.03 || agent.task === 'overwatch' || distance(agent.position, this.lastConfirmedContact!) <= 3));

    if (witnesses.length === 0) {
      this.lkpVerificationTicks = Math.max(0, this.lkpVerificationTicks - 1);
      return;
    }
    for (const witness of witnesses) this.verifiedBy.add(witness.id);
    this.lkpVerificationTicks += 1;
    if (this.lkpVerificationTicks < LKP_VERIFY_TICKS) return;

    this.lkpCleared = true;
    this.lkpClearedTick = state.logicalTick;
    this.clearedSearchNodes.set(gridKey(lkpCell), lkpCell);
    const host = this.behaviorHost();
    host.pushEvent(`T${state.logicalTick}: last confirmed position verified empty; search expands along recorded egress direction.`);
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'search', 'Negative visual evidence verified the last confirmed point empty; direct attack permissions were revoked.', {
      episodeId: this.contactEpisodeId,
      lastConfirmedPosition: { ...this.lastConfirmedContact },
      egressDirection: clonePoint(this.egressDirection),
      verifiedBy: [...this.verifiedBy].sort(),
      nextPolicy: this.egressDirection === null ? 'existing_search_fallback' : 'directional_search_frontier',
    });
    this.applyDirectionalSweepPlan();
  }

  private applyDirectionalSweepPlan(): void {
    const host = this.behaviorHost();
    if (host.tactic !== 'sweep' || !this.lkpCleared || this.lastConfirmedContact === null || this.egressDirection === null) return;
    const cleared = new Set(this.clearedSearchNodes.keys());
    const assignments: Array<{ readonly id: string | null; readonly lane: 0 | 1 | 2 }> = [
      { id: host.searchLeadId, lane: 0 },
      { id: host.searchCoverId, lane: 1 },
      { id: host.searchOverwatchId, lane: 2 },
    ];
    let redirected = false;

    for (const assignment of assignments) {
      if (assignment.id === null) continue;
      const member = host.members.find((entry) => entry.id === assignment.id);
      if (member === undefined) continue;
      const generated = buildDirectionalSearchWaypoints(tacticalWizardNavigationGrid, this.lastConfirmedContact, this.egressDirection, assignment.lane, cleared);
      if (generated.length === 0) continue;
      member.searchWaypoints = assignment.lane === 2 ? generated.slice(0, 1) : generated;
      member.searchIndex = 0;
      member.searchScanIndex = 0;
      member.searchHoldFrames = 0;
      member.searchComplete = false;
      member.tacticalTarget = member.searchWaypoints[0] ?? member.tacticalTarget;
      this.lastSearchIndex.set(member.id, 0);
      for (const point of member.searchWaypoints) cleared.add(gridKey(navCell(point)));
      redirected = true;
    }
    if (redirected) this.searchRedirects += 1;
  }

  private observeSearchProgress(state: RuntimeState): void {
    if (state.squad.tactic !== 'sweep') return;
    const host = this.behaviorHost();
    for (const member of host.members) {
      if (member.searchWaypoints === undefined || member.searchWaypoints.length === 0 || member.searchIndex === undefined) continue;
      const agent = state.agents.find((entry) => entry.id === member.id);
      if (agent === undefined || !agent.alive) continue;
      const previousIndex = this.lastSearchIndex.get(member.id) ?? member.searchIndex;
      if (member.searchIndex > previousIndex) {
        const cleared = member.searchWaypoints[Math.min(member.searchIndex - 1, member.searchWaypoints.length - 1)];
        if (cleared !== undefined) this.clearedSearchNodes.set(gridKey(navCell(cleared)), navCell(cleared));
      }
      if (member.searchComplete) {
        const final = member.searchWaypoints.at(-1);
        if (final !== undefined) this.clearedSearchNodes.set(gridKey(navCell(final)), navCell(final));
      }
      this.lastSearchIndex.set(member.id, member.searchIndex);
    }
  }

  private maintainReacquisition(state: RuntimeState, visible: boolean): void {
    if (state.logicalTick !== this.lastReacquireTick) {
      this.lastReacquireTick = state.logicalTick;
      this.reacquireStableTicks = visible ? this.reacquireStableTicks + 1 : 0;
    }
    if (!visible || state.squad.tactic !== 'sweep') return;
    const living = state.agents.filter((agent) => agent.alive).length;
    const required = living <= 1 ? 1 : living === 2 ? 2 : 3;
    if (this.reacquireStableTicks < required) return;
    const host = this.behaviorHost();
    if (typeof host.transitionTactic === 'function') {
      host.transitionTactic('bounding', `Confirmed reacquisition held ${this.reacquireStableTicks}/${required} decision ticks; search lease released back to direct-contact tactics.`, false);
    }
  }

  private fireAllowed(member: ThreatHostMember, target: GridPoint, reason: string): boolean {
    if (this.behaviorHost().canSeePlayer(member)) return true;
    if (this.currentFrontier().some((point) => distance(point, target) <= 1.1)) return false;
    if (this.lastConfirmedContact === null || distance(this.lastConfirmedContact, target) > 1.1) return true;
    if (this.lkpCleared) return false;
    const age = this.lastConfirmedContactTick === null ? Number.MAX_SAFE_INTEGER : this.behaviorHost().logicalTick - this.lastConfirmedContactTick;
    if (age <= FRESH_LKP_FIRE_TICKS) return true;
    return /counter|rescue security/i.test(reason);
  }

  private directCombatBlocksNewLogistics(state: HostStateLike): boolean {
    if (state.squad.alertState !== 'active') return false;
    const runtime = this.runtimeAccess();
    const living = state.agents.filter((agent) => (runtime.equipment.get(agent.id)?.health ?? 0) > 0);
    if (living.length === 0) return false;
    const allDry = living.every((agent) => (runtime.equipment.get(agent.id)?.ammoRounds ?? 0) < 3);
    if (allDry) return false;
    const livingIds = new Set(living.map((agent) => agent.id));
    const confirmedVisual = this.behaviorHost().members.some((member) => livingIds.has(member.id) && this.behaviorHost().canSeePlayer(member));
    if (confirmedVisual) return true;
    if (DIRECT_COMBAT_TACTICS.has(state.squad.tactic) && state.squad.lostContactTicks <= FAST_SEARCH_LOST_TICKS) return true;
    return false;
  }

  private preemptLowerPriorityLogistics(state: RuntimeState, phase: string): void {
    const runtime = this.runtimeAccess();
    const assignment = runtime.logistics;
    if (assignment === null || state.squad.alertState !== 'active') return;
    const living = state.agents.filter((agent) => agent.alive);
    if (living.length > 0 && living.every((agent) => (runtime.equipment.get(agent.id)?.ammoRounds ?? 0) < 3)) return;
    const agent = state.agents.find((entry) => entry.id === assignment.agentId);
    if (agent === undefined || !agent.alive) return;
    const equipment = runtime.equipment.get(agent.id);
    const ammo = equipment?.ammoRounds ?? 0;
    const directVisual = this.confirmedHostVisualIds(state).length > 0;
    const ownsCriticalCombatRole = state.squad.suppressorId === agent.id || agent.targetVisible || ammo >= 3;
    if (!directVisual || !ownsCriticalCombatRole) return;
    runtime.finishLogistics(`lower-priority logistics lease preempted by direct combat during ${phase}`);
    this.logisticsPreemptions += 1;
    this.behaviorHost().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Operational arbitration returned a lower-priority resupply lease to Tactical Planning because direct combat has execution priority.', {
      agentId: agent.id,
      ammoRounds: ammo,
      phase,
      tactic: state.squad.tactic,
      logisticsPreemptions: this.logisticsPreemptions,
    });
  }

  private decorateThreatAwareness(state: RuntimeState): RuntimeState {
    const base = state.threatAwareness;
    const ownEvidenceActive = this.threatLastEvidenceTick !== null && state.logicalTick - this.threatLastEvidenceTick <= THREAT_EVIDENCE_MEMORY_TICKS;
    const evidenceCounts: ThreatEvidenceCounts = {
      gunshot: Math.max(base.evidenceCounts.gunshot, this.threatEvidenceCounts.gunshot),
      bullet_impact: Math.max(base.evidenceCounts.bullet_impact, this.threatEvidenceCounts.bullet_impact),
      near_miss: Math.max(base.evidenceCounts.near_miss, this.threatEvidenceCounts.near_miss),
      hit: Math.max(base.evidenceCounts.hit, this.threatEvidenceCounts.hit),
    };
    const baseTick = base.lastEvidenceTick ?? -1;
    const ownTick = this.threatLastEvidenceTick ?? -1;
    const ownIsLatest = ownTick >= baseTick && this.threatLastEvidenceKind !== null;
    const affectedAgentIds = [...new Set([...base.affectedAgentIds, ...this.threatAffectedAgentIds])].sort((left, right) => left.localeCompare(right, 'en'));

    let level = base.level;
    let confidence = base.confidence;
    if (level !== 'confirmed' && ownEvidenceActive) {
      level = state.squad.alertState === 'active' || this.threatResponseEscalations > 0 ? 'threatened' : 'suspicious';
      confidence = level === 'threatened' ? Math.max(confidence, 0.78) : Math.max(confidence, 0.45);
    }

    return {
      ...state,
      threatAwareness: {
        level,
        confidence,
        bearing: ownEvidenceActive && this.threatEvidenceBearing !== null ? { ...this.threatEvidenceBearing } : base.bearing,
        estimatedSector: ownEvidenceActive && this.threatEvidenceSector !== null ? { ...this.threatEvidenceSector } : base.estimatedSector,
        lastEvidenceTick: ownIsLatest ? this.threatLastEvidenceTick : base.lastEvidenceTick,
        lastEvidenceKind: ownIsLatest ? this.threatLastEvidenceKind : base.lastEvidenceKind,
        evidenceCount: evidenceCounts.gunshot + evidenceCounts.bullet_impact + evidenceCounts.near_miss + evidenceCounts.hit,
        evidenceCounts,
        affectedAgentIds,
        responseEscalations: Math.max(base.responseEscalations, this.threatResponseEscalations),
      },
    };
  }

  private decorateBehaviorState(base: RuntimeState): TacticalWizardSimulationState {
    const visibleIds = this.confirmedHostVisualIds(base);
    const lostTicks = this.lastConfirmedContactTick === null ? 0 : Math.max(0, base.logicalTick - this.lastConfirmedContactTick);
    const frontier = this.currentFrontier();
    const investigation = this.activeInvestigation(base.logicalTick);
    const responderIds = investigation === null ? [] : this.investigationResponders(investigation);
    const contracts = base.executionAuthority.contracts.map((contract) => {
      if (investigation === null || base.squad.alertState === 'active' || !responderIds.includes(contract.agentId)) return contract;
      const member = this.behaviorHost().members.find((entry) => entry.id === contract.agentId);
      if (member === undefined) return contract;
      const target = this.investigationObservationTarget(member, investigation);
      return {
        ...contract,
        movementOwner: 'investigation' as unknown as ExecutionContract['movementOwner'],
        movementTarget: distance(member.position, target) <= INVESTIGATION_ARRIVAL ? null : { ...target },
        reason: 'perception/contact investigation owns bounded movement before visual confirmation',
      };
    });
    const contractByAgent = new Map(contracts.map((contract) => [contract.agentId, contract]));
    const commitments = base.combatAuthority.commitments.map((commitment) => {
      const contract = contractByAgent.get(commitment.agentId);
      const owner = contract?.movementOwner as string | undefined;
      if (owner !== 'investigation') return commitment;
      return { ...commitment, commitment: 'investigation', priority: 55, reason: contract?.reason ?? commitment.reason };
    });
    const status = visibleIds.length > 0
      ? 'confirmed'
      : this.lastConfirmedContact === null
        ? 'none'
        : base.squad.alertState === 'active'
          ? (lostTicks <= FRESH_LKP_FIRE_TICKS && !this.lkpCleared ? 'lost_fresh' : 'searching')
          : 'none';

    return {
      ...base,
      contactTrack: {
        episodeId: this.contactEpisodeId,
        status,
        previousConfirmedPosition: clonePoint(this.previousConfirmedContact),
        lastConfirmedPosition: clonePoint(this.lastConfirmedContact),
        lastConfirmedTick: this.lastConfirmedContactTick,
        egressDirection: clonePoint(this.egressDirection),
        confidence: visibleIds.length > 0 ? 1 : this.lastConfirmedContact === null ? 0 : Math.max(0.08, Math.min(0.96, 1 - lostTicks * 0.035 - (this.lkpCleared ? 0.22 : 0))),
        uncertaintyRadius: this.lastConfirmedContact === null ? 0 : Number(contactUncertaintyRadius(lostTicks, this.lkpCleared).toFixed(2)),
        lkpCleared: this.lkpCleared,
        lkpClearedTick: this.lkpClearedTick,
        verifiedBy: [...this.verifiedBy].sort(),
        clearedSearchNodes: [...this.clearedSearchNodes.values()].map((point) => ({ ...point })),
        frontier,
      },
      combatAuthority: {
        ...base.combatAuthority,
        searchPhase: visibleIds.length > 0 && base.squad.tactic === 'sweep'
          ? 'reacquire'
          : base.squad.tactic === 'sweep'
            ? (this.lkpCleared ? 'search_frontier' : 'verify_lkp')
            : 'none',
        confirmedVisualIds: visibleIds,
        commitments,
        logisticsPreemptions: this.logisticsPreemptions,
      },
      logisticsLifecycle: {
        ...base.logisticsLifecycle,
        suppressedPlanningCalls: this.logisticsSuppressedPlanningCalls,
      },
      executionAuthority: {
        ...base.executionAuthority,
        contracts,
      },
      perceptionIntegration: {
        visionRange: INTEGRATED_VISION_RANGE,
        hearingRadius: RIFLE_REPORT_HEARING_RADIUS,
        closeAttentionRange: CLOSE_ATTENTION_RANGE,
        acousticInvestigationActive: investigation !== null && base.squad.alertState !== 'active',
        acousticInvestigationTarget: investigation === null ? null : { ...investigation.target },
        acousticEpisodeId: investigation?.episodeId ?? null,
        acousticShots: investigation?.shots ?? 0,
        responderIds,
        searchRedirects: this.searchRedirects,
        fastSearchTransitions: this.fastSearchTransitions,
        attention: this.behaviorHost().members.map((member, agentIndex) => {
          const anchor = this.attentionAnchor(member);
          const mode = this.attentionMode(member);
          const scan = anchor === null ? null : scanAttention(member.position, anchor, this.behaviorHost().motionFrame, agentIndex);
          return {
            agentId: member.id,
            mode,
            anchor,
            scanPhase: scan?.scanPhase ?? 0,
            facing: { ...member.facing },
            lookTarget: clonePoint(member.searchLookTarget ?? (mode === 'track_visual' ? attentionLookTarget(member.position, member.facing) : null)),
          };
        }),
      },
      runtimeIdentity: runtimeIdentity(),
    };
  }

  private activeInvestigation(tick: number): AcousticInvestigation | null {
    const investigation = this.acousticInvestigation;
    if (investigation === null || tick > investigation.expiresTick) return null;
    return investigation;
  }

  private expireAcousticInvestigation(tick: number): void {
    if (this.acousticInvestigation !== null && tick > this.acousticInvestigation.expiresTick) this.acousticInvestigation = null;
  }

  private investigationResponders(investigation: AcousticInvestigation): readonly string[] {
    const count = investigation.shots >= 2 ? 2 : 1;
    return [...investigation.listeners]
      .filter((id) => this.runtimeAccess().equipment.get(id)?.health !== undefined && (this.runtimeAccess().equipment.get(id)?.health ?? 0) > 0)
      .sort((left, right) => left.localeCompare(right, 'en'))
      .slice(0, count);
  }

  private investigationObservationTarget(member: ThreatHostMember, investigation: AcousticInvestigation): GridPoint {
    const cached = investigation.observationTargets.get(member.id);
    if (cached !== undefined) return cached;
    const responders = this.investigationResponders(investigation);
    const lane = Math.max(0, responders.indexOf(member.id));
    const toward = normalizedDelta(member.position, investigation.target);
    const right = { x: -toward.y, y: toward.x };
    const desired = {
      x: investigation.target.x - toward.x * 3.4 + right.x * (lane === 0 ? -1.4 : 1.4),
      y: investigation.target.y - toward.y * 3.4 + right.y * (lane === 0 ? -1.4 : 1.4),
    };
    const selected = nearestWalkable(desired, 3) ?? navCell(member.position);
    investigation.observationTargets.set(member.id, selected);
    return selected;
  }


  private attentionAnchor(member: ThreatHostMember): GridPoint | null {
    const investigation = this.activeInvestigation(this.behaviorHost().logicalTick);
    if (investigation !== null && this.investigationResponders(investigation).includes(member.id)) return { ...investigation.target };
    if (this.runtimeAccess().recoveryPlan?.covererId === member.id) return clonePoint(this.threatEvidenceSector ?? this.lastConfirmedContact ?? this.behaviorHost().sharedLastKnownPosition);
    if (member.task === 'search_sector' || member.task === 'overwatch') return clonePoint(member.tacticalTarget ?? this.lastConfirmedContact ?? this.behaviorHost().sharedLastKnownPosition);
    return null;
  }

  private attentionMode(member: ThreatHostMember): AttentionMode {
    if (member.targetVisible) return 'track_visual';
    const investigation = this.activeInvestigation(this.behaviorHost().logicalTick);
    if (investigation !== null && this.investigationResponders(investigation).includes(member.id)) return 'scan_acoustic';
    if (this.runtimeAccess().recoveryPlan?.covererId === member.id) return 'recovery_security';
    if (member.task === 'search_sector' || member.task === 'overwatch') return 'scan_search';
    return 'tactical';
  }

  private synchronizeVisualContactFacts(): void {
    const host = this.behaviorHost();
    for (const member of host.members) member.targetVisible = host.canSeePlayer(member);
  }

  private shouldUseActiveAttention(member: ThreatHostMember): boolean {
    if (member.targetVisible) return false;
    if (member.task === 'search_sector' || member.task === 'overwatch') return true;
    if (this.runtimeAccess().recoveryPlan?.covererId === member.id) return true;
    const investigation = this.activeInvestigation(this.behaviorHost().logicalTick);
    return investigation !== null && this.investigationResponders(investigation).includes(member.id);
  }

  private confirmedHostVisualIds(state: RuntimeState): string[] {
    return state.agents
      .filter((agent) => agent.alive && agent.targetVisible)
      .map((agent) => agent.id)
      .sort((left, right) => left.localeCompare(right, 'en'));
  }

  private currentFrontier(): readonly GridPoint[] {
    const host = this.behaviorHost();
    if (host.tactic !== 'sweep') return [];
    const points: GridPoint[] = [];
    const seen = new Set<string>();
    for (const member of host.members) {
      if (member.searchWaypoints === undefined) continue;
      const start = member.searchIndex ?? 0;
      for (let index = start; index < member.searchWaypoints.length; index += 1) {
        const point = member.searchWaypoints[index];
        if (point === undefined) continue;
        const cell = navCell(point);
        const key = gridKey(cell);
        if (seen.has(key) || this.clearedSearchNodes.has(key)) continue;
        seen.add(key);
        points.push({ ...point });
        if (points.length >= 8) return points;
      }
    }
    return points;
  }

  private acceptMovementCommitment(member: ThreatHostMember, target: GridPoint | null): void {
    if (target === null) {
      this.movementCommitments.delete(member.id);
      return;
    }
    this.movementCommitments.set(member.id, { task: member.task, target: { ...target }, untilFrame: this.behaviorHost().motionFrame + MOVEMENT_COMMIT_FRAMES });
  }

  private overrideMovementContract(agentId: string, target: GridPoint | null, owner: 'investigation' | 'tactical', reason: string): GridPoint | null {
    const runtime = this.runtimeAccess();
    const existing = runtime.contracts.get(agentId);
    if (existing !== undefined) {
      runtime.contracts.set(agentId, {
        ...existing,
        movementOwner: owner as unknown as ExecutionContract['movementOwner'],
        movementTarget: clonePoint(target),
        reason,
      });
    }
    return clonePoint(target);
  }

  private applyFacingRateLimit(before: ReadonlyMap<string, GridPoint>, motionFrames: number): void {
    if (motionFrames <= 0) return;
    const maxTurn = FACING_MAX_DEGREES_PER_MOTION_FRAME * motionFrames;
    for (const member of this.behaviorHost().members) {
      const previous = before.get(member.id);
      if (previous === undefined) continue;
      member.facing = rotateToward(previous, member.facing, maxTurn);
    }
  }

  private resetSemanticState(): void {
    this.gunshotEpisodeLastTick = null;
    this.gunshotEpisodeShots = 0;
    this.acousticEpisodeSerial = 0;
    this.acousticInvestigation = null;
    this.threatEvidenceCounts.gunshot = 0;
    this.threatEvidenceCounts.bullet_impact = 0;
    this.threatEvidenceCounts.near_miss = 0;
    this.threatEvidenceCounts.hit = 0;
    this.threatAffectedAgentIds.clear();
    this.threatLastEvidenceTick = null;
    this.threatLastEvidenceKind = null;
    this.threatEvidenceBearing = null;
    this.threatEvidenceSector = null;
    this.threatResponseEscalations = 0;
    this.contactEpisodeId = 0;
    this.previousConfirmedContact = null;
    this.lastConfirmedContact = null;
    this.lastConfirmedContactTick = null;
    this.egressDirection = null;
    this.contactWasVisible = false;
    this.lastContactSampleTick = -1;
    this.lkpCleared = false;
    this.lkpClearedTick = null;
    this.lkpVerificationTicks = 0;
    this.lastVerificationTick = -1;
    this.verifiedBy.clear();
    this.clearedSearchNodes.clear();
    this.lastSearchIndex.clear();
    this.reacquireStableTicks = 0;
    this.lastReacquireTick = -1;
    this.searchRedirects = 0;
    this.fastSearchTransitions = 0;
    this.logisticsPreemptions = 0;
    this.logisticsSuppressedPlanningCalls = 0;
    this.fireDisciplineLogTick.clear();
    this.movementCommitments.clear();
    this.locomotionCommitments.clear();
  }

  private logSemanticRuntime(action: 'enabled' | 'reset'): void {
    const identity = runtimeIdentity();
    this.behaviorHost().log('system', 'simulation', 'Volition Simulation', 'session', `Fixed-hierarchy behavior parity runtime ${action}.`, {
      runtimeCommit: identity.commit,
      runtimeEntrypoint: identity.entrypoint,
      architecture: identity.architecture,
      behaviorProfile: identity.behaviorProfile,
      enabledFeatures: Object.entries(identity.features).filter(([, enabled]) => enabled).map(([name]) => name),
      hearingRadius: RIFLE_REPORT_HEARING_RADIUS,
      visionRange: INTEGRATED_VISION_RANGE,
      freshLkpFireTicks: FRESH_LKP_FIRE_TICKS,
      lkpVerifyTicks: LKP_VERIFY_TICKS,
      logisticsPolicy: 'direct_combat_above_logistics',
      versionOverlayPolicy: 'forbidden',
    });
  }

  private behaviorHost(): ThreatHostAccess {
    return this.runtimeAccess().tacticalHost;
  }

  private runtimeAccess(): RuntimeThreatAccess {
    return this as unknown as RuntimeThreatAccess;
  }
}

function runtimeIdentity(): RuntimeIdentityView {
  return {
    commit: typeof __VOLITION_COMMIT__ === 'string' ? __VOLITION_COMMIT__ : 'unknown',
    entrypoint: 'TacticalWizardSimulation',
    architecture: 'fixed_tactical_hierarchy',
    behaviorProfile: 'active_attention_recovery',
    features: {
      gunfireEvidence: true,
      contactMemory: true,
      directionalSearch: true,
      acousticInvestigation: true,
      activeAttention: true,
      logisticsArbitration: true,
      movementContinuity: true,
    },
  };
}

function createThreatEvidenceCounts(): ThreatEvidenceCounts {
  return { gunshot: 0, bullet_impact: 0, near_miss: 0, hit: 0 };
}

function pointSegmentDistance(point: GridPoint, start: GridPoint, end: GridPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
}

function estimateThreatSector(observer: GridPoint, source: GridPoint): GridPoint {
  const bearing = normalizedDelta(observer, source);
  const range = distance(observer, source);
  const projectedRange = Math.min(10, Math.max(2, range * 0.7));
  return quantizePoint({ x: observer.x + bearing.x * projectedRange, y: observer.y + bearing.y * projectedRange });
}

function nearestWalkable(desired: GridPoint, radius: number): GridPoint | null {
  const center = navCell(desired);
  const candidates: Array<{ readonly point: GridPoint; readonly score: number }> = [];
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      const point = { x, y };
      if (!isWalkable(tacticalWizardNavigationGrid, point)) continue;
      candidates.push({ point, score: distance(point, desired) });
    }
  }
  candidates.sort((left, right) => left.score - right.score || left.point.y - right.point.y || left.point.x - right.point.x);
  return candidates[0]?.point ?? null;
}

function normalizedDelta(from: GridPoint, to: GridPoint): GridPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length <= 1e-6 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length };
}

function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-6 ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
}

function angleDegrees(a: GridPoint, b: GridPoint): number {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
  return Math.acos(dot) * 180 / Math.PI;
}

function rotateToward(from: GridPoint, to: GridPoint, maxDegrees: number): GridPoint {
  const a = normalize(from);
  const b = normalize(to);
  const delta = signedAngleDegrees(a, b);
  if (Math.abs(delta) <= maxDegrees) return b;
  return rotate(a, Math.sign(delta) * maxDegrees);
}

function signedAngleDegrees(a: GridPoint, b: GridPoint): number {
  return Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y) * 180 / Math.PI;
}

function rotate(point: GridPoint, degrees: number): GridPoint {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return normalize({ x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos });
}

function quantizePoint(point: GridPoint): GridPoint {
  return { x: Math.round(point.x * 2) / 2, y: Math.round(point.y * 2) / 2 };
}

function navCell(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))),
  };
}

function clonePoint(point: GridPoint | null): GridPoint | null {
  return point === null ? null : { ...point };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
