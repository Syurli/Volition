import type { AgentRuntimeSnapshot, DecisionTrace, Stimulus, Vector3 } from '@volition/core';
import { createTacticalWizardReferenceRuntime, decideSquadDoctrine, type SquadTactic } from '@volition/example-tactical-wizard';
import { createGrid, findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint, type NavigationGrid } from './navigation';
import { discoverCoverSlots, selectCoverSlot, type CoverSlot } from './squadTactics';
import { centroid, pairwiseSpread, selectSectorPoint } from './maneuverGeometry';

export interface SimulationOverlaySettings {
  readonly vision: boolean; readonly hearing: boolean; readonly path: boolean; readonly memory: boolean; readonly grid: boolean; readonly cover: boolean;
}
export type SquadAlertState = 'idle' | 'pending' | 'active';
export type TacticalRole = 'patrol' | 'suppressor' | 'mover' | 'observer' | 'flanker' | 'crossfire' | 'assaulter' | 'sweeper' | 'support';
export type RunLogCategory = 'system' | 'player' | 'squad' | 'agent';
export type RunLogEvent = 'session' | 'player_move' | 'player_noise' | 'perception' | 'alert' | 'tactic' | 'roles' | 'plan' | 'decision' | 'move' | 'fire' | 'search';
export type RunLogValue = string | number | boolean | null | GridPoint | readonly string[];
export interface RunLogEntry {
  readonly sequence: number; readonly logicalTick: number; readonly timeSeconds: number; readonly category: RunLogCategory;
  readonly actorId: string; readonly actorLabel: string; readonly event: RunLogEvent; readonly summary: string;
  readonly data: Readonly<Record<string, RunLogValue>>;
}
export interface TacticalWizardAgentView {
  readonly id: string; readonly label: string; readonly visualKey: string; readonly position: GridPoint; readonly facing: GridPoint; readonly path: readonly GridPoint[];
  readonly selectedIntent: string; readonly beliefConfidence: number; readonly beliefSource: string; readonly targetVisible: boolean;
  readonly lastKnownPosition: GridPoint | null; readonly role: TacticalRole; readonly coverTarget: GridPoint | null; readonly peekTarget: GridPoint | null; readonly tacticalTarget: GridPoint | null;
  readonly firePulse: number; readonly fireTarget: GridPoint | null; readonly searchPulse: number; readonly stalledTicks: number;
}
export interface TacticalWizardSquadView {
  readonly id: string; readonly alertState: SquadAlertState; readonly sourceAgentId: string | null; readonly sharedLastKnownPosition: GridPoint | null;
  readonly phase: number; readonly tactic: SquadTactic; readonly tacticReason: string; readonly tacticTicks: number; readonly stationaryTargetTicks: number;
  readonly lostContactTicks: number; readonly maneuverCycle: number; readonly spread: number;
  readonly suppressorId: string | null; readonly moverId: string | null; readonly observerId: string | null;
}
export interface TacticalWizardSimulationState {
  readonly logicalTick: number; readonly agents: readonly TacticalWizardAgentView[]; readonly squad: TacticalWizardSquadView; readonly player: GridPoint;
  readonly patrolPoints: readonly GridPoint[]; readonly patrolIndex: number; readonly coverSlots: readonly CoverSlot[]; readonly hearingRadius: number;
  readonly visionRange: number; readonly visionFovDegrees: number; readonly movementResolution: number; readonly latestTraces: readonly DecisionTrace[]; readonly eventLog: readonly string[]; readonly runLog: readonly RunLogEntry[];
  readonly enemy: GridPoint; readonly enemyFacing: GridPoint; readonly path: readonly GridPoint[]; readonly selectedIntent: string;
  readonly beliefConfidence: number; readonly beliefSource: string; readonly targetVisible: boolean; readonly lastKnownPosition: GridPoint | null;
  readonly latestTrace: DecisionTrace | null; readonly latestSnapshot: AgentRuntimeSnapshot | null; readonly firePulse: number; readonly searchPulse: number;
}

export const SIMULATION_MOVEMENT_SUBDIVISIONS = 4;
const PLAYER_MOVE_STEP = 1 / SIMULATION_MOVEMENT_SUBDIVISIONS;
const AGENT_MOVE_STEP = 0.35;
const POSITION_EPSILON = 0.06;
const STALLED_REPLAN_TICKS = 8;
const ALERT_PROPAGATION_TICKS = 2;
const ALERT_MEMORY_TICKS = 56;
const MIN_BOUNDING_PHASE_TICKS = 4;
const RUN_LOG_LIMIT = 5000;

export const tacticalWizardTestMap = {
  id: 'tactical-wizard-squad-training-ground', name: 'Tactical Wizard Squad Training Ground', width: 48, height: 30,
  blocked: [
    ...rect(8, 3, 4, 7), ...rect(18, 1, 4, 8), ...rect(27, 4, 8, 4), ...rect(39, 2, 5, 7),
    ...rect(4, 13, 8, 3), ...rect(16, 12, 7, 6), ...rect(29, 12, 4, 10), ...rect(38, 14, 8, 4),
    ...rect(8, 22, 9, 4), ...rect(21, 24, 9, 3), ...rect(36, 23, 7, 4),
  ],
  patrolPoints: [{ x: 2, y: 2 }, { x: 14, y: 2 }, { x: 24, y: 9 }, { x: 36, y: 10 }, { x: 46, y: 12 }, { x: 44, y: 27 }, { x: 32, y: 28 }, { x: 18, y: 21 }, { x: 3, y: 20 }] as readonly GridPoint[],
  playerStart: { x: 46, y: 27 } as GridPoint,
};
export const tacticalWizardNavigationGrid: NavigationGrid = createGrid(tacticalWizardTestMap.width, tacticalWizardTestMap.height, tacticalWizardTestMap.blocked);

