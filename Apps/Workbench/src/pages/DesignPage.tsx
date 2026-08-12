import { useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  validateProjectConfig,
  type AgentDefinition,
  type BehaviorDefinition,
  type BrainSupervisorDefinition,
  type ReasonerDefinition,
  type SquadDefinition,
  type VolitionProjectConfig,
} from '@volition/schema';
import type { Locale, Translate } from '../i18n';
import { serializeWorkbenchProject, type WorkbenchProject } from '../projects';

interface Props {
  readonly t: Translate;
  readonly locale: Locale;
  readonly config: VolitionProjectConfig;
  readonly setConfig: (config: VolitionProjectConfig) => void;
  readonly project: WorkbenchProject;
  readonly onSave: () => void;
  readonly onReset: () => void;
}
type AssetKind = 'squad' | 'agent' | 'behavior' | 'supervisor' | 'reasoner';
interface Selection { readonly kind: AssetKind; readonly id: string; }
type DragPayload = { readonly kind: 'agent' | 'behavior' | 'squad-member'; readonly id: string; readonly squadId?: string };

export function DesignPage({ t, locale, config, setConfig, project, onSave, onReset }: Props) {
  const [mode, setMode] = useState<'assets' | 'json'>('assets');
  const [selection, setSelection] = useState<Selection | null>(() => firstSelection(config));
  const [jsonText, setJsonText] = useState(() => JSON.stringify(config, null, 2));
  const [validationMessage, setValidationMessage] = useState('');
  const validation = useMemo(() => validateProjectConfig(config), [config]);
  const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  useEffect(() => setJsonText(JSON.stringify(config, null, 2)), [config]);
  useEffect(() => { if (selection === null || !selectionExists(config, selection)) setSelection(firstSelection(config)); }, [config, selection]);

  const updateAgent = (id: string, update: (agent: AgentDefinition) => AgentDefinition) => setConfig({ ...config, agents: config.agents.map((agent) => agent.id === id ? update(agent) : agent) });
  const updateBehavior = (id: string, update: (behavior: BehaviorDefinition) => BehaviorDefinition) => setConfig({ ...config, behaviors: (config.behaviors ?? []).map((behavior) => behavior.id === id ? update(behavior) : behavior) });
  const updateSquad = (id: string, update: (squad: SquadDefinition) => SquadDefinition) => setConfig({ ...config, squads: (config.squads ?? []).map((squad) => squad.id === id ? update(squad) : squad) });
  const updateSupervisor = (id: string, update: (supervisor: BrainSupervisorDefinition) => BrainSupervisorDefinition) => setConfig({ ...config, supervisors: (config.supervisors ?? []).map((entry) => entry.id === id ? update(entry) : entry) });
  const updateReasoner = (id: string, update: (reasoner: ReasonerDefinition) => ReasonerDefinition) => setConfig({ ...config, reasoners: (config.reasoners ?? []).map((entry) => entry.id === id ? update(entry) : entry) });

  const assignBehaviorToAgent = (agentId: string, behaviorId: string) => {
    const behavior = config.behaviors?.find((entry) => entry.id === behaviorId); if (behavior?.scope !== 'agent') return;
    updateAgent(agentId, (agent) => ({ ...agent, behaviorIds: unique([...(agent.behaviorIds ?? []), behavior.id]), behaviors: behavior.intentId === undefined ? agent.behaviors : { ...agent.behaviors, [behavior.intentId]: behavior.hostBehaviorRef } }));
  };
  const assignBehaviorToSquad = (squadId: string, behaviorId: string) => {
    const behavior = config.behaviors?.find((entry) => entry.id === behaviorId); if (behavior?.scope !== 'squad') return;
    updateSquad(squadId, (squad) => ({ ...squad, behaviorIds: unique([...squad.behaviorIds, behavior.id]) }));
  };
  const addAgentToSquad = (squadId: string, agentId: string) => updateSquad(squadId, (squad) => {
    const suffix = agentId.split(':').at(-1) ?? 'member'; let index = 1; let id = suffix;
    while (squad.members.some((member) => member.id === id)) { index += 1; id = `${suffix}-${index}`; }
    return { ...squad, members: [...squad.members, { id, agentId, displayName: config.agents.find((agent) => agent.id === agentId)?.displayName ?? id }] };
  });
  const reorderMember = (squadId: string, draggedId: string, targetId: string) => updateSquad(squadId, (squad) => {
    const from = squad.members.findIndex((entry) => entry.id === draggedId); const to = squad.members.findIndex((entry) => entry.id === targetId); if (from < 0 || to < 0 || from === to) return squad;
    const members = [...squad.members]; const [moved] = members.splice(from, 1); if (moved !== undefined) members.splice(to, 0, moved); return { ...squad, members };
  });

  const addAgent = () => {
    const template = config.agents[0]; if (template === undefined) return; const id = nextId('agent:new', config.agents.map((entry) => entry.id));
    const agent = { ...structuredClone(template), id, displayName: L('新 Agent', 'New Agent'), extensions: { ...(template.extensions ?? {}), debugColorKey: `custom-${config.agents.length + 1}` } };
    setConfig({ ...config, agents: [...config.agents, agent] }); setSelection({ kind: 'agent', id });
  };
  const addBehavior = () => {
    const existing = (config.behaviors ?? []).map((entry) => entry.id); const id = nextId('behavior:new', existing);
    const behavior: BehaviorDefinition = { id, displayName: L('新行为', 'New Behavior'), scope: 'agent', intentId: 'custom', hostBehaviorRef: 'host.behavior.custom', requiredCapabilities: [] };
    setConfig({ ...config, behaviors: [...(config.behaviors ?? []), behavior] }); setSelection({ kind: 'behavior', id });
  };
  const addSquad = () => {
    const id = nextId('squad:new', (config.squads ?? []).map((entry) => entry.id)); const first = config.agents[0]; if (first === undefined) return;
    const squad: SquadDefinition = { id, displayName: L('新小队', 'New Squad'), members: [{ id: 'member-1', agentId: first.id, displayName: first.displayName }], behaviorIds: [] };
    setConfig({ ...config, squads: [...(config.squads ?? []), squad] }); setSelection({ kind: 'squad', id });
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText) as VolitionProjectConfig; const result = validateProjectConfig(parsed);
      setValidationMessage(result.valid ? L('Schema 有效。', 'Schema valid.') : result.issues.map((issue) => `${issue.path}: ${issue.message}`).join(' · ')); if (result.valid) setConfig(parsed);
    } catch (error) { setValidationMessage(error instanceof Error ? error.message : String(error)); }
  };
  const exportProject = () => { const blob = new Blob([serializeWorkbenchProject({ ...project, config })], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'volition.project.json'; anchor.click(); URL.revokeObjectURL(url); };

  const selected = selection ?? firstSelection(config);
  return <section className="page-stack design-page">
    <div className="section-heading"><div><h2>{L('AI 设计', 'AI Design')}</h2><p>{L('专用的强类型资产编辑器：小队、Agent、行为、Brain Supervisor 与 Reasoner 分开编辑；不把所有算法压成万能节点图。', 'Dedicated typed asset editors for squads, agents, behaviors, Brain Supervisors and Reasoners; algorithms are not flattened into one generic graph.')}</p></div><div className="segmented"><button className={mode === 'assets' ? 'active' : ''} onClick={() => setMode('assets')}>{L('资产编辑', 'Assets')}</button><button className={mode === 'json' ? 'active' : ''} onClick={() => setMode('json')}>{t('jsonEditor')}</button></div></div>
    <div className={`architecture-strip ${validation.valid ? 'valid' : 'invalid'}`}><span>Brain Supervisor</span><b>→</b><span>Typed Reasoner</span><b>→</b><span>Intent / Action Proposal</span><b>→</b><span>Arbitrator</span><b>→</b><span>Executor / Bridge</span><em>{validation.valid ? L('Schema 有效', 'Schema valid') : `${validation.issues.filter((issue) => issue.severity === 'error').length} ${L('个错误', 'errors')}`}</em></div>
    {mode === 'assets' ? <div className="authoring-layout">
      <aside className="asset-browser"><div className="asset-browser-head"><strong>{L('项目资产', 'Project Assets')}</strong><small>{config.displayName}</small></div>
        <AssetSection title={L('小队', 'Squads')} items={(config.squads ?? []).map((entry) => ({ id: entry.id, label: entry.displayName }))} kind="squad" selection={selected} setSelection={setSelection} draggableKind={null} />
        <AssetSection title="Agents" items={config.agents.map((entry) => ({ id: entry.id, label: entry.displayName }))} kind="agent" selection={selected} setSelection={setSelection} draggableKind="agent" />
        <AssetSection title={L('行为', 'Behaviors')} items={(config.behaviors ?? []).map((entry) => ({ id: entry.id, label: entry.displayName, meta: entry.scope }))} kind="behavior" selection={selected} setSelection={setSelection} draggableKind="behavior" />
        <AssetSection title="Brain Supervisors" items={(config.supervisors ?? []).map((entry) => ({ id: entry.id, label: entry.displayName }))} kind="supervisor" selection={selected} setSelection={setSelection} draggableKind={null} />
        <AssetSection title="Reasoners" items={(config.reasoners ?? []).map((entry) => ({ id: entry.id, label: entry.displayName, meta: entry.kind }))} kind="reasoner" selection={selected} setSelection={setSelection} draggableKind={null} />
        <div className="asset-add-row"><button onClick={addSquad}>+ {L('小队', 'Squad')}</button><button onClick={addAgent}>+ Agent</button><button onClick={addBehavior}>+ {L('行为', 'Behavior')}</button></div>
      </aside>
      <main className="authoring-canvas">{selected === null ? <EmptyDesign /> : selected.kind === 'squad' ? <SquadEditor locale={locale} squad={(config.squads ?? []).find((entry) => entry.id === selected.id)} config={config} onUpdate={(update) => updateSquad(selected.id, update)} onAddAgent={(agentId) => addAgentToSquad(selected.id, agentId)} onAssignBehavior={(behaviorId) => assignBehaviorToSquad(selected.id, behaviorId)} onReorder={(dragged, target) => reorderMember(selected.id, dragged, target)} /> : selected.kind === 'agent' ? <AgentEditor locale={locale} agent={config.agents.find((entry) => entry.id === selected.id)} config={config} onUpdate={(update) => updateAgent(selected.id, update)} onAssignBehavior={(behaviorId) => assignBehaviorToAgent(selected.id, behaviorId)} /> : selected.kind === 'behavior' ? <BehaviorEditor locale={locale} behavior={(config.behaviors ?? []).find((entry) => entry.id === selected.id)} onUpdate={(update) => updateBehavior(selected.id, update)} /> : selected.kind === 'supervisor' ? <SupervisorEditor locale={locale} supervisor={(config.supervisors ?? []).find((entry) => entry.id === selected.id)} config={config} onUpdate={(update) => updateSupervisor(selected.id, update)} /> : <ReasonerEditor locale={locale} reasoner={(config.reasoners ?? []).find((entry) => entry.id === selected.id)} onUpdate={(update) => updateReasoner(selected.id, update)} />}</main>
    </div> : <section className="surface"><textarea className="code-editor" value={jsonText} onChange={(event) => setJsonText(event.target.value)} spellCheck={false} /><div className="action-row"><button className="primary-button" onClick={applyJson}>Validate & Apply</button><span>{validationMessage}</span></div></section>}
    <div className="action-row"><button className="primary-button" onClick={onSave}>{project.kind === 'built-in' ? t('duplicateProject') : L('保存到本地', 'Save locally')}</button><button className="secondary-button" onClick={exportProject}>{t('exportProject')}</button><button className="secondary-button" onClick={onReset}>{t('resetExample')}</button></div>
  </section>;
}

