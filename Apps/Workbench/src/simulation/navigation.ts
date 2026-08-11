export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export interface NavigationGrid {
  readonly width: number;
  readonly height: number;
  readonly blocked: ReadonlySet<string>;
}

export const gridKey = (point: GridPoint): string => `${point.x},${point.y}`;

export function createGrid(width: number, height: number, blocked: readonly GridPoint[]): NavigationGrid {
  return { width, height, blocked: new Set(blocked.map(gridKey)) };
}

export function isWalkable(grid: NavigationGrid, point: GridPoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < grid.width && point.y < grid.height && !grid.blocked.has(gridKey(point));
}

export function findPath(grid: NavigationGrid, start: GridPoint, goal: GridPoint): readonly GridPoint[] {
  if (!isWalkable(grid, start) || !isWalkable(grid, goal)) return [];
  if (start.x === goal.x && start.y === goal.y) return [start];
  const open = new Map<string, { point: GridPoint; g: number; f: number }>();
  const cameFrom = new Map<string, GridPoint>();
  const gScore = new Map<string, number>();
  const startKey = gridKey(start);
  open.set(startKey, { point: start, g: 0, f: heuristic(start, goal) });
  gScore.set(startKey, 0);
  while (open.size > 0) {
    const current = [...open.values()].sort((a, b) => a.f - b.f || a.g - b.g || a.point.y - b.point.y || a.point.x - b.point.x)[0]!;
    const currentKey = gridKey(current.point);
    open.delete(currentKey);
    if (current.point.x === goal.x && current.point.y === goal.y) return reconstructPath(cameFrom, current.point);
    for (const neighbor of neighbors(current.point)) {
      if (!isWalkable(grid, neighbor)) continue;
      const tentative = current.g + 1;
      const neighborKey = gridKey(neighbor);
      if (tentative >= (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(neighborKey, current.point);
      gScore.set(neighborKey, tentative);
      open.set(neighborKey, { point: neighbor, g: tentative, f: tentative + heuristic(neighbor, goal) });
    }
  }
  return [];
}

export function hasLineOfSight(grid: NavigationGrid, from: GridPoint, to: GridPoint): boolean {
  return rasterLine(from, to).slice(1, -1).every((cell) => isWalkable(grid, cell));
}

export function rasterLine(from: GridPoint, to: GridPoint): readonly GridPoint[] {
  const result: GridPoint[] = [];
  let x0 = from.x; let y0 = from.y;
  const x1 = to.x; const y1 = to.y;
  const dx = Math.abs(x1 - x0); const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0); const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    result.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
  return result;
}

function neighbors(point: GridPoint): readonly GridPoint[] {
  return [{ x: point.x + 1, y: point.y }, { x: point.x, y: point.y + 1 }, { x: point.x - 1, y: point.y }, { x: point.x, y: point.y - 1 }];
}
function heuristic(a: GridPoint, b: GridPoint): number { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function reconstructPath(cameFrom: ReadonlyMap<string, GridPoint>, goal: GridPoint): readonly GridPoint[] {
  const path: GridPoint[] = [goal]; let current = goal;
  while (cameFrom.has(gridKey(current))) { current = cameFrom.get(gridKey(current))!; path.push(current); }
  return path.reverse();
}
