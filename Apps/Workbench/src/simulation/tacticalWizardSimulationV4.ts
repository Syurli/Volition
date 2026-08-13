export * from './tacticalWizardSimulationV16';

import {
  TacticalWizardSimulation as TacticalWizardSimulationV16,
  type TacticalWizardSimulationState,
} from './tacticalWizardSimulationV16';

/** Compatibility entry used by the current Workbench shell. */
export class TacticalWizardSimulation extends TacticalWizardSimulationV16 {
  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }
}
