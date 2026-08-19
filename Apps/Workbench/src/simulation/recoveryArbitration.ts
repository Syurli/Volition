export interface RecoveryRoleCandidate {
  readonly id: string;
  readonly alive: boolean;
  readonly ammoRounds: number;
  readonly medkits: number;
  readonly distanceToPatient: number;
  readonly targetVisible: boolean;
  readonly logisticsCommitted: boolean;
}

export interface RecoveryRoleAssignment {
  readonly rescuerId: string;
  readonly covererId: string | null;
  readonly mode: 'paired' | 'solo';
  readonly score: number;
  readonly reason: 'paired_capability_fit' | 'solo_capability_fit';
}

export interface RecoveryRoleSelectionInput {
  readonly candidates: readonly RecoveryRoleCandidate[];
  readonly currentRescuerId: string | null;
  readonly currentCovererId: string | null;
  readonly minSecurityAmmo: number;
}

/**
 * Selects Recovery owners by capability rather than by historical role alone.
 * A paired contract is only valid when the rescuer can treat and a distinct
 * security member can still provide meaningful armed cover. If no such pair
 * exists, the best medically capable survivor becomes a solo rescuer.
 */
export function selectRecoveryRoleAssignment(input: RecoveryRoleSelectionInput): RecoveryRoleAssignment | null {
  const living = input.candidates.filter((candidate) => candidate.alive);
  const rescuers = living.filter((candidate) => candidate.medkits > 0);
  if (rescuers.length === 0) return null;

  const pairs: RecoveryRoleAssignment[] = [];
  for (const rescuer of rescuers) {
    for (const coverer of living) {
      if (coverer.id === rescuer.id || coverer.ammoRounds < input.minSecurityAmmo) continue;
      const rescuerStickiness = rescuer.id === input.currentRescuerId ? 2.5 : 0;
      const covererStickiness = coverer.id === input.currentCovererId ? 2.2 : 0;
      const rescuerLogisticsPenalty = rescuer.logisticsCommitted ? 5 : 0;
      const covererLogisticsPenalty = coverer.logisticsCommitted ? 6 : 0;
      const rescuerScore = rescuer.medkits * 2.5 - rescuer.distanceToPatient * 0.45 + rescuerStickiness - rescuerLogisticsPenalty;
      const covererScore = Math.min(10, coverer.ammoRounds / Math.max(1, input.minSecurityAmmo))
        + (coverer.targetVisible ? 3 : 0)
        + covererStickiness
        - covererLogisticsPenalty;
      pairs.push({
        rescuerId: rescuer.id,
        covererId: coverer.id,
        mode: 'paired',
        score: rescuerScore + covererScore,
        reason: 'paired_capability_fit',
      });
    }
  }

  pairs.sort((left, right) => right.score - left.score || left.rescuerId.localeCompare(right.rescuerId, 'en') || (left.covererId ?? '').localeCompare(right.covererId ?? '', 'en'));
  if (pairs.length > 0) return pairs[0]!;

  const solo = rescuers
    .map((rescuer): RecoveryRoleAssignment => ({
      rescuerId: rescuer.id,
      covererId: null,
      mode: 'solo',
      score: rescuer.medkits * 2.5 - rescuer.distanceToPatient * 0.45 + (rescuer.id === input.currentRescuerId ? 2.5 : 0) - (rescuer.logisticsCommitted ? 5 : 0),
      reason: 'solo_capability_fit',
    }))
    .sort((left, right) => right.score - left.score || left.rescuerId.localeCompare(right.rescuerId, 'en'));
  return solo[0] ?? null;
}

export function recoverySecurityViable(candidate: RecoveryRoleCandidate | null, minSecurityAmmo: number): boolean {
  return candidate !== null && candidate.alive && candidate.ammoRounds >= minSecurityAmmo;
}
