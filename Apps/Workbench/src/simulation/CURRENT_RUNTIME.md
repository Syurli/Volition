# Tactical Wizard production runtime

The Tactical Wizard reference uses one fixed responsibility hierarchy. Runtime revisions are Git/history concerns; numbered implementation modules are forbidden in the Workbench source tree.

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

The production modules are named by responsibility:

- `tacticalWizardReferenceModel.ts` — reference model/types used by the baseline example and run-log contracts;
- `tacticalWizardTacticalHost.ts` — tactical planning, coordinated positioning, navigation-facing locomotion and host execution mechanics;
- `tacticalWizardTestMap.ts` — authored combat sandbox geometry and test points;
- `tacticalWizardExecutionContract.ts` — capability, arbitration and final execution-contract rules;
- `tacticalWizardRuntime.ts` — the Workbench production composition root.

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

If all living members are dry, exactly one deterministic member may receive the emergency resupply lease. This prevents the all-dry deadlock without adding a new retreat behavior.

## Recovery contract

Recovery uses the same arbitration/contract surface. Rescuer and security ownership is committed atomically; hard incapacitation may temporarily constrain execution, but lower-priority domains cannot steal the recovery plan.

## Tactical Host

`tacticalWizardTacticalHost.ts` contains the validated coordinated-position, search, fire-lane, grenade-lifecycle and locomotion mechanics used beneath the fixed hierarchy. It is a responsibility module, not a runtime revision layer.

The production Runtime composes this Host with `tacticalWizardExecutionContract.ts`; there is no compatibility simulation entry between the Workbench and the Runtime.

## Naming rule

Implementation names describe responsibility, never chronological generation. New source modules must not use suffixes such as `V2`, `V7` or similar revision numbers. Historical revision information belongs in Git commits/tags and, when necessary, archival documents—not in active module names.

The same rule applies to active Workbench page and canvas modules. Presentation modules use responsibility names such as `SimulationTacticalCanvas`, `SimulationOperationsCanvas`, `SimulationRecoveryCanvas`, `SimulationCombatCanvas`, `RuntimePagesBase`, `RuntimeCombatPages` and `RuntimeResponsePages`.

## Regression requirements

Changes to this runtime must preserve these invariants:

- an approved logistics lease owns the agent's movement until completion or explicit invalidation;
- `grenade_suppress` remains a low-priority reaction and cannot erase logistics;
- hard reactions may constrain movement without rewriting the plan owner;
- all-dry squads select exactly one recovery/resupply owner;
- dry agents cannot provide a valid suppressive/crossfire lane;
- recovery ownership remains above lower-priority domains;
- Workbench production imports only responsibility-named runtime modules;
- active Workbench module filenames contain no chronological `Vxx` suffixes;
- run-log exports include `executionAuthority` so post-hoc analysis sees the final execution truth directly.
