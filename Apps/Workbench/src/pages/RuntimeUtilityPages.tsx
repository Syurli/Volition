import type { DecisionTrace } from '@volition/core';
import type { ConnectionState, LiveTelemetryState } from '../connection';
import type { Locale, MessageKey, Translate } from '../i18n';
import { localizedAssetName, localizedIntent, localizedRole, localizedTactic } from '../assetLocalization';
import type { GridPoint } from '../simulation/navigation';
import type { BuddyRole, LocomotionMode, SimulationOverlaySettings, SpecialAction, TacticalOpportunityPurpose, TacticalTask, TacticalWizardSimulationState } from '../simulation/tacticalWizardSimulation';
import { SimulationCanvas } from '../components/SimulationCanvas';
import { Candidates, EmptyState, Inspector, Metric, MetricLine } from '../components/Inspectors';

export function SimulationPage({ t, locale, simulation, overlays, setOverlays, playing, setPlaying, speed, setSpeed, onStep, onReset, onNoise, onMove, onSetPlayer }: { readonly t: Translate; readonly locale: Locale; readonly simulation: TacticalWizardSimulationState; readonly overlays: SimulationOverlaySettings; readonly setOverlays: (settings: SimulationOverlaySettings) => void; readonly playing: boolean; readonly setPlaying: (value: boolean) => void; readonly speed: number; readonly setSpeed: (value: number) => void; readonly onStep: () => void; readonly onReset: () => void; readonly onNoise: () => void; readonly onMove: (dx: number, dy: number) => void; readonly onSetPlayer: (point: GridPoint) => void }) {
  const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const toggle = (key: keyof SimulationOverlaySettings) => setOverlays({ ...overlays, [key]: !overlays[key] });
  const searchContract = simulation.squad.tactic === 'sweep' ? [
    `${L('前出', 'Lead')} ${shortActor(simulation.coordination.searchLeadId)}`,
    `${L('掩护', 'Cover')} ${shortActor(simulation.coordination.searchCoverId)}`,
    `${L('卡位', 'Block')} ${shortActor(simulation.coordination.searchOverwatchId)}`,
  ].join(' · ') : null;
  return <section className="simulation-page">
    <div className="simulation-toolbar">
      <div className="toolbar-group"><button className="primary-button" onClick={() => setPlaying(!playing)}>{playing ? `❚❚ ${t('pause')}` : `▶ ${t('play')}`}</button><button className="secondary-button" onClick={onStep}>→ {t('step')}</button><button className="secondary-button" onClick={onReset}>↺ {t('reset')}</button></div>
      <label>{L('速度', 'Speed')}<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label>
    </div>
    <div className="simulation-layout">
      <div className="simulation-stage"><SimulationCanvas state={simulation} overlays={overlays} onSetPlayer={onSetPlayer} locale={locale} /><div className="map-help">{t('directControl')} · Space = {t('emitNoise')} · {L('点击地图 = 传送测试玩家', 'click = teleport test player')} · 30 Hz {L('运动', 'motion')} / 4 Hz {L('决策', 'decision')}</div></div>
      <aside className="simulation-sidebar">
        <section className="surface compact"><h3>{t('squadTactics')}</h3>
          <MetricLine label={t('alertState')} value={simulation.squad.alertState} />
          <MetricLine label={t('tactic')} value={localizedTactic(simulation.squad.tactic, locale)} />
          <MetricLine label={L('安全枪线', 'Safe fire lanes')} value={simulation.safeFireLanes} />
          <MetricLine label={L('小队展开度', 'Squad spread')} value={simulation.squad.spread.toFixed(2)} />
          <MetricLine label={L('失联 Tick', 'Lost-contact ticks')} value={simulation.squad.lostContactTicks} />
          <MetricLine label={t('sharedLastKnown')} value={simulation.squad.sharedLastKnownPosition ? `${simulation.squad.sharedLastKnownPosition.x}, ${simulation.squad.sharedLastKnownPosition.y}` : '—'} />
          {searchContract ? <MetricLine label={L('搜索协同', 'Search contract')} value={searchContract} /> : null}
          <p className="tactic-reason">{simulation.squad.tacticReason}</p>
          <div className="squad-member-list">{simulation.agents.map((agent) => <div key={agent.id} className={`squad-member agent-${agent.visualKey} role-${agent.role}`}>
            <span>
              <strong>{localizedAssetName(agent.id, agent.label, locale)}</strong>
              <small className="task-status">{localizedTask(agent.task, locale)} · {localizedCoverState(agent.coverState, locale)}</small>
              <small>{localizedLocomotion(agent.locomotionMode, locale)} · {localizedOpportunity(agent.opportunityPurpose, locale)}</small>
              <small>{localizedIntent(agent.selectedIntent, locale)}</small>
            </span>
            <span>
              <b>{localizedRole(agent.role, locale)}</b>
              <small>{agent.tacticalTarget ? `${L('目标', 'target')} ${agent.tacticalTarget.x},${agent.tacticalTarget.y}` : L('保持', 'hold')}</small>
              {agent.buddyRole !== 'none' ? <small>{L('协同', 'buddy')} {localizedBuddy(agent.buddyRole, locale)} · {agent.buddyReady ? L('就绪', 'ready') : L('等待', 'waiting')}</small> : null}
              {agent.task === 'search_sector' || agent.task === 'overwatch' ? <small>{L('搜索', 'search')} {(agent.searchProgress * 100).toFixed(0)}%</small> : null}
              <small>{L('投掷物', 'grenade')} {agent.grenadeCount} · {agent.grenadeCooldownTicks > 0 ? `${L('冷却', 'CD')} ${agent.grenadeCooldownTicks}` : L('可用', 'ready')}</small>
              {agent.specialAction !== 'none' && agent.specialActionPulse > 0 ? <small className="task-status">{localizedSpecial(agent.specialAction, locale)}</small> : null}
              {agent.backTurnPermitted ? <small className="warning">{L('受掩护背身冲刺', 'SUPPORTED BACK-TURN')}</small> : null}
              {agent.fireBlockedByFriend ? <small className="warning">{L('枪线阻挡', 'NO FIRE')}</small> : null}
            </span>
          </div>)}</div>
        </section>
        <section className="surface compact"><h3>{t('runtimeInspector')}</h3><MetricLine label="Tick" value={simulation.logicalTick} /><MetricLine label={L('运动帧', 'Motion frame')} value={simulation.motionFrame} /><MetricLine label={L('模拟时间', 'Sim time')} value={`${simulation.elapsedSeconds.toFixed(1)}s`} /><MetricLine label={L('代理', 'Agents')} value={simulation.agents.length} /><MetricLine label={L('活动投掷物', 'Grenade events')} value={simulation.grenadeEvents.length} /><MetricLine label={t('beliefConfidence')} value={simulation.beliefConfidence.toFixed(2)} /></section>
        <section className="surface compact"><h3>{t('movePlayer')}</h3><div className="dpad"><button onClick={() => onMove(0,-1)}>↑</button><button onClick={() => onMove(-1,0)}>←</button><button onClick={() => onMove(0,1)}>↓</button><button onClick={() => onMove(1,0)}>→</button></div><button className="noise-button" onClick={onNoise}>))) {t('emitNoise')}</button><small className="control-note">{t('directControl')}</small></section>
        <section className="surface compact"><h3>{t('overlays')}</h3>{(['vision','hearing','path','memory','cover','grid'] as const).map((key) => <label className="check-row" key={key}><input type="checkbox" checked={overlays[key]} onChange={() => toggle(key)} /><span>{key === 'memory' ? t('memoryOverlay') : t(key as MessageKey)}</span></label>)}</section>
        <section className="surface compact event-list"><h3>{t('recentEvents')}</h3>{simulation.eventLog.map((event, index) => <p key={`${event}-${index}`}>{event}</p>)}</section>
      </aside>
    </div>
  </section>;
}

