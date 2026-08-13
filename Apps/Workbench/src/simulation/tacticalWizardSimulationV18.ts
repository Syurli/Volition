import { findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from './tacticalWizardTestMapV7';
import type { RunLogCategory, RunLogEvent, RunLogValue } from './tacticalWizardSimulationV3';
import {
  TacticalWizardSimulation as TacticalWizardSimulationV17,
  type TacticalWizardSimulationState as TacticalWizardSimulationStateV17,
} from './tacticalWizardSimulationV17';

export * from './tacticalWizardSimulationV17';

export type RecoveryThreatSource = 'confirmed_visual' | 'incoming_sector' | 'contact_memory' | 'none';
export type RecoveryReplanReason =
  | 'new_recovery'
  | 'confirmed_threat_shift'
  | 'incoming_fire_shift'
  | 'security_lane_lost'
  | 'route_invalid'
  | 'treatment_invalid'
  | 'manual_refresh';

export interface DynamicRecoveryView {
  readonly active: boolean;
  readonly revision: number;
  readonly stagePoint: GridPoint | null;
  readonly treatmentPoint: GridPoint | null;
  readonly securityPoint: GridPoint | null;
  readonly threatAnchor: GridPoint | null;
  readonly threatSource: RecoveryThreatSource;
  readonly lastReplanTick: number | null;
  readonly lastReplanReason: RecoveryReplanReason | null;
  readonly rescuerStaged: boolean;
  readonly securityReady: boolean;
}

export interface AcousticAwarenessView {
  readonly hearingRadius: number;
  readonly visionRange: number;
  readonly playerWeaponRange: number;
  readonly aiSupportRange: number;
  readonly episodeId: number;
  readonly lastGunshotTick: number | null;
  readonly shotsInEpisode: number;
  readonly lastListenerIds: readonly string[];
}

export interface OperationalConsistencyView {
  readonly primaryCommitment: 'recovery' | 'direct_combat' | 'threat_response' | 'search' | 'regroup' | 'patrol';
  readonly alertSynchronized: boolean;
  readonly staleThreatClears: number;
  readonly travelReorientations: number;
}

export interface TacticalWizardSimulationState extends TacticalWizardSimulationStateV17 {
  readonly dynamicRecovery: DynamicRecoveryView;
  readonly acousticAwareness: AcousticAwarenessView;
  readonly operationalConsistency: OperationalConsistencyView;
}

interface HostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  facing: GridPoint;
  firePulse: number;
  fireBlockedByFriend: string | null;
  targetVisible: boolean;
  task: string;
  role: string;
  tacticalTarget: GridPoint | null;
  locomotionMode: string;
  backTurnPermitted: boolean;
  grenadeCount: number;
}

interface HostAccess {
  members: HostMember[];
  logicalTick: number;
  motionFrame: number;
  pendingNoiseIntensity: number;
  alertState: 'idle' | 'pending' | 'active';
  sharedLastKnownPosition: GridPoint | null;
  movementTarget: (member: HostMember) => GridPoint | null;
  buildStimuli: (member: HostMember, visible: boolean) => readonly unknown[];
  canSeePlayer: (member: HostMember) => boolean;
  tryFire: (member: HostMember, target: GridPoint, reason: string) => void;
  log: (
    category: RunLogCategory,
    actorId: string,
    actorLabel: string,
    event: RunLogEvent,
    summary: string,
    data: Readonly<Record<string, RunLogValue>>,
  ) => void;
  pushEvent: (message: string) => void;
  resolveLocomotionMode: (member: HostMember, movementDirection: GridPoint) => string;
}

interface RescuePlanAccess {
  downedAgentId: string;
  rescuerId: string;
  covererId: string | null;
  startedTick: number;
  coverReadyTick: number;
  approachTarget: GridPoint;
  phase: 'establish_cover' | 'approach' | 'treat';
  treatmentSeconds: number;
}

interface RecoveryInternals {
  rescuePlan: RescuePlanAccess | null;
  rescueSupportPlanKey: string | null;
  rescueSupportPosition: GridPoint | null;
  rescueSupportTarget: GridPoint | null;
  rescueCoverTarget: GridPoint | null;
  rescueSecurityLastReplanTick: number;
  prepareRescueSupport: (state: TacticalWizardSimulationStateV17) => void;
  rescueMovementTarget: (member: HostMember) => { readonly handled: boolean; readonly target: GridPoint | null };
  recoveryTaskFor: (agentId: string) => string;
}

interface ThreatInternals {
  threatPhase: 'none' | 'break_contact' | 'sector_search';
  threatLastHitTick: number | null;
  clearThreatResponse: () => void;
}

interface V9CombatInternals {
  vitals: Map<string, { health: number; readonly maxHealth: number; readonly moveSpeed: number }>;
  damageAgent: (agentId: string, amount: number, source: string) => void;
  playerShotTo: GridPoint | null;
}

interface DynamicRecoveryGeometry {
  readonly planIdentity: string;
  revision: number;
  stagePoint: GridPoint;
  treatmentPoint: GridPoint;
  securityPoint: GridPoint;
  threatAnchor: GridPoint | null;
  threatSource: RecoveryThreatSource;
  lastReplanTick: number;
  lastReplanReason: RecoveryReplanReason;
}

