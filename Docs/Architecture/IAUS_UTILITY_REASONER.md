# IAUS Utility Reasoner — Tactical Wizard Integration

> Status: Tactical Wizard reference implementation. IAUS is proven first in the game slice and is not yet a frozen `Packages/Core` contract.

## 1. Role in Willform

Tactical Wizard keeps the fixed production hierarchy:

```text
Perception / Attention
        ↓
Authoritative Facts / Contact Knowledge
        ↓
IAUS Reasoner (opportunity ranking)
        ↓
Tactical Planning (role + geometry ownership)
        ↓
Commitment / Lease
        ↓
Operational Arbitration
        ↓
Execution Contract
        ↓
Host
```

IAUS answers **which tactical opportunity is worth considering now**. It does not answer which agent owns a role, which point the agent moves to, or whether movement / weapon authority is granted.

The first production domain remains incoming-fire pressure. Current tactical actions map to higher-level opportunity semantics:

| Runtime action | Opportunity meaning |
|---|---|
| `trade_fire` | `hold_current_plan` |
| `reposition` | `local_reposition` |
| `flank` | `counter_maneuver` |
| `regroup` | `contract` |
| `assault` | `aggressive_close` |

The action names remain compatible with the Tactical Wizard slice while the opportunity names describe the reusable Reasoner contract we eventually want to promote.

## 2. Non-goals and authority rules

IAUS does **not**:

- replace Contact Knowledge;
- replace Tactical Planner / Doctrine;
- replace flank, crossfire, assault, regroup or recovery state machines;
- assign `role`, `task` or `tacticalTarget` directly;
- replace Commitment / Lease;
- replace Operational Arbitration;
- write movement or weapon authority;
- reselect every motion frame;
- turn Willform into a utility-only framework.

A high Utility score is never execution authority.

## 3. IAUS R2: current-plan-aware utility

The first IAUS integration compared mostly the absolute attractiveness of each response. That made a high-coordination elite profile repeatedly favor `flank`, even when a good Crossfire or Assault was already established.

R2 explicitly prices the **value of what the squad is already doing**.

The Reasoner input now includes planner-owned context when available:

- current tactic;
- current plan progress;
- number of safe fire lanes;
- current geometry quality;
- current tactic age;
- recent committed pressure action;
- age of that action;
- novelty of the current contact geometry versus the previous maneuver.

This produces explicit axes such as:

- `current_plan_value`;
- `plan_progress`;
- `safe_fire_lanes`;
- `switch_permission`;
- `current_plan_release`;
- `repeat_geometry_novelty`.

The intent is not to hard-code “Crossfire always wins.” A healthy, nearly complete Crossfire should be expensive to abandon under ordinary suppression, while pinned pressure, distributed pressure, casualty loss or invalid geometry can still overcome that switching cost.

## 4. Infinite axes and aggregation

Each candidate is composed from independent normalized axes, transformed by small inspectable response curves and aggregated with weighted geometric scoring.

```text
fact / profile input
        ↓
response curve
        ↓
axis response × axis weight
        ↓
weighted geometric score
        × candidate profile multiplier
        ↓
candidate utility
```

Supported curve primitives remain deliberately small:

- linear;
- inverse;
- smoothstep;
- power;
- threshold.

Hard capability failures remain outside score competition. A single survivor cannot select `flank`; an unavailable candidate is removed rather than assigned a tiny score.

## 5. Tactical Planner is the single owner of roles and geometry

R2 removes the adaptive layer's previous post-planner writes to `role`, `task` and `tacticalTarget`.

The sequence is now:

```text
IAUS ranking
   ↓
Candidate #1
   ↓
Tactical Planner
   ├─ assigns canonical role owner
   ├─ generates canonical tactical target
   ├─ validates path and displacement
   └─ returns planner result
        ↓ accepted
Response Lease
```

If the planner rejects the first candidate, the Reasoner may offer the next ranked candidate. The adaptive layer never creates a second flanker beside the planner's flanker.

For the current Tactical Wizard slice, `local_reposition` is mapped through existing regroup positioning so that the Tactical Planner still owns the geometry. A dedicated local-reposition planner can be added later if repeated game validation proves it necessary; it must still obey the same single-owner rule.

## 6. Geometry acceptance and zero-displacement protection

A `counter_maneuver` / `flank` proposal is accepted only if Tactical Planning produces exactly one canonical living flanker and valid new geometry.

Current validation includes:

- exactly one `flanker / flank_to_cover` owner;
- non-null tactical target;
- reachable path;
- minimum planned displacement of 2.75 world units;
- meaningful flank-angle gain, unless displacement itself is strong enough to represent materially new geometry;
- recent-flank novelty checks when the contact has barely moved.

