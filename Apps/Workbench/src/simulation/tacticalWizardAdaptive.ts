import type { GridPoint } from './navigation';
import {
  TacticalWizardSimulation,
  type GrenadeKind,
  type TacticalWizardSimulationState,
} from './tacticalWizardSimulation';
import { TacticalWizardDynamicCombatWorld, type DynamicCombatWorldView } from './dynamicCombatWorld';
import {
  choosePressureProposal,
  deterministicPressureRoll,
  leaseStillOwnsResponse,
  localEffectForBand,
  nextPressureBand,
  selectUnderFireReposition,
  type FirePressureBand,
  type PressureLocalEffect,
  type PressureResponseLease,
  type PressureTacticalAction,
} from './incomingFirePressure';
import {
  DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE,
  type TacticalWizardCombatProfile,
} from './tacticalWizardProfiles';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from './tacticalWizardTestMap';

export type { FirePressureBand, PressureTacticalAction } from './incomingFirePressure';

export interface AdaptiveAgentPressureView {
  readonly agentId: string;
  readonly pressure: number;
  readonly band: FirePressureBand;
  readonly incomingBearing: GridPoint | null;
  readonly localEffect: PressureLocalEffect;
}

export interface AdaptivePressureLeaseView {
  readonly id: string;
  readonly action: PressureTacticalAction;
  readonly pressuredAgentId: string;
  readonly maneuverAgentId: string | null;
  readonly supportAgentId: string | null;
  readonly origin: GridPoint | null;
  readonly target: GridPoint | null;
  readonly startedTick: number;
  readonly untilTick: number;
  readonly expectedTactic: string | null;
  readonly reason: string;
}

export interface TacticalWizardAdaptiveState extends TacticalWizardSimulationState {
  readonly adaptiveCombat: {
    readonly enemiesEnabled: boolean;
    readonly profile: TacticalWizardCombatProfile;
    readonly squadPressure: number;
    readonly pressureBand: FirePressureBand;
    readonly agentPressure: readonly AdaptiveAgentPressureView[];
    readonly tacticalAction: PressureTacticalAction;
    readonly tacticalActionReason: string | null;
    readonly tacticalActionUntilTick: number | null;
    readonly activeResponseLease: AdaptivePressureLeaseView | null;
    readonly pressureResponses: number;
    readonly pressureProposalsDeferredByLease: number;
    readonly pressureHardInvalidations: number;
    readonly formationHoldAgentIds: readonly string[];
    readonly formationCatchUpAgentIds: readonly string[];
  };
  readonly dynamicWorld: DynamicCombatWorldView;
}

interface InternalMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  facing: GridPoint;
  selectedIntent: string;
  role: string;
  task: string;
  tacticalTarget: GridPoint | null;
  coverSlot?: unknown;
  coverState?: string;
  searchLookTarget?: GridPoint | null;
  buddyRole?: string;
  opportunityPurpose?: string;
}

interface InternalHost {
  members: InternalMember[];
  logicalTick: number;
  motionFrame: number;
  alertState: 'idle' | 'pending' | 'active';
  tactic: string;
  patrolIndex: number;
  sharedLastKnownPosition: GridPoint | null;
  getPatrolTarget?: (member: InternalMember) => GridPoint;
  transitionTactic?: (next: string, reason: string, rotateRoles: boolean) => void;
  refreshTacticalPlan?: () => void;
  log: (...args: unknown[]) => void;
  pushEvent: (message: string) => void;
}

interface InternalRuntimeAccess {
  readonly tacticalHost: InternalHost;
  readonly contracts?: Map<string, unknown>;
  readonly recoveryPlan?: unknown;
  replanRecoveryGeometry?: (state: TacticalWizardSimulationState, reason: string, force: boolean) => void;
}

const FORMATION_ARRIVAL = 0.55;
const FORMATION_CATCH_UP_TICKS = 10;
const PRESSURE_DECAY_PER_SECOND = 0.14;
const PRESSURE_RESPONSE_COOLDOWN_TICKS = 6;
const PRESSURE_RESPONSE_LEASE_TICKS = 12;
const TRADE_FIRE_LEASE_TICKS = 6;
const REPOSITION_ARRIVAL = 0.75;

/**
 * Tactical Wizard game-first adaptive combat sandbox.
 *
 * Incoming-fire pressure is deliberately a proposal source, not a second execution
 * authority. It may request one bounded response lease; subsequent bullets can raise
 * pressure but cannot repeatedly rebuild squad geometry until the lease completes,
 * expires or is hard-invalidated.
 */
