import { gridKey, hasLineOfSight, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from './tacticalWizardTestMapV7';
import {
  TacticalWizardSimulation as TacticalWizardSimulationV14,
  type TacticalWizardSimulationState as TacticalWizardSimulationStateV14,
} from './tacticalWizardSimulationV14';
import {
  buildDirectionalSearchWaypoints,
  classifyContactTarget,
  contactUncertaintyRadius,
  deriveEgressDirection,
  type ContactTargetKind,
} from './contactMemory';

export * from './tacticalWizardSimulationV14';

export type ContactTrackStatus = 'none' | 'confirmed' | 'lost_fresh' | 'searching' | 'lkp_cleared';

export interface ContactTrackView {
  readonly episodeId: number;
  readonly status: ContactTrackStatus;
  readonly previousConfirmedPosition: GridPoint | null;
  readonly lastConfirmedPosition: GridPoint | null;
  readonly lastConfirmedTick: number | null;
  readonly egressDirection: GridPoint | null;
  readonly confidence: number;
  readonly uncertaintyRadius: number;
  readonly lkpCleared: boolean;
  readonly lkpClearedTick: number | null;
  readonly verifiedBy: readonly string[];
  readonly clearedSearchNodes: readonly GridPoint[];
  readonly frontier: readonly GridPoint[];
}

export interface TacticalWizardSimulationState extends TacticalWizardSimulationStateV14 {
  readonly contactTrack: ContactTrackView;
}

interface HostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  facing: GridPoint;
  targetVisible: boolean;
  task: string;
  role: string;
  tacticalTarget: GridPoint | null;
  searchWaypoints: readonly GridPoint[];
  searchIndex: number;
  searchScanIndex: number;
  searchHoldFrames: number;
  searchComplete: boolean;
  buddyRole: string;
  opportunityPurpose: string;
}

interface HostAccess {
  members: HostMember[];
  logicalTick: number;
  tactic: string;
  tacticStartedTick: number;
  tacticReason: string;
  sharedLastKnownPosition: GridPoint | null;
  lostContactTicks: number;
  searchLeadId: string | null;
  searchCoverId: string | null;
  searchOverwatchId: string | null;
  tryFire: (member: HostMember, target: GridPoint, reason: string) => void;
  tryGrenade: (member: HostMember) => boolean;
  refreshTacticalPlan: () => void;
  applyRoles: () => void;
  pushEvent: (message: string) => void;
  log: (
    category: 'system' | 'player' | 'squad' | 'agent',
    actorId: string,
    actorLabel: string,
    event: 'session' | 'reset' | 'player_move' | 'player_noise' | 'alert' | 'tactic' | 'roles' | 'plan' | 'perception' | 'decision' | 'move' | 'fire' | 'search',
    summary: string,
    data: Readonly<Record<string, unknown>>,
  ) => void;
}

interface V8Access {
  assignment: { readonly agentId: string; readonly supplyId: string; readonly task: string } | null;
}

const FRESH_LKP_FIRE_TICKS = 6;
const LKP_VERIFY_RANGE = 6.5;
const LKP_VERIFY_TICKS = 3;
const STATIONARY_DIRECTION_CLEAR_TICKS = 5;
const FIRE_DISCIPLINE_LOG_COOLDOWN = 8;

