import { describe, expect, it } from 'vitest';
import { TacticalWizardRuntime } from '../../Apps/Workbench/src/simulation/tacticalWizardRuntime';

const ALPHA = 'twr:rifle-squad:alpha';
const BRAVO = 'twr:rifle-squad:bravo';
const CHARLIE = 'twr:rifle-squad:charlie';

describe('Tactical Wizard fixed hierarchy integration', () => {
  it('commits a critical dry member to logistics and moves its execution target to the supply cache', () => {
    const simulation = activeSimulation();
    expect(simulation.setAgentEquipment(ALPHA, { ammoRounds: 0 })).toBe(true);
    expect(simulation.setAgentEquipment(BRAVO, { ammoRounds: 60 })).toBe(true);
    expect(simulation.setAgentEquipment(CHARLIE, { ammoRounds: 60 })).toBe(true);
    let state = simulation.step();
    expect(state.logisticsLifecycle.state).toBe('assigned'); expect(state.logisticsLifecycle.agentId).toBe(ALPHA);
    const contract = state.executionAuthority.contracts.find((entry) => entry.agentId === ALPHA)!;
    expect(contract.planOwner).toBe('logistics'); expect(contract.movementOwner).toBe('logistics'); expect(contract.weaponOwner).toBe('none');
    expect(contract.movementTarget).toEqual(state.agents.find((agent) => agent.id === ALPHA)!.resupplyTargetPosition);
    const target = contract.movementTarget!; const before = state.agents.find((agent) => agent.id === ALPHA)!.position; const beforeDistance = distance(before, target);
    for (let index = 0; index < 3; index += 1) state = simulation.step();
    expect(distance(state.agents.find((agent) => agent.id === ALPHA)!.position, target)).toBeLessThan(beforeDistance);
  });

  it('keeps an approved logistics lease through grenade suppression instead of deleting the assignment', () => {
    const simulation = activeSimulation(); simulation.setAgentEquipment(ALPHA, { ammoRounds: 0 }); simulation.setAgentEquipment(BRAVO, { ammoRounds: 60 }); simulation.setAgentEquipment(CHARLIE, { ammoRounds: 60 });
    let state = simulation.step(); expect(state.logisticsLifecycle.agentId).toBe(ALPHA);
    const alpha = state.agents.find((agent) => agent.id === ALPHA)!; simulation.applyGrenadeDoctrineForTest('frag', alpha.position, 'test'); state = simulation.getState();
    expect(state.logisticsLifecycle.agentId).toBe(ALPHA);
    const contract = state.executionAuthority.contracts.find((entry) => entry.agentId === ALPHA)!;
    expect(state.agents.find((agent) => agent.id === ALPHA)!.reactionState).toBe('grenade_suppress'); expect(contract.planOwner).toBe('logistics'); expect(contract.movementOwner).toBe('logistics');
  });

  it('selects exactly one logistics owner when the whole living squad is dry', () => {
    const simulation = activeSimulation(); for (const id of [ALPHA, BRAVO, CHARLIE]) simulation.setAgentEquipment(id, { ammoRounds: 0, grenades: 0 });
    const state = simulation.step(); expect(state.logisticsLifecycle.state).toBe('assigned'); expect(state.logisticsLifecycle.agentId).toBe(ALPHA);
    expect(state.executionAuthority.contracts.filter((entry) => entry.planOwner === 'logistics')).toHaveLength(1); expect(state.agents.filter((agent) => agent.ammoRounds >= 3)).toHaveLength(0); expect(state.safeFireLanes).toBe(0);
  });

  it('does not count empty rifles as a valid crossfire/assault fire lane while the squad remains dry', () => {
    const simulation = activeSimulation(); for (const id of [ALPHA, BRAVO, CHARLIE]) simulation.setAgentEquipment(id, { ammoRounds: 0, grenades: 0 });
    const marker = Math.max(-1, ...simulation.getState().runLog.map((entry) => entry.sequence)); let state = simulation.getState();
    for (let index = 0; index < 24; index += 1) { state = simulation.step(); const allDry = state.agents.filter((agent) => agent.alive).every((agent) => agent.ammoRounds < 3); if (!allDry) break; expect(state.safeFireLanes).toBe(0); const dryAssault = state.runLog.find((entry) => entry.sequence > marker && entry.category === 'squad' && entry.event === 'tactic' && entry.data.to === 'assault'); expect(dryAssault).toBeUndefined(); }
  });

  it('exports the public execution contract needed to diagnose plan/body/weapon ownership', () => {
    const simulation = activeSimulation(); const state = simulation.getState(); expect(state.executionAuthority.versionOverlayPolicy).toBe('forbidden'); expect(state.executionAuthority.contracts).toHaveLength(state.agents.length);
    for (const contract of state.executionAuthority.contracts) { expect(contract.planOwner).toBeTruthy(); expect(contract.movementOwner).toBeTruthy(); expect(contract.weaponOwner).toBeTruthy(); expect(typeof contract.reason).toBe('string'); }
  });
});

function activeSimulation(): TacticalWizardRuntime { const simulation = new TacticalWizardRuntime(); expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true); for (let index = 0; index < 80 && simulation.getState().squad.alertState !== 'active'; index += 1) simulation.step(); expect(simulation.getState().squad.alertState).toBe('active'); return simulation; }
function distance(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number { return Math.hypot(a.x - b.x, a.y - b.y); }
