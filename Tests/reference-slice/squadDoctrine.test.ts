import { describe, expect, it } from 'vitest';
import { decideSquadDoctrine } from '@willform/example-tactical-wizard';

describe('Tactical Wizard squad doctrine', () => {
  const baseFacts = { contactTicks: 4, stationaryTargetTicks: 0, tacticTicks: 4, boundingPhase: 0, visibleMembers: 1, stalledMembers: 0, lostContactTicks: 0, maneuverCycle: 0, planCompletion: 1, stableContactTicks: 4 } as const;

  it('escalates a completed static bound into a flank only after a settling window', () => {
    expect(decideSquadDoctrine('bounding', { ...baseFacts, boundingPhase: 1, stationaryTargetTicks: 10, tacticTicks: 5 }).tactic).toBe('bounding');
    const decision = decideSquadDoctrine('bounding', { ...baseFacts, boundingPhase: 1, stationaryTargetTicks: 10, tacticTicks: 6 });
    expect(decision.tactic).toBe('flank'); expect(decision.rotateRoles).toBe(true);
  });

  it('requires committed maneuver completion before crossfire, assault and regroup transitions', () => {
    expect(decideSquadDoctrine('flank', { ...baseFacts, tacticTicks: 20, planCompletion: 0 }).tactic).toBe('flank');
    expect(decideSquadDoctrine('flank', { ...baseFacts, tacticTicks: 6, planCompletion: 1 }).tactic).toBe('crossfire');
    expect(decideSquadDoctrine('crossfire', { ...baseFacts, tacticTicks: 6, visibleMembers: 2, planCompletion: 1, stableContactTicks: 3 }).tactic).toBe('assault');
    expect(decideSquadDoctrine('assault', { ...baseFacts, tacticTicks: 8, planCompletion: 1 }).tactic).toBe('regroup');
    expect(decideSquadDoctrine('regroup', { ...baseFacts, tacticTicks: 8, maneuverCycle: 2, planCompletion: 1 }).tactic).toBe('bounding');
  });

  it('breaks the fixed five-stage choreography after repeated static engagement', () => {
    const repeated = {
      ...baseFacts,
      contactTicks: 80,
      stationaryTargetTicks: 64,
      tacticTicks: 8,
      boundingPhase: 2,
      visibleMembers: 3,
      maneuverCycle: 1,
      planCompletion: 1,
      stableContactTicks: 20,
    } as const;

    const fromBounding = decideSquadDoctrine('bounding', repeated);
    expect(fromBounding.tactic).toBe('crossfire');
    expect(fromBounding.reason).toContain('Repeated static contact');

    // The old crossfire -> assault rule becomes valid at tick 6. The adaptive
    // branch must explicitly hold crossfire through that window or the legacy
    // transition will pre-empt the anti-loop behavior before tick 8.
    const confirmationWindow = decideSquadDoctrine('crossfire', { ...repeated, tacticTicks: 6 });
    expect(confirmationWindow.tactic).toBe('crossfire');
    expect(confirmationWindow.reason).toContain('confirmation window');

    const fromCrossfire = decideSquadDoctrine('crossfire', repeated);
    expect(fromCrossfire.tactic).toBe('regroup');
    expect(fromCrossfire.reason).toContain('target state has not changed');

    // The next cycle uses another deterministic branch rather than being
    // permanently locked to the short path.
    expect(decideSquadDoctrine('bounding', { ...repeated, maneuverCycle: 2 }).tactic).toBe('flank');
    expect(decideSquadDoctrine('crossfire', { ...repeated, maneuverCycle: 2 }).tactic).toBe('assault');
  });

  it('does not trigger repetition shortcuts before the engagement is truly stale', () => {
    expect(decideSquadDoctrine('bounding', {
      ...baseFacts,
      boundingPhase: 2,
      stationaryTargetTicks: 20,
      tacticTicks: 8,
      visibleMembers: 3,
      maneuverCycle: 1,
      stableContactTicks: 20,
    }).tactic).toBe('flank');
  });

  it('stops blind assault and enters a sector sweep after sustained visual loss', () => {
    const decision = decideSquadDoctrine('assault', { ...baseFacts, visibleMembers: 0, lostContactTicks: 6, stableContactTicks: 0 });
    expect(decision.tactic).toBe('sweep'); expect(decision.reason).toContain('LKP');
  });

  it('does not cancel a sweep on a one-tick LOS flicker', () => {
    expect(decideSquadDoctrine('sweep', { ...baseFacts, tacticTicks: 8, visibleMembers: 1, stableContactTicks: 1, planCompletion: 0 }).tactic).toBe('sweep');
    expect(decideSquadDoctrine('sweep', { ...baseFacts, tacticTicks: 8, visibleMembers: 1, stableContactTicks: 4, planCompletion: 0 }).tactic).toBe('bounding');
  });

  it('regroups early when multiple members are physically stalled', () => { expect(decideSquadDoctrine('flank', { ...baseFacts, stalledMembers: 2 }).tactic).toBe('regroup'); });
});