function AssetSection({ title, items, kind, selection, setSelection, draggableKind }: { readonly title: string; readonly items: readonly { id: string; label: string; meta?: string }[]; readonly kind: AssetKind; readonly selection: Selection | null; readonly setSelection: (selection: Selection) => void; readonly draggableKind: DragPayload['kind'] | null }) {
  return <section className="asset-section"><h4>{title}<span>{items.length}</span></h4>{items.map((item) => <button key={item.id} className={selection?.kind === kind && selection.id === item.id ? 'asset-row active' : 'asset-row'} draggable={draggableKind !== null} onDragStart={(event) => draggableKind !== null && writeDrag(event, { kind: draggableKind, id: item.id })} onClick={() => setSelection({ kind, id: item.id })}><span>{item.label}</span>{item.meta && <small>{item.meta}</small>}</button>)}</section>;
}

function SquadEditor({ locale, squad, config, onUpdate, onAddAgent, onAssignBehavior, onReorder }: { readonly locale: Locale; readonly squad: SquadDefinition | undefined; readonly config: VolitionProjectConfig; readonly onUpdate: (update: (squad: SquadDefinition) => SquadDefinition) => void; readonly onAddAgent: (agentId: string) => void; readonly onAssignBehavior: (behaviorId: string) => void; readonly onReorder: (dragged: string, target: string) => void }) {
  if (squad === undefined) return <EmptyDesign />; const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const behaviorMap = new Map((config.behaviors ?? []).map((entry) => [entry.id, entry]));
  const drop = (event: DragEvent, targetMemberId?: string) => { event.preventDefault(); const payload = readDrag(event); if (payload?.kind === 'agent') onAddAgent(payload.id); else if (payload?.kind === 'behavior') onAssignBehavior(payload.id); else if (payload?.kind === 'squad-member' && targetMemberId !== undefined && payload.squadId === squad.id) onReorder(payload.id, targetMemberId); };
  return <div className="typed-editor"><div className="typed-editor-title"><span className="asset-type">SQUAD</span><input value={squad.displayName} onChange={(event) => onUpdate((current) => ({ ...current, displayName: event.target.value }))} /><code>{squad.id}</code></div>
    <section className="module-zone"><header><strong>{L('小队代理 / 成员槽位', 'Squad proxies / member slots')}</strong><small>{L('从左侧拖入 Agent；拖动成员卡片可调整队形顺序。', 'Drag Agents from the asset browser; drag member cards to reorder formation slots.')}</small></header><div className="member-lane drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event)}>{squad.members.map((member) => { const agent = config.agents.find((entry) => entry.id === member.agentId); return <div key={member.id} className="module-card agent-module" draggable onDragStart={(event) => writeDrag(event, { kind: 'squad-member', id: member.id, squadId: squad.id })} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); drop(event, member.id); }}><small>{member.id}</small><strong>{member.displayName ?? agent?.displayName ?? member.agentId}</strong><span>{agent?.displayName ?? member.agentId}</span><em>{member.preferredRole ?? 'flex'}</em></div>; })}<div className="drop-placeholder">+ {L('拖入 Agent', 'Drop Agent')}</div></div></section>
    <section className="module-zone"><header><strong>{L('小队战术模块', 'Squad tactic modules')}</strong><small>{L('从左侧拖入 scope=squad 的行为定义。', 'Drop behavior assets with scope=squad.')}</small></header><div className="binding-lane drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event)}>{squad.behaviorIds.map((id) => <div key={id} className="binding-chip"><strong>{behaviorMap.get(id)?.displayName ?? id}</strong><code>{behaviorMap.get(id)?.hostBehaviorRef ?? id}</code><button onClick={() => onUpdate((current) => ({ ...current, behaviorIds: current.behaviorIds.filter((entry) => entry !== id) }))}>×</button></div>)}<div className="drop-placeholder">+ {L('拖入小队行为', 'Drop squad behavior')}</div></div></section>
  </div>;
}

