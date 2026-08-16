import { findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint, type NavigationGrid } from './navigation';

export type FirePressureBand = 'stable' | 'pressured' | 'suppressed' | 'pinned';
export type PressureTacticalAction = 'none' | 'trade_fire' | 'reposition' | 'flank' | 'regroup' | 'assault';
export type PressureLocalEffect = 'normal' | 'short_peek' | 'cover_bound' | 'pinned_hold';

export interface PressureProfileLike {
  readonly id: string;
  readonly mindset: 'tactical_human' | 'feral' | 'machine';
  readonly aggression: number;
  readonly suppressionTolerance: number;
  readonly flankBias: number;
  readonly repositionBias: number;
  readonly coordination: number;
  readonly holdGroundBias: number;
  readonly counterManeuverBias: number;
  readonly breakContactBias: number;
}

export interface PressureProposalInput {
  readonly band: FirePressureBand;
  readonly pressure: number;
  readonly pressuredAgentId: string;
  readonly livingCount: number;
  readonly pressuredCount: number;
  readonly currentTactic: string;
  readonly profile: PressureProfileLike;
  readonly roll: number;
}

export interface PressureResponseProposal {
  readonly action: PressureTacticalAction;
  readonly pressuredAgentId: string;
  readonly reason: string;
}

export interface PressureResponseLease {
  readonly id: string;
  readonly action: PressureTacticalAction;
  readonly pressuredAgentId: string;
  readonly maneuverAgentId: string | null;
  readonly supportAgentId: string | null;
  readonly origin: GridPoint | null;
  readonly target: GridPoint | null;
  readonly startedTick: number;
  readonly untilTick: number;
  readonly startedPressure: number;
  readonly startedBand: FirePressureBand;
  readonly expectedTactic: string | null;
  readonly worldRevision: number;
  readonly reason: string;
}

export interface RepositionCandidate {
  readonly point: GridPoint;
  readonly score: number;
  readonly pathExposureCells: number;
  readonly distance: number;
  readonly coveredFromThreat: boolean;
}

export function nextPressureBand(current: FirePressureBand, pressure: number, tolerance: number): FirePressureBand {
  const t = clamp01(tolerance);
  const enterPressured = 0.22 + t * 0.08;
  const exitPressured = 0.14 + t * 0.06;
  const enterSuppressed = 0.46 + t * 0.18;
  const exitSuppressed = 0.34 + t * 0.12;
  const enterPinned = 0.7 + t * 0.17;
  const exitPinned = 0.56 + t * 0.12;

  if (current === 'pinned') {
    if (pressure >= exitPinned) return 'pinned';
    return pressure >= exitSuppressed ? 'suppressed' : pressure >= exitPressured ? 'pressured' : 'stable';
  }
  if (current === 'suppressed') {
    if (pressure >= enterPinned) return 'pinned';
    if (pressure >= exitSuppressed) return 'suppressed';
    return pressure >= exitPressured ? 'pressured' : 'stable';
  }
  if (current === 'pressured') {
    if (pressure >= enterPinned) return 'pinned';
    if (pressure >= enterSuppressed) return 'suppressed';
    return pressure >= exitPressured ? 'pressured' : 'stable';
  }
  if (pressure >= enterPinned) return 'pinned';
  if (pressure >= enterSuppressed) return 'suppressed';
  if (pressure >= enterPressured) return 'pressured';
  return 'stable';
}

export function localEffectForBand(band: FirePressureBand): PressureLocalEffect {
  if (band === 'pressured') return 'short_peek';
  if (band === 'suppressed') return 'cover_bound';
  if (band === 'pinned') return 'pinned_hold';
  return 'normal';
}

export function choosePressureProposal(input: PressureProposalInput): PressureResponseProposal {
  const { profile, band, livingCount, pressuredCount, currentTactic } = input;
  const stableTactic = currentTactic === 'flank' || currentTactic === 'crossfire' || currentTactic === 'assault';
  let action: PressureTacticalAction = 'reposition';

  if (profile.mindset === 'feral') {
    action = livingCount >= 2 && input.roll < profile.counterManeuverBias ? 'flank' : 'assault';
  } else if (profile.mindset === 'machine') {
    const hold = profile.holdGroundBias * profile.suppressionTolerance;
    action = input.roll < hold ? 'trade_fire' : profile.repositionBias >= 0.45 ? 'reposition' : 'trade_fire';
  } else if (band === 'pinned' && pressuredCount >= Math.max(2, Math.ceil(livingCount * 0.66))) {
    action = profile.breakContactBias >= 0.45 ? 'regroup' : 'reposition';
  } else if (stableTactic && band !== 'pinned') {
    action = profile.holdGroundBias >= 0.45 ? 'trade_fire' : 'reposition';
  } else {
    const holdChance = profile.holdGroundBias * profile.aggression * (band === 'pinned' ? 0.18 : 0.4);
    const counterChance = profile.counterManeuverBias * (livingCount >= 2 ? 0.45 : 0);
    if (input.roll < holdChance) action = 'trade_fire';
    else if (input.roll < holdChance + counterChance && livingCount >= 2) action = 'flank';
    else if (band === 'pinned' && profile.breakContactBias > profile.repositionBias) action = 'regroup';
    else action = 'reposition';
  }

  return {
    action,
    pressuredAgentId: input.pressuredAgentId,
    reason: pressureReason(action, band, input.pressure, profile),
  };
}

export function selectUnderFireReposition(
  grid: NavigationGrid,
  origin: GridPoint,
  threatOrigin: GridPoint,
  squadMatePositions: readonly GridPoint[],
  minDisplacement = 3.5,
  maxRadius = 8,
): RepositionCandidate | null {
  const start = rounded(origin);
  const threat = rounded(threatOrigin);
  const candidates: RepositionCandidate[] = [];
  const minX = Math.max(0, start.x - maxRadius);
  const maxX = Math.min(grid.width - 1, start.x + maxRadius);
  const minY = Math.max(0, start.y - maxRadius);
  const maxY = Math.min(grid.height - 1, start.y + maxRadius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const point = { x, y };
      if (!isWalkable(grid, point)) continue;
      const displacement = distance(start, point);
      if (displacement < minDisplacement || displacement > maxRadius + 0.01) continue;
      const path = findPath(grid, start, point);
      if (path.length === 0) continue;
      const exposure = path.reduce((count, cell) => count + (hasLineOfSight(grid, threat, cell) ? 1 : 0), 0);
      const coveredFromThreat = !hasLineOfSight(grid, threat, point);
      const coverAdjacency = adjacentBlockedCount(grid, point);
      const lateral = lateralDisplacementScore(start, threat, point);
      const cohesionPenalty = squadMatePositions.length === 0
        ? 0
        : Math.max(0, Math.min(...squadMatePositions.map((mate) => distance(point, mate))) - 8) * 1.4;
      const score = (coveredFromThreat ? 14 : -4)
        + coverAdjacency * 3.2
        + lateral * 5
        + Math.min(8, displacement) * 0.65
        - exposure * 1.65
        - path.length * 0.16
        - cohesionPenalty;
      candidates.push({ point, score, pathExposureCells: exposure, distance: displacement, coveredFromThreat });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.pathExposureCells - b.pathExposureCells || b.distance - a.distance || a.point.y - b.point.y || a.point.x - b.point.x);
  return candidates[0] ?? null;
}

export function leaseStillOwnsResponse(lease: PressureResponseLease, logicalTick: number): boolean {
  return logicalTick <= lease.untilTick;
}

export function deterministicPressureRoll(id: string, a: number, b: number): number {
  let hash = 2166136261;
  const source = `${id}:${a}:${b}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function pressureReason(action: PressureTacticalAction, band: FirePressureBand, pressure: number, profile: PressureProfileLike): string {
  const level = `${band} incoming-fire pressure ${pressure.toFixed(2)}`;
  if (action === 'trade_fire') return `${level}; ${profile.id} deliberately holds the current geometry for a bounded exchange lease.`;
  if (action === 'flank') return `${level}; the pressured firing line is held by support while one stable maneuver element commits to a flank.`;
  if (action === 'reposition') return `${level}; the locally pressured member needs materially different cover geometry before resuming normal doctrine.`;
  if (action === 'regroup') return `${level}; pressure is distributed across the element, so the squad contracts instead of repeatedly rotating exposed roles.`;
  if (action === 'assault') return `${level}; ${profile.mindset} converts danger into aggressive closing rather than human cover discipline.`;
  return level;
}

function rounded(point: GridPoint): GridPoint { return { x: Math.round(point.x), y: Math.round(point.y) }; }
function distance(a: GridPoint, b: GridPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

function adjacentBlockedCount(grid: NavigationGrid, point: GridPoint): number {
  const neighbors = [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 },
  ];
  return neighbors.reduce((count, cell) => count + (!isWalkable(grid, cell) || grid.blocked.has(gridKey(cell)) ? 1 : 0), 0);
}

function lateralDisplacementScore(origin: GridPoint, threat: GridPoint, candidate: GridPoint): number {
  const incoming = normalized({ x: origin.x - threat.x, y: origin.y - threat.y });
  const move = normalized({ x: candidate.x - origin.x, y: candidate.y - origin.y });
  return Math.abs(incoming.x * move.y - incoming.y * move.x);
}

function normalized(value: GridPoint): GridPoint {
  const length = Math.hypot(value.x, value.y);
  return length <= 1e-6 ? { x: 1, y: 0 } : { x: value.x / length, y: value.y / length };
}
