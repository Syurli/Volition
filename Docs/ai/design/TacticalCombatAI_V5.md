# Tactical Combat AI V5 — Tactical Task Execution

## Status

Reference implementation for the Tactical Wizard Workbench simulation. This document defines the browser-host tactical execution model; engine Bridges may replace geometry/path/cover queries while preserving task semantics and telemetry.

## Why V5 exists

V4 improved spatial target separation and committed maneuvers, but a squad could still look tactically weak because the global tactic name was doing too much work. Three agents could receive different destinations while still behaving like three independent shooters around one threat point. The missing layer was explicit **tactical task execution**: who is providing fire, who may cross which space, which cover slot is owned, when an agent is protected versus peeking, and which part of a search area has actually been cleared.

V5 separates:

1. **Doctrine** — why the squad changes tactical mode.
2. **Task allocation** — what each member contributes right now.
3. **Spatial resolution** — where that task can be executed safely.
4. **Member execution** — movement, cover posture, looking and firing.
5. **Telemetry** — enough state to verify all four layers independently.

## Reference principles

### F.E.A.R. / Jeff Orkin

The F.E.A.R. AI presentations and papers describe squad behaviors as slots/orders that are filled by individual agents and monitored for completion. Examples include one member suppressing while others seek cover or advance, reserving distinct cover positions, and dividing search work while elements cover each other. The important lesson for Willform is not to copy a fixed sequence of cinematic tactics; it is to make small tactical jobs explicit and let useful-looking coordination emerge from valid spatial choices plus task ownership.

V5 adaptations:

- one member can own `suppress` while another owns `bound_to_cover`;
- cover destinations are reserved and paired with a separate peek location;
- advancing members route around active friendly fire corridors;
- search work is partitioned into sectors / scan points instead of every member staring at the Last Known Position;
- task completion is monitored before doctrine is allowed to progress.

Primary reference: Jeff Orkin, **Three States and a Plan: The A.I. of F.E.A.R.**, GDC 2006 / Monolith Productions.

### Halo 3 AI Objectives

Bungie's Halo 3 AI Objectives material describes environment-authored tasks with priorities, capacities and constraints, with squads distributed across those tasks rather than every actor independently selecting the same attractive action. The transferable idea is **capacity-controlled tactical opportunities**.

V5 adaptations:

- a cover slot is an owned/capacity-one opportunity;
- a fire lane is an occupied tactical resource other movers should not casually cross;
- `suppress`, `crossfire`, `overwatch`, `search_sector` and `assault` are explicit member tasks under one squad doctrine;
- future engine Bridges can map the same task contract onto EQS, NavMesh smart objects, authored cover nodes or encounter volumes.

Primary reference family: Bungie GDC publications on Halo 3 AI Objectives / decision making and behavior systems.

### Half-Life Human Grunt

Valve's Half-Life SDK exposes explicit Human Grunt schedules such as suppress, sweep, and establish-line-of-fire. `CSquadMonster::NoFriendlyFire` checks a volume between shooter and enemy and prevents shooting when a squad member occupies that corridor. This is a useful concrete baseline for a problem visible in the Workbench: an ally should not stand in or casually traverse a firing lane just because its path is geometrically shortest.

V5 adaptations:

- every attempted shot checks a shooter-target corridor for friendlies;
- blocked fire is withheld and recorded in telemetry;
- established support/crossfire lanes become transient path costs/blocks for other members;
- the UI distinguishes reserved fire lanes from actual shot traces.

Primary reference: Valve Half-Life SDK, `dlls/hgrunt.cpp` and `dlls/squadmonster.cpp`.

### Cry of Fear note

Cry of Fear was considered as a tonal/reference game, but no sufficiently authoritative public technical source for its exact combat-AI implementation was used for V5. This design therefore does **not** claim to reproduce Cry of Fear internals. The classic GoldSrc/Half-Life source is used only as a directly inspectable shooter-AI reference.

## V5 tactical tasks

