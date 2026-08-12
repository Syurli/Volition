import { findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from './tacticalWizardTestMapV7';
import {
  TacticalWizardSimulation as TacticalWizardSimulationV11,
  type TacticalWizardSimulationState as TacticalWizardSimulationStateV11,
} from './tacticalWizardSimulationV11';

export * from './tacticalWizardSimulationV11';

export interface RescueFireSupportView {
  readonly active: boolean;
  readonly covererId: string | null;
  readonly fireTarget: GridPoint | null;
  readonly securityPosition: GridPoint | null;
  readonly positionReady: boolean;
  readonly lineOfFire: boolean;
  readonly lastFireTick: number | null;
}

export interface TacticalWizardSimulationState extends TacticalWizardSimulationStateV11 {
  readonly rescueFireSupport: RescueFireSupportView;
}

interface HostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  facing: GridPoint;
  firePulse: number;
  targetVisible: boolean;
  task: string;
  role: string;
  tacticalTarget: GridPoint | null;
}

interface HostAccess {
  members: HostMember[];
  logicalTick: number;
  sharedLastKnownPosition: GridPoint | null;
  tryFire: (member: HostMember, target: GridPoint, reason: string) => void;
  pushEvent: (message: string) => void;
  log: (
    category: 'system' | 'player' | 'squad' | 'agent',
    actorId: string,
    actorLabel: string,
    event: 'session' | 'reset' | 'player_move' | 'player_noise' | 'alert' | 'tactic' | 'roles' | 'plan' | 'perception' | 'decision' | 'move' | 'fire' | 'search',
    summary: string,
    data: Readonly<Record<string, unknown>>,
  ) => void;
}

interface RescuePlanAccess {
  downedAgentId: string;
  rescuerId: string;
  covererId: string | null;
  startedTick: number;
  phase: 'establish_cover' | 'approach' | 'treat';
}

interface V10Access {
  rescuePlan: RescuePlanAccess | null;
}

interface V11Access {
  rescueCoverTarget: GridPoint | null;
}

const RESCUE_SUPPORT_RADIUS = 7;
const RESCUE_SUPPORT_ARRIVAL = 0.88;
const RESCUE_SUPPORT_FIRE_INTERVAL_TICKS = 2;
const DESIRED_CASUALTY_STANDOFF = 3.5;

/**
 * V12 closes the gap between "a third soldier has a rescue-cover role" and
 * "that soldier is actually providing fire support".
 *
 * V11 deliberately preferred hard LOS-breaking cover. That is appropriate for
 * break-contact, but not for a rescue security element whose job is to protect
 * the treatment lane. V12 therefore gives rescue cover its own Host contract:
 * choose a reachable position with a firing lane toward the shared LKP / coarse
 * threat sector, prefer nearby physical cover, face the threat, and maintain
 * suppressive fire while the rescuer approaches and treats the casualty.
 *
 * Hidden-target privacy remains intact: rescue fire never reads the player's
 * hidden live position. It consumes only confirmed/shared LKP or the deliberately
 * coarse incoming-fire sector already exposed by V11.
 */
export class TacticalWizardSimulation extends TacticalWizardSimulationV11 {
  private rescueSupportPlanKey: string | null = null;
  private rescueSupportPosition: GridPoint | null = null;
  private rescueSupportTarget: GridPoint | null = null;
  private lastRescueSupportFireTick: number | null = null;

  constructor() {
    super();
    const host = this.v12Host();
    host.pushEvent('V12: rescue security now establishes a protected firing lane and actively suppresses the threat while treatment is in progress.');
    host.log('system', 'simulation', 'Volition Simulation', 'session', 'V12 rescue fire-support contract enabled.', {
      rescueSupportRadius: RESCUE_SUPPORT_RADIUS,
      rescueSupportFireIntervalTicks: RESCUE_SUPPORT_FIRE_INTERVAL_TICKS,
      hiddenTargetPolicy: 'shared_lkp_or_coarse_sector_only',
    });
  }

