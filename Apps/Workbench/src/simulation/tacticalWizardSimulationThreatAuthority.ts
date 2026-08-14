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
    readonly attentionFacing: readonly {
      readonly agentId: string;
      readonly facing: GridPoint;
    }[];
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
  coverState?: string;
}

interface ReactionAccess {
  readonly kind: string;
  readonly untilTick: number;
}

interface RescuePlanAccess {
  readonly rescuerId: string;
  readonly covererId: string | null;
}

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
  motionFrame: number;
  player: GridPoint;
  alertState: 'idle' | 'pending' | 'active';
  tactic: string;
  tacticReason: string;
  tacticStartedTick: number;
  stableContactTicks: number;
  stationaryTargetTicks: number;
  lostContactTicks: number;
  boundingPhase: number;
  maneuverCycle: number;
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
  pushEvent: (message: string) => void;
}

const SAME_CONTACT_ACOUSTIC_RADIUS = 8.5;
const MANEUVER_CONTACT_GRACE_TICKS = 8;
const TRACKING_HALF_FOV = 115;
const ASSAULT_CLOSE_PRESSURE_RANGE = 3.4;
const CLOSE_PRESSURE_STANDOFF = 1.05;
const SEARCH_BIAS_SINGLE_SHOT_TICKS = 12;
const SEARCH_BIAS_REPEATED_SHOT_TICKS = 20;

