import { TacticalWizardRuntime, type TacticalWizardSimulationState } from './tacticalWizardRuntime';
import type { GridPoint } from './navigation';

export * from './tacticalWizardRuntime';
export * from './tacticalWizardHierarchy';
export type {
  BuddyRole,
  CoverState,
  GrenadeKind,
  GrenadeVisual,
  LocomotionMode,
  SimulationOverlaySettings,
  SpecialAction,
  TacticalOpportunityPurpose,
  TacticalTask,
} from './tacticalWizardSimulationV7';

type ThreatEvidenceKind = 'gunshot' | 'bullet_impact' | 'near_miss' | 'hit';

type ThreatEvidenceCounts = Record<ThreatEvidenceKind, number>;

interface ThreatHostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
}

interface ThreatHostAccess {
  members: ThreatHostMember[];
  logicalTick: number;
  alertState: 'idle' | 'pending' | 'active';
  alertSourceId: string | null;
  alertExpiresAt: number;
  sharedLastKnownPosition: GridPoint | null;
  activateSquad: () => void;
  refreshTacticalPlan: () => void;
  log: (...args: any[]) => void;
  pushEvent: (message: string) => void;
}

interface RuntimeThreatAccess {
  readonly tacticalHost: ThreatHostAccess;
  readonly contracts: Map<string, unknown>;
}

const RIFLE_REPORT_HEARING_RADIUS = 28;
const GUNSHOT_EPISODE_GAP_TICKS = 5;
const REPEATED_GUNSHOT_ESCALATION_COUNT = 2;
const BULLET_IMPACT_RADIUS = 3.2;
const NEAR_MISS_RADIUS = 1.6;
const THREAT_EVIDENCE_MEMORY_TICKS = 28;
const COMBAT_ALERT_MEMORY_TICKS = 56;

/**
 * Stable Tactical Wizard simulation entrypoint.
 *
 * The fixed hierarchy runtime deliberately owns execution. This semantic entrypoint
 * restores the missing perception -> contact bridge for hostile rifle fire that was
 * lost when the legacy acoustic/threat overlays were retired. Gunfire evidence is
 * classified here, then promoted into the existing fixed hierarchy alert contract;
 * no retired V8+ behavior layer participates in execution.
 */
export class TacticalWizardSimulation extends TacticalWizardRuntime {
  private gunshotEpisodeLastTick: number | null = null;
  private gunshotEpisodeShots = 0;
  private readonly threatEvidenceCounts: ThreatEvidenceCounts = createThreatEvidenceCounts();
  private readonly threatAffectedAgentIds = new Set<string>();
  private threatLastEvidenceTick: number | null = null;
  private threatLastEvidenceKind: ThreatEvidenceKind | null = null;
  private threatEvidenceBearing: GridPoint | null = null;
  private threatEvidenceSector: GridPoint | null = null;
  private threatResponseEscalations = 0;

  override reset(): TacticalWizardSimulationState {
    const state = super.reset();
    this.resetThreatEvidence();
    return this.decorateThreatAwareness(state);
  }

  override playerFireAt(point: GridPoint): boolean {
    const before = super.getState();
    const fired = super.playerFireAt(point);
    if (!fired) return false;
    this.registerPlayerGunfire(before, point);
    return true;
  }

  override getState(): TacticalWizardSimulationState {
    return this.decorateThreatAwareness(super.getState());
  }

