import { findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid } from './tacticalWizardTestMapV7';
import type { RunLogCategory, RunLogEvent, RunLogValue } from './tacticalWizardSimulationV3';
import {
  TacticalWizardSimulation as TacticalWizardSimulationV10,
  tacticalWizardTestMap,
  type TacticalWizardSimulationState as TacticalWizardSimulationStateV10,
  type TacticalWizardAgentView,
  type RecoveryTask,
} from './tacticalWizardSimulationV10';

export * from './tacticalWizardSimulationV10';

export type ThreatResponsePhase = 'none' | 'break_contact' | 'sector_search';

export interface ThreatResponseView {
  readonly active: boolean;
  readonly phase: ThreatResponsePhase;
  readonly sourceAgentId: string | null;
  /** Unit vector from the first casualty toward the estimated incoming-fire direction. */
  readonly bearing: GridPoint | null;
  /** Coarse Host estimate. It is intentionally not the hidden shooter's exact position. */
  readonly estimatedSector: GridPoint | null;
  readonly startedTick: number | null;
  readonly lastHitTick: number | null;
  readonly smokeDeployed: boolean;
  readonly smokeOwnerId: string | null;
  readonly defensiveCoverTargets: Readonly<Record<string, GridPoint>>;
  readonly rescueCoverTarget: GridPoint | null;
  readonly rescueInterruptedCount: number;
  readonly lastRescueInterruptedTick: number | null;
}

export interface TacticalWizardSimulationState extends TacticalWizardSimulationStateV10 {
  readonly threatResponse: ThreatResponseView;
}

interface HostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  facing: GridPoint;
  grenadeCount: number;
  grenadeCooldownUntilTick: number;
  firePulse: number;
  targetVisible: boolean;
  task: string;
  role: string;
  tacticalTarget: GridPoint | null;
  specialAction: string;
  specialActionPulse: number;
}

interface MutableGrenade {
  readonly id: number;
  readonly ownerId: string;
  readonly kind: 'flash' | 'frag' | 'smoke';
  readonly from: GridPoint;
  readonly to: GridPoint;
  readonly radius: number;
  remainingFrames: number;
  readonly totalFrames: number;
  readonly flightFrames: number;
}

