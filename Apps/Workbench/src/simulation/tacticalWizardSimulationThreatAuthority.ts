import { hasLineOfSight, isWalkable, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from './tacticalWizardTestMapV7';
import {
  TacticalWizardSimulation as TacticalWizardSimulationPerceptionIntegrated,
  activeAttentionHalfFov,
  type TacticalWizardSimulationState as TacticalWizardSimulationStatePerceptionIntegrated,
} from './tacticalWizardSimulationPerceptionIntegrated';

export * from './tacticalWizardSimulationPerceptionIntegrated';

export type AcousticEvidenceDisposition = 'investigation' | 'same_contact' | 'search_bias' | 'secondary_cue';
export type TacticalOpportunity = 'flank' | 'assault' | null;

export interface TacticalWizardSimulationState extends TacticalWizardSimulationStatePerceptionIntegrated {
  readonly threatAuthority: {
    readonly bodyAttentionSeparated: true;
    readonly acousticEvidenceMode: 'none' | 'investigation' | 'search_bias';
    readonly correlatedGunshots: number;
    readonly searchBiasGunshots: number;
    readonly secondaryGunshots: number;
    readonly suppressedSweepTransitions: number;
    readonly tacticalOpportunityTransitions: number;
    readonly actualFastSearchTransitions: number;
    readonly closePressureAgentId: string | null;
    readonly attentionFacing: readonly { readonly agentId: string; readonly facing: GridPoint }[];
    readonly supportContracts: readonly {
      readonly supporterId: string;
      readonly supportedAgentIds: readonly string[];
      readonly purpose: 'covered_move' | 'flank' | 'crossfire' | 'assault';
    }[];
  };
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
  searchLookTarget: GridPoint | null;
}

interface ReactionAccess { readonly kind: string; readonly untilTick: number }
interface RescuePlanAccess { readonly rescuerId: string; readonly covererId: string | null }

interface AuthorityAcousticContract {
  episodeId: number;
  target: GridPoint;
  firstShotTick: number;
  lastShotTick: number;
  shots: number;
  expiresTick: number;
  lastSampleTick: number;
  listeners: Set<string>;
  observationTargets: Map<string, GridPoint>;
  _authorityMode?: 'search_bias';
}

interface AuthorityInternals {
  members: HostMember[];
  logicalTick: number;
  player: GridPoint;
  alertState: 'idle' | 'pending' | 'active';
  tactic: string;
  tacticReason: string;
  tacticStartedTick: number;
  stableContactTicks: number;
  lostContactTicks: number;
  boundingPhase: number;
  sharedLastKnownPosition: GridPoint | null;
  rescuePlan: RescuePlanAccess | null;
  reactions: Map<string, ReactionAccess>;
  vitals: Map<string, { health: number }>;
  visionRange: number;
  acousticEpisodeId: number;
  acousticShotsInEpisode: number;
  acousticLastShotTick: number | null;
  acousticInvestigation: AuthorityAcousticContract | null;
  registerAcousticSample: (listenerId: string, perceivedPoint: GridPoint) => void;
  canSeePlayer: (member: HostMember) => boolean;
  movementTarget: (member: HostMember) => GridPoint | null;
  updatePostureAndFacing: (member: HostMember) => void;
  updateDoctrine: (visibility: ReadonlyMap<string, boolean>) => void;
  transitionTactic: (next: string, reason: string, rotateRoles: boolean) => void;
  safeFireLaneCount: () => number;
  planCompletion: () => number;
  log: (...args: any[]) => void;
}

const SAME_CONTACT_ACOUSTIC_RADIUS = 8.5;
const MANEUVER_CONTACT_GRACE_TICKS = 8;
const TRACKING_HALF_FOV = 115;
const ASSAULT_CLOSE_PRESSURE_RANGE = 3.4;
const CLOSE_PRESSURE_STANDOFFS = [1.05, 1.2, 1.35] as const;
const SEARCH_BIAS_SINGLE_SHOT_TICKS = 12;
const SEARCH_BIAS_REPEATED_SHOT_TICKS = 20;

/** Central arbiter between perception evidence and tactical execution. */
export class TacticalWizardSimulation extends TacticalWizardSimulationPerceptionIntegrated {
  private readonly authorityAttentionFacing = new Map<string, GridPoint>();
  private authorityCorrelatedGunshots = 0;
  private authoritySearchBiasGunshots = 0;
  private authoritySecondaryGunshots = 0;
  private authoritySuppressedSweepTransitions = 0;
  private authorityOpportunityTransitions = 0;
  private authorityActualFastSearchTransitions = 0;
  private authorityClosePressureAgentId: string | null = null;
  private authorityLastCorrelatedShotTick = -999;
  private authorityLastSearchBiasShotTick = -999;
  private authorityLastSecondaryShotTick = -999;
  private authorityLastSuppressedSweepTick = -999;
  private authorityLastClosePressureLogTick = -999;

  constructor() {
    super();
    this.installAuthorityAcousticAssociation();
    this.installAuthorityFacingSeparation();
    this.installAuthorityTransitionGuard();
    this.installAuthorityOpportunitySelection();
    this.installAuthorityClosePressure();
    this.authorityInternals().log('system', 'simulation', 'Volition Simulation', 'session', 'Threat association / tactical-opportunity authority enabled.', {
      tacticsAdded: 0,
      evidencePriority: 'live_visual > squad_confirmed_contact > incoming_fire > acoustic > memory',
      acousticPolicy: 'same_contact_gunfire_correlates_without_investigation_movement',
      facingPolicy: 'body_facing_separated_from_attention_facing',
      maneuverGraceTicks: MANEUVER_CONTACT_GRACE_TICKS,
      assaultPolicy: 'settled_crossfire_plus_one_safe_support_lane_can_exploit',
      meleePolicy: 'one_visible_assaulter_may_claim_final_close_pressure',
    });
  }

  override reset(): TacticalWizardSimulationState {
    super.reset();
    this.authorityAttentionFacing.clear();
    this.authorityCorrelatedGunshots = 0;
    this.authoritySearchBiasGunshots = 0;
    this.authoritySecondaryGunshots = 0;
    this.authoritySuppressedSweepTransitions = 0;
    this.authorityOpportunityTransitions = 0;
    this.authorityActualFastSearchTransitions = 0;
    this.authorityClosePressureAgentId = null;
    this.authorityLastCorrelatedShotTick = -999;
    this.authorityLastSearchBiasShotTick = -999;
    this.authorityLastSecondaryShotTick = -999;
    this.authorityLastSuppressedSweepTick = -999;
    this.authorityLastClosePressureLogTick = -999;
    return this.getState();
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    super.advance(deltaSeconds);
    return this.getState();
  }

  override getState(): TacticalWizardSimulationState {
    const base = super.getState();
    const runtime = this.authorityInternals();
    const contract = runtime.acousticInvestigation;
    const searchBias = contract?._authorityMode === 'search_bias';
    return {
      ...base,
      perceptionIntegration: {
        ...base.perceptionIntegration,
        acousticInvestigationActive: base.perceptionIntegration.acousticInvestigationActive && !searchBias,
        responderIds: searchBias ? [] : base.perceptionIntegration.responderIds,
        fastSearchTransitions: this.authorityActualFastSearchTransitions,
      },
      threatAuthority: {
        bodyAttentionSeparated: true,
        acousticEvidenceMode: contract === null ? 'none' : searchBias ? 'search_bias' : 'investigation',
        correlatedGunshots: this.authorityCorrelatedGunshots,
        searchBiasGunshots: this.authoritySearchBiasGunshots,
        secondaryGunshots: this.authoritySecondaryGunshots,
        suppressedSweepTransitions: this.authoritySuppressedSweepTransitions,
        tacticalOpportunityTransitions: this.authorityOpportunityTransitions,
        actualFastSearchTransitions: this.authorityActualFastSearchTransitions,
        closePressureAgentId: this.authorityClosePressureAgentId,
        attentionFacing: base.agents.map((agent) => ({
          agentId: agent.id,
          facing: { ...(this.authorityAttentionFacing.get(agent.id) ?? agent.facing) },
        })),
        supportContracts: buildSupportContracts(base),
      },
    };
  }

  private installAuthorityAcousticAssociation(): void {
    const runtime = this.authorityInternals();
    const parentRegister = runtime.registerAcousticSample.bind(this);
    runtime.registerAcousticSample = (listenerId: string, perceivedPoint: GridPoint): void => {
      const coarse = coarsenAuthorityAcousticPoint(perceivedPoint);
      const liveVisual = runtime.members.some((member) => this.isAuthorityMemberAlive(member.id) && runtime.canSeePlayer(member));
      const disposition = classifyAcousticEvidence({
        hasConfirmedVisual: liveVisual,
        alertActive: runtime.alertState === 'active',
        acousticTarget: coarse,
        lastKnownPosition: runtime.sharedLastKnownPosition,
      });
      const shotTick = runtime.acousticLastShotTick ?? runtime.logicalTick;

      if (disposition === 'same_contact') {
        runtime.acousticInvestigation = null;
        if (shotTick !== this.authorityLastCorrelatedShotTick) {
          this.authorityLastCorrelatedShotTick = shotTick;
          this.authorityCorrelatedGunshots += 1;
          runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'perception', 'Rifle report associated with the already confirmed hostile contact; no investigation movement or search scan was requested.', {
            shotTick, coarseTarget: { ...coarse }, policy: 'corroboration_not_new_threat',
          });
        }
        return;
      }

      if (disposition === 'search_bias') {
        this.upsertAuthoritySearchBias(coarse, shotTick);
        if (shotTick !== this.authorityLastSearchBiasShotTick) {
          this.authorityLastSearchBiasShotTick = shotTick;
          this.authoritySearchBiasGunshots += 1;
          runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'perception', 'Rifle report matched the fresh lost-contact sector; it may bias search but does not create investigation responders.', {
            shotTick, coarseTarget: { ...coarse }, policy: 'same_contact_search_bias_only',
          });
        }
        return;
      }

      if (disposition === 'secondary_cue') {
        if (shotTick !== this.authorityLastSecondaryShotTick) {
          this.authorityLastSecondaryShotTick = shotTick;
          this.authoritySecondaryGunshots += 1;
          runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'perception', 'Rifle report conflicts with the committed contact sector; retained as a secondary cue without switching threat.', {
            shotTick, coarseTarget: { ...coarse }, policy: 'single_contact_reference_no_acoustic_only_switch',
          });
        }
        return;
      }

      parentRegister(listenerId, perceivedPoint);
    };
  }

  private upsertAuthoritySearchBias(target: GridPoint, shotTick: number): void {
    const runtime = this.authorityInternals();
    const episodeId = runtime.acousticEpisodeId;
    const shots = Math.max(1, runtime.acousticShotsInEpisode);
    const expiresTick = runtime.logicalTick + (shots >= 2 ? SEARCH_BIAS_REPEATED_SHOT_TICKS : SEARCH_BIAS_SINGLE_SHOT_TICKS);
    const current = runtime.acousticInvestigation;
    if (current === null || current.episodeId !== episodeId || current._authorityMode !== 'search_bias') {
      runtime.acousticInvestigation = {
        episodeId, target: { ...target }, firstShotTick: shotTick, lastShotTick: shotTick,
        shots, expiresTick, lastSampleTick: runtime.logicalTick,
        listeners: new Set<string>(), observationTargets: new Map<string, GridPoint>(), _authorityMode: 'search_bias',
      };
      return;
    }
    if (current.lastSampleTick === runtime.logicalTick) return;
    current.lastSampleTick = runtime.logicalTick;
    current.lastShotTick = shotTick;
    current.shots = Math.max(current.shots, shots);
    current.expiresTick = Math.max(current.expiresTick, expiresTick);
    current.target = coarsenAuthorityAcousticPoint({
      x: current.target.x * 0.35 + target.x * 0.65,
      y: current.target.y * 0.35 + target.y * 0.65,
    });
    current.observationTargets.clear();
  }

  private installAuthorityFacingSeparation(): void {
    const runtime = this.authorityInternals();
    const parentUpdate = runtime.updatePostureAndFacing.bind(this);
    runtime.updatePostureAndFacing = (member: HostMember): void => {
      const bodyBefore = { ...member.facing };
      parentUpdate(member);
      const sensorSuggestion = { ...member.facing };
      const attentionOwned = this.authorityAttentionOwnsMember(member.id);

      if (member.targetVisible) {
        this.authorityAttentionFacing.set(member.id, directionTo(member.position, runtime.player));
        if (runtime.tactic === 'sweep' || attentionOwned) member.facing = this.resolveAuthorityBodyFacing(member, bodyBefore);
        return;
      }
      if (attentionOwned && !this.isAuthorityRecoveryOwner(member.id)) {
        this.authorityAttentionFacing.set(member.id, sensorSuggestion);
        member.facing = this.resolveAuthorityBodyFacing(member, bodyBefore);
        return;
      }
      this.authorityAttentionFacing.set(member.id, { ...member.facing });
    };

    const parentCanSee = runtime.canSeePlayer.bind(this);
    runtime.canSeePlayer = (member: HostMember): boolean => {
      if (parentCanSee(member)) return true;
      if (!this.isAuthorityMemberAlive(member.id)) return false;
      const range = distance(member.position, runtime.player);
      if (range > runtime.visionRange) return false;
      if (!hasLineOfSight(tacticalWizardNavigationGrid, toCell(member.position), toCell(runtime.player))) return false;
      const sensor = normalize(this.authorityAttentionFacing.get(member.id) ?? member.facing);
      const targetDirection = directionTo(member.position, runtime.player);
      if (member.targetVisible) return angleDegrees(sensor, targetDirection) <= TRACKING_HALF_FOV;
      const halfFov = activeAttentionHalfFov(range);
      return halfFov !== null && this.authorityAttentionOwnsMember(member.id) && angleDegrees(sensor, targetDirection) <= halfFov;
    };
  }

  private resolveAuthorityBodyFacing(member: HostMember, fallback: GridPoint): GridPoint {
    const runtime = this.authorityInternals();
    if (runtime.alertState === 'active' && runtime.sharedLastKnownPosition !== null && isFireSupportPosture(member)) {
      return directionTo(member.position, runtime.sharedLastKnownPosition);
    }
    return normalize(fallback);
  }

  private authorityAttentionOwnsMember(id: string): boolean {
    const runtime = this.authorityInternals();
    const contract = runtime.acousticInvestigation;
    if (contract !== null && runtime.logicalTick <= contract.expiresTick && contract._authorityMode !== 'search_bias' && contract.listeners.has(id)) return true;
    return runtime.alertState === 'active' && (runtime.tactic === 'sweep' || runtime.lostContactTicks > 0);
  }

  private installAuthorityTransitionGuard(): void {
    const runtime = this.authorityInternals();
    const parentTransition = runtime.transitionTactic.bind(this);
    runtime.transitionTactic = (next: string, reason: string, rotateRoles: boolean): void => {
      const current = runtime.tactic;
      if (next === 'sweep') {
        const liveVisual = runtime.members.some((member) => this.isAuthorityMemberAlive(member.id) && runtime.canSeePlayer(member));
        if (shouldProtectCommittedManeuver(current, runtime.lostContactTicks, liveVisual)) {
          runtime.tacticReason = liveVisual
            ? 'A live hostile is still visually confirmed; search cannot pre-empt direct combat.'
            : `The ${current} maneuver remains committed through a short LOS interruption; preserve the fresh LKP before escalating to sweep.`;
          if (runtime.logicalTick !== this.authorityLastSuppressedSweepTick) {
            this.authorityLastSuppressedSweepTick = runtime.logicalTick;
            this.authoritySuppressedSweepTransitions += 1;
            runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'tactic', 'Sweep transition suppressed because live visual or committed maneuver still owns execution.', {
              currentTactic: current, lostContactTicks: runtime.lostContactTicks, liveVisual,
              graceTicks: MANEUVER_CONTACT_GRACE_TICKS, rejectedReason: reason,
            });
          }
          return;
        }
      }
      const before = runtime.tactic;
      parentTransition(next, reason, rotateRoles);
      if (before !== runtime.tactic && next === 'sweep' && reason.includes('0.75 seconds')) this.authorityActualFastSearchTransitions += 1;
      if (before !== runtime.tactic) this.logAuthoritySupportContract(runtime.tactic);
    };
  }

  private installAuthorityOpportunitySelection(): void {
    const runtime = this.authorityInternals();
    const parentUpdateDoctrine = runtime.updateDoctrine.bind(this);
    runtime.updateDoctrine = (visibility: ReadonlyMap<string, boolean>): void => {
      const alive = runtime.members.filter((member) => this.isAuthorityMemberAlive(member.id));
      const visibleMembers = alive.filter((member) => visibility.get(member.id) === true).length;
      const nearestThreatDistance = runtime.sharedLastKnownPosition === null || alive.length === 0
        ? Number.POSITIVE_INFINITY
        : Math.min(...alive.map((member) => distance(member.position, runtime.sharedLastKnownPosition!)));
      const opportunity = selectTacticalOpportunity({
        currentTactic: runtime.tactic,
        tacticTicks: Math.max(0, runtime.logicalTick - runtime.tacticStartedTick),
        boundingPhase: runtime.boundingPhase,
        planCompletion: runtime.planCompletion(),
        stableContactTicks: runtime.stableContactTicks,
        lostContactTicks: runtime.lostContactTicks,
        visibleMembers,
        safeFireLanes: runtime.safeFireLaneCount(),
        nearestThreatDistance,
        rescueActive: runtime.rescuePlan !== null,
      });
      if (opportunity === 'flank') {
        this.authorityOpportunityTransitions += 1;
        runtime.transitionTactic('flank', 'Completed bound plus stable visual and a safe support lane create a flank opportunity; exploit geometry instead of waiting for a stationary-target timeout.', true);
        return;
      }
      if (opportunity === 'assault') {
        this.authorityOpportunityTransitions += 1;
        runtime.transitionTactic('assault', 'Established crossfire plus one safe supporting lane and stable live contact create a coordinated assault opportunity.', true);
        return;
      }
      parentUpdateDoctrine(visibility);
    };
  }

  private installAuthorityClosePressure(): void {
    const runtime = this.authorityInternals();
    const parentMovementTarget = runtime.movementTarget.bind(this);
    runtime.movementTarget = (member: HostMember): GridPoint | null => {
      const original = parentMovementTarget(member);
      if (runtime.alertState !== 'active' || runtime.tactic !== 'assault' || runtime.rescuePlan !== null) {
        if (runtime.tactic !== 'assault') this.authorityClosePressureAgentId = null;
        return original;
      }
      const reaction = runtime.reactions.get(member.id);
      if (reaction !== undefined && reaction.untilTick > runtime.logicalTick) return original;
      const owner = this.authorityClosePressureOwner();
      if (owner === null || owner.id !== member.id) return original;
      const range = distance(member.position, runtime.player);
      this.authorityClosePressureAgentId = owner.id;
      if (range <= 1.35 || range > ASSAULT_CLOSE_PRESSURE_RANGE) return original;
      const target = selectClosePressureTarget(member.position, runtime.player);
      if (target === null) return original;
      if (runtime.logicalTick !== this.authorityLastClosePressureLogTick) {
        this.authorityLastClosePressureLogTick = runtime.logicalTick;
        runtime.log('agent', member.id, member.label, 'plan', `${member.label} claimed the final close-pressure lane while the other assault element preserves spacing.`, {
          range: Number(range.toFixed(2)), target: { ...target }, tactic: runtime.tactic, policy: 'single_close_pressure_claim',
        });
      }
      return target;
    };
  }

  private authorityClosePressureOwner(): HostMember | null {
    const runtime = this.authorityInternals();
    return runtime.members
      .filter((member) => member.role === 'assaulter' && member.targetVisible && this.isAuthorityMemberAlive(member.id))
      .filter((member) => {
        const reaction = runtime.reactions.get(member.id);
        return reaction === undefined || reaction.untilTick <= runtime.logicalTick;
      })
      .sort((left, right) => distance(left.position, runtime.player) - distance(right.position, runtime.player) || left.id.localeCompare(right.id, 'en'))[0] ?? null;
  }

  private logAuthoritySupportContract(tactic: string): void {
    const contracts = buildSupportContracts(super.getState());
    if (contracts.length === 0) return;
    this.authorityInternals().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'roles', 'Fire-support contract attached to the active maneuver.', {
      tactic,
      contracts: contracts.map((contract) => `${contract.supporterId}->${contract.supportedAgentIds.join('+')}:${contract.purpose}`),
    });
  }

  private isAuthorityRecoveryOwner(id: string): boolean {
    const plan = this.authorityInternals().rescuePlan;
    return plan !== null && (plan.rescuerId === id || plan.covererId === id);
  }

  private isAuthorityMemberAlive(id: string): boolean {
    return (this.authorityInternals().vitals.get(id)?.health ?? 1) > 0;
  }

  private authorityInternals(): AuthorityInternals {
    return this as unknown as AuthorityInternals;
  }
}