function AgentEditor({ locale, agent, config, onUpdate, onAssignBehavior }: { readonly locale: Locale; readonly agent: AgentDefinition | undefined; readonly config: VolitionProjectConfig; readonly onUpdate: (update: (agent: AgentDefinition) => AgentDefinition) => void; readonly onAssignBehavior: (behaviorId: string) => void }) {
  if (agent === undefined) return <EmptyDesign />; const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en; const behaviorMap = new Map((config.behaviors ?? []).map((entry) => [entry.id, entry]));
  const setMemory = (key: keyof AgentDefinition['memory'], value: number) => onUpdate((current) => ({ ...current, memory: { ...current.memory, [key]: value } }));
  const setScore = (key: string, value: number) => onUpdate((current) => ({ ...current, decisionPolicy: { ...current.decisionPolicy, config: { ...(current.decisionPolicy.config ?? {}), [key]: value } } }));
  return <div className="typed-editor"><div className="typed-editor-title"><span className="asset-type">AGENT</span><input value={agent.displayName} onChange={(event) => onUpdate((current) => ({ ...current, displayName: event.target.value }))} /><code>{agent.id}</code></div>
    <div className="editor-property-grid"><section className="property-panel"><h4>{L('Brain / 决策', 'Brain / Decision')}</h4><label>Supervisor<select value={agent.supervisorId ?? ''} onChange={(event) => onUpdate((current) => ({ ...current, supervisorId: event.target.value || undefined }))}><option value="">—</option>{(config.supervisors ?? []).map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}</select></label><code>{agent.decisionPolicy.id}</code>{['engageScore','searchScore','investigateScore','patrolScore'].map((key) => <Num key={key} label={key} value={Number(agent.decisionPolicy.config?.[key] ?? 0)} step={1} onChange={(value) => setScore(key, value)} />)}</section>
      <section className="property-panel"><h4>{L('记忆', 'Memory')}</h4><Num label="Decay / second" value={agent.memory.decayPerSecond} step={0.01} onChange={(value) => setMemory('decayPerSecond', value)} /><Num label="Forget below" value={agent.memory.forgetBelowConfidence} step={0.01} onChange={(value) => setMemory('forgetBelowConfidence', value)} /><h4>{L('能力', 'Capabilities')}</h4><div className="tag-row">{agent.capabilities.map((value) => <span key={value}>{value}</span>)}</div></section>
    </div>
    <section className="module-zone"><header><strong>{L('Agent 行为绑定', 'Agent behavior bindings')}</strong><small>{L('拖入 agent 行为；运行时仍通过 Intent → host-neutral behavior reference 执行。', 'Drop agent behaviors; Runtime still resolves Intent → host-neutral behavior reference.')}</small></header><div className="binding-lane drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const payload = readDrag(event); if (payload?.kind === 'behavior') onAssignBehavior(payload.id); }}>{(agent.behaviorIds ?? []).map((id) => <div key={id} className="binding-chip"><strong>{behaviorMap.get(id)?.displayName ?? id}</strong><code>{behaviorMap.get(id)?.hostBehaviorRef ?? id}</code><button onClick={() => onUpdate((current) => ({ ...current, behaviorIds: (current.behaviorIds ?? []).filter((entry) => entry !== id) }))}>×</button></div>)}<div className="drop-placeholder">+ {L('拖入行为', 'Drop behavior')}</div></div></section>
  </div>;
}

