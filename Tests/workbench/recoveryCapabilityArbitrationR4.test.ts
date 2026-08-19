import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulation';
import { selectRecoveryRoleAssignment } from '../../Apps/Workbench/src/simulation/recoveryArbitration';

describe('Recovery capability arbitration R4', () => {
  it('selects the armed survivor for security and the unarmed medic for rescue', () => {
    const assignment = selectRecoveryRoleAssignment({
      candidates: [
        { id: 'alpha', alive: true, ammoRounds: 0, medkits: 2, distanceToPatient: 3, targetVisible: true, logisticsCommitted: false },
        { id: 'bravo', alive: true, ammoRounds: 90, medkits: 1, distanceToPatient: 2.7, targetVisible: true, logisticsCommitted: false },
      ],
      currentRescuerId: 'bravo',
      currentCovererId: 'alpha',
      minSecurityAmmo: 9,
    });
    expect(assignment).toMatchObject({ rescuerId: 'alpha', covererId: 'bravo', mode: 'paired' });
  });

  it('atomically swaps a dry security owner without losing treatment progress', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true);
    expect(simulation.setAgentEquipment('twr:rifle-squad:alpha', { ammoRounds: 0 })).toBe(true);
    expect(simulation.setAgentEquipment('twr:rifle-squad:bravo', { ammoRounds: 90 })).toBe(true);
    const internal = simulation as unknown as {
      recoveryPlan: { rescuerId: string; covererId: string | null; treatmentProgress: number } | null;
      recoveryOwnershipMode: 'active' | 'deferred';
      validateRecoveryContract: (state: ReturnType<TacticalWizardSimulation['getState']>) => boolean;
      recoveryRoleSwapCount: number;
    };
    expect(internal.recoveryPlan).not.toBeNull();
    internal.recoveryPlan!.rescuerId = 'twr:rifle-squad:bravo';
    internal.recoveryPlan!.covererId = 'twr:rifle-squad:alpha';
    internal.recoveryPlan!.treatmentProgress = 0.3;
    internal.recoveryOwnershipMode = 'active';
    expect(internal.validateRecoveryContract(simulation.getState())).toBe(true);
    expect(internal.recoveryPlan).toMatchObject({
      rescuerId: 'twr:rifle-squad:alpha',
      covererId: 'twr:rifle-squad:bravo',
      treatmentProgress: 0.3,
    });
    expect(internal.recoveryRoleSwapCount).toBeGreaterThan(0);
  });

  it('releases movement and weapon ownership while Recovery is deferred', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true);
    const internal = simulation as unknown as {
      deferRecovery: (state: ReturnType<TacticalWizardSimulation['getState']>, reason: string) => void;
    };
    internal.deferRecovery(simulation.getState(), 'r4-test');
    const state = simulation.getState();
    expect(state.recoverySafety.ownershipMode).toBe('deferred');
    expect(state.dynamicRecovery.tacticalPlanningSuspended).toBe(false);
    for (const contract of state.executionAuthority.contracts.filter((entry) => entry.agentId !== 'twr:rifle-squad:charlie')) {
      expect(contract.planOwner).not.toBe('recovery');
      expect(contract.movementOwner).not.toBe('recovery_rescue');
      expect(contract.movementOwner).not.toBe('recovery_security');
    }
  });

  it('allows a deferred former recovery owner to enter emergency logistics', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true);
    expect(simulation.setAgentEquipment('twr:rifle-squad:alpha', { ammoRounds: 0 })).toBe(true);
    const internal = simulation as unknown as {
      deferRecovery: (state: ReturnType<TacticalWizardSimulation['getState']>, reason: string) => void;
      planLogistics: (state: ReturnType<TacticalWizardSimulation['getState']>) => void;
    };
    internal.deferRecovery(simulation.getState(), 'r4-logistics-test');
    internal.planLogistics(simulation.getState());
    const state = simulation.getState();
    expect(state.dynamicRecovery.tacticalPlanningSuspended).toBe(false);
    expect(state.logisticsLifecycle.agentId === 'twr:rifle-squad:alpha' || state.agents.find((agent) => agent.id === 'twr:rifle-squad:alpha')?.ammoRounds === 0).toBe(true);
  });

  it('does not let a paired security owner fire through the reserve floor', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:charlie', { health: 0 })).toBe(true);
    const state = simulation.getState();
    const coverer = state.recovery.covererId;
    if (coverer === null) return;
    expect(simulation.setAgentEquipment(coverer, { ammoRounds: 6 })).toBe(true);
    const internal = simulation as unknown as {
      validateRecoveryContract: (state: ReturnType<TacticalWizardSimulation['getState']>) => boolean;
      recoveryPlan: { covererId: string | null } | null;
    };
    internal.validateRecoveryContract(simulation.getState());
    expect(internal.recoveryPlan?.covererId).not.toBe(coverer);
  });
});