export function classifyAcousticEvidence(input: {
  readonly hasConfirmedVisual: boolean;
  readonly alertActive: boolean;
  readonly acousticTarget: GridPoint;
  readonly lastKnownPosition: GridPoint | null;
}): AcousticEvidenceDisposition {
  if (input.hasConfirmedVisual) return 'same_contact';
  if (!input.alertActive || input.lastKnownPosition === null) return 'investigation';
  if (distance(input.acousticTarget, input.lastKnownPosition) <= SAME_CONTACT_ACOUSTIC_RADIUS) return 'search_bias';
  return 'secondary_cue';
}

export function shouldProtectCommittedManeuver(currentTactic: string, lostContactTicks: number, hasLiveVisual: boolean): boolean {
  if (hasLiveVisual) return true;
  return (currentTactic === 'flank' || currentTactic === 'crossfire' || currentTactic === 'assault')
    && lostContactTicks < MANEUVER_CONTACT_GRACE_TICKS;
}

export function selectTacticalOpportunity(input: {
  readonly currentTactic: string;
  readonly tacticTicks: number;
  readonly boundingPhase: number;
  readonly planCompletion: number;
  readonly stableContactTicks: number;
  readonly lostContactTicks: number;
  readonly visibleMembers: number;
  readonly safeFireLanes: number;
  readonly nearestThreatDistance: number;
  readonly rescueActive: boolean;
}): TacticalOpportunity {
  if (input.rescueActive || input.lostContactTicks > 0 || input.visibleMembers <= 0) return null;
  if (input.currentTactic === 'bounding'
    && input.boundingPhase >= 1
    && input.planCompletion >= 1
    && input.tacticTicks >= 6
    && input.stableContactTicks >= 3
    && input.safeFireLanes >= 1) return 'flank';
  if (input.currentTactic === 'crossfire'
    && input.planCompletion >= 1
    && input.tacticTicks >= 6
    && input.stableContactTicks >= 3
    && input.safeFireLanes >= 1
    && input.nearestThreatDistance <= 18) return 'assault';
  return null;
}

