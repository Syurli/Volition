import {
  AgentRuntime,
  UtilityDecisionPolicy,
  type ActionPlanner,
  type ActionResult,
  type ContextSnapshot,
  type DecisionCandidate,
  type DecisionInput,
  type Intent,
  type PortableValue,
  type Stimulus,
  type Vector3,
} from '@volition/core';
import { VOLITION_CONFIG_VERSION, type AgentDefinition, type VolitionProjectConfig } from '@volition/schema';

export * from './doctrine';

export const TACTICAL_WIZARD_AGENT_ID = 'twr:rifle-squad:alpha';
const RIFLE_SUPERVISOR_ID = 'supervisor:twr-rifle-basic';
const RIFLE_REASONER_ID = 'reasoner:twr-rifle-utility';

const agentBehaviorIds = ['behavior:patrol', 'behavior:investigate', 'behavior:search', 'behavior:engage', 'behavior:reload'] as const;
const runtimeBehaviorMap = {
  patrol: 'host.behavior.patrol',
  investigate: 'host.behavior.investigate',
  search: 'host.behavior.search',
  engage: 'host.behavior.engage',
  reload: 'host.behavior.reload',
} as const;

function rifleAgent(id: string, displayName: string, debugColorKey: string): AgentDefinition {
  return {
    id,
    displayName,
    decisionPolicy: {
      id: 'reference.utility.explicit-state.v1',
      config: { engageScore: 100, searchScore: 70, investigateScore: 60, patrolScore: 10 },
    },
    memory: { decayPerSecond: 0.22, forgetBelowConfidence: 0.15 },
    contextTypes: ['self', 'weapon_capability', 'patrol_route', 'squad_role', 'engagement_position'],
    stimulusTypes: ['visual_actor', 'noise', 'damage_received', 'ally_report', 'squad_report'],
    capabilities: ['move_to', 'aim_at', 'fire', 'reload'],
    behaviors: runtimeBehaviorMap,
    behaviorIds: agentBehaviorIds,
    supervisorId: RIFLE_SUPERVISOR_ID,
    reasonerIds: [RIFLE_REASONER_ID],
    patrolPoints: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
    extensions: {
      referenceApplication: 'Syurli/TWR_Dev',
      debugColorKey,
      note: 'Portable source asset; engine object paths are intentionally excluded.',
    },
  };
}

export const tacticalWizardProjectConfig: VolitionProjectConfig = {
  version: VOLITION_CONFIG_VERSION,
  projectId: 'tactical-wizard-reference',
  displayName: 'Tactical Wizard — Rifle Squad',
  behaviors: [
    { id: 'behavior:patrol', displayName: 'Patrol', scope: 'agent', intentId: 'patrol', hostBehaviorRef: 'host.behavior.patrol', description: 'Follow an assigned route while maintaining local awareness.', requiredCapabilities: ['move_to'] },
    { id: 'behavior:investigate', displayName: 'Investigate', scope: 'agent', intentId: 'investigate', hostBehaviorRef: 'host.behavior.investigate', description: 'Move toward an approximate non-visual observation.', requiredCapabilities: ['move_to'] },
    { id: 'behavior:search', displayName: 'Search Last Known', scope: 'agent', intentId: 'search', hostBehaviorRef: 'host.behavior.search', description: 'Search last-seen information while belief confidence decays.', requiredCapabilities: ['move_to'] },
    { id: 'behavior:engage', displayName: 'Engage', scope: 'agent', intentId: 'engage', hostBehaviorRef: 'host.behavior.engage', description: 'Move to an engagement position, aim and fire.', requiredCapabilities: ['move_to', 'aim_at', 'fire'] },
    { id: 'behavior:reload', displayName: 'Reload', scope: 'agent', intentId: 'reload', hostBehaviorRef: 'host.behavior.reload', requiredCapabilities: ['reload'] },
    { id: 'tactic:bounding', displayName: 'Bounding Overwatch', scope: 'squad', hostBehaviorRef: 'reference.squad.bounding', description: 'One member moves while another suppresses; roles rotate after cover is reached.', requiredCapabilities: [] },
    { id: 'tactic:flank', displayName: 'Flank', scope: 'squad', hostBehaviorRef: 'reference.squad.flank', description: 'Break a static firing pattern by creating a lateral angle.', requiredCapabilities: [] },
    { id: 'tactic:assault', displayName: 'Coordinated Assault', scope: 'squad', hostBehaviorRef: 'reference.squad.assault', description: 'Use a short aggressive window with two maneuver elements and one support element.', requiredCapabilities: [] },
    { id: 'tactic:regroup', displayName: 'Regroup / Rotate', scope: 'squad', hostBehaviorRef: 'reference.squad.regroup', description: 'Recover spacing, rotate exposed members and prepare a new maneuver.', requiredCapabilities: [] },
  ],
  reasoners: [{
    id: RIFLE_REASONER_ID,
    displayName: 'Rifle Utility Reasoner',
    kind: 'utility',
    config: { engageScore: 100, searchScore: 70, investigateScore: 60, patrolScore: 10 },
  }],
  supervisors: [{
    id: RIFLE_SUPERVISOR_ID,
    displayName: 'Rifle Brain Supervisor',
    initialMode: 'patrol',
    modes: [
      { id: 'patrol', displayName: 'Patrol', reasonerIds: [RIFLE_REASONER_ID] },
      { id: 'combat', displayName: 'Combat', reasonerIds: [RIFLE_REASONER_ID] },
      { id: 'search', displayName: 'Search', reasonerIds: [RIFLE_REASONER_ID] },
    ],
  }],
  agents: [
    rifleAgent('twr:rifle-squad:alpha', 'Alpha Rifleman', 'alpha'),
    rifleAgent('twr:rifle-squad:bravo', 'Bravo Rifleman', 'bravo'),
    rifleAgent('twr:rifle-squad:charlie', 'Charlie Rifleman', 'charlie'),
  ],
  squads: [{
    id: 'twr:rifle-squad-01',
    displayName: 'Rifle Squad 01',
    members: [
      { id: 'alpha', agentId: 'twr:rifle-squad:alpha', displayName: 'Alpha', preferredRole: 'lead' },
      { id: 'bravo', agentId: 'twr:rifle-squad:bravo', displayName: 'Bravo', preferredRole: 'maneuver' },
      { id: 'charlie', agentId: 'twr:rifle-squad:charlie', displayName: 'Charlie', preferredRole: 'support' },
    ],
    behaviorIds: ['tactic:bounding', 'tactic:flank', 'tactic:assault', 'tactic:regroup'],
    extensions: { doctrine: 'reference.tactical-wizard.rifle-squad.v1' },
  }],
};

