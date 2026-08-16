# Tactical Wizard production runtime

Tactical Wizard production uses semantic modules only. Numbered simulation, runtime, page, canvas and map implementations are forbidden from the production import graph; Git history is the sole archive for historical implementations.

## Production hierarchy

```text
Perception / Attention
  ↓ facts only
Contact / Knowledge
  ↓ memory and confirmed/lost contact state
Tactical Planning
  ↓ Role / Task / TacticalTarget
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

The Workbench combat sandbox may compose this stable production entry through semantic adapters such as `tacticalWizardAdaptive.ts`. Composition is allowed to add game-specific observations, controls and validation surfaces; it must not become another numbered runtime inheritance chain or a second execution authority.

### Single visual authority

One current-facing + FOV + LOS result is synchronized into each agent's `targetVisible`. Contact Knowledge, `confirmedVisualIds`, firing validity, recovery security and debug views consume that same fact rather than independently deciding whether the player is visible.

### Active attention

Searching, acoustic investigation and recovery security may own an explicit attention anchor. Active gaze uses a deterministic left/right scan pattern while moving, changes real facing, and publishes `searchLookTarget` for the Workbench gaze line. Detection still requires current facing, FOV and world LOS.

### Formation hold

Idle patrol members that reach their assigned formation point before the rest of the element no longer appear to enter an unexplained stationary state. The Tactical Wizard sandbox exposes `formation_hold`, keeps the early member scanning the next route and the lagging teammate direction, and promotes a prolonged lagger to `formation_catch_up`. Returning to idle patrol also clears stale combat role/task presentation before the next patrol leg.

### Incoming-fire pressure

`incomingFirePressure.ts` owns the Tactical Wizard pressure semantics. Per-agent pressure is derived only from observable combat evidence such as actual shot traces, hits, near misses, blast proximity, cover state and bounded recent fire volume. Each agent keeps an incoming-fire bearing and a hysteretic `stable / pressured / suppressed / pinned` band, so the state does not chatter when one floating-point value crosses a threshold for a single frame.

Pressure is not a second tactic state machine. The flow is:

```text
observable fire evidence
  ↓
per-agent pressure fact + incoming bearing
  ↓
local pressure effect
  ↓
PressureResponseProposal
  ↓
active-plan lease gate
  ↓
one bounded response lease
  ↓
existing Tactical Planning / Execution geometry
```

A committed response lease cannot be replaced by ordinary additional shots. Later shots may raise the fact from suppressed to pinned, but only hard invalidation such as member loss, Recovery preemption, invalidated world geometry or an incompatible base-tactic transition can release the lease early. This prevents sustained automatic fire from repeatedly rotating roles and rebuilding the same geometry every few rounds.

The current local semantic bands are `normal / short_peek / cover_bound / pinned_hold`. Squad-level responses remain deliberately small: bounded trade-fire, materially different reposition, stable flank/counter-maneuver, regroup/break contact, or mindset-specific assault. A pressure flank keeps one maneuver agent and one target for the lease instead of re-lottering the flanker after each shot.

Under-fire reposition is no longer implemented as role rotation. The sandbox scores reachable candidates by threat occlusion, adjacent hard cover, lateral displacement from the incoming line, meaningful distance from the current position, path exposure, path cost and squad cohesion. The target must therefore represent new geometry rather than another member standing in the same small cluster.

The Workbench visualizer intentionally does not draw an expanding pressure circle. It renders small directional chevrons on the incoming-fire side of the agent, a short local pressure meter, and—when one exists—the committed response route. This keeps pressure readable as directional evidence instead of resembling an area-of-effect radius.

### Tactical Wizard combat profiles

`TacticalWizardCombatProfile` remains game-specific authoring data stored through project `extensions` while the vertical slice is still being validated. Current presets cover an elite tactical squad, ordinary infantry, low-training fighters, a feral/non-human pack prototype and combat-machine logic.

The current Tactical Wizard fields are:

- aggression
- suppression tolerance
- normal flank bias
- reposition bias
- coordination
- hold-ground bias
- counter-maneuver bias
- break-contact bias

Normal `flankBias` is intentionally separate from pressure doctrine. Incoming fire no longer means “high flank bias = repeatedly pick flank”; `holdGroundBias`, `counterManeuverBias` and `breakContactBias` describe how an archetype reacts when the current firing line becomes saturated.

These fields are intentionally not promoted into generic Willform Schema yet. Only semantics proven useful across materially different Tactical Wizard enemies should later be abstracted into the platform.

### Dynamic combat world

The Workbench sandbox gives existing blocked cells simple destructible HP. A destroyed cell is removed from the same navigation blocked-set already consumed by pathfinding and LOS, so there is no parallel static/dynamic world authority. Geometry changes clear execution contracts and invalidate active tactical, recovery and pressure-response geometry so cover, fire lanes, routes and treatment safety are re-queried against the new world.

This grid implementation is a Tactical Wizard validation stand-in for future voxel destruction. Engine bridges should eventually expose equivalent world-query semantics rather than requiring the AI layer to know which voxel implementation produced them.

### Recovery under fire

Recovery Safety classifies pressure as `stable / pressured / unsafe` and resolves `continue / pause / reposition / abort`. Player shots, near-lane fire and ineffective security raise pressure. Recovery security selects reachable geometry around the casualty, prefers threat LOS and a friendly-safe lane, replans blocked or blind positions, and may fire only on confirmed visual contact through the normal Execution Contract. A progress watchdog replans stalled recovery and aborts after repeated failed geometry rather than allowing an indefinite lease deadlock.

Recovery has higher operational authority than an adaptive pressure response. If a casualty contract becomes active, the pressure response lease is released rather than allowing both systems to own movement geometry.

### Run-log observability

Compact Workbench exports include the adaptive combat snapshot and dynamic-world view in addition to the fixed runtime identity and execution contracts. Reviews can inspect per-agent pressure, pressure band, incoming bearing, local effect, active response lease owner/target/ticks, proposals deferred by an existing lease, hard invalidations and geometry revision without reconstructing them indirectly from movement events.

### Production guardrail

CI scans Workbench TypeScript production imports and rejects numbered Simulation / Runtime / Canvas / Page / Map dependencies. New behavior must extend semantic responsibility modules or compose the stable semantic runtime instead of creating V-next wrappers.
