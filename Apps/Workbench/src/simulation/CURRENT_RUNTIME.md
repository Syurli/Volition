# Tactical Wizard production runtime

The Tactical Wizard reference now uses one fixed responsibility hierarchy. Runtime versions are a Git/history concern; numbered simulation overlays are forbidden in production.

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

`TacticalWizardRuntime` is the Workbench production entry. It is composition-based and does not extend another simulation generation.

## Ownership rules

### Perception

Perception may report visibility, hearing and incoming-fire evidence. It cannot assign roles, change logistics tasks or write a movement target.

### Contact / Knowledge

Contact state stores confirmed positions, lost-contact state and uncertainty. It cannot directly move an agent.

### Tactical Planning

Tactical Planning is the only owner of normal combat `Role`, `Task` and `TacticalTarget`. Existing doctrine remains bounding, sweep, flank, crossfire, assault and regroup; this architecture change does not add a new tactic.

A role is only operationally useful when its capability requirements are valid. In particular, a dry element cannot count as a usable firing lane or suppressor merely because its geometry is correct.

### Operational Arbitration

Operational Arbitration decides which existing domain owns the current plan lease:

- recovery,
- committed logistics,
- tactical/search,
- patrol.

Reactions are temporary execution constraints. They do not delete another domain's committed plan.

### Execution Contract

Every agent exposes one contract with:

- `planOwner`,
- `movementOwner`,
- `weaponOwner`,
- `movementTarget`,
- weapon/throwable authorization,
- tactical lease state,
- reason.

This contract is the final source of truth for movement and weapon authorization.

## Logistics contract

A low-ammunition signal is not itself permission to abandon a tactical role. Once logistics admission is approved, however, the handoff is atomic:

1. Logistics receives the plan lease.
2. The agent moves to one selected supply cache.
3. Tactical fire/throw authorization is disabled for that agent while detached.
4. Soft reactions cannot cancel the assignment.
5. After resupply, the lease returns to Tactical Planning and the tactical plan is refreshed.

If all living members are dry, exactly one deterministic member may receive the emergency resupply lease. This prevents the previous all-dry deadlock without adding a new retreat behavior.

## Recovery contract

Recovery uses the same arbitration/contract surface. Rescuer and security ownership is committed atomically; hard incapacitation may temporarily constrain execution, but lower-priority domains cannot steal the recovery plan.

## Tactical Host

The current tactical/locomotion kernel is the standalone implementation historically named `tacticalWizardSimulationV7.ts`. It is retained because it is not an overlay class and contains the previously validated coordinated-position, search, fire-lane and locomotion mechanics.

It is treated only as the Host beneath the fixed hierarchy. Production code does not import V8–V18 or any former Integrated / Authority / Current layer. A later naming-only migration may rename this Host without changing behavior.

## Retired overlay chain

The following production pattern is forbidden and has been removed:

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

- an approved logistics lease owns the agent's movement until completion or explicit invalidation;
- `grenade_suppress` remains a low-priority reaction and cannot erase logistics;
- hard reactions may constrain movement without rewriting the plan owner;
- all-dry squads select exactly one recovery/resupply owner;
- dry agents cannot provide a valid suppressive/crossfire lane;
- recovery ownership remains above lower-priority domains;
- Workbench production imports no retired overlay source;
- run-log exports include `executionAuthority` so post-hoc analysis sees the final execution truth directly.
