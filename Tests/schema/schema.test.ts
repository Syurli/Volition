import { describe, expect, it } from 'vitest';
import { validateProjectConfig } from '@willform/schema';
import { tacticalWizardProjectConfig } from '@willform/example-tactical-wizard';

describe('Schema 0.1 typed authoring assets', () => {
  it('accepts the Tactical Wizard reference with squads, behaviors, supervisors and reasoners', () => {
    const result = validateProjectConfig(tacticalWizardProjectConfig);
    expect(result.valid).toBe(true);
    expect(tacticalWizardProjectConfig.agents).toHaveLength(3);
    expect(tacticalWizardProjectConfig.squads?.[0]?.members).toHaveLength(3);
    expect(tacticalWizardProjectConfig.behaviors?.some((entry) => entry.scope === 'squad' && entry.id === 'tactic:flank')).toBe(true);
    expect(tacticalWizardProjectConfig.supervisors?.[0]?.modes.length).toBeGreaterThan(0);
    expect(tacticalWizardProjectConfig.reasoners?.[0]?.kind).toBe('utility');
  });

  it('rejects unsupported versions and warns on unknown fields', () => {
    const result = validateProjectConfig({ ...tacticalWizardProjectConfig, version: '9.0.0', futureField: true });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === 'version' && issue.severity === 'error')).toBe(true);
    expect(result.issues.some((issue) => issue.path === 'futureField' && issue.severity === 'warning')).toBe(true);
  });

  it('rejects broken typed references instead of silently accepting editor-only links', () => {
    const config = structuredClone(tacticalWizardProjectConfig);
    const squad = config.squads?.[0];
    expect(squad).toBeDefined();
    const broken = {
      ...config,
      squads: squad === undefined ? [] : [{ ...squad, members: [{ ...squad.members[0]!, agentId: 'agent:missing' }, ...squad.members.slice(1)] }],
    };
    const result = validateProjectConfig(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path.includes('members[0].agentId') && issue.message.includes('Unknown agent reference'))).toBe(true);
  });
});
