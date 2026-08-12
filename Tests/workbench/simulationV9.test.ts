import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV9';

describe('Tactical Wizard V9 reactive combat host', () => {
  it('exposes real agent vitals and player combat state', () => {
    const simulation = new TacticalWizardSimulation();
    const state = simulation.getState();

    expect(state.agents).toHaveLength(3);
    expect(state.agents.every((agent) => agent.health === 100 && agent.maxHealth === 100)).toBe(true);
    expect(state.agents.every((agent) => agent.moveSpeed === 4.8)).toBe(true);
    expect(state.agents.every((agent) => agent.alive)).toBe(true);
    expect(state.playerCombat.selectedGrenade).toBe('flash');
    expect(state.playerCombat.grenadeInventory).toEqual({ flash: 3, frag: 3, smoke: 3 });
    expect(state.playerCombat.firePressure).toBe(0);
  });

  it('lets player aim and rifle fire damage an agent while creating an immediate dodge response', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 7, y: 2 })).toBe(true);
    const alpha = simulation.getState().agents.find((agent) => agent.label === 'Alpha')!;

    expect(simulation.setPlayerAimTarget(alpha.position)).toBe(true);
    expect(simulation.playerFireAt(alpha.position)).toBe(true);
    const state = simulation.getState();
    const after = state.agents.find((agent) => agent.id === alpha.id)!;

    expect(after.health).toBe(72);
    expect(after.reactionState).toBe('dodge');
    expect(after.reactionTarget).not.toBeNull();
    expect(state.playerCombat.shotPulse).toBeGreaterThan(0);
    expect(state.playerCombat.shotsRecent).toBe(1);
    expect(state.runLog.some((entry) => entry.category === 'player' && entry.event === 'fire' && entry.data.hitAgentId === alpha.id)).toBe(true);
  });

  it('uses sustained player aim and recent fire pressure as dodge inputs instead of random evasion', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 7, y: 2 })).toBe(true);
    let state = simulation.getState();
    const alpha = state.agents.find((agent) => agent.label === 'Alpha')!;
    simulation.setPlayerAimTarget(alpha.position);

    for (let frame = 0; frame < 24; frame += 1) state = simulation.advance(1 / 30);
    const aimed = state.agents.find((agent) => agent.id === alpha.id)!;
    expect(aimed.reactionState).toBe('dodge');
    expect(state.runLog.some((entry) => entry.actorId === alpha.id && entry.summary.includes('threat-aware dodge'))).toBe(true);
  });

  it('links AI flash, smoke and frag grenades to different follow-up doctrines', () => {
    const flash = new TacticalWizardSimulation();
    flash.applyGrenadeDoctrineForTest('flash', { x: 14, y: 2 });
    let state = flash.getState();
    expect(state.tacticalEffect.kind).toBe('flash_push');
    expect(state.agents.some((agent) => agent.reactionState === 'flash_push')).toBe(true);

    const smoke = new TacticalWizardSimulation();
    smoke.applyGrenadeDoctrineForTest('smoke', { x: 14, y: 2 });
    state = smoke.getState();
    expect(state.tacticalEffect.kind).toBe('smoke_retreat');
    expect(state.agents.every((agent) => agent.reactionState === 'smoke_retreat')).toBe(true);
    expect(state.agents.every((agent) => agent.reactionTarget !== null)).toBe(true);

    const frag = new TacticalWizardSimulation();
    frag.applyGrenadeDoctrineForTest('frag', { x: 14, y: 2 });
    state = frag.getState();
    expect(state.tacticalEffect.kind).toBe('frag_suppression');
    expect(state.agents.filter((agent) => agent.id !== state.squad.suppressorId).every((agent) => agent.reactionState === 'grenade_suppress')).toBe(true);
  });

  it('cycles grenade type and applies a player flash detonation to nearby agents', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.cyclePlayerGrenade(1)).toBe('frag');
    expect(simulation.cyclePlayerGrenade(1)).toBe('smoke');
    expect(simulation.cyclePlayerGrenade(1)).toBe('flash');
    expect(simulation.setPlayerPosition({ x: 5, y: 2 })).toBe(true);
    const alpha = simulation.getState().agents.find((agent) => agent.label === 'Alpha')!;

    expect(simulation.playerThrowGrenadeAt(alpha.position)).toBe(true);
    let state = simulation.getState();
    expect(state.playerCombat.grenadeInventory.flash).toBe(2);
    expect(state.grenadeEvents.some((grenade) => grenade.ownerId === 'player' && grenade.kind === 'flash')).toBe(true);

    for (let frame = 0; frame < 20; frame += 1) state = simulation.advance(1 / 30);
    expect(state.agents.some((agent) => agent.reactionState === 'stunned')).toBe(true);
    expect(state.eventLog.some((entry) => entry.includes('player flash grenade detonated'))).toBe(true);
  });

  it('tracks health to a downed state and removes the member from active combat reactions', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 7, y: 2 })).toBe(true);
    const alpha = simulation.getState().agents.find((agent) => agent.label === 'Alpha')!;

    for (let shot = 0; shot < 4; shot += 1) simulation.playerFireAt(alpha.position);
    const state = simulation.getState();
    const after = state.agents.find((agent) => agent.id === alpha.id)!;
    expect(after.health).toBe(0);
    expect(after.alive).toBe(false);
    expect(after.reactionState).toBe('downed');
  });
});
