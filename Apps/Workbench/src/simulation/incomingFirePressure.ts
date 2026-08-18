import { evaluateIaus, type IausCandidateDefinition, type IausEvaluation } from './iausUtility';
import { findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint, type NavigationGrid } from './navigation';

export type FirePressureBand = 'stable' | 'pressured' | 'suppressed' | 'pinned';
export type PressureTacticalAction = 'none' | 'trade_fire' | 'reposition' | 'flank' | 'regroup' | 'assault';
export type PressureOpportunityKind = 'none' | 'hold_current_plan' | 'local_reposition' | 'counter_maneuver' | 'contract' | 'aggressive_close';
export type PressureLocalEffect = 'normal' | 'short_peek' | 'cover_bound' | 'pinned_hold';

export interface PressureProfileLike {
  readonly id: string;
  readonly mindset: 'tactical_human' | 'feral' | 'machine';
  readonly aggression: number;
  readonly suppressionTolerance: number;
  readonly flankBias: number;
  readonly repositionBias: number;
  readonly coordination: number;
  readonly holdGroundBias: number;
  readonly counterManeuverBias: number;
  readonly breakContactBias: number;
  readonly utilityTradeFireWeight: number;
  readonly utilityRepositionWeight: number;
  readonly utilityFlankWeight: number;
  readonly utilityRegroupWeight: number;
  readonly utilityAssaultWeight: number;
}

export interface PressureProposalInput {
  readonly band: FirePressureBand;
  readonly pressure: number;
  readonly pressuredAgentId: string;
  readonly livingCount: number;
  readonly pressuredCount: number;
  readonly currentTactic: string;
  readonly profile: PressureProfileLike;
  /** Low-weight deterministic variation axis. It never bypasses hard preconditions or commitment. */
  readonly roll: number;
  /** Planner-owned context. Optional so the Workbench authoring preview can still evaluate isolated scenarios. */
  readonly currentPlanProgress?: number;
  readonly safeFireLanes?: number;
  readonly geometryQuality?: number;
  readonly currentTacticTicks?: number;
  /** Recent committed opportunity memory. This penalizes repeating the same maneuver when the contact geometry did not change. */
  readonly recentAction?: PressureTacticalAction;
  readonly recentActionAgeTicks?: number;
  readonly recentGeometryNovelty?: number;
}

export interface PressureResponseProposal {
  readonly action: PressureTacticalAction;
  readonly opportunity: PressureOpportunityKind;
  readonly pressuredAgentId: string;
  readonly reason: string;
  readonly utility: IausEvaluation<PressureTacticalAction>;
}

export interface PressureResponseLease {
  readonly id: string;
  readonly action: PressureTacticalAction;
  readonly opportunity: PressureOpportunityKind;
  readonly pressuredAgentId: string;
  readonly maneuverAgentId: string | null;
  readonly supportAgentId: string | null;
  readonly origin: GridPoint | null;
  readonly target: GridPoint | null;
  readonly startedTick: number;
  readonly untilTick: number;
  readonly startedPressure: number;
  readonly startedBand: FirePressureBand;
  readonly expectedTactic: string | null;
  readonly worldRevision: number;
  readonly planRevision: number;
  readonly plannerTargetDisplacement: number | null;
  readonly plannerAngleGainDegrees: number | null;
  readonly softStableTicks: number;
  readonly reason: string;
}

export interface RepositionCandidate {
  readonly point: GridPoint;
  readonly score: number;
  readonly pathExposureCells: number;
  readonly distance: number;
  readonly coveredFromThreat: boolean;
}