/**
 * Central threat / tactical-opportunity authority for the Tactical Wizard case.
 *
 * This layer deliberately owns the cross-cutting questions that previously sat
 * between perception and execution wrappers:
 * - Is a rifle report new information, or merely evidence from the hostile we
 *   are already tracking?
 * - Is a short LOS flicker allowed to cancel an already committed flank,
 *   crossfire or assault?
 * - Does visual scanning steer the sensor, or physically spin the whole body?
 * - When is an established bound/crossfire good enough to exploit instead of
 *   waiting for a timeout-oriented doctrine transition?
 *
 * It adds no new squad tactic. It arbitrates evidence and protects/exploits the
 * existing bounding/flank/crossfire/assault/sweep/regroup vocabulary.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationPerceptionIntegrated {
  private readonly attentionFacing = new Map<string, GridPoint>();
  private correlatedGunshots = 0;
  private searchBiasGunshots = 0;
  private secondaryGunshots = 0;
  private suppressedSweepTransitions = 0;
  private tacticalOpportunityTransitions = 0;
  private actualFastSearchTransitions = 0;
  private closePressureAgentId: string | null = null;
  private lastCorrelatedShotTick = -999;
  private lastSearchBiasShotTick = -999;
  private lastSecondaryShotTick = -999;
  private lastSuppressedSweepTick = -999;
  private lastClosePressureLogTick = -999;

  constructor() {
    super();
    this.installAcousticThreatAssociation();
    this.installBodyAttentionSeparation();
    this.installTacticalTransitionGuard();
    this.installTacticalOpportunitySelection();
    this.installAssaultClosePressure();
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
    this.attentionFacing.clear();
    this.correlatedGunshots = 0;
    this.searchBiasGunshots = 0;
    this.secondaryGunshots = 0;
    this.suppressedSweepTransitions = 0;
    this.tacticalOpportunityTransitions = 0;
    this.actualFastSearchTransitions = 0;
    this.closePressureAgentId = null;
    this.lastCorrelatedShotTick = -999;
    this.lastSearchBiasShotTick = -999;
    this.lastSecondaryShotTick = -999;
    this.lastSuppressedSweepTick = -999;
    this.lastClosePressureLogTick = -999;
    return this.getState();
  }

  override getState(): TacticalWizardSimulationState {
    const base = super.getState();
    const runtime = this.authorityInternals();
    const contract = runtime.acousticInvestigation;
    const searchBias = contract?._authorityMode === 'search_bias';
    const supportContracts = buildSupportContracts(base);
    return {
      ...base,
      perceptionIntegration: {
        ...base.perceptionIntegration,
        acousticInvestigationActive: base.perceptionIntegration.acousticInvestigationActive && !searchBias,
        responderIds: searchBias ? [] : base.perceptionIntegration.responderIds,
        fastSearchTransitions: this.actualFastSearchTransitions,
      },
      threatAuthority: {
        bodyAttentionSeparated: true,
        acousticEvidenceMode: contract === null ? 'none' : searchBias ? 'search_bias' : 'investigation',
        correlatedGunshots: this.correlatedGunshots,
        searchBiasGunshots: this.searchBiasGunshots,
        secondaryGunshots: this.secondaryGunshots,
        suppressedSweepTransitions: this.suppressedSweepTransitions,
        tacticalOpportunityTransitions: this.tacticalOpportunityTransitions,
        actualFastSearchTransitions: this.actualFastSearchTransitions,
        closePressureAgentId: this.closePressureAgentId,
        attentionFacing: base.agents.map((agent) => ({
          agentId: agent.id,
          facing: { ...(this.attentionFacing.get(agent.id) ?? agent.facing) },
        })),
        supportContracts,
      },
    };
  }

  private installAcousticThreatAssociation(): void {
    const runtime = this.authorityInternals();
    const parentRegister = runtime.registerAcousticSample.bind(this);
    runtime.registerAcousticSample = (listenerId: string, perceivedPoint: GridPoint): void => {
      const coarse = coarsenAuthorityAcousticPoint(perceivedPoint);
      const liveVisual = runtime.members.some((member) => this.memberAlive(member.id) && runtime.canSeePlayer(member));
      const disposition = classifyAcousticEvidence({
        hasConfirmedVisual: liveVisual,
        alertActive: runtime.alertState === 'active',
        acousticTarget: coarse,
        lastKnownPosition: runtime.sharedLastKnownPosition,
      });
      const shotTick = runtime.acousticLastShotTick ?? runtime.logicalTick;

      if (disposition === 'same_contact') {
        runtime.acousticInvestigation = null;
        if (shotTick !== this.lastCorrelatedShotTick) {
          this.lastCorrelatedShotTick = shotTick;
          this.correlatedGunshots += 1;
          runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'perception', 'Rifle report associated with the already confirmed hostile contact; no investigation movement or search scan was requested.', {
            shotTick,
            coarseTarget: { ...coarse },
            policy: 'corroboration_not_new_threat',
          });
        }
        return;
      }

      if (disposition === 'search_bias') {
        this.upsertSearchBiasContract(coarse, shotTick);
        if (shotTick !== this.lastSearchBiasShotTick) {
          this.lastSearchBiasShotTick = shotTick;
          this.searchBiasGunshots += 1;
          runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'perception', 'Rifle report matched the fresh lost-contact sector; it may bias the active search frontier but does not create investigation responders.', {
            shotTick,
            coarseTarget: { ...coarse },
            lastKnown: runtime.sharedLastKnownPosition === null ? null : { ...runtime.sharedLastKnownPosition },
            policy: 'same_contact_search_bias_only',
          });
        }
        return;
      }

      if (disposition === 'secondary_cue') {
        if (shotTick !== this.lastSecondaryShotTick) {
          this.lastSecondaryShotTick = shotTick;
          this.secondaryGunshots += 1;
          runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'perception', 'Rifle report conflicts with the current contact sector; retained as a secondary cue without pre-empting the committed threat.', {
            shotTick,
            coarseTarget: { ...coarse },
            lastKnown: runtime.sharedLastKnownPosition === null ? null : { ...runtime.sharedLastKnownPosition },
            policy: 'single_contact_reference_does_not_switch_threat_on_acoustic_only',
          });
        }
        return;
      }

      parentRegister(listenerId, perceivedPoint);
    };
  }

  private upsertSearchBiasContract(target: GridPoint, shotTick: number): void {
    const runtime = this.authorityInternals();
    const episodeId = runtime.acousticEpisodeId;
    const shots = Math.max(1, runtime.acousticShotsInEpisode);
    const expiresTick = runtime.logicalTick + (shots >= 2 ? SEARCH_BIAS_REPEATED_SHOT_TICKS : SEARCH_BIAS_SINGLE_SHOT_TICKS);
    const current = runtime.acousticInvestigation;
    if (current === null || current.episodeId !== episodeId || current._authorityMode !== 'search_bias') {
      runtime.acousticInvestigation = {
        episodeId,
        target: { ...target },
        firstShotTick: shotTick,
        lastShotTick: shotTick,
        shots,
        expiresTick,
        lastSampleTick: runtime.logicalTick,
        listeners: new Set<string>(),
        observationTargets: new Map<string, GridPoint>(),
        _authorityMode: 'search_bias',
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

  private installBodyAttentionSeparation(): void {
    const runtime = this.authorityInternals();
    const parentUpdate = runtime.updatePostureAndFacing.bind(this);
    runtime.updatePostureAndFacing = (member: HostMember): void => {
      const bodyBefore = { ...member.facing };
      parentUpdate(member);
      const sensorSuggestion = { ...member.facing };
      const attentionOwned = this.activeAttentionOwnsMember(member.id);

      if (member.targetVisible) {
        this.attentionFacing.set(member.id, directionTo(member.position, runtime.player));
        if (runtime.tactic === 'sweep' || attentionOwned) member.facing = this.resolveBodyFacing(member, bodyBefore);
        return;
      }

      if (attentionOwned && !this.recoveryOwnsMember(member.id)) {
        this.attentionFacing.set(member.id, sensorSuggestion);
        member.facing = this.resolveBodyFacing(member, bodyBefore);
        return;
      }

      this.attentionFacing.set(member.id, { ...member.facing });
    };

    const parentCanSee = runtime.canSeePlayer.bind(this);
    runtime.canSeePlayer = (member: HostMember): boolean => {
      if (parentCanSee(member)) return true;
      if (!this.memberAlive(member.id)) return false;
      const range = distance(member.position, runtime.player);
      if (range > runtime.visionRange) return false;
      if (!hasLineOfSight(tacticalWizardNavigationGrid, toCell(member.position), toCell(runtime.player))) return false;
      const sensor = normalize(this.attentionFacing.get(member.id) ?? member.facing);
      const targetDirection = directionTo(member.position, runtime.player);
      if (member.targetVisible) return angleDegrees(sensor, targetDirection) <= TRACKING_HALF_FOV;
      const halfFov = activeAttentionHalfFov(range);
      return halfFov !== null && this.activeAttentionOwnsMember(member.id) && angleDegrees(sensor, targetDirection) <= halfFov;
    };
  }

  private resolveBodyFacing(member: HostMember, fallback: GridPoint): GridPoint {
    const runtime = this.authorityInternals();
    if (runtime.alertState === 'active' && runtime.sharedLastKnownPosition !== null && isFireSupportPosture(member)) {
      return directionTo(member.position, runtime.sharedLastKnownPosition);
    }
    return normalize(fallback);
  }

  private activeAttentionOwnsMember(id: string): boolean {
    const runtime = this.authorityInternals();
    const contract = runtime.acousticInvestigation;
    const liveContract = contract !== null && runtime.logicalTick <= contract.expiresTick && contract._authorityMode !== 'search_bias' && contract.listeners.has(id);
    if (liveContract) return true;
    if (runtime.alertState !== 'active') return false;
    return runtime.tactic === 'sweep' || runtime.lostContactTicks > 0;
  }

  private installTacticalTransitionGuard(): void {
    const runtime = this.authorityInternals();
    const parentTransition = runtime.transitionTactic.bind(this);
    runtime.transitionTactic = (next: string, reason: string, rotateRoles: boolean): void => {
      const current = runtime.tactic;
      if (next === 'sweep') {
        const liveVisual = runtime.members.some((member) => this.memberAlive(member.id) && runtime.canSeePlayer(member));
        if (shouldProtectCommittedManeuver(current, runtime.lostContactTicks, liveVisual)) {
          runtime.tacticReason = liveVisual
            ? 'A live hostile is still visually confirmed; search cannot pre-empt direct combat.'
            : `The ${current} maneuver remains committed through a short LOS interruption; preserve the fresh LKP before escalating to sweep.`;
          if (runtime.logicalTick !== this.lastSuppressedSweepTick) {
            this.lastSuppressedSweepTick = runtime.logicalTick;
            this.suppressedSweepTransitions += 1;
            runtime.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'tactic', 'Sweep transition suppressed because a live visual or committed maneuver still owns execution.', {
              currentTactic: current,
              lostContactTicks: runtime.lostContactTicks,
              liveVisual,
              graceTicks: MANEUVER_CONTACT_GRACE_TICKS,
              rejectedReason: reason,
            });
          }
          return;
        }
      }

      const before = runtime.tactic;
      parentTransition(next, reason, rotateRoles);
      if (before !== runtime.tactic && next === 'sweep' && reason.includes('0.75 seconds')) this.actualFastSearchTransitions += 1;
      if (before !== runtime.tactic) this.logSupportContract(runtime.tactic);
    };
  }

  private installTacticalOpportunitySelection(): void {
    const runtime = this.authorityInternals();
    const parentUpdateDoctrine = runtime.updateDoctrine.bind(this);
    runtime.updateDoctrine = (visibility: ReadonlyMap<string, boolean>): void => {
      const visibleMembers = runtime.members.filter((member) => visibility.get(member.id) === true && this.memberAlive(member.id)).length;
      const nearestThreatDistance = runtime.sharedLastKnownPosition === null
        ? Number.POSITIVE_INFINITY
        : Math.min(...runtime.members.filter((member) => this.memberAlive(member.id)).map((member) => distance(member.position, runtime.sharedLastKnownPosition!)));
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
        this.tacticalOpportunityTransitions += 1;
        runtime.transitionTactic('flank', 'A completed bound has stable visual confirmation and a valid support lane; exploit the live geometry with a committed flank instead of waiting for a stationary-target timeout.', true);
        return;
      }
      if (opportunity === 'assault') {
        this.tacticalOpportunityTransitions += 1;
        runtime.transitionTactic('assault', 'Crossfire is physically established with at least one safe supporting lane and stable live contact; exploit the opening with a coordinated two-element assault.', true);
        return;
      }

      parentUpdateDoctrine(visibility);
    };
  }

  private installAssaultClosePressure(): void {
    const runtime = this.authorityInternals();
    const parentMovementTarget = runtime.movementTarget.bind(this);
    runtime.movementTarget = (member: HostMember): GridPoint | null => {
      const original = parentMovementTarget(member);
      if (runtime.alertState !== 'active' || runtime.tactic !== 'assault' || runtime.rescuePlan !== null) {
        if (runtime.tactic !== 'assault') this.closePressureAgentId = null;
        return original;
      }
      const reaction = runtime.reactions.get(member.id);
      if (reaction !== undefined && reaction.untilTick > runtime.logicalTick) return original;
      const owner = this.closePressureOwner();
      if (owner === null || owner.id !== member.id) return original;
      const range = distance(member.position, runtime.player);
      this.closePressureAgentId = owner.id;
      if (range <= 1.35 || range > ASSAULT_CLOSE_PRESSURE_RANGE) return original;
      const target = selectClosePressureTarget(member.position, runtime.player);
      if (target === null) return original;
      if (runtime.logicalTick !== this.lastClosePressureLogTick) {
        this.lastClosePressureLogTick = runtime.logicalTick;
        runtime.log('agent', member.id, member.label, 'plan', `${member.label} claimed the final close-pressure lane while the other assault element preserves spacing.`, {
          range: Number(range.toFixed(2)),
          target: { ...target },
          tactic: runtime.tactic,
          policy: 'single_close_pressure_claim',
        });
      }
      return target;
    };
  }

  private closePressureOwner(): HostMember | null {
    const runtime = this.authorityInternals();
    const candidates = runtime.members
      .filter((member) => member.role === 'assaulter' && member.targetVisible && this.memberAlive(member.id))
      .filter((member) => {
        const reaction = runtime.reactions.get(member.id);
        return reaction === undefined || reaction.untilTick <= runtime.logicalTick;
      })
      .sort((left, right) => distance(left.position, runtime.player) - distance(right.position, runtime.player) || left.id.localeCompare(right.id, 'en'));
    return candidates[0] ?? null;
  }

  private logSupportContract(tactic: string): void {
    const state = super.getState();
    const contracts = buildSupportContracts(state);
    if (contracts.length === 0) return;
    this.authorityInternals().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'roles', 'Fire-support contract attached to the active maneuver.', {
      tactic,
      contracts: contracts.map((contract) => `${contract.supporterId}->${contract.supportedAgentIds.join('+')}:${contract.purpose}`),
    });
  }

  private recoveryOwnsMember(id: string): boolean {
    const plan = this.authorityInternals().rescuePlan;
    return plan !== null && (plan.rescuerId === id || plan.covererId === id);
  }

  private memberAlive(id: string): boolean {
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
  if (
    input.currentTactic === 'bounding'
    && input.boundingPhase >= 1
    && input.planCompletion >= 1
    && input.tacticTicks >= 6
    && input.stableContactTicks >= 3
    && input.safeFireLanes >= 1
  ) return 'flank';
  if (
    input.currentTactic === 'crossfire'
    && input.planCompletion >= 1
    && input.tacticTicks >= 6
    && input.stableContactTicks >= 3
    && input.safeFireLanes >= 1
    && input.nearestThreatDistance <= 18
  ) return 'assault';
  return null;
}

export function selectClosePressureTarget(origin: GridPoint, player: GridPoint): GridPoint | null {
  const away = normalize({ x: origin.x - player.x, y: origin.y - player.y });
  for (const standOff of [CLOSE_PRESSURE_STANDOFF, 1.2, 1.35]) {
    const candidate = {
      x: player.x + away.x * standOff,
      y: player.y + away.y * standOff,
    };
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
