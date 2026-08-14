import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const simulationDir = resolve(process.cwd(), 'Apps/Workbench/src/simulation');
const retiredOverlays = [
  'tacticalWizardSimulationV8.ts',
  'tacticalWizardSimulationV9.ts',
  'tacticalWizardSimulationV10.ts',
  'tacticalWizardSimulationV11.ts',
  'tacticalWizardSimulationV12.ts',
  'tacticalWizardSimulationV14.ts',
  'tacticalWizardSimulationV15.ts',
  'tacticalWizardSimulationV16.ts',
  'tacticalWizardSimulationV17.ts',
  'tacticalWizardSimulationV18.ts',
  'tacticalWizardSimulationIntegrated.ts',
  'tacticalWizardSimulationExecutionIntegrated.ts',
  'tacticalWizardSimulationPerceptionIntegrated.ts',
  'tacticalWizardSimulationThreatAuthority.ts',
  'tacticalWizardSimulationCurrent.ts',
  'tacticalWizardExecutionOwnership.ts',
];

describe('Tactical Wizard fixed hierarchy architecture guardrails', () => {
  it('routes production through one composition runtime and never through the retired overlay chain', () => {
    const production = readFileSync(resolve(simulationDir, 'tacticalWizardRuntime.ts'), 'utf8');
    const entry = readFileSync(resolve(simulationDir, 'tacticalWizardSimulationV4.ts'), 'utf8');

    expect(production).toContain('class TacticalWizardRuntime');
    expect(production).not.toMatch(/class\s+TacticalWizardRuntime\s+extends\s+/);
    expect(production).toContain("from './tacticalWizardHierarchy'");
    expect(production).toContain("from './tacticalWizardSimulationV7'");
    expect(production).not.toMatch(/tacticalWizardSimulation(?:Current|Integrated|ExecutionIntegrated|PerceptionIntegrated|ThreatAuthority|V(?:8|9|1[0-8]))/);
    expect(entry).toContain('TacticalWizardRuntime as TacticalWizardSimulation');
    expect(entry).not.toMatch(/tacticalWizardSimulationCurrent|tacticalWizardExecutionOwnership/);
  });

  it('physically removes retired overlay-style behavior layers from the simulation tree', () => {
    for (const file of retiredOverlays) expect(existsSync(resolve(simulationDir, file)), file).toBe(false);
  });

  it('keeps one explicit responsibility order and one execution contract for movement and weapon authorization', () => {
    const production = readFileSync(resolve(simulationDir, 'tacticalWizardRuntime.ts'), 'utf8');
    const hierarchy = readFileSync(resolve(simulationDir, 'tacticalWizardHierarchy.ts'), 'utf8');

    expect(production).toContain("['perception', 'contact', 'tactical_planning', 'operational_arbitration', 'execution', 'host']");
    expect(production).toContain("finalMovementAuthority: 'execution_contract'");
    expect(production).toContain("finalWeaponAuthority: 'execution_contract'");
    expect(hierarchy).toContain('resolveExecutionContract');
    expect(hierarchy).toContain('grenade_suppress: 20');
    expect(hierarchy).toContain("planOwner: PlanOwner");
    expect(hierarchy).toContain("movementOwner: MovementOwner");
    expect(hierarchy).toContain("weaponOwner: WeaponOwner");
  });
});
