import { describe, expect, it } from 'vitest';
import { gridKey } from '../../Apps/Workbench/src/simulation/navigation';
import { tacticalWizardNavigationGrid } from '../../Apps/Workbench/src/simulation/tacticalWizardTestMap';
import { TacticalWizardAdaptiveSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardAdaptive';
import { TACTICAL_WIZARD_COMBAT_PROFILES } from '../../Apps/Workbench/src/simulation/tacticalWizardProfiles';

describe('Tactical Wizard adaptive combat sandbox', () => {
  it('turns early patrol arrival into an observable formation hold instead of an unexplained idle', () => {
    const simulation = new TacticalWizardAdaptiveSimulation();
    let observed = false;
    for (let index = 0; index < 220; index += 1) {
      const state = simulation.step();
      if (state.adaptiveCombat.formationHoldAgentIds.length === 0) continue;
      observed = true;
      for (const id of state.adaptiveCombat.formationHoldAgentIds) {
        expect(state.agents.find((agent) => agent.id === id)?.selectedIntent).toBe('formation_hold');
      }
      break;
    }
    expect(observed).toBe(true);
  });

  it('freezes enemy simulation through the sandbox enable switch while retaining player-side controls', () => {
    const simulation = new TacticalWizardAdaptiveSimulation();
    const before = simulation.getState();
    simulation.setEnemiesEnabled(false);
    const frozen = simulation.advance(1);
    expect(frozen.adaptiveCombat.enemiesEnabled).toBe(false);
    expect(frozen.logicalTick).toBe(before.logicalTick);
    expect(simulation.setPlayerAimTarget({ x: 40, y: 20 })).toBe(true);
    simulation.setEnemiesEnabled(true);
    const resumed = simulation.step();
    expect(resumed.logicalTick).toBeGreaterThan(before.logicalTick);
  });

  it('converts sustained player fire into pressure-aware tactical choice instead of permanent direct trading', () => {
    const simulation = new TacticalWizardAdaptiveSimulation();
    expect(simulation.setPlayerPosition({ x: 6, y: 2 })).toBe(true);
    for (let index = 0; index < 4; index += 1) simulation.step();
    let state = simulation.getState();
    expect(state.squad.alertState).toBe('active');
    const target = state.agents.find((agent) => agent.alive)!;
    expect(simulation.playerFireAt(target.position)).toBe(true);
    state = simulation.getState();
    const secondTarget = state.agents.find((agent) => agent.id === target.id) ?? state.agents.find((agent) => agent.alive)!;
    expect(simulation.playerFireAt(secondTarget.position)).toBe(true);
    state = simulation.getState();
    expect(state.adaptiveCombat.squadPressure).toBeGreaterThan(0.45);
    expect(state.adaptiveCombat.pressureResponses).toBeGreaterThan(0);
    expect(state.adaptiveCombat.tacticalAction).not.toBe('none');
  });

  it('lets profiles change pressure semantics without changing the fixed runtime hierarchy', () => {
    const simulation = new TacticalWizardAdaptiveSimulation();
    const feral = TACTICAL_WIZARD_COMBAT_PROFILES.find((entry) => entry.id === 'feral_pack')!;
    simulation.setCombatProfile(feral);
    const state = simulation.getState();
    expect(state.adaptiveCombat.profile.id).toBe('feral_pack');
    expect(state.adaptiveCombat.profile.mindset).toBe('feral');
    expect(state.executionAuthority.architecture).toBe('fixed_tactical_hierarchy');
    expect(state.executionAuthority.versionOverlayPolicy).toBe('forbidden');
  });

  it('destroys sandbox blocks through the shared navigation/LOS geometry authority and restores them on reset', () => {
    const simulation = new TacticalWizardAdaptiveSimulation();
    const wall = { x: 49, y: 27 };
    expect(tacticalWizardNavigationGrid.blocked.has(gridKey(wall))).toBe(true);
    expect(simulation.playerFireAt({ x: 60, y: 27 })).toBe(true);
    expect(simulation.playerFireAt({ x: 60, y: 27 })).toBe(true);
    expect(simulation.playerFireAt({ x: 60, y: 27 })).toBe(true);
    let state = simulation.getState();
    expect(state.dynamicWorld.destroyedCount).toBeGreaterThanOrEqual(1);
    expect(tacticalWizardNavigationGrid.blocked.has(gridKey(wall))).toBe(false);
    expect(state.dynamicWorld.geometryRevision).toBeGreaterThan(1);

    state = simulation.reset();
    expect(state.dynamicWorld.destroyedCount).toBe(0);
    expect(tacticalWizardNavigationGrid.blocked.has(gridKey(wall))).toBe(true);
  });
});