  private registerPlayerGunfire(before: TacticalWizardSimulationState, shotTo: GridPoint): void {
    const living = before.agents.filter((agent) => agent.alive);
    if (living.length === 0) return;

    const tick = before.logicalTick;
    if (this.gunshotEpisodeLastTick === null || tick - this.gunshotEpisodeLastTick > GUNSHOT_EPISODE_GAP_TICKS) {
      this.gunshotEpisodeShots = 0;
    }
    this.gunshotEpisodeLastTick = tick;
    this.gunshotEpisodeShots += 1;

    const listeners = living
      .filter((agent) => distance(agent.position, before.player) <= RIFLE_REPORT_HEARING_RADIUS)
      .sort((left, right) => distance(left.position, before.player) - distance(right.position, before.player) || left.id.localeCompare(right.id, 'en'));
    const endpointOrder = living
      .map((agent) => ({ agent, distance: distance(agent.position, shotTo) }))
      .sort((left, right) => left.distance - right.distance || left.agent.id.localeCompare(right.agent.id, 'en'));
    const trajectoryOrder = living
      .map((agent) => ({ agent, distance: pointSegmentDistance(agent.position, before.player, shotTo) }))
      .sort((left, right) => left.distance - right.distance || left.agent.id.localeCompare(right.agent.id, 'en'));

    const hit = endpointOrder[0]?.distance !== undefined && endpointOrder[0].distance <= 0.85 ? endpointOrder[0].agent : null;
    const nearMiss = hit === null && trajectoryOrder[0]?.distance !== undefined && trajectoryOrder[0].distance <= NEAR_MISS_RADIUS ? trajectoryOrder[0].agent : null;
    const impact = hit === null && nearMiss === null && endpointOrder[0]?.distance !== undefined && endpointOrder[0].distance <= BULLET_IMPACT_RADIUS ? endpointOrder[0].agent : null;
    const acousticObserver = listeners[0] ?? null;

    if (listeners.length > 0) {
      this.recordThreatEvidence('gunshot', tick, listeners.map((agent) => agent.id), acousticObserver?.position ?? null, before.player);
    }

    if (hit !== null) {
      this.recordThreatEvidence('hit', tick, [hit.id], hit.position, before.player);
      this.escalateGunfireContact(hit.id, hit.position, before.player, 'hit');
      return;
    }
    if (nearMiss !== null) {
      this.recordThreatEvidence('near_miss', tick, [nearMiss.id], nearMiss.position, before.player);
      this.escalateGunfireContact(nearMiss.id, nearMiss.position, before.player, 'near_miss');
      return;
    }
    if (impact !== null) {
      this.recordThreatEvidence('bullet_impact', tick, [impact.id], impact.position, before.player);
      this.escalateGunfireContact(impact.id, impact.position, before.player, 'bullet_impact');
      return;
    }
    if (acousticObserver !== null && this.gunshotEpisodeShots >= REPEATED_GUNSHOT_ESCALATION_COUNT) {
      this.escalateGunfireContact(acousticObserver.id, acousticObserver.position, before.player, 'gunshot');
    }
  }

  private recordThreatEvidence(
    kind: ThreatEvidenceKind,
    tick: number,
    affectedAgentIds: readonly string[],
    observerPosition: GridPoint | null,
    sourcePosition: GridPoint,
  ): void {
    this.threatEvidenceCounts[kind] += 1;
    this.threatLastEvidenceTick = tick;
    this.threatLastEvidenceKind = kind;
    for (const id of affectedAgentIds) this.threatAffectedAgentIds.add(id);
    if (observerPosition !== null) {
      this.threatEvidenceBearing = normalizedDelta(observerPosition, sourcePosition);
      this.threatEvidenceSector = estimateThreatSector(observerPosition, sourcePosition);
    }
  }

