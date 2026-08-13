import { findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from './tacticalWizardTestMapV7';
import {
  TacticalWizardSimulation as TacticalWizardSimulationV12,
  type TacticalWizardSimulationState as TacticalWizardSimulationStateV12,
} from './tacticalWizardSimulationV12';

export * from './tacticalWizardSimulationV12';

export interface CounterfireView {
  readonly active: boolean;
  readonly agentId: string | null;
  readonly target: GridPoint | null;
  readonly supportPosition: GridPoint | null;
  readonly positionReady: boolean;
  readonly lineOfFire: boolean;
  readonly lastFireTick: number | null;
}

export interface TacticalWizardSimulationState extends TacticalWizardSimulationStateV12 {
  readonly counterfire: CounterfireView;
}

interface HostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  facing: GridPoint;
  firePulse: number;
  targetVisible: boolean;
  task: string;
  role: string;
  tacticalTarget: GridPoint | null;
  stalledTicks: number;
  buddyRole: string;
  opportunityPurpose: string;
  searchIndex: number;
  searchScanIndex: number;
  searchHoldFrames: number;
  searchComplete: boolean;
}

interface HostAccess {
  members: HostMember[];
  logicalTick: number;
  tactic: string;
  tacticStartedTick: number;
  tacticReason: string;
  suppressorId: string | null;
  moverId: string | null;
  observerId: string | null;
  searchLeadId: string | null;
  searchCoverId: string | null;
  searchOverwatchId: string | null;
  movementTarget: (member: HostMember) => GridPoint | null;
  canSeePlayer: (member: HostMember) => boolean;
  buildStimuli: (member: HostMember, visible: boolean) => readonly unknown[];
  updatePostureAndFacing: (member: HostMember) => void;
  applyRoles: () => void;
  refreshTacticalPlan: () => void;
  tryFire: (member: HostMember, target: GridPoint, reason: string) => void;
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

interface VitalsAccess {
  vitals: Map<string, { health: number; readonly maxHealth: number; readonly moveSpeed: number }>;
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

interface V10Access {
  rescuePlan: RescuePlanAccess | null;
  tryCreateRescuePlan: (state: MinimalState) => void;
  validateRescuePlan: (state: MinimalState) => void;
  advanceRecovery: (deltaSeconds: number) => void;
}

interface V11Access {
  rescueCoverTarget: GridPoint | null;
  rescueCoverPlanKey: string | null;
  rescueSuppressedUntilTick: number;
  enforceRescueSecurity: (state: MinimalState) => void;
}

interface V12Access {
  rescueSupportPlanKey: string | null;
  rescueSupportPosition: GridPoint | null;
  rescueSupportTarget: GridPoint | null;
  lastRescueSupportFireTick: number | null;
  prepareRescueSupport: (state: TacticalWizardSimulationStateV12) => void;
}

interface MinimalAgent {
  readonly id: string;
  readonly label: string;
  readonly alive: boolean;
  readonly position: GridPoint;
  readonly facing: GridPoint;
  readonly targetVisible: boolean;
  readonly lastKnownPosition: GridPoint | null;
  readonly reactionState: string;
  readonly ammoRounds?: number;
  readonly logisticsTask?: string;
}

interface MinimalState {
  readonly logicalTick: number;
  readonly player: GridPoint;
  readonly agents: readonly MinimalAgent[];
  readonly squad: { readonly sharedLastKnownPosition: GridPoint | null };
}

const RESCUE_SECURITY_RADIUS = 5;
const RESCUE_SECURITY_MIN_CASUALTY_DISTANCE = 2.0;
const RESCUE_SECURITY_MAX_CASUALTY_DISTANCE = 5.0;
const RESCUE_SECURITY_DESIRED_CASUALTY_DISTANCE = 3.2;
const RESCUE_SECURITY_ARRIVAL = 0.95;
const RESCUE_SECURITY_REPLAN_TICKS = 16;
const RESCUE_SECURITY_ABORT_TICKS = 44;
const RESCUE_RETRY_COOLDOWN_TICKS = 16;
const MAX_RESCUE_SECURITY_REPLANS = 2;
const COUNTERFIRE_RADIUS = 6;
const COUNTERFIRE_ARRIVAL = 1.0;
const COUNTERFIRE_INTERVAL_TICKS = 2;
const COUNTERFIRE_COMMIT_TICKS = 24;

/**
 * V14 is the play-test stabilization host for the V9-V12 combat stack.
 *
 * The fixes intentionally remain Host-owned:
 * - health decides whether a proxy is an operational perception/tactical member;
 * - casualty recovery has one physical fire-support readiness gate;
 * - rescue support searches near the casualty and has bounded replans/abort;
 * - unseen incoming fire assigns a different living member to counterfire at a
 *   coarse inferred sector while the exposed member breaks contact.
 *
 * No hidden live player position is consumed. Exact player coordinates are used
 * only while a living member has confirmed visual contact. Otherwise all fire
 * and search use coarse threat sector, shared LKP, or recorded Agent memory.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationV12 {
  private rescueRetryUntilTick = -1;
  private rescueUnavailableKey: string | null = null;
  private rescueSecurityPlanKey: string | null = null;
  private rescueSecurityReplans = 0;
  private rescueSecurityLastReplanTick = -999;
  private rescueThreatMemory: GridPoint | null = null;

  private counterfireAgentId: string | null = null;
  private counterfireTarget: GridPoint | null = null;
  private counterfirePosition: GridPoint | null = null;
  private counterfirePlanKey: string | null = null;
  private lastCounterfireTick: number | null = null;

  constructor() {
    super();
    this.installOperationalHooks();
    this.installRescueHooks();
    this.installPriorityMovementHook();
    const host = this.v14Host();
    host.pushEvent('V14: operational-roster filtering, bounded rescue security and unseen-fire counterfire enabled.');
    host.log('system', 'simulation', 'Volition Simulation', 'session', 'V14 rescue reliability / counterfire layer enabled.', {
      hiddenTargetPolicy: 'visible_player_or_recorded_lkp_or_coarse_sector_only',
      rescueSecurityReplanTicks: RESCUE_SECURITY_REPLAN_TICKS,
      rescueSecurityAbortTicks: RESCUE_SECURITY_ABORT_TICKS,
      counterfireCommitTicks: COUNTERFIRE_COMMIT_TICKS,
    });
  }

  override reset(): TacticalWizardSimulationState {
    super.reset();
    this.rescueRetryUntilTick = -1;
    this.rescueUnavailableKey = null;
    this.rescueSecurityPlanKey = null;
    this.rescueSecurityReplans = 0;
    this.rescueSecurityLastReplanTick = -999;
    this.rescueThreatMemory = null;
    this.clearCounterfire();
    this.v14Host().pushEvent('V14: rescue reliability / operational roster / counterfire state reset.');
    return this.getState();
  }

  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    this.maintainOperationalRoster(false);
    super.advance(deltaSeconds);
    this.maintainOperationalRoster(false);
    this.maintainCounterfire(super.getState());
    return this.getState();
  }

  override playerFireAt(point: GridPoint): boolean {
    const result = super.playerFireAt(point);
    this.maintainOperationalRoster(true);
    this.maintainCounterfire(super.getState());
    return result;
  }

  override getState(): TacticalWizardSimulationState {
    const base = super.getState();
    const member = this.counterfireAgentId === null
      ? null
      : base.agents.find((agent) => agent.id === this.counterfireAgentId) ?? null;
    const positionReady = member !== null
      && this.counterfirePosition !== null
      && distance(member.position, this.counterfirePosition) <= COUNTERFIRE_ARRIVAL;
    const lineOfFire = member !== null
      && this.counterfireTarget !== null
      && hasLineOfSight(tacticalWizardNavigationGrid, toCell(member.position), toCell(this.counterfireTarget));
    return {
      ...base,
      counterfire: {
        active: base.threatResponse.active && this.counterfireAgentId !== null && this.counterfireTarget !== null,
        agentId: this.counterfireAgentId,
        target: clonePoint(this.counterfireTarget),
        supportPosition: clonePoint(this.counterfirePosition),
        positionReady,
        lineOfFire,
        lastFireTick: this.lastCounterfireTick,
      },
    };
  }

  private installOperationalHooks(): void {
    const host = this.v14Host();
    const originalCanSeePlayer = host.canSeePlayer.bind(this);
    host.canSeePlayer = (member: HostMember): boolean => this.isOperational(member.id) && originalCanSeePlayer(member);

    const originalBuildStimuli = host.buildStimuli.bind(this);
    host.buildStimuli = (member: HostMember, visible: boolean): readonly unknown[] => {
      if (!this.isOperational(member.id)) return [];
      return originalBuildStimuli(member, visible);
    };

    const originalPosture = host.updatePostureAndFacing.bind(this);
    host.updatePostureAndFacing = (member: HostMember): void => {
      if (!this.isOperational(member.id)) {
        member.targetVisible = false;
        member.stalledTicks = 0;
        return;
      }
      originalPosture(member);
    };

    const originalApplyRoles = host.applyRoles.bind(this);
    host.applyRoles = (): void => {
      this.normalizeOperationalRoleIds();
      originalApplyRoles();
      this.normalizeSearchContract();
      this.sanitizeDownedMembers();
    };

    const originalRefreshPlan = host.refreshTacticalPlan.bind(this);
    host.refreshTacticalPlan = (): void => {
      this.normalizeOperationalRoleIds();
      originalRefreshPlan();
      this.normalizeSearchContract();
      this.sanitizeDownedMembers();
    };
  }

  private installRescueHooks(): void {
    const v10 = this.v14V10();
    const v11 = this.v14V11();
    const v12 = this.v14V12();

    const originalTryCreateRescuePlan = v10.tryCreateRescuePlan.bind(this);
    v10.tryCreateRescuePlan = (state: MinimalState): void => {
      if (state.logicalTick < this.rescueRetryUntilTick) return;
      const downed = state.agents.find((agent) => !agent.alive);
      if (downed === undefined) {
        this.rescueUnavailableKey = null;
        return;
      }
      const alive = state.agents.filter((agent) => agent.alive);
      if (alive.length < 2) {
        const key = `${downed.id}:${alive.map((agent) => agent.id).join(',')}`;
        if (this.rescueUnavailableKey !== key) {
          this.rescueUnavailableKey = key;
          this.v14Host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Casualty recovery deferred: no separate living security element is available.', {
            downedId: downed.id,
            livingAgents: alive.map((agent) => agent.id),
            retryPolicy: 'wait_for_roster_change_or_cooldown',
          });
        }
        return;
      }

      this.rescueUnavailableKey = null;
      originalTryCreateRescuePlan(state);
      const plan = v10.rescuePlan;
      if (plan !== null && (plan.covererId === null || plan.covererId === plan.rescuerId)) {
        this.abortRescue('invalid rescue assignment: a distinct security element is required');
      }
    };

    const originalValidateRescuePlan = v10.validateRescuePlan.bind(this);
    v10.validateRescuePlan = (state: MinimalState): void => {
      originalValidateRescuePlan(state);
      const plan = v10.rescuePlan;
      if (plan === null) return;
      const coverer = plan.covererId === null ? null : state.agents.find((agent) => agent.id === plan.covererId) ?? null;
      if (coverer === null || !coverer.alive || plan.covererId === plan.rescuerId) {
        this.abortRescue('rescue security element became unavailable');
      }
    };

    const originalAdvanceRecovery = v10.advanceRecovery.bind(this);
    v10.advanceRecovery = (deltaSeconds: number): void => {
      const plan = v10.rescuePlan;
      if (plan === null) return;
      const state = super.getState();
      const planKey = this.rescuePlanKey(plan);
      if (this.rescueSecurityPlanKey !== planKey) {
        this.rescueSecurityPlanKey = planKey;
        this.rescueSecurityReplans = 0;
        this.rescueSecurityLastReplanTick = plan.startedTick;
      }

      if (plan.phase === 'establish_cover') {
        if (!this.rescueSecurityReady(state, plan)) {
          this.handleRescueSecurityWait(state, plan);
          return;
        }
        if (state.logicalTick < Math.max(plan.coverReadyTick, v11.rescueSuppressedUntilTick)) return;
        plan.phase = 'approach';
        plan.treatmentSeconds = 0;
        this.v14Host().pushEvent(`T${state.logicalTick}: rescue security lane is physically ready; casualty approach begins.`);
        this.v14Host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Rescue advanced only after the security element reached a usable threat-facing lane.', {
          downedId: plan.downedAgentId,
          rescuerId: plan.rescuerId,
          covererId: plan.covererId,
          securityPosition: clonePoint(v12.rescueSupportPosition),
          fireTarget: clonePoint(v12.rescueSupportTarget),
        });
        return;
      }

      if (!this.rescueSecurityReady(state, plan)) {
        plan.phase = 'establish_cover';
        plan.treatmentSeconds = 0;
        this.handleRescueSecurityWait(state, plan);
        return;
      }
      originalAdvanceRecovery(deltaSeconds);
    };

    v11.enforceRescueSecurity = (state: MinimalState): void => {
      const plan = v10.rescuePlan;
      if (plan === null) {
        v11.rescueCoverTarget = null;
        v11.rescueCoverPlanKey = null;
        return;
      }
      if (plan.covererId === null) {
        this.abortRescue('no distinct rescue security element is available');
        return;
      }
      const coverer = state.agents.find((agent) => agent.id === plan.covererId);
      if (coverer === undefined || !coverer.alive) this.abortRescue('rescue security element is no longer combat-capable');
    };

    v12.prepareRescueSupport = (state: TacticalWizardSimulationStateV12): void => {
      this.prepareRescueSupportV14(state);
    };
  }

  private installPriorityMovementHook(): void {
    const host = this.v14Host();
    const originalMovementTarget = host.movementTarget.bind(this);
    host.movementTarget = (member: HostMember): GridPoint | null => {
      const base = originalMovementTarget(member);
      if (!this.isOperational(member.id)) return base;
      const state = super.getState();
      const agent = state.agents.find((entry) => entry.id === member.id);
      if (agent === undefined || isHardReaction(agent.reactionState)) return base;

      const rescue = this.v14V10().rescuePlan;
      const rescuePosition = this.v14V12().rescueSupportPosition;
      if (rescue !== null && rescue.covererId === member.id && rescue.phase === 'establish_cover' && rescuePosition !== null) {
        return { ...rescuePosition };
      }

      const threatStarted = state.threatResponse.startedTick ?? state.logicalTick;
      const counterfireWindow = state.threatResponse.active && state.logicalTick - threatStarted <= COUNTERFIRE_COMMIT_TICKS;
      if (counterfireWindow && this.counterfireAgentId === member.id && this.counterfirePosition !== null) {
        return { ...this.counterfirePosition };
      }
      return base;
    };
  }

  private prepareRescueSupportV14(state: TacticalWizardSimulationStateV12): void {
    const plan = this.v14V10().rescuePlan;
    const support = this.v14V12();
    if (plan === null || plan.covererId === null) {
      support.rescueSupportPlanKey = null;
      support.rescueSupportPosition = null;
      support.rescueSupportTarget = null;
      support.lastRescueSupportFireTick = null;
      this.rescueThreatMemory = null;
      this.rescueSecurityPlanKey = null;
      this.rescueSecurityReplans = 0;
      return;
    }

    const coverer = state.agents.find((agent) => agent.id === plan.covererId);
    const rescuer = state.agents.find((agent) => agent.id === plan.rescuerId);
    const casualty = state.agents.find((agent) => agent.id === plan.downedAgentId);
    if (coverer === undefined || casualty === undefined || !coverer.alive) {
      support.rescueSupportPosition = null;
      support.rescueSupportTarget = null;
      return;
    }

    const confirmedVisible = coverer.targetVisible || rescuer?.targetVisible === true;
    const target = confirmedVisible
      ? state.player
      : state.threatResponse.estimatedSector
        ?? state.squad.sharedLastKnownPosition
        ?? coverer.lastKnownPosition
        ?? rescuer?.lastKnownPosition
        ?? casualty.lastKnownPosition
        ?? this.rescueThreatMemory;
    if (target !== null) this.rescueThreatMemory = { ...target };
    const fireTarget = target ?? this.rescueThreatMemory;
    if (fireTarget === null) {
      support.rescueSupportTarget = null;
      support.rescueSupportPosition = null;
      this.v14V11().rescueCoverTarget = null;
      return;
    }

    const targetCell = toCell(fireTarget);
    const planKey = `${this.rescuePlanKey(plan)}:${gridKey(targetCell)}:${this.rescueSecurityReplans}`;
    const currentLaneValid = support.rescueSupportPosition !== null
      && distance(support.rescueSupportPosition, casualty.position) <= RESCUE_SECURITY_MAX_CASUALTY_DISTANCE + 0.25
      && hasLineOfSight(tacticalWizardNavigationGrid, toCell(support.rescueSupportPosition), targetCell);

    if (support.rescueSupportPlanKey !== planKey || support.rescueSupportPosition === null || !currentLaneValid) {
      const occupied = state.agents
        .filter((agent) => agent.alive && agent.id !== coverer.id)
        .map((agent) => agent.position);
      const selected = selectCasualtyLocalFireSupportPosition(coverer.position, casualty.position, fireTarget, occupied, this.rescueSecurityReplans);
      support.rescueSupportPosition = selected;
      support.rescueSupportPlanKey = planKey;
      this.v14V11().rescueCoverTarget = clonePoint(selected);
      if (selected !== null) {
        this.v14Host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Rescue security selected a casualty-local threat-facing fire-support lane.', {
          downedId: plan.downedAgentId,
          rescuerId: plan.rescuerId,
          covererId: plan.covererId,
          securityPosition: { ...selected },
          casualtyDistance: Number(distance(selected, casualty.position).toFixed(2)),
          fireTarget: { ...fireTarget },
          targetSource: confirmedVisible
            ? 'confirmed_visual'
            : state.threatResponse.estimatedSector !== null
              ? 'coarse_threat_sector'
              : state.squad.sharedLastKnownPosition !== null
                ? 'shared_last_known_position'
                : 'recorded_agent_memory',
          replan: this.rescueSecurityReplans,
        });
      }
    }

    support.rescueSupportTarget = { ...fireTarget };
    if (support.rescueSupportPosition !== null) this.v14V11().rescueCoverTarget = { ...support.rescueSupportPosition };
    const member = this.v14Host().members.find((entry) => entry.id === plan.covererId);
    if (member === undefined) return;
    if (support.rescueSupportPosition !== null) member.tacticalTarget = { ...support.rescueSupportPosition };
    member.task = 'suppress';
    member.role = 'suppressor';
    member.facing = normalize({ x: fireTarget.x - member.position.x, y: fireTarget.y - member.position.y });
  }

  private rescueSecurityReady(state: TacticalWizardSimulationStateV12, plan: RescuePlanAccess): boolean {
    if (plan.covererId === null) return false;
    const coverer = state.agents.find((agent) => agent.id === plan.covererId);
    const support = this.v14V12();
    if (coverer === undefined || !coverer.alive || support.rescueSupportPosition === null || support.rescueSupportTarget === null) return false;
    if (distance(coverer.position, support.rescueSupportPosition) > RESCUE_SECURITY_ARRIVAL) return false;
    return hasLineOfSight(tacticalWizardNavigationGrid, toCell(coverer.position), toCell(support.rescueSupportTarget));
  }

  private handleRescueSecurityWait(state: TacticalWizardSimulationStateV12, plan: RescuePlanAccess): void {
    const elapsed = state.logicalTick - plan.startedTick;
    if (elapsed >= RESCUE_SECURITY_ABORT_TICKS) {
      this.abortRescue('rescue security could not establish a viable lane within the bounded commitment window');
      return;
    }
    if (elapsed < RESCUE_SECURITY_REPLAN_TICKS) return;
    if (this.rescueSecurityReplans >= MAX_RESCUE_SECURITY_REPLANS) return;
    if (state.logicalTick - this.rescueSecurityLastReplanTick < RESCUE_SECURITY_REPLAN_TICKS) return;

    this.rescueSecurityReplans += 1;
    this.rescueSecurityLastReplanTick = state.logicalTick;
    const support = this.v14V12();
    support.rescueSupportPlanKey = null;
    support.rescueSupportPosition = null;
    this.v14V11().rescueCoverTarget = null;
    this.v14Host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Rescue security lane stalled; one bounded alternate-position replan was requested.', {
      downedId: plan.downedAgentId,
      rescuerId: plan.rescuerId,
      covererId: plan.covererId,
      elapsedTicks: elapsed,
      replan: this.rescueSecurityReplans,
      maxReplans: MAX_RESCUE_SECURITY_REPLANS,
    });
  }

  private abortRescue(reason: string): void {
    const v10 = this.v14V10();
    const plan = v10.rescuePlan;
    if (plan === null) return;
    const tick = this.v14Host().logicalTick;
    this.v14Host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Rescue commitment ended cleanly instead of re-entering an unbounded positioning loop.', {
      downedId: plan.downedAgentId,
      rescuerId: plan.rescuerId,
      covererId: plan.covererId,
      reason,
      retryAfterTick: tick + RESCUE_RETRY_COOLDOWN_TICKS,
    });
    v10.rescuePlan = null;
    this.rescueRetryUntilTick = tick + RESCUE_RETRY_COOLDOWN_TICKS;
    this.rescueSecurityPlanKey = null;
    this.rescueSecurityReplans = 0;
    this.rescueThreatMemory = null;
    const support = this.v14V12();
    support.rescueSupportPlanKey = null;
    support.rescueSupportPosition = null;
    support.rescueSupportTarget = null;
    this.v14V11().rescueCoverTarget = null;
  }

  private maintainOperationalRoster(replanOnChange: boolean): void {
    const host = this.v14Host();
    const before = `${host.suppressorId}|${host.moverId}|${host.observerId}|${host.searchLeadId}|${host.searchCoverId}|${host.searchOverwatchId}`;
    this.normalizeOperationalRoleIds();
    this.normalizeSearchContract();
    this.sanitizeDownedMembers();
    const after = `${host.suppressorId}|${host.moverId}|${host.observerId}|${host.searchLeadId}|${host.searchCoverId}|${host.searchOverwatchId}`;
    if (!replanOnChange || before === after || this.operationalMembers().length === 0) return;

    if (this.operationalMembers().length < 3 && (host.tactic === 'crossfire' || host.tactic === 'assault')) {
      host.tactic = 'bounding';
      host.tacticStartedTick = host.logicalTick;
      host.tacticReason = 'Casualty reduced squad capacity; complex three-element maneuver degraded to mutual-support bounding.';
    }
    host.applyRoles();
    host.refreshTacticalPlan();
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'roles', 'Downed members were removed from active perception / maneuver responsibilities.', {
      livingAgents: this.operationalMembers().map((member) => member.id),
      suppressorId: host.suppressorId,
      moverId: host.moverId,
      observerId: host.observerId,
    });
  }

  private normalizeOperationalRoleIds(): void {
    const host = this.v14Host();
    const living = this.operationalMembers();
    const livingIds = new Set(living.map((member) => member.id));
    if (living.length === 0) {
      host.suppressorId = null;
      host.moverId = null;
      host.observerId = null;
      host.searchLeadId = null;
      host.searchCoverId = null;
      host.searchOverwatchId = null;
      return;
    }

    if (host.suppressorId === null || !livingIds.has(host.suppressorId)) host.suppressorId = living[0]!.id;
    const primaryUsed = new Set<string>(host.suppressorId === null ? [] : [host.suppressorId]);
    if (host.moverId === null || !livingIds.has(host.moverId) || primaryUsed.has(host.moverId)) {
      host.moverId = living.find((member) => !primaryUsed.has(member.id))?.id ?? null;
    }
    const secondaryUsed = new Set<string>([host.suppressorId, host.moverId].filter((id): id is string => id !== null));
    if (host.observerId === null || !livingIds.has(host.observerId) || secondaryUsed.has(host.observerId)) {
      host.observerId = living.find((member) => !secondaryUsed.has(member.id))?.id ?? null;
    }
  }

  private normalizeSearchContract(): void {
    const host = this.v14Host();
    if (host.tactic !== 'sweep') return;
    const living = this.operationalMembers();
    if (living.length >= 3) return;

    if (living.length === 2) {
      const overwatch = living.find((member) => member.id === host.suppressorId) ?? living[0]!;
      const lead = living.find((member) => member.id !== overwatch.id) ?? living[1]!;
      host.searchLeadId = lead.id;
      host.searchCoverId = null;
      host.searchOverwatchId = overwatch.id;
      lead.task = 'search_sector';
      lead.buddyRole = 'lead';
      lead.opportunityPurpose = 'search';
      overwatch.task = 'overwatch';
      overwatch.buddyRole = 'overwatch';
      overwatch.opportunityPurpose = 'block_exit';
      return;
    }

    if (living.length === 1) {
      const solo = living[0]!;
      host.searchLeadId = solo.id;
      host.searchCoverId = null;
      host.searchOverwatchId = null;
      solo.task = 'search_sector';
      solo.buddyRole = 'lead';
      solo.opportunityPurpose = 'search';
      return;
    }

    host.searchLeadId = null;
    host.searchCoverId = null;
    host.searchOverwatchId = null;
  }

  private sanitizeDownedMembers(): void {
    for (const member of this.v14Host().members) {
      if (this.isOperational(member.id)) continue;
      member.targetVisible = false;
      member.firePulse = 0;
      member.tacticalTarget = null;
      member.stalledTicks = 0;
      member.role = 'support';
      member.task = 'patrol';
      member.buddyRole = 'none';
      member.opportunityPurpose = 'none';
      member.searchIndex = 0;
      member.searchScanIndex = 0;
      member.searchHoldFrames = 0;
      member.searchComplete = true;
    }
  }

  private maintainCounterfire(state: TacticalWizardSimulationStateV12): void {
    const threat = state.threatResponse;
    const started = threat.startedTick ?? state.logicalTick;
    const withinCommitWindow = threat.active && state.logicalTick - started <= COUNTERFIRE_COMMIT_TICKS;
    if (!withinCommitWindow || threat.estimatedSector === null || this.v14V10().rescuePlan !== null) {
      this.clearCounterfire();
      return;
    }

    const living = state.agents.filter((agent) => agent.alive);
    const candidates = living
      .filter((agent) => agent.id !== threat.sourceAgentId)
      .filter((agent) => (agent.ammoRounds ?? 0) >= 3)
      .filter((agent) => agent.logisticsTask === undefined || agent.logisticsTask === 'none')
      .filter((agent) => !isHardReaction(agent.reactionState));
    if (candidates.length === 0) {
      this.clearCounterfire();
      return;
    }

    const target = { ...threat.estimatedSector };
    const planKey = `${threat.sourceAgentId ?? 'unknown'}:${gridKey(toCell(target))}:${started}`;
    if (this.counterfirePlanKey !== planKey || this.counterfireAgentId === null || !candidates.some((agent) => agent.id === this.counterfireAgentId)) {
      const ranked = candidates
        .map((agent) => {
          const occupied = living.filter((other) => other.id !== agent.id).map((other) => other.position);
          const supportPosition = selectCounterfirePosition(agent.position, target, occupied);
          const currentLane = hasLineOfSight(tacticalWizardNavigationGrid, toCell(agent.position), toCell(target));
          return {
            agent,
            supportPosition,
            score: supportPosition === null ? -9999 : (currentLane ? 40 : 0) - distance(agent.position, supportPosition) * 2,
          };
        })
        .filter((entry) => entry.supportPosition !== null)
        .sort((left, right) => right.score - left.score || left.agent.id.localeCompare(right.agent.id, 'en'));
      const selected = ranked[0];
      if (selected === undefined || selected.supportPosition === null) {
        this.clearCounterfire();
        return;
      }
      this.counterfireAgentId = selected.agent.id;
      this.counterfireTarget = target;
      this.counterfirePosition = selected.supportPosition;
      this.counterfirePlanKey = planKey;
      this.lastCounterfireTick = null;
      this.v14Host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'A non-exposed member established counterfire responsibility against the coarse incoming-fire sector.', {
        exposedAgentId: threat.sourceAgentId,
        counterfireAgentId: selected.agent.id,
        inferredSector: { ...target },
        supportPosition: { ...selected.supportPosition },
        sourcePrecision: 'coarse_sector_only',
      });
    } else {
      this.counterfireTarget = target;
    }

    const member = this.counterfireAgentId === null ? null : this.v14Host().members.find((entry) => entry.id === this.counterfireAgentId) ?? null;
    const agent = this.counterfireAgentId === null ? null : state.agents.find((entry) => entry.id === this.counterfireAgentId) ?? null;
    if (member === null || agent === null || !agent.alive || this.counterfireTarget === null || this.counterfirePosition === null) return;

    member.task = 'suppress';
    member.role = 'suppressor';
    member.tacticalTarget = { ...this.counterfirePosition };
    member.facing = normalize({ x: this.counterfireTarget.x - member.position.x, y: this.counterfireTarget.y - member.position.y });

    const lineOfFire = hasLineOfSight(tacticalWizardNavigationGrid, toCell(member.position), toCell(this.counterfireTarget));
    if (!lineOfFire || member.firePulse > 0) return;
    const tick = this.v14Host().logicalTick;
    if (this.lastCounterfireTick !== null && tick - this.lastCounterfireTick < COUNTERFIRE_INTERVAL_TICKS) return;
    const beforePulse = member.firePulse;
    this.v14Host().tryFire(member, this.counterfireTarget, 'counter-ambush suppression toward coarse threat sector');
    if (member.firePulse <= beforePulse) return;
    this.lastCounterfireTick = tick;
    this.v14Host().pushEvent(`T${tick}: ${member.label} returns suppressive fire toward the inferred incoming-fire sector while the exposed element breaks contact.`);
  }

  private clearCounterfire(): void {
    this.counterfireAgentId = null;
    this.counterfireTarget = null;
    this.counterfirePosition = null;
    this.counterfirePlanKey = null;
    this.lastCounterfireTick = null;
  }

  private operationalMembers(): HostMember[] {
    return this.v14Host().members
      .filter((member) => this.isOperational(member.id))
      .sort((left, right) => left.id.localeCompare(right.id, 'en'));
  }

  private isOperational(agentId: string): boolean {
    return (this.v14Vitals().vitals.get(agentId)?.health ?? 0) > 0;
  }

  private rescuePlanKey(plan: RescuePlanAccess): string {
    return `${plan.downedAgentId}:${plan.rescuerId}:${plan.covererId ?? 'none'}:${plan.startedTick}`;
  }

  private v14Host(): HostAccess {
    return this as unknown as HostAccess;
  }

  private v14Vitals(): VitalsAccess {
    return this as unknown as VitalsAccess;
  }

  private v14V10(): V10Access {
    return this as unknown as V10Access;
  }

  private v14V11(): V11Access {
    return this as unknown as V11Access;
  }

  private v14V12(): V12Access {
    return this as unknown as V12Access;
  }
}

function selectCasualtyLocalFireSupportPosition(
  from: GridPoint,
  casualty: GridPoint,
  threat: GridPoint,
  occupied: readonly GridPoint[],
  replan: number,
): GridPoint | null {
  const start = toCell(from);
  const threatCell = toCell(threat);
  const casualtyCell = toCell(casualty);
  const candidates: Array<{ readonly point: GridPoint; readonly score: number }> = [];

  for (let y = Math.max(0, casualtyCell.y - RESCUE_SECURITY_RADIUS); y <= Math.min(tacticalWizardTestMap.height - 1, casualtyCell.y + RESCUE_SECURITY_RADIUS); y += 1) {
    for (let x = Math.max(0, casualtyCell.x - RESCUE_SECURITY_RADIUS); x <= Math.min(tacticalWizardTestMap.width - 1, casualtyCell.x + RESCUE_SECURITY_RADIUS); x += 1) {
      const point = { x, y };
      if (!isWalkable(tacticalWizardNavigationGrid, point)) continue;
      if (occupied.some((entry) => distance(entry, point) < 1.25)) continue;
      const casualtyDistance = distance(point, casualty);
      if (casualtyDistance < RESCUE_SECURITY_MIN_CASUALTY_DISTANCE || casualtyDistance > RESCUE_SECURITY_MAX_CASUALTY_DISTANCE) continue;
      if (!hasLineOfSight(tacticalWizardNavigationGrid, point, threatCell)) continue;
      const path = findPath(tacticalWizardNavigationGrid, start, point);
      if (path.length === 0) continue;

      const adjacentCover = blockedNeighbourCount(point);
      const movementCost = Math.max(0, path.length - 1);
      const standoffPenalty = Math.abs(casualtyDistance - RESCUE_SECURITY_DESIRED_CASUALTY_DISTANCE);
      const replanBias = replan === 0 ? 0 : ((x * 17 + y * 31 + replan * 13) % 11) * 0.15;
      const score = adjacentCover * 18 - movementCost * 2.4 - standoffPenalty * 5 + Math.min(10, distance(point, threat)) * 0.15 + replanBias;
      candidates.push({ point, score });
    }
  }

  candidates.sort((left, right) => right.score - left.score || left.point.y - right.point.y || left.point.x - right.point.x);
  return candidates[0]?.point ?? null;
}

function selectCounterfirePosition(from: GridPoint, threat: GridPoint, occupied: readonly GridPoint[]): GridPoint | null {
  const start = toCell(from);
  const threatCell = toCell(threat);
  const candidates: Array<{ readonly point: GridPoint; readonly score: number }> = [];
  for (let y = Math.max(0, start.y - COUNTERFIRE_RADIUS); y <= Math.min(tacticalWizardTestMap.height - 1, start.y + COUNTERFIRE_RADIUS); y += 1) {
    for (let x = Math.max(0, start.x - COUNTERFIRE_RADIUS); x <= Math.min(tacticalWizardTestMap.width - 1, start.x + COUNTERFIRE_RADIUS); x += 1) {
      const point = { x, y };
      if (!isWalkable(tacticalWizardNavigationGrid, point)) continue;
      if (occupied.some((entry) => distance(entry, point) < 1.15)) continue;
      if (!hasLineOfSight(tacticalWizardNavigationGrid, point, threatCell)) continue;
      const path = findPath(tacticalWizardNavigationGrid, start, point);
      if (path.length === 0) continue;
      const movementCost = Math.max(0, path.length - 1);
      const adjacentCover = blockedNeighbourCount(point);
      const currentBonus = distance(point, from) <= 0.9 ? 32 : 0;
      candidates.push({ point, score: currentBonus + adjacentCover * 12 - movementCost * 2.2 });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.point.y - right.point.y || left.point.x - right.point.x);
  return candidates[0]?.point ?? null;
}

function blockedNeighbourCount(point: GridPoint): number {
  const offsets = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  return offsets.reduce((count, offset) => {
    const neighbour = { x: point.x + offset.x, y: point.y + offset.y };
    const inBounds = neighbour.x >= 0 && neighbour.y >= 0 && neighbour.x < tacticalWizardTestMap.width && neighbour.y < tacticalWizardTestMap.height;
    return count + (!inBounds || !isWalkable(tacticalWizardNavigationGrid, neighbour) ? 1 : 0);
  }, 0);
}

function isHardReaction(reaction: string): boolean {
  return reaction === 'dodge'
    || reaction === 'stunned'
    || reaction === 'smoke_retreat'
    || reaction === 'smoke_reposition'
    || reaction === 'grenade_suppress'
    || reaction === 'downed';
}

function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-9 ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
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