export function nextPressureBand(current: FirePressureBand, pressure: number, tolerance: number): FirePressureBand {
  const t = clamp01(tolerance);
  const enterPressured = 0.22 + t * 0.08;
  const exitPressured = 0.14 + t * 0.06;
  const enterSuppressed = 0.46 + t * 0.18;
  const exitSuppressed = 0.34 + t * 0.12;
  const enterPinned = 0.7 + t * 0.17;
  const exitPinned = 0.56 + t * 0.12;

  if (current === 'pinned') {
    if (pressure >= exitPinned) return 'pinned';
    return pressure >= exitSuppressed ? 'suppressed' : pressure >= exitPressured ? 'pressured' : 'stable';
  }
  if (current === 'suppressed') {
    if (pressure >= enterPinned) return 'pinned';
    if (pressure >= exitSuppressed) return 'suppressed';
    return pressure >= exitPressured ? 'pressured' : 'stable';
  }
  if (current === 'pressured') {
    if (pressure >= enterPinned) return 'pinned';
    if (pressure >= enterSuppressed) return 'suppressed';
    return pressure >= exitPressured ? 'pressured' : 'stable';
  }
  if (pressure >= enterPinned) return 'pinned';
  if (pressure >= enterSuppressed) return 'suppressed';
  if (pressure >= enterPressured) return 'pressured';
  return 'stable';
}

export function localEffectForBand(band: FirePressureBand): PressureLocalEffect {
  if (band === 'pressured') return 'short_peek';
  if (band === 'suppressed') return 'cover_bound';
  if (band === 'pinned') return 'pinned_hold';
  return 'normal';
}

export function opportunityForPressureAction(action: PressureTacticalAction): PressureOpportunityKind {
  if (action === 'trade_fire') return 'hold_current_plan';
  if (action === 'reposition') return 'local_reposition';
  if (action === 'flank') return 'counter_maneuver';
  if (action === 'regroup') return 'contract';
  if (action === 'assault') return 'aggressive_close';
  return 'none';
}

/**
 * IAUS is deliberately used only to rank tactical opportunities. The selected
 * proposal still has to be accepted by Tactical Planning, become a committed
 * response lease, and pass the existing arbitration / execution-contract path.
 */
export function choosePressureProposal(input: PressureProposalInput): PressureResponseProposal {
  const utility = evaluatePressureUtilities(input);
  const action = utility.selectedId ?? 'reposition';
  return {
    action,
    opportunity: opportunityForPressureAction(action),
    pressuredAgentId: input.pressuredAgentId,
    reason: pressureReason(action, input.band, input.pressure, input.profile, utility),
    utility,
  };
}