const MEMBER_DEFINITIONS = [
  { id: 'twr:rifle-squad:alpha', label: 'Alpha', visualKey: 'alpha', start: { x: 2, y: 2 }, patrolOffset: { x: 0, y: 0 } },
  { id: 'twr:rifle-squad:bravo', label: 'Bravo', visualKey: 'bravo', start: { x: 2, y: 4 }, patrolOffset: { x: 0, y: 2 } },
  { id: 'twr:rifle-squad:charlie', label: 'Charlie', visualKey: 'charlie', start: { x: 4, y: 2 }, patrolOffset: { x: 2, y: 0 } },
] as const;

interface MutableMember {
  readonly id: string; readonly label: string; readonly visualKey: string; readonly patrolOffset: GridPoint; runtime: ReturnType<typeof createTacticalWizardReferenceRuntime>;
  position: GridPoint; facing: GridPoint; path: readonly GridPoint[]; selectedIntent: string; beliefConfidence: number; beliefSource: string;
  targetVisible: boolean; lastKnownPosition: GridPoint | null; latestTrace: DecisionTrace | null; latestSnapshot: AgentRuntimeSnapshot | null;
  wasVisible: boolean; role: TacticalRole; coverSlot: CoverSlot | null; tacticalTarget: GridPoint | null; firePulse: number; fireTarget: GridPoint | null;
  searchPulse: number; stalledTicks: number;
}

export class TacticalWizardSimulation {
  private members: MutableMember[] = createMembers(); private logicalTick = 0; private player: GridPoint = tacticalWizardTestMap.playerStart; private patrolIndex = 1;
  private pendingNoiseIntensity = 0; private alertState: SquadAlertState = 'idle'; private alertSourceId: string | null = null; private sharedLastKnownPosition: GridPoint | null = null;
  private pendingAlertUntil = 0; private alertExpiresAt = 0; private suppressorId: string | null = null; private moverId: string | null = null; private observerId: string | null = null;
  private boundingPhase = 0; private phaseStartedTick = 0; private coverSlots: readonly CoverSlot[] = [];
  private tactic: SquadTactic = 'bounding'; private tacticStartedTick = 0; private tacticReason = 'Initial doctrine: bounded advance.'; private contactStartedTick = 0;
  private stationaryTargetTicks = 0; private lostContactTicks = 0; private lastObservedPlayer: GridPoint | null = null; private maneuverCycle = 0;
  private readonly eventLog: string[] = ['Simulation ready. Three-member squad patrol initialized.'];
  private runLog: RunLogEntry[] = []; private runLogSequence = 0;
  readonly stepSeconds = 0.25; readonly hearingRadius = 10; readonly visionRange = 12; readonly visionFovDegrees = 120;

  constructor() { this.log('system', 'simulation', 'Volition Simulation', 'session', 'Reference simulation session started.', { map: tacticalWizardTestMap.id }); }

  reset(): TacticalWizardSimulationState {
    for (const member of this.members) member.runtime.dispose();
    this.members = createMembers(); this.logicalTick = 0; this.player = tacticalWizardTestMap.playerStart; this.patrolIndex = 1; this.pendingNoiseIntensity = 0;
    this.alertState = 'idle'; this.alertSourceId = null; this.sharedLastKnownPosition = null; this.pendingAlertUntil = 0; this.alertExpiresAt = 0;
    this.suppressorId = null; this.moverId = null; this.observerId = null; this.boundingPhase = 0; this.phaseStartedTick = 0; this.coverSlots = [];
    this.tactic = 'bounding'; this.tacticStartedTick = 0; this.tacticReason = 'Initial doctrine: bounded advance.'; this.contactStartedTick = 0; this.stationaryTargetTicks = 0; this.lostContactTicks = 0; this.lastObservedPlayer = null; this.maneuverCycle = 0;
    this.eventLog.splice(0, this.eventLog.length, 'Simulation reset. Squad patrol initialized.'); this.runLog = []; this.runLogSequence = 0;
    this.log('system', 'simulation', 'Volition Simulation', 'session', 'Simulation reset; new run log started.', { map: tacticalWizardTestMap.id });
    return this.getState();
  }

  emitNoise(intensity = 1): void {
    const value = Math.max(this.pendingNoiseIntensity, clamp01(intensity)); this.pendingNoiseIntensity = value;
    this.pushEvent(`T${this.logicalTick}: player test noise emitted.`);
    this.log('player', 'player', 'Player', 'player_noise', 'Player emitted a test noise.', { intensity: value, position: { ...this.player } });
  }

  setPlayerPosition(point: GridPoint): boolean { return this.setPlayerPositionInternal(point, 'teleport'); }
  nudgePlayer(dx: number, dy: number): boolean {
    const moved = this.setPlayerPositionInternal({ x: this.player.x + dx * PLAYER_MOVE_STEP, y: this.player.y + dy * PLAYER_MOVE_STEP }, 'direct-control');
    if (moved) this.pendingNoiseIntensity = Math.max(this.pendingNoiseIntensity, 0.35);
    return moved;
  }

