import type { GridPoint } from './navigation';

export type AttentionMode = 'track_visual' | 'scan_search' | 'scan_acoustic' | 'recovery_security' | 'tactical';

export interface AttentionSample {
  readonly mode: AttentionMode;
  readonly anchor: GridPoint | null;
  readonly scanPhase: number;
  readonly facing: GridPoint;
  readonly lookTarget: GridPoint | null;
}

export const ATTENTION_SCAN_FRAME_STRIDE = 7;
export const ATTENTION_SCAN_OFFSETS = [-42, -18, 0, 28, 48, 0] as const;
export const ATTENTION_LOOK_DISTANCE = 6;

export function scanAttention(
  position: GridPoint,
  anchor: GridPoint,
  motionFrame: number,
  agentIndex: number,
): Pick<AttentionSample, 'scanPhase' | 'facing' | 'lookTarget'> {
  const phase = (Math.floor(motionFrame / ATTENTION_SCAN_FRAME_STRIDE) + Math.max(0, agentIndex) * 2) % ATTENTION_SCAN_OFFSETS.length;
  const base = normalizedDelta(position, anchor);
  const facing = rotate(base, ATTENTION_SCAN_OFFSETS[phase] ?? 0);
  return {
    scanPhase: phase,
    facing,
    lookTarget: {
      x: position.x + facing.x * ATTENTION_LOOK_DISTANCE,
      y: position.y + facing.y * ATTENTION_LOOK_DISTANCE,
    },
  };
}

export function attentionLookTarget(position: GridPoint, facing: GridPoint): GridPoint {
  const direction = normalize(facing);
  return {
    x: position.x + direction.x * ATTENTION_LOOK_DISTANCE,
    y: position.y + direction.y * ATTENTION_LOOK_DISTANCE,
  };
}

function normalizedDelta(from: GridPoint, to: GridPoint): GridPoint {
  return normalize({ x: to.x - from.x, y: to.y - from.y });
}

function normalize(point: GridPoint): GridPoint {
  const length = Math.hypot(point.x, point.y);
  return length <= 1e-6 ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
}

function rotate(point: GridPoint, degrees: number): GridPoint {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return normalize({ x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos });
}
