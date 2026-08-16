import type { WillformProjectConfig } from '@willform/schema';

export type TacticalWizardMindset = 'tactical_human' | 'feral' | 'machine';

export interface TacticalWizardCombatProfile {
  readonly id: string;
  readonly displayName: string;
  readonly displayNameZh: string;
  readonly mindset: TacticalWizardMindset;
  readonly aggression: number;
  readonly suppressionTolerance: number;
  readonly flankBias: number;
  readonly repositionBias: number;
  readonly coordination: number;
}

export const TACTICAL_WIZARD_COMBAT_PROFILES: readonly TacticalWizardCombatProfile[] = [
  {
    id: 'elite_squad',
    displayName: 'Elite Tactical Squad',
    displayNameZh: '精英战术小队',
    mindset: 'tactical_human',
    aggression: 0.82,
    suppressionTolerance: 0.68,
    flankBias: 0.86,
    repositionBias: 0.78,
    coordination: 0.95,
  },
  {
    id: 'regular_infantry',
    displayName: 'Regular Infantry',
    displayNameZh: '普通士兵',
    mindset: 'tactical_human',
    aggression: 0.58,
    suppressionTolerance: 0.46,
    flankBias: 0.45,
    repositionBias: 0.66,
    coordination: 0.62,
  },
  {
    id: 'irregular_fighter',
    displayName: 'Low-Training Fighter',
    displayNameZh: '低训练敌人',
    mindset: 'tactical_human',
    aggression: 0.7,
    suppressionTolerance: 0.28,
    flankBias: 0.22,
    repositionBias: 0.54,
    coordination: 0.26,
  },
  {
    id: 'feral_pack',
    displayName: 'Feral Pack Prototype',
    displayNameZh: '兽群原型',
    mindset: 'feral',
    aggression: 0.88,
    suppressionTolerance: 0.2,
    flankBias: 0.78,
    repositionBias: 0.9,
    coordination: 0.44,
  },
  {
    id: 'combat_machine',
    displayName: 'Combat Machine',
    displayNameZh: '战斗机械',
    mindset: 'machine',
    aggression: 0.74,
    suppressionTolerance: 0.92,
    flankBias: 0.34,
    repositionBias: 0.42,
    coordination: 0.84,
  },
] as const;

export const DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE = TACTICAL_WIZARD_COMBAT_PROFILES[0]!;

export function tacticalWizardCombatProfileFromConfig(config: WillformProjectConfig): TacticalWizardCombatProfile {
  return tacticalWizardCombatProfileFromExtensions(config.extensions);
}

export function tacticalWizardCombatProfileFromExtensions(extensions: WillformProjectConfig['extensions']): TacticalWizardCombatProfile {
  const raw = (extensions ?? {}) as Readonly<Record<string, unknown>>;
  const presetId = typeof raw.tacticalWizardProfileId === 'string' ? raw.tacticalWizardProfileId : DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE.id;
  const preset = TACTICAL_WIZARD_COMBAT_PROFILES.find((entry) => entry.id === presetId) ?? DEFAULT_TACTICAL_WIZARD_COMBAT_PROFILE;
  return {
    ...preset,
    aggression: numberField(raw.tacticalWizardAggression, preset.aggression),
    suppressionTolerance: numberField(raw.tacticalWizardSuppressionTolerance, preset.suppressionTolerance),
    flankBias: numberField(raw.tacticalWizardFlankBias, preset.flankBias),
    repositionBias: numberField(raw.tacticalWizardRepositionBias, preset.repositionBias),
    coordination: numberField(raw.tacticalWizardCoordination, preset.coordination),
    mindset: mindsetField(raw.tacticalWizardMindset, preset.mindset),
  };
}

export function tacticalWizardProfileExtensions(profile: TacticalWizardCombatProfile): Readonly<Record<string, string | number>> {
  return {
    tacticalWizardProfileId: profile.id,
    tacticalWizardMindset: profile.mindset,
    tacticalWizardAggression: profile.aggression,
    tacticalWizardSuppressionTolerance: profile.suppressionTolerance,
    tacticalWizardFlankBias: profile.flankBias,
    tacticalWizardRepositionBias: profile.repositionBias,
    tacticalWizardCoordination: profile.coordination,
  };
}

function numberField(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : fallback;
}

function mindsetField(value: unknown, fallback: TacticalWizardMindset): TacticalWizardMindset {
  return value === 'tactical_human' || value === 'feral' || value === 'machine' ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
