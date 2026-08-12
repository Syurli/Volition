import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV6';

describe('Tactical Wizard mutual-support simulation V6', () => {
  it('never treats an unsupported rearward move as a free back-turn', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let previous = simulation.getState();
    let rearwardSamples = 0;
    let coveredDashSamples = 0;

    for (let frame = 0; frame < 720; frame += 1) {
      const state = simulation.advance(1 / 30);
      const threat = state.squad.sharedLastKnownPosition;
      if (threat !== null && state.squad.alertState === 'active') {
        for (const agent of state.agents) {
          const prior = previous.agents.find((entry) => entry.id === agent.id);
          if (prior === undefined) continue;
          const dx = agent.position.x - prior.position.x;
          const dy = agent.position.y - prior.position.y;
          const movementLength = Math.hypot(dx, dy);
          if (movementLength < 0.025) continue;
          const tx = threat.x - prior.position.x;
          const ty = threat.y - prior.position.y;
          const threatLength = Math.hypot(tx, ty);
          if (threatLength < 0.1) continue;
          const movementDotThreat = (dx / movementLength) * (tx / threatLength) + (dy / movementLength) * (ty / threatLength);
          if (movementDotThreat > -0.53) continue;
          rearwardSamples += 1;
          if (agent.locomotionMode === 'covered_dash') {
            coveredDashSamples += 1;
            expect(agent.backTurnPermitted).toBe(true);
          } else {
            expect(agent.locomotionMode).toBe('backpedal');
            expect(agent.backTurnPermitted).toBe(false);
            const facingLength = Math.hypot(agent.facing.x, agent.facing.y) || 1;
            const facingDotThreat = (agent.facing.x / facingLength) * (tx / threatLength) + (agent.facing.y / facingLength) * (ty / threatLength);
            expect(facingDotThreat).toBeGreaterThan(0.75);
          }
        }
      }
      previous = state;
    }

    expect(rearwardSamples).toBeGreaterThan(0);
    expect(coveredDashSamples).toBeLessThan(rearwardSamples);
  });

  it('searches as lead-cover-overwatch buddies and hands off movement responsibility', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.getState();
    for (let index = 0; index < 24; index += 1) state = simulation.step();
    expect(simulation.setPlayerPosition({ x: 46, y: 27 })).toBe(true);
    for (let index = 0; index < 80 && state.squad.tactic !== 'sweep'; index += 1) state = simulation.step();

    expect(state.squad.tactic).toBe('sweep');
    expect(state.coordination.searchLeadId).not.toBeNull();
    expect(state.coordination.searchCoverId).not.toBeNull();
    expect(state.coordination.searchOverwatchId).not.toBeNull();
    expect(new Set([state.coordination.searchLeadId, state.coordination.searchCoverId, state.coordination.searchOverwatchId]).size).toBe(3);

    const originalLeadId = state.coordination.searchLeadId!;
    const originalCoverId = state.coordination.searchCoverId!;
    expect(state.agents.find((agent) => agent.id === originalLeadId)?.buddyRole).toBe('lead');
    expect(state.agents.find((agent) => agent.id === originalCoverId)?.buddyRole).toBe('cover');
    const coverStart = { ...state.agents.find((agent) => agent.id === originalCoverId)!.position };
    let leadMoved = false;
    let handoffObserved = false;

    for (let frame = 0; frame < 420 && state.squad.tactic === 'sweep'; frame += 1) {
      const previousLead = state.agents.find((agent) => agent.id === state.coordination.searchLeadId);
      state = simulation.advance(1 / 30);
      const currentCover = state.agents.find((agent) => agent.id === originalCoverId);
      if (!handoffObserved && state.coordination.searchLeadId === originalLeadId && currentCover !== undefined) {
        expect(distance(currentCover.position, coverStart)).toBeLessThan(0.06);
      }
      const currentLead = state.agents.find((agent) => agent.id === originalLeadId);
      if (previousLead?.id === originalLeadId && currentLead !== undefined && distance(previousLead.position, currentLead.position) > 0.025) leadMoved = true;
      if (state.coordination.searchLeadId !== originalLeadId) {
        handoffObserved = true;
        break;
      }
    }

    expect(leadMoved).toBe(true);
    expect(handoffObserved).toBe(true);
    expect(state.coordination.searchLeadId).toBe(originalCoverId);
    expect(state.agents.find((agent) => agent.id === originalCoverId)?.buddyRole).toBe('lead');
    expect(state.agents.find((agent) => agent.id === originalLeadId)?.buddyRole).toBe('cover');
    expect(state.runLog.some((entry) => entry.summary.includes('Search buddy roles handed off'))).toBe(true);
  });

  it('uses abstract grenades as squad-spaced opportunities with inventory and friendly-safety gates', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 14, y: 2 })).toBe(true);
    let state = simulation.getState();
    for (let index = 0; index < 24; index += 1) state = simulation.step();
    expect(simulation.setPlayerPosition({ x: 46, y: 27 })).toBe(true);
    for (let index = 0; index < 80 && state.squad.tactic !== 'sweep'; index += 1) state = simulation.step();
    expect(state.squad.tactic).toBe('sweep');

    const firstSeenTick = new Map<number, number>();
    for (let frame = 0; frame < 390 && state.squad.alertState === 'active'; frame += 1) {
      state = simulation.advance(1 / 30);
      for (const grenade of state.grenadeEvents) {
        if (firstSeenTick.has(grenade.id)) continue;
        firstSeenTick.set(grenade.id, state.logicalTick);
        const owner = state.agents.find((agent) => agent.id === grenade.ownerId);
        expect(owner).toBeDefined();
        expect(owner!.grenadeCount).toBe(0);
        for (const friendly of state.agents) {
          if (friendly.id === grenade.ownerId) continue;
          expect(distance(friendly.position, grenade.to)).toBeGreaterThan(2.2);
        }
      }
    }

    expect(firstSeenTick.size).toBeGreaterThan(0);
    const ticks = [...firstSeenTick.values()].sort((a, b) => a - b);
    for (let index = 1; index < ticks.length; index += 1) expect(ticks[index]! - ticks[index - 1]!).toBeGreaterThanOrEqual(18);
  });
});

function distance(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
