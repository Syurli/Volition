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
import { localizedAssetName } from '../assetLocalization';
import { serializeWorkbenchProject, type WorkbenchProject } from '../projects';

interface Props {
  readonly t: Translate; readonly locale: Locale; readonly config: VolitionProjectConfig; readonly setConfig: (config: VolitionProjectConfig) => void;
  readonly project: WorkbenchProject; readonly onSave: () => void; readonly onReset: () => void;
}
type AssetKind = 'squad' | 'agent' | 'behavior' | 'supervisor' | 'reasoner';
interface Selection { readonly kind: AssetKind; readonly id: string; }
type DragPayload = { readonly kind: 'agent' | 'behavior' | 'squad-member'; readonly id: string; readonly squadId?: string; readonly scope?: BehaviorDefinition['scope'] };

export function DesignPage({ t, locale, config, setConfig, project, onSave, onReset }: Props) {
  const [mode, setMode] = useState<'assets' | 'json'>('assets');
  const [selection, setSelection] = useState<Selection | null>(() => firstSelection(config));
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(config, null, 2));
  const [validationMessage, setValidationMessage] = useState('');
  const validation = useMemo(() => validateProjectConfig(config), [config]);
  const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const name = (id: string, fallback: string) => localizedAssetName(id, fallback, locale);
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
    const source = config.agents.find((agent) => agent.id === agentId);
    return { ...squad, members: [...squad.members, { id, agentId, displayName: source?.displayName ?? id }] };
  });
  const reorderMember = (squadId: string, draggedId: string, targetId: string) => updateSquad(squadId, (squad) => {
    const from = squad.members.findIndex((entry) => entry.id === draggedId); const to = squad.members.findIndex((entry) => entry.id === targetId); if (from < 0 || to < 0 || from === to) return squad;
    const members = [...squad.members]; const [moved] = members.splice(from, 1); if (moved !== undefined) members.splice(to, 0, moved); return { ...squad, members };
  });

  const addAgent = () => {
    const template = config.agents[0]; if (template === undefined) return; const id = nextId('agent:new', config.agents.map((entry) => entry.id));
    const agent = { ...structuredClone(template), id, displayName: L('新 AI 代理', 'New Agent'), extensions: { ...(template.extensions ?? {}), debugColorKey: `custom-${config.agents.length + 1}` } };
    setConfig({ ...config, agents: [...config.agents, agent] }); setSelection({ kind: 'agent', id });
  };
  const addBehavior = (scope: BehaviorDefinition['scope']) => {
    const id = nextId(scope === 'agent' ? 'behavior:new' : 'tactic:new', (config.behaviors ?? []).map((entry) => entry.id));
    const behavior: BehaviorDefinition = { id, displayName: L(scope === 'agent' ? '新单兵行为' : '新小队战术', scope === 'agent' ? 'New Agent Behavior' : 'New Squad Tactic'), scope, intentId: scope === 'agent' ? 'custom' : undefined, hostBehaviorRef: scope === 'agent' ? 'host.behavior.custom' : 'reference.squad.custom', requiredCapabilities: [] };
    setConfig({ ...config, behaviors: [...(config.behaviors ?? []), behavior] }); setSelection({ kind: 'behavior', id });
  };
  const addSquad = () => {
    const id = nextId('squad:new', (config.squads ?? []).map((entry) => entry.id)); const first = config.agents[0]; if (first === undefined) return;
    const squad: SquadDefinition = { id, displayName: L('新小队', 'New Squad'), members: [{ id: 'member-1', agentId: first.id, displayName: first.displayName }], behaviorIds: [] };
    setConfig({ ...config, squads: [...(config.squads ?? []), squad] }); setSelection({ kind: 'squad', id });
  };

  const startDrag = (event: DragEvent, payload: DragPayload) => { setDrag(payload); setDropTarget(null); writeDrag(event, payload); };
  const endDrag = () => { setDrag(null); setDropTarget(null); };
  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText) as VolitionProjectConfig; const result = validateProjectConfig(parsed);
      setValidationMessage(result.valid ? L('Schema 有效。', 'Schema valid.') : result.issues.map((issue) => `${issue.path}: ${issue.message}`).join(' · ')); if (result.valid) setConfig(parsed);
    } catch (error) { setValidationMessage(error instanceof Error ? error.message : String(error)); }
  };
  const exportProject = () => { const blob = new Blob([serializeWorkbenchProject({ ...project, config })], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'volition.project.json'; anchor.click(); URL.revokeObjectURL(url); };
  const selected = selection ?? firstSelection(config);
  const agentBehaviors = (config.behaviors ?? []).filter((entry) => entry.scope === 'agent');
  const squadBehaviors = (config.behaviors ?? []).filter((entry) => entry.scope === 'squad');

  return <section className="page-stack design-workspace-page">
    <div className="section-heading"><div><h2>{L('AI 设计工作区', 'AI Authoring Workspace')}</h2><p>{L('按职责拆分资产。拖动代理组建小队，拖动行为建立绑定；运行时算法仍保留各自专用结构。', 'Assets are grouped by responsibility. Drag agents into squads and behaviors into bindings while each runtime algorithm keeps its specialized structure.')}</p></div><div className="segmented"><button className={mode === 'assets' ? 'active' : ''} onClick={() => setMode('assets')}>{L('模块设计', 'Modules')}</button><button className={mode === 'json' ? 'active' : ''} onClick={() => setMode('json')}>{t('jsonEditor')}</button></div></div>
    <div className={`architecture-strip ${validation.valid ? 'valid' : 'invalid'}`}><span>{L('认知主管', 'Brain Supervisor')}</span><b>→</b><span>{L('专用推理器', 'Typed Reasoner')}</span><b>→</b><span>{L('意图 / 行为提案', 'Intent / Action Proposal')}</span><b>→</b><span>{L('仲裁', 'Arbitrator')}</span><b>→</b><span>{L('执行器 / Bridge', 'Executor / Bridge')}</span><em>{validation.valid ? L('Schema 有效', 'Schema valid') : `${validation.issues.filter((issue) => issue.severity === 'error').length} ${L('个错误', 'errors')}`}</em></div>
    {mode === 'assets' ? <div className={`authoring-layout ${drag ? 'drag-session' : ''}`}>
      <aside className="asset-browser"><div className="asset-browser-head"><strong>{L('项目模块', 'Project Modules')}</strong><small>{name(config.projectId, config.displayName)}</small></div>
        <BrowserGroup title={L('代理与编队', 'Agents & Squads')} description={L('谁在思考，以及如何组成协同单元。', 'Who thinks and how they are grouped.')}>
          <AssetSection title={L('小队代理', 'Squads')} items={(config.squads ?? []).map((entry) => ({ id: entry.id, label: name(entry.id, entry.displayName) }))} kind="squad" selection={selected} setSelection={setSelection} />
          <AssetSection title={L('AI 代理', 'AI Agents')} items={config.agents.map((entry) => ({ id: entry.id, label: name(entry.id, entry.displayName) }))} kind="agent" selection={selected} setSelection={setSelection} draggable="agent" drag={drag} onDragStart={startDrag} onDragEnd={endDrag} />
        </BrowserGroup>
        <BrowserGroup title={L('行为模块', 'Behavior Modules')} description={L('单兵行为与小队战术明确分开。', 'Agent behaviors and squad tactics are separated.') }>
          <AssetSection title={L('单兵行为', 'Agent Behaviors')} items={agentBehaviors.map((entry) => ({ id: entry.id, label: name(entry.id, entry.displayName), meta: 'AGENT' }))} kind="behavior" selection={selected} setSelection={setSelection} draggable="behavior" scope="agent" drag={drag} onDragStart={startDrag} onDragEnd={endDrag} />
          <AssetSection title={L('小队战术', 'Squad Tactics')} items={squadBehaviors.map((entry) => ({ id: entry.id, label: name(entry.id, entry.displayName), meta: 'SQUAD' }))} kind="behavior" selection={selected} setSelection={setSelection} draggable="behavior" scope="squad" drag={drag} onDragStart={startDrag} onDragEnd={endDrag} />
        </BrowserGroup>
        <BrowserGroup title={L('认知与决策', 'Cognition & Decision')} description={L('模式管理与具体推理算法分离。', 'Mode supervision is separated from reasoning algorithms.') }>
          <AssetSection title={L('认知主管', 'Brain Supervisors')} items={(config.supervisors ?? []).map((entry) => ({ id: entry.id, label: name(entry.id, entry.displayName) }))} kind="supervisor" selection={selected} setSelection={setSelection} />
          <AssetSection title={L('推理器', 'Reasoners')} items={(config.reasoners ?? []).map((entry) => ({ id: entry.id, label: name(entry.id, entry.displayName), meta: entry.kind }))} kind="reasoner" selection={selected} setSelection={setSelection} />
        </BrowserGroup>
        <div className="asset-add-grid"><button onClick={addSquad}>+ {L('小队', 'Squad')}</button><button onClick={addAgent}>+ {L('代理', 'Agent')}</button><button onClick={() => addBehavior('agent')}>+ {L('单兵行为', 'Behavior')}</button><button onClick={() => addBehavior('squad')}>+ {L('小队战术', 'Tactic')}</button></div>
      </aside>
      <main className="authoring-canvas">{selected === null ? <EmptyDesign locale={locale} /> : selected.kind === 'squad' ? <SquadEditor locale={locale} squad={(config.squads ?? []).find((entry) => entry.id === selected.id)} config={config} drag={drag} dropTarget={dropTarget} setDropTarget={setDropTarget} startDrag={startDrag} endDrag={endDrag} onUpdate={(update) => updateSquad(selected.id, update)} onAddAgent={(agentId) => addAgentToSquad(selected.id, agentId)} onAssignBehavior={(behaviorId) => assignBehaviorToSquad(selected.id, behaviorId)} onReorder={(dragged, target) => reorderMember(selected.id, dragged, target)} /> : selected.kind === 'agent' ? <AgentEditor locale={locale} agent={config.agents.find((entry) => entry.id === selected.id)} config={config} drag={drag} dropTarget={dropTarget} setDropTarget={setDropTarget} onUpdate={(update) => updateAgent(selected.id, update)} onAssignBehavior={(behaviorId) => assignBehaviorToAgent(selected.id, behaviorId)} /> : selected.kind === 'behavior' ? <BehaviorEditor locale={locale} behavior={(config.behaviors ?? []).find((entry) => entry.id === selected.id)} onUpdate={(update) => updateBehavior(selected.id, update)} /> : selected.kind === 'supervisor' ? <SupervisorEditor locale={locale} supervisor={(config.supervisors ?? []).find((entry) => entry.id === selected.id)} config={config} onUpdate={(update) => updateSupervisor(selected.id, update)} /> : <ReasonerEditor locale={locale} reasoner={(config.reasoners ?? []).find((entry) => entry.id === selected.id)} onUpdate={(update) => updateReasoner(selected.id, update)} />}</main>
    </div> : <section className="surface"><textarea className="code-editor" value={jsonText} onChange={(event) => setJsonText(event.target.value)} spellCheck={false} /><div className="action-row"><button className="primary-button" onClick={applyJson}>{L('验证并应用', 'Validate & Apply')}</button><span>{validationMessage}</span></div></section>}
    <div className="action-row"><button className="primary-button" onClick={onSave}>{project.kind === 'built-in' ? t('duplicateProject') : L('保存到本地', 'Save locally')}</button><button className="secondary-button" onClick={exportProject}>{t('exportProject')}</button><button className="secondary-button" onClick={onReset}>{t('resetExample')}</button></div>
  </section>;
}

