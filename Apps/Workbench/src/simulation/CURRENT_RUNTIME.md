# Tactical Wizard production runtime

The Tactical Wizard reference uses one fixed responsibility hierarchy. Runtime versions are a Git/history concern; numbered simulation overlays are forbidden in production.

## Production hierarchy

```text
Perception
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

`TacticalWizardRuntime` is the fixed-hierarchy core. Workbench instantiates the stable semantic entry `tacticalWizardSimulationV4.ts`, which adds the migrated perception/contact behavior services around that core without importing or executing the retired V8–V18 inheritance chain.

## Ownership rules

### Perception

Perception may report visibility, hearing and incoming-fire evidence. It cannot assign tactical roles or erase another domain's committed plan.

The semantic entry restores the validated sensing envelope from the historical behavior work:

- active vision range: 20 world units;
- rifle-report hearing range: 28 world units;
- one audible shot may create a bounded acoustic investigation movement constraint;
- repeated shots, impacts, near misses and hits may escalate a coarse threat hypothesis;
- hidden shooter coordinates are never copied directly into contact memory without confirmed Host LOS/FOV.

### Contact / Knowledge

Contact state owns exact confirmed positions, previous confirmed position, last observed egress direction, uncertainty and negative evidence.

A last-known position is a hypothesis, not a permanent attack coordinate:

- fresh LKP direct-fire lifetime: 6 decision ticks;
- LKP verification range: 8.5 units;
- three valid negative-evidence ticks clear the LKP;
- cleared nodes remain in search memory;
- when egress evidence exists, sweep lanes are rebuilt along a directional frontier;
- cleared LKP and search-frontier nodes are information/search targets, not rifle targets.

### Tactical Planning

Tactical Planning is the only owner of normal combat `Role`, `Task` and `TacticalTarget`. Existing doctrine remains bounding, sweep, flank, crossfire, assault and regroup; behavior-parity restoration does not add another combat tactic.

A role is operationally useful only when its capability requirements are valid. In particular, a dry element cannot count as a usable firing lane or suppressor merely because its geometry is correct.

### Operational Arbitration

Operational Arbitration decides whether a requested domain may own the current execution lease. The effective priority is:

```text
recovery
> hard reaction / incoming-fire survival
> direct combat
> search / investigation
> logistics
> patrol
```

Low ammunition creates a logistics need; it does not itself grant permission to abandon confirmed direct combat. When direct combat is confirmed, a still-armed member keeps its tactical lease. An all-dry squad may still select exactly one deterministic emergency resupply owner.

### Execution Contract

Every agent exposes one contract with:

- `planOwner`,
- `movementOwner`,
- `weaponOwner`,
- `movementTarget`,
- weapon/throwable authorization,
- tactical lease state,
- reason.

This contract is the final source of truth for movement and weapon authorization. Bounded acoustic investigation is surfaced through the same execution-truth output rather than running as a hidden locomotion override.

## Execution continuity

Behavior parity also restores short Host-boundary continuity budgets that do not change tactical intent:

- stable tactical movement commitment: 12 motion frames;
- large transient retarget tolerance: 1.5 units;
- locomotion-mode hold: 5 motion frames;
- facing turn cap: 16 degrees per motion frame.

These budgets reduce oscillation and visual snapping while leaving role/task/target ownership with Tactical Planning.

## Logistics contract

A low-ammunition signal is not itself permission to abandon a tactical role. Once logistics admission is approved, however, the handoff is atomic:

1. Logistics receives the plan lease.
2. The agent moves to one selected supply cache.
3. Tactical fire/throw authorization is disabled for that agent while detached.
4. Soft reactions cannot cancel the assignment.
5. If confirmed direct combat later invalidates the lower-priority lease, Operational Arbitration returns the agent to Tactical Planning.
6. After resupply, the lease returns to Tactical Planning and the tactical plan is refreshed.

If all living members are dry, exactly one deterministic member may receive the emergency resupply lease. This prevents the previous all-dry deadlock without adding a new retreat behavior.

## Recovery contract

Recovery uses the same arbitration/contract surface. Rescuer and security ownership is committed atomically; hard incapacitation may temporarily constrain execution, but lower-priority domains cannot steal the recovery plan.

## Tactical Host

The tactical/locomotion kernel is the standalone implementation historically named `tacticalWizardSimulationV7.ts`. It is retained because it is not an overlay class and contains the previously validated coordinated-position, search, fire-lane and locomotion mechanics.

It is treated only as the Host beneath the fixed hierarchy. Production code does not import V8–V18 or any former Integrated / Authority / Current layer. A later naming-only migration may rename this Host without changing behavior.

## Semantic runtime identity

Every semantic runtime session logs a self-identifying record containing:

- build commit (`__VOLITION_COMMIT__` when supplied by the build),
- semantic entrypoint,
- architecture,
- behavior revision,
- enabled behavior-parity feature flags.

The current behavior revision is `fixed-hierarchy-parity-r1`. This session record is preserved by run-log compression, allowing exported logs to prove which runtime actually produced them.

## Retired overlay chain

The following production pattern remains forbidden:

```text
V8 extends V7
V9 extends V8
...
Integrated extends V18
ExecutionIntegrated extends Integrated
PerceptionIntegrated extends ExecutionIntegrated
ThreatAuthority extends PerceptionIntegrated
Current extends ThreatAuthority
```

No replacement V19/V20 layer may be introduced.

## Regression requirements

Changes to this runtime must preserve these invariants:

- repeated audible rifle fire can affect the squad before direct visual contact;
- one audible rifle report can create a bounded investigation without pretending the shooter position is confirmed;
- exact contact memory is sampled only from confirmed Host visual contact;
- stale/cleared LKP cannot remain a permanent rifle target;
- negative evidence can clear an LKP and directional search retains cleared-node memory;
- confirmed direct combat outranks non-emergency logistics admission;
- an approved valid logistics lease owns movement until completion or explicit higher-priority invalidation;
- `grenade_suppress` remains a low-priority reaction and cannot erase a valid logistics assignment;
- hard reactions may constrain movement without rewriting the plan owner;
- all-dry squads select exactly one recovery/resupply owner;
- dry agents cannot provide a valid suppressive/crossfire lane;
- recovery ownership remains above lower-priority domains;
- Workbench production imports no retired overlay source;
- run-log exports preserve the semantic runtime identity session and `executionAuthority` so post-hoc analysis sees both the build identity and final execution truth directly.
