import { describe, expect, it } from 'vitest';
import { validateProjectConfig } from '@volition/schema';
import { tacticalWizardProjectConfig } from '@volition/example-tactical-wizard';

describe('Schema 0.1', () => {
  it('accepts the reference fixture', () => {
    expect(validateProjectConfig(tacticalWizardProjectConfig).valid).toBe(true);
  });

  it('rejects unsupported versions and warns on unknown fields', () => {
    const result = validateProjectConfig({ ...tacticalWizardProjectConfig, version: '9.0.0', futureField: true });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === 'version' && issue.severity === 'error')).toBe(true);
    expect(result.issues.some((issue) => issue.path === 'futureField' && issue.severity === 'warning')).toBe(true);
  });
});