export interface TacticalWizardFixtureRun {
  readonly config: VolitionProjectConfig;
  readonly snapshots: readonly ReturnType<AgentRuntime['getSnapshot']>[];
  readonly traces: ReturnType<AgentRuntime['getTrace']>;
  readonly selectedIntents: readonly string[];
}

/** Creates one runtime instance from the selected portable rifle-agent asset. */
export function createTacticalWizardReferenceRuntime(agentId: string = TACTICAL_WIZARD_AGENT_ID): AgentRuntime {
  const definition = tacticalWizardProjectConfig.agents.find((entry) => entry.id === agentId) ?? tacticalWizardProjectConfig.agents[0]!;
  return new AgentRuntime({
    agentId,
    policy: new UtilityDecisionPolicy(definition.decisionPolicy.id, (input) => makeCandidates(input, definition)),
    actionPlanner,
    memoryDecayPerSecond: definition.memory.decayPerSecond,
    forgetBelowConfidence: definition.memory.forgetBelowConfidence,
  });
}

export function runTacticalWizardFixture(seed = 1337): TacticalWizardFixtureRun {
  const runtime = createTacticalWizardReferenceRuntime();
  const snapshots: ReturnType<AgentRuntime['getSnapshot']>[] = [];
  let pendingActionResults: readonly ActionResult[] = [];
  for (let logicalTick = 0; logicalTick <= 8; logicalTick += 1) {
    const snapshot = runtime.tick({
      tick: { logicalTick, deltaSeconds: logicalTick === 0 ? 0 : 1, seed },
      context: fixtureContext(logicalTick),
      stimuli: fixtureStimuli(logicalTick),
      actionResults: pendingActionResults,
    });
    snapshots.push(snapshot);
    pendingActionResults = snapshot.actions.filter((entry) => entry.status === 'requested').map((entry): ActionResult => ({ actionId: entry.action.id, status: entry.action.kind === 'move_to' || entry.action.kind === 'aim_at' ? 'running' : 'succeeded', reason: 'deterministic_fixture_executor' }));
  }
  return { config: tacticalWizardProjectConfig, snapshots, traces: runtime.getTrace(), selectedIntents: snapshots.map((snapshot) => snapshot.selectedIntent.id) };
}

export function fixtureContext(logicalTick: number): ContextSnapshot {
  const patrolTarget = logicalTick < 4 ? { x: 4, y: 0, z: 0 } : { x: 0, y: 0, z: 0 };
  return { agentId: TACTICAL_WIZARD_AGENT_ID, values: { selfPosition: { x: 0, y: 0, z: 0 }, selfFacing: { x: 0, y: 0, z: 1 }, patrolTarget, weaponState: 'ready' }, capabilities: ['move_to', 'aim_at', 'fire', 'reload'] };
}

