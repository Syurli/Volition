# Tactical Wizard Current Runtime

The Workbench has one production simulation version: `tacticalWizardSimulationCurrent.ts`.

`tacticalWizardSimulationV4.ts` is now a compatibility entry only. Historical `tacticalWizardSimulationV*.ts` files remain in the repository because they contain deterministic regression fixtures and proven mechanics, but they are frozen as compatibility substrate. They are not a place to add new production behavior or another independent decision authority.

## Rules

1. Do not add `V19`, `V20`, or another version-number behavior layer.
2. New production behavior enters the Current Runtime or a domain-named module composed by the Current Runtime.
3. One domain has one final authority. Recovery safety, perception/threat association, tactical opportunity selection, and execution ownership must not be independently re-decided by multiple historical layers.
4. Historical Vxx tests stay green while behavior is migrated. Their purpose is regression protection, not version selection.
5. The Workbench production entry must expose the Current Runtime state contract, including `recoverySafety.runtimeVersion === 'current'`.
6. A future mechanical cleanup may flatten/remove frozen Vxx substrate only after equivalent Current Runtime/domain tests exist; that cleanup must not change gameplay behavior in the same change.

## Current recovery ownership

Recovery is now reconciled at the Current Runtime boundary:

- rescue role selection prefers a combat-capable security element when the medical-role constraints allow it;
- stage/treatment/security geometry is committed atomically at rescue start;
- friendly-blocked security lanes invalidate the actual current security point and temporarily exclude that failed geometry;
- security readiness distinguishes position, LOS, friendly fire lane, weapon readiness, and hard reaction readiness;
- sustained near-miss/fire pressure can pause or abort recovery when effective security cannot be provided;
- a downed casualty blocking a lane remains a non-replan case;
- soft dodge/smoke reactions do not regain authority over an otherwise valid committed recovery;
- pending recoverable casualties gate lower-priority field logistics so rescue start does not churn assign/preempt cycles.

This file is the architecture guardrail for the Tactical Wizard reference. New code should use domain names and Current Runtime ownership rather than adding another historical version layer.
