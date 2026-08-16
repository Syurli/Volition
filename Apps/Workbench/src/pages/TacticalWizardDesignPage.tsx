import type { WillformProjectConfig } from '@willform/schema';
import type { Locale, Translate } from '../i18n';
import type { WorkbenchProject } from '../projects';
import {
  TACTICAL_WIZARD_COMBAT_PROFILES,
  tacticalWizardCombatProfileFromConfig,
  tacticalWizardProfileExtensions,
  type TacticalWizardCombatProfile,
} from '../simulation/tacticalWizardProfiles';
import { DesignPage as BaseDesignPage } from './DesignWorkspacePage';

interface Props {
  readonly t: Translate;
  readonly locale: Locale;
  readonly config: WillformProjectConfig;
  readonly setConfig: (config: WillformProjectConfig) => void;
  readonly project: WorkbenchProject;
  readonly onSave: () => void;
  readonly onReset: () => void;
}

type NumericProfileKey = 'aggression' | 'suppressionTolerance' | 'flankBias' | 'repositionBias' | 'coordination';

/** Tactical Wizard first: expose game-proven enemy differentiation before promoting fields into generic Schema. */
export function TacticalWizardDesignPage(props: Props) {
  const L = (zh: string, en: string) => props.locale === 'zh-CN' ? zh : en;
  const profile = tacticalWizardCombatProfileFromConfig(props.config);
  const applyProfile = (next: TacticalWizardCombatProfile) => {
    props.setConfig({
      ...props.config,
      extensions: {
        ...(props.config.extensions ?? {}),
        ...tacticalWizardProfileExtensions(next),
      },
    });
  };
  const setNumeric = (key: NumericProfileKey, value: number) => applyProfile({ ...profile, [key]: clamp01(value) });

  return <div className="page-stack">
    <section className="surface tw-profile-authoring">
      <style>{PROFILE_STYLE}</style>
      <header className="tw-profile-head">
        <div>
          <strong>{L('战术巫师 · 敌人原型与战斗性格', 'Tactical Wizard · Enemy Archetype & Combat Profile')}</strong>
          <p>{L('这些字段先服务《战术巫师》并写入项目 extensions；等精英、普通敌人与非人类原型验证稳定后，再决定哪些语义晋升为能动通用 Schema。', 'These fields are Tactical Wizard-first project extensions. Only semantics proven across elite, ordinary and non-human enemies should later graduate into the generic Willform schema.')}</p>
        </div>
        <span>{L('当前', 'Current')} · {props.locale === 'zh-CN' ? profile.displayNameZh : profile.displayName}</span>
      </header>

      <div className="tw-profile-presets">
        {TACTICAL_WIZARD_COMBAT_PROFILES.map((preset) => <button key={preset.id} className={profile.id === preset.id ? 'active' : ''} onClick={() => applyProfile(preset)}>
          <b>{props.locale === 'zh-CN' ? preset.displayNameZh : preset.displayName}</b>
          <small>{mindsetLabel(preset.mindset, props.locale)}</small>
        </button>)}
      </div>

      <div className="tw-profile-grid">
        <ProfileSlider label={L('进攻性', 'Aggression')} hint={L('压力下仍愿意维持交火/推进的倾向。', 'Willingness to keep fighting or advance under pressure.')} value={profile.aggression} onChange={(value) => setNumeric('aggression', value)} />
        <ProfileSlider label={L('压制容忍', 'Suppression tolerance')} hint={L('越高越不容易因来火改变战术。', 'Higher values tolerate incoming fire before changing tactics.')} value={profile.suppressionTolerance} onChange={(value) => setNumeric('suppressionTolerance', value)} />
        <ProfileSlider label={L('绕后倾向', 'Flank bias')} hint={L('火力线被固定后，选择侧翼机动的偏好。', 'Preference for leaving the saturated line and seeking a flank.')} value={profile.flankBias} onChange={(value) => setNumeric('flankBias', value)} />
        <ProfileSlider label={L('换位倾向', 'Reposition bias')} hint={L('原射击几何失去价值时主动换点。', 'Tendency to abandon stale firing geometry for a new position.')} value={profile.repositionBias} onChange={(value) => setNumeric('repositionBias', value)} />
        <ProfileSlider label={L('协同程度', 'Coordination')} hint={L('角色轮换、互相掩护和小队级响应的完整度。', 'How strongly the archetype relies on role handoff and squad coordination.')} value={profile.coordination} onChange={(value) => setNumeric('coordination', value)} />
        <div className="tw-profile-mindset"><small>{L('思维模型', 'Mindset')}</small><b>{mindsetLabel(profile.mindset, props.locale)}</b><p>{mindsetDescription(profile.mindset, props.locale)}</p></div>
      </div>
    </section>
    <BaseDesignPage {...props} />
  </div>;
}

