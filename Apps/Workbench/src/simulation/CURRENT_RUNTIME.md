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

The Tactical Wizard sandbox derives per-agent pressure from observable combat evidence: actual player-shot traces, hits, near misses, cover state and bounded recent fire volume. Pressure decays over time and is aggregated into a squad fact with `stable / pressured / suppressed / pinned` bands.

Pressure is an input to Tactical Planning, not an unconditional flee state. The active Tactical Wizard combat profile can authorize a bounded choice to keep trading fire, rotate to a new firing position, flank, regroup or assault. Response cooldowns and short leases prevent every bullet from rebuilding tactical geometry, while sustained fire eventually forces a choice other than indefinite direct trading.

### Tactical Wizard combat profiles

`TacticalWizardCombatProfile` remains game-specific authoring data stored through project `extensions` while the vertical slice is still being validated. Current presets cover an elite tactical squad, ordinary infantry, low-training fighters, a feral/non-human pack prototype and combat-machine logic. Profiles expose aggression, suppression tolerance, flank bias, reposition bias and coordination.

These fields are intentionally not promoted into generic Willform Schema yet. Only semantics proven useful across materially different Tactical Wizard enemies should later be abstracted into the platform.

### Dynamic combat world

The Workbench sandbox gives existing blocked cells simple destructible HP. A destroyed cell is removed from the same navigation blocked-set already consumed by pathfinding and LOS, so there is no parallel static/dynamic world authority. Geometry changes clear execution contracts and invalidate active tactical/recovery geometry so cover, fire lanes, routes and treatment safety are re-queried against the new world.

This grid implementation is a Tactical Wizard validation stand-in for future voxel destruction. Engine bridges should eventually expose equivalent world-query semantics rather than requiring the AI layer to know which voxel implementation produced them.

### Recovery under fire

Recovery Safety classifies pressure as `stable / pressured / unsafe` and resolves `continue / pause / reposition / abort`. Player shots, near-lane fire and ineffective security raise pressure. Recovery security selects reachable geometry around the casualty, prefers threat LOS and a friendly-safe lane, replans blocked or blind positions, and may fire only on confirmed visual contact through the normal Execution Contract. A progress watchdog replans stalled recovery and aborts after repeated failed geometry rather than allowing an indefinite lease deadlock.

### Production guardrail

CI scans Workbench TypeScript production imports and rejects numbered Simulation / Runtime / Canvas / Page / Map dependencies. New behavior must extend semantic responsibility modules or compose the stable semantic runtime instead of creating V-next wrappers.
