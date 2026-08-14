import type { GridPoint } from './navigation';

export type LogisticsTask = 'none' | 'resupply_ammo' | 'resupply_grenades' | 'resupply_mixed';
export type ReactionState = 'none' | 'grenade_suppress' | 'flash_push' | 'smoke_reposition' | 'dodge' | 'smoke_retreat' | 'stunned' | 'downed';
export type RecoveryRole = 'none' | 'rescuer' | 'security';
export type PlanOwner = 'tactical' | 'logistics' | 'recovery' | 'patrol';
export type MovementOwner = 'tactical' | 'logistics' | 'reaction' | 'recovery_rescue' | 'recovery_security' | 'patrol';
export type WeaponOwner = 'tactical' | 'recovery_security' | 'none';

export interface CapabilitySnapshot {
  readonly alive: boolean;
  readonly ammoRounds: number;
  readonly grenadeCount: number;
  readonly canMove: boolean;
  readonly canFire: boolean;
  readonly canSuppress: boolean;
  readonly canThrow: boolean;
  readonly criticalAmmo: boolean;
}

export interface LogisticsCommitment {
  readonly agentId: string;
  readonly supplyId: string;
  readonly task: Exclude<LogisticsTask, 'none'>;
  readonly target: GridPoint;
  readonly startedTick: number;
  readonly reason: string;
}

export interface ReactionCommitment {
  readonly kind: ReactionState;
  readonly target: GridPoint | null;
  readonly untilTick: number;
}

export interface RecoveryCommitment {
  readonly role: RecoveryRole;
  readonly target: GridPoint | null;
  readonly patientId: string | null;
}

export interface ExecutionHierarchyInput {
  readonly agentId: string;
  readonly logicalTick: number;
  readonly position: GridPoint;
  readonly alertState: string;
  readonly tactic: string;
  readonly tacticalTask: string;
  readonly tacticalTarget: GridPoint | null;
  readonly tacticalProposal: GridPoint | null;
  readonly capability: CapabilitySnapshot;
  readonly logistics: LogisticsCommitment | null;
  readonly reaction: ReactionCommitment | null;
  readonly recovery: RecoveryCommitment;
}

export interface ExecutionContract {
  readonly agentId: string;
  readonly logicalTick: number;
  readonly planOwner: PlanOwner;
  readonly movementOwner: MovementOwner;
  readonly weaponOwner: WeaponOwner;
  readonly movementTarget: GridPoint | null;
  readonly weaponAuthorized: boolean;
  readonly throwableAuthorized: boolean;
  readonly tacticalLeaseActive: boolean;
  readonly reason: string;
}

export const AMMO_PER_BURST = 3;
export const AMMO_LOW = 30;
export const AMMO_CRITICAL = 12;

export const REACTION_PRIORITY: Readonly<Record<ReactionState, number>> = {
  none: 0,
  grenade_suppress: 20,
  flash_push: 30,
  smoke_reposition: 40,
  dodge: 50,
  smoke_retreat: 60,
  stunned: 80,
  downed: 100,
};

const SEARCH_TASKS = new Set(['search_sector', 'overwatch']);
const FIRE_SUPPORT_TASKS = new Set(['suppress', 'hold_cover', 'crossfire', 'overwatch']);

export function capabilitySnapshot(alive: boolean, ammoRounds: number, grenadeCount: number): CapabilitySnapshot {
  const canFire = alive && ammoRounds >= AMMO_PER_BURST;
  return {
    alive,
    ammoRounds,
    grenadeCount,
    canMove: alive,
    canFire,
    canSuppress: canFire,
    canThrow: alive && grenadeCount > 0,
    criticalAmmo: ammoRounds <= AMMO_CRITICAL,
  };
}

/**
 * Fixed production hierarchy.
 *
 * Tactical planning owns Role / Task / TacticalTarget. Logistics and recovery
 * may acquire a committed plan lease, while reactions are only temporary motion
 * constraints. A reaction never deletes another domain's commitment.
 */