export function selectClosePressureTarget(origin: GridPoint, player: GridPoint): GridPoint | null {
  const away = normalize({ x: origin.x - player.x, y: origin.y - player.y });
  for (const standOff of CLOSE_PRESSURE_STANDOFFS) {
    const candidate = { x: player.x + away.x * standOff, y: player.y + away.y * standOff };
    const cell = toCell(candidate);
    if (!isWalkable(tacticalWizardNavigationGrid, cell)) continue;
    if (!hasLineOfSight(tacticalWizardNavigationGrid, cell, toCell(player))) continue;
    if (distance(candidate, player) < 0.9) continue;
    return candidate;
  }
  return null;
}

function buildSupportContracts(state: TacticalWizardSimulationStatePerceptionIntegrated): TacticalWizardSimulationState['threatAuthority']['supportContracts'] {
  const supporterId = state.squad.suppressorId;
  if (state.squad.alertState !== 'active' || supporterId === null) return [];
  const living = new Set(state.agents.filter((agent) => agent.alive).map((agent) => agent.id));
  if (!living.has(supporterId)) return [];
  const targets = [state.squad.moverId, state.squad.observerId].filter((id): id is string => id !== null && id !== supporterId && living.has(id));
  if (targets.length === 0) return [];
  if (state.squad.tactic === 'bounding') return [{ supporterId, supportedAgentIds: targets.slice(0, 1), purpose: 'covered_move' }];
  if (state.squad.tactic === 'flank') return [{ supporterId, supportedAgentIds: targets.slice(0, 1), purpose: 'flank' }];
  if (state.squad.tactic === 'crossfire') return [{ supporterId, supportedAgentIds: targets, purpose: 'crossfire' }];
  if (state.squad.tactic === 'assault') return [{ supporterId, supportedAgentIds: targets, purpose: 'assault' }];
  return [];
}

