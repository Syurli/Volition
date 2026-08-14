import { findPath, hasLineOfSight, isWalkable, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from './tacticalWizardTestMapV7';
import {
  TacticalWizardSimulation as TacticalWizardSimulationExecutionIntegrated,
  type TacticalWizardSimulationState as TacticalWizardSimulationStateExecutionIntegrated,
} from './tacticalWizardSimulationExecutionIntegrated';

export * from './tacticalWizardSimulationExecutionIntegrated';

export interface TacticalWizardSimulationState extends TacticalWizardSimulationStateExecutionIntegrated {
  readonly perceptionIntegration: {
    readonly visionRange: number;
    readonly closeAttentionRange: number;
    readonly acousticInvestigationActive: boolean;
    readonly acousticInvestigationTarget: GridPoint | null;
    readonly acousticEpisodeId: number | null;
    readonly acousticShots: number;
    readonly responderIds: readonly string[];
    readonly searchRedirects: number;
    readonly fastSearchTransitions: number;
  };
}

interface HostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  facing: GridPoint;
  targetVisible: boolean;
  selectedIntent: string;
  task: string;
  role: string;
  tacticalTarget: GridPoint | null;
  searchWaypoints: readonly GridPoint[];
  searchIndex: number;
  searchScanIndex: number;
  searchHoldFrames: number;
  searchComplete: boolean;
  searchLookTarget: GridPoint | null;
  buddyRole: string;
}

interface RescuePlanAccess {
  readonly rescuerId: string;
  readonly covererId: string | null;
}

interface PerceptionInternals {
  members: HostMember[];
  logicalTick: number;
  motionFrame: number;
  player: GridPoint;
  alertState: 'idle' | 'pending' | 'active';
  tactic: string;
  lostContactTicks: number;
  sharedLastKnownPosition: GridPoint | null;
  searchLeadId: string | null;
  searchCoverId: string | null;
  searchOverwatchId: string | null;
  visionRange: number;
  visionFovDegrees: number;
  movementTarget: (member: HostMember) => GridPoint | null;
  canSeePlayer: (member: HostMember) => boolean;
  buildStimuli: (member: HostMember, visible: boolean) => readonly unknown[];
  updatePostureAndFacing: (member: HostMember) => void;
  transitionTactic: (next: string, reason: string, rotateRoles: boolean) => void;
  rescuePlan: RescuePlanAccess | null;
  vitals: Map<string, { health: number }>;
  acousticEpisodeId: number;
  acousticShotsInEpisode: number;
  acousticLastShotTick: number | null;
  log: (...args: any[]) => void;
  pushEvent: (message: string) => void;
}

interface AcousticInvestigation {
  episodeId: number;
  target: GridPoint;
  firstShotTick: number;
  lastShotTick: number;
  shots: number;
  expiresTick: number;
  lastSampleTick: number;
  listeners: Set<string>;
  observationTargets: Map<string, GridPoint>;
}

const INTEGRATED_VISION_RANGE = 20;
const CLOSE_ATTENTION_RANGE = 12;
const VERY_CLOSE_ATTENTION_RANGE = 8;
const CLOSE_ATTENTION_HALF_FOV = 85;
const VERY_CLOSE_ATTENTION_HALF_FOV = 105;
const SINGLE_SHOT_INVESTIGATION_TICKS = 16;
const REPEATED_SHOT_INVESTIGATION_TICKS = 28;
const FAST_SEARCH_LOST_TICKS = 3;
const FAST_SEARCH_MAX_DISTANCE = 20;
const INVESTIGATION_ARRIVAL = 1.1;
const SEARCH_REDIRECT_COOLDOWN_TICKS = 1;
const ATTENTION_SCAN_FRAME_STRIDE = 7;
const ATTENTION_SCAN_OFFSETS = [-42, -18, 0, 28, 48, 0] as const;