function BrowserGroup({ title, description, children }: { readonly title: string; readonly description: string; readonly children: React.ReactNode }) { return <section className="browser-group"><header><strong>{title}</strong><small>{description}</small></header>{children}</section>; }

function AssetSection({ title, items, kind, selection, setSelection, draggable, scope, drag, onDragStart, onDragEnd }: { readonly title: string; readonly items: readonly { id: string; label: string; meta?: string }[]; readonly kind: AssetKind; readonly selection: Selection | null; readonly setSelection: (selection: Selection) => void; readonly draggable?: DragPayload['kind']; readonly scope?: BehaviorDefinition['scope']; readonly drag?: DragPayload | null; readonly onDragStart?: (event: DragEvent, payload: DragPayload) => void; readonly onDragEnd?: () => void }) {
  return <section className="asset-section"><h4>{title}<span>{items.length}</span></h4>{items.map((item) => {
    const dragging = drag?.id === item.id && drag.kind === draggable;
    return <button key={item.id} className={`${selection?.kind === kind && selection.id === item.id ? 'asset-row active' : 'asset-row'} ${dragging ? 'dragging' : ''}`} draggable={draggable !== undefined} onDragStart={(event) => draggable && onDragStart?.(event, { kind: draggable, id: item.id, scope })} onDragEnd={onDragEnd} onClick={() => setSelection({ kind, id: item.id })}><span className="drag-handle">{draggable ? '⋮⋮' : '•'}</span><span className="asset-row-copy"><strong>{item.label}</strong><small>{item.id}</small></span>{item.meta && <em>{item.meta}</em>}</button>;
  })}</section>;
}

