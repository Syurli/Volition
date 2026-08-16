/**
 * Infinite-Axis-style utility evaluation kernel.
 *
 * This module deliberately stops at Reasoner output. It ranks available proposals;
 * it never owns movement, weapons, plan commitment, arbitration or execution.
 * Tactical Wizard is the first production consumer while the contract remains
 * reference-implementation scoped rather than promoted into Packages/Core.
 */
export type IausCurveKind = 'linear' | 'inverse' | 'smoothstep' | 'power' | 'threshold';

export interface IausResponseCurve {
  readonly kind: IausCurveKind;
  readonly exponent?: number;
  readonly threshold?: number;
  /** Minimum response after evaluating the curve. Useful for preferences that should influence, not veto. */
  readonly floor?: number;
}

export interface IausAxisDefinition {
  readonly id: string;
  readonly input: number;
  readonly weight: number;
  readonly curve: IausResponseCurve;
}

export interface IausCandidateDefinition<TId extends string> {
  readonly id: TId;
  /** Designer/profile multiplier. 1 is neutral; this is not execution priority. */
  readonly weight: number;
  readonly available: boolean;
  readonly unavailableReason?: string;
  readonly axes: readonly IausAxisDefinition[];
}

export interface IausAxisTrace {
  readonly axisId: string;
  readonly input: number;
  readonly response: number;
  readonly weight: number;
}

export interface IausCandidateTrace<TId extends string> {
  readonly candidateId: TId;
  readonly available: boolean;
  readonly score: number;
  readonly profileWeight: number;
  readonly axisScore: number;
  readonly unavailableReason: string | null;
  readonly axes: readonly IausAxisTrace[];
}

export interface IausEvaluation<TId extends string> {
  readonly selectedId: TId | null;
  readonly candidates: readonly IausCandidateTrace<TId>[];
}

const EPSILON = 1e-4;

/**
 * Weighted geometric aggregation keeps every axis relevant without making the
 * number of axes itself a penalty. Hard impossibilities are represented by
 * `available=false`, not a near-zero utility score.
 */
export function evaluateIaus<TId extends string>(candidates: readonly IausCandidateDefinition<TId>[]): IausEvaluation<TId> {
  const traces = candidates.map(evaluateCandidate);
  const selected = traces
    .filter((entry) => entry.available)
    .sort((a, b) => b.score - a.score || String(a.candidateId).localeCompare(String(b.candidateId), 'en'))[0] ?? null;
  return { selectedId: selected?.candidateId ?? null, candidates: traces };
}

export function evaluateIausCurve(input: number, curve: IausResponseCurve): number {
  const x = clamp01(input);
  let response: number;
  if (curve.kind === 'inverse') response = 1 - x;
  else if (curve.kind === 'smoothstep') response = x * x * (3 - 2 * x);
  else if (curve.kind === 'power') response = Math.pow(x, Math.max(0.05, curve.exponent ?? 1));
  else if (curve.kind === 'threshold') {
    const threshold = clamp01(curve.threshold ?? 0.5);
    response = threshold <= EPSILON ? 1 : x >= threshold ? 1 : (x / threshold) * 0.35;
  } else response = x;
  return Math.max(clamp01(curve.floor ?? 0), clamp01(response));
}

function evaluateCandidate<TId extends string>(candidate: IausCandidateDefinition<TId>): IausCandidateTrace<TId> {
  if (!candidate.available) {
    return {
      candidateId: candidate.id,
      available: false,
      score: 0,
      profileWeight: candidate.weight,
      axisScore: 0,
      unavailableReason: candidate.unavailableReason ?? 'hard_precondition_failed',
      axes: candidate.axes.map(traceAxis),
    };
  }

  const axes = candidate.axes.map(traceAxis);
  const totalWeight = axes.reduce((sum, axis) => sum + Math.max(0, axis.weight), 0);
  const weightedLog = axes.reduce((sum, axis) => {
    const weight = Math.max(0, axis.weight);
    return sum + Math.log(Math.max(EPSILON, axis.response)) * weight;
  }, 0);
  const axisScore = totalWeight <= EPSILON ? 1 : Math.exp(weightedLog / totalWeight);
  const profileWeight = clamp(candidate.weight, 0.1, 2);
  return {
    candidateId: candidate.id,
    available: true,
    score: axisScore * profileWeight,
    profileWeight,
    axisScore,
    unavailableReason: null,
    axes,
  };
}

function traceAxis(axis: IausAxisDefinition): IausAxisTrace {
  return {
    axisId: axis.id,
    input: clamp01(axis.input),
    response: evaluateIausCurve(axis.input, axis.curve),
    weight: Math.max(0, axis.weight),
  };
}

function clamp01(value: number): number { return clamp(value, 0, 1); }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }
