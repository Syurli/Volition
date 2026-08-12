import { describe, expect, it } from 'vitest';
import { decideSquadDoctrine } from '@volition/example-tactical-wizard';

describe('Tactical Wizard squad doctrine', () => {
  const baseFacts = { contactTicks: 4, stationaryTargetTicks: 0, tacticTicks: 4, boundingPhase: 0, visibleMembers: 1, stalledMembers: 0 } as const;

  it('escalates a static bounding pattern into a flank instead of looping forever', () => {
    const decision = decideSquadDoctrine('bounding', { ...baseFacts, stationaryTargetTicks: 20 });
    expect(decision.tactic).toBe('flank');
    expect(decision.rotateRoles).toBe(true);
  });

  it('turns a developed flank into assault and later regroups', () => {
    expect(decideSquadDoctrine('flank', { ...baseFacts, tacticTicks: 16 }).tactic).toBe('assault');
    expect(decideSquadDoctrine('assault', { ...baseFacts, tacticTicks: 22 }).tactic).toBe('regroup');
    expect(decideSquadDoctrine('regroup', { ...baseFacts, tacticTicks: 10 }).tactic).toBe('bounding');
  });

  it('regroups early when multiple members are stalled', () => {
    expect(decideSquadDoctrine('flank', { ...baseFacts, stalledMembers: 2 }).tactic).toBe('regroup');
  });
});
