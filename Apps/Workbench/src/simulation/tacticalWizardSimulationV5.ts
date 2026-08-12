import type { AgentRuntimeSnapshot, DecisionTrace, Stimulus, Vector3 } from '@volition/core';
import { createTacticalWizardReferenceRuntime, decideSquadDoctrine, type SquadTactic } from '@volition/example-tactical-wizard';
import { findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint } from './navigation';
import { discoverCoverSlots, selectAssaultPosition, selectCoverSlot, type CoverSlot } from './squadTactics';
import { centroid, pairwiseSpread, selectSectorPoint } from './maneuverGeometry';
import { buildFireLaneBlockedCells, findFriendlyInFireLane, lookPoint, makeSearchPattern, type FireLane } from './combatCoordination';
import {
  tacticalWizardNavigationGrid,
  tacticalWizardTestMap,
  type RunLogCategory,
  type RunLogEntry,
  type RunLogEvent,
  type RunLogValue,
  type SimulationOverlaySettings,
  type SquadAlertState,
  type TacticalRole,
  type TacticalWizardAgentView as BaseAgentView,
  type TacticalWizardSimulationState as BaseSimulationState,
} from './tacticalWizardSimulationV3';

export type { SimulationOverlaySettings } from './tacticalWizardSimulationV3';
export { tacticalWizardTestMap };

export type TacticalTask = 'patrol' | 'suppress' | 'bound_to_cover' | 'hold_cover' | 'flank_to_cover' | 'crossfire' | 'assault' | 'search_sector' | 'overwatch' | 'regroup';
export type CoverState = 'none' | 'moving' | 'covered' | 'peeking';

export interface TacticalWizardAgentView extends BaseAgentView {
  readonly task: TacticalTask;
  readonly coverState: CoverState;
  readonly fireOrigin: GridPoint | null;
  readonly fireBlockedByFriend: string | null;
  readonly searchLookTarget: GridPoint | null;
  readonly searchProgress: number;
}

export interface TacticalWizardSimulationState extends Omit<BaseSimulationState, 'agents'> {
  readonly agents: readonly TacticalWizardAgentView[];
  readonly fireLanes: readonly FireLane[];
  readonly safeFireLanes: number;
  readonly motionFrame: number;
  readonly elapsedSeconds: number;
}

const MEMBER_DEFINITIONS = [
  { id: 'twr:rifle-squad:alpha', label: 'Alpha', visualKey: 'alpha', start: { x: 2, y: 2 }, patrolOffset: { x: 0, y: 0 } },
  { id: 'twr:rifle-squad:bravo', label: 'Bravo', visualKey: 'bravo', start: { x: 2, y: 4 }, patrolOffset: { x: 0, y: 2 } },
  { id: 'twr:rifle-squad:charlie', label: 'Charlie', visualKey: 'charlie', start: { x: 4, y: 2 }, patrolOffset: { x: 2, y: 0 } },
] as const;

const MOTION_HZ = 30;
const MOTION_STEP_SECONDS = 1 / MOTION_HZ;
const DECISION_INTERVAL_SECONDS = 0.25;
const AGENT_MOVE_SPEED = 4.8;
const PLAYER_MOVE_STEP = 0.2;
const POSITION_EPSILON = 0.025;
const ARRIVAL_RADIUS = 0.5;
const ALERT_PROPAGATION_TICKS = 2;
const ALERT_MEMORY_TICKS = 56;
const MIN_BOUNDING_PHASE_TICKS = 5;
const STALLED_REPLAN_FRAMES = 75;
const RUN_LOG_LIMIT = 10000;
const MOTION_LOG_EVERY_FRAMES = 4;
const FIRE_LANE_CLEARANCE = 0.82;
const SEARCH_SCAN_HOLD_FRAMES = 15;
const SEARCH_SCANS_PER_POINT = 4;
const PEEK_FRAMES = 9;

interface MutableMember {
  readonly id: string;
  readonly label: string;
  readonly visualKey: string;
  readonly patrolOffset: GridPoint;
  runtime: ReturnType<typeof createTacticalWizardReferenceRuntime>;
  position: GridPoint;
  facing: GridPoint;
  path: readonly GridPoint[];
  selectedIntent: string;
  beliefConfidence: number;
  beliefSource: string;
  targetVisible: boolean;
  lastKnownPosition: GridPoint | null;
  latestTrace: DecisionTrace | null;
  latestSnapshot: AgentRuntimeSnapshot | null;
  wasVisible: boolean;
  role: TacticalRole;
  task: TacticalTask;
  coverSlot: CoverSlot | null;
  coverState: CoverState;
  tacticalTarget: GridPoint | null;
  firePulse: number;
  fireTarget: GridPoint | null;
  fireOrigin: GridPoint | null;
  fireBlockedByFriend: string | null;
  peekUntilFrame: number;
  searchPulse: number;
  searchWaypoints: readonly GridPoint[];
  searchIndex: number;
  searchScanIndex: number;
  searchHoldFrames: number;
  searchLookOffsets: readonly number[];
  searchLookTarget: GridPoint | null;
  searchComplete: boolean;
  stalledTicks: number;
}

export class TacticalWizardSimulation {
  private members: MutableMember[] = createMembers();
  private logicalTick = 0;
  private motionFrame = 0;
  private elapsedSeconds = 0;
  private decisionAccumulator = 0;
  private motionAccumulator = 0;
  private player: GridPoint = tacticalWizardTestMap.playerStart;
  private patrolIndex = 1;
  private pendingNoiseIntensity = 0;
  private alertState: SquadAlertState = 'idle';
  private alertSourceId: string | null = null;
  private sharedLastKnownPosition: GridPoint | null = null;
  private pendingAlertUntil = 0;
  private alertExpiresAt = 0;
  private suppressorId: string | null = null;
  private moverId: string | null = null;
  private observerId: string | null = null;
  private boundingPhase = 0;
  private phaseStartedTick = 0;
  private coverSlots: readonly CoverSlot[] = [];
  private tactic: SquadTactic = 'bounding';
  private tacticStartedTick = 0;
  private tacticReason = 'Initial doctrine: establish cover and mutually safe fire lanes.';
  private contactStartedTick = 0;
  private stationaryTargetTicks = 0;
  private lostContactTicks = 0;
  private stableContactTicks = 0;
  private lastObservedPlayer: GridPoint | null = null;
  private maneuverCycle = 0;
  private readonly eventLog: string[] = ['Simulation ready. Tactical Task coordinator / 30 Hz motion initialized.'];
  private runLog: RunLogEntry[] = [];
  private runLogSequence = 0;

  readonly stepSeconds = DECISION_INTERVAL_SECONDS;
  readonly motionHz = MOTION_HZ;
  readonly hearingRadius = 10;
  readonly visionRange = 12;
  readonly visionFovDegrees = 120;
  readonly agentMoveSpeed = AGENT_MOVE_SPEED;

  constructor() {
    this.log('system', 'simulation', 'Volition Simulation', 'session', 'V5 tactical task simulation started.', {
      map: tacticalWizardTestMap.id,
      motionHz: MOTION_HZ,
      decisionHz: 1 / DECISION_INTERVAL_SECONDS,
      agentMoveSpeed: AGENT_MOVE_SPEED,
      fireLaneClearance: FIRE_LANE_CLEARANCE,
    });
  }

