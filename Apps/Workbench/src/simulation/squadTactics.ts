import { findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint, type NavigationGrid } from './navigation';

export type SquadRole = 'patrol' | 'suppressor' | 'mover' | 'observer';

export interface CoverSlot {
  readonly id: string;
  readonly position: GridPoint;
  readonly peekPosition: GridPoint;
  readonly threatDistance: number;
}

export type CoverSelectionMode = 'advance' | 'support';

/**
 * Discovers simple host-owned cover slots around blocked cells. A cover cell must be hidden from the
 * threat while an adjacent peek cell can see it. This is intentionally a Workbench reference
 * implementation: production hosts can replace it with EQS/NavMesh/engine-native cover queries.
 */
export function discoverCoverSlots(
  grid: NavigationGrid,
  threat: GridPoint,
  minThreatDistance = 3,
  maxThreatDistance = 20,
): readonly CoverSlot[] {
  const result: CoverSlot[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const position = { x, y };
      if (!isWalkable(grid, position)) continue;
      const threatDistance = distance(position, threat);
      if (threatDistance < minThreatDistance || threatDistance > maxThreatDistance) continue;
      if (hasLineOfSight(grid, position, threat)) continue;
      const adjacent = neighbors(position);
      if (!adjacent.some((point) => grid.blocked.has(gridKey(point)))) continue;
      const peekPosition = adjacent
        .filter((point) => isWalkable(grid, point) && hasLineOfSight(grid, point, threat))
        .sort((left, right) => distance(left, threat) - distance(right, threat) || left.y - right.y || left.x - right.x)[0];
      if (peekPosition === undefined) continue;
      result.push({
        id: `cover:${x},${y}->${peekPosition.x},${peekPosition.y}`,
        position,
        peekPosition,
        threatDistance,
      });
    }
  }
  return result.sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x || left.peekPosition.y - right.peekPosition.y || left.peekPosition.x - right.peekPosition.x);
}

export function selectCoverSlot(
  grid: NavigationGrid,
  slots: readonly CoverSlot[],
  from: GridPoint,
  threat: GridPoint,
  reservedSlotIds: ReadonlySet<string>,
  mode: CoverSelectionMode,
): CoverSlot | null {
  const currentThreatDistance = distance(from, threat);
  const scored: { readonly slot: CoverSlot; readonly score: number }[] = [];
  for (const slot of slots) {
    if (reservedSlotIds.has(slot.id)) continue;
    const path = findPath(grid, from, slot.position);
    if (path.length === 0) continue;
    if (mode === 'advance' && path.length <= 1) continue;
    const rangePenalty = Math.abs(slot.threatDistance - (mode === 'advance' ? 7 : 10)) * 0.8;
    const progress = currentThreatDistance - slot.threatDistance;
    const progressTerm = mode === 'advance' ? -Math.max(-6, Math.min(8, progress)) * 1.35 : Math.abs(progress) * 0.18;
    const pathCost = Math.max(0, path.length - 1);
    scored.push({ slot, score: pathCost + rangePenalty + progressTerm });
  }
  return scored.sort((left, right) => left.score - right.score || left.slot.id.localeCompare(right.slot.id, 'en'))[0]?.slot ?? null;
}

export function occupiedPositionsAreUnique(points: readonly GridPoint[]): boolean {
  return new Set(points.map(gridKey)).size === points.length;
}

function neighbors(point: GridPoint): readonly GridPoint[] {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y - 1 },
  ];
}

function distance(left: GridPoint, right: GridPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
