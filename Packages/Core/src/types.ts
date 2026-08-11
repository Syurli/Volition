export type AgentId = string;

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type PortableScalar = string | number | boolean | null;
export type PortableValue = PortableScalar | Vector3 | readonly PortableValue[] | { readonly [key: string]: PortableValue };

export interface TickContext {
  readonly logicalTick: number;
  readonly deltaSeconds: number;
  readonly seed: number;
}

export interface ContextSnapshot {
  readonly agentId: AgentId;
  readonly values: Readonly<Record<string, PortableValue>>;
  readonly capabilities: readonly string[];
  readonly extensions?: Readonly<Record<string, PortableValue>>;
}

interface StimulusBase {
  readonly id: string;
  readonly sequence: number;
  readonly logicalTick: number;
}

export interface VisualActorStimulus extends StimulusBase {
  readonly kind: 'visual_actor';
  readonly actorId: string;
  readonly visible: boolean;
  readonly position?: Vector3;
  readonly relation?: 'hostile' | 'neutral' | 'friendly' | 'unknown';
}

export interface NoiseStimulus extends StimulusBase {
  readonly kind: 'noise';
  readonly sourceId?: string;
  readonly perceivedPosition: Vector3;
  readonly intensity: number;
  readonly actionKind?: string;
}

export interface DamageReceivedStimulus extends StimulusBase {
  readonly kind: 'damage_received';
  readonly sourceId?: string;
  readonly amount: number;
  readonly direction?: Vector3;
}

export interface ReportStimulus extends StimulusBase {
  readonly kind: 'ally_report' | 'squad_report';
  readonly sourceId: string;
  readonly subjectId?: string;
  readonly reportedPosition?: Vector3;
  readonly confidence: number;
}

export type Stimulus = VisualActorStimulus | NoiseStimulus | DamageReceivedStimulus | ReportStimulus;

export interface Observation {
  readonly id: string;
  readonly sourceStimulusId: string;
  readonly logicalTick: number;
  readonly kind: Stimulus['kind'];
  readonly subjectId?: string;
  readonly position?: Vector3;
  readonly confidence: number;
  readonly relation?: 'hostile' | 'neutral' | 'friendly' | 'unknown';
  readonly detail?: string;
}

export interface MemoryRecord {
  readonly targetId: string | null;
  readonly lastSeenPosition: Vector3 | null;
  readonly lastSeenTick: number | null;
  readonly lastHeardPosition: Vector3 | null;
  readonly lastHeardTick: number | null;
  readonly confidence: number;
  readonly hostility: 'hostile' | 'neutral' | 'friendly' | 'unknown';
}

export interface Belief {
  readonly targetId: string | null;
  readonly estimatedPosition: Vector3 | null;
  readonly confidence: number;
  readonly source: 'visual' | 'hearing' | 'report' | 'memory' | 'none';
  readonly confirmedVisible: boolean;
}

export interface BehaviorReference {
  readonly id: string;
}

export interface Intent {
  readonly id: string;
  readonly behavior: BehaviorReference;
  readonly targetId?: string;
  readonly targetPosition?: Vector3;
  readonly reason: string;
}

export interface DecisionCandidate {
  readonly id: string;
  readonly intent: Intent;
  readonly score: number;
  readonly eligible: boolean;
  readonly reason: string;
  readonly rejectedReason?: string;
}

export interface DecisionResult {
  readonly candidates: readonly DecisionCandidate[];
  readonly selected: Intent;
  readonly selectedCandidateId: string;
}

export type ActionKind = 'move_to' | 'aim_at' | 'fire' | 'reload' | 'idle';
export type ActionStatus = 'requested' | 'accepted' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ActionIntent {
  readonly id: string;
  readonly kind: ActionKind;
  readonly targetId?: string;
  readonly targetPosition?: Vector3;
  readonly intentId: string;
}

export interface ActionResult {
  readonly actionId: string;
  readonly status: Exclude<ActionStatus, 'requested'>;
  readonly reason?: string;
}

export interface ActionLifecycle {
  readonly action: ActionIntent;
  readonly status: ActionStatus;
  readonly result?: ActionResult;
}

export interface DecisionTrace {
  readonly agentId: AgentId;
  readonly logicalTick: number;
  readonly contextSummary: Readonly<Record<string, PortableValue>>;
  readonly observations: readonly Observation[];
  readonly memoryBefore: MemoryRecord;
  readonly memoryAfter: MemoryRecord;
  readonly memoryChanges: readonly string[];
  readonly belief: Belief;
  readonly candidates: readonly DecisionCandidate[];
  readonly selectedIntent: Intent;
  readonly cancelledIntent?: { readonly intentId: string; readonly reason: string };
  readonly actionRequests: readonly ActionIntent[];
  readonly actionResults: readonly ActionResult[];
}

export interface AgentRuntimeSnapshot {
  readonly agentId: AgentId;
  readonly logicalTick: number;
  readonly context: ContextSnapshot;
  readonly observations: readonly Observation[];
  readonly memory: MemoryRecord;
  readonly belief: Belief;
  readonly candidates: readonly DecisionCandidate[];
  readonly selectedIntent: Intent;
  readonly actions: readonly ActionLifecycle[];
}

export interface DecisionInput {
  readonly tick: TickContext;
  readonly context: ContextSnapshot;
  readonly observations: readonly Observation[];
  readonly memory: MemoryRecord;
  readonly belief: Belief;
  readonly currentIntent: Intent | null;
}

export interface DecisionPolicy {
  readonly id: string;
  decide(input: DecisionInput): DecisionResult;
}

export interface ActionPlannerInput extends DecisionInput {
  readonly selectedIntent: Intent;
}

export type ActionPlanner = (input: ActionPlannerInput) => readonly Omit<ActionIntent, 'id'>[];

export interface AgentRuntimeOptions {
  readonly agentId: AgentId;
  readonly policy: DecisionPolicy;
  readonly actionPlanner: ActionPlanner;
  readonly memoryDecayPerSecond: number;
  readonly forgetBelowConfidence: number;
}
