import { describe, expect, it } from 'vitest';
import { hasLineOfSight, isWalkable, type GridPoint } from '../../Apps/Workbench/src/simulation/navigation';
import { tacticalWizardNavigationGrid } from '../../Apps/Workbench/src/simulation/tacticalWizardTestMapV7';
import {
  TacticalWizardSimulation,
  classifyAcousticEvidence,
  selectClosePressureTarget,
  selectTacticalOpportunity,
  shouldProtectCommittedManeuver,
} from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationThreatAuthority';

describe('Tactical Wizard threat association / tactical opportunity authority', () => {
  it('associates gunfire with an already confirmed hostile instead of opening another investigation', () => {
    expect(classifyAcousticEvidence({
      hasConfirmedVisual: true,
      alertActive: true,
      acousticTarget: { x: 20, y: 20 },
      lastKnownPosition: { x: 20, y: 20 },
    })).toBe('same_contact');

    expect(classifyAcousticEvidence({
      hasConfirmedVisual: false,
      alertActive: true,
      acousticTarget: { x: 23, y: 21 },
      lastKnownPosition: { x: 20, y: 20 },
    })).toBe('search_bias');

    expect(classifyAcousticEvidence({
      hasConfirmedVisual: false,
      alertActive: true,
      acousticTarget: { x: 40, y: 35 },
      lastKnownPosition: { x: 20, y: 20 },
    })).toBe('secondary_cue');

    expect(classifyAcousticEvidence({
      hasConfirmedVisual: false,
      alertActive: false,
      acousticTarget: { x: 40, y: 35 },
      lastKnownPosition: null,
    })).toBe('investigation');
  });

  it('protects committed flank/crossfire/assault through a short LOS flicker while live visual always blocks sweep', () => {
    expect(shouldProtectCommittedManeuver('bounding', 3, false)).toBe(false);
    expect(shouldProtectCommittedManeuver('flank', 3, false)).toBe(true);
    expect(shouldProtectCommittedManeuver('crossfire', 7, false)).toBe(true);
    expect(shouldProtectCommittedManeuver('assault', 8, false)).toBe(false);
    expect(shouldProtectCommittedManeuver('bounding', 3, true)).toBe(true);
  });

  it('selects flank and assault from physical tactical opportunities instead of waiting only on stationary-target timeouts', () => {
    expect(selectTacticalOpportunity({
      currentTactic: 'bounding', tacticTicks: 6, boundingPhase: 1, planCompletion: 1,
      stableContactTicks: 3, lostContactTicks: 0, visibleMembers: 1, safeFireLanes: 1,
      nearestThreatDistance: 14, rescueActive: false,
    })).toBe('flank');

    expect(selectTacticalOpportunity({
      currentTactic: 'crossfire', tacticTicks: 6, boundingPhase: 2, planCompletion: 1,
      stableContactTicks: 4, lostContactTicks: 0, visibleMembers: 2, safeFireLanes: 1,
      nearestThreatDistance: 12, rescueActive: false,
    })).toBe('assault');

    expect(selectTacticalOpportunity({
      currentTactic: 'crossfire', tacticTicks: 6, boundingPhase: 2, planCompletion: 1,
      stableContactTicks: 4, lostContactTicks: 1, visibleMembers: 2, safeFireLanes: 1,
      nearestThreatDistance: 12, rescueActive: false,
    })).toBeNull();
  });

  it('chooses a final close-pressure point near the visible player without occupying the player coordinate', () => {
    const player = { x: 18, y: 18 };
    const target = selectClosePressureTarget({ x: 18, y: 22 }, player);
    expect(target).not.toBeNull();
    const targetCell = toCell(target!);
    expect(isWalkable(tacticalWizardNavigationGrid, targetCell)).toBe(true);
    expect(hasLineOfSight(tacticalWizardNavigationGrid, targetCell, toCell(player))).toBe(true);
    expect(distance(target!, player)).toBeGreaterThanOrEqual(0.9);
    expect(distance(target!, player)).toBeLessThanOrEqual(1.4);
  });

  it('keeps a visible rifle report correlated with combat and exposes separate attention telemetry', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 8, y: 2 })).toBe(true);
    simulation.advance(0.25);

    let state = simulation.getState();
    expect(state.agents.some((agent) => agent.targetVisible)).toBe(true);

    simulation.playerFireAt({ x: 18, y: 2 });
    simulation.advance(0.25);
    state = simulation.getState();

    expect(state.threatAuthority.correlatedGunshots).toBeGreaterThanOrEqual(1);
    expect(state.perceptionIntegration.acousticInvestigationActive).toBe(false);
    expect(state.threatAuthority.bodyAttentionSeparated).toBe(true);
    expect(state.threatAuthority.attentionFacing).toHaveLength(3);
  });
});

function toCell(point: GridPoint): GridPoint {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
