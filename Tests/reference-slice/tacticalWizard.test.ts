import { describe, expect, it } from 'vitest';
import { AgentRuntime, UtilityDecisionPolicy, type DecisionCandidate, type DecisionInput } from '@willform/core';
import { assertValidProjectConfig } from '@willform/schema';
import {
  TACTICAL_WIZARD_AGENT_ID,
  fixtureContext,
  runTacticalWizardFixture,
  tacticalWizardProjectConfig,
} from '@willform/example-tactical-wizard';

describe('Tactical Wizard Reference Slice 01', () => {
  it('validates the portable generic rifle fixture', () => {
    expect(() => assertValidProjectConfig(tacticalWizardProjectConfig)).not.toThrow();
  });

  it('replays Patrol → Investigate → Engage → Search → Patrol deterministically', () => {
    const first = runTacticalWizardFixture(1337);
    const second = runTacticalWizardFixture(1337);
    expect(first.selectedIntents).toEqual([
      'patrol',
      'investigate',
      'investigate',
      'engage',
      'engage',
      'search',
      'search',
      'search',
      'patrol',
    ]);
    expect(second.traces).toEqual(first.traces);
  });

  it('does not attach a hidden target position to a lost-visual observation', () => {
    const run = runTacticalWizardFixture();
    const lostTrace = run.traces.find((trace) => trace.logicalTick === 5)!;
    const lostObservation = lostTrace.observations.find((observation) => observation.sourceStimulusId === 'visual:player:5-lost')!;
    expect(lostObservation.position).toBeUndefined();
    expect(lostTrace.belief.source).toBe('memory');
    expect(lostTrace.belief.estimatedPosition).toEqual({ x: 8, y: 0, z: 8 });
  });

  it('records candidate rejection, intent replacement, action cancellation and host results in Trace', () => {
    const run = runTacticalWizardFixture();
    const engage = run.traces.find((trace) => trace.logicalTick === 3)!;
    const search = run.traces.find((trace) => trace.logicalTick === 5)!;
    expect(engage.candidates.find((candidate) => candidate.intent.id === 'engage')?.eligible).toBe(true);
    expect(engage.candidates.find((candidate) => candidate.intent.id === 'reload')?.rejectedReason).toBe('weapon_not_empty');
    expect(search.cancelledIntent?.reason).toBe('replaced_by:search');
    expect(search.actionResults.some((result) => result.status === 'cancelled')).toBe(true);
  });

  it('sorts stimulus sequence before cognition so host array order cannot change the decision', () => {
    const policy = new UtilityDecisionPolicy('order-test', (input: DecisionInput): readonly DecisionCandidate[] => [{
      id: 'candidate:patrol',
      intent: { id: 'patrol', behavior: { id: 'host.behavior.patrol' }, reason: 'fallback' },
      score: 1,
      eligible: true,
      reason: 'fallback',
    }]);
    const makeRuntime = () => new AgentRuntime({
      agentId: TACTICAL_WIZARD_AGENT_ID,
      policy,
      actionPlanner: () => [{ kind: 'idle', intentId: 'patrol' }],
      memoryDecayPerSecond: 0.1,
      forgetBelowConfidence: 0.01,
    });
    const stimuli = [
      { id: 'noise-b', sequence: 2, logicalTick: 1, kind: 'noise' as const, sourceId: 'player', perceivedPosition: { x: 2, y: 0, z: 2 }, intensity: 0.5 },
      { id: 'noise-a', sequence: 1, logicalTick: 1, kind: 'noise' as const, sourceId: 'player', perceivedPosition: { x: 1, y: 0, z: 1 }, intensity: 0.5 },
    ];
    const left = makeRuntime();
    const right = makeRuntime();
    left.tick({ tick: { logicalTick: 1, deltaSeconds: 1, seed: 9 }, context: fixtureContext(1), stimuli });
    right.tick({ tick: { logicalTick: 1, deltaSeconds: 1, seed: 9 }, context: fixtureContext(1), stimuli: [...stimuli].reverse() });
    expect(right.getTrace()).toEqual(left.getTrace());
  });

  it('reset clears memory, action and trace state', () => {
    const runtime = makeTestRuntime();
    runtime.tick({ tick: { logicalTick: 1, deltaSeconds: 1, seed: 1 }, context: fixtureContext(1), stimuli: [] });
    expect(runtime.getTrace()).toHaveLength(1);
    runtime.reset();
    expect(runtime.getTrace()).toEqual([]);
    expect(() => runtime.getSnapshot()).toThrow('has not ticked');
  });
});

function makeTestRuntime(): AgentRuntime {
  const policy = new UtilityDecisionPolicy('reset-test', (): readonly DecisionCandidate[] => [{
    id: 'candidate:patrol',
    intent: { id: 'patrol', behavior: { id: 'host.behavior.patrol' }, reason: 'fallback' },
    score: 1,
    eligible: true,
    reason: 'fallback',
  }]);
  return new AgentRuntime({
    agentId: TACTICAL_WIZARD_AGENT_ID,
    policy,
    actionPlanner: () => [{ kind: 'idle', intentId: 'patrol' }],
    memoryDecayPerSecond: 0.1,
    forgetBelowConfidence: 0.01,
  });
}
