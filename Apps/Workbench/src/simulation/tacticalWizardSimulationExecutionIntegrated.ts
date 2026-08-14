import type { GridPoint } from './navigation';
import {
  TacticalWizardSimulation as TacticalWizardSimulationIntegrated,
  type TacticalWizardSimulationState,
} from './tacticalWizardSimulationIntegrated';

export * from './tacticalWizardSimulationIntegrated';

type RecoveryPhase = 'establish_cover' | 'approach' | 'treat';
type RecoveryThreatSource = 'confirmed_visual' | 'incoming_sector' | 'contact_memory' | 'none';
type RecoveryReplanReason =
  | 'new_recovery'
  | 'confirmed_threat_shift'
  | 'incoming_fire_shift'
  | 'security_lane_lost'
  | 'route_invalid'
  | 'treatment_invalid'
  | 'manual_refresh';

interface HostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  task: string;
  role: string;
  tacticalTarget: GridPoint | null;
}

interface ReactionAccess {
  readonly kind: string;
  readonly target?: GridPoint | null;
  readonly source?: string;
  readonly untilTick: number;
}

interface RescuePlanAccess {
  readonly downedAgentId: string;
  readonly rescuerId: string;
  readonly covererId: string | null;
  readonly startedTick: number;
  readonly coverReadyTick: number;
  approachTarget: GridPoint;
  phase: RecoveryPhase;
  treatmentSeconds: number;
}

interface DynamicRecoveryGeometryAccess {
  readonly planIdentity: string;
  readonly revision: number;
  readonly stagePoint: GridPoint;
  readonly treatmentPoint: GridPoint;
  readonly securityPoint: GridPoint;
  readonly threatAnchor: GridPoint | null;
  readonly threatSource: RecoveryThreatSource;
  readonly lastReplanTick: number;
  readonly lastReplanReason: RecoveryReplanReason;
}

interface RecoveryThreatSnapshot {
  readonly point: GridPoint | null;
  readonly source: RecoveryThreatSource;
}

interface ExecutionInternals {
  members: HostMember[];
  logicalTick: number;
  movementTarget: (member: HostMember) => GridPoint | null;
  reactions: Map<string, ReactionAccess>;
  rescuePlan: RescuePlanAccess | null;
  dynamicRecoveryGeometry: DynamicRecoveryGeometryAccess | null;
  resolveRecoveryThreat: (state: TacticalWizardSimulationState) => RecoveryThreatSnapshot;
  maintainDynamicRecovery: (
    state: TacticalWizardSimulationState,
    force: boolean,
    forcedReason?: RecoveryReplanReason,
  ) => void;
  canDetachForResupply: (agentId: string, state: unknown) => boolean;
  handleBlockedFire: (member: HostMember, reason: string, blockerId: string) => void;
  log: (...args: any[]) => void;
}

const AMMO_CRITICAL_FOR_DETACHMENT = 12;
const SEARCH_COMBAT_READY_AMMO = 3;
const STRUCTURAL_RECOVERY_REPLANS = new Set<RecoveryReplanReason>([
  'security_lane_lost',
  'route_invalid',
  'treatment_invalid',
]);
const RECOVERY_INTERRUPT_REACTIONS = new Set(['stunned', 'downed']);
const LOGISTICS_BLOCKING_COMMITMENTS = new Set([
  'counterfire',
  'reaction',
  'recovery_rescue',
  'recovery_security',
]);

