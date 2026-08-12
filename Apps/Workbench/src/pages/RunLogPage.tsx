import { useMemo, useState } from 'react';
import type { Locale } from '../i18n';
import { localizedAssetName, localizedIntent, localizedRole, localizedTactic } from '../assetLocalization';
import type { RunLogCategory, RunLogEntry } from '../simulation/tacticalWizardSimulationV3';
import type { TacticalWizardSimulationState } from '../simulation/tacticalWizardSimulationV4';

export function RunLogPage({ locale, simulation }: { readonly locale: Locale; readonly simulation: TacticalWizardSimulationState }) {
  const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const [category, setCategory] = useState<'all' | RunLogCategory>('all');
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => simulation.runLog.filter((entry) => {
    if (category !== 'all' && entry.category !== category) return false;
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return `${entry.actorId} ${entry.actorLabel} ${entry.event} ${entry.summary} ${JSON.stringify(entry.data)}`.toLowerCase().includes(needle);
  }), [simulation.runLog, category, query]);
  const squadEvents = simulation.runLog.filter((entry) => entry.category === 'squad').length;
  const agentDecisions = simulation.runLog.filter((entry) => entry.category === 'agent' && entry.event === 'decision').length;
  const playerActions = simulation.runLog.filter((entry) => entry.category === 'player').length;

  const exportLog = () => {
    const payload = {
      format: 'volition.run-log.v4',
      generatedAt: new Date().toISOString(),
      project: 'tactical-wizard-reference',
      simulation: {
        logicalTick: simulation.logicalTick,
        elapsedSeconds: simulation.elapsedSeconds,
        player: simulation.player,
        playerCombat: simulation.playerCombat,
        tacticalEffect: simulation.tacticalEffect,
        squad: simulation.squad,
        command: simulation.command,
        recovery: simulation.recovery,
        threatResponse: simulation.threatResponse,
        supplies: simulation.supplies,
        agents: simulation.agents.map((agent) => ({
          id: agent.id,
          label: agent.label,
          position: agent.position,
          facing: agent.facing,
          role: agent.role,
          task: agent.task,
          intent: agent.selectedIntent,
          beliefConfidence: agent.beliefConfidence,
          beliefSource: agent.beliefSource,
          targetVisible: agent.targetVisible,
          tacticalTarget: agent.tacticalTarget,
          commandRank: agent.commandRank,
          health: agent.health,
          maxHealth: agent.maxHealth,
          alive: agent.alive,
          moveSpeed: agent.moveSpeed,
          speedFactors: agent.speedFactors,
          ammoRounds: agent.ammoRounds,
          ammoCapacity: agent.ammoCapacity,
          burstsRemaining: agent.burstsRemaining,
          grenadeCount: agent.grenadeCount,
          grenadeCapacity: agent.grenadeCapacity,
          medkitCount: agent.medkitCount,
          medkitCapacity: agent.medkitCapacity,
          reactionState: agent.reactionState,
          reactionTarget: agent.reactionTarget,
          recoveryTask: agent.recoveryTask,
          recoveryTargetId: agent.recoveryTargetId,
          recoveryProgress: agent.recoveryProgress,
          logisticsTask: agent.logisticsTask,
          resupplyTargetId: agent.resupplyTargetId,
          resupplyTargetPosition: agent.resupplyTargetPosition,
        })),
      },
      entries: simulation.runLog,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `volition-run-T${simulation.logicalTick}-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <section className="page-stack run-log-page">
    <div className="section-heading"><div><h2>{L('运行日志', 'Run Log')}</h2><p>{L('V11 日志记录玩家输入、小队战术、受击方向、粗略威胁扇区、反伏击阶段、应急烟幕、第三人救援掩护、救治中断、资源与实时移速。隐藏射手未被视觉确认时，不导出其真实坐标作为 AI 认知。', 'V11 logs player input, squad tactics, incoming-fire bearing, coarse threat sector, counter-ambush phase, emergency smoke, third-party rescue security, treatment interruption, resources and live speed. When a shooter is not visually confirmed, its exact hidden coordinate is not exported as AI cognition.')}</p></div><button className="primary-button" onClick={exportLog}>⇩ {L('导出运行日志', 'Export Run Log')}</button></div>
    <div className="metric-grid"><LogMetric label={L('总记录', 'Entries')} value={simulation.runLog.length} /><LogMetric label={L('小队记录', 'Squad events')} value={squadEvents} /><LogMetric label={L('代理决策', 'Agent decisions')} value={agentDecisions} /><LogMetric label={L('玩家动作', 'Player actions')} value={playerActions} /></div>
    <section className="surface run-log-filter"><label>{L('类型', 'Category')}<select value={category} onChange={(event) => setCategory(event.target.value as 'all' | RunLogCategory)}><option value="all">{L('全部', 'All')}</option><option value="player">{L('玩家', 'Player')}</option><option value="squad">{L('小队代理', 'Squad')}</option><option value="agent">{L('士兵代理', 'Agent')}</option><option value="system">{L('系统', 'System')}</option></select></label><label>{L('搜索', 'Search')}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={L('代理、事件、战术、来袭方向、威胁扇区、救援、烟幕…', 'agent, event, tactic, bearing, threat sector, rescue, smoke…')} /></label><span>{filtered.length} / {simulation.runLog.length}</span></section>
    <section className="surface run-log-surface"><div className="run-log-table-head"><span>Tick</span><span>{L('主体', 'Actor')}</span><span>{L('事件', 'Event')}</span><span>{L('摘要', 'Summary')}</span><span>{L('数据', 'Data')}</span></div><div className="run-log-table-body">{filtered.slice().reverse().map((entry) => <LogRow key={entry.sequence} entry={entry} locale={locale} />)}</div></section>
  </section>;
}

function LogMetric({ label, value }: { readonly label: string; readonly value: number }) {
  return <div className="metric-card"><small>{label}</small><strong>{value}</strong><span>session</span></div>;
}

function LogRow({ entry, locale }: { readonly entry: RunLogEntry; readonly locale: Locale }) {
  const actor = entry.actorId === 'player'
    ? (locale === 'zh-CN' ? '玩家' : 'Player')
    : entry.category === 'squad'
      ? localizedAssetName(entry.actorId, entry.actorLabel, locale)
      : entry.category === 'agent'
        ? localizedAssetName(entry.actorId, entry.actorLabel, locale)
        : entry.actorLabel;
  const summary = localizeSummary(entry, locale);
  return <div className={`run-log-row cat-${entry.category}`}><code>T{entry.logicalTick}<small>{entry.timeSeconds.toFixed(2)}s</small></code><span><b>{actor}</b><small>{entry.category}</small></span><span className="event-pill">{entry.event}</span><p>{summary}</p><details><summary>{locale === 'zh-CN' ? '查看' : 'view'}</summary><pre>{JSON.stringify(entry.data, null, 2)}</pre></details></div>;
}

function localizeSummary(entry: RunLogEntry, locale: Locale): string {
  if (locale !== 'zh-CN') return entry.summary;
  if (entry.summary.includes('coarse threat sector')) return `小队受到未确认来源攻击：根据来袭方向建立粗略威胁扇区，隐藏射手真实坐标未进入认知。`;
  if (entry.summary.includes('Counter-ambush transitioned')) return '小队完成脱离枪线，转入前出 / 掩护 / 卡位的推测扇区搜索。';
  if (entry.summary.includes('Rescue interrupted')) return `救援受到战斗伤害打断；救治进度清零并重新建立第三人掩护。`;
  if (entry.summary.includes('Dedicated rescue-security')) return '已为第三名成员分配独立救援掩护位；救治者需等待该安全位建立。';
  if (entry.summary.includes('defensive smoke')) return `${localizedAssetName(entry.actorId, entry.actorLabel, locale)}针对未确认来袭方向投放应急烟幕。`;
  if (entry.event === 'decision') return `${localizedAssetName(entry.actorId, entry.actorLabel, locale)}：${localizedRole(String(entry.data.role ?? ''), locale)}，选择 ${localizedIntent(String(entry.data.intent ?? ''), locale)}；小队战术 ${localizedTactic(String(entry.data.tactic ?? ''), locale)}；弹药 ${String(entry.data.ammoRounds ?? '?')}（${String(entry.data.burstsRemaining ?? '?')} 个 burst）。`;
  if (entry.event === 'tactic') return `小队战术切换：${localizedTactic(String(entry.data.from ?? ''), locale)} → ${localizedTactic(String(entry.data.to ?? ''), locale)}。`;
  if (entry.event === 'roles') return entry.summary.includes('Fire-support') ? '小队完成火力基点交接，避免无效或失去态势的成员继续固定占位。' : `小队为 ${localizedTactic(String(entry.data.tactic ?? ''), locale)} 重新分配成员职责。`;
  if (entry.event === 'player_move') return '玩家发生位移。';
  if (entry.event === 'player_noise') return '玩家制造了测试噪声。';
  if (entry.event === 'fire') return entry.data.reason === 'out_of_ammo' ? `${localizedAssetName(entry.actorId, entry.actorLabel, locale)}因弹药耗尽无法射击。` : `${localizedAssetName(entry.actorId, entry.actorLabel, locale)}执行射击。`;
  if (entry.event === 'move') return `${localizedAssetName(entry.actorId, entry.actorLabel, locale)}正在执行${localizedRole(String(entry.data.role ?? ''), locale)}机动。`;
  if (entry.event === 'search') return `${localizedAssetName(entry.actorId, entry.actorLabel, locale)}正在搜索最后已知位置或推测威胁扇区。`;
  return entry.summary;
}
