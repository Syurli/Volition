# Tactical Combat AI V8.1 — Mobile Commander & Proactive Logistics

## Why this revision exists

The T411 Workbench run exposed a regression after command hierarchy and equipment logistics were added on top of the V7 combat host.

The commander identity had effectively become a permanent spatial role: Alpha was repeatedly forced into the suppressor / support slot, while Bravo and Charlie inherited most maneuver responsibility. In a long engagement this created two visible failures:

1. command identity reduced tactical role rotation;
2. a depleted commander could remain in the base-of-fire position even after it stopped contributing useful fire.

The pre-command V7 behavior was stronger because role ownership rotated with the tactical plan. V8.1 restores that agency while keeping command identity and resource planning.

## Design principle

> Commander is an information / coordination responsibility, not a permanent tactical slot.

`commandRank` and tactical `role` are independent concepts.

Alpha remains the commander for squad-level decisions and logistics language, but may currently execute:

- suppressor / support;
- mover;
- flanker;
- crossfire;
- assaulter;
- sweeper / search responsibility.

The tactical slot follows the current plan. Command identity follows the Agent.

This preserves deterministic plans without turning the commander into a scripted turret.

## Dynamic fire-support handoff

The current base-of-fire is monitored as a capability, not as an ownership privilege.

A handoff may occur when:

- the current suppressor has fewer than one rifle burst remaining;
- the commander is low on ammunition and another member can assume the lane;
- the commander has remained stationary for several seconds without direct visual while another member owns visual contact;
- the commander's support position has remained stale for too long during active contact;
- the current suppressor needs to detach for field resupply.

A replacement is selected from combat-ready members with a bias toward:

1. direct visual contact;
2. the current mover, so the outgoing anchor inherits a real maneuver slot;
3. an already useful support / crossfire task;
4. higher remaining ammunition.

After handoff the normal V7 role and tactical-position planners are run again. No new navigation or cover logic is added to Portable Core.

## Ammunition budget

Rifle fire remains modeled as a three-round abstract burst.

Reference thresholds:

- initial ammunition: `96` rounds = `32` bursts;
- capacity: `120` rounds;
- planning reserve: `42` rounds = `14` bursts;
- low reserve: `30` rounds = `10` bursts;
- critical reserve: `12` rounds = `4` bursts.

Crossing the planning reserve is recorded in Run Log. A member does not necessarily leave combat immediately: direct visual ownership and current tactic are considered first.

At low / critical reserve, resupply is allowed when the remaining squad can preserve combat capability. If the departing Agent owns base-of-fire, support is handed off before the detachment begins.

Critical ammunition is allowed to use any reachable compatible supply cache; planned non-critical combat resupply prefers caches within the active-combat path budget.

Only one member detaches for resupply at a time.

## Relation to F.E.A.R.-style design goals

The intended lesson is not to copy a particular F.E.A.R. behavior tree or encounter script. The useful principle is dynamic task composition:

- goals and tactical responsibilities are stable concepts;
- the Agent owning a responsibility can change;
- changing world state invalidates an old assignment;
- the system replans instead of replaying choreography;
- communication and visible role changes make the intelligence legible to the player.

For Volition this means preferring `role handoff + plan rebuild` over special-case scripted sequences.

## Diagnostics

V8.1 Run Log adds equipment and command diagnostics to Agent events:

- `commandRank`;
- `ammoRounds`;
- `burstsRemaining`;
- `logisticsTask`;
- `resupplyTargetId`.

Exported run snapshots also include:

- command state;
- support handoff count;
- commander stationary time;
- supply caches;
- Agent ammunition / grenades / active logistics target.

The next regression log should therefore distinguish:

- cannot fire because of geometry;
- cannot fire because of a friendly fire lane;
- cannot fire because ammunition is exhausted;
- temporarily not firing because the Agent is detached for resupply.

## Regression expectations

The Workbench test suite now requires:

1. Alpha remains commander but is observed in maneuver-capable tactical roles;
2. an empty suppressor hands base-of-fire to another combat-ready member;
3. commander ammunition can trigger a pre-exhaustion resupply handoff;
4. commander completes field resupply and returns to the tactical plan;
5. the former T411 symptom — Alpha remaining parked for the rest of a long static engagement — does not return;
6. the existing anti-choreography doctrine regression remains active.

## Architecture boundary

Everything in this revision remains Simulation Host / reference-application behavior.

Volition Portable Core still does **not** own:

- map geometry;
- A* / NavMesh;
- cover discovery;
- line of sight;
- supply placement;
- physical movement.

Production engine bridges may replace those Host services while retaining the command, resource and task semantics.
