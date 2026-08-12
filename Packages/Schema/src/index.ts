import type { PortableValue, Vector3 } from '@volition/core';

/**
 * Schema 0.1 remains explicitly experimental. The source format is allowed to grow while the first
 * vertical slices validate the semantics; stable binary/source compatibility is not promised yet.
 */
export const VOLITION_CONFIG_VERSION = '0.1.0' as const;

export interface MemoryConfig {
  readonly decayPerSecond: number;
  readonly forgetBelowConfidence: number;
}

export interface DecisionPolicyReference {
  readonly id: string;
  readonly config?: Readonly<Record<string, PortableValue>>;
}

export type ReasonerKind = 'utility' | 'statechart' | 'htn' | 'behavior-tree' | 'goap' | 'custom';

export interface ReasonerDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly kind: ReasonerKind;
  readonly config?: Readonly<Record<string, PortableValue>>;
}

export interface SupervisorModeDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly reasonerIds: readonly string[];
  readonly terminal?: boolean;
}

export interface BrainSupervisorDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly initialMode: string;
  readonly modes: readonly SupervisorModeDefinition[];
  readonly extensions?: Readonly<Record<string, PortableValue>>;
}

export type BehaviorScope = 'agent' | 'squad';

/**
 * Portable behavior authoring contract. This does not encode an engine implementation and is not a
 * universal Reasoner Graph node; Bridges resolve hostBehaviorRef at execution time.
 */
export interface BehaviorDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly scope: BehaviorScope;
  readonly intentId?: string;
  readonly hostBehaviorRef: string;
  readonly description?: string;
  readonly requiredCapabilities: readonly string[];
  readonly parameters?: Readonly<Record<string, PortableValue>>;
}

export interface AgentDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly decisionPolicy: DecisionPolicyReference;
  readonly memory: MemoryConfig;
  readonly contextTypes: readonly string[];
  readonly stimulusTypes: readonly string[];
  readonly capabilities: readonly string[];
  /** Intent id -> host-neutral behavior reference used by Runtime. */
  readonly behaviors: Readonly<Record<string, string>>;
  /** Typed authoring references used by Workbench. */
  readonly behaviorIds?: readonly string[];
  readonly supervisorId?: string;
  readonly reasonerIds?: readonly string[];
  readonly patrolPoints?: readonly Vector3[];
  readonly extensions?: Readonly<Record<string, PortableValue>>;
}

export interface SquadMemberDefinition {
  readonly id: string;
  readonly agentId: string;
  readonly displayName?: string;
  readonly preferredRole?: string;
}

export interface SquadDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly members: readonly SquadMemberDefinition[];
  readonly behaviorIds: readonly string[];
  readonly extensions?: Readonly<Record<string, PortableValue>>;
}

export interface VolitionProjectConfig {
  readonly version: typeof VOLITION_CONFIG_VERSION;
  readonly projectId: string;
  readonly displayName: string;
  readonly agents: readonly AgentDefinition[];
  readonly behaviors?: readonly BehaviorDefinition[];
  readonly squads?: readonly SquadDefinition[];
  readonly reasoners?: readonly ReasonerDefinition[];
  readonly supervisors?: readonly BrainSupervisorDefinition[];
  readonly extensions?: Readonly<Record<string, PortableValue>>;
}

export interface ValidationIssue {
  readonly severity: 'error' | 'warning';
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

const PROJECT_KEYS = new Set(['version', 'projectId', 'displayName', 'agents', 'behaviors', 'squads', 'reasoners', 'supervisors', 'extensions']);
const AGENT_KEYS = new Set(['id', 'displayName', 'decisionPolicy', 'memory', 'contextTypes', 'stimulusTypes', 'capabilities', 'behaviors', 'behaviorIds', 'supervisorId', 'reasonerIds', 'patrolPoints', 'extensions']);
const BEHAVIOR_KEYS = new Set(['id', 'displayName', 'scope', 'intentId', 'hostBehaviorRef', 'description', 'requiredCapabilities', 'parameters']);
const SQUAD_KEYS = new Set(['id', 'displayName', 'members', 'behaviorIds', 'extensions']);
const REASONER_KEYS = new Set(['id', 'displayName', 'kind', 'config']);
const SUPERVISOR_KEYS = new Set(['id', 'displayName', 'initialMode', 'modes', 'extensions']);
const REASONER_KINDS = new Set<ReasonerKind>(['utility', 'statechart', 'htn', 'behavior-tree', 'goap', 'custom']);

export function validateProjectConfig(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) return invalidRoot('Project config must be an object.');
  for (const key of Object.keys(input)) if (!PROJECT_KEYS.has(key)) issues.push({ severity: 'warning', path: key, message: 'Unknown project field is ignored by Schema 0.1.' });
  if (input.version !== VOLITION_CONFIG_VERSION) issues.push({ severity: 'error', path: 'version', message: `Unsupported config version: ${String(input.version)}.` });
  requireString(input, 'projectId', issues); requireString(input, 'displayName', issues);

