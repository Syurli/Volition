export * from './tacticalWizardSimulationCurrent';

import {
  TacticalWizardSimulation as TacticalWizardSimulationCurrent,
  type TacticalWizardSimulationState,
} from './tacticalWizardSimulationCurrent';

/** Compatibility entry used by the Workbench shell. Production authority terminates in the current runtime. */
export class TacticalWizardSimulation extends TacticalWizardSimulationCurrent {
  override step(): TacticalWizardSimulationState {
    return this.advance(this.stepSeconds);
  }
}
