import type { GridPoint } from './navigation';
import {
  TacticalWizardSimulation,
  type GrenadeKind,
  type TacticalWizardSimulationState,
} from './tacticalWizardSimulation';
import { TacticalWizardDynamicCombatWorld, type DynamicCombatWorldView } from './dynamicCombatWorld';
import {
  DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE,
  type TacticalWizardCombatProfile,
} from './tacticalWizardProfiles';
import { tacticalWizardTestMap } from './tacticalWizardTestMap';

export type FirePressureBand = 'stable' | 'pressured' | 'suppressed' | 'pinned';
export type PressureTacticalAction = 'none' | 'trade_fire' | 'reposition' | 'flank' | 'regroup' | 'assault';

export interface AdaptiveAgentPressureView {
  readonly agentId: string;
  readonly pressure: number;
  readonly band: FirePressureBand;
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
    readonly pressureResponses: number;
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
  rotateRoleOrder?: () => void;
  applyRoles?: () => void;
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
const PRESSURE_RESPONSE_COOLDOWN_TICKS = 9;
const PRESSURE_RESPONSE_LEASE_TICKS = 8;
const FORCED_RESPONSE_SHOT_GAP = 3;

/**
 * Tactical Wizard production-sandbox adapter for the next vertical slice.
 *
 * It deliberately composes the stable TacticalWizardSimulation rather than
 * creating another Vxx inheritance layer. The adapter adds four game-driven
 * concerns around the validated fixed hierarchy: formation-hold presentation,
 * incoming-fire pressure as a tactical fact, data-authored combat profiles, and
 * a destructible grid world that mutates the same navigation/LOS authority.
 */
export class TacticalWizardAdaptiveSimulation {
  readonly stepSeconds: number;
  readonly agentMoveSpeed: number;

  private readonly simulation: TacticalWizardSimulation;
  private readonly world: TacticalWizardDynamicCombatWorld;
  private enemiesEnabled = true;
  private profile: TacticalWizardCombatProfile = { ...DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE };
  private readonly pressureByAgent = new Map<string, number>();
  private readonly formationHoldSince = new Map<string, number>();
  private readonly formationHoldIds = new Set<string>();
  private readonly formationCatchUpIds = new Set<string>();
  private responseSerial = 0;
  private shotSerial = 0;
  private lastResponseShotSerial = -999;
  private responseCooldownUntilTick = -999;
  private responseLeaseUntilTick = -999;
  private pressureResponses = 0;
  private lastPressureAction: PressureTacticalAction = 'none';
  private lastPressureActionReason: string | null = null;

  constructor() {
    this.world = new TacticalWizardDynamicCombatWorld();
    this.simulation = new TacticalWizardSimulation();
    this.stepSeconds = this.simulation.stepSeconds;
    this.agentMoveSpeed = this.simulation.agentMoveSpeed;
    this.seedPressure(this.simulation.getState());
    this.applyFormationHold(this.simulation.getState());
  }

  getState(): TacticalWizardAdaptiveState {
    this.applyFormationHold(this.simulation.getState());
    return this.decorate(this.simulation.getState());
  }

  reset(): TacticalWizardAdaptiveState {
    this.world.reset();
    this.simulation.reset();
    this.pressureByAgent.clear();
    this.formationHoldSince.clear();
    this.formationHoldIds.clear();
    this.formationCatchUpIds.clear();
    this.responseSerial = 0;
    this.shotSerial = 0;
    this.lastResponseShotSerial = -999;
    this.responseCooldownUntilTick = -999;
    this.responseLeaseUntilTick = -999;
    this.pressureResponses = 0;
    this.lastPressureAction = 'none';
    this.lastPressureActionReason = null;
    this.seedPressure(this.simulation.getState());
    this.applyFormationHold(this.simulation.getState());
    return this.getState();
  }

  step(): TacticalWizardAdaptiveState {
    return this.advance(this.stepSeconds);
  }

