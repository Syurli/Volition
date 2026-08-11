import type { AgentRuntimeSnapshot, DecisionTrace, Stimulus, Vector3 } from '@volition/core';
import { createTacticalWizardReferenceRuntime, TACTICAL_WIZARD_AGENT_ID } from '@volition/example-tactical-wizard';
import { createGrid, findPath, hasLineOfSight, isWalkable, type GridPoint, type NavigationGrid } from './navigation';

export interface SimulationOverlaySettings { readonly vision: boolean; readonly hearing: boolean; readonly path: boolean; readonly memory: boolean; readonly grid: boolean; }
export interface TacticalWizardSimulationState {
  readonly logicalTick: number; readonly enemy: GridPoint; readonly enemyFacing: GridPoint; readonly player: GridPoint; readonly patrolPoints: readonly GridPoint[]; readonly patrolIndex: number; readonly path: readonly GridPoint[]; readonly selectedIntent: string; readonly beliefConfidence: number; readonly beliefSource: string; readonly targetVisible: boolean; readonly hearingRadius: number; readonly visionRange: number; readonly visionFovDegrees: number; readonly lastKnownPosition: GridPoint | null; readonly latestTrace: DecisionTrace | null; readonly latestSnapshot: AgentRuntimeSnapshot | null; readonly firePulse: number; readonly searchPulse: number; readonly eventLog: readonly string[];
}
export const tacticalWizardTestMap = {
  id: 'tactical-wizard-training-yard', name: 'Tactical Wizard Training Yard', width: 24, height: 16,
  blocked: [...rect(7, 2, 4, 5), ...rect(15, 8, 5, 3), ...rect(3, 10, 4, 2), ...rect(12, 4, 2, 5)],
  patrolPoints: [{ x: 2, y: 2 }, { x: 18, y: 2 }, { x: 21, y: 13 }, { x: 9, y: 13 }, { x: 2, y: 7 }] as readonly GridPoint[],
  enemyStart: { x: 2, y: 2 } as GridPoint, playerStart: { x: 21, y: 13 } as GridPoint,
};
export const tacticalWizardNavigationGrid: NavigationGrid = createGrid(tacticalWizardTestMap.width, tacticalWizardTestMap.height, tacticalWizardTestMap.blocked);

