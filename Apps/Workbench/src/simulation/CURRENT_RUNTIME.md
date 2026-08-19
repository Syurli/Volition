# Tactical Wizard production runtime

Tactical Wizard production uses semantic modules only. Numbered simulation, runtime, page, canvas and map implementations are forbidden from the production import graph; Git history is the sole archive for historical implementations.

## Production hierarchy

```text
Perception / Attention
  ↓ facts only
Contact / Knowledge
  ↓ memory and confirmed/lost contact state
Reasoners / Tactical Opportunity
  ↓ proposals only
Tactical Planning
  ↓ canonical Role / Task / TacticalTarget
Operational Arbitration
  ↓ chooses the active plan lease
Execution Contract
  ↓ Movement / Weapon / Throwable authorization
Host
  ↓ navigation, locomotion, facing, firing and world simulation
```

Production entry: `tacticalWizardSimulation.ts` / `TacticalWizardSimulation`.
Host: `tacticalWizardHost.ts` / `TacticalWizardHost`.
Map: `tacticalWizardTestMap.ts`.

The Workbench combat sandbox may compose this stable production entry through semantic adapters such as `tacticalWizardAdaptive.ts`. Composition may add game-specific facts, Reasoners, controls and validation surfaces; it must not become another numbered runtime inheritance chain or a second execution authority.

## Single visual and attention authority

One current-facing + FOV + LOS result is synchronized into each agent's `targetVisible`. Contact Knowledge, `confirmedVisualIds`, firing validity, recovery security and debug views consume that same fact rather than independently deciding whether the player is visible.

Searching, acoustic investigation and recovery security may own an explicit attention anchor. Active gaze uses a deterministic left/right scan pattern while moving, changes real facing, and publishes `searchLookTarget` for the Workbench gaze line. Detection still requires current facing, FOV and world LOS.

The adaptive view adds one presentation guardrail: **confirmed visual contact outranks acoustic/search attention**. A visible agent publishes `track_visual` with the current confirmed contact as both anchor and look target. Historical acoustic evidence can remain in perception memory but cannot be shown as the active gaze anchor while the player is directly visible.

## Contact memory and search

The semantic runtime keeps persistent contact knowledge rather than treating the latest world position as a universal target:

- previous and last confirmed positions;
- last confirmed tick;
- egress direction derived only from real visual samples;
- confidence and uncertainty radius;
- LKP verification / negative evidence;
- cleared search nodes;
- directional search frontier.

A fresh LKP has a short bounded fire window. Once negative evidence verifies the LKP empty, ordinary rifle fire and offensive grenade use against that old point are revoked. Search expands along the recorded egress direction and preserves cleared nodes through spatial replans.

## Formation hold

Idle patrol members that reach their assigned formation point before the rest of the element no longer appear to enter an unexplained stationary state. The Tactical Wizard sandbox exposes `formation_hold`, keeps the early member scanning the next route and the lagging teammate direction, and promotes a prolonged lagger to `formation_catch_up`. Returning to idle patrol also clears stale combat role/task presentation before the next patrol leg.

Formation-hold mutation occurs only during runtime/control updates. Merely reading adaptive state does not change roles or scan anchors.

## Incoming-fire pressure and IAUS R2

`incomingFirePressure.ts` owns Tactical Wizard pressure semantics. Per-agent pressure is derived only from observable combat evidence such as actual shot traces, hits, near misses, blast proximity, cover state and bounded recent fire volume. Each agent keeps an incoming-fire bearing and a hysteretic `stable / pressured / suppressed / pinned` band.

Pressure is not a second tactic state machine. The R2 flow is:

```text
observable fire evidence
  ↓
per-agent pressure + incoming bearing
  ↓
IAUS opportunity ranking
  ↓
Tactical Planner acceptance / rejection
  ↓
canonical role + geometry
  ↓
response lease
  ↓
existing Operational Arbitration / Execution Contract
```

### Current-plan-aware ranking

IAUS no longer compares only the absolute attractiveness of `trade_fire`, `reposition`, `flank`, `regroup` and `assault`. It also consumes planner context:

- current plan progress;
- safe fire lanes;
- geometry quality;
- current tactic age;
- recent committed pressure action;
- recent contact-geometry novelty.

