import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, content) { fs.writeFileSync(path, content); }
function replaceOnce(content, search, replacement, label) {
  const index = content.indexOf(search);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (content.indexOf(search, index + search.length) >= 0) throw new Error(`Ambiguous patch anchor: ${label}`);
  return content.slice(0, index) + replacement + content.slice(index + search.length);
}
function edit(path, changes) {
  let content = read(path);
  for (const [search, replacement, label] of changes) content = replaceOnce(content, search, replacement, `${path}: ${label}`);
  write(path, content);
}

write('Apps/Workbench/src/simulation/combatTrace.ts', `import { isWalkable, rasterLine, type GridPoint, type NavigationGrid } from './navigation';

export interface ShotTraceTarget {
  readonly id: string;
  readonly position: GridPoint;
}

export interface GridShotTrace {
  readonly from: GridPoint;
  readonly aimedTo: GridPoint;
  readonly impactPoint: GridPoint;
  readonly blockedByWorld: boolean;
  readonly blockingCell: GridPoint | null;
  readonly hitTargetId: string | null;
}

export function traceGridShot(input: {
  readonly grid: NavigationGrid;
  readonly from: GridPoint;
  readonly aimedTo: GridPoint;
  readonly targets: readonly ShotTraceTarget[];
  readonly hitRadius?: number;
}): GridShotTrace {
  const fromCell = navCell(input.from, input.grid);
  const aimCell = navCell(input.aimedTo, input.grid);
  const cells = rasterLine(fromCell, aimCell);
  const blockingCell = cells.slice(1).find((cell) => !isWalkable(input.grid, cell)) ?? null;
  const aimedDistance = distance(input.from, input.aimedTo);
  const wallDistance = blockingCell === null ? Number.POSITIVE_INFINITY : Math.max(0, distance(input.from, blockingCell) - 0.45);
  const maxTravel = Math.min(aimedDistance, wallDistance);
  const hitRadius = input.hitRadius ?? 0.72;
  const hit = input.targets
    .map((target) => ({ target, ...segmentMetrics(target.position, input.from, input.aimedTo) }))
    .filter((entry) => entry.t >= 0 && entry.t <= 1 && entry.distance <= hitRadius && entry.alongDistance <= maxTravel + 0.05)
    .sort((left, right) => left.alongDistance - right.alongDistance || left.distance - right.distance || left.target.id.localeCompare(right.target.id, 'en'))[0] ?? null;
  const direction = normalize({ x: input.aimedTo.x - input.from.x, y: input.aimedTo.y - input.from.y });
  const impactPoint = hit !== null
    ? { ...hit.target.position }
    : blockingCell !== null
      ? { ...blockingCell }
      : { ...input.aimedTo };
  if (hit === null && blockingCell !== null && maxTravel > 0 && (direction.x !== 0 || direction.y !== 0)) {
    // Keep the visual impact on the wall cell, while hit testing stops before it.
  }
  return {
    from: { ...input.from },
    aimedTo: { ...input.aimedTo },
    impactPoint,
    blockedByWorld: hit === null && blockingCell !== null,
    blockingCell: blockingCell === null ? null : { ...blockingCell },
    hitTargetId: hit?.target.id ?? null,
  };
}

function segmentMetrics(point: GridPoint, start: GridPoint, end: GridPoint): { readonly t: number; readonly distance: number; readonly alongDistance: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) return { t: 0, distance: distance(point, start), alongDistance: 0 };
  const unclamped = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, unclamped));
  const projected = { x: start.x + dx * t, y: start.y + dy * t };
  return { t: unclamped, distance: distance(point, projected), alongDistance: Math.sqrt(lengthSquared) * t };
}

function navCell(point: GridPoint, grid: NavigationGrid): GridPoint {
  return {
    x: Math.max(0, Math.min(grid.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(grid.height - 1, Math.round(point.y))),
  };
}
function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-9 ? { x: 0, y: 0 } : { x: point.x / length, y: point.y / length };
}
function distance(a: GridPoint, b: GridPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
`);

