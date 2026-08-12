import { findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid } from './tacticalWizardTestMapV7';
import type { RunLogCategory, RunLogEvent, RunLogValue } from './tacticalWizardSimulationV3';
import {
  TacticalWizardSimulation as TacticalWizardSimulationV8,
  tacticalWizardTestMap,
  type BuddyRole,
  type CommandRank,
  type CoverState,
  type GrenadeKind,
  type GrenadeVisual,
  type LocomotionMode,
  type LogisticsTask,
  type SimulationOverlaySettings,
  type SpecialAction,
  type SupplyCacheKind,
  type SupplyCacheView,
  type TacticalOpportunityPurpose,
  type TacticalTask,
  type TacticalWizardAgentView as TacticalWizardAgentViewV8,
  type TacticalWizardSimulationState as TacticalWizardSimulationStateV8,
} from './tacticalWizardSimulationV8';

export type {
  BuddyRole,
  CommandRank,
  CoverState,
  GrenadeKind,
  GrenadeVisual,
  LocomotionMode,
  LogisticsTask,
  SimulationOverlaySettings,
  SpecialAction,
  SupplyCacheKind,
  SupplyCacheView,
  TacticalOpportunityPurpose,
  TacticalTask,
};
export { tacticalWizardTestMap };

export type CombatReaction =
  | 'none'
  | 'dodge'
  | 'stunned'
  | 'flash_push'
  | 'smoke_retreat'
  | 'smoke_reposition'
  | 'grenade_suppress'
  | 'downed';

export type GrenadeTacticalEffect = 'none' | 'flash_push' | 'smoke_retreat' | 'frag_suppression';

export interface TacticalWizardAgentView extends TacticalWizardAgentViewV8 {
  readonly health: number;
  readonly maxHealth: number;
  readonly moveSpeed: number;
  readonly alive: boolean;
  readonly reactionState: CombatReaction;
  readonly reactionTarget: GridPoint | null;
  readonly reactionTicks: number;
  readonly aimThreatSeconds: number;
}

export interface PlayerCombatView {
  readonly facing: GridPoint;
  readonly aimTarget: GridPoint;
  readonly selectedGrenade: GrenadeKind;
  readonly grenadeInventory: Readonly<Record<GrenadeKind, number>>;
  readonly shotPulse: number;
  readonly shotFrom: GridPoint | null;
  readonly shotTo: GridPoint | null;
  readonly shotsRecent: number;
  readonly firePressure: number;
}

export interface TacticalEffectView {
  readonly kind: GrenadeTacticalEffect;
  readonly sourceGrenadeId: number | null;
  readonly center: GridPoint | null;
  readonly untilTick: number | null;
  readonly remainingTicks: number;
}

export interface TacticalWizardSimulationState extends Omit<TacticalWizardSimulationStateV8, 'agents' | 'grenadeEvents'> {
  readonly agents: readonly TacticalWizardAgentView[];
  readonly grenadeEvents: readonly GrenadeVisual[];
  readonly playerCombat: PlayerCombatView;
  readonly tacticalEffect: TacticalEffectView;
}

interface MutableVitals {
  health: number;
  readonly maxHealth: number;
  readonly moveSpeed: number;
}

interface MutableReaction {
  readonly kind: CombatReaction;
  readonly target: GridPoint | null;
  readonly source: string;
  readonly untilTick: number;
}

type MutablePlayerGrenade = Omit<GrenadeVisual, 'remainingFrames'> & {
  remainingFrames: number;
  detonated: boolean;
};

interface HostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  facing: GridPoint;
  grenadeCount: number;
  firePulse: number;
  targetVisible: boolean;
  task: TacticalTask;
  role: string;
  tacticalTarget: GridPoint | null;
}

interface HostAccess {
  members: HostMember[];
  logicalTick: number;
  motionFrame: number;
  pendingNoiseIntensity: number;
  alertState: 'idle' | 'pending' | 'active';
  suppressorId: string | null;
  moverId: string | null;
  observerId: string | null;
  movementTarget: (member: HostMember) => GridPoint | null;
  tryFire: (member: HostMember, target: GridPoint, reason: string) => void;
  tryGrenade: (member: HostMember) => boolean;
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
}