function BehaviorEditor({ locale, behavior, onUpdate }: { readonly locale: Locale; readonly behavior: BehaviorDefinition | undefined; readonly onUpdate: (update: (behavior: BehaviorDefinition) => BehaviorDefinition) => void }) {
  if (behavior === undefined) return <EmptyDesign />; const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  return <div className="typed-editor"><div className="typed-editor-title"><span className="asset-type">BEHAVIOR</span><input value={behavior.displayName} onChange={(event) => onUpdate((current) => ({ ...current, displayName: event.target.value }))} /><code>{behavior.id}</code></div><div className="editor-property-grid"><section className="property-panel"><label>{L('作用域', 'Scope')}<select value={behavior.scope} onChange={(event) => onUpdate((current) => ({ ...current, scope: event.target.value as BehaviorDefinition['scope'] }))}><option value="agent">agent</option><option value="squad">squad</option></select></label><label>Intent ID<input value={behavior.intentId ?? ''} onChange={(event) => onUpdate((current) => ({ ...current, intentId: event.target.value || undefined }))} /></label><label>Host Behavior Ref<input value={behavior.hostBehaviorRef} onChange={(event) => onUpdate((current) => ({ ...current, hostBehaviorRef: event.target.value }))} /></label></section><section className="property-panel"><label>{L('所需能力（逗号分隔）', 'Required capabilities (comma separated)')}<input value={behavior.requiredCapabilities.join(', ')} onChange={(event) => onUpdate((current) => ({ ...current, requiredCapabilities: splitList(event.target.value) }))} /></label><label>{L('说明', 'Description')}<textarea value={behavior.description ?? ''} onChange={(event) => onUpdate((current) => ({ ...current, description: event.target.value }))} /></label></section></div><section className="module-zone contract-zone"><strong>Action Contract</strong><p>{L('这里编辑的是可移植行为契约与 Host alias，不在 Workbench 中伪造引擎动作实现。', 'This edits the portable behavior contract and Host alias; engine action implementation stays behind the Bridge.')}</p></section></div>;
}

