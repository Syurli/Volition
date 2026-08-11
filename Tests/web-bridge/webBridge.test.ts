import { describe, expect, it } from 'vitest';
import type { ActionIntent, ActionResult, TickContext } from '@volition/core';
import type { KnownEnvelope, ProtocolTransport } from '@volition/protocol';
import { VolitionWebBridge, type WebHostAdapter } from '@volition/web-bridge';
import {
  TACTICAL_WIZARD_AGENT_ID,
  createTacticalWizardReferenceRuntime,
  fixtureContext,
  fixtureStimuli,
  tacticalWizardProjectConfig,
} from '@volition/example-tactical-wizard';

class MemoryTransport implements ProtocolTransport {
  public readonly id = 'memory-test';
  public readonly messages: KnownEnvelope[] = [];
  public closed = false;
  public send(message: KnownEnvelope): void { this.messages.push(structuredClone(message)); }
  public close(): void { this.closed = true; }
}

const host: WebHostAdapter = {
  projectId: 'reference',
  instanceId: 'test-instance',
  getContext: (_agentId, tick) => fixtureContext(tick.logicalTick),
  getStimuli: (_agentId, tick) => fixtureStimuli(tick.logicalTick),
  executeAction: (_agentId: string, action: ActionIntent, _tick: TickContext): ActionResult => ({
    actionId: action.id,
    status: action.kind === 'move_to' || action.kind === 'aim_at' ? 'running' : 'succeeded',
    reason: 'test-host',
  }),
};

describe('generic Web Bridge', () => {
  it('loads versioned portable config while runtime construction remains injected', async () => {
    const bridge = new VolitionWebBridge(host, { telemetryEnabled: false });
    const loaded = bridge.loadProjectConfig(tacticalWizardProjectConfig, (definition) => {
      expect(definition.id).toBe(TACTICAL_WIZARD_AGENT_ID);
      return createTacticalWizardReferenceRuntime();
    });
    expect(loaded).toEqual([TACTICAL_WIZARD_AGENT_ID]);
    await bridge.tick({ logicalTick: 0, deltaSeconds: 0, seed: 42 });
  });

  it('announces protocol identity/inventory and emits runtime snapshots without host-specific types', async () => {
    const transport = new MemoryTransport();
    const runtime = createTacticalWizardReferenceRuntime();
    const bridge = new VolitionWebBridge(host, { transport });
    bridge.registerAgent(TACTICAL_WIZARD_AGENT_ID, runtime);
    await bridge.announce();
    await bridge.tick({ logicalTick: 0, deltaSeconds: 0, seed: 42 });
    expect(transport.messages.map((message) => message.type)).toEqual([
      'handshake', 'capabilities', 'agent_inventory', 'agent_runtime_snapshot', 'trace_batch',
    ]);
    expect(runtime.getSnapshot().selectedIntent.id).toBe('patrol');
  });

  it('telemetry off does not change the decision stream', async () => {
    const visibleRuntime = createTacticalWizardReferenceRuntime();
    const silentRuntime = createTacticalWizardReferenceRuntime();
    const visibleTransport = new MemoryTransport();
    const silentTransport = new MemoryTransport();
    const visible = new VolitionWebBridge(host, { transport: visibleTransport, telemetryEnabled: true });
    const silent = new VolitionWebBridge(host, { transport: silentTransport, telemetryEnabled: false });
    visible.registerAgent(TACTICAL_WIZARD_AGENT_ID, visibleRuntime);
    silent.registerAgent(TACTICAL_WIZARD_AGENT_ID, silentRuntime);
    for (let logicalTick = 0; logicalTick <= 5; logicalTick += 1) {
      const tick = { logicalTick, deltaSeconds: logicalTick === 0 ? 0 : 1, seed: 42 };
      await visible.tick(tick);
      await silent.tick(tick);
    }
    expect(silentTransport.messages).toEqual([]);
    expect(silentRuntime.getTrace()).toEqual(visibleRuntime.getTrace());
  });

  it('reset clears runtime state and disconnect only closes transport', async () => {
    const runtime = createTacticalWizardReferenceRuntime();
    const transport = new MemoryTransport();
    const bridge = new VolitionWebBridge(host, { transport });
    bridge.registerAgent(TACTICAL_WIZARD_AGENT_ID, runtime);
    await bridge.tick({ logicalTick: 1, deltaSeconds: 1, seed: 42 });
    bridge.reset();
    expect(runtime.getTrace()).toEqual([]);
    await bridge.disconnect();
    expect(transport.closed).toBe(true);
    expect(runtime.getTrace()).toEqual([]);
  });
});
