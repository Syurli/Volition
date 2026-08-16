# IAUS Utility Reasoner — Tactical Wizard Integration

> Status: Tactical Wizard reference implementation. The utility kernel is intentionally not yet a frozen `Packages/Core` contract.

## 1. Why IAUS is being added

Tactical Wizard already has a stable execution architecture:

```text
Perception
  ↓
Authoritative Facts / Contact Knowledge
  ↓
Tactical Reasoning & Planning
  ↓
Commitment / Lease
  ↓
Operational Arbitration
  ↓
Execution Contract
  ↓
Host
```

The missing capability is not another execution system. It is a better way to compare several simultaneously reasonable tactical opportunities, especially under incoming-fire pressure.

IAUS (Infinite-Axis-style Utility System) is therefore integrated as a **Reasoner / Opportunity Selector**, not as the owner of movement or weapons.

## 2. Non-goals

This integration does **not**:

- replace Contact Knowledge;
- replace Tactical Planner / Doctrine;
- replace flank, crossfire, assault, regroup or recovery state machines;
- replace Commitment / Lease;
- replace Operational Arbitration;
- directly write movement or weapon authority;
- evaluate every motion frame and switch to the highest score immediately;
- turn Willform into a utility-only AI framework.

The fixed tactical hierarchy remains authoritative.

## 3. Runtime boundary

```text
World / Perception Facts
        +
Combat Profile
        +
Squad Capability
        ↓
IAUS Utility Reasoner
        ↓
Tactical Opportunity Proposal
        ↓
Tactical Planner / Spatial Solver
        ↓
Committed Response Lease
        ↓
Operational Arbitration
        ↓
Execution Contract
```

The first production use case is incoming-fire pressure. Candidate opportunities are:

- `trade_fire` — deliberately hold the current exchange for a bounded period;
- `reposition` — move to materially different cover geometry;
- `flank` — keep support on the firing line while an available member counter-maneuvers;
- `regroup` — contract / break contact when pressure is distributed across the element;
- `assault` — aggressive closing used by feral/non-human doctrine in this reference slice.

## 4. Infinite axes

Each candidate is composed from independent normalized axes. Examples:

### Trade Fire

- hold-ground bias;
- aggression;
- suppression tolerance;
- current incoming-fire pressure;
- whether a committed tactical geometry already exists;
- low-weight deterministic variation.

### Reposition

- reposition bias;
- incoming-fire pressure;
- pressure band;
- whether current geometry should be released;
- low-weight deterministic variation.

### Flank

- counter-maneuver bias;
- coordination;
- unpinned maneuver capacity;
- pressure as an opportunity signal;
- whether another element can continue support;
- low-weight deterministic variation.

### Regroup / Break Contact

- break-contact bias;
- fraction of the squad under pressure;
- pinned evidence;
- risk aversion;
- low-weight deterministic variation.

Hard capability failures are not expressed as tiny scores. They remove candidates before ranking. For example, a one-person survivor cannot select `flank`.

## 5. Utility aggregation

The reference implementation uses weighted geometric aggregation:

```text
axis input
  ↓ response curve
axis response × axis weight
  ↓
weighted geometric score
  × profile candidate multiplier
  ↓
candidate utility
```

This keeps all considerations relevant without letting the mere number of axes penalize a candidate.

Supported response-curve primitives in the first slice:

- linear;
- inverse;
- smoothstep;
- power;
- threshold.

The curve model is deliberately small and inspectable. More curve types should be added only after Tactical Wizard produces a concrete need.

## 6. IAUS and existing combat style

IAUS must preserve the existing archetype semantics.

### Tactical human

Available under-fire opportunities:

- trade fire;
- reposition;
- flank when another living member exists;
- regroup / break contact.

Pressure-driven `assault` is not enabled merely because it scores well.

### Feral / pack

The reference model does not reinterpret suppression as human fear/cover doctrine. Available pressure responses are:

- flank / encirclement when another member exists;
- assault / aggressive closing.

### Machine

The reference model treats incoming fire as geometry / damage risk. Available pressure responses are intentionally limited to:

- trade fire;
- reposition.

This keeps IAUS from homogenizing different enemy thinking styles.

## 7. Commitment is still mandatory

The winning utility candidate is only a proposal.

Once accepted, the existing response lease remains in force until completion, expiry or hard invalidation. Subsequent bullets may raise pressure, but they do not re-run utility selection and replace geometry every frame.

This preserves the tactical readability already recovered in Tactical Wizard.

## 8. Workbench authoring

The Tactical Wizard Design page exposes IAUS in two layers:

1. existing Combat Profile sliders provide important utility axes such as aggression, suppression tolerance, coordination and counter-maneuver preference;
2. per-candidate multipliers provide a direct way to tune `trade_fire`, `reposition`, `flank`, `regroup` and `assault` without changing the underlying tactical implementation.

The page also provides a live preview scenario for:

- incoming-fire pressure;
- number of pressured squad members;
- current committed tactic.

The preview shows:

- candidate availability / hard gates;
- resulting utility score;
- each axis response;
- selected winner.

The response curves are fixed in this first integration. A general curve graph editor should only be promoted after the Tactical Wizard workflow proves which authoring operations are actually needed.

## 9. Persistence

Tactical Wizard IAUS multipliers remain inside the project `extensions` namespace for now:

- `tacticalWizardUtilityTradeFireWeight`;
- `tacticalWizardUtilityRepositionWeight`;
- `tacticalWizardUtilityFlankWeight`;
- `tacticalWizardUtilityRegroupWeight`;
- `tacticalWizardUtilityAssaultWeight`.

They are not yet generic Schema fields.

This follows the project rule: **Tactical Wizard proves semantics first; Willform generalizes them later.**

## 10. Promotion criteria to Willform Core

The IAUS contract should move toward a portable Reasoner API only after at least these scenarios are validated:

1. elite tactical squad;
2. regular infantry with visibly different pressure response;
3. one non-human mindset;
4. at least one decision domain outside incoming-fire pressure.

A future portable Reasoner contract should likely expose:

```text
Fact Snapshot
  ↓
Reasoner Input
  ↓
Candidate + Considerations + Response Curves
  ↓
Proposal Set + Trace
```

It must still hand proposals to the shared Arbitration / Execution architecture rather than becoming a parallel runtime authority.