export function DebugPage({ t, locale, simulation, traces }: { readonly t: Translate; readonly locale: Locale; readonly simulation: TacticalWizardSimulationState; readonly traces: readonly DecisionTrace[] }) {
  const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const trace = simulation.latestTrace ?? traces.at(-1) ?? null;
  if (!trace) return <EmptyState title={t('runtimeInspector')} detail={L('运行或单步模拟以生成第一条 Decision Trace。', 'Run or step Simulation to produce the first Decision Trace.')} />;
  return <section className="page-stack"><section className="surface"><h3>{t('squadTactics')} · {localizedTactic(simulation.squad.tactic, locale)}</h3><p className="tactic-reason">{simulation.squad.tacticReason}</p><div className="squad-debug-grid">{simulation.agents.map((agent) => <div key={agent.id} className={`squad-debug-card agent-${agent.visualKey} role-${agent.role}`}><small>{agent.id}</small><strong>{localizedAssetName(agent.id, agent.label, locale)}</strong><span>{localizedRole(agent.role, locale)} · {localizedTask(agent.task, locale)}</span><span>{localizedCoverState(agent.coverState, locale)} · {localizedLocomotion(agent.locomotionMode, locale)}</span><span>{localizedOpportunity(agent.opportunityPurpose, locale)} · {agent.buddyRole === 'none' ? '—' : localizedBuddy(agent.buddyRole, locale)}</span><span>{agent.tacticalTarget ? `target → ${agent.tacticalTarget.x},${agent.tacticalTarget.y}` : 'target → —'}</span><span>grenade → {agent.grenadeCount} · {agent.grenadeCooldownTicks > 0 ? `CD ${agent.grenadeCooldownTicks}` : 'ready'}</span><span>{agent.fireBlockedByFriend ? `NO FIRE → ${agent.fireBlockedByFriend.split(':').at(-1)}` : `fire lane → ${agent.fireOrigin ? 'active' : 'clear'}`}</span></div>)}</div></section><div className="metric-grid"><Metric label="Logical tick" value={trace.logicalTick} detail={trace.agentId} /><Metric label={t('currentIntent')} value={localizedIntent(trace.selectedIntent.id, locale)} detail={trace.selectedIntent.reason} /><Metric label={t('beliefConfidence')} value={trace.belief.confidence.toFixed(2)} detail={trace.belief.source} /><Metric label={L('安全枪线', 'Safe fire lanes')} value={simulation.safeFireLanes} detail={`${L('展开度', 'spread')} ${simulation.squad.spread}`} /></div><div className="debug-grid"><Inspector title="Context" value={trace.contextSummary} /><Inspector title="Observation" value={trace.observations} /><Inspector title="Memory / Belief" value={{ memory: trace.memoryAfter, belief: trace.belief, changes: trace.memoryChanges }} /><Candidates trace={trace} /><Inspector title="Selected Intent" value={trace.selectedIntent} /><Inspector title="Squad / Tactical Tasks" value={{ squad: simulation.squad, coordination: simulation.coordination, safeFireLanes: simulation.safeFireLanes, fireLanes: simulation.fireLanes, grenadeEvents: simulation.grenadeEvents, agents: simulation.agents.map((agent) => ({ id: agent.id, role: agent.role, task: agent.task, coverState: agent.coverState, locomotionMode: agent.locomotionMode, backTurnPermitted: agent.backTurnPermitted, buddyRole: agent.buddyRole, buddyReady: agent.buddyReady, opportunityPurpose: agent.opportunityPurpose, tacticalTarget: agent.tacticalTarget, searchProgress: agent.searchProgress, grenadeCount: agent.grenadeCount, grenadeCooldownTicks: agent.grenadeCooldownTicks, specialAction: agent.specialAction, fireBlockedByFriend: agent.fireBlockedByFriend, intent: agent.selectedIntent })), actions: simulation.latestSnapshot?.actions ?? [], results: trace.actionResults, cancelledIntent: trace.cancelledIntent ?? null }} /></div></section>;
}

