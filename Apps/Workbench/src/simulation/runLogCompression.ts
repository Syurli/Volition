import type { RunLogEntry, RunLogValue } from './tacticalWizardReferenceModel';

export interface RunLogCompressionStats {
  readonly sourceEntries: number;
  readonly exportedEntries: number;
  readonly reductionRatio: number;
  readonly motionSamplesCollapsed: number;
  readonly repeatedStateEntriesCollapsed: number;
  readonly duplicatePlansCollapsed: number;
}

export interface CompressedRunLog {
  readonly entries: readonly RunLogEntry[];
  readonly stats: RunLogCompressionStats;
}

interface MutableEntry {
  sequence: number;
  logicalTick: number;
  timeSeconds: number;
  category: RunLogEntry['category'];
  actorId: string;
  actorLabel: string;
  event: RunLogEntry['event'];
  summary: string;
  data: Record<string, RunLogValue>;
}

/** Export-time compression only. Runtime keeps the full diagnostic buffer. */
export function compressRunLog(source: readonly RunLogEntry[]): CompressedRunLog {
  const output: MutableEntry[] = [];
  let motionSamplesCollapsed = 0;
  let repeatedStateEntriesCollapsed = 0;
  let duplicatePlansCollapsed = 0;
  for (let index = 0; index < source.length;) {
    const entry = source[index]!;
    if (entry.event === 'move' || entry.event === 'player_move') {
      const group: RunLogEntry[] = [entry]; let cursor = index + 1;
      while (cursor < source.length) { const next = source[cursor]!; if (next.event !== entry.event || next.actorId !== entry.actorId || next.logicalTick !== entry.logicalTick) break; group.push(next); cursor += 1; }
      output.push(collapseMotion(group)); motionSamplesCollapsed += group.length - 1; index = cursor; continue;
    }
    if (entry.event === 'decision' || entry.event === 'search') {
      const signature = stateSignature(entry); const previousIndex = findLastOutputIndex(output, (candidate) => candidate.actorId === entry.actorId && candidate.event === entry.event); const previous = previousIndex < 0 ? null : output[previousIndex]!;
      if (previous !== null && String(previous.data.compressionSignature ?? '') === signature && entry.logicalTick - Number(previous.data.spanStartTick ?? previous.logicalTick) <= 12) { previous.data.repeatCount = Number(previous.data.repeatCount ?? 1) + 1; previous.data.spanEndTick = entry.logicalTick; previous.timeSeconds = entry.timeSeconds; repeatedStateEntriesCollapsed += 1; index += 1; continue; }
      const kept = copyEntry(entry); kept.data.compressionSignature = signature; kept.data.spanStartTick = entry.logicalTick; kept.data.spanEndTick = entry.logicalTick; kept.data.repeatCount = 1; output.push(kept); index += 1; continue;
    }
    if (entry.event === 'plan') {
      const signature = planSignature(entry); const previous = output.at(-1);
      if (previous !== undefined && previous.event === 'plan' && previous.actorId === entry.actorId && String(previous.data.compressionSignature ?? '') === signature && entry.logicalTick - previous.logicalTick <= 4) { previous.data.repeatCount = Number(previous.data.repeatCount ?? 1) + 1; previous.data.spanEndTick = entry.logicalTick; previous.timeSeconds = entry.timeSeconds; duplicatePlansCollapsed += 1; index += 1; continue; }
      const kept = copyEntry(entry); kept.data.compressionSignature = signature; kept.data.spanEndTick = entry.logicalTick; kept.data.repeatCount = 1; output.push(kept); index += 1; continue;
    }
    output.push(copyEntry(entry)); index += 1;
  }
  for (const entry of output) delete entry.data.compressionSignature;
  return { entries: output, stats: { sourceEntries: source.length, exportedEntries: output.length, reductionRatio: source.length === 0 ? 0 : Number((1 - output.length / source.length).toFixed(4)), motionSamplesCollapsed, repeatedStateEntriesCollapsed, duplicatePlansCollapsed } };
}

function collapseMotion(group: readonly RunLogEntry[]): MutableEntry { const first = group[0]!; const last = group[group.length - 1]!; const from = asPoint(first.data.from); const to = asPoint(last.data.to); return { ...copyEntry(last), sequence: first.sequence, logicalTick: first.logicalTick, timeSeconds: last.timeSeconds, summary: group.length === 1 ? last.summary : `${last.actorLabel} movement keyframe (${group.length} raw samples).`, data: { ...last.data, ...(from === null ? {} : { from }), ...(to === null ? {} : { to }), rawSamples: group.length, pathDistance: from === null || to === null ? 0 : Number(Math.hypot(to.x - from.x, to.y - from.y).toFixed(3)) } }; }
function stateSignature(entry: RunLogEntry): string { const keys = entry.event === 'decision' ? ['intent', 'role', 'task', 'tactic', 'beliefSource', 'targetVisible', 'reaction', 'recoveryTask', 'logisticsTask', 'buddyRole'] : ['task', 'buddyRole', 'buddyReady', 'progress', 'tactic', 'logisticsTask']; return `${entry.summary}|${keys.map((key) => `${key}:${stableValue(entry.data[key])}`).join('|')}`; }
function planSignature(entry: RunLogEntry): string { const keys = ['agentId', 'supplyId', 'task', 'commitment', 'reason', 'from', 'to', 'patientId', 'buddyId', 'securityId', 'grenadeKind', 'targetClass', 'safety']; return `${entry.summary}|${keys.map((key) => `${key}:${stableValue(entry.data[key])}`).join('|')}`; }
function stableValue(value: RunLogValue | undefined): string { if (value === undefined) return '-'; if (typeof value === 'object' && value !== null && 'x' in value && 'y' in value) { const point = value as { readonly x: number; readonly y: number }; return `${Number(point.x.toFixed(2))},${Number(point.y.toFixed(2))}`; } if (Array.isArray(value)) return value.join(','); return String(value); }
function findLastOutputIndex(entries: readonly MutableEntry[], predicate: (entry: MutableEntry) => boolean): number { for (let index = entries.length - 1; index >= 0; index -= 1) if (predicate(entries[index]!)) return index; return -1; }
function copyEntry(entry: RunLogEntry): MutableEntry { return { sequence: entry.sequence, logicalTick: entry.logicalTick, timeSeconds: entry.timeSeconds, category: entry.category, actorId: entry.actorId, actorLabel: entry.actorLabel, event: entry.event, summary: entry.summary, data: { ...entry.data } }; }
function asPoint(value: RunLogValue | undefined): { readonly x: number; readonly y: number } | null { if (typeof value !== 'object' || value === null || !('x' in value) || !('y' in value)) return null; const point = value as { readonly x: unknown; readonly y: unknown }; return typeof point.x === 'number' && typeof point.y === 'number' ? { x: point.x, y: point.y } : null; }