const PLAYER_WEAPON_RANGE = 22;
const PLAYER_DAMAGE = 28;
const PLAYER_HIT_RADIUS = 0.58;
const PLAYER_NEAR_MISS_RADIUS = 1.35;
const PLAYER_GRENADE_RANGE = 11;
const PLAYER_GRENADE_COUNT = 3;
const PLAYER_GRENADE_FLIGHT_FRAMES = 18;
const PLAYER_GRENADE_TOTAL_FRAMES = 72;
const PLAYER_FLASH_RADIUS = 3.25;
const PLAYER_FRAG_RADIUS = 2.55;
const PLAYER_SMOKE_RADIUS = 3.3;
const FIRE_PRESSURE_WINDOW_TICKS = 8;
const AIM_DWELL_SECONDS = 0.55;
const AIM_DWELL_UNDER_FIRE_SECONDS = 0.22;
const DODGE_TICKS = 6;
const DODGE_COOLDOWN_TICKS = 12;
const FLASH_STUN_TICKS = 9;
const FLASH_PUSH_TICKS = 14;
const SMOKE_RESPONSE_TICKS = 16;
const FRAG_HOLD_TICKS = 7;
const DEFAULT_AGENT_HEALTH = 100;
const DEFAULT_AGENT_MOVE_SPEED = 4.8;
const REACTION_PRIORITY: Readonly<Record<CombatReaction, number>> = {
  none: 0,
  grenade_suppress: 20,
  flash_push: 30,
  smoke_reposition: 40,
  dodge: 50,
  smoke_retreat: 60,
  stunned: 80,
  downed: 100,
};
const GRENADE_ORDER: readonly GrenadeKind[] = ['flash', 'frag', 'smoke'];

