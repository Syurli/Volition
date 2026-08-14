# Tactical Wizard Current Runtime

The Workbench has one production simulation runtime: `tacticalWizardRuntime.ts`.

`tacticalWizardSimulationV4.ts` is a compatibility import surface only. `tacticalWizardSimulationCurrent.ts` and the historical `tacticalWizardSimulationV*.ts` inheritance stack are now contained behind the production runtime as a compatibility Host while proven mechanics are migrated into domain-named modules. The Workbench itself must not inherit the historical stack.

The important distinction is:

- **version history belongs to Git and compatibility fixtures**;
- **runtime layers are named by responsibility**;
- **one responsibility has one final writer**.

## Production layers

The intended production flow is:

1. **Perception / Evidence** — produces facts only; it does not write movement, roles, or tactical targets.
2. **Contact / Knowledge** — owns contact memory and confidence; it does not choose tactics.
3. **Tactical Planning** — owns squad tactic, role, task, and tactical target.
4. **Operational Arbitration** — resolves which domain currently owns an agent: recovery, counterfire, reaction, direct combat, search, logistics, or patrol.
5. **Execution Resolver** — is the single final writer of movement/action targets.
6. **Host / Locomotion** — executes navigation, motion, facing, weapon/world simulation; it does not re-decide tactics.

The first physical migration completed here is **Execution Ownership**:

- `tacticalWizardExecutionOwnership.ts` contains the canonical owner priorities and target resolution policy;
- `tacticalWizardRuntime.ts` is a composition boundary rather than another inherited simulation version;
- Workbench production movement goes through one final `Execution Resolver`;
- historical movement hooks may still calculate compatibility proposals, but their proposal is consulted only when the winning owner explicitly needs the legacy Host implementation;
- committed tactical/search targets do not accept an unrelated legacy logistics/reaction destination as fallback;
- `grenade_suppress` keeps its original reaction priority 20 and is not promoted to the old generic reaction priority 80;
- recovery rescue/security remain higher-priority hard owners.

This directly prevents the observed Crossfire/Flank target oscillation where a member alternated between its tactical point and a supply cache while still labelled as a tactical mover.

## Rules

1. Do not add `V19`, `V20`, or another version-number behavior layer.
2. New production behavior enters a domain-named module composed by `tacticalWizardRuntime.ts`.
3. The production `TacticalWizardRuntime` must not extend `Current`, `Integrated`, `ThreatAuthority`, or any `Vxx` class.
4. One domain has one final authority. Recovery safety, perception/threat association, tactical opportunity selection, and execution ownership must not be independently re-decided by multiple historical layers.
5. Historical Vxx tests stay green while behavior is migrated. Their purpose is regression protection, not version selection.
6. The Workbench production state must expose both `recoverySafety.runtimeVersion === 'current'` and `executionAuthority.finalMovementAuthority === 'execution_resolver'`.
7. Historical compatibility hooks are transitional implementation detail. A domain is considered migrated only when its final production decision is made outside the version chain.
8. Do not tune tactic trigger conditions while migrating an authority domain. Architecture repair and gameplay tuning are separate changes.

## Canonical movement arbitration

Current production movement priorities are responsibility based:

- downed reaction: 100
- recovery rescue: 95
- recovery security: 90
- counterfire: 85
- stunned reaction: 80
- direct combat: 70
- smoke retreat / search: 60
- dodge: 50
- smoke reposition: 40
- flash push / logistics boundary: 30
- grenade suppress: 20
- patrol: 10

Equal-priority cases keep deterministic declaration order. Reaction subtype priorities come from the original reactive-combat semantics rather than the later generic `reaction = 80` wrapper.

## Current recovery ownership

Recovery remains reconciled by the Current compatibility Host while its domain migration is protected by existing regression tests:

- rescue role selection prefers a combat-capable security element when the medical-role constraints allow it;
- stage/treatment/security geometry is committed atomically at rescue start;
- friendly-blocked security lanes invalidate the actual current security point and temporarily exclude that failed geometry;
- security readiness distinguishes position, LOS, friendly fire lane, weapon readiness, and hard reaction readiness;
- sustained near-miss/fire pressure can pause or abort recovery when effective security cannot be provided;
- a downed casualty blocking a lane remains a non-replan case;
- soft dodge/smoke reactions do not regain authority over an otherwise valid committed recovery;
- pending recoverable casualties gate lower-priority field logistics so rescue start does not churn assign/preempt cycles.

## Migration order

The remaining physical flattening order is responsibility based, not version based:

1. tactical role/plan ownership;
2. reaction/action authorization;
3. logistics admission and detachment;
4. perception/contact/threat facts;
5. recovery domain extraction;
6. remove the compatibility Host inheritance chain once equivalent domain tests cover the proven mechanics.

No new tactic or gameplay feature is part of this migration. The goal is to preserve the behavior that already worked while removing competing final writers.
