import type { GridPoint } from './navigation';
import {
  TacticalWizardSimulation as LegacySimulationHost,
  type TacticalWizardSimulationState as LegacySimulationState,
} from './tacticalWizardSimulationCurrent';
import {
  isLegacyMovementProposalRequired,
  resolveExecutionOwnership,
  resolveExecutionTarget,
  type ExecutionOwner,
  type ExecutionOwnershipInput,
  type RecoveryExecutionRole,
} from './tacticalWizardExecutionOwnership';

export interface ExecutionContractView {
  readonly agentId: string;
  readonly logicalTick: number;
  readonly owner: ExecutionOwner;
  readonly priority: number;
  readonly reason: string;
  readonly plannedTask: string;
  readonly plannedRole: string;
  readonly plannedTarget: GridPoint | null;
  readonly executionTarget: GridPoint | null;
  readonly logisticsTask: string;
  readonly reactionState: string;
}

export interface ExecutionAuthorityView {
  readonly runtimeVersion: 'current';
  readonly architecture: 'composed_domains';
  readonly finalMovementAuthority: 'execution_resolver';
  readonly legacyHostPolicy: 'compatibility_substrate';
  readonly contracts: readonly ExecutionContractView[];
}

export interface TacticalWizardRuntimeState extends LegacySimulationState {
  readonly executionAuthority: ExecutionAuthorityView;
}

interface RuntimeMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  task: string;
  role: string;
  tacticalTarget: GridPoint | null;
}

interface LegacyHostAccess {
  members: RuntimeMember[];
  logicalTick: number;
  movementTarget: (member: RuntimeMember) => GridPoint | null;
  log: (...args: any[]) => void;
}

/**
 * Production Tactical Wizard runtime.
 *
 * The historical Current/Vxx inheritance stack is deliberately contained as a
 * compatibility Host while proven mechanics are migrated. Workbench itself no
 * longer inherits that stack. Domain modules own production decisions, and the
 * Execution Resolver below is the only final writer of member movement targets.
 */
export class TacticalWizardRuntime {
  private readonly legacyHost: LegacySimulationHost;
  private readonly resolvedContracts = new Map<string, ExecutionContractView>();

  constructor() {
    this.legacyHost = new LegacySimulationHost();
    this.installExecutionResolver();
    this.hostAccess().log('system', 'simulation', 'Volition Simulation', 'session', 'Current production runtime composition boundary enabled.', {
      runtimeVersion: 'current',
      architecture: 'composed_domains',
      finalMovementAuthority: 'execution_resolver',
      legacyHostPolicy: 'compatibility_substrate',
      versionInheritanceAllowedInProduction: false,
    });
  }

  get stepSeconds(): number {
    return (this.legacyHost as unknown as { readonly stepSeconds: number }).stepSeconds;
  }

  getState(): TacticalWizardRuntimeState {
    const base = this.legacyHost.getState();
    return {
      ...base,
      executionAuthority: {
        runtimeVersion: 'current',
        architecture: 'composed_domains',
        finalMovementAuthority: 'execution_resolver',
        legacyHostPolicy: 'compatibility_substrate',
        contracts: base.agents.map((agent) => this.contractViewForState(agent.id, base)),
      },
    };
  }

  reset(): TacticalWizardRuntimeState {
    this.resolvedContracts.clear();
    this.legacyHost.reset();
    return this.getState();
  }

  step(): TacticalWizardRuntimeState {
    this.legacyHost.step();
    return this.getState();
  }

  advance(deltaSeconds: number): TacticalWizardRuntimeState {
    this.legacyHost.advance(deltaSeconds);
    return this.getState();
  }

  emitNoise(): void {
    this.legacyHost.emitNoise();
  }

  setPlayerPosition(point: GridPoint): boolean {
    return this.legacyHost.setPlayerPosition(point);
  }

  nudgePlayer(dx: number, dy: number): boolean {
    return this.legacyHost.nudgePlayer(dx, dy);
  }

  setPlayerAimTarget(point: GridPoint): boolean {
    return this.legacyHost.setPlayerAimTarget(point);
  }

  playerFireAt(point: GridPoint): boolean {
    return this.legacyHost.playerFireAt(point);
  }

  playerThrowGrenadeAt(point: GridPoint): boolean {
    return this.legacyHost.playerThrowGrenadeAt(point);
  }

  cyclePlayerGrenade(delta: number) {
    return this.legacyHost.cyclePlayerGrenade(delta);
  }

  setAgentEquipment(agentId: string, values: { readonly ammoRounds?: number; readonly grenades?: number }): boolean {
    return this.legacyHost.setAgentEquipment(agentId, values);
  }

