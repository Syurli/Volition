export * from './tacticalWizardSimulationV18';

import {
  TacticalWizardSimulation as TacticalWizardSimulationV18,
  type TacticalWizardSimulationState,
} from './tacticalWizardSimulationV18';

/** Compatibility entry used by the current Workbench shell. */
export class TacticalWizardSimulation extends TacticalWizardSimulationV18 {
  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }
}
