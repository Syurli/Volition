import { useMemo, useState } from 'react';
import type { WillformProjectConfig } from '@willform/schema';
import type { Locale, Translate } from '../i18n';
import type { WorkbenchProject } from '../projects';
import { evaluatePressureUtilities, type FirePressureBand, type PressureTacticalAction } from '../simulation/incomingFirePressure';
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

type NumericProfileKey = 'aggression' | 'suppressionTolerance' | 'flankBias' | 'repositionBias' | 'coordination' | 'holdGroundBias' | 'counterManeuverBias' | 'breakContactBias';
type UtilityWeightKey = 'utilityTradeFireWeight' | 'utilityRepositionWeight' | 'utilityFlankWeight' | 'utilityRegroupWeight' | 'utilityAssaultWeight';

/** Tactical Wizard first: expose game-proven enemy differentiation before promoting fields into generic Schema. */
export function TacticalWizardDesignPage(props: Props) {
  const L = (zh: string, en: string) => props.locale === 'zh-CN' ? zh : en;
  const profile = tacticalWizardCombatProfileFromConfig(props.config);
  const [previewPressure, setPreviewPressure] = useState(0.72);
  const [previewPressuredCount, setPreviewPressuredCount] = useState(1);
  const [previewTactic, setPreviewTactic] = useState('bounding');
  const previewBand: FirePressureBand = previewPressure >= 0.82 ? 'pinned' : previewPressure >= 0.58 ? 'suppressed' : previewPressure >= 0.3 ? 'pressured' : 'stable';
  const utilityPreview = useMemo(() => evaluatePressureUtilities({
    band: previewBand,
    pressure: previewPressure,
    pressuredAgentId: 'preview-agent',
    livingCount: 3,
    pressuredCount: previewPressuredCount,
    currentTactic: previewTactic,
    profile,
    roll: 0.5,
  }), [previewBand, previewPressure, previewPressuredCount, previewTactic, profile]);

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
  const setUtilityWeight = (key: UtilityWeightKey, value: number) => applyProfile({ ...profile, [key]: clampUtilityWeight(value) });

  return <div className="page-stack">
    <section className="surface tw-profile-authoring">
      <style>{PROFILE_STYLE}</style>
      <header className="tw-profile-head">
        <div>
          <strong>{L('战术巫师 · 敌人原型与战斗性格', 'Tactical Wizard · Enemy Archetype & Combat Profile')}</strong>
          <p>{L('参数仍优先服务《战术巫师》。IAUS 只负责在可用的战术机会之间评分；既有的战术承诺、租约、Operational Arbitration 与 Execution Contract 不变。', 'These remain Tactical Wizard-first parameters. IAUS only ranks available tactical opportunities; existing commitment, leases, operational arbitration and execution contracts remain authoritative.')}</p>
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
        <ProfileSlider label={L('进攻性', 'Aggression')} hint={L('总体上愿意维持交火与推进的程度。', 'General willingness to keep fighting and advancing.')} value={profile.aggression} onChange={(value) => setNumeric('aggression', value)} />
        <ProfileSlider label={L('压制容忍', 'Suppression tolerance')} hint={L('决定进入受压、被压制和钉死状态的阈值。', 'Shifts the thresholds for pressured, suppressed and pinned states.')} value={profile.suppressionTolerance} onChange={(value) => setNumeric('suppressionTolerance', value)} />
        <ProfileSlider label={L('普通绕后倾向', 'Normal flank bias')} hint={L('正常战术窗口中选择侧翼机动的偏好，不直接决定受压反应。', 'Preference for normal flank opportunities; it does not directly select pressure responses.')} value={profile.flankBias} onChange={(value) => setNumeric('flankBias', value)} />
        <ProfileSlider label={L('换位能力倾向', 'Reposition bias')} hint={L('当前射击几何失去价值时主动寻找明显不同位置的倾向。', 'Preference for materially different firing geometry when the current position loses value.')} value={profile.repositionBias} onChange={(value) => setNumeric('repositionBias', value)} />
        <ProfileSlider label={L('协同程度', 'Coordination')} hint={L('角色分工、互相掩护和小队级行动的纪律性。', 'Discipline of role assignment, mutual support and squad-level action.')} value={profile.coordination} onChange={(value) => setNumeric('coordination', value)} />
        <ProfileSlider label={L('坚守 / 对枪倾向', 'Hold-ground bias')} hint={L('受到压力后仍短时维持当前火力交换的意愿。', 'Willingness to keep the current exchange for a bounded lease under pressure.')} value={profile.holdGroundBias} onChange={(value) => setNumeric('holdGroundBias', value)} />
        <ProfileSlider label={L('反机动倾向', 'Counter-maneuver bias')} hint={L('火力线被固定后，让未被压住的成员承担侧翼/反机动的倾向。', 'Preference for assigning an unpinned member to a counter-maneuver while another element is fixed.')} value={profile.counterManeuverBias} onChange={(value) => setNumeric('counterManeuverBias', value)} />
        <ProfileSlider label={L('脱离接触倾向', 'Break-contact bias')} hint={L('多人同时被压住时选择收缩、脱离或烟幕撤离的倾向。', 'Preference for contracting or breaking contact when pressure is distributed across the element.')} value={profile.breakContactBias} onChange={(value) => setNumeric('breakContactBias', value)} />
        <div className="tw-profile-mindset"><small>{L('思维模型', 'Mindset')}</small><b>{mindsetLabel(profile.mindset, props.locale)}</b><p>{mindsetDescription(profile.mindset, props.locale)}</p></div>
      </div>

      <section className="tw-iaus-panel">
        <header className="tw-iaus-head">
          <div><small>IAUS · Infinite-Axis Utility Reasoner</small><strong>{L('战术机会评分', 'Tactical Opportunity Ranking')}</strong><p>{L('现阶段使用固定、可解释的响应曲线，把“环境事实 × 战斗性格 × 小队能力”转换为机会分数。Hard Preconditions 会直接移除不可执行候选；最终赢家只产生 Proposal，不直接控制 Agent。', 'Fixed, inspectable response curves turn world facts × combat profile × squad capability into opportunity scores. Hard preconditions remove impossible candidates. The winner only emits a proposal; it never directly controls the agent.')}</p></div>
          <span>{L('预览', 'Preview')} · {previewBand}</span>
        </header>
        <div className="tw-iaus-preview-controls">
          <label><span>{L('来火压力', 'Incoming pressure')} <b>{previewPressure.toFixed(2)}</b></span><input type="range" min={0} max={1} step={0.01} value={previewPressure} onChange={(event) => setPreviewPressure(Number(event.target.value))} /></label>
          <label><span>{L('受压成员', 'Pressured members')}</span><select value={previewPressuredCount} onChange={(event) => setPreviewPressuredCount(Number(event.target.value))}><option value={1}>1 / 3</option><option value={2}>2 / 3</option><option value={3}>3 / 3</option></select></label>
          <label><span>{L('当前战术', 'Current tactic')}</span><select value={previewTactic} onChange={(event) => setPreviewTactic(event.target.value)}><option value="bounding">Bounding</option><option value="flank">Flank</option><option value="crossfire">Crossfire</option><option value="assault">Assault</option><option value="regroup">Regroup</option></select></label>
        </div>
        <div className="tw-iaus-grid">
          {utilityPreview.candidates.map((candidate) => <UtilityCandidateCard key={candidate.candidateId} locale={props.locale} candidate={candidate} selected={utilityPreview.selectedId === candidate.candidateId} weight={utilityWeightFor(profile, candidate.candidateId)} onWeight={(value) => setUtilityWeight(utilityWeightKey(candidate.candidateId), value)} />)}
        </div>
        <footer className="tw-iaus-foot">{L('当前集成边界：IAUS = Reasoner / Opportunity Selector；Tactical Planner 负责几何与角色；Commitment / Lease 防止每帧重新选择；Arbitration / Execution Contract 保持最终执行权唯一。', 'Current integration boundary: IAUS = Reasoner / opportunity selector; Tactical Planner owns geometry and roles; commitment / leases prevent per-frame reselection; arbitration / execution contract keep final authority singular.')}</footer>
      </section>
    </section>
    <BaseDesignPage {...props} />
  </div>;
}