  override reset(): TacticalWizardSimulationState {
    super.reset();
    this.clearRescueSupport();
    this.v12Host().pushEvent('V12: rescue fire-support state reset.');
    return this.getState();
  }

  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }

  override advance(deltaSeconds: number): TacticalWizardSimulationState {
    // Orient before the parent decision/perception tick so the coverer can
    // reacquire a visible player through the normal FOV + LOS pipeline.
    this.prepareRescueSupport(super.getState());
    super.advance(deltaSeconds);

    const state = super.getState();
    this.prepareRescueSupport(state);
    this.executeRescueSupportFire(state);
    return this.getState();
  }

  override getState(): TacticalWizardSimulationState {
    const base = super.getState();
    const plan = this.v12V10().rescuePlan;
    const coverer = plan?.covererId === null || plan === null
      ? null
      : base.agents.find((agent) => agent.id === plan.covererId) ?? null;
    const positionReady = coverer !== null
      && this.rescueSupportPosition !== null
      && distance(coverer.position, this.rescueSupportPosition) <= RESCUE_SUPPORT_ARRIVAL;
    const lineOfFire = coverer !== null
      && this.rescueSupportTarget !== null
      && hasLineOfSight(tacticalWizardNavigationGrid, toCell(coverer.position), toCell(this.rescueSupportTarget));

    return {
      ...base,
      rescueFireSupport: {
        active: plan !== null && plan.covererId !== null && this.rescueSupportTarget !== null,
        covererId: plan?.covererId ?? null,
        fireTarget: clonePoint(this.rescueSupportTarget),
        securityPosition: clonePoint(this.rescueSupportPosition),
        positionReady,
        lineOfFire,
        lastFireTick: this.lastRescueSupportFireTick,
      },
    };
  }

  private prepareRescueSupport(state: TacticalWizardSimulationStateV11): void {
    const plan = this.v12V10().rescuePlan;
    if (plan === null || plan.covererId === null) {
      this.clearRescueSupport();
      return;
    }

    const coverer = state.agents.find((agent) => agent.id === plan.covererId);
    const casualty = state.agents.find((agent) => agent.id === plan.downedAgentId);
    if (coverer === undefined || casualty === undefined || !coverer.alive) {
      this.clearRescueSupport();
      return;
    }

    const fireTarget = state.threatResponse.estimatedSector ?? state.squad.sharedLastKnownPosition;
    if (fireTarget === null) {
      this.rescueSupportTarget = null;
      return;
    }

    const targetCell = toCell(fireTarget);
    const key = `${plan.downedAgentId}:${plan.rescuerId}:${plan.covererId}:${plan.startedTick}:${gridKey(targetCell)}`;
    const currentHasLane = this.rescueSupportPosition !== null
      && hasLineOfSight(tacticalWizardNavigationGrid, this.rescueSupportPosition, targetCell);

    if (this.rescueSupportPlanKey !== key || this.rescueSupportPosition === null || !currentHasLane) {
      const occupied = state.agents
        .filter((agent) => agent.alive && agent.id !== coverer.id)
        .map((agent) => agent.position);
      const selected = selectRescueFireSupportPosition(
        coverer.position,
        casualty.position,
        fireTarget,
        occupied,
      );
      if (selected !== null) {
        this.rescueSupportPosition = selected;
        this.v12V11().rescueCoverTarget = { ...selected };
        this.v12Host().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Rescue security repositioned to a protected fire-support lane.', {
          downedId: plan.downedAgentId,
          rescuerId: plan.rescuerId,
          covererId: plan.covererId,
          securityPosition: { ...selected },
          fireTarget: { ...fireTarget },
          targetSource: state.threatResponse.estimatedSector !== null ? 'coarse_threat_sector' : 'shared_last_known_position',
        });
      }
      this.rescueSupportPlanKey = key;
    }

    this.rescueSupportTarget = { ...fireTarget };
    if (this.rescueSupportPosition !== null) this.v12V11().rescueCoverTarget = { ...this.rescueSupportPosition };

    const member = this.v12Host().members.find((entry) => entry.id === plan.covererId);
    if (member === undefined) return;

    // Make the rescue-security contract explicit in the Host execution state.
    // This aligns the displayed tactical target, movement target and suppressive
    // fire settlement test instead of leaving three independent coordinates.
    if (this.rescueSupportPosition !== null) member.tacticalTarget = { ...this.rescueSupportPosition };
    member.task = 'suppress';
    member.role = 'suppressor';
    member.facing = normalize({
      x: fireTarget.x - member.position.x,
      y: fireTarget.y - member.position.y,
    });
  }

  private executeRescueSupportFire(state: TacticalWizardSimulationStateV11): void {
    const plan = this.v12V10().rescuePlan;
    if (plan === null || plan.covererId === null || this.rescueSupportPosition === null || this.rescueSupportTarget === null) return;
    const coverer = state.agents.find((agent) => agent.id === plan.covererId);
    const member = this.v12Host().members.find((entry) => entry.id === plan.covererId);
    if (coverer === undefined || member === undefined || !coverer.alive) return;

    const positionReady = distance(coverer.position, this.rescueSupportPosition) <= RESCUE_SUPPORT_ARRIVAL;
    const lineOfFire = hasLineOfSight(tacticalWizardNavigationGrid, toCell(coverer.position), toCell(this.rescueSupportTarget));
    if (!positionReady || !lineOfFire) return;

    // If the parent tactical layer already fired this tick, count it as valid
    // rescue support instead of producing a duplicate burst.
    if (member.firePulse > 0) {
      this.lastRescueSupportFireTick = this.v12Host().logicalTick;
      return;
    }

    const tick = this.v12Host().logicalTick;
    if (this.lastRescueSupportFireTick !== null && tick - this.lastRescueSupportFireTick < RESCUE_SUPPORT_FIRE_INTERVAL_TICKS) return;

    member.facing = normalize({
      x: this.rescueSupportTarget.x - member.position.x,
      y: this.rescueSupportTarget.y - member.position.y,
    });
    const beforePulse = member.firePulse;
    const reason = coverer.targetVisible
      ? 'rescue security covering fire'
      : 'rescue security suppression on last-known threat';
    this.v12Host().tryFire(member, this.rescueSupportTarget, reason);
    if (member.firePulse <= beforePulse) return;

    this.lastRescueSupportFireTick = tick;
    this.v12Host().pushEvent(`T${tick}: ${member.label} maintains rescue security with active suppressive fire.`);
  }

  private clearRescueSupport(): void {
    this.rescueSupportPlanKey = null;
    this.rescueSupportPosition = null;
    this.rescueSupportTarget = null;
    this.lastRescueSupportFireTick = null;
  }

  private v12Host(): HostAccess {
    return this as unknown as HostAccess;
  }

  private v12V10(): V10Access {
    return this as unknown as V10Access;
  }

  private v12V11(): V11Access {
    return this as unknown as V11Access;
  }
}

