import { describe, expect, it } from 'vitest';
import { deserializeEnvelope, envelope, serializeEnvelope } from '@volition/protocol';

describe('Protocol 0.1', () => {
  it('round trips a handshake independently of transport', () => {
    const message = envelope('handshake', {
      projectId: 'project',
      instanceId: 'instance',
      bridgeId: 'web',
      telemetryEnabled: true,
    }, 0);
    expect(deserializeEnvelope(serializeEnvelope(message))).toEqual(message);
  });

  it('rejects unsupported protocol versions', () => {
    expect(() => deserializeEnvelope(JSON.stringify({ protocolVersion: '99.0', sequence: 0, type: 'handshake', payload: {} }))).toThrow('Unsupported protocol version');
  });
});
