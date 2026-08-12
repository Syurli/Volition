import { gridKey, isWalkable, type GridPoint, type NavigationGrid } from './navigation';

export interface FireLane {
  readonly ownerId: string;
  readonly from: GridPoint;
  readonly to: GridPoint;
  readonly clearance: number;
}

export interface SearchPattern {
  readonly waypoints: readonly GridPoint[];
  readonly lookOffsetsDegrees: readonly number[];
}

export function findFriendlyInFireLane(
  shooterId: string,
  from: GridPoint,
  to: GridPoint,
  members: readonly { readonly id: string; readonly position: GridPoint }[],
  clearance = 0.85,
): string | null {
  const segmentLength = distance(from, to);
  if (segmentLength < 0.001) return null;
  for (const member of members) {
    if (member.id === shooterId) continue;
    const projection = segmentProjection(member.position, from, to);
    if (projection <= 0.04 || projection >= 0.96) continue;
    if (distanceToSegment(member.position, from, to) <= clearance) return member.id;
  }
  return null;
}

export function buildFireLaneBlockedCells(
  grid: NavigationGrid,
  lanes: readonly FireLane[],
  excludedOwnerId: string,
): ReadonlySet<string> {
  const blocked = new Set<string>();
  for (const lane of lanes) {
    if (lane.ownerId === excludedOwnerId) continue;
    for (let y = 0; y < grid.height; y += 1) for (let x = 0; x < grid.width; x += 1) {
      const point = { x, y };
      if (!isWalkable(grid, point)) continue;
      const projection = segmentProjection(point, lane.from, lane.to);
      if (projection <= 0.08 || projection >= 0.94) continue;
      if (distanceToSegment(point, lane.from, lane.to) <= lane.clearance) blocked.add(gridKey(point));
    }
  }
  return blocked;
}

export function makeSearchPattern(
  grid: NavigationGrid,
  lkp: GridPoint,
  agentIndex: number,
  side: -1 | 1,
): SearchPattern {
  const patterns = [
    { angles: [side * 38, side * 82, side * 126], ranges: [3.5, 5.5, 7] },
    { angles: [-side * 34, -side * 76, -side * 118], ranges: [3.5, 5.5, 7] },
    { angles: [168, -168, 142], ranges: [6.5, 7.5, 8] },
  ] as const;
  const pattern = patterns[Math.max(0, Math.min(patterns.length - 1, agentIndex))]!;
  const reserved = new Set<string>();
  const waypoints: GridPoint[] = [];
  for (let index = 0; index < pattern.angles.length; index += 1) {
    const desired = polarPoint(lkp, pattern.angles[index]!, pattern.ranges[index]!);
    const point = nearestWalkable(grid, desired, reserved, 4);
    if (point !== null) {
      waypoints.push(point);
      reserved.add(gridKey(point));
    }
  }
  if (waypoints.length === 0) {
    const fallback = nearestWalkable(grid, lkp, reserved, 5);
    if (fallback !== null) waypoints.push(fallback);
  }
  return {
    waypoints,
    lookOffsetsDegrees: agentIndex === 2 ? [-80, 0, 80, 180] : [-78, -24, 30, 84],
  };
}

export function lookPoint(origin: GridPoint, focus: GridPoint, offsetDegrees: number, distanceValue = 5): GridPoint {
  const base = Math.atan2(focus.y - origin.y, focus.x - origin.x);
  const angle = base + offsetDegrees * Math.PI / 180;
  return { x: origin.x + Math.cos(angle) * distanceValue, y: origin.y + Math.sin(angle) * distanceValue };
}

export function angleSeparationDegrees(aFrom: GridPoint, aTo: GridPoint, bFrom: GridPoint, bTo: GridPoint): number {
  const a = Math.atan2(aTo.y - aFrom.y, aTo.x - aFrom.x);
  const b = Math.atan2(bTo.y - bFrom.y, bTo.x - bFrom.x);
  let delta = Math.abs(a - b);
  while (delta > Math.PI) delta = Math.abs(delta - Math.PI * 2);
  return delta * 180 / Math.PI;
}

export function distanceToSegment(point: GridPoint, from: GridPoint, to: GridPoint): number {
  const projection = Math.max(0, Math.min(1, segmentProjection(point, from, to)));
  const closest = { x: from.x + (to.x - from.x) * projection, y: from.y + (to.y - from.y) * projection };
  return distance(point, closest);
}

function segmentProjection(point: GridPoint, from: GridPoint, to: GridPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const denominator = dx * dx + dy * dy;
  if (denominator <= 1e-9) return 0;
  return ((point.x - from.x) * dx + (point.y - from.y) * dy) / denominator;
}

function nearestWalkable(grid: NavigationGrid, desired: GridPoint, reserved: ReadonlySet<string>, radius: number): GridPoint | null {
  const center = { x: Math.round(desired.x), y: Math.round(desired.y) };
  const candidates: { point: GridPoint; score: number }[] = [];
  for (let y = center.y - radius; y <= center.y + radius; y += 1) for (let x = center.x - radius; x <= center.x + radius; x += 1) {
    const point = { x, y };
    if (reserved.has(gridKey(point)) || !isWalkable(grid, point)) continue;
    candidates.push({ point, score: distance(point, desired) });
  }
  return candidates.sort((left, right) => left.score - right.score || left.point.y - right.point.y || left.point.x - right.point.x)[0]?.point ?? null;
}

function polarPoint(origin: GridPoint, degrees: number, range: number): GridPoint {
  const angle = degrees * Math.PI / 180;
  return { x: origin.x + Math.cos(angle) * range, y: origin.y + Math.sin(angle) * range };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