  reset(): TacticalWizardSimulationState {
    for (const member of this.members) member.runtime.dispose();
    this.members = createMembers();
    this.logicalTick = 0;
    this.motionFrame = 0;
    this.elapsedSeconds = 0;
    this.decisionAccumulator = 0;
    this.motionAccumulator = 0;
    this.player = tacticalWizardTestMap.playerStart;
    this.patrolIndex = 1;
    this.pendingNoiseIntensity = 0;
    this.alertState = 'idle';
    this.alertSourceId = null;
    this.sharedLastKnownPosition = null;
    this.pendingAlertUntil = 0;
    this.alertExpiresAt = 0;
    this.suppressorId = null;
    this.moverId = null;
    this.observerId = null;
    this.boundingPhase = 0;
    this.phaseStartedTick = 0;
    this.coverSlots = [];
    this.tactic = 'bounding';
    this.tacticStartedTick = 0;
    this.tacticReason = 'Initial doctrine: establish cover and mutually safe fire lanes.';
    this.contactStartedTick = 0;
    this.stationaryTargetTicks = 0;
    this.lostContactTicks = 0;
    this.stableContactTicks = 0;
    this.lastObservedPlayer = null;
    this.maneuverCycle = 0;
    this.eventLog.splice(0, this.eventLog.length, 'Simulation reset. Tactical Task coordinator / 30 Hz motion initialized.');
    this.runLog = [];
    this.runLogSequence = 0;
    this.log('system', 'simulation', 'Volition Simulation', 'session', 'Simulation reset; V5 tactical task run started.', {
      map: tacticalWizardTestMap.id,
      motionHz: MOTION_HZ,
      decisionHz: 1 / DECISION_INTERVAL_SECONDS,
      agentMoveSpeed: AGENT_MOVE_SPEED,
      fireLaneClearance: FIRE_LANE_CLEARANCE,
    });
    return this.getState();
  }

  emitNoise(intensity = 1): void {
    const value = Math.max(this.pendingNoiseIntensity, clamp01(intensity));
    this.pendingNoiseIntensity = value;
    this.pushEvent(`T${this.logicalTick}: player test noise emitted.`);
    this.log('player', 'player', 'Player', 'player_noise', 'Player emitted a test noise.', { intensity: value, position: { ...this.player } });
  }

  setPlayerPosition(point: GridPoint): boolean {
    return this.setPlayerPositionInternal(point, 'teleport');
  }

  nudgePlayer(dx: number, dy: number): boolean {
    const moved = this.setPlayerPositionInternal({ x: this.player.x + dx * PLAYER_MOVE_STEP, y: this.player.y + dy * PLAYER_MOVE_STEP }, 'direct-control');
    if (moved) this.pendingNoiseIntensity = Math.max(this.pendingNoiseIntensity, 0.35);
    return moved;
  }

  step(): TacticalWizardSimulationState {
    return this.advance(DECISION_INTERVAL_SECONDS);
  }

  advance(deltaSeconds: number): TacticalWizardSimulationState {
    const delta = Math.max(0, Math.min(1, deltaSeconds));
    this.decisionAccumulator += delta;
    this.motionAccumulator += delta;
    while (this.motionAccumulator + 1e-9 >= MOTION_STEP_SECONDS) {
      this.motionAccumulator -= MOTION_STEP_SECONDS;
      this.elapsedSeconds += MOTION_STEP_SECONDS;
      this.motionFrame += 1;
      this.advanceMotionFrame();
    }
    while (this.decisionAccumulator + 1e-9 >= DECISION_INTERVAL_SECONDS) {
      this.decisionAccumulator -= DECISION_INTERVAL_SECONDS;
      this.advanceDecisionTick();
    }
    return this.getState();
  }

  getState(): TacticalWizardSimulationState {
    const primary = this.members[0]!;
    const views: TacticalWizardAgentView[] = this.members.map((member) => ({
      id: member.id,
      label: member.label,
      visualKey: member.visualKey,
      position: member.position,
      facing: member.facing,
      path: member.path,
      selectedIntent: member.selectedIntent,
      beliefConfidence: member.beliefConfidence,
      beliefSource: member.beliefSource,
      targetVisible: member.targetVisible,
      lastKnownPosition: member.lastKnownPosition,
      role: member.role,
      coverTarget: member.coverSlot?.position ?? null,
      peekTarget: member.coverSlot?.peekPosition ?? null,
      tacticalTarget: member.tacticalTarget,
      firePulse: member.firePulse,
      fireTarget: member.fireTarget,
      searchPulse: member.searchPulse,
      stalledTicks: member.stalledTicks,
      task: member.task,
      coverState: member.coverState,
      fireOrigin: member.fireOrigin,
      fireBlockedByFriend: member.fireBlockedByFriend,
      searchLookTarget: member.searchLookTarget,
      searchProgress: this.memberSearchProgress(member),
    }));
    const lanes = this.currentFireLanes();
    return {
      logicalTick: this.logicalTick,
      agents: views,
      squad: {
        id: 'twr:rifle-squad-01',
        alertState: this.alertState,
        sourceAgentId: this.alertSourceId,
        sharedLastKnownPosition: this.sharedLastKnownPosition,
        phase: this.boundingPhase,
        tactic: this.tactic,
        tacticReason: this.tacticReason,
        tacticTicks: Math.max(0, this.logicalTick - this.tacticStartedTick),
        stationaryTargetTicks: this.stationaryTargetTicks,
        lostContactTicks: this.lostContactTicks,
        maneuverCycle: this.maneuverCycle,
        spread: Number(pairwiseSpread(this.members.map((member) => member.position)).toFixed(2)),
        suppressorId: this.suppressorId,
        moverId: this.moverId,
        observerId: this.observerId,
      },
      player: this.player,
      patrolPoints: tacticalWizardTestMap.patrolPoints,
      patrolIndex: this.patrolIndex,
      coverSlots: this.coverSlots,
      hearingRadius: this.hearingRadius,
      visionRange: this.visionRange,
      visionFovDegrees: this.visionFovDegrees,
      movementResolution: PLAYER_MOVE_STEP,
      latestTraces: this.members.flatMap((member) => member.latestTrace === null ? [] : [member.latestTrace]),
      eventLog: [...this.eventLog],
      runLog: [...this.runLog],
      enemy: primary.position,
      enemyFacing: primary.facing,
      path: primary.path,
      selectedIntent: primary.selectedIntent,
      beliefConfidence: primary.beliefConfidence,
      beliefSource: primary.beliefSource,
      targetVisible: primary.targetVisible,
      lastKnownPosition: primary.lastKnownPosition,
      latestTrace: primary.latestTrace,
      latestSnapshot: primary.latestSnapshot,
      firePulse: primary.firePulse,
      searchPulse: primary.searchPulse,
      fireLanes: lanes,
      safeFireLanes: this.safeFireLaneCount(),
      motionFrame: this.motionFrame,
      elapsedSeconds: Number(this.elapsedSeconds.toFixed(3)),
    };
  }

