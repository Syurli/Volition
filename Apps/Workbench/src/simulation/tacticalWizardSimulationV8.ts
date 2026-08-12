import { findPath, gridKey, isWalkable, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid } from './tacticalWizardTestMapV7';
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
};

const COMMANDER_ID = 'twr:rifle-squad:alpha';
const DEFAULT_AMMO = 96;
const AMMO_CAPACITY = 120;
const AMMO_PER_BURST = 3;
const AMMO_LOW = 30;
const AMMO_CRITICAL = 12;
const DEFAULT_GRENADES = 3;
const GRENADE_CAPACITY = 5;
const GRENADE_LOW = 1;
const SUPPLY_COUNT = 8;
const SUPPLY_PICKUP_RADIUS = 0.72;
const ACTIVE_RESUPPLY_MAX_PATH = 18;

/**
 * V8 deliberately layers command identity and logistics on top of the proven V7
 * combat simulation. V7 remains the regression baseline for fire-lane safety,
 * cover selection, search and grenade execution; V8 adds a host-side equipment
 * contract and a tactical detachment rule for resupply.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationV7 {
  private equipment = new Map<string, EquipmentState>();
  private supplies: MutableSupply[] = [];
  private assignment: ResupplyAssignment | null = null;
  private supplySeed = 8;
  private commandOrder = 'Commander holds the tactical picture while subordinates maneuver.';

  constructor() {
    super();
    this.initializeEquipment();
    this.supplies = createSupplyCaches(this.supplySeed);
    this.installV8Hooks();
    this.applyDefaultGrenades();
    this.unsafe().pushEvent('V8: Alpha designated commander; equipment logistics and field resupply enabled.');
  }

  override reset(): TacticalWizardSimulationState {
    this.assignment = null;
    this.supplySeed += 1;
    super.reset();
    this.initializeEquipment();
    this.supplies = createSupplyCaches(this.supplySeed);
    this.applyDefaultGrenades();
    this.commandOrder = 'Commander holds the tactical picture while subordinates maneuver.';
    this.unsafe().pushEvent(`V8: logistics reset; ${this.supplies.length} deterministic-random supply caches deployed.`);
    return this.getState();
  }

  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    this.validateAssignment();
    this.planResupplyIfNeeded();
    super.advance(deltaSeconds);
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
            ? 'command / overwatch / support / controlled grenade use'
            : 'maneuver / flank / assault / delegated resupply',
          ammoRounds: equipment.ammoRounds,
          ammoCapacity: equipment.ammoCapacity,
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
      },
    };
  }

  /** Workbench/debug hook used by deterministic scenario tests and future equipment authoring UI. */
  setAgentEquipment(agentId: string, values: { readonly ammoRounds?: number; readonly grenades?: number }): boolean {
    const equipment = this.equipment.get(agentId);
    const member = this.unsafe().members.find((entry) => entry.id === agentId);
    if (equipment === undefined || member === undefined) return false;
    if (values.ammoRounds !== undefined) equipment.ammoRounds = Math.max(0, Math.min(equipment.ammoCapacity, Math.round(values.ammoRounds)));
    if (values.grenades !== undefined) member.grenadeCount = Math.max(0, Math.min(equipment.grenadeCapacity, Math.round(values.grenades)));
    if (this.assignment?.agentId === agentId) this.assignment = null;
    return true;
  }

  private installV8Hooks(): void {
    const base = this.unsafe();
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
      if (equipment === undefined || equipment.ammoRounds < AMMO_PER_BURST) return;
      const before = member.firePulse;
      originalTryFire(member, target, reason);
      if (member.firePulse > before) equipment.ammoRounds = Math.max(0, equipment.ammoRounds - AMMO_PER_BURST);
    };

    const originalTryGrenade = base.tryGrenade.bind(this);
    base.tryGrenade = (member: UnsafeMember): boolean => {
      if (this.assignment?.agentId === member.id) return false;
      return originalTryGrenade(member);
    };

    const originalApplyRoles = base.applyRoles.bind(this);
    base.applyRoles = (): void => {
      this.enforceCommandBias();
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

  private enforceCommandBias(): void {
    const base = this.unsafe();
    const commander = COMMANDER_ID;
    const subordinateIds = base.members.filter((member) => member.id !== commander).map((member) => member.id);
    const firstSub = subordinateIds[0] ?? null;
    const secondSub = subordinateIds[1] ?? null;

    if (base.tactic === 'crossfire' || base.tactic === 'assault' || base.tactic === 'sweep') {
      if (base.suppressorId !== commander) {
        const oldSuppressor = base.suppressorId;
        if (base.moverId === commander) base.moverId = oldSuppressor ?? firstSub;
        else if (base.observerId === commander) base.observerId = oldSuppressor ?? secondSub;
        base.suppressorId = commander;
      }
      if (base.moverId === commander) base.moverId = firstSub;
      if (base.observerId === commander) base.observerId = secondSub;
      return;
    }

    if (base.tactic === 'bounding' || base.tactic === 'flank') {
      if (base.moverId === commander) {
        if (base.observerId !== null && base.observerId !== commander) {
          const oldObserver = base.observerId;
          base.observerId = commander;
          base.moverId = oldObserver;
        } else if (base.suppressorId !== null && base.suppressorId !== commander) {
          const oldSuppressor = base.suppressorId;
          base.suppressorId = commander;
          base.moverId = oldSuppressor;
        }
      }
    }
  }

  private updateCommandOrder(): void {
    const base = this.unsafe();
    if (base.alertState !== 'active') {
      this.commandOrder = 'Patrol as a compact element; use nearby caches to restore equipment before contact.';
      return;
    }
    if (base.tactic === 'bounding') this.commandOrder = 'Commander maintains the picture; subordinates alternate suppress-and-move bounds.';
    else if (base.tactic === 'flank') this.commandOrder = 'Commander anchors support; one subordinate fixes while the other opens the flank.';
    else if (base.tactic === 'crossfire') this.commandOrder = 'Commander stays on support/coordination; both subordinates establish separated crossfire sectors.';
    else if (base.tactic === 'assault') this.commandOrder = 'Commander remains the support base; both subordinates exploit the established firing geometry.';
    else if (base.tactic === 'sweep') this.commandOrder = 'Commander holds overwatch/blocking responsibility while subordinates clear search sectors as buddies.';
    else this.commandOrder = 'Commander prioritizes cohesion, spacing and equipment recovery before the next maneuver cycle.';
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
      const supply = this.selectSupply(agent.position, task, baseState.squad.alertState === 'active');
      if (supply === null) continue;
      this.assignment = { agentId: agent.id, supplyId: supply.id, task };
      const label = agent.label;
      const commanderPrefix = agent.id === COMMANDER_ID ? 'Commander' : 'Commander orders';
      this.unsafe().pushEvent(`T${baseState.logicalTick}: ${commanderPrefix} ${label} to resupply at ${supply.id}.`);
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
    if (agent.targetVisible && equipment.ammoRounds > AMMO_CRITICAL) return false;
    const combatReadyOthers = state.agents.filter((entry) => entry.id !== agentId && (this.equipment.get(entry.id)?.ammoRounds ?? 0) > AMMO_CRITICAL).length;
    if (combatReadyOthers < 2) return false;
    if (agentId === COMMANDER_ID) {
      const subordinateNeeds = state.agents.some((entry) => entry.id !== COMMANDER_ID && this.resupplyNeedScore(entry.id, entry.grenadeCount) > 0);
      if (subordinateNeeds || !critical) return false;
    }
    if (agent.id === state.squad.suppressorId && state.safeFireLanes < 2 && !critical) return false;
    return true;
  }

  private resupplyNeedScore(agentId: string, grenadeCount: number): number {
    const equipment = this.equipment.get(agentId);
    if (equipment === undefined) return 0;
    const ammoNeed = equipment.ammoRounds <= AMMO_LOW ? (AMMO_LOW - equipment.ammoRounds + 1) / AMMO_LOW * 2 : 0;
    const grenadeNeed = grenadeCount <= GRENADE_LOW ? (GRENADE_LOW - grenadeCount + 1) * 0.85 : 0;
    if (ammoNeed === 0 && grenadeNeed === 0) return 0;
    const subordinateBias = agentId === COMMANDER_ID ? -0.2 : 0.25;
    const criticalBonus = equipment.ammoRounds <= AMMO_CRITICAL ? 1.5 : grenadeCount === 0 ? 0.8 : 0;
    return ammoNeed + grenadeNeed + subordinateBias + criticalBonus;
  }

  private resupplyTask(agentId: string, grenadeCount: number): LogisticsTask {
    const equipment = this.equipment.get(agentId)!;
    const ammo = equipment.ammoRounds <= AMMO_LOW;
    const grenades = grenadeCount <= GRENADE_LOW;
    if (ammo && grenades) return 'resupply_mixed';
    if (ammo) return 'resupply_ammo';
    return 'resupply_grenades';
  }

  private selectSupply(from: GridPoint, task: LogisticsTask, activeCombat: boolean): MutableSupply | null {
    const eligible = this.supplies
      .filter((supply) => supplyHasNeed(supply, task))
      .map((supply) => ({ supply, path: findPath(tacticalWizardNavigationGrid, navCell(from), supply.position) }))
      .filter((entry) => entry.path.length > 0 && (!activeCombat || entry.path.length <= ACTIVE_RESUPPLY_MAX_PATH))
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

    base.pushEvent(`T${base.logicalTick}: ${member.label} resupplied +${ammoTaken} ammo / +${grenadesTaken} grenades from ${supply.id}.`);
    this.assignment = null;
  }

  private validateAssignment(): void {
    if (this.assignment === null) return;
    const supply = this.supplies.find((entry) => entry.id === this.assignment!.supplyId);
    if (supply === undefined || !supplyHasNeed(supply, this.assignment.task)) this.assignment = null;
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
