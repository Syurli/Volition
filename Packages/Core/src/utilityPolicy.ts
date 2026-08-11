import type { DecisionCandidate, DecisionInput, DecisionPolicy, DecisionResult } from './types';

export type UtilityCandidateFactory = (input: DecisionInput) => readonly DecisionCandidate[];

/**
 * Deterministic utility selector. Utility is one pluggable policy implementation, not Volition product semantics.
 */
export class UtilityDecisionPolicy implements DecisionPolicy {
  public readonly id: string;
  readonly #factory: UtilityCandidateFactory;

  public constructor(id: string, factory: UtilityCandidateFactory) {
    this.id = id;
    this.#factory = factory;
  }

  public decide(input: DecisionInput): DecisionResult {
    const candidates = [...this.#factory(input)].sort(compareCandidates);
    const selected = candidates.find((candidate) => candidate.eligible);
    if (selected === undefined) {
      throw new Error(`Decision policy ${this.id} produced no eligible candidate.`);
    }
    return {
      candidates,
      selected: selected.intent,
      selectedCandidateId: selected.id,
    };
  }
}

function compareCandidates(left: DecisionCandidate, right: DecisionCandidate): number {
  if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
  if (left.score !== right.score) return right.score - left.score;
  return left.id.localeCompare(right.id, 'en');
}
