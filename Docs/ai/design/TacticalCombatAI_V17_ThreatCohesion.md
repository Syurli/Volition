# Tactical Combat AI V17 — Threat Awareness, Squad Cohesion & Throwable Safety

## Why V17 exists

V16 made the sandbox easier to read by resolving execution ownership, but play-test T388 still exposed three missing pieces of combat common sense:

1. non-hit fire often failed to create a meaningful threat response;
2. offensive throwables could still target stale or friendly-occupied spaces;
3. a critical wounded member could remain tactically isolated until becoming a downed rescue problem.

T388 also exposed a diagnostic problem: a large share of the exported log could be repetitive movement / unchanged decision polling or repeated logistics assignment churn. V17 therefore improves runtime behavior and export diagnostics together.

## Host boundary

V17 remains a Workbench Simulation Host reference layer.

- Exact hidden player position is not copied into cognition.
- Shot origin may be consumed inside the Host to derive audible / ballistic evidence and a coarse bearing.
- The exported Threat Awareness model stores bearing, coarse sector, evidence type and confidence — not a hidden live shooter coordinate.
- Geometry, projectile proximity, throwable effect areas, buddy spacing and supply lifecycle remain Host concerns.

AI-HOST-2 remains closed. TWR_Dev is not modified.

## 1. Threat Evidence Model

Damage is no longer the only path into an incoming-fire response.

Evidence types:

- `gunshot`
- `bullet_impact`
- `near_miss`
- `hit`

Each piece of evidence contributes confidence. Bearing is quantized before being retained by the V17 view. Repeated miss / impact evidence can cross the Threatened threshold and reuse the existing V11 counter-ambush response (`break_contact → sector_search`) without requiring a hit.

The key distinction is:

> Host ballistic evidence may indicate a direction without granting the Agent an exact hidden target.

## 2. Wounded Mutual Support

Health bands:

- `healthy`
- `wounded`
- `critical`
- `downed`

A critical member, or a wounded member isolated beyond the support distance, creates a mutual-support contract before the member becomes a casualty:

- Patient: stops accepting long aggressive movement and rallies toward a safer local point.
- Buddy: closes the support gap and avoids accepting a movement target that would immediately break support again.
- Security: when a third living member exists, remains available for fire / threat security rather than collapsing all three soldiers onto the patient.

This is prevention, not a replacement for the existing downed rescue contract.

## 3. Throwable Target / Effect Safety

V17 adds a final validation pass after a grenade opportunity commits:

- flash/frag effect clearance checks current friendly positions;
- if a live player is currently confirmed, an offensive grenade aimed somewhere else is rejected;
- stale LKP flash probes are rejected;
- after LKP verification, search flash must target an uncleared Search Frontier;
- rejected throws are rolled back and the grenade is refunded.

Defensive smoke remains allowed near friendlies because screening friendly movement is its purpose.

## 4. Logistics lifecycle

V16 could preempt a V8 assignment correctly, but V8 could immediately ask for the same low-priority assignment again. V17 wraps new logistics planning:

- active recovery, threat response, direct contact, search, or wounded support suspends non-critical new resupply planning;
- critical ammunition can still override suspension;
- after the high-priority condition ends, planning resumes after a bounded delay;
- the lifecycle is exposed as `idle / assigned / suspended` rather than expressed as thousands of create/cancel messages.

## 5. Acting command

When Alpha is downed, the exported/current Workbench command view promotes a living acting commander. Capability is explicitly exposed as:

- `full_squad`
- `reduced_pair`
- `single_survivor`
- `combat_ineffective`

This removes stale UI such as a dead commander apparently issuing a supply order.

## 6. Loss-aware run-log export

Runtime retains its full diagnostic buffer. Only exported JSON is compressed.

Compression rules:

- causal events (`fire`, `alert`, `tactic`, `roles`, `perception`, session/noise) are preserved;
- 30 Hz movement samples collapse into one keyframe per actor per logical tick;
- unchanged decision/search polling collapses into spans with `repeatCount`, `spanStartTick`, and `spanEndTick`;
- short-window byte-equivalent plan repeats collapse into spans;
- exported JSON is compact (no pretty-print whitespace);
- the final simulation snapshot includes V15-V17 contact, authority, threat, cohesion, leadership, and logistics lifecycle state.

The objective is smaller files without losing the causal information needed for later diagnosis.
