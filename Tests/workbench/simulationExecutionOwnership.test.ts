import { describe, expect, it } from 'vitest';
import {
  capabilitySnapshot,
  emergencyResupplyOwner,
  logisticsMayCommit,
  reactionPriority,
  resolveExecutionContract,
  type ExecutionHierarchyInput,
} from '../../Apps/Workbench/src/simulation/tacticalWizardHierarchy';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV4';

const POSITION = { x: 4, y: 4 };
const TACTICAL = { x: 16, y: 11 };
const SUPPLY = { x: 23, y: 31 };

describe('Tactical Wizard fixed tactical hierarchy', () => {
  it('publishes one fixed production hierarchy with movement and weapon authority in the execution contract', () => {
    const simulation = new TacticalWizardSimulation();
    const state = simulation.getState();
    expect(state.executionAuthority.architecture).toBe('fixed_tactical_hierarchy');
    expect(state.executionAuthority.layers).toEqual(['perception', 'contact', 'tactical_planning', 'operational_arbitration', 'execution', 'host']);
    expect(state.executionAuthority.finalMovementAuthority).toBe('execution_contract');
    expect(state.executionAuthority.finalWeaponAuthority).toBe('execution_contract');
    expect(state.executionAuthority.versionOverlayPolicy).toBe('forbidden');
  });

  it('turns an approved logistics assignment into a plan lease instead of letting crossfire keep the body', () => {
    const input = baseInput({
      tacticalTask: 'crossfire',
      tacticalTarget: TACTICAL,
      tacticalProposal: TACTICAL,
      logistics: { agentId: 'charlie', supplyId: 'SUP-02', task: 'resupply_ammo', target: SUPPLY, startedTick: 127, reason: 'critical ammo' },
    });
    const contract = resolveExecutionContract(input);
    expect(contract.planOwner).toBe('logistics');
    expect(contract.movementOwner).toBe('logistics');
    expect(contract.movementTarget).toEqual(SUPPLY);
    expect(contract.weaponAuthorized).toBe(false);
    expect(contract.tacticalLeaseActive).toBe(false);
  });

  it('keeps grenade suppression as priority 20 and does not erase or steal a committed logistics lease', () => {
    expect(reactionPriority('grenade_suppress')).toBe(20);
    const contract = resolveExecutionContract(baseInput({
      logistics: { agentId: 'charlie', supplyId: 'SUP-02', task: 'resupply_ammo', target: SUPPLY, startedTick: 127, reason: 'critical ammo' },
      reaction: { kind: 'grenade_suppress', target: POSITION, untilTick: 40 },
    }));
    expect(contract.planOwner).toBe('logistics');
    expect(contract.movementOwner).toBe('logistics');
    expect(contract.movementTarget).toEqual(SUPPLY);
  });

  it('allows a hard reaction to constrain logistics movement without deleting the logistics plan owner', () => {
    const reactionTarget = { x: 2, y: 2 };
    const contract = resolveExecutionContract(baseInput({
      logistics: { agentId: 'charlie', supplyId: 'SUP-02', task: 'resupply_ammo', target: SUPPLY, startedTick: 127, reason: 'critical ammo' },
      reaction: { kind: 'stunned', target: reactionTarget, untilTick: 40 },
    }));
    expect(contract.planOwner).toBe('logistics');
    expect(contract.movementOwner).toBe('reaction');
    expect(contract.movementTarget).toEqual(reactionTarget);
  });

  it('selects exactly one deterministic recovery owner when every living member is dry', () => {
    const allDry = [
      { id: 'twr:rifle-squad:alpha', alive: true, ammoRounds: 0 },
      { id: 'twr:rifle-squad:bravo', alive: true, ammoRounds: 0 },
      { id: 'twr:rifle-squad:charlie', alive: true, ammoRounds: 0 },
    ];
    expect(emergencyResupplyOwner(allDry)).toBe('twr:rifle-squad:alpha');
    const allowed = allDry.filter((agent) => logisticsMayCommit({
      agentId: agent.id,
      alertState: 'active',
      targetVisible: true,
      isSuppressor: agent.id === 'twr:rifle-squad:alpha',
      ammoRounds: agent.ammoRounds,
      grenadeCount: 0,
      livingAgents: allDry,
    }));
    expect(allowed.map((agent) => agent.id)).toEqual(['twr:rifle-squad:alpha']);
  });

  it('does not authorize rifle fire when the capability snapshot is dry', () => {
    const contract = resolveExecutionContract(baseInput({ capability: capabilitySnapshot(true, 0, 1) }));
    expect(contract.planOwner).toBe('tactical');
    expect(contract.weaponOwner).toBe('none');
    expect(contract.weaponAuthorized).toBe(false);
  });

  it('gives committed recovery ownership above logistics without creating another behavior layer', () => {
    const contract = resolveExecutionContract(baseInput({
      logistics: { agentId: 'charlie', supplyId: 'SUP-02', task: 'resupply_ammo', target: SUPPLY, startedTick: 127, reason: 'critical ammo' },
      recovery: { role: 'rescuer', target: { x: 7, y: 7 }, patientId: 'bravo' },
    }));
    expect(contract.planOwner).toBe('recovery');
    expect(contract.movementOwner).toBe('recovery_rescue');
  });
});

function baseInput(overrides: Partial<ExecutionHierarchyInput> = {}): ExecutionHierarchyInput {
  return {
    agentId: 'charlie',
    logicalTick: 20,
    position: POSITION,
    alertState: 'active',
    tactic: 'crossfire',
    tacticalTask: 'crossfire',
    tacticalTarget: TACTICAL,
    tacticalProposal: TACTICAL,
    capability: capabilitySnapshot(true, 60, 2),
    logistics: null,
    reaction: null,
    recovery: { role: 'none', target: null, patientId: null },
    ...overrides,
  };
}
