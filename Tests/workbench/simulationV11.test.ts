import { describe, expect, it } from 'vitest';
import { findPath, isWalkable } from '../../Apps/Workbench/src/simulation/navigation';
import { svgLocalToWorld } from '../../Apps/Workbench/src/components/SimulationCanvasV6';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV11';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from '../../Apps/Workbench/src/simulation/tacticalWizardTestMapV7';

describe('Tactical Wizard V11 combat sandbox', () => {
  it('maps the visual center of a world cell back to the same aim coordinate', () => {
    const world = { x: 10, y: 12 };
    const cell = 22;
    const mapped = svgLocalToWorld({ x: world.x * cell + cell / 2, y: world.y * cell + cell / 2 });
    expect(mapped.x).toBeCloseTo(world.x, 6);
    expect(mapped.y).toBeCloseTo(world.y, 6);
  });

  it('converts unseen incoming fire into a coarse sector, emergency smoke and coordinated search instead of staying on patrol', () => {
    const simulation = new TacticalWizardSimulation();
    const victim = simulation.getState().agents[0]!;
    const exactSource = { x: 21, y: 2 };

    expect(simulation.injectIncomingFireForTest(victim.id, exactSource)).toBe(true);
    let state = simulation.getState();
    expect(state.threatResponse.active).toBe(true);
    expect(state.threatResponse.phase).toBe('break_contact');
    expect(state.squad.alertState).toBe('active');
    expect(state.squad.tactic).toBe('sweep');
    expect(state.threatResponse.estimatedSector).not.toBeNull();
    expect(state.threatResponse.estimatedSector).not.toEqual(exactSource);
    expect(state.threatResponse.bearing?.x).toBeGreaterThan(0.8);
    expect(state.threatResponse.smokeDeployed).toBe(true);
    expect(state.grenadeEvents.some((grenade) => grenade.kind === 'smoke' && grenade.ownerId !== 'player')).toBe(true);
    expect(state.agents.every((agent) => !agent.targetVisible)).toBe(true);

    for (let frame = 0; frame < 420 && state.threatResponse.phase === 'break_contact'; frame += 1) {
      state = simulation.advance(1 / 30);
    }
    expect(state.threatResponse.phase).toBe('sector_search');
    expect(state.squad.tactic).toBe('sweep');
    expect(state.agents.some((agent) => agent.task === 'search_sector' || agent.task === 'overwatch')).toBe(true);
    expect(state.runLog.some((entry) => entry.category === 'squad' && entry.summary.includes('coarse threat sector'))).toBe(true);
  });

  it('requires a dedicated third soldier to establish a real security position before casualty treatment', () => {
    const simulation = new TacticalWizardSimulation();
    const casualtyId = simulation.getState().agents[0]!.id;
    expect(simulation.setAgentVitals(casualtyId, { health: 0 })).toBe(true);

    let state = simulation.advance(1 / 30);
    expect(state.recovery.phase).toBe('establish_cover');
    expect(state.recovery.rescuerId).not.toBeNull();
    expect(state.recovery.covererId).not.toBeNull();
    expect(state.recovery.rescuerId).not.toBe(state.recovery.covererId);
    expect(state.recovery.rescuerId).not.toBe(casualtyId);
    expect(state.recovery.covererId).not.toBe(casualtyId);
    expect(state.threatResponse.rescueCoverTarget).not.toBeNull();

    const covererId = state.recovery.covererId!;
    const securityTarget = state.threatResponse.rescueCoverTarget!;
    let securityWasReached = false;
    let treatSeen = false;
    for (let frame = 0; frame < 1200; frame += 1) {
      state = simulation.advance(1 / 30);
      const coverer = state.agents.find((agent) => agent.id === covererId);
      if (coverer !== undefined && distance(coverer.position, securityTarget) <= 0.9) securityWasReached = true;
      if (state.recovery.phase === 'treat') { treatSeen = true; break; }
    }
    expect(securityWasReached).toBe(true);
    expect(treatSeen).toBe(true);
  }, 15000);

  it('interrupts casualty treatment when the rescuer receives combat damage and resets treatment progress', () => {
    const simulation = new TacticalWizardSimulation();
    const casualtyId = simulation.getState().agents[0]!.id;
    expect(simulation.setAgentVitals(casualtyId, { health: 0 })).toBe(true);

    let state = simulation.advance(1 / 30);
    for (let frame = 0; frame < 1200 && state.recovery.phase !== 'treat'; frame += 1) state = simulation.advance(1 / 30);
    expect(state.recovery.phase).toBe('treat');
    const rescuerId = state.recovery.rescuerId!;

    // The real player-rifle path calls the same contract after damage. This
    // direct host invocation isolates the interruption state machine from LOS.
    const unsafe = simulation as unknown as { interruptRescueForIncomingDamage: (agentId: string, source: string) => void };
    unsafe.interruptRescueForIncomingDamage(rescuerId, 'regression_hit');
    state = simulation.getState();

    expect(state.recovery.phase).toBe('establish_cover');
    expect(state.recovery.treatmentProgress).toBe(0);
    expect(state.threatResponse.rescueInterruptedCount).toBe(1);
    expect(state.runLog.some((entry) => entry.category === 'squad' && entry.summary.includes('Rescue interrupted'))).toBe(true);
  }, 15000);

  it('keeps the rebuilt sandbox readable, reachable and explicitly scenario-driven', () => {
    expect(tacticalWizardTestMap.id).toBe('tactical-wizard-combat-sandbox-v11');
    expect(tacticalWizardTestMap.zones).toHaveLength(7);
    expect(tacticalWizardTestMap.testPoints.map((point) => point.id)).toEqual(expect.arrayContaining([
      'crossfire', 'incoming-fire', 'lost-contact', 'sector-search', 'rescue-casualty', 'smoke-screen', 'medical-resupply',
    ]));
    for (const point of tacticalWizardTestMap.testPoints) {
      expect(isWalkable(tacticalWizardNavigationGrid, point.position), point.id).toBe(true);
      expect(findPath(tacticalWizardNavigationGrid, { x: 2, y: 2 }, point.position).length, point.id).toBeGreaterThan(0);
    }
  });
});

function distance(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
