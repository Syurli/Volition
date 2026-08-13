import { hasLineOfSight, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from './tacticalWizardTestMapV7';
import type { RunLogCategory, RunLogEvent, RunLogValue } from './tacticalWizardSimulationV3';
import {
  TacticalWizardSimulation as TacticalWizardSimulationV15,
  type TacticalWizardSimulationState as TacticalWizardSimulationStateV15,
} from './tacticalWizardSimulationV15';

export * from './tacticalWizardSimulationV15';

export type OperationalCommitment =
  | 'patrol'
  | 'logistics'
  | 'search'
  | 'direct_combat'
  | 'counterfire'
  | 'reaction'
  | 'recovery_rescue'
  | 'recovery_security';

export type SearchEpisodePhase =
  | 'none'
  | 'verify_lkp'
  | 'expand_frontier'
  | 'search_frontier'
  | 'reacquire';

export interface CombatAuthorityView {
  readonly searchPhase: SearchEpisodePhase;
  readonly confirmedVisualIds: readonly string[];
  readonly commitments: readonly {
    readonly agentId: string;
    readonly commitment: OperationalCommitment;
    readonly priority: number;
    readonly reason: string;
  }[];
  readonly logisticsPreemptions: number;
  readonly rescueLaneReplans: number;
  readonly supplementalBursts: number;
  readonly grenadePolicy: 'purpose_gated';
}

export interface TacticalWizardSimulationState extends TacticalWizardSimulationStateV15 {
  readonly combatAuthority: CombatAuthorityView;
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
  specialAction: string;
  coverSlot?: { readonly position: GridPoint; readonly peekPosition: GridPoint } | null;
}

interface HostAccess {
  members: HostMember[];
  logicalTick: number;
  tactic: string;
  alertState: 'idle' | 'pending' | 'active';
  sharedLastKnownPosition: GridPoint | null;
  suppressorId: string | null;
  moverId: string | null;
  observerId: string | null;
  searchLeadId: string | null;
  searchCoverId: string | null;
  searchOverwatchId: string | null;
  canSeePlayer: (member: HostMember) => boolean;
  movementTarget: (member: HostMember) => GridPoint | null;
  tryFire: (member: HostMember, target: GridPoint, reason: string) => void;
  tryGrenade: (member: HostMember) => boolean;
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
  readonly task: 'resupply_ammo' | 'resupply_grenades' | 'resupply_mixed';
}

interface V8Access {
  assignment: LogisticsAssignment | null;
  updateCommandOrder?: () => void;
}

interface RescuePlanAccess {
  readonly downedAgentId: string;
  readonly rescuerId: string;
  readonly covererId: string | null;
  phase: 'establish_cover' | 'approach' | 'treat';
}

interface RecoveryInternals {
  rescuePlan: RescuePlanAccess | null;
  rescueSupportPlanKey: string | null;
  rescueSupportPosition: GridPoint | null;
  rescueSupportTarget: GridPoint | null;
  lastRescueSupportFireTick: number | null;
  rescueCoverTarget: GridPoint | null;
  rescueSecurityReplans: number;
  rescueSecurityLastReplanTick: number;
}

interface CommitmentDecision {
  readonly commitment: OperationalCommitment;
  readonly priority: number;
  readonly reason: string;
}

const PRIORITY = {
  patrol: 10,
  logistics: 30,
  search: 60,
  direct_combat: 70,
  reaction: 80,
  counterfire: 85,
  recovery_security: 90,
  recovery_rescue: 95,
} as const;

const AMMO_CRITICAL_FOR_DETACHMENT = 12;
const GRENADE_VISIBLE_MIN_RANGE = 7.5;
const GRENADE_HIDDEN_MIN_RANGE = 5.5;
const SUPPORT_FIRE_RANGE = 15;
const SUPPORT_BURST_INTERVAL_TICKS = 3;
const RESCUE_BURST_INTERVAL_TICKS = 2;
const RESCUE_BLOCK_REPLAN_STREAK = 2;
const RESCUE_BLOCK_REPLAN_COOLDOWN_TICKS = 4;
const SEARCH_EXPAND_VISUAL_TICKS = 2;

/**
 * V16 is a Host-side execution authority layer over the V8-V15 tactical stack.
 *
 * Earlier versions deliberately proved one concern at a time (logistics,
 * reactive combat, recovery, counterfire, contact memory). By T306 those
 * independently valid systems could all claim the same member at once. V16
 * therefore does not add another doctrine. It resolves execution ownership:
 * recovery/security > reaction/counterfire > direct combat > search > logistics.
 *
 * It also closes three play-test regressions:
 * - a squad-confirmed live target can be engaged by a fire-support member that
 *   has a safe weapon line even when that member's own FOV is not the reporter;
 * - rescue security reacts to repeated friendly lane blockage by requesting an
 *   alternate support position rather than silently remaining "ready";
 * - grenades are purpose-gated, lose priority at close range, and are forbidden
 *   during regroup/recovery commitments where rifle fire or movement is clearer.
 *
 * Hidden-target privacy is unchanged. The squad-confirmed override is enabled
 * only while at least one operational member currently passes Host LOS/FOV and
 * the requested target equals the live confirmed player position.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationV15 {
  private lastAuthorityTick = -1;
  private lastSearchPhase: SearchEpisodePhase = 'none';
  private lastSupplementalFireTick = new Map<string, number>();
  private blockedFireStreak = new Map<string, number>();
  private lastRescueLaneReplanTick = -999;
  private logisticsPreemptions = 0;
  private rescueLaneReplans = 0;
  private supplementalBursts = 0;

  constructor() {
    super();
    this.installV16Hooks();
    const host = this.v16Host();
    host.pushEvent('V16: combat authority, rescue fire-support lane resolution and purpose-gated grenade discipline enabled.');
    host.log('system', 'simulation', 'Volition Simulation', 'session', 'V16 combat authority / fire-support discipline enabled.', {
      commitmentOrder: 'recovery > reaction/counterfire > direct combat > search > logistics > patrol',
      grenadeVisibleMinRange: GRENADE_VISIBLE_MIN_RANGE,
      rescueLaneBlockReplanStreak: RESCUE_BLOCK_REPLAN_STREAK,
      hiddenTargetPolicy: 'squad_confirmed_override_requires_live_host_visual',
    });
  }

  override reset(): TacticalWizardSimulationState {
    super.reset();
    this.lastAuthorityTick = -1;
    this.lastSearchPhase = 'none';
    this.lastSupplementalFireTick.clear();
    this.blockedFireStreak.clear();
    this.lastRescueLaneReplanTick = -999;
    this.logisticsPreemptions = 0;
    this.rescueLaneReplans = 0;
    this.supplementalBursts = 0;
    this.v16Host().pushEvent('V16: combat authority state reset.');
    return this.getState();
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    this.preemptConflictingLogistics(super.getState(), 'pre-frame');
    super.advance(deltaSeconds);
    let state = super.getState();
    this.preemptConflictingLogistics(state, 'post-frame');
    state = super.getState();
    this.updateSearchEpisodePhase(state);
    if (state.logicalTick !== this.lastAuthorityTick) {
      this.lastAuthorityTick = state.logicalTick;
      this.maintainFireSupport(state);
    }
    return this.getState();
  }

  override playerFireAt(point: GridPoint): boolean {
    const result = super.playerFireAt(point);
    this.preemptConflictingLogistics(super.getState(), 'player-fire');
    return result;
  }

  override getState(): TacticalWizardSimulationState {
    const base = super.getState();
    const confirmedVisualIds = this.confirmedVisualIds(base);
    return {
      ...base,
      combatAuthority: {
        searchPhase: this.resolveSearchPhase(base, confirmedVisualIds.length > 0),
        confirmedVisualIds,
        commitments: base.agents.map((agent) => {
          const decision = this.commitmentFor(agent.id, base, confirmedVisualIds.length > 0);
          return { agentId: agent.id, ...decision };
        }),
        logisticsPreemptions: this.logisticsPreemptions,
        rescueLaneReplans: this.rescueLaneReplans,
        supplementalBursts: this.supplementalBursts,
        grenadePolicy: 'purpose_gated',
      },
    };
  }

  private installV16Hooks(): void {
    const host = this.v16Host();

    const originalMovementTarget = host.movementTarget.bind(this);
    host.movementTarget = (member: HostMember): GridPoint | null => {
      this.preemptMemberLogistics(member.id, super.getState(), 'movement');
      return originalMovementTarget(member);
    };

    const originalTryFire = host.tryFire.bind(this);
    host.tryFire = (member: HostMember, target: GridPoint, reason: string): void => {
      const state = super.getState();
      this.preemptMemberLogistics(member.id, state, 'fire');

      const beforePulse = member.firePulse;
      const actualCanSeePlayer = host.canSeePlayer;
      const sourceIds = host.members.filter((candidate) => actualCanSeePlayer(candidate)).map((candidate) => candidate.id);
      const squadConfirmedTarget = sourceIds.length > 0 && near(target, state.player, 0.8);
      const needsSharedFirePermission = squadConfirmedTarget
        && !actualCanSeePlayer(member)
        && this.physicalLineOfFire(member, target);

      if (needsSharedFirePermission) {
        // V15 intentionally requires a Host-confirmed visual for exact live
        // coordinates. Here another operational member is that reporter. For
        // this single fire-authorization call only, the support shooter is
        // treated as visually authorized after physical weapon LOS succeeds.
        host.canSeePlayer = (candidate: HostMember): boolean => candidate.id === member.id
          ? this.physicalLineOfFire(candidate, target)
          : actualCanSeePlayer(candidate);
      }

      try {
        originalTryFire(member, target, reason);
      } finally {
        if (needsSharedFirePermission) host.canSeePlayer = actualCanSeePlayer;
      }

      if (member.firePulse > beforePulse) {
        this.clearBlockedFire(member.id);
        return;
      }
      if (member.fireBlockedByFriend !== null) this.handleBlockedFire(member, reason, member.fireBlockedByFriend);
    };

    const originalTryGrenade = host.tryGrenade.bind(this);
    host.tryGrenade = (member: HostMember): boolean => {
      const state = super.getState();
      this.preemptMemberLogistics(member.id, state, 'grenade');
      if (!this.grenadeAllowed(member, state)) return false;
      const beforeAction = member.specialAction;
      const committed = originalTryGrenade(member);
      if (!committed || member.specialAction === beforeAction) return committed;
      const purpose = grenadePurpose(member.specialAction, state.squad.tactic, state.contactTrack.lkpCleared);
      host.log('agent', member.id, member.label, 'plan', `${member.label} grenade was authorized for an explicit tactical purpose.`, {
        specialAction: member.specialAction,
        purpose,
        tactic: state.squad.tactic,
        task: member.task,
        contactStatus: state.contactTrack.status,
      });
      return true;
    };

    const originalRefreshPlan = host.refreshTacticalPlan.bind(this);
    host.refreshTacticalPlan = (): void => {
      originalRefreshPlan();
      this.preemptConflictingLogistics(super.getState(), 'replan');
    };
  }

  private maintainFireSupport(state: TacticalWizardSimulationStateV15): void {
    const host = this.v16Host();
    if (state.squad.alertState !== 'active') return;
    const visualIds = this.confirmedVisualIds(state);
    if (visualIds.length === 0) return;

    const recovery = this.v16Recovery().rescuePlan;
    if (recovery !== null && recovery.covererId !== null) {
      const coverer = host.members.find((member) => member.id === recovery.covererId);
      if (coverer !== undefined) {
        this.attemptSupplementalBurst(coverer, state.player, 'rescue security squad-confirmed covering fire', state, RESCUE_BURST_INTERVAL_TICKS);
      }
      // During an active casualty recovery the designated security element owns
      // the supplemental burst budget. Parent tactics may still fire normally.
      return;
    }

    if (state.squad.tactic === 'sweep') return;

    let candidates = host.members.filter((member) => this.memberOperational(member.id, state));
    if (state.squad.tactic === 'regroup') {
      candidates = candidates.filter((member) => member.id === state.squad.suppressorId);
    } else {
      candidates = candidates.filter((member) => isSupportFireTask(member.task, member.role));
    }

    let fired = 0;
    for (const member of candidates) {
      if (fired >= 2) break;
      if (this.attemptSupplementalBurst(member, state.player, 'combat authority squad-confirmed support burst', state, SUPPORT_BURST_INTERVAL_TICKS)) fired += 1;
    }
  }

  private attemptSupplementalBurst(
    member: HostMember,
    target: GridPoint,
    reason: string,
    state: TacticalWizardSimulationStateV15,
    intervalTicks: number,
  ): boolean {
    const agent = state.agents.find((entry) => entry.id === member.id);
    if (agent === undefined || !agent.alive || agent.ammoRounds < 3) return false;
    if (isHardReaction(agent.reactionState)) return false;
    if (distance(member.position, target) > SUPPORT_FIRE_RANGE) return false;
    if (!this.physicalLineOfFire(member, target)) return false;
    if (member.locomotionMode === 'covered_dash') return false;

    const settled = member.tacticalTarget === null || distance(member.position, member.tacticalTarget) <= 1.2;
    if (!settled && member.locomotionMode === 'forward') return false;
    if (member.firePulse > 2) return false;

    const previousTick = this.lastSupplementalFireTick.get(member.id) ?? -999;
    if (state.logicalTick - previousTick < intervalTicks) return false;

    const before = member.firePulse;
    this.v16Host().tryFire(member, target, reason);
    if (member.firePulse <= before) return false;
    this.lastSupplementalFireTick.set(member.id, state.logicalTick);
    this.supplementalBursts += 1;
    return true;
  }

  private grenadeAllowed(member: HostMember, state: TacticalWizardSimulationStateV15): boolean {
    const target = state.squad.sharedLastKnownPosition;
    if (target === null) return false;
    if (state.squad.tactic === 'regroup' || member.task === 'regroup') return false;

    const recovery = state.recovery;
    if (recovery.phase !== 'none' && (recovery.rescuerId === member.id || recovery.covererId === member.id)) return false;

    const agent = state.agents.find((entry) => entry.id === member.id);
    if (agent === undefined || !agent.alive || isHardReaction(agent.reactionState)) return false;

    const visualIds = this.confirmedVisualIds(state);
    const liveContact = visualIds.length > 0;
    const range = distance(member.position, target);

    if (liveContact) {
      if (range < GRENADE_VISIBLE_MIN_RANGE) return false;
      const rifleReady = agent.ammoRounds >= 9 && this.physicalLineOfFire(member, state.player);
      const maneuverScreen = member.task === 'bound_to_cover' || member.task === 'flank_to_cover';
      // When a useful rifle line already exists, rifle fire owns the action
      // unless the mover is specifically seeking a smoke screen.
      if (rifleReady && !maneuverScreen) return false;
    } else if (range < GRENADE_HIDDEN_MIN_RANGE) return false;

    if (state.squad.tactic === 'sweep' && state.contactTrack.lkpCleared && state.contactTrack.frontier.length === 0) return false;
    return true;
  }

  private preemptConflictingLogistics(state: TacticalWizardSimulationStateV15, source: string): void {
    const assignment = this.v16V8().assignment;
    if (assignment === null) return;
    this.preemptMemberLogistics(assignment.agentId, state, source);
  }

  private preemptMemberLogistics(agentId: string, state: TacticalWizardSimulationStateV15, source: string): void {
    const v8 = this.v16V8();
    const assignment = v8.assignment;
    if (assignment === null || assignment.agentId !== agentId) return;
    const hasVisual = this.confirmedVisualIds(state).length > 0;
    const decision = this.commitmentFor(agentId, state, hasVisual);
    if (!this.shouldPreemptAssignment(assignment, agentId, state, decision)) return;

    v8.assignment = null;
    this.logisticsPreemptions += 1;
    if (typeof v8.updateCommandOrder === 'function') v8.updateCommandOrder();
    const host = this.v16Host();
    host.pushEvent(`T${state.logicalTick}: ${agentId} logistics suspended for ${decision.commitment}.`);
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Lower-priority logistics was preempted by an operational commitment.', {
      agentId,
      logisticsTask: assignment.task,
      supplyId: assignment.supplyId,
      commitment: decision.commitment,
      priority: decision.priority,
      source,
      reason: decision.reason,
    });
  }

  private shouldPreemptAssignment(
    assignment: LogisticsAssignment,
    agentId: string,
    state: TacticalWizardSimulationStateV15,
    decision: CommitmentDecision,
  ): boolean {
    if (decision.priority < PRIORITY.search) return false;
    if (decision.commitment === 'recovery_rescue' || decision.commitment === 'recovery_security'
      || decision.commitment === 'reaction' || decision.commitment === 'counterfire' || decision.commitment === 'search') return true;

    if (decision.commitment !== 'direct_combat') return false;
    const agent = state.agents.find((entry) => entry.id === agentId);
    if (agent === undefined) return true;
    const urgentAmmo = (assignment.task === 'resupply_ammo' || assignment.task === 'resupply_mixed')
      && agent.ammoRounds <= AMMO_CRITICAL_FOR_DETACHMENT;
    return !urgentAmmo;
  }

  private commitmentFor(agentId: string, state: TacticalWizardSimulationStateV15, hasVisual: boolean): CommitmentDecision {
    const agent = state.agents.find((entry) => entry.id === agentId);
    if (agent === undefined || !agent.alive) return { commitment: 'reaction', priority: PRIORITY.reaction, reason: 'agent is not operational' };

    if (state.recovery.rescuerId === agentId) return { commitment: 'recovery_rescue', priority: PRIORITY.recovery_rescue, reason: 'casualty treatment owns movement/action' };
    if (state.recovery.covererId === agentId) return { commitment: 'recovery_security', priority: PRIORITY.recovery_security, reason: 'casualty fire-support security owns movement/action' };
    if (isHardReaction(agent.reactionState)) return { commitment: 'reaction', priority: PRIORITY.reaction, reason: `reactive state ${agent.reactionState} is active` };
    if (state.counterfire.active && state.counterfire.agentId === agentId) return { commitment: 'counterfire', priority: PRIORITY.counterfire, reason: 'coarse incoming-fire counteraction is committed' };

    if (state.squad.tactic === 'sweep'
      && (agentId === state.coordination.searchLeadId || agentId === state.coordination.searchCoverId || agentId === state.coordination.searchOverwatchId)) {
      return { commitment: 'search', priority: PRIORITY.search, reason: 'member owns the active search contract' };
    }

    if (hasVisual && state.squad.alertState === 'active') return { commitment: 'direct_combat', priority: PRIORITY.direct_combat, reason: 'squad has current confirmed visual contact' };

    if (this.v16V8().assignment?.agentId === agentId) return { commitment: 'logistics', priority: PRIORITY.logistics, reason: 'safe resupply detachment is active' };
    return { commitment: 'patrol', priority: PRIORITY.patrol, reason: 'no higher operational commitment is active' };
  }

  private handleBlockedFire(member: HostMember, reason: string, blockerId: string): void {
    const key = `${member.id}:${blockerId}`;
    const next = (this.blockedFireStreak.get(key) ?? 0) + 1;
    this.blockedFireStreak.set(key, next);

    const recovery = this.v16Recovery();
    const plan = recovery.rescuePlan;
    const isRescueSecurity = plan?.covererId === member.id || /rescue security/i.test(reason);
    if (!isRescueSecurity || next < RESCUE_BLOCK_REPLAN_STREAK) return;

    const tick = this.v16Host().logicalTick;
    if (tick - this.lastRescueLaneReplanTick < RESCUE_BLOCK_REPLAN_COOLDOWN_TICKS) return;
    this.lastRescueLaneReplanTick = tick;
    this.rescueLaneReplans += 1;
    recovery.rescueSupportPlanKey = null;
    recovery.rescueSupportPosition = null;
    recovery.rescueCoverTarget = null;
    recovery.rescueSecurityReplans = Math.min(2, Math.max(0, recovery.rescueSecurityReplans) + 1);
    recovery.rescueSecurityLastReplanTick = tick;
    this.blockedFireStreak.delete(key);

    const host = this.v16Host();
    host.pushEvent(`T${tick}: rescue security fire lane repeatedly blocked; alternate support geometry requested.`);
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Rescue security rejected a persistently friendly-blocked firing lane and requested alternate geometry.', {
      covererId: member.id,
      blockerId,
      blockedAttempts: next,
      reason,
      replan: recovery.rescueSecurityReplans,
    });
  }

  private clearBlockedFire(memberId: string): void {
    for (const key of [...this.blockedFireStreak.keys()]) if (key.startsWith(`${memberId}:`)) this.blockedFireStreak.delete(key);
  }

  private updateSearchEpisodePhase(state: TacticalWizardSimulationStateV15): void {
    const phase = this.resolveSearchPhase(state, this.confirmedVisualIds(state).length > 0);
    if (phase === this.lastSearchPhase) return;
    const previous = this.lastSearchPhase;
    this.lastSearchPhase = phase;
    this.v16Host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'search', `Search episode phase ${previous} → ${phase}.`, {
      from: previous,
      to: phase,
      episodeId: state.contactTrack.episodeId,
      contactStatus: state.contactTrack.status,
      lkpCleared: state.contactTrack.lkpCleared,
      egressDirection: state.contactTrack.egressDirection,
      frontierCount: state.contactTrack.frontier.length,
      clearedNodeCount: state.contactTrack.clearedSearchNodes.length,
    });
  }

  private resolveSearchPhase(state: TacticalWizardSimulationStateV15, hasVisual: boolean): SearchEpisodePhase {
    if (state.squad.tactic !== 'sweep') return 'none';
    if (hasVisual) return 'reacquire';
    if (state.contactTrack.lastConfirmedPosition === null) return 'none';
    if (!state.contactTrack.lkpCleared) return 'verify_lkp';
    if (state.contactTrack.lkpClearedTick !== null
      && state.logicalTick - state.contactTrack.lkpClearedTick <= SEARCH_EXPAND_VISUAL_TICKS) return 'expand_frontier';
    return state.contactTrack.frontier.length > 0 ? 'search_frontier' : 'expand_frontier';
  }

  private confirmedVisualIds(state: TacticalWizardSimulationStateV15): readonly string[] {
    const alive = new Set(state.agents.filter((agent) => agent.alive).map((agent) => agent.id));
    const host = this.v16Host();
    return host.members.filter((member) => alive.has(member.id) && host.canSeePlayer(member)).map((member) => member.id);
  }

  private memberOperational(agentId: string, state: TacticalWizardSimulationStateV15): boolean {
    const agent = state.agents.find((entry) => entry.id === agentId);
    return agent?.alive === true && !isHardReaction(agent.reactionState);
  }

  private physicalLineOfFire(member: HostMember, target: GridPoint): boolean {
    const origin = member.coverSlot !== null && member.coverSlot !== undefined
      && distance(member.position, member.coverSlot.position) <= 0.9
      ? member.coverSlot.peekPosition
      : member.position;
    return hasLineOfSight(tacticalWizardNavigationGrid, toCell(origin), toCell(target));
  }

  private v16Host(): HostAccess {
    return this as unknown as HostAccess;
  }

  private v16V8(): V8Access {
    return this as unknown as V8Access;
  }

  private v16Recovery(): RecoveryInternals {
    return this as unknown as RecoveryInternals;
  }
}

function isSupportFireTask(task: string, role: string): boolean {
  return task === 'suppress'
    || task === 'hold_cover'
    || task === 'crossfire'
    || task === 'overwatch'
    || role === 'suppressor'
    || role === 'crossfire'
    || role === 'support';
}

function isHardReaction(reaction: string): boolean {
  return reaction === 'downed'
    || reaction === 'stunned'
    || reaction === 'dodge'
    || reaction === 'smoke_retreat'
    || reaction === 'smoke_reposition'
    || reaction === 'flash_push'
    || reaction === 'grenade_suppress';
}

function grenadePurpose(specialAction: string, tactic: string, lkpCleared: boolean): string {
  if (specialAction === 'throw_flash') return tactic === 'sweep' && lkpCleared ? 'probe_search_frontier' : 'force_reposition';
  if (specialAction === 'throw_smoke') return 'screen_movement_or_break_contact';
  if (specialAction === 'throw_frag') return 'force_reposition_under_standoff';
  return 'none';
}

function toCell(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))),
  };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function near(a: GridPoint, b: GridPoint, radius: number): boolean {
  return distance(a, b) <= radius;
}
