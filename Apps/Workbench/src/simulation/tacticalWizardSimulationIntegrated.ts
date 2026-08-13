import { findPath, hasLineOfSight, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from './tacticalWizardTestMapV7';
import {
  TacticalWizardSimulation as TacticalWizardSimulationV18,
  type TacticalWizardSimulationState as TacticalWizardSimulationStateV18,
} from './tacticalWizardSimulationV18';

export * from './tacticalWizardSimulationV18';

interface HostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  facing: GridPoint;
  targetVisible: boolean;
  task: string;
  role: string;
  tacticalTarget: GridPoint | null;
  locomotionMode: string;
}

interface HostAccess {
  members: HostMember[];
  logicalTick: number;
  motionFrame: number;
  buildStimuli: (member: HostMember, visible: boolean) => readonly unknown[];
  movementTarget: (member: HostMember) => GridPoint | null;
  resolveLocomotionMode: (member: HostMember, movementDirection: GridPoint) => string;
  log: (...args: any[]) => void;
}

interface WoundedSupportPlanAccess {
  readonly patientId: string;
  readonly buddyId: string;
  readonly securityId: string | null;
  readonly reason: 'critical_health' | 'wounded_isolation';
  readonly startedTick: number;
  rallyPoint: GridPoint;
  buddySupportPoint: GridPoint;
}

interface CohesionInternals {
  woundedPlan: WoundedSupportPlanAccess | null;
  maintainWoundedSupport: (state: TacticalWizardSimulationStateV18) => void;
}

interface RecoveryInternals {
  rescuePlan: {
    readonly downedAgentId: string;
    readonly rescuerId: string;
    readonly covererId: string | null;
  } | null;
}

interface ThreatInternals {
  threatPhase: 'none' | 'break_contact' | 'sector_search';
}

interface ReactionInternals {
  reactions: Map<string, { readonly kind: string; readonly untilTick: number }>;
  triggerDodge: (agentId: string, reason: string) => void;
}

interface AcousticPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
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

export interface WoundedSupportRetentionInput {
  readonly healthRatio: number;
  readonly buddyDistance: number;
  readonly logicalTick: number;
  readonly releaseCandidateSinceTick: number | null;
}

export interface WoundedSupportRetentionDecision {
  readonly retain: boolean;
  readonly releaseCandidateSinceTick: number | null;
}

const ACOUSTIC_EPISODE_GAP_TICKS = 5;
const EXTENDED_TRACE_BASE_RANGE = 22;
const PLAYER_WEAPON_RANGE = 26;
const EXTENDED_NEAR_MISS_STRONG = 0.9;
const EXTENDED_NEAR_MISS_WEAK = 2.1;
const EXTENDED_DODGE_RADIUS = 1.35;
const EXTENDED_IMPACT_AWARENESS = 3.8;
const WOUNDED_RATIO = 0.5;
const CRITICAL_RATIO = 0.25;
const COHESION_RELEASE_DISTANCE = 7.5;
const COHESION_RELEASE_SETTLE_TICKS = 4;
const COHESION_DESIRED_DISTANCE = 3.8;
const COHESION_SUPPORT_MAX_DISTANCE = 4.5;
const CRITICAL_AMMO_ROUNDS = 12;
const MOVEMENT_COMMIT_FRAMES = 12;
const MOVEMENT_SMALL_RETARGET_DISTANCE = 1.5;
const LOCOMOTION_HOLD_FRAMES = 5;
const FACING_MAX_DEGREES_PER_MOTION_FRAME = 16;
const STABLE_TRAVEL_TASKS = new Set(['hold_cover', 'search_sector', 'overwatch', 'regroup']);
const MOBILE_TACTICAL_TASKS = new Set(['bound_to_cover', 'flank_to_cover', 'crossfire', 'regroup', 'search_sector']);

