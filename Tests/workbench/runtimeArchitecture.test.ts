import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcDir = resolve(process.cwd(), 'Apps/Workbench/src');
const simulationDir = resolve(srcDir, 'simulation');

describe('Tactical Wizard responsibility-named architecture guardrails', () => {
  it('routes production through Runtime -> Execution Contract -> Tactical Host with no compatibility simulation entry', () => {
    const production = readFileSync(resolve(simulationDir, 'tacticalWizardRuntime.ts'), 'utf8');
    expect(production).toContain('class TacticalWizardRuntime');
    expect(production).not.toMatch(/class\s+TacticalWizardRuntime\s+extends\s+/);
    expect(production).toContain("from './tacticalWizardExecutionContract'");
    expect(production).toContain("from './tacticalWizardTacticalHost'");
    expect(production).toContain("from './tacticalWizardTestMap'");
    expect(existsSync(resolve(simulationDir, 'tacticalWizardReferenceModel.ts'))).toBe(true);
    expect(existsSync(resolve(simulationDir, 'tacticalWizardSimulationV4.ts'))).toBe(false);
  });

  it('forbids chronological V-number module filenames throughout active Workbench source', () => {
    const offenders = sourceFiles(srcDir)
      .map((path) => path.slice(srcDir.length + 1))
      .filter((path) => /(?:^|[/\\])[^/\\]*V\d+[^/\\]*\.(?:ts|tsx|css)$/.test(path));
    expect(offenders).toEqual([]);
  });

  it('forbids imports that point at chronological V-number implementation modules', () => {
    const offenders = sourceFiles(srcDir)
      .filter((path) => /\.(?:ts|tsx)$/.test(path))
      .filter((path) => /from\s+['"][^'"]*V\d+[^'"]*['"]/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(srcDir.length + 1));
    expect(offenders).toEqual([]);
  });

  it('keeps one explicit responsibility order and one execution contract for movement and weapon authorization', () => {
    const production = readFileSync(resolve(simulationDir, 'tacticalWizardRuntime.ts'), 'utf8');
    const contract = readFileSync(resolve(simulationDir, 'tacticalWizardExecutionContract.ts'), 'utf8');
    expect(production).toContain("['perception', 'contact', 'tactical_planning', 'operational_arbitration', 'execution', 'host']");
    expect(production).toContain("finalMovementAuthority: 'execution_contract'");
    expect(production).toContain("finalWeaponAuthority: 'execution_contract'");
    expect(contract).toContain('resolveExecutionContract');
    expect(contract).toContain('grenade_suppress: 20');
    expect(contract).toContain('planOwner: PlanOwner');
    expect(contract).toContain('movementOwner: MovementOwner');
    expect(contract).toContain('weaponOwner: WeaponOwner');
  });
});

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}