/**
 * Final execution-reconciliation layer for the Tactical Wizard reference.
 *
 * No new tactic or action is introduced here. The layer makes the already
 * declared execution priorities real at the Host boundary:
 * - an active rescue commitment outranks soft reactions such as dodge / smoke
 *   repositioning while stunned/downed still interrupt it;
 * - recovery threat memory is monotonic inside one rescue contract: a frame
 *   with no new evidence cannot erase the last useful threat snapshot;
 * - dynamic geometry may replan without automatically throwing approach/treat
 *   back to establish_cover; the existing physical security gate decides that;
 * - lower-priority logistics is denied admission while a higher commitment owns
 *   the agent, preventing assign/preempt/reassign churn;
 * - search normally keeps ownership, but an actually dry element may detach one
 *   member for resupply so a long search cannot starve the whole squad forever;
 * - the casualty can block a shot without being treated as a failed rescue lane.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationIntegrated {
  private lastPreservedRecoveryRevision = -1;

  constructor() {
    super();
    this.installRecoveryMovementAuthority();
    this.installRecoveryThreatMemory();
    this.installRecoveryPhaseContinuity();
    this.installLogisticsAdmissionGuard();
    this.installCasualtyLaneBlockGuard();
    this.executionInternals().log('system', 'simulation', 'Volition Simulation', 'session', 'Recovery execution ownership integration enabled.', {
      tacticsAdded: 0,
      recoveryMovementPriority: 'recovery_over_soft_reaction',
      recoveryInterruptions: [...RECOVERY_INTERRUPT_REACTIONS],
      recoveryThreatPolicy: 'retain_last_useful_snapshot_until_new_evidence_or_contract_end',
      recoveryPhasePolicy: 'geometry_replan_does_not_imply_phase_rollback',
      logisticsPolicy: 'admission_gated_by_current_operational_commitment_with_dry_search_escape',
      casualtyLanePolicy: 'withhold_fire_without_replanning_on_downed_blocker',
    });
  }

  override reset(): TacticalWizardSimulationState {
    const state = super.reset();
    this.lastPreservedRecoveryRevision = -1;
    return state;
  }

  private installRecoveryMovementAuthority(): void {
    const runtime = this.executionInternals();
    const originalMovementTarget = runtime.movementTarget.bind(this);
    runtime.movementTarget = (member: HostMember): GridPoint | null => {
      const plan = runtime.rescuePlan;
      const reaction = runtime.reactions.get(member.id);
      const recoveryOwnsMember = plan !== null && (member.id === plan.rescuerId || member.id === plan.covererId);
      const softReaction = reaction !== undefined
        && reaction.untilTick > runtime.logicalTick
        && !recoveryReactionMayPreempt(reaction.kind);

      if (!recoveryOwnsMember || !softReaction || reaction === undefined) return originalMovementTarget(member);

      runtime.reactions.delete(member.id);
      try {
        return originalMovementTarget(member);
      } finally {
        if (!runtime.reactions.has(member.id)) runtime.reactions.set(member.id, reaction);
      }
    };
  }

  private installRecoveryThreatMemory(): void {
    const runtime = this.executionInternals();
    if (typeof runtime.resolveRecoveryThreat !== 'function') return;
    const originalResolve = runtime.resolveRecoveryThreat.bind(this);
    runtime.resolveRecoveryThreat = (state: TacticalWizardSimulationState): RecoveryThreatSnapshot => {
      const resolved = originalResolve(state);
      if (resolved.point !== null) return resolved;

      const plan = runtime.rescuePlan;
      const geometry = runtime.dynamicRecoveryGeometry;
      if (plan === null || geometry?.threatAnchor === null || geometry === null) return resolved;
      if (geometry.planIdentity !== rescuePlanIdentity(plan)) return resolved;

      return {
        point: { ...geometry.threatAnchor },
        source: geometry.threatSource === 'none' ? 'contact_memory' : geometry.threatSource,
      };
    };
  }

  private installRecoveryPhaseContinuity(): void {
    const runtime = this.executionInternals();
    if (typeof runtime.maintainDynamicRecovery !== 'function') return;
    const originalMaintain = runtime.maintainDynamicRecovery.bind(this);
    runtime.maintainDynamicRecovery = (
      state: TacticalWizardSimulationState,
      force: boolean,
      forcedReason?: RecoveryReplanReason,
    ): void => {
      const before = runtime.rescuePlan;
      const beforeIdentity = before === null ? null : rescuePlanIdentity(before);
      const beforePhase = before?.phase ?? null;
      const beforeTreatmentSeconds = before?.treatmentSeconds ?? 0;

      originalMaintain(state, force, forcedReason);

      const after = runtime.rescuePlan;
      const geometry = runtime.dynamicRecoveryGeometry;
      if (before === null || after === null || beforeIdentity !== rescuePlanIdentity(after)) return;
      if ((beforePhase !== 'approach' && beforePhase !== 'treat') || after.phase !== 'establish_cover') return;
      if (!shouldPreserveRecoveryPhaseOnReplan(geometry?.lastReplanReason ?? null)) return;

      after.phase = beforePhase;
      after.treatmentSeconds = beforeTreatmentSeconds;
      if (geometry !== null && geometry.revision !== this.lastPreservedRecoveryRevision) {
        this.lastPreservedRecoveryRevision = geometry.revision;
        runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Recovery geometry updated without discarding the committed rescue phase.', {
          revision: geometry.revision,
          replanReason: geometry.lastReplanReason,
          preservedPhase: beforePhase,
          preservedTreatmentSeconds: Number(beforeTreatmentSeconds.toFixed(3)),
        });
      }
    };
  }

  private installLogisticsAdmissionGuard(): void {
    const runtime = this.executionInternals();
    if (typeof runtime.canDetachForResupply !== 'function') return;
    const originalCanDetach = runtime.canDetachForResupply.bind(this);
    runtime.canDetachForResupply = (agentId: string, state: unknown): boolean => {
      const current = super.getState();
      const agent = current.agents.find((entry) => entry.id === agentId);
      if (agent === undefined || !agent.alive) return false;

      const commitment = current.combatAuthority.commitments.find((entry) => entry.agentId === agentId);
      if (commitment !== undefined && LOGISTICS_BLOCKING_COMMITMENTS.has(commitment.commitment)) return false;
      if (commitment?.commitment === 'search') {
        return searchResupplyMayDetach(agentId, current.agents);
      }
      if (commitment?.commitment === 'direct_combat' && agent.ammoRounds > AMMO_CRITICAL_FOR_DETACHMENT) return false;

      return originalCanDetach(agentId, state);
    };
  }

  private installCasualtyLaneBlockGuard(): void {
    const runtime = this.executionInternals();
    if (typeof runtime.handleBlockedFire !== 'function') return;
    const originalHandleBlockedFire = runtime.handleBlockedFire.bind(this);
    runtime.handleBlockedFire = (member: HostMember, reason: string, blockerId: string): void => {
      const plan = runtime.rescuePlan;
      if (plan !== null && blockerId === plan.downedAgentId) return;
      originalHandleBlockedFire(member, reason, blockerId);
    };
  }

  private executionInternals(): ExecutionInternals {
    return this as unknown as ExecutionInternals;
  }
}

export function recoveryReactionMayPreempt(reaction: string): boolean {
  return RECOVERY_INTERRUPT_REACTIONS.has(reaction);
}

export function shouldPreserveRecoveryPhaseOnReplan(reason: RecoveryReplanReason | null): boolean {
  if (reason === null || reason === 'new_recovery') return false;
  return !STRUCTURAL_RECOVERY_REPLANS.has(reason);
}

export function searchResupplyMayDetach(
  agentId: string,
  agents: readonly { readonly id: string; readonly alive: boolean; readonly ammoRounds: number }[],
): boolean {
  const living = agents.filter((agent) => agent.alive);
  const agent = living.find((entry) => entry.id === agentId);
  if (agent === undefined || agent.ammoRounds >= SEARCH_COMBAT_READY_AMMO) return false;

  const armedOthers = living.filter((entry) => entry.id !== agentId && entry.ammoRounds >= SEARCH_COMBAT_READY_AMMO);
  if (armedOthers.length > 0) return true;

  const allDry = living.length > 0 && living.every((entry) => entry.ammoRounds < SEARCH_COMBAT_READY_AMMO);
  if (!allDry) return false;
  const emergencyOwner = [...living].sort((left, right) => left.id.localeCompare(right.id, 'en'))[0];
  return emergencyOwner?.id === agentId;
}

function rescuePlanIdentity(plan: RescuePlanAccess): string {
  return `${plan.downedAgentId}:${plan.rescuerId}:${plan.covererId}:${plan.startedTick}`;
}
