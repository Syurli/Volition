import type { DecisionTrace } from '@volition/core';
import type { Locale, Translate } from '../i18n';
import type { GridPoint } from '../simulation/navigation';
import type { RecoveryTask, SimulationOverlaySettings, TacticalWizardSimulationState } from '../simulation/tacticalWizardSimulation';
import { DebugPage as BaseDebugPage, SimulationPage as BaseSimulationPage } from './RuntimeUtilityPages';

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
  const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const living = simulation.agents.filter((agent) => agent.alive).length;
  return <div className="simulation-workspace-shell">
    <BaseSimulationPage {...props} />
    <details className="simulation-secondary-details simulation-runtime-details">
      <summary>
        <span>{L('战斗输入与小队装备', 'Combat Input & Squad Equipment')}</span>
        <small>{L('火力压力', 'Fire pressure')} {simulation.playerCombat.firePressure.toFixed(2)} · {L('存活', 'Living')} {living}/{simulation.agents.length} · {L('指挥', 'Command')} {shortActor(simulation.commanderId)}</small>
      </summary>
      <div className="simulation-secondary-grid simulation-secondary-grid-runtime">
        <PlayerCombatPanel simulation={simulation} locale={locale} />
        <CommandEquipmentPanel simulation={simulation} locale={locale} />
      </div>
    </details>
  </div>;
}

export function DebugPage({ t, locale, simulation, traces }: { readonly t: Translate; readonly locale: Locale; readonly simulation: TacticalWizardSimulationState; readonly traces: readonly DecisionTrace[] }) {
  return <div className="page-stack">
    <PlayerCombatPanel simulation={simulation} locale={locale} compact />
    <CommandEquipmentPanel simulation={simulation} locale={locale} compact />
    <BaseDebugPage t={t} locale={locale} simulation={simulation} traces={traces} />
  </div>;
}

function PlayerCombatPanel({ simulation, locale, compact = false }: { readonly simulation: TacticalWizardSimulationState; readonly locale: Locale; readonly compact?: boolean }) {
  const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const selected = simulation.playerCombat.selectedGrenade;
  const inventory = simulation.playerCombat.grenadeInventory;
  const effect = simulation.tacticalEffect.kind === 'none' ? L('无', 'none') : localizeEffect(simulation.tacticalEffect.kind, locale);
  return <section className={`surface player-combat-panel${compact ? ' compact' : ''}`}>
    <style>{`.player-combat-panel{display:grid;gap:8px}.player-combat-head{display:flex;justify-content:space-between;gap:16px;align-items:start}.player-combat-head strong{color:#c9d8e7}.player-combat-head p{margin:3px 0 0;color:#8192a1;font-size:9px}.player-combat-metrics{display:flex;gap:12px;flex-wrap:wrap;justify-content:flex-end}.player-combat-metrics small{font-size:8px;color:#899ba9}.player-combat-panel .selected-grenade{color:#e5c982}.player-combat-panel .effect-active{color:#e3af79}@media(max-width:860px){.player-combat-head{display:grid}.player-combat-metrics{justify-content:flex-start}}`}</style>
    <div className="player-combat-head">
      <div><strong>⌖ {L('玩家威胁输入', 'Player Threat Input')}</strong><p>{L('鼠标瞄准 · 左键射击 · 右键投掷 · 滚轮切换投掷物。AI 会读取瞄准方向、持续瞄准与近期开火压力。', 'Mouse aim · LMB fire · RMB throw · wheel cycles grenade. AI reads aim direction, dwell and recent fire pressure.')}</p></div>
      <div className="player-combat-metrics">
        <small>{L('近期射击', 'Recent shots')} {simulation.playerCombat.shotsRecent}</small>
        <small>{L('火力压力', 'Fire pressure')} {simulation.playerCombat.firePressure.toFixed(2)}</small>
        <small className={simulation.tacticalEffect.kind === 'none' ? '' : 'effect-active'}>{L('投掷物战术窗口', 'Grenade doctrine')} {effect}{simulation.tacticalEffect.remainingTicks > 0 ? ` · ${simulation.tacticalEffect.remainingTicks}T` : ''}</small>
      </div>
    </div>
    {!compact && <div className="player-combat-metrics" style={{ justifyContent: 'flex-start' }}>
      <small className={selected === 'flash' ? 'selected-grenade' : ''}>{L('震撼', 'FLASH')} × {inventory.flash}</small>
      <small className={selected === 'frag' ? 'selected-grenade' : ''}>{L('破片', 'FRAG')} × {inventory.frag}</small>
      <small className={selected === 'smoke' ? 'selected-grenade' : ''}>{L('烟幕', 'SMOKE')} × {inventory.smoke}</small>
      <small>{L('当前选择', 'Selected')} → {grenadeName(selected, locale)}</small>
    </div>}
  </section>;
}