  private advanceDecisionTick(): void {
    const visibility = new Map(this.members.map((member) => [member.id, this.canSeePlayer(member)]));
    this.updateSquadAlert(visibility);
    if (this.alertState === 'active') {
      this.updateDoctrine(visibility);
      this.ensureTacticalPlan();
    }

    for (const member of this.members) {
      const visible = visibility.get(member.id) === true;
      const patrolTarget = this.getPatrolTarget(member);
      const values = {
        selfPosition: toVector3(member.position),
        selfFacing: { x: member.facing.x, y: 0, z: member.facing.y },
        patrolTarget: toVector3(patrolTarget),
        weaponState: 'ready',
        squadId: 'twr:rifle-squad-01',
        squadRole: member.role,
        squadTask: member.task,
        squadAlertState: this.alertState,
        squadTactic: this.tactic,
        ...(member.tacticalTarget === null ? {} : { engagementPosition: toVector3(member.tacticalTarget) }),
        ...(member.coverSlot === null ? {} : { coverTarget: toVector3(member.coverSlot.position), peekTarget: toVector3(member.coverSlot.peekPosition) }),
      };
      const snapshot = member.runtime.tick({
        tick: { logicalTick: this.logicalTick, deltaSeconds: this.logicalTick === 0 ? 0 : DECISION_INTERVAL_SECONDS, seed: 1337 },
        context: { agentId: member.id, values, capabilities: ['move_to', 'aim_at', 'fire', 'reload'] },
        stimuli: this.buildStimuli(member, visible),
        actionResults: [],
      });
      member.latestSnapshot = snapshot;
      member.latestTrace = member.runtime.getTrace().at(-1) ?? null;
      member.selectedIntent = snapshot.selectedIntent.id;
      member.beliefConfidence = snapshot.belief.confidence;
      member.beliefSource = snapshot.belief.source;
      member.targetVisible = snapshot.belief.confirmedVisible;
      member.lastKnownPosition = snapshot.belief.estimatedPosition === null ? null : fromVector3(snapshot.belief.estimatedPosition);
      this.log('agent', member.id, member.label, 'decision', `${member.label} selected ${member.selectedIntent}; tactical task ${member.task}.`, {
        intent: member.selectedIntent,
        role: member.role,
        task: member.task,
        tactic: this.tactic,
        position: { ...member.position },
        belief: Number(member.beliefConfidence.toFixed(3)),
        beliefSource: member.beliefSource,
        targetVisible: member.targetVisible,
        coverState: member.coverState,
      });
    }

    this.executeDecisionEffects();
    for (const member of this.members) member.wasVisible = visibility.get(member.id) === true;
    this.pendingNoiseIntensity = 0;
    this.logicalTick += 1;
  }

  private advanceMotionFrame(): void {
    for (const member of this.members) {
      member.firePulse = Math.max(0, member.firePulse - 1);
      if (member.firePulse === 0) {
        member.fireTarget = null;
        member.fireOrigin = null;
      }
      member.searchPulse = Math.max(0, member.searchPulse - 1);
      if (member.coverState === 'peeking' && this.motionFrame >= member.peekUntilFrame) member.coverState = member.coverSlot === null ? 'none' : 'covered';
    }

    const occupiedCells = new Set(this.members.map((member) => gridKey(toNavCell(member.position))));
    const lanes = this.currentFireLanes();
    for (const member of [...this.members].sort((left, right) => left.id.localeCompare(right.id, 'en'))) {
      occupiedCells.delete(gridKey(toNavCell(member.position)));
      const target = this.movementTarget(member);
      if (target !== null) this.moveMemberToward(member, target, occupiedCells, lanes, AGENT_MOVE_SPEED * MOTION_STEP_SECONDS);
      occupiedCells.add(gridKey(toNavCell(member.position)));
      this.updatePostureAndFacing(member);
    }

    if (new Set(this.members.map((member) => gridKey(toNavCell(member.position)))).size !== this.members.length) {
      throw new Error('Simulation invariant violated: squad members share a navigation cell.');
    }
    this.advancePatrolIfReady();
    this.advanceBoundingIfReady();
  }

  private movementTarget(member: MutableMember): GridPoint | null {
    if (this.alertState !== 'active' || this.sharedLastKnownPosition === null) return this.getPatrolTarget(member);
    if (this.tactic === 'sweep') {
      if (member.searchComplete || member.searchWaypoints.length === 0) return null;
      return member.searchWaypoints[Math.min(member.searchIndex, member.searchWaypoints.length - 1)] ?? null;
    }
    return member.tacticalTarget;
  }

  private updatePostureAndFacing(member: MutableMember): void {
    if (this.alertState !== 'active' || this.sharedLastKnownPosition === null) return;
    if (this.tactic === 'sweep') {
      this.updateSearchScan(member);
      return;
    }
    const target = member.tacticalTarget;
    const settled = target !== null && distance(member.position, target) <= ARRIVAL_RADIUS;
    if (member.coverSlot !== null) {
      if (!settled) member.coverState = 'moving';
      else if (member.coverState !== 'peeking') member.coverState = 'covered';
    } else if (member.coverState !== 'peeking') member.coverState = 'none';
    if (settled || member.task === 'suppress' || member.task === 'hold_cover' || member.task === 'crossfire') this.faceToward(member, this.sharedLastKnownPosition);
  }

  private updateSearchScan(member: MutableMember): void {
    const lkp = this.sharedLastKnownPosition;
    if (lkp === null || member.searchWaypoints.length === 0 || member.searchComplete) return;
    const waypoint = member.searchWaypoints[Math.min(member.searchIndex, member.searchWaypoints.length - 1)]!;
    if (distance(member.position, waypoint) > ARRIVAL_RADIUS) {
      member.coverState = 'moving';
      member.searchLookTarget = null;
      return;
    }
    member.coverState = member.coverSlot === null ? 'none' : 'covered';
    member.searchPulse = Math.max(member.searchPulse, 8);
    member.searchHoldFrames += 1;
    const offset = member.searchLookOffsets[member.searchScanIndex % member.searchLookOffsets.length] ?? 0;
    member.searchLookTarget = lookPoint(member.position, lkp, offset, 6);
    this.faceToward(member, member.searchLookTarget);
    if (member.searchHoldFrames < SEARCH_SCAN_HOLD_FRAMES) return;
    member.searchHoldFrames = 0;
    member.searchScanIndex += 1;
    if (member.searchScanIndex < SEARCH_SCANS_PER_POINT) return;
    member.searchScanIndex = 0;
    if (member.task === 'overwatch') return;
    member.searchIndex += 1;
    if (member.searchIndex >= member.searchWaypoints.length) {
      member.searchComplete = true;
      member.searchIndex = member.searchWaypoints.length - 1;
      this.log('agent', member.id, member.label, 'search', `${member.label} completed its assigned search sector.`, { task: member.task, progress: 1 });
    } else {
      const next = member.searchWaypoints[member.searchIndex]!;
      member.tacticalTarget = next;
      this.log('agent', member.id, member.label, 'search', `${member.label} cleared a scan point and advances to the next search sector.`, { task: member.task, target: { ...next } });
    }
  }

