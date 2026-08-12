import { type GridPoint, type NavigationGrid } from './navigation';
import { distanceToSegment } from './combatCoordination';
import { selectCoverSlot as selectBaseCoverSlot, type CoverSelectionMode, type CoverSlot } from './squadTactics';

const MIN_FINAL_SPACING = 2.15;
const MIN_PEEK_SPACING = 1.2;
const FIRE_LANE_BODY_CLEARANCE = 0.95;
const MIN_FLANK_ANGLE_DEGREES = 24;

export interface TacticalFiringReservation {
  readonly id: string;
  readonly position: GridPoint;
  readonly fireOrigin: GridPoint;
}

/**
 * V7 tactical-position guard. The base selector still scores path/range/progress,
 * but candidates first have to be compatible with every reserved firing position.
 * Reservations may come from a real CoverSlot or from a fallback tactical point.
 */
export function selectCoordinatedCoverSlot(
  grid: NavigationGrid,
  slots: readonly CoverSlot[],
  from: GridPoint,
  threat: GridPoint,
  reservedSlotIds: ReadonlySet<string>,
  mode: CoverSelectionMode,
  sideBias = 0,
  extraReservations: readonly TacticalFiringReservation[] = [],
): CoverSlot | null {
  const slotReservations = slots
    .filter((slot) => reservedSlotIds.has(slot.id))
    .map((slot): TacticalFiringReservation => ({ id: slot.id, position: slot.position, fireOrigin: slot.peekPosition }));
  const reservations = [...slotReservations, ...extraReservations];
  const strict = slots.filter((slot) => !reservedSlotIds.has(slot.id) && !positionConflictsWithReservations(slot.position, slot.peekPosition, threat, reservations, mode));
  if (strict.length === 0) return null;
  return selectBaseCoverSlot(grid, strict, from, threat, reservedSlotIds, mode, sideBias);
}

export function tacticalSlotsConflict(left: CoverSlot, right: CoverSlot, threat: GridPoint, mode: CoverSelectionMode = 'support'): boolean {
  return positionConflictsWithReservations(left.position, left.peekPosition, threat, [{ id: right.id, position: right.position, fireOrigin: right.peekPosition }], mode);
}

export function positionConflictsWithReservations(
  position: GridPoint,
  fireOrigin: GridPoint,
  threat: GridPoint,
  reservations: readonly TacticalFiringReservation[],
  mode: CoverSelectionMode = 'support',
): boolean {
  return reservations.some((reserved) => !compatible(position, fireOrigin, reserved, threat, mode));
}

function compatible(
  candidatePosition: GridPoint,
  candidateFireOrigin: GridPoint,
  reserved: TacticalFiringReservation,
  threat: GridPoint,
  mode: CoverSelectionMode,
): boolean {
  if (distance(candidatePosition, reserved.position) < MIN_FINAL_SPACING) return false;
  if (distance(candidateFireOrigin, reserved.fireOrigin) < MIN_PEEK_SPACING) return false;

  // Candidate body must not sit inside the already-reserved shooter's useful lane.
  if (pointBlocksLane(candidatePosition, reserved.fireOrigin, threat, FIRE_LANE_BODY_CLEARANCE)) return false;
  // Reserved body must not sit inside the candidate's useful lane.
  if (pointBlocksLane(reserved.position, candidateFireOrigin, threat, FIRE_LANE_BODY_CLEARANCE)) return false;

  // Crossfire / flank opportunities should open a visibly different angle rather than
  // selecting two neighboring cells on almost the same radial line.
  if (mode === 'flank' && angleAtThreat(candidateFireOrigin, reserved.fireOrigin, threat) < MIN_FLANK_ANGLE_DEGREES) return false;
  return true;
}

function pointBlocksLane(point: GridPoint, from: GridPoint, to: GridPoint, clearance: number): boolean {
  const projection = segmentProjection(point, from, to);
  if (projection <= 0.06 || projection >= 0.94) return false;
  return distanceToSegment(point, from, to) <= clearance;
}

function segmentProjection(point: GridPoint, from: GridPoint, to: GridPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const denominator = dx * dx + dy * dy;
  if (denominator <= 1e-9) return 0;
  return ((point.x - from.x) * dx + (point.y - from.y) * dy) / denominator;
}

function angleAtThreat(a: GridPoint, b: GridPoint, threat: GridPoint): number {
  const ax = a.x - threat.x;
  const ay = a.y - threat.y;
  const bx = b.x - threat.x;
  const by = b.y - threat.y;
  const aLength = Math.hypot(ax, ay) || 1;
  const bLength = Math.hypot(bx, by) || 1;
  const dot = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (aLength * bLength)));
  return Math.acos(dot) * 180 / Math.PI;
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