function SupervisorEditor({ locale, supervisor, config, onUpdate }: { readonly locale: Locale; readonly supervisor: BrainSupervisorDefinition | undefined; readonly config: VolitionProjectConfig; readonly onUpdate: (update: (supervisor: BrainSupervisorDefinition) => BrainSupervisorDefinition) => void }) {
  if (supervisor === undefined) return <EmptyDesign />; const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en; const reasoners = new Map((config.reasoners ?? []).map((entry) => [entry.id, entry]));
  return <div className="typed-editor"><div className="typed-editor-title"><span className="asset-type">BRAIN SUPERVISOR</span><input value={supervisor.displayName} onChange={(event) => onUpdate((current) => ({ ...current, displayName: event.target.value }))} /><code>{supervisor.id}</code></div><label className="wide-field">{L('初始模式', 'Initial mode')}<select value={supervisor.initialMode} onChange={(event) => onUpdate((current) => ({ ...current, initialMode: event.target.value }))}>{supervisor.modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.displayName}</option>)}</select></label><div className="supervisor-flow">{supervisor.modes.map((mode, index) => <div key={mode.id} className="mode-card"><small>MODE {index + 1}</small><strong>{mode.displayName}</strong><code>{mode.id}</code><div>{mode.reasonerIds.map((id) => <span key={id}>{reasoners.get(id)?.displayName ?? id}</span>)}</div></div>)}</div><p className="editor-note">{L('Supervisor 只负责认知模式接管；Reasoner 负责思考，Arbitrator 负责最终选择，Executor 负责执行。', 'Supervisor owns cognitive mode switching only; Reasoners think, the Arbitrator selects, and the Executor performs actions.')}</p></div>;
}