export class TacticalWizardAdaptiveSimulation {
  readonly stepSeconds: number;
  readonly agentMoveSpeed: number;

  private readonly simulation: TacticalWizardSimulation;
  private readonly world: TacticalWizardDynamicCombatWorld;
  private enemiesEnabled = true;
  private profile: TacticalWizardCombatProfile = { ...DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE };
  private readonly pressureByAgent = new Map<string, number>();
  private readonly pressureBandByAgent = new Map<string, FirePressureBand>();
  private readonly incomingBearingByAgent = new Map<string, GridPoint>();
  private readonly lastShotOriginByAgent = new Map<string, GridPoint>();
  private readonly formationHoldSince = new Map<string, number>();
  private readonly formationHoldIds = new Set<string>();
  private readonly formationCatchUpIds = new Set<string>();
  private squadBand: FirePressureBand = 'stable';
  private responseSerial = 0;
  private responseCooldownUntilTick = -999;
  private pressureResponses = 0;
  private pressureProposalsDeferredByLease = 0;
  private pressureHardInvalidations = 0;
  private lastPressureAction: PressureTacticalAction = 'none';
  private lastPressureActionReason: string | null = null;
  private activeResponse: PressureResponseLease | null = null;
  private lastLeaseEscalationBand: FirePressureBand = 'stable';

  constructor() {
    this.world = new TacticalWizardDynamicCombatWorld();
    this.simulation = new TacticalWizardSimulation();
    this.stepSeconds = this.simulation.stepSeconds;
    this.agentMoveSpeed = this.simulation.agentMoveSpeed;
    this.seedPressure(this.simulation.getState());
    this.applyFormationHold(this.simulation.getState());
  }

  getState(): TacticalWizardAdaptiveState {
    const state = this.simulation.getState();
    this.applyFormationHold(state);
    this.updatePressureBands(state);
    this.maintainPressureResponse(state);
    return this.decorate(this.simulation.getState());
  }

  reset(): TacticalWizardAdaptiveState {
    this.world.reset();
    this.simulation.reset();
    this.pressureByAgent.clear();
    this.pressureBandByAgent.clear();
    this.incomingBearingByAgent.clear();
    this.lastShotOriginByAgent.clear();
    this.formationHoldSince.clear();
    this.formationHoldIds.clear();
    this.formationCatchUpIds.clear();
    this.squadBand = 'stable';
    this.responseSerial = 0;
    this.responseCooldownUntilTick = -999;
    this.pressureResponses = 0;
    this.pressureProposalsDeferredByLease = 0;
    this.pressureHardInvalidations = 0;
    this.lastPressureAction = 'none';
    this.lastPressureActionReason = null;
    this.activeResponse = null;
    this.lastLeaseEscalationBand = 'stable';
    this.seedPressure(this.simulation.getState());
    this.applyFormationHold(this.simulation.getState());
    return this.getState();
  }

  step(): TacticalWizardAdaptiveState { return this.advance(this.stepSeconds); }

  advance(deltaSeconds: number): TacticalWizardAdaptiveState {
    const delta = Math.max(0, Math.min(1, deltaSeconds));
    this.decayPressure(delta);
    if (!this.enemiesEnabled) return this.getState();
    const beforeTick = this.simulation.getState().logicalTick;
    this.simulation.advance(delta);
    const state = this.simulation.getState();
    this.applyFormationHold(state);
    this.updatePressureBands(state);
    this.maintainPressureResponse(state);
    if (state.logicalTick !== beforeTick) this.evaluatePressureProposal(this.simulation.getState(), false);
    return this.getState();
  }

  emitNoise(): void { this.simulation.emitNoise(); }
  setPlayerPosition(point: GridPoint): boolean { return this.simulation.setPlayerPosition(point); }
  nudgePlayer(dx: number, dy: number): boolean { return this.simulation.nudgePlayer(dx, dy); }
  setPlayerAimTarget(point: GridPoint): boolean { return this.simulation.setPlayerAimTarget(point); }
  cyclePlayerGrenade(delta: number): GrenadeKind { return this.simulation.cyclePlayerGrenade(delta); }

  playerFireAt(point: GridPoint): boolean {
    const before = this.simulation.getState();
    const fired = this.simulation.playerFireAt(point);
    if (!fired) return false;
    const after = this.simulation.getState();
    this.registerIncomingFirePressure(before, after);
    const from = after.playerCombat.shotFrom;
    const to = after.playerCombat.shotTo;
    if (from !== null && to !== null) {
      const worldDamage = this.world.damageRay(from, to, 1);
      if (worldDamage.destroyed) this.invalidateWorldGeometry(worldDamage.point, 'rifle');
    }
    this.updatePressureBands(this.simulation.getState());
    this.maintainPressureResponse(this.simulation.getState());
    this.evaluatePressureProposal(this.simulation.getState(), true);
    return true;
  }