  setAgentVitals(agentId: string, values: { readonly health?: number }): boolean {
    return this.legacyHost.setAgentVitals(agentId, values);
  }

  applyGrenadeDoctrineForTest(kind: Parameters<LegacySimulationHost['applyGrenadeDoctrineForTest']>[0], center: GridPoint, ownerId?: string): void {
    this.legacyHost.applyGrenadeDoctrineForTest(kind, center, ownerId);
  }

  injectIncomingFireForTest(agentId: string, from: GridPoint): boolean {
    return this.legacyHost.injectIncomingFireForTest(agentId, from);
  }

  private installExecutionResolver(): void {
    const host = this.hostAccess();
    const legacyMovementTarget = host.movementTarget.bind(this.legacyHost);

    host.movementTarget = (member: RuntimeMember): GridPoint | null => {
      const state = this.legacyHost.getState();
      const input = this.executionInput(member, state);
      const decision = resolveExecutionOwnership(input);
      const legacyTarget = isLegacyMovementProposalRequired(decision.owner)
        ? legacyMovementTarget(member)
        : null;
      const executionTarget = resolveExecutionTarget({ ...input, position: member.position, legacyTarget }, decision);
      this.resolvedContracts.set(member.id, {
        agentId: member.id,
        logicalTick: state.logicalTick,
        owner: decision.owner,
        priority: decision.priority,
        reason: decision.reason,
        plannedTask: member.task,
        plannedRole: member.role,
        plannedTarget: clonePoint(member.tacticalTarget),
        executionTarget: clonePoint(executionTarget),
        logisticsTask: input.logisticsTask,
        reactionState: input.reactionState,
      });
      return executionTarget;
    };
  }

  private executionInput(member: RuntimeMember, state: LegacySimulationState): ExecutionOwnershipInput {
    const agent = state.agents.find((entry) => entry.id === member.id);
    const recoveryRole = recoveryRoleFor(member.id, state);
    const counterfire = (state as unknown as {
      readonly counterfire?: { readonly active: boolean; readonly agentId: string | null };
    }).counterfire;

    return {
      agentId: member.id,
      alive: agent?.alive ?? true,
      task: member.task,
      tactic: state.squad.tactic,
      alertState: state.squad.alertState,
      tacticalTarget: clonePoint(member.tacticalTarget),
      reactionState: agent?.reactionState ?? 'none',
      reactionTarget: clonePoint(agent?.reactionTarget ?? null),
      logisticsTask: agent?.logisticsTask ?? 'none',
      resupplyTarget: clonePoint(agent?.resupplyTargetPosition ?? null),
      recoveryRole,
      counterfireActive: counterfire?.active === true && counterfire.agentId === member.id,
    };
  }

  private contractViewForState(agentId: string, state: LegacySimulationState): ExecutionContractView {
    const cached = this.resolvedContracts.get(agentId);
    if (cached !== undefined && cached.logicalTick === state.logicalTick) return cached;

    const member = this.hostAccess().members.find((entry) => entry.id === agentId);
    if (member === undefined) {
      return {
        agentId,
        logicalTick: state.logicalTick,
        owner: 'patrol',
        priority: 10,
        reason: 'member is not present in the Host execution set',
        plannedTask: 'patrol',
        plannedRole: 'none',
        plannedTarget: null,
        executionTarget: null,
        logisticsTask: 'none',
        reactionState: 'none',
      };
    }

    const input = this.executionInput(member, state);
    const decision = resolveExecutionOwnership(input);
    const executionTarget = resolveExecutionTarget({ ...input, position: member.position, legacyTarget: null }, decision);
    return {
      agentId,
      logicalTick: state.logicalTick,
      owner: decision.owner,
      priority: decision.priority,
      reason: decision.reason,
      plannedTask: member.task,
      plannedRole: member.role,
      plannedTarget: clonePoint(member.tacticalTarget),
      executionTarget,
      logisticsTask: input.logisticsTask,
      reactionState: input.reactionState,
    };
  }

  private hostAccess(): LegacyHostAccess {
    return this.legacyHost as unknown as LegacyHostAccess;
  }
}

function recoveryRoleFor(agentId: string, state: LegacySimulationState): RecoveryExecutionRole {
  if (state.recovery.phase === 'none') return null;
  if (state.recovery.rescuerId === agentId) return 'rescuer';
  if (state.recovery.covererId === agentId) return 'security';
  return null;
}

function clonePoint(point: GridPoint | null): GridPoint | null {
  return point === null ? null : { ...point };
}
