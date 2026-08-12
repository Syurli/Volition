# ADR-0003 — Tactical Variety, Spatial Maneuvers, and Run Logging

Status: Accepted for the Tactical Wizard reference application.

## Problem

A squad can change high-level tactic labels without producing meaningfully different play if every tactic resolves to the same spatial pattern: approach the Last Known Position, face it, and fire when line of sight exists. This creates a visually repetitive loop even when the doctrine state machine is technically progressing.

## Decision

Volition distinguishes **doctrine variety** from **spatial execution variety**.

- Portable doctrine decides why the squad changes mode from portable facts.
- The Host resolves each tactic with a different spatial query and execution envelope.
- Tactical Wizard reference tactics are: Bounding Overwatch, Flank, Establish Crossfire, Coordinated Assault, Sector Sweep, and Regroup / Rotate.
- Crossfire must create separated firing sectors rather than two near-identical approach points.
- Assault is a short close-range exploitation window, not the default combat orbit.
- Sector Sweep is entered after sustained loss of visual contact; it uses only the shared Last Known Position and must not read hidden live player coordinates.
- Regroup deliberately increases spacing before another maneuver cycle and flips flank preference between cycles.

This Host-owned geometry is a reference implementation only. Unreal, Unity, Godot, and other Bridges may replace grid queries with native NavMesh/EQS/cover systems while keeping the doctrine facts and tactical intent portable.

## Debug identity

Agent proxy color is stable identity metadata. Tactical roles must not recolor Alpha / Bravo / Charlie because role rotation otherwise makes visual debugging ambiguous. Role and tactic are represented as labels and telemetry.

## Run Log

Workbench maintains a structured session log with player actions, squad-level tactical events, and soldier-agent perception/decision/action events. The log is exportable as `volition.run-log.v1` JSON so a captured session can be reproduced and reviewed without screenshots alone.

Run logging is observational. It must not alter the decision stream or expose hidden target state that the runtime did not legitimately observe.

## Authoring UX

Workbench groups authoring assets by responsibility:

1. Agents & Squads
2. Behavior Modules (Agent Behaviors and Squad Tactics)
3. Cognition & Decision (Brain Supervisors and typed Reasoners)

Drag-and-drop is a convenience for editing typed references, not a replacement for the typed asset model. Legal targets provide explicit hover/drop feedback; invalid scope combinations do not become valid merely through UI dragging.

Chinese UI localizes user-facing asset names while stable IDs remain unchanged and portable.