function selectRescueFireSupportPosition(
  from: GridPoint,
  casualty: GridPoint,
  threat: GridPoint,
  occupied: readonly GridPoint[],
): GridPoint | null {
  const start = toCell(from);
  const threatCell = toCell(threat);
  const candidates: Array<{ readonly point: GridPoint; readonly score: number }> = [];

  for (let y = Math.max(0, start.y - RESCUE_SUPPORT_RADIUS); y <= Math.min(tacticalWizardTestMap.height - 1, start.y + RESCUE_SUPPORT_RADIUS); y += 1) {
    for (let x = Math.max(0, start.x - RESCUE_SUPPORT_RADIUS); x <= Math.min(tacticalWizardTestMap.width - 1, start.x + RESCUE_SUPPORT_RADIUS); x += 1) {
      const point = { x, y };
      if (!isWalkable(tacticalWizardNavigationGrid, point)) continue;
      if (occupied.some((entry) => distance(entry, point) < 1.35)) continue;
      if (!hasLineOfSight(tacticalWizardNavigationGrid, point, threatCell)) continue;

      const path = findPath(tacticalWizardNavigationGrid, start, point);
      if (path.length === 0) continue;
      const casualtyDistance = distance(point, casualty);
      if (casualtyDistance < 1.7 || casualtyDistance > 6.5) continue;

      const adjacentCover = blockedNeighbourCount(point);
      const movementCost = Math.max(0, path.length - 1);
      const casualtyPenalty = Math.abs(casualtyDistance - DESIRED_CASUALTY_STANDOFF);
      const threatDistance = distance(point, threat);
      const score = adjacentCover * 24
        - movementCost * 1.8
        - casualtyPenalty * 3
        + Math.min(12, threatDistance) * 0.2;
      candidates.push({ point, score });
    }
  }

  candidates.sort((left, right) => right.score - left.score || left.point.y - right.point.y || left.point.x - right.point.x);
  return candidates[0]?.point ?? null;
}

function blockedNeighbourCount(point: GridPoint): number {
  const offsets = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  return offsets.reduce((count, offset) => {
    const neighbour = { x: point.x + offset.x, y: point.y + offset.y };
    const inBounds = neighbour.x >= 0
      && neighbour.y >= 0
      && neighbour.x < tacticalWizardTestMap.width
      && neighbour.y < tacticalWizardTestMap.height;
    return count + (!inBounds || !isWalkable(tacticalWizardNavigationGrid, neighbour) ? 1 : 0);
  }, 0);
}

function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-9 ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
}

function toCell(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))),
  };
}

function clonePoint(point: GridPoint | null): GridPoint | null {
  return point === null ? null : { ...point };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
