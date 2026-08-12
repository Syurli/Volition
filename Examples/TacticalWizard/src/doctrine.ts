export type SquadTactic = 'bounding' | 'flank' | 'crossfire' | 'assault' | 'sweep' | 'regroup';

export interface SquadDoctrineFacts {
  readonly contactTicks: number;
  readonly stationaryTargetTicks: number;
  readonly tacticTicks: number;
  readonly boundingPhase: number;
  readonly visibleMembers: number;
  readonly stalledMembers: number;
  readonly lostContactTicks: number;
  readonly maneuverCycle: number;
}

export interface SquadDoctrineDecision {
  readonly tactic: SquadTactic;
  readonly reason: string;
  readonly rotateRoles: boolean;
}

/**
 * Engine-neutral Tactical Wizard squad doctrine. It decides WHY the squad changes tactical mode from
 * portable facts only. Workbench/engine Hosts remain responsible for resolving cover, flank, crossfire,
 * assault and search-sweep positions into concrete navigation targets.
 */
export function decideSquadDoctrine(current: SquadTactic, facts: SquadDoctrineFacts): SquadDoctrineDecision {
  if (facts.lostContactTicks >= 5 && current !== 'sweep' && current !== 'regroup') {
    return { tactic: 'sweep', reason: 'No member has visual contact; stop charging the Last Known Position and sweep separated sectors instead.', rotateRoles: true };
  }
  if (facts.stalledMembers >= 2 && current !== 'regroup') {
    return { tactic: 'regroup', reason: 'Multiple members are stalled; break the geometry, fall back to distinct cover sectors and rebuild spacing.', rotateRoles: true };
  }

  switch (current) {
    case 'bounding':
      if (facts.boundingPhase >= 1 && facts.stationaryTargetTicks >= 10) {
        return { tactic: 'flank', reason: 'The target is holding position after a bound; pin it and open a true lateral route.', rotateRoles: true };
      }
      if (facts.boundingPhase >= 2 || facts.contactTicks >= 30 || facts.tacticTicks >= 24) {
        return { tactic: 'flank', reason: 'Bounding pressure has converged; stop repeating cover swaps and create a new angle.', rotateRoles: true };
      }
      return { tactic: current, reason: 'Maintain bounded advance while contact geometry is still developing.', rotateRoles: false };
    case 'flank':
      if (facts.tacticTicks >= 12 || (facts.visibleMembers >= 2 && facts.tacticTicks >= 8)) {
        return { tactic: 'crossfire', reason: 'The flank has developed; establish opposing firing sectors before committing the assault.', rotateRoles: false };
      }
      return { tactic: current, reason: 'One element maneuvers laterally while the fixing element preserves pressure.', rotateRoles: false };
    case 'crossfire':
      if (facts.tacticTicks >= 14 && facts.visibleMembers > 0) {
        return { tactic: 'assault', reason: 'Separated firing sectors are established; exploit the crossfire with a short coordinated assault.', rotateRoles: true };
      }
      if (facts.tacticTicks >= 20) {
        return { tactic: 'regroup', reason: 'Crossfire did not create a decisive opening; rotate exposed elements before trying another route.', rotateRoles: true };
      }
      return { tactic: current, reason: 'Hold opposing sectors and deny the target a single safe-facing direction.', rotateRoles: false };
    case 'assault':
      if (facts.tacticTicks >= 16) {
        return { tactic: 'regroup', reason: 'Assault window expired; disengage from the close orbit and rebuild tactical spacing.', rotateRoles: true };
      }
      return { tactic: current, reason: 'Maintain a brief two-element assault while the support element anchors the fight.', rotateRoles: false };
    case 'sweep':
      if (facts.visibleMembers > 0) {
        return { tactic: 'bounding', reason: 'Visual contact reacquired during the sweep; reform combat spacing before the next maneuver.', rotateRoles: true };
      }
      if (facts.tacticTicks >= 20) {
        return { tactic: 'regroup', reason: 'Sweep sectors completed without reacquisition; regroup instead of orbiting the stale LKP.', rotateRoles: true };
      }
      return { tactic: current, reason: 'Search separated sectors around the Last Known Position without reading hidden live target coordinates.', rotateRoles: false };
    case 'regroup':
      if (facts.tacticTicks >= 12) {
        return { tactic: 'bounding', reason: `Spacing recovered for maneuver cycle ${facts.maneuverCycle + 1}; resume pressure with a new role order and opposite flank preference.`, rotateRoles: true };
      }
      return { tactic: current, reason: 'Move away from the close firing orbit, recover spacing and settle into distinct cover sectors.', rotateRoles: false };
  }
}