const V18_VISION_RANGE = 16;
const V18_HEARING_RADIUS = 28;
const V18_PLAYER_WEAPON_RANGE = 26;
const V18_BASE_PLAYER_WEAPON_RANGE = 22;
const V18_AI_SUPPORT_RANGE = 24;
const V18_PLAYER_DAMAGE = 28;
const V18_PLAYER_HIT_RADIUS = 0.58;
const RECOVERY_REPLAN_DISTANCE = 2.5;
const RECOVERY_REPLAN_ANGLE_DEGREES = 18;
const RECOVERY_REPLAN_COOLDOWN_TICKS = 3;
const RECOVERY_STAGE_MIN_CASUALTY_DISTANCE = 3.0;
const RECOVERY_STAGE_MAX_CASUALTY_DISTANCE = 5.2;
const RECOVERY_STAGE_ARRIVAL = 0.85;
const RECOVERY_TREATMENT_RADIUS = 2;
const RECOVERY_SECURITY_RADIUS = 6;
const RECOVERY_SECURITY_MIN_DISTANCE = 2.2;
const RECOVERY_SECURITY_MAX_DISTANCE = 5.5;
const RECOVERY_SECURITY_DESIRED_DISTANCE = 3.5;
const BACKPEDAL_MAX_FRAMES = 36;
const VISUAL_BACKPEDAL_MAX_FRAMES = 24;
const LONG_TRAVEL_DISTANCE = 4.2;
const STALE_THREAT_TICKS = 56;
const GUNSHOT_EPISODE_GAP_TICKS = 5;
const EXTENDED_FIRE_INTERVAL_TICKS = 4;

