import { describe, expect, it } from 'vitest';
import { hasLineOfSight } from '../../Apps/Workbench/src/simulation/navigation';
import { tacticalWizardNavigationGrid } from '../../Apps/Workbench/src/simulation/tacticalWizardTestMapV7';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV12';

describe('Tactical Wizard V12 rescue fire support', () => {
  it('moves the dedicated rescue coverer onto a real firing lane and actively suppresses during rescue', () => {
    const simulation = new TacticalWizardSimulation();
    // Smoke has its own regression coverage. Keep this scenario focused on the
    // rescue fire-support contract so an opportunistic pre-rescue smoke grenade
    // cannot legitimately obscure the lane under test.
    for (const id of ['twr:rifle-squad:alpha', 'twr:rifle-squad:bravo', 'twr:rifle-squad:charlie']) {
      expect(simulation.setAgentEquipment(id, { grenades: 0 })).toBe(true);
    }
    expect(simulation.setPlayerPosition({ x: 12.25, y: 9.61 })).toBe(true);

    let state = simulation.getState();
    for (let tick = 0; tick < 120 && state.squad.alertState !== 'active'; tick += 1) state = simulation.step();
    expect(state.squad.alertState).toBe('active');
    expect(state.squad.sharedLastKnownPosition).not.toBeNull();

    const casualtyId = 'twr:rifle-squad:alpha';
    expect(simulation.setAgentVitals(casualtyId, { health: 0 })).toBe(true);
    state = simulation.advance(1 / 30);

    for (let frame = 0; frame < 180 && (!state.rescueFireSupport.active || state.rescueFireSupport.securityPosition === null); frame += 1) {
      state = simulation.advance(1 / 30);
    }

    expect(state.recovery.covererId).not.toBeNull();
    expect(state.recovery.rescuerId).not.toBeNull();
    expect(state.recovery.covererId).not.toBe(state.recovery.rescuerId);
    expect(state.rescueFireSupport.active).toBe(true);
    expect(state.rescueFireSupport.fireTarget).not.toBeNull();
    expect(state.rescueFireSupport.securityPosition).not.toBeNull();
    expect(hasLineOfSight(
      tacticalWizardNavigationGrid,
      roundPoint(state.rescueFireSupport.securityPosition!),
      roundPoint(state.rescueFireSupport.fireTarget!),
    )).toBe(true);

    const covererId = state.recovery.covererId!;
    let sawReady = false;
    let sawSupportFire = false;
    let sawVisualReacquisition = false;
    for (let frame = 0; frame < 1500; frame += 1) {
      state = simulation.advance(1 / 30);
      const coverer = state.agents.find((agent) => agent.id === covererId);
      if (coverer?.targetVisible) sawVisualReacquisition = true;
      if (state.rescueFireSupport.positionReady && state.rescueFireSupport.lineOfFire) sawReady = true;
      if (state.runLog.some((entry) => entry.actorId === covererId
        && entry.event === 'fire'
        && /rescue security (covering fire|suppression on last-known threat)/i.test(entry.summary))) {
        sawSupportFire = true;
        break;
      }
    }

    expect(sawReady).toBe(true);
    expect(sawSupportFire).toBe(true);
    // In this authored scenario the fire-support lane is inside visual range;
    // facing the threat should therefore allow normal perception to reacquire.
    expect(sawVisualReacquisition).toBe(true);
  }, 15000);

  it('faces the rescue security element toward the shared threat instead of leaving it in a passive cover pose', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 12.25, y: 9.61 })).toBe(true);

    let state = simulation.getState();
    for (let tick = 0; tick < 120 && state.squad.alertState !== 'active'; tick += 1) state = simulation.step();
    expect(state.squad.alertState).toBe('active');
    expect(simulation.setAgentVitals('twr:rifle-squad:alpha', { health: 0 })).toBe(true);

    for (let frame = 0; frame < 240; frame += 1) {
      state = simulation.advance(1 / 30);
      if (state.rescueFireSupport.active && state.rescueFireSupport.fireTarget !== null) break;
    }

    const coverer = state.agents.find((agent) => agent.id === state.rescueFireSupport.covererId);
    const target = state.rescueFireSupport.fireTarget;
    expect(coverer).toBeDefined();
    expect(target).not.toBeNull();
    const direction = normalize({ x: target!.x - coverer!.position.x, y: target!.y - coverer!.position.y });
    expect(coverer!.facing.x * direction.x + coverer!.facing.y * direction.y).toBeGreaterThan(0.95);
  }, 10000);
});

function roundPoint(point: { readonly x: number; readonly y: number }) {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function normalize(point: { readonly x: number; readonly y: number }) {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-9 ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
}