/**
 * Integration/stability layer for the current Tactical Wizard example.
 *
 * This class deliberately adds no new tactic. It reconciles systems that were
 * introduced independently between V7 and V18 so they share stable evidence and
 * execution contracts:
 * - one rifle-shot episode keeps one coarse acoustic estimate per listener;
 * - the V18 22..26 range extension receives the same near-miss / impact semantics
 *   as the original V9 rifle trace instead of becoming hit-only space;
 * - wounded mutual support is a movement constraint rather than a permanent task
 *   owner, while critical casualties still retain the hard rally contract;
 * - low-level movement commitments never write back into planner tactical targets;
 * - non-urgent tactical travel gets a short movement/mode commitment budget;
 * - facing changes are rate-limited at the motion-frame boundary.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationV18 {
  private acousticEpisodeLastShotTick: number | null = null;
  private acousticEpisodeSerial = 0;
  private readonly acousticEstimateByListener = new Map<string, AcousticPoint>();
  private readonly movementCommitments = new Map<string, MovementCommitment>();
  private readonly locomotionCommitments = new Map<string, LocomotionCommitment>();
  private cohesionReleaseCandidateSinceTick: number | null = null;

  constructor() {
    super();
    this.installStableAcousticEvidence();
    this.installCohesionHysteresis();
    this.installMovementCommitments();
    this.installLocomotionHysteresis();
    this.integratedHost().log('system', 'simulation', 'Volition Simulation', 'session', 'Integrated combat-stability layer enabled.', {
      tacticsAdded: 0,
      acousticPolicy: 'stable_per_listener_estimate_within_gunshot_episode',
      movementPolicy: 'planner_target_preserved_with_short_execution_commitment',
      cohesionPolicy: 'wounded_support_constraint_critical_hard_rally',
      facingPolicy: 'rate_limited_motion_frame_output',
    });
  }

  override reset(): TacticalWizardSimulationStateV18 {
    super.reset();
    this.acousticEpisodeLastShotTick = null;
    this.acousticEpisodeSerial = 0;
    this.acousticEstimateByListener.clear();
    this.movementCommitments.clear();
    this.locomotionCommitments.clear();
    this.cohesionReleaseCandidateSinceTick = null;
    return this.getState();
  }

  override playerFireAt(point: GridPoint): boolean {
    const before = super.getState();
    this.beginAcousticEpisode(before.logicalTick);
    const result = super.playerFireAt(point);
    const after = super.getState();
    this.resolveExtendedShotEvidence(before, after);
    return result;
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationStateV18 {
    const host = this.integratedHost();
    const beforeFrame = host.motionFrame;
    const beforeFacing = new Map(host.members.map((member) => [member.id, { ...member.facing }]));
    super.advance(deltaSeconds);
    const motionFrames = Math.max(0, host.motionFrame - beforeFrame);
    if (motionFrames > 0) {
      const maxTurn = FACING_MAX_DEGREES_PER_MOTION_FRAME * motionFrames;
      for (const member of host.members) {
        const previous = beforeFacing.get(member.id);
        if (previous === undefined) continue;
        member.facing = rotateToward(previous, member.facing, maxTurn);
      }
    }
    return this.getState();
  }

  private installStableAcousticEvidence(): void {
    const host = this.integratedHost();
    const originalBuildStimuli = host.buildStimuli.bind(this);
    host.buildStimuli = (member: HostMember, visible: boolean): readonly unknown[] => {
      const stimuli = originalBuildStimuli(member, visible);
      return stimuli.map((stimulus) => {
        if (!isRifleShotNoise(stimulus)) return stimulus;
        const perceived = asAcousticPoint(stimulus.perceivedPosition);
        if (perceived === null) return stimulus;
        let stable = this.acousticEstimateByListener.get(member.id);
        if (stable === undefined) {
          stable = perceived;
          this.acousticEstimateByListener.set(member.id, stable);
        }
        return { ...stimulus, perceivedPosition: { ...stable } };
      });
    };
  }

  private installCohesionHysteresis(): void {
    const internals = this.cohesionInternals();
    const host = this.integratedHost();
    const originalMaintain = internals.maintainWoundedSupport.bind(this);
    internals.maintainWoundedSupport = (state: TacticalWizardSimulationStateV18): void => {
      const plan = internals.woundedPlan;
      if (plan === null) {
        this.cohesionReleaseCandidateSinceTick = null;
        const executionBefore = new Map(host.members.map((member) => [member.id, {
          task: member.task,
          role: member.role,
          tacticalTarget: clonePoint(member.tacticalTarget),
        }]));
        originalMaintain(state);
        const created = internals.woundedPlan;
        if (created === null) return;
        const patient = state.agents.find((agent) => agent.id === created.patientId);
        const patientMember = host.members.find((member) => member.id === created.patientId);
        const previousExecution = executionBefore.get(created.patientId);
        const healthRatio = patient === undefined || patient.maxHealth <= 0 ? 0 : patient.health / patient.maxHealth;
        if (patientMember !== undefined && previousExecution !== undefined && healthRatio > CRITICAL_RATIO) {
          patientMember.task = previousExecution.task;
          patientMember.role = previousExecution.role;
          patientMember.tacticalTarget = clonePoint(previousExecution.tacticalTarget);
        }
        return;
      }

      const patient = state.agents.find((agent) => agent.id === plan.patientId);
      const buddy = state.agents.find((agent) => agent.id === plan.buddyId);
      if (patient === undefined || buddy === undefined || !patient.alive || !buddy.alive) {
        this.cohesionReleaseCandidateSinceTick = null;
        originalMaintain(state);
        return;
      }

      const healthRatio = patient.maxHealth <= 0 ? 0 : patient.health / patient.maxHealth;
      if (healthRatio <= CRITICAL_RATIO) {
        this.cohesionReleaseCandidateSinceTick = null;
        originalMaintain(state);
        return;
      }

      const decision = shouldRetainWoundedSupport({
        healthRatio,
        buddyDistance: distance(patient.position, buddy.position),
        logicalTick: state.logicalTick,
        releaseCandidateSinceTick: this.cohesionReleaseCandidateSinceTick,
      });
      this.cohesionReleaseCandidateSinceTick = decision.releaseCandidateSinceTick;
      if (decision.retain) {
        plan.buddySupportPoint = selectCohesionSupportWaypoint(patient.position, buddy.position);
        return;
      }

      this.cohesionReleaseCandidateSinceTick = null;
      originalMaintain(state);
    };
  }

  private installMovementCommitments(): void {
    const host = this.integratedHost();
    const originalMovementTarget = host.movementTarget.bind(this);
    host.movementTarget = (member: HostMember): GridPoint | null => {
      const plannerTarget = clonePoint(member.tacticalTarget);
      const originalProposal = originalMovementTarget(member);
      const cohesionProposal = this.resolveCohesionMovementProposal(member, originalProposal, plannerTarget);
      const proposed = this.recoverMobilePlannerTarget(member, cohesionProposal, plannerTarget);

      if (!STABLE_TRAVEL_TASKS.has(member.task) || member.targetVisible || this.hasUrgentMovementOwner(member.id)) {
        return this.acceptMovementTarget(member, proposed);
      }

      const prior = this.movementCommitments.get(member.id);
      if (proposed === null) {
        if (prior !== undefined
          && prior.task === member.task
          && host.motionFrame < prior.untilFrame
          && distance(member.position, prior.target) > 0.8) {
          return { ...prior.target };
        }
        this.movementCommitments.delete(member.id);
        return null;
      }

      if (prior === undefined || prior.task !== member.task) return this.acceptMovementTarget(member, proposed);
      if (distance(prior.target, proposed) <= MOVEMENT_SMALL_RETARGET_DISTANCE) return this.acceptMovementTarget(member, proposed);
      if (host.motionFrame >= prior.untilFrame) return this.acceptMovementTarget(member, proposed);

      return { ...prior.target };
    };
  }

  private installLocomotionHysteresis(): void {
    const host = this.integratedHost();
    const originalResolve = host.resolveLocomotionMode.bind(this);
    host.resolveLocomotionMode = (member: HostMember, movementDirection: GridPoint): string => {
      const proposed = originalResolve(member, movementDirection);
      if (proposed === 'free' || proposed === 'covered_dash' || proposed === 'forward' || this.hasUrgentMovementOwner(member.id)) {
        this.locomotionCommitments.set(member.id, { mode: proposed, untilFrame: host.motionFrame + LOCOMOTION_HOLD_FRAMES });
        return proposed;
      }
      const prior = this.locomotionCommitments.get(member.id);
      if (prior !== undefined && prior.mode !== proposed && host.motionFrame < prior.untilFrame) return prior.mode;
      this.locomotionCommitments.set(member.id, { mode: proposed, untilFrame: host.motionFrame + LOCOMOTION_HOLD_FRAMES });
      return proposed;
    };
  }

  private beginAcousticEpisode(tick: number): void {
    if (this.acousticEpisodeLastShotTick === null || tick - this.acousticEpisodeLastShotTick > ACOUSTIC_EPISODE_GAP_TICKS) {
      this.acousticEpisodeSerial += 1;
      this.acousticEstimateByListener.clear();
    }
    this.acousticEpisodeLastShotTick = tick;
  }

  private resolveExtendedShotEvidence(before: TacticalWizardSimulationStateV18, after: TacticalWizardSimulationStateV18): void {
    const origin = before.player;
    const direction = normalize(after.playerCombat.facing);
    const extendedEnd = clampWorld({
      x: origin.x + direction.x * PLAYER_WEAPON_RANGE,
      y: origin.y + direction.y * PLAYER_WEAPON_RANGE,
    });
    const healthBefore = new Map(before.agents.map((agent) => [agent.id, agent.health]));
    const candidates = after.agents
      .filter((agent) => agent.alive && agent.health >= (healthBefore.get(agent.id) ?? agent.health))
      .map((agent) => ({
        agent,
        projection: dot({ x: agent.position.x - origin.x, y: agent.position.y - origin.y }, direction),
        miss: perpendicularDistance(agent.position, origin, direction),
        impactDistance: distance(agent.position, extendedEnd),
      }))
      .filter(({ projection }) => projection > EXTENDED_TRACE_BASE_RANGE && projection <= PLAYER_WEAPON_RANGE)
      .filter(({ agent }) => hasLineOfSight(tacticalWizardNavigationGrid, toCell(origin), toCell(agent.position)))
      .filter(({ miss, impactDistance }) => miss <= EXTENDED_NEAR_MISS_WEAK || impactDistance <= EXTENDED_IMPACT_AWARENESS)
      .sort((left, right) => left.miss - right.miss || left.projection - right.projection || left.agent.id.localeCompare(right.agent.id, 'en'));

    const candidate = candidates[0];
    if (candidate === undefined) return;
    const bearing = normalize({ x: origin.x - candidate.agent.position.x, y: origin.y - candidate.agent.position.y });
    if (candidate.miss <= EXTENDED_NEAR_MISS_WEAK) {
      const weight = candidate.miss <= EXTENDED_NEAR_MISS_STRONG ? 0.52 : 0.34;
      this.injectThreatEvidenceForTest(candidate.agent.id, 'near_miss', weight, bearing);
      if (candidate.miss <= EXTENDED_DODGE_RADIUS) this.reactionInternals().triggerDodge(candidate.agent.id, 'player_near_miss_extended');
      this.integratedHost().log('agent', candidate.agent.id, candidate.agent.label, 'perception', 'Extended rifle trace produced near-miss evidence using the same semantics as the base weapon trace.', {
        rangeBand: '22_to_26',
        missDistance: Number(candidate.miss.toFixed(3)),
        evidence: 'near_miss',
      });
      return;
    }

    this.injectThreatEvidenceForTest(candidate.agent.id, 'bullet_impact', 0.2, bearing);
    this.integratedHost().log('agent', candidate.agent.id, candidate.agent.label, 'perception', 'Extended rifle trace produced bullet-impact evidence using the same semantics as the base weapon trace.', {
      rangeBand: '22_to_26',
      impactDistance: Number(candidate.impactDistance.toFixed(3)),
      evidence: 'bullet_impact',
    });
  }

  private resolveCohesionMovementProposal(member: HostMember, proposed: GridPoint | null, plannerTarget: GridPoint | null): GridPoint | null {
    const plan = this.cohesionInternals().woundedPlan;
    if (plan === null) return proposed;
    const state = super.getState();
    const patient = state.agents.find((agent) => agent.id === plan.patientId);
    const buddy = state.agents.find((agent) => agent.id === plan.buddyId);
    if (patient === undefined || buddy === undefined || !patient.alive || !buddy.alive) return proposed;

    if (member.id === plan.patientId) {
      const healthRatio = patient.maxHealth <= 0 ? 0 : patient.health / patient.maxHealth;
      if (healthRatio <= CRITICAL_RATIO) return proposed;
      return plannerTarget ?? proposed;
    }

    if (member.id === plan.buddyId) {
      const buddyAgent = state.agents.find((agent) => agent.id === member.id);
      const criticalResupply = buddyAgent !== undefined
        && buddyAgent.logisticsTask !== 'none'
        && buddyAgent.ammoRounds <= CRITICAL_AMMO_ROUNDS;
      if (criticalResupply) return proposed;

      const buddyTooFar = distance(buddy.position, patient.position) > COHESION_SUPPORT_MAX_DISTANCE;
      const plannerWouldBreakSupport = plannerTarget !== null && distance(plannerTarget, patient.position) > COHESION_RELEASE_DISTANCE;
      if (buddyTooFar || plannerWouldBreakSupport) {
        const supportPoint = selectCohesionSupportWaypoint(patient.position, buddy.position);
        plan.buddySupportPoint = { ...supportPoint };
        return supportPoint;
      }
      return plannerTarget ?? proposed;
    }

    return proposed;
  }

  private recoverMobilePlannerTarget(member: HostMember, proposed: GridPoint | null, plannerTarget: GridPoint | null): GridPoint | null {
    if (proposed !== null) return proposed;
    if (plannerTarget === null) return null;
    if (!MOBILE_TACTICAL_TASKS.has(member.task)) return null;
    if (this.hasUrgentMovementOwner(member.id)) return null;
    if (distance(member.position, plannerTarget) <= 0.8) return null;
    return { ...plannerTarget };
  }

  private acceptMovementTarget(member: HostMember, target: GridPoint | null): GridPoint | null {
    if (target === null) {
      this.movementCommitments.delete(member.id);
      return null;
    }
    const committed = { task: member.task, target: { ...target }, untilFrame: this.integratedHost().motionFrame + MOVEMENT_COMMIT_FRAMES };
    this.movementCommitments.set(member.id, committed);
    return { ...target };
  }

  private hasUrgentMovementOwner(agentId: string): boolean {
    const host = this.integratedHost();
    const reaction = this.reactionInternals().reactions.get(agentId);
    if (reaction !== undefined && reaction.kind !== 'none' && reaction.untilTick > host.logicalTick) return true;
    const recovery = this.recoveryInternals().rescuePlan;
    if (recovery !== null && (recovery.downedAgentId === agentId || recovery.rescuerId === agentId || recovery.covererId === agentId)) return true;
    return this.threatInternals().threatPhase === 'break_contact';
  }

  private integratedHost(): HostAccess { return this as unknown as HostAccess; }
  private cohesionInternals(): CohesionInternals { return this as unknown as CohesionInternals; }
  private recoveryInternals(): RecoveryInternals { return this as unknown as RecoveryInternals; }
  private threatInternals(): ThreatInternals { return this as unknown as ThreatInternals; }
  private reactionInternals(): ReactionInternals { return this as unknown as ReactionInternals; }
}

export function shouldRetainWoundedSupport(input: WoundedSupportRetentionInput): WoundedSupportRetentionDecision {
  if (input.healthRatio > WOUNDED_RATIO) return { retain: false, releaseCandidateSinceTick: null };
  if (input.healthRatio <= CRITICAL_RATIO) return { retain: true, releaseCandidateSinceTick: null };
  if (input.buddyDistance > COHESION_RELEASE_DISTANCE) return { retain: true, releaseCandidateSinceTick: null };
  const since = input.releaseCandidateSinceTick ?? input.logicalTick;
  if (input.logicalTick - since < COHESION_RELEASE_SETTLE_TICKS) return { retain: true, releaseCandidateSinceTick: since };
  return { retain: false, releaseCandidateSinceTick: since };
}

function selectCohesionSupportWaypoint(patient: GridPoint, buddy: GridPoint): GridPoint {
  const start = toCell(buddy);
  const goal = toCell(patient);
  const path = findPath(tacticalWizardNavigationGrid, start, goal);
  if (path.length === 0) return goal;
  const candidates = path.filter((point) => {
    const patientDistance = distance(point, patient);
    return patientDistance >= 1.8 && patientDistance <= COHESION_SUPPORT_MAX_DISTANCE;
  });
  if (candidates.length === 0) return path[Math.max(0, path.length - 2)] ?? goal;
  candidates.sort((left, right) => Math.abs(distance(left, patient) - COHESION_DESIRED_DISTANCE) - Math.abs(distance(right, patient) - COHESION_DESIRED_DISTANCE));
  return { ...candidates[0]! };
}

function isRifleShotNoise(value: unknown): value is { readonly kind: 'noise'; readonly actionKind: 'rifle_shot'; readonly perceivedPosition?: unknown; readonly [key: string]: unknown } {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { readonly kind?: unknown; readonly actionKind?: unknown };
  return candidate.kind === 'noise' && candidate.actionKind === 'rifle_shot';
}

function asAcousticPoint(value: unknown): AcousticPoint | null {
  if (typeof value !== 'object' || value === null) return null;
  const point = value as { readonly x?: unknown; readonly y?: unknown; readonly z?: unknown };
  return typeof point.x === 'number' && typeof point.y === 'number' && typeof point.z === 'number'
    ? { x: point.x, y: point.y, z: point.z }
    : null;
}

function rotateToward(from: GridPoint, to: GridPoint, maxDegrees: number): GridPoint {
  const a = normalize(from);
  const b = normalize(to);
  const start = Math.atan2(a.y, a.x);
  const end = Math.atan2(b.y, b.x);
  let delta = end - start;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const maxRadians = Math.max(0, maxDegrees) * Math.PI / 180;
  const clamped = Math.max(-maxRadians, Math.min(maxRadians, delta));
  return { x: Math.cos(start + clamped), y: Math.sin(start + clamped) };
}

function perpendicularDistance(point: GridPoint, origin: GridPoint, direction: GridPoint): number {
  const relative = { x: point.x - origin.x, y: point.y - origin.y };
  const projection = dot(relative, direction);
  const nearest = { x: origin.x + direction.x * projection, y: origin.y + direction.y * projection };
  return distance(point, nearest);
}

function toCell(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))),
  };
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

function dot(a: GridPoint, b: GridPoint): number { return a.x * b.x + a.y * b.y; }
function distance(a: GridPoint, b: GridPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
