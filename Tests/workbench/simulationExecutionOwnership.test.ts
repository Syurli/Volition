import { describe, expect, it } from 'vitest';
import type { GridPoint } from '../../Apps/Workbench/src/simulation/navigation';
import { TacticalWizardSimulation as CurrentSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationCurrent';
import { TacticalWizardSimulation as WorkbenchSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV4';
import {
  reactionExecutionPriority,
  resolveExecutionOwnership,
  resolveExecutionTarget,
  type ExecutionOwnershipInput,
} from '../../Apps/Workbench/src/simulation/tacticalWizardExecutionOwnership';

const POSITION = { x: 4, y: 4 };
const TACTICAL = { x: 16, y: 11 };
const SUPPLY = { x: 23, y: 31 };

describe('Tactical Wizard production execution ownership', () => {
  it('uses composition at the Workbench boundary instead of inheriting the historical Current/Vxx stack', () => {
    const simulation = new WorkbenchSimulation();
    expect(simulation).not.toBeInstanceOf(CurrentSimulation);
    const state = simulation.getState();
    expect(state.executionAuthority.architecture).toBe('composed_domains');
    expect(state.executionAuthority.finalMovementAuthority).toBe('execution_resolver');
    expect(state.executionAuthority.legacyHostPolicy).toBe('compatibility_substrate');
    expect(state.executionAuthority.contracts).toHaveLength(state.agents.length);
  });

  it('keeps committed crossfire movement above an urgent logistics destination', () => {
    const input = baseInput({
      task: 'crossfire',
      tactic: 'crossfire',
      tacticalTarget: TACTICAL,
      logisticsTask: 'resupply_ammo',
      resupplyTarget: SUPPLY,
    });
    const decision = resolveExecutionOwnership(input);
    expect(decision.owner).toBe('direct_combat');
    expect(decision.priority).toBe(70);
    expect(resolveExecutionTarget({ ...input, position: POSITION, legacyTarget: SUPPLY }, decision)).toEqual(TACTICAL);
  });

  it('does not promote grenade suppression into the old generic reaction-80 commitment', () => {
    expect(reactionExecutionPriority('grenade_suppress')).toBe(20);
    expect(reactionExecutionPriority('stunned')).toBe(80);

    const input = baseInput({
      task: 'flank_to_cover',
      tactic: 'flank',
      tacticalTarget: { x: 23, y: 17 },
      reactionState: 'grenade_suppress',
      reactionTarget: POSITION,
    });
    const decision = resolveExecutionOwnership(input);
    expect(decision.owner).toBe('direct_combat');
    expect(decision.priority).toBe(70);
  });

  it('still lets hard reactions interrupt direct combat', () => {
    const reactionTarget = { x: 3, y: 3 };
    const input = baseInput({
      task: 'flank_to_cover',
      tactic: 'flank',
      tacticalTarget: TACTICAL,
      reactionState: 'stunned',
      reactionTarget,
    });
    const decision = resolveExecutionOwnership(input);
    expect(decision.owner).toBe('reaction');
    expect(decision.priority).toBe(80);
    expect(resolveExecutionTarget({ ...input, position: POSITION, legacyTarget: SUPPLY }, decision)).toEqual(reactionTarget);
  });

  it('preserves recovery ownership above soft reactions and logistics', () => {
    const input = baseInput({
      task: 'regroup',
      tactic: 'regroup',
      tacticalTarget: TACTICAL,
      reactionState: 'smoke_retreat',
      reactionTarget: { x: 1, y: 1 },
      logisticsTask: 'resupply_mixed',
      resupplyTarget: SUPPLY,
      recoveryRole: 'rescuer',
    });
    const decision = resolveExecutionOwnership(input);
    expect(decision.owner).toBe('recovery_rescue');
    expect(decision.priority).toBe(95);
  });

  it('keeps search contracts above logistics without inventing a new tactic', () => {
    const input = baseInput({
      task: 'search_sector',
      tactic: 'sweep',
      tacticalTarget: { x: 12, y: 9 },
      logisticsTask: 'resupply_ammo',
      resupplyTarget: SUPPLY,
    });
    const decision = resolveExecutionOwnership(input);
    expect(decision.owner).toBe('search');
    expect(decision.priority).toBe(60);
  });

  it('keeps a production tactical target stable when the legacy proposal points at supply', () => {
    const input = baseInput({
      task: 'flank_to_cover',
      tactic: 'flank',
      tacticalTarget: { x: 23, y: 17 },
      logisticsTask: 'resupply_ammo',
      resupplyTarget: SUPPLY,
    });
    const decision = resolveExecutionOwnership(input);
    const targets = Array.from({ length: 12 }, (_, index) => resolveExecutionTarget({
      ...input,
      position: POSITION,
      legacyTarget: index % 2 === 0 ? SUPPLY : TACTICAL,
    }, decision));
    expect(targets.every((target) => samePoint(target, input.tacticalTarget))).toBe(true);
  });
});

function baseInput(overrides: Partial<ExecutionOwnershipInput> = {}): ExecutionOwnershipInput {
  return {
    agentId: 'twr:rifle-squad:charlie',
    alive: true,
    task: 'patrol',
    tactic: 'bounding',
    alertState: 'active',
    tacticalTarget: null,
    reactionState: 'none',
    reactionTarget: null,
    logisticsTask: 'none',
    resupplyTarget: null,
    recoveryRole: null,
    counterfireActive: false,
    ...overrides,
  };
}

function samePoint(left: GridPoint | null, right: GridPoint | null): boolean {
  if (left === null || right === null) return left === right;
  return Math.abs(left.x - right.x) < 1e-9 && Math.abs(left.y - right.y) < 1e-9;
}
