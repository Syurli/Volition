import { createGrid, type GridPoint, type NavigationGrid } from './navigation';

export type TacticalTestZoneKind = 'open' | 'long_lane' | 'urban' | 'alley' | 'cqb' | 'courtyard' | 'search';

export interface TacticalTestZone {
  readonly id: string;
  readonly name: string;
  readonly nameZh: string;
  readonly kind: TacticalTestZoneKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TacticalTestPoint {
  readonly id: string;
  readonly name: string;
  readonly nameZh: string;
  readonly hint: string;
  readonly hintZh: string;
  readonly position: GridPoint;
}

/**
 * V7 extends the original 48x30 training ground instead of replacing its proven
 * geometry. The west / center area remains recognizable for historical scenarios,
 * while the east and south extensions add purpose-built tactical test spaces.
 */
export const tacticalWizardTestMap = {
  id: 'tactical-wizard-compound-training-ground-v7',
  name: 'Tactical Wizard Compound Training Ground V7',
  width: 64,
  height: 40,
  blocked: [
    ...rect(8, 3, 4, 7), ...rect(18, 1, 4, 8), ...rect(27, 4, 8, 4), ...rect(39, 2, 5, 7),
    ...rect(4, 13, 8, 3), ...rect(16, 12, 7, 6), ...rect(29, 12, 4, 10), ...rect(38, 14, 8, 4),
    ...rect(8, 22, 9, 4), ...rect(21, 24, 9, 3), ...rect(36, 23, 7, 4),
    ...rect(49, 0, 1, 6), ...rect(49, 9, 1, 9), ...rect(49, 21, 1, 10), ...rect(49, 34, 1, 6),
    ...rect(52, 2, 10, 1), ...rect(52, 13, 10, 1),
    ...rect(52, 2, 1, 4), ...rect(52, 8, 1, 6),
    ...rect(61, 2, 1, 5), ...rect(61, 9, 1, 5),
    ...rect(56, 3, 1, 4), ...rect(56, 9, 1, 4),
    ...rect(53, 7, 3, 1), ...rect(57, 7, 4, 1),
    ...rect(57, 10, 3, 1),
    ...rect(52, 16, 7, 1), ...rect(60, 16, 3, 1),
    ...rect(53, 20, 4, 1), ...rect(59, 20, 4, 1),
    ...rect(52, 23, 5, 1), ...rect(59, 23, 4, 1),
    ...rect(55, 17, 1, 3), ...rect(60, 17, 1, 3), ...rect(58, 21, 1, 3),
    ...rect(51, 26, 5, 1), ...rect(58, 26, 5, 1),
    ...rect(51, 38, 5, 1), ...rect(58, 38, 5, 1),
    ...rect(51, 27, 1, 5), ...rect(51, 34, 1, 5),
    ...rect(62, 27, 1, 4), ...rect(62, 33, 1, 6),
    ...rect(55, 30, 4, 2), ...rect(57, 35, 3, 1),
    ...rect(5, 32, 4, 2), ...rect(14, 35, 5, 2), ...rect(25, 31, 3, 4), ...rect(35, 34, 6, 2), ...rect(44, 32, 3, 3),
  ],
  patrolPoints: [
    { x: 2, y: 2 }, { x: 14, y: 2 }, { x: 24, y: 9 }, { x: 36, y: 10 }, { x: 46, y: 12 },
    { x: 46, y: 19 }, { x: 54, y: 19 }, { x: 58, y: 24 }, { x: 60, y: 32 }, { x: 54, y: 36 },
    { x: 46, y: 37 }, { x: 32, y: 28 }, { x: 18, y: 21 }, { x: 3, y: 20 },
  ] as readonly GridPoint[],
  playerStart: { x: 46, y: 27 } as GridPoint,
  zones: [
    { id: 'open-yard', name: 'Open Yard', nameZh: '开放训练场', kind: 'open', x: 0, y: 0, width: 17, height: 12 },
    { id: 'urban-block', name: 'Urban Blocks', nameZh: '街区掩体带', kind: 'urban', x: 16, y: 0, width: 20, height: 23 },
    { id: 'long-lane', name: 'Long Fire Lane', nameZh: '长射界', kind: 'long_lane', x: 36, y: 0, width: 13, height: 13 },
    { id: 'search-yard', name: 'Search Yard', nameZh: '搜索训练区', kind: 'search', x: 0, y: 20, width: 49, height: 20 },
    { id: 'cqb-block', name: 'CQB Block', nameZh: 'CQB 建筑组', kind: 'cqb', x: 50, y: 0, width: 14, height: 15 },
    { id: 'alley-network', name: 'Alley Network', nameZh: '巷道网络', kind: 'alley', x: 50, y: 15, width: 14, height: 10 },
    { id: 'courtyard', name: 'Courtyard', nameZh: '院落与封锁区', kind: 'courtyard', x: 50, y: 25, width: 14, height: 15 },
  ] as readonly TacticalTestZone[],
  testPoints: [
    { id: 'crossfire', name: 'Crossfire Check', nameZh: '交叉火力检查', hint: 'Stable medium-range contact; useful for spacing and fire-lane deconfliction.', hintZh: '中距离稳定接敌，用于检查站位间距与枪线去冲突。', position: { x: 14, y: 2 } },
    { id: 'long-lane', name: 'Long Lane', nameZh: '长射界压力', hint: 'Long visible lane; useful for suppress / flank / stationary-target grenade pressure.', hintZh: '长距离可视射界，用于压制、侧翼和静止目标投掷物压力测试。', position: { x: 46, y: 10 } },
    { id: 'lost-contact', name: 'Lost Contact', nameZh: '失联搜索', hint: 'Move here after contact to force LKP sweep and flash opportunities.', hintZh: '接敌后转移到这里，用于触发最后确认位置搜索与震撼弹机会。', position: { x: 46, y: 27 } },
    { id: 'alley-corner', name: 'Alley Corner', nameZh: '巷道拐角', hint: 'Broken sightline with multiple approaches; useful for flank / block-exit tests.', hintZh: '多入口且视线被切断，用于绕后、卡位和出口封锁测试。', position: { x: 54, y: 18 } },
    { id: 'cqb-door', name: 'CQB Door', nameZh: 'CQB 门口', hint: 'Short-range doorway contact; useful for close-pressure and buddy movement.', hintZh: '短距离门口接敌，用于近战机会与 Buddy 互相掩护。', position: { x: 53, y: 8 } },
    { id: 'courtyard-grenade', name: 'Courtyard Grenade', nameZh: '院落投掷物', hint: 'Contained open space with cover edges; useful for grenade and search visualization.', hintZh: '有边缘掩体的开放院落，用于观察投掷物和搜索可视化。', position: { x: 60, y: 30 } },
  ] as readonly TacticalTestPoint[],
};

export const tacticalWizardNavigationGrid: NavigationGrid = createGrid(
  tacticalWizardTestMap.width,
  tacticalWizardTestMap.height,
  tacticalWizardTestMap.blocked,
);

function rect(x: number, y: number, width: number, height: number): GridPoint[] {
  const cells: GridPoint[] = [];
  for (let row = y; row < y + height; row += 1) for (let column = x; column < x + width; column += 1) cells.push({ x: column, y: row });
  return cells;
}
