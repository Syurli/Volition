import { gridKey, rasterLine, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from './tacticalWizardTestMap';

export type DestructibleMaterial = 'concrete';

export interface DestructibleCellView {
  readonly position: GridPoint;
  readonly hp: number;
  readonly maxHp: number;
  readonly material: DestructibleMaterial;
  readonly destroyed: boolean;
}

export interface DynamicCombatWorldView {
  readonly enabled: true;
  readonly geometryRevision: number;
  readonly destructibleCount: number;
  readonly damagedCount: number;
  readonly destroyedCount: number;
  readonly changedCells: readonly DestructibleCellView[];
  readonly lastChangedCell: GridPoint | null;
  readonly lastChangeKind: 'damage' | 'destroy' | 'reset' | null;
}

interface MutableDestructibleCell {
  readonly position: GridPoint;
  hp: number;
  readonly maxHp: number;
  readonly material: DestructibleMaterial;
}

export interface WorldDamageResult {
  readonly hit: boolean;
  readonly destroyed: boolean;
  readonly point: GridPoint | null;
  readonly hp: number | null;
  readonly geometryRevision: number;
}

const BLOCK_HP = 3;
const INITIAL_BLOCKED = tacticalWizardTestMap.blocked.map((point) => ({ ...point }));

/**
 * Combat-sandbox destructible geometry adapter.
 *
 * The current map remains grid based, but the world mutates the exact shared
 * navigation blocked-set that LOS, pathfinding, cover discovery and recovery
 * geometry already query. Destroying a cell therefore opens the route for all
 * existing tactical systems without introducing a second navigation model.
 */
export class TacticalWizardDynamicCombatWorld {
  private readonly cells = new Map<string, MutableDestructibleCell>();
  private revision = 0;
  private lastChangedCell: GridPoint | null = null;
  private lastChangeKind: DynamicCombatWorldView['lastChangeKind'] = null;

  constructor() {
    this.reset();
  }

  reset(): DynamicCombatWorldView {
    this.cells.clear();
    for (const point of INITIAL_BLOCKED) {
      this.cells.set(gridKey(point), { position: { ...point }, hp: BLOCK_HP, maxHp: BLOCK_HP, material: 'concrete' });
    }
    const renderedBlocked = tacticalWizardTestMap.blocked as GridPoint[];
    renderedBlocked.splice(0, renderedBlocked.length, ...INITIAL_BLOCKED.map((point) => ({ ...point })));
    const navigationBlocked = tacticalWizardNavigationGrid.blocked as Set<string>;
    navigationBlocked.clear();
    for (const point of INITIAL_BLOCKED) navigationBlocked.add(gridKey(point));
    this.revision += 1;
    this.lastChangedCell = null;
    this.lastChangeKind = 'reset';
    return this.view();
  }

  damageRay(from: GridPoint, to: GridPoint, damage = 1): WorldDamageResult {
    for (const point of rasterLine(toCell(from), toCell(to)).slice(1)) {
      const cell = this.cells.get(gridKey(point));
      if (cell === undefined || cell.hp <= 0) continue;
      return this.damageCell(point, damage);
    }
    return { hit: false, destroyed: false, point: null, hp: null, geometryRevision: this.revision };
  }

  damageBlast(center: GridPoint, radius: number, damage = 1): readonly WorldDamageResult[] {
    const results: WorldDamageResult[] = [];
    for (const cell of this.cells.values()) {
      if (cell.hp <= 0 || distance(cell.position, center) > radius) continue;
      results.push(this.damageCell(cell.position, damage));
    }
    return results;
  }

  view(): DynamicCombatWorldView {
    const all = [...this.cells.values()];
    const changed = all
      .filter((cell) => cell.hp < cell.maxHp)
      .sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x)
      .map((cell) => ({ position: { ...cell.position }, hp: cell.hp, maxHp: cell.maxHp, material: cell.material, destroyed: cell.hp <= 0 }));
    return {
      enabled: true,
      geometryRevision: this.revision,
      destructibleCount: all.length,
      damagedCount: all.filter((cell) => cell.hp > 0 && cell.hp < cell.maxHp).length,
      destroyedCount: all.filter((cell) => cell.hp <= 0).length,
      changedCells: changed,
      lastChangedCell: this.lastChangedCell === null ? null : { ...this.lastChangedCell },
      lastChangeKind: this.lastChangeKind,
    };
  }

  private damageCell(point: GridPoint, damage: number): WorldDamageResult {
    const key = gridKey(point);
    const cell = this.cells.get(key);
    if (cell === undefined || cell.hp <= 0) return { hit: false, destroyed: false, point: null, hp: null, geometryRevision: this.revision };
    cell.hp = Math.max(0, cell.hp - Math.max(0, damage));
    this.lastChangedCell = { ...cell.position };
    const destroyed = cell.hp <= 0;
    if (destroyed) {
      (tacticalWizardNavigationGrid.blocked as Set<string>).delete(key);
      const renderedBlocked = tacticalWizardTestMap.blocked as GridPoint[];
      const index = renderedBlocked.findIndex((entry) => entry.x === point.x && entry.y === point.y);
      if (index >= 0) renderedBlocked.splice(index, 1);
      this.revision += 1;
      this.lastChangeKind = 'destroy';
    } else {
      this.lastChangeKind = 'damage';
    }
    return { hit: true, destroyed, point: { ...cell.position }, hp: cell.hp, geometryRevision: this.revision };
  }
}

function toCell(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))),
  };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
