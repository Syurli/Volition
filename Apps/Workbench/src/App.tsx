import { useEffect, useMemo, useRef, useState } from 'react';
import type { DecisionTrace } from '@volition/core';
import type { VolitionProjectConfig } from '@volition/schema';
import { createTranslator, detectLocale, type Locale, type MessageKey } from './i18n';
import { duplicateAsLocal, loadLocalProjects, saveLocalProjects, tacticalWizardExampleProject, type WorkbenchProject } from './projects';
import { ProjectHub, OverviewPage } from './pages/ProjectPages';
import { DesignPage } from './pages/DesignPageV2';
import { ConnectionPage, DebugPage, SimulationPage, VisualizationPage } from './pages/RuntimePagesV3';
import { RunLogPage } from './pages/RunLogPage';
import type { GridPoint } from './simulation/navigation';
import { TacticalWizardSimulation, type SimulationOverlaySettings, type TacticalWizardSimulationState } from './simulation/tacticalWizardSimulationV4';
import {
  DEFAULT_TACTICAL_WIZARD_TEST_LOADOUT,
  applyTacticalWizardTestLoadout,
  normalizeTacticalWizardTestLoadout,
  type TacticalWizardTestLoadout,
} from './simulation/tacticalWizardTestLoadout';
import { EMPTY_LIVE_TELEMETRY, WorkbenchWebSocketConnection, reduceLiveTelemetry, type ConnectionState, type LiveTelemetryState, validateLiveEndpoint } from './connection';

type PageId = 'projects' | 'overview' | 'design' | 'simulation' | 'debug' | 'log' | 'visualization' | 'connection';
const connection = new WorkbenchWebSocketConnection();
const PLAYBACK_HZ = 30;
const PLAYBACK_FRAME_SECONDS = 1 / PLAYBACK_HZ;
const TEST_LOADOUT_STORAGE_KEY = 'volition.workbench.tacticalWizardTestLoadout';
const initialTestLoadout = loadTestLoadout();