write('Apps/Workbench/src/simulation/recoverySafety.ts', `import { findPath, gridKey, hasLineOfSight, isWalkable, type GridPoint, type NavigationGrid } from './navigation';

export type RecoverySafetyBand = 'stable' | 'pressured' | 'unsafe';
export type RecoverySafetyDecision = 'none' | 'continue' | 'pause' | 'reposition' | 'abort';

export interface RecoverySecurityCandidateInput {
  readonly grid: NavigationGrid;
  readonly casualty: GridPoint;
  readonly security: GridPoint;
  readonly rescuer: GridPoint;
  readonly threat: GridPoint | null;
  readonly failedCells: ReadonlySet<string>;
}
export interface RecoverySecurityCandidate {
  readonly point: GridPoint;
  readonly score: number;
  readonly hasThreatLos: boolean;
  readonly fireLaneClear: boolean;
  readonly pathLength: number;
}
export interface RecoveryTreatmentCandidate {
  readonly point: GridPoint;
  readonly score: number;
  readonly path: readonly GridPoint[];
  readonly pathLength: number;
  readonly exposed: boolean;
  readonly pathExposureCells: number;
}
export interface RecoveryGeometryInput {
  readonly grid: NavigationGrid;
  readonly casualty: GridPoint;
  readonly rescuer: GridPoint;
  readonly security: GridPoint | null;
  readonly threat: GridPoint | null;
  readonly failedTreatmentCells: ReadonlySet<string>;
  readonly failedSecurityCells: ReadonlySet<string>;
}
export interface RecoveryGeometrySolution {
  readonly treatmentPoint: GridPoint;
  readonly approachPoint: GridPoint;
  readonly fallbackPoint: GridPoint;
  readonly treatmentExposed: boolean;
  readonly pathExposureCells: number;
  readonly treatmentScore: number;
  readonly security: RecoverySecurityCandidate | null;
  readonly score: number;
}

export const RECOVERY_SECURITY_ARRIVAL = 1;
export const RECOVERY_SECURITY_MIN_DISTANCE = 2.2;
export const RECOVERY_SECURITY_MAX_DISTANCE = 5.5;
export const RECOVERY_SECURITY_DESIRED_DISTANCE = 3.5;
export const RECOVERY_SECURITY_SEARCH_RADIUS = 6;
export const RECOVERY_TREATMENT_MIN_DISTANCE = 0.75;
export const RECOVERY_TREATMENT_MAX_DISTANCE = 1.45;
export const RECOVERY_TREATMENT_SEARCH_RADIUS = 2;
export const RECOVERY_WEAPON_READY_ROUNDS = 3;
export const FRIENDLY_LANE_RADIUS = 0.68;
export const RECOVERY_PRESSURE_PRESSURED = 0.45;
export const RECOVERY_PRESSURE_UNSAFE = 0.8;
export const RECOVERY_UNSAFE_ABORT_TICKS = 4;
export const RECOVERY_DEADLOCK_TICKS = 4;
export const RECOVERY_MAX_STALL_REPLANS = 3;

export function classifyRecoveryPressure(pressure: number): RecoverySafetyBand {
  if (pressure >= RECOVERY_PRESSURE_UNSAFE) return 'unsafe';
  if (pressure >= RECOVERY_PRESSURE_PRESSURED) return 'pressured';
  return 'stable';
}
export function recoveryDecision(band: RecoverySafetyBand, unsafeTicks: number): RecoverySafetyDecision {
  if (band === 'unsafe') return unsafeTicks >= RECOVERY_UNSAFE_ABORT_TICKS ? 'abort' : 'reposition';
  if (band === 'pressured') return 'pause';
  return 'continue';
}

export function selectRecoveryGeometry(input: RecoveryGeometryInput): RecoveryGeometrySolution | null {
  const treatments = recoveryTreatmentCandidates(input);
  const solutions: RecoveryGeometrySolution[] = [];
  for (const treatment of treatments.slice(0, 12)) {
    const security = input.security === null ? null : selectRecoverySecurityPoint({
      grid: input.grid,
      casualty: input.casualty,
      security: input.security,
      rescuer: treatment.point,
      threat: input.threat,
      failedCells: input.failedSecurityCells,
    });
    if (input.security !== null && security === null) continue;
    const approachPoint = treatment.path[Math.max(0, treatment.path.length - 2)] ?? treatment.point;
    const fallbackPoint = selectCoveredFallback(input.grid, treatment.path, input.threat, approachPoint);
    const securityScore = security?.score ?? 0;
    solutions.push({
      treatmentPoint: { ...treatment.point },
      approachPoint: { ...approachPoint },
      fallbackPoint: { ...fallbackPoint },
      treatmentExposed: treatment.exposed,
      pathExposureCells: treatment.pathExposureCells,
      treatmentScore: treatment.score,
      security,
      score: treatment.score + securityScore * 0.72,
    });
  }
  solutions.sort((left, right) => right.score - left.score || Number(left.treatmentExposed) - Number(right.treatmentExposed) || left.pathExposureCells - right.pathExposureCells || left.treatmentPoint.y - right.treatmentPoint.y || left.treatmentPoint.x - right.treatmentPoint.x);
  return solutions[0] ?? null;
}

export function selectRecoverySecurityPoint(input: RecoverySecurityCandidateInput): RecoverySecurityCandidate | null {
  const center = navCell(input.casualty, input.grid);
  const start = navCell(input.security, input.grid);
  const candidates: RecoverySecurityCandidate[] = [];
  for (let y = center.y - RECOVERY_SECURITY_SEARCH_RADIUS; y <= center.y + RECOVERY_SECURITY_SEARCH_RADIUS; y += 1) {
    for (let x = center.x - RECOVERY_SECURITY_SEARCH_RADIUS; x <= center.x + RECOVERY_SECURITY_SEARCH_RADIUS; x += 1) {
      const point = { x, y };
      if (!isWalkable(input.grid, point) || input.failedCells.has(gridKey(point))) continue;
      if (gridKey(point) === gridKey(navCell(input.rescuer, input.grid))) continue;
      const casualtyDistance = distance(point, input.casualty);
      if (casualtyDistance < RECOVERY_SECURITY_MIN_DISTANCE || casualtyDistance > RECOVERY_SECURITY_MAX_DISTANCE) continue;
      const path = findPath(input.grid, start, point);
      if (path.length === 0) continue;
      const hasThreatLos = input.threat === null ? false : hasLineOfSight(input.grid, point, navCell(input.threat, input.grid));
      const fireLaneClear = input.threat === null || (
        pointSegmentDistance(input.casualty, point, input.threat) > FRIENDLY_LANE_RADIUS
        && pointSegmentDistance(input.rescuer, point, input.threat) > FRIENDLY_LANE_RADIUS
      );
      const spacingPenalty = Math.abs(casualtyDistance - RECOVERY_SECURITY_DESIRED_DISTANCE) * 2.2;
      const pathPenalty = Math.max(0, path.length - 1) * 0.18;
      const losBonus = input.threat === null ? 0 : hasThreatLos ? 7 : -5;
      const laneBonus = fireLaneClear ? 4 : -10;
      candidates.push({ point, score: losBonus + laneBonus - spacingPenalty - pathPenalty, hasThreatLos, fireLaneClear, pathLength: path.length });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.pathLength - right.pathLength || left.point.y - right.point.y || left.point.x - right.point.x);
  return candidates[0] ?? null;
}

export function recoveryFireLaneClear(from: GridPoint, to: GridPoint, friendPositions: readonly GridPoint[]): boolean {
  return friendPositions.every((friend) => pointSegmentDistance(friend, from, to) > FRIENDLY_LANE_RADIUS);
}
export function pointSegmentDistance(point: GridPoint, start: GridPoint, end: GridPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
}

function recoveryTreatmentCandidates(input: RecoveryGeometryInput): RecoveryTreatmentCandidate[] {
  const casualty = navCell(input.casualty, input.grid);
  const start = navCell(input.rescuer, input.grid);
  const threat = input.threat === null ? null : navCell(input.threat, input.grid);
  const candidates: RecoveryTreatmentCandidate[] = [];
  for (let y = casualty.y - RECOVERY_TREATMENT_SEARCH_RADIUS; y <= casualty.y + RECOVERY_TREATMENT_SEARCH_RADIUS; y += 1) {
    for (let x = casualty.x - RECOVERY_TREATMENT_SEARCH_RADIUS; x <= casualty.x + RECOVERY_TREATMENT_SEARCH_RADIUS; x += 1) {
      const point = { x, y };
      if (!isWalkable(input.grid, point) || input.failedTreatmentCells.has(gridKey(point))) continue;
      const casualtyDistance = distance(point, input.casualty);
      if (casualtyDistance < RECOVERY_TREATMENT_MIN_DISTANCE || casualtyDistance > RECOVERY_TREATMENT_MAX_DISTANCE) continue;
      const path = findPath(input.grid, start, point);
      if (path.length === 0) continue;
      const exposed = threat !== null && hasLineOfSight(input.grid, point, threat);
      const pathExposureCells = threat === null ? 0 : path.filter((cell) => hasLineOfSight(input.grid, cell, threat)).length;
      const coverScore = threat === null ? 4 : exposed ? -24 : 24;
      const pathExposurePenalty = pathExposureCells * 2.5;
      const pathPenalty = Math.max(0, path.length - 1) * 0.24;
      const spacingPenalty = Math.abs(casualtyDistance - 1.05) * 1.4;
      const threatSeparationBonus = threat === null ? 0 : Math.min(4, distance(point, threat) * 0.14);
      candidates.push({ point, score: coverScore + threatSeparationBonus - pathExposurePenalty - pathPenalty - spacingPenalty, path, pathLength: path.length, exposed, pathExposureCells });
    }
  }
  candidates.sort((left, right) => Number(left.exposed) - Number(right.exposed) || left.pathExposureCells - right.pathExposureCells || right.score - left.score || left.pathLength - right.pathLength || left.point.y - right.point.y || left.point.x - right.point.x);
  return candidates;
}

function selectCoveredFallback(grid: NavigationGrid, path: readonly GridPoint[], threat: GridPoint | null, approachPoint: GridPoint): GridPoint {
  if (path.length === 0) return approachPoint;
  if (threat === null) return path[Math.max(0, path.length - 3)] ?? path[0]!;
  const threatCell = navCell(threat, grid);
  const approachIndex = Math.max(0, path.findIndex((cell) => gridKey(cell) === gridKey(approachPoint)));
  let fallback = path[0]!;
  for (let index = 0; index <= approachIndex; index += 1) {
    const cell = path[index]!;
    if (!hasLineOfSight(grid, cell, threatCell)) fallback = cell;
  }
  return fallback;
}
function navCell(point: GridPoint, grid: NavigationGrid): GridPoint {
  return { x: Math.max(0, Math.min(grid.width - 1, Math.round(point.x))), y: Math.max(0, Math.min(grid.height - 1, Math.round(point.y))) };
}
function distance(a: GridPoint, b: GridPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
`);