interface HostAccess {
  members: HostMember[];
  logicalTick: number;
  motionFrame: number;
  alertState: 'idle' | 'pending' | 'active';
  alertSourceId: string | null;
  sharedLastKnownPosition: GridPoint | null;
  pendingAlertUntil: number;
  alertExpiresAt: number;
  suppressorId: string | null;
  moverId: string | null;
  observerId: string | null;
  tactic: string;
  tacticStartedTick: number;
  tacticReason: string;
  maneuverCycle: number;
  activeGrenades: MutableGrenade[];
  grenadeSequence: number;
  lastSquadGrenadeTick: number;
  movementTarget: (member: HostMember) => GridPoint | null;
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

interface RescuePlanAccess {
  downedAgentId: string;
  rescuerId: string;
  covererId: string | null;
  startedTick: number;
  coverReadyTick: number;
  approachTarget: GridPoint;
  phase: 'establish_cover' | 'approach' | 'treat';
  treatmentSeconds: number;
}

interface V10Access {
  rescuePlan: RescuePlanAccess | null;
}

const THREAT_MEMORY_TICKS = 48;
const BREAK_CONTACT_TICKS = 10;
const THREAT_ESTIMATE_RANGE = 9;
const DEFENSIVE_COVER_RADIUS = 7;
const DEFENSIVE_COVER_ARRIVAL = 0.82;
const RESCUE_COVER_RADIUS = 6;
const RESCUE_INTERRUPT_HOLD_TICKS = 4;
const DEFENSIVE_SMOKE_RADIUS = 3.1;
const DEFENSIVE_SMOKE_TOTAL_FRAMES = 72;
const DEFENSIVE_SMOKE_FLIGHT_FRAMES = 18;
const DEFENSIVE_SMOKE_COOLDOWN_TICKS = 24;

/**
 * V11 turns reactive combat into an explicit counter-ambush test contract.
 *
 * Exact hidden shooter coordinates never enter cognition. A hit supplies a
 * direction, the Workbench Host converts that direction into a deliberately
 * coarse threat sector, and the existing squad-report + sweep contract consumes
 * that estimate. Geometry, cover selection, smoke placement and casualty access
 * remain Host-owned reference behavior.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationV10 {
  private threatPhase: ThreatResponsePhase = 'none';
  private threatSourceAgentId: string | null = null;
  private threatBearing: GridPoint | null = null;
  private threatEstimatedSector: GridPoint | null = null;
  private threatStartedTick: number | null = null;
  private threatLastHitTick: number | null = null;
  private threatSmokeDeployed = false;
  private threatSmokeOwnerId: string | null = null;
  private smokeCooldownUntilTick = -999;
  private defensiveCoverTargets = new Map<string, GridPoint>();
  private rescueCoverTarget: GridPoint | null = null;
  private rescueCoverPlanKey: string | null = null;
  private rescueInterruptedCount = 0;
  private lastRescueInterruptedTick: number | null = null;
  private rescueSuppressedUntilTick = -1;

  constructor() {
    super();
    this.installV11MovementHook();
    const host = this.host();
    host.pushEvent('V11: counter-ambush threat sectors, real rescue security positions and treatment interruption enabled.');
    host.log('system', 'simulation', 'Volition Simulation', 'session', 'V11 combat sandbox response layer enabled.', {
      hiddenSourcePolicy: 'direction_to_coarse_sector_only',
      breakContactTicks: BREAK_CONTACT_TICKS,
      rescueInterruptHoldTicks: RESCUE_INTERRUPT_HOLD_TICKS,
    });
  }

  override reset(): TacticalWizardSimulationState {
    super.reset();
    this.clearThreatResponse();
    this.rescueCoverTarget = null;
    this.rescueCoverPlanKey = null;
    this.rescueInterruptedCount = 0;
    this.lastRescueInterruptedTick = null;
    this.rescueSuppressedUntilTick = -1;
    this.host().pushEvent('V11: counter-ambush and rescue-security state reset.');
    return this.getState();
  }

  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    const before = super.getState();
    this.enforceRescueSecurity(before);
    super.advance(deltaSeconds);
    const after = super.getState();
    this.detectNonRifleDamageInterruptions(before, after);
    this.enforceRescueSecurity(after);
    this.updateThreatResponse(after);
    return this.getState();
  }

  override getState(): TacticalWizardSimulationState {
    const base = super.getState();
    return {
      ...base,
      threatResponse: {
        active: this.threatPhase !== 'none',
        phase: this.threatPhase,
        sourceAgentId: this.threatSourceAgentId,
        bearing: clonePoint(this.threatBearing),
        estimatedSector: clonePoint(this.threatEstimatedSector),
        startedTick: this.threatStartedTick,
        lastHitTick: this.threatLastHitTick,
        smokeDeployed: this.threatSmokeDeployed,
        smokeOwnerId: this.threatSmokeOwnerId,
        defensiveCoverTargets: Object.fromEntries([...this.defensiveCoverTargets.entries()].map(([id, point]) => [id, { ...point }])),
        rescueCoverTarget: clonePoint(this.rescueCoverTarget),
        rescueInterruptedCount: this.rescueInterruptedCount,
        lastRescueInterruptedTick: this.lastRescueInterruptedTick,
      },
    };
  }

  override playerFireAt(point: GridPoint): boolean {
    const before = super.getState();
    const sourceOrigin = { ...before.player };
    const beforeHealth = new Map(before.agents.map((agent) => [agent.id, agent.health]));
    const result = super.playerFireAt(point);
    const after = super.getState();

    for (const agent of after.agents) {
      const previousHealth = beforeHealth.get(agent.id) ?? agent.health;
      if (agent.health >= previousHealth) continue;
      this.interruptRescueForIncomingDamage(agent.id, 'player_rifle');
      const beforeAgent = before.agents.find((entry) => entry.id === agent.id);
      if (beforeAgent === undefined || beforeAgent.targetVisible) continue;
      this.registerUnknownIncomingFire(agent.id, sourceOrigin);
    }
    return result;
  }

  /** Deterministic scenario hook for regression and editor authoring tests. */
  injectIncomingFireForTest(agentId: string, sourceOrigin: GridPoint): boolean {
    const state = super.getState();
    if (!state.agents.some((agent) => agent.id === agentId && agent.alive)) return false;
    this.registerUnknownIncomingFire(agentId, sourceOrigin);
    return true;
  }

