import type { PortableValue, Vector3 } from '@volition/core';

export const VOLITION_CONFIG_VERSION = '0.1.0' as const;

export interface MemoryConfig {
  readonly decayPerSecond: number;
  readonly forgetBelowConfidence: number;
}

export interface DecisionPolicyReference {
  readonly id: string;
  readonly config?: Readonly<Record<string, PortableValue>>;
}

export interface AgentDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly decisionPolicy: DecisionPolicyReference;
  readonly memory: MemoryConfig;
  readonly contextTypes: readonly string[];
  readonly stimulusTypes: readonly string[];
  readonly capabilities: readonly string[];
  readonly behaviors: Readonly<Record<string, string>>;
  readonly patrolPoints?: readonly Vector3[];
  readonly extensions?: Readonly<Record<string, PortableValue>>;
}

export interface VolitionProjectConfig {
  readonly version: typeof VOLITION_CONFIG_VERSION;
  readonly projectId: string;
  readonly displayName: string;
  readonly agents: readonly AgentDefinition[];
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

const PROJECT_KEYS = new Set(['version', 'projectId', 'displayName', 'agents', 'extensions']);
const AGENT_KEYS = new Set([
  'id', 'displayName', 'decisionPolicy', 'memory', 'contextTypes', 'stimulusTypes',
  'capabilities', 'behaviors', 'patrolPoints', 'extensions',
]);

/**
 * Reference Slice 01 validator. Unsupported version is an error; unknown fields are warnings so a newer
 * producer can still be inspected without silently treating unknown semantics as authoritative.
 */
export function validateProjectConfig(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) return invalidRoot('Project config must be an object.');

  for (const key of Object.keys(input)) {
    if (!PROJECT_KEYS.has(key)) issues.push({ severity: 'warning', path: key, message: 'Unknown project field is ignored by Schema 0.1.' });
  }
  if (input.version !== VOLITION_CONFIG_VERSION) {
    issues.push({ severity: 'error', path: 'version', message: `Unsupported config version: ${String(input.version)}.` });
  }
  requireString(input, 'projectId', issues);
  requireString(input, 'displayName', issues);
  if (!Array.isArray(input.agents) || input.agents.length === 0) {
    issues.push({ severity: 'error', path: 'agents', message: 'At least one agent definition is required.' });
  } else {
    const seen = new Set<string>();
    input.agents.forEach((agent, index) => validateAgent(agent, index, seen, issues));
  }
  return { valid: issues.every((issue) => issue.severity !== 'error'), issues };
}

export function assertValidProjectConfig(input: unknown): asserts input is VolitionProjectConfig {
  const result = validateProjectConfig(input);
  if (!result.valid) {
    throw new Error(result.issues.filter((issue) => issue.severity === 'error').map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  }
}

function validateAgent(input: unknown, index: number, seen: Set<string>, issues: ValidationIssue[]): void {
  const root = `agents[${index}]`;
  if (!isRecord(input)) {
    issues.push({ severity: 'error', path: root, message: 'Agent must be an object.' });
    return;
  }
  for (const key of Object.keys(input)) {
    if (!AGENT_KEYS.has(key)) issues.push({ severity: 'warning', path: `${root}.${key}`, message: 'Unknown agent field is ignored by Schema 0.1.' });
  }
  requireString(input, 'id', issues, root);
  if (typeof input.id === 'string') {
    if (seen.has(input.id)) issues.push({ severity: 'error', path: `${root}.id`, message: `Duplicate agent id: ${input.id}.` });
    seen.add(input.id);
  }
  requireString(input, 'displayName', issues, root);
  if (!isRecord(input.decisionPolicy) || typeof input.decisionPolicy.id !== 'string') {
    issues.push({ severity: 'error', path: `${root}.decisionPolicy.id`, message: 'Decision policy id is required.' });
  }
  if (!isRecord(input.memory) || !isFiniteNumber(input.memory.decayPerSecond) || !isFiniteNumber(input.memory.forgetBelowConfidence)) {
    issues.push({ severity: 'error', path: `${root}.memory`, message: 'Memory decayPerSecond and forgetBelowConfidence must be finite numbers.' });
  }
  requireStringArray(input.contextTypes, `${root}.contextTypes`, issues);
  requireStringArray(input.stimulusTypes, `${root}.stimulusTypes`, issues);
  requireStringArray(input.capabilities, `${root}.capabilities`, issues);
  if (!isRecord(input.behaviors) || Object.values(input.behaviors).some((value) => typeof value !== 'string')) {
    issues.push({ severity: 'error', path: `${root}.behaviors`, message: 'Behaviors must map intent ids to host-neutral behavior references.' });
  }
  if (input.patrolPoints !== undefined && (!Array.isArray(input.patrolPoints) || input.patrolPoints.some((value) => !isVector3(value)))) {
    issues.push({ severity: 'error', path: `${root}.patrolPoints`, message: 'Patrol points must be engine-neutral Vector3 values.' });
  }
}

function requireString(record: Record<string, unknown>, key: string, issues: ValidationIssue[], prefix = ''): void {
  if (typeof record[key] !== 'string' || record[key] === '') issues.push({ severity: 'error', path: prefix === '' ? key : `${prefix}.${key}`, message: `${key} must be a non-empty string.` });
}

function requireStringArray(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) issues.push({ severity: 'error', path, message: 'Expected an array of strings.' });
}

function invalidRoot(message: string): ValidationResult {
  return { valid: false, issues: [{ severity: 'error', path: '$', message }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isVector3(value: unknown): value is Vector3 {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.z);
}