  private executeDecisionEffects(): void {
    if (this.alertState !== 'active' || this.sharedLastKnownPosition === null) return;
    if (this.tactic === 'sweep') {
      for (const member of this.members) {
        if (this.logicalTick % 4 === 0) this.log('agent', member.id, member.label, 'search', `${member.label} is searching assigned space instead of staring at the LKP.`, { task: member.task, progress: Number(this.memberSearchProgress(member).toFixed(2)) });
      }
      return;
    }
    for (const member of this.members) {
      const settled = member.tacticalTarget !== null && distance(member.position, member.tacticalTarget) <= ARRIVAL_RADIUS + 0.2;
      if (this.tactic === 'bounding' && member.role === 'suppressor' && settled && this.logicalTick % 2 === 0) this.tryFire(member, this.sharedLastKnownPosition, 'suppression from cover');
      else if (this.tactic === 'flank' && member.role === 'suppressor' && settled && this.logicalTick % 2 === 0) this.tryFire(member, this.sharedLastKnownPosition, 'fixing fire');
      else if (this.tactic === 'flank' && member.role === 'flanker' && settled && this.logicalTick % 2 === 0) this.tryFire(member, this.sharedLastKnownPosition, 'flanking fire');
      else if (this.tactic === 'crossfire' && member.role === 'crossfire' && settled && this.logicalTick % 2 === 0) this.tryFire(member, this.sharedLastKnownPosition, 'crossfire');
      else if (this.tactic === 'assault' && member.role === 'assaulter' && this.logicalTick % 2 === 0) this.tryFire(member, this.sharedLastKnownPosition, 'assault');
      else if (member.targetVisible && settled && this.logicalTick % 6 === 0) this.tryFire(member, this.player, `${this.tactic} support`);
    }
  }

  private tryFire(member: MutableMember, target: GridPoint, reason: string): void {
    const origin = this.fireOriginFor(member);
    if (!hasWorldLineOfSight(origin, target)) return;
    const blockedBy = findFriendlyInFireLane(member.id, origin, target, this.members, FIRE_LANE_CLEARANCE);
    if (blockedBy !== null) {
      if (member.fireBlockedByFriend !== blockedBy) {
        member.fireBlockedByFriend = blockedBy;
        const blocker = this.members.find((entry) => entry.id === blockedBy)?.label ?? blockedBy;
        this.log('agent', member.id, member.label, 'fire', `${member.label} withheld fire because ${blocker} occupies the fire lane.`, { blocked: true, blockedBy, task: member.task, tactic: this.tactic });
      }
      return;
    }
    member.fireBlockedByFriend = null;
    member.firePulse = 8;
    member.fireTarget = { ...target };
    member.fireOrigin = { ...origin };
    if (member.coverSlot !== null && distance(member.position, member.coverSlot.position) <= ARRIVAL_RADIUS + 0.3) {
      member.coverState = 'peeking';
      member.peekUntilFrame = this.motionFrame + PEEK_FRAMES;
    }
    this.pushEvent(`T${this.logicalTick}: ${member.label} ${reason}.`);
    this.log('agent', member.id, member.label, 'fire', `${member.label} fired: ${reason}.`, { target: { ...target }, role: member.role, task: member.task, tactic: this.tactic, targetVisible: member.targetVisible, fromCover: member.coverSlot !== null });
  }

  private fireOriginFor(member: MutableMember): GridPoint {
    if (member.coverSlot !== null && distance(member.position, member.coverSlot.position) <= ARRIVAL_RADIUS + 0.3) return member.coverSlot.peekPosition;
    return member.position;
  }

  private currentFireLanes(): readonly FireLane[] {
    if (this.alertState !== 'active' || this.sharedLastKnownPosition === null || this.tactic === 'sweep') return [];
    const laneOwners = this.members.filter((member) => {
      const settled = member.tacticalTarget !== null && distance(member.position, member.tacticalTarget) <= ARRIVAL_RADIUS + 0.35;
      return settled && (member.task === 'suppress' || member.task === 'crossfire' || member.task === 'hold_cover');
    });
    return laneOwners.flatMap((member): FireLane[] => {
      const from = this.fireOriginFor(member);
      if (!hasWorldLineOfSight(from, this.sharedLastKnownPosition!)) return [];
      return [{ ownerId: member.id, from, to: this.sharedLastKnownPosition!, clearance: FIRE_LANE_CLEARANCE }];
    });
  }

  private safeFireLaneCount(): number {
    if (this.sharedLastKnownPosition === null) return 0;
    return this.currentFireLanes().filter((lane) => findFriendlyInFireLane(lane.ownerId, lane.from, lane.to, this.members, FIRE_LANE_CLEARANCE) === null).length;
  }