function isFireSupportPosture(member: HostMember): boolean {
  return member.task === 'suppress' || member.task === 'hold_cover' || member.task === 'crossfire' || member.role === 'support';
}

function coarsenAuthorityAcousticPoint(point: GridPoint): GridPoint {
  const snapped = toCell({ x: Math.round(point.x / 2) * 2, y: Math.round(point.y / 2) * 2 });
  if (isWalkable(tacticalWizardNavigationGrid, snapped)) return snapped;
  for (let radius = 1; radius <= 3; radius += 1) {
    for (let y = snapped.y - radius; y <= snapped.y + radius; y += 1) {
      for (let x = snapped.x - radius; x <= snapped.x + radius; x += 1) {
        const candidate = toCell({ x, y });
        if (isWalkable(tacticalWizardNavigationGrid, candidate)) return candidate;
      }
    }
  }
  return snapped;
}

function directionTo(from: GridPoint, to: GridPoint): GridPoint {
  return normalize({ x: to.x - from.x, y: to.y - from.y });
}

function toCell(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))),
  };
}

function angleDegrees(a: GridPoint, b: GridPoint): number {
  const left = normalize(a);
  const right = normalize(b);
  const dot = Math.max(-1, Math.min(1, left.x * right.x + left.y * right.y));
  return Math.acos(dot) * 180 / Math.PI;
}

function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-9 ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
