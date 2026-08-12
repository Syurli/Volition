import type { DecisionTrace } from '@volition/core';
import type { Locale, Translate } from '../i18n';
import type { GridPoint } from '../simulation/navigation';
import type { SimulationOverlaySettings, TacticalWizardSimulationState } from '../simulation/tacticalWizardSimulationV4';
import { DebugPage as BaseDebugPage, SimulationPage as BaseSimulationPage } from './RuntimePagesV3Base';

interface SimulationProps {
  readonly t: Translate;
  readonly locale: Locale;
  readonly simulation: TacticalWizardSimulationState;
  readonly overlays: SimulationOverlaySettings;
  readonly setOverlays: (settings: SimulationOverlaySettings) => void;
  readonly playing: boolean;
  readonly setPlaying: (value: boolean) => void;
  readonly speed: number;
  readonly setSpeed: (value: number) => void;
  readonly onStep: () => void;
  readonly onReset: () => void;
  readonly onNoise: () => void;
  readonly onMove: (dx: number, dy: number) => void;
  readonly onSetPlayer: (point: GridPoint) => void;
}

export function SimulationPage(props: SimulationProps) {
  const { simulation, locale } = props;
  return <div className="page-stack">
    <CommandEquipmentPanel simulation={simulation} locale={locale} />
    <BaseSimulationPage {...props} />
  </div>;
}

export function DebugPage({ t, locale, simulation, traces }: { readonly t: Translate; readonly locale: Locale; readonly simulation: TacticalWizardSimulationState; readonly traces: readonly DecisionTrace[] }) {
  return <div className="page-stack">
    <CommandEquipmentPanel simulation={simulation} locale={locale} compact />
    <BaseDebugPage t={t} locale={locale} simulation={simulation} traces={traces} />
  </div>;
}

function CommandEquipmentPanel({ simulation, locale, compact = false }: { readonly simulation: TacticalWizardSimulationState; readonly locale: Locale; readonly compact?: boolean }) {
  const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const active = simulation.command.activeResupplyAgentId;
  const commander = simulation.agents.find((agent) => agent.id === simulation.commanderId);
  return <section className={`surface command-equipment-panel${compact ? ' compact' : ''}`}>
    <style>{`.command-equipment-panel{display:grid;gap:10px}.command-equipment-head{display:flex;justify-content:space-between;gap:16px;align-items:start}.command-equipment-head p{margin:3px 0 0;color:#8fa0af;font-size:9px}.command-equipment-head strong{color:#efd58b}.equipment-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.equipment-agent{padding:8px 10px;border:1px solid #293745;border-radius:7px;background:#0d141c;display:grid;gap:3px}.equipment-agent.commander{border-color:#8d7b4b}.equipment-agent.resupplying{border-color:#5d9b77}.equipment-agent header{display:flex;justify-content:space-between;gap:8px}.equipment-agent b{font-size:10px}.equipment-agent em{font-style:normal;font-size:8px;color:#c7ae70}.equipment-agent small{font-size:8px;color:#8293a3}.equipment-agent .logistics{color:#8fd0a6}.supply-summary{font-size:8px;color:#728394}@media(max-width:860px){.equipment-strip{grid-template-columns:1fr}}`}</style>
    <div className="command-equipment-head">
      <div><strong>♛ {L('指挥官', 'Commander')} · {commander?.label ?? 'Alpha'}</strong><p>{localizeOrder(simulation.command.order, locale)}</p></div>
      <small>{L('野战补给点', 'Field caches')} {simulation.supplies.filter((entry) => !entry.depleted).length}/{simulation.supplies.length}</small>
    </div>
    <div className="equipment-strip">{simulation.agents.map((agent) => <div key={agent.id} className={`equipment-agent ${agent.commandRank}${active === agent.id ? ' resupplying' : ''}`}>
      <header><b>{agent.label}</b><em>{agent.commandRank === 'commander' ? L('指挥官', 'COMMANDER') : L('下属', 'SUBORDINATE')}</em></header>
      <small>{L('弹药', 'Ammo')} {agent.ammoRounds}/{agent.ammoCapacity} · {L('投掷物', 'Grenades')} {agent.grenadeCount}/{agent.grenadeCapacity}</small>
      <small>{L('倾向', 'Bias')} · {localizeTendency(agent.commandTendency, locale)}</small>
      {agent.logisticsTask !== 'none' ? <small className="logistics">↳ {localizeLogistics(agent.logisticsTask, locale)} · {agent.resupplyTargetId}</small> : null}
    </div>)}</div>
    {!compact && <div className="supply-summary">{L('补给决策：同一时间最多一人脱离；接敌中优先派下属，指挥官仅在自身资源临界且下属无需补给时离开战位。', 'Resupply policy: one detachment at a time; subordinates are preferred in combat, while the commander leaves position only when critically depleted and no subordinate has priority.')}</div>}
  </section>;
}

function localizeLogistics(task: TacticalWizardSimulationState['agents'][number]['logisticsTask'], locale: Locale): string {
  if (locale !== 'zh-CN') return task.replaceAll('_', ' ');
  return { none: '无', resupply_ammo: '补充弹药', resupply_grenades: '补充投掷物', resupply_mixed: '综合补给' }[task];
}

function localizeTendency(value: string, locale: Locale): string {
  if (locale !== 'zh-CN') return value;
  return value.startsWith('command') ? '指挥 / 警戒 / 支援 / 节制投掷' : '机动 / 侧翼 / 突击 / 执行补给';
}

function localizeOrder(value: string, locale: Locale): string {
  if (locale !== 'zh-CN') return value;
  if (value.startsWith('Patrol')) return '保持紧凑巡逻；接敌前利用附近补给点恢复装备。';
  if (value.includes('alternate suppress-and-move')) return '指挥官维持战场态势；两名下属交替执行压制与跃进。';
  if (value.includes('opens the flank')) return '指挥官锚定支援位置；一名下属钉住目标，另一名展开侧翼。';
  if (value.includes('separated crossfire')) return '指挥官承担支援与协调；两名下属建立分离的交叉火力扇区。';
  if (value.includes('exploit the established')) return '指挥官保持火力基点；两名下属利用既有射界实施突击。';
  if (value.includes('clear search sectors')) return '指挥官承担警戒与出口封锁；两名下属以 Buddy 方式清扫搜索区。';
  return '指挥官优先恢复队形、间距和装备状态，再进入下一轮机动。';
}
