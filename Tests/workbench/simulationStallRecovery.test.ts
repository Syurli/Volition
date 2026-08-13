import { describe, expect, it } from 'vitest';
import type { GridPoint } from '../../Apps/Workbench/src/simulation/navigation';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationIntegrated';

describe('Tactical Wizard movement ownership regression', () => {
  it('keeps wounded support as a constraint without parking a mobile tactical assignment', () => {
    const simulation = new TacticalWizardSimulation();
    const host = simulation as unknown as {
      members: Array<{
        id: string;
        position: GridPoint;
        task: string;
        role: string;
        tacticalTarget: GridPoint | null;
      }>;
      movementTarget: (member: {
        id: string;
        position: GridPoint;
        task: string;
        role: string;
        tacticalTarget: GridPoint | null;
      }) => GridPoint | null;
      maintainWoundedSupport: (state: ReturnType<TacticalWizardSimulation['getState']>) => void;
      woundedPlan: {
        patientId: string;
        buddyId: string;
        buddySupportPoint: GridPoint;
      } | null;
    };

    const alpha = host.members.find((member) => member.id === 'twr:rifle-squad:alpha')!;
    const bravo = host.members.find((member) => member.id === 'twr:rifle-squad:bravo')!;
    const charlie = host.members.find((member) => member.id === 'twr:rifle-squad:charlie')!;
    alpha.position = { x: 3, y: 24 };
    bravo.position = { x: 18, y: 14 };
    charlie.position = { x: 15, y: 20 };
    expect(simulation.setAgentVitals(alpha.id, { health: 44 })).toBe(true);

    host.maintainWoundedSupport(simulation.getState());
    expect(host.woundedPlan).not.toBeNull();
    expect(host.woundedPlan?.patientId).toBe(alpha.id);
    expect(host.woundedPlan?.buddyId).toBe(charlie.id);

    const flankTarget = { x: 8, y: 24 };
    alpha.task = 'flank_to_cover';
    alpha.role = 'flanker';
    alpha.tacticalTarget = { ...flankTarget };

    const patientProposal = host.movementTarget(alpha);
    expect(patientProposal).toEqual(flankTarget);
    expect(alpha.tacticalTarget).toEqual(flankTarget);

    const buddyPlannerTarget = { x: 25, y: 20 };
    charlie.task = 'crossfire';
    charlie.role = 'crossfire';
    charlie.tacticalTarget = { ...buddyPlannerTarget };
    const firstSupportProposal = host.movementTarget(charlie);
    expect(firstSupportProposal).not.toBeNull();
    expect(distance(firstSupportProposal!, alpha.position)).toBeLessThanOrEqual(4.5);
    expect(charlie.tacticalTarget).toEqual(buddyPlannerTarget);

    alpha.position = { x: 6, y: 24 };
    host.maintainWoundedSupport(simulation.getState());
    const refreshedSupportProposal = host.movementTarget(charlie);
    expect(refreshedSupportProposal).not.toBeNull();
    expect(distance(refreshedSupportProposal!, alpha.position)).toBeLessThanOrEqual(4.5);
    expect(charlie.tacticalTarget).toEqual(buddyPlannerTarget);
  });
});

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