/**
 * Perception/execution integration for the Tactical Wizard reference.
 *
 * This layer intentionally adds no new squad tactic. It connects already-present
 * hearing, lost-contact search and Host LOS into observable behavior:
 * - rifle-shot hearing owns a bounded investigation movement contract instead of
 *   leaving cognition on `investigate` while locomotion continues `patrol`;
 * - repeated shots pull a second listener into the investigation;
 * - visual range is extended to 20, while close active-search attention widens
 *   only at short range and still requires real world LOS;
 * - searching / investigating agents visibly scan while moving;
 * - fresh gunshots during sweep reorder search observation points without
 *   overwriting the exact last-confirmed position;
 * - close lost contact enters the existing sweep contract after 0.75 s rather
 *   than waiting for the previous 1.5 s threshold.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationExecutionIntegrated {
  private acousticInvestigation: AcousticInvestigation | null = null;
  private lastSearchRedirectShotTick = -999;
  private searchRedirects = 0;
  private fastSearchTransitions = 0;

  constructor() {
    super();
    Object.defineProperty(this, 'visionRange', {
      value: INTEGRATED_VISION_RANGE,
      writable: false,
      configurable: true,
    });
    this.installAcousticEvidenceCapture();
    this.installInvestigationMovementAuthority();
    this.installActiveAttentionVision();
    this.installMovingAttentionScan();
    this.perceptionInternals().log('system', 'simulation', 'Volition Simulation', 'session', 'Acoustic investigation / active-search perception integration enabled.', {
      tacticsAdded: 0,
      visionRange: INTEGRATED_VISION_RANGE,
      closeAttentionRange: CLOSE_ATTENTION_RANGE,
      hearingPolicy: 'gunshot_evidence_can_own_bounded_investigation_movement',
      searchPolicy: 'fresh_acoustic_evidence_reorders_observation_frontier_without_replacing_lkp',
      lostContactPolicy: 'close_contact_enters_existing_sweep_after_three_decision_ticks',
    });
  }

  override reset(): TacticalWizardSimulationState {
    super.reset();
    this.acousticInvestigation = null;
    this.lastSearchRedirectShotTick = -999;
    this.searchRedirects = 0;
    this.fastSearchTransitions = 0;
    return this.getState();
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    super.advance(deltaSeconds);
    let state = super.getState();
    this.expireInvestigation(state.logicalTick);
    this.maybeAccelerateLostContactSearch(state);
    state = super.getState();
    this.applyAcousticSearchBias(state);
    return this.getState();
  }

  override getState(): TacticalWizardSimulationState {
    const base = super.getState();
    const active = this.activeInvestigation(base.logicalTick);
    return {
      ...base,
      acousticAwareness: {
        ...base.acousticAwareness,
        visionRange: INTEGRATED_VISION_RANGE,
      },
      perceptionIntegration: {
        visionRange: INTEGRATED_VISION_RANGE,
        closeAttentionRange: CLOSE_ATTENTION_RANGE,
        acousticInvestigationActive: active !== null,
        acousticInvestigationTarget: active === null ? null : { ...active.target },
        acousticEpisodeId: active?.episodeId ?? null,
        acousticShots: active?.shots ?? 0,
        responderIds: active === null ? [] : this.investigationResponders(active),
        searchRedirects: this.searchRedirects,
        fastSearchTransitions: this.fastSearchTransitions,
      },
    };
  }

  private installAcousticEvidenceCapture(): void {
    const runtime = this.perceptionInternals();
    const originalBuildStimuli = runtime.buildStimuli.bind(this);
    runtime.buildStimuli = (member: HostMember, visible: boolean): readonly unknown[] => {
      const stimuli = originalBuildStimuli(member, visible);
      for (const stimulus of stimuli) {
        const point = rifleShotPerceivedPoint(stimulus);
        if (point === null) continue;
        this.registerAcousticSample(member.id, point);
      }
      return stimuli;
    };
  }

  private installInvestigationMovementAuthority(): void {
    const runtime = this.perceptionInternals();
    const originalMovementTarget = runtime.movementTarget.bind(this);
    runtime.movementTarget = (member: HostMember): GridPoint | null => {
      const original = originalMovementTarget(member);
      const contract = this.activeInvestigation(runtime.logicalTick);
      if (contract === null || runtime.alertState === 'active' || runtime.rescuePlan !== null) return original;
      if (!this.investigationResponders(contract).includes(member.id)) return original;
      if (!this.memberAlive(member.id)) return original;

      let observation = contract.observationTargets.get(member.id);
      if (observation === undefined) {
        const lane = this.investigationResponders(contract).indexOf(member.id);
        observation = selectAcousticObservationPoint(member.position, contract.target, lane, new Set());
        contract.observationTargets.set(member.id, observation);
      }
      return distance(member.position, observation) <= INVESTIGATION_ARRIVAL ? null : { ...observation };
    };
  }

  private installActiveAttentionVision(): void {
    const runtime = this.perceptionInternals();
    const originalCanSeePlayer = runtime.canSeePlayer.bind(this);
    runtime.canSeePlayer = (member: HostMember): boolean => {
      if (originalCanSeePlayer(member)) return true;
      if (!this.shouldUseActiveAttention(member)) return false;
      const range = distance(member.position, runtime.player);
      const halfFov = activeAttentionHalfFov(range);
      if (halfFov === null) return false;
      if (!hasLineOfSight(tacticalWizardNavigationGrid, toCell(member.position), toCell(runtime.player))) return false;
      const direction = normalize({ x: runtime.player.x - member.position.x, y: runtime.player.y - member.position.y });
      return angleDegrees(normalize(member.facing), direction) <= halfFov;
    };
  }

  private installMovingAttentionScan(): void {
    const runtime = this.perceptionInternals();
    const originalUpdate = runtime.updatePostureAndFacing.bind(this);
    runtime.updatePostureAndFacing = (member: HostMember): void => {
      originalUpdate(member);
      if (member.targetVisible || !this.shouldUseActiveAttention(member) || this.recoveryOwnsMember(member.id)) return;
      const anchor = this.attentionAnchor(member);
      if (anchor === null || distance(member.position, anchor) < 0.2) return;
      const memberIndex = Math.max(0, runtime.members.findIndex((candidate) => candidate.id === member.id));
      const phase = (Math.floor(runtime.motionFrame / ATTENTION_SCAN_FRAME_STRIDE) + memberIndex * 2) % ATTENTION_SCAN_OFFSETS.length;
      const offset = ATTENTION_SCAN_OFFSETS[phase] ?? 0;
      const base = normalize({ x: anchor.x - member.position.x, y: anchor.y - member.position.y });
      member.facing = rotate(base, offset);
      if (runtime.tactic === 'sweep' || this.activeInvestigation(runtime.logicalTick) !== null) {
        member.searchLookTarget = {
          x: member.position.x + member.facing.x * 6,
          y: member.position.y + member.facing.y * 6,
        };
      }
    };
  }

  private registerAcousticSample(listenerId: string, perceivedPoint: GridPoint): void {
    const runtime = this.perceptionInternals();
    const episodeId = runtime.acousticEpisodeId;
    const shotTick = runtime.acousticLastShotTick ?? runtime.logicalTick;
    const shots = Math.max(1, runtime.acousticShotsInEpisode);
    const coarse = coarsenAcousticPoint(perceivedPoint);
    const expiry = runtime.logicalTick + (shots >= 2 ? REPEATED_SHOT_INVESTIGATION_TICKS : SINGLE_SHOT_INVESTIGATION_TICKS);

    if (this.acousticInvestigation === null || this.acousticInvestigation.episodeId !== episodeId) {
      this.acousticInvestigation = {
        episodeId,
        target: coarse,
        firstShotTick: shotTick,
        lastShotTick: shotTick,
        shots,
        expiresTick: expiry,
        lastSampleTick: runtime.logicalTick,
        listeners: new Set([listenerId]),
        observationTargets: new Map(),
      };
      runtime.pushEvent(`T${runtime.logicalTick}: rifle report created a bounded acoustic investigation sector.`);
      runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'perception', 'Rifle-shot hearing created an executable investigation sector instead of leaving locomotion on patrol.', {
        episodeId,
        shots,
        coarseTarget: { ...coarse },
        listenerId,
      });
      return;
    }

    const contract = this.acousticInvestigation;
    contract.listeners.add(listenerId);
    contract.shots = Math.max(contract.shots, shots);
    contract.expiresTick = Math.max(contract.expiresTick, expiry);
    if (contract.lastSampleTick === runtime.logicalTick) return;

    contract.lastSampleTick = runtime.logicalTick;
    contract.lastShotTick = shotTick;
    contract.target = coarsenAcousticPoint({
      x: contract.target.x * 0.35 + coarse.x * 0.65,
      y: contract.target.y * 0.35 + coarse.y * 0.65,
    });
    contract.observationTargets.clear();
    runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'perception', 'Fresh rifle-shot evidence refreshed the acoustic investigation sector.', {
      episodeId,
      shots: contract.shots,
      coarseTarget: { ...contract.target },
      responders: acousticResponderCount(contract.shots),
    });
  }

  private maybeAccelerateLostContactSearch(state: TacticalWizardSimulationStateExecutionIntegrated): void {
    if (state.squad.alertState !== 'active' || state.squad.tactic === 'sweep') return;
    if (state.combatAuthority.confirmedVisualIds.length > 0 || state.threatResponse.active || state.recovery.phase !== 'none') return;
    const lkp = state.contactTrack.lastConfirmedPosition;
    if (lkp === null) return;
    const nearest = Math.min(...state.agents.filter((agent) => agent.alive).map((agent) => distance(agent.position, lkp)));
    if (!shouldAccelerateLostContactSearch(state.squad.lostContactTicks, nearest)) return;

    const runtime = this.perceptionInternals();
    runtime.transitionTactic('sweep', 'Close visual contact has been absent for 0.75 seconds; preserve the exact LKP and begin active reacquisition scans now.', false);
    this.fastSearchTransitions += 1;
  }

  private applyAcousticSearchBias(state: TacticalWizardSimulationStateExecutionIntegrated): void {
    const contract = this.activeInvestigation(state.logicalTick);
    if (contract === null || state.squad.tactic !== 'sweep' || state.combatAuthority.confirmedVisualIds.length > 0) return;
    if (contract.lastShotTick <= this.lastSearchRedirectShotTick + SEARCH_REDIRECT_COOLDOWN_TICKS - 1) return;

    const runtime = this.perceptionInternals();
    const orderedIds = [runtime.searchLeadId, runtime.searchOverwatchId]
      .filter((id): id is string => id !== null && id !== runtime.searchCoverId);
    const reserved = new Set<string>();
    const assignments: Array<{ id: string; target: GridPoint }> = [];

    orderedIds.forEach((id, lane) => {
      const member = runtime.members.find((candidate) => candidate.id === id);
      if (member === undefined || !this.memberAlive(id)) return;
      const observation = selectAcousticObservationPoint(member.position, contract.target, lane, reserved);
      reserved.add(pointKey(observation));
      const remaining = member.searchWaypoints
        .slice(Math.min(member.searchIndex, member.searchWaypoints.length))
        .filter((point) => distance(point, observation) > 1.5);
      member.searchWaypoints = [observation, ...remaining].slice(0, 6);
      member.searchIndex = 0;
      member.searchScanIndex = 0;
      member.searchHoldFrames = 0;
      member.searchComplete = false;
      member.tacticalTarget = { ...observation };
      assignments.push({ id, target: observation });
    });

    if (assignments.length === 0) return;
    this.lastSearchRedirectShotTick = contract.lastShotTick;
    this.searchRedirects += 1;
    runtime.pushEvent(`T${state.logicalTick}: fresh gunfire pulled the active search frontier toward a new observation sector.`);
    runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'search', 'Fresh acoustic evidence reordered search observation points without replacing the last confirmed player position.', {
      episodeId: contract.episodeId,
      acousticTarget: { ...contract.target },
      assignments: assignments.map((entry) => `${entry.id}@${entry.target.x},${entry.target.y}`),
      lkpPreserved: state.contactTrack.lastConfirmedPosition === null ? null : { ...state.contactTrack.lastConfirmedPosition },
      redirectCount: this.searchRedirects,
    });
  }

  private shouldUseActiveAttention(member: HostMember): boolean {
    const runtime = this.perceptionInternals();
    if (!this.memberAlive(member.id)) return false;
    const contract = this.activeInvestigation(runtime.logicalTick);
    if (contract !== null && contract.listeners.has(member.id)) return true;
    if (runtime.alertState !== 'active') return false;
    return runtime.tactic === 'sweep' || runtime.lostContactTicks > 0;
  }

  private attentionAnchor(member: HostMember): GridPoint | null {
    const runtime = this.perceptionInternals();
    const contract = this.activeInvestigation(runtime.logicalTick);
    if (contract !== null && (runtime.alertState !== 'active' || runtime.tactic === 'sweep')) return contract.target;
    if (member.searchLookTarget !== null) return member.searchLookTarget;
    return runtime.sharedLastKnownPosition;
  }

  private investigationResponders(contract: AcousticInvestigation): readonly string[] {
    const candidates = this.perceptionInternals().members
      .filter((member) => contract.listeners.has(member.id) && this.memberAlive(member.id))
      .sort((left, right) => distance(left.position, contract.target) - distance(right.position, contract.target) || left.id.localeCompare(right.id, 'en'));
    return candidates.slice(0, acousticResponderCount(contract.shots)).map((member) => member.id);
  }

  private activeInvestigation(tick: number): AcousticInvestigation | null {
    const contract = this.acousticInvestigation;
    return contract !== null && tick <= contract.expiresTick ? contract : null;
  }

  private expireInvestigation(tick: number): void {
    if (this.acousticInvestigation !== null && tick > this.acousticInvestigation.expiresTick) this.acousticInvestigation = null;
  }

  private recoveryOwnsMember(id: string): boolean {
    const plan = this.perceptionInternals().rescuePlan;
    return plan !== null && (plan.rescuerId === id || plan.covererId === id);
  }

  private memberAlive(id: string): boolean {
    return (this.perceptionInternals().vitals.get(id)?.health ?? 1) > 0;
  }

  private perceptionInternals(): PerceptionInternals {
    return this as unknown as PerceptionInternals;
  }
}

export function acousticResponderCount(shots: number): number {
  return shots >= 2 ? 2 : 1;
}

export function activeAttentionHalfFov(range: number): number | null {
  if (range <= VERY_CLOSE_ATTENTION_RANGE) return VERY_CLOSE_ATTENTION_HALF_FOV;
  if (range <= CLOSE_ATTENTION_RANGE) return CLOSE_ATTENTION_HALF_FOV;
  return null;
}

export function shouldAccelerateLostContactSearch(lostContactTicks: number, nearestLkpDistance: number): boolean {
  return lostContactTicks >= FAST_SEARCH_LOST_TICKS && nearestLkpDistance <= FAST_SEARCH_MAX_DISTANCE;
}

export function selectAcousticObservationPoint(
  origin: GridPoint,
  acousticTarget: GridPoint,
  laneIndex = 0,
  reserved: ReadonlySet<string> = new Set<string>(),
): GridPoint {
  const samples = uncertaintySamples(acousticTarget);
  const candidates: Array<{ point: GridPoint; score: number }> = [];
  const targetCell = toCell(acousticTarget);
  for (let y = targetCell.y - 8; y <= targetCell.y + 8; y += 1) {
    for (let x = targetCell.x - 8; x <= targetCell.x + 8; x += 1) {
      const point = { x, y };
      if (!isWalkable(tacticalWizardNavigationGrid, point) || reserved.has(pointKey(point))) continue;
      const threatDistance = distance(point, acousticTarget);
      if (threatDistance < 3 || threatDistance > 8) continue;
      const path = findPath(tacticalWizardNavigationGrid, toCell(origin), point);
      if (path.length === 0) continue;
      const coverage = samples.filter((sample) => hasLineOfSight(tacticalWizardNavigationGrid, point, toCell(sample))).length;
      const direction = normalize({ x: acousticTarget.x - origin.x, y: acousticTarget.y - origin.y });
      const right = { x: -direction.y, y: direction.x };
      const lateral = (point.x - acousticTarget.x) * right.x + (point.y - acousticTarget.y) * right.y;
      const desiredLateral = laneIndex === 0 ? -2.5 : 2.5;
      const score = coverage * 5 - path.length * 0.32 - Math.abs(threatDistance - 5.5) * 0.7 - Math.abs(lateral - desiredLateral) * 0.22;
      candidates.push({ point, score });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.point.y - right.point.y || left.point.x - right.point.x);
  return candidates[0]?.point ?? nearestWalkable(targetCell);
}

function rifleShotPerceivedPoint(stimulus: unknown): GridPoint | null {
  if (typeof stimulus !== 'object' || stimulus === null) return null;
  const value = stimulus as Record<string, unknown>;
  if (value.kind !== 'noise' || value.actionKind !== 'rifle_shot') return null;
  const perceived = value.perceivedPosition;
  if (typeof perceived !== 'object' || perceived === null) return null;
  const vector = perceived as Record<string, unknown>;
  if (typeof vector.x !== 'number') return null;
  const planarY = typeof vector.z === 'number' ? vector.z : typeof vector.y === 'number' ? vector.y : null;
  return planarY === null ? null : { x: vector.x, y: planarY };
}

function coarsenAcousticPoint(point: GridPoint): GridPoint {
  const snapped = { x: Math.round(point.x / 2) * 2, y: Math.round(point.y / 2) * 2 };
  return nearestWalkable(toCell(snapped));
}

function nearestWalkable(center: GridPoint): GridPoint {
  if (isWalkable(tacticalWizardNavigationGrid, center)) return { ...center };
  for (let radius = 1; radius <= 3; radius += 1) {
    for (let y = center.y - radius; y <= center.y + radius; y += 1) {
      for (let x = center.x - radius; x <= center.x + radius; x += 1) {
        const candidate = toCell({ x, y });
        if (isWalkable(tacticalWizardNavigationGrid, candidate)) return candidate;
      }
    }
  }
  return { ...center };
}

function uncertaintySamples(center: GridPoint): readonly GridPoint[] {
  return [
    center,
    { x: center.x + 2.5, y: center.y },
    { x: center.x - 2.5, y: center.y },
    { x: center.x, y: center.y + 2.5 },
    { x: center.x, y: center.y - 2.5 },
    { x: center.x + 1.75, y: center.y + 1.75 },
    { x: center.x - 1.75, y: center.y - 1.75 },
  ];
}

function toCell(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))),
  };
}

function pointKey(point: GridPoint): string {
  return `${Math.round(point.x)},${Math.round(point.y)}`;
}

function rotate(direction: GridPoint, degrees: number): GridPoint {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return normalize({ x: direction.x * cos - direction.y * sin, y: direction.x * sin + direction.y * cos });
}

function angleDegrees(a: GridPoint, b: GridPoint): number {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
  return Math.acos(dot) * 180 / Math.PI;
}

function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-9 ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
