import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulation';
import { TacticalWizardAdaptiveSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardAdaptive';

describe('Recovery authority and IAUS planner transactions R3', () => {
  it('repairs a downed rescuer before a Safety pause can retain stale execution ownership', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true);
    let state = simulation.getState();
    const originalRescuer = state.recovery.rescuerId;
    expect(originalRescuer).not.toBeNull();
    const internal = simulation as unknown as { recoverySafetyDecision: 'pause'; recoveryDeferredUntilTick: number };
    internal.recoverySafetyDecision = 'pause'; internal.recoveryDeferredUntilTick = state.logicalTick + 8;
    expect(simulation.setAgentVitals(originalRescuer!, { health: 0 })).toBe(true);
    state = simulation.getState();
    if (state.leadership.livingCount > 0) { expect(state.recovery.rescuerId).not.toBe(originalRescuer); expect(state.recovery.rescuerId === null || state.agents.find((agent) => agent.id === state.recovery.rescuerId)?.alive).toBe(true); }
  });

  it('never retains Recovery ownership after the entire element is down', () => {
    const simulation = new TacticalWizardSimulation();
    for (const id of ['twr:rifle-squad:alpha', 'twr:rifle-squad:bravo', 'twr:rifle-squad:charlie']) expect(simulation.setAgentVitals(id, { health: 0 })).toBe(true);
    const state = simulation.getState();
    expect(state.leadership.livingCount).toBe(0); expect(state.recovery.phase).toBe('none'); expect(state.recoverySafety.active).toBe(false); expect(state.dynamicRecovery.active).toBe(false); expect(state.dynamicRecovery.tacticalPlanningSuspended).toBe(false);
  });

  it('does not blacklist a safe treatment side when only security geometry fails', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true);
    const before = simulation.getState(); expect(before.dynamicRecovery.treatmentPoint).not.toBeNull(); expect(before.recovery.covererId).not.toBeNull();
    const internal = simulation as unknown as { replanRecoveryGeometry: (state: ReturnType<TacticalWizardSimulation['getState']>, reason: string, count: boolean) => boolean };
    internal.replanRecoveryGeometry(before, 'security_lost_los', true);
    expect(simulation.getState().dynamicRecovery.treatmentPoint).toEqual(before.dynamicRecovery.treatmentPoint);
  });

  it('allows covered treatment to continue under pressured residual history', () => {
    const simulation = new TacticalWizardSimulation(); expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true); const state = simulation.getState();
    const internal = simulation as unknown as { recoveryPlan: { phase: 'establish_cover' | 'approach' | 'treat'; covererId: string | null; treatmentExposed: boolean; pathExposureCells: number } | null; recoveryPressure: number; recoverySafetyDecision: 'none' | 'continue' | 'pause' | 'reposition' | 'abort'; recoveryLastEvaluatedTick: number; evaluateRecoverySafety: (state: ReturnType<TacticalWizardSimulation['getState']>) => void };
    expect(internal.recoveryPlan).not.toBeNull(); internal.recoveryPlan!.covererId = null; internal.recoveryPlan!.phase = 'treat'; internal.recoveryPlan!.treatmentExposed = false; internal.recoveryPlan!.pathExposureCells = 0; internal.recoveryPressure = 0.62; internal.recoverySafetyDecision = 'pause'; internal.recoveryLastEvaluatedTick = -1; internal.evaluateRecoverySafety(state); expect(internal.recoverySafetyDecision).toBe('continue');
  });

  it('rolls back every IAUS preview until the winner reaches the commit point', () => {
    const simulation = new TacticalWizardAdaptiveSimulation(); expect(simulation.setPlayerPosition({ x: 6, y: 2 })).toBe(true); for (let index = 0; index < 4; index += 1) simulation.step(); const before = simulation.getState(); expect(before.squad.alertState).toBe('active'); const pressuredAgent = before.agents.find((agent) => agent.alive)!.id;
    const internal = simulation as unknown as { tryCommitPressureCandidate: (state: typeof before, action: 'flank', agentId: string, score: number, reason: string) => unknown };
    const signature = (state: typeof before) => JSON.stringify({ tactic: state.squad.tactic, planRevision: state.coordination.planRevision, agents: state.agents.map((agent) => ({ id: agent.id, role: agent.role, task: agent.task, target: agent.tacticalTarget })), logLength: state.runLog.length });
    const snapshot = signature(before); internal.tryCommitPressureCandidate(before, 'flank', pressuredAgent, 1, 'transaction-test'); expect(signature(simulation.getState())).toBe(snapshot);
  });

  it('commits local reposition without converting the whole squad into regroup', () => {
    const simulation = new TacticalWizardAdaptiveSimulation(); expect(simulation.setPlayerPosition({ x: 6, y: 2 })).toBe(true); for (let index = 0; index < 4; index += 1) simulation.step(); const before = simulation.getState(); const pressuredAgent = before.agents.find((agent) => agent.alive && agent.id !== before.squad.suppressorId)?.id ?? before.agents.find((agent) => agent.alive)!.id;
    const internal = simulation as unknown as { tryCommitPressureCandidate: (state: typeof before, action: 'reposition', agentId: string, score: number, reason: string) => { accepted: boolean; expectedTactic: string | null; target: { x: number; y: number } | null }; commitPressureLease: (state: typeof before, attempt: unknown, agentId: string, reason: string) => void };
    const attempt = internal.tryCommitPressureCandidate(before, 'reposition', pressuredAgent, 1, 'local-reposition-test'); expect(attempt.accepted).toBe(true); expect(attempt.expectedTactic).toBe(before.squad.tactic); internal.commitPressureLease(before, attempt, pressuredAgent, 'local-reposition-test'); const after = simulation.getState(); expect(after.squad.tactic).toBe(before.squad.tactic); expect(after.adaptiveCombat.activeResponseLease?.action).toBe('reposition'); expect(after.adaptiveCombat.activeResponseLease?.expectedTactic).toBe(before.squad.tactic); expect(after.agents.find((agent) => agent.id === pressuredAgent)?.tacticalTarget).toEqual(attempt.target);
  });
});