  advance(deltaSeconds: number): TacticalWizardAdaptiveState {
    const delta = Math.max(0, Math.min(1, deltaSeconds));
    this.decayPressure(delta);
    if (!this.enemiesEnabled) return this.getState();
    const beforeTick = this.simulation.getState().logicalTick;
    this.simulation.advance(delta);
    const state = this.simulation.getState();
    this.applyFormationHold(state);
    if (state.logicalTick !== beforeTick) this.applyPressureTacticalChoice(state, false);
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
    this.shotSerial += 1;
    const after = this.simulation.getState();
    this.registerIncomingFirePressure(before, after);
    const from = after.playerCombat.shotFrom;
    const to = after.playerCombat.shotTo;
    if (from !== null && to !== null) {
      const worldDamage = this.world.damageRay(from, to, 1);
      if (worldDamage.destroyed) this.invalidateWorldGeometry(worldDamage.point, 'rifle');
    }
    this.applyPressureTacticalChoice(this.simulation.getState(), true);
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
    this.applyPressureTacticalChoice(this.simulation.getState(), true);
    return true;
  }

  setAgentEquipment(agentId: string, values: { readonly ammoRounds?: number; readonly grenades?: number }): boolean {
    return this.simulation.setAgentEquipment(agentId, values);
  }

  setAgentVitals(agentId: string, values: { readonly health?: number }): boolean {
    return this.simulation.setAgentVitals(agentId, values);
  }

  applyGrenadeDoctrineForTest(kind: GrenadeKind, center: GridPoint, ownerId?: string): void {
    this.simulation.applyGrenadeDoctrineForTest(kind, center, ownerId);
  }

  injectIncomingFireForTest(agentId: string, from: GridPoint): boolean {
    const accepted = this.simulation.injectIncomingFireForTest(agentId, from);
    if (accepted) this.raisePressure(agentId, 0.42);
    return accepted;
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
    const changed = normalized.id !== this.profile.id
      || normalized.aggression !== this.profile.aggression
      || normalized.suppressionTolerance !== this.profile.suppressionTolerance
      || normalized.flankBias !== this.profile.flankBias
      || normalized.repositionBias !== this.profile.repositionBias
      || normalized.coordination !== this.profile.coordination
      || normalized.mindset !== this.profile.mindset;
    this.profile = normalized;
    if (!changed) return;
    const host = this.internal().tacticalHost;
    host.log('system', 'simulation', 'Combat Sandbox', 'session', 'Tactical Wizard combat profile applied to the sandbox.', {
      profileId: normalized.id,
      mindset: normalized.mindset,
      aggression: normalized.aggression,
      suppressionTolerance: normalized.suppressionTolerance,
      flankBias: normalized.flankBias,
      repositionBias: normalized.repositionBias,
      coordination: normalized.coordination,
    });
  }

  private decorate(base: TacticalWizardSimulationState): TacticalWizardAdaptiveState {
    const pressures = base.agents.map((agent) => ({
      agentId: agent.id,
      pressure: Number((this.pressureByAgent.get(agent.id) ?? 0).toFixed(3)),
      band: this.pressureBand(this.pressureByAgent.get(agent.id) ?? 0),
    }));
    const squadPressure = this.squadPressure(base);
    return {
      ...base,
      adaptiveCombat: {
        enemiesEnabled: this.enemiesEnabled,
        profile: { ...this.profile },
        squadPressure: Number(squadPressure.toFixed(3)),
        pressureBand: this.pressureBand(squadPressure),
        agentPressure: pressures,
        tacticalAction: this.lastPressureAction,
        tacticalActionReason: this.lastPressureActionReason,
        tacticalActionUntilTick: this.responseLeaseUntilTick >= base.logicalTick ? this.responseLeaseUntilTick : null,
        pressureResponses: this.pressureResponses,
        formationHoldAgentIds: [...this.formationHoldIds].sort(),
        formationCatchUpAgentIds: [...this.formationCatchUpIds].sort(),
      },
      dynamicWorld: this.world.view(),
    };
  }

  private seedPressure(state: TacticalWizardSimulationState): void {
    for (const agent of state.agents) this.pressureByAgent.set(agent.id, 0);
  }

