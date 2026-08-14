import { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const simDir = resolve(root, 'Apps/Workbench/src/simulation');
const componentDir = resolve(root, 'Apps/Workbench/src/components');
const pageDir = resolve(root, 'Apps/Workbench/src/pages');
const testDir = resolve(root, 'Tests/workbench');

function read(path) { return readFileSync(resolve(root, path), 'utf8'); }
function write(path, content) { writeFileSync(resolve(root, path), content); }
function copy(from, to) { write(to, read(from)); }
function remove(path) { const p = resolve(root, path); if (existsSync(p)) unlinkSync(p); }
function mustReplace(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing migration anchor: ${label}`);
  return text.replace(from, to);
}
function mustReplaceRegex(text, pattern, to, label) {
  if (!pattern.test(text)) throw new Error(`Missing migration regex anchor: ${label}`);
  pattern.lastIndex = 0;
  return text.replace(pattern, to);
}
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stage 1: production de-versioning. Git history is the archive; production
// imports use semantic names only.
// ---------------------------------------------------------------------------
copy('Apps/Workbench/src/simulation/tacticalWizardSimulationV7.ts', 'Apps/Workbench/src/simulation/tacticalWizardHost.ts');
copy('Apps/Workbench/src/simulation/tacticalWizardTestMapV7.ts', 'Apps/Workbench/src/simulation/tacticalWizardTestMap.ts');
copy('Apps/Workbench/src/simulation/tacticalWizardSimulationV4.ts', 'Apps/Workbench/src/simulation/tacticalWizardSimulation.ts');
copy('Apps/Workbench/src/components/SimulationCanvasV3Base.tsx', 'Apps/Workbench/src/components/SimulationWorldCanvas.tsx');
copy('Apps/Workbench/src/pages/RuntimePagesV3Base.tsx', 'Apps/Workbench/src/pages/RuntimeUtilityPages.tsx');
copy('Apps/Workbench/src/pages/RuntimePagesV4.tsx', 'Apps/Workbench/src/pages/RuntimeCorePages.tsx');
copy('Apps/Workbench/src/pages/RuntimePagesV5.tsx', 'Apps/Workbench/src/pages/RuntimeCombatPages.tsx');

write('Apps/Workbench/src/simulation/tacticalWizardHostTypes.ts', `import type { AgentRuntimeSnapshot, DecisionTrace } from '@volition/core';
import type { SquadTactic } from '@volition/example-tactical-wizard';
import type { GridPoint } from './navigation';
import type { CoverSlot } from './squadTactics';

export interface SimulationOverlaySettings {
  readonly vision: boolean;
  readonly hearing: boolean;
  readonly path: boolean;
  readonly memory: boolean;
  readonly grid: boolean;
  readonly cover: boolean;
}
export type SquadAlertState = 'idle' | 'pending' | 'active';
export type TacticalRole = 'patrol' | 'suppressor' | 'mover' | 'observer' | 'flanker' | 'crossfire' | 'assaulter' | 'sweeper' | 'support';
export type RunLogCategory = 'system' | 'player' | 'squad' | 'agent';
export type RunLogEvent = 'session' | 'player_move' | 'player_noise' | 'perception' | 'alert' | 'tactic' | 'roles' | 'plan' | 'decision' | 'move' | 'fire' | 'search';
export type RunLogValue = string | number | boolean | null | GridPoint | readonly string[];
export interface RunLogEntry {
  readonly sequence: number;
  readonly logicalTick: number;
  readonly timeSeconds: number;
  readonly category: RunLogCategory;
  readonly actorId: string;
  readonly actorLabel: string;
  readonly event: RunLogEvent;
  readonly summary: string;
  readonly data: Readonly<Record<string, RunLogValue>>;
}
export interface TacticalWizardAgentView {
  readonly id: string;
  readonly label: string;
  readonly visualKey: string;
  readonly position: GridPoint;
  readonly facing: GridPoint;
  readonly path: readonly GridPoint[];
  readonly selectedIntent: string;
  readonly beliefConfidence: number;
  readonly beliefSource: string;
  readonly targetVisible: boolean;
  readonly lastKnownPosition: GridPoint | null;
  readonly role: TacticalRole;
  readonly coverTarget: GridPoint | null;
  readonly peekTarget: GridPoint | null;
  readonly tacticalTarget: GridPoint | null;
  readonly firePulse: number;
  readonly fireTarget: GridPoint | null;
  readonly searchPulse: number;
  readonly stalledTicks: number;
}
export interface TacticalWizardSquadView {
  readonly id: string;
  readonly alertState: SquadAlertState;
  readonly sourceAgentId: string | null;
  readonly sharedLastKnownPosition: GridPoint | null;
  readonly phase: number;
  readonly tactic: SquadTactic;
  readonly tacticReason: string;
  readonly tacticTicks: number;
  readonly stationaryTargetTicks: number;
  readonly lostContactTicks: number;
  readonly maneuverCycle: number;
  readonly spread: number;
  readonly suppressorId: string | null;
  readonly moverId: string | null;
  readonly observerId: string | null;
}
export interface TacticalWizardHostState {
  readonly logicalTick: number;
  readonly agents: readonly TacticalWizardAgentView[];
  readonly squad: TacticalWizardSquadView;
  readonly player: GridPoint;
  readonly patrolPoints: readonly GridPoint[];
  readonly patrolIndex: number;
  readonly coverSlots: readonly CoverSlot[];
  readonly hearingRadius: number;
  readonly visionRange: number;
  readonly visionFovDegrees: number;
  readonly movementResolution: number;
  readonly latestTraces: readonly DecisionTrace[];
  readonly eventLog: readonly string[];
  readonly runLog: readonly RunLogEntry[];
  readonly enemy: GridPoint;
  readonly enemyFacing: GridPoint;
  readonly path: readonly GridPoint[];
  readonly selectedIntent: string;
  readonly beliefConfidence: number;
  readonly beliefSource: string;
  readonly targetVisible: boolean;
  readonly lastKnownPosition: GridPoint | null;
  readonly latestTrace: DecisionTrace | null;
  readonly latestSnapshot: AgentRuntimeSnapshot | null;
  readonly firePulse: number;
  readonly searchPulse: number;
}
`);

let host = read('Apps/Workbench/src/simulation/tacticalWizardHost.ts');
host = host.replaceAll("./tacticalWizardTestMapV7", "./tacticalWizardTestMap");
host = host.replaceAll("./tacticalWizardSimulationV3", "./tacticalWizardHostTypes");
host = host.replace('type TacticalWizardSimulationState as BaseSimulationState', 'type TacticalWizardHostState as BaseSimulationState');
host = host.replace('export class TacticalWizardSimulation {', 'export class TacticalWizardHost {');
host = host.replaceAll('V7 ', 'Host ');
host = host.replaceAll('V7.', 'Host.');
write('Apps/Workbench/src/simulation/tacticalWizardHost.ts', host);

let map = read('Apps/Workbench/src/simulation/tacticalWizardTestMap.ts');
map = map.replaceAll('V11 Combat Sandbox', 'Combat Sandbox');
map = map.replaceAll("'tactical-wizard-combat-sandbox-v11'", "'tactical-wizard-combat-sandbox'");
map = map.replaceAll("'Tactical Wizard Combat Sandbox V11'", "'Tactical Wizard Combat Sandbox'");
write('Apps/Workbench/src/simulation/tacticalWizardTestMap.ts', map);

let runtime = read('Apps/Workbench/src/simulation/tacticalWizardRuntime.ts');
runtime = runtime.replaceAll("./tacticalWizardTestMapV7", "./tacticalWizardTestMap");
runtime = runtime.replaceAll("./tacticalWizardSimulationV7", "./tacticalWizardHost");
runtime = runtime.replace('TacticalWizardSimulation as TacticalHost', 'TacticalWizardHost as TacticalHost');
runtime = runtime.replace('type TacticalWizardSimulationState as TacticalHostState', 'type TacticalWizardSimulationState as TacticalHostState');
runtime = runtime.replace("import { findPath, type GridPoint } from './navigation';", "import { findPath, gridKey, hasLineOfSight, type GridPoint } from './navigation';\nimport {\n  RECOVERY_DEADLOCK_TICKS,\n  RECOVERY_MAX_STALL_REPLANS,\n  RECOVERY_SECURITY_ARRIVAL,\n  RECOVERY_UNSAFE_ABORT_TICKS,\n  RECOVERY_WEAPON_READY_ROUNDS,\n  classifyRecoveryPressure,\n  pointSegmentDistance,\n  recoveryDecision,\n  recoveryFireLaneClear,\n  selectRecoverySecurityPoint,\n  type RecoverySafetyBand,\n  type RecoverySafetyDecision,\n} from './recoverySafety';");

runtime = mustReplaceRegex(runtime, /readonly recoverySafety: \{[\s\S]*?\n  \};\n  readonly dynamicRecovery:/, `readonly recoverySafety: {
    readonly runtimeVersion: 'fixed-hierarchy';
    readonly active: boolean;
    readonly band: RecoverySafetyBand;
    readonly decision: RecoverySafetyDecision;
    readonly pressure: number;
    readonly safetyReplans: number;
    readonly safetyAborts: number;
    readonly lastReplanReason: string | null;
    readonly security: {
      readonly agentId: string | null;
      readonly weaponReady: boolean;
      readonly positionReady: boolean;
      readonly lineOfSightReady: boolean;
      readonly fireLaneReady: boolean;
      readonly reactionReady: boolean;
    };
  };
  readonly dynamicRecovery:`, 'recovery safety state type');

runtime = mustReplace(runtime, `interface RecoveryPlan {
  readonly patientId: string;
  rescuerId: string;
  covererId: string | null;
  phase: 'establish_cover' | 'approach' | 'treat';
  readonly startedTick: number;
  treatmentProgress: number;
}`, `interface RecoveryPlan {
  readonly patientId: string;
  rescuerId: string;
  covererId: string | null;
  phase: 'establish_cover' | 'approach' | 'treat';
  readonly startedTick: number;
  treatmentProgress: number;
  readonly stagePoint: GridPoint;
  securityPoint: GridPoint | null;
  lastProgressTick: number;
  lastTreatmentProgress: number;
  lastRescuerDistance: number;
  stalledTicks: number;
  stallReplans: number;
}`, 'RecoveryPlan fields');

runtime = mustReplace(runtime, `  private rescueInterruptedCount = 0;
  private lastRescueInterruptedTick: number | null = null;`, `  private rescueInterruptedCount = 0;
  private lastRescueInterruptedTick: number | null = null;
  private recoveryPressure = 0;
  private recoverySafetyBand: RecoverySafetyBand = 'stable';
  private recoverySafetyDecision: RecoverySafetyDecision = 'none';
  private recoveryUnsafeSinceTick: number | null = null;
  private recoveryIneffectiveSinceTick: number | null = null;
  private recoverySafetyReplans = 0;
  private recoverySafetyAborts = 0;
  private recoveryLastReplanTick = -999;
  private recoveryLastReplanReason: string | null = null;
  private recoveryAbortUntilTick = -1;
  private recoveryLastEvaluatedTick = -1;
  private recoveryLastSecurityFireTick = -1;
  private recoveryLaneBlockedTicks = 0;
  private readonly recoveryFailedSecurityPoints = new Map<string, number>();`, 'recovery safety fields');

runtime = mustReplace(runtime, `    this.rescueInterruptedCount = 0;
    this.lastRescueInterruptedTick = null;
    this.tacticalHost.reset();`, `    this.rescueInterruptedCount = 0;
    this.lastRescueInterruptedTick = null;
    this.recoveryPressure = 0;
    this.recoverySafetyBand = 'stable';
    this.recoverySafetyDecision = 'none';
    this.recoveryUnsafeSinceTick = null;
    this.recoveryIneffectiveSinceTick = null;
    this.recoverySafetyReplans = 0;
    this.recoverySafetyAborts = 0;
    this.recoveryLastReplanTick = -999;
    this.recoveryLastReplanReason = null;
    this.recoveryAbortUntilTick = -1;
    this.recoveryLastEvaluatedTick = -1;
    this.recoveryLastSecurityFireTick = -1;
    this.recoveryLaneBlockedTicks = 0;
    this.recoveryFailedSecurityPoints.clear();
    this.tacticalHost.reset();`, 'recovery reset');

runtime = mustReplace(runtime, `    this.observeContact(after);
    this.startRecoveryIfNeeded(after);
    this.progressRecovery(after, deltaSeconds);`, `    this.observeContact(after);
    this.startRecoveryIfNeeded(after);
    this.evaluateRecoverySafety(after);
    this.executeRecoverySecurity(after);
    this.progressRecovery(after, deltaSeconds);`, 'recovery advance integration');

runtime = mustReplace(runtime, `    const security = recovery.covererId === null ? null : agents.find((agent) => agent.id === recovery.covererId) ?? null;
    const threatActive`, `    const security = recovery.covererId === null ? null : agents.find((agent) => agent.id === recovery.covererId) ?? null;
    const recoveryThreat = this.recoveryThreatPoint(base);
    const recoverySecurityPoint = this.recoveryPlan?.securityPoint ?? null;
    const recoveryPositionReady = security !== null && recoverySecurityPoint !== null && distance(security.position, recoverySecurityPoint) <= RECOVERY_SECURITY_ARRIVAL;
    const recoveryLineOfSightReady = security !== null && (recoveryThreat === null ? security.targetVisible : hasLineOfSight(tacticalWizardNavigationGrid, navCell(security.position), navCell(recoveryThreat)));
    const recoveryFriendPositions = agents.filter((agent) => agent.id === recovery.downedAgentId || agent.id === recovery.rescuerId).map((agent) => agent.position);
    const recoveryFireLaneReady = security !== null && recoveryThreat !== null ? recoveryFireLaneClear(security.position, recoveryThreat, recoveryFriendPositions) : security !== null && base.safeFireLanes > 0;
    const threatActive`, 'recovery state metrics');

runtime = mustReplaceRegex(runtime, /      recoverySafety: \{[\s\S]*?\n      \},\n      dynamicRecovery: \{[\s\S]*?\n      \},\n      threatResponse:/, `      recoverySafety: {
        runtimeVersion: 'fixed-hierarchy',
        active: recovery.phase !== 'none',
        band: recovery.phase === 'none' ? 'stable' : this.recoverySafetyBand,
        decision: recovery.phase === 'none' ? 'none' : this.recoverySafetyDecision,
        pressure: Number(this.recoveryPressure.toFixed(2)),
        safetyReplans: this.recoverySafetyReplans,
        safetyAborts: this.recoverySafetyAborts,
        lastReplanReason: this.recoveryLastReplanReason,
        security: {
          agentId: security?.id ?? null,
          weaponReady: security?.ammoRounds !== undefined && security.ammoRounds >= RECOVERY_WEAPON_READY_ROUNDS,
          positionReady: recoveryPositionReady,
          lineOfSightReady: recoveryLineOfSightReady,
          fireLaneReady: recoveryFireLaneReady,
          reactionReady: security === null || security.reactionState === 'none' || security.reactionState === 'grenade_suppress',
        },
      },
      dynamicRecovery: {
        active: recovery.phase !== 'none',
        stagePoint: clonePoint(this.recoveryPlan?.stagePoint ?? null),
        treatmentPoint: clonePoint(recovery.approachTarget),
        securityPoint: clonePoint(this.recoveryPlan?.securityPoint ?? null),
      },
      threatResponse:`, 'recovery state output');

runtime = mustReplace(runtime, `    this.tacticalHost.emitNoise(1);

    const target`, `    this.tacticalHost.emitNoise(1);
    this.observeRecoveryShot(state, point);

    const target`, 'recovery shot observation');

runtime = mustReplace(runtime, `  private startRecoveryIfNeeded(state: TacticalHostState): void {
    if (this.recoveryPlan !== null) {`, `  private startRecoveryIfNeeded(state: TacticalHostState): void {
    if (state.logicalTick < this.recoveryAbortUntilTick) return;
    if (this.recoveryPlan !== null) {`, 'recovery abort cooldown');

runtime = mustReplace(runtime, `    this.recoveryPlan = { patientId: patient.id, rescuerId: rescuer.id, covererId: coverer?.id ?? null, phase: 'establish_cover', startedTick: state.logicalTick, treatmentProgress: 0 };`, `    this.recoveryPlan = {
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
    this.replanRecoverySecurity(state, 'recovery_started', false);`, 'recovery creation');

runtime = mustReplace(runtime, `    const plan = this.recoveryPlan;
    if (plan === null) return;
    const patient`, `    const plan = this.recoveryPlan;
    if (plan === null) return;
    if (this.recoverySafetyDecision === 'abort') {
      this.abortRecovery(state, 'recovery safety authority aborted an unsafe rescue');
      return;
    }
    if (this.recoverySafetyDecision === 'pause' || this.recoverySafetyDecision === 'reposition') return;
    const patient`, 'progress recovery safety gate');

runtime = mustReplace(runtime, `    if (agentId === plan.rescuerId) return { role: 'rescuer', target: clonePoint(patient?.position ?? null), patientId: plan.patientId };
    if (agentId === plan.covererId) {
      const member = state.agents.find((agent) => agent.id === agentId);
      return { role: 'security', target: clonePoint(member?.tacticalTarget ?? member?.position ?? null), patientId: plan.patientId };
    }`, `    if (agentId === plan.rescuerId) {
      if (this.recoverySafetyDecision === 'reposition') return { role: 'rescuer', target: clonePoint(plan.stagePoint), patientId: plan.patientId };
      if (this.recoverySafetyDecision === 'pause') return { role: 'rescuer', target: null, patientId: plan.patientId };
      return { role: 'rescuer', target: clonePoint(patient?.position ?? null), patientId: plan.patientId };
    }
    if (agentId === plan.covererId) return { role: 'security', target: clonePoint(plan.securityPoint), patientId: plan.patientId };`, 'recovery commitments');

const recoveryMethods = `
  private observeRecoveryShot(state: TacticalHostState, shotTo: GridPoint): void {
    const plan = this.recoveryPlan;
    if (plan === null) return;
    const protectedAgents = state.agents.filter((agent) => agent.id === plan.patientId || agent.id === plan.rescuerId || agent.id === plan.covererId);
    if (protectedAgents.length === 0) return;
    const nearest = Math.min(...protectedAgents.map((agent) => pointSegmentDistance(agent.position, state.player, shotTo)));
    const endpoint = Math.min(...protectedAgents.map((agent) => distance(agent.position, shotTo)));
    const added = endpoint <= 0.9 ? 0.46 : nearest <= 0.9 ? 0.4 : nearest <= 2.1 ? 0.32 : nearest <= 4 ? 0.18 : 0.08;
    this.recoveryPressure = Math.min(1, this.recoveryPressure + added);
  }

  private evaluateRecoverySafety(state: TacticalHostState): void {
    const plan = this.recoveryPlan;
    if (plan === null) {
      this.recoveryPressure = Math.max(0, this.recoveryPressure - 0.08);
      this.recoverySafetyBand = 'stable';
      this.recoverySafetyDecision = 'none';
      this.recoveryUnsafeSinceTick = null;
      this.recoveryIneffectiveSinceTick = null;
      return;
    }
    if (this.recoveryLastEvaluatedTick === state.logicalTick) return;
    this.recoveryLastEvaluatedTick = state.logicalTick;
    this.recoveryPressure = Math.max(0, this.recoveryPressure - 0.055);

    const patient = state.agents.find((agent) => agent.id === plan.patientId);
    const rescuer = state.agents.find((agent) => agent.id === plan.rescuerId);
    const security = plan.covererId === null ? null : state.agents.find((agent) => agent.id === plan.covererId) ?? null;
    const threat = this.recoveryThreatPoint(state);
    const weaponReady = security !== null && (this.equipment.get(security.id)?.ammoRounds ?? 0) >= RECOVERY_WEAPON_READY_ROUNDS;
    const positionReady = security !== null && plan.securityPoint !== null && distance(security.position, plan.securityPoint) <= RECOVERY_SECURITY_ARRIVAL;
    const lineOfSightReady = security !== null && (threat === null ? security.targetVisible : hasLineOfSight(tacticalWizardNavigationGrid, navCell(security.position), navCell(threat)));
    const friends = state.agents.filter((agent) => agent.id === plan.patientId || agent.id === plan.rescuerId).map((agent) => agent.position);
    const fireLaneReady = security !== null && threat !== null ? recoveryFireLaneClear(security.position, threat, friends) : security !== null;
    const reaction = security === null ? null : this.activeReaction(security.id, state.logicalTick);
    const reactionReady = reaction === null || reaction.kind === 'grenade_suppress';
    const securityIneffective = threat !== null && (!weaponReady || !positionReady || !lineOfSightReady || !fireLaneReady || !reactionReady);

    if (securityIneffective) {
      this.recoveryIneffectiveSinceTick ??= state.logicalTick;
      if (state.logicalTick - this.recoveryIneffectiveSinceTick >= 2) this.recoveryPressure = Math.max(this.recoveryPressure, 0.5);
      if ((!lineOfSightReady || !fireLaneReady || !positionReady) && state.logicalTick - this.recoveryLastReplanTick >= 3) {
        this.replanRecoverySecurity(state, !lineOfSightReady ? 'security_lost_los' : !fireLaneReady ? 'security_fire_lane_blocked' : 'security_position_not_reached', true);
      }
    } else this.recoveryIneffectiveSinceTick = null;

    this.recoverySafetyBand = classifyRecoveryPressure(this.recoveryPressure);
    if (this.recoverySafetyBand === 'unsafe') this.recoveryUnsafeSinceTick ??= state.logicalTick;
    else this.recoveryUnsafeSinceTick = null;
    const unsafeTicks = this.recoveryUnsafeSinceTick === null ? 0 : state.logicalTick - this.recoveryUnsafeSinceTick + 1;
    const nextDecision = recoveryDecision(this.recoverySafetyBand, unsafeTicks);
    if (nextDecision === 'reposition' && this.recoverySafetyDecision !== 'reposition') {
      this.rescueInterruptedCount += 1;
      this.lastRescueInterruptedTick = state.logicalTick;
      this.replanRecoverySecurity(state, 'incoming_fire_forced_reposition', true);
    }
    this.recoverySafetyDecision = nextDecision;
    if (nextDecision === 'abort' || unsafeTicks >= RECOVERY_UNSAFE_ABORT_TICKS) {
      this.abortRecovery(state, 'sustained unsafe pressure exceeded rescue tolerance');
      return;
    }

    if (patient !== undefined && rescuer !== undefined && plan.phase !== 'establish_cover') {
      const rescuerDistance = distance(rescuer.position, patient.position);
      const progressed = plan.treatmentProgress > plan.lastTreatmentProgress + 0.01 || rescuerDistance < plan.lastRescuerDistance - 0.15;
      if (progressed) {
        plan.lastProgressTick = state.logicalTick;
        plan.stalledTicks = 0;
      } else plan.stalledTicks += 1;
      plan.lastTreatmentProgress = plan.treatmentProgress;
      plan.lastRescuerDistance = rescuerDistance;
      if (plan.stalledTicks >= RECOVERY_DEADLOCK_TICKS) {
        plan.stalledTicks = 0;
        plan.stallReplans += 1;
        if (plan.stallReplans > RECOVERY_MAX_STALL_REPLANS) {
          this.abortRecovery(state, 'recovery progress watchdog exhausted geometry replans');
          return;
        }
        this.replanRecoverySecurity(state, 'recovery_progress_watchdog', true);
        if (plan.phase === 'treat') this.recoverySafetyDecision = 'reposition';
      }
    }
  }

  private replanRecoverySecurity(state: TacticalHostState, reason: string, countReplan: boolean): boolean {
    const plan = this.recoveryPlan;
    if (plan === null || plan.covererId === null) return false;
    const patient = state.agents.find((agent) => agent.id === plan.patientId);
    const rescuer = state.agents.find((agent) => agent.id === plan.rescuerId);
    const security = state.agents.find((agent) => agent.id === plan.covererId);
    if (patient === undefined || rescuer === undefined || security === undefined) return false;
    for (const [key, expires] of this.recoveryFailedSecurityPoints) if (expires <= state.logicalTick) this.recoveryFailedSecurityPoints.delete(key);
    if (plan.securityPoint !== null && countReplan) this.recoveryFailedSecurityPoints.set(gridKey(navCell(plan.securityPoint)), state.logicalTick + 24);
    const selected = selectRecoverySecurityPoint({
      grid: tacticalWizardNavigationGrid,
      casualty: patient.position,
      security: security.position,
      rescuer: rescuer.position,
      threat: this.recoveryThreatPoint(state),
      failedCells: new Set(this.recoveryFailedSecurityPoints.keys()),
    });
    if (selected === null) return false;
    plan.securityPoint = { ...selected.point };
    const member = this.hostAccess().members.find((entry) => entry.id === plan.covererId);
    if (member !== undefined) member.tacticalTarget = { ...selected.point };
    this.contracts.delete(plan.covererId);
    this.recoveryLastReplanTick = state.logicalTick;
    this.recoveryLastReplanReason = reason;
    if (countReplan) this.recoverySafetyReplans += 1;
    this.hostAccess().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Recovery security geometry replanned.', { reason, securityPoint: { ...selected.point }, hasThreatLos: selected.hasThreatLos, fireLaneClear: selected.fireLaneClear, safetyReplans: this.recoverySafetyReplans });
    return true;
  }

  private recoveryThreatPoint(state: TacticalHostState): GridPoint | null {
    return clonePoint(this.lastConfirmedPosition ?? this.threatSector ?? state.squad.sharedLastKnownPosition);
  }

  private executeRecoverySecurity(state: TacticalHostState): void {
    const plan = this.recoveryPlan;
    if (plan === null || plan.covererId === null || this.recoveryLastSecurityFireTick === state.logicalTick) return;
    const member = this.hostAccess().members.find((entry) => entry.id === plan.covererId);
    if (member === undefined || !this.isAlive(member.id) || (this.equipment.get(member.id)?.ammoRounds ?? 0) < RECOVERY_WEAPON_READY_ROUNDS) return;
    const visible = this.hostAccess().canSeePlayer(member);
    member.targetVisible = visible;
    if (!visible) return;
    const patient = state.agents.find((agent) => agent.id === plan.patientId);
    const rescuer = state.agents.find((agent) => agent.id === plan.rescuerId);
    const friends = [patient?.position, rescuer?.position].filter((point): point is GridPoint => point !== undefined);
    if (!recoveryFireLaneClear(member.position, state.player, friends)) {
      this.recoveryLaneBlockedTicks += 1;
      if (this.recoveryLaneBlockedTicks >= 2 && state.logicalTick - this.recoveryLastReplanTick >= 3) {
        this.recoveryLaneBlockedTicks = 0;
        this.replanRecoverySecurity(state, 'friendly_fire_lane_blocked', true);
      }
      return;
    }
    this.recoveryLaneBlockedTicks = 0;
    this.recoveryLastSecurityFireTick = state.logicalTick;
    this.hostAccess().tryFire(member, state.player, 'recovery security confirmed visual');
  }

  private abortRecovery(state: TacticalHostState, reason: string): void {
    const plan = this.recoveryPlan;
    if (plan === null) return;
    this.recoverySafetyAborts += 1;
    this.recoveryAbortUntilTick = state.logicalTick + 8;
    this.recoverySafetyDecision = 'abort';
    this.hostAccess().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Recovery contract aborted by safety authority.', { patientId: plan.patientId, rescuerId: plan.rescuerId, covererId: plan.covererId, reason, safetyAborts: this.recoverySafetyAborts });
    this.recoveryPlan = null;
    this.contracts.clear();
    this.hostAccess().applyRoles();
    this.hostAccess().refreshTacticalPlan();
  }
`;
runtime = mustReplace(runtime, '  private activeReaction(agentId: string, tick: number): ReactionCommitment | null {', recoveryMethods + '\n  private activeReaction(agentId: string, tick: number): ReactionCommitment | null {', 'recovery safety methods');

runtime = mustReplace(runtime, `interface HostAccess {
  members: HostMember[];`, `interface HostAccess {
  members: HostMember[];
  player: GridPoint;`, 'host player access');
write('Apps/Workbench/src/simulation/tacticalWizardRuntime.ts', runtime);

// Semantic simulation entry plus Stage 2 real active gaze and unified visual fact.
let simulation = read('Apps/Workbench/src/simulation/tacticalWizardSimulation.ts');
simulation = simulation.replaceAll("./tacticalWizardTestMapV7", "./tacticalWizardTestMap");
simulation = simulation.replaceAll("./tacticalWizardSimulationV7", "./tacticalWizardHost");
simulation = simulation.replace("import type { ExecutionContract } from './tacticalWizardHierarchy';", "import type { ExecutionContract } from './tacticalWizardHierarchy';\nimport { attentionLookTarget, scanAttention, type AttentionMode, type AttentionSample } from './attention';");
simulation = simulation.replaceAll("entrypoint: 'TacticalWizardSimulationV4'", "entrypoint: 'TacticalWizardSimulation'");
simulation = simulation.replaceAll("behaviorRevision: 'fixed-hierarchy-parity-r1'", "behaviorProfile: 'active_attention_recovery'");
simulation = simulation.replaceAll('behaviorRevision: identity.behaviorRevision', 'behaviorProfile: identity.behaviorProfile');
simulation = simulation.replaceAll('behaviorRevision', 'behaviorProfile');
simulation = mustReplace(simulation, `  readonly fastSearchTransitions: number;
}`, `  readonly fastSearchTransitions: number;
  readonly attention: readonly (AttentionSample & { readonly agentId: string })[];
}`, 'attention state view');
simulation = mustReplace(simulation, `  pushEvent: (message: string) => void;
}`, `  pushEvent: (message: string) => void;
  updatePostureAndFacing?: (member: ThreatHostMember) => void;
}`, 'attention host hook');
simulation = mustReplace(simulation, `    this.installActiveAttentionVision();`, `    this.installMovingAttentionScan();
    this.installActiveAttentionVision();`, 'active gaze hook install');
simulation = mustReplace(simulation, `    super.advance(deltaSeconds);
    const state = super.getState();
    this.applyFacingRateLimit(beforeFacing, Math.max(0, host.motionFrame - beforeFrame));
    this.observeContactKnowledge(state);`, `    super.advance(deltaSeconds);
    this.applyFacingRateLimit(beforeFacing, Math.max(0, host.motionFrame - beforeFrame));
    this.synchronizeVisualContactFacts();
    const state = super.getState();
    this.observeContactKnowledge(state);`, 'visual fact synchronization order');

const gazeMethod = `
  private installMovingAttentionScan(): void {
    const host = this.behaviorHost();
    if (typeof host.updatePostureAndFacing !== 'function') return;
    const original = host.updatePostureAndFacing.bind(host);
    host.updatePostureAndFacing = (member: ThreatHostMember): void => {
      original(member);
      if (member.targetVisible || !this.shouldUseActiveAttention(member)) return;
      const anchor = this.attentionAnchor(member);
      if (anchor === null || distance(member.position, anchor) < 0.2) return;
      const agentIndex = Math.max(0, host.members.findIndex((entry) => entry.id === member.id));
      const scan = scanAttention(member.position, anchor, host.motionFrame, agentIndex);
      member.facing = { ...scan.facing };
      member.searchLookTarget = { ...scan.lookTarget };
    };
  }
`;
simulation = mustReplace(simulation, '  private installActiveAttentionVision(): void {', gazeMethod + '\n  private installActiveAttentionVision(): void {', 'moving attention method');

const attentionMethods = `
  private attentionAnchor(member: ThreatHostMember): GridPoint | null {
    const investigation = this.activeInvestigation(this.behaviorHost().logicalTick);
    if (investigation !== null && this.investigationResponders(investigation).includes(member.id)) return { ...investigation.target };
    if (this.runtimeAccess().recoveryPlan?.covererId === member.id) return clonePoint(this.threatEvidenceSector ?? this.lastConfirmedContact ?? this.behaviorHost().sharedLastKnownPosition);
    if (member.task === 'search_sector' || member.task === 'overwatch') return clonePoint(member.tacticalTarget ?? this.lastConfirmedContact ?? this.behaviorHost().sharedLastKnownPosition);
    return null;
  }

  private attentionMode(member: ThreatHostMember): AttentionMode {
    if (member.targetVisible) return 'track_visual';
    const investigation = this.activeInvestigation(this.behaviorHost().logicalTick);
    if (investigation !== null && this.investigationResponders(investigation).includes(member.id)) return 'scan_acoustic';
    if (this.runtimeAccess().recoveryPlan?.covererId === member.id) return 'recovery_security';
    if (member.task === 'search_sector' || member.task === 'overwatch') return 'scan_search';
    return 'tactical';
  }

  private synchronizeVisualContactFacts(): void {
    const host = this.behaviorHost();
    for (const member of host.members) member.targetVisible = host.canSeePlayer(member);
  }
`;
simulation = mustReplace(simulation, '  private shouldUseActiveAttention(member: ThreatHostMember): boolean {', attentionMethods + '\n  private shouldUseActiveAttention(member: ThreatHostMember): boolean {', 'attention semantic methods');
simulation = mustReplace(simulation, `    if (member.task === 'search_sector' || member.task === 'overwatch') return true;
    const investigation`, `    if (member.task === 'search_sector' || member.task === 'overwatch') return true;
    if (this.runtimeAccess().recoveryPlan?.covererId === member.id) return true;
    const investigation`, 'recovery security attention');
simulation = mustReplaceRegex(simulation, /  private confirmedHostVisualIds\(state: RuntimeState\): string\[\] \{[\s\S]*?\n  \}\n\n  private currentFrontier/, `  private confirmedHostVisualIds(state: RuntimeState): string[] {
    return state.agents
      .filter((agent) => agent.alive && agent.targetVisible)
      .map((agent) => agent.id)
      .sort((left, right) => left.localeCompare(right, 'en'));
  }

  private currentFrontier`, 'single visual authority');

simulation = mustReplace(simulation, `        fastSearchTransitions: this.fastSearchTransitions,
      },`, `        fastSearchTransitions: this.fastSearchTransitions,
        attention: this.behaviorHost().members.map((member, agentIndex) => {
          const anchor = this.attentionAnchor(member);
          const mode = this.attentionMode(member);
          const scan = anchor === null ? null : scanAttention(member.position, anchor, this.behaviorHost().motionFrame, agentIndex);
          return {
            agentId: member.id,
            mode,
            anchor,
            scanPhase: scan?.scanPhase ?? 0,
            facing: { ...member.facing },
            lookTarget: clonePoint(member.searchLookTarget ?? (mode === 'track_visual' ? attentionLookTarget(member.position, member.facing) : null)),
          };
        }),
      },`, 'attention debug view');
simulation = mustReplace(simulation, `    const assignment = runtime.logistics;
    if (assignment === null || state.squad.alertState !== 'active') return;`, `    const assignment = runtime.logistics;
    if (assignment === null || state.squad.alertState !== 'active') return;
    const living = state.agents.filter((agent) => agent.alive);
    if (living.length > 0 && living.every((agent) => (runtime.equipment.get(agent.id)?.ammoRounds ?? 0) < 3)) return;`, 'all-dry emergency logistics protection');
simulation = simulation.replaceAll("entrypoint: 'TacticalWizardSimulationV4'", "entrypoint: 'TacticalWizardSimulation'");
simulation = simulation.replaceAll("behaviorProfile: 'fixed-hierarchy-parity-r1'", "behaviorProfile: 'active_attention_recovery'");
write('Apps/Workbench/src/simulation/tacticalWizardSimulation.ts', simulation);

// Production UI semantic names. Existing semantic overlay chain is retained, but
// the numbered wrapper chain is removed from production imports.
write('Apps/Workbench/src/components/SimulationCanvas.tsx', "export { SimulationCanvas } from './SimulationCombatCanvas';\n");
let tacticalCanvas = read('Apps/Workbench/src/components/SimulationTacticalCanvas.tsx').replaceAll('./SimulationCanvasV3Base', './SimulationWorldCanvas');
write('Apps/Workbench/src/components/SimulationTacticalCanvas.tsx', tacticalCanvas);
write('Apps/Workbench/src/pages/RuntimePages.tsx', "export { SimulationPage, DebugPage } from './RuntimeCombatPages';\nexport { VisualizationPage, ConnectionPage } from './RuntimeUtilityPages';\n");
let utilityPages = read('Apps/Workbench/src/pages/RuntimeUtilityPages.tsx').replaceAll('../components/SimulationCanvasV3', '../components/SimulationCanvas');
write('Apps/Workbench/src/pages/RuntimeUtilityPages.tsx', utilityPages);
let corePages = read('Apps/Workbench/src/pages/RuntimeCorePages.tsx').replaceAll('./RuntimePagesV3Base', './RuntimeUtilityPages');
write('Apps/Workbench/src/pages/RuntimeCorePages.tsx', corePages);
let combatPages = read('Apps/Workbench/src/pages/RuntimeCombatPages.tsx').replaceAll('./RuntimePagesV4', './RuntimeCorePages').replaceAll('V11 Counter-Ambush / Rescue Security', 'Counter-Ambush / Rescue Security').replaceAll('V11 反伏击 / 救援安全契约', '反伏击 / 救援安全契约');
write('Apps/Workbench/src/pages/RuntimeCombatPages.tsx', combatPages);

// Global production/test import rewrite.
const rewriteRoots = [resolve(root, 'Apps/Workbench/src'), testDir];
const replacements = [
  ['tacticalWizardSimulationV4', 'tacticalWizardSimulation'],
  ['tacticalWizardSimulationV7', 'tacticalWizardHost'],
  ['tacticalWizardTestMapV7', 'tacticalWizardTestMap'],
  ['RuntimePagesV3Base', 'RuntimeUtilityPages'],
  ['RuntimePagesV4', 'RuntimeCorePages'],
  ['RuntimePagesV5', 'RuntimeCombatPages'],
  ['RuntimePagesV3', 'RuntimePages'],
  ['SimulationCanvasV3Base', 'SimulationWorldCanvas'],
  ['SimulationCanvasV6', 'SimulationCanvas'],
  ['SimulationCanvasV5', 'SimulationRecoveryCanvas'],
  ['SimulationCanvasV4', 'SimulationOperationsCanvas'],
  ['SimulationCanvasV3', 'SimulationCanvas'],
  ['behaviorRevision', 'behaviorProfile'],
  ['fixed-hierarchy-parity-r1', 'active_attention_recovery'],
  ['TacticalWizardSimulationV4', 'TacticalWizardSimulation'],
];
for (const base of rewriteRoots) {
  for (const file of walk(base).filter((path) => /\.(ts|tsx)$/.test(path))) {
    let text = readFileSync(file, 'utf8');
    for (const [from, to] of replacements) text = text.replaceAll(from, to);
    writeFileSync(file, text);
  }
}

// App uses semantic authoring/runtime entries only.
let app = read('Apps/Workbench/src/App.tsx');
app = app.replace("import { DesignPage } from './pages/DesignPageV2';", "import { DesignPage } from './pages/DesignWorkspacePage';");
app = app.replace("from './pages/RuntimePages';", "from './pages/RuntimePages';");
write('Apps/Workbench/src/App.tsx', app);

// Host regression test uses the semantic Host class explicitly.
const hostTestOld = resolve(testDir, 'simulationV7.test.ts');
const hostTestNew = resolve(testDir, 'simulationHost.test.ts');
if (existsSync(hostTestOld)) renameSync(hostTestOld, hostTestNew);
let hostTest = readFileSync(hostTestNew, 'utf8');
hostTest = hostTest.replace("import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardHost';", "import { TacticalWizardHost } from '../../Apps/Workbench/src/simulation/tacticalWizardHost';");
hostTest = hostTest.replaceAll('new TacticalWizardSimulation()', 'new TacticalWizardHost()');
hostTest = hostTest.replaceAll('Tactical Wizard V7', 'Tactical Wizard Host');
hostTest = hostTest.replaceAll('legacy yard', 'training yard');
writeFileSync(hostTestNew, hostTest);
const simTestOld = resolve(testDir, 'simulationV4.test.ts');
const simTestNew = resolve(testDir, 'simulationRuntime.test.ts');
if (existsSync(simTestOld)) renameSync(simTestOld, simTestNew);

write('Tests/workbench/runtimeArchitecture.test.ts', `import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = resolve(process.cwd(), 'Apps/Workbench/src');
const simulationDir = resolve(src, 'simulation');
const retiredProductionFiles = [
  'tacticalWizardSimulationV3.ts',
  'tacticalWizardSimulationV4.ts',
  'tacticalWizardSimulationV7.ts',
  'tacticalWizardTestMapV7.ts',
];
const retiredUiFiles = [
  'components/SimulationCanvasV3.tsx',
  'components/SimulationCanvasV3Base.tsx',
  'components/SimulationCanvasV4.tsx',
  'components/SimulationCanvasV5.tsx',
  'components/SimulationCanvasV6.tsx',
  'pages/RuntimePagesV3.tsx',
  'pages/RuntimePagesV3Base.tsx',
  'pages/RuntimePagesV4.tsx',
  'pages/RuntimePagesV5.tsx',
  'pages/DesignPageV2.tsx',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

describe('Tactical Wizard production architecture guardrails', () => {
  it('uses semantic production entries and no numbered runtime import chain', () => {
    const entry = readFileSync(resolve(simulationDir, 'tacticalWizardSimulation.ts'), 'utf8');
    const runtime = readFileSync(resolve(simulationDir, 'tacticalWizardRuntime.ts'), 'utf8');
    const host = readFileSync(resolve(simulationDir, 'tacticalWizardHost.ts'), 'utf8');
    expect(entry).toContain('class TacticalWizardSimulation extends TacticalWizardRuntime');
    expect(runtime).toContain('class TacticalWizardRuntime');
    expect(host).toContain('class TacticalWizardHost');
    expect(entry).toContain("entrypoint: 'TacticalWizardSimulation'");
    expect(entry).toContain("behaviorProfile: 'active_attention_recovery'");
    expect(runtime).not.toMatch(/class\\s+TacticalWizardRuntime\\s+extends\\s+/);
    for (const file of sourceFiles(src)) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from\\s+['\"][^'\"]*(?:Simulation|Runtime|Canvas|Page|Map)V\\d+[^'\"]*['\"]/);
    }
  });

  it('physically removes numbered production runtime and wrapper files', () => {
    for (const file of retiredProductionFiles) expect(existsSync(resolve(simulationDir, file)), file).toBe(false);
    for (const file of retiredUiFiles) expect(existsSync(resolve(src, file)), file).toBe(false);
  });

  it('keeps one explicit responsibility order and one execution contract', () => {
    const runtime = readFileSync(resolve(simulationDir, 'tacticalWizardRuntime.ts'), 'utf8');
    const hierarchy = readFileSync(resolve(simulationDir, 'tacticalWizardHierarchy.ts'), 'utf8');
    expect(runtime).toContain("['perception', 'contact', 'tactical_planning', 'operational_arbitration', 'execution', 'host']");
    expect(runtime).toContain("finalMovementAuthority: 'execution_contract'");
    expect(runtime).toContain("finalWeaponAuthority: 'execution_contract'");
    expect(hierarchy).toContain('resolveExecutionContract');
  });
});
`);

write('Tests/workbench/activeAttentionRecovery.test.ts', `import { describe, expect, it } from 'vitest';
import { TacticalWizardSimulation } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulation';

describe('semantic active attention and recovery safety', () => {
  it('keeps one visual-contact fact for agent view and combat authority', () => {
    const simulation = new TacticalWizardSimulation();
    let state = simulation.getState();
    for (let frame = 0; frame < 180; frame += 1) {
      state = simulation.advance(1 / 30);
      const fromAgents = state.agents.filter((agent) => agent.alive && agent.targetVisible).map((agent) => agent.id).sort();
      expect([...state.combatAuthority.confirmedVisualIds].sort()).toEqual(fromAgents);
    }
  });

  it('publishes active attention state and a real moving gaze target during investigation/search', () => {
    const simulation = new TacticalWizardSimulation();
    simulation.emitNoise();
    let state = simulation.getState();
    let sawScan = false;
    let sawChangingFacing = false;
    const firstFacing = new Map(state.agents.map((agent) => [agent.id, { ...agent.facing }]));
    for (let frame = 0; frame < 420; frame += 1) {
      state = simulation.advance(1 / 30);
      for (const attention of state.perceptionIntegration.attention) {
        if ((attention.mode === 'scan_search' || attention.mode === 'scan_acoustic') && attention.lookTarget !== null) sawScan = true;
        const initial = firstFacing.get(attention.agentId);
        if (initial !== undefined && Math.hypot(attention.facing.x - initial.x, attention.facing.y - initial.y) > 0.1) sawChangingFacing = true;
      }
      if (sawScan && sawChangingFacing) break;
    }
    expect(sawScan).toBe(true);
    expect(sawChangingFacing).toBe(true);
  });

  it('raises rescue pressure and interrupts treatment under sustained incoming fire', () => {
    const simulation = new TacticalWizardSimulation();
    expect(simulation.setAgentVitals('twr:rifle-squad:bravo', { health: 0 })).toBe(true);
    let state = simulation.getState();
    for (let frame = 0; frame < 180 && state.recovery.phase === 'none'; frame += 1) state = simulation.advance(1 / 30);
    expect(state.recovery.phase).not.toBe('none');
    const casualty = state.agents.find((agent) => agent.id === state.recovery.downedAgentId)!;
    for (let burst = 0; burst < 8; burst += 1) {
      simulation.playerFireAt(casualty.position);
      for (let frame = 0; frame < 8; frame += 1) state = simulation.advance(1 / 30);
    }
    expect(state.recoverySafety.pressure).toBeGreaterThan(0.3);
    expect(state.recoverySafety.safetyReplans + state.recoverySafety.safetyAborts + state.threatResponse.rescueInterruptedCount).toBeGreaterThan(0);
  });
});
`);

// Update CURRENT_RUNTIME to describe the actual semantic production graph.
write('Apps/Workbench/src/simulation/CURRENT_RUNTIME.md', `# Tactical Wizard production runtime

Tactical Wizard production uses semantic modules only. Numbered simulation, runtime, page, canvas and map implementations are forbidden from the production import graph; Git history is the sole archive for historical implementations.

## Production hierarchy

\`\`\`text
Perception / Attention
  ↓ facts only
Contact / Knowledge
  ↓ memory and confirmed/lost contact state
Tactical Planning
  ↓ Role / Task / TacticalTarget
Operational Arbitration
  ↓ chooses the active plan lease
Execution Contract
  ↓ Movement / Weapon / Throwable authorization
Host
  ↓ navigation, locomotion, facing, firing and world simulation
\`\`\`

Production entry: \`tacticalWizardSimulation.ts\` / \`TacticalWizardSimulation\`.
Host: \`tacticalWizardHost.ts\` / \`TacticalWizardHost\`.
Map: \`tacticalWizardTestMap.ts\`.

### Single visual authority

One current-facing + FOV + LOS result is synchronized into each agent's \`targetVisible\`. Contact Knowledge, \`confirmedVisualIds\`, firing validity, recovery security and debug views consume that same fact rather than independently deciding whether the player is visible.

### Active attention

Searching, acoustic investigation and recovery security may own an explicit attention anchor. Active gaze uses a deterministic left/right scan pattern while moving, changes real facing, and publishes \`searchLookTarget\` for the Workbench gaze line. Detection still requires current facing, FOV and world LOS.

### Recovery under fire

Recovery Safety classifies pressure as \`stable / pressured / unsafe\` and resolves \`continue / pause / reposition / abort\`. Player shots, near-lane fire and ineffective security raise pressure. Recovery security selects reachable geometry around the casualty, prefers threat LOS and a friendly-safe lane, replans blocked or blind positions, and may fire only on confirmed visual contact through the normal Execution Contract. A progress watchdog replans stalled recovery and aborts after repeated failed geometry rather than allowing an indefinite lease deadlock.

### Production guardrail

CI scans Workbench TypeScript production imports and rejects numbered Simulation / Runtime / Canvas / Page / Map dependencies. New behavior must extend semantic responsibility modules instead of creating V-next wrappers.
`);

// Physical removal of numbered production sources/wrappers after semantic copies exist.
for (const path of [
  'Apps/Workbench/src/simulation/tacticalWizardSimulationV3.ts',
  'Apps/Workbench/src/simulation/tacticalWizardSimulationV4.ts',
  'Apps/Workbench/src/simulation/tacticalWizardSimulationV7.ts',
  'Apps/Workbench/src/simulation/tacticalWizardTestMapV7.ts',
  'Apps/Workbench/src/components/SimulationCanvasV3.tsx',
  'Apps/Workbench/src/components/SimulationCanvasV3Base.tsx',
  'Apps/Workbench/src/components/SimulationCanvasV4.tsx',
  'Apps/Workbench/src/components/SimulationCanvasV5.tsx',
  'Apps/Workbench/src/components/SimulationCanvasV6.tsx',
  'Apps/Workbench/src/pages/RuntimePagesV3.tsx',
  'Apps/Workbench/src/pages/RuntimePagesV3Base.tsx',
  'Apps/Workbench/src/pages/RuntimePagesV4.tsx',
  'Apps/Workbench/src/pages/RuntimePagesV5.tsx',
  'Apps/Workbench/src/pages/DesignPageV2.tsx',
]) remove(path);

console.log('Tactical Wizard semantic runtime migration complete.');