  playerThrowGrenadeAt(point: GridPoint): boolean {
    const kind = this.simulation.getState().playerCombat.selectedGrenade;
    const fired = this.simulation.playerThrowGrenadeAt(point);
    if (!fired) return false;
    if (kind === 'frag') {
      const results = this.world.damageBlast(point, 2.4, 1);
      if (results.some((entry) => entry.destroyed)) this.invalidateWorldGeometry(point, 'frag');
      this.registerBlastPressure(point, 2.8, 0.24);
    } else if (kind === 'flash') {
      this.registerBlastPressure(point, 3.2, 0.18);
    }
    this.updatePressureBands(this.simulation.getState());
    this.evaluatePressureProposal(this.simulation.getState(), true);
    return true;
  }

  setAgentEquipment(agentId: string, values: { readonly ammoRounds?: number; readonly grenades?: number }): boolean {
    return this.simulation.setAgentEquipment(agentId, values);
  }

  setAgentVitals(agentId: string, values: { readonly health?: number }): boolean {
    const changed = this.simulation.setAgentVitals(agentId, values);
    if (changed) this.maintainPressureResponse(this.simulation.getState());
    return changed;
  }

  applyGrenadeDoctrineForTest(kind: GrenadeKind, center: GridPoint, ownerId?: string): void {
    this.simulation.applyGrenadeDoctrineForTest(kind, center, ownerId);
  }

  injectIncomingFireForTest(agentId: string, from: GridPoint): boolean {
    const state = this.simulation.getState();
    const accepted = this.simulation.injectIncomingFireForTest(agentId, from);
    if (!accepted) return false;
    const agent = state.agents.find((entry) => entry.id === agentId);
    if (agent !== undefined) this.recordIncomingDirection(agentId, agent.position, from, 1);
    this.raisePressure(agentId, 0.42);
    this.updatePressureBands(this.simulation.getState());
    this.evaluatePressureProposal(this.simulation.getState(), true);
    return true;
  }

  setEnemiesEnabled(enabled: boolean): void {
    if (this.enemiesEnabled === enabled) return;
    this.enemiesEnabled = enabled;
    const host = this.internal().tacticalHost;
    host.pushEvent(`T${host.logicalTick}: combat sandbox enemies ${enabled ? 'enabled' : 'paused by test control'}.`);
    host.log('system', 'simulation', 'Combat Sandbox', 'session', enabled ? 'Enemy simulation enabled.' : 'Enemy simulation paused by sandbox control.', { enemiesEnabled: enabled });
  }

  setCombatProfile(profile: TacticalWizardCombatProfile): void {
    const normalized = normalizeProfile(profile);
    const changed = JSON.stringify(normalized) !== JSON.stringify(this.profile);
    this.profile = normalized;
    if (!changed) return;
    const host = this.internal().tacticalHost;
    this.updatePressureBands(this.simulation.getState());
    host.log('system', 'simulation', 'Combat Sandbox', 'session', 'Tactical Wizard combat profile applied to the sandbox.', {
      profileId: normalized.id,
      mindset: normalized.mindset,
      aggression: normalized.aggression,
      suppressionTolerance: normalized.suppressionTolerance,
      flankBias: normalized.flankBias,
      repositionBias: normalized.repositionBias,
      coordination: normalized.coordination,
      holdGroundBias: normalized.holdGroundBias,
      counterManeuverBias: normalized.counterManeuverBias,
      breakContactBias: normalized.breakContactBias,
    });
  }

