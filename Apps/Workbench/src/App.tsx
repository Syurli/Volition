import { useEffect, useMemo, useRef, useState } from 'react';
import type { DecisionTrace } from '@volition/core';
import type { VolitionProjectConfig } from '@volition/schema';
import { createTranslator, detectLocale, type Locale, type MessageKey } from './i18n';
import { duplicateAsLocal, loadLocalProjects, saveLocalProjects, tacticalWizardExampleProject, type WorkbenchProject } from './projects';
import { ProjectHub, OverviewPage, DesignPage } from './pages/ProjectPages';
import { ConnectionPage, DebugPage, SimulationPage, VisualizationPage } from './pages/RuntimePages';
import { TacticalWizardSimulation, type SimulationOverlaySettings, type TacticalWizardSimulationState } from './simulation/tacticalWizardSimulation';
import { EMPTY_LIVE_TELEMETRY, WorkbenchWebSocketConnection, reduceLiveTelemetry, type ConnectionState, type LiveTelemetryState, validateLiveEndpoint } from './connection';

type PageId = 'projects' | 'overview' | 'design' | 'simulation' | 'debug' | 'visualization' | 'connection';
const connection = new WorkbenchWebSocketConnection();

export function App() {
  const [locale, setLocale] = useState<Locale>(() => loadLocale());
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [page, setPage] = useState<PageId>('overview');
  const [localProjects, setLocalProjects] = useState<readonly WorkbenchProject[]>(() => loadLocalProjects());
  const [project, setProject] = useState<WorkbenchProject>(tacticalWizardExampleProject);
  const [config, setConfig] = useState<VolitionProjectConfig>(() => structuredClone(tacticalWizardExampleProject.config));
  const simulationRef = useRef(new TacticalWizardSimulation());
  const [simulation, setSimulation] = useState<TacticalWizardSimulationState>(() => simulationRef.current.getState());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [traceHistory, setTraceHistory] = useState<readonly DecisionTrace[]>([]);
  const [overlays, setOverlays] = useState<SimulationOverlaySettings>({ vision: true, hearing: false, path: true, memory: true, grid: true });
  const [endpoint, setEndpoint] = useState('wss://localhost:7443/volition');
  const [connectionState, setConnectionState] = useState<ConnectionState>('offline');
  const [connectionDetail, setConnectionDetail] = useState('Offline Simulation active.');
  const [liveMessages, setLiveMessages] = useState(0);
  const [liveTelemetry, setLiveTelemetry] = useState<LiveTelemetryState>(EMPTY_LIVE_TELEMETRY);

  const step = () => {
    const next = simulationRef.current.step();
    setSimulation(next);
    if (next.latestTrace) setTraceHistory((history) => appendTrace(history, next.latestTrace!));
  };
  const reset = () => { setPlaying(false); setTraceHistory([]); setSimulation(simulationRef.current.reset()); };

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(step, Math.max(60, 250 / speed));
    return () => window.clearInterval(timer);
  }, [playing, speed]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (page !== 'simulation' || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      const move = key === 'w' || event.key === 'ArrowUp' ? [0,-1] : key === 's' || event.key === 'ArrowDown' ? [0,1] : key === 'a' || event.key === 'ArrowLeft' ? [-1,0] : key === 'd' || event.key === 'ArrowRight' ? [1,0] : null;
      if (move) { event.preventDefault(); simulationRef.current.nudgePlayer(move[0]!, move[1]!); setSimulation(simulationRef.current.getState()); }
      if (event.code === 'Space') { event.preventDefault(); simulationRef.current.emitNoise(); setSimulation(simulationRef.current.getState()); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [page]);

  const selectProject = (next: WorkbenchProject) => { setProject(next); setConfig(structuredClone(next.config)); reset(); setPage('overview'); };
  const storeProject = (next: WorkbenchProject) => { const all = [...localProjects.filter((entry) => entry.id !== next.id), next]; setLocalProjects(all); saveLocalProjects(all); selectProject(next); };
  const saveCurrent = () => storeProject(project.kind === 'local' ? { ...project, config } : duplicateAsLocal({ ...project, config }));
  const changeLocale = (next: Locale) => { setLocale(next); window.localStorage.setItem('volition.workbench.locale', next); };
  const connect = () => {
    const preview = validateLiveEndpoint(endpoint, window.location.protocol);
    if (!preview.valid) { setConnectionState('error'); setConnectionDetail(preview.message); return; }
    connection.connect(endpoint, (message) => { setLiveMessages((count) => count + 1); setLiveTelemetry((current) => reduceLiveTelemetry(current, message)); }, (state, detail) => { setConnectionState(state); setConnectionDetail(detail); if (state === 'offline') setLiveTelemetry(EMPTY_LIVE_TELEMETRY); });
  };
  const disconnect = () => { connection.disconnect(); setConnectionState('offline'); setConnectionDetail('Disconnected. Offline Simulation remains available.'); setLiveTelemetry(EMPTY_LIVE_TELEMETRY); };

  return <div className="editor-shell"><aside className="sidebar"><div className="brand-block"><span className="brand-mark">V</span><div><strong>{t('product')}</strong><small>{t('workbench')}</small></div></div><button className="project-switcher" onClick={() => setPage('projects')}><span><small>{project.kind === 'built-in' ? t('builtInExample') : t('localProject')}</small><strong>{locale === 'zh-CN' && project.nameZh ? project.nameZh : project.name}</strong></span><span>⌄</span></button><nav className="nav-list"><Nav id="overview" current={page} setPage={setPage} icon="◫" label={t('overview')} /><Nav id="design" current={page} setPage={setPage} icon="◇" label={t('design')} /><Nav id="simulation" current={page} setPage={setPage} icon="▶" label={t('simulation')} /><Nav id="debug" current={page} setPage={setPage} icon="◎" label={t('debug')} /><Nav id="visualization" current={page} setPage={setPage} icon="⌁" label={t('visualization')} /><div className="nav-divider" /><Nav id="connection" current={page} setPage={setPage} icon="↔" label={t('connection')} /></nav><div className="sidebar-footer"><div className="locale-switch"><button className={locale === 'zh-CN' ? 'active' : ''} onClick={() => changeLocale('zh-CN')}>中文</button><button className={locale === 'en-US' ? 'active' : ''} onClick={() => changeLocale('en-US')}>EN</button></div><small>v{__VOLITION_VERSION__} · {__VOLITION_COMMIT__.slice(0,8)}</small></div></aside><main className="editor-main"><header className="editor-topbar"><div><span className="breadcrumb">{t('product')} / {t(pageLabel(page))}</span><h1>{page === 'projects' ? t('projectLibrary') : locale === 'zh-CN' && project.nameZh ? project.nameZh : project.name}</h1></div><div className="top-status"><span className="status-chip offline">Offline Simulation</span><span className={`status-chip ${connectionState}`}>{connectionState}</span></div></header>
    {page === 'projects' && <ProjectHub t={t} locale={locale} localProjects={localProjects} onSelect={selectProject} onCreate={storeProject} onImport={storeProject} />}
    {page === 'overview' && <OverviewPage t={t} locale={locale} project={project} simulation={simulation} onOpenSimulation={() => setPage('simulation')} />}
    {page === 'design' && <DesignPage t={t} config={config} setConfig={setConfig} project={project} onSave={saveCurrent} onReset={() => setConfig(structuredClone(project.config))} />}
    {page === 'simulation' && <SimulationPage t={t} simulation={simulation} overlays={overlays} setOverlays={setOverlays} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} onStep={step} onReset={reset} onNoise={() => { simulationRef.current.emitNoise(); setSimulation(simulationRef.current.getState()); }} onMove={(dx,dy) => { simulationRef.current.nudgePlayer(dx,dy); setSimulation(simulationRef.current.getState()); }} onSetPlayer={(point) => { simulationRef.current.setPlayerPosition(point); setSimulation(simulationRef.current.getState()); }} />}
    {page === 'debug' && <DebugPage t={t} simulation={simulation} traces={traceHistory} />}
    {page === 'visualization' && <VisualizationPage t={t} traces={traceHistory} />}
    {page === 'connection' && <ConnectionPage endpoint={endpoint} setEndpoint={setEndpoint} connectionState={connectionState} connectionDetail={connectionDetail} liveMessages={liveMessages} liveTelemetry={liveTelemetry} onConnect={connect} onDisconnect={disconnect} />}
  </main></div>;
}

function Nav({ id, current, setPage, icon, label }: { readonly id: PageId; readonly current: PageId; readonly setPage: (id: PageId) => void; readonly icon: string; readonly label: string }) { return <button className={current === id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(id)}><span>{icon}</span><span>{label}</span></button>; }
function pageLabel(page: PageId): MessageKey { return page === 'projects' ? 'projectHub' : page; }
function appendTrace(history: readonly DecisionTrace[], trace: DecisionTrace): readonly DecisionTrace[] { return [...history.filter((entry) => entry.logicalTick !== trace.logicalTick), trace].slice(-240); }
function loadLocale(): Locale { if (typeof window !== 'undefined') { const saved = window.localStorage.getItem('volition.workbench.locale'); if (saved === 'zh-CN' || saved === 'en-US') return saved; } return detectLocale(); }