  private installV11MovementHook(): void {
    const host = this.host();
    const previousMovementTarget = host.movementTarget.bind(this);
    host.movementTarget = (member: HostMember): GridPoint | null => {
      const current = super.getState().agents.find((agent) => agent.id === member.id);
      const gatedBaseTarget = previousMovementTarget(member);
      if (current === undefined || !current.alive) return gatedBaseTarget;
      if (isHardReaction(current)) return gatedBaseTarget;

      const rescue = this.v10().rescuePlan;
      if (rescue !== null && rescue.covererId === member.id && rescue.phase === 'establish_cover' && this.rescueCoverTarget !== null) {
        return gatedBaseTarget === null ? null : this.rescueCoverTarget;
      }
      if (this.threatPhase === 'break_contact') {
        const target = this.defensiveCoverTargets.get(member.id);
        if (target !== undefined) return gatedBaseTarget === null ? null : target;
      }
      return gatedBaseTarget;
    };
  }

  private registerUnknownIncomingFire(victimId: string, exactSourceOrigin: GridPoint): void {
    const state = super.getState();
    const victim = state.agents.find((agent) => agent.id === victimId);
    if (victim === undefined) return;
    const bearing = normalize({ x: exactSourceOrigin.x - victim.position.x, y: exactSourceOrigin.y - victim.position.y });
    const estimate = estimateThreatSector(victim.position, bearing, exactSourceOrigin, victimId, state.logicalTick);
    const host = this.host();

    this.threatPhase = 'break_contact';
    this.threatSourceAgentId = victimId;
    this.threatBearing = bearing;
    this.threatEstimatedSector = estimate;
    this.threatStartedTick = this.threatStartedTick ?? state.logicalTick;
    this.threatLastHitTick = state.logicalTick;
    this.threatSmokeDeployed = false;
    this.threatSmokeOwnerId = null;

    host.alertState = 'active';
    host.alertSourceId = 'incoming-fire';
    host.sharedLastKnownPosition = { ...estimate };
    host.pendingAlertUntil = state.logicalTick;
    host.alertExpiresAt = state.logicalTick + THREAT_MEMORY_TICKS;
    host.tactic = 'sweep';
    host.tacticStartedTick = state.logicalTick;
    host.tacticReason = 'Incoming fire arrived without visual confirmation: break contact, screen the exposed element, then search the inferred threat sector.';
    host.maneuverCycle += 1;
    host.applyRoles();
    host.refreshTacticalPlan();

    this.refreshDefensiveCoverTargets(state, estimate);
    this.deployDefensiveSmoke(state, estimate, victimId);
    host.pushEvent(`T${state.logicalTick}: ${victim.label} hit from an unseen direction — break contact and search the inferred sector.`);
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'alert', 'Unseen incoming fire converted into a coarse threat sector; exact hidden shooter position was withheld.', {
      victimId,
      bearing: { x: Number(bearing.x.toFixed(3)), y: Number(bearing.y.toFixed(3)) },
      estimatedSector: { ...estimate },
      sourcePrecision: 'directional_only',
      response: 'break_contact_then_sector_search',
    });
  }

  private refreshDefensiveCoverTargets(state: TacticalWizardSimulationStateV10, threat: GridPoint): void {
    this.defensiveCoverTargets.clear();
    const reserved = new Set<string>();
    for (const agent of [...state.agents].filter((entry) => entry.alive).sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
      const target = selectDirectionalCover(agent.position, threat, reserved, DEFENSIVE_COVER_RADIUS, null);
      if (target === null) continue;
      this.defensiveCoverTargets.set(agent.id, target);
      reserveArea(reserved, target, 1);
    }
  }

  private deployDefensiveSmoke(state: TacticalWizardSimulationStateV10, threat: GridPoint, victimId: string): void {
    const host = this.host();
    if (state.logicalTick < this.smokeCooldownUntilTick) return;
    const rescue = this.v10().rescuePlan;
    const candidates = host.members
      .filter((member) => state.agents.some((agent) => agent.id === member.id && agent.alive) && member.grenadeCount > 0)
      .sort((left, right) => {
        const leftPenalty = left.id === victimId || left.id === rescue?.rescuerId ? 2 : 0;
        const rightPenalty = right.id === victimId || right.id === rescue?.rescuerId ? 2 : 0;
        return leftPenalty - rightPenalty || left.id.localeCompare(right.id, 'en');
      });
    const owner = candidates[0];
    if (owner === undefined) return;

    const center = centroid(state.agents.filter((agent) => agent.alive).map((agent) => agent.position));
    const direction = normalize({ x: threat.x - center.x, y: threat.y - center.y });
    const desired = clampToMap({ x: center.x + direction.x * 3.3, y: center.y + direction.y * 3.3 });
    const target = nearestWalkable(desired) ?? toCell(center);
    owner.grenadeCount -= 1;
    owner.grenadeCooldownUntilTick = Math.max(owner.grenadeCooldownUntilTick, state.logicalTick + DEFENSIVE_SMOKE_COOLDOWN_TICKS);
    owner.specialAction = 'throw_smoke';
    owner.specialActionPulse = 18;
    host.activeGrenades.push({
      id: host.grenadeSequence++,
      ownerId: owner.id,
      kind: 'smoke',
      from: { ...owner.position },
      to: { ...target },
      radius: DEFENSIVE_SMOKE_RADIUS,
      remainingFrames: DEFENSIVE_SMOKE_TOTAL_FRAMES,
      totalFrames: DEFENSIVE_SMOKE_TOTAL_FRAMES,
      flightFrames: DEFENSIVE_SMOKE_FLIGHT_FRAMES,
    });
    host.lastSquadGrenadeTick = state.logicalTick;
    this.smokeCooldownUntilTick = state.logicalTick + DEFENSIVE_SMOKE_COOLDOWN_TICKS;
    this.threatSmokeDeployed = true;
    this.threatSmokeOwnerId = owner.id;
    host.pushEvent(`T${state.logicalTick}: ${owner.label} throws emergency smoke to screen the unseen firing direction.`);
    host.log('agent', owner.id, owner.label, 'fire', `${owner.label} deployed defensive smoke against an unseen firing direction.`, {
      target: { ...target },
      inferredThreatSector: { ...threat },
      reason: 'counter_ambush_screen',
      grenadeCount: owner.grenadeCount,
    });
  }

  private updateThreatResponse(state: TacticalWizardSimulationStateV10): void {
    if (this.threatPhase === 'none') return;
    if (state.agents.some((agent) => agent.alive && agent.targetVisible)) {
      this.host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'alert', 'Visual contact replaced the inferred incoming-fire sector.', {
        previousPhase: this.threatPhase,
        previousEstimatedSector: this.threatEstimatedSector,
      });
      this.clearThreatResponse(false);
      return;
    }
    if (this.threatPhase !== 'break_contact') return;
    const started = this.threatStartedTick ?? state.logicalTick;
    const alive = state.agents.filter((agent) => agent.alive);
    const settled = alive.length > 0 && alive.every((agent) => {
      const target = this.defensiveCoverTargets.get(agent.id);
      return target === undefined || distance(agent.position, target) <= DEFENSIVE_COVER_ARRIVAL;
    });
    if (!settled && state.logicalTick - started < BREAK_CONTACT_TICKS) return;

    this.threatPhase = 'sector_search';
    const host = this.host();
    host.tactic = 'sweep';
    host.tacticStartedTick = state.logicalTick;
    host.tacticReason = 'The exposed element is screened; search the inferred firing sector with lead / cover / overwatch instead of chasing a hidden exact coordinate.';
    host.applyRoles();
    host.refreshTacticalPlan();
    host.pushEvent(`T${state.logicalTick}: break-contact complete; coordinated sector search begins.`);
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'tactic', 'Counter-ambush transitioned from break contact to inferred-sector search.', {
      from: 'break_contact',
      to: 'sector_search',
      estimatedSector: clonePoint(this.threatEstimatedSector),
    });
  }

  private enforceRescueSecurity(state: TacticalWizardSimulationStateV10): void {
    const plan = this.v10().rescuePlan;
    if (plan === null) {
      this.rescueCoverTarget = null;
      this.rescueCoverPlanKey = null;
      return;
    }
    if (plan.covererId === null) {
      this.host().pushEvent(`T${state.logicalTick}: casualty recovery postponed — no third soldier is available to secure the treatment lane.`);
      this.host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Rescue postponed because a dedicated third-party security element is unavailable.', {
        downedId: plan.downedAgentId,
        rescuerId: plan.rescuerId,
      });
      this.v10().rescuePlan = null;
      return;
    }

    const key = `${plan.downedAgentId}:${plan.rescuerId}:${plan.covererId}:${plan.startedTick}`;
    if (this.rescueCoverPlanKey !== key || this.rescueCoverTarget === null) {
      const coverer = state.agents.find((agent) => agent.id === plan.covererId);
      const casualty = state.agents.find((agent) => agent.id === plan.downedAgentId);
      if (coverer === undefined || casualty === undefined || !coverer.alive) {
        this.v10().rescuePlan = null;
        return;
      }
      const threat = this.threatEstimatedSector ?? state.squad.sharedLastKnownPosition ?? {
        x: casualty.position.x + 6,
        y: casualty.position.y,
      };
      const reserved = new Set(state.agents.filter((agent) => agent.id !== coverer.id).map((agent) => gridKey(toCell(agent.position))));
      this.rescueCoverTarget = selectDirectionalCover(coverer.position, threat, reserved, RESCUE_COVER_RADIUS, casualty.position) ?? toCell(coverer.position);
      this.rescueCoverPlanKey = key;
      this.host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Dedicated rescue-security position assigned before casualty approach.', {
        downedId: plan.downedAgentId,
        rescuerId: plan.rescuerId,
        covererId: plan.covererId,
        coverTarget: { ...this.rescueCoverTarget },
      });
    }

    const coverer = state.agents.find((agent) => agent.id === plan.covererId);
    const coverReady = coverer !== undefined && coverer.alive && this.rescueCoverTarget !== null && distance(coverer.position, this.rescueCoverTarget) <= DEFENSIVE_COVER_ARRIVAL;
    const holdComplete = state.logicalTick >= this.rescueSuppressedUntilTick;
    if ((!coverReady || !holdComplete) && plan.phase !== 'establish_cover') {
      plan.phase = 'establish_cover';
      plan.treatmentSeconds = 0;
      plan.coverReadyTick = Math.max(plan.coverReadyTick, state.logicalTick + 1);
    }
  }

  private interruptRescueForIncomingDamage(agentId: string, source: string): void {
    const plan = this.v10().rescuePlan;
    if (plan === null || (agentId !== plan.rescuerId && agentId !== plan.covererId)) return;
    const state = super.getState();
    plan.phase = 'establish_cover';
    plan.treatmentSeconds = 0;
    plan.coverReadyTick = state.logicalTick + RESCUE_INTERRUPT_HOLD_TICKS;
    this.rescueSuppressedUntilTick = state.logicalTick + RESCUE_INTERRUPT_HOLD_TICKS;
    this.rescueInterruptedCount += 1;
    this.lastRescueInterruptedTick = state.logicalTick;
    this.host().pushEvent(`T${state.logicalTick}: casualty treatment interrupted by incoming fire; security must be re-established.`);
    this.host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Rescue interrupted by combat damage; treatment progress reset and security re-established.', {
      damagedAgentId: agentId,
      source,
      downedId: plan.downedAgentId,
      rescuerId: plan.rescuerId,
      covererId: plan.covererId,
      interruptedCount: this.rescueInterruptedCount,
    });
  }

  private detectNonRifleDamageInterruptions(before: TacticalWizardSimulationStateV10, after: TacticalWizardSimulationStateV10): void {
    for (const agent of after.agents) {
      const prior = before.agents.find((entry) => entry.id === agent.id);
      if (prior !== undefined && agent.health < prior.health) this.interruptRescueForIncomingDamage(agent.id, 'combat_damage');
    }
  }

  private clearThreatResponse(clearHostEstimate = true): void {
    this.threatPhase = 'none';
    this.threatSourceAgentId = null;
    this.threatBearing = null;
    this.threatEstimatedSector = null;
    this.threatStartedTick = null;
    this.threatLastHitTick = null;
    this.threatSmokeDeployed = false;
    this.threatSmokeOwnerId = null;
    this.defensiveCoverTargets.clear();
    if (clearHostEstimate) {
      const host = this.host();
      if (host.alertSourceId === 'incoming-fire') {
        host.alertState = 'idle';
        host.alertSourceId = null;
        host.sharedLastKnownPosition = null;
      }
    }
  }

  private host(): HostAccess {
    return this as unknown as HostAccess;
  }

  private v10(): V10Access {
    return this as unknown as V10Access;
  }
}