function CommandEquipmentPanel({ simulation, locale, compact = false }: { readonly simulation: TacticalWizardSimulationState; readonly locale: Locale; readonly compact?: boolean }) {
  const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const active = simulation.command.activeResupplyAgentId;
  const commander = simulation.agents.find((agent) => agent.id === simulation.commanderId);
  const recovery = simulation.recovery;
  const recoverySummary = recovery.phase === 'none'
    ? recovery.medicalResupplyAgentId === null ? L('待命', 'standby') : `${L('医疗补给', 'medical resupply')} · ${shortActor(recovery.medicalResupplyAgentId)}`
    : `${localizeRescuePhase(recovery.phase, locale)} · ${shortActor(recovery.rescuerId)} → ${shortActor(recovery.downedAgentId)}`;
  return <section className={`surface command-equipment-panel${compact ? ' compact' : ''}`}>
    <style>{`.command-equipment-panel{display:grid;gap:10px;min-height:0}.command-equipment-head{display:flex;justify-content:space-between;gap:16px;align-items:start}.command-equipment-head p{margin:3px 0 0;color:#8fa0af;font-size:9px}.command-equipment-head strong{color:#efd58b}.command-metrics{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.command-metrics small{font-size:8px;color:#8395a4}.command-metrics .medical-active{color:#8fd0a6}.equipment-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.equipment-agent{padding:8px 10px;border:1px solid #293745;border-radius:7px;background:#0d141c;display:grid;gap:3px;min-height:96px}.equipment-agent.commander{border-color:#8d7b4b}.equipment-agent.resupplying{border-color:#5d9b77}.equipment-agent.reacting{box-shadow:inset 0 0 0 1px #8f6f43}.equipment-agent.recovering{box-shadow:inset 0 0 0 1px #4f8d72}.equipment-agent.downed{opacity:.55;border-color:#75484c}.equipment-agent header{display:flex;justify-content:space-between;gap:8px}.equipment-agent b{font-size:10px}.equipment-agent em{font-style:normal;font-size:8px;color:#c7ae70}.equipment-agent small{font-size:8px;color:#8293a3}.equipment-agent .logistics{color:#8fd0a6}.equipment-agent .ammo-low{color:#e6bb73}.equipment-agent .ammo-critical{color:#e58a8a}.equipment-agent .health-low{color:#e7a06f}.equipment-agent .health-critical{color:#e57a7f}.equipment-agent .reaction{color:#e0bc79}.equipment-agent .recovery{color:#8fd0a6}.equipment-agent .speed{color:#9eb9cf}.supply-summary{font-size:8px;color:#728394}@media(max-width:860px){.equipment-strip{grid-template-columns:1fr}.command-equipment-head{display:grid}.command-metrics{justify-content:flex-start}}`}</style>
    <div className="command-equipment-head">
      <div><strong>♛ {L('指挥官', 'Commander')} · {commander?.label ?? 'Alpha'}</strong><p>{localizeOrder(simulation.command.order, locale)}</p></div>
      <div className="command-metrics">
        <small>{L('静止', 'Stationary')} {simulation.command.commanderStationarySeconds.toFixed(1)}s</small>
        <small>{L('火力交接', 'Support handoffs')} {simulation.command.supportHandoffCount}</small>
        <small>{L('野战补给点', 'Field caches')} {simulation.supplies.filter((entry) => !entry.depleted).length}/{simulation.supplies.length}</small>
        <small className={recovery.phase === 'none' && recovery.medicalResupplyAgentId === null ? '' : 'medical-active'}>{L('医疗协同', 'Medical')} {recoverySummary}</small>
      </div>
    </div>
    <div className="equipment-strip">{simulation.agents.map((agent) => {
      const ammoClass = agent.ammoRounds <= 12 ? 'ammo-critical' : agent.ammoRounds <= 42 ? 'ammo-low' : '';
      const healthClass = agent.health <= 30 ? 'health-critical' : agent.health <= 60 ? 'health-low' : '';
      const classes = `equipment-agent ${agent.commandRank}${active === agent.id ? ' resupplying' : ''}${agent.reactionState !== 'none' ? ' reacting' : ''}${agent.recoveryTask !== 'none' ? ' recovering' : ''}${!agent.alive ? ' downed' : ''}`;
      return <div key={agent.id} className={classes}>
        <header><b>{agent.label}</b><em>{agent.commandRank === 'commander' ? L('指挥官', 'COMMANDER') : L('下属', 'SUBORDINATE')}</em></header>
        <small className={healthClass}>{L('生命', 'HP')} {agent.health}/{agent.maxHealth} · {L('医疗包', 'Med')} {agent.medkitCount}/{agent.medkitCapacity}</small>
        <small className="speed">{L('实时移速', 'Live move')} {agent.moveSpeed.toFixed(2)} cell/s · {localizeLocomotion(agent.locomotionMode, locale)}</small>
        <small className={ammoClass}>{L('弹药', 'Ammo')} {agent.ammoRounds}/{agent.ammoCapacity} · {agent.burstsRemaining} {L('轮 burst', 'bursts')} · {L('投掷物', 'Grenades')} {agent.grenadeCount}/{agent.grenadeCapacity}</small>
        <small>{L('当前职责', 'Role')} · {agent.role} / {agent.task}</small>
        <small>{L('威胁瞄准', 'Aim threat')} · {agent.aimThreatSeconds.toFixed(2)}s</small>
        {agent.recoveryTask !== 'none' ? <small className="recovery">✚ {localizeRecovery(agent.recoveryTask, locale)}{agent.recoveryTargetId ? ` → ${shortActor(agent.recoveryTargetId)}` : ''}{agent.recoveryProgress > 0 ? ` · ${(agent.recoveryProgress * 100).toFixed(0)}%` : ''}</small> : null}
        {agent.reactionState !== 'none' ? <small className="reaction">↳ {localizeReaction(agent.reactionState, locale)} · {agent.reactionTicks}T{agent.reactionTarget ? ` → ${agent.reactionTarget.x},${agent.reactionTarget.y}` : ''}</small> : null}
        {agent.logisticsTask !== 'none' ? <small className="logistics">↳ {localizeLogistics(agent.logisticsTask, locale)} · {agent.resupplyTargetId}</small> : null}
      </div>;
    })}</div>
    {!compact && <div className="supply-summary">{L('医疗包已进入士兵与补给箱资源模型。成员失能后先建立掩护，再由另一人接近并持续救治；恢复后重新加入原小队计划。移速不再固定：开火、横移/后退、血量、当前任务、闪避/烟幕后撤与救援都会实际改变运动帧预算。', 'Medkits are resources carried by soldiers and field caches. A downed member triggers cover establishment before another soldier approaches and performs timed treatment; the recovered member then rejoins the squad plan. Movement speed is no longer fixed: firing, lateral/backward movement, health, task, reactions and rescue state all affect the real motion-frame budget.')}</div>}
  </section>;
}

