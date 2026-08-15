import type { Locale } from '../i18n';
import type { GridPoint } from '../simulation/navigation';
import { tacticalWizardTestMap, type SimulationOverlaySettings, type TacticalWizardSimulationState } from '../simulation/tacticalWizardSimulation';
import { SimulationCanvas as BaseSimulationCanvas } from './SimulationOperationsCanvas';

const CELL = 22;
interface Props { readonly state: TacticalWizardSimulationState; readonly overlays: SimulationOverlaySettings; readonly onSetPlayer: (point: GridPoint) => void; readonly locale: Locale; }

export function SimulationCanvas(props: Props) {
  const { state, locale } = props;
  const width = tacticalWizardTestMap.width * CELL;
  const height = tacticalWizardTestMap.height * CELL;
  return <div className="simulation-recovery-wrap"><BaseSimulationCanvas {...props} /><svg className="simulation-recovery-overlay" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">{state.supplies.map((supply) => supply.medkits > 0 ? <MedicalCache key={`med-${supply.id}`} point={supply.position} count={supply.medkits} locale={locale} /> : null)}<RecoveryOverlay state={state} locale={locale} width={width} /></svg></div>;
}

function MedicalCache({ point, count, locale }: { readonly point: GridPoint; readonly count: number; readonly locale: Locale }) { const p = center(point); return <g className="sim-med-cache" transform={`translate(${p.x - 11} ${p.y + 11})`}><circle cx={0} cy={0} r={7} /><path d="M -3 0 L 3 0 M 0 -3 L 0 3" /><text x={9} y={3}>{locale === 'zh-CN' ? `医疗×${count}` : `MED×${count}`}</text></g>; }

function RecoveryOverlay({ state, locale, width }: { readonly state: TacticalWizardSimulationState; readonly locale: Locale; readonly width: number }) {
  const recovery = state.recovery;
  const geometry = state.dynamicRecovery;
  const rescuer = recovery.rescuerId === null ? null : state.agents.find((agent) => agent.id === recovery.rescuerId) ?? null;
  const downed = recovery.downedAgentId === null ? null : state.agents.find((agent) => agent.id === recovery.downedAgentId) ?? null;
  const coverer = recovery.covererId === null ? null : state.agents.find((agent) => agent.id === recovery.covererId) ?? null;
  const medicalRunner = recovery.medicalResupplyAgentId === null ? null : state.agents.find((agent) => agent.id === recovery.medicalResupplyAgentId) ?? null;
  const medicalSupply = recovery.medicalResupplySupplyId === null ? null : state.supplies.find((supply) => supply.id === recovery.medicalResupplySupplyId) ?? null;
  if (recovery.phase === 'none' && medicalRunner === null) return null;
  const phaseLabel = recovery.phase === 'establish_cover' ? (locale === 'zh-CN' ? '救援：先建立掩护' : 'RESCUE: ESTABLISH COVER') : recovery.phase === 'approach' ? (locale === 'zh-CN' ? '救援：沿安全侧接近' : 'RESCUE: SAFE APPROACH') : recovery.phase === 'treat' ? (locale === 'zh-CN' ? `救援：现场救治 ${(recovery.treatmentProgress * 100).toFixed(0)}%` : `RESCUE: TREAT ${(recovery.treatmentProgress * 100).toFixed(0)}%`) : (locale === 'zh-CN' ? '医疗补给' : 'MEDICAL RESUPPLY');
  return <g>
    {geometry.treatmentPoint !== null ? <GeometryMarker point={geometry.treatmentPoint} kind="treatment" label={locale === 'zh-CN' ? (geometry.treatmentExposed ? '救治点·暴露' : '救治点·遮蔽') : (geometry.treatmentExposed ? 'TREAT · EXPOSED' : 'TREAT · COVERED')} /> : null}
    {geometry.approachPoint !== null ? <GeometryMarker point={geometry.approachPoint} kind="approach" label={locale === 'zh-CN' ? '接近门' : 'APPROACH'} /> : null}
    {geometry.fallbackPoint !== null ? <GeometryMarker point={geometry.fallbackPoint} kind="fallback" label={locale === 'zh-CN' ? '撤回点' : 'FALLBACK'} /> : null}
    {geometry.securityPoint !== null ? <GeometryMarker point={geometry.securityPoint} kind="security" label={locale === 'zh-CN' ? '掩护位' : 'SECURITY'} /> : null}
    {rescuer !== null && downed !== null ? <g className="sim-rescue-link"><line x1={center(rescuer.position).x} y1={center(rescuer.position).y} x2={center(geometry.treatmentPoint ?? downed.position).x} y2={center(geometry.treatmentPoint ?? downed.position).y} /><text x={center(rescuer.position).x + 12} y={center(rescuer.position).y + 22}>{locale === 'zh-CN' ? '救治者' : 'MEDIC'}</text></g> : null}
    {coverer !== null ? <g className="sim-rescue-cover">{geometry.securityPoint !== null ? <line x1={center(coverer.position).x} y1={center(coverer.position).y} x2={center(geometry.securityPoint).x} y2={center(geometry.securityPoint).y} /> : null}{state.squad.sharedLastKnownPosition !== null ? <line x1={center(coverer.position).x} y1={center(coverer.position).y} x2={center(state.squad.sharedLastKnownPosition).x} y2={center(state.squad.sharedLastKnownPosition).y} /> : null}<text x={center(coverer.position).x + 12} y={center(coverer.position).y + 24}>{locale === 'zh-CN' ? '救援掩护' : 'RESCUE COVER'}</text></g> : null}
    {medicalRunner !== null && medicalSupply !== null ? <g className="sim-rescue-link"><line x1={center(medicalRunner.position).x} y1={center(medicalRunner.position).y} x2={center(medicalSupply.position).x} y2={center(medicalSupply.position).y} /><circle cx={center(medicalSupply.position).x} cy={center(medicalSupply.position).y} r={11} /><text x={(center(medicalRunner.position).x + center(medicalSupply.position).x) / 2 + 5} y={(center(medicalRunner.position).y + center(medicalSupply.position).y) / 2 - 5}>{locale === 'zh-CN' ? '补充医疗包' : 'FETCH MEDKIT'}</text></g> : null}
    <g className="sim-recovery-banner" transform={`translate(${Math.max(10, width - 292)} 42)`}><rect width={280} height={24} rx={5} /><text x={8} y={15}>{phaseLabel} · {locale === 'zh-CN' ? `路径暴露 ${geometry.pathExposureCells}` : `PATH EXPOSED ${geometry.pathExposureCells}`}</text></g>
  </g>;
}

function GeometryMarker({ point, kind, label }: { readonly point: GridPoint; readonly kind: 'treatment' | 'approach' | 'fallback' | 'security'; readonly label: string }) {
  const p = center(point);
  return <g className={`sim-recovery-geometry sim-recovery-geometry-${kind}`}><circle cx={p.x} cy={p.y} r={kind === 'treatment' ? 10 : 7} /><text x={p.x + 9} y={p.y - 9}>{label}</text></g>;
}
function center(point: GridPoint): GridPoint { return { x: point.x * CELL + CELL / 2, y: point.y * CELL + CELL / 2 }; }