  step(): TacticalWizardSimulationState {
    for (const member of this.members) { member.firePulse = Math.max(0, member.firePulse - 1); member.fireTarget = null; member.searchPulse = Math.max(0, member.searchPulse - 1); }
    const visibility = new Map(this.members.map((member) => [member.id, this.canSeePlayer(member)]));
    this.updateSquadAlert(visibility);
    if (this.alertState === 'active') { this.updateDoctrine(visibility); this.ensureTacticalPlan(); }

    for (const member of this.members) {
      const visible = visibility.get(member.id) === true; const patrolTarget = this.getPatrolTarget(member);
      const values = {
        selfPosition: toVector3(member.position), selfFacing: { x: member.facing.x, y: 0, z: member.facing.y }, patrolTarget: toVector3(patrolTarget), weaponState: 'ready',
        squadId: 'twr:rifle-squad-01', squadRole: member.role, squadAlertState: this.alertState, squadTactic: this.tactic,
        ...(member.tacticalTarget === null ? {} : { engagementPosition: toVector3(member.tacticalTarget) }), ...(member.coverSlot === null ? {} : { coverTarget: toVector3(member.coverSlot.position) }),
      };
      const snapshot = member.runtime.tick({ tick: { logicalTick: this.logicalTick, deltaSeconds: this.logicalTick === 0 ? 0 : this.stepSeconds, seed: 1337 }, context: { agentId: member.id, values, capabilities: ['move_to', 'aim_at', 'fire', 'reload'] }, stimuli: this.buildStimuli(member, visible), actionResults: [] });
      member.latestSnapshot = snapshot; member.latestTrace = member.runtime.getTrace().at(-1) ?? null; member.selectedIntent = snapshot.selectedIntent.id;
      member.beliefConfidence = snapshot.belief.confidence; member.beliefSource = snapshot.belief.source; member.targetVisible = snapshot.belief.confirmedVisible;
      member.lastKnownPosition = snapshot.belief.estimatedPosition === null ? null : fromVector3(snapshot.belief.estimatedPosition);
      this.log('agent', member.id, member.label, 'decision', `${member.label} selected ${member.selectedIntent} as ${member.role}.`, {
        intent: member.selectedIntent, role: member.role, tactic: this.tactic, position: { ...member.position }, belief: Number(member.beliefConfidence.toFixed(3)), beliefSource: member.beliefSource, targetVisible: member.targetVisible,
      });
    }

    const occupiedCells = new Set(this.members.map((member) => gridKey(toNavCell(member.position))));
    for (const member of [...this.members].sort((left, right) => left.id.localeCompare(right.id, 'en'))) {
      occupiedCells.delete(gridKey(toNavCell(member.position))); this.executeMember(member, occupiedCells); occupiedCells.add(gridKey(toNavCell(member.position)));
    }
    if (new Set(this.members.map((member) => gridKey(toNavCell(member.position)))).size !== this.members.length) throw new Error('Simulation invariant violated: squad members share a navigation cell.');
    this.advancePatrolIfReady(); this.advanceBoundingIfReady();
    for (const member of this.members) member.wasVisible = visibility.get(member.id) === true;
    this.pendingNoiseIntensity = 0; this.logicalTick += 1; return this.getState();
  }

  getState(): TacticalWizardSimulationState {
    const primary = this.members[0]!;
    const views = this.members.map((member): TacticalWizardAgentView => ({
      id: member.id, label: member.label, visualKey: member.visualKey, position: member.position, facing: member.facing, path: member.path, selectedIntent: member.selectedIntent,
      beliefConfidence: member.beliefConfidence, beliefSource: member.beliefSource, targetVisible: member.targetVisible, lastKnownPosition: member.lastKnownPosition,
      role: member.role, coverTarget: member.coverSlot?.position ?? null, peekTarget: member.coverSlot?.peekPosition ?? null, tacticalTarget: member.tacticalTarget,
      firePulse: member.firePulse, fireTarget: member.fireTarget, searchPulse: member.searchPulse, stalledTicks: member.stalledTicks,
    }));
    return {
      logicalTick: this.logicalTick, agents: views,
      squad: {
        id: 'twr:rifle-squad-01', alertState: this.alertState, sourceAgentId: this.alertSourceId, sharedLastKnownPosition: this.sharedLastKnownPosition, phase: this.boundingPhase,
        tactic: this.tactic, tacticReason: this.tacticReason, tacticTicks: Math.max(0, this.logicalTick - this.tacticStartedTick), stationaryTargetTicks: this.stationaryTargetTicks,
        lostContactTicks: this.lostContactTicks, maneuverCycle: this.maneuverCycle, spread: Number(pairwiseSpread(this.members.map((member) => member.position)).toFixed(2)),
        suppressorId: this.suppressorId, moverId: this.moverId, observerId: this.observerId,
      },
      player: this.player, patrolPoints: tacticalWizardTestMap.patrolPoints, patrolIndex: this.patrolIndex, coverSlots: this.coverSlots, hearingRadius: this.hearingRadius,
      visionRange: this.visionRange, visionFovDegrees: this.visionFovDegrees, movementResolution: PLAYER_MOVE_STEP,
      latestTraces: this.members.flatMap((member) => member.latestTrace === null ? [] : [member.latestTrace]), eventLog: [...this.eventLog], runLog: [...this.runLog],
      enemy: primary.position, enemyFacing: primary.facing, path: primary.path, selectedIntent: primary.selectedIntent, beliefConfidence: primary.beliefConfidence,
      beliefSource: primary.beliefSource, targetVisible: primary.targetVisible, lastKnownPosition: primary.lastKnownPosition, latestTrace: primary.latestTrace,
      latestSnapshot: primary.latestSnapshot, firePulse: primary.firePulse, searchPulse: primary.searchPulse,
    };
  }

  private setPlayerPositionInternal(point: GridPoint, source: string): boolean {
    const candidate = roundWorldPoint(point);
    if (!isWorldWalkable(candidate) || this.members.some((member) => distance(member.position, candidate) < 0.7)) return false;
    if (samePoint(this.player, candidate)) return true;
    const previous = this.player; this.player = candidate;
    this.log('player', 'player', 'Player', 'player_move', `Player ${source} moved.`, { from: { ...previous }, to: { ...candidate }, source });
    return true;
  }

