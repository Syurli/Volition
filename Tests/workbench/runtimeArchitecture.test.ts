import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const simulationDir = resolve(process.cwd(), 'Apps/Workbench/src/simulation');

describe('Tactical Wizard runtime architecture guardrails', () => {
  it('keeps version history out of the production runtime inheritance surface', () => {
    const production = readFileSync(resolve(simulationDir, 'tacticalWizardRuntime.ts'), 'utf8');
    const compatibilityEntry = readFileSync(resolve(simulationDir, 'tacticalWizardSimulationV4.ts'), 'utf8');

    expect(production).toContain('class TacticalWizardRuntime');
    expect(production).not.toMatch(/class\s+TacticalWizardRuntime\s+extends\s+/);
    expect(compatibilityEntry).not.toMatch(/class\s+TacticalWizardSimulation\s+extends\s+/);
    expect(compatibilityEntry).toContain("TacticalWizardRuntime as TacticalWizardSimulation");
  });

  it('does not allow a new numbered simulation generation to become the next patch layer', () => {
    const numbered = readdirSync(simulationDir)
      .map((name) => /^tacticalWizardSimulationV(\d+)\.ts$/.exec(name))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => Number(match[1]));

    expect(numbered.some((version) => version >= 19)).toBe(false);
  });

  it('keeps the final movement authority in the domain-named resolver', () => {
    const production = readFileSync(resolve(simulationDir, 'tacticalWizardRuntime.ts'), 'utf8');
    const ownership = readFileSync(resolve(simulationDir, 'tacticalWizardExecutionOwnership.ts'), 'utf8');

    expect(production).toContain('resolveExecutionOwnership');
    expect(production).toContain('resolveExecutionTarget');
    expect(ownership).toContain("owner: 'direct_combat'");
    expect(ownership).toContain('grenade_suppress: 20');
  });
});