| Task | Purpose | Movement contract | Fire / look contract |
| --- | --- | --- | --- |
| `suppress` | Fix the threat and enable another element to move | settle in reserved cover | peek only when a safe lane exists; withhold when friendly blocks lane |
| `bound_to_cover` | Advance under support | move cover-to-cover and avoid active friendly lanes | normally does not stop mid-bound to trade shots |
| `hold_cover` | Preserve a stable supporting position | own a cover slot | hold threat-facing sector; may support-fire when safe |
| `flank_to_cover` | Create a lateral/rear angle without charging exposed | prefer a flank-biased cover slot | fire after reaching the flank position and obtaining a safe lane |
| `crossfire` | Maintain separated threat-facing lanes | own opposite-side cover slots | do not assault until two safe lanes exist and contact geometry is stable |
| `assault` | Exploit a genuinely established opening | short exposed movement is allowed | support element remains behind; assaulters still respect friendly-fire checks |
| `search_sector` | Clear assigned space after contact loss | visit multiple search points | dwell and scan multiple directions at each point before advancing |
| `overwatch` | Protect search elements and observe likely exits | hold one search/cover point | scan multiple headings rather than staring continuously at LKP |
| `regroup` | Recover spacing and useful cover | return to distinct cover/outer sectors | prepare new safe lanes before next maneuver cycle |

## Cover model

A cover slot has two semantically different positions:

- `position`: protected location where the agent settles;
- `peekPosition`: adjacent location/origin that can see the threat.

Member cover state is observable:

- `none`
- `moving`
- `covered`
- `peeking`

A covered shooter does not magically shoot through the wall: the reference Host validates LOS from `peekPosition`, renders the shot from that origin, then returns the member to `covered` after a short peek window.

## Fire-lane model

An active support/crossfire shooter reserves a narrow corridor from its firing origin toward the shared threat estimate.

Rules:

1. A shot is withheld if another squad member is inside the corridor.
2. A moving member treats other members' active corridors as transient navigation blocks/costs.
3. A member never blocks its own corridor when pathing.
4. Actual shot traces are visually separate from reserved lanes.
5. `safeFireLanes` is reported as a squad-level diagnostic.

This is intentionally simple enough to port to every Bridge. A production engine can replace the 2D corridor with capsule sweeps, weapon muzzle traces, stance-aware body volumes and nav-area costs without changing the task contract.

## Search model

The LKP is a **search origin**, not a permanent gaze target.

When visual contact is lost:

- searchers receive different waypoint sequences around the LKP;
- an overwatch member holds a distinct point;
- at each search waypoint an agent pauses;
- the agent scans a deterministic series of headings;
- only after the scan set is complete does it advance;
- search progress is tracked per member and aggregated for doctrine completion;
- stable visual reacquisition can interrupt search, but one-frame LOS flicker cannot.

Future iterations should add occlusion-frontier generation, doorway/room search tasks, uncertainty expansion and negative-information memory. The current V5 deliberately proves the task/execution contract first.

## Tactical observer visualization

The Workbench visualization should help inspect tactics without becoming the dominant visual element.

Default high-priority signals:

- assigned cover + peek point;
- member task;
- tactical destination;
- reserved fire lane (low opacity);
- actual shot (fixed orange-red, independent of agent identity color);
- search look direction;
- compact LKP marker.

Low-priority / opt-in signals:

- grid;
- full path;
- hearing radius;
- vision boundary.

Vision is outline-only and visually interpolated. Candidate cover slots are not all painted by default; only assigned cover is shown. Agent labels are shortened to identity + task, while full state remains available in the sidebar/debug inspector.

## Acceptance criteria

V5 is considered successful when the Workbench can demonstrate all of the following without relying only on debug text:

1. One member visibly holds/suppresses while another moves.
2. Movers do not repeatedly cross established friendly fire lanes.
3. Shooters visibly withhold fire when a friendly occupies the lane.
4. Cover users visibly settle behind cover and fire from a distinct peek position.
5. A flank prefers cover-to-cover geometry rather than an exposed orbit around the player.
6. Crossfire is held long enough to be perceived and assault is not automatic.
7. Lost-contact searchers physically divide space and visibly inspect several directions.
8. Visualization remains readable at 1× with grid/path disabled by default.
9. Run Log exposes task, cover state, blocked fire and safe-lane counts so visual complaints can be diagnosed from exported telemetry.