  private updateSquadAlert(visibility: ReadonlyMap<string, boolean>): void {
    const visibleMembers = this.members.filter((member) => visibility.get(member.id) === true);
    const reporter = [...visibleMembers].sort((left, right) => left.id.localeCompare(right.id, 'en'))[0];
    if (this.alertState === 'active') this.lostContactTicks = reporter === undefined ? this.lostContactTicks + 1 : 0;
    if (reporter !== undefined) {
      if (this.lastObservedPlayer !== null && distance(this.lastObservedPlayer, this.player) <= PLAYER_MOVE_STEP) this.stationaryTargetTicks += 1; else this.stationaryTargetTicks = 0;
      this.lastObservedPlayer = { ...this.player }; this.sharedLastKnownPosition = { ...this.player }; this.alertSourceId = reporter.id; this.alertExpiresAt = this.logicalTick + ALERT_MEMORY_TICKS;
      if (this.alertState === 'idle') {
        this.alertState = 'pending'; this.pendingAlertUntil = this.logicalTick + ALERT_PROPAGATION_TICKS;
        this.pushEvent(`T${this.logicalTick}: ${reporter.label} confirmed contact; squad alert pending.`);
        this.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'alert', `${reporter.label} confirmed contact; shared alert pending.`, { reporter: reporter.id, lastKnown: { ...this.player } });
      }
    }
    if (this.alertState === 'pending' && this.logicalTick >= this.pendingAlertUntil) this.activateSquad();
    if (this.alertState === 'active' && reporter === undefined && this.logicalTick > this.alertExpiresAt) this.clearSquadAlert();
  }

  private activateSquad(): void {
    this.alertState = 'active'; const source = this.members.find((member) => member.id === this.alertSourceId) ?? this.members[0]!;
    const others = this.members.filter((member) => member.id !== source.id).sort((left, right) => left.id.localeCompare(right.id, 'en'));
    this.suppressorId = source.id; this.moverId = others[0]?.id ?? null; this.observerId = others[1]?.id ?? null; this.boundingPhase = 0; this.phaseStartedTick = this.logicalTick; this.contactStartedTick = this.logicalTick;
    this.tactic = 'bounding'; this.tacticStartedTick = this.logicalTick; this.tacticReason = 'Contact confirmed; establish initial bounded pressure.'; this.applyRoles(); this.refreshTacticalPlan();
    this.pushEvent(`T${this.logicalTick}: shared alert active; ${source.label} suppresses while ${others[0]?.label ?? 'member'} moves.`);
    this.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'alert', 'Shared combat alert activated.', { source: source.id, tactic: this.tactic }); this.logRoleAssignments();
  }

  private clearSquadAlert(): void {
    this.alertState = 'idle'; this.alertSourceId = null; this.sharedLastKnownPosition = null; this.suppressorId = null; this.moverId = null; this.observerId = null; this.coverSlots = [];
    this.stationaryTargetTicks = 0; this.lostContactTicks = 0; this.lastObservedPlayer = null;
    for (const member of this.members) { member.role = 'patrol'; member.coverSlot = null; member.tacticalTarget = null; member.stalledTicks = 0; }
    this.pushEvent(`T${this.logicalTick}: squad alert expired; formation returns to patrol.`);
    this.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'alert', 'Shared alert expired; squad returned to patrol.', {});
  }

  private updateDoctrine(visibility: ReadonlyMap<string, boolean>): void {
    const decision = decideSquadDoctrine(this.tactic, {
      contactTicks: Math.max(0, this.logicalTick - this.contactStartedTick), stationaryTargetTicks: this.stationaryTargetTicks,
      tacticTicks: Math.max(0, this.logicalTick - this.tacticStartedTick), boundingPhase: this.boundingPhase,
      visibleMembers: this.members.filter((member) => visibility.get(member.id) === true).length,
      stalledMembers: this.members.filter((member) => member.stalledTicks >= STALLED_REPLAN_TICKS).length,
      lostContactTicks: this.lostContactTicks, maneuverCycle: this.maneuverCycle,
    });
    this.tacticReason = decision.reason;
    if (decision.tactic !== this.tactic) this.transitionTactic(decision.tactic, decision.reason, decision.rotateRoles);
  }

  private transitionTactic(next: SquadTactic, reason: string, rotateRoles: boolean): void {
    const previous = this.tactic;
    if (rotateRoles) this.rotateRoleOrder();
    if (previous === 'regroup' && next === 'bounding') this.maneuverCycle += 1;
    this.tactic = next; this.tacticStartedTick = this.logicalTick; this.tacticReason = reason; this.applyRoles(); this.refreshTacticalPlan();
    this.pushEvent(`T${this.logicalTick}: tactic ${previous} → ${next}. ${reason}`);
    this.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'tactic', `Tactic ${previous} → ${next}.`, { from: previous, to: next, reason, cycle: this.maneuverCycle }); this.logRoleAssignments();
  }

  private rotateRoleOrder(): void {
    if (this.suppressorId === null || this.moverId === null || this.observerId === null) return;
    const oldSuppressor = this.suppressorId; const oldMover = this.moverId; const oldObserver = this.observerId;
    this.suppressorId = oldObserver; this.moverId = oldSuppressor; this.observerId = oldMover;
  }

  private applyRoles(): void {
    for (const member of this.members) {
      if (this.alertState !== 'active') { member.role = 'patrol'; continue; }
      if (this.tactic === 'bounding') member.role = member.id === this.suppressorId ? 'suppressor' : member.id === this.moverId ? 'mover' : 'observer';
      else if (this.tactic === 'flank') member.role = member.id === this.suppressorId ? 'suppressor' : member.id === this.moverId ? 'flanker' : 'support';
      else if (this.tactic === 'crossfire') member.role = member.id === this.suppressorId ? 'support' : 'crossfire';
      else if (this.tactic === 'assault') member.role = member.id === this.moverId || member.id === this.observerId ? 'assaulter' : 'support';
      else if (this.tactic === 'sweep') member.role = member.id === this.suppressorId ? 'support' : 'sweeper';
      else member.role = 'support';
    }
  }

  private ensureTacticalPlan(): void {
    if (this.sharedLastKnownPosition === null) return;
    const missingTarget = this.members.some((member) => member.tacticalTarget === null);
    const stalled = this.members.some((member) => member.stalledTicks >= STALLED_REPLAN_TICKS);
    if (missingTarget || stalled) {
      if (stalled) this.pushEvent(`T${this.logicalTick}: tactical element stalled; ${this.tactic} plan recalculated.`);
      this.refreshTacticalPlan();
    }
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

  private resetMemberPlans(): void { for (const member of this.members) { member.coverSlot = null; member.tacticalTarget = null; member.stalledTicks = 0; } }

  private refreshBoundingPlan(): void {
    const threat = this.sharedLastKnownPosition; if (threat === null) return; const threatCell = toNavCell(threat);
    this.coverSlots = discoverCoverSlots(tacticalWizardNavigationGrid, threatCell); this.resetMemberPlans(); const reserved = new Set<string>();
    for (const id of [this.moverId, this.observerId, this.suppressorId].filter((value): value is string => value !== null)) {
      const member = this.members.find((entry) => entry.id === id); if (member === undefined) continue; const mode = member.id === this.moverId ? 'advance' : 'support';
      const slot = selectCoverSlot(tacticalWizardNavigationGrid, this.coverSlots, toNavCell(member.position), threatCell, reserved, mode); member.coverSlot = slot; if (slot !== null) reserved.add(slot.id);
      member.tacticalTarget = member.id === this.suppressorId ? (hasWorldLineOfSight(member.position, threat) ? { ...member.position } : slot?.peekPosition ?? { ...member.position }) : slot?.position ?? { ...member.position };
    }
  }

  private refreshFlankPlan(): void {
    const threat = this.sharedLastKnownPosition; if (threat === null) return; const origin = centroid(this.members.map((member) => member.position)); const side = this.flankSide();
    this.coverSlots = discoverCoverSlots(tacticalWizardNavigationGrid, toNavCell(threat)); this.resetMemberPlans(); const reserved = new Set<string>();
    for (const member of this.members) {
      if (member.id === this.moverId) {
        const point = selectSectorPoint(tacticalWizardNavigationGrid, toNavCell(member.position), toNavCell(threat), toNavCell(origin), reserved, { angleOffsetDegrees: side * 88, angleToleranceDegrees: 34, minRange: 5, maxRange: 9, desiredRange: 6.5, requireLineOfSight: true, minMoveDistance: 3 });
        member.tacticalTarget = point ?? this.fallbackFlank(member, threat, side); reserve(reserved, member.tacticalTarget);
      } else if (member.id === this.suppressorId) {
        const slot = selectCoverSlot(tacticalWizardNavigationGrid, this.coverSlots, toNavCell(member.position), toNavCell(threat), new Set<string>(), 'support'); member.coverSlot = slot;
        member.tacticalTarget = hasWorldLineOfSight(member.position, threat) ? { ...member.position } : slot?.peekPosition ?? slot?.position ?? { ...member.position };
      } else {
        const point = selectSectorPoint(tacticalWizardNavigationGrid, toNavCell(member.position), toNavCell(threat), toNavCell(origin), reserved, { angleOffsetDegrees: -side * 42, angleToleranceDegrees: 45, minRange: 8, maxRange: 13, desiredRange: 10, preferCovered: true, minMoveDistance: 2 });
        member.tacticalTarget = point ?? { ...member.position }; reserve(reserved, member.tacticalTarget);
      }
    }
  }

  private refreshCrossfirePlan(): void {
    const threat = this.sharedLastKnownPosition; if (threat === null) return; const origin = centroid(this.members.map((member) => member.position)); const side = this.flankSide();
    this.coverSlots = discoverCoverSlots(tacticalWizardNavigationGrid, toNavCell(threat)); this.resetMemberPlans(); const reserved = new Set<string>();
    const shooters = [this.moverId, this.observerId].filter((id): id is string => id !== null);
    shooters.forEach((id, index) => {
      const member = this.members.find((entry) => entry.id === id); if (member === undefined) return;
      const offset = (index === 0 ? side : -side) * 72;
      const point = selectSectorPoint(tacticalWizardNavigationGrid, toNavCell(member.position), toNavCell(threat), toNavCell(origin), reserved, { angleOffsetDegrees: offset, angleToleranceDegrees: 36, minRange: 5, maxRange: 9, desiredRange: 6.8, requireLineOfSight: true, minMoveDistance: 2.5 });
      member.tacticalTarget = point ?? this.fallbackFlank(member, threat, index === 0 ? side : -side); reserve(reserved, member.tacticalTarget);
    });
    const support = this.suppressorId === null ? undefined : this.members.find((entry) => entry.id === this.suppressorId);
    if (support !== undefined) {
      const point = selectSectorPoint(tacticalWizardNavigationGrid, toNavCell(support.position), toNavCell(threat), toNavCell(origin), reserved, { angleOffsetDegrees: 0, angleToleranceDegrees: 50, minRange: 8, maxRange: 13, desiredRange: 10, preferCovered: true, minMoveDistance: 1.5 });
      support.tacticalTarget = point ?? { ...support.position }; reserve(reserved, support.tacticalTarget);
    }
  }

  private refreshAssaultPlan(): void {
    const threat = this.sharedLastKnownPosition; if (threat === null) return; const origin = centroid(this.members.map((member) => member.position)); const side = this.flankSide();
    this.coverSlots = discoverCoverSlots(tacticalWizardNavigationGrid, toNavCell(threat)); this.resetMemberPlans(); const reserved = new Set<string>();
    const assaulters = [this.moverId, this.observerId].filter((id): id is string => id !== null);
    assaulters.forEach((id, index) => {
      const member = this.members.find((entry) => entry.id === id); if (member === undefined) return;
      const offset = (index === 0 ? side : -side) * 34;
      const point = selectSectorPoint(tacticalWizardNavigationGrid, toNavCell(member.position), toNavCell(threat), toNavCell(origin), reserved, { angleOffsetDegrees: offset, angleToleranceDegrees: 44, minRange: 2.5, maxRange: 4.75, desiredRange: 3.4, requireLineOfSight: true, minMoveDistance: 1.5 });
      member.tacticalTarget = point ?? { ...member.position }; reserve(reserved, member.tacticalTarget);
    });
    const support = this.suppressorId === null ? undefined : this.members.find((entry) => entry.id === this.suppressorId);
    if (support !== undefined) {
      const point = selectSectorPoint(tacticalWizardNavigationGrid, toNavCell(support.position), toNavCell(threat), toNavCell(origin), reserved, { angleOffsetDegrees: 0, angleToleranceDegrees: 55, minRange: 7, maxRange: 12, desiredRange: 9, preferCovered: true, minMoveDistance: 1 });
      support.tacticalTarget = point ?? { ...support.position }; reserve(reserved, support.tacticalTarget);
    }
  }

  private refreshSweepPlan(): void {
    const lkp = this.sharedLastKnownPosition; if (lkp === null) return; const origin = centroid(this.members.map((member) => member.position)); const side = this.flankSide();
    this.coverSlots = discoverCoverSlots(tacticalWizardNavigationGrid, toNavCell(lkp)); this.resetMemberPlans(); const reserved = new Set<string>();
    const sweepers = [this.moverId, this.observerId].filter((id): id is string => id !== null);
    sweepers.forEach((id, index) => {
      const member = this.members.find((entry) => entry.id === id); if (member === undefined) return;
      const offset = (index === 0 ? side : -side) * 78;
      const point = selectSectorPoint(tacticalWizardNavigationGrid, toNavCell(member.position), toNavCell(lkp), toNavCell(origin), reserved, { angleOffsetDegrees: offset, angleToleranceDegrees: 52, minRange: 3, maxRange: 7, desiredRange: 5, minMoveDistance: 2.5 });
      member.tacticalTarget = point ?? { ...member.position }; reserve(reserved, member.tacticalTarget);
    });
    const support = this.suppressorId === null ? undefined : this.members.find((entry) => entry.id === this.suppressorId);
    if (support !== undefined) {
      const point = selectSectorPoint(tacticalWizardNavigationGrid, toNavCell(support.position), toNavCell(lkp), toNavCell(origin), reserved, { angleOffsetDegrees: 0, angleToleranceDegrees: 65, minRange: 6, maxRange: 11, desiredRange: 8, preferCovered: true, minMoveDistance: 1.5 });
      support.tacticalTarget = point ?? { ...support.position }; reserve(reserved, support.tacticalTarget);
    }
  }

  private refreshRegroupPlan(): void {
    const threat = this.sharedLastKnownPosition; if (threat === null) return; const origin = centroid(this.members.map((member) => member.position)); const side = this.flankSide();
    this.coverSlots = discoverCoverSlots(tacticalWizardNavigationGrid, toNavCell(threat)); this.resetMemberPlans(); const reserved = new Set<string>();
    const offsets = [side * 58, 0, -side * 58];
    this.members.forEach((member, index) => {
      const point = selectSectorPoint(tacticalWizardNavigationGrid, toNavCell(member.position), toNavCell(threat), toNavCell(origin), reserved, { angleOffsetDegrees: offsets[index] ?? 0, angleToleranceDegrees: 54, minRange: 9, maxRange: 15, desiredRange: 11, preferCovered: true, minMoveDistance: 3 });
      if (point !== null) { member.tacticalTarget = point; reserve(reserved, point); return; }
      const slot = selectCoverSlot(tacticalWizardNavigationGrid, this.coverSlots, toNavCell(member.position), toNavCell(threat), new Set<string>(), 'support'); member.coverSlot = slot; member.tacticalTarget = slot?.position ?? { ...member.position };
    });
  }

  private fallbackFlank(member: MutableMember, threat: GridPoint, side: number): GridPoint {
    const slot = selectCoverSlot(tacticalWizardNavigationGrid, this.coverSlots, toNavCell(member.position), toNavCell(threat), new Set<string>(), 'flank', side); member.coverSlot = slot;
    return slot?.peekPosition ?? slot?.position ?? { ...member.position };
  }

  private advanceBoundingIfReady(): void {
    if (this.alertState !== 'active' || this.tactic !== 'bounding' || this.moverId === null || this.suppressorId === null || this.logicalTick - this.phaseStartedTick < MIN_BOUNDING_PHASE_TICKS) return;
    const mover = this.members.find((member) => member.id === this.moverId); if (mover?.coverSlot === null || mover?.coverSlot === undefined || !samePoint(mover.position, mover.coverSlot.position)) return;
    const previousSuppressor = this.suppressorId; this.suppressorId = this.moverId; this.moverId = previousSuppressor; this.boundingPhase += 1; this.phaseStartedTick = this.logicalTick; this.applyRoles(); this.refreshBoundingPlan();
    this.pushEvent(`T${this.logicalTick}: bounding phase ${this.boundingPhase}; role handoff.`); this.logRoleAssignments(); this.logPlan();
  }

  private buildStimuli(member: MutableMember, visible: boolean): readonly Stimulus[] {
    const stimuli: Stimulus[] = [];
    if (visible) {
      stimuli.push({ id: `visual:player:${member.id}:${this.logicalTick}`, sequence: 20, logicalTick: this.logicalTick, kind: 'visual_actor', actorId: 'player', visible: true, position: toVector3(this.player), relation: 'hostile' });
      if (!member.wasVisible) { this.pushEvent(`T${this.logicalTick}: ${member.label} visual contact confirmed.`); this.log('agent', member.id, member.label, 'perception', `${member.label} acquired visual contact.`, { position: { ...this.player } }); }
    } else if (member.wasVisible) {
      stimuli.push({ id: `visual:player:${member.id}:${this.logicalTick}:lost`, sequence: 20, logicalTick: this.logicalTick, kind: 'visual_actor', actorId: 'player', visible: false, relation: 'hostile' });
      this.pushEvent(`T${this.logicalTick}: ${member.label} lost visual; live player position withheld.`); this.log('agent', member.id, member.label, 'perception', `${member.label} lost visual contact; hidden live position is withheld.`, { lastKnown: member.lastKnownPosition });
    }
    if (this.pendingNoiseIntensity > 0 && distance(member.position, this.player) <= this.hearingRadius) {
      const perceived = this.noisyPerceivedPosition(member); stimuli.push({ id: `noise:player:${member.id}:${this.logicalTick}`, sequence: 10, logicalTick: this.logicalTick, kind: 'noise', sourceId: 'player', perceivedPosition: toVector3(perceived), intensity: this.pendingNoiseIntensity, actionKind: this.pendingNoiseIntensity >= 0.8 ? 'manual_test_noise' : 'footstep' });
    }
    if (this.alertState === 'active' && this.sharedLastKnownPosition !== null && member.id !== this.alertSourceId) stimuli.push({ id: `squad-report:${member.id}:${this.logicalTick}`, sequence: 15, logicalTick: this.logicalTick, kind: 'squad_report', sourceId: this.alertSourceId ?? 'squad', subjectId: 'player', reportedPosition: toVector3(this.sharedLastKnownPosition), confidence: 0.82 });
    return stimuli;
  }

  private executeMember(member: MutableMember, occupiedCells: Set<string>): void {
    if (this.alertState === 'active' && this.sharedLastKnownPosition !== null) {
      const target = member.tacticalTarget;
      if (this.tactic === 'sweep') {
        if (target !== null) this.moveMemberToward(member, target, occupiedCells); this.faceToward(member, this.sharedLastKnownPosition); member.searchPulse = 6;
        if (this.logicalTick % 8 === 0) this.log('agent', member.id, member.label, 'search', `${member.label} is sweeping a separated LKP sector.`, { role: member.role, target: target ?? null });
        return;
      }
      if (this.tactic === 'regroup') {
        if (target !== null) this.moveMemberToward(member, target, occupiedCells); this.faceToward(member, this.sharedLastKnownPosition);
        if (member.id === this.suppressorId && member.targetVisible && this.logicalTick % 6 === 0) this.fireAt(member, this.player, 'regroup cover');
        return;
      }
      if (this.tactic === 'bounding') {
        if (target !== null && (member.role === 'mover' || !samePoint(member.position, target))) this.moveMemberToward(member, target, occupiedCells);
        this.faceToward(member, this.sharedLastKnownPosition); const line = hasWorldLineOfSight(member.position, this.sharedLastKnownPosition);
        if (member.role === 'suppressor' && line && this.logicalTick % 3 === 0) this.fireAt(member, this.sharedLastKnownPosition, 'suppressive fire');
        else if (member.role === 'observer' && member.targetVisible && this.logicalTick % 6 === 0) this.fireAt(member, this.player, 'observer support');
        return;
      }
      if (this.tactic === 'flank') {
        if (target !== null) this.moveMemberToward(member, target, occupiedCells); this.faceToward(member, this.sharedLastKnownPosition); const settled = target !== null && distance(member.position, target) <= 1.1; const line = hasWorldLineOfSight(member.position, this.sharedLastKnownPosition);
        if (member.role === 'suppressor' && line && this.logicalTick % 3 === 0) this.fireAt(member, this.sharedLastKnownPosition, 'fixing fire');
        else if (member.role === 'flanker' && settled && line && this.logicalTick % 4 === 0) this.fireAt(member, this.sharedLastKnownPosition, 'flanking fire');
        else if (member.role === 'support' && settled && member.targetVisible && this.logicalTick % 7 === 0) this.fireAt(member, this.player, 'support fire');
        return;
      }
      if (this.tactic === 'crossfire') {
        if (target !== null) this.moveMemberToward(member, target, occupiedCells); this.faceToward(member, this.sharedLastKnownPosition); const settled = target !== null && distance(member.position, target) <= 1.15;
        if (member.role === 'crossfire' && settled && member.targetVisible && this.logicalTick % 3 === (member.visualKey === 'alpha' ? 0 : 1)) this.fireAt(member, this.player, 'crossfire burst');
        else if (member.role === 'support' && settled && member.targetVisible && this.logicalTick % 7 === 0) this.fireAt(member, this.player, 'crossfire anchor');
        return;
      }
      if (this.tactic === 'assault') {
        if (target !== null) this.moveMemberToward(member, target, occupiedCells); this.faceToward(member, this.sharedLastKnownPosition);
        if (member.role === 'assaulter' && member.targetVisible && this.logicalTick % 2 === 0) this.fireAt(member, this.player, 'assault fire');
        else if (member.role === 'support' && member.targetVisible && this.logicalTick % 4 === 0) this.fireAt(member, this.player, 'supporting assault');
        return;
      }
    }
    if (member.selectedIntent === 'engage' && member.targetVisible) { this.faceToward(member, this.player); member.path = []; member.stalledTicks = 0; if (this.logicalTick % 2 === 0) this.fireAt(member, this.player, 'engage'); return; }
    if (member.selectedIntent === 'search') member.searchPulse = 6;
    let target = member.latestSnapshot?.selectedIntent.targetPosition === undefined ? null : fromVector3(member.latestSnapshot.selectedIntent.targetPosition); if (member.selectedIntent === 'patrol') target = this.getPatrolTarget(member);
    if (target === null) { member.path = []; member.stalledTicks = 0; return; } this.moveMemberToward(member, target, occupiedCells);
  }

  private moveMemberToward(member: MutableMember, target: GridPoint, occupiedCells: ReadonlySet<string>): void {
    if (samePoint(member.position, target)) { member.position = { ...target }; member.path = [target]; member.stalledTicks = 0; return; }
    const startCell = toNavCell(member.position); const goalCell = toNavCell(target); const transientBlocked = new Set(occupiedCells);
    transientBlocked.add(gridKey(toNavCell(this.player))); transientBlocked.delete(gridKey(startCell)); transientBlocked.delete(gridKey(goalCell));
    const path = findPath(tacticalWizardNavigationGrid, startCell, goalCell, transientBlocked); member.path = path.length === 0 ? [] : [{ ...member.position }, ...path.slice(1)];
    if (path.length === 0) { member.stalledTicks += 1; return; }
    const waypoint = path.length === 1 ? target : path[1]!; const candidate = moveToward(member.position, waypoint, AGENT_MOVE_STEP); const candidateCell = toNavCell(candidate);
    if (!isWorldWalkable(candidate) || occupiedCells.has(gridKey(candidateCell)) || distance(candidate, this.player) < 0.65) { member.stalledTicks += 1; return; }
    const previous = member.position; member.position = roundWorldPoint(candidate); const dx = member.position.x - previous.x; const dy = member.position.y - previous.y;
    if (Math.abs(dx) > POSITION_EPSILON || Math.abs(dy) > POSITION_EPSILON) {
      member.facing = normalizeDirection({ x: dx, y: dy }); member.stalledTicks = 0;
      this.log('agent', member.id, member.label, 'move', `${member.label} moved as ${member.role}.`, { from: { ...previous }, to: { ...member.position }, tacticalTarget: { ...target }, role: member.role, tactic: this.tactic });
    } else member.stalledTicks += 1;
    if (distance(member.position, target) <= AGENT_MOVE_STEP) member.position = { ...target };
  }

  private advancePatrolIfReady(): void {
    if (this.alertState !== 'idle' || !this.members.every((member) => distance(member.position, this.getPatrolTarget(member)) <= AGENT_MOVE_STEP + POSITION_EPSILON)) return;
    this.patrolIndex = (this.patrolIndex + 1) % tacticalWizardTestMap.patrolPoints.length; this.pushEvent(`T${this.logicalTick}: squad patrol waypoint advanced to P${this.patrolIndex + 1}.`);
  }
  private getPatrolTarget(member: MutableMember): GridPoint {
    const base = tacticalWizardTestMap.patrolPoints[this.patrolIndex]!; const candidates = [{ x: base.x + member.patrolOffset.x, y: base.y + member.patrolOffset.y }, { x: base.x + member.patrolOffset.x, y: base.y }, { x: base.x, y: base.y + member.patrolOffset.y }, base];
    return candidates.find((candidate) => isWalkable(tacticalWizardNavigationGrid, candidate)) ?? base;
  }
  private canSeePlayer(member: MutableMember): boolean {
    const range = distance(member.position, this.player); if (range > this.visionRange || !hasWorldLineOfSight(member.position, this.player)) return false; if (range <= POSITION_EPSILON) return true;
    const direction = { x: (this.player.x - member.position.x) / range, y: (this.player.y - member.position.y) / range }; const facingLength = Math.hypot(member.facing.x, member.facing.y) || 1; const facing = { x: member.facing.x / facingLength, y: member.facing.y / facingLength };
    const dot = Math.max(-1, Math.min(1, direction.x * facing.x + direction.y * facing.y)); return Math.acos(dot) * 180 / Math.PI <= this.visionFovDegrees / 2;
  }
  private faceToward(member: MutableMember, point: GridPoint): void { const dx = point.x - member.position.x; const dy = point.y - member.position.y; if (Math.abs(dx) > POSITION_EPSILON || Math.abs(dy) > POSITION_EPSILON) member.facing = normalizeDirection({ x: dx, y: dy }); }
  private noisyPerceivedPosition(member: MutableMember): GridPoint { const memberIndex = this.members.findIndex((candidate) => candidate.id === member.id); const offsets = [{ x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }]; const offset = offsets[(this.logicalTick + Math.max(0, memberIndex)) % offsets.length]!; const candidate = roundWorldPoint({ x: this.player.x + offset.x, y: this.player.y + offset.y }); return isWorldWalkable(candidate) ? candidate : this.player; }
  private fireAt(member: MutableMember, target: GridPoint, reason: string): void {
    member.firePulse = 2; member.fireTarget = { ...target }; this.pushEvent(`T${this.logicalTick}: ${member.label} ${reason}.`);
    this.log('agent', member.id, member.label, 'fire', `${member.label} fired: ${reason}.`, { target: { ...target }, role: member.role, tactic: this.tactic, targetVisible: member.targetVisible });
  }
  private pushEvent(message: string): void { this.eventLog.unshift(message); this.eventLog.splice(30); }
  private flankSide(): 1 | -1 { return (this.maneuverCycle + this.boundingPhase) % 2 === 0 ? 1 : -1; }
  private logRoleAssignments(): void {
    this.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'roles', `Roles assigned for ${this.tactic}.`, { assignments: this.members.map((member) => `${member.id}=${member.role}`), tactic: this.tactic });
  }
  private logPlan(): void {
    this.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', `Spatial plan refreshed for ${this.tactic}.`, { tactic: this.tactic, cycle: this.maneuverCycle, spread: Number(pairwiseSpread(this.members.map((member) => member.position)).toFixed(2)), targets: this.members.map((member) => `${member.id}->${member.tacticalTarget ? `${member.tacticalTarget.x},${member.tacticalTarget.y}` : 'hold'}`) });
  }
  private log(category: RunLogCategory, actorId: string, actorLabel: string, event: RunLogEvent, summary: string, data: Readonly<Record<string, RunLogValue>>): void {
    this.runLog.push({ sequence: this.runLogSequence++, logicalTick: this.logicalTick, timeSeconds: Number((this.logicalTick * this.stepSeconds).toFixed(2)), category, actorId, actorLabel, event, summary, data });
    if (this.runLog.length > RUN_LOG_LIMIT) this.runLog.splice(0, this.runLog.length - RUN_LOG_LIMIT);
  }
}