function estimateThreatSector(victim: GridPoint, bearing: GridPoint, exactSource: GridPoint, victimId: string, logicalTick: number): GridPoint {
  const parity = hashParity(`${victimId}:${logicalTick}`) === 0 ? -1 : 1;
  const lateral = { x: -bearing.y * parity * 1.25, y: bearing.x * parity * 1.25 };
  const desired = clampToMap({
    x: victim.x + bearing.x * THREAT_ESTIMATE_RANGE + lateral.x,
    y: victim.y + bearing.y * THREAT_ESTIMATE_RANGE + lateral.y,
  });
  let estimate = nearestWalkable(desired) ?? toCell(desired);
  if (distance(estimate, exactSource) < 0.8) {
    estimate = nearestWalkable(clampToMap({ x: estimate.x + lateral.x * 1.5, y: estimate.y + lateral.y * 1.5 })) ?? estimate;
  }
  return estimate;
}

function selectDirectionalCover(from: GridPoint, threat: GridPoint, reserved: ReadonlySet<string>, radius: number, near: GridPoint | null): GridPoint | null {
  const candidates: Array<{ point: GridPoint; score: number }> = [];
  const start = toCell(from);
  for (let y = Math.max(0, start.y - radius); y <= Math.min(tacticalWizardTestMap.height - 1, start.y + radius); y += 1) {
    for (let x = Math.max(0, start.x - radius); x <= Math.min(tacticalWizardTestMap.width - 1, start.x + radius); x += 1) {
      const point = { x, y };
      if (!isWalkable(tacticalWizardNavigationGrid, point) || reserved.has(gridKey(point))) continue;
      const moveDistance = distance(from, point);
      if (moveDistance < 1.2 || moveDistance > radius + 0.5) continue;
      const path = findPath(tacticalWizardNavigationGrid, start, point);
      if (path.length === 0) continue;
      const covered = !hasLineOfSight(tacticalWizardNavigationGrid, toCell(threat), point);
      const nearPenalty = near === null ? 0 : Math.abs(distance(point, near) - 3) * 1.5;
      const threatRange = distance(point, threat);
      const score = (covered ? 80 : 0) - path.length * 2.2 - nearPenalty + Math.min(12, threatRange) * 0.35;
      candidates.push({ point, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.point.y - b.point.y || a.point.x - b.point.x);
  return candidates[0]?.point ?? null;
}

function reserveArea(reserved: Set<string>, point: GridPoint, radius: number): void {
  for (let y = -radius; y <= radius; y += 1) for (let x = -radius; x <= radius; x += 1) reserved.add(gridKey({ x: point.x + x, y: point.y + y }));
}

function nearestWalkable(point: GridPoint): GridPoint | null {
  const origin = toCell(point);
  if (isWalkable(tacticalWizardNavigationGrid, origin)) return origin;
  for (let radius = 1; radius <= 4; radius += 1) {
    const ring: GridPoint[] = [];
    for (let y = -radius; y <= radius; y += 1) for (let x = -radius; x <= radius; x += 1) if (Math.max(Math.abs(x), Math.abs(y)) === radius) ring.push({ x: origin.x + x, y: origin.y + y });
    ring.sort((a, b) => distance(a, point) - distance(b, point) || a.y - b.y || a.x - b.x);
    const candidate = ring.find((entry) => isWalkable(tacticalWizardNavigationGrid, entry));
    if (candidate !== undefined) return candidate;
  }
  return null;
}

function isHardReaction(agent: TacticalWizardAgentView): boolean {
  return agent.reactionState === 'dodge'
    || agent.reactionState === 'stunned'
    || agent.reactionState === 'smoke_retreat'
    || agent.reactionState === 'smoke_reposition'
    || agent.reactionState === 'grenade_suppress'
    || agent.reactionState === 'downed';
}

function centroid(points: readonly GridPoint[]): GridPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-9 ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
}

function clampToMap(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, point.x)),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, point.y)),
  };
}

function toCell(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))),
  };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clonePoint(point: GridPoint | null): GridPoint | null {
  return point === null ? null : { ...point };
}

function hashParity(value: string): 0 | 1 {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash & 1) as 0 | 1;
}