function SquadEditor({ locale, squad, config, drag, dropTarget, setDropTarget, startDrag, endDrag, onUpdate, onAddAgent, onAssignBehavior, onReorder }: { readonly locale: Locale; readonly squad: SquadDefinition | undefined; readonly config: VolitionProjectConfig; readonly drag: DragPayload | null; readonly dropTarget: string | null; readonly setDropTarget: (value: string | null) => void; readonly startDrag: (event: DragEvent, payload: DragPayload) => void; readonly endDrag: () => void; readonly onUpdate: (update: (squad: SquadDefinition) => SquadDefinition) => void; readonly onAddAgent: (agentId: string) => void; readonly onAssignBehavior: (behaviorId: string) => void; readonly onReorder: (dragged: string, target: string) => void }) {
  if (squad === undefined) return <EmptyDesign locale={locale} />; const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en; const name = (id: string, fallback: string) => localizedAssetName(id, fallback, locale); const behaviorMap = new Map((config.behaviors ?? []).map((entry) => [entry.id, entry]));
  const canDropMember = drag?.kind === 'agent' || drag?.kind === 'squad-member'; const canDropBehavior = drag?.kind === 'behavior' && drag.scope === 'squad';
  const dropMember = (event: DragEvent, targetMemberId?: string) => { event.preventDefault(); const payload = readDrag(event); if (payload?.kind === 'agent') onAddAgent(payload.id); else if (payload?.kind === 'squad-member' && targetMemberId !== undefined && payload.squadId === squad.id) onReorder(payload.id, targetMemberId); setDropTarget(null); };
  const dropBehavior = (event: DragEvent) => { event.preventDefault(); const payload = readDrag(event); if (payload?.kind === 'behavior' && payload.scope === 'squad') onAssignBehavior(payload.id); setDropTarget(null); };
  return <div className="typed-editor"><EditorTitle type={L('小队代理', 'SQUAD')} title={name(squad.id, squad.displayName)} id={squad.id} canonical={squad.displayName} onCanonicalChange={(value) => onUpdate((current) => ({ ...current, displayName: value }))} locale={locale} />
    <section className="module-zone"><header><div><strong>{L('成员代理与队形顺序', 'Member proxies & formation order')}</strong><small>{L('拖入 AI 代理新增成员；抓住 ⋮⋮ 拖到另一成员上重新排序。', 'Drop AI Agents to add members; grab ⋮⋮ and drop onto another member to reorder.')}</small></div><span className="module-count">{squad.members.length}</span></header>
      <div className={`member-lane drop-zone ${canDropMember ? 'can-drop' : ''} ${dropTarget === 'squad-members' ? 'drop-active' : ''}`} onDragOver={(event) => { if (canDropMember) { event.preventDefault(); event.dataTransfer.dropEffect = drag?.kind === 'agent' ? 'copy' : 'move'; } }} onDragEnter={() => canDropMember && setDropTarget('squad-members')} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null); }} onDrop={(event) => dropMember(event)}>
        {squad.members.map((member, index) => { const agent = config.agents.find((entry) => entry.id === member.agentId); const memberTarget = `member:${member.id}`; return <div key={member.id} className={`module-card agent-module ${dropTarget === memberTarget ? 'reorder-target' : ''}`} draggable onDragStart={(event) => startDrag(event, { kind: 'squad-member', id: member.id, squadId: squad.id })} onDragEnd={endDrag} onDragOver={(event) => { if (drag?.kind === 'squad-member') { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; setDropTarget(memberTarget); } }} onDrop={(event) => { event.stopPropagation(); dropMember(event, member.id); }}><span className="card-grip">⋮⋮</span><small>{L('槽位', 'SLOT')} {index + 1}</small><strong>{name(member.agentId, member.displayName ?? agent?.displayName ?? member.agentId)}</strong><code>{member.agentId}</code><em>{member.preferredRole ?? 'flex'}</em></div>; })}
        <div className={`drop-placeholder ${canDropMember ? 'ready' : ''}`}><b>＋</b><span>{drag?.kind === 'agent' ? L('松开以加入小队', 'Release to add Agent') : drag?.kind === 'squad-member' ? L('拖到成员卡上调整顺序', 'Drop on a member card to reorder') : L('从左侧拖入 AI 代理', 'Drag AI Agent here')}</span></div>
      </div>
    </section>
    <section className="module-zone"><header><div><strong>{L('小队战术模块', 'Squad tactic modules')}</strong><small>{L('这里只接受作用域为 Squad 的行为模块。', 'Only Squad-scoped behavior modules are accepted here.')}</small></div><span className="module-count">{squad.behaviorIds.length}</span></header><div className={`binding-lane drop-zone ${canDropBehavior ? 'can-drop' : drag?.kind === 'behavior' ? 'cannot-drop' : ''} ${dropTarget === 'squad-behaviors' ? 'drop-active' : ''}`} onDragOver={(event) => { if (canDropBehavior) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }} onDragEnter={() => canDropBehavior && setDropTarget('squad-behaviors')} onDragLeave={() => setDropTarget(null)} onDrop={dropBehavior}>{squad.behaviorIds.map((id) => <div key={id} className="binding-chip"><span><strong>{name(id, behaviorMap.get(id)?.displayName ?? id)}</strong><code>{behaviorMap.get(id)?.hostBehaviorRef ?? id}</code></span><button onClick={() => onUpdate((current) => ({ ...current, behaviorIds: current.behaviorIds.filter((entry) => entry !== id) }))}>×</button></div>)}<div className={`drop-placeholder ${canDropBehavior ? 'ready' : ''}`}><b>＋</b><span>{canDropBehavior ? L('松开以绑定小队战术', 'Release to bind squad tactic') : L('拖入小队战术', 'Drop squad tactic')}</span></div></div></section>
  </div>;
}

