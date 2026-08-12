# Tactical Combat AI V6 — Mutual Support, Threat-relative Locomotion, and Tactical Opportunities

Status: implementation baseline for the Tactical Wizard built-in example.

## Intent

V5 made cover, fire lanes, peeking, active search and task ownership visible. V6 keeps that work and moves the simulation from "three competent individuals" toward "one coordinated element".

The implementation is a game-AI abstraction. It borrows broad coordination principles from public game-AI material and high-level movement/security doctrine, but it does not attempt to reproduce real-world CQB room-clearing SOPs.

## Reference principles

### F.E.A.R.

The public GDC material describes enemies as squads that suppress while allies move, form organized search parties, dynamically re-plan alternate approaches, and use grenades to change a player's position. Volition uses those ideas as coordination goals rather than copying a particular planner architecture.

### Halo

Public Halo AI documentation is particularly useful for V6 because it separates spatial semantics and coordinated behaviors:

- firing / cover / concealment / search positions are different kinds of useful space;
- search can include pursuit synchronization and a "cover me while I investigate" relationship;
- grenade use is probabilistic and constrained by timing;
- surprise / stalking behaviors exist as contextual opportunities rather than default combat loops;
- objectives and firing points bound where actors are allowed to solve problems.

V6 therefore treats positions as tactical opportunities with purposes, not merely destinations.

### High-level movement doctrine

The useful abstraction is mutual support: as contact likelihood rises, movement becomes more security-oriented; one element can overwatch another; spacing, terrain and fields of fire constrain whether a move is considered supported. V6 translates this into support contracts and movement safety scores.

## V6 systems

### 1. Threat-relative locomotion

Facing is no longer a side effect of path velocity.

Movement modes:

- `forward` — move generally toward the threat while facing movement.
- `lateral` — strafe while maintaining threat-facing.
- `backpedal` — move away while maintaining threat-facing.
- `covered_dash` — deliberately turn with the movement vector for a short committed displacement.
- `free` — patrol / non-contact locomotion.

A covered dash is exceptional. It is eligible only when all of the following are true:

1. the squad is in active contact;
2. the move belongs to a committed maneuver task (`bound_to_cover`, `flank_to_cover`, or `assault`);
3. the destination is cover or another committed tactical point;
4. at least one other member can provide a safe supporting fire lane;
5. threat distance is not already close;
6. the actor has not exceeded the short back-turn exposure budget.

Even when eligible, a deterministic seeded probability decides whether the actor turns fully with the run. Otherwise it strafes/backpedals and keeps the threat in front.

### 2. Buddy search contract

Lost-contact search is no longer independent sector wandering.

The search element is organized as:

- one `lead` investigator;
- one `cover` buddy;
- one `overwatch` / blocking member.

Only the lead is allowed to advance to a new search point. The cover buddy holds and observes the lead's next point / likely threat sector. After the lead reaches the point and completes a scan, the pair hands off roles. Search therefore becomes move → cover → scan → handoff instead of two unrelated routes progressing simultaneously.

The third member occupies a blocking / overwatch opportunity near the uncertainty region and maintains security while the pair works.

### 3. Tactical opportunity semantics

V6 exposes why a position is being used:

- `base_of_fire`
- `covered_move`
- `flank`
- `crossfire`
- `block_exit`
- `search`
- `ambush`
- `close_pressure`

This is telemetry first. Future map authoring can replace runtime heuristics with designer-authored smart points while preserving the same semantic contract.

### 4. Grenades as space-control actions

The built-in 2D simulation adds abstract grenades. It does not simulate real ballistics.

Grenade actions have:

- a semantic kind (`flash`, `frag`, `smoke`);
- a target point;
- a short visible pulse / influence radius;
- squad cooldown and per-agent inventory;
- friendly proximity exclusion;
- context gates.

Intended game purposes:

- `flash`: create a short assault / search opportunity around a recently lost target;
- `frag`: pressure a stationary target or a target using occlusion;
- `smoke`: support an exposed reposition when safe direct support is weak.

The player is not automatically moved by a grenade in the editor sandbox. The point is to expose the decision and spatial pressure so a Host game can map it to its own grenade implementation.

### 5. Close-pressure / melee opportunity

Melee is a short-range opportunity, not a permanent chase state. One member may claim the close-pressure opportunity when very near the player and visible. Other squad members continue to obey friendly-fire checks instead of all collapsing onto the same point.

### 6. Surprise / ambush opportunity

V6 does not model a complete player perception cone, so it does not claim to know that the player literally cannot see an actor. Instead the simulation uses concealment relative to the last-known area as a game approximation. A blocking member can hold a concealed side position; if contact reappears from that sector, telemetry marks the action as a surprise opportunity.

## Debug / visualization requirements

The Tactical Observer should emphasize coordination rather than add more opaque overlays:

- locomotion mode shown in the agent sidebar;
- buddy role and whether the buddy contract is ready;
- blocking / search / base-of-fire purpose;
- grenade target shown as a small semantic pulse, not a large permanent circle;
- melee shown as a brief close-range pulse;
- existing vision, fire-lane, cover and search-look graphics remain restrained.

## Acceptance checks

1. During stable contact, an actor moving generally away from the player keeps facing the threat unless the covered-dash eligibility gate passes.
2. Covered dashes are short and require supporting fire.
3. Sweep assigns one lead, one cover and one overwatch/blocking member.
4. Lead and cover do not independently advance at the same time.
5. Search roles hand off after a completed scan point.
6. The covering member looks toward the lead's search responsibility while holding.
7. Grenade use is inventory-, cooldown- and friendly-proximity constrained.
8. Close-pressure can trigger at short range without making all members rush the player.
9. Existing V3/V4/V5 regression suites remain green.
10. Pages continues to run entirely offline.