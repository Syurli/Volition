import { describe, expect, it } from 'vitest';
import { envelope } from '@volition/protocol';
import { runTacticalWizardFixture } from '@volition/example-tactical-wizard';
import {
  EMPTY_LIVE_TELEMETRY,
  reduceLiveTelemetry,
  validateLiveEndpoint,
} from '../../Apps/Workbench/src/connection';

describe('Workbench live endpoint safety', () => {
  it('rejects ws mixed content from HTTPS Pages', () => {
    const result = validateLiveEndpoint('ws://localhost:7000/volition', 'https:');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('mixed content');
  });

  it('allows wss in production and ws in local HTTP development', () => {
    expect(validateLiveEndpoint('wss://localhost:7443/volition', 'https:').valid).toBe(true);
    expect(validateLiveEndpoint('ws://localhost:7000/volition', 'http:').valid).toBe(true);
  });

  it('projects protocol inventory, runtime snapshot and trace batch into inspector state', () => {
    const fixture = runTacticalWizardFixture();
    const snapshot = fixture.snapshots[3]!;
    const trace = fixture.traces[3]!;
    let state = reduceLiveTelemetry(
      EMPTY_LIVE_TELEMETRY,
      envelope('agent_inventory', { agentIds: [snapshot.agentId] }, 0),
    );
    state = reduceLiveTelemetry(
      state,
      envelope('agent_runtime_snapshot', { snapshot }, 1),
    );
    state = reduceLiveTelemetry(
      state,
      envelope('trace_batch', {
        agentId: snapshot.agentId,
        fromTick: trace.logicalTick,
        toTick: trace.logicalTick,
        events: [trace],
      }, 2),
    );
    expect(state.agentIds).toEqual([snapshot.agentId]);
    expect(state.snapshot?.selectedIntent.id).toBe('engage');
    expect(state.latestTrace?.selectedIntent.id).toBe('engage');
  });
});
