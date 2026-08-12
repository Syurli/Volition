import { tacticalWizardProjectConfig } from '@volition/example-tactical-wizard';
import type { BehaviorDefinition, VolitionProjectConfig } from '@volition/schema';

const extraTactics: readonly BehaviorDefinition[] = [
  { id: 'tactic:crossfire', displayName: 'Establish Crossfire', scope: 'squad', hostBehaviorRef: 'reference.squad.crossfire', description: 'Two maneuver elements establish opposing firing sectors before an assault.', requiredCapabilities: [] },
  { id: 'tactic:sweep', displayName: 'Sector Sweep', scope: 'squad', hostBehaviorRef: 'reference.squad.sweep', description: 'After visual loss, search separated sectors around the Last Known Position without reading hidden live coordinates.', requiredCapabilities: [] },
];

export const tacticalWizardWorkbenchConfig: VolitionProjectConfig = (() => {
  const base = structuredClone(tacticalWizardProjectConfig);
  const behaviors = [...(base.behaviors ?? [])];
  for (const tactic of extraTactics) if (!behaviors.some((entry) => entry.id === tactic.id)) behaviors.push(tactic);
  return {
    ...base,
    behaviors,
    squads: (base.squads ?? []).map((squad) => squad.id === 'twr:rifle-squad-01'
      ? { ...squad, behaviorIds: ['tactic:bounding', 'tactic:flank', 'tactic:crossfire', 'tactic:assault', 'tactic:sweep', 'tactic:regroup'] }
      : squad),
  };
})();
