import { describe, expect, it } from 'vitest';
import { validateLiveEndpoint } from '../../Apps/Workbench/src/connection';

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
});