A planner result that leaves the flanker at its current point is rejected. IAUS then considers the next candidate instead of committing a visually stationary “flank.”

## 7. Repetition memory

A recent `flank` is not permanently forbidden. Instead R2 applies a short memory window.

When the last committed response was a flank and the target/contact geometry has barely changed, `repeat_geometry_novelty` reduces the next flank's Utility. As time passes or the target meaningfully relocates, the penalty naturally disappears.

This prevents `Crossfire → Flank → Crossfire → Flank` loops without converting the system back into rigid cooldown scripting.

## 8. Commitment and progress-driven release

The winning planner result still becomes a bounded lease. Ordinary additional bullets can increase pressure but cannot replace that lease every frame.

R2 keeps the hard timeout and adds soft completion semantics:

- `trade_fire` may release early after pressure is stably low for a short window;
- reposition releases when the planner target is reached;
- other geometry responses may release after their goal is complete and pressure has remained stable;
- Recovery, member loss, invalid world geometry or incompatible tactic transitions can still hard-invalidate the lease.

This makes Commitment mean “finish the purpose when it remains valid,” rather than “blindly wait N ticks.”

## 9. Two-stage trace

A pressure decision is now observable as two stages:

```text
Reasoner
  flank 0.91
  trade_fire 0.76
  reposition 0.63
        ↓
Planner
  flank rejected: flank_displacement_below_minimum
        ↓
Planner
  trade_fire accepted: hold_current_plan
        ↓
Lease committed
```

`adaptiveCombat.lastPlannerTrace` records:

- decision tick and source;
- current tactic;
- plan progress;
- safe fire lanes;
- geometry quality;
- IAUS winner;
- all candidate scores;
- each planner attempt;
- rejection reason;
- planner revision;
- chosen maneuver owner/target;
- target displacement / flank-angle gain where relevant;
- finally committed action.

This separates “Reasoner preferred the wrong thing” from “Planner could not find valid geometry.”

## 10. Active response versus last decision

`adaptiveCombat.tacticalAction` now means **active lease only**.

When no pressure lease is active:

```text
adaptiveCombat.tacticalAction = none
adaptiveCombat.activeResponseLease = null
```

Historical diagnostics are exposed separately through:

- `lastTacticalAction`;
- `lastTacticalActionReason`;
- `lastTacticalActionTick`;
- `lastPlannerTrace`.

The Workbench therefore no longer presents an old `FLANK` decision as if it were still executing after pressure and the lease are gone.

## 11. Attention authority

Confirmed visual contact is the highest-priority attention fact in the adaptive view. A visible agent publishes:

```text
mode = track_visual
anchor = current confirmed contact
lookTarget = current confirmed contact
```

An old acoustic investigation may remain in historical perception state, but it cannot be presented as the active gaze anchor while the agent is directly tracking the player.

## 12. Observation purity

`TacticalWizardAdaptiveSimulation.getState()` is an observation-only operation.

State reads do not:

- apply formation roles;
- update pressure bands;
- maintain / release leases;
- rebuild planner geometry;
- increment counters;
- append logs.

Behavior mutation occurs only in explicit runtime/control paths such as `advance`, player combat inputs, test injections, reset, profile changes and world invalidation. UI polling frequency therefore cannot change AI behavior.

## 13. Workbench authoring

The Tactical Wizard Design page continues to expose:

1. combat profile axes such as aggression, suppression tolerance, coordination and counter-maneuver preference;
2. per-candidate IAUS multipliers;
3. a live pressure preview showing availability, score, axes and winner.

Response curves remain fixed in this slice. A general curve editor should be promoted only after Tactical Wizard proves which authoring operations are repeatedly needed.

## 14. Persistence

Tactical Wizard IAUS multipliers remain inside project `extensions`:

- `tacticalWizardUtilityTradeFireWeight`;
- `tacticalWizardUtilityRepositionWeight`;
- `tacticalWizardUtilityFlankWeight`;
- `tacticalWizardUtilityRegroupWeight`;
- `tacticalWizardUtilityAssaultWeight`.

They are not generic Schema fields yet.

## 15. Promotion criteria to Willform Core

A portable IAUS / Utility Reasoner contract should be promoted only after at least:

1. elite tactical squad;
2. regular infantry with visibly different pressure response;
3. one non-human mindset;
4. one decision domain outside incoming-fire pressure.

The likely portable boundary remains:

```text
Fact Snapshot
    ↓
Reasoner Input
    ↓
Candidates + Considerations + Curves
    ↓
Proposal Set + Reasoner Trace
    ↓
Domain Planner
    ↓
Planner Result / Rejection Trace
    ↓
Shared Arbitration + Execution
```

The key Willform rule is unchanged: **Reasoners propose; planners make domain plans; arbitration decides ownership; Execution Contract is the final authority.**
