import { describe, expect, it } from 'vitest';
import { evaluatePressureUtilities } from '../../Apps/Workbench/src/simulation/incomingFirePressure';
import { TacticalWizardAdaptiveSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardAdaptive';
import { DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE } from '../../Apps/Workbench/src/simulation/tacticalWizardProfiles';

describe('IAUS Tactical Integration R2', () => {
  it('prices current-plan value, switching cost and recent flank repetition into IAUS ranking', () => {
    const baseInput = {
      band: 'suppressed' as const,
      pressure: 0.68,
      pressuredAgentId: 'alpha',
      livingCount: 3,
      pressuredCount: 1,
      currentTactic: 'crossfire',
      currentPlanProgress: 0.9,
      safeFireLanes: 2,
      geometryQuality: 0.95,
      currentTacticTicks: 12,
      profile: DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE,
      roll: 0.5,
    };
    const fresh = evaluatePressureUtilities(baseInput);
    const repeated = evaluatePressureUtilities({
      ...baseInput,
      recentAction: 'flank',
      recentActionAgeTicks: 4,
      recentGeometryNovelty: 0.05,
    });

    expect(repeated.selectedId).toBe('trade_fire');
    const freshFlank = fresh.candidates.find((entry) => entry.candidateId === 'flank')!;
    const repeatedFlank = repeated.candidates.find((entry) => entry.candidateId === 'flank')!;
    expect(repeatedFlank.score).toBeLessThan(freshFlank.score);
    expect(repeatedFlank.axes.some((axis) => axis.axisId === 'repeat_geometry_novelty')).toBe(true);
    expect(repeated.candidates.find((entry) => entry.candidateId === 'trade_fire')?.axes.some((axis) => axis.axisId === 'current_plan_value')).toBe(true);
  });

  it('still allows pinned pressure to overcome a valuable current plan', () => {
    const evaluation = evaluatePressureUtilities({
      band: 'pinned',
      pressure: 0.97,
      pressuredAgentId: 'alpha',
      livingCount: 3,
      pressuredCount: 2,
      currentTactic: 'crossfire',
      currentPlanProgress: 0.92,
      safeFireLanes: 2,
      geometryQuality: 0.96,
      currentTacticTicks: 16,
      profile: DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE,
      roll: 0.5,
    });
    expect(evaluation.selectedId).not.toBe('trade_fire');
    expect(['reposition', 'flank', 'regroup']).toContain(evaluation.selectedId);
  });

  it('keeps getState observational, preserves one canonical flanker and rejects zero-displacement flank geometry', () => {
    const simulation = new TacticalWizardAdaptiveSimulation();
    simulation.setCombatProfile({
      ...DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE,
      utilityFlankWeight: 1.75,
      utilityTradeFireWeight: 0.25,
      utilityRepositionWeight: 0.25,
      utilityRegroupWeight: 0.25,
    });
    expect(simulation.setPlayerPosition({ x: 6, y: 2 })).toBe(true);
    for (let index = 0; index < 4; index += 1) simulation.step();
    expect(simulation.getState().squad.alertState).toBe('active');

    expect(simulation.injectIncomingFireForTest('twr:rifle-squad:alpha', { x: 6, y: 2 })).toBe(true);
    expect(simulation.injectIncomingFireForTest('twr:rifle-squad:alpha', { x: 6, y: 2 })).toBe(true);
    const state = simulation.getState();
    const trace = state.adaptiveCombat.lastPlannerTrace;
    expect(trace).not.toBeNull();
    expect(trace!.attempts.length).toBeGreaterThan(0);

    const acceptedFlank = trace!.attempts.find((entry) => entry.candidateId === 'flank' && entry.accepted);
    if (acceptedFlank !== undefined) {
      expect(acceptedFlank.displacement).not.toBeNull();
      expect(acceptedFlank.displacement!).toBeGreaterThanOrEqual(2.75);
      expect(state.agents.filter((agent) => agent.alive && agent.role === 'flanker' && agent.task === 'flank_to_cover')).toHaveLength(1);
      expect(state.adaptiveCombat.activeResponseLease?.maneuverAgentId).toBe(state.agents.find((agent) => agent.role === 'flanker')?.id);
    }
    for (const attempt of trace!.attempts.filter((entry) => entry.candidateId === 'flank' && entry.accepted)) {
      expect(attempt.target).not.toBeNull();
      expect(attempt.displacement ?? 0).toBeGreaterThanOrEqual(2.75);
    }

    const beforeReads = JSON.stringify({
      agents: state.agents.map((agent) => ({ id: agent.id, role: agent.role, task: agent.task, target: agent.tacticalTarget })),
      active: state.adaptiveCombat.activeResponseLease,
      responses: state.adaptiveCombat.pressureResponses,
      rejections: state.adaptiveCombat.plannerRejections,
      logLength: state.runLog.length,
    });
    for (let index = 0; index < 20; index += 1) simulation.getState();
    const after = simulation.getState();
    const afterReads = JSON.stringify({
      agents: after.agents.map((agent) => ({ id: agent.id, role: agent.role, task: agent.task, target: agent.tacticalTarget })),
      active: after.adaptiveCombat.activeResponseLease,
      responses: after.adaptiveCombat.pressureResponses,
      rejections: after.adaptiveCombat.plannerRejections,
      logLength: after.runLog.length,
    });
    expect(afterReads).toBe(beforeReads);
  });

  it('separates active pressure response from the last IAUS decision and gives confirmed visual attention priority', () => {
    const simulation = new TacticalWizardAdaptiveSimulation();
    expect(simulation.setPlayerPosition({ x: 6, y: 2 })).toBe(true);
    for (let index = 0; index < 4; index += 1) simulation.step();
    let state = simulation.getState();

    const visibleIds = new Set(state.agents.filter((agent) => agent.targetVisible).map((agent) => agent.id));
    expect(visibleIds.size).toBeGreaterThan(0);
    for (const attention of state.perceptionIntegration.attention.filter((entry) => visibleIds.has(entry.agentId))) {
      expect(attention.mode).toBe('track_visual');
      expect(attention.anchor).not.toBeNull();
      expect(attention.anchor!.x).toBeCloseTo(state.contactTrack.lastConfirmedPosition?.x ?? state.player.x);
      expect(attention.anchor!.y).toBeCloseTo(state.contactTrack.lastConfirmedPosition?.y ?? state.player.y);
    }

    expect(simulation.injectIncomingFireForTest('twr:rifle-squad:alpha', { x: 6, y: 2 })).toBe(true);
    expect(simulation.injectIncomingFireForTest('twr:rifle-squad:alpha', { x: 6, y: 2 })).toBe(true);
    state = simulation.getState();
    expect(state.adaptiveCombat.lastTacticalAction).not.toBe('none');
    simulation.setEnemiesEnabled(false);
    state = simulation.getState();
    expect(state.adaptiveCombat.activeResponseLease).toBeNull();
    expect(state.adaptiveCombat.tacticalAction).toBe('none');
    expect(state.adaptiveCombat.lastTacticalAction).not.toBe('none');
    expect(state.adaptiveCombat.lastTacticalActionTick).not.toBeNull();
  });
});