/**
 * V18 makes recovery geometry and movement orientation respond to battlefield
 * changes instead of treating the first rescue points as permanent anchors.
 *
 * Recovery planning remains Host-owned. It consumes only a live Host-confirmed
 * visual target, an already-coarsened incoming-fire sector, or contact memory.
 * Hidden live player coordinates are never used to replan a rescue.
 *
 * A recovery now owns three coupled spatial facts:
 * - stage: a safe point the rescuer may approach before final security is ready;
 * - treatment: the final casualty-access point;
 * - security: the coverer's threat-facing fire-support position.
 *
 * Those points are revalidated as a set when confirmed threat geometry changes,
 * a route becomes invalid, or the support lane is lost. V18 also caps prolonged
 * backpedal travel, extends sandbox vision/hearing, turns rifle shots into real
 * noise stimuli, and extends the player/AI test weapon envelope.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationV17 {
  private dynamicRecoveryGeometry: DynamicRecoveryGeometry | null = null;
  private recoveryRevisionCounter = 0;
  private lastDynamicRecoveryPlanIdentity: string | null = null;
  private backpedalFrames = new Map<string, number>();
  private travelReorientations = 0;
  private staleThreatClears = 0;
  private lastExtendedFireTick = new Map<string, number>();
  private lastExtendedFireDecisionTick = -1;
  private acousticEpisodeId = 0;
  private acousticLastShotTick: number | null = null;
  private acousticShotsInEpisode = 0;
  private acousticActiveUntilTick = -1;
  private acousticLastListeners = new Set<string>();

  constructor() {
    super();
    // V7's public readonly fields are inferred as literal types (10/12). Keep
    // the historical baseline untouched and retune only this reference Host
    // instance at runtime so V7-V17 regression expectations remain stable.
    Object.defineProperty(this, 'hearingRadius', { value: V18_HEARING_RADIUS, writable: false, configurable: true });
    Object.defineProperty(this, 'visionRange', { value: V18_VISION_RANGE, writable: false, configurable: true });
    this.installDynamicRecoveryHooks();
    this.installMovementReorientationHook();
    this.installAcousticStimulusHook();
    const host = this.v18Host();
    host.pushEvent('V18: dynamic rescue geometry, bounded backpedal, extended sensing and rifle-shot hearing enabled.');
    host.log('system', 'simulation', 'Volition Simulation', 'session', 'V18 dynamic recovery / reorientation / acoustic-awareness layer enabled.', {
      visionRange: V18_VISION_RANGE,
      hearingRadius: V18_HEARING_RADIUS,
      playerWeaponRange: V18_PLAYER_WEAPON_RANGE,
      aiSupportRange: V18_AI_SUPPORT_RANGE,
      recoveryGeometry: 'stage+treatment+security_replanned_as_one_contract',
      hiddenTargetPolicy: 'live_visual_or_coarse_sector_or_contact_memory_only',
    });
  }

  override reset(): TacticalWizardSimulationState {
    super.reset();
    this.dynamicRecoveryGeometry = null;
    this.recoveryRevisionCounter = 0;
    this.lastDynamicRecoveryPlanIdentity = null;
    this.backpedalFrames.clear();
    this.travelReorientations = 0;
    this.staleThreatClears = 0;
    this.lastExtendedFireTick.clear();
    this.lastExtendedFireDecisionTick = -1;
    this.acousticEpisodeId = 0;
    this.acousticLastShotTick = null;
    this.acousticShotsInEpisode = 0;
    this.acousticActiveUntilTick = -1;
    this.acousticLastListeners.clear();
    this.v18Host().pushEvent('V18: dynamic recovery / acoustic episode / movement-reorientation state reset.');
    return this.getState();
  }

  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    this.maintainDynamicRecovery(this.baseState(), false);
    super.advance(deltaSeconds);
    let state = this.baseState();
    this.maintainDynamicRecovery(state, false);
    this.expireStaleThreatResponse(state);
    this.synchronizeOperationalAlert(state);
    state = this.baseState();
    if (state.logicalTick !== this.lastExtendedFireDecisionTick) {
      this.lastExtendedFireDecisionTick = state.logicalTick;
      this.maintainExtendedRangeFire(state);
    }
    return this.getState();
  }

  override playerFireAt(point: GridPoint): boolean {
    const before = this.baseState();
    const result = super.playerFireAt(point);
    this.registerGunshotEpisode(before);
    this.resolveExtendedPlayerHit(before);
    const after = this.baseState();
    this.maintainDynamicRecovery(after, false);
    this.synchronizeOperationalAlert(after);
    return result;
  }

  override getState(): TacticalWizardSimulationState {
    const base = super.getState();
    const geometry = this.dynamicRecoveryGeometry;
    const rescuePlan = this.v18Recovery().rescuePlan;
    const rescuer = rescuePlan === null ? null : base.agents.find((agent) => agent.id === rescuePlan.rescuerId) ?? null;
    const coverer = rescuePlan?.covererId === null || rescuePlan === null ? null : base.agents.find((agent) => agent.id === rescuePlan.covererId) ?? null;
    const securityReady = geometry !== null
      && coverer !== null
      && distance(coverer.position, geometry.securityPoint) <= 0.95
      && (geometry.threatAnchor === null || hasLineOfSight(tacticalWizardNavigationGrid, toCell(coverer.position), toCell(geometry.threatAnchor)));
    const rescuerStaged = geometry !== null && rescuer !== null && distance(rescuer.position, geometry.stagePoint) <= RECOVERY_STAGE_ARRIVAL;
    const primaryCommitment = resolvePrimaryCommitment(base);
    const alertSynchronized = !(base.threatResponse.active && base.squad.alertState === 'idle');
    const awareness = base.threatResponse.active && base.threatAwareness.level === 'none'
      ? { ...base.threatAwareness, level: 'suspicious' as const }
      : base.threatAwareness;

    return {
      ...base,
      threatAwareness: awareness,
      dynamicRecovery: {
        active: geometry !== null && rescuePlan !== null,
        revision: geometry?.revision ?? 0,
        stagePoint: clonePoint(geometry?.stagePoint ?? null),
        treatmentPoint: clonePoint(geometry?.treatmentPoint ?? null),
        securityPoint: clonePoint(geometry?.securityPoint ?? null),
        threatAnchor: clonePoint(geometry?.threatAnchor ?? null),
        threatSource: geometry?.threatSource ?? 'none',
        lastReplanTick: geometry?.lastReplanTick ?? null,
        lastReplanReason: geometry?.lastReplanReason ?? null,
        rescuerStaged,
        securityReady,
      },
      acousticAwareness: {
        hearingRadius: V18_HEARING_RADIUS,
        visionRange: V18_VISION_RANGE,
        playerWeaponRange: V18_PLAYER_WEAPON_RANGE,
        aiSupportRange: V18_AI_SUPPORT_RANGE,
        episodeId: this.acousticEpisodeId,
        lastGunshotTick: this.acousticLastShotTick,
        shotsInEpisode: this.acousticShotsInEpisode,
        lastListenerIds: [...this.acousticLastListeners].sort(),
      },
      operationalConsistency: {
        primaryCommitment,
        alertSynchronized,
        staleThreatClears: this.staleThreatClears,
        travelReorientations: this.travelReorientations,
      },
    };
  }

  /** Deterministic editor/test hook: force the current recovery geometry to revalidate. */
  replanRecoveryForTest(): boolean {
    if (this.v18Recovery().rescuePlan === null) return false;
    this.maintainDynamicRecovery(this.baseState(), true, 'manual_refresh');
    return true;
  }

  private installDynamicRecoveryHooks(): void {
    const internals = this.v18Recovery();
    internals.prepareRescueSupport = (state: TacticalWizardSimulationStateV17): void => {
      this.maintainDynamicRecovery(state, false);
      this.applyDynamicRecoveryToHost(state);
    };

    const originalRescueMovementTarget = internals.rescueMovementTarget.bind(this);
    internals.rescueMovementTarget = (member: HostMember): { readonly handled: boolean; readonly target: GridPoint | null } => {
      const plan = internals.rescuePlan;
      const geometry = this.dynamicRecoveryGeometry;
      if (plan !== null && geometry !== null && member.id === plan.rescuerId && plan.phase === 'establish_cover') {
        const state = this.baseState();
        const rescuer = state.agents.find((agent) => agent.id === plan.rescuerId);
        if (rescuer !== undefined && rescuer.alive && distance(rescuer.position, geometry.stagePoint) > RECOVERY_STAGE_ARRIVAL) {
          return { handled: true, target: { ...geometry.stagePoint } };
        }
        return { handled: true, target: null };
      }
      return originalRescueMovementTarget(member);
    };

    const originalRecoveryTaskFor = internals.recoveryTaskFor.bind(this);
    internals.recoveryTaskFor = (agentId: string): string => {
      const plan = internals.rescuePlan;
      const geometry = this.dynamicRecoveryGeometry;
      if (plan !== null && geometry !== null && plan.phase === 'establish_cover' && plan.rescuerId === agentId) {
        const rescuer = this.baseState().agents.find((agent) => agent.id === agentId);
        if (rescuer !== undefined && distance(rescuer.position, geometry.stagePoint) > RECOVERY_STAGE_ARRIVAL) return 'rescue_move';
      }
      return originalRecoveryTaskFor(agentId);
    };
  }

  private installMovementReorientationHook(): void {
    const host = this.v18Host();
    const originalResolve = host.resolveLocomotionMode.bind(this);
    host.resolveLocomotionMode = (member: HostMember, movementDirection: GridPoint): string => {
      const original = originalResolve(member, movementDirection);
      if (original !== 'backpedal') {
        this.backpedalFrames.set(member.id, 0);
        return original;
      }

      const state = this.baseState();
      const previousFrames = (this.backpedalFrames.get(member.id) ?? 0) + 1;
      this.backpedalFrames.set(member.id, previousFrames);
      const agent = state.agents.find((entry) => entry.id === member.id);
      const hasVisual = agent?.targetVisible === true;
      const plan = this.v18Recovery().rescuePlan;
      const geometry = this.dynamicRecoveryGeometry;
      const dynamicTarget = plan !== null && geometry !== null && plan.rescuerId === member.id && plan.phase === 'establish_cover'
        ? geometry.stagePoint
        : member.tacticalTarget;
      const longTravel = dynamicTarget !== null && distance(member.position, dynamicTarget) > LONG_TRAVEL_DISTANCE;
      const travelTask = member.task === 'search_sector'
        || member.task === 'overwatch'
        || member.task === 'regroup'
        || plan?.rescuerId === member.id
        || plan?.covererId === member.id;
      const breakContact = state.threatResponse.active && state.threatResponse.phase === 'break_contact';
      const exceeded = previousFrames > (hasVisual ? VISUAL_BACKPEDAL_MAX_FRAMES : BACKPEDAL_MAX_FRAMES);
      const shouldReorient = (!hasVisual && longTravel && travelTask && !breakContact) || (exceeded && !breakContact);
      if (!shouldReorient) return original;

      this.backpedalFrames.set(member.id, 0);
      this.travelReorientations += 1;
      host.log('agent', member.id, member.label, 'move', `${member.label} reoriented into forward travel instead of prolonged backpedal.`, {
        task: member.task,
        previousBackpedalFrames: previousFrames,
        longTravel,
        target: dynamicTarget === null ? null : { ...dynamicTarget },
        reason: longTravel ? 'long_route_requires_travel_facing' : 'backpedal_time_budget_exhausted',
      });
      return 'forward';
    };
  }

  private installAcousticStimulusHook(): void {
    const host = this.v18Host();
    const originalBuildStimuli = host.buildStimuli.bind(this);
    host.buildStimuli = (member: HostMember, visible: boolean): readonly unknown[] => {
      const stimuli = originalBuildStimuli(member, visible);
      if (host.logicalTick > this.acousticActiveUntilTick) return stimuli;
      return stimuli.map((stimulus) => {
        if (!isNoiseStimulus(stimulus)) return stimulus;
        this.acousticLastListeners.add(member.id);
        return {
          ...stimulus,
          actionKind: 'rifle_shot',
          intensity: Math.max(0.95, typeof stimulus.intensity === 'number' ? stimulus.intensity : 0),
        };
      });
    };
  }

  private maintainDynamicRecovery(
    state: TacticalWizardSimulationStateV17,
    force: boolean,
    forcedReason: RecoveryReplanReason = 'manual_refresh',
  ): void {
    const internals = this.v18Recovery();
    const plan = internals.rescuePlan;
    if (plan === null || plan.covererId === null) {
      this.dynamicRecoveryGeometry = null;
      this.lastDynamicRecoveryPlanIdentity = null;
      return;
    }

    const casualty = state.agents.find((agent) => agent.id === plan.downedAgentId);
    const rescuer = state.agents.find((agent) => agent.id === plan.rescuerId);
    const coverer = state.agents.find((agent) => agent.id === plan.covererId);
    if (casualty === undefined || rescuer === undefined || coverer === undefined || !rescuer.alive || !coverer.alive) {
      this.dynamicRecoveryGeometry = null;
      return;
    }

    const threat = this.resolveRecoveryThreat(state);
    const planIdentity = `${plan.downedAgentId}:${plan.rescuerId}:${plan.covererId}:${plan.startedTick}`;
    const reason = force
      ? forcedReason
      : this.replanReason(state, planIdentity, casualty.position, rescuer.position, coverer.position, threat);
    if (reason === null) {
      this.applyDynamicRecoveryToHost(state);
      return;
    }
    if (!force && this.dynamicRecoveryGeometry !== null && state.logicalTick - this.dynamicRecoveryGeometry.lastReplanTick < RECOVERY_REPLAN_COOLDOWN_TICKS) {
      this.applyDynamicRecoveryToHost(state);
      return;
    }

    const occupied = state.agents.filter((agent) => agent.alive).map((agent) => agent.position);
    const treatmentPoint = selectTreatmentPoint(casualty.position, rescuer.position, threat.point, occupied);
    if (treatmentPoint === null) return;
    const stagePoint = selectStagePoint(rescuer.position, casualty.position, treatmentPoint, threat.point);
    const securityPoint = selectSecurityPoint(coverer.position, casualty.position, threat.point, occupied);
    if (stagePoint === null || securityPoint === null) return;

    this.recoveryRevisionCounter += 1;
    this.dynamicRecoveryGeometry = {
      planIdentity,
      revision: this.recoveryRevisionCounter,
      stagePoint,
      treatmentPoint,
      securityPoint,
      threatAnchor: clonePoint(threat.point),
      threatSource: threat.source,
      lastReplanTick: state.logicalTick,
      lastReplanReason: reason,
    };
    this.lastDynamicRecoveryPlanIdentity = planIdentity;
    plan.approachTarget = { ...treatmentPoint };
    if (reason !== 'new_recovery' && plan.phase !== 'establish_cover') {
      plan.phase = 'establish_cover';
      plan.treatmentSeconds = 0;
    }
    this.applyDynamicRecoveryToHost(state);

    const host = this.v18Host();
    host.pushEvent(`T${state.logicalTick}: recovery geometry replanned (${reason}) — stage / treatment / security updated together.`);
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Dynamic recovery geometry replanned as a coupled stage/treatment/security contract.', {
      revision: this.dynamicRecoveryGeometry.revision,
      reason,
      downedId: plan.downedAgentId,
      rescuerId: plan.rescuerId,
      covererId: plan.covererId,
      stagePoint: { ...stagePoint },
      treatmentPoint: { ...treatmentPoint },
      securityPoint: { ...securityPoint },
      threatAnchor: threat.point === null ? null : { ...threat.point },
      threatSource: threat.source,
    });
  }

  private replanReason(
    state: TacticalWizardSimulationStateV17,
    planIdentity: string,
    casualty: GridPoint,
    rescuer: GridPoint,
    coverer: GridPoint,
    threat: { readonly point: GridPoint | null; readonly source: RecoveryThreatSource },
  ): RecoveryReplanReason | null {
    const geometry = this.dynamicRecoveryGeometry;
    if (geometry === null || this.lastDynamicRecoveryPlanIdentity !== planIdentity) return 'new_recovery';
    if (!isWalkable(tacticalWizardNavigationGrid, toCell(geometry.treatmentPoint))) return 'treatment_invalid';
    if (findPath(tacticalWizardNavigationGrid, toCell(rescuer), toCell(geometry.treatmentPoint)).length === 0) return 'route_invalid';
    if (findPath(tacticalWizardNavigationGrid, toCell(coverer), toCell(geometry.securityPoint)).length === 0) return 'route_invalid';
    if (geometry.threatAnchor !== null && !hasLineOfSight(tacticalWizardNavigationGrid, toCell(geometry.securityPoint), toCell(geometry.threatAnchor))) return 'security_lane_lost';
    if (threat.point === null || geometry.threatAnchor === null) {
      return threat.point === null && geometry.threatAnchor === null ? null : threat.source === 'confirmed_visual' ? 'confirmed_threat_shift' : 'incoming_fire_shift';
    }

    const shift = distance(geometry.threatAnchor, threat.point);
    const previousDirection = normalize({ x: geometry.threatAnchor.x - casualty.x, y: geometry.threatAnchor.y - casualty.y });
    const nextDirection = normalize({ x: threat.point.x - casualty.x, y: threat.point.y - casualty.y });
    const angle = angleDegrees(previousDirection, nextDirection);
    if (shift >= RECOVERY_REPLAN_DISTANCE || angle >= RECOVERY_REPLAN_ANGLE_DEGREES) {
      return threat.source === 'confirmed_visual' ? 'confirmed_threat_shift' : 'incoming_fire_shift';
    }
    return null;
  }

  private applyDynamicRecoveryToHost(state: TacticalWizardSimulationStateV17): void {
    const geometry = this.dynamicRecoveryGeometry;
    const plan = this.v18Recovery().rescuePlan;
    if (geometry === null || plan === null || plan.covererId === null) return;
    const internals = this.v18Recovery();
    internals.rescueSupportPosition = { ...geometry.securityPoint };
    internals.rescueSupportTarget = clonePoint(geometry.threatAnchor);
    internals.rescueCoverTarget = { ...geometry.securityPoint };
    internals.rescueSupportPlanKey = `${geometry.planIdentity}:v18:${geometry.revision}:${gridKey(toCell(geometry.securityPoint))}`;
    internals.rescueSecurityLastReplanTick = state.logicalTick;
    plan.approachTarget = { ...geometry.treatmentPoint };

    const coverer = this.v18Host().members.find((member) => member.id === plan.covererId);
    if (coverer !== undefined) {
      coverer.tacticalTarget = { ...geometry.securityPoint };
      coverer.task = 'suppress';
      coverer.role = 'suppressor';
      if (geometry.threatAnchor !== null) {
        coverer.facing = normalize({
          x: geometry.threatAnchor.x - coverer.position.x,
          y: geometry.threatAnchor.y - coverer.position.y,
        });
      }
    }
  }

  private resolveRecoveryThreat(state: TacticalWizardSimulationStateV17): { readonly point: GridPoint | null; readonly source: RecoveryThreatSource } {
    const host = this.v18Host();
    const visible = host.members.some((member) => state.agents.some((agent) => agent.id === member.id && agent.alive) && host.canSeePlayer(member));
    if (visible) return { point: { ...state.player }, source: 'confirmed_visual' };
    if (state.threatResponse.active && state.threatResponse.estimatedSector !== null) {
      return { point: { ...state.threatResponse.estimatedSector }, source: 'incoming_sector' };
    }
    if (state.contactTrack.lastConfirmedPosition !== null && !state.contactTrack.lkpCleared) {
      return { point: { ...state.contactTrack.lastConfirmedPosition }, source: 'contact_memory' };
    }
    if (state.squad.sharedLastKnownPosition !== null) {
      return { point: { ...state.squad.sharedLastKnownPosition }, source: 'contact_memory' };
    }
    return { point: null, source: 'none' };
  }

  private registerGunshotEpisode(state: TacticalWizardSimulationStateV17): void {
    const host = this.v18Host();
    const tick = state.logicalTick;
    if (this.acousticLastShotTick === null || tick - this.acousticLastShotTick > GUNSHOT_EPISODE_GAP_TICKS) {
      this.acousticEpisodeId += 1;
      this.acousticShotsInEpisode = 0;
      this.acousticLastListeners.clear();
    }
    this.acousticLastShotTick = tick;
    this.acousticShotsInEpisode += 1;
    this.acousticActiveUntilTick = tick + 2;
    host.pendingNoiseIntensity = Math.max(host.pendingNoiseIntensity, 1);
    host.log('player', 'player', 'Player', 'player_noise', 'Player rifle shot emitted an acoustic stimulus.', {
      acousticEpisodeId: this.acousticEpisodeId,
      shotIndex: this.acousticShotsInEpisode,
      intensity: 1,
      hearingRadius: V18_HEARING_RADIUS,
      perceptionPolicy: 'noisy_perceived_position_not_exact_hidden_shooter',
    });
  }

  private resolveExtendedPlayerHit(before: TacticalWizardSimulationStateV17): void {
    const after = this.baseState();
    const parentAlreadyHit = after.agents.some((agent) => {
      const previous = before.agents.find((entry) => entry.id === agent.id);
      return previous !== undefined && agent.health < previous.health;
    });
    if (parentAlreadyHit) return;

    const origin = before.player;
    const direction = after.playerCombat.facing;
    const extendedEnd = clampWorld({
      x: origin.x + direction.x * V18_PLAYER_WEAPON_RANGE,
      y: origin.y + direction.y * V18_PLAYER_WEAPON_RANGE,
    });
    const candidates = after.agents
      .filter((agent) => agent.alive)
      .map((agent) => ({ agent, projection: dot({ x: agent.position.x - origin.x, y: agent.position.y - origin.y }, direction), miss: perpendicularDistance(agent.position, origin, direction) }))
      .filter(({ projection, miss }) => projection > V18_BASE_PLAYER_WEAPON_RANGE && projection <= V18_PLAYER_WEAPON_RANGE && miss <= V18_PLAYER_HIT_RADIUS)
      .filter(({ agent }) => hasLineOfSight(tacticalWizardNavigationGrid, toCell(origin), toCell(agent.position)))
      .sort((left, right) => left.projection - right.projection || left.miss - right.miss);
    const hit = candidates[0];
    if (hit === undefined) {
      this.v18Combat().playerShotTo = { ...extendedEnd };
      return;
    }

    this.v18Combat().damageAgent(hit.agent.id, V18_PLAYER_DAMAGE, 'player_rifle');
    this.v18Combat().playerShotTo = { ...hit.agent.position };
    const bearing = normalize({ x: origin.x - hit.agent.position.x, y: origin.y - hit.agent.position.y });
    if (!hit.agent.targetVisible) this.injectIncomingFireForTest(hit.agent.id, origin);
    this.injectThreatEvidenceForTest(hit.agent.id, 'hit', 0.98, bearing);
    this.v18Host().log('player', 'player', 'Player', 'fire', `V18 extended-range rifle hit ${hit.agent.label}.`, {
      from: { ...origin },
      to: { ...hit.agent.position },
      hitAgentId: hit.agent.id,
      damage: V18_PLAYER_DAMAGE,
      weaponRange: V18_PLAYER_WEAPON_RANGE,
      rangeBand: 'extended_22_to_26',
    });
  }

  private maintainExtendedRangeFire(state: TacticalWizardSimulationStateV17): void {
    const host = this.v18Host();
    const confirmed = host.members.filter((member) => host.canSeePlayer(member));
    if (confirmed.length === 0) return;
    const recovery = this.v18Recovery().rescuePlan;

    for (const member of host.members) {
      const agent = state.agents.find((entry) => entry.id === member.id);
      if (agent === undefined || !agent.alive || agent.ammoRounds < 3) continue;
      const range = distance(member.position, state.player);
      if (range <= 15 || range > V18_AI_SUPPORT_RANGE) continue;
      if (recovery !== null && member.id !== recovery.covererId) continue;
      if (agent.reactionState === 'stunned' || agent.reactionState === 'downed' || agent.reactionState === 'dodge' || agent.reactionState === 'smoke_retreat') continue;
      if (!hasLineOfSight(tacticalWizardNavigationGrid, toCell(member.position), toCell(state.player))) continue;
      const previous = this.lastExtendedFireTick.get(member.id) ?? -999;
      if (state.logicalTick - previous < EXTENDED_FIRE_INTERVAL_TICKS) continue;
      const beforePulse = member.firePulse;
      host.tryFire(member, state.player, 'V18 extended-range squad-confirmed support fire');
      if (member.firePulse > beforePulse) this.lastExtendedFireTick.set(member.id, state.logicalTick);
    }
  }

  private expireStaleThreatResponse(state: TacticalWizardSimulationStateV17): void {
    if (!state.threatResponse.active) return;
    const host = this.v18Host();
    if (host.members.some((member) => host.canSeePlayer(member))) return;
    const lastEvidence = state.threatAwareness.lastEvidenceTick ?? state.threatResponse.lastHitTick ?? state.threatResponse.startedTick;
    if (lastEvidence === null || state.logicalTick - lastEvidence <= STALE_THREAT_TICKS) return;
    this.v18Threat().clearThreatResponse();
    this.staleThreatClears += 1;
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'tactic', 'Stale threat-response ownership expired after the evidence horizon elapsed.', {
      lastEvidenceTick: lastEvidence,
      currentTick: state.logicalTick,
      staleAfterTicks: STALE_THREAT_TICKS,
    });
  }

  private synchronizeOperationalAlert(state: TacticalWizardSimulationStateV17): void {
    const host = this.v18Host();
    if (state.threatResponse.active && host.alertState === 'idle') host.alertState = 'active';
  }

  private baseState(): TacticalWizardSimulationStateV17 {
    return super.getState();
  }

  private v18Host(): HostAccess {
    return this as unknown as HostAccess;
  }

  private v18Recovery(): RecoveryInternals {
    return this as unknown as RecoveryInternals;
  }

  private v18Threat(): ThreatInternals {
    return this as unknown as ThreatInternals;
  }

  private v18Combat(): V9CombatInternals {
    return this as unknown as V9CombatInternals;
  }
}