function ReasonerEditor({ locale, reasoner, onUpdate }: { readonly locale: Locale; readonly reasoner: ReasonerDefinition | undefined; readonly onUpdate: (update: (reasoner: ReasonerDefinition) => ReasonerDefinition) => void }) {
  if (reasoner === undefined) return <EmptyDesign />; const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  return <div className="typed-editor"><div className="typed-editor-title"><span className="asset-type">REASONER</span><input value={reasoner.displayName} onChange={(event) => onUpdate((current) => ({ ...current, displayName: event.target.value }))} /><code>{reasoner.id}</code></div><label className="wide-field">{L('算法类型', 'Reasoner kind')}<select value={reasoner.kind} onChange={(event) => onUpdate((current) => ({ ...current, kind: event.target.value as ReasonerDefinition['kind'] }))}>{['utility','statechart','htn','behavior-tree','goap','custom'].map((kind) => <option key={kind}>{kind}</option>)}</select></label><section className="module-zone contract-zone"><strong>{L('专用编辑视图边界', 'Specialized editor boundary')}</strong><p>{L('当前 Utility 使用专用参数编辑。HTN / BT / GOAP 未来各自拥有专用编辑器，不强行转换成同一种通用节点。', 'Utility uses a dedicated parameter editor. HTN / BT / GOAP will receive their own views rather than being forced into one generic node model.')}</p></section></div>;
}

function EmptyDesign() { return <div className="empty-design"><span>◇</span><strong>Select an asset</strong></div>; }
function Num({ label, value, step, onChange }: { readonly label: string; readonly value: number; readonly step: number; readonly onChange: (value: number) => void }) { return <label>{label}<input type="number" value={value} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function firstSelection(config: VolitionProjectConfig): Selection | null { const squad = config.squads?.[0]; if (squad) return { kind: 'squad', id: squad.id }; const agent = config.agents[0]; return agent ? { kind: 'agent', id: agent.id } : null; }
function selectionExists(config: VolitionProjectConfig, selection: Selection): boolean { if (selection.kind === 'agent') return config.agents.some((entry) => entry.id === selection.id); if (selection.kind === 'behavior') return (config.behaviors ?? []).some((entry) => entry.id === selection.id); if (selection.kind === 'squad') return (config.squads ?? []).some((entry) => entry.id === selection.id); if (selection.kind === 'supervisor') return (config.supervisors ?? []).some((entry) => entry.id === selection.id); return (config.reasoners ?? []).some((entry) => entry.id === selection.id); }
function writeDrag(event: DragEvent, payload: DragPayload) { event.dataTransfer.effectAllowed = 'copyMove'; event.dataTransfer.setData('application/x-volition-asset', JSON.stringify(payload)); }
function readDrag(event: DragEvent): DragPayload | null { try { const text = event.dataTransfer.getData('application/x-volition-asset'); return text ? JSON.parse(text) as DragPayload : null; } catch { return null; } }
function unique<T>(values: readonly T[]): readonly T[] { return [...new Set(values)]; }
function splitList(value: string): readonly string[] { return value.split(',').map((entry) => entry.trim()).filter(Boolean); }
function nextId(prefix: string, existing: readonly string[]): string { let index = 1; let id = `${prefix}-${index}`; while (existing.includes(id)) { index += 1; id = `${prefix}-${index}`; } return id; }