function AgentEditor({ locale, agent, config, drag, dropTarget, setDropTarget, onUpdate, onAssignBehavior }: { readonly locale: Locale; readonly agent: AgentDefinition | undefined; readonly config: VolitionProjectConfig; readonly drag: DragPayload | null; readonly dropTarget: string | null; readonly setDropTarget: (value: string | null) => void; readonly onUpdate: (update: (agent: AgentDefinition) => AgentDefinition) => void; readonly onAssignBehavior: (behaviorId: string) => void }) {
  if (agent === undefined) return <EmptyDesign locale={locale} />; const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en; const name = (id: string, fallback: string) => localizedAssetName(id, fallback, locale); const behaviorMap = new Map((config.behaviors ?? []).map((entry) => [entry.id, entry])); const canDrop = drag?.kind === 'behavior' && drag.scope === 'agent';
  const setMemory = (key: keyof AgentDefinition['memory'], value: number) => onUpdate((current) => ({ ...current, memory: { ...current.memory, [key]: value } }));
  const setScore = (key: string, value: number) => onUpdate((current) => ({ ...current, decisionPolicy: { ...current.decisionPolicy, config: { ...(current.decisionPolicy.config ?? {}), [key]: value } } }));
  return <div className="typed-editor"><EditorTitle type={L('AI 代理', 'AI AGENT')} title={name(agent.id, agent.displayName)} id={agent.id} canonical={agent.displayName} onCanonicalChange={(value) => onUpdate((current) => ({ ...current, displayName: value }))} locale={locale} />
    <div className="editor-property-grid"><section className="property-panel"><h4>{L('认知 / 决策', 'Brain / Decision')}</h4><label>{L('认知主管', 'Supervisor')}<select value={agent.supervisorId ?? ''} onChange={(event) => onUpdate((current) => ({ ...current, supervisorId: event.target.value || undefined }))}><option value="">—</option>{(config.supervisors ?? []).map((entry) => <option key={entry.id} value={entry.id}>{name(entry.id, entry.displayName)}</option>)}</select></label><code>{agent.decisionPolicy.id}</code>{['engageScore','searchScore','investigateScore','patrolScore'].map((key) => <Num key={key} label={key} value={Number(agent.decisionPolicy.config?.[key] ?? 0)} step={1} onChange={(value) => setScore(key, value)} />)}</section>
      <section className="property-panel"><h4>{L('记忆与能力', 'Memory & Capabilities')}</h4><Num label={L('每秒衰减', 'Decay / second')} value={agent.memory.decayPerSecond} step={0.01} onChange={(value) => setMemory('decayPerSecond', value)} /><Num label={L('遗忘阈值', 'Forget below')} value={agent.memory.forgetBelowConfidence} step={0.01} onChange={(value) => setMemory('forgetBelowConfidence', value)} /><div className="tag-row">{agent.capabilities.map((value) => <span key={value}>{value}</span>)}</div></section>
    </div>
    <section className="module-zone"><header><div><strong>{L('单兵行为绑定', 'Agent behavior bindings')}</strong><small>{L('只接受 Agent 作用域行为。Intent 仍通过 Host-neutral Behavior Ref 执行。', 'Only Agent-scoped behaviors are accepted. Intent still executes through host-neutral Behavior Refs.')}</small></div><span className="module-count">{agent.behaviorIds?.length ?? 0}</span></header><div className={`binding-lane drop-zone ${canDrop ? 'can-drop' : drag?.kind === 'behavior' ? 'cannot-drop' : ''} ${dropTarget === 'agent-behaviors' ? 'drop-active' : ''}`} onDragOver={(event) => { if (canDrop) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }} onDragEnter={() => canDrop && setDropTarget('agent-behaviors')} onDragLeave={() => setDropTarget(null)} onDrop={(event) => { event.preventDefault(); const payload = readDrag(event); if (payload?.kind === 'behavior' && payload.scope === 'agent') onAssignBehavior(payload.id); setDropTarget(null); }}>{(agent.behaviorIds ?? []).map((id) => <div key={id} className="binding-chip"><span><strong>{name(id, behaviorMap.get(id)?.displayName ?? id)}</strong><code>{behaviorMap.get(id)?.hostBehaviorRef ?? id}</code></span><button onClick={() => onUpdate((current) => ({ ...current, behaviorIds: (current.behaviorIds ?? []).filter((entry) => entry !== id) }))}>×</button></div>)}<div className={`drop-placeholder ${canDrop ? 'ready' : ''}`}><b>＋</b><span>{canDrop ? L('松开以绑定单兵行为', 'Release to bind behavior') : L('拖入单兵行为', 'Drop agent behavior')}</span></div></div></section>
  </div>;
}