  private escalateGunfireContact(sourceAgentId: string, observerPosition: GridPoint, sourcePosition: GridPoint, kind: ThreatEvidenceKind): void {
    const runtime = this as unknown as RuntimeThreatAccess;
    const host = runtime.tacticalHost;
    const source = host.members.find((member) => member.id === sourceAgentId) ?? host.members[0];
    if (source === undefined) return;

    const estimatedSector = estimateThreatSector(observerPosition, sourcePosition);
    const newlyEscalated = host.alertState !== 'active';
    if (host.alertSourceId === null || host.alertState === 'idle') host.alertSourceId = source.id;
    if (host.sharedLastKnownPosition === null || host.alertState === 'idle') host.sharedLastKnownPosition = { ...estimatedSector };
    host.alertExpiresAt = Math.max(host.alertExpiresAt, host.logicalTick + COMBAT_ALERT_MEMORY_TICKS);

    if (newlyEscalated) host.activateSquad();
    else host.refreshTacticalPlan();
    runtime.contracts.clear();

    if (newlyEscalated) this.threatResponseEscalations += 1;
    host.pushEvent(`T${host.logicalTick}: hostile rifle ${kind} evidence escalated the squad into combat.`);
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'alert', 'Hostile rifle evidence promoted through perception/contact into the fixed-hierarchy combat alert.', {
      evidenceKind: kind,
      sourceAgentId: source.id,
      episodeShots: this.gunshotEpisodeShots,
      estimatedSector: { ...estimatedSector },
      exactShooterPositionWithheld: true,
      alertEscalated: newlyEscalated,
    });
  }

  private decorateThreatAwareness(state: TacticalWizardSimulationState): TacticalWizardSimulationState {
    const base = state.threatAwareness;
    const ownEvidenceActive = this.threatLastEvidenceTick !== null && state.logicalTick - this.threatLastEvidenceTick <= THREAT_EVIDENCE_MEMORY_TICKS;
    const evidenceCounts: ThreatEvidenceCounts = {
      gunshot: Math.max(base.evidenceCounts.gunshot, this.threatEvidenceCounts.gunshot),
      bullet_impact: Math.max(base.evidenceCounts.bullet_impact, this.threatEvidenceCounts.bullet_impact),
      near_miss: Math.max(base.evidenceCounts.near_miss, this.threatEvidenceCounts.near_miss),
      hit: Math.max(base.evidenceCounts.hit, this.threatEvidenceCounts.hit),
    };
    const baseTick = base.lastEvidenceTick ?? -1;
    const ownTick = this.threatLastEvidenceTick ?? -1;
    const ownIsLatest = ownTick >= baseTick && this.threatLastEvidenceKind !== null;
    const affectedAgentIds = [...new Set([...base.affectedAgentIds, ...this.threatAffectedAgentIds])].sort((left, right) => left.localeCompare(right, 'en'));

    let level = base.level;
    let confidence = base.confidence;
    if (level !== 'confirmed' && ownEvidenceActive) {
      level = state.squad.alertState === 'active' || this.threatResponseEscalations > 0 ? 'threatened' : 'suspicious';
      confidence = level === 'threatened' ? Math.max(confidence, 0.78) : Math.max(confidence, 0.45);
    }

    return {
      ...state,
      threatAwareness: {
        level,
        confidence,
        bearing: ownEvidenceActive && this.threatEvidenceBearing !== null ? { ...this.threatEvidenceBearing } : base.bearing,
        estimatedSector: ownEvidenceActive && this.threatEvidenceSector !== null ? { ...this.threatEvidenceSector } : base.estimatedSector,
        lastEvidenceTick: ownIsLatest ? this.threatLastEvidenceTick : base.lastEvidenceTick,
        lastEvidenceKind: ownIsLatest ? this.threatLastEvidenceKind : base.lastEvidenceKind,
        evidenceCount: evidenceCounts.gunshot + evidenceCounts.bullet_impact + evidenceCounts.near_miss + evidenceCounts.hit,
        evidenceCounts,
        affectedAgentIds,
        responseEscalations: Math.max(base.responseEscalations, this.threatResponseEscalations),
      },
    };
  }

  private resetThreatEvidence(): void {
    this.gunshotEpisodeLastTick = null;
    this.gunshotEpisodeShots = 0;
    this.threatEvidenceCounts.gunshot = 0;
    this.threatEvidenceCounts.bullet_impact = 0;
    this.threatEvidenceCounts.near_miss = 0;
    this.threatEvidenceCounts.hit = 0;
    this.threatAffectedAgentIds.clear();
    this.threatLastEvidenceTick = null;
    this.threatLastEvidenceKind = null;
    this.threatEvidenceBearing = null;
    this.threatEvidenceSector = null;
    this.threatResponseEscalations = 0;
  }
}

function createThreatEvidenceCounts(): ThreatEvidenceCounts {
  return { gunshot: 0, bullet_impact: 0, near_miss: 0, hit: 0 };
}

function pointSegmentDistance(point: GridPoint, start: GridPoint, end: GridPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
}

function estimateThreatSector(observer: GridPoint, source: GridPoint): GridPoint {
  const bearing = normalizedDelta(observer, source);
  const range = distance(observer, source);
  const projectedRange = Math.min(10, Math.max(2, range * 0.7));
  return {
    x: roundHalf(observer.x + bearing.x * projectedRange),
    y: roundHalf(observer.y + bearing.y * projectedRange),
  };
}

function normalizedDelta(from: GridPoint, to: GridPoint): GridPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length <= 1e-6 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}