export class TacticalWizardSimulation {
  private runtime = createTacticalWizardReferenceRuntime(); private logicalTick = 0; private enemy: GridPoint = tacticalWizardTestMap.enemyStart; private enemyFacing: GridPoint = { x: 1, y: 0 }; private player: GridPoint = tacticalWizardTestMap.playerStart; private patrolIndex = 1; private path: readonly GridPoint[] = []; private pendingNoise = false; private wasVisible = false; private latestTrace: DecisionTrace | null = null; private latestSnapshot: AgentRuntimeSnapshot | null = null; private firePulse = 0; private searchPulse = 0; private readonly eventLog: string[] = ['Simulation ready. Patrol route initialized.'];
  readonly stepSeconds = 0.25; readonly hearingRadius = 8; readonly visionRange = 9; readonly visionFovDegrees = 120;
  reset(): TacticalWizardSimulationState { this.runtime.dispose(); this.runtime = createTacticalWizardReferenceRuntime(); this.logicalTick = 0; this.enemy = tacticalWizardTestMap.enemyStart; this.enemyFacing = { x: 1, y: 0 }; this.player = tacticalWizardTestMap.playerStart; this.patrolIndex = 1; this.path = []; this.pendingNoise = false; this.wasVisible = false; this.latestTrace = null; this.latestSnapshot = null; this.firePulse = 0; this.searchPulse = 0; this.eventLog.splice(0, this.eventLog.length, 'Simulation reset.'); return this.getState(); }
  emitNoise(): void { this.pendingNoise = true; this.pushEvent(`T${this.logicalTick}: player noise emitted.`); }
  setPlayerPosition(point: GridPoint): boolean { if (!isWalkable(tacticalWizardNavigationGrid, point)) return false; this.player = point; return true; }
  nudgePlayer(dx: number, dy: number): boolean { return this.setPlayerPosition({ x: this.player.x + dx, y: this.player.y + dy }); }
  step(): TacticalWizardSimulationState {
    const visible = this.canSeePlayer(); const stimuli = this.buildStimuli(visible); const patrolTarget = tacticalWizardTestMap.patrolPoints[this.patrolIndex]!;
    const snapshot = this.runtime.tick({ tick: { logicalTick: this.logicalTick, deltaSeconds: this.logicalTick === 0 ? 0 : this.stepSeconds, seed: 1337 }, context: { agentId: TACTICAL_WIZARD_AGENT_ID, values: { selfPosition: toVector3(this.enemy), selfFacing: { x: this.enemyFacing.x, y: 0, z: this.enemyFacing.y }, patrolTarget: toVector3(patrolTarget), weaponState: 'ready' }, capabilities: ['move_to', 'aim_at', 'fire', 'reload'] }, stimuli, actionResults: [] });
    this.latestSnapshot = snapshot; this.latestTrace = this.runtime.getTrace().at(-1) ?? null; this.executeIntent(snapshot.selectedIntent.id, snapshot.selectedIntent.targetPosition); this.wasVisible = visible; this.pendingNoise = false; this.firePulse = Math.max(0, this.firePulse - 1); this.searchPulse = snapshot.selectedIntent.id === 'search' ? (this.searchPulse + 1) % 8 : 0; this.logicalTick += 1; return this.getState();
  }
  getState(): TacticalWizardSimulationState { const belief = this.latestSnapshot?.belief; return { logicalTick: this.logicalTick, enemy: this.enemy, enemyFacing: this.enemyFacing, player: this.player, patrolPoints: tacticalWizardTestMap.patrolPoints, patrolIndex: this.patrolIndex, path: this.path, selectedIntent: this.latestSnapshot?.selectedIntent.id ?? 'patrol', beliefConfidence: belief?.confidence ?? 0, beliefSource: belief?.source ?? 'none', targetVisible: belief?.confirmedVisible ?? false, hearingRadius: this.hearingRadius, visionRange: this.visionRange, visionFovDegrees: this.visionFovDegrees, lastKnownPosition: belief?.estimatedPosition ? fromVector3(belief.estimatedPosition) : null, latestTrace: this.latestTrace, latestSnapshot: this.latestSnapshot, firePulse: this.firePulse, searchPulse: this.searchPulse, eventLog: [...this.eventLog] }; }
  private buildStimuli(visible: boolean): readonly Stimulus[] {
    const stimuli: Stimulus[] = [];
    if (visible) { stimuli.push({ id: `visual:player:${this.logicalTick}`, sequence: 20, logicalTick: this.logicalTick, kind: 'visual_actor', actorId: 'player', visible: true, position: toVector3(this.player), relation: 'hostile' }); if (!this.wasVisible) this.pushEvent(`T${this.logicalTick}: visual contact confirmed.`); }
    else if (this.wasVisible) { stimuli.push({ id: `visual:player:${this.logicalTick}:lost`, sequence: 20, logicalTick: this.logicalTick, kind: 'visual_actor', actorId: 'player', visible: false, relation: 'hostile' }); this.pushEvent(`T${this.logicalTick}: visual contact lost; live player position withheld.`); }
    if (this.pendingNoise && distance(this.enemy, this.player) <= this.hearingRadius) { const perceived = this.noisyPerceivedPosition(); stimuli.push({ id: `noise:player:${this.logicalTick}`, sequence: 10, logicalTick: this.logicalTick, kind: 'noise', sourceId: 'player', perceivedPosition: toVector3(perceived), intensity: 0.8, actionKind: 'manual_test_noise' }); this.pushEvent(`T${this.logicalTick}: hearing stimulus received near ${perceived.x},${perceived.y}.`); }
    return stimuli;
  }
  private executeIntent(intentId: string, targetPosition?: Vector3): void {
    if (intentId === 'engage') { this.faceToward(this.player); if (this.logicalTick % 2 === 0) { this.firePulse = 2; this.pushEvent(`T${this.logicalTick}: engage / fire action.`); } this.path = []; return; }
    if (intentId === 'search') this.searchPulse = (this.searchPulse + 1) % 8;
    let target: GridPoint | null = targetPosition ? fromVector3(targetPosition) : null; if (intentId === 'patrol') target = tacticalWizardTestMap.patrolPoints[this.patrolIndex]!; if (target === null) { this.path = []; return; }
    const path = findPath(tacticalWizardNavigationGrid, this.enemy, target); this.path = path; if (path.length > 1) { const next = path[1]!; this.enemyFacing = { x: next.x - this.enemy.x, y: next.y - this.enemy.y }; this.enemy = next; this.path = path.slice(1); }
    if (intentId === 'patrol' && this.enemy.x === target.x && this.enemy.y === target.y) { this.patrolIndex = (this.patrolIndex + 1) % tacticalWizardTestMap.patrolPoints.length; this.pushEvent(`T${this.logicalTick}: patrol point reached.`); }
  }
  private canSeePlayer(): boolean { const range = distance(this.enemy, this.player); if (range > this.visionRange) return false; if (!hasLineOfSight(tacticalWizardNavigationGrid, this.enemy, this.player)) return false; if (range === 0) return true; const direction = { x: (this.player.x - this.enemy.x) / range, y: (this.player.y - this.enemy.y) / range }; const facingLength = Math.hypot(this.enemyFacing.x, this.enemyFacing.y) || 1; const facing = { x: this.enemyFacing.x / facingLength, y: this.enemyFacing.y / facingLength }; const dot = Math.max(-1, Math.min(1, direction.x * facing.x + direction.y * facing.y)); const angle = Math.acos(dot) * 180 / Math.PI; return angle <= this.visionFovDegrees / 2; }
  private faceToward(point: GridPoint): void { const dx = Math.sign(point.x - this.enemy.x); const dy = Math.sign(point.y - this.enemy.y); if (dx !== 0 || dy !== 0) this.enemyFacing = { x: dx, y: dy }; }
  private noisyPerceivedPosition(): GridPoint { const offset = this.logicalTick % 2 === 0 ? { x: 1, y: 0 } : { x: 0, y: -1 }; const candidate = { x: this.player.x + offset.x, y: this.player.y + offset.y }; return isWalkable(tacticalWizardNavigationGrid, candidate) ? candidate : this.player; }
  private pushEvent(message: string): void { this.eventLog.unshift(message); this.eventLog.splice(10); }
}
function rect(x: number, y: number, width: number, height: number): GridPoint[] { const points: GridPoint[] = []; for (let yy = y; yy < y + height; yy += 1) for (let xx = x; xx < x + width; xx += 1) points.push({ x: xx, y: yy }); return points; }
function toVector3(point: GridPoint): Vector3 { return { x: point.x, y: 0, z: point.y }; }
function fromVector3(point: Vector3): GridPoint { return { x: Math.round(point.x), y: Math.round(point.z) }; }
function distance(a: GridPoint, b: GridPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
