import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation, healthBand } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV17';

describe('Tactical Wizard V17 threat awareness and mutual support', () => {
  it('turns repeated non-hit fire near a soldier into a coarse threat response', () => {
    const simulation = new TacticalWizardSimulation();
    const initial = simulation.getState();
    const bravo = initial.agents.find((agent) => agent.id === 'twr:rifle-squad:bravo')!;
    const player = { x: bravo.position.x, y: Math.min(38, bravo.position.y + 14) };
    expect(simulation.setPlayerPosition(player)).toBe(true);

    const dx = bravo.position.x - player.x;
    const dy = bravo.position.y - player.y;
    const length = Math.hypot(dx, dy);
    const perpendicular = { x: -dy / length, y: dx / length };
    const nearMissTarget = {
      x: bravo.position.x + perpendicular.x * 0.9,
      y: bravo.position.y + perpendicular.y * 0.9,
    };

    simulation.playerFireAt(nearMissTarget);
    simulation.playerFireAt(nearMissTarget);
    const state = simulation.getState();
    const playerShots = state.runLog.filter((entry) => entry.category === 'player' && entry.event === 'fire').slice(-2);

    expect(playerShots).toHaveLength(2);
    expect(playerShots.every((entry) => entry.data.hitAgentId === null)).toBe(true);
    expect(state.threatAwareness.evidenceCounts.near_miss).toBeGreaterThan(0);
    expect(state.threatAwareness.confidence).toBeGreaterThanOrEqual(0.66);
    expect(state.threatAwareness.bearing).not.toBeNull();
    expect(state.threatAwareness.estimatedSector).not.toBeNull();
    expect(state.threatResponse.active).toBe(true);
    expect(state.threatAwareness.responseEscalations).toBeGreaterThan(0);
    expect(state.runLog.some((entry) => /without requiring damage/i.test(entry.summary))).toBe(true);
  });

  it('creates a buddy/security support contract before a critical wounded member becomes downed', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:alpha', { health: 16 })).toBe(true);
    let state = simulation.advance(0.25);
    for (let index = 0; index < 4 && !state.cohesion.active; index += 1) state = simulation.advance(0.25);

    expect(healthBand(16, 100)).toBe('critical');
    expect(state.cohesion.active).toBe(true);
    expect(state.cohesion.patientId).toBe('twr:rifle-squad:alpha');
    expect(state.cohesion.patientBand).toBe('critical');
    expect(state.cohesion.buddyId).not.toBeNull();
    expect(state.cohesion.securityId).not.toBeNull();
    const alpha = state.agents.find((agent) => agent.id === 'twr:rifle-squad:alpha')!;
    expect(alpha.alive).toBe(true);
    expect(alpha.task).toBe('hold_cover');
    expect(state.runLog.some((entry) => /Wounded mutual-support contract committed/i.test(entry.summary))).toBe(true);
  });

  it('suppresses grenade-resupply churn while search/counterfire owns the squad', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentEquipment('twr:rifle-squad:alpha', { grenades: 0, ammoRounds: 96 })).toBe(true);
    expect(simulation.injectThreatEvidenceForTest('twr:rifle-squad:bravo', 'near_miss', 0.7, { x: 1, y: 0 })).toBe(true);

    let state = simulation.getState();
    for (let frame = 0; frame < 80; frame += 1) state = simulation.advance(1 / 30);

    expect(state.threatResponse.active).toBe(true);
    expect(state.logisticsLifecycle.state).not.toBe('assigned');
    expect(state.agents.every((agent) => agent.logisticsTask === 'none')).toBe(true);
    expect(state.logisticsLifecycle.suppressedPlanningCalls).toBeGreaterThan(0);
    const assignmentLogs = state.runLog.filter((entry) => /resupply/i.test(entry.summary) && /orders|hands off/i.test(entry.summary));
    expect(assignmentLogs.length).toBeLessThanOrEqual(1);
  });

  it('promotes a living acting commander when Alpha is downed', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:alpha', { health: 0 })).toBe(true);
    const state = simulation.getState();

    expect(state.leadership.successionActive).toBe(true);
    expect(state.leadership.actingCommanderId).not.toBe('twr:rifle-squad:alpha');
    expect(state.command.commanderId).toBe(state.leadership.actingCommanderId);
    expect(state.command.order).toMatch(/acting commander/i);
  });

  it('rejects a flash effect area that contains a friendly soldier', () => {
    const simulation = new TacticalWizardSimulation();
    const state = simulation.getState();
    const host = simulation as unknown as {
      members: Array<{ id: string; label: string; position: { x: number; y: number } }>;
      validateCommittedThrowable: (
        member: { id: string; label: string; position: { x: number; y: number } },
        grenade: { id: number; ownerId: string; kind: 'flash'; from: { x: number; y: number }; to: { x: number; y: number }; radius: number; remainingFrames: number; totalFrames: number; flightFrames: number },
        state: typeof state,
      ) => { safe: boolean; reason: string; friendliesAtRisk: readonly string[]; targetClass: string };
    };
    const alpha = host.members.find((member) => member.id === 'twr:rifle-squad:alpha')!;
    const bravo = host.members.find((member) => member.id === 'twr:rifle-squad:bravo')!;
    const result = host.validateCommittedThrowable(alpha, {
      id: 999,
      ownerId: alpha.id,
      kind: 'flash',
      from: { ...alpha.position },
      to: { ...bravo.position },
      radius: 2.8,
      remainingFrames: 72,
      totalFrames: 72,
      flightFrames: 18,
    }, state);

    expect(result.safe).toBe(false);
    expect(result.friendliesAtRisk).toContain(bravo.id);
    expect(result.reason).toMatch(/friendly/i);
  });
});
