export * from './tacticalWizardSimulationIntegrated';

import {
  TacticalWizardSimulation as TacticalWizardSimulationIntegrated,
  type TacticalWizardSimulationState,
} from './tacticalWizardSimulationIntegrated';

/** Compatibility entry used by the current Workbench shell. */
export class TacticalWizardSimulation extends TacticalWizardSimulationIntegrated {
  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }
}
