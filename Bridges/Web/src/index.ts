import { AgentRuntime, type ActionIntent, type ActionResult, type ContextSnapshot, type Stimulus, type TickContext } from '@volition/core';
import { envelope, type KnownEnvelope, type ProtocolTransport } from '@volition/protocol';

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

/** Generic Web Host bridge. It has no Tactical Wizard/Babylon/Jolt/Vlox knowledge. */
export class VolitionWebBridge {
  readonly #host: WebHostAdapter;
  readonly #agents = new Map<string, AgentRuntime>();
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
    await this.#emitInventory();
  }

  public async tick(tick: TickContext): Promise<void> {
    this.#ensureActive();
    for (const [agentId, runtime] of [...this.#agents.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
      const context = this.#host.getContext(agentId, tick);
      const stimuli = this.#host.getStimuli(agentId, tick);
      const snapshot = runtime.tick({ tick, context, stimuli });
      const results = snapshot.actions
        .filter((entry) => entry.status === 'requested')
        .map((entry) => this.#host.executeAction(agentId, entry.action, tick));
      const finalSnapshot = results.length === 0
        ? snapshot
        : runtime.tick({
            tick: { ...tick, deltaSeconds: 0 },
            context,
            stimuli: [],
            actionResults: results,
          });
      if (this.#telemetryEnabled) {
        await this.#emit(envelope('agent_runtime_snapshot', { snapshot: finalSnapshot }, this.#nextSequence()));
        const trace = runtime.getTrace();
        const latest = trace.slice(Math.max(0, trace.length - (results.length === 0 ? 1 : 2)));
        await this.#emit(envelope('trace_batch', {
          agentId,
          fromTick: latest[0]?.logicalTick ?? tick.logicalTick,
          toTick: latest.at(-1)?.logicalTick ?? tick.logicalTick,
          events: latest,
        }, this.#nextSequence()));
      }
    }
  }

  public reset(): void {
    this.#ensureActive();
    for (const runtime of this.#agents.values()) runtime.reset();
    this.#sequence = 0;
  }

  public async disconnect(): Promise<void> {
    if (this.#transport !== undefined) await this.#transport.close();
  }

  public async dispose(): Promise<void> {
    if (this.#disposed) return;
    for (const runtime of this.#agents.values()) runtime.dispose();
    this.#agents.clear();
    await this.disconnect();
    this.#disposed = true;
  }

  async #emitInventory(): Promise<void> {
    await this.#emit(envelope('agent_inventory', {
      agentIds: [...this.#agents.keys()].sort((a, b) => a.localeCompare(b, 'en')),
    }, this.#nextSequence()));
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