  const behaviorIds = validateBehaviors(input.behaviors, issues);
  const reasonerIds = validateReasoners(input.reasoners, issues);
  const supervisorIds = validateSupervisors(input.supervisors, reasonerIds, issues);
  const agentIds = new Set<string>();
  if (!Array.isArray(input.agents) || input.agents.length === 0) issues.push({ severity: 'error', path: 'agents', message: 'At least one agent definition is required.' });
  else input.agents.forEach((agent, index) => validateAgent(agent, index, agentIds, behaviorIds, reasonerIds, supervisorIds, issues));
  validateSquads(input.squads, agentIds, behaviorIds, issues);
  return { valid: issues.every((issue) => issue.severity !== 'error'), issues };
}

export function assertValidProjectConfig(input: unknown): asserts input is VolitionProjectConfig {
  const result = validateProjectConfig(input);
  if (!result.valid) throw new Error(result.issues.filter((issue) => issue.severity === 'error').map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
}

function validateBehaviors(input: unknown, issues: ValidationIssue[]): Set<string> {
  const ids = new Set<string>(); if (input === undefined) return ids;
  if (!Array.isArray(input)) { issues.push({ severity: 'error', path: 'behaviors', message: 'Behaviors must be an array.' }); return ids; }
  input.forEach((entry, index) => {
    const root = `behaviors[${index}]`; if (!isRecord(entry)) { issues.push({ severity: 'error', path: root, message: 'Behavior must be an object.' }); return; }
    warnUnknown(entry, BEHAVIOR_KEYS, root, issues); requireString(entry, 'id', issues, root); requireString(entry, 'displayName', issues, root); requireString(entry, 'hostBehaviorRef', issues, root);
    if (entry.scope !== 'agent' && entry.scope !== 'squad') issues.push({ severity: 'error', path: `${root}.scope`, message: 'Behavior scope must be agent or squad.' });
    requireStringArray(entry.requiredCapabilities, `${root}.requiredCapabilities`, issues);
    if (entry.intentId !== undefined && (typeof entry.intentId !== 'string' || entry.intentId === '')) issues.push({ severity: 'error', path: `${root}.intentId`, message: 'intentId must be a non-empty string when provided.' });
    if (typeof entry.id === 'string') addUnique(ids, entry.id, `${root}.id`, 'behavior', issues);
  });
  return ids;
}

function validateReasoners(input: unknown, issues: ValidationIssue[]): Set<string> {
  const ids = new Set<string>(); if (input === undefined) return ids;
  if (!Array.isArray(input)) { issues.push({ severity: 'error', path: 'reasoners', message: 'Reasoners must be an array.' }); return ids; }
  input.forEach((entry, index) => {
    const root = `reasoners[${index}]`; if (!isRecord(entry)) { issues.push({ severity: 'error', path: root, message: 'Reasoner must be an object.' }); return; }
    warnUnknown(entry, REASONER_KEYS, root, issues); requireString(entry, 'id', issues, root); requireString(entry, 'displayName', issues, root);
    if (typeof entry.kind !== 'string' || !REASONER_KINDS.has(entry.kind as ReasonerKind)) issues.push({ severity: 'error', path: `${root}.kind`, message: 'Unsupported reasoner kind.' });
    if (typeof entry.id === 'string') addUnique(ids, entry.id, `${root}.id`, 'reasoner', issues);
  });
  return ids;
}

function validateSupervisors(input: unknown, reasonerIds: ReadonlySet<string>, issues: ValidationIssue[]): Set<string> {
  const ids = new Set<string>(); if (input === undefined) return ids;
  if (!Array.isArray(input)) { issues.push({ severity: 'error', path: 'supervisors', message: 'Supervisors must be an array.' }); return ids; }
  input.forEach((entry, index) => {
    const root = `supervisors[${index}]`; if (!isRecord(entry)) { issues.push({ severity: 'error', path: root, message: 'Supervisor must be an object.' }); return; }
    warnUnknown(entry, SUPERVISOR_KEYS, root, issues); requireString(entry, 'id', issues, root); requireString(entry, 'displayName', issues, root); requireString(entry, 'initialMode', issues, root);
    if (!Array.isArray(entry.modes) || entry.modes.length === 0) issues.push({ severity: 'error', path: `${root}.modes`, message: 'Supervisor requires at least one mode.' });
    else {
      const modeIds = new Set<string>();
      entry.modes.forEach((mode, modeIndex) => {
        const modeRoot = `${root}.modes[${modeIndex}]`; if (!isRecord(mode)) { issues.push({ severity: 'error', path: modeRoot, message: 'Supervisor mode must be an object.' }); return; }
        requireString(mode, 'id', issues, modeRoot); requireString(mode, 'displayName', issues, modeRoot); requireStringArray(mode.reasonerIds, `${modeRoot}.reasonerIds`, issues);
        if (typeof mode.id === 'string') addUnique(modeIds, mode.id, `${modeRoot}.id`, 'supervisor mode', issues);
        if (Array.isArray(mode.reasonerIds)) for (const reasonerId of mode.reasonerIds) if (typeof reasonerId === 'string' && reasonerIds.size > 0 && !reasonerIds.has(reasonerId)) issues.push({ severity: 'error', path: `${modeRoot}.reasonerIds`, message: `Unknown reasoner reference: ${reasonerId}.` });
      });
      if (typeof entry.initialMode === 'string' && !modeIds.has(entry.initialMode)) issues.push({ severity: 'error', path: `${root}.initialMode`, message: `Unknown initial mode: ${entry.initialMode}.` });
    }
    if (typeof entry.id === 'string') addUnique(ids, entry.id, `${root}.id`, 'supervisor', issues);
  });
  return ids;
}

function validateAgent(input: unknown, index: number, seen: Set<string>, behaviorIds: ReadonlySet<string>, reasonerIds: ReadonlySet<string>, supervisorIds: ReadonlySet<string>, issues: ValidationIssue[]): void {
  const root = `agents[${index}]`; if (!isRecord(input)) { issues.push({ severity: 'error', path: root, message: 'Agent must be an object.' }); return; }
  warnUnknown(input, AGENT_KEYS, root, issues); requireString(input, 'id', issues, root); if (typeof input.id === 'string') addUnique(seen, input.id, `${root}.id`, 'agent', issues); requireString(input, 'displayName', issues, root);
  if (!isRecord(input.decisionPolicy) || typeof input.decisionPolicy.id !== 'string') issues.push({ severity: 'error', path: `${root}.decisionPolicy.id`, message: 'Decision policy id is required.' });
  if (!isRecord(input.memory) || !isFiniteNumber(input.memory.decayPerSecond) || !isFiniteNumber(input.memory.forgetBelowConfidence)) issues.push({ severity: 'error', path: `${root}.memory`, message: 'Memory decayPerSecond and forgetBelowConfidence must be finite numbers.' });
  requireStringArray(input.contextTypes, `${root}.contextTypes`, issues); requireStringArray(input.stimulusTypes, `${root}.stimulusTypes`, issues); requireStringArray(input.capabilities, `${root}.capabilities`, issues);
  if (!isRecord(input.behaviors) || Object.values(input.behaviors).some((value) => typeof value !== 'string')) issues.push({ severity: 'error', path: `${root}.behaviors`, message: 'Behaviors must map intent ids to host-neutral behavior references.' });
  validateReferences(input.behaviorIds, behaviorIds, `${root}.behaviorIds`, 'behavior', issues); validateReferences(input.reasonerIds, reasonerIds, `${root}.reasonerIds`, 'reasoner', issues);
  if (input.supervisorId !== undefined && (typeof input.supervisorId !== 'string' || (supervisorIds.size > 0 && !supervisorIds.has(input.supervisorId)))) issues.push({ severity: 'error', path: `${root}.supervisorId`, message: `Unknown supervisor reference: ${String(input.supervisorId)}.` });
  if (input.patrolPoints !== undefined && (!Array.isArray(input.patrolPoints) || input.patrolPoints.some((value) => !isVector3(value)))) issues.push({ severity: 'error', path: `${root}.patrolPoints`, message: 'Patrol points must be engine-neutral Vector3 values.' });
}

function validateSquads(input: unknown, agentIds: ReadonlySet<string>, behaviorIds: ReadonlySet<string>, issues: ValidationIssue[]): void {
  if (input === undefined) return; if (!Array.isArray(input)) { issues.push({ severity: 'error', path: 'squads', message: 'Squads must be an array.' }); return; }
  const ids = new Set<string>();
  input.forEach((entry, index) => {
    const root = `squads[${index}]`; if (!isRecord(entry)) { issues.push({ severity: 'error', path: root, message: 'Squad must be an object.' }); return; }
    warnUnknown(entry, SQUAD_KEYS, root, issues); requireString(entry, 'id', issues, root); requireString(entry, 'displayName', issues, root); if (typeof entry.id === 'string') addUnique(ids, entry.id, `${root}.id`, 'squad', issues); validateReferences(entry.behaviorIds, behaviorIds, `${root}.behaviorIds`, 'behavior', issues);
    if (!Array.isArray(entry.members) || entry.members.length === 0) issues.push({ severity: 'error', path: `${root}.members`, message: 'Squad requires at least one member.' });
    else {
      const memberIds = new Set<string>();
      entry.members.forEach((member, memberIndex) => {
        const memberRoot = `${root}.members[${memberIndex}]`; if (!isRecord(member)) { issues.push({ severity: 'error', path: memberRoot, message: 'Squad member must be an object.' }); return; }
        requireString(member, 'id', issues, memberRoot); requireString(member, 'agentId', issues, memberRoot); if (typeof member.id === 'string') addUnique(memberIds, member.id, `${memberRoot}.id`, 'squad member', issues);
        if (typeof member.agentId === 'string' && !agentIds.has(member.agentId)) issues.push({ severity: 'error', path: `${memberRoot}.agentId`, message: `Unknown agent reference: ${member.agentId}.` });
      });
    }
  });
}

function validateReferences(value: unknown, known: ReadonlySet<string>, path: string, kind: string, issues: ValidationIssue[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) { issues.push({ severity: 'error', path, message: `Expected an array of ${kind} ids.` }); return; }
  if (known.size === 0 && value.length > 0) { issues.push({ severity: 'error', path, message: `No ${kind} assets are declared.` }); return; }
  for (const id of value) if (!known.has(id)) issues.push({ severity: 'error', path, message: `Unknown ${kind} reference: ${id}.` });
}

function addUnique(set: Set<string>, id: string, path: string, kind: string, issues: ValidationIssue[]): void { if (set.has(id)) issues.push({ severity: 'error', path, message: `Duplicate ${kind} id: ${id}.` }); set.add(id); }
function warnUnknown(record: Record<string, unknown>, allowed: ReadonlySet<string>, root: string, issues: ValidationIssue[]): void { for (const key of Object.keys(record)) if (!allowed.has(key)) issues.push({ severity: 'warning', path: `${root}.${key}`, message: `Unknown ${root.split('[')[0]} field is ignored by Schema 0.1.` }); }
function requireString(record: Record<string, unknown>, key: string, issues: ValidationIssue[], prefix = ''): void { if (typeof record[key] !== 'string' || record[key] === '') issues.push({ severity: 'error', path: prefix === '' ? key : `${prefix}.${key}`, message: `${key} must be a non-empty string.` }); }
function requireStringArray(value: unknown, path: string, issues: ValidationIssue[]): void { if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) issues.push({ severity: 'error', path, message: 'Expected an array of strings.' }); }
function invalidRoot(message: string): ValidationResult { return { valid: false, issues: [{ severity: 'error', path: '$', message }] }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function isVector3(value: unknown): value is Vector3 { return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.z); }
