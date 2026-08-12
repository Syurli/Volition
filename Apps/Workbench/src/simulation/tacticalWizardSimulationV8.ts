import { findPath, gridKey, isWalkable, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid } from './tacticalWizardTestMapV7';
import type { RunLogCategory, RunLogEvent, RunLogValue } from './tacticalWizardSimulationV3';
import {
  TacticalWizardSimulation as TacticalWizardSimulationV7,
  tacticalWizardTestMap,
  type BuddyRole,
  type CoverState,
  type GrenadeKind,
  type GrenadeVisual,
  type LocomotionMode,
  type SimulationOverlaySettings,
  type SpecialAction,
  type TacticalOpportunityPurpose,
  type TacticalTask,
  type TacticalWizardAgentView as TacticalWizardAgentViewV7,
  type TacticalWizardSimulationState as TacticalWizardSimulationStateV7,
} from './tacticalWizardSimulationV7';

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
};
export { tacticalWizardTestMap };

export type CommandRank = 'commander' | 'subordinate';
export type LogisticsTask = 'none' | 'resupply_ammo' | 'resupply_grenades' | 'resupply_mixed';
export type SupplyCacheKind = 'ammo' | 'grenade' | 'mixed';

export interface SupplyCacheView {
  readonly id: string;
  readonly kind: SupplyCacheKind;
  readonly position: GridPoint;
  readonly ammoRounds: number;
  readonly grenades: number;
  readonly depleted: boolean;
}

export interface TacticalWizardAgentView extends TacticalWizardAgentViewV7 {
  readonly commandRank: CommandRank;
  readonly commandTendency: string;
  readonly ammoRounds: number;
  readonly ammoCapacity: number;
  readonly burstsRemaining: number;
  readonly grenadeCapacity: number;
  readonly logisticsTask: LogisticsTask;
  readonly resupplyTargetId: string | null;
  readonly resupplyTargetPosition: GridPoint | null;
}

export interface TacticalWizardSimulationState extends Omit<TacticalWizardSimulationStateV7, 'agents'> {
  readonly agents: readonly TacticalWizardAgentView[];
  readonly supplies: readonly SupplyCacheView[];
  readonly commanderId: string;
  readonly command: {
    readonly commanderId: string;
    readonly order: string;
    readonly activeResupplyAgentId: string | null;
    readonly activeResupplySupplyId: string | null;
    readonly commanderStationarySeconds: number;
    readonly supportHandoffCount: number;
    readonly lastSupportHandoffTick: number | null;
  };
}

interface EquipmentState {
  ammoRounds: number;
  readonly ammoCapacity: number;
  readonly grenadeCapacity: number;
}

interface MutableSupply {
  readonly id: string;
  readonly kind: SupplyCacheKind;
  readonly position: GridPoint;
  ammoRounds: number;
  grenades: number;
}

interface ResupplyAssignment {
  readonly agentId: string;
  readonly supplyId: string;
  readonly task: LogisticsTask;
}

interface UnsafeMember {
  readonly id: string;
  readonly label: string;
  grenadeCount: number;
  firePulse: number;
  role: string;
  task: TacticalTask;
  targetVisible: boolean;
  position: GridPoint;
}

type UnsafeV7 = {
  members: UnsafeMember[];
  logicalTick: number;
  motionFrame: number;
  alertState: 'idle' | 'pending' | 'active';
  tactic: string;
  suppressorId: string | null;
  moverId: string | null;
  observerId: string | null;
  searchLeadId: string | null;
  searchCoverId: string | null;
  searchOverwatchId: string | null;
  safeFireLaneCount: () => number;
  movementTarget: (member: UnsafeMember) => GridPoint | null;
  tryFire: (member: UnsafeMember, target: GridPoint, reason: string) => void;
  tryGrenade: (member: UnsafeMember) => boolean;
  applyRoles: () => void;
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
};

