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
 * V11 Combat Sandbox keeps the proven 64x40 navigation envelope and the west
 * contact geometry used by historical regressions, but removes the old maze of
 * decorative micro-obstacles. Every remaining region has one explicit test job:
 * contact geometry, long-range incoming fire, lost-contact search, rescue access,
 * emergency smoke or field resupply.
 */
export const tacticalWizardTestMap = {
  id: 'tactical-wizard-combat-sandbox-v11',
  name: 'Tactical Wizard Combat Sandbox V11',
  width: 64,
  height: 40,
  blocked: [
    // Proven contact / crossfire block. Keep the original west-side cover logic
    // so the historical bounding → flank → crossfire regressions remain useful.
    ...rect(8, 3, 4, 7),
    ...rect(18, 1, 4, 8),
    ...rect(27, 4, 8, 4),
    ...rect(39, 2, 5, 7),
    ...rect(4, 13, 8, 3),
    ...rect(16, 12, 7, 6),
    ...rect(29, 12, 4, 10),
    ...rect(38, 14, 8, 4),

    // South search block: broad silhouettes with multiple exits instead of a
    // dense maze. These are intentionally useful for LKP / inferred-sector scans.
    ...rect(8, 22, 9, 4),
    ...rect(21, 24, 9, 3),
    ...rect(36, 23, 7, 4),
    ...rect(5, 32, 4, 2),
    ...rect(14, 35, 5, 2),
    ...rect(25, 31, 3, 4),
    ...rect(35, 34, 6, 2),
    ...rect(44, 32, 3, 3),

    // A single readable east divider creates repeatable LOS loss. Four large
    // gaps are deliberate doors between long-range, rescue and search scenarios.
    ...rect(49, 0, 1, 7),
    ...rect(49, 10, 1, 8),
    ...rect(49, 22, 1, 7),
    ...rect(49, 33, 1, 7),

    // Long-range ambush lane: two hard screens, leaving a clean firing corridor.
    ...rect(54, 4, 7, 1),
    ...rect(54, 12, 7, 1),

    // Rescue corridor: casualty access has flanking cover on both sides so the
    // third soldier can occupy a real security position before treatment starts.
    ...rect(53, 17, 6, 1),
    ...rect(61, 17, 2, 1),
    ...rect(56, 20, 1, 4),
    ...rect(52, 24, 5, 1),
    ...rect(59, 24, 4, 1),

    // Rescue / medical yard. The center stays open for treatment interruption;
    // the north/south edges provide emergency-smoke and fallback cover choices.
    ...rect(52, 31, 5, 1),
    ...rect(59, 31, 4, 1),
    ...rect(55, 34, 5, 2),
  ],
  patrolPoints: [
    { x: 2, y: 2 },
    { x: 14, y: 2 },
    { x: 24, y: 9 },
    { x: 36, y: 10 },
    { x: 46, y: 12 },
    { x: 46, y: 19 },
    { x: 42, y: 29 },
    { x: 31, y: 29 },
    { x: 18, y: 21 },
    { x: 3, y: 20 },
  ] as readonly GridPoint[],
  playerStart: { x: 46, y: 27 } as GridPoint,
  zones: [
    { id: 'contact-yard', name: 'Contact Yard', nameZh: '基础接敌场', kind: 'open', x: 0, y: 0, width: 17, height: 12 },
    { id: 'cover-street', name: 'Cover Street', nameZh: '掩体机动街区', kind: 'urban', x: 16, y: 0, width: 20, height: 23 },
    { id: 'ambush-lane', name: 'Long-Range Ambush Lane', nameZh: '超视距伏击长廊', kind: 'long_lane', x: 36, y: 0, width: 13, height: 13 },
    { id: 'search-block', name: 'Sector Search Block', nameZh: '扇区搜索街区', kind: 'search', x: 0, y: 20, width: 49, height: 20 },
    { id: 'observation-lane', name: 'Counter-Ambush Observation', nameZh: '反伏击观察区', kind: 'cqb', x: 50, y: 0, width: 14, height: 15 },
    { id: 'rescue-corridor', name: 'Rescue Corridor', nameZh: '救援掩护走廊', kind: 'alley', x: 50, y: 15, width: 14, height: 10 },
    { id: 'rescue-yard', name: 'Rescue & Medical Yard', nameZh: '救援与医疗场', kind: 'courtyard', x: 50, y: 25, width: 14, height: 15 },
  ] as readonly TacticalTestZone[],
  testPoints: [
    {
      id: 'crossfire',
      name: 'Medium Contact',
      nameZh: '中距接敌',
      hint: 'Stable visible contact for bounding, flank and crossfire regressions.',
      hintZh: '稳定可视接敌，用于交替掩护、侧翼与交叉火力回归。',
      position: { x: 14, y: 2 },
    },
    {
      id: 'incoming-fire',
      name: 'Unseen Incoming Fire',
      nameZh: '超视距来袭',
      hint: 'Fire into the squad from outside visual confirmation to test bearing, emergency smoke and break contact.',
      hintZh: '从未被视觉确认的位置射击小队，用于测试受击方向、应急烟幕与脱离枪线。',
      position: { x: 46, y: 10 },
    },
    {
      id: 'lost-contact',
      name: 'LOS Break',
      nameZh: '视线切断',
      hint: 'Move here after visual contact to verify hidden-position privacy and LKP search.',
      hintZh: '接敌后转移至此，验证隐藏坐标隔离与最后确认位置搜索。',
      position: { x: 46, y: 27 },
    },
    {
      id: 'sector-search',
      name: 'Sector Search',
      nameZh: '扇区搜索',
      hint: 'Blind-corner area for lead / cover / overwatch search handoffs.',
      hintZh: '多遮挡搜索区，用于观察前出、掩护、卡位三人搜索交接。',
      position: { x: 31, y: 29 },
    },
    {
      id: 'rescue-casualty',
      name: 'Casualty Rescue',
      nameZh: '伤员救援',
      hint: 'Open treatment lane surrounded by hard cover for a dedicated third-party security element.',
      hintZh: '治疗通道周围有硬掩体，用于验证第三人先占掩护位、救治者再接近。',
      position: { x: 58, y: 28 },
    },
    {
      id: 'smoke-screen',
      name: 'Emergency Smoke',
      nameZh: '应急烟幕',
      hint: 'Clear corridor for reading a smoke screen between the squad and an inferred threat sector.',
      hintZh: '清晰走廊，用于观察小队与推测威胁方向之间的应急烟幕。',
      position: { x: 53, y: 21 },
    },
    {
      id: 'medical-resupply',
      name: 'Medical Resupply',
      nameZh: '医疗补给',
      hint: 'Separated fallback pocket for medkit pickup and return-to-squad behavior.',
      hintZh: '独立补给角，用于医疗包拾取、脱队补给与重新归队测试。',
      position: { x: 53, y: 36 },
    },
  ] as readonly TacticalTestPoint[],
};

export const tacticalWizardNavigationGrid: NavigationGrid = createGrid(
  tacticalWizardTestMap.width,
  tacticalWizardTestMap.height,
  tacticalWizardTestMap.blocked,
);

function rect(x: number, y: number, width: number, height: number): GridPoint[] {
  const cells: GridPoint[] = [];
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) cells.push({ x: column, y: row });
  }
  return cells;
}