function localizeLogistics(task: TacticalWizardSimulationState['agents'][number]['logisticsTask'], locale: Locale): string {
  if (locale !== 'zh-CN') return task.replaceAll('_', ' ');
  return { none: '无', resupply_ammo: '补充弹药', resupply_grenades: '补充投掷物', resupply_mixed: '综合补给' }[task];
}

function localizeRecovery(task: RecoveryTask, locale: Locale): string {
  if (locale !== 'zh-CN') return task.replaceAll('_', ' ');
  return {
    none: '无',
    self_treat: '自我救治',
    rescue_cover: '掩护救治',
    rescue_wait_cover: '等待掩护建立',
    rescue_move: '接近失能队友',
    rescue_treat: '现场救治',
    resupply_medical: '补充医疗包',
  }[task];
}

function localizeRescuePhase(phase: TacticalWizardSimulationState['recovery']['phase'], locale: Locale): string {
  if (locale !== 'zh-CN') return phase.replaceAll('_', ' ');
  return { none: '无', establish_cover: '建立掩护', approach: '救援接近', treat: '现场救治' }[phase];
}

function localizeLocomotion(mode: TacticalWizardSimulationState['agents'][number]['locomotionMode'], locale: Locale): string {
  if (locale !== 'zh-CN') return mode.replaceAll('_', ' ');
  return { free: '自由移动', forward: '正向移动', lateral: '侧向移动', backpedal: '倒退警戒', covered_dash: '受掩护冲刺' }[mode];
}