export function shouldForceTravelFacing(input: {
  readonly locomotionMode: string;
  readonly hasVisual: boolean;
  readonly breakContact: boolean;
  readonly task: string;
  readonly targetDistance: number;
  readonly consecutiveBackpedalFrames: number;
}): boolean {
  if (input.locomotionMode !== 'backpedal' || input.breakContact) return false;
  const travelTask = input.task === 'search_sector' || input.task === 'overwatch' || input.task === 'regroup' || input.task === 'recovery';
  if (!input.hasVisual && travelTask && input.targetDistance > LONG_TRAVEL_DISTANCE) return true;
  return input.consecutiveBackpedalFrames > (input.hasVisual ? VISUAL_BACKPEDAL_MAX_FRAMES : BACKPEDAL_MAX_FRAMES);
}

function selectTreatmentPoint(
  casualty: GridPoint,
  rescuer: GridPoint,
  threat: GridPoint | null,
  occupied: readonly GridPoint[],
): GridPoint | null {
  const casualtyCell = toCell(casualty);
  const rescuerCell = toCell(rescuer);
  const candidates: Array<{ readonly point: GridPoint; readonly score: number }> = [];
  for (let y = casualtyCell.y - RECOVERY_TREATMENT_RADIUS; y <= casualtyCell.y + RECOVERY_TREATMENT_RADIUS; y += 1) {
    for (let x = casualtyCell.x - RECOVERY_TREATMENT_RADIUS; x <= casualtyCell.x + RECOVERY_TREATMENT_RADIUS; x += 1) {
      const point = { x, y };
      if (!inBounds(point) || !isWalkable(tacticalWizardNavigationGrid, point)) continue;
      const casualtyDistance = distance(point, casualty);
      if (casualtyDistance < 0.65 || casualtyDistance > 1.65) continue;
      if (occupied.some((entry) => distance(entry, point) < 0.72 && distance(entry, casualty) > 0.4)) continue;
      const path = findPath(tacticalWizardNavigationGrid, rescuerCell, point);
      if (path.length === 0) continue;
      const hiddenFromThreat = threat === null || !hasLineOfSight(tacticalWizardNavigationGrid, point, toCell(threat));
      const cover = blockedNeighbourCount(point);
      const score = (hiddenFromThreat ? 36 : 0) + cover * 8 - Math.max(0, path.length - 1) * 0.45;
      candidates.push({ point, score });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.point.y - right.point.y || left.point.x - right.point.x);
  return candidates[0]?.point ?? null;
}

function selectStagePoint(
  rescuer: GridPoint,
  casualty: GridPoint,
  treatment: GridPoint,
  threat: GridPoint | null,
): GridPoint | null {
  const path = findPath(tacticalWizardNavigationGrid, toCell(rescuer), toCell(treatment));
  if (path.length === 0) return null;
  const candidates = path.filter((point) => {
    const d = distance(point, casualty);
    return d >= RECOVERY_STAGE_MIN_CASUALTY_DISTANCE && d <= RECOVERY_STAGE_MAX_CASUALTY_DISTANCE;
  });
  if (candidates.length === 0) return path[Math.max(0, path.length - 2)] ?? toCell(rescuer);
  const ranked = candidates.map((point) => ({
    point,
    hidden: threat === null || !hasLineOfSight(tacticalWizardNavigationGrid, point, toCell(threat)),
    cover: blockedNeighbourCount(point),
    desiredPenalty: Math.abs(distance(point, casualty) - 4),
  }));
  ranked.sort((left, right) => Number(right.hidden) - Number(left.hidden) || right.cover - left.cover || left.desiredPenalty - right.desiredPenalty);
  return { ...ranked[0]!.point };
}

function selectSecurityPoint(
  coverer: GridPoint,
  casualty: GridPoint,
  threat: GridPoint | null,
  occupied: readonly GridPoint[],
): GridPoint | null {
  const center = toCell(casualty);
  const start = toCell(coverer);
  const candidates: Array<{ readonly point: GridPoint; readonly score: number }> = [];
  for (let y = center.y - RECOVERY_SECURITY_RADIUS; y <= center.y + RECOVERY_SECURITY_RADIUS; y += 1) {
    for (let x = center.x - RECOVERY_SECURITY_RADIUS; x <= center.x + RECOVERY_SECURITY_RADIUS; x += 1) {
      const point = { x, y };
      if (!inBounds(point) || !isWalkable(tacticalWizardNavigationGrid, point)) continue;
      const casualtyDistance = distance(point, casualty);
      if (casualtyDistance < RECOVERY_SECURITY_MIN_DISTANCE || casualtyDistance > RECOVERY_SECURITY_MAX_DISTANCE) continue;
      if (occupied.some((entry) => distance(entry, point) < 1.1 && distance(entry, coverer) > 0.5)) continue;
      if (threat !== null && !hasLineOfSight(tacticalWizardNavigationGrid, point, toCell(threat))) continue;
      const path = findPath(tacticalWizardNavigationGrid, start, point);
      if (path.length === 0) continue;
      const cover = blockedNeighbourCount(point);
      const desiredPenalty = Math.abs(casualtyDistance - RECOVERY_SECURITY_DESIRED_DISTANCE);
      const movementCost = Math.max(0, path.length - 1);
      const score = cover * 20 - desiredPenalty * 4 - movementCost * 0.75;
      candidates.push({ point, score });
    }
  }
  if (candidates.length === 0 && threat !== null) return selectSecurityPoint(coverer, casualty, null, occupied);
  candidates.sort((left, right) => right.score - left.score || left.point.y - right.point.y || left.point.x - right.point.x);
  return candidates[0]?.point ?? null;
}

function resolvePrimaryCommitment(state: TacticalWizardSimulationStateV17): OperationalConsistencyView['primaryCommitment'] {
  if (state.recovery.phase !== 'none') return 'recovery';
  if (state.agents.some((agent) => agent.alive && agent.targetVisible)) return 'direct_combat';
  if (state.threatResponse.active) return 'threat_response';
  if (state.squad.tactic === 'sweep') return 'search';
  if (state.squad.tactic === 'regroup') return 'regroup';
  return 'patrol';
}

function isNoiseStimulus(value: unknown): value is { readonly kind: 'noise'; readonly intensity?: number; readonly [key: string]: unknown } {
  return typeof value === 'object' && value !== null && (value as { readonly kind?: unknown }).kind === 'noise';
}

function perpendicularDistance(point: GridPoint, origin: GridPoint, direction: GridPoint): number {
  const relative = { x: point.x - origin.x, y: point.y - origin.y };
  const projection = dot(relative, direction);
  const nearest = { x: origin.x + direction.x * projection, y: origin.y + direction.y * projection };
  return distance(point, nearest);
}

function blockedNeighbourCount(point: GridPoint): number {
  const offsets = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  return offsets.reduce((count, offset) => {
    const next = { x: point.x + offset.x, y: point.y + offset.y };
    return count + (!inBounds(next) || !isWalkable(tacticalWizardNavigationGrid, next) ? 1 : 0);
  }, 0);
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

function clampWorld(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 0.01, point.x)),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 0.01, point.y)),
  };
}

function clonePoint(point: GridPoint | null): GridPoint | null {
  return point === null ? null : { ...point };
}

function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-9 ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
}

function angleDegrees(a: GridPoint, b: GridPoint): number {
  const value = Math.max(-1, Math.min(1, dot(a, b)));
  return Math.acos(value) * (180 / Math.PI);
}

function dot(a: GridPoint, b: GridPoint): number {
  return a.x * b.x + a.y * b.y;
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