function createMembers(): MutableMember[] { return MEMBER_DEFINITIONS.map((definition) => ({ id: definition.id, label: definition.label, visualKey: definition.visualKey, patrolOffset: definition.patrolOffset, runtime: createTacticalWizardReferenceRuntime(definition.id), position: definition.start, facing: { x: 1, y: 0 }, path: [], selectedIntent: 'patrol', beliefConfidence: 0, beliefSource: 'none', targetVisible: false, lastKnownPosition: null, latestTrace: null, latestSnapshot: null, wasVisible: false, role: 'patrol', coverSlot: null, tacticalTarget: null, firePulse: 0, fireTarget: null, searchPulse: 0, stalledTicks: 0 })); }
function reserve(set: Set<string>, point: GridPoint | null): void { if (point !== null) set.add(gridKey(toNavCell(point))); }
function rect(x: number, y: number, width: number, height: number): GridPoint[] { const points: GridPoint[] = []; for (let yy = y; yy < y + height; yy += 1) for (let xx = x; xx < x + width; xx += 1) points.push({ x: xx, y: yy }); return points; }
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
function roundWorldPoint(point: GridPoint): GridPoint { return { x: Math.round(point.x * SIMULATION_MOVEMENT_SUBDIVISIONS) / SIMULATION_MOVEMENT_SUBDIVISIONS, y: Math.round(point.y * SIMULATION_MOVEMENT_SUBDIVISIONS) / SIMULATION_MOVEMENT_SUBDIVISIONS }; }
