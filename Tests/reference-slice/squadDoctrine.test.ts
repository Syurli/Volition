import { describe, expect, it } from 'vitest';
import { decideSquadDoctrine } from '@volition/example-tactical-wizard';

describe('Tactical Wizard squad doctrine', () => {
  const baseFacts = { contactTicks: 4, stationaryTargetTicks: 0, tacticTicks: 4, boundingPhase: 0, visibleMembers: 1, stalledMembers: 0, lostContactTicks: 0, maneuverCycle: 0 } as const;

  it('escalates a static bounding pattern into a flank instead of looping forever', () => {
    const decision = decideSquadDoctrine('bounding', { ...baseFacts, boundingPhase: 1, stationaryTargetTicks: 10 });
    expect(decision.tactic).toBe('flank');
    expect(decision.rotateRoles).toBe(true);
  });

  it('requires a crossfire phase before assault and then regroups', () => {
    expect(decideSquadDoctrine('flank', { ...baseFacts, tacticTicks: 12 }).tactic).toBe('crossfire');
    expect(decideSquadDoctrine('crossfire', { ...baseFacts, tacticTicks: 14, visibleMembers: 2 }).tactic).toBe('assault');
    expect(decideSquadDoctrine('assault', { ...baseFacts, tacticTicks: 16 }).tactic).toBe('regroup');
    expect(decideSquadDoctrine('regroup', { ...baseFacts, tacticTicks: 12, maneuverCycle: 2 }).tactic).toBe('bounding');
  });

  it('stops blind assault and enters a sector sweep after sustained visual loss', () => {
    const decision = decideSquadDoctrine('assault', { ...baseFacts, visibleMembers: 0, lostContactTicks: 5 });
    expect(decision.tactic).toBe('sweep');
    expect(decision.reason).toContain('Last Known Position');
  });

  it('regroups early when multiple members are stalled', () => {
    expect(decideSquadDoctrine('flank', { ...baseFacts, stalledMembers: 2 }).tactic).toBe('regroup');
  });
});
