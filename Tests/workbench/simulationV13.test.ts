import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV14';

const IDS = ['twr:rifle-squad:alpha', 'twr:rifle-squad:bravo', 'twr:rifle-squad:charlie'] as const;

describe('Tactical Wizard V14 rescue reliability and unseen-fire response', () => {
  it('assigns a non-exposed living member to suppress the coarse unseen-fire sector', () => {
    const simulation = new TacticalWizardSimulation();
    for (const id of IDS) expect(simulation.setAgentEquipment(id, { grenades: 0 })).toBe(true);

    expect(simulation.injectIncomingFireForTest('twr:rifle-squad:alpha', { x: 18, y: 4 })).toBe(true);
    let state = simulation.getState();
    let sawCounterfire = false;

    for (let frame = 0; frame < 900; frame += 1) {
      state = simulation.advance(1 / 30);
      if (state.runLog.some((entry) => entry.event === 'fire'
        && /counter-ambush suppression toward coarse threat sector/i.test(entry.summary))) {
        sawCounterfire = true;
        break;
      }
    }

    expect(state.threatResponse.active).toBe(true);
    expect(state.counterfire.agentId).not.toBe('twr:rifle-squad:alpha');
    expect(sawCounterfire).toBe(true);
    const fire = [...state.runLog].reverse().find((entry) => entry.event === 'fire'
      && /counter-ambush suppression toward coarse threat sector/i.test(entry.summary));
    expect(fire).toBeDefined();
    expect(fire?.data.target).toEqual(state.threatResponse.estimatedSector);
  }, 12000);

  it('keeps rescue security local, lets the rescuer move, and does not oscillate the phase without new damage', () => {
    const simulation = new TacticalWizardSimulation();
    for (const id of IDS) expect(simulation.setAgentEquipment(id, { grenades: 0 })).toBe(true);
    expect(simulation.setPlayerPosition({ x: 12.25, y: 9.61 })).toBe(true);

    let state = simulation.getState();
    for (let tick = 0; tick < 120 && state.squad.alertState !== 'active'; tick += 1) state = simulation.step();
    expect(state.squad.alertState).toBe('active');

    const casualtyId = 'twr:rifle-squad:bravo';
    expect(simulation.setAgentVitals(casualtyId, { health: 0 })).toBe(true);
    state = simulation.advance(1 / 30);

    let rescuerId: string | null = null;
    let rescuerStart: { x: number; y: number } | null = null;
    let rescuerMoved = false;
    let sawReady = false;
    let sawSupportFire = false;
    let sawApproach = false;
    let approachBackToEstablish = 0;
    let previousPhase = state.recovery.phase;
    let maxSecurityDistance = 0;

    for (let frame = 0; frame < 2400; frame += 1) {
      state = simulation.advance(1 / 30);
      if (rescuerId === null && state.recovery.rescuerId !== null) {
        rescuerId = state.recovery.rescuerId;
        const rescuer = state.agents.find((agent) => agent.id === rescuerId);
        if (rescuer !== undefined) rescuerStart = { ...rescuer.position };
      }
      const rescuer = rescuerId === null ? undefined : state.agents.find((agent) => agent.id === rescuerId);
      if (rescuer !== undefined && rescuerStart !== null && distance(rescuer.position, rescuerStart) > 0.8) rescuerMoved = true;
      if (state.rescueFireSupport.positionReady && state.rescueFireSupport.lineOfFire) sawReady = true;
      if (state.recovery.phase === 'approach') sawApproach = true;
      if (previousPhase === 'approach' && state.recovery.phase === 'establish_cover') approachBackToEstablish += 1;
      previousPhase = state.recovery.phase;
      if (state.runLog.some((entry) => entry.event === 'fire'
        && /rescue security (covering fire|suppression on last-known threat)/i.test(entry.summary))) sawSupportFire = true;
      const casualty = state.agents.find((agent) => agent.id === casualtyId);
      if (state.rescueFireSupport.securityPosition !== null && casualty !== undefined) {
        maxSecurityDistance = Math.max(maxSecurityDistance, distance(state.rescueFireSupport.securityPosition, casualty.position));
      }
      if (casualty?.alive) break;
    }

    const casualty = state.agents.find((agent) => agent.id === casualtyId);
    expect(rescuerId).not.toBeNull();
    expect(maxSecurityDistance).toBeLessThanOrEqual(5.3);
    expect(sawReady).toBe(true);
    expect(sawApproach).toBe(true);
    expect(rescuerMoved).toBe(true);
    expect(sawSupportFire).toBe(true);
    expect(approachBackToEstablish).toBe(0);
    expect(casualty?.alive).toBe(true);
  }, 20000);

  it('does not create and cancel a rescue contract every frame when only one soldier remains', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:bravo', { health: 0 })).toBe(true);
    expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true);

    let state = simulation.getState();
    for (let frame = 0; frame < 600; frame += 1) state = simulation.advance(1 / 30);

    const commits = state.runLog.filter((entry) => /Cover-then-rescue contract committed/i.test(entry.summary));
    const oldPostpones = state.runLog.filter((entry) => /Rescue postponed because a dedicated third-party security element is unavailable/i.test(entry.summary));
    const deferred = state.runLog.filter((entry) => /Casualty recovery deferred: no separate living security element/i.test(entry.summary));
    expect(commits).toHaveLength(0);
    expect(oldPostpones).toHaveLength(0);
    expect(deferred.length).toBeLessThanOrEqual(1);
    expect(state.recovery.phase).toBe('none');
  }, 10000);

  it('prevents a downed proxy from reacquiring visual contact or retaining an active squad role', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 12.25, y: 9.61 })).toBe(true);
    let state = simulation.getState();
    for (let tick = 0; tick < 120 && state.squad.alertState !== 'active'; tick += 1) state = simulation.step();
    expect(state.squad.alertState).toBe('active');

    const downedId = 'twr:rifle-squad:bravo';
    expect(simulation.setAgentVitals(downedId, { health: 0 })).toBe(true);
    const sequence = state.runLog.at(-1)?.sequence ?? 0;
    for (let frame = 0; frame < 240; frame += 1) state = simulation.advance(1 / 30);

    const downed = state.agents.find((agent) => agent.id === downedId);
    const postDownPerception = state.runLog.filter((entry) => entry.sequence > sequence
      && entry.actorId === downedId
      && entry.event === 'perception'
      && /acquired visual contact/i.test(entry.summary));
    expect(downed?.alive).toBe(false);
    expect(downed?.targetVisible).toBe(false);
    expect(postDownPerception).toHaveLength(0);
    expect(state.squad.suppressorId).not.toBe(downedId);
    expect(state.squad.moverId).not.toBe(downedId);
    expect(state.squad.observerId).not.toBe(downedId);
  }, 12000);
});

function distance(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