  private decayPressure(deltaSeconds: number): void {
    const decay = PRESSURE_DECAY_PER_SECOND * deltaSeconds;
    for (const [id, pressure] of this.pressureByAgent) this.pressureByAgent.set(id, Math.max(0, pressure - decay));
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
    }
  }

  private registerBlastPressure(center: GridPoint, radius: number, amount: number): void {
    const state = this.simulation.getState();
    for (const agent of state.agents) {
      if (!agent.alive) continue;
      const range = distance(agent.position, center);
      if (range > radius) continue;
      this.raisePressure(agent.id, amount * (1 - range / Math.max(radius * 1.4, 0.01)));
    }
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
    return clamp01(maximum * 0.68 + average * 0.32);
  }

  private pressureBand(pressure: number): FirePressureBand {
    const pressed = 0.22 + this.profile.suppressionTolerance * 0.08;
    const suppressed = 0.46 + this.profile.suppressionTolerance * 0.18;
    const pinned = 0.7 + this.profile.suppressionTolerance * 0.17;
    if (pressure >= pinned) return 'pinned';
    if (pressure >= suppressed) return 'suppressed';
    if (pressure >= pressed) return 'pressured';
    return 'stable';
  }

  private applyPressureTacticalChoice(state: TacticalWizardSimulationState, fromShot: boolean): void {
    if (!this.enemiesEnabled || state.squad.alertState !== 'active' || state.recovery.phase !== 'none') return;
    const pressure = this.squadPressure(state);
    const band = this.pressureBand(pressure);
    if (band === 'stable' || band === 'pressured') return;
    const host = this.internal().tacticalHost;
    const tick = host.logicalTick;
    const forceByVolume = fromShot && this.shotSerial - this.lastResponseShotSerial >= FORCED_RESPONSE_SHOT_GAP;
    if (!forceByVolume && tick < this.responseCooldownUntilTick) return;

    const living = state.agents.filter((agent) => agent.alive).length;
    const roll = deterministicUnit(`${this.profile.id}:${this.profile.mindset}`, tick, this.responseSerial + this.shotSerial);
    let action = this.selectPressureAction(band, living, roll, forceByVolume);
    if (host.tactic === 'assault' && band === 'pinned' && this.profile.mindset === 'tactical_human' && this.profile.suppressionTolerance < 0.8) {
      action = this.profile.flankBias >= 0.45 && living >= 2 ? 'flank' : 'reposition';
    }

    const reason = pressureReason(action, band, pressure, this.profile);
    const changed = this.executePressureAction(host, action, reason, living);
    this.responseSerial += 1;
    this.lastResponseShotSerial = this.shotSerial;
    this.responseCooldownUntilTick = tick + (action === 'trade_fire' ? 3 : PRESSURE_RESPONSE_COOLDOWN_TICKS);
    this.responseLeaseUntilTick = tick + (action === 'trade_fire' ? 2 : PRESSURE_RESPONSE_LEASE_TICKS);
    this.lastPressureAction = action;
    this.lastPressureActionReason = reason;
    if (changed || action === 'trade_fire') {
      this.pressureResponses += 1;
      host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Incoming-fire pressure produced a bounded tactical choice.', {
        pressure: Number(pressure.toFixed(3)),
        band,
        action,
        profileId: this.profile.id,
        mindset: this.profile.mindset,
        forcedByFireVolume: forceByVolume,
        responseLeaseUntilTick: this.responseLeaseUntilTick,
      });
    }
  }

  private selectPressureAction(band: FirePressureBand, living: number, roll: number, forceByVolume: boolean): PressureTacticalAction {
    if (this.profile.mindset === 'feral') {
      if (living <= 1) return 'assault';
      if (band === 'pinned' && roll < this.profile.flankBias) return 'flank';
      return roll < this.profile.aggression ? 'assault' : 'flank';
    }
    if (this.profile.mindset === 'machine') {
      if (!forceByVolume && roll < this.profile.suppressionTolerance * 0.72) return 'trade_fire';
      return roll < this.profile.repositionBias ? 'reposition' : living >= 2 ? 'flank' : 'trade_fire';
    }

    const tradeChance = this.profile.aggression * this.profile.suppressionTolerance * (band === 'pinned' ? 0.18 : 0.34);
    if (!forceByVolume && roll < tradeChance) return 'trade_fire';
    if (living >= 2 && roll < tradeChance + this.profile.flankBias * 0.52) return 'flank';
    if (roll < tradeChance + this.profile.flankBias * 0.52 + this.profile.repositionBias * 0.32) return 'reposition';
    return band === 'pinned' ? 'regroup' : 'reposition';
  }

  private executePressureAction(host: InternalHost, action: PressureTacticalAction, reason: string, living: number): boolean {
    if (action === 'trade_fire' || action === 'none') return false;
    if (action === 'reposition') {
      host.rotateRoleOrder?.();
      host.applyRoles?.();
      host.refreshTacticalPlan?.();
      host.pushEvent(`T${host.logicalTick}: incoming fire forced a role handoff and firing-position change.`);
      return true;
    }
    const target = action === 'flank'
      ? (living >= 2 ? 'flank' : 'bounding')
      : action === 'regroup'
        ? 'regroup'
        : action === 'assault'
          ? 'assault'
          : host.tactic;
    if (target === host.tactic) {
      host.rotateRoleOrder?.();
      host.applyRoles?.();
      host.refreshTacticalPlan?.();
      return true;
    }
    host.transitionTactic?.(target, reason, action === 'flank' || action === 'regroup');
    return true;
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
    if (host.alertState === 'active' && host.sharedLastKnownPosition !== null) host.refreshTacticalPlan?.();
    if (internal.recoveryPlan !== undefined && internal.recoveryPlan !== null && typeof internal.replanRecoveryGeometry === 'function') {
      internal.replanRecoveryGeometry(this.simulation.getState(), 'world_geometry_changed', true);
    }
    host.pushEvent(`T${host.logicalTick}: destructible cover changed navigation / LOS geometry.`);
    host.log('system', 'simulation', 'Combat Sandbox', 'plan', 'World geometry revision invalidated cached tactical positions.', {
      source,
      point: point === null ? null : { ...point },
      geometryRevision: this.world.view().geometryRevision,
      nextPolicy: 'requery_navigation_los_cover_recovery',
    });
  }

  private internal(): InternalRuntimeAccess {
    return this.simulation as unknown as InternalRuntimeAccess;
  }
}