function UtilityCandidateCard({ locale, candidate, selected, weight, onWeight }: {
  readonly locale: Locale;
  readonly candidate: ReturnType<typeof evaluatePressureUtilities>['candidates'][number];
  readonly selected: boolean;
  readonly weight: number;
  readonly onWeight: (value: number) => void;
}) {
  const L = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  return <article className={`tw-iaus-candidate${selected ? ' selected' : ''}${candidate.available ? '' : ' unavailable'}`}>
    <header><span><small>{actionLabel(candidate.candidateId, locale)}</small><strong>{candidate.available ? candidate.score.toFixed(3) : '—'}</strong></span>{selected ? <b>{L('当前赢家', 'WINNER')}</b> : candidate.available ? null : <em>{L('不可用', 'GATED')}</em>}</header>
    <label className="tw-iaus-weight"><span>{L('候选倍率', 'Candidate weight')} {weight.toFixed(2)}×</span><input type="range" min={0.25} max={1.75} step={0.01} value={weight} onChange={(event) => onWeight(Number(event.target.value))} /></label>
    <div className="tw-iaus-axes">{candidate.axes.map((axis) => <div key={axis.axisId}><span>{axis.axisId}</span><i><u style={{ width: `${Math.round(axis.response * 100)}%` }} /></i><b>{axis.response.toFixed(2)}</b></div>)}</div>
    {!candidate.available ? <p>{candidate.unavailableReason}</p> : null}
  </article>;
}