  private decorate(base: TacticalWizardSimulationState): TacticalWizardAdaptiveState {
    const pressures = base.agents.map((agent) => ({
      agentId: agent.id,
      pressure: Number((this.pressureByAgent.get(agent.id) ?? 0).toFixed(3)),
      band: this.pressureBandByAgent.get(agent.id) ?? 'stable',
      incomingBearing: clonePoint(this.incomingBearingByAgent.get(agent.id) ?? null),
      localEffect: localEffectForBand(this.pressureBandByAgent.get(agent.id) ?? 'stable'),
    }));
    const squadPressure = this.squadPressure(base);
    return {
      ...base,
      adaptiveCombat: {
        enemiesEnabled: this.enemiesEnabled,
        profile: { ...this.profile },
        squadPressure: Number(squadPressure.toFixed(3)),
        pressureBand: this.squadBand,
        agentPressure: pressures,
        tacticalAction: this.activeResponse?.action ?? this.lastPressureAction,
        tacticalActionReason: this.activeResponse?.reason ?? this.lastPressureActionReason,
        tacticalActionUntilTick: this.activeResponse?.untilTick ?? null,
        activeResponseLease: this.activeResponse === null ? null : {
          id: this.activeResponse.id,
          action: this.activeResponse.action,
          pressuredAgentId: this.activeResponse.pressuredAgentId,
          maneuverAgentId: this.activeResponse.maneuverAgentId,
          supportAgentId: this.activeResponse.supportAgentId,
          origin: clonePoint(this.activeResponse.origin),
          target: clonePoint(this.activeResponse.target),
          startedTick: this.activeResponse.startedTick,
          untilTick: this.activeResponse.untilTick,
          expectedTactic: this.activeResponse.expectedTactic,
          reason: this.activeResponse.reason,
        },
        pressureResponses: this.pressureResponses,
        pressureProposalsDeferredByLease: this.pressureProposalsDeferredByLease,
        pressureHardInvalidations: this.pressureHardInvalidations,
        formationHoldAgentIds: [...this.formationHoldIds].sort(),
        formationCatchUpAgentIds: [...this.formationCatchUpIds].sort(),
      },
      dynamicWorld: this.world.view(),
    };
  }

  private seedPressure(state: TacticalWizardSimulationState): void {
    for (const agent of state.agents) {
      this.pressureByAgent.set(agent.id, 0);
      this.pressureBandByAgent.set(agent.id, 'stable');
    }
  }

  private decayPressure(deltaSeconds: number): void {
    const decay = PRESSURE_DECAY_PER_SECOND * deltaSeconds;
    for (const [id, pressure] of this.pressureByAgent) {
      const next = Math.max(0, pressure - decay);
      this.pressureByAgent.set(id, next);
      if (next < 0.12) {
        this.incomingBearingByAgent.delete(id);
        this.lastShotOriginByAgent.delete(id);
      }
    }
    this.updatePressureBands(this.simulation.getState());
  }

  private updatePressureBands(state: TacticalWizardSimulationState): void {
    for (const agent of state.agents) {
      const previous = this.pressureBandByAgent.get(agent.id) ?? 'stable';
      const next = agent.alive
        ? nextPressureBand(previous, this.pressureByAgent.get(agent.id) ?? 0, this.profile.suppressionTolerance)
        : 'stable';
      this.pressureBandByAgent.set(agent.id, next);
    }
    this.squadBand = nextPressureBand(this.squadBand, this.squadPressure(state), this.profile.suppressionTolerance);
  }

  private registerIncomingFirePressure(before: TacticalWizardSimulationState, after: TacticalWizardSimulationState): void {
    const from = after.playerCombat.shotFrom;
    const to = after.playerCombat.shotTo;
    if (from === null || to === null) return;
    const beforeById = new Map(before.agents.map((agent) => [agent.id, agent]));
    for (const agent of after.agents) {
      if (!agent.alive && !beforeById.get(agent.id)?.alive) continue;
      const previous = beforeById.get(agent.id);
      const hit = previous !== undefined && agent.health < previous.health;
      const missDistance = pointSegmentDistance(agent.position, from, to);
      let amount = hit ? 0.56 : missDistance <= 0.8 ? 0.32 : missDistance <= 1.6 ? 0.2 : missDistance <= 3 ? 0.09 : 0;
      if (amount <= 0) continue;
      if (agent.coverState === 'covered') amount *= 0.68;
      if (agent.targetVisible) amount += 0.035;
      amount += Math.min(0.08, after.playerCombat.firePressure * 0.06);
      this.raisePressure(agent.id, amount);
      this.recordIncomingDirection(agent.id, agent.position, from, amount);
    }
  }

  private registerBlastPressure(center: GridPoint, radius: number, amount: number): void {
    const state = this.simulation.getState();
    for (const agent of state.agents) {
      if (!agent.alive) continue;
      const range = distance(agent.position, center);
      if (range > radius) continue;
      const applied = amount * (1 - range / Math.max(radius * 1.4, 0.01));
      this.raisePressure(agent.id, applied);
      this.recordIncomingDirection(agent.id, agent.position, center, applied);
    }
  }