/**
 * V15 turns the last-known point into a contact hypothesis instead of a
 * permanent attack coordinate.
 *
 * - exact player coordinates are sampled only while an operational member has
 *   confirmed visual contact;
 * - the last two confirmed visual samples produce an egress direction;
 * - LOS + scan time can verify that the LKP is empty (negative evidence);
 * - stale/cleared LKP rifle fire is withheld;
 * - sweep flash grenades are redirected toward the directional search frontier;
 * - cleared search nodes survive ordinary tactical replans inside one contact
 *   episode;
 * - reacquisition hysteresis scales with the number of living soldiers;
 * - dead/recovery-critical soldiers cannot keep a stale logistics assignment.
 *
 * Geometry, LOS, search points and fire policy remain Workbench Host concerns.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationV14 {
  private episodeId = 0;
  private previousConfirmedPosition: GridPoint | null = null;
  private lastConfirmedPosition: GridPoint | null = null;
  private lastConfirmedTick: number | null = null;
  private egressDirection: GridPoint | null = null;
  private stationaryConfirmedTicks = 0;
  private contactWasVisible = false;
  private lkpCleared = false;
  private lkpClearedTick: number | null = null;
  private lkpVerificationTicks = 0;
  private lastVerificationTick = -1;
  private verifiedBy = new Set<string>();
  private clearedSearchNodes = new Map<string, GridPoint>();
  private lastSearchIndex = new Map<string, number>();
  private reacquireStableTicks = 0;
  private fireDisciplineLogTick = new Map<string, number>();

  constructor() {
    super();
    this.installV15Hooks();
    const host = this.v15Host();
    host.pushEvent('V15: contact hypotheses, negative evidence, directional search and stale-LKP fire discipline enabled.');
    host.log('system', 'simulation', 'Volition Simulation', 'session', 'V15 contact-memory / directional-search layer enabled.', {
      hiddenTargetPolicy: 'confirmed_visual_samples_only_for_exact_track',
      freshLkpFireTicks: FRESH_LKP_FIRE_TICKS,
      lkpVerifyTicks: LKP_VERIFY_TICKS,
    });
  }

  override reset(): TacticalWizardSimulationState {
    super.reset();
    this.resetContactTrack();
    this.v15Host().pushEvent('V15: contact track / cleared-search memory reset.');
    return this.getState();
  }

  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    this.observeConfirmedContact(super.getState());
    super.advance(deltaSeconds);
    const state = super.getState();
    this.observeConfirmedContact(state);
    this.observeSearchProgress(state);
    this.evaluateNegativeEvidence(state);
    this.applyAdaptiveReacquisition(state);
    this.enforceTaskOwnership(state);
    return this.getState();
  }

  override playerFireAt(point: GridPoint): boolean {
    const result = super.playerFireAt(point);
    this.enforceTaskOwnership(super.getState());
    return result;
  }

  override getState(): TacticalWizardSimulationState {
    const base = super.getState();
    const frontier = this.currentFrontier();
    const lostTicks = this.lastConfirmedTick === null ? 0 : Math.max(0, base.logicalTick - this.lastConfirmedTick);
    const visible = base.agents.some((agent) => agent.alive && agent.targetVisible);
    const status: ContactTrackStatus = this.lastConfirmedPosition === null
      ? 'none'
      : visible
        ? 'confirmed'
        : this.lkpCleared
          ? 'lkp_cleared'
          : lostTicks <= FRESH_LKP_FIRE_TICKS
            ? 'lost_fresh'
            : 'searching';
    const confidence = visible
      ? 1
      : Math.max(0.08, Math.min(0.96, 1 - lostTicks * 0.035 - (this.lkpCleared ? 0.22 : 0)));
    return {
      ...base,
      contactTrack: {
        episodeId: this.episodeId,
        status,
        previousConfirmedPosition: clonePoint(this.previousConfirmedPosition),
        lastConfirmedPosition: clonePoint(this.lastConfirmedPosition),
        lastConfirmedTick: this.lastConfirmedTick,
        egressDirection: clonePoint(this.egressDirection),
        confidence: Number(confidence.toFixed(3)),
        uncertaintyRadius: Number(contactUncertaintyRadius(lostTicks, this.lkpCleared).toFixed(2)),
        lkpCleared: this.lkpCleared,
        lkpClearedTick: this.lkpClearedTick,
        verifiedBy: [...this.verifiedBy].sort(),
        clearedSearchNodes: [...this.clearedSearchNodes.values()].map((point) => ({ ...point })),
        frontier,
      },
    };
  }

  private installV15Hooks(): void {
    const host = this.v15Host();

    const originalRefreshPlan = host.refreshTacticalPlan.bind(this);
    host.refreshTacticalPlan = (): void => {
      originalRefreshPlan();
      this.applyDirectionalSweepPlan();
    };

    const originalTryFire = host.tryFire.bind(this);
    host.tryFire = (member: HostMember, target: GridPoint, reason: string): void => {
      const kind = this.classifyTarget(target);
      if (this.fireAllowed(member, kind, reason)) {
        originalTryFire(member, target, reason);
        return;
      }
      this.logFireDiscipline(member, kind, target, reason);
    };

    const originalTryGrenade = host.tryGrenade.bind(this);
    host.tryGrenade = (member: HostMember): boolean => {
      if (host.tactic !== 'sweep' || this.anyOperationalVisual()) return originalTryGrenade(member);
      const frontier = this.memberFrontier(member);
      if (frontier === null) return this.lkpCleared ? false : originalTryGrenade(member);

      const previous = host.sharedLastKnownPosition;
      host.sharedLastKnownPosition = { ...frontier };
      try {
        return originalTryGrenade(member);
      } finally {
        host.sharedLastKnownPosition = previous;
      }
    };
  }

  private observeConfirmedContact(state: TacticalWizardSimulationStateV14): void {
    const visibleAgents = state.agents.filter((agent) => agent.alive && agent.targetVisible);
    const visible = visibleAgents.length > 0;
    if (!visible) {
      if (this.contactWasVisible) {
        this.contactWasVisible = false;
        this.lkpCleared = false;
        this.lkpClearedTick = null;
        this.lkpVerificationTicks = 0;
        this.lastVerificationTick = -1;
        this.verifiedBy.clear();
        this.v15Host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'perception', 'Visual contact lost; the last confirmed point became a hypothesis pending verification.', {
          episodeId: this.episodeId,
          lastConfirmedPosition: clonePoint(this.lastConfirmedPosition),
          egressDirection: clonePoint(this.egressDirection),
        });
      }
      return;
    }

    const point = { ...state.player };
    const shouldStartEpisode = !this.contactWasVisible
      && (this.lastConfirmedPosition === null || this.lkpCleared || distance(this.lastConfirmedPosition, point) > 4.5);
    if (shouldStartEpisode) {
      this.episodeId += 1;
      this.clearedSearchNodes.clear();
      this.lastSearchIndex.clear();
      this.verifiedBy.clear();
      this.lkpVerificationTicks = 0;
      this.lkpCleared = false;
      this.lkpClearedTick = null;
    }

    if (this.lastConfirmedPosition === null || distance(this.lastConfirmedPosition, point) >= 0.15) {
      this.previousConfirmedPosition = clonePoint(this.lastConfirmedPosition);
      this.lastConfirmedPosition = point;
      this.egressDirection = deriveEgressDirection(this.previousConfirmedPosition, this.lastConfirmedPosition);
      this.stationaryConfirmedTicks = 0;
    } else {
      this.stationaryConfirmedTicks += 1;
      if (this.stationaryConfirmedTicks >= STATIONARY_DIRECTION_CLEAR_TICKS) this.egressDirection = null;
    }
    this.lastConfirmedTick = state.logicalTick;
    this.contactWasVisible = true;
    this.lkpCleared = false;
    this.lkpClearedTick = null;
  }

  private evaluateNegativeEvidence(state: TacticalWizardSimulationStateV14): void {
    if (this.lastConfirmedPosition === null || this.lkpCleared || this.anyOperationalVisual() || state.squad.tactic !== 'sweep') return;
    if (state.logicalTick === this.lastVerificationTick) return;
    this.lastVerificationTick = state.logicalTick;

    const lkpCell = toCell(this.lastConfirmedPosition);
    const witnesses = state.agents.filter((agent) => agent.alive
      && !agent.targetVisible
      && (agent.task === 'search_sector' || agent.task === 'overwatch' || agent.buddyRole === 'cover')
      && distance(agent.position, this.lastConfirmedPosition!) <= LKP_VERIFY_RANGE
      && hasLineOfSight(tacticalWizardNavigationGrid, toCell(agent.position), lkpCell)
      && (agent.searchProgress > 0.03 || agent.task === 'overwatch'));

    if (witnesses.length === 0) {
      this.lkpVerificationTicks = Math.max(0, this.lkpVerificationTicks - 1);
      return;
    }
    for (const witness of witnesses) this.verifiedBy.add(witness.id);
    this.lkpVerificationTicks += 1;
    if (this.lkpVerificationTicks < LKP_VERIFY_TICKS) return;

    this.lkpCleared = true;
    this.lkpClearedTick = state.logicalTick;
    this.clearedSearchNodes.set(gridKey(lkpCell), { ...lkpCell });
    const host = this.v15Host();
    host.pushEvent(`T${state.logicalTick}: last confirmed position verified empty; search expands along the recorded egress direction.`);
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'search', 'Negative visual evidence verified the last confirmed point empty; direct attack permissions were revoked.', {
      episodeId: this.episodeId,
      lastConfirmedPosition: { ...this.lastConfirmedPosition },
      egressDirection: clonePoint(this.egressDirection),
      verifiedBy: [...this.verifiedBy],
      nextPolicy: 'directional_search_frontier',
    });
    this.applyDirectionalSweepPlan();
  }

  private observeSearchProgress(state: TacticalWizardSimulationStateV14): void {
    if (state.squad.tactic !== 'sweep') return;
    const host = this.v15Host();
    for (const member of host.members) {
      const agent = state.agents.find((entry) => entry.id === member.id);
      if (agent === undefined || !agent.alive || member.searchWaypoints.length === 0) continue;
      const previousIndex = this.lastSearchIndex.get(member.id) ?? member.searchIndex;
      if (member.searchIndex > previousIndex) {
        const cleared = member.searchWaypoints[Math.min(member.searchIndex - 1, member.searchWaypoints.length - 1)];
        if (cleared !== undefined) this.clearedSearchNodes.set(gridKey(toCell(cleared)), toCell(cleared));
      }
      if (member.searchComplete) {
        const final = member.searchWaypoints.at(-1);
        if (final !== undefined) this.clearedSearchNodes.set(gridKey(toCell(final)), toCell(final));
      }
      this.lastSearchIndex.set(member.id, member.searchIndex);
    }
  }

  private applyDirectionalSweepPlan(): void {
    const host = this.v15Host();
    if (host.tactic !== 'sweep' || this.lastConfirmedPosition === null || this.egressDirection === null) return;
    const cleared = new Set(this.clearedSearchNodes.keys());
    const assignments: Array<{ readonly id: string | null; readonly lane: 0 | 1 | 2 }> = [
      { id: host.searchLeadId, lane: 0 },
      { id: host.searchCoverId, lane: 1 },
      { id: host.searchOverwatchId, lane: 2 },
    ];

    for (const assignment of assignments) {
      if (assignment.id === null) continue;
      const member = host.members.find((entry) => entry.id === assignment.id);
      if (member === undefined) continue;
      const generated = buildDirectionalSearchWaypoints(
        tacticalWizardNavigationGrid,
        this.lastConfirmedPosition,
        this.egressDirection,
        assignment.lane,
        cleared,
      );
      if (generated.length === 0) continue;
      member.searchWaypoints = assignment.lane === 2 ? generated.slice(0, 1) : generated;
      member.searchIndex = 0;
      member.searchScanIndex = 0;
      member.searchHoldFrames = 0;
      member.searchComplete = false;
      member.tacticalTarget = member.searchWaypoints[0] ?? member.tacticalTarget;
      this.lastSearchIndex.set(member.id, 0);
      for (const point of member.searchWaypoints) cleared.add(gridKey(toCell(point)));
    }
  }

  private applyAdaptiveReacquisition(state: TacticalWizardSimulationStateV14): void {
    const living = state.agents.filter((agent) => agent.alive);
    const visible = living.some((agent) => agent.targetVisible);
    this.reacquireStableTicks = visible ? this.reacquireStableTicks + 1 : 0;
    if (!visible || state.squad.tactic !== 'sweep') return;
    const required = living.length <= 1 ? 1 : living.length === 2 ? 2 : 3;
    if (this.reacquireStableTicks < required) return;

    const host = this.v15Host();
    host.tactic = 'bounding';
    host.tacticStartedTick = host.logicalTick;
    host.tacticReason = `Confirmed reacquisition held ${this.reacquireStableTicks}/${required} ticks; search contract released back to direct-contact tactics.`;
    host.applyRoles();
    host.refreshTacticalPlan();
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'tactic', 'Directional search ended after stable visual reacquisition.', {
      livingMembers: living.length,
      stableTicks: this.reacquireStableTicks,
      requiredTicks: required,
      episodeId: this.episodeId,
    });
  }

  private enforceTaskOwnership(state: TacticalWizardSimulationStateV14): void {
    const v8 = this as unknown as V8Access;
    const assignment = v8.assignment;
    if (assignment === null) return;
    const agent = state.agents.find((entry) => entry.id === assignment.agentId);
    const recoveryCritical = state.recovery.rescuerId === assignment.agentId || state.recovery.covererId === assignment.agentId;
    if (agent?.alive === true && !recoveryCritical) return;

    v8.assignment = null;
    this.v15Host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Lower-priority logistics assignment released because the owner became unavailable or recovery-critical.', {
      agentId: assignment.agentId,
      supplyId: assignment.supplyId,
      logisticsTask: assignment.task,
      reason: agent?.alive === false ? 'agent_downed' : 'recovery_priority',
    });
  }

  private classifyTarget(target: GridPoint): ContactTargetKind {
    const state = super.getState();
    const visible = state.agents.some((agent) => agent.alive && agent.targetVisible) ? state.player : null;
    return classifyContactTarget({
      target,
      currentTick: state.logicalTick,
      lastConfirmedTick: this.lastConfirmedTick,
      lastConfirmedPosition: this.lastConfirmedPosition,
      lkpCleared: this.lkpCleared,
      confirmedVisiblePosition: visible,
      coarseFireSector: state.threatResponse.estimatedSector,
      searchFrontier: this.currentFrontier(),
      freshLkpTicks: FRESH_LKP_FIRE_TICKS,
    });
  }

  private fireAllowed(member: HostMember, kind: ContactTargetKind, reason: string): boolean {
    if (kind === 'confirmed_visual') return true;
    if (kind === 'fresh_lkp') return true;
    if (kind === 'coarse_fire_sector') return /counter|rescue security/i.test(reason);
    if (kind === 'unknown') return member.targetVisible;
    return false;
  }

  private logFireDiscipline(member: HostMember, kind: ContactTargetKind, target: GridPoint, reason: string): void {
    const host = this.v15Host();
    const previous = this.fireDisciplineLogTick.get(member.id) ?? -999;
    if (host.logicalTick - previous < FIRE_DISCIPLINE_LOG_COOLDOWN) return;
    this.fireDisciplineLogTick.set(member.id, host.logicalTick);
    host.log('agent', member.id, member.label, 'fire', `${member.label} withheld fire: ${kind} is not a valid direct-fire target.`, {
      blocked: true,
      targetKind: kind,
      target: { ...target },
      reason,
      episodeId: this.episodeId,
      lkpCleared: this.lkpCleared,
      egressDirection: clonePoint(this.egressDirection),
    });
  }

  private currentFrontier(): readonly GridPoint[] {
    const host = this.v15Host();
    if (host.tactic !== 'sweep') return [];
    const points: GridPoint[] = [];
    const seen = new Set<string>();
    for (const member of host.members) {
      for (let index = member.searchIndex; index < member.searchWaypoints.length; index += 1) {
        const point = member.searchWaypoints[index];
        if (point === undefined) continue;
        const cell = toCell(point);
        const key = gridKey(cell);
        if (seen.has(key) || this.clearedSearchNodes.has(key)) continue;
        seen.add(key);
        points.push({ ...point });
        if (points.length >= 8) return points;
      }
    }
    return points;
  }

  private memberFrontier(member: HostMember): GridPoint | null {
    for (let index = member.searchIndex; index < member.searchWaypoints.length; index += 1) {
      const point = member.searchWaypoints[index];
      if (point === undefined || this.clearedSearchNodes.has(gridKey(toCell(point)))) continue;
      return { ...point };
    }
    return this.currentFrontier()[0] ?? null;
  }

  private anyOperationalVisual(): boolean {
    return super.getState().agents.some((agent) => agent.alive && agent.targetVisible);
  }

  private resetContactTrack(): void {
    this.episodeId = 0;
    this.previousConfirmedPosition = null;
    this.lastConfirmedPosition = null;
    this.lastConfirmedTick = null;
    this.egressDirection = null;
    this.stationaryConfirmedTicks = 0;
    this.contactWasVisible = false;
    this.lkpCleared = false;
    this.lkpClearedTick = null;
    this.lkpVerificationTicks = 0;
    this.lastVerificationTick = -1;
    this.verifiedBy.clear();
    this.clearedSearchNodes.clear();
    this.lastSearchIndex.clear();
    this.reacquireStableTicks = 0;
    this.fireDisciplineLogTick.clear();
  }

  private v15Host(): HostAccess {
    return this as unknown as HostAccess;
  }
}

function toCell(point: GridPoint): GridPoint {
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