function ProfileSlider({ label, hint, value, onChange }: { readonly label: string; readonly hint: string; readonly value: number; readonly onChange: (value: number) => void }) {
  return <label className="tw-profile-slider"><span><b>{label}</b><em>{Math.round(value * 100)}</em></span><input type="range" min={0} max={1} step={0.01} value={value} onChange={(event) => onChange(Number(event.target.value))} /><small>{hint}</small></label>;
}

function utilityWeightFor(profile: TacticalWizardCombatProfile, action: PressureTacticalAction): number {
  if (action === 'trade_fire') return profile.utilityTradeFireWeight;
  if (action === 'reposition') return profile.utilityRepositionWeight;
  if (action === 'flank') return profile.utilityFlankWeight;
  if (action === 'regroup') return profile.utilityRegroupWeight;
  if (action === 'assault') return profile.utilityAssaultWeight;
  return 1;
}

function utilityWeightKey(action: PressureTacticalAction): UtilityWeightKey {
  if (action === 'trade_fire') return 'utilityTradeFireWeight';
  if (action === 'reposition') return 'utilityRepositionWeight';
  if (action === 'flank') return 'utilityFlankWeight';
  if (action === 'regroup') return 'utilityRegroupWeight';
  return 'utilityAssaultWeight';
}

function actionLabel(action: PressureTacticalAction, locale: Locale): string {
  if (locale !== 'zh-CN') return action === 'trade_fire' ? 'Trade Fire' : action === 'reposition' ? 'Reposition' : action === 'flank' ? 'Flank' : action === 'regroup' ? 'Regroup / Break Contact' : action === 'assault' ? 'Assault' : 'None';
  return action === 'trade_fire' ? '继续对枪' : action === 'reposition' ? '换位' : action === 'flank' ? '反机动 / 绕后' : action === 'regroup' ? '收缩 / 脱离' : action === 'assault' ? '强行突击' : '无';
}

function mindsetLabel(mindset: TacticalWizardCombatProfile['mindset'], locale: Locale): string {
  if (locale !== 'zh-CN') return mindset === 'tactical_human' ? 'Tactical human' : mindset === 'feral' ? 'Feral / pack' : 'Machine logic';
  return mindset === 'tactical_human' ? '战术人类' : mindset === 'feral' ? '兽群 / 非人类' : '机械逻辑';
}

