import { AgentRuntime, type ActionIntent, type ActionResult, type ContextSnapshot, type Stimulus, type TickContext } from '@willform/core';
import { envelope, type KnownEnvelope, type ProtocolTransport } from '@willform/protocol';
import { assertValidProjectConfig, type AgentDefinition } from '@willform/schema';

export interface WebHostAdapter {
  readonly projectId: string;
  readonly instanceId: string;
  getContext(agentId: string, tick: TickContext): ContextSnapshot;
  getStimuli(agentId: string, tick: TickContext): readonly Stimulus[];
  executeAction(agentId: string, action: ActionIntent, tick: TickContext): ActionResult;
}

export interface WebBridgeOptions {
  readonly bridgeId?: string;
  readonly telemetryEnabled?: boolean;
  readonly transport?: ProtocolTransport;
}

export type AgentRuntimeFactory = (definition: AgentDefinition) => AgentRuntime;

/** Generic Web Host bridge. It has no Tactical Wizard/Babylon/Jolt/Vlox knowledge. */
export class WillformWebBridge {
  readonly #host: WebHostAdapter;
  readonly #agents = new Map<string, AgentRuntime>();
  readonly #pendingResults = new Map<string, ActionResult[]>();
  readonly #transport?: ProtocolTransport;
  readonly #bridgeId: string;
  #telemetryEnabled: boolean;
  #sequence = 0;
  #disposed = false;

  public constructor(host: WebHostAdapter, options: WebBridgeOptions = {}) {
    this.#host = host;
    this.#bridgeId = options.bridgeId ?? 'web-reference-bridge';
    this.#telemetryEnabled = options.telemetryEnabled ?? true;
    this.#transport = options.transport;
  }

  public registerAgent(agentId: string, runtime: AgentRuntime): void {
    this.#ensureActive();
    if (this.#agents.has(agentId)) throw new Error(`Agent already registered: ${agentId}.`);
    this.#agents.set(agentId, runtime);
  }

  /**
   * Loads portable versioned config while keeping runtime/policy construction outside the Bridge.
   * The injected factory is the host/application composition boundary; the Bridge does not assume Utility AI.
   */
  public loadProjectConfig(config: unknown, createRuntime: AgentRuntimeFactory): readonly string[] {
    this.#ensureActive();
    assertValidProjectConfig(config);
    const loaded: string[] = [];
    for (const definition of [...config.agents].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
      this.registerAgent(definition.id, createRuntime(definition));
      loaded.push(definition.id);
    }
    return loaded;
  }

  public setTelemetryEnabled(enabled: boolean): void {
    this.#telemetryEnabled = enabled;
  }

  public async announce(): Promise<void> {
    await this.#emit(envelope('handshake', {
      projectId: this.#host.projectId,
      instanceId: this.#host.instanceId,
      bridgeId: this.#bridgeId,
      telemetryEnabled: this.#telemetryEnabled,
    }, this.#nextSequence()));
    await this.#emit(envelope('capabilities', {
      capabilities: ['agent_inventory', 'runtime_snapshot', 'decision_trace'],
      transports: [this.#transport?.id ?? 'offline'],
    }, this.#nextSequence()));
    await this.#emit(envelope('agent_inventory', {
      agentIds: [...this.#agents.keys()].sort((a, b) => a.localeCompare(b, 'en')),
    }, this.#nextSequence()));
  }

  public async tick(tick: TickContext): Promise<void> {
    this.#ensureActive();
    for (const [agentId, runtime] of [...this.#agents.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
      const context = this.#host.getContext(agentId, tick);
      const stimuli = this.#host.getStimuli(agentId, tick);
      const actionResults = this.#pendingResults.get(agentId) ?? [];
      this.#pendingResults.delete(agentId);
      const snapshot = runtime.tick({ tick, context, stimuli, actionResults });
      const results = snapshot.actions
        .filter((entry) => entry.status === 'requested')
        .map((entry) => this.#host.executeAction(agentId, entry.action, tick));
      if (results.length > 0) this.#pendingResults.set(agentId, results);
      if (this.#telemetryEnabled) {
        await this.#emit(envelope('agent_runtime_snapshot', { snapshot }, this.#nextSequence()));
        const latest = runtime.getTrace().at(-1);
        await this.#emit(envelope('trace_batch', {
          agentId,
          fromTick: latest?.logicalTick ?? tick.logicalTick,
          toTick: latest?.logicalTick ?? tick.logicalTick,
          events: latest === undefined ? [] : [latest],
        }, this.#nextSequence()));
      }
    }
  }

  public reset(): void {
    this.#ensureActive();
    for (const runtime of this.#agents.values()) runtime.reset();
    this.#pendingResults.clear();
    this.#sequence = 0;
  }

  public async disconnect(): Promise<void> {
    if (this.#transport !== undefined) await this.#transport.close();
  }

  public async dispose(): Promise<void> {
    if (this.#disposed) return;
    for (const runtime of this.#agents.values()) runtime.dispose();
    this.#agents.clear();
    this.#pendingResults.clear();
    await this.disconnect();
    this.#disposed = true;
  }

  async #emit(message: KnownEnvelope): Promise<void> {
    if (!this.#telemetryEnabled || this.#transport === undefined) return;
    await this.#transport.send(message);
  }

  #nextSequence(): number {
    const current = this.#sequence;
    this.#sequence += 1;
    return current;
  }

  #ensureActive(): void {
    if (this.#disposed) throw new Error('Web bridge is disposed.');
  }
}