  private updateSquadAlert(visibility: ReadonlyMap<string, boolean>): void {
    const visibleMembers = this.members.filter((member) => visibility.get(member.id) === true);
    const reporter = [...visibleMembers].sort((left, right) => left.id.localeCompare(right.id, 'en'))[0];
    if (this.alertState === 'active') {
      if (reporter === undefined) {
        this.lostContactTicks += 1;
        this.stableContactTicks = 0;
      } else {
        this.lostContactTicks = 0;
        this.stableContactTicks += 1;
      }
    }
    if (reporter !== undefined) {
      if (this.lastObservedPlayer !== null && distance(this.lastObservedPlayer, this.player) <= PLAYER_MOVE_STEP) this.stationaryTargetTicks += 1;
      else this.stationaryTargetTicks = 0;
      this.lastObservedPlayer = { ...this.player };
      this.sharedLastKnownPosition = { ...this.player };
      this.alertSourceId = reporter.id;
      this.alertExpiresAt = this.logicalTick + ALERT_MEMORY_TICKS;
      if (this.alertState === 'idle') {
        this.alertState = 'pending';
        this.pendingAlertUntil = this.logicalTick + ALERT_PROPAGATION_TICKS;
        this.pushEvent(`T${this.logicalTick}: ${reporter.label} confirmed contact; squad alert pending.`);
        this.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'alert', `${reporter.label} confirmed contact; shared alert pending.`, { reporter: reporter.id, lastKnown: { ...this.player } });
      }
    }
    if (this.alertState === 'pending' && this.logicalTick >= this.pendingAlertUntil) this.activateSquad();
    if (this.alertState === 'active' && reporter === undefined && this.logicalTick > this.alertExpiresAt) this.clearSquadAlert();
  }

  private activateSquad(): void {
    this.alertState = 'active';
    const source = this.members.find((member) => member.id === this.alertSourceId) ?? this.members[0]!;
    const others = this.members.filter((member) => member.id !== source.id).sort((left, right) => left.id.localeCompare(right.id, 'en'));
    this.suppressorId = source.id;
    this.moverId = others[0]?.id ?? null;
    this.observerId = others[1]?.id ?? null;
    this.boundingPhase = 0;
    this.phaseStartedTick = this.logicalTick;
    this.contactStartedTick = this.logicalTick;
    this.stableContactTicks = 1;
    this.tactic = 'bounding';
    this.tacticStartedTick = this.logicalTick;
    this.tacticReason = 'Contact confirmed; assign one covered suppressor and route the mover outside friendly fire lanes.';
    this.applyRoles();
    this.refreshTacticalPlan();
    this.pushEvent(`T${this.logicalTick}: shared alert active; cover / suppression task allocation committed.`);
    this.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'alert', 'Shared combat alert activated with tactical task allocation.', { source: source.id, tactic: this.tactic });
    this.logRoleAssignments();
  }

  private clearSquadAlert(): void {
    this.alertState = 'idle';
    this.alertSourceId = null;
    this.sharedLastKnownPosition = null;
    this.suppressorId = null;
    this.moverId = null;
    this.observerId = null;
    this.coverSlots = [];
    this.stationaryTargetTicks = 0;
    this.lostContactTicks = 0;
    this.stableContactTicks = 0;
    this.lastObservedPlayer = null;
    for (const member of this.members) this.resetMember(member);
    this.pushEvent(`T${this.logicalTick}: squad alert expired; formation returns to patrol.`);
    this.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'alert', 'Shared alert expired; squad returned to patrol.', {});
  }

  private updateDoctrine(visibility: ReadonlyMap<string, boolean>): void {
    const decision = decideSquadDoctrine(this.tactic, {
      contactTicks: Math.max(0, this.logicalTick - this.contactStartedTick),
      stationaryTargetTicks: this.stationaryTargetTicks,
      tacticTicks: Math.max(0, this.logicalTick - this.tacticStartedTick),
      boundingPhase: this.boundingPhase,
      visibleMembers: this.members.filter((member) => visibility.get(member.id) === true).length,
      stalledMembers: this.members.filter((member) => member.stalledTicks >= STALLED_REPLAN_FRAMES).length,
      lostContactTicks: this.lostContactTicks,
      maneuverCycle: this.maneuverCycle,
      planCompletion: this.planCompletion(),
      stableContactTicks: this.stableContactTicks,
    });
    if (decision.tactic === 'assault' && (this.safeFireLaneCount() < 2 || this.stationaryTargetTicks < 10)) {
      this.tacticReason = 'Crossfire holds: do not collapse into an assault until two safe lanes are established and the target has remained sufficiently fixed.';
      return;
    }
    this.tacticReason = decision.reason;
    if (decision.tactic !== this.tactic) this.transitionTactic(decision.tactic, decision.reason, decision.rotateRoles);
  }

  private transitionTactic(next: SquadTactic, reason: string, rotateRoles: boolean): void {
    const previous = this.tactic;
    const completion = Number(this.planCompletion().toFixed(2));
    const safeLanes = this.safeFireLaneCount();
    if (rotateRoles) this.rotateRoleOrder();
    if (previous === 'regroup' && next === 'bounding') this.maneuverCycle += 1;
    this.tactic = next;
    this.tacticStartedTick = this.logicalTick;
    this.tacticReason = reason;
    this.applyRoles();
    this.refreshTacticalPlan();
    this.pushEvent(`T${this.logicalTick}: tactic ${previous} → ${next}. ${reason}`);
    this.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'tactic', `Tactic ${previous} → ${next}.`, { from: previous, to: next, reason, cycle: this.maneuverCycle, planCompletion: completion, safeFireLanes: safeLanes });
    this.logRoleAssignments();
  }

  private rotateRoleOrder(): void {
    if (this.suppressorId === null || this.moverId === null || this.observerId === null) return;
    const oldSuppressor = this.suppressorId;
    const oldMover = this.moverId;
    const oldObserver = this.observerId;
    this.suppressorId = oldObserver;
    this.moverId = oldSuppressor;
    this.observerId = oldMover;
  }

  private applyRoles(): void {
    for (const member of this.members) {
      if (this.alertState !== 'active') member.role = 'patrol';
      else if (this.tactic === 'bounding') member.role = member.id === this.suppressorId ? 'suppressor' : member.id === this.moverId ? 'mover' : 'observer';
      else if (this.tactic === 'flank') member.role = member.id === this.suppressorId ? 'suppressor' : member.id === this.moverId ? 'flanker' : 'support';
      else if (this.tactic === 'crossfire') member.role = member.id === this.suppressorId ? 'support' : 'crossfire';
      else if (this.tactic === 'assault') member.role = member.id === this.moverId || member.id === this.observerId ? 'assaulter' : 'support';
      else if (this.tactic === 'sweep') member.role = member.id === this.suppressorId ? 'support' : 'sweeper';
      else member.role = 'support';
    }
  }

  private planCompletion(): number {
    if (this.alertState !== 'active') return 0;
    if (this.tactic === 'sweep') {
      const sweepers = this.members.filter((member) => member.task === 'search_sector');
      if (sweepers.length === 0) return 0;
      return sweepers.reduce((sum, member) => sum + this.memberSearchProgress(member), 0) / sweepers.length;
    }
    const settled = (id: string | null): boolean => {
      if (id === null) return false;
      const member = this.members.find((entry) => entry.id === id);
      return member?.tacticalTarget !== null && member?.tacticalTarget !== undefined && distance(member.position, member.tacticalTarget) <= ARRIVAL_RADIUS;
    };
    if (this.tactic === 'bounding' || this.tactic === 'flank') return settled(this.moverId) ? 1 : 0;
    if (this.tactic === 'crossfire' || this.tactic === 'assault') return settled(this.moverId) && settled(this.observerId) ? 1 : 0;
    const settledCount = this.members.filter((member) => member.tacticalTarget !== null && distance(member.position, member.tacticalTarget) <= ARRIVAL_RADIUS).length;
    return settledCount >= 2 ? 1 : settledCount / this.members.length;
  }

  private memberSearchProgress(member: MutableMember): number {
    if (member.searchWaypoints.length === 0) return member.searchComplete ? 1 : 0;
    if (member.searchComplete) return 1;
    const pointFraction = member.searchIndex / member.searchWaypoints.length;
    const scanFraction = (member.searchScanIndex + Math.min(1, member.searchHoldFrames / SEARCH_SCAN_HOLD_FRAMES)) / SEARCH_SCANS_PER_POINT / member.searchWaypoints.length;
    return Math.max(0, Math.min(0.99, pointFraction + scanFraction));
  }

  private ensureTacticalPlan(): void {
    if (this.sharedLastKnownPosition === null) return;
    const missingTarget = this.tactic !== 'sweep' && this.members.some((member) => member.tacticalTarget === null);
    const hardStall = this.members.some((member) => member.stalledTicks >= STALLED_REPLAN_FRAMES);
    if (!missingTarget && !hardStall) return;
    if (hardStall) this.pushEvent(`T${this.logicalTick}: tactical element hard-stalled; rebuild cover / lane assignment.`);
    this.refreshTacticalPlan();
  }

  private refreshTacticalPlan(): void {
    if (this.sharedLastKnownPosition === null) return;
    if (this.tactic === 'bounding') this.refreshBoundingPlan();
    else if (this.tactic === 'flank') this.refreshFlankPlan();
    else if (this.tactic === 'crossfire') this.refreshCrossfirePlan();
    else if (this.tactic === 'assault') this.refreshAssaultPlan();
    else if (this.tactic === 'sweep') this.refreshSweepPlan();
    else this.refreshRegroupPlan();
    this.logPlan();
  }

  private resetPlanFields(): void {
    for (const member of this.members) {
      member.coverSlot = null;
      member.coverState = 'none';
      member.tacticalTarget = null;
      member.fireBlockedByFriend = null;
      member.searchWaypoints = [];
      member.searchIndex = 0;
      member.searchScanIndex = 0;
      member.searchHoldFrames = 0;
      member.searchLookOffsets = [];
      member.searchLookTarget = null;
      member.searchComplete = false;
      member.stalledTicks = 0;
    }
  }

  private refreshBoundingPlan(): void {
    const threat = this.sharedLastKnownPosition;
    if (threat === null) return;
    this.coverSlots = discoverCoverSlots(tacticalWizardNavigationGrid, toNavCell(threat));
    this.resetPlanFields();
    const reserved = new Set<string>();
    for (const id of [this.suppressorId, this.moverId, this.observerId].filter((value): value is string => value !== null)) {
      const member = this.members.find((entry) => entry.id === id);
      if (member === undefined) continue;
      const mode = member.id === this.moverId ? 'advance' : 'support';
      const slot = selectCoverSlot(tacticalWizardNavigationGrid, this.coverSlots, toNavCell(member.position), toNavCell(threat), reserved, mode);
      member.coverSlot = slot;
      if (slot !== null) reserved.add(slot.id);
      member.tacticalTarget = slot?.position ?? { ...member.position };
      member.task = member.id === this.suppressorId ? 'suppress' : member.id === this.moverId ? 'bound_to_cover' : 'hold_cover';
    }
  }

  private refreshFlankPlan(): void {
    const threat = this.sharedLastKnownPosition;
    if (threat === null) return;
    this.coverSlots = discoverCoverSlots(tacticalWizardNavigationGrid, toNavCell(threat));
    this.resetPlanFields();
    const reserved = new Set<string>();
    for (const member of this.members) {
      if (member.id === this.moverId) {
        const slot = selectCoverSlot(tacticalWizardNavigationGrid, this.coverSlots, toNavCell(member.position), toNavCell(threat), reserved, 'flank', this.flankSide());
        member.coverSlot = slot;
        if (slot !== null) reserved.add(slot.id);
        member.tacticalTarget = slot?.position ?? this.fallbackSectorFlank(member, threat, this.flankSide(), reserved);
        member.task = 'flank_to_cover';
      } else {
        const slot = selectCoverSlot(tacticalWizardNavigationGrid, this.coverSlots, toNavCell(member.position), toNavCell(threat), reserved, 'support', member.id === this.observerId ? -this.flankSide() : 0);
        member.coverSlot = slot;
        if (slot !== null) reserved.add(slot.id);
        member.tacticalTarget = slot?.position ?? { ...member.position };
        member.task = member.id === this.suppressorId ? 'suppress' : 'hold_cover';
      }
    }
  }

  private refreshCrossfirePlan(): void {
    const threat = this.sharedLastKnownPosition;
    if (threat === null) return;
    this.coverSlots = discoverCoverSlots(tacticalWizardNavigationGrid, toNavCell(threat));
    this.resetPlanFields();
    const reserved = new Set<string>();
    const shooters = [this.moverId, this.observerId].filter((id): id is string => id !== null);
    shooters.forEach((id, index) => {
      const member = this.members.find((entry) => entry.id === id);
      if (member === undefined) return;
      const side = index === 0 ? this.flankSide() : -this.flankSide();
      const slot = selectCoverSlot(tacticalWizardNavigationGrid, this.coverSlots, toNavCell(member.position), toNavCell(threat), reserved, 'flank', side);
      member.coverSlot = slot;
      if (slot !== null) reserved.add(slot.id);
      member.tacticalTarget = slot?.position ?? this.fallbackSectorFlank(member, threat, side, reserved);
      member.task = 'crossfire';
    });
    const support = this.suppressorId === null ? undefined : this.members.find((entry) => entry.id === this.suppressorId);
    if (support !== undefined) {
      const slot = selectCoverSlot(tacticalWizardNavigationGrid, this.coverSlots, toNavCell(support.position), toNavCell(threat), reserved, 'support');
      support.coverSlot = slot;
      if (slot !== null) reserved.add(slot.id);
      support.tacticalTarget = slot?.position ?? { ...support.position };
      support.task = 'hold_cover';
    }
  }

  private refreshAssaultPlan(): void {
    const threat = this.sharedLastKnownPosition;
    if (threat === null) return;
    this.coverSlots = discoverCoverSlots(tacticalWizardNavigationGrid, toNavCell(threat));
    this.resetPlanFields();
    const reserved = new Set<string>();
    const assaulters = [this.moverId, this.observerId].filter((id): id is string => id !== null);
    assaulters.forEach((id, index) => {
      const member = this.members.find((entry) => entry.id === id);
      if (member === undefined) return;
      const point = selectAssaultPosition(tacticalWizardNavigationGrid, toNavCell(member.position), toNavCell(threat), reserved, index === 0 ? this.flankSide() : -this.flankSide());
      member.tacticalTarget = point ?? { ...member.position };
      reserveCell(reserved, member.tacticalTarget);
      member.task = 'assault';
    });
    const support = this.suppressorId === null ? undefined : this.members.find((entry) => entry.id === this.suppressorId);
    if (support !== undefined) {
      const slot = selectCoverSlot(tacticalWizardNavigationGrid, this.coverSlots, toNavCell(support.position), toNavCell(threat), new Set<string>(), 'support');
      support.coverSlot = slot;
      support.tacticalTarget = slot?.position ?? { ...support.position };
      support.task = 'suppress';
    }
  }

  private refreshSweepPlan(): void {
    const lkp = this.sharedLastKnownPosition;
    if (lkp === null) return;
    this.coverSlots = discoverCoverSlots(tacticalWizardNavigationGrid, toNavCell(lkp));
    this.resetPlanFields();
    const side = this.flankSide();
    const ordered = [...this.members].sort((left, right) => left.id.localeCompare(right.id, 'en'));
    ordered.forEach((member, index) => {
      const patternIndex = member.id === this.suppressorId ? 2 : index === 2 ? 1 : index;
      const pattern = makeSearchPattern(tacticalWizardNavigationGrid, toNavCell(lkp), patternIndex, side);
      member.searchWaypoints = member.id === this.suppressorId ? pattern.waypoints.slice(0, 1) : pattern.waypoints;
      member.searchLookOffsets = pattern.lookOffsetsDegrees;
      member.searchIndex = 0;
      member.searchScanIndex = 0;
      member.searchHoldFrames = 0;
      member.searchComplete = member.searchWaypoints.length === 0;
      member.tacticalTarget = member.searchWaypoints[0] ?? { ...member.position };
      member.task = member.id === this.suppressorId ? 'overwatch' : 'search_sector';
      member.coverState = 'none';
    });
  }

  private refreshRegroupPlan(): void {
    const threat = this.sharedLastKnownPosition;
    if (threat === null) return;
    const origin = centroid(this.members.map((member) => member.position));
    const side = this.flankSide();
    this.coverSlots = discoverCoverSlots(tacticalWizardNavigationGrid, toNavCell(threat));
    this.resetPlanFields();
    const reservedSlots = new Set<string>();
    const reservedCells = new Set<string>();
    this.members.forEach((member, index) => {
      const slot = selectCoverSlot(tacticalWizardNavigationGrid, this.coverSlots, toNavCell(member.position), toNavCell(threat), reservedSlots, 'support', index === 0 ? side : index === 2 ? -side : 0);
      if (slot !== null) {
        member.coverSlot = slot;
        member.tacticalTarget = slot.position;
        reservedSlots.add(slot.id);
      } else {
        const point = selectSectorPoint(tacticalWizardNavigationGrid, toNavCell(member.position), toNavCell(threat), toNavCell(origin), reservedCells, { angleOffsetDegrees: (index - 1) * side * 68, angleToleranceDegrees: 48, minRange: 10, maxRange: 16, desiredRange: 12, preferCovered: true, minMoveDistance: 3 });
        member.tacticalTarget = point ?? { ...member.position };
        reserveCell(reservedCells, member.tacticalTarget);
      }
      member.task = 'regroup';
    });
  }

  private fallbackSectorFlank(member: MutableMember, threat: GridPoint, side: number, reserved: ReadonlySet<string>): GridPoint {
    const origin = centroid(this.members.map((entry) => entry.position));
    return selectSectorPoint(tacticalWizardNavigationGrid, toNavCell(member.position), toNavCell(threat), toNavCell(origin), reserved, { angleOffsetDegrees: side * 118, angleToleranceDegrees: 36, minRange: 5, maxRange: 9, desiredRange: 6.5, requireLineOfSight: true, minMoveDistance: 4 }) ?? { ...member.position };
  }

  private advanceBoundingIfReady(): void {
    if (this.alertState !== 'active' || this.tactic !== 'bounding' || this.moverId === null || this.suppressorId === null || this.logicalTick - this.phaseStartedTick < MIN_BOUNDING_PHASE_TICKS) return;
    const mover = this.members.find((member) => member.id === this.moverId);
    if (mover?.tacticalTarget === null || mover?.tacticalTarget === undefined || distance(mover.position, mover.tacticalTarget) > ARRIVAL_RADIUS) return;
    const previousSuppressor = this.suppressorId;
    this.suppressorId = this.moverId;
    this.moverId = previousSuppressor;
    this.boundingPhase += 1;
    this.phaseStartedTick = this.logicalTick;
    this.applyRoles();
    this.refreshBoundingPlan();
    this.pushEvent(`T${this.logicalTick}: bounding phase ${this.boundingPhase}; covered mover reached position and fire-support handoff committed.`);
    this.logRoleAssignments();
    this.logPlan();
  }

  private buildStimuli(member: MutableMember, visible: boolean): readonly Stimulus[] {
    const stimuli: Stimulus[] = [];
    if (visible) {
      stimuli.push({ id: `visual:player:${member.id}:${this.logicalTick}`, sequence: 20, logicalTick: this.logicalTick, kind: 'visual_actor', actorId: 'player', visible: true, position: toVector3(this.player), relation: 'hostile' });
      if (!member.wasVisible) {
        this.pushEvent(`T${this.logicalTick}: ${member.label} visual contact confirmed.`);
        this.log('agent', member.id, member.label, 'perception', `${member.label} acquired visual contact.`, { position: { ...this.player } });
      }
    } else if (member.wasVisible) {
      stimuli.push({ id: `visual:player:${member.id}:${this.logicalTick}:lost`, sequence: 20, logicalTick: this.logicalTick, kind: 'visual_actor', actorId: 'player', visible: false, relation: 'hostile' });
      this.pushEvent(`T${this.logicalTick}: ${member.label} lost visual; live player position withheld.`);
      this.log('agent', member.id, member.label, 'perception', `${member.label} lost visual contact; hidden live position is withheld.`, { lastKnown: member.lastKnownPosition });
    }
    if (this.pendingNoiseIntensity > 0 && distance(member.position, this.player) <= this.hearingRadius) {
      const perceived = this.noisyPerceivedPosition(member);
      stimuli.push({ id: `noise:player:${member.id}:${this.logicalTick}`, sequence: 10, logicalTick: this.logicalTick, kind: 'noise', sourceId: 'player', perceivedPosition: toVector3(perceived), intensity: this.pendingNoiseIntensity, actionKind: this.pendingNoiseIntensity >= 0.8 ? 'manual_test_noise' : 'footstep' });
    }
    if (this.alertState === 'active' && this.sharedLastKnownPosition !== null && member.id !== this.alertSourceId) {
      stimuli.push({ id: `squad-report:${member.id}:${this.logicalTick}`, sequence: 15, logicalTick: this.logicalTick, kind: 'squad_report', sourceId: this.alertSourceId ?? 'squad', subjectId: 'player', reportedPosition: toVector3(this.sharedLastKnownPosition), confidence: 0.82 });
    }
    return stimuli;
  }

  private moveMemberToward(member: MutableMember, target: GridPoint, occupiedCells: ReadonlySet<string>, lanes: readonly FireLane[], maxDistance: number): void {
    if (distance(member.position, target) <= ARRIVAL_RADIUS) {
      member.position = roundWorldPoint(target);
      member.path = [target];
      member.stalledTicks = 0;
      return;
    }
    const startCell = toNavCell(member.position);
    const goalCell = toNavCell(target);
    const transientBlocked = new Set(occupiedCells);
    transientBlocked.add(gridKey(toNavCell(this.player)));
    for (const key of buildFireLaneBlockedCells(tacticalWizardNavigationGrid, lanes, member.id)) transientBlocked.add(key);
    transientBlocked.delete(gridKey(startCell));
    transientBlocked.delete(gridKey(goalCell));
    const path = findPath(tacticalWizardNavigationGrid, startCell, goalCell, transientBlocked);
    member.path = path.length === 0 ? [] : [{ ...member.position }, ...path.slice(1)];
    if (path.length === 0) {
      member.stalledTicks += 1;
      return;
    }
    const waypoint = path.length === 1 ? target : path[1]!;
    const candidate = moveToward(member.position, waypoint, maxDistance);
    const candidateCell = toNavCell(candidate);
    if (!isWorldWalkable(candidate) || occupiedCells.has(gridKey(candidateCell)) || distance(candidate, this.player) < 0.65) {
      member.stalledTicks += 1;
      return;
    }
    const previous = member.position;
    member.position = roundWorldPoint(candidate);
    const dx = member.position.x - previous.x;
    const dy = member.position.y - previous.y;
    if (Math.abs(dx) > POSITION_EPSILON || Math.abs(dy) > POSITION_EPSILON) {
      member.facing = normalizeDirection({ x: dx, y: dy });
      member.stalledTicks = 0;
      if (this.motionFrame % MOTION_LOG_EVERY_FRAMES === 0) {
        this.log('agent', member.id, member.label, 'move', `${member.label} moved for tactical task ${member.task}.`, { from: { ...previous }, to: { ...member.position }, tacticalTarget: { ...target }, role: member.role, task: member.task, tactic: this.tactic, motionFrame: this.motionFrame });
      }
    } else member.stalledTicks += 1;
    if (distance(member.position, target) <= Math.max(maxDistance, ARRIVAL_RADIUS)) member.position = roundWorldPoint(target);
  }

  private advancePatrolIfReady(): void {
    if (this.alertState !== 'idle' || !this.members.every((member) => distance(member.position, this.getPatrolTarget(member)) <= ARRIVAL_RADIUS)) return;
    this.patrolIndex = (this.patrolIndex + 1) % tacticalWizardTestMap.patrolPoints.length;
    this.pushEvent(`T${this.logicalTick}: squad patrol waypoint advanced to P${this.patrolIndex + 1}.`);
  }

  private getPatrolTarget(member: MutableMember): GridPoint {
    const base = tacticalWizardTestMap.patrolPoints[this.patrolIndex]!;
    const candidates = [{ x: base.x + member.patrolOffset.x, y: base.y + member.patrolOffset.y }, { x: base.x + member.patrolOffset.x, y: base.y }, { x: base.x, y: base.y + member.patrolOffset.y }, base];
    return candidates.find((candidate) => isWalkable(tacticalWizardNavigationGrid, candidate)) ?? base;
  }

  private canSeePlayer(member: MutableMember): boolean {
    const range = distance(member.position, this.player);
    if (range > this.visionRange || !hasWorldLineOfSight(member.position, this.player)) return false;
    if (range <= POSITION_EPSILON) return true;
    const direction = { x: (this.player.x - member.position.x) / range, y: (this.player.y - member.position.y) / range };
    const facingLength = Math.hypot(member.facing.x, member.facing.y) || 1;
    const facing = { x: member.facing.x / facingLength, y: member.facing.y / facingLength };
    const dot = Math.max(-1, Math.min(1, direction.x * facing.x + direction.y * facing.y));
    return Math.acos(dot) * 180 / Math.PI <= this.visionFovDegrees / 2;
  }

  private faceToward(member: MutableMember, point: GridPoint): void {
    const dx = point.x - member.position.x;
    const dy = point.y - member.position.y;
    if (Math.abs(dx) > POSITION_EPSILON || Math.abs(dy) > POSITION_EPSILON) member.facing = normalizeDirection({ x: dx, y: dy });
  }

  private noisyPerceivedPosition(member: MutableMember): GridPoint {
    const memberIndex = this.members.findIndex((candidate) => candidate.id === member.id);
    const offsets = [{ x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }];
    const offset = offsets[(this.logicalTick + Math.max(0, memberIndex)) % offsets.length]!;
    const candidate = roundWorldPoint({ x: this.player.x + offset.x, y: this.player.y + offset.y });
    return isWorldWalkable(candidate) ? candidate : this.player;
  }

  private setPlayerPositionInternal(point: GridPoint, source: string): boolean {
    const candidate = roundWorldPoint(point);
    if (!isWorldWalkable(candidate) || this.members.some((member) => distance(member.position, candidate) < 0.7)) return false;
    if (samePoint(this.player, candidate)) return true;
    const previous = this.player;
    this.player = candidate;
    this.log('player', 'player', 'Player', 'player_move', `Player ${source} moved.`, { from: { ...previous }, to: { ...candidate }, source });
    return true;
  }

  private resetMember(member: MutableMember): void {
    member.role = 'patrol';
    member.task = 'patrol';
    member.coverSlot = null;
    member.coverState = 'none';
    member.tacticalTarget = null;
    member.firePulse = 0;
    member.fireTarget = null;
    member.fireOrigin = null;
    member.fireBlockedByFriend = null;
    member.searchPulse = 0;
    member.searchWaypoints = [];
    member.searchIndex = 0;
    member.searchScanIndex = 0;
    member.searchHoldFrames = 0;
    member.searchLookOffsets = [];
    member.searchLookTarget = null;
    member.searchComplete = false;
    member.stalledTicks = 0;
  }

  private pushEvent(message: string): void {
    this.eventLog.unshift(message);
    this.eventLog.splice(30);
  }

  private flankSide(): -1 | 1 {
    return (this.maneuverCycle + this.boundingPhase) % 2 === 0 ? 1 : -1;
  }

  private logRoleAssignments(): void {
    this.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'roles', `Roles / tasks assigned for ${this.tactic}.`, { assignments: this.members.map((member) => `${member.id}=${member.role}/${member.task}`), tactic: this.tactic });
  }

  private logPlan(): void {
    this.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', `Tactical task plan committed for ${this.tactic}.`, {
      tactic: this.tactic,
      cycle: this.maneuverCycle,
      spread: Number(pairwiseSpread(this.members.map((member) => member.position)).toFixed(2)),
      safeFireLanes: this.safeFireLaneCount(),
      targets: this.members.map((member) => `${member.id}:${member.task}->${member.tacticalTarget ? `${member.tacticalTarget.x},${member.tacticalTarget.y}` : 'hold'}`),
    });
  }

  private log(category: RunLogCategory, actorId: string, actorLabel: string, event: RunLogEvent, summary: string, data: Readonly<Record<string, RunLogValue>>): void {
    this.runLog.push({ sequence: this.runLogSequence++, logicalTick: this.logicalTick, timeSeconds: Number(this.elapsedSeconds.toFixed(3)), category, actorId, actorLabel, event, summary, data });
    if (this.runLog.length > RUN_LOG_LIMIT) this.runLog.splice(0, this.runLog.length - RUN_LOG_LIMIT);
  }
}