edit('Apps/Workbench/src/simulation/tacticalWizardRuntime.ts', [
  ["import { findPath, gridKey, hasLineOfSight, type GridPoint } from './navigation';\n", "import { findPath, gridKey, hasLineOfSight, type GridPoint } from './navigation';\nimport { traceGridShot } from './combatTrace';\n", 'combat trace import'],
  ["  selectRecoverySecurityPoint,\n", "  selectRecoveryGeometry,\n", 'joint recovery solver import'],
  ["    readonly stagePoint: GridPoint | null;\n    readonly treatmentPoint: GridPoint | null;\n    readonly securityPoint: GridPoint | null;\n", "    readonly stagePoint: GridPoint | null;\n    readonly approachPoint: GridPoint | null;\n    readonly treatmentPoint: GridPoint | null;\n    readonly fallbackPoint: GridPoint | null;\n    readonly securityPoint: GridPoint | null;\n    readonly treatmentExposed: boolean;\n    readonly pathExposureCells: number;\n    readonly tacticalPlanningSuspended: boolean;\n", 'dynamic recovery view'],
  ["  safeFireLaneCount: () => number;\n  applyRoles: () => void;\n", "  safeFireLaneCount: () => number;\n  setOperationalContext: (context: { readonly suspendTacticalClock: boolean; readonly excludedAgentIds: readonly string[]; readonly playerFacing: GridPoint }) => void;\n  applyRoles: () => void;\n", 'host operational context contract'],
  ["  readonly stagePoint: GridPoint;\n  securityPoint: GridPoint | null;\n", "  stagePoint: GridPoint;\n  treatmentPoint: GridPoint;\n  approachPoint: GridPoint;\n  fallbackPoint: GridPoint;\n  treatmentExposed: boolean;\n  pathExposureCells: number;\n  securityPoint: GridPoint | null;\n", 'recovery plan geometry fields'],
  ["  firePressure: number;\n}\n", "  firePressure: number;\n  shotBlockedByWorld: boolean;\n}\n", 'player shot trace state'],
  ["  private readonly recoveryFailedSecurityPoints = new Map<string, number>();\n", "  private readonly recoveryFailedSecurityPoints = new Map<string, number>();\n  private readonly recoveryFailedTreatmentPoints = new Map<string, number>();\n", 'failed treatment cells'],
  ["    this.recoveryFailedSecurityPoints.clear();\n", "    this.recoveryFailedSecurityPoints.clear();\n    this.recoveryFailedTreatmentPoints.clear();\n", 'reset failed treatment cells'],
  ["    this.ensureFireSupportCapability(before);\n\n    this.tacticalHost.advance(deltaSeconds);\n", "    this.ensureFireSupportCapability(before);\n    this.syncHostOperationalContext(before);\n\n    this.tacticalHost.advance(deltaSeconds);\n", 'sync host before advance'],
  ["      dynamicRecovery: {\n        active: recovery.phase !== 'none',\n        stagePoint: clonePoint(this.recoveryPlan?.stagePoint ?? null),\n        treatmentPoint: clonePoint(recovery.approachTarget),\n        securityPoint: clonePoint(this.recoveryPlan?.securityPoint ?? null),\n      },\n", "      dynamicRecovery: {\n        active: recovery.phase !== 'none',\n        stagePoint: clonePoint(this.recoveryPlan?.stagePoint ?? null),\n        approachPoint: clonePoint(this.recoveryPlan?.approachPoint ?? null),\n        treatmentPoint: clonePoint(this.recoveryPlan?.treatmentPoint ?? null),\n        fallbackPoint: clonePoint(this.recoveryPlan?.fallbackPoint ?? null),\n        securityPoint: clonePoint(this.recoveryPlan?.securityPoint ?? null),\n        treatmentExposed: this.recoveryPlan?.treatmentExposed ?? false,\n        pathExposureCells: this.recoveryPlan?.pathExposureCells ?? 0,\n        tacticalPlanningSuspended: this.recoveryPlan !== null,\n      },\n", 'dynamic recovery state'],
  ["    this.startRecoveryIfNeeded(this.hostState());\n    return true;\n  }\n\n  applyGrenadeDoctrineForTest", "    const state = this.hostState();\n    this.startRecoveryIfNeeded(state);\n    this.syncHostOperationalContext(state);\n    return true;\n  }\n\n  applyGrenadeDoctrineForTest", 'manual vitals operational sync'],
]);

edit('Apps/Workbench/src/simulation/tacticalWizardRuntime.ts', [[`  playerFireAt(point: GridPoint): boolean {
    if (!this.setPlayerAimTarget(point)) return false;
    const state = this.hostState();
    this.playerCombat.shotPulse = 4;
    this.playerCombat.shotFrom = { ...state.player };
    this.playerCombat.shotTo = { ...point };
    this.playerCombat.shotsRecent = Math.min(8, this.playerCombat.shotsRecent + 1);
    this.playerCombat.firePressure = Math.min(1, this.playerCombat.firePressure + 0.2);
    this.tacticalHost.emitNoise(1);
    this.observeRecoveryShot(state, point);

    const target = [...state.agents]
      .filter((agent) => this.equipment.get(agent.id)?.health !== undefined && this.equipment.get(agent.id)!.health > 0)
      .map((agent) => ({ agent, distance: Math.hypot(agent.position.x - point.x, agent.position.y - point.y) }))
      .filter((entry) => entry.distance <= 0.85)
      .sort((left, right) => left.distance - right.distance || left.agent.id.localeCompare(right.agent.id, 'en'))[0]?.agent ?? null;

    this.hostAccess().log('player', 'player', 'Player', 'fire', 'Player fired; fixed hierarchy evaluated hit and reaction.', {
      from: { ...state.player },
      to: { ...point },
      hitAgentId: target?.id ?? null,
      damage: target === null ? 0 : PLAYER_DAMAGE,
      shotsRecent: this.playerCombat.shotsRecent,
      firePressure: Number(this.playerCombat.firePressure.toFixed(2)),
    });
    if (target !== null) this.damageAgent(target.id, PLAYER_DAMAGE, state.player, 'player_rifle');
    return true;
  }
`, `  playerFireAt(point: GridPoint): boolean {
    if (!this.setPlayerAimTarget(point)) return false;
    const state = this.hostState();
    const trace = traceGridShot({
      grid: tacticalWizardNavigationGrid,
      from: state.player,
      aimedTo: point,
      targets: state.agents.filter((agent) => this.isAlive(agent.id)).map((agent) => ({ id: agent.id, position: agent.position })),
    });
    this.playerCombat.shotPulse = 4;
    this.playerCombat.shotFrom = { ...state.player };
    this.playerCombat.shotTo = { ...trace.impactPoint };
    this.playerCombat.shotBlockedByWorld = trace.blockedByWorld;
    this.playerCombat.shotsRecent = Math.min(8, this.playerCombat.shotsRecent + 1);
    this.playerCombat.firePressure = Math.min(1, this.playerCombat.firePressure + 0.2);
    this.tacticalHost.emitNoise(1);
    this.observeRecoveryShot(state, trace.impactPoint);
    const target = trace.hitTargetId === null ? null : state.agents.find((agent) => agent.id === trace.hitTargetId) ?? null;

    this.hostAccess().log('player', 'player', 'Player', 'fire', 'Player fired; world collision, hit and recovery pressure used one shot trace.', {
      from: { ...state.player },
      aimedTo: { ...point },
      impactTo: { ...trace.impactPoint },
      blockedByWorld: trace.blockedByWorld,
      blockingCell: trace.blockingCell === null ? null : { ...trace.blockingCell },
      hitAgentId: target?.id ?? null,
      damage: target === null ? 0 : PLAYER_DAMAGE,
      shotsRecent: this.playerCombat.shotsRecent,
      firePressure: Number(this.playerCombat.firePressure.toFixed(2)),
    });
    if (target !== null) this.damageAgent(target.id, PLAYER_DAMAGE, state.player, 'player_rifle');
    return true;
  }
`, 'world-aware player shot trace']]);

edit('Apps/Workbench/src/simulation/tacticalWizardRuntime.ts', [[`    this.recoveryPlan = {
      patientId: patient.id,
      rescuerId: rescuer.id,
      covererId: coverer?.id ?? null,
      phase: 'establish_cover',
      startedTick: state.logicalTick,
      treatmentProgress: 0,
      stagePoint: { ...rescuer.position },
      securityPoint: null,
      lastProgressTick: state.logicalTick,
      lastTreatmentProgress: 0,
      lastRescuerDistance: distance(rescuer.position, patient.position),
      stalledTicks: 0,
      stallReplans: 0,
    };
    this.recoveryPressure = 0;
    this.recoverySafetyBand = 'stable';
    this.recoverySafetyDecision = 'continue';
    this.recoveryUnsafeSinceTick = null;
    this.recoveryIneffectiveSinceTick = null;
    this.replanRecoverySecurity(state, 'recovery_started', false);
    this.handoffSupport(rescuer.id, 'rescuer released from fire-support duty', true);
`, `    this.recoveryPlan = {
      patientId: patient.id,
      rescuerId: rescuer.id,
      covererId: coverer?.id ?? null,
      phase: 'establish_cover',
      startedTick: state.logicalTick,
      treatmentProgress: 0,
      stagePoint: { ...rescuer.position },
      treatmentPoint: { ...patient.position },
      approachPoint: { ...rescuer.position },
      fallbackPoint: { ...rescuer.position },
      treatmentExposed: false,
      pathExposureCells: 0,
      securityPoint: null,
      lastProgressTick: state.logicalTick,
      lastTreatmentProgress: 0,
      lastRescuerDistance: distance(rescuer.position, patient.position),
      stalledTicks: 0,
      stallReplans: 0,
    };
    this.recoveryPressure = 0;
    this.recoverySafetyBand = 'stable';
    this.recoverySafetyDecision = 'continue';
    this.recoveryUnsafeSinceTick = null;
    this.recoveryIneffectiveSinceTick = null;
    this.replanRecoveryGeometry(state, 'recovery_started', false);
`, 'start recovery with joint geometry']]);

