import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = resolve(process.cwd(), 'Apps/Workbench/src');
const simulationDir = resolve(src, 'simulation');
const retiredProductionFiles = [
  'tacticalWizardSimulation' + 'V3.ts',
  'tacticalWizardSimulationV4.ts',
  'tacticalWizardSimulationV7.ts',
  'tacticalWizardTestMapV7.ts',
];
const retiredUiFiles = [
  'components/SimulationCanvasV3.tsx',
  'components/SimulationCanvasV3Base.tsx',
  'components/SimulationCanvasV4.tsx',
  'components/SimulationCanvasV5.tsx',
  'components/SimulationCanvasV6.tsx',
  'pages/RuntimePagesV3.tsx',
  'pages/RuntimePagesV3Base.tsx',
  'pages/RuntimePagesV4.tsx',
  'pages/RuntimePagesV5.tsx',
  'pages/DesignPageV2.tsx',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

describe('Tactical Wizard production architecture guardrails', () => {
  it('uses semantic production entries and no numbered runtime import chain', () => {
    const entry = readFileSync(resolve(simulationDir, 'tacticalWizardSimulation.ts'), 'utf8');
    const runtime = readFileSync(resolve(simulationDir, 'tacticalWizardRuntime.ts'), 'utf8');
    const host = readFileSync(resolve(simulationDir, 'tacticalWizardHost.ts'), 'utf8');
    expect(entry).toContain('class TacticalWizardSimulation extends TacticalWizardRuntime');
    expect(runtime).toContain('class TacticalWizardRuntime');
    expect(host).toContain('class TacticalWizardHost');
    expect(entry).toContain("entrypoint: 'TacticalWizardSimulation'");
    expect(entry).toContain("behaviorProfile: 'active_attention_recovery'");
    expect(runtime).not.toMatch(/class\s+TacticalWizardRuntime\s+extends\s+/);
    for (const file of sourceFiles(src)) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from\s+['"][^'"]*(?:Simulation|Runtime|Canvas|Page|Map)V\d+[^'"]*['"]/);
    }
  });

  it('physically removes numbered production runtime and wrapper files', () => {
    for (const file of retiredProductionFiles) expect(existsSync(resolve(simulationDir, file)), file).toBe(false);
    for (const file of retiredUiFiles) expect(existsSync(resolve(src, file)), file).toBe(false);
  });

  it('keeps one explicit responsibility order and one execution contract', () => {
    const runtime = readFileSync(resolve(simulationDir, 'tacticalWizardRuntime.ts'), 'utf8');
    const hierarchy = readFileSync(resolve(simulationDir, 'tacticalWizardHierarchy.ts'), 'utf8');
    expect(runtime).toContain("['perception', 'contact', 'tactical_planning', 'operational_arbitration', 'execution', 'host']");
    expect(runtime).toContain("finalMovementAuthority: 'execution_contract'");
    expect(runtime).toContain("finalWeaponAuthority: 'execution_contract'");
    expect(hierarchy).toContain('resolveExecutionContract');
  });
});