/**
 * V9 is a Host-owned reactive combat layer around V8.
 *
 * The long-lived squad plan remains V8/V7. Aim, weapon traces, damage, smoke,
 * grenade follow-up and evasive movement are short-lived Host facts that may
 * temporarily override a member's movement/action target and then return it to
 * the existing plan. Portable Core therefore remains free of geometry, weapon
 * simulation and browser-input concerns.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationV8 {
  private vitals = new Map<string, MutableVitals>();
  private reactions = new Map<string, MutableReaction>();
  private dodgeCooldownUntil = new Map<string, number>();
  private aimThreatSeconds = new Map<string, number>();
  private playerFacing: GridPoint = { x: -1, y: 0 };
  private playerAimTarget: GridPoint = { x: tacticalWizardTestMap.playerStart.x - 4, y: tacticalWizardTestMap.playerStart.y };
  private selectedGrenadeIndex = 0;
  private playerGrenades: MutablePlayerGrenade[] = [];
  private playerGrenadeInventory: Record<GrenadeKind, number> = { flash: PLAYER_GRENADE_COUNT, frag: PLAYER_GRENADE_COUNT, smoke: PLAYER_GRENADE_COUNT };
  private playerGrenadeSequence = 10000;
  private playerShotPulse = 0;
  private playerShotFrom: GridPoint | null = null;
  private playerShotTo: GridPoint | null = null;
  private recentPlayerShotTicks: number[] = [];
  private processedAiGrenadeDetonations = new Set<string>();
  private tacticalEffectKind: GrenadeTacticalEffect = 'none';
  private tacticalEffectSourceGrenadeId: number | null = null;
  private tacticalEffectCenter: GridPoint | null = null;
  private tacticalEffectUntilTick: number | null = null;

  constructor() {
    super();
    this.initializeVitals();
    this.installReactiveHooks();
    const host = this.hostAccess();
    host.pushEvent('V9: reactive grenade follow-ups, player weapon controls, health and threat-aware dodge enabled.');
    host.log('system', 'simulation', 'Volition Simulation', 'session', 'V9 reactive combat layer enabled.', {
      playerDamage: PLAYER_DAMAGE,
      playerWeaponRange: PLAYER_WEAPON_RANGE,
      agentHealth: DEFAULT_AGENT_HEALTH,
      agentMoveSpeed: DEFAULT_AGENT_MOVE_SPEED,
    });
  }

  override reset(): TacticalWizardSimulationState {
    super.reset();
    this.reactions.clear();
    this.dodgeCooldownUntil.clear();
    this.aimThreatSeconds.clear();
    this.initializeVitals();
    this.playerFacing = { x: -1, y: 0 };
    this.playerAimTarget = { x: tacticalWizardTestMap.playerStart.x - 4, y: tacticalWizardTestMap.playerStart.y };
    this.selectedGrenadeIndex = 0;
    this.playerGrenades = [];
    this.playerGrenadeInventory = { flash: PLAYER_GRENADE_COUNT, frag: PLAYER_GRENADE_COUNT, smoke: PLAYER_GRENADE_COUNT };
    this.playerGrenadeSequence = 10000;
    this.playerShotPulse = 0;
    this.playerShotFrom = null;
    this.playerShotTo = null;
    this.recentPlayerShotTicks = [];
    this.processedAiGrenadeDetonations.clear();
    this.clearTacticalEffect();
    this.hostAccess().pushEvent('V9: reactive combat state reset.');
    return this.getState();
  }

  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    const delta = Math.max(0, Math.min(1, deltaSeconds));
    this.updatePlayerAimThreat(delta);
    super.advance(delta);
    this.advancePlayerCombatVisuals(delta);
    this.observeAiGrenadeDetonations();
    this.cleanupExpiredReactions();
    this.pruneShotPressure();
    if (this.tacticalEffectUntilTick !== null && this.hostAccess().logicalTick >= this.tacticalEffectUntilTick) this.clearTacticalEffect();
    return this.getState();
  }

  override getState(): TacticalWizardSimulationState {
    const base = super.getState();
    const tick = base.logicalTick;
    return {
      ...base,
      agents: base.agents.map((agent): TacticalWizardAgentView => {
        const vitals = this.vitals.get(agent.id) ?? { health: DEFAULT_AGENT_HEALTH, maxHealth: DEFAULT_AGENT_HEALTH, moveSpeed: DEFAULT_AGENT_MOVE_SPEED };
        const reaction = this.activeReaction(agent.id, tick);
        return {
          ...agent,
          health: vitals.health,
          maxHealth: vitals.maxHealth,
          moveSpeed: vitals.moveSpeed,
          alive: vitals.health > 0,
          reactionState: reaction?.kind ?? 'none',
          reactionTarget: reaction?.target ?? null,
          reactionTicks: reaction === null ? 0 : Math.max(0, reaction.untilTick - tick),
          aimThreatSeconds: Number((this.aimThreatSeconds.get(agent.id) ?? 0).toFixed(2)),
        };
      }),
      grenadeEvents: [...base.grenadeEvents, ...this.playerGrenades.map(({ detonated: _detonated, ...grenade }) => ({ ...grenade }))],
      playerCombat: {
        facing: { ...this.playerFacing },
        aimTarget: { ...this.playerAimTarget },
        selectedGrenade: GRENADE_ORDER[this.selectedGrenadeIndex]!,
        grenadeInventory: { ...this.playerGrenadeInventory },
        shotPulse: this.playerShotPulse,
        shotFrom: this.playerShotFrom === null ? null : { ...this.playerShotFrom },
        shotTo: this.playerShotTo === null ? null : { ...this.playerShotTo },
        shotsRecent: this.recentPlayerShotTicks.length,
        firePressure: this.firePressure(),
      },
      tacticalEffect: {
        kind: this.tacticalEffectKind,
        sourceGrenadeId: this.tacticalEffectSourceGrenadeId,
        center: this.tacticalEffectCenter === null ? null : { ...this.tacticalEffectCenter },
        untilTick: this.tacticalEffectUntilTick,
        remainingTicks: this.tacticalEffectUntilTick === null ? 0 : Math.max(0, this.tacticalEffectUntilTick - tick),
      },
    };
  }

  setPlayerAimTarget(point: GridPoint): boolean {
    const player = super.getState().player;
    const target = clampWorldPoint(point);
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    if (Math.hypot(dx, dy) < 0.05) return false;
    const nextFacing = normalize({ x: dx, y: dy });
    const changed = distance(target, this.playerAimTarget) > 0.02 || vectorDot(nextFacing, this.playerFacing) < 0.9999;
    this.playerAimTarget = target;
    this.playerFacing = nextFacing;
    return changed;
  }

  playerFireAt(point: GridPoint): boolean {
    this.setPlayerAimTarget(point);
    const state = super.getState();
    const origin = state.player;
    const rayEnd = clampWorldPoint({
      x: origin.x + this.playerFacing.x * PLAYER_WEAPON_RANGE,
      y: origin.y + this.playerFacing.y * PLAYER_WEAPON_RANGE,
    });
    this.playerShotPulse = 7;
    this.playerShotFrom = { ...origin };
    this.playerShotTo = { ...rayEnd };
    this.recentPlayerShotTicks.push(state.logicalTick);
    this.pruneShotPressure();

    const host = this.hostAccess();
    host.pendingNoiseIntensity = Math.max(host.pendingNoiseIntensity, 1);
    const candidates = state.agents
      .filter((agent) => (this.vitals.get(agent.id)?.health ?? 0) > 0)
      .map((agent) => ({ agent, sample: pointToSegment(agent.position, origin, rayEnd) }))
      .filter(({ agent, sample }) => sample.t >= 0 && sample.t <= 1 && sample.distance <= PLAYER_NEAR_MISS_RADIUS && hasWorldLos(origin, agent.position))
      .sort((left, right) => left.sample.t - right.sample.t || left.sample.distance - right.sample.distance);

    const hit = candidates.find((entry) => entry.sample.distance <= PLAYER_HIT_RADIUS) ?? null;
    if (hit !== null) {
      this.playerShotTo = { ...hit.agent.position };
      this.damageAgent(hit.agent.id, PLAYER_DAMAGE, 'player_rifle');
    }
    for (const { agent } of candidates) {
      if ((this.vitals.get(agent.id)?.health ?? 0) <= 0) continue;
      this.triggerDodge(agent.id, hit?.agent.id === agent.id ? 'player_hit' : 'player_near_miss');
    }

    host.pushEvent(`T${state.logicalTick}: player fired ${hit === null ? 'a near/suppression shot' : `and hit ${hit.agent.label}`}.`);
    host.log('player', 'player', 'Player', 'fire', hit === null ? 'Player fired; nearby agents evaluated suppression / dodge response.' : `Player hit ${hit.agent.label}.`, {
      from: { ...origin },
      to: { ...(this.playerShotTo ?? rayEnd) },
      hitAgentId: hit?.agent.id ?? null,
      damage: hit === null ? 0 : PLAYER_DAMAGE,
      shotsRecent: this.recentPlayerShotTicks.length,
      firePressure: this.firePressure(),
    });
    return true;
  }

  cyclePlayerGrenade(delta: number): GrenadeKind {
    const direction = delta >= 0 ? 1 : -1;
    this.selectedGrenadeIndex = (this.selectedGrenadeIndex + direction + GRENADE_ORDER.length) % GRENADE_ORDER.length;
    const selected = GRENADE_ORDER[this.selectedGrenadeIndex]!;
    this.hostAccess().log('player', 'player', 'Player', 'plan', `Player selected ${selected} grenade.`, { selectedGrenade: selected });
    return selected;
  }

  playerThrowGrenadeAt(point: GridPoint): boolean {
    const kind = GRENADE_ORDER[this.selectedGrenadeIndex]!;
    if (this.playerGrenadeInventory[kind] <= 0) return false;
    this.setPlayerAimTarget(point);
    const state = super.getState();
    const origin = state.player;
    const requested = clampWorldPoint(point);
    const dx = requested.x - origin.x;
    const dy = requested.y - origin.y;
    const range = Math.hypot(dx, dy);
    if (range < 0.25) return false;
    const scale = Math.min(1, PLAYER_GRENADE_RANGE / range);
    const target = clampWorldPoint({ x: origin.x + dx * scale, y: origin.y + dy * scale });
    const radius = kind === 'flash' ? PLAYER_FLASH_RADIUS : kind === 'frag' ? PLAYER_FRAG_RADIUS : PLAYER_SMOKE_RADIUS;
    const grenade: MutablePlayerGrenade = {
      id: this.playerGrenadeSequence++,
      ownerId: 'player',
      kind,
      from: { ...origin },
      to: { ...target },
      radius,
      remainingFrames: PLAYER_GRENADE_TOTAL_FRAMES,
      totalFrames: PLAYER_GRENADE_TOTAL_FRAMES,
      flightFrames: PLAYER_GRENADE_FLIGHT_FRAMES,
      detonated: false,
    };
    this.playerGrenades.push(grenade);
    this.playerGrenadeInventory[kind] -= 1;
    const host = this.hostAccess();
    host.pendingNoiseIntensity = Math.max(host.pendingNoiseIntensity, 0.85);
    host.pushEvent(`T${state.logicalTick}: player threw ${kind} grenade.`);
    host.log('player', 'player', 'Player', 'fire', `Player threw ${kind} grenade.`, {
      grenadeId: grenade.id,
      grenadeKind: kind,
      target: { ...target },
      remaining: this.playerGrenadeInventory[kind],
    });
    return true;
  }

  /** Scenario/debug hook. Movement speed is currently the real V7 Host speed. */
  setAgentVitals(agentId: string, values: { readonly health?: number }): boolean {
    const current = this.vitals.get(agentId);
    if (current === undefined) return false;
    if (values.health !== undefined) current.health = Math.max(0, Math.min(current.maxHealth, Math.round(values.health)));
    if (current.health <= 0) this.setReaction(agentId, { kind: 'downed', target: this.memberById(agentId)?.position ?? null, source: 'debug', untilTick: Number.MAX_SAFE_INTEGER }, true);
    return true;
  }

  /** Regression/scenario hook for validating linked AI grenade follow-up. */
  applyGrenadeDoctrineForTest(kind: GrenadeKind, center: GridPoint, ownerId = 'twr:rifle-squad:alpha'): void {
    this.applyAiGrenadeDoctrine({
      id: 900000 + this.hostAccess().logicalTick,
      ownerId,
      kind,
      from: this.memberById(ownerId)?.position ?? center,
      to: center,
      radius: kind === 'flash' ? 2.8 : kind === 'smoke' ? 3.1 : 2.35,
      remainingFrames: 40,
      totalFrames: 72,
      flightFrames: 18,
    });
  }

  private installReactiveHooks(): void {
    const host = this.hostAccess();
    const originalMovementTarget = host.movementTarget.bind(this);
    host.movementTarget = (member: HostMember): GridPoint | null => {
      const reaction = this.activeReaction(member.id, host.logicalTick);
      if (reaction !== null) {
        if (reaction.kind === 'downed' || reaction.kind === 'stunned' || reaction.kind === 'grenade_suppress') return reaction.target ?? member.position;
        if (reaction.target !== null) return reaction.target;
      }
      return originalMovementTarget(member);
    };

    const originalTryFire = host.tryFire.bind(this);
    host.tryFire = (member: HostMember, target: GridPoint, reason: string): void => {
      const vitals = this.vitals.get(member.id);
      const reaction = this.activeReaction(member.id, host.logicalTick);
      if (vitals !== undefined && vitals.health <= 0) return;
      if (reaction?.kind === 'stunned' || reaction?.kind === 'downed') return;
      if (this.segmentObscuredBySmoke(member.position, target)) {
        host.log('agent', member.id, member.label, 'fire', `${member.label} withheld fire because smoke obscures the firing lane.`, {
          blocked: true,
          reason: 'smoke_obscured',
          task: member.task,
          reaction: reaction?.kind ?? 'none',
        });
        return;
      }
      originalTryFire(member, target, reason);
    };

    const originalTryGrenade = host.tryGrenade.bind(this);
    host.tryGrenade = (member: HostMember): boolean => {
      const vitals = this.vitals.get(member.id);
      const reaction = this.activeReaction(member.id, host.logicalTick);
      if (vitals !== undefined && vitals.health <= 0) return false;
      if (reaction?.kind === 'stunned' || reaction?.kind === 'downed' || reaction?.kind === 'smoke_retreat') return false;
      return originalTryGrenade(member);
    };
  }

  private initializeVitals(): void {
    this.vitals = new Map(this.hostAccess().members.map((member) => [member.id, {
      health: DEFAULT_AGENT_HEALTH,
      maxHealth: DEFAULT_AGENT_HEALTH,
      moveSpeed: DEFAULT_AGENT_MOVE_SPEED,
    }]));
  }

  private updatePlayerAimThreat(deltaSeconds: number): void {
    if (deltaSeconds <= 0) return;
    const state = super.getState();
    const underFire = this.firePressure() >= 0.6;
    const threshold = underFire ? AIM_DWELL_UNDER_FIRE_SECONDS : AIM_DWELL_SECONDS;
    for (const agent of state.agents) {
      if ((this.vitals.get(agent.id)?.health ?? 0) <= 0) continue;
      const aimed = this.isPlayerAimingAt(agent.position) && hasWorldLos(state.player, agent.position);
      const previous = this.aimThreatSeconds.get(agent.id) ?? 0;
      const next = aimed ? previous + deltaSeconds : Math.max(0, previous - deltaSeconds * 2.5);
      this.aimThreatSeconds.set(agent.id, next);
      if (!aimed || next < threshold) continue;
      if ((this.dodgeCooldownUntil.get(agent.id) ?? -1) > state.logicalTick) continue;
      const reaction = this.activeReaction(agent.id, state.logicalTick);
      if (reaction !== null && REACTION_PRIORITY[reaction.kind] > REACTION_PRIORITY.dodge) continue;
      this.triggerDodge(agent.id, underFire ? 'aim_dwell_under_fire' : 'aim_dwell');
      this.aimThreatSeconds.set(agent.id, 0);
    }
  }

  private triggerDodge(agentId: string, source: string): void {
    const state = super.getState();
    if ((this.dodgeCooldownUntil.get(agentId) ?? -1) > state.logicalTick) return;
    const agent = state.agents.find((entry) => entry.id === agentId);
    if (agent === undefined || (this.vitals.get(agentId)?.health ?? 0) <= 0) return;
    const target = selectDodgePoint(agent.position, state.player, state.agents.map((entry) => entry.position));
    if (target === null) return;
    const duration = this.firePressure() >= 0.75 ? DODGE_TICKS + 2 : DODGE_TICKS;
    this.setReaction(agentId, { kind: 'dodge', target, source, untilTick: state.logicalTick + duration });
    this.dodgeCooldownUntil.set(agentId, state.logicalTick + DODGE_COOLDOWN_TICKS);
    const host = this.hostAccess();
    host.pushEvent(`T${state.logicalTick}: ${agent.label} dodges the player's aim / fire line.`);
    host.log('agent', agent.id, agent.label, 'move', `${agent.label} initiated threat-aware dodge.`, {
      reaction: 'dodge',
      source,
      target: { ...target },
      firePressure: this.firePressure(),
    });
  }

  private damageAgent(agentId: string, damage: number, source: string): void {
    const vitals = this.vitals.get(agentId);
    const member = this.memberById(agentId);
    if (vitals === undefined || member === undefined || vitals.health <= 0) return;
    vitals.health = Math.max(0, vitals.health - Math.max(0, Math.round(damage)));
    const host = this.hostAccess();
    host.log('agent', member.id, member.label, 'perception', `${member.label} took damage from ${source}.`, {
      damage,
      health: vitals.health,
      maxHealth: vitals.maxHealth,
      source,
    });
    if (vitals.health > 0) return;
    this.setReaction(member.id, { kind: 'downed', target: member.position, source, untilTick: Number.MAX_SAFE_INTEGER }, true);
    this.reassignRolesAfterDowned(member.id);
    host.pushEvent(`T${host.logicalTick}: ${member.label} is down; remaining squad replans.`);
  }

  private reassignRolesAfterDowned(downedId: string): void {
    const host = this.hostAccess();
    if (host.alertState !== 'active') return;
    const alive = host.members
      .filter((member) => member.id !== downedId && (this.vitals.get(member.id)?.health ?? 0) > 0)
      .map((member) => member.id);
    if (alive.length === 0) return;
    if (host.suppressorId === downedId || host.suppressorId === null || !alive.includes(host.suppressorId)) host.suppressorId = alive[0] ?? null;
    if (host.moverId === downedId || host.moverId === null || !alive.includes(host.moverId)) host.moverId = alive.find((id) => id !== host.suppressorId) ?? null;
    if (host.observerId === downedId || (host.observerId !== null && !alive.includes(host.observerId))) host.observerId = alive.find((id) => id !== host.suppressorId && id !== host.moverId) ?? null;
    host.applyRoles();
    host.refreshTacticalPlan();
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'roles', 'Squad roles replanned after a member was downed.', {
      downedId,
      suppressorId: host.suppressorId,
      moverId: host.moverId,
      observerId: host.observerId,
    });
  }

  private advancePlayerCombatVisuals(deltaSeconds: number): void {
    const frames = Math.max(0, Math.round(deltaSeconds * 30));
    this.playerShotPulse = Math.max(0, this.playerShotPulse - frames);
    if (this.playerShotPulse === 0) {
      this.playerShotFrom = null;
      this.playerShotTo = null;
    }
    if (frames === 0) return;

    const next: MutablePlayerGrenade[] = [];
    for (const grenade of this.playerGrenades) {
      const updated: MutablePlayerGrenade = { ...grenade, remainingFrames: Math.max(0, grenade.remainingFrames - frames) };
      const age = updated.totalFrames - updated.remainingFrames;
      if (!updated.detonated && age >= updated.flightFrames) {
        updated.detonated = true;
        this.applyPlayerGrenadeDetonation(updated);
      }
      if (updated.remainingFrames > 0) next.push(updated);
    }
    this.playerGrenades = next;
  }

  private applyPlayerGrenadeDetonation(grenade: MutablePlayerGrenade): void {
    const state = super.getState();
    const host = this.hostAccess();
    host.pendingNoiseIntensity = Math.max(host.pendingNoiseIntensity, grenade.kind === 'smoke' ? 0.7 : 1);

    if (grenade.kind === 'flash') {
      for (const agent of state.agents) {
        if ((this.vitals.get(agent.id)?.health ?? 0) <= 0) continue;
        const range = distance(agent.position, grenade.to);
        if (range > grenade.radius || !hasWorldLos(grenade.to, agent.position)) continue;
        const duration = Math.max(4, Math.round(FLASH_STUN_TICKS * (1 - range / Math.max(grenade.radius, 0.1) * 0.45)));
        this.setReaction(agent.id, { kind: 'stunned', target: agent.position, source: 'player_flash', untilTick: state.logicalTick + duration }, true);
        host.log('agent', agent.id, agent.label, 'perception', `${agent.label} was stunned by the player's flash grenade.`, {
          reaction: 'stunned',
          durationTicks: duration,
          range: Number(range.toFixed(2)),
        });
      }
    } else if (grenade.kind === 'frag') {
      for (const agent of state.agents) {
        if ((this.vitals.get(agent.id)?.health ?? 0) <= 0) continue;
        const range = distance(agent.position, grenade.to);
        if (range > grenade.radius) continue;
        const damage = Math.round(18 + 52 * (1 - range / Math.max(grenade.radius, 0.1)));
        this.damageAgent(agent.id, damage, 'player_frag');
        if ((this.vitals.get(agent.id)?.health ?? 0) > 0) this.triggerDodge(agent.id, 'player_frag_blast');
      }
    } else {
      for (const agent of state.agents) {
        if ((this.vitals.get(agent.id)?.health ?? 0) <= 0) continue;
        if (!this.smokeAffectsLine(grenade.to, grenade.radius, agent.position, state.player)) continue;
        const target = selectRetreatPoint(agent.position, grenade.to, state.agents.map((entry) => entry.position));
        this.setReaction(agent.id, { kind: 'smoke_reposition', target, source: 'player_smoke', untilTick: state.logicalTick + SMOKE_RESPONSE_TICKS });
      }
    }
    host.pushEvent(`T${state.logicalTick}: player ${grenade.kind} grenade detonated; AI reaction context updated.`);
  }

  private observeAiGrenadeDetonations(): void {
    const state = super.getState();
    for (const grenade of state.grenadeEvents) {
      const age = grenade.totalFrames - grenade.remainingFrames;
      if (age < grenade.flightFrames) continue;
      const key = `${grenade.ownerId}:${grenade.id}`;
      if (this.processedAiGrenadeDetonations.has(key)) continue;
      this.processedAiGrenadeDetonations.add(key);
      this.applyAiGrenadeDoctrine(grenade);
    }
  }

  private applyAiGrenadeDoctrine(grenade: GrenadeVisual): void {
    const state = super.getState();
    const host = this.hostAccess();
    const aliveAgents = state.agents.filter((agent) => (this.vitals.get(agent.id)?.health ?? 0) > 0);

    if (grenade.kind === 'flash') {
      this.setTacticalEffect('flash_push', grenade, state.logicalTick + FLASH_PUSH_TICKS);
      const pushers = aliveAgents.filter((agent) => agent.id !== state.squad.suppressorId).slice(0, 2);
      for (const agent of pushers) {
        const target = selectApproachPoint(agent.position, grenade.to, aliveAgents.map((entry) => entry.position));
        this.setReaction(agent.id, { kind: 'flash_push', target, source: `ai_flash:${grenade.id}`, untilTick: state.logicalTick + FLASH_PUSH_TICKS });
      }
      host.pushEvent(`T${state.logicalTick}: flash window opened; maneuver members close while base-of-fire remains available.`);
    } else if (grenade.kind === 'smoke') {
      this.setTacticalEffect('smoke_retreat', grenade, state.logicalTick + SMOKE_RESPONSE_TICKS);
      for (const agent of aliveAgents) {
        const target = selectRetreatPoint(agent.position, grenade.to, aliveAgents.map((entry) => entry.position));
        this.setReaction(agent.id, { kind: 'smoke_retreat', target, source: `ai_smoke:${grenade.id}`, untilTick: state.logicalTick + SMOKE_RESPONSE_TICKS });
      }
      host.pushEvent(`T${state.logicalTick}: smoke window opened; squad disengages / repositions instead of charging through its own screen.`);
    } else {
      this.setTacticalEffect('frag_suppression', grenade, state.logicalTick + FRAG_HOLD_TICKS);
      for (const agent of aliveAgents) {
        if (agent.id === state.squad.suppressorId) continue;
        this.setReaction(agent.id, { kind: 'grenade_suppress', target: agent.position, source: `ai_frag:${grenade.id}`, untilTick: state.logicalTick + FRAG_HOLD_TICKS });
      }
      host.pushEvent(`T${state.logicalTick}: frag suppression window; movers hold outside the blast before resuming the plan.`);
    }

    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', `Grenade follow-up doctrine committed for ${grenade.kind}.`, {
      grenadeId: grenade.id,
      grenadeKind: grenade.kind,
      tacticalEffect: this.tacticalEffectKind,
      center: { ...grenade.to },
      untilTick: this.tacticalEffectUntilTick,
    });
  }

  private setTacticalEffect(kind: GrenadeTacticalEffect, grenade: GrenadeVisual, untilTick: number): void {
    this.tacticalEffectKind = kind;
    this.tacticalEffectSourceGrenadeId = grenade.id;
    this.tacticalEffectCenter = { ...grenade.to };
    this.tacticalEffectUntilTick = untilTick;
  }

  private clearTacticalEffect(): void {
    this.tacticalEffectKind = 'none';
    this.tacticalEffectSourceGrenadeId = null;
    this.tacticalEffectCenter = null;
    this.tacticalEffectUntilTick = null;
  }

  private setReaction(agentId: string, reaction: MutableReaction, force = false): void {
    const current = this.activeReaction(agentId, this.hostAccess().logicalTick);
    if (!force && current !== null && REACTION_PRIORITY[current.kind] > REACTION_PRIORITY[reaction.kind]) return;
    this.reactions.set(agentId, reaction);
  }

  private activeReaction(agentId: string, tick: number): MutableReaction | null {
    const reaction = this.reactions.get(agentId);
    if (reaction === undefined || reaction.untilTick <= tick) return null;
    return reaction;
  }

  private cleanupExpiredReactions(): void {
    const tick = this.hostAccess().logicalTick;
    for (const [agentId, reaction] of this.reactions) if (reaction.untilTick <= tick) this.reactions.delete(agentId);
  }

  private segmentObscuredBySmoke(from: GridPoint, to: GridPoint): boolean {
    const aiSmoke = super.getState().grenadeEvents.filter((grenade) => grenade.kind === 'smoke' && grenade.totalFrames - grenade.remainingFrames >= grenade.flightFrames);
    const playerSmoke = this.playerGrenades.filter((grenade) => grenade.kind === 'smoke' && grenade.detonated);
    return [...aiSmoke, ...playerSmoke].some((grenade) => this.smokeAffectsLine(grenade.to, grenade.radius, from, to));
  }

  private smokeAffectsLine(center: GridPoint, radius: number, from: GridPoint, to: GridPoint): boolean {
    return pointToSegment(center, from, to).distance <= radius;
  }

  private isPlayerAimingAt(agentPosition: GridPoint): boolean {
    const player = super.getState().player;
    const toAgent = { x: agentPosition.x - player.x, y: agentPosition.y - player.y };
    const range = Math.hypot(toAgent.x, toAgent.y);
    if (range < 0.1 || range > PLAYER_WEAPON_RANGE) return false;
    const direction = { x: toAgent.x / range, y: toAgent.y / range };
    const dot = clamp(vectorDot(direction, this.playerFacing), -1, 1);
    return Math.acos(dot) * 180 / Math.PI <= 7.5;
  }

  private firePressure(): number {
    return Number(Math.min(1, this.recentPlayerShotTicks.length / 5).toFixed(2));
  }

  private pruneShotPressure(): void {
    const tick = this.hostAccess().logicalTick;
    this.recentPlayerShotTicks = this.recentPlayerShotTicks.filter((shotTick) => tick - shotTick <= FIRE_PRESSURE_WINDOW_TICKS);
  }

  private memberById(id: string): HostMember | undefined {
    return this.hostAccess().members.find((member) => member.id === id);
  }

  private hostAccess(): HostAccess {
    return this as unknown as HostAccess;
  }
}