export function resolveExecutionContract(input: ExecutionHierarchyInput): ExecutionContract {
  if (!input.capability.alive || input.reaction?.kind === 'downed') {
    return contract(input, 'recovery', 'reaction', 'none', input.position, false, false, false, 'downed agent is outside tactical execution');
  }

  if (input.recovery.role === 'rescuer') {
    const hardReaction = activeReaction(input);
    if (hardReaction !== null && reactionPriority(hardReaction.kind) >= 80) {
      return contract(input, 'recovery', 'reaction', 'none', hardReaction.target ?? input.position, false, false, false, `hard reaction ${hardReaction.kind} temporarily constrains rescue movement`);
    }
    return contract(input, 'recovery', 'recovery_rescue', 'none', input.recovery.target ?? input.position, false, false, false, 'committed casualty rescue owns movement');
  }

  if (input.recovery.role === 'security') {
    const hardReaction = activeReaction(input);
    if (hardReaction !== null && reactionPriority(hardReaction.kind) >= 80) {
      return contract(input, 'recovery', 'reaction', 'none', hardReaction.target ?? input.position, false, false, false, `hard reaction ${hardReaction.kind} temporarily constrains recovery security`);
    }
    return contract(input, 'recovery', 'recovery_security', input.capability.canFire ? 'recovery_security' : 'none', input.recovery.target ?? input.tacticalProposal ?? input.position, input.capability.canFire, input.capability.canThrow, false, 'recovery security owns the covering position');
  }

  if (input.logistics !== null) {
    const reaction = activeReaction(input);
    if (reaction !== null && reactionPriority(reaction.kind) >= 50) {
      return contract(input, 'logistics', 'reaction', 'none', reaction.target ?? input.position, false, false, false, `reaction ${reaction.kind} temporarily constrains committed logistics; assignment is retained`);
    }
    return contract(input, 'logistics', 'logistics', 'none', input.logistics.target, false, false, false, `committed ${input.logistics.task} owns movement until ${input.logistics.supplyId}`);
  }

  const reaction = activeReaction(input);
  if (reaction !== null && reactionPriority(reaction.kind) >= 80) {
    return contract(input, 'tactical', 'reaction', 'none', reaction.target ?? input.position, false, false, true, `hard reaction ${reaction.kind} temporarily constrains tactical movement`);
  }

  const tacticalActive = input.alertState === 'active';
  const planOwner: PlanOwner = tacticalActive ? 'tactical' : 'patrol';
  const movementOwner: MovementOwner = tacticalActive ? 'tactical' : 'patrol';
  const weaponOwner: WeaponOwner = tacticalActive && input.capability.canFire ? 'tactical' : 'none';
  const motionReaction = reaction !== null && reactionPriority(reaction.kind) >= 40 ? reaction : null;
  const target = motionReaction?.target ?? input.tacticalProposal ?? input.tacticalTarget ?? input.position;
  return contract(
    input,
    planOwner,
    motionReaction === null ? movementOwner : 'reaction',
    weaponOwner,
    target,
    tacticalActive && input.capability.canFire,
    tacticalActive && input.capability.canThrow,
    tacticalActive,
    motionReaction === null ? `${SEARCH_TASKS.has(input.tacticalTask) ? 'search' : 'tactical'} plan owns execution` : `reaction ${motionReaction.kind} constrains movement without replacing the tactical plan`,
  );
}

export function reactionPriority(kind: ReactionState): number {
  return REACTION_PRIORITY[kind] ?? 0;
}

export function roleNeedsFireCapability(task: string): boolean {
  return FIRE_SUPPORT_TASKS.has(task);
}

export function isAllDry(agents: readonly { readonly alive: boolean; readonly ammoRounds: number }[]): boolean {
  const living = agents.filter((agent) => agent.alive);
  return living.length > 0 && living.every((agent) => agent.ammoRounds < AMMO_PER_BURST);
}

export function emergencyResupplyOwner(agents: readonly { readonly id: string; readonly alive: boolean; readonly ammoRounds: number }[]): string | null {
  if (!isAllDry(agents)) return null;
  return [...agents].filter((agent) => agent.alive).sort((left, right) => left.id.localeCompare(right.id, 'en'))[0]?.id ?? null;
}

export function logisticsMayCommit(input: {
  readonly agentId: string;
  readonly alertState: string;
  readonly targetVisible: boolean;
  readonly isSuppressor: boolean;
  readonly ammoRounds: number;
  readonly grenadeCount: number;
  readonly livingAgents: readonly { readonly id: string; readonly alive: boolean; readonly ammoRounds: number }[];
}): boolean {
  const needsAmmo = input.ammoRounds <= AMMO_LOW;
  const needsGrenades = input.grenadeCount <= 1;
  if (!needsAmmo && !needsGrenades) return false;
  if (input.alertState !== 'active') return true;

  const emergency = emergencyResupplyOwner(input.livingAgents);
  if (emergency !== null) return emergency === input.agentId;

  const armedOthers = input.livingAgents.filter((agent) => agent.id !== input.agentId && agent.alive && agent.ammoRounds >= AMMO_PER_BURST);
  const critical = input.ammoRounds <= AMMO_CRITICAL;
  if (critical) return armedOthers.length >= 1;
  if (input.targetVisible) return false;
  if (input.isSuppressor && armedOthers.length < 1) return false;
  return armedOthers.length >= 2;
}

function activeReaction(input: ExecutionHierarchyInput): ReactionCommitment | null {
  const reaction = input.reaction;
  if (reaction === null || reaction.kind === 'none' || reaction.untilTick <= input.logicalTick) return null;
  return reaction;
}

function contract(
  input: ExecutionHierarchyInput,
  planOwner: PlanOwner,
  movementOwner: MovementOwner,
  weaponOwner: WeaponOwner,
  movementTarget: GridPoint | null,
  weaponAuthorized: boolean,
  throwableAuthorized: boolean,
  tacticalLeaseActive: boolean,
  reason: string,
): ExecutionContract {
  return {
    agentId: input.agentId,
    logicalTick: input.logicalTick,
    planOwner,
    movementOwner,
    weaponOwner,
    movementTarget: clonePoint(movementTarget),
    weaponAuthorized,
    throwableAuthorized,
    tacticalLeaseActive,
    reason,
  };
}

function clonePoint(point: GridPoint | null): GridPoint | null {
  return point === null ? null : { ...point };
}