function createMembers(): MutableMember[] {
  return MEMBER_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    visualKey: definition.visualKey,
    patrolOffset: definition.patrolOffset,
    runtime: createTacticalWizardReferenceRuntime(definition.id),
    position: definition.start,
    facing: { x: 1, y: 0 },
    path: [],
    selectedIntent: 'patrol',
    beliefConfidence: 0,
    beliefSource: 'none',
    targetVisible: false,
    lastKnownPosition: null,
    latestTrace: null,
    latestSnapshot: null,
    wasVisible: false,
    role: 'patrol',
    task: 'patrol',
    coverSlot: null,
    coverState: 'none',
    tacticalTarget: null,
    firePulse: 0,
    fireTarget: null,
    fireOrigin: null,
    fireBlockedByFriend: null,
    peekUntilFrame: 0,
    searchPulse: 0,
    searchWaypoints: [],
    searchIndex: 0,
    searchScanIndex: 0,
    searchHoldFrames: 0,
    searchLookOffsets: [],
    searchLookTarget: null,
    searchComplete: false,
    stalledTicks: 0,
  }));
}

function reserveCell(set: Set<string>, point: GridPoint | null): void {
  if (point !== null) set.add(gridKey(toNavCell(point)));
}
function toVector3(point: GridPoint): Vector3 { return { x: point.x, y: 0, z: point.y }; }
function fromVector3(point: Vector3): GridPoint { return roundWorldPoint({ x: point.x, y: point.z }); }
function distance(a: GridPoint, b: GridPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function samePoint(left: GridPoint, right: GridPoint): boolean { return distance(left, right) <= POSITION_EPSILON; }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function toNavCell(point: GridPoint): GridPoint { return { x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))), y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))) }; }
function isWorldWalkable(point: GridPoint): boolean { return point.x >= 0 && point.y >= 0 && point.x <= tacticalWizardTestMap.width - 1 && point.y <= tacticalWizardTestMap.height - 1 && isWalkable(tacticalWizardNavigationGrid, toNavCell(point)); }
function hasWorldLineOfSight(from: GridPoint, to: GridPoint): boolean { return hasLineOfSight(tacticalWizardNavigationGrid, toNavCell(from), toNavCell(to)); }
function moveToward(from: GridPoint, to: GridPoint, maxDistance: number): GridPoint { const dx = to.x - from.x; const dy = to.y - from.y; const length = Math.hypot(dx, dy); if (length <= maxDistance || length === 0) return { ...to }; const scale = maxDistance / length; return { x: from.x + dx * scale, y: from.y + dy * scale }; }
function normalizeDirection(direction: GridPoint): GridPoint { const length = Math.hypot(direction.x, direction.y) || 1; return { x: direction.x / length, y: direction.y / length }; }
function roundWorldPoint(point: GridPoint): GridPoint { return { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 }; }
