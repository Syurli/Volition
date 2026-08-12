import type { Locale } from './i18n';

const zhNames: Readonly<Record<string, string>> = {
  'tactical-wizard-reference': '战术巫师——步枪战术小队',
  'twr:rifle-squad-01': '步枪战术小队 01',
  'twr:rifle-squad:alpha': '阿尔法步枪手',
  'twr:rifle-squad:bravo': '布拉沃步枪手',
  'twr:rifle-squad:charlie': '查理步枪手',
  alpha: '阿尔法',
  bravo: '布拉沃',
  charlie: '查理',
  'behavior:patrol': '巡逻',
  'behavior:investigate': '调查声源',
  'behavior:search': '搜索最后已知位置',
  'behavior:engage': '接敌射击',
  'behavior:reload': '换弹',
  'tactic:bounding': '交替掩护推进',
  'tactic:flank': '侧翼迂回',
  'tactic:crossfire': '建立交叉火力',
  'tactic:assault': '协同猛攻',
  'tactic:sweep': '分区搜索',
  'tactic:regroup': '重新编组 / 换人',
  'supervisor:twr-rifle-basic': '步枪兵认知主管',
  'reasoner:twr-rifle-utility': '步枪兵效用推理器',
  patrol: '巡逻',
  combat: '战斗',
  search: '搜索',
};

const tacticZh: Readonly<Record<string, string>> = {
  bounding: '交替掩护',
  flank: '侧翼迂回',
  crossfire: '交叉火力',
  assault: '协同猛攻',
  sweep: '分区搜索',
  regroup: '重新编组',
};

const roleZh: Readonly<Record<string, string>> = {
  patrol: '巡逻', suppressor: '压制手', mover: '机动手', observer: '观察手', flanker: '侧翼手',
  crossfire: '交叉火力手', assaulter: '突击手', sweeper: '搜索手', support: '支援手',
};

const intentZh: Readonly<Record<string, string>> = {
  patrol: '巡逻', investigate: '调查', search: '搜索', engage: '接敌', reload: '换弹',
};

export function localizedAssetName(id: string, fallback: string, locale: Locale): string {
  return locale === 'zh-CN' ? zhNames[id] ?? fallback : fallback;
}

export function localizedTactic(value: string, locale: Locale): string { return locale === 'zh-CN' ? tacticZh[value] ?? value : value; }
export function localizedRole(value: string, locale: Locale): string { return locale === 'zh-CN' ? roleZh[value] ?? value : value; }
export function localizedIntent(value: string, locale: Locale): string { return locale === 'zh-CN' ? intentZh[value] ?? value : value; }
