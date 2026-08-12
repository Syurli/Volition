import { findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint, type NavigationGrid } from './navigation';

export interface SectorQuery {
  readonly angleOffsetDegrees: number;
  readonly angleToleranceDegrees: number;
  readonly minRange: number;
  readonly maxRange: number;
  readonly desiredRange: number;
  readonly requireLineOfSight?: boolean;
  readonly preferCovered?: boolean;
  readonly minMoveDistance?: number;
}

/**
 * Picks a reachable point in a deliberate sector around the threat. The reference Simulation Host owns
 * this geometry; engine Bridges can replace it with EQS/NavMesh queries without changing doctrine facts.
 */
export function selectSectorPoint(
  grid: NavigationGrid,
  from: GridPoint,
  threat: GridPoint,
  squadOrigin: GridPoint,
  reserved: ReadonlySet<string>,
  query: SectorQuery,
): GridPoint | null {
  const baseAngle = Math.atan2(squadOrigin.y - threat.y, squadOrigin.x - threat.x);
  const desiredAngle = normalizeAngle(baseAngle + query.angleOffsetDegrees * Math.PI / 180);
  const scored: { readonly point: GridPoint; readonly score: number }[] = [];

  for (let y = 0; y < grid.height; y += 1) for (let x = 0; x < grid.width; x += 1) {
    const point = { x, y }; const key = gridKey(point);
    if (reserved.has(key) || !isWalkable(grid, point)) continue;
    const range = distance(point, threat);
    if (range < query.minRange || range > query.maxRange) continue;
    const moved = distance(from, point);
    if (moved < (query.minMoveDistance ?? 0)) continue;
    const los = hasLineOfSight(grid, point, threat);
    if (query.requireLineOfSight === true && !los) continue;
    const angle = Math.atan2(point.y - threat.y, point.x - threat.x);
    const angleDelta = Math.abs(shortestAngle(angle, desiredAngle)) * 180 / Math.PI;
    if (angleDelta > query.angleToleranceDegrees) continue;
    const path = findPath(grid, from, point);
    if (path.length === 0) continue;
    const coverTerm = query.preferCovered === true ? (los ? 4 : -2.5) : 0;
    const score = Math.max(0, path.length - 1) * 0.42
      + Math.abs(range - query.desiredRange) * 1.25
      + angleDelta * 0.075
      + coverTerm;
    scored.push({ point, score });
  }

  return scored.sort((a, b) => a.score - b.score || a.point.y - b.point.y || a.point.x - b.point.x)[0]?.point ?? null;
}

export function centroid(points: readonly GridPoint[]): GridPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
}

export function pairwiseSpread(points: readonly GridPoint[]): number {
  let total = 0; let pairs = 0;
  for (let i = 0; i < points.length; i += 1) for (let j = i + 1; j < points.length; j += 1) { total += distance(points[i]!, points[j]!); pairs += 1; }
  return pairs === 0 ? 0 : total / pairs;
}

export function sideOfThreat(point: GridPoint, threat: GridPoint, origin: GridPoint): number {
  const base = { x: origin.x - threat.x, y: origin.y - threat.y };
  const relative = { x: point.x - threat.x, y: point.y - threat.y };
  return Math.sign(base.x * relative.y - base.y * relative.x);
}

function distance(a: GridPoint, b: GridPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function normalizeAngle(value: number): number { let angle = value; while (angle > Math.PI) angle -= Math.PI * 2; while (angle < -Math.PI) angle += Math.PI * 2; return angle; }
function shortestAngle(a: number, b: number): number { return normalizeAngle(a - b); }