export function VisualizationPage({ t, traces }: { readonly t: Translate; readonly traces: readonly DecisionTrace[] }) {
  if (traces.length === 0) return <EmptyState title={t('visualization')} detail="Run Simulation to collect timeline data." />;
  const latest = traces.at(-1)!; const maxTick = Math.max(1, traces.length - 1); const points = traces.map((trace, index) => `${20 + index / maxTick * 660},${170 - trace.belief.confidence * 130}`).join(' ');
  return <section className="page-stack"><section className="surface"><h3>{t('intentTimeline')}</h3><div className="intent-timeline">{traces.map((trace) => <div key={`${trace.agentId}-${trace.logicalTick}`} className={`intent-block intent-${trace.selectedIntent.id}`}><small>{trace.agentId.split(':').at(-1)} · T{trace.logicalTick}</small><strong>{trace.selectedIntent.id}</strong></div>)}</div></section><div className="two-column"><section className="surface"><h3>{t('beliefHistory')}</h3><svg className="belief-chart" viewBox="0 0 700 190" role="img" aria-label="Belief confidence history"><line x1="20" y1="170" x2="680" y2="170" /><line x1="20" y1="40" x2="20" y2="170" /><polyline points={points} /><text x="24" y="35">1.0</text><text x="24" y="185">0.0</text></svg></section><section className="surface"><h3>{t('decisionScores')} · T{latest.logicalTick}</h3><div className="score-list">{[...latest.candidates].sort((a,b) => b.score-a.score).map((candidate) => <div key={candidate.id}><div><span>{candidate.intent.id}</span><strong>{candidate.score.toFixed(1)}</strong></div><div className="score-track"><span style={{ width: `${Math.min(100, Math.max(0, candidate.score))}%` }} /></div><small>{candidate.eligible ? candidate.reason : candidate.rejectedReason ?? candidate.reason}</small></div>)}</div></section></div><section className="surface"><h3>Stimulus / Trace timeline</h3><div className="trace-table">{traces.slice().reverse().slice(0,30).map((trace) => <div key={`${trace.agentId}-${trace.logicalTick}`}><code>{trace.agentId.split(':').at(-1)} · T{trace.logicalTick}</code><strong>{trace.selectedIntent.id}</strong><span>{trace.observations.map((entry) => entry.kind).join(', ') || '—'}</span><span>{trace.belief.source} {trace.belief.confidence.toFixed(2)}</span></div>)}</div></section></section>;
}