edit('Apps/Workbench/src/simulation/tacticalWizardRuntime.ts', [[`    if (plan.phase === 'establish_cover') {
      if (plan.covererId === null || state.logicalTick - plan.startedTick >= 2) plan.phase = 'approach';
      return;
    }
    const range = distance(rescuer.position, patient.position);
    if (plan.phase === 'approach') {
      if (range <= RECOVERY_RANGE) plan.phase = 'treat';
      return;
    }
    if (range > RECOVERY_RANGE + 0.35) {
      plan.phase = 'approach';
      plan.treatmentProgress = 0;
      return;
    }
`, `    if (plan.phase === 'establish_cover') {
      if (plan.covererId === null) {
        plan.phase = 'approach';
      } else {
        const coverer = state.agents.find((agent) => agent.id === plan.covererId);
        const securityReady = coverer !== undefined && plan.securityPoint !== null && distance(coverer.position, plan.securityPoint) <= RECOVERY_SECURITY_ARRIVAL;
        if (securityReady) plan.phase = 'approach';
      }
      return;
    }
    const treatmentRange = distance(rescuer.position, plan.treatmentPoint);
    if (plan.phase === 'approach') {
      if (treatmentRange <= 0.65 && distance(plan.treatmentPoint, patient.position) <= RECOVERY_RANGE) plan.phase = 'treat';
      return;
    }
    if (treatmentRange > 0.85 || distance(plan.treatmentPoint, patient.position) > RECOVERY_RANGE) {
      plan.phase = 'approach';
      plan.treatmentProgress = 0;
      return;
    }
`, 'recovery progress uses treatment point']]);

edit('Apps/Workbench/src/simulation/tacticalWizardRuntime.ts', [[`    if (agentId === plan.rescuerId) {
      if (this.recoverySafetyDecision === 'reposition') return { role: 'rescuer', target: clonePoint(plan.stagePoint), patientId: plan.patientId };
      if (this.recoverySafetyDecision === 'pause') return { role: 'rescuer', target: null, patientId: plan.patientId };
      return { role: 'rescuer', target: clonePoint(patient?.position ?? null), patientId: plan.patientId };
    }
`, `    if (agentId === plan.rescuerId) {
      if (this.recoverySafetyDecision === 'reposition') return { role: 'rescuer', target: clonePoint(plan.fallbackPoint), patientId: plan.patientId };
      if (this.recoverySafetyDecision === 'pause') return { role: 'rescuer', target: null, patientId: plan.patientId };
      if (plan.phase === 'establish_cover') return { role: 'rescuer', target: clonePoint(plan.approachPoint), patientId: plan.patientId };
      return { role: 'rescuer', target: clonePoint(plan.treatmentPoint), patientId: plan.patientId };
    }
`, 'rescuer uses planned geometry'],
  ["    const patient = state.agents.find((agent) => agent.id === plan.patientId);\n    return { phase: plan.phase, downedAgentId: plan.patientId, rescuerId: plan.rescuerId, covererId: plan.covererId, approachTarget: clonePoint(patient?.position ?? null), treatmentProgress: plan.treatmentProgress, medicalResupplyAgentId: null, medicalResupplySupplyId: null };\n", "    return { phase: plan.phase, downedAgentId: plan.patientId, rescuerId: plan.rescuerId, covererId: plan.covererId, approachTarget: clonePoint(plan.treatmentPoint), treatmentProgress: plan.treatmentProgress, medicalResupplyAgentId: null, medicalResupplySupplyId: null };\n", 'recovery view treatment target']]);

edit('Apps/Workbench/src/simulation/tacticalWizardRuntime.ts', [[`  private observeRecoveryShot(state: TacticalHostState, shotTo: GridPoint): void {
    const plan = this.recoveryPlan;
    if (plan === null) return;
    const protectedAgents = state.agents.filter((agent) => agent.id === plan.patientId || agent.id === plan.rescuerId || agent.id === plan.covererId);
    if (protectedAgents.length === 0) return;
    const nearest = Math.min(...protectedAgents.map((agent) => pointSegmentDistance(agent.position, state.player, shotTo)));
    const endpoint = Math.min(...protectedAgents.map((agent) => distance(agent.position, shotTo)));
    const added = endpoint <= 0.9 ? 0.46 : nearest <= 0.9 ? 0.4 : nearest <= 2.1 ? 0.32 : nearest <= 4 ? 0.18 : 0.08;
    this.recoveryPressure = Math.min(1, this.recoveryPressure + added);
  }
`, `  private observeRecoveryShot(state: TacticalHostState, shotTo: GridPoint): void {
    const plan = this.recoveryPlan;
    if (plan === null) return;
    const protectedAgents = state.agents
      .filter((agent) => agent.id === plan.patientId || agent.id === plan.rescuerId || agent.id === plan.covererId)
      .filter((agent) => hasLineOfSight(tacticalWizardNavigationGrid, navCell(state.player), navCell(agent.position)));
    if (protectedAgents.length === 0) return;
    const nearest = Math.min(...protectedAgents.map((agent) => pointSegmentDistance(agent.position, state.player, shotTo)));
    const endpoint = Math.min(...protectedAgents.map((agent) => distance(agent.position, shotTo)));
    const added = endpoint <= 0.9 ? 0.46 : nearest <= 0.9 ? 0.4 : nearest <= 2.1 ? 0.32 : nearest <= 4 ? 0.18 : 0.08;
    this.recoveryPressure = Math.min(1, this.recoveryPressure + added);
  }
`, 'world-aware recovery shot pressure']]);

edit('Apps/Workbench/src/simulation/tacticalWizardRuntime.ts', [
  ["    const securityIneffective = threat !== null && (!weaponReady || !positionReady || !lineOfSightReady || !fireLaneReady || !reactionReady);\n\n    if (securityIneffective) {\n      this.recoveryIneffectiveSinceTick ??= state.logicalTick;\n      if (state.logicalTick - this.recoveryIneffectiveSinceTick >= 2) this.recoveryPressure = Math.max(this.recoveryPressure, 0.5);\n      if ((!lineOfSightReady || !fireLaneReady || !positionReady) && state.logicalTick - this.recoveryLastReplanTick >= 3) {\n        this.replanRecoverySecurity(state, !lineOfSightReady ? 'security_lost_los' : !fireLaneReady ? 'security_fire_lane_blocked' : 'security_position_not_reached', true);\n      }\n    } else this.recoveryIneffectiveSinceTick = null;\n", "    const securityStalled = security !== null && !positionReady && security.stalledTicks >= 45;\n    const securityIneffective = threat !== null && (!weaponReady || !reactionReady || securityStalled || (positionReady && (!lineOfSightReady || !fireLaneReady)));\n\n    if (securityIneffective) {\n      this.recoveryIneffectiveSinceTick ??= state.logicalTick;\n      if (state.logicalTick - this.recoveryIneffectiveSinceTick >= 2) this.recoveryPressure = Math.max(this.recoveryPressure, 0.5);\n      if ((securityStalled || (positionReady && (!lineOfSightReady || !fireLaneReady))) && state.logicalTick - this.recoveryLastReplanTick >= 3) {\n        this.replanRecoveryGeometry(state, securityStalled ? 'security_path_stalled' : !lineOfSightReady ? 'security_lost_los' : 'security_fire_lane_blocked', true);\n      }\n    } else this.recoveryIneffectiveSinceTick = null;\n", 'security evaluates geometry after arrival'],
  ["      this.replanRecoverySecurity(state, 'incoming_fire_forced_reposition', true);\n", "      this.replanRecoveryGeometry(state, 'incoming_fire_forced_reposition', true);\n", 'incoming fire replans full geometry'],
  ["      const rescuerDistance = distance(rescuer.position, patient.position);\n", "      const rescuerDistance = distance(rescuer.position, plan.treatmentPoint);\n", 'watchdog treatment distance'],
  ["        this.replanRecoverySecurity(state, 'recovery_progress_watchdog', true);\n", "        this.replanRecoveryGeometry(state, 'recovery_progress_watchdog', true);\n", 'watchdog full geometry'],
  ["        this.replanRecoverySecurity(state, 'friendly_fire_lane_blocked', true);\n", "        this.replanRecoveryGeometry(state, 'friendly_fire_lane_blocked', true);\n", 'fire lane full geometry'],
]);

