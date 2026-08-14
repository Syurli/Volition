import { useEffect, useState } from 'react';
import type { Locale } from '../i18n';
import {
  TACTICAL_WIZARD_TEST_LOADOUT_LIMITS,
  normalizeTacticalWizardTestLoadout,
  type TacticalWizardTestLoadout,
} from '../simulation/tacticalWizardTestLoadout';

export function TestLoadoutPanel({ locale, value, onApply }: { readonly locale: Locale; readonly value: TacticalWizardTestLoadout; readonly onApply: (value: TacticalWizardTestLoadout) => void }) {
  const [draft, setDraft] = useState<TacticalWizardTestLoadout>(value);
  const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  useEffect(() => setDraft(value), [value]);
  const dirty = draft.ammoRounds !== value.ammoRounds || draft.grenades !== value.grenades;
  const update = (key: keyof TacticalWizardTestLoadout, next: number) => setDraft((current) => normalizeTacticalWizardTestLoadout({ ...current, [key]: next }));

  return <section className="surface test-loadout-panel">
    <style>{`.test-loadout-panel{display:grid;gap:8px}.test-loadout-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.test-loadout-head strong{color:#d6e2ec}.test-loadout-head p{margin:3px 0 0;color:#7f91a1;font-size:9px;line-height:1.45}.test-loadout-fields{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.test-loadout-fields label{display:grid;gap:4px;color:#8ea0b0;font-size:8px}.test-loadout-fields input{width:92px}.test-loadout-fields button{height:30px}.test-loadout-status{font-size:8px;color:#708294}.test-loadout-status.dirty{color:#d5b472}@media(max-width:860px){.test-loadout-head{display:grid}}`}</style>
    <div className="test-loadout-head"><div><strong>▣ {L('AI 测试默认负载', 'AI Test Default Loadout')}</strong><p>{L('用于战术测试的统一出生/重置装备。应用后会立即重置本次模拟，避免低弹药在测试开场就触发补给行为。', 'Shared spawn/reset equipment for tactical tests. Applying it resets the current run so low ammunition cannot distort the opening behavior.')}</p></div><small className={`test-loadout-status${dirty ? ' dirty' : ''}`}>{dirty ? L('有未应用修改', 'Pending changes') : L('已应用到测试基线', 'Applied to test baseline')}</small></div>
    <div className="test-loadout-fields">
      <label>{L('每名 AI 初始弹药', 'Ammo per AI')}<input type="number" min={TACTICAL_WIZARD_TEST_LOADOUT_LIMITS.ammoRounds.min} max={TACTICAL_WIZARD_TEST_LOADOUT_LIMITS.ammoRounds.max} step={3} value={draft.ammoRounds} onChange={(event) => update('ammoRounds', Number(event.target.value))} /></label>
      <label>{L('每名 AI 投掷物', 'Grenades per AI')}<input type="number" min={TACTICAL_WIZARD_TEST_LOADOUT_LIMITS.grenades.min} max={TACTICAL_WIZARD_TEST_LOADOUT_LIMITS.grenades.max} step={1} value={draft.grenades} onChange={(event) => update('grenades', Number(event.target.value))} /></label>
      <button className="primary-button" disabled={!dirty} onClick={() => onApply(draft)}>{L('应用并重置', 'Apply & Reset')}</button>
    </div>
  </section>;
}
