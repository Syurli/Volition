export type SquadTactic = 'bounding' | 'flank' | 'assault' | 'regroup';

export interface SquadDoctrineFacts {
  readonly contactTicks: number;
  readonly stationaryTargetTicks: number;
  readonly tacticTicks: number;
  readonly boundingPhase: number;
  readonly visibleMembers: number;
  readonly stalledMembers: number;
}

export interface SquadDoctrineDecision {
  readonly tactic: SquadTactic;
  readonly reason: string;
  readonly rotateRoles: boolean;
}

/**
 * Engine-neutral Tactical Wizard squad doctrine. It decides WHY the squad changes tactical mode from
 * portable facts only. Workbench/engine Hosts remain responsible for resolving cover, flank and assault
 * positions into concrete navigation targets.
 */
export function decideSquadDoctrine(current: SquadTactic, facts: SquadDoctrineFacts): SquadDoctrineDecision {
  if (facts.stalledMembers >= 2 && current !== 'regroup') {
    return { tactic: 'regroup', reason: 'Multiple members are stalled; break the pattern and rebuild spacing.', rotateRoles: true };
  }

  switch (current) {
    case 'bounding':
      if (facts.boundingPhase >= 2 || facts.stationaryTargetTicks >= 20 || facts.contactTicks >= 36) {
        return { tactic: 'flank', reason: 'Bounding has converged on a static firing pattern; open a lateral angle.', rotateRoles: true };
      }
      return { tactic: current, reason: 'Maintain bounded advance while contact is still developing.', rotateRoles: false };
    case 'flank':
      if (facts.tacticTicks >= 16 || (facts.stationaryTargetTicks >= 28 && facts.visibleMembers > 0)) {
        return { tactic: 'assault', reason: 'The flank has had time to develop; convert pressure into a coordinated assault.', rotateRoles: true };
      }
      return { tactic: current, reason: 'Continue lateral maneuver while support elements hold pressure.', rotateRoles: false };
    case 'assault':
      if (facts.tacticTicks >= 22) {
        return { tactic: 'regroup', reason: 'Assault window expired; rotate the exposed element and rebuild formation.', rotateRoles: true };
      }
      return { tactic: current, reason: 'Maintain short assault window with two maneuvering elements.', rotateRoles: false };
    case 'regroup':
      if (facts.tacticTicks >= 10) {
        return { tactic: 'bounding', reason: 'Spacing recovered; resume bounded pressure with a new role order.', rotateRoles: true };
      }
      return { tactic: current, reason: 'Recover spacing and cover before committing another maneuver.', rotateRoles: false };
  }
}
