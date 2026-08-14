import type { GridPoint } from './navigation';

export type ExecutionOwner =
  | 'recovery_rescue'
  | 'recovery_security'
  | 'counterfire'
  | 'reaction'
  | 'direct_combat'
  | 'search'
  | 'logistics'
  | 'patrol';

export type RecoveryExecutionRole = 'rescuer' | 'security' | null;

export interface ExecutionOwnershipInput {
  readonly agentId: string;
  readonly alive: boolean;
  readonly task: string;
  readonly tactic: string;
  readonly alertState: string;
  readonly tacticalTarget: GridPoint | null;
  readonly reactionState: string;
  readonly reactionTarget: GridPoint | null;
  readonly logisticsTask: string;
  readonly resupplyTarget: GridPoint | null;
  readonly recoveryRole: RecoveryExecutionRole;
  readonly counterfireActive: boolean;
}

export interface ExecutionOwnershipDecision {
  readonly owner: ExecutionOwner;
  readonly priority: number;
  readonly reason: string;
}

export interface ExecutionTargetInput extends ExecutionOwnershipInput {
  readonly position: GridPoint;
  readonly legacyTarget: GridPoint | null;
}

export const EXECUTION_PRIORITY = {
  patrol: 10,
  logistics: 30,
  search: 60,
  direct_combat: 70,
  counterfire: 85,
  recovery_security: 90,
  recovery_rescue: 95,
} as const;

export const REACTION_EXECUTION_PRIORITY: Readonly<Record<string, number>> = {
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
const DIRECT_COMBAT_TASKS = new Set([
  'suppress',
  'bound_to_cover',
  'hold_cover',
  'flank_to_cover',
  'crossfire',
  'assault',
  'regroup',
]);

/**
 * Canonical operational arbitration for the production Tactical Wizard runtime.
 *
 * Historical layers may still calculate proposals while they are being migrated,
 * but this function is the only production decision about which domain owns a
 * member's movement target. Version numbers never participate in arbitration.
 */
export function resolveExecutionOwnership(input: ExecutionOwnershipInput): ExecutionOwnershipDecision {
  const candidates: ExecutionOwnershipDecision[] = [];

  if (!input.alive || input.reactionState === 'downed') {
    candidates.push({ owner: 'reaction', priority: reactionExecutionPriority('downed'), reason: 'agent is downed and cannot accept another movement owner' });
  }

  if (input.recoveryRole === 'rescuer') {
    candidates.push({ owner: 'recovery_rescue', priority: EXECUTION_PRIORITY.recovery_rescue, reason: 'casualty rescue owns the committed treatment route' });
  } else if (input.recoveryRole === 'security') {
    candidates.push({ owner: 'recovery_security', priority: EXECUTION_PRIORITY.recovery_security, reason: 'casualty security owns the committed covering geometry' });
  }

  if (input.counterfireActive) {
    candidates.push({ owner: 'counterfire', priority: EXECUTION_PRIORITY.counterfire, reason: 'counterfire response owns the short operational interruption' });
  }

  const reactionPriority = reactionExecutionPriority(input.reactionState);
  if (reactionPriority > 0 && input.reactionState !== 'downed') {
    candidates.push({ owner: 'reaction', priority: reactionPriority, reason: `reaction ${input.reactionState} requested temporary movement ownership` });
  }

  if (SEARCH_TASKS.has(input.task) || input.tactic === 'sweep') {
    candidates.push({ owner: 'search', priority: EXECUTION_PRIORITY.search, reason: 'active search contract owns the member movement plan' });
  } else if (DIRECT_COMBAT_TASKS.has(input.task) && input.alertState === 'active') {
    candidates.push({ owner: 'direct_combat', priority: EXECUTION_PRIORITY.direct_combat, reason: `committed tactical task ${input.task} owns movement` });
  }

  if (input.logisticsTask !== 'none') {
    candidates.push({ owner: 'logistics', priority: EXECUTION_PRIORITY.logistics, reason: `field logistics task ${input.logisticsTask} requests movement ownership` });
  }

  candidates.push({ owner: 'patrol', priority: EXECUTION_PRIORITY.patrol, reason: 'no higher operational movement owner is active' });
  candidates.sort((left, right) => right.priority - left.priority);
  return candidates[0]!;
}

/**
 * Resolve a final movement target after ownership has been decided.
 *
 * Tactical/search owners intentionally do not accept a lower legacy proposal as
 * fallback. If their authored target is absent they hold their current position;
 * this prevents a hidden logistics/reaction hook from substituting an unrelated
 * destination and producing frame-to-frame target thrash.
 */
export function resolveExecutionTarget(
  input: ExecutionTargetInput,
  decision = resolveExecutionOwnership(input),
): GridPoint | null {
  switch (decision.owner) {
    case 'recovery_rescue':
    case 'recovery_security':
    case 'counterfire':
      return clonePoint(input.legacyTarget);
    case 'reaction':
      return clonePoint(input.reactionTarget ?? input.position);
    case 'direct_combat':
    case 'search':
      return clonePoint(input.tacticalTarget ?? input.position);
    case 'logistics':
      return clonePoint(input.resupplyTarget ?? input.position);
    case 'patrol':
      return clonePoint(input.legacyTarget);
  }
}

export function reactionExecutionPriority(reactionState: string): number {
  return REACTION_EXECUTION_PRIORITY[reactionState] ?? 0;
}

export function isLegacyMovementProposalRequired(owner: ExecutionOwner): boolean {
  return owner === 'recovery_rescue'
    || owner === 'recovery_security'
    || owner === 'counterfire'
    || owner === 'patrol';
}

function clonePoint(point: GridPoint | null): GridPoint | null {
  return point === null ? null : { ...point };
}
