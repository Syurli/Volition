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

### Single visual authority

One current-facing + FOV + LOS result is synchronized into each agent's `targetVisible`. Contact Knowledge, `confirmedVisualIds`, firing validity, recovery security and debug views consume that same fact rather than independently deciding whether the player is visible.

### Active attention

Searching, acoustic investigation and recovery security may own an explicit attention anchor. Active gaze uses a deterministic left/right scan pattern while moving, changes real facing, and publishes `searchLookTarget` for the Workbench gaze line. Detection still requires current facing, FOV and world LOS.

### Recovery under fire

Recovery Safety classifies pressure as `stable / pressured / unsafe` and resolves `continue / pause / reposition / abort`. Player shots, near-lane fire and ineffective security raise pressure. Recovery security selects reachable geometry around the casualty, prefers threat LOS and a friendly-safe lane, replans blocked or blind positions, and may fire only on confirmed visual contact through the normal Execution Contract. A progress watchdog replans stalled recovery and aborts after repeated failed geometry rather than allowing an indefinite lease deadlock.

### Production guardrail

CI scans Workbench TypeScript production imports and rejects numbered Simulation / Runtime / Canvas / Page / Map dependencies. New behavior must extend semantic responsibility modules instead of creating V-next wrappers.