function selectDodgePoint(from: GridPoint, threat: GridPoint, occupied: readonly GridPoint[]): GridPoint | null {
  const away = normalize({ x: from.x - threat.x, y: from.y - threat.y });
  const perpendicular = { x: -away.y, y: away.x };
  const side = deterministicUnit(`${Math.round(from.x * 10)}:${Math.round(from.y * 10)}`, Math.round(threat.x), Math.round(threat.y)) < 0.5 ? -1 : 1;
  const desired = {
    x: from.x + perpendicular.x * side * 3 + away.x * 0.8,
    y: from.y + perpendicular.y * side * 3 + away.y * 0.8,
  };
  return selectReachableCandidate(from, occupied, 4, (point, pathLength) => {
    const coverBonus = hasWorldLos(threat, point) ? 0 : 80;
    const desiredPenalty = distance(point, desired) * 6;
    const lateralGain = Math.abs((point.x - from.x) * perpendicular.x + (point.y - from.y) * perpendicular.y) * 4;
    return coverBonus + lateralGain - desiredPenalty - pathLength * 0.8;
  });
}

function selectRetreatPoint(from: GridPoint, center: GridPoint, occupied: readonly GridPoint[]): GridPoint | null {
  return selectReachableCandidate(from, occupied, 7, (point, pathLength) => {
    const rangeGain = distance(point, center) * 8;
    const coverBonus = hasWorldLos(center, point) ? 0 : 90;
    const move = distance(point, from);
    const moveBand = move >= 3.5 && move <= 7 ? 30 : -Math.abs(move - 5) * 4;
    return rangeGain + coverBonus + moveBand - pathLength * 0.6;
  });
}

