export type SquadTactic = 'bounding' | 'flank' | 'crossfire' | 'assault' | 'sweep' | 'regroup';

export interface SquadDoctrineFacts {
  readonly contactTicks: number;
  readonly stationaryTargetTicks: number;
  readonly tacticTicks: number;
  readonly boundingPhase: number;
  readonly visibleMembers: number;
  readonly stalledMembers: number;
  readonly lostContactTicks?: number;
  readonly maneuverCycle?: number;
  readonly planCompletion?: number;
  readonly stableContactTicks?: number;
}

export interface SquadDoctrineDecision {
  readonly tactic: SquadTactic;
  readonly reason: string;
  readonly rotateRoles: boolean;
}

/**
 * A repeated static engagement is deliberately treated differently from the
 * first clean tactical demonstration cycle. The reference squad is still
 * deterministic, but it must not interpret "plan completed" as "replay the
 * exact same five-state choreography forever" when the world state has not
 * materially changed.
 */
function hasRepetitionPressure(facts: SquadDoctrineFacts, maneuverCycle: number, stableContactTicks: number): boolean {
  return maneuverCycle >= 1 && facts.stationaryTargetTicks >= 32 && stableContactTicks >= 4;
}

export function decideSquadDoctrine(current: SquadTactic, facts: SquadDoctrineFacts): SquadDoctrineDecision {
  const lostContactTicks = facts.lostContactTicks ?? 0;
  const maneuverCycle = facts.maneuverCycle ?? 0;
  const planCompletion = facts.planCompletion ?? 1;
  const stableContactTicks = facts.stableContactTicks ?? (facts.visibleMembers > 0 ? 4 : 0);
  const repetitionPressure = hasRepetitionPressure(facts, maneuverCycle, stableContactTicks);

  if (lostContactTicks >= 6 && current !== 'sweep' && current !== 'regroup') {
    return { tactic: 'sweep', reason: 'No member has held visual contact for 1.5 seconds; preserve the committed LKP and sweep separated sectors instead of chasing fresh hidden geometry.', rotateRoles: true };
  }
  if (facts.stalledMembers >= 2 && current !== 'regroup') {
    return { tactic: 'regroup', reason: 'Multiple maneuver elements have been physically stalled long enough to invalidate the committed plan; break contact geometry and rebuild spacing.', rotateRoles: true };
  }

  switch (current) {
    case 'bounding':
      if (facts.boundingPhase >= 1 && planCompletion >= 1 && facts.stationaryTargetTicks >= 8 && facts.tacticTicks >= 6) {
        // On every third adaptive branch, a well-observed static target no
        // longer justifies paying the pathing cost of another identical flank.
        // Re-use the spacing already earned by the bound and establish
        // separated firing sectors directly.
        if (repetitionPressure && facts.visibleMembers >= 2 && maneuverCycle % 3 === 1) {
          return {
            tactic: 'crossfire',
            reason: 'Repeated static contact detected after a completed maneuver cycle; preserve the new spacing and establish crossfire directly instead of replaying the same flank route.',
            rotateRoles: true,
          };
        }
        return { tactic: 'flank', reason: 'The bound completed and the target is still holding; pin it while a committed flanking element opens a rear-quarter angle.', rotateRoles: true };
      }
      if (facts.tacticTicks >= 40) return { tactic: 'flank', reason: 'Bounding reached its safety timeout; preserve pressure but stop repeating the same cover exchange.', rotateRoles: true };
      return { tactic: current, reason: 'Maintain bounded pressure until the mover actually reaches its committed position and the formation has settled.', rotateRoles: false };

    case 'flank':
      if (planCompletion >= 1 && facts.tacticTicks >= 6) return { tactic: 'crossfire', reason: 'The flanking element reached its committed sector; now form opposing firing angles instead of replacing its target mid-route.', rotateRoles: false };
      if (facts.tacticTicks >= 40) return { tactic: 'regroup', reason: 'The flank could not be completed within the maneuver timeout; abandon the route cleanly and rebuild geometry.', rotateRoles: true };
      return { tactic: current, reason: 'Flank is committed: keep the flanker on its assigned route until arrival, hard stall, contact loss, or timeout.', rotateRoles: false };

    case 'crossfire':
      if (planCompletion >= 1 && stableContactTicks >= 3 && facts.tacticTicks >= 6) {
        // When the same stationary target has already survived a full cycle,
        // do not automatically collapse every successful crossfire into the
        // same close assault. Some cycles deliberately cash out the positional
        // gain, rotate exposure, and ask the next bound for a new solution.
        const shouldRotateWithoutAssault = repetitionPressure && (maneuverCycle % 3 === 1 || facts.visibleMembers < 3);
        if (shouldRotateWithoutAssault) {
          if (facts.tacticTicks < 8) {
            return {
              tactic: current,
              reason: 'Repeated static contact: hold the established crossfire for a short confirmation window before rotating exposure; do not let the old assault transition pre-empt the adaptive branch.',
              rotateRoles: false,
            };
          }
          return {
            tactic: 'regroup',
            reason: 'Crossfire is established but the target state has not changed; rotate exposure and rebuild geometry instead of entering another identical assault.',
            rotateRoles: true,
          };
        }
        return { tactic: 'assault', reason: 'Both crossfire elements reached separated sectors and contact is stable; exploit the established geometry with a coordinated assault.', rotateRoles: true };
      }
      if (facts.tacticTicks >= 48) return { tactic: 'regroup', reason: 'Crossfire could not settle into two usable firing sectors before timeout; rotate exposed elements rather than oscillating targets.', rotateRoles: true };
      return { tactic: current, reason: 'Hold the crossfire commitment until both firing elements are actually in position.', rotateRoles: false };

    case 'assault':
      if (planCompletion >= 1 && facts.tacticTicks >= 8) return { tactic: 'regroup', reason: 'The assault elements reached their exploitation positions and completed the minimum assault window; disengage and recover spacing.', rotateRoles: true };
      if (facts.tacticTicks >= 40) return { tactic: 'regroup', reason: 'Assault reached its safety timeout; stop orbiting close to the target and deliberately reset the formation.', rotateRoles: true };
      return { tactic: current, reason: 'Maintain the assault commitment until both assault elements arrive or the safety timeout is reached.', rotateRoles: false };

    case 'sweep':
      if (stableContactTicks >= 4 && facts.visibleMembers > 0) return { tactic: 'bounding', reason: 'Visual contact has remained stable for four decision ticks; leave the search state and reform combat spacing.', rotateRoles: true };
      if (planCompletion >= 1 && facts.tacticTicks >= 12) return { tactic: 'regroup', reason: 'The separated LKP sweep sectors were physically reached without stable reacquisition; regroup instead of bouncing between search and combat every LOS flicker.', rotateRoles: true };
      if (facts.tacticTicks >= 48) return { tactic: 'regroup', reason: 'Sweep reached its safety timeout without stable reacquisition; regroup around the stale LKP.', rotateRoles: true };
      return { tactic: current, reason: 'Continue the committed LKP sweep; a brief single-tick visual reacquisition is not enough to cancel the search.', rotateRoles: false };

    case 'regroup':
      if (planCompletion >= 1 && facts.tacticTicks >= 8) {
        if (repetitionPressure) {
          return {
            tactic: 'bounding',
            reason: `Repeated static engagement detected; cycle ${maneuverCycle + 1} starts from a fresh bound, but the doctrine may skip already-proven flank or assault stages instead of replaying the full choreography.`,
            rotateRoles: true,
          };
        }
        return { tactic: 'bounding', reason: `At least two members recovered their committed spacing for maneuver cycle ${maneuverCycle + 1}; resume pressure with a new role order and opposite flank preference.`, rotateRoles: true };
      }
      if (facts.tacticTicks >= 40) return { tactic: 'bounding', reason: `Regroup reached its safety timeout for maneuver cycle ${maneuverCycle + 1}; resume cautiously without waiting forever on one blocked element.`, rotateRoles: true };
      return { tactic: current, reason: 'Regroup remains committed until the formation has actually recovered useful spacing.', rotateRoles: false };
  }
}