export function ConnectionPage({ endpoint, setEndpoint, connectionState, connectionDetail, liveMessages, liveTelemetry, onConnect, onDisconnect }: { readonly endpoint: string; readonly setEndpoint: (value: string) => void; readonly connectionState: ConnectionState; readonly connectionDetail: string; readonly liveMessages: number; readonly liveTelemetry: LiveTelemetryState; readonly onConnect: () => void; readonly onDisconnect: () => void }) {
  return <section className="page-stack"><section className="surface connection-surface"><h2>Connection Manager</h2><p>Offline projects and Tactical Wizard Simulation do not require a running game. Connect only for a live Bridge.</p><label>Live endpoint<input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} spellCheck={false} /></label><div className="action-row"><button className="primary-button" onClick={onConnect}>Connect</button><button className="secondary-button" onClick={onDisconnect}>Disconnect</button></div><p className={`diagnostic ${connectionState}`}>{connectionDetail}</p></section><div className="metric-grid"><Metric label="State" value={connectionState} detail="Protocol transport" /><Metric label="Messages" value={liveMessages} detail="This session" /><Metric label="Agents" value={liveTelemetry.agentIds.length} detail="Live inventory" /><Metric label="Latest trace" value={liveTelemetry.latestTrace?.logicalTick ?? '—'} detail="Live telemetry" /></div><section className="surface"><h3>Security boundary</h3><p>Pages is HTTPS and accepts secure <code>wss://</code> live endpoints. Local HTTP development may use <code>ws://</code>. Offline editor and Simulation remain independent.</p></section></section>;
}

function localizedTask(task: TacticalTask, locale: Locale): string {
  if (locale !== 'zh-CN') return task.replaceAll('_', ' ');
  const labels: Record<TacticalTask, string> = { patrol: '巡逻', suppress: '压制', bound_to_cover: '交替推进', hold_cover: '据守掩体', flank_to_cover: '掩体侧翼', crossfire: '交叉火力', assault: '突击', search_sector: '分区搜索', overwatch: '警戒掩护', regroup: '重组' };
  return labels[task];
}

function localizedCoverState(state: TacticalWizardSimulationState['agents'][number]['coverState'], locale: Locale): string {
  if (locale !== 'zh-CN') return state;
  return { none: '暴露', moving: '机动中', covered: '掩体内', peeking: '探头射击' }[state];
}

function localizedLocomotion(mode: LocomotionMode, locale: Locale): string {
  if (locale !== 'zh-CN') return mode.replaceAll('_', ' ');
  const labels: Record<LocomotionMode, string> = { free: '自由移动', forward: '向威胁推进', lateral: '侧向戒备移动', backpedal: '面敌后撤', covered_dash: '受掩护冲刺' };
  return labels[mode];
}

function localizedBuddy(role: BuddyRole, locale: Locale): string {
  if (locale !== 'zh-CN') return role;
  const labels: Record<BuddyRole, string> = { none: '无', lead: '前出检查', cover: '伙伴掩护', overwatch: '警戒卡位' };
  return labels[role];
}

function localizedOpportunity(purpose: TacticalOpportunityPurpose, locale: Locale): string {
  if (locale !== 'zh-CN') return purpose.replaceAll('_', ' ');
  const labels: Record<TacticalOpportunityPurpose, string> = { none: '无位置用途', base_of_fire: '架枪/火力基点', covered_move: '受掩护机动', flank: '侧翼机会', crossfire: '交叉射界', block_exit: '卡位/封锁', search: '搜索责任区', ambush: '伏击机会', close_pressure: '近距施压' };
  return labels[purpose];
}

function localizedSpecial(action: SpecialAction, locale: Locale): string {
  if (locale !== 'zh-CN') return action.replaceAll('_', ' ');
  const labels: Record<SpecialAction, string> = { none: '无', throw_flash: '投掷震撼弹', throw_frag: '投掷破片弹', throw_smoke: '投掷烟幕', melee: '近战机会', surprise: '伏击/偷袭机会' };
  return labels[action];
}

function shortActor(id: string | null): string {
  return id?.split(':').at(-1) ?? '—';
}