const runtimePath = 'Apps/Workbench/src/simulation/tacticalWizardRuntime.ts';
let runtime = read(runtimePath);
const replanStart = runtime.indexOf('  private replanRecoverySecurity(state: TacticalHostState, reason: string, countReplan: boolean): boolean {');
const replanEnd = runtime.indexOf('  private recoveryThreatPoint(state: TacticalHostState): GridPoint | null {', replanStart);
if (replanStart < 0 || replanEnd < 0) throw new Error('Missing recovery replan method range');
runtime = runtime.slice(0, replanStart) + `  private replanRecoveryGeometry(state: TacticalHostState, reason: string, countReplan: boolean): boolean {
    const plan = this.recoveryPlan;
    if (plan === null) return false;
    const patient = state.agents.find((agent) => agent.id === plan.patientId);
    const rescuer = state.agents.find((agent) => agent.id === plan.rescuerId);
    const security = plan.covererId === null ? null : state.agents.find((agent) => agent.id === plan.covererId) ?? null;
    if (patient === undefined || rescuer === undefined) return false;
    for (const [key, expires] of this.recoveryFailedSecurityPoints) if (expires <= state.logicalTick) this.recoveryFailedSecurityPoints.delete(key);
    for (const [key, expires] of this.recoveryFailedTreatmentPoints) if (expires <= state.logicalTick) this.recoveryFailedTreatmentPoints.delete(key);
    if (countReplan) {
      if (plan.securityPoint !== null) this.recoveryFailedSecurityPoints.set(gridKey(navCell(plan.securityPoint)), state.logicalTick + 24);
      this.recoveryFailedTreatmentPoints.set(gridKey(navCell(plan.treatmentPoint)), state.logicalTick + 18);
    }
    const selected = selectRecoveryGeometry({
      grid: tacticalWizardNavigationGrid,
      casualty: patient.position,
      rescuer: rescuer.position,
      security: security?.position ?? null,
      threat: this.recoveryThreatPoint(state),
      failedTreatmentCells: new Set(this.recoveryFailedTreatmentPoints.keys()),
      failedSecurityCells: new Set(this.recoveryFailedSecurityPoints.keys()),
    });
    if (selected === null) return false;
    plan.treatmentPoint = { ...selected.treatmentPoint };
    plan.approachPoint = { ...selected.approachPoint };
    plan.fallbackPoint = { ...selected.fallbackPoint };
    plan.stagePoint = { ...selected.fallbackPoint };
    plan.treatmentExposed = selected.treatmentExposed;
    plan.pathExposureCells = selected.pathExposureCells;
    plan.securityPoint = selected.security === null ? null : { ...selected.security.point };
    const coverMember = plan.covererId === null ? undefined : this.hostAccess().members.find((entry) => entry.id === plan.covererId);
    if (coverMember !== undefined && plan.securityPoint !== null) coverMember.tacticalTarget = { ...plan.securityPoint };
    this.contracts.delete(plan.rescuerId);
    if (plan.covererId !== null) this.contracts.delete(plan.covererId);
    this.recoveryLastReplanTick = state.logicalTick;
    this.recoveryLastReplanReason = reason;
    if (countReplan) this.recoverySafetyReplans += 1;
    this.hostAccess().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Recovery treatment / approach / security geometry replanned.', {
      reason,
      treatmentPoint: { ...selected.treatmentPoint },
      approachPoint: { ...selected.approachPoint },
      fallbackPoint: { ...selected.fallbackPoint },
      treatmentExposed: selected.treatmentExposed,
      pathExposureCells: selected.pathExposureCells,
      securityPoint: selected.security === null ? null : { ...selected.security.point },
      securityHasThreatLos: selected.security?.hasThreatLos ?? false,
      securityFireLaneClear: selected.security?.fireLaneClear ?? false,
      safetyReplans: this.recoverySafetyReplans,
    });
    return true;
  }

` + runtime.slice(replanEnd);
write(runtimePath, runtime);

edit(runtimePath, [
  ["    this.recoveryPlan = null;\n    this.hostAccess().applyRoles();\n    this.hostAccess().refreshTacticalPlan();\n", "    this.recoveryPlan = null;\n    this.syncHostOperationalContext(this.hostState());\n    this.hostAccess().applyRoles();\n    this.hostAccess().refreshTacticalPlan();\n", 'resume tactics after treatment'],
  ["    this.recoveryPlan = null;\n    this.contracts.clear();\n    this.hostAccess().applyRoles();\n    this.hostAccess().refreshTacticalPlan();\n", "    this.recoveryPlan = null;\n    this.contracts.clear();\n    this.syncHostOperationalContext(this.hostState());\n    this.hostAccess().applyRoles();\n    this.hostAccess().refreshTacticalPlan();\n", 'resume tactics after abort'],
  ["    this.hostAccess().log('agent', agentId, member.label, 'decision', `${member.label} health changed from incoming threat.`, { health: equipment.health, damage, reason });\n    this.startRecoveryIfNeeded(this.hostState());\n", "    this.hostAccess().log('agent', agentId, member.label, 'decision', `${member.label} health changed from incoming threat.`, { health: equipment.health, damage, reason });\n    const state = this.hostState();\n    this.startRecoveryIfNeeded(state);\n    this.syncHostOperationalContext(state);\n", 'damage operational sync'],
  ["    if (this.recoveryPlan !== null) return 'Recovery owns casualty approach/security; Tactical Planning keeps the remaining element coherent.';\n", "    if (this.recoveryPlan !== null) return 'Recovery owns casualty geometry; normal maneuver doctrine is suspended until rescue completes or aborts.';\n", 'recovery command order'],
  ["  private initializeEquipment(): void {\n", "  private syncHostOperationalContext(state: TacticalHostState): void {\n    const excludedAgentIds = state.agents.filter((agent) => !this.isAlive(agent.id)).map((agent) => agent.id);\n    this.hostAccess().setOperationalContext({ suspendTacticalClock: this.recoveryPlan !== null, excludedAgentIds, playerFacing: this.playerCombat.facing });\n  }\n\n  private initializeEquipment(): void {\n", 'operational sync method'],
  ["  return { facing: { x: -1, y: 0 }, aimTarget: { ...player }, selectedGrenade: 'flash', grenadeInventory: { flash: 3, frag: 3, smoke: 3 }, shotPulse: 0, shotFrom: null, shotTo: null, shotsRecent: 0, firePressure: 0 };\n", "  return { facing: { x: -1, y: 0 }, aimTarget: { ...player }, selectedGrenade: 'flash', grenadeInventory: { flash: 3, frag: 3, smoke: 3 }, shotPulse: 0, shotFrom: null, shotTo: null, shotsRecent: 0, firePressure: 0, shotBlockedByWorld: false };\n", 'player combat default trace state'],
]);