export function evaluatePressureUtilities(input: PressureProposalInput): IausEvaluation<PressureTacticalAction> {
  const { profile, band, livingCount, pressuredCount, currentTactic } = input;
  const pressure = clamp01(input.pressure);
  const bandValue = band === 'pinned' ? 1 : band === 'suppressed' ? 0.7 : band === 'pressured' ? 0.34 : 0;
  const pressuredRatio = livingCount <= 0 ? 0 : clamp01(pressuredCount / livingCount);
  const stableTactic = currentTactic === 'flank' || currentTactic === 'crossfire' || currentTactic === 'assault';
  const maneuverCapacity = livingCount <= 1 ? 0 : clamp01((livingCount - pressuredCount) / Math.max(1, livingCount - 1));
  const variation = (offset: number) => 0.75 + wrap01(input.roll + offset) * 0.25;
  const tacticalHuman = profile.mindset === 'tactical_human';
  const feral = profile.mindset === 'feral';
  const machine = profile.mindset === 'machine';

  const planProgress = clamp01(input.currentPlanProgress ?? (stableTactic ? 0.45 : 0.15));
  const safeLaneQuality = clamp01((input.safeFireLanes ?? (currentTactic === 'crossfire' ? 1 : 0)) / 2);
  const geometryQuality = clamp01(input.geometryQuality ?? Math.max(planProgress * 0.72, safeLaneQuality));
  const tacticMaturity = clamp01((input.currentTacticTicks ?? 0) / 16);
  const currentPlanValue = stableTactic
    ? clamp01(0.22 + planProgress * 0.34 + safeLaneQuality * 0.24 + geometryQuality * 0.14 + tacticMaturity * 0.06)
    : clamp01(0.12 + planProgress * 0.26 + geometryQuality * 0.16);
  const switchCost = stableTactic
    ? clamp01(0.24 + planProgress * 0.32 + safeLaneQuality * 0.22 + geometryQuality * 0.16 + tacticMaturity * 0.06)
    : clamp01(0.12 + planProgress * 0.18 + geometryQuality * 0.12);
  const hardPressureRelease = band === 'pinned' ? 1 : clamp01(pressure * 0.62 + pressuredRatio * 0.28 + bandValue * 0.1);
  const switchPermission = band === 'pinned'
    ? clamp01(Math.max(0.7, 1 - switchCost * 0.28))
    : clamp01(Math.max(0.08, 1 - switchCost * 0.9 + hardPressureRelease * 0.18));
  const currentPlanRelease = band === 'pinned'
    ? clamp01(Math.max(0.55, 1 - currentPlanValue * 0.45))
    : clamp01(Math.max(0.06, 1 - currentPlanValue));

  const recentAge = Math.max(0, input.recentActionAgeTicks ?? 999);
  const repeatedFlank = input.recentAction === 'flank' && recentAge < 32;
  const recentGeometryNovelty = clamp01(input.recentGeometryNovelty ?? 1);
  const repeatNovelty = repeatedFlank
    ? clamp01(0.12 + Math.min(1, recentAge / 32) * 0.38 + recentGeometryNovelty * 0.5)
    : 1;
  const alreadyFlanking = currentTactic === 'flank' && planProgress < 0.96;

  const candidates: readonly IausCandidateDefinition<PressureTacticalAction>[] = [
    {
      id: 'trade_fire',
      weight: profile.utilityTradeFireWeight,
      available: tacticalHuman || machine,
      unavailableReason: feral ? 'feral_mindset_uses_maneuver_or_closing' : undefined,
      axes: [
        axis('hold_ground', profile.holdGroundBias, 1.3, 'power', 1.1),
        axis('aggression', profile.aggression, 0.75, 'linear'),
        axis('suppression_tolerance', profile.suppressionTolerance, 0.65, 'linear'),
        axis('pressure_survivability', pressure, 1.05, 'inverse', 1.25, 0.12),
        axis('current_plan_value', currentPlanValue, 1.05, 'smoothstep', 1, 0.16),
        axis('plan_progress', stableTactic ? planProgress : 0.42, 0.7, 'smoothstep', 1, 0.16),
        axis('safe_fire_lanes', stableTactic ? Math.max(0.2, safeLaneQuality) : 0.45, 0.55, 'linear', 1, 0.16),
        axis('variation', variation(0.11), 0.08, 'linear'),
      ],
    },
    {
      id: 'reposition',
      weight: profile.utilityRepositionWeight,
      available: tacticalHuman || machine,
      unavailableReason: feral ? 'feral_mindset_does_not_use_human_cover_reposition' : undefined,
      axes: [
        axis('reposition_bias', profile.repositionBias, 1.3, 'power', 1.05),
        axis('pressure', 0.28 + pressure * 0.72, 1.2, 'smoothstep'),
        axis('pressure_band', 0.3 + bandValue * 0.7, 0.8, 'linear'),
        axis('switch_permission', switchPermission, 1.05, 'smoothstep', 1, 0.08),
        axis('current_plan_release', currentPlanRelease, 0.82, 'smoothstep', 1, 0.08),
        axis('variation', variation(0.37), 0.08, 'linear'),
      ],
    },
    {
      id: 'flank',
      weight: profile.utilityFlankWeight,
      available: livingCount >= 2 && (tacticalHuman || feral),
      unavailableReason: livingCount < 2 ? 'requires_second_living_member' : machine ? 'machine_profile_does_not_counter_maneuver_under_fire' : undefined,
      axes: [
        axis('counter_maneuver', profile.counterManeuverBias, 1.35, 'power', 1.05),
        axis('coordination', feral ? Math.max(0.45, profile.coordination) : profile.coordination, 0.8, 'linear'),
        axis('maneuver_capacity', maneuverCapacity, 1.25, 'smoothstep', 1, 0.12),
        axis('pressure_opportunity', 0.45 + pressure * 0.55, 0.62, 'smoothstep'),
        axis('support_not_pinned', 0.3 + maneuverCapacity * 0.7, 0.75, 'linear', 1, 0.15),
        axis('switch_permission', alreadyFlanking ? 0.06 : switchPermission, 1.35, 'smoothstep', 1, 0.04),
        axis('current_plan_release', alreadyFlanking ? 0.05 : currentPlanRelease, 1.05, 'smoothstep', 1, 0.04),
        axis('repeat_geometry_novelty', repeatNovelty, 1.15, 'smoothstep', 1, 0.05),
        axis('variation', variation(0.61), 0.08, 'linear'),
      ],
    },
    {
      id: 'regroup',
      weight: profile.utilityRegroupWeight,
      available: tacticalHuman,
      unavailableReason: tacticalHuman ? undefined : 'only_human_doctrine_uses_break_contact_regroup',
      axes: [
        axis('break_contact', profile.breakContactBias, 1.35, 'power', 1.05),
        axis('distributed_pressure', pressuredRatio, 1.45, 'smoothstep', 1, 0.08),
        axis('pinned_evidence', 0.18 + bandValue * 0.82, 1.05, 'smoothstep'),
        axis('risk_aversion', 0.28 + (1 - profile.aggression) * 0.72, 0.6, 'linear'),
        axis('switch_permission', band === 'pinned' ? Math.max(0.78, switchPermission) : switchPermission, 0.9, 'smoothstep', 1, 0.08),
        axis('variation', variation(0.83), 0.08, 'linear'),
      ],
    },
    {
      id: 'assault',
      weight: profile.utilityAssaultWeight,
      available: feral,
      unavailableReason: feral ? undefined : 'pressure_assault_is_reserved_for_feral_mindset',
      axes: [
        axis('aggression', profile.aggression, 1.35, 'power', 1.05),
        axis('pressure_to_closing', 0.38 + pressure * 0.62, 1.05, 'smoothstep'),
        axis('direct_closing_bias', 0.25 + (1 - profile.counterManeuverBias) * 0.75, 1.15, 'linear', 1, 0.12),
        axis('switch_permission', band === 'pinned' ? Math.max(0.72, switchPermission) : switchPermission, 0.72, 'linear', 1, 0.08),
        axis('variation', variation(0.47), 0.08, 'linear'),
      ],
    },
  ];
  return evaluateIaus(candidates);
}