function BehaviorEditor({ locale, behavior, onUpdate }: { readonly locale: Locale; readonly behavior: BehaviorDefinition | undefined; readonly onUpdate: (update: (behavior: BehaviorDefinition) => BehaviorDefinition) => void }) {
  if (behavior === undefined) return <EmptyDesign locale={locale} />; const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en; const title = localizedAssetName(behavior.id, behavior.displayName, locale);
  return <div className="typed-editor"><EditorTitle type={behavior.scope === 'squad' ? L('小队战术', 'SQUAD TACTIC') : L('单兵行为', 'AGENT BEHAVIOR')} title={title} id={behavior.id} canonical={behavior.displayName} onCanonicalChange={(value) => onUpdate((current) => ({ ...current, displayName: value }))} locale={locale} /><div className="editor-property-grid"><section className="property-panel"><label>{L('作用域', 'Scope')}<select value={behavior.scope} onChange={(event) => onUpdate((current) => ({ ...current, scope: event.target.value as BehaviorDefinition['scope'] }))}><option value="agent">Agent</option><option value="squad">Squad</option></select></label><label>Intent ID<input value={behavior.intentId ?? ''} onChange={(event) => onUpdate((current) => ({ ...current, intentId: event.target.value || undefined }))} /></label><label>Host Behavior Ref<input value={behavior.hostBehaviorRef} onChange={(event) => onUpdate((current) => ({ ...current, hostBehaviorRef: event.target.value }))} /></label></section><section className="property-panel"><label>{L('所需能力（逗号分隔）', 'Required capabilities')}<input value={behavior.requiredCapabilities.join(', ')} onChange={(event) => onUpdate((current) => ({ ...current, requiredCapabilities: splitList(event.target.value) }))} /></label><label>{L('说明', 'Description')}<textarea value={behavior.description ?? ''} onChange={(event) => onUpdate((current) => ({ ...current, description: event.target.value }))} /></label></section></div><section className="module-zone contract-zone"><strong>{L('行为契约边界', 'Action Contract Boundary')}</strong><p>{L('这里只定义可移植行为契约和 Host alias；真正的移动、动画、射击与技能实现仍位于 Bridge / 游戏 Host。', 'This defines portable behavior contracts and Host aliases only. Concrete movement, animation, firing and abilities remain in the Bridge / game Host.')}</p></section></div>;
}

function SupervisorEditor({ locale, supervisor, config, onUpdate }: { readonly locale: Locale; readonly supervisor: BrainSupervisorDefinition | undefined; readonly config: VolitionProjectConfig; readonly onUpdate: (update: (supervisor: BrainSupervisorDefinition) => BrainSupervisorDefinition) => void }) {
  if (supervisor === undefined) return <EmptyDesign locale={locale} />; const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en; const name = (id: string, fallback: string) => localizedAssetName(id, fallback, locale); const reasoners = new Map((config.reasoners ?? []).map((entry) => [entry.id, entry]));
  return <div className="typed-editor"><EditorTitle type={L('认知主管', 'BRAIN SUPERVISOR')} title={name(supervisor.id, supervisor.displayName)} id={supervisor.id} canonical={supervisor.displayName} onCanonicalChange={(value) => onUpdate((current) => ({ ...current, displayName: value }))} locale={locale} /><label className="wide-field">{L('初始模式', 'Initial mode')}<select value={supervisor.initialMode} onChange={(event) => onUpdate((current) => ({ ...current, initialMode: event.target.value }))}>{supervisor.modes.map((mode) => <option key={mode.id} value={mode.id}>{name(mode.id, mode.displayName)}</option>)}</select></label><div className="supervisor-flow">{supervisor.modes.map((mode, index) => <div key={mode.id} className="mode-card"><small>{L('模式', 'MODE')} {index + 1}</small><strong>{name(mode.id, mode.displayName)}</strong><code>{mode.id}</code><div>{mode.reasonerIds.map((id) => <span key={id}>{name(id, reasoners.get(id)?.displayName ?? id)}</span>)}</div></div>)}</div><p className="editor-note">{L('认知主管只负责模式接管；Reasoner 负责思考，Arbitrator 负责最终选择，Executor 负责执行。', 'Supervisor owns mode switching only; Reasoners think, the Arbitrator selects, and the Executor performs actions.')}</p></div>;
}