// Host: suspend doctrine clocks during rescue, exclude incapacitated members from planning, and connect flank geometry to surprise fire.
edit('Apps/Workbench/src/simulation/tacticalWizardHost.ts', [
  ["  specialActionPulse: number;\n  meleePulse: number;\n", "  specialActionPulse: number;\n  surpriseUsedThisPlan: boolean;\n  meleePulse: number;\n", 'surprise plan state'],
  ["  private lastPlanReplanTick = -999;\n", "  private lastPlanReplanTick = -999;\n  private tacticalPlanningSuspended = false;\n  private readonly tacticalExcludedAgentIds = new Set<string>();\n  private operationalPlayerFacing: GridPoint = { x: 1, y: 0 };\n", 'operational planning state'],
  ["    this.lastPlanReplanTick = -999;\n    this.eventLog.splice", "    this.lastPlanReplanTick = -999;\n    this.tacticalPlanningSuspended = false;\n    this.tacticalExcludedAgentIds.clear();\n    this.operationalPlayerFacing = { x: 1, y: 0 };\n    this.eventLog.splice", 'reset operational planning state'],
  ["  nudgePlayer(dx: number, dy: number): boolean {\n    const moved = this.setPlayerPositionInternal({ x: this.player.x + dx * PLAYER_MOVE_STEP, y: this.player.y + dy * PLAYER_MOVE_STEP }, 'direct-control');\n    if (moved) this.pendingNoiseIntensity = Math.max(this.pendingNoiseIntensity, 0.35);\n    return moved;\n  }\n\n  step():", "  nudgePlayer(dx: number, dy: number): boolean {\n    const moved = this.setPlayerPositionInternal({ x: this.player.x + dx * PLAYER_MOVE_STEP, y: this.player.y + dy * PLAYER_MOVE_STEP }, 'direct-control');\n    if (moved) this.pendingNoiseIntensity = Math.max(this.pendingNoiseIntensity, 0.35);\n    return moved;\n  }\n\n  setOperationalContext(context: { readonly suspendTacticalClock: boolean; readonly excludedAgentIds: readonly string[]; readonly playerFacing: GridPoint }): void {\n    this.tacticalPlanningSuspended = context.suspendTacticalClock;\n    this.tacticalExcludedAgentIds.clear();\n    for (const id of context.excludedAgentIds) this.tacticalExcludedAgentIds.add(id);\n    this.operationalPlayerFacing = normalizeDirection(context.playerFacing);\n    this.normalizeRoleOrder();\n  }\n\n  step():", 'public operational context'],
  ["    if (this.alertState === 'active') {\n      this.updateDoctrine(visibility);\n      this.ensureTacticalPlan();\n    }\n", "    if (this.alertState === 'active') {\n      if (this.tacticalPlanningSuspended) {\n        this.tacticStartedTick += 1;\n        this.contactStartedTick += 1;\n        this.phaseStartedTick += 1;\n        this.tacticReason = `Current ${this.tactic} maneuver is suspended while Recovery owns the execution geometry.`;\n      } else {\n        this.updateDoctrine(visibility);\n        this.ensureTacticalPlan();\n      }\n    }\n", 'freeze doctrine clocks'],
  ["    this.advancePatrolIfReady();\n    this.advanceBoundingIfReady();\n", "    this.advancePatrolIfReady();\n    if (!this.tacticalPlanningSuspended) this.advanceBoundingIfReady();\n", 'freeze bounding handoff'],
  ["  private executeDecisionEffects(): void {\n    if (this.alertState !== 'active' || this.sharedLastKnownPosition === null) return;\n", "  private executeDecisionEffects(): void {\n    if (this.alertState !== 'active' || this.sharedLastKnownPosition === null || this.tacticalPlanningSuspended) return;\n", 'suspend tactical weapon effects'],
  ["      else if (this.tactic === 'flank' && member.role === 'flanker' && settled && this.logicalTick % 2 === 0) this.tryFire(member, this.sharedLastKnownPosition, 'flanking fire');\n", "      else if (this.tactic === 'flank' && member.role === 'flanker' && settled && this.logicalTick % 2 === 0) {\n        const surprise = !member.surpriseUsedThisPlan && this.isRearQuarterOpportunity(member);\n        if (surprise) {\n          member.surpriseUsedThisPlan = true;\n          member.specialAction = 'surprise';\n          member.specialActionPulse = 12;\n          member.opportunityPurpose = 'ambush';\n          this.pushEvent(`T${this.logicalTick}: ${member.label} completed the flank outside the player's forward attention and opened with surprise fire.`);\n          this.log('agent', member.id, member.label, 'fire', `${member.label} converted a completed flank into a surprise opening.`, { tactic: this.tactic, rearQuarter: true, target: { ...this.sharedLastKnownPosition } });\n        }\n        this.tryFire(member, this.sharedLastKnownPosition, surprise ? 'surprise flanking fire' : 'flanking fire');\n      }\n", 'flank surprise opening'],
]);

edit('Apps/Workbench/src/simulation/tacticalWizardHost.ts', [
  ["    const visibleMembers = this.members.filter((member) => visibility.get(member.id) === true);\n", "    const visibleMembers = this.eligibleMembers().filter((member) => visibility.get(member.id) === true);\n", 'eligible alert reporters'],
  ["      visibleMembers: this.members.filter((member) => visibility.get(member.id) === true).length,\n      stalledMembers: this.members.filter((member) => member.stalledTicks >= STALLED_REPLAN_FRAMES).length,\n", "      visibleMembers: this.eligibleMembers().filter((member) => visibility.get(member.id) === true).length,\n      stalledMembers: this.eligibleMembers().filter((member) => member.stalledTicks >= STALLED_REPLAN_FRAMES).length,\n", 'eligible doctrine counts'],
  ["  private applyRoles(): void {\n    for (const member of this.members) {\n      if (this.alertState !== 'active') member.role = 'patrol';\n", "  private applyRoles(): void {\n    this.normalizeRoleOrder();\n    for (const member of this.members) {\n      if (this.tacticalExcludedAgentIds.has(member.id)) {\n        member.role = 'support';\n        member.task = 'regroup';\n        member.tacticalTarget = null;\n        member.opportunityPurpose = 'none';\n        continue;\n      }\n      if (this.alertState !== 'active') member.role = 'patrol';\n", 'excluded role handling'],
  ["      const sweepers = this.members.filter((member) => member.task === 'search_sector');\n", "      const sweepers = this.eligibleMembers().filter((member) => member.task === 'search_sector');\n", 'eligible sweep completion'],
  ["      const member = this.members.find((entry) => entry.id === id);\n      return member?.tacticalTarget !== null", "      const member = this.members.find((entry) => entry.id === id);\n      if (member === undefined || this.tacticalExcludedAgentIds.has(member.id)) return false;\n      return member.tacticalTarget !== null", 'eligible settled role'],
  ["    const settledCount = this.members.filter((member) => member.tacticalTarget !== null && distance(member.position, member.tacticalTarget) <= ARRIVAL_RADIUS).length;\n    return settledCount >= 2 ? 1 : settledCount / this.members.length;\n", "    const eligible = this.eligibleMembers();\n    const settledCount = eligible.filter((member) => member.tacticalTarget !== null && distance(member.position, member.tacticalTarget) <= ARRIVAL_RADIUS).length;\n    return eligible.length === 0 ? 0 : settledCount >= Math.min(2, eligible.length) ? 1 : settledCount / eligible.length;\n", 'eligible generic completion'],
  ["    const missingTarget = this.tactic !== 'sweep' && this.members.some((member) => member.tacticalTarget === null);\n    const hardStall = this.members.some((member) => member.stalledTicks >= STALLED_REPLAN_FRAMES);\n", "    const eligible = this.eligibleMembers();\n    const missingTarget = this.tactic !== 'sweep' && eligible.some((member) => member.tacticalTarget === null);\n    const hardStall = eligible.some((member) => member.stalledTicks >= STALLED_REPLAN_FRAMES);\n", 'eligible plan validity'],
  ["      && this.members.some((member) => isSustainedFireTask(member.task) && member.fireBlockedTicks >= FIRE_BLOCKED_REPLAN_TICKS);\n", "      && eligible.some((member) => isSustainedFireTask(member.task) && member.fireBlockedTicks >= FIRE_BLOCKED_REPLAN_TICKS);\n", 'eligible fire block validity'],
  ["      const blocked = this.members.filter((member) => member.fireBlockedTicks >= FIRE_BLOCKED_REPLAN_TICKS).map((member) => member.label).join(', ');\n", "      const blocked = eligible.filter((member) => member.fireBlockedTicks >= FIRE_BLOCKED_REPLAN_TICKS).map((member) => member.label).join(', ');\n", 'eligible blocked labels'],
  ["  private refreshTacticalPlan(): void {\n    if (this.sharedLastKnownPosition === null) return;\n    this.planRevision += 1;\n", "  private refreshTacticalPlan(): void {\n    if (this.sharedLastKnownPosition === null || this.tacticalPlanningSuspended) return;\n    this.normalizeRoleOrder();\n    this.planRevision += 1;\n", 'suspended plan refresh guard'],
  ["      member.opportunityPurpose = 'none';\n    }\n  }\n\n  private refreshBoundingPlan", "      member.opportunityPurpose = 'none';\n      member.surpriseUsedThisPlan = false;\n    }\n  }\n\n  private refreshBoundingPlan", 'reset surprise per plan'],
  ["    for (const member of this.members) {\n      if (member.id === this.moverId) {\n", "    for (const member of this.eligibleMembers()) {\n      if (member.id === this.moverId) {\n", 'eligible flank members'],
  ["    const ordered = [...this.members].sort((left, right) => left.id.localeCompare(right.id, 'en'));\n", "    const ordered = [...this.eligibleMembers()].sort((left, right) => left.id.localeCompare(right.id, 'en'));\n", 'eligible sweep members'],
  ["    const origin = centroid(this.members.map((member) => member.position));\n", "    const eligible = this.eligibleMembers();\n    const origin = centroid(eligible.map((member) => member.position));\n", 'eligible regroup centroid'],
  ["    this.members.forEach((member, index) => {\n", "    eligible.forEach((member, index) => {\n", 'eligible regroup members'],
  ["    const origin = centroid(this.members.map((entry) => entry.position));\n", "    const origin = centroid(this.eligibleMembers().map((entry) => entry.position));\n", 'eligible flank origin'],
  ["    const laneOwners = this.members.filter((member) => {\n", "    const laneOwners = this.eligibleMembers().filter((member) => {\n", 'eligible fire lane owners'],
  ["    if (this.alertState !== 'idle' || !this.members.every((member) => distance(member.position, this.getPatrolTarget(member)) <= ARRIVAL_RADIUS)) return;\n", "    if (this.alertState !== 'idle' || !this.eligibleMembers().every((member) => distance(member.position, this.getPatrolTarget(member)) <= ARRIVAL_RADIUS)) return;\n", 'eligible patrol readiness'],
  ["    member.specialActionPulse = 0;\n    member.meleePulse = 0;\n", "    member.specialActionPulse = 0;\n    member.surpriseUsedThisPlan = false;\n    member.meleePulse = 0;\n", 'reset member surprise'],
  ["    specialActionPulse: 0,\n    meleePulse: 0,\n", "    specialActionPulse: 0,\n    surpriseUsedThisPlan: false,\n    meleePulse: 0,\n", 'create member surprise'],
]);

