import type { AgentRuntimeSnapshot, DecisionTrace } from '@volition/core';
import type { ValidationResult } from '@volition/schema';

export const VOLITION_PROTOCOL_VERSION = '0.1.0' as const;

export type ProtocolMessageType =
  | 'handshake'
  | 'capabilities'
  | 'agent_inventory'
  | 'agent_runtime_snapshot'
  | 'trace_batch'
  | 'validation_result';

export interface ProtocolEnvelope<TType extends ProtocolMessageType = ProtocolMessageType, TPayload = unknown> {
  readonly protocolVersion: typeof VOLITION_PROTOCOL_VERSION;
  readonly sequence: number;
  readonly type: TType;
  readonly payload: TPayload;
}

export interface HandshakePayload {
  readonly projectId: string;
  readonly instanceId: string;
  readonly bridgeId: string;
  readonly telemetryEnabled: boolean;
}

export interface CapabilitiesPayload {
  readonly capabilities: readonly string[];
  readonly transports: readonly string[];
}

export interface AgentInventoryPayload {
  readonly agentIds: readonly string[];
}

export interface AgentRuntimeSnapshotPayload {
  readonly snapshot: AgentRuntimeSnapshot;
}

export interface TraceBatchPayload {
  readonly agentId: string;
  readonly fromTick: number;
  readonly toTick: number;
  readonly events: readonly DecisionTrace[];
}

export interface ValidationResultPayload {
  readonly result: ValidationResult;
}

export type KnownEnvelope =
  | ProtocolEnvelope<'handshake', HandshakePayload>
  | ProtocolEnvelope<'capabilities', CapabilitiesPayload>
  | ProtocolEnvelope<'agent_inventory', AgentInventoryPayload>
  | ProtocolEnvelope<'agent_runtime_snapshot', AgentRuntimeSnapshotPayload>
  | ProtocolEnvelope<'trace_batch', TraceBatchPayload>
  | ProtocolEnvelope<'validation_result', ValidationResultPayload>;

export function envelope<TType extends ProtocolMessageType, TPayload>(
  type: TType,
  payload: TPayload,
  sequence: number,
): ProtocolEnvelope<TType, TPayload> {
  return { protocolVersion: VOLITION_PROTOCOL_VERSION, sequence, type, payload };
}

export function serializeEnvelope(value: KnownEnvelope): string {
  return JSON.stringify(value);
}

export function deserializeEnvelope(serialized: string): KnownEnvelope {
  const value: unknown = JSON.parse(serialized);
  if (!isRecord(value)) throw new Error('Protocol envelope must be an object.');
  if (value.protocolVersion !== VOLITION_PROTOCOL_VERSION) throw new Error(`Unsupported protocol version: ${String(value.protocolVersion)}.`);
  if (typeof value.sequence !== 'number' || !Number.isInteger(value.sequence) || value.sequence < 0) {
    throw new Error('Protocol sequence must be a non-negative integer.');
  }
  if (!isMessageType(value.type)) throw new Error(`Unsupported protocol message type: ${String(value.type)}.`);
  if (!('payload' in value)) throw new Error('Protocol payload is required.');
  return value as unknown as KnownEnvelope;
}

export interface ProtocolTransport {
  readonly id: string;
  send(message: KnownEnvelope): void | Promise<void>;
  close(): void | Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMessageType(value: unknown): value is ProtocolMessageType {
  return value === 'handshake' || value === 'capabilities' || value === 'agent_inventory'
    || value === 'agent_runtime_snapshot' || value === 'trace_batch' || value === 'validation_result';
}
