import type {
  ActionLifecycle,
  ActionResult,
  AgentRuntimeOptions,
  AgentRuntimeSnapshot,
  Belief,
  ContextSnapshot,
  DecisionTrace,
  Intent,
  MemoryRecord,
  Observation,
  Stimulus,
  TickContext,
  Vector3,
} from './types';

const EMPTY_MEMORY: MemoryRecord = {
  targetId: null,
  lastSeenPosition: null,
  lastSeenTick: null,
  lastHeardPosition: null,
  lastHeardTick: null,
  confidence: 0,
  hostility: 'unknown',
};

export interface RuntimeTickInput {
  readonly tick: TickContext;
  readonly context: ContextSnapshot;
  readonly stimuli: readonly Stimulus[];
  readonly actionResults?: readonly ActionResult[];
}

export class AgentRuntime {
  readonly #options: AgentRuntimeOptions;
  #memory: MemoryRecord = cloneMemory(EMPTY_MEMORY);
  #currentIntent: Intent | null = null;
  #actions: ActionLifecycle[] = [];
  #trace: DecisionTrace[] = [];
  #snapshot: AgentRuntimeSnapshot | null = null;
  #disposed = false;

  public constructor(options: AgentRuntimeOptions) {
    this.#options = options;
  }

  public tick(input: RuntimeTickInput): AgentRuntimeSnapshot {
    this.#ensureActive();
    if (input.context.agentId !== this.#options.agentId) {
      throw new Error(`Context agentId ${input.context.agentId} does not match runtime ${this.#options.agentId}.`);
    }

    const actionResults = input.actionResults ?? [];
    this.#applyActionResults(actionResults);
    const memoryBefore = cloneMemory(this.#memory);
    this.#memory = decayMemory(this.#memory, input.tick.deltaSeconds, this.#options.memoryDecayPerSecond);

    const sortedStimuli = [...input.stimuli].sort((left, right) => {
      if (left.sequence !== right.sequence) return left.sequence - right.sequence;
      return left.id.localeCompare(right.id, 'en');
    });
    const observations = sortedStimuli.map(toObservation);
    const seenThisTick = observations.find((observation) => observation.kind === 'visual_actor' && observation.position !== undefined);
    const heardThisTick = observations.find((observation) => observation.kind === 'noise' && observation.position !== undefined);
    const reportThisTick = observations.find((observation) => (observation.kind === 'ally_report' || observation.kind === 'squad_report') && observation.position !== undefined);

    for (const observation of observations) {
      this.#memory = updateMemory(this.#memory, observation, input.tick.logicalTick);
    }
    if (this.#memory.confidence < this.#options.forgetBelowConfidence) {
      this.#memory = cloneMemory(EMPTY_MEMORY);
    }

    const belief = buildBelief(this.#memory, seenThisTick, heardThisTick, reportThisTick);
    const decisionInput = {
      tick: input.tick,
      context: input.context,
      observations,
      memory: cloneMemory(this.#memory),
      belief,
      currentIntent: this.#currentIntent,
    };
    const decision = this.#options.policy.decide(decisionInput);

    let cancelledIntent: DecisionTrace['cancelledIntent'];
    const changedIntent = this.#currentIntent?.id !== decision.selected.id;
    if (changedIntent && this.#currentIntent !== null) {
      cancelledIntent = {
        intentId: this.#currentIntent.id,
        reason: `replaced_by:${decision.selected.id}`,
      };
      this.#actions = this.#actions.map((entry) => {
        if (isTerminal(entry.status)) return entry;
        const result: ActionResult = {
          actionId: entry.action.id,
          status: 'cancelled',
          reason: `intent_replaced_by:${decision.selected.id}`,
        };
        return { ...entry, status: 'cancelled', result };
      });
    }

    let actionRequests: ActionLifecycle[] = [];
    if (changedIntent || this.#actions.every((entry) => isTerminal(entry.status))) {
      const planned = this.#options.actionPlanner({ ...decisionInput, selectedIntent: decision.selected });
      actionRequests = planned.map((action, index) => ({
        action: {
          ...action,
          id: `${this.#options.agentId}:${input.tick.logicalTick}:${index}:${action.kind}`,
        },
        status: 'requested' as const,
      }));
      this.#actions = actionRequests;
    }
    this.#currentIntent = decision.selected;

    const trace: DecisionTrace = {
      agentId: this.#options.agentId,
      logicalTick: input.tick.logicalTick,
      contextSummary: summarizeContext(input.context),
      observations,
      memoryBefore,
      memoryAfter: cloneMemory(this.#memory),
      memoryChanges: describeMemoryChanges(memoryBefore, this.#memory),
      belief,
      candidates: decision.candidates,
      selectedIntent: decision.selected,
      ...(cancelledIntent === undefined ? {} : { cancelledIntent }),
      actionRequests: actionRequests.map((entry) => entry.action),
      actionResults: [...actionResults],
    };
    this.#trace.push(trace);

    this.#snapshot = {
      agentId: this.#options.agentId,
      logicalTick: input.tick.logicalTick,
      context: input.context,
      observations,
      memory: cloneMemory(this.#memory),
      belief,
      candidates: decision.candidates,
      selectedIntent: decision.selected,
      actions: this.#actions.map(cloneLifecycle),
    };
    return this.getSnapshot();
  }

  public getSnapshot(): AgentRuntimeSnapshot {
    this.#ensureActive();
    if (this.#snapshot === null) throw new Error('Agent has not ticked yet.');
    return structuredClone(this.#snapshot);
  }

  public getTrace(): readonly DecisionTrace[] {
    return structuredClone(this.#trace);
  }

  public reset(): void {
    this.#ensureActive();
    this.#memory = cloneMemory(EMPTY_MEMORY);
    this.#currentIntent = null;
    this.#actions = [];
    this.#trace = [];
    this.#snapshot = null;
  }

  public dispose(): void {
    this.#disposed = true;
    this.#actions = [];
    this.#trace = [];
    this.#snapshot = null;
  }

  #applyActionResults(results: readonly ActionResult[]): void {
    if (results.length === 0) return;
    const byId = new Map(results.map((result) => [result.actionId, result]));
    this.#actions = this.#actions.map((entry) => {
      const result = byId.get(entry.action.id);
      return result === undefined ? entry : { ...entry, status: result.status, result };
    });
  }

  #ensureActive(): void {
    if (this.#disposed) throw new Error(`Agent runtime ${this.#options.agentId} is disposed.`);
  }
}

function toObservation(stimulus: Stimulus): Observation {
  switch (stimulus.kind) {
    case 'visual_actor':
      return {
        id: `obs:${stimulus.id}`,
        sourceStimulusId: stimulus.id,
        logicalTick: stimulus.logicalTick,
        kind: stimulus.kind,
        subjectId: stimulus.actorId,
        ...(stimulus.visible && stimulus.position !== undefined ? { position: cloneVector(stimulus.position) } : {}),
        confidence: stimulus.visible ? 1 : 0,
        relation: stimulus.relation ?? 'unknown',
        detail: stimulus.visible ? 'visual_confirmed' : 'visual_not_confirmed',
      };
    case 'noise':
      return {
        id: `obs:${stimulus.id}`,
        sourceStimulusId: stimulus.id,
        logicalTick: stimulus.logicalTick,
        kind: stimulus.kind,
        ...(stimulus.sourceId === undefined ? {} : { subjectId: stimulus.sourceId }),
        position: cloneVector(stimulus.perceivedPosition),
        confidence: clamp01(0.35 + stimulus.intensity * 0.45),
        detail: stimulus.actionKind,
      };
    case 'damage_received':
      return {
        id: `obs:${stimulus.id}`,
        sourceStimulusId: stimulus.id,
        logicalTick: stimulus.logicalTick,
        kind: stimulus.kind,
        ...(stimulus.sourceId === undefined ? {} : { subjectId: stimulus.sourceId }),
        confidence: stimulus.sourceId === undefined ? 0.35 : 0.8,
        relation: 'hostile',
        detail: `damage:${stimulus.amount}`,
      };
    case 'ally_report':
    case 'squad_report':
      return {
        id: `obs:${stimulus.id}`,
        sourceStimulusId: stimulus.id,
        logicalTick: stimulus.logicalTick,
        kind: stimulus.kind,
        ...(stimulus.subjectId === undefined ? {} : { subjectId: stimulus.subjectId }),
        ...(stimulus.reportedPosition === undefined ? {} : { position: cloneVector(stimulus.reportedPosition) }),
        confidence: clamp01(stimulus.confidence),
        detail: `report_from:${stimulus.sourceId}`,
      };
  }
}

function updateMemory(memory: MemoryRecord, observation: Observation, tick: number): MemoryRecord {
  if (observation.kind === 'visual_actor' && observation.position !== undefined) {
    return {
      targetId: observation.subjectId ?? memory.targetId,
      lastSeenPosition: cloneVector(observation.position),
      lastSeenTick: tick,
      lastHeardPosition: memory.lastHeardPosition,
      lastHeardTick: memory.lastHeardTick,
      confidence: 1,
      hostility: observation.relation ?? memory.hostility,
    };
  }
  if (observation.kind === 'noise' && observation.position !== undefined) {
    return {
      ...memory,
      targetId: observation.subjectId ?? memory.targetId,
      lastHeardPosition: cloneVector(observation.position),
      lastHeardTick: tick,
      confidence: Math.max(memory.confidence, observation.confidence),
    };
  }
  if ((observation.kind === 'ally_report' || observation.kind === 'squad_report') && observation.position !== undefined) {
    return {
      ...memory,
      targetId: observation.subjectId ?? memory.targetId,
      lastHeardPosition: cloneVector(observation.position),
      lastHeardTick: tick,
      confidence: Math.max(memory.confidence, observation.confidence),
    };
  }
  if (observation.kind === 'damage_received') {
    return {
      ...memory,
      targetId: observation.subjectId ?? memory.targetId,
      confidence: Math.max(memory.confidence, observation.confidence),
      hostility: 'hostile',
    };
  }
  return memory;
}

function decayMemory(memory: MemoryRecord, deltaSeconds: number, rate: number): MemoryRecord {
  if (memory.confidence <= 0) return memory;
  return { ...memory, confidence: clamp01(memory.confidence - Math.max(0, deltaSeconds) * Math.max(0, rate)) };
}

function buildBelief(
  memory: MemoryRecord,
  seen?: Observation,
  heard?: Observation,
  report?: Observation,
): Belief {
  if (seen?.position !== undefined) {
    return { targetId: seen.subjectId ?? memory.targetId, estimatedPosition: cloneVector(seen.position), confidence: 1, source: 'visual', confirmedVisible: true };
  }
  if (heard?.position !== undefined) {
    return { targetId: heard.subjectId ?? memory.targetId, estimatedPosition: cloneVector(heard.position), confidence: memory.confidence, source: 'hearing', confirmedVisible: false };
  }
  if (report?.position !== undefined) {
    return { targetId: report.subjectId ?? memory.targetId, estimatedPosition: cloneVector(report.position), confidence: memory.confidence, source: 'report', confirmedVisible: false };
  }
  const rememberedPosition = memory.lastSeenPosition ?? memory.lastHeardPosition;
  if (rememberedPosition !== null && memory.confidence > 0) {
    return { targetId: memory.targetId, estimatedPosition: cloneVector(rememberedPosition), confidence: memory.confidence, source: 'memory', confirmedVisible: false };
  }
  return { targetId: null, estimatedPosition: null, confidence: 0, source: 'none', confirmedVisible: false };
}

function summarizeContext(context: ContextSnapshot): Readonly<Record<string, import('./types').PortableValue>> {
  const values: Record<string, import('./types').PortableValue> = {};
  for (const key of Object.keys(context.values).sort((a, b) => a.localeCompare(b, 'en'))) values[key] = context.values[key]!;
  values.capabilities = [...context.capabilities].sort((a, b) => a.localeCompare(b, 'en'));
  return values;
}

function describeMemoryChanges(before: MemoryRecord, after: MemoryRecord): string[] {
  const changes: string[] = [];
  if (before.targetId !== after.targetId) changes.push(`target:${String(before.targetId)}→${String(after.targetId)}`);
  if (before.lastSeenTick !== after.lastSeenTick) changes.push(`lastSeenTick:${String(before.lastSeenTick)}→${String(after.lastSeenTick)}`);
  if (before.lastHeardTick !== after.lastHeardTick) changes.push(`lastHeardTick:${String(before.lastHeardTick)}→${String(after.lastHeardTick)}`);
  if (Math.abs(before.confidence - after.confidence) > 0.000001) changes.push(`confidence:${before.confidence.toFixed(3)}→${after.confidence.toFixed(3)}`);
  if (before.hostility !== after.hostility) changes.push(`hostility:${before.hostility}→${after.hostility}`);
  return changes;
}

function cloneMemory(memory: MemoryRecord): MemoryRecord {
  return {
    ...memory,
    lastSeenPosition: memory.lastSeenPosition === null ? null : cloneVector(memory.lastSeenPosition),
    lastHeardPosition: memory.lastHeardPosition === null ? null : cloneVector(memory.lastHeardPosition),
  };
}

function cloneLifecycle(lifecycle: ActionLifecycle): ActionLifecycle {
  return structuredClone(lifecycle);
}

function cloneVector(value: Vector3): Vector3 {
  return { x: value.x, y: value.y, z: value.z };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isTerminal(status: ActionLifecycle['status']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}