edit('Apps/Workbench/src/simulation/tacticalWizardHost.ts', [["  private pushEvent(message: string): void {\n", `  private eligibleMembers(): MutableMember[] {
    return this.members.filter((member) => !this.tacticalExcludedAgentIds.has(member.id));
  }

  private normalizeRoleOrder(): void {
    const eligible = this.eligibleMembers().sort((left, right) => left.id.localeCompare(right.id, 'en'));
    const eligibleIds = new Set(eligible.map((member) => member.id));
    const ordered: string[] = [];
    for (const id of [this.suppressorId, this.moverId, this.observerId]) if (id !== null && eligibleIds.has(id) && !ordered.includes(id)) ordered.push(id);
    for (const member of eligible) if (!ordered.includes(member.id)) ordered.push(member.id);
    this.suppressorId = ordered[0] ?? null;
    this.moverId = ordered[1] ?? null;
    this.observerId = ordered[2] ?? null;
  }

  private isRearQuarterOpportunity(member: MutableMember): boolean {
    const toMember = normalizeDirection({ x: member.position.x - this.player.x, y: member.position.y - this.player.y });
    const facing = normalizeDirection(this.operationalPlayerFacing);
    return toMember.x * facing.x + toMember.y * facing.y <= -0.3;
  }

  private pushEvent(message: string): void {
`, 'operational helpers']]);

edit('Apps/Workbench/src/simulation/tacticalWizardHost.ts', [
  ["      spread: Number(pairwiseSpread(this.members.map((member) => member.position)).toFixed(2)),\n", "      spread: Number(pairwiseSpread((this.eligibleMembers().length > 0 ? this.eligibleMembers() : this.members).map((member) => member.position)).toFixed(2)),\n", 'eligible squad spread'],
  ["    this.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'roles', `Roles / tasks assigned for ${this.tactic}.`, { assignments: this.members.map((member) => `${member.id}=${member.role}/${member.task}/${member.opportunityPurpose}`), tactic: this.tactic });\n", "    this.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'roles', `Roles / tasks assigned for ${this.tactic}.`, { assignments: this.eligibleMembers().map((member) => `${member.id}=${member.role}/${member.task}/${member.opportunityPurpose}`), excludedAgentIds: [...this.tacticalExcludedAgentIds], tactic: this.tactic });\n", 'role logs exclude downed'],
  ["      spread: Number(pairwiseSpread(this.members.map((member) => member.position)).toFixed(2)),\n", "      spread: Number(pairwiseSpread((this.eligibleMembers().length > 0 ? this.eligibleMembers() : this.members).map((member) => member.position)).toFixed(2)),\n", 'plan spread exclude downed'],
  ["      targets: this.members.map((member) => `${member.id}:${member.task}/${member.opportunityPurpose}->${member.tacticalTarget ? `${member.tacticalTarget.x},${member.tacticalTarget.y}` : 'hold'}`),\n", "      targets: this.eligibleMembers().map((member) => `${member.id}:${member.task}/${member.opportunityPurpose}->${member.tacticalTarget ? `${member.tacticalTarget.x},${member.tacticalTarget.y}` : 'hold'}`),\n      excludedAgentIds: [...this.tacticalExcludedAgentIds],\n", 'plan logs exclude downed'],
]);

// Recovery debug overlay: visualize the actual planned rescue geometry rather than only the casualty point.
write('Apps/Workbench/src/components/SimulationRecoveryCanvas.tsx', `import type { Locale } from '../i18n';
import type { GridPoint } from '../simulation/navigation';
import { tacticalWizardTestMap, type SimulationOverlaySettings, type TacticalWizardSimulationState } from '../simulation/tacticalWizardSimulation';
import { SimulationCanvas as BaseSimulationCanvas } from './SimulationOperationsCanvas';

const CELL = 22;
interface Props { readonly state: TacticalWizardSimulationState; readonly overlays: SimulationOverlaySettings; readonly onSetPlayer: (point: GridPoint) => void; readonly locale: Locale; }

export function SimulationCanvas(props: Props) {
  const { state, locale } = props;
  const width = tacticalWizardTestMap.width * CELL;
  const height = tacticalWizardTestMap.height * CELL;
  return <div className="simulation-recovery-wrap"><BaseSimulationCanvas {...props} /><svg className="simulation-recovery-overlay" viewBox={\`0 0 \${width} \${height}\`} aria-hidden="true">{state.supplies.map((supply) => supply.medkits > 0 ? <MedicalCache key={\`med-\${supply.id}\`} point={supply.position} count={supply.medkits} locale={locale} /> : null)}<RecoveryOverlay state={state} locale={locale} width={width} /></svg></div>;
}

function MedicalCache({ point, count, locale }: { readonly point: GridPoint; readonly count: number; readonly locale: Locale }) { const p = center(point); return <g className="sim-med-cache" transform={\`translate(\${p.x - 11} \${p.y + 11})\`}><circle cx={0} cy={0} r={7} /><path d="M -3 0 L 3 0 M 0 -3 L 0 3" /><text x={9} y={3}>{locale === 'zh-CN' ? \`医疗×\${count}\` : \`MED×\${count}\`}</text></g>; }

function RecoveryOverlay({ state, locale, width }: { readonly state: TacticalWizardSimulationState; readonly locale: Locale; readonly width: number }) {
  const recovery = state.recovery;
  const geometry = state.dynamicRecovery;
  const rescuer = recovery.rescuerId === null ? null : state.agents.find((agent) => agent.id === recovery.rescuerId) ?? null;
  const downed = recovery.downedAgentId === null ? null : state.agents.find((agent) => agent.id === recovery.downedAgentId) ?? null;
  const coverer = recovery.covererId === null ? null : state.agents.find((agent) => agent.id === recovery.covererId) ?? null;
  const medicalRunner = recovery.medicalResupplyAgentId === null ? null : state.agents.find((agent) => agent.id === recovery.medicalResupplyAgentId) ?? null;
  const medicalSupply = recovery.medicalResupplySupplyId === null ? null : state.supplies.find((supply) => supply.id === recovery.medicalResupplySupplyId) ?? null;
  if (recovery.phase === 'none' && medicalRunner === null) return null;
  const phaseLabel = recovery.phase === 'establish_cover' ? (locale === 'zh-CN' ? '救援：先建立掩护' : 'RESCUE: ESTABLISH COVER') : recovery.phase === 'approach' ? (locale === 'zh-CN' ? '救援：沿安全侧接近' : 'RESCUE: SAFE APPROACH') : recovery.phase === 'treat' ? (locale === 'zh-CN' ? \`救援：现场救治 \${(recovery.treatmentProgress * 100).toFixed(0)}%\` : \`RESCUE: TREAT \${(recovery.treatmentProgress * 100).toFixed(0)}%\`) : (locale === 'zh-CN' ? '医疗补给' : 'MEDICAL RESUPPLY');
  return <g>
    {geometry.treatmentPoint !== null ? <GeometryMarker point={geometry.treatmentPoint} kind="treatment" label={locale === 'zh-CN' ? (geometry.treatmentExposed ? '救治点·暴露' : '救治点·遮蔽') : (geometry.treatmentExposed ? 'TREAT · EXPOSED' : 'TREAT · COVERED')} /> : null}
    {geometry.approachPoint !== null ? <GeometryMarker point={geometry.approachPoint} kind="approach" label={locale === 'zh-CN' ? '接近门' : 'APPROACH'} /> : null}
    {geometry.fallbackPoint !== null ? <GeometryMarker point={geometry.fallbackPoint} kind="fallback" label={locale === 'zh-CN' ? '撤回点' : 'FALLBACK'} /> : null}
    {geometry.securityPoint !== null ? <GeometryMarker point={geometry.securityPoint} kind="security" label={locale === 'zh-CN' ? '掩护位' : 'SECURITY'} /> : null}
    {rescuer !== null && downed !== null ? <g className="sim-rescue-link"><line x1={center(rescuer.position).x} y1={center(rescuer.position).y} x2={center(geometry.treatmentPoint ?? downed.position).x} y2={center(geometry.treatmentPoint ?? downed.position).y} /><text x={center(rescuer.position).x + 12} y={center(rescuer.position).y + 22}>{locale === 'zh-CN' ? '救治者' : 'MEDIC'}</text></g> : null}
    {coverer !== null ? <g className="sim-rescue-cover">{geometry.securityPoint !== null ? <line x1={center(coverer.position).x} y1={center(coverer.position).y} x2={center(geometry.securityPoint).x} y2={center(geometry.securityPoint).y} /> : null}{state.squad.sharedLastKnownPosition !== null ? <line x1={center(coverer.position).x} y1={center(coverer.position).y} x2={center(state.squad.sharedLastKnownPosition).x} y2={center(state.squad.sharedLastKnownPosition).y} /> : null}<text x={center(coverer.position).x + 12} y={center(coverer.position).y + 24}>{locale === 'zh-CN' ? '救援掩护' : 'RESCUE COVER'}</text></g> : null}
    {medicalRunner !== null && medicalSupply !== null ? <g className="sim-rescue-link"><line x1={center(medicalRunner.position).x} y1={center(medicalRunner.position).y} x2={center(medicalSupply.position).x} y2={center(medicalSupply.position).y} /><circle cx={center(medicalSupply.position).x} cy={center(medicalSupply.position).y} r={11} /><text x={(center(medicalRunner.position).x + center(medicalSupply.position).x) / 2 + 5} y={(center(medicalRunner.position).y + center(medicalSupply.position).y) / 2 - 5}>{locale === 'zh-CN' ? '补充医疗包' : 'FETCH MEDKIT'}</text></g> : null}
    <g className="sim-recovery-banner" transform={\`translate(\${Math.max(10, width - 292)} 42)\`}><rect width={280} height={24} rx={5} /><text x={8} y={15}>{phaseLabel} · {locale === 'zh-CN' ? \`路径暴露 \${geometry.pathExposureCells}\` : \`PATH EXPOSED \${geometry.pathExposureCells}\`}</text></g>
  </g>;
}

function GeometryMarker({ point, kind, label }: { readonly point: GridPoint; readonly kind: 'treatment' | 'approach' | 'fallback' | 'security'; readonly label: string }) {
  const p = center(point);
  return <g className={\`sim-recovery-geometry sim-recovery-geometry-\${kind}\`}><circle cx={p.x} cy={p.y} r={kind === 'treatment' ? 10 : 7} /><text x={p.x + 9} y={p.y - 9}>{label}</text></g>;
}
function center(point: GridPoint): GridPoint { return { x: point.x * CELL + CELL / 2, y: point.y * CELL + CELL / 2 }; }
`);

