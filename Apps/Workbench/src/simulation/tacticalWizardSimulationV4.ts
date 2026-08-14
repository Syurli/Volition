export * from './tacticalWizardSimulationThreatAuthority';

import {
  TacticalWizardSimulation as TacticalWizardSimulationIntegrated,
  type TacticalWizardSimulationState,
} from './tacticalWizardSimulationThreatAuthority';

/** Compatibility entry used by the current Workbench shell. */
export class TacticalWizardSimulation extends TacticalWizardSimulationIntegrated {
  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }
}
