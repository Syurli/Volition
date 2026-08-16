import { describe, expect, it } from 'vitest';
import { evaluateIaus } from '../../Apps/Workbench/src/simulation/iausUtility';
import { choosePressureProposal, evaluatePressureUtilities } from '../../Apps/Workbench/src/simulation/incomingFirePressure';
import {
  DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE,
  tacticalWizardCombatProfileFromExtensions,
  tacticalWizardProfileExtensions,
} from '../../Apps/Workbench/src/simulation/tacticalWizardProfiles';

describe('IAUS utility reasoner', () => {
  it('keeps hard preconditions outside utility score competition', () => {
    const evaluation = evaluateIaus([
      { id: 'legal', weight: 1, available: true, axes: [{ id: 'fit', input: 0.6, weight: 1, curve: { kind: 'linear' } }] },
      { id: 'illegal', weight: 2, available: false, unavailableReason: 'missing capability', axes: [{ id: 'fit', input: 1, weight: 1, curve: { kind: 'linear' } }] },
    ] as const);
    expect(evaluation.selectedId).toBe('legal');
    expect(evaluation.candidates.find((entry) => entry.candidateId === 'illegal')?.score).toBe(0);
  });

  it('uses IAUS to rank pressure opportunities without bypassing human doctrine gates', () => {
    const profile = {
      ...DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE,
      utilityFlankWeight: 1.75,
      utilityRepositionWeight: 0.25,
      utilityTradeFireWeight: 0.4,
      utilityRegroupWeight: 0.4,
    };
    const proposal = choosePressureProposal({
      band: 'suppressed',
      pressure: 0.76,
      pressuredAgentId: 'alpha',
      livingCount: 3,
      pressuredCount: 1,
      currentTactic: 'bounding',
      profile,
      roll: 0.5,
    });
    expect(proposal.action).toBe('flank');
    expect(proposal.reason).toContain('IAUS selected flank');
    expect(proposal.utility.candidates.find((entry) => entry.candidateId === 'assault')?.available).toBe(false);
  });

  it('does not allow a flank when no second living member exists', () => {
    const profile = { ...DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE, utilityFlankWeight: 1.75 };
    const evaluation = evaluatePressureUtilities({
      band: 'pinned', pressure: 0.95, pressuredAgentId: 'alpha', livingCount: 1, pressuredCount: 1,
      currentTactic: 'bounding', profile, roll: 0.5,
    });
    expect(evaluation.candidates.find((entry) => entry.candidateId === 'flank')?.available).toBe(false);
    expect(evaluation.selectedId).not.toBe('flank');
  });

  it('keeps non-human tactical style through candidate availability', () => {
    const feral = { ...DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE, mindset: 'feral' as const };
    const machine = { ...DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE, mindset: 'machine' as const };
    const feralEval = evaluatePressureUtilities({ band: 'suppressed', pressure: 0.74, pressuredAgentId: 'a', livingCount: 3, pressuredCount: 1, currentTactic: 'bounding', profile: feral, roll: 0.4 });
    const machineEval = evaluatePressureUtilities({ band: 'pinned', pressure: 0.92, pressuredAgentId: 'a', livingCount: 3, pressuredCount: 2, currentTactic: 'bounding', profile: machine, roll: 0.4 });
    expect(feralEval.candidates.filter((entry) => entry.available).map((entry) => entry.candidateId).sort()).toEqual(['assault', 'flank']);
    expect(machineEval.candidates.filter((entry) => entry.available).map((entry) => entry.candidateId).sort()).toEqual(['reposition', 'trade_fire']);
  });

  it('round-trips Tactical Wizard IAUS candidate weights through project extensions', () => {
    const profile = { ...DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE, utilityTradeFireWeight: 0.73, utilityFlankWeight: 1.44 };
    const restored = tacticalWizardCombatProfileFromExtensions(tacticalWizardProfileExtensions(profile));
    expect(restored.utilityTradeFireWeight).toBeCloseTo(0.73);
    expect(restored.utilityFlankWeight).toBeCloseTo(1.44);
  });
});
