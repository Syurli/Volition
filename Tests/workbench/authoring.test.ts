import { describe, expect, it } from 'vitest';
import { validateProjectConfig } from '@volition/schema';
import { localizedAssetName, localizedRole, localizedTactic } from '../../Apps/Workbench/src/assetLocalization';
import { tacticalWizardWorkbenchConfig } from '../../Apps/Workbench/src/referenceProjectConfig';

describe('Workbench V3 authoring assets', () => {
  it('keeps the complete Tactical Wizard module library schema-valid', () => {
    const result = validateProjectConfig(tacticalWizardWorkbenchConfig);
    expect(result.valid).toBe(true);
    expect(tacticalWizardWorkbenchConfig.agents).toHaveLength(3);
    expect(tacticalWizardWorkbenchConfig.squads?.[0]?.behaviorIds).toEqual([
      'tactic:bounding', 'tactic:flank', 'tactic:crossfire', 'tactic:assault', 'tactic:sweep', 'tactic:regroup',
    ]);
  });

  it('switches user-facing tactical assets to Chinese without changing stable ids', () => {
    expect(localizedAssetName('twr:rifle-squad:alpha', 'Alpha Rifleman', 'zh-CN')).toBe('阿尔法步枪手');
    expect(localizedAssetName('twr:rifle-squad:alpha', 'Alpha Rifleman', 'en-US')).toBe('Alpha Rifleman');
    expect(localizedAssetName('tactic:crossfire', 'Establish Crossfire', 'zh-CN')).toBe('建立交叉火力');
    expect(localizedTactic('sweep', 'zh-CN')).toBe('分区搜索');
    expect(localizedRole('assaulter', 'zh-CN')).toBe('突击手');
  });
});