This produces explicit `current_plan_value`, `switch_permission`, `current_plan_release` and `repeat_geometry_novelty` considerations. A healthy Crossfire or Assault therefore gains inertia under ordinary suppression, while pinned/distributed pressure can still overcome the switching cost.

### Opportunity semantics

Tactical Wizard keeps its compatible action names, while the Reasoner boundary exposes the higher-level purpose:

- `trade_fire` → `hold_current_plan`;
- `reposition` → `local_reposition`;
- `flank` → `counter_maneuver`;
- `regroup` → `contract`;
- `assault` → `aggressive_close`.

This keeps IAUS at the “what is worth doing?” layer and leaves “which agent and which point?” to Tactical Planning.

### Planner single ownership

`tacticalWizardAdaptive.ts` must not write combat `role`, `task` or `tacticalTarget` after the planner runs.

When IAUS proposes a flank, the Host Tactical Planner selects the canonical `moverId`, applies the single `flanker` role and computes the flank target. The adaptive layer may inspect and validate that result, but it cannot nominate a second flanker or replace the target.

If the planner rejects the top IAUS candidate, the next ranked candidate may be tried. This is logged as a two-stage Reasoner → Planner trace.

### Geometry validation

A pressure-driven flank requires:

- exactly one living canonical flanker;
- a non-null planner target;
- reachable path;
- at least 2.75 world units of displacement;
- useful flank-angle gain unless the move itself creates strongly different geometry;
- enough novelty when another flank was just completed against nearly unchanged contact geometry.

A zero-displacement “flank” is rejected before a lease is committed.

For the current vertical slice, `local_reposition` is mapped through the existing regroup positioning planner so the Planner remains the only writer of tactical geometry. A dedicated local-reposition plan type may be introduced later if gameplay proves the need.

### Commitment and soft completion

A committed response lease cannot be replaced by ordinary additional shots. Later shots may raise the fact from suppressed to pinned, but only hard invalidation such as member loss, Recovery preemption, invalid world geometry or an incompatible base-tactic transition can force an immediate release.

R2 also adds progress-driven soft completion:

- a bounded hold can release after pressure remains stably low;
- reposition releases when its canonical planner target is reached;
- completed geometry responses may release after their goal is complete and pressure remains stable;
- hard timeout remains as the safety ceiling.

This preserves tactical readability without making commitment a blind fixed-duration lock.

### Reasoner / Planner trace

`adaptiveCombat.lastPlannerTrace` records:

- reasoner winner and all IAUS candidate scores;
- current tactic, plan progress, safe lanes and geometry quality;
- every planner acceptance/rejection attempt;
- rejection reason;
- canonical maneuver owner and target;
- target displacement / flank-angle gain;
- planner revision;
- finally committed action.

A log can therefore distinguish “IAUS preferred flank” from “the planner rejected flank because the target was stationary.”

### Active versus historical response

`adaptiveCombat.tacticalAction` is the **active lease action only**. When no pressure lease exists it is `none`.

Historical diagnostics live in separate fields:

- `lastTacticalAction`;
- `lastTacticalActionReason`;
- `lastTacticalActionTick`;
- `lastPlannerTrace`.

The Workbench no longer displays an old FLANK decision as if it were still active after pressure has stabilized.

## Tactical Wizard combat profiles

`TacticalWizardCombatProfile` remains game-specific authoring data stored through project `extensions` while the vertical slice is still being validated. Current presets cover an elite tactical squad, ordinary infantry, low-training fighters, a feral/non-human pack prototype and combat-machine logic.

Current fields are:

- aggression;
- suppression tolerance;
- normal flank bias;
- reposition bias;
- coordination;
- hold-ground bias;
- counter-maneuver bias;
- break-contact bias;
- per-candidate IAUS multipliers.

Normal `flankBias` remains separate from pressure doctrine. Incoming fire does not mean “high flank bias = repeatedly pick flank”; current-plan value, counter-maneuver preference and geometry novelty all participate.

These fields are intentionally not promoted into generic Willform Schema yet. Only semantics proven useful across materially different Tactical Wizard enemies should later be abstracted into the platform.

## Dynamic combat world