function selectApproachPoint(from: GridPoint, center: GridPoint, occupied: readonly GridPoint[]): GridPoint | null {
  return selectReachableCandidate(from, occupied, 8, (point, pathLength) => {
    const range = distance(point, center);
    if (range < 1.8 || range > 4.3) return -1000;
    const losBonus = hasWorldLos(point, center) ? 55 : -40;
    return losBonus - Math.abs(range - 2.8) * 18 - pathLength * 0.9;
  });
}

function selectReachableCandidate(
  from: GridPoint,
  occupied: readonly GridPoint[],
  radius: number,
  score: (point: GridPoint, pathLength: number) => number,
): GridPoint | null {
  const origin = toNavCell(from);
  const blocked = new Set(occupied.map((point) => gridKey(toNavCell(point))));
  blocked.delete(gridKey(origin));
  let best: { point: GridPoint; score: number } | null = null;
  for (let y = Math.max(0, origin.y - radius); y <= Math.min(tacticalWizardTestMap.height - 1, origin.y + radius); y += 1) {
    for (let x = Math.max(0, origin.x - radius); x <= Math.min(tacticalWizardTestMap.width - 1, origin.x + radius); x += 1) {
      const point = { x, y };
      if (!isWalkable(tacticalWizardNavigationGrid, point) || blocked.has(gridKey(point))) continue;
      const path = findPath(tacticalWizardNavigationGrid, origin, point, blocked);
      if (path.length === 0) continue;
      const candidateScore = score(point, path.length);
      if (best === null || candidateScore > best.score) best = { point, score: candidateScore };
    }
  }
  return best?.point ?? null;
}

function pointToSegment(point: GridPoint, from: GridPoint, to: GridPoint): { distance: number; t: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 1e-8) return { distance: distance(point, from), t: 0 };
  const rawT = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq;
  const t = clamp(rawT, 0, 1);
  const closest = { x: from.x + dx * t, y: from.y + dy * t };
  return { distance: distance(point, closest), t: rawT };
}

function hasWorldLos(from: GridPoint, to: GridPoint): boolean {
  return hasLineOfSight(tacticalWizardNavigationGrid, toNavCell(from), toNavCell(to));
}

function toNavCell(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))),
  };
}

function clampWorldPoint(point: GridPoint): GridPoint {
  return {
    x: Math.round(clamp(point.x, 0, tacticalWizardTestMap.width - 1) * 100) / 100,
    y: Math.round(clamp(point.y, 0, tacticalWizardTestMap.height - 1) * 100) / 100,
  };
}

function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y) || 1;
  return { x: point.x / length, y: point.y / length };
}

function vectorDot(a: GridPoint, b: GridPoint): number {
  return a.x * b.x + a.y * b.y;
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