export function selectUnderFireReposition(
  grid: NavigationGrid,
  origin: GridPoint,
  threatOrigin: GridPoint,
  squadMatePositions: readonly GridPoint[],
  minDisplacement = 3.5,
  maxRadius = 8,
): RepositionCandidate | null {
  const start = rounded(origin);
  const threat = rounded(threatOrigin);
  const candidates: RepositionCandidate[] = [];
  const minX = Math.max(0, start.x - maxRadius);
  const maxX = Math.min(grid.width - 1, start.x + maxRadius);
  const minY = Math.max(0, start.y - maxRadius);
  const maxY = Math.min(grid.height - 1, start.y + maxRadius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const point = { x, y };
      if (!isWalkable(grid, point)) continue;
      const displacement = distance(start, point);
      if (displacement < minDisplacement || displacement > maxRadius + 0.01) continue;
      const path = findPath(grid, start, point);
      if (path.length === 0) continue;
      const exposure = path.reduce((count, cell) => count + (hasLineOfSight(grid, threat, cell) ? 1 : 0), 0);
      const coveredFromThreat = !hasLineOfSight(grid, threat, point);
      const coverAdjacency = adjacentBlockedCount(grid, point);
      const lateral = lateralDisplacementScore(start, threat, point);
      const cohesionPenalty = squadMatePositions.length === 0
        ? 0
        : Math.max(0, Math.min(...squadMatePositions.map((mate) => distance(point, mate))) - 8) * 1.4;
      const score = (coveredFromThreat ? 14 : -4)
        + coverAdjacency * 3.2
        + lateral * 5
        + Math.min(8, displacement) * 0.65
        - exposure * 1.65
        - path.length * 0.16
        - cohesionPenalty;
      candidates.push({ point, score, pathExposureCells: exposure, distance: displacement, coveredFromThreat });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.pathExposureCells - b.pathExposureCells || b.distance - a.distance || a.point.y - b.point.y || a.point.x - b.point.x);
  return candidates[0] ?? null;
}