function ReasonerEditor({ locale, reasoner, onUpdate }: { readonly locale: Locale; readonly reasoner: ReasonerDefinition | undefined; readonly onUpdate: (update: (reasoner: ReasonerDefinition) => ReasonerDefinition) => void }) {
  if (reasoner === undefined) return <EmptyDesign locale={locale} />; const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en; const title = localizedAssetName(reasoner.id, reasoner.displayName, locale);
  return <div className="typed-editor"><EditorTitle type={L('推理器', 'REASONER')} title={title} id={reasoner.id} canonical={reasoner.displayName} onCanonicalChange={(value) => onUpdate((current) => ({ ...current, displayName: value }))} locale={locale} /><label className="wide-field">{L('算法类型', 'Reasoner kind')}<select value={reasoner.kind} onChange={(event) => onUpdate((current) => ({ ...current, kind: event.target.value as ReasonerDefinition['kind'] }))}>{['utility','statechart','htn','behavior-tree','goap','custom'].map((kind) => <option key={kind}>{kind}</option>)}</select></label><section className="module-zone contract-zone"><strong>{L('专用编辑视图', 'Specialized editor')}</strong><p>{L('Utility、HTN、行为树和 GOAP 将保留各自专用编辑器，不强行转换成一种万能节点。', 'Utility, HTN, Behavior Tree and GOAP keep specialized editors rather than being flattened into one universal graph.')}</p></section></div>;
}

function EditorTitle({ type, title, id, canonical, onCanonicalChange, locale }: { readonly type: string; readonly title: string; readonly id: string; readonly canonical: string; readonly onCanonicalChange: (value: string) => void; readonly locale: Locale }) { return <div className="typed-editor-title"><div><span className="asset-type">{type}</span><h2>{title}</h2><code>{id}</code></div><label>{locale === 'zh-CN' ? '内部 / 英文显示名' : 'Display name'}<input value={canonical} onChange={(event) => onCanonicalChange(event.target.value)} /></label></div>; }
function EmptyDesign({ locale }: { readonly locale: Locale }) { return <div className="empty-design"><span>◇</span><strong>{locale === 'zh-CN' ? '从左侧选择一个模块' : 'Select a module from the browser'}</strong></div>; }
function Num({ label, value, step, onChange }: { readonly label: string; readonly value: number; readonly step: number; readonly onChange: (value: number) => void }) { return <label>{label}<input type="number" value={value} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function firstSelection(config: VolitionProjectConfig): Selection | null { const squad = config.squads?.[0]; if (squad) return { kind: 'squad', id: squad.id }; const agent = config.agents[0]; return agent ? { kind: 'agent', id: agent.id } : null; }
function selectionExists(config: VolitionProjectConfig, selection: Selection): boolean { if (selection.kind === 'agent') return config.agents.some((entry) => entry.id === selection.id); if (selection.kind === 'behavior') return (config.behaviors ?? []).some((entry) => entry.id === selection.id); if (selection.kind === 'squad') return (config.squads ?? []).some((entry) => entry.id === selection.id); if (selection.kind === 'supervisor') return (config.supervisors ?? []).some((entry) => entry.id === selection.id); return (config.reasoners ?? []).some((entry) => entry.id === selection.id); }
function writeDrag(event: DragEvent, payload: DragPayload) { const text = JSON.stringify(payload); event.dataTransfer.effectAllowed = payload.kind === 'squad-member' ? 'move' : 'copyMove'; event.dataTransfer.setData('application/x-volition-asset', text); event.dataTransfer.setData('text/plain', text); }
function readDrag(event: DragEvent): DragPayload | null { try { const text = event.dataTransfer.getData('application/x-volition-asset') || event.dataTransfer.getData('text/plain'); return text ? JSON.parse(text) as DragPayload : null; } catch { return null; } }
function unique<T>(values: readonly T[]): T[] { return [...new Set(values)]; }
function splitList(value: string): string[] { return value.split(',').map((entry) => entry.trim()).filter(Boolean); }
function nextId(prefix: string, existing: readonly string[]): string { let index = 1; let id = `${prefix}-${index}`; while (existing.includes(id)) { index += 1; id = `${prefix}-${index}`; } return id; }