  private recordIncomingDirection(agentId: string, agentPosition: GridPoint, source: GridPoint, weight: number): void {
    const sample = normalizedDelta(agentPosition, source);
    const previous = this.incomingBearingByAgent.get(agentId);
    const blend = previous === undefined
      ? sample
      : normalizedDelta({ x: 0, y: 0 }, { x: previous.x * 0.68 + sample.x * Math.max(0.2, weight), y: previous.y * 0.68 + sample.y * Math.max(0.2, weight) });
    this.incomingBearingByAgent.set(agentId, blend);
    this.lastShotOriginByAgent.set(agentId, { ...source });
  }

  private raisePressure(agentId: string, amount: number): void {
    this.pressureByAgent.set(agentId, clamp01((this.pressureByAgent.get(agentId) ?? 0) + Math.max(0, amount)));
  }

  private squadPressure(state: TacticalWizardSimulationState): number {
    const living = state.agents.filter((agent) => agent.alive);
    if (living.length === 0) return 0;
    const values = living.map((agent) => this.pressureByAgent.get(agent.id) ?? 0);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const maximum = Math.max(...values);
    return clamp01(maximum * 0.58 + average * 0.42);
  }

  private evaluatePressureProposal(state: TacticalWizardSimulationState, fromShot: boolean): void {
    if (!this.enemiesEnabled || state.squad.alertState !== 'active' || state.recovery.phase !== 'none') return;
    const host = this.internal().tacticalHost;
    const tick = host.logicalTick;
    if (this.activeResponse !== null && leaseStillOwnsResponse(this.activeResponse, tick)) {
      if (fromShot) this.pressureProposalsDeferredByLease += 1;
      this.logLeaseEscalationIfNeeded(state);
      return;
    }
    if (this.activeResponse !== null) this.releasePressureResponse('lease_expired', false);
    if (tick < this.responseCooldownUntilTick) return;

    const living = state.agents.filter((agent) => agent.alive);
    if (living.length === 0) return;
    const pressured = living
      .map((agent) => ({ agent, pressure: this.pressureByAgent.get(agent.id) ?? 0, band: this.pressureBandByAgent.get(agent.id) ?? 'stable' }))
      .filter((entry) => entry.band === 'suppressed' || entry.band === 'pinned')
      .sort((a, b) => b.pressure - a.pressure || a.agent.id.localeCompare(b.agent.id));
    if (pressured.length === 0) return;

    const primary = pressured[0]!;
    const pressure = this.squadPressure(state);
    const roll = deterministicPressureRoll(this.profile.id, tick, this.responseSerial + pressured.length);
    const proposal = choosePressureProposal({
      band: primary.band,
      pressure,
      pressuredAgentId: primary.agent.id,
      livingCount: living.length,
      pressuredCount: pressured.length,
      currentTactic: host.tactic,
      profile: this.profile,
      roll,
    });
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Incoming-fire pressure submitted one tactical response proposal to the active-plan lease gate.', {
      pressure: Number(pressure.toFixed(3)),
      band: primary.band,
      action: proposal.action,
      pressuredAgentId: proposal.pressuredAgentId,
      currentTactic: host.tactic,
      activeLease: null,
      source: fromShot ? 'shot_evidence' : 'pressure_tick',
    });
    this.commitPressureProposal(state, proposal.action, proposal.pressuredAgentId, proposal.reason);
  }

  private commitPressureProposal(state: TacticalWizardSimulationState, action: PressureTacticalAction, pressuredAgentId: string, reason: string): void {
    const host = this.internal().tacticalHost;
    const tick = host.logicalTick;
    const pressured = state.agents.find((agent) => agent.id === pressuredAgentId && agent.alive);
    if (pressured === undefined) return;
    const living = state.agents.filter((agent) => agent.alive);
    const stableManeuver = living
      .filter((agent) => agent.id !== pressuredAgentId)
      .sort((a, b) => (this.pressureByAgent.get(a.id) ?? 0) - (this.pressureByAgent.get(b.id) ?? 0) || a.id.localeCompare(b.id))[0] ?? pressured;
    let maneuverAgentId: string | null = null;
    let supportAgentId: string | null = null;
    let target: GridPoint | null = null;
    let origin: GridPoint | null = null;
    let expectedTactic: string | null = host.tactic;

    if (action === 'reposition') {
      const threatOrigin = this.lastShotOriginByAgent.get(pressuredAgentId) ?? state.player;
      const candidate = selectUnderFireReposition(
        tacticalWizardNavigationGrid,
        pressured.position,
        threatOrigin,
        living.filter((agent) => agent.id !== pressuredAgentId).map((agent) => agent.position),
      );
      if (candidate === null) {
        action = living.length >= 2 ? 'regroup' : 'trade_fire';
      } else {
        maneuverAgentId = pressuredAgentId;
        supportAgentId = stableManeuver.id === pressuredAgentId ? null : stableManeuver.id;
        origin = { ...pressured.position };
        target = { ...candidate.point };
        expectedTactic = host.tactic;
      }
    }

    if (action === 'flank') {
      maneuverAgentId = stableManeuver.id;
      supportAgentId = living.find((agent) => agent.id !== maneuverAgentId && agent.alive)?.id ?? null;
      host.transitionTactic?.('flank', reason, false);
      const member = host.members.find((entry) => entry.id === maneuverAgentId);
      if (member !== undefined) {
        member.role = 'flanker';
        member.task = 'flank_to_cover';
        target = clonePoint(member.tacticalTarget);
        origin = { ...member.position };
      }
      expectedTactic = 'flank';
    } else if (action === 'regroup') {
      host.transitionTactic?.('regroup', reason, false);
      expectedTactic = 'regroup';
    } else if (action === 'assault') {
      host.transitionTactic?.('assault', reason, false);
      expectedTactic = 'assault';
    }

    const duration = action === 'trade_fire' ? TRADE_FIRE_LEASE_TICKS : PRESSURE_RESPONSE_LEASE_TICKS;
    const lease: PressureResponseLease = {
      id: `pressure-${++this.responseSerial}`,
      action,
      pressuredAgentId,
      maneuverAgentId,
      supportAgentId,
      origin,
      target,
      startedTick: tick,
      untilTick: tick + duration,
      startedPressure: this.squadPressure(state),
      startedBand: this.pressureBandByAgent.get(pressuredAgentId) ?? 'suppressed',
      expectedTactic,
      worldRevision: this.world.view().geometryRevision,
      reason,
    };
    this.activeResponse = lease;
    this.lastLeaseEscalationBand = lease.startedBand;
    this.lastPressureAction = action;
    this.lastPressureActionReason = reason;
    this.pressureResponses += 1;
    this.responseCooldownUntilTick = lease.untilTick + PRESSURE_RESPONSE_COOLDOWN_TICKS;
    this.applyLeaseGeometry(lease);
    host.pushEvent(`T${tick}: incoming-fire response committed ${action} as ${lease.id} until T${lease.untilTick}.`);
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Incoming-fire response lease committed; ordinary shots may raise pressure but cannot replace its geometry.', {
      leaseId: lease.id,
      action: lease.action,
      pressuredAgentId: lease.pressuredAgentId,
      maneuverAgentId: lease.maneuverAgentId,
      supportAgentId: lease.supportAgentId,
      origin: lease.origin,
      target: lease.target,
      startedTick: lease.startedTick,
      untilTick: lease.untilTick,
      expectedTactic: lease.expectedTactic,
      worldRevision: lease.worldRevision,
    });
  }

  private maintainPressureResponse(state: TacticalWizardSimulationState): void {
    const lease = this.activeResponse;
    if (lease === null) return;
    const host = this.internal().tacticalHost;
    if (state.recovery.phase !== 'none') {
      this.releasePressureResponse('recovery_preempted', true);
      return;
    }
    const ownerAlive = state.agents.some((agent) => agent.id === lease.pressuredAgentId && agent.alive);
    const maneuverAlive = lease.maneuverAgentId === null || state.agents.some((agent) => agent.id === lease.maneuverAgentId && agent.alive);
    if (!ownerAlive || !maneuverAlive) {
      this.releasePressureResponse('assigned_member_unavailable', true);
      return;
    }
    if (lease.target !== null && !isTargetWalkable(lease.target)) {
      this.releasePressureResponse('response_geometry_invalid', true);
      return;
    }
    if (lease.worldRevision !== this.world.view().geometryRevision) {
      this.releasePressureResponse('world_geometry_changed', true);
      return;
    }
    if (lease.expectedTactic === 'flank' && host.tactic !== 'flank') {
      if (host.tactic === 'crossfire' || host.tactic === 'assault') this.releasePressureResponse('flank_completed_into_followup', false);
      else this.releasePressureResponse('base_tactic_invalidated_flank', true);
      return;
    }
    if (lease.expectedTactic === 'regroup' && host.tactic !== 'regroup') {
      this.releasePressureResponse('regroup_completed_or_reseeded', false);
      return;
    }
    if (lease.expectedTactic === 'assault' && host.tactic !== 'assault') {
      this.releasePressureResponse('assault_completed_or_replanned', false);
      return;
    }
    if (lease.action === 'reposition' && lease.maneuverAgentId !== null && lease.target !== null) {
      const agent = state.agents.find((entry) => entry.id === lease.maneuverAgentId);
      if (agent !== undefined && distance(agent.position, lease.target) <= REPOSITION_ARRIVAL) {
        this.releasePressureResponse('reposition_completed', false);
        return;
      }
    }
    if (!leaseStillOwnsResponse(lease, host.logicalTick)) {
      this.releasePressureResponse('lease_expired', false);
      return;
    }
    this.applyLeaseGeometry(lease);
  }

  private applyLeaseGeometry(lease: PressureResponseLease): void {
    const host = this.internal().tacticalHost;
    if (lease.action === 'reposition' && lease.maneuverAgentId !== null && lease.target !== null) {
      const member = host.members.find((entry) => entry.id === lease.maneuverAgentId);
      if (member !== undefined) {
        member.selectedIntent = 'reposition_under_fire';
        member.role = 'support';
        member.task = 'regroup';
        member.tacticalTarget = { ...lease.target };
        member.coverSlot = null;
        member.coverState = 'moving';
        member.opportunityPurpose = 'none';
      }
      return;
    }
    if (lease.action === 'flank' && lease.maneuverAgentId !== null) {
      const flanker = host.members.find((entry) => entry.id === lease.maneuverAgentId);
      if (flanker !== undefined) {
        flanker.role = 'flanker';
        flanker.task = 'flank_to_cover';
        if (lease.target !== null) flanker.tacticalTarget = { ...lease.target };
        flanker.opportunityPurpose = 'flank';
      }
    }
  }

  private releasePressureResponse(reason: string, hardInvalidation: boolean): void {
    const lease = this.activeResponse;
    if (lease === null) return;
    const host = this.internal().tacticalHost;
    if (hardInvalidation) this.pressureHardInvalidations += 1;
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Incoming-fire response lease released.', {
      leaseId: lease.id,
      action: lease.action,
      reason,
      hardInvalidation,
      heldTicks: Math.max(0, host.logicalTick - lease.startedTick),
      pressureNow: Number(this.squadPressure(this.simulation.getState()).toFixed(3)),
    });
    this.activeResponse = null;
    this.lastLeaseEscalationBand = 'stable';
    if (lease.action === 'reposition' && host.alertState === 'active') host.refreshTacticalPlan?.();
  }

  private logLeaseEscalationIfNeeded(state: TacticalWizardSimulationState): void {
    const lease = this.activeResponse;
    if (lease === null) return;
    const band = this.pressureBandByAgent.get(lease.pressuredAgentId) ?? 'stable';
    if (band !== 'pinned' || this.lastLeaseEscalationBand === 'pinned') return;
    this.lastLeaseEscalationBand = 'pinned';
    this.internal().tacticalHost.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'alert', 'Incoming fire escalated the active response to pinned pressure without replacing its lease.', {
      leaseId: lease.id,
      action: lease.action,
      pressuredAgentId: lease.pressuredAgentId,
      pressure: Number((this.pressureByAgent.get(lease.pressuredAgentId) ?? 0).toFixed(3)),
      band,
      leaseUntilTick: lease.untilTick,
    });
  }

  private applyFormationHold(state: TacticalWizardSimulationState): void {
    const host = this.internal().tacticalHost;
    this.formationHoldIds.clear();
    this.formationCatchUpIds.clear();
    if (host.alertState !== 'idle' || typeof host.getPatrolTarget !== 'function') {
      this.formationHoldSince.clear();
      return;
    }
    const livingIds = new Set(state.agents.filter((agent) => agent.alive).map((agent) => agent.id));
    const livingMembers = host.members.filter((member) => livingIds.has(member.id));
    if (livingMembers.length === 0) return;

    for (const member of livingMembers) {
      member.role = 'patrol';
      member.task = 'patrol';
      member.tacticalTarget = null;
      member.coverSlot = null;
      member.coverState = 'none';
      member.buddyRole = 'none';
      member.opportunityPurpose = 'none';
    }

    const targets = new Map(livingMembers.map((member) => [member.id, host.getPatrolTarget!(member)]));
    const arrived = livingMembers.filter((member) => distance(member.position, targets.get(member.id)!) <= FORMATION_ARRIVAL);
    if (arrived.length === livingMembers.length) {
      this.formationHoldSince.clear();
      return;
    }
    const lagging = livingMembers
      .filter((member) => !arrived.includes(member))
      .sort((left, right) => distance(right.position, targets.get(right.id)!) - distance(left.position, targets.get(left.id)!));
    const longestHold = Math.max(0, ...arrived.map((member) => host.logicalTick - (this.formationHoldSince.get(member.id) ?? host.logicalTick)));

    for (const [index, member] of arrived.entries()) {
      const started = this.formationHoldSince.get(member.id) ?? host.logicalTick;
      if (!this.formationHoldSince.has(member.id)) {
        this.formationHoldSince.set(member.id, started);
        host.log('agent', member.id, member.label, 'decision', `${member.label} entered formation hold while the patrol element closes distance.`, { patrolIndex: host.patrolIndex, reason: 'arrived_before_squad' });
      }
      this.formationHoldIds.add(member.id);
      member.selectedIntent = 'formation_hold';
      const nextPatrol = tacticalWizardTestMap.patrolPoints[(host.patrolIndex + 1) % tacticalWizardTestMap.patrolPoints.length] ?? member.position;
      const lagger = lagging[index % Math.max(1, lagging.length)] ?? lagging[0];
      const phase = Math.floor((host.motionFrame + index * 19) / 24) % 3;
      const anchor = phase === 1 && lagger !== undefined ? lagger.position : nextPatrol;
      const offset = phase === 0 ? -42 : phase === 2 ? 42 : 0;
      const look = offsetLook(member.position, anchor, offset, 5.5);
      member.searchLookTarget = look;
      member.facing = normalizedDelta(member.position, look);
    }

    for (const member of lagging) {
      this.formationHoldSince.delete(member.id);
      if (longestHold < FORMATION_CATCH_UP_TICKS) continue;
      this.formationCatchUpIds.add(member.id);
      member.selectedIntent = 'formation_catch_up';
      member.searchLookTarget = targets.get(member.id) ?? null;
    }
  }

  private invalidateWorldGeometry(point: GridPoint | null, source: string): void {
    const internal = this.internal();
    const host = internal.tacticalHost;
    internal.contracts?.clear();
    if (this.activeResponse !== null) this.releasePressureResponse('world_geometry_changed', true);
    if (host.alertState === 'active' && host.sharedLastKnownPosition !== null) host.refreshTacticalPlan?.();
    if (internal.recoveryPlan !== undefined && internal.recoveryPlan !== null && typeof internal.replanRecoveryGeometry === 'function') {
      internal.replanRecoveryGeometry(this.simulation.getState(), 'world_geometry_changed', true);
    }
    host.pushEvent(`T${host.logicalTick}: destructible cover changed navigation / LOS geometry.`);
    host.log('system', 'simulation', 'Combat Sandbox', 'plan', 'World geometry revision invalidated cached tactical positions.', {
      source,
      point: point === null ? null : { ...point },
      geometryRevision: this.world.view().geometryRevision,
      nextPolicy: 'requery_navigation_los_cover_recovery_pressure_response',
    });
  }

  private internal(): InternalRuntimeAccess { return this.simulation as unknown as InternalRuntimeAccess; }
}