function normalizeProfile(profile: TacticalWizardCombatProfile): TacticalWizardCombatProfile {
  return {
    ...profile,
    aggression: clamp01(profile.aggression),
    suppressionTolerance: clamp01(profile.suppressionTolerance),
    flankBias: clamp01(profile.flankBias),
    repositionBias: clamp01(profile.repositionBias),
    coordination: clamp01(profile.coordination),
  };
}

function pressureReason(action: PressureTacticalAction, band: FirePressureBand, pressure: number, profile: TacticalWizardCombatProfile): string {
  const level = `${band} incoming-fire pressure ${pressure.toFixed(2)}`;
  if (action === 'trade_fire') return `${level}; ${profile.id} accepts the current exchange for a short lease instead of reflexively abandoning position.`;
  if (action === 'flank') return `${level}; one element fixes the shooter while another leaves the saturated firing line and seeks a flank.`;
  if (action === 'reposition') return `${level}; current exposure is no longer worth holding, so roles rotate and the squad selects fresh firing geometry.`;
  if (action === 'regroup') return `${level}; the squad cannot profitably keep trading from this geometry and contracts to a safer mutual-support position.`;
  if (action === 'assault') return `${level}; ${profile.mindset} converts pressure into aggressive closing / encirclement instead of human-style suppression withdrawal.`;
  return level;
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

function deterministicUnit(id: string, a: number, b: number): number {
  let hash = 2166136261;
  const source = `${id}:${a}:${b}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function distance(a: GridPoint, b: GridPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
