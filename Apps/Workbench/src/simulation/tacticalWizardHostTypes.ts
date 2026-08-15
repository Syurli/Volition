import type { AgentRuntimeSnapshot, DecisionTrace } from '@willform/core';
import type { SquadTactic } from '@willform/example-tactical-wizard';
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