function normalizeProfile(profile: TacticalWizardCombatProfile): TacticalWizardCombatProfile {
  return {
    ...profile,
    aggression: clamp01(profile.aggression),
    suppressionTolerance: clamp01(profile.suppressionTolerance),
    flankBias: clamp01(profile.flankBias),
    repositionBias: clamp01(profile.repositionBias),
    coordination: clamp01(profile.coordination),
    holdGroundBias: clamp01(profile.holdGroundBias),
    counterManeuverBias: clamp01(profile.counterManeuverBias),
    breakContactBias: clamp01(profile.breakContactBias),
  };
}

function pointSegmentDistance(point: GridPoint, start: GridPoint, end: GridPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
}

function normalizedDelta(from: GridPoint, to: GridPoint): GridPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length <= 1e-6 ? { x: 1, y: 0 } : { x: dx / length, y: dy / length };
}

function offsetLook(from: GridPoint, anchor: GridPoint, degrees: number, range: number): GridPoint {
  const direction = normalizedDelta(from, anchor);
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotated = { x: direction.x * cos - direction.y * sin, y: direction.x * sin + direction.y * cos };
  return { x: from.x + rotated.x * range, y: from.y + rotated.y * range };
}

function clonePoint(point: GridPoint | null): GridPoint | null { return point === null ? null : { ...point }; }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function distance(a: GridPoint, b: GridPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function isTargetWalkable(point: GridPoint): boolean {
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  return x >= 0 && y >= 0 && x < tacticalWizardNavigationGrid.width && y < tacticalWizardNavigationGrid.height && !tacticalWizardNavigationGrid.blocked.has(`${x},${y}`);
}
