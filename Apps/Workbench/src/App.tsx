import { useMemo, useState, type ChangeEvent } from 'react';
import type { DecisionTrace } from '@volition/core';
import { validateProjectConfig } from '@volition/schema';
import { runTacticalWizardFixture } from '@volition/example-tactical-wizard';
import {
  EMPTY_LIVE_TELEMETRY,
  WorkbenchWebSocketConnection,
  reduceLiveTelemetry,
  type ConnectionState,
  type LiveTelemetryState,
  validateLiveEndpoint,
} from './connection';

const demo = runTacticalWizardFixture();
const connection = new WorkbenchWebSocketConnection();

export function App() {
  const [selectedTick, setSelectedTick] = useState(demo.traces[0]?.logicalTick ?? 0);
  const [configText, setConfigText] = useState(JSON.stringify(demo.config, null, 2));
  const [configSource, setConfigSource] = useState('Bundled Tactical Wizard fixture');
  const [validation, setValidation] = useState(() => validateProjectConfig(demo.config));
  const [endpoint, setEndpoint] = useState('wss://localhost:7443/volition');
  const [connectionState, setConnectionState] = useState<ConnectionState>('offline');
  const [connectionDetail, setConnectionDetail] = useState('Offline Demo active. No runtime connection is required.');
  const [liveMessages, setLiveMessages] = useState(0);
  const [liveTelemetry, setLiveTelemetry] = useState<LiveTelemetryState>(EMPTY_LIVE_TELEMETRY);

  const demoTrace = useMemo(
    () => demo.traces.find((entry) => entry.logicalTick === selectedTick) ?? demo.traces[0]!,
    [selectedTick],
  );
  const demoSnapshot = demo.snapshots.find((entry) => entry.logicalTick === demoTrace.logicalTick) ?? demo.snapshots[0]!;
  const usingLive = connectionState === 'connected'
    && liveTelemetry.snapshot !== null
    && liveTelemetry.latestTrace !== null;
  const trace = usingLive ? liveTelemetry.latestTrace! : demoTrace;
  const snapshot = usingLive ? liveTelemetry.snapshot! : demoSnapshot;
  const agentIds = usingLive && liveTelemetry.agentIds.length > 0
    ? liveTelemetry.agentIds
    : [snapshot.agentId];

  const validateText = (text = configText) => {
    try {
      setValidation(validateProjectConfig(JSON.parse(text)));
    } catch (error) {
      setValidation({ valid: false, issues: [{ severity: 'error', path: '$', message: error instanceof Error ? error.message : String(error) }] });
    }
  };

  const openConfigFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    const text = await file.text();
    setConfigText(text);
    setConfigSource(file.name);
    validateText(text);
    event.target.value = '';
  };

  const exportConfig = () => {
    const blob = new Blob([configText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'volition-project.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const connect = () => {
    const preview = validateLiveEndpoint(endpoint, window.location.protocol);
    if (!preview.valid) {
      setConnectionState('error');
      setConnectionDetail(preview.message);
      return;
    }
    connection.connect(
      endpoint,
      (message) => {
        setLiveMessages((count) => count + 1);
        setLiveTelemetry((current) => reduceLiveTelemetry(current, message));
      },
      (state, detail) => {
        setConnectionState(state);
        setConnectionDetail(detail);
        if (state === 'offline') setLiveTelemetry(EMPTY_LIVE_TELEMETRY);
      },
    );
  };

  const disconnect = () => {
    connection.disconnect();
    setConnectionState('offline');
    setConnectionDetail('Disconnected manually. Offline Demo remains available.');
    setLiveTelemetry(EMPTY_LIVE_TELEMETRY);
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">A BAIGE PROJECT · REFERENCE SLICE 01</div>
          <h1>Volition Workbench</h1>
          <p className="subtitle">Tactical Wizard Reference Application #1 · Runtime Inspector & Decision Trace</p>
        </div>
        <div className="build-card">
          <span>v{__VOLITION_VERSION__}</span>
          <code>{__VOLITION_COMMIT__.slice(0, 12)}</code>
          <span className={`status ${connectionState}`}>{connectionState}</span>
        </div>
      </header>

      <section className="hero-grid">
        <article className="panel project-panel">
          <div className="panel-title"><span>Project / Demo</span><span className="pill">offline-ready</span></div>
          <h2>{demo.config.displayName}</h2>
          <p>This bundled deterministic fixture is the product demo and regression oracle. It does not require Tactical Wizard to be running.</p>
          <div className="sequence">
            {demo.selectedIntents.map((intent, index) => (
              <button key={`${intent}-${index}`} className={demo.traces[index]?.logicalTick === selectedTick ? 'active' : ''} onClick={() => setSelectedTick(demo.traces[index]?.logicalTick ?? 0)}>
                <span>T{demo.traces[index]?.logicalTick}</span>{intent}
              </button>
            ))}
          </div>
        </article>

        <article className="panel connection-panel">
          <div className="panel-title"><span>Connection Manager</span><span className="pill">transport-neutral protocol</span></div>
          <label>Live endpoint</label>
          <div className="connection-row">
            <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} spellCheck={false} />
            <button onClick={connect}>Connect</button>
            <button className="secondary" onClick={disconnect}>Disconnect</button>
          </div>
          <p className={`diagnostic ${connectionState}`}>{connectionDetail}</p>
          <small>HTTPS Pages rejects insecure ws:// mixed content. Local development may use ws://. Live messages received: {liveMessages}.</small>
        </article>
      </section>

      <section className="workspace">
        <aside className="panel agent-list">
          <div className="panel-title"><span>Agent List</span><span className="pill">{usingLive ? 'live' : 'fixture'}</span></div>
          {agentIds.map((agentId) => (
            <button key={agentId} className={`agent ${agentId === snapshot.agentId ? 'active' : ''}`}>
              <span className="dot" />
              <span><strong>{agentId}</strong><small>{usingLive ? 'live runtime' : 'generic rifle enemy'}</small></span>
            </button>
          ))}
          <div className="metric"><span>Logical tick</span><strong>{trace.logicalTick}</strong></div>
          <div className="metric"><span>Selected Intent</span><strong>{trace.selectedIntent.id}</strong></div>
          <div className="metric"><span>Belief confidence</span><strong>{trace.belief.confidence.toFixed(2)}</strong></div>
        </aside>

        <div className="inspector-grid">
          <Inspector title="Context" value={trace.contextSummary} />
          <Inspector title="Observation" value={trace.observations} />
          <Inspector title="Memory / Belief" value={{ memory: trace.memoryAfter, belief: trace.belief, changes: trace.memoryChanges }} />
          <Candidates trace={trace} />
          <Inspector title="Selected Intent" value={trace.selectedIntent} />
          <Inspector title="Current Action / Result" value={{ actions: snapshot.actions, results: trace.actionResults, cancelledIntent: trace.cancelledIntent ?? null }} />
        </div>
      </section>

      <section className="panel trace-panel">
        <div className="panel-title"><span>Timeline / Decision Trace</span><span className="pill">{usingLive ? 'live telemetry' : 'why did this Agent do that?'}</span></div>
        <div className="timeline">
          {usingLive ? (
            <button className="active">
              <span className="tick">LIVE T{trace.logicalTick}</span>
              <strong>{trace.selectedIntent.id}</strong>
              <small>{trace.belief.source} · {trace.belief.confidence.toFixed(2)}</small>
            </button>
          ) : demo.traces.map((entry) => (
            <button key={entry.logicalTick} className={entry.logicalTick === selectedTick ? 'active' : ''} onClick={() => setSelectedTick(entry.logicalTick)}>
              <span className="tick">T{entry.logicalTick}</span>
              <strong>{entry.selectedIntent.id}</strong>
              <small>{entry.belief.source} · {entry.belief.confidence.toFixed(2)}</small>
            </button>
          ))}
        </div>
        <div className="why">
          <strong>Why selected:</strong> {trace.selectedIntent.reason}
          {trace.cancelledIntent && <span> · Previous intent cancelled: {trace.cancelledIntent.reason}</span>}
        </div>
      </section>

      <section className="panel config-panel">
        <div className="panel-title"><span>Portable Config</span><span className={`pill ${validation.valid ? 'valid' : 'invalid'}`}>{validation.valid ? 'schema valid' : 'schema errors'}</span></div>
        <p className="config-source">Source: {configSource}</p>
        <textarea value={configText} onChange={(event) => setConfigText(event.target.value)} spellCheck={false} />
        <div className="config-actions">
          <input type="file" accept="application/json,.json" onChange={openConfigFile} aria-label="Open portable Volition config" />
          <button onClick={() => validateText()}>Validate</button>
          <button onClick={exportConfig}>Export JSON</button>
          <span>{validation.issues.length === 0 ? 'No validation issues.' : validation.issues.map((issue) => `${issue.severity}: ${issue.path} — ${issue.message}`).join(' · ')}</span>
        </div>
      </section>

      <footer>
        <span>能动 Volition · Agent Decision & Behavior Framework</span>
        <span>Pages is a static Workbench surface, not a shipping runtime backend.</span>
      </footer>
    </main>
  );
}

function Inspector({ title, value }: { readonly title: string; readonly value: unknown }) {
  return <article className="panel inspector"><div className="panel-title">{title}</div><pre>{JSON.stringify(value, null, 2)}</pre></article>;
}

function Candidates({ trace }: { readonly trace: DecisionTrace }) {
  return (
    <article className="panel inspector candidates">
      <div className="panel-title">Decision Candidates</div>
      <div className="candidate-list">
        {trace.candidates.map((candidate) => (
          <div key={candidate.id} className={candidate.intent.id === trace.selectedIntent.id ? 'selected' : ''}>
            <div><strong>{candidate.intent.id}</strong><span>{candidate.score.toFixed(2)}</span></div>
            <small>{candidate.eligible ? candidate.reason : candidate.rejectedReason ?? candidate.reason}</small>
          </div>
        ))}
      </div>
    </article>
  );
}