export function fixtureStimuli(logicalTick: number): readonly Stimulus[] {
  switch (logicalTick) {
    case 1: return [{ id: 'noise:player:1', sequence: 10, logicalTick, kind: 'noise', sourceId: 'player', perceivedPosition: { x: 5.2, y: 0, z: 4.6 }, intensity: 0.8, actionKind: 'footstep' }];
    case 3: return [{ id: 'visual:player:3', sequence: 20, logicalTick, kind: 'visual_actor', actorId: 'player', visible: true, position: { x: 7, y: 0, z: 7 }, relation: 'hostile' }];
    case 4: return [{ id: 'visual:player:4', sequence: 30, logicalTick, kind: 'visual_actor', actorId: 'player', visible: true, position: { x: 8, y: 0, z: 8 }, relation: 'hostile' }];
    case 5: return [{ id: 'visual:player:5-lost', sequence: 40, logicalTick, kind: 'visual_actor', actorId: 'player', visible: false, relation: 'hostile' }];
    default: return [];
  }
}

function makeCandidates(input: DecisionInput, definition: AgentDefinition): readonly DecisionCandidate[] {
  const cfg = definition.decisionPolicy.config ?? {};
  const patrolScore = numberConfig(cfg.patrolScore, 10); const investigateScore = numberConfig(cfg.investigateScore, 60); const searchScore = numberConfig(cfg.searchScore, 70); const engageScore = numberConfig(cfg.engageScore, 100);
  const patrol = candidate('patrol', patrolScore, true, 'Fallback while no actionable target belief exists.', input);
  const canFire = input.context.capabilities.includes('fire'); const canReload = input.context.capabilities.includes('reload'); const weaponState = input.context.values.weaponState;
  const visible = input.belief.confirmedVisible && input.belief.targetId !== null; const hasLastSeen = input.memory.lastSeenPosition !== null;
  const hasInvestigableNoise = !hasLastSeen && input.belief.estimatedPosition !== null && input.belief.confidence >= 0.2;
  const hasSearchMemory = hasLastSeen && !visible && input.belief.estimatedPosition !== null && input.belief.confidence >= 0.2;
  return [
    candidate('reload', 110, weaponState === 'empty' && canReload, 'Weapon capability reports reload is needed.', input, weaponState === 'empty' ? 'reload_capability_missing' : 'weapon_not_empty'),
    candidate('engage', engageScore, visible && canFire, 'Target is visually confirmed and fire capability is available.', input, visible ? 'fire_capability_missing' : 'target_not_visually_confirmed'),
    candidate('search', searchScore + input.belief.confidence * 20, hasSearchMemory, 'Visual contact was lost; search last seen information while confidence remains.', input, hasLastSeen ? 'belief_confidence_too_low' : 'no_last_seen_memory'),
    candidate('investigate', investigateScore + input.belief.confidence * 20, hasInvestigableNoise, 'A non-visual observation provides an approximate location worth investigating.', input, hasLastSeen ? 'last_seen_memory_prefers_search' : 'no_investigable_observation'),
    patrol,
  ];
}

function candidate(id: string, score: number, eligible: boolean, reason: string, input: DecisionInput, rejectedReason?: string): DecisionCandidate {
  const intent: Intent = { id, behavior: { id: `host.behavior.${id}` }, ...(input.belief.targetId === null ? {} : { targetId: input.belief.targetId }), ...(input.belief.estimatedPosition === null ? {} : { targetPosition: input.belief.estimatedPosition }), reason };
  return { id: `candidate:${id}`, intent, score: Number(score.toFixed(6)), eligible, reason, ...(!eligible && rejectedReason !== undefined ? { rejectedReason } : {}) };
}

const actionPlanner: ActionPlanner = (input) => {
  switch (input.selectedIntent.id) {
    case 'patrol': { const target = asVector3(input.context.values.patrolTarget); return target === null ? [{ kind: 'idle', intentId: 'patrol' }] : [{ kind: 'move_to', targetPosition: target, intentId: 'patrol' }]; }
    case 'investigate':
    case 'search': return input.selectedIntent.targetPosition === undefined ? [{ kind: 'idle', intentId: input.selectedIntent.id }] : [{ kind: 'move_to', targetPosition: input.selectedIntent.targetPosition, intentId: input.selectedIntent.id }];
    case 'engage': {
      const engagementPosition = asVector3(input.context.values.engagementPosition); const actions: Omit<import('@volition/core').ActionIntent, 'id'>[] = [];
      if (engagementPosition !== null) actions.push({ kind: 'move_to', targetPosition: engagementPosition, intentId: 'engage' });
      if (input.selectedIntent.targetId !== undefined) { actions.push({ kind: 'aim_at', targetId: input.selectedIntent.targetId, intentId: 'engage' }); actions.push({ kind: 'fire', targetId: input.selectedIntent.targetId, intentId: 'engage' }); }
      return actions.length === 0 ? [{ kind: 'idle', intentId: 'engage' }] : actions;
    }
    case 'reload': return [{ kind: 'reload', intentId: 'reload' }];
    default: return [{ kind: 'idle', intentId: input.selectedIntent.id }];
  }
};

function numberConfig(value: PortableValue | undefined, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function asVector3(value: PortableValue | undefined): Vector3 | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Partial<Vector3>;
  return typeof candidate.x === 'number' && typeof candidate.y === 'number' && typeof candidate.z === 'number' ? { x: candidate.x, y: candidate.y, z: candidate.z } : null;
}