function ProfileSlider({ label, hint, value, onChange }: { readonly label: string; readonly hint: string; readonly value: number; readonly onChange: (value: number) => void }) {
  return <label className="tw-profile-slider"><span><b>{label}</b><em>{Math.round(value * 100)}</em></span><input type="range" min={0} max={1} step={0.01} value={value} onChange={(event) => onChange(Number(event.target.value))} /><small>{hint}</small></label>;
}

function mindsetLabel(mindset: TacticalWizardCombatProfile['mindset'], locale: Locale): string {
  if (locale !== 'zh-CN') return mindset === 'tactical_human' ? 'Tactical human' : mindset === 'feral' ? 'Feral / pack' : 'Machine logic';
  return mindset === 'tactical_human' ? '战术人类' : mindset === 'feral' ? '兽群 / 非人类' : '机械逻辑';
}

function mindsetDescription(mindset: TacticalWizardCombatProfile['mindset'], locale: Locale): string {
  if (locale !== 'zh-CN') {
    if (mindset === 'feral') return 'Pressure is converted into evasive encirclement or aggressive closing rather than human cover doctrine.';
    if (mindset === 'machine') return 'Incoming fire is treated as geometry / damage risk, with very high tolerance for direct exchanges.';
    return 'Uses human fire-and-maneuver semantics: trade, reposition, flank or regroup according to pressure.';
  }
  if (mindset === 'feral') return '不把“压制”理解为人类恐惧，而把危险火线转化为闪避包抄或强行逼近。';
  if (mindset === 'machine') return '把来火主要理解为结构损伤与几何风险，对直接换血拥有很高容忍。';
  return '使用人类火力与机动语义：继续对枪、换位、绕后或收缩由压力与性格共同决定。';
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

const PROFILE_STYLE = `
.tw-profile-authoring{display:grid;gap:12px}.tw-profile-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.tw-profile-head strong{font-size:12px;color:#d3dde6}.tw-profile-head p{max-width:760px;margin:5px 0 0;color:#7d8f9f;font-size:9px;line-height:1.55}.tw-profile-head>span{white-space:nowrap;padding:5px 8px;border:1px solid #304250;border-radius:6px;color:#a8bac9;font-size:8px}.tw-profile-presets{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.tw-profile-presets button{display:grid;gap:3px;text-align:left;padding:9px;border:1px solid #263744;border-radius:7px;background:#0d151c;color:#9fb0bf}.tw-profile-presets button:hover,.tw-profile-presets button.active{border-color:#607d92;background:#111e27;color:#d7e2ea}.tw-profile-presets b{font-size:9px}.tw-profile-presets small{font-size:7px;color:#6f8595}.tw-profile-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.tw-profile-slider,.tw-profile-mindset{display:grid;gap:5px;padding:9px;border:1px solid #243440;border-radius:7px;background:#0b1218}.tw-profile-slider span{display:flex;justify-content:space-between;gap:8px}.tw-profile-slider b,.tw-profile-mindset b{font-size:9px;color:#b9c8d3}.tw-profile-slider em{font-style:normal;font-size:8px;color:#83a9c0}.tw-profile-slider small,.tw-profile-mindset small,.tw-profile-mindset p{font-size:7.5px;color:#718493;line-height:1.45}.tw-profile-mindset p{margin:0}@media(max-width:1100px){.tw-profile-presets{grid-template-columns:repeat(2,minmax(0,1fr))}.tw-profile-grid{grid-template-columns:1fr 1fr}}@media(max-width:760px){.tw-profile-head{display:grid}.tw-profile-presets,.tw-profile-grid{grid-template-columns:1fr}}
`;
