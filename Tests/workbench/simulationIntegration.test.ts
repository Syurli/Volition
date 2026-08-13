import { describe, expect, it } from 'vitest';
import { hasLineOfSight, isWalkable, type GridPoint } from '../../Apps/Workbench/src/simulation/navigation';
import { tacticalWizardNavigationGrid, tacticalWizardTestMap } from '../../Apps/Workbench/src/simulation/tacticalWizardTestMapV7';
import {
  TacticalWizardSimulation,
  shouldRetainWoundedSupport,
} from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationIntegrated';

describe('Tactical Wizard integrated combat stability', () => {
  it('keeps wounded mutual-support ownership until the buddy is stably inside the release band', () => {
    expect(shouldRetainWoundedSupport({
      healthRatio: 0.2,
      buddyDistance: 3,
      logicalTick: 20,
      releaseCandidateSinceTick: null,
    })).toEqual({ retain: true, releaseCandidateSinceTick: null });

    const enteredReleaseBand = shouldRetainWoundedSupport({
      healthRatio: 0.42,
      buddyDistance: 7.2,
      logicalTick: 30,
      releaseCandidateSinceTick: null,
    });
    expect(enteredReleaseBand).toEqual({ retain: true, releaseCandidateSinceTick: 30 });

    expect(shouldRetainWoundedSupport({
      healthRatio: 0.42,
      buddyDistance: 7.2,
      logicalTick: 33,
      releaseCandidateSinceTick: enteredReleaseBand.releaseCandidateSinceTick,
    }).retain).toBe(true);

    expect(shouldRetainWoundedSupport({
      healthRatio: 0.42,
      buddyDistance: 7.2,
      logicalTick: 34,
      releaseCandidateSinceTick: enteredReleaseBand.releaseCandidateSinceTick,
    }).retain).toBe(false);
  });

  it('keeps one acoustic estimate per listener during continuous fire instead of rotating the guess every tick', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 11.15, y: 17.66 })).toBe(true);
    expect(simulation.playerFireAt({ x: 31, y: 17.66 })).toBe(true);
    simulation.advance(0.25);

    const internals = simulation as unknown as {
      acousticEstimateByListener: Map<string, { readonly x: number; readonly y: number; readonly z: number }>;
    };
    const first = new Map([...internals.acousticEstimateByListener.entries()].map(([id, point]) => [id, { ...point }]));
    expect(first.size).toBeGreaterThan(0);

    for (let shot = 0; shot < 4; shot += 1) {
      expect(simulation.playerFireAt({ x: 31, y: 17.66 })).toBe(true);
      simulation.advance(0.25);
    }

    for (const [id, point] of first) expect(internals.acousticEstimateByListener.get(id)).toEqual(point);
  });

  it('classifies a 22..26-cell rifle pass as near-miss evidence and preserves the existing dodge response', () => {
    const simulation = new TacticalWizardSimulation();
    const setup = findExtendedNearMissSetup(simulation);
    expect(setup).not.toBeNull();
    if (setup === null) return;

    expect(simulation.setPlayerPosition(setup.origin)).toBe(true);
    const before = simulation.getState();
    const beforeAgent = before.agents.find((agent) => agent.id === setup.agentId)!;
    const beforeNearMisses = before.threatAwareness.evidenceCounts.near_miss;

    expect(simulation.playerFireAt(setup.aimPoint)).toBe(true);
    const after = simulation.getState();
    const afterAgent = after.agents.find((agent) => agent.id === setup.agentId)!;

    expect(afterAgent.health).toBe(beforeAgent.health);
    expect(after.threatAwareness.evidenceCounts.near_miss).toBeGreaterThan(beforeNearMisses);
    expect(afterAgent.reactionState).toBe('dodge');
  });

  it('rate-limits body facing so tactical target churn cannot create one-frame 180-degree flashes', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 11.15, y: 17.66 })).toBe(true);
    let state = simulation.getState();
    let previous = new Map(state.agents.map((agent) => [agent.id, { ...agent.facing }]));

    for (let frame = 0; frame < 120; frame += 1) {
      if (frame % 15 === 0) simulation.playerFireAt({ x: 31, y: 17.66 });
      state = simulation.advance(1 / 30);
      for (const agent of state.agents) {
        const prior = previous.get(agent.id);
        if (prior === undefined) continue;
        expect(angleDegrees(prior, agent.facing)).toBeLessThanOrEqual(16.25);
      }
      previous = new Map(state.agents.map((agent) => [agent.id, { ...agent.facing }]));
    }
  });
});

function findExtendedNearMissSetup(simulation: TacticalWizardSimulation): { readonly agentId: string; readonly origin: GridPoint; readonly aimPoint: GridPoint } | null {
  const state = simulation.getState();
  for (const agent of state.agents) {
    for (let y = 0; y < tacticalWizardTestMap.height; y += 1) {
      for (let x = 0; x < tacticalWizardTestMap.width; x += 1) {
        const origin = { x, y };
        if (!isWalkable(tacticalWizardNavigationGrid, origin)) continue;
        const range = distance(origin, agent.position);
        if (range < 22.5 || range > 25.5) continue;
        if (!hasLineOfSight(tacticalWizardNavigationGrid, origin, toCell(agent.position))) continue;
        const toward = normalize({ x: agent.position.x - origin.x, y: agent.position.y - origin.y });
        const perpendicular = { x: -toward.y, y: toward.x };
        const aimPoint = {
          x: agent.position.x + perpendicular.x,
          y: agent.position.y + perpendicular.y,
        };
        return { agentId: agent.id, origin, aimPoint };
      }
    }
  }
  return null;
}

function toCell(point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(tacticalWizardTestMap.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(tacticalWizardTestMap.height - 1, Math.round(point.y))),
  };
}

function angleDegrees(a: GridPoint, b: GridPoint): number {
  const left = normalize(a);
  const right = normalize(b);
  return Math.acos(Math.max(-1, Math.min(1, left.x * right.x + left.y * right.y))) * 180 / Math.PI;
}

function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-9 ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
}

function distance(a: GridPoint, b: GridPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