const COMMANDER_ID = 'twr:rifle-squad:alpha';
const SQUAD_ID = 'twr:rifle-squad-01';
const SQUAD_LABEL = 'Rifle Squad 01';
const DEFAULT_AMMO = 96;
const AMMO_CAPACITY = 120;
const AMMO_PER_BURST = 3;
const AMMO_PLAN = 42;
const AMMO_LOW = 30;
const AMMO_CRITICAL = 12;
const MIN_ANCHOR_AMMO = 15;
const DEFAULT_GRENADES = 3;
const GRENADE_CAPACITY = 5;
const GRENADE_LOW = 1;
const SUPPLY_COUNT = 8;
const SUPPLY_PICKUP_RADIUS = 0.72;
const ACTIVE_RESUPPLY_MAX_PATH = 30;
const COMMANDER_STALE_NO_PICTURE_SECONDS = 5;
const COMMANDER_STALE_HARD_SECONDS = 8;
const SUPPORT_HANDOFF_COOLDOWN_TICKS = 10;

/**
 * V8.1 keeps command identity separate from tactical role.
 *
 * The commander is a decision/coordination responsibility, not a permanent
 * base-of-fire animation slot. V7 remains the proven movement/fire-lane host;
 * this layer adds equipment, proactive logistics and health checks that can
 * hand the support lane to another combat-ready member when the current anchor
 * has become stale or cannot fire.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationV7 {
  private equipment = new Map<string, EquipmentState>();
  private supplies: MutableSupply[] = [];
  private assignment: ResupplyAssignment | null = null;
  private supplySeed = 8;
  private commandOrder = 'Commander coordinates the squad while remaining eligible for normal combat maneuver.';
  private commanderLastPosition: GridPoint | null = null;
  private commanderStationarySeconds = 0;
  private lastSupportHandoffTick = -999;
  private supportHandoffCount = 0;
  private ammoPlanAnnounced = new Set<string>();
  private dryFireLogged = new Set<string>();

  constructor() {
    super();
    this.initializeEquipment();
    this.supplies = createSupplyCaches(this.supplySeed);
    this.installV8Hooks();
    this.applyDefaultGrenades();
    this.commanderLastPosition = this.commanderMember()?.position ?? null;
    const base = this.unsafe();
    base.pushEvent('V8.1: Alpha designated commander; command roles are mobile and proactive field resupply is enabled.');
    base.log('system', 'simulation', 'Volition Simulation', 'session', 'V8.1 adaptive commander / proactive logistics layer enabled.', {
      commanderId: COMMANDER_ID,
      ammoPlanThreshold: AMMO_PLAN,
      ammoLowThreshold: AMMO_LOW,
      activeResupplyMaxPath: ACTIVE_RESUPPLY_MAX_PATH,
    });
  }

  override reset(): TacticalWizardSimulationState {
    this.assignment = null;
    this.supplySeed += 1;
    this.commanderLastPosition = null;
    this.commanderStationarySeconds = 0;
    this.lastSupportHandoffTick = -999;
    this.supportHandoffCount = 0;
    this.ammoPlanAnnounced.clear();
    this.dryFireLogged.clear();
    super.reset();
    this.initializeEquipment();
    this.supplies = createSupplyCaches(this.supplySeed);
    this.applyDefaultGrenades();
    this.commandOrder = 'Commander coordinates the squad while remaining eligible for normal combat maneuver.';
    this.commanderLastPosition = this.commanderMember()?.position ?? null;
    const base = this.unsafe();
    base.pushEvent(`V8.1: logistics reset; ${this.supplies.length} deterministic-random supply caches deployed.`);
    base.log('system', 'simulation', 'Volition Simulation', 'session', 'V8.1 command mobility / logistics reset.', {
      commanderId: COMMANDER_ID,
      supplyCount: this.supplies.length,
      ammoPlanThreshold: AMMO_PLAN,
    });
    return this.getState();
  }

  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    this.validateAssignment();
    this.planResupplyIfNeeded();
    super.advance(deltaSeconds);
    this.observeCommanderMovement(deltaSeconds);
    this.maintainFireSupportHealth();
    this.resolveResupplyArrival();
    this.planResupplyIfNeeded();
    return this.getState();
  }

  override getState(): TacticalWizardSimulationState {
    const base = super.getState();
    const assignment = this.assignment;
    return {
      ...base,
      agents: base.agents.map((agent): TacticalWizardAgentView => {
        const equipment = this.equipment.get(agent.id) ?? { ammoRounds: DEFAULT_AMMO, ammoCapacity: AMMO_CAPACITY, grenadeCapacity: GRENADE_CAPACITY };
        const ownAssignment = assignment?.agentId === agent.id ? assignment : null;
        const supply = ownAssignment === null ? null : this.supplies.find((entry) => entry.id === ownAssignment.supplyId) ?? null;
        return {
          ...agent,
          commandRank: agent.id === COMMANDER_ID ? 'commander' : 'subordinate',
          commandTendency: agent.id === COMMANDER_ID
            ? 'dynamic command / fire-support handoff / maneuver / logistics planning'
            : 'maneuver / support / flank / assault / delegated resupply',
          ammoRounds: equipment.ammoRounds,
          ammoCapacity: equipment.ammoCapacity,
          burstsRemaining: Math.floor(equipment.ammoRounds / AMMO_PER_BURST),
          grenadeCapacity: equipment.grenadeCapacity,
          logisticsTask: ownAssignment?.task ?? 'none',
          resupplyTargetId: ownAssignment?.supplyId ?? null,
          resupplyTargetPosition: supply?.position ?? null,
        };
      }),
      supplies: this.supplies.map((supply) => ({
        id: supply.id,
        kind: supply.kind,
        position: supply.position,
        ammoRounds: supply.ammoRounds,
        grenades: supply.grenades,
        depleted: supply.ammoRounds <= 0 && supply.grenades <= 0,
      })),
      commanderId: COMMANDER_ID,
      command: {
        commanderId: COMMANDER_ID,
        order: this.commandOrder,
        activeResupplyAgentId: assignment?.agentId ?? null,
        activeResupplySupplyId: assignment?.supplyId ?? null,
        commanderStationarySeconds: Number(this.commanderStationarySeconds.toFixed(2)),
        supportHandoffCount: this.supportHandoffCount,
        lastSupportHandoffTick: this.lastSupportHandoffTick < 0 ? null : this.lastSupportHandoffTick,
      },
    };
  }

  /** Workbench/debug hook used by deterministic scenario tests and future equipment authoring UI. */
  setAgentEquipment(agentId: string, values: { readonly ammoRounds?: number; readonly grenades?: number }): boolean {
    const equipment = this.equipment.get(agentId);
    const member = this.unsafe().members.find((entry) => entry.id === agentId);
    if (equipment === undefined || member === undefined) return false;
    if (values.ammoRounds !== undefined) {
      equipment.ammoRounds = Math.max(0, Math.min(equipment.ammoCapacity, Math.round(values.ammoRounds)));
      if (equipment.ammoRounds > AMMO_PLAN) this.ammoPlanAnnounced.delete(agentId);
      if (equipment.ammoRounds >= AMMO_PER_BURST) this.dryFireLogged.delete(agentId);
    }
    if (values.grenades !== undefined) member.grenadeCount = Math.max(0, Math.min(equipment.grenadeCapacity, Math.round(values.grenades)));
    if (this.assignment?.agentId === agentId) this.assignment = null;
    return true;
  }

  private installV8Hooks(): void {
    const base = this.unsafe();
    const originalLog = base.log.bind(this);
    base.log = (category, actorId, actorLabel, event, summary, data): void => {
      if (category === 'agent') {
        const equipment = this.equipment.get(actorId);
        const assignment = this.assignment?.agentId === actorId ? this.assignment : null;
        if (equipment !== undefined) {
          originalLog(category, actorId, actorLabel, event, summary, {
            ...data,
            commandRank: actorId === COMMANDER_ID ? 'commander' : 'subordinate',
            ammoRounds: equipment.ammoRounds,
            burstsRemaining: Math.floor(equipment.ammoRounds / AMMO_PER_BURST),
            logisticsTask: assignment?.task ?? 'none',
            resupplyTargetId: assignment?.supplyId ?? null,
          });
          return;
        }
      }
      originalLog(category, actorId, actorLabel, event, summary, data);
    };

    const originalMovementTarget = base.movementTarget.bind(this);
    base.movementTarget = (member: UnsafeMember): GridPoint | null => {
      const assignment = this.assignment?.agentId === member.id ? this.assignment : null;
      if (assignment !== null) {
        const supply = this.supplies.find((entry) => entry.id === assignment.supplyId);
        if (supply !== undefined && (supply.ammoRounds > 0 || supply.grenades > 0)) return supply.position;
      }
      return originalMovementTarget(member);
    };

    const originalTryFire = base.tryFire.bind(this);
    base.tryFire = (member: UnsafeMember, target: GridPoint, reason: string): void => {
      if (this.assignment?.agentId === member.id) return;
      const equipment = this.equipment.get(member.id);
      if (equipment === undefined) return;
      if (equipment.ammoRounds < AMMO_PER_BURST) {
        if (!this.dryFireLogged.has(member.id)) {
          this.dryFireLogged.add(member.id);
          base.pushEvent(`T${base.logicalTick}: ${member.label} cannot fire; ammunition exhausted and logistics is now urgent.`);
          base.log('agent', member.id, member.label, 'fire', `${member.label} withheld fire: ammunition exhausted.`, {
            blocked: true,
            reason: 'out_of_ammo',
            task: member.task,
            tactic: base.tactic,
            ammoRounds: equipment.ammoRounds,
          });
        }
        return;
      }
      const before = member.firePulse;
      originalTryFire(member, target, reason);
      if (member.firePulse <= before) return;
      equipment.ammoRounds = Math.max(0, equipment.ammoRounds - AMMO_PER_BURST);
      this.dryFireLogged.delete(member.id);
      if (equipment.ammoRounds <= AMMO_PLAN && !this.ammoPlanAnnounced.has(member.id)) {
        this.ammoPlanAnnounced.add(member.id);
        const burstsRemaining = Math.floor(equipment.ammoRounds / AMMO_PER_BURST);
        base.pushEvent(`T${base.logicalTick}: ${member.label} reached logistics planning reserve (${burstsRemaining} bursts).`);
        base.log('squad', SQUAD_ID, SQUAD_LABEL, 'plan', `${member.label} entered proactive ammunition planning reserve.`, {
          agentId: member.id,
          ammoRounds: equipment.ammoRounds,
          burstsRemaining,
          threshold: AMMO_PLAN,
          commandRank: member.id === COMMANDER_ID ? 'commander' : 'subordinate',
        });
      }
    };

    const originalTryGrenade = base.tryGrenade.bind(this);
    base.tryGrenade = (member: UnsafeMember): boolean => {
      if (this.assignment?.agentId === member.id) return false;
      return originalTryGrenade(member);
    };

    // Do not force Alpha back into the suppressor slot. The commander is a
    // meta-level command identity; V7's proven role rotation remains intact.
    const originalApplyRoles = base.applyRoles.bind(this);
    base.applyRoles = (): void => {
      originalApplyRoles();
      this.updateCommandOrder();
    };

    const originalRefreshPlan = base.refreshTacticalPlan.bind(this);
    base.refreshTacticalPlan = (): void => {
      originalRefreshPlan();
      this.updateCommandOrder();
    };
  }

  private initializeEquipment(): void {
    const members = this.unsafe().members;
    this.equipment = new Map(members.map((member) => [member.id, {
      ammoRounds: DEFAULT_AMMO,
      ammoCapacity: AMMO_CAPACITY,
      grenadeCapacity: GRENADE_CAPACITY,
    }]));
  }

  private applyDefaultGrenades(): void {
    for (const member of this.unsafe().members) member.grenadeCount = DEFAULT_GRENADES;
  }

  private observeCommanderMovement(deltaSeconds: number): void {
    const commander = this.commanderMember();
    if (commander === undefined) return;
    if (this.commanderLastPosition === null || distance(this.commanderLastPosition, commander.position) > 0.12) {
      this.commanderLastPosition = { ...commander.position };
      this.commanderStationarySeconds = 0;
      return;
    }
    this.commanderStationarySeconds += Math.max(0, deltaSeconds);
  }

  private maintainFireSupportHealth(): void {
    const base = this.unsafe();
    if (base.alertState !== 'active' || base.suppressorId === null) return;
    const anchorId = base.suppressorId;
    const anchorEquipment = this.equipment.get(anchorId);
    if (anchorEquipment === undefined) return;

    if (anchorEquipment.ammoRounds < AMMO_PER_BURST) {
      this.handoffBaseOfFire(anchorId, 'current base-of-fire is out of ammunition', true);
      return;
    }

    if (anchorId !== COMMANDER_ID || this.assignment?.agentId === COMMANDER_ID) return;
    if (base.logicalTick - this.lastSupportHandoffTick < SUPPORT_HANDOFF_COOLDOWN_TICKS) return;
    const commander = this.commanderMember();
    if (commander === undefined) return;
    const anotherMemberHasVisual = base.members.some((member) => member.id !== COMMANDER_ID && member.targetVisible);
    const staleWithoutPicture = this.commanderStationarySeconds >= COMMANDER_STALE_NO_PICTURE_SECONDS
      && !commander.targetVisible
      && anotherMemberHasVisual;
    const staleDespitePicture = this.commanderStationarySeconds >= COMMANDER_STALE_HARD_SECONDS
      && anotherMemberHasVisual;
    const lowAmmoAnchor = anchorEquipment.ammoRounds <= AMMO_LOW;

    if (lowAmmoAnchor || staleWithoutPicture || staleDespitePicture) {
      const reason = lowAmmoAnchor
        ? `commander has only ${Math.floor(anchorEquipment.ammoRounds / AMMO_PER_BURST)} bursts remaining`
        : staleWithoutPicture
          ? 'commander has remained on a stale support position while another member owns visual contact'
          : 'commander support position has remained static too long during an active engagement';
      this.handoffBaseOfFire(COMMANDER_ID, reason, false);
    }
  }

  private handoffBaseOfFire(outgoingId: string, reason: string, urgent: boolean): boolean {
    const base = this.unsafe();
    if (base.alertState !== 'active' || base.suppressorId !== outgoingId) return false;
    if (!urgent && base.logicalTick - this.lastSupportHandoffTick < SUPPORT_HANDOFF_COOLDOWN_TICKS) return false;
    const replacement = this.selectAnchorReplacement(outgoingId);
    if (replacement === null) return false;

    if (base.moverId === replacement.id) base.moverId = outgoingId;
    else if (base.observerId === replacement.id) base.observerId = outgoingId;
    else return false;
    base.suppressorId = replacement.id;
    this.lastSupportHandoffTick = base.logicalTick;
    this.supportHandoffCount += 1;
    if (outgoingId === COMMANDER_ID) this.commanderStationarySeconds = 0;
    base.applyRoles();
    base.refreshTacticalPlan();
    const outgoing = base.members.find((member) => member.id === outgoingId);
    base.pushEvent(`T${base.logicalTick}: fire-support handoff ${outgoing?.label ?? outgoingId} → ${replacement.label}; ${reason}.`);
    base.log('squad', SQUAD_ID, SQUAD_LABEL, 'roles', 'Fire-support responsibility handed to a combat-ready member.', {
      from: outgoingId,
      to: replacement.id,
      reason,
      tactic: base.tactic,
      supportHandoffCount: this.supportHandoffCount,
    });
    return true;
  }

  private selectAnchorReplacement(outgoingId: string): UnsafeMember | null {
    const base = this.unsafe();
    const candidates = base.members
      .filter((member) => member.id !== outgoingId && this.assignment?.agentId !== member.id)
      .map((member) => ({
        member,
        ammo: this.equipment.get(member.id)?.ammoRounds ?? 0,
        score: (member.targetVisible ? 200 : 0)
          + (member.id === base.moverId ? 30 : 0)
          + (member.task === 'hold_cover' || member.task === 'crossfire' ? 15 : 0)
          + (this.equipment.get(member.id)?.ammoRounds ?? 0),
      }))
      .filter((entry) => entry.ammo >= MIN_ANCHOR_AMMO)
      .sort((left, right) => right.score - left.score || left.member.id.localeCompare(right.member.id, 'en'));
    return candidates[0]?.member ?? null;
  }

  private updateCommandOrder(): void {
    const base = this.unsafe();
    if (this.assignment !== null) {
      const assigned = base.members.find((member) => member.id === this.assignment!.agentId);
      this.commandOrder = `${assigned?.label ?? this.assignment.agentId} is detached for ${this.assignment.task}; remaining members preserve fire support and maneuver freedom.`;
      return;
    }
    if (base.alertState !== 'active') {
      this.commandOrder = 'Patrol as a compact element; restore equipment before contact when practical.';
      return;
    }
    if (base.tactic === 'bounding') this.commandOrder = 'Set the next bound from current contact; commander may suppress or move as roles rotate.';
    else if (base.tactic === 'flank') this.commandOrder = 'Fix the target and open a flank; command identity does not pin Alpha to the support position.';
    else if (base.tactic === 'crossfire') this.commandOrder = 'Build separated firing sectors; transfer the base-of-fire if its lane, ammunition or contact picture degrades.';
    else if (base.tactic === 'assault') this.commandOrder = 'Exploit the established geometry; commander may participate in the assault when that is the useful role.';
    else if (base.tactic === 'sweep') this.commandOrder = 'Search by lead / cover / overwatch handoffs; commander can occupy any of those responsibilities.';
    else this.commandOrder = 'Recover spacing, ammunition and useful firing geometry before the next maneuver.';
  }

  private planResupplyIfNeeded(): void {
    if (this.assignment !== null) return;
    const baseState = super.getState();
    const candidates = [...baseState.agents]
      .map((agent) => ({ agent, score: this.resupplyNeedScore(agent.id, agent.grenadeCount) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.agent.id.localeCompare(right.agent.id, 'en'));

    for (const { agent } of candidates) {
      if (!this.canDetachForResupply(agent.id, baseState)) continue;
      const task = this.resupplyTask(agent.id, agent.grenadeCount);
      const equipment = this.equipment.get(agent.id)!;
      const critical = equipment.ammoRounds <= AMMO_CRITICAL || agent.grenadeCount === 0;
      const supply = this.selectSupply(agent.position, task, baseState.squad.alertState === 'active', critical);
      if (supply === null) continue;

      this.assignment = { agentId: agent.id, supplyId: supply.id, task };
      if (baseState.squad.alertState === 'active' && baseState.squad.suppressorId === agent.id) {
        this.handoffBaseOfFire(agent.id, `${agent.label} is detaching for ${task}`, critical);
      }
      const base = this.unsafe();
      const action = agent.id === COMMANDER_ID
        ? `${agent.label} hands off immediate fire-support duties and moves to resupply`
        : `Commander orders ${agent.label} to resupply`;
      base.pushEvent(`T${baseState.logicalTick}: ${action} at ${supply.id}.`);
      base.log('squad', SQUAD_ID, SQUAD_LABEL, 'plan', `${action}.`, {
        agentId: agent.id,
        supplyId: supply.id,
        task,
        ammoRounds: equipment.ammoRounds,
        burstsRemaining: Math.floor(equipment.ammoRounds / AMMO_PER_BURST),
        critical,
      });
      this.updateCommandOrder();
      return;
    }
  }

  private canDetachForResupply(agentId: string, state: TacticalWizardSimulationStateV7): boolean {
    const equipment = this.equipment.get(agentId);
    if (equipment === undefined) return false;
    if (state.squad.alertState !== 'active') return true;
    const agent = state.agents.find((entry) => entry.id === agentId);
    if (agent === undefined) return false;
    const critical = equipment.ammoRounds <= AMMO_CRITICAL || agent.grenadeCount === 0;
    if (state.squad.tactic === 'assault' && !critical) return false;

    const combatReadyOthers = state.agents.filter((entry) => entry.id !== agentId && (this.equipment.get(entry.id)?.ammoRounds ?? 0) > AMMO_CRITICAL).length;
    if (combatReadyOthers < (critical ? 1 : 2)) return false;

    const ownsBaseOfFire = agent.id === state.squad.suppressorId;
    if (ownsBaseOfFire && this.selectAnchorReplacement(agent.id) === null) return false;

    // A healthy agent that currently owns direct visual should keep fighting.
    // Once it reaches the low reserve, however, a prepared support handoff is
    // more valuable than consuming the final bursts and becoming inert.
    if (agent.targetVisible && equipment.ammoRounds > AMMO_LOW && !critical) return false;
    return true;
  }

  private resupplyNeedScore(agentId: string, grenadeCount: number): number {
    const equipment = this.equipment.get(agentId);
    if (equipment === undefined) return 0;
    const ammoNeed = equipment.ammoRounds <= AMMO_PLAN ? (AMMO_PLAN - equipment.ammoRounds + 1) / AMMO_PLAN * 2.4 : 0;
    const grenadeNeed = grenadeCount <= GRENADE_LOW ? (GRENADE_LOW - grenadeCount + 1) * 0.85 : 0;
    if (ammoNeed === 0 && grenadeNeed === 0) return 0;
    const criticalBonus = equipment.ammoRounds <= AMMO_CRITICAL ? 2 : grenadeCount === 0 ? 0.8 : 0;
    const commanderUrgency = agentId === COMMANDER_ID && equipment.ammoRounds <= AMMO_LOW ? 0.35 : 0;
    return ammoNeed + grenadeNeed + criticalBonus + commanderUrgency;
  }

  private resupplyTask(agentId: string, grenadeCount: number): LogisticsTask {
    const equipment = this.equipment.get(agentId)!;
    const ammo = equipment.ammoRounds <= AMMO_PLAN;
    const grenades = grenadeCount <= GRENADE_LOW;
    if (ammo && grenades) return 'resupply_mixed';
    if (ammo) return 'resupply_ammo';
    return 'resupply_grenades';
  }

  private selectSupply(from: GridPoint, task: LogisticsTask, activeCombat: boolean, critical: boolean): MutableSupply | null {
    const eligible = this.supplies
      .filter((supply) => supplyHasNeed(supply, task))
      .map((supply) => ({ supply, path: findPath(tacticalWizardNavigationGrid, navCell(from), supply.position) }))
      .filter((entry) => entry.path.length > 0 && (!activeCombat || critical || entry.path.length <= ACTIVE_RESUPPLY_MAX_PATH))
      .sort((left, right) => left.path.length - right.path.length || left.supply.id.localeCompare(right.supply.id, 'en'));
    return eligible[0]?.supply ?? null;
  }

  private resolveResupplyArrival(): void {
    const assignment = this.assignment;
    if (assignment === null) return;
    const base = this.unsafe();
    const member = base.members.find((entry) => entry.id === assignment.agentId);
    const supply = this.supplies.find((entry) => entry.id === assignment.supplyId);
    if (member === undefined || supply === undefined) {
      this.assignment = null;
      return;
    }
    if (distance(member.position, supply.position) > SUPPLY_PICKUP_RADIUS) return;

    const equipment = this.equipment.get(member.id)!;
    const ammoWanted = Math.max(0, equipment.ammoCapacity - equipment.ammoRounds);
    const ammoTaken = Math.min(ammoWanted, supply.ammoRounds);
    equipment.ammoRounds += ammoTaken;
    supply.ammoRounds -= ammoTaken;

    const grenadeWanted = Math.max(0, equipment.grenadeCapacity - member.grenadeCount);
    const grenadesTaken = Math.min(grenadeWanted, supply.grenades);
    member.grenadeCount += grenadesTaken;
    supply.grenades -= grenadesTaken;

    if (equipment.ammoRounds > AMMO_PLAN) this.ammoPlanAnnounced.delete(member.id);
    if (equipment.ammoRounds >= AMMO_PER_BURST) this.dryFireLogged.delete(member.id);
    base.pushEvent(`T${base.logicalTick}: ${member.label} resupplied +${ammoTaken} ammo / +${grenadesTaken} grenades from ${supply.id}.`);
    base.log('squad', SQUAD_ID, SQUAD_LABEL, 'plan', `${member.label} completed field resupply and returns to the active tactical plan.`, {
      agentId: member.id,
      supplyId: supply.id,
      ammoTaken,
      grenadesTaken,
      ammoRounds: equipment.ammoRounds,
      burstsRemaining: Math.floor(equipment.ammoRounds / AMMO_PER_BURST),
    });
    this.assignment = null;
    this.updateCommandOrder();
  }

  private validateAssignment(): void {
    if (this.assignment === null) return;
    const supply = this.supplies.find((entry) => entry.id === this.assignment!.supplyId);
    if (supply === undefined || !supplyHasNeed(supply, this.assignment.task)) this.assignment = null;
  }

  private commanderMember(): UnsafeMember | undefined {
    return this.unsafe().members.find((member) => member.id === COMMANDER_ID);
  }

  private unsafe(): UnsafeV7 {
    return this as unknown as UnsafeV7;
  }
}

function supplyHasNeed(supply: MutableSupply, task: LogisticsTask): boolean {
  if (task === 'resupply_ammo') return supply.ammoRounds > 0;
  if (task === 'resupply_grenades') return supply.grenades > 0;
  if (task === 'resupply_mixed') return supply.ammoRounds > 0 || supply.grenades > 0;
  return false;
}

function createSupplyCaches(seed: number): MutableSupply[] {
  const occupied = new Set(tacticalWizardTestMap.blocked.map((cell) => gridKey(cell)));
  const forbidden: GridPoint[] = [tacticalWizardTestMap.playerStart, ...tacticalWizardTestMap.patrolPoints.slice(0, 5), { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 4, y: 2 }];
  const candidates: Array<{ point: GridPoint; score: number }> = [];
  for (let y = 1; y < tacticalWizardTestMap.height - 1; y += 1) {
    for (let x = 1; x < tacticalWizardTestMap.width - 1; x += 1) {
      const point = { x, y };
      if (occupied.has(gridKey(point)) || !isWalkable(tacticalWizardNavigationGrid, point)) continue;
      if (forbidden.some((entry) => distance(entry, point) < 4.5)) continue;
      candidates.push({ point, score: seededUnit(`supply:${x}:${y}`, seed) });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.point.y - right.point.y || left.point.x - right.point.x);
  const selected: GridPoint[] = [];
  for (const candidate of candidates) {
    if (selected.some((point) => distance(point, candidate.point) < 7)) continue;
    selected.push(candidate.point);
    if (selected.length >= SUPPLY_COUNT) break;
  }
  return selected.map((position, index) => {
    const kind: SupplyCacheKind = index % 4 === 2 ? 'grenade' : index % 3 === 1 ? 'mixed' : 'ammo';
    return {
      id: `SUP-${String(index + 1).padStart(2, '0')}`,
      kind,
      position,
      ammoRounds: kind === 'grenade' ? 0 : kind === 'mixed' ? 60 : 90,
      grenades: kind === 'ammo' ? 0 : kind === 'mixed' ? 2 : 4,
    };
  });
}

function seededUnit(id: string, seed: number): number {
  let hash = 2166136261;
  const source = `${id}:${seed}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function navCell(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))),
  };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