export function App() {
  const [locale, setLocale] = useState<Locale>(() => loadLocale());
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [page, setPage] = useState<PageId>('overview');
  const [localProjects, setLocalProjects] = useState<readonly WorkbenchProject[]>(() => loadLocalProjects());
  const [project, setProject] = useState<WorkbenchProject>(tacticalWizardExampleProject);
  const [config, setConfig] = useState<VolitionProjectConfig>(() => structuredClone(tacticalWizardExampleProject.config));
  const [testLoadout, setTestLoadout] = useState<TacticalWizardTestLoadout>(() => initialTestLoadout);
  const simulationRef = useRef(createConfiguredSimulation(initialTestLoadout));
  const [simulation, setSimulation] = useState<TacticalWizardSimulationState>(() => simulationRef.current.getState());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [traceHistory, setTraceHistory] = useState<readonly DecisionTrace[]>([]);
  const [overlays, setOverlays] = useState<SimulationOverlaySettings>({ vision: true, hearing: false, path: false, memory: true, grid: false, cover: true });
  const [endpoint, setEndpoint] = useState('wss://localhost:7443/volition');
  const [connectionState, setConnectionState] = useState<ConnectionState>('offline');
  const [connectionDetail, setConnectionDetail] = useState('Offline Simulation active.');
  const [liveMessages, setLiveMessages] = useState(0);
  const [liveTelemetry, setLiveTelemetry] = useState<LiveTelemetryState>(EMPTY_LIVE_TELEMETRY);
  const heldDirections = useRef<string[]>([]);

  const collectTraces = (next: TacticalWizardSimulationState) => { for (const trace of next.latestTraces) setTraceHistory((history) => appendTrace(history, trace)); };
  const step = () => { const next = simulationRef.current.step(); setSimulation(next); collectTraces(next); };
  const reset = () => {
    setPlaying(false);
    setTraceHistory([]);
    simulationRef.current.reset();
    applyTacticalWizardTestLoadout(simulationRef.current, testLoadout);
    setSimulation(simulationRef.current.getState());
  };
  const applyTestLoadout = (next: TacticalWizardTestLoadout) => {
    const normalized = normalizeTacticalWizardTestLoadout(next);
    setPlaying(false);
    setTraceHistory([]);
    setTestLoadout(normalized);
    saveTestLoadout(normalized);
    simulationRef.current.reset();
    applyTacticalWizardTestLoadout(simulationRef.current, normalized);
    setSimulation(simulationRef.current.getState());
  };

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const beforeTick = simulationRef.current.getState().logicalTick;
      const next = simulationRef.current.advance(PLAYBACK_FRAME_SECONDS * speed);
      setSimulation(next);
      if (next.logicalTick !== beforeTick) collectTraces(next);
    }, 1000 / PLAYBACK_HZ);
    return () => window.clearInterval(timer);
  }, [playing, speed]);

  useEffect(() => {
    const syncSimulation = () => setSimulation(simulationRef.current.getState());
    const keyDown = (event: KeyboardEvent) => {
      if (page !== 'simulation' || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const direction = normalizeDirectionKey(event.key);
      if (direction !== null) { event.preventDefault(); heldDirections.current = [...heldDirections.current.filter((key) => key !== direction), direction]; }
      if (event.code === 'Space' && !event.repeat) { event.preventDefault(); simulationRef.current.emitNoise(); syncSimulation(); }
    };
    const keyUp = (event: KeyboardEvent) => { const direction = normalizeDirectionKey(event.key); if (direction !== null) heldDirections.current = heldDirections.current.filter((key) => key !== direction); };
    const blur = () => { heldDirections.current = []; };
    const aim = (event: Event) => {
      if (page !== 'simulation') return;
      const point = (event as CustomEvent<GridPoint>).detail;
      if (point && simulationRef.current.setPlayerAimTarget(point)) syncSimulation();
    };
    const fire = (event: Event) => {
      if (page !== 'simulation') return;
      const point = (event as CustomEvent<GridPoint>).detail;
      if (point && simulationRef.current.playerFireAt(point)) syncSimulation();
    };
    const throwGrenade = (event: Event) => {
      if (page !== 'simulation') return;
      const point = (event as CustomEvent<GridPoint>).detail;
      if (point && simulationRef.current.playerThrowGrenadeAt(point)) syncSimulation();
    };
    const cycleGrenade = (event: Event) => {
      if (page !== 'simulation') return;
      const delta = (event as CustomEvent<number>).detail;
      if (typeof delta === 'number' && delta !== 0) { simulationRef.current.cyclePlayerGrenade(delta); syncSimulation(); }
    };
    const movementTimer = window.setInterval(() => {
      if (page !== 'simulation') return;
      const direction = heldDirections.current.at(-1); if (direction === undefined) return;
      const [dx, dy] = directionDelta(direction); if (simulationRef.current.nudgePlayer(dx, dy)) syncSimulation();
    }, 1000 / PLAYBACK_HZ);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    window.addEventListener('volition-sim-aim', aim as EventListener);
    window.addEventListener('volition-sim-fire', fire as EventListener);
    window.addEventListener('volition-sim-grenade', throwGrenade as EventListener);
    window.addEventListener('volition-sim-cycle-grenade', cycleGrenade as EventListener);
    return () => {
      window.clearInterval(movementTimer);
      heldDirections.current = [];
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      window.removeEventListener('volition-sim-aim', aim as EventListener);
      window.removeEventListener('volition-sim-fire', fire as EventListener);
      window.removeEventListener('volition-sim-grenade', throwGrenade as EventListener);
      window.removeEventListener('volition-sim-cycle-grenade', cycleGrenade as EventListener);
    };
  }, [page]);

  const selectProject = (next: WorkbenchProject) => { setProject(next); setConfig(structuredClone(next.config)); reset(); setPage('overview'); };
  const storeProject = (next: WorkbenchProject) => { const all = [...localProjects.filter((entry) => entry.id !== next.id), next]; setLocalProjects(all); saveLocalProjects(all); selectProject(next); };
  const saveCurrent = () => storeProject(project.kind === 'local' ? { ...project, config } : duplicateAsLocal({ ...project, config }));
  const changeLocale = (next: Locale) => { setLocale(next); window.localStorage.setItem('volition.workbench.locale', next); };
  const connect = () => {
    const preview = validateLiveEndpoint(endpoint, window.location.protocol); if (!preview.valid) { setConnectionState('error'); setConnectionDetail(preview.message); return; }
    connection.connect(endpoint, (message) => { setLiveMessages((count) => count + 1); setLiveTelemetry((current) => reduceLiveTelemetry(current, message)); }, (state, detail) => { setConnectionState(state); setConnectionDetail(detail); if (state === 'offline') setLiveTelemetry(EMPTY_LIVE_TELEMETRY); });
  };
  const disconnect = () => { connection.disconnect(); setConnectionState('offline'); setConnectionDetail('Disconnected. Offline Simulation remains available.'); setLiveTelemetry(EMPTY_LIVE_TELEMETRY); };

  return <div className="editor-shell"><aside className="sidebar"><div className="brand-block"><span className="brand-mark">V</span><div><strong>{t('product')}</strong><small>{t('workbench')}</small></div></div><button className="project-switcher" onClick={() => setPage('projects')}><span><small>{project.kind === 'built-in' ? t('builtInExample') : t('localProject')}</small><strong>{locale === 'zh-CN' && project.nameZh ? project.nameZh : project.name}</strong></span><span>⌄</span></button><nav className="nav-list"><Nav id="overview" current={page} setPage={setPage} icon="◫" label={t('overview')} /><Nav id="design" current={page} setPage={setPage} icon="◇" label={t('design')} /><Nav id="simulation" current={page} setPage={setPage} icon="▶" label={t('simulation')} /><Nav id="debug" current={page} setPage={setPage} icon="◎" label={t('debug')} /><Nav id="log" current={page} setPage={setPage} icon="≡" label={t('log')} /><Nav id="visualization" current={page} setPage={setPage} icon="⌁" label={t('visualization')} /><div className="nav-divider" /><Nav id="connection" current={page} setPage={setPage} icon="↔" label={t('connection')} /></nav><div className="sidebar-footer"><div className="locale-switch"><button className={locale === 'zh-CN' ? 'active' : ''} onClick={() => changeLocale('zh-CN')}>中文</button><button className={locale === 'en-US' ? 'active' : ''} onClick={() => changeLocale('en-US')}>EN</button></div><small>v{__VOLITION_VERSION__} · {__VOLITION_COMMIT__.slice(0,8)}</small></div></aside><main className="editor-main"><header className="editor-topbar"><div><span className="breadcrumb">{t('product')} / {t(pageLabel(page))}</span><h1>{page === 'projects' ? t('projectLibrary') : locale === 'zh-CN' && project.nameZh ? project.nameZh : project.name}</h1></div><div className="top-status"><span className="status-chip offline">Offline Simulation</span><span className={`status-chip ${connectionState}`}>{connectionState}</span></div></header>
    {page === 'projects' && <ProjectHub t={t} locale={locale} localProjects={localProjects} onSelect={selectProject} onCreate={storeProject} onImport={storeProject} />}
    {page === 'overview' && <OverviewPage t={t} locale={locale} project={project} simulation={simulation} onOpenSimulation={() => setPage('simulation')} />}
    {page === 'design' && <DesignPage t={t} locale={locale} config={config} setConfig={setConfig} project={project} onSave={saveCurrent} onReset={() => setConfig(structuredClone(project.config))} />}
    {page === 'simulation' && <SimulationPage t={t} locale={locale} simulation={simulation} overlays={overlays} setOverlays={setOverlays} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} onStep={step} onReset={reset} onNoise={() => { simulationRef.current.emitNoise(); setSimulation(simulationRef.current.getState()); }} onMove={(dx,dy) => { simulationRef.current.nudgePlayer(dx,dy); setSimulation(simulationRef.current.getState()); }} onSetPlayer={(point) => { simulationRef.current.setPlayerPosition(point); setSimulation(simulationRef.current.getState()); }} testLoadout={testLoadout} onApplyTestLoadout={applyTestLoadout} />}
    {page === 'debug' && <DebugPage t={t} locale={locale} simulation={simulation} traces={traceHistory} />}
    {page === 'log' && <RunLogPage locale={locale} simulation={simulation} />}
    {page === 'visualization' && <VisualizationPage t={t} traces={traceHistory} />}
    {page === 'connection' && <ConnectionPage endpoint={endpoint} setEndpoint={setEndpoint} connectionState={connectionState} connectionDetail={connectionDetail} liveMessages={liveMessages} liveTelemetry={liveTelemetry} onConnect={connect} onDisconnect={disconnect} />}
  </main></div>;
}
function Nav({ id, current, setPage, icon, label }: { readonly id: PageId; readonly current: PageId; readonly setPage: (id: PageId) => void; readonly icon: string; readonly label: string }) { return <button className={current === id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(id)}><span>{icon}</span><span>{label}</span></button>; }
function pageLabel(page: PageId): MessageKey { return page === 'projects' ? 'projectHub' : page; }
function appendTrace(history: readonly DecisionTrace[], trace: DecisionTrace): readonly DecisionTrace[] { return [...history.filter((entry) => entry.agentId !== trace.agentId || entry.logicalTick !== trace.logicalTick), trace].slice(-360); }
function loadLocale(): Locale { if (typeof window !== 'undefined') { const saved = window.localStorage.getItem('volition.workbench.locale'); if (saved === 'zh-CN' || saved === 'en-US') return saved; } return detectLocale(); }
function normalizeDirectionKey(key: string): string | null { const normalized = key.toLowerCase(); if (normalized === 'w' || key === 'ArrowUp') return 'up'; if (normalized === 's' || key === 'ArrowDown') return 'down'; if (normalized === 'a' || key === 'ArrowLeft') return 'left'; if (normalized === 'd' || key === 'ArrowRight') return 'right'; return null; }
function directionDelta(direction: string): readonly [number, number] { switch (direction) { case 'up': return [0,-1]; case 'down': return [0,1]; case 'left': return [-1,0]; case 'right': return [1,0]; default: return [0,0]; } }
function createConfiguredSimulation(loadout: TacticalWizardTestLoadout): TacticalWizardSimulation { const simulation = new TacticalWizardSimulation(); applyTacticalWizardTestLoadout(simulation, loadout); return simulation; }
function loadTestLoadout(): TacticalWizardTestLoadout { if (typeof window === 'undefined') return DEFAULT_TACTICAL_WIZARD_TEST_LOADOUT; try { const raw = window.localStorage.getItem(TEST_LOADOUT_STORAGE_KEY); return raw === null ? DEFAULT_TACTICAL_WIZARD_TEST_LOADOUT : normalizeTacticalWizardTestLoadout(JSON.parse(raw) as Partial<TacticalWizardTestLoadout>); } catch { return DEFAULT_TACTICAL_WIZARD_TEST_LOADOUT; } }
function saveTestLoadout(loadout: TacticalWizardTestLoadout): void { if (typeof window !== 'undefined') window.localStorage.setItem(TEST_LOADOUT_STORAGE_KEY, JSON.stringify(loadout)); }