export function leaseStillOwnsResponse(lease: PressureResponseLease, logicalTick: number): boolean {
  return logicalTick <= lease.untilTick;
}

export function deterministicPressureRoll(id: string, a: number, b: number): number {
  let hash = 2166136261;
  const source = `${id}:${a}:${b}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function pressureReasonForAction(
  action: PressureTacticalAction,
  band: FirePressureBand,
  pressure: number,
  profile: PressureProfileLike,
  evaluation: IausEvaluation<PressureTacticalAction>,
): string {
  return pressureReason(action, band, pressure, profile, evaluation);
}

function pressureReason(action: PressureTacticalAction, band: FirePressureBand, pressure: number, profile: PressureProfileLike, evaluation: IausEvaluation<PressureTacticalAction>): string {
  const level = `${band} incoming-fire pressure ${pressure.toFixed(2)}`;
  const ranking = [...evaluation.candidates]
    .filter((entry) => entry.available)
    .sort((a, b) => b.score - a.score || a.candidateId.localeCompare(b.candidateId, 'en'))
    .slice(0, 3)
    .map((entry) => `${entry.candidateId}=${entry.score.toFixed(3)}`)
    .join(', ');
  const utility = `IAUS selected ${action}${ranking ? ` (${ranking})` : ''}`;
  if (action === 'trade_fire') return `${level}; ${utility}; current-plan value and switching cost favor preserving readable geometry for a bounded exchange.`;
  if (action === 'flank') return `${level}; ${utility}; counter-maneuver is proposed to Tactical Planning and must still prove new flank geometry.`;
  if (action === 'reposition') return `${level}; ${utility}; local reposition is proposed to Tactical Planning instead of directly overwriting an agent target.`;
  if (action === 'regroup') return `${level}; ${utility}; pressure is distributed across the element, so contraction is proposed instead of repeated role rotation.`;
  if (action === 'assault') return `${level}; ${utility}; ${profile.mindset} converts danger into aggressive closing, subject to planner acceptance.`;
  return `${level}; ${utility}`;
}

function axis(
  id: string,
  input: number,
  weight: number,
  kind: 'linear' | 'inverse' | 'smoothstep' | 'power' | 'threshold',
  exponent = 1,
  floor = 0.04,
) {
  return { id, input, weight, curve: { kind, exponent, floor } } as const;
}

function rounded(point: GridPoint): GridPoint { return { x: Math.round(point.x), y: Math.round(point.y) }; }
function distance(a: GridPoint, b: GridPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function wrap01(value: number): number { const wrapped = value % 1; return wrapped < 0 ? wrapped + 1 : wrapped; }

function adjacentBlockedCount(grid: NavigationGrid, point: GridPoint): number {
  const neighbors = [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 },
  ];
  return neighbors.reduce((count, cell) => count + (!isWalkable(grid, cell) || grid.blocked.has(gridKey(cell)) ? 1 : 0), 0);
}

function lateralDisplacementScore(origin: GridPoint, threat: GridPoint, candidate: GridPoint): number {
  const incoming = normalized({ x: origin.x - threat.x, y: origin.y - threat.y });
  const move = normalized({ x: candidate.x - origin.x, y: candidate.y - origin.y });
  return Math.abs(incoming.x * move.y - incoming.y * move.x);
}

function normalized(value: GridPoint): GridPoint {
  const length = Math.hypot(value.x, value.y);
  return length <= 1e-6 ? { x: 1, y: 0 } : { x: value.x / length, y: value.y / length };
}
