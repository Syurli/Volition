import { findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint, type NavigationGrid } from './navigation';

export type RecoverySafetyBand = 'stable' | 'pressured' | 'unsafe';
export type RecoverySafetyDecision = 'none' | 'continue' | 'pause' | 'reposition' | 'abort';

export interface RecoverySecurityCandidateInput {
  readonly grid: NavigationGrid;
  readonly casualty: GridPoint;
  readonly security: GridPoint;
  readonly rescuer: GridPoint;
  readonly threat: GridPoint | null;
  readonly failedCells: ReadonlySet<string>;
}

export interface RecoverySecurityCandidate {
  readonly point: GridPoint;
  readonly score: number;
  readonly hasThreatLos: boolean;
  readonly fireLaneClear: boolean;
  readonly pathLength: number;
}

export const RECOVERY_SECURITY_ARRIVAL = 1;
export const RECOVERY_SECURITY_MIN_DISTANCE = 2.2;
export const RECOVERY_SECURITY_MAX_DISTANCE = 5.5;
export const RECOVERY_SECURITY_DESIRED_DISTANCE = 3.5;
export const RECOVERY_SECURITY_SEARCH_RADIUS = 6;
export const RECOVERY_WEAPON_READY_ROUNDS = 3;
export const FRIENDLY_LANE_RADIUS = 0.68;
export const RECOVERY_PRESSURE_PRESSURED = 0.45;
export const RECOVERY_PRESSURE_UNSAFE = 0.8;
export const RECOVERY_UNSAFE_ABORT_TICKS = 4;
export const RECOVERY_DEADLOCK_TICKS = 4;
export const RECOVERY_MAX_STALL_REPLANS = 3;

export function classifyRecoveryPressure(pressure: number): RecoverySafetyBand {
  if (pressure >= RECOVERY_PRESSURE_UNSAFE) return 'unsafe';
  if (pressure >= RECOVERY_PRESSURE_PRESSURED) return 'pressured';
  return 'stable';
}

export function recoveryDecision(band: RecoverySafetyBand, unsafeTicks: number): RecoverySafetyDecision {
  if (band === 'unsafe') return unsafeTicks >= RECOVERY_UNSAFE_ABORT_TICKS ? 'abort' : 'reposition';
  if (band === 'pressured') return 'pause';
  return 'continue';
}

export function selectRecoverySecurityPoint(input: RecoverySecurityCandidateInput): RecoverySecurityCandidate | null {
  const center = navCell(input.casualty, input.grid);
  const start = navCell(input.security, input.grid);
  const candidates: RecoverySecurityCandidate[] = [];
  for (let y = center.y - RECOVERY_SECURITY_SEARCH_RADIUS; y <= center.y + RECOVERY_SECURITY_SEARCH_RADIUS; y += 1) {
    for (let x = center.x - RECOVERY_SECURITY_SEARCH_RADIUS; x <= center.x + RECOVERY_SECURITY_SEARCH_RADIUS; x += 1) {
      const point = { x, y };
      if (!isWalkable(input.grid, point) || input.failedCells.has(gridKey(point))) continue;
      const casualtyDistance = distance(point, input.casualty);
      if (casualtyDistance < RECOVERY_SECURITY_MIN_DISTANCE || casualtyDistance > RECOVERY_SECURITY_MAX_DISTANCE) continue;
      const path = findPath(input.grid, start, point);
      if (path.length === 0) continue;
      const hasThreatLos = input.threat === null ? false : hasLineOfSight(input.grid, point, navCell(input.threat, input.grid));
      const fireLaneClear = input.threat === null || (
        pointSegmentDistance(input.casualty, point, input.threat) > FRIENDLY_LANE_RADIUS
        && pointSegmentDistance(input.rescuer, point, input.threat) > FRIENDLY_LANE_RADIUS
      );
      const spacingPenalty = Math.abs(casualtyDistance - RECOVERY_SECURITY_DESIRED_DISTANCE) * 2.2;
      const pathPenalty = Math.max(0, path.length - 1) * 0.18;
      const losBonus = input.threat === null ? 0 : hasThreatLos ? 7 : -3;
      const laneBonus = fireLaneClear ? 4 : -8;
      candidates.push({ point, score: losBonus + laneBonus - spacingPenalty - pathPenalty, hasThreatLos, fireLaneClear, pathLength: path.length });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.pathLength - right.pathLength || left.point.y - right.point.y || left.point.x - right.point.x);
  return candidates[0] ?? null;
}

export function recoveryFireLaneClear(from: GridPoint, to: GridPoint, friendPositions: readonly GridPoint[]): boolean {
  return friendPositions.every((friend) => pointSegmentDistance(friend, from, to) > FRIENDLY_LANE_RADIUS);
}

export function pointSegmentDistance(point: GridPoint, start: GridPoint, end: GridPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
}

function navCell(point: GridPoint, grid: NavigationGrid): GridPoint {
  return {
    x: Math.max(0, Math.min(grid.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(grid.height - 1, Math.round(point.y))),
  };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