edit('Apps/Workbench/src/simulation-runtime.css', [[".sim-recovery-banner text{fill:#a8d7b8;font-size:8px;font-weight:800}\n", `.sim-recovery-banner text{fill:#a8d7b8;font-size:8px;font-weight:800}
.sim-recovery-geometry circle{fill:#0a1118;fill-opacity:.82;stroke-width:1.5;stroke-dasharray:3 2}
.sim-recovery-geometry text{font-size:7px;font-weight:800;paint-order:stroke;stroke:#091019;stroke-width:2px}
.sim-recovery-geometry-treatment circle{stroke:#8fd3a8}.sim-recovery-geometry-treatment text{fill:#a9dfbb}
.sim-recovery-geometry-approach circle{stroke:#75a9cf}.sim-recovery-geometry-approach text{fill:#9bc5e4}
.sim-recovery-geometry-fallback circle{stroke:#a99bc7}.sim-recovery-geometry-fallback text{fill:#c2b8dd}
.sim-recovery-geometry-security circle{stroke:#e0b66e}.sim-recovery-geometry-security text{fill:#e6c684}
`, 'recovery geometry styles']]);

write('Tests/workbench/recoveryGeometryAndShotTrace.test.ts', `import { describe, expect, it } from 'vitest';
import { createGrid, hasLineOfSight } from '../../Apps/Workbench/src/simulation/navigation';
import { selectRecoveryGeometry } from '../../Apps/Workbench/src/simulation/recoverySafety';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulation';

describe('world-consistent fire and recovery geometry', () => {
  it('stops player rifle damage at hard world geometry', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 14, y: 6 })).toBe(true);
    const before = simulation.getState().agents.find((agent) => agent.id === 'twr:rifle-squad:alpha')!;
    expect(simulation.playerFireAt({ x: 2, y: 2 })).toBe(true);
    const after = simulation.getState();
    expect(after.agents.find((agent) => agent.id === before.id)?.health).toBe(before.health);
    expect(after.playerCombat.shotBlockedByWorld).toBe(true);
    expect(after.runLog.some((entry) => entry.event === 'fire' && entry.actorId === 'player' && entry.data.blockedByWorld === true)).toBe(true);
  });

  it('still damages the first agent on an unobstructed rifle trace', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 2, y: 10 })).toBe(true);
    const before = simulation.getState().agents.find((agent) => agent.id === 'twr:rifle-squad:bravo')!.health;
    expect(simulation.playerFireAt({ x: 2, y: 4 })).toBe(true);
    const after = simulation.getState();
    expect(after.agents.find((agent) => agent.id === 'twr:rifle-squad:bravo')!.health).toBeLessThan(before);
    expect(after.playerCombat.shotBlockedByWorld).toBe(false);
  });

  it('prefers a covered treatment side and scores exposed approach cells', () => {
    const wall = Array.from({ length: 9 }, (_, y) => ({ x: 5, y }));
    const grid = createGrid(12, 12, wall);
    const solution = selectRecoveryGeometry({
      grid,
      casualty: { x: 4, y: 5 },
      rescuer: { x: 2, y: 5 },
      security: null,
      threat: { x: 8, y: 5 },
      failedTreatmentCells: new Set(),
      failedSecurityCells: new Set(),
    });
    expect(solution).not.toBeNull();
    expect(solution!.treatmentExposed).toBe(false);
    expect(hasLineOfSight(grid, solution!.treatmentPoint, { x: 8, y: 5 })).toBe(false);
    expect(Math.hypot(solution!.treatmentPoint.x - 4, solution!.treatmentPoint.y - 5)).toBeLessThanOrEqual(1.45);
  });

  it('creates a distinct treatment position and freezes normal maneuver doctrine during rescue', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setPlayerPosition({ x: 6, y: 2 })).toBe(true);
    for (let index = 0; index < 4; index += 1) simulation.step();
    expect(simulation.setAgentVitals('twr:rifle-squad:alpha', { health: 0 })).toBe(true);
    let state = simulation.getState();
    expect(state.recovery.phase).not.toBe('none');
    expect(state.dynamicRecovery.treatmentPoint).not.toBeNull();
    const patient = state.agents.find((agent) => agent.id === 'twr:rifle-squad:alpha')!;
    expect(Math.hypot(state.dynamicRecovery.treatmentPoint!.x - patient.position.x, state.dynamicRecovery.treatmentPoint!.y - patient.position.y)).toBeGreaterThan(0.5);
    expect(state.dynamicRecovery.tacticalPlanningSuspended).toBe(true);
    const tactic = state.squad.tactic;
    const tacticTicks = state.squad.tacticTicks;
    for (let index = 0; index < 2; index += 1) simulation.step();
    state = simulation.getState();
    expect(state.recovery.phase).not.toBe('none');
    expect(state.squad.tactic).toBe(tactic);
    expect(state.squad.tacticTicks).toBeLessThanOrEqual(tacticTicks + 1);
    expect([state.squad.suppressorId, state.squad.moverId, state.squad.observerId]).not.toContain('twr:rifle-squad:alpha');
    expect(state.command.order).toContain('suspended');
  });

  it('does not build recovery pressure through a wall', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:alpha', { health: 0 })).toBe(true);
    expect(simulation.setPlayerPosition({ x: 14, y: 6 })).toBe(true);
    for (let index = 0; index < 3; index += 1) expect(simulation.playerFireAt({ x: 2, y: 2 })).toBe(true);
    expect(simulation.getState().recoverySafety.pressure).toBeLessThan(0.2);
  });
});
`);

console.log('Recovery geometry / tactical clarity migration applied.');
