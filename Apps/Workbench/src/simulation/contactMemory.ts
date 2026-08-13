import { gridKey, isWalkable, type GridPoint, type NavigationGrid } from './navigation';

export type ContactTargetKind =
  | 'confirmed_visual'
  | 'fresh_lkp'
  | 'stale_lkp'
  | 'cleared_lkp'
  | 'coarse_fire_sector'
  | 'search_frontier'
  | 'unknown';

export interface ContactTargetContext {
  readonly target: GridPoint;
  readonly currentTick: number;
  readonly lastConfirmedTick: number | null;
  readonly lastConfirmedPosition: GridPoint | null;
  readonly lkpCleared: boolean;
  readonly confirmedVisiblePosition?: GridPoint | null;
  readonly coarseFireSector?: GridPoint | null;
  readonly searchFrontier?: readonly GridPoint[];
  readonly freshLkpTicks?: number;
}

export function deriveEgressDirection(previous: GridPoint | null, last: GridPoint | null): GridPoint | null {
  if (previous === null || last === null) return null;
  const dx = last.x - previous.x;
  const dy = last.y - previous.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.35) return null;
  return { x: dx / length, y: dy / length };
}

export function classifyContactTarget(context: ContactTargetContext): ContactTargetKind {
  const {
    target,
    currentTick,
    lastConfirmedTick,
    lastConfirmedPosition,
    lkpCleared,
    confirmedVisiblePosition = null,
    coarseFireSector = null,
    searchFrontier = [],
    freshLkpTicks = 6,
  } = context;

  if (confirmedVisiblePosition !== null && near(target, confirmedVisiblePosition, 0.9)) return 'confirmed_visual';
  if (coarseFireSector !== null && near(target, coarseFireSector, 1.1)) return 'coarse_fire_sector';
  if (searchFrontier.some((point) => near(target, point, 1.1))) return 'search_frontier';
  if (lastConfirmedPosition !== null && near(target, lastConfirmedPosition, 1.1)) {
    if (lkpCleared) return 'cleared_lkp';
    if (lastConfirmedTick !== null && currentTick - lastConfirmedTick <= freshLkpTicks) return 'fresh_lkp';
    return 'stale_lkp';
  }
  return 'unknown';
}

export function buildDirectionalSearchWaypoints(
  grid: NavigationGrid,
  lkp: GridPoint,
  direction: GridPoint | null,
  laneIndex: 0 | 1 | 2,
  cleared: ReadonlySet<string>,
): readonly GridPoint[] {
  if (direction === null) return [];
  const forward = normalize(direction);
  const right = { x: -forward.y, y: forward.x };
  const templates = laneIndex === 0
    ? [
      { forward: 2.8, lateral: -1.4 },
      { forward: 5.2, lateral: -2.4 },
      { forward: 7.6, lateral: -1.2 },
      { forward: 9.4, lateral: 1.6 },
    ]
    : laneIndex === 1
      ? [
        { forward: 2.8, lateral: 1.4 },
        { forward: 5.2, lateral: 2.4 },
        { forward: 7.6, lateral: 1.2 },
        { forward: 9.4, lateral: -1.6 },
      ]
      : [
        { forward: -2.5, lateral: 3.8 },
        { forward: -1.0, lateral: -4.3 },
      ];

  const reserved = new Set<string>(cleared);
  const result: GridPoint[] = [];
  for (const template of templates) {
    const desired = {
      x: lkp.x + forward.x * template.forward + right.x * template.lateral,
      y: lkp.y + forward.y * template.forward + right.y * template.lateral,
    };
    const point = nearestWalkable(grid, desired, reserved, laneIndex === 2 ? 3 : 4);
    if (point === null) continue;
    result.push(point);
    reserved.add(gridKey(point));
  }
  return result;
}

export function contactUncertaintyRadius(lostTicks: number, lkpCleared: boolean): number {
  const base = 1.5 + Math.max(0, lostTicks) * 0.28;
  return Math.min(12, base + (lkpCleared ? 2.5 : 0));
}

function nearestWalkable(grid: NavigationGrid, desired: GridPoint, reserved: ReadonlySet<string>, radius: number): GridPoint | null {
  const center = { x: Math.round(desired.x), y: Math.round(desired.y) };
  const candidates: Array<{ readonly point: GridPoint; readonly score: number }> = [];
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      const point = { x, y };
      if (!isWalkable(grid, point) || reserved.has(gridKey(point))) continue;
      candidates.push({ point, score: distance(point, desired) });
    }
  }
  candidates.sort((left, right) => left.score - right.score || left.point.y - right.point.y || left.point.x - right.point.x);
  return candidates[0]?.point ?? null;
}

function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-9 ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
}

function near(a: GridPoint, b: GridPoint, radius: number): boolean {
  return distance(a, b) <= radius;
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
