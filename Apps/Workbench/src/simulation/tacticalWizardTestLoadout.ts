export interface TacticalWizardTestLoadout {
  readonly ammoRounds: number;
  readonly grenades: number;
}

export const DEFAULT_TACTICAL_WIZARD_TEST_LOADOUT: TacticalWizardTestLoadout = {
  ammoRounds: 120,
  grenades: 3,
};

export const TACTICAL_WIZARD_TEST_LOADOUT_LIMITS = {
  ammoRounds: { min: 0, max: 120 },
  grenades: { min: 0, max: 5 },
} as const;

interface LoadoutTarget {
  getState(): { readonly agents: readonly { readonly id: string }[] };
  setAgentEquipment(agentId: string, values: { readonly ammoRounds?: number; readonly grenades?: number }): boolean;
}

export function normalizeTacticalWizardTestLoadout(value: Partial<TacticalWizardTestLoadout>): TacticalWizardTestLoadout {
  return {
    ammoRounds: clampInteger(value.ammoRounds ?? DEFAULT_TACTICAL_WIZARD_TEST_LOADOUT.ammoRounds, TACTICAL_WIZARD_TEST_LOADOUT_LIMITS.ammoRounds.min, TACTICAL_WIZARD_TEST_LOADOUT_LIMITS.ammoRounds.max),
    grenades: clampInteger(value.grenades ?? DEFAULT_TACTICAL_WIZARD_TEST_LOADOUT.grenades, TACTICAL_WIZARD_TEST_LOADOUT_LIMITS.grenades.min, TACTICAL_WIZARD_TEST_LOADOUT_LIMITS.grenades.max),
  };
}

export function applyTacticalWizardTestLoadout(target: LoadoutTarget, value: TacticalWizardTestLoadout): boolean {
  const loadout = normalizeTacticalWizardTestLoadout(value);
  return target.getState().agents.every((agent) => target.setAgentEquipment(agent.id, loadout));
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