function mindsetDescription(mindset: TacticalWizardCombatProfile['mindset'], locale: Locale): string {
  if (locale !== 'zh-CN') {
    if (mindset === 'feral') return 'Pressure becomes evasive encirclement or aggressive closing rather than human cover doctrine.';
    if (mindset === 'machine') return 'Incoming fire is treated as geometry / damage risk and can be deliberately ignored while the exchange remains acceptable.';
    return 'Human fire-and-maneuver doctrine separates local suppression from squad response proposals and keeps committed maneuvers stable.';
  }
  if (mindset === 'feral') return '不把“压制”理解为人类恐惧，而把危险火线转化为闪避包抄或强行逼近。';
  if (mindset === 'machine') return '把来火主要理解为结构损伤与几何风险，可在可接受交换下有意识地继续硬顶。';
  return '人类火力与机动语义：先处理单兵受压，再由小队提出有租约的换位、反机动或脱离方案。';
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function clampUtilityWeight(value: number): number { return Math.max(0.25, Math.min(1.75, value)); }

const PROFILE_STYLE = `
.tw-profile-authoring{display:grid;gap:12px}.tw-profile-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.tw-profile-head strong{font-size:12px;color:#d3dde6}.tw-profile-head p{max-width:900px;margin:5px 0 0;color:#7d8f9f;font-size:9px;line-height:1.55}.tw-profile-head>span{white-space:nowrap;padding:5px 8px;border:1px solid #304250;border-radius:6px;color:#a8bac9;font-size:8px}.tw-profile-presets{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.tw-profile-presets button{display:grid;gap:3px;text-align:left;padding:9px;border:1px solid #263744;border-radius:7px;background:#0d151c;color:#9fb0bf}.tw-profile-presets button:hover,.tw-profile-presets button.active{border-color:#607d92;background:#111e27;color:#d7e2ea}.tw-profile-presets b{font-size:9px}.tw-profile-presets small{font-size:7px;color:#6f8595}.tw-profile-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.tw-profile-slider,.tw-profile-mindset{display:grid;gap:5px;padding:9px;border:1px solid #243440;border-radius:7px;background:#0b1218}.tw-profile-slider span{display:flex;justify-content:space-between;gap:8px}.tw-profile-slider b,.tw-profile-mindset b{font-size:9px;color:#b9c8d3}.tw-profile-slider em{font-style:normal;font-size:8px;color:#83a9c0}.tw-profile-slider small,.tw-profile-mindset small,.tw-profile-mindset p{font-size:7.5px;color:#718493;line-height:1.45}.tw-profile-mindset p{margin:0}.tw-iaus-panel{display:grid;gap:10px;padding:12px;border:1px solid #304554;border-radius:9px;background:linear-gradient(180deg,#0d171e,#0a1117)}.tw-iaus-head{display:flex;justify-content:space-between;gap:16px}.tw-iaus-head div{display:grid;gap:3px}.tw-iaus-head small{font-size:7px;letter-spacing:.09em;color:#6e8798}.tw-iaus-head strong{font-size:11px;color:#c8d8e3}.tw-iaus-head p{max-width:920px;margin:0;color:#758997;font-size:8px;line-height:1.5}.tw-iaus-head>span{font-size:8px;color:#9eb3c1}.tw-iaus-preview-controls{display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px}.tw-iaus-preview-controls label{display:grid;gap:4px;padding:8px;border:1px solid #233640;border-radius:7px;background:#0a1218}.tw-iaus-preview-controls span{font-size:8px;color:#8ca1af}.tw-iaus-preview-controls select{background:#0e1820;color:#b8c7d2;border:1px solid #2b3e49;border-radius:5px;padding:5px}.tw-iaus-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.tw-iaus-candidate{display:grid;align-content:start;gap:7px;padding:9px;border:1px solid #263944;border-radius:8px;background:#0a1218}.tw-iaus-candidate.selected{border-color:#7ea3bb;box-shadow:0 0 0 1px #38576a inset}.tw-iaus-candidate.unavailable{opacity:.5}.tw-iaus-candidate header{display:flex;justify-content:space-between;gap:6px}.tw-iaus-candidate header span{display:grid}.tw-iaus-candidate header small{font-size:7px;color:#7d92a0}.tw-iaus-candidate header strong{font-size:13px;color:#c6d7e2}.tw-iaus-candidate header b{font-size:7px;color:#9cc5dc}.tw-iaus-candidate header em{font-style:normal;font-size:7px;color:#8c7c72}.tw-iaus-weight{display:grid;gap:3px}.tw-iaus-weight span{font-size:7px;color:#718594}.tw-iaus-axes{display:grid;gap:4px}.tw-iaus-axes>div{display:grid;grid-template-columns:minmax(0,1fr) 48px 26px;gap:5px;align-items:center}.tw-iaus-axes span,.tw-iaus-axes b{font-size:6.5px;color:#718493}.tw-iaus-axes b{text-align:right}.tw-iaus-axes i{height:4px;border-radius:3px;background:#16252e;overflow:hidden}.tw-iaus-axes u{display:block;height:100%;background:#577f98}.tw-iaus-candidate p,.tw-iaus-foot{margin:0;font-size:7px;line-height:1.45;color:#6c7e8b}.tw-iaus-foot{padding-top:3px;border-top:1px solid #20313b}@media(max-width:1250px){.tw-iaus-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:1100px){.tw-profile-presets{grid-template-columns:repeat(2,minmax(0,1fr))}.tw-profile-grid{grid-template-columns:1fr 1fr}.tw-iaus-preview-controls{grid-template-columns:1fr 1fr}}@media(max-width:760px){.tw-profile-head,.tw-iaus-head{display:grid}.tw-profile-presets,.tw-profile-grid,.tw-iaus-grid,.tw-iaus-preview-controls{grid-template-columns:1fr}}
`;
