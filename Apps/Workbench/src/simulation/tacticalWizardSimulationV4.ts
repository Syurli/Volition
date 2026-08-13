export * from './tacticalWizardSimulationV17';

import {
  TacticalWizardSimulation as TacticalWizardSimulationV17,
  type TacticalWizardSimulationState,
} from './tacticalWizardSimulationV17';

/** Compatibility entry used by the current Workbench shell. */
export class TacticalWizardSimulation extends TacticalWizardSimulationV17 {
  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }
}
