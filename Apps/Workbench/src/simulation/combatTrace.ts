import { isWalkable, rasterLine, type GridPoint, type NavigationGrid } from './navigation';

export interface ShotTraceTarget {
  readonly id: string;
  readonly position: GridPoint;
}

export interface GridShotTrace {
  readonly from: GridPoint;
  readonly aimedTo: GridPoint;
  readonly impactPoint: GridPoint;
  readonly blockedByWorld: boolean;
  readonly blockingCell: GridPoint | null;
  readonly hitTargetId: string | null;
}

export function traceGridShot(input: {
  readonly grid: NavigationGrid;
  readonly from: GridPoint;
  readonly aimedTo: GridPoint;
  readonly targets: readonly ShotTraceTarget[];
  readonly hitRadius?: number;
}): GridShotTrace {
  const fromCell = navCell(input.from, input.grid);
  const aimCell = navCell(input.aimedTo, input.grid);
  const cells = rasterLine(fromCell, aimCell);
  const blockingCell = cells.slice(1).find((cell) => !isWalkable(input.grid, cell)) ?? null;
  const aimedDistance = distance(input.from, input.aimedTo);
  const wallDistance = blockingCell === null ? Number.POSITIVE_INFINITY : Math.max(0, distance(input.from, blockingCell) - 0.45);
  const maxTravel = Math.min(aimedDistance, wallDistance);
  const hitRadius = input.hitRadius ?? 0.72;
  const hit = input.targets
    .map((target) => ({ target, ...segmentMetrics(target.position, input.from, input.aimedTo) }))
    .filter((entry) => entry.t >= 0 && entry.t <= 1 && entry.distance <= hitRadius && entry.alongDistance <= maxTravel + 0.05)
    .sort((left, right) => left.alongDistance - right.alongDistance || left.distance - right.distance || left.target.id.localeCompare(right.target.id, 'en'))[0] ?? null;
  const direction = normalize({ x: input.aimedTo.x - input.from.x, y: input.aimedTo.y - input.from.y });
  const impactPoint = hit !== null
    ? { ...hit.target.position }
    : blockingCell !== null
      ? { ...blockingCell }
      : { ...input.aimedTo };
  if (hit === null && blockingCell !== null && maxTravel > 0 && (direction.x !== 0 || direction.y !== 0)) {
    // Keep the visual impact on the wall cell, while hit testing stops before it.
  }
  return {
    from: { ...input.from },
    aimedTo: { ...input.aimedTo },
    impactPoint,
    blockedByWorld: hit === null && blockingCell !== null,
    blockingCell: blockingCell === null ? null : { ...blockingCell },
    hitTargetId: hit?.target.id ?? null,
  };
}

function segmentMetrics(point: GridPoint, start: GridPoint, end: GridPoint): { readonly t: number; readonly distance: number; readonly alongDistance: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) return { t: 0, distance: distance(point, start), alongDistance: 0 };
  const unclamped = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, unclamped));
  const projected = { x: start.x + dx * t, y: start.y + dy * t };
  return { t: unclamped, distance: distance(point, projected), alongDistance: Math.sqrt(lengthSquared) * t };
}

function navCell(point: GridPoint, grid: NavigationGrid): GridPoint {
  return {
    x: Math.max(0, Math.min(grid.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(grid.height - 1, Math.round(point.y))),
  };
}
function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-9 ? { x: 0, y: 0 } : { x: point.x / length, y: point.y / length };
}
function distance(a: GridPoint, b: GridPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
