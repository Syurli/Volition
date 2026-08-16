import { describe, expect, it } from 'vitest';
import { createGrid, gridKey } from '../../Apps/Workbench/src/simulation/navigation';
import {
  choosePressureProposal,
  localEffectForBand,
  nextPressureBand,
  selectUnderFireReposition,
} from '../../Apps/Workbench/src/simulation/incomingFirePressure';
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

  it('uses hysteresis so a pressure band does not chatter on a threshold', () => {
    expect(nextPressureBand('stable', 0.8, 0.5)).toBe('pinned');
    expect(nextPressureBand('pinned', 0.66, 0.5)).toBe('pinned');
    expect(nextPressureBand('pinned', 0.42, 0.5)).toBe('suppressed');
    expect(nextPressureBand('suppressed', 0.35, 0.5)).toBe('pressured');
    expect(localEffectForBand('suppressed')).toBe('cover_bound');
    expect(localEffectForBand('pinned')).toBe('pinned_hold');
  });

  it('keeps an incoming-fire response lease stable while additional shots only raise pressure', () => {
    const simulation = new TacticalWizardAdaptiveSimulation();
    expect(simulation.setPlayerPosition({ x: 6, y: 2 })).toBe(true);
    for (let index = 0; index < 4; index += 1) simulation.step();
    let state = simulation.getState();
    expect(state.squad.alertState).toBe('active');
    const target = state.agents.find((agent) => agent.alive)!;
    expect(simulation.injectIncomingFireForTest(target.id, { x: 6, y: 2 })).toBe(true);
    expect(simulation.injectIncomingFireForTest(target.id, { x: 6, y: 2 })).toBe(true);
    state = simulation.getState();
    const lease = state.adaptiveCombat.activeResponseLease;
    expect(lease).not.toBeNull();
    const leaseId = lease!.id;
    const action = lease!.action;
    const maneuver = lease!.maneuverAgentId;
    const responseCount = state.adaptiveCombat.pressureResponses;
    for (let index = 0; index < 4; index += 1) expect(simulation.injectIncomingFireForTest(target.id, { x: 6, y: 2 })).toBe(true);
    state = simulation.getState();
    expect(state.adaptiveCombat.activeResponseLease?.id).toBe(leaseId);
    expect(state.adaptiveCombat.activeResponseLease?.action).toBe(action);
    expect(state.adaptiveCombat.activeResponseLease?.maneuverAgentId).toBe(maneuver);
    expect(state.adaptiveCombat.pressureResponses).toBe(responseCount);
    expect(state.adaptiveCombat.pressureProposalsDeferredByLease).toBeGreaterThan(0);
  });

  it('keeps the selected flanker identity and target stable for the response lease', () => {
    const simulation = new TacticalWizardAdaptiveSimulation();
    const feral = TACTICAL_WIZARD_COMBAT_PROFILES.find((entry) => entry.id === 'feral_pack')!;
    simulation.setCombatProfile({ ...feral, counterManeuverBias: 1 });
    expect(simulation.setPlayerPosition({ x: 6, y: 2 })).toBe(true);
    for (let index = 0; index < 4; index += 1) simulation.step();
    const target = simulation.getState().agents.find((agent) => agent.alive)!;
    simulation.injectIncomingFireForTest(target.id, { x: 6, y: 2 });
    simulation.injectIncomingFireForTest(target.id, { x: 6, y: 2 });
    let state = simulation.getState();
    expect(state.adaptiveCombat.activeResponseLease?.action).toBe('flank');
    const flanker = state.adaptiveCombat.activeResponseLease?.maneuverAgentId;
    const flankTarget = state.adaptiveCombat.activeResponseLease?.target;
    simulation.injectIncomingFireForTest(target.id, { x: 6, y: 2 });
    simulation.injectIncomingFireForTest(target.id, { x: 6, y: 2 });
    state = simulation.getState();
    expect(state.adaptiveCombat.activeResponseLease?.maneuverAgentId).toBe(flanker);
    expect(state.adaptiveCombat.activeResponseLease?.target).toEqual(flankTarget);
  });

  it('selects materially different and threat-occluded under-fire geometry instead of rotating roles in place', () => {
    const blocked = [] as { x: number; y: number }[];
    for (let y = 1; y <= 9; y += 1) blocked.push({ x: 6, y });
    const grid = createGrid(14, 12, blocked);
    const candidate = selectUnderFireReposition(grid, { x: 9, y: 5 }, { x: 12, y: 5 }, [{ x: 8, y: 9 }], 3.5, 8);
    expect(candidate).not.toBeNull();
    expect(candidate!.distance).toBeGreaterThanOrEqual(3.5);
    expect(candidate!.coveredFromThreat).toBe(true);
    expect(candidate!.pathExposureCells).toBeGreaterThanOrEqual(0);
  });

  it('lets pressure doctrine choose a bounded counter-maneuver without using normal flank bias as the direct trigger', () => {
    const elite = TACTICAL_WIZARD_COMBAT_PROFILES.find((entry) => entry.id === 'elite_squad')!;
    const proposal = choosePressureProposal({
      band: 'suppressed',
      pressure: 0.72,
      pressuredAgentId: 'bravo',
      livingCount: 3,
      pressuredCount: 1,
      currentTactic: 'bounding',
      profile: { ...elite, flankBias: 0, holdGroundBias: 0, counterManeuverBias: 1 },
      roll: 0.1,
    });
    expect(proposal.action).toBe('flank');
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