The Workbench sandbox gives existing blocked cells simple destructible HP. A destroyed cell is removed from the same navigation blocked-set already consumed by pathfinding and LOS, so there is no parallel static/dynamic world authority. Geometry changes clear execution contracts and invalidate active tactical, recovery and pressure-response geometry so cover, fire lanes, routes and treatment safety are re-queried against the new world.

This grid implementation is a Tactical Wizard validation stand-in for future voxel destruction. Engine bridges should eventually expose equivalent world-query semantics rather than requiring the AI layer to know which voxel implementation produced them.

## Recovery under fire

Recovery Safety classifies pressure as `stable / pressured / unsafe` and resolves `continue / pause / reposition / abort`. Player shots, near-lane fire and ineffective security raise pressure. Recovery security selects reachable geometry around the casualty, prefers threat LOS and a friendly-safe lane, replans blocked or blind positions, and may fire only on confirmed visual contact through the normal Execution Contract. A progress watchdog replans stalled recovery and aborts after repeated failed geometry rather than allowing an indefinite lease deadlock.

Recovery has higher operational authority than an adaptive pressure response. If a casualty contract becomes active, the pressure-response lease is released rather than allowing both systems to own movement geometry.

## Observation purity

`TacticalWizardAdaptiveSimulation.getState()` is side-effect-free. It decorates the underlying semantic state for Workbench consumption but never:

- rewrites tactical roles or targets;
- updates pressure bands;
- advances/release leases;
- rebuilds geometry;
- increments counters;
- appends logs.

Behavior changes occur only through explicit runtime/control calls (`advance`, player fire/grenade input, test injection, reset, profile changes and world invalidation). This prevents UI render/poll frequency from influencing AI decisions.

## Run-log observability

Compact Workbench exports include adaptive combat and dynamic-world snapshots in addition to fixed runtime identity and Execution Contracts. Reviews can inspect:

- per-agent pressure / band / incoming bearing;
- active response lease;
- last IAUS decision;
- Reasoner candidate scores;
- Planner rejection/acceptance attempts;
- canonical planner target and geometry metrics;
- proposal deferrals caused by an existing lease;
- hard invalidations;
- dynamic geometry revision.

## Production guardrail

CI scans Workbench TypeScript production imports and rejects numbered Simulation / Runtime / Canvas / Page / Map dependencies. New behavior must extend semantic responsibility modules or compose the stable semantic runtime instead of creating V-next wrappers.

The invariant for IAUS is now explicit:

> **Reasoner proposes. Tactical Planner owns role and geometry. Commitment owns continuity. Arbitration owns priority. Execution Contract owns final execution.**


## Recovery Authority / Transactional IAUS R3

- Recovery ownership is validated before Safety pause/reposition/defer. A dead or medically incapable rescuer is reassigned immediately; if no capable living rescuer exists, Recovery releases execution ownership instead of suspending Tactical Planning forever.
- Security-only failures replan only Security geometry. Safe Treatment geometry is retained with hysteresis until it becomes exposed, unreachable, or is invalidated by a genuine treatment-progress failure.
- A covered treatment side may continue through residual `pressured` history; Safety pause moves the rescuer toward fallback instead of producing a null movement owner, and deferral preserves treatment progress.
- IAUS candidate validation is transactional: Tactical Host state, plan revision, roles, targets, events, logs, and execution contracts are restored after Preview. Only the winning candidate reaches Commit.
- `local_reposition` is a single-member Tactical Planning lease. It preserves the current squad doctrine and reseeds that doctrine after arrival; it no longer aliases a squad-wide `regroup`.
- Mature Crossfire/Assault geometry resists whole-plan pressure switches unless pressure reaches `pinned` or the established geometry/fire lanes have materially degraded.


## Recovery R4 capability arbitration

Recovery remains an Operational Arbitration concern, but its contract is now capability-aware. A paired rescue requires a medically capable rescuer and a distinct security member with an armed reserve. If those capabilities change, ownership swaps atomically while casualty reservation and treatment progress remain intact.

`deferred` Recovery is an obligation reservation rather than movement / weapon ownership: normal reduced-pair survival, tactical movement and emergency logistics resume until a new rescue window passes capability and geometry validation. A geometry solver may now reject all candidates (`no_covered_treatment`, `no_security_lane`, `no_viable_geometry`) instead of committing the least-bad exposed treatment point. Repeated identical deferrals increase the retry window rather than creating an execution livelock.
