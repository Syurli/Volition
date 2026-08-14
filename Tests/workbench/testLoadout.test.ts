import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV4';
import {
  DEFAULT_TACTICAL_WIZARD_TEST_LOADOUT,
  applyTacticalWizardTestLoadout,
  normalizeTacticalWizardTestLoadout,
} from '../../Apps/Workbench/src/simulation/tacticalWizardTestLoadout';

describe('Tactical Wizard test loadout', () => {
  it('starts the Workbench baseline at full ammunition with practical grenade inventory', () => {
    expect(DEFAULT_TACTICAL_WIZARD_TEST_LOADOUT).toEqual({ ammoRounds: 120, grenades: 3 });
    const simulation = new TacticalWizardSimulation();
    expect(applyTacticalWizardTestLoadout(simulation, DEFAULT_TACTICAL_WIZARD_TEST_LOADOUT)).toBe(true);
    const state = simulation.getState();
    expect(state.agents.every((agent) => agent.ammoRounds === 120)).toBe(true);
    expect(state.agents.every((agent) => agent.grenadeCount === 3)).toBe(true);
    expect(state.logisticsLifecycle.state).toBe('idle');
  });

  it('can be reapplied immediately after runtime reset without advancing a logistics tick', () => {
    const simulation = new TacticalWizardSimulation();
    applyTacticalWizardTestLoadout(simulation, { ammoRounds: 120, grenades: 4 });
    simulation.setAgentEquipment(stateId(simulation, 0), { ammoRounds: 0, grenades: 0 });
    simulation.reset();
    applyTacticalWizardTestLoadout(simulation, { ammoRounds: 120, grenades: 4 });
    const state = simulation.getState();
    expect(state.logicalTick).toBe(0);
    expect(state.logisticsLifecycle.state).toBe('idle');
    expect(state.agents.every((agent) => agent.ammoRounds === 120 && agent.grenadeCount === 4)).toBe(true);
  });

  it('clamps persisted or manually entered values to runtime-supported ranges', () => {
    expect(normalizeTacticalWizardTestLoadout({ ammoRounds: 999, grenades: 99 })).toEqual({ ammoRounds: 120, grenades: 5 });
    expect(normalizeTacticalWizardTestLoadout({ ammoRounds: -20, grenades: -2 })).toEqual({ ammoRounds: 0, grenades: 0 });
  });
});

function stateId(simulation: TacticalWizardSimulation, index: number): string {
  return simulation.getState().agents[index]!.id;
}
