import { describe, expect, it } from 'vitest';
import { compressRunLog } from '../../Apps/Workbench/src/simulation/runLogCompression';
import type { RunLogEntry } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV3';

describe('Run-log export compression', () => {
  it('collapses sub-frame motion and repeated state polling while preserving causal events', () => {
    const entries: RunLogEntry[] = [
      move(1, 10, 10.0, 0, 0, 0.2, 0),
      move(2, 10, 10.03, 0.2, 0, 0.4, 0),
      move(3, 10, 10.06, 0.4, 0, 0.6, 0),
      decision(4, 10, 'suppress', true),
      decision(5, 11, 'suppress', true),
      decision(6, 12, 'suppress', true),
      {
        sequence: 7,
        logicalTick: 12,
        timeSeconds: 10.5,
        category: 'agent',
        actorId: 'alpha',
        actorLabel: 'Alpha',
        event: 'fire',
        summary: 'Alpha fired.',
        data: { target: { x: 9, y: 4 } },
      },
      decision(8, 13, 'search_sector', false),
      {
        sequence: 9,
        logicalTick: 13,
        timeSeconds: 10.75,
        category: 'squad',
        actorId: 'squad',
        actorLabel: 'Squad',
        event: 'alert',
        summary: 'Incoming-fire evidence raised squad threat awareness.',
        data: { confidence: 0.7 },
      },
    ];

    const compressed = compressRunLog(entries);
    expect(compressed.entries.length).toBeLessThan(entries.length);
    expect(compressed.stats.motionSamplesCollapsed).toBe(2);
    expect(compressed.stats.repeatedStateEntriesCollapsed).toBe(2);
    expect(compressed.entries.some((entry) => entry.event === 'fire' && entry.summary === 'Alpha fired.')).toBe(true);
    expect(compressed.entries.some((entry) => entry.event === 'alert')).toBe(true);

    const motion = compressed.entries.find((entry) => entry.event === 'move')!;
    expect(motion.data.rawSamples).toBe(3);
    expect(motion.data.from).toEqual({ x: 0, y: 0 });
    expect(motion.data.to).toEqual({ x: 0.6, y: 0 });

    const stableDecision = compressed.entries.find((entry) => entry.event === 'decision' && entry.data.task === 'suppress')!;
    expect(stableDecision.data.repeatCount).toBe(3);
    expect(stableDecision.data.spanStartTick).toBe(10);
    expect(stableDecision.data.spanEndTick).toBe(12);
  });
});

function move(sequence: number, tick: number, seconds: number, fromX: number, fromY: number, toX: number, toY: number): RunLogEntry {
  return {
    sequence,
    logicalTick: tick,
    timeSeconds: seconds,
    category: 'agent',
    actorId: 'alpha',
    actorLabel: 'Alpha',
    event: 'move',
    summary: 'Alpha moved.',
    data: { from: { x: fromX, y: fromY }, to: { x: toX, y: toY }, task: 'hold_cover' },
  };
}

function decision(sequence: number, tick: number, task: string, visible: boolean): RunLogEntry {
  return {
    sequence,
    logicalTick: tick,
    timeSeconds: 10 + (tick - 10) * 0.25,
    category: 'agent',
    actorId: 'alpha',
    actorLabel: 'Alpha',
    event: 'decision',
    summary: `Alpha selected engage; tactical task ${task}.`,
    data: { intent: 'engage', role: 'support', task, tactic: 'bounding', beliefSource: visible ? 'visual' : 'memory', targetVisible: visible },
  };
}
