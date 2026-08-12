import { findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint, type NavigationGrid } from './navigation';

export type SquadRole = 'patrol' | 'suppressor' | 'mover' | 'observer' | 'flanker' | 'assaulter' | 'support';

export interface CoverSlot {
  readonly id: string;
  readonly position: GridPoint;
  readonly peekPosition: GridPoint;
  readonly threatDistance: number;
}

export type CoverSelectionMode = 'advance' | 'support' | 'flank';

/** Host-owned reference cover query. Production Bridges may replace this with EQS/NavMesh/etc. */
export function discoverCoverSlots(grid: NavigationGrid, threat: GridPoint, minThreatDistance = 3, maxThreatDistance = 20): readonly CoverSlot[] {
  const result: CoverSlot[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const position = { x, y }; if (!isWalkable(grid, position)) continue;
      const threatDistance = distance(position, threat); if (threatDistance < minThreatDistance || threatDistance > maxThreatDistance || hasLineOfSight(grid, position, threat)) continue;
      const adjacent = neighbors(position); if (!adjacent.some((point) => grid.blocked.has(gridKey(point)))) continue;
      const peekPosition = adjacent.filter((point) => isWalkable(grid, point) && hasLineOfSight(grid, point, threat)).sort((left, right) => distance(left, threat) - distance(right, threat) || left.y - right.y || left.x - right.x)[0];
      if (peekPosition !== undefined) result.push({ id: `cover:${x},${y}->${peekPosition.x},${peekPosition.y}`, position, peekPosition, threatDistance });
    }
  }
  return result.sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x || left.peekPosition.y - right.peekPosition.y || left.peekPosition.x - right.peekPosition.x);
}

export function selectCoverSlot(grid: NavigationGrid, slots: readonly CoverSlot[], from: GridPoint, threat: GridPoint, reservedSlotIds: ReadonlySet<string>, mode: CoverSelectionMode, sideBias = 0): CoverSlot | null {
  const currentThreatDistance = distance(from, threat); const approach = normalize({ x: from.x - threat.x, y: from.y - threat.y });
  const scored: { readonly slot: CoverSlot; readonly score: number }[] = [];
  for (const slot of slots) {
    if (reservedSlotIds.has(slot.id)) continue;
    const path = findPath(grid, from, slot.position); if (path.length === 0 || ((mode === 'advance' || mode === 'flank') && path.length <= 1)) continue;
    const rangeTarget = mode === 'advance' ? 7 : mode === 'flank' ? 6 : 10;
    const rangePenalty = Math.abs(slot.threatDistance - rangeTarget) * 0.8;
    const progress = currentThreatDistance - slot.threatDistance;
    const progressTerm = mode === 'advance' ? -Math.max(-6, Math.min(8, progress)) * 1.35 : mode === 'flank' ? -Math.max(-4, Math.min(6, progress)) * 0.55 : Math.abs(progress) * 0.18;
    const relative = { x: slot.position.x - threat.x, y: slot.position.y - threat.y };
    const lateral = approach.x * relative.y - approach.y * relative.x;
    const flankTerm = mode === 'flank' ? -Math.abs(lateral) * 0.75 + (sideBias === 0 ? 0 : Math.sign(lateral || sideBias) === Math.sign(sideBias) ? -3 : 4) : 0;
    scored.push({ slot, score: Math.max(0, path.length - 1) + rangePenalty + progressTerm + flankTerm });
  }
  return scored.sort((left, right) => left.score - right.score || left.slot.id.localeCompare(right.slot.id, 'en'))[0]?.slot ?? null;
}

/** Selects an exposed but reachable short-range assault position around the threat. */
export function selectAssaultPosition(grid: NavigationGrid, from: GridPoint, threat: GridPoint, reservedCells: ReadonlySet<string>, sideBias: number): GridPoint | null {
  const approach = normalize({ x: from.x - threat.x, y: from.y - threat.y });
  const scored: { readonly point: GridPoint; readonly score: number }[] = [];
  for (let y = 0; y < grid.height; y += 1) for (let x = 0; x < grid.width; x += 1) {
    const point = { x, y }; const key = gridKey(point); if (reservedCells.has(key) || !isWalkable(grid, point)) continue;
    const range = distance(point, threat); if (range < 2.5 || range > 5 || !hasLineOfSight(grid, point, threat)) continue;
    const path = findPath(grid, from, point); if (path.length === 0) continue;
    const relative = { x: point.x - threat.x, y: point.y - threat.y }; const lateral = approach.x * relative.y - approach.y * relative.x;
    const sidePenalty = Math.sign(lateral || sideBias) === Math.sign(sideBias || 1) ? 0 : 5;
    scored.push({ point, score: Math.max(0, path.length - 1) + Math.abs(range - 3.5) * 1.4 + sidePenalty - Math.abs(lateral) * 0.18 });
  }
  return scored.sort((left, right) => left.score - right.score || left.point.y - right.point.y || left.point.x - right.point.x)[0]?.point ?? null;
}

export function occupiedPositionsAreUnique(points: readonly GridPoint[]): boolean { return new Set(points.map(gridKey)).size === points.length; }
function neighbors(point: GridPoint): readonly GridPoint[] { return [{ x: point.x + 1, y: point.y }, { x: point.x, y: point.y + 1 }, { x: point.x - 1, y: point.y }, { x: point.x, y: point.y - 1 }]; }
function distance(left: GridPoint, right: GridPoint): number { return Math.hypot(left.x - right.x, left.y - right.y); }
function normalize(point: GridPoint): GridPoint { const length = Math.hypot(point.x, point.y) || 1; return { x: point.x / length, y: point.y / length }; }