function localizeReaction(value: TacticalWizardSimulationState['agents'][number]['reactionState'], locale: Locale): string {
  if (locale !== 'zh-CN') return value.replaceAll('_', ' ');
  return { none: '正常', dodge: '闪避枪线', stunned: '震撼失能', flash_push: '震撼后压近', smoke_retreat: '烟幕后撤', smoke_reposition: '烟幕换位', grenade_suppress: '爆炸压制等待', downed: '失能' }[value];
}

function grenadeName(value: TacticalWizardSimulationState['playerCombat']['selectedGrenade'], locale: Locale): string {
  if (locale !== 'zh-CN') return value.toUpperCase();
  return value === 'flash' ? '震撼弹' : value === 'smoke' ? '烟幕弹' : '破片弹';
}

function localizeEffect(value: TacticalWizardSimulationState['tacticalEffect']['kind'], locale: Locale): string {
  if (locale !== 'zh-CN') return value.replaceAll('_', ' ');
  return { none: '无', flash_push: '震撼后压近', smoke_retreat: '烟幕后撤', frag_suppression: '破片压制等待' }[value];
}

function localizeOrder(value: string, locale: Locale): string {
  if (locale !== 'zh-CN') return value;
  if (value.includes('detached for')) return '一名成员正在脱离补给；其余成员维持火力支援与机动自由。';
  if (value.startsWith('Patrol')) return '保持紧凑巡逻；条件允许时在接敌前恢复装备。';
  if (value.startsWith('Set the next bound')) return '根据当前接触规划下一次跃进；指挥官随角色轮换参与压制或机动。';
  if (value.startsWith('Fix the target')) return '钉住目标并展开侧翼；指挥身份不再把 Alpha 固定在支援位置。';
  if (value.startsWith('Build separated')) return '建立分离射击扇区；当射界、弹药或接触态势下降时主动交接火力基点。';
  if (value.startsWith('Exploit the established')) return '利用既有战术几何；当局势需要时指挥官可直接参加突击。';
  if (value.startsWith('Search by')) return '以先导 / 掩护 / 警戒交接执行搜索；指挥官同样可以承担任一职责。';
  return '恢复间距、弹药与有效射击几何，再进入下一轮机动。';
}

function shortActor(id: string | null): string {
  if (id === null) return '—';
  return id.split(':').at(-1) ?? id;
}
