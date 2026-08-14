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
  const rescuer = recovery.rescuerId === null ? null : state.agents.find((agent) => agent.id === recovery.rescuerId) ?? null;
  const downed = recovery.downedAgentId === null ? null : state.agents.find((agent) => agent.id === recovery.downedAgentId) ?? null;
  const coverer = recovery.covererId === null ? null : state.agents.find((agent) => agent.id === recovery.covererId) ?? null;
  const medicalRunner = recovery.medicalResupplyAgentId === null ? null : state.agents.find((agent) => agent.id === recovery.medicalResupplyAgentId) ?? null;
  const medicalSupply = recovery.medicalResupplySupplyId === null ? null : state.supplies.find((supply) => supply.id === recovery.medicalResupplySupplyId) ?? null;
  if (recovery.phase === 'none' && medicalRunner === null) return null;
  const phaseLabel = recovery.phase === 'establish_cover' ? (locale === 'zh-CN' ? '救援：先建立掩护' : 'RESCUE: ESTABLISH COVER') : recovery.phase === 'approach' ? (locale === 'zh-CN' ? '救援：接近伤员' : 'RESCUE: APPROACH') : recovery.phase === 'treat' ? (locale === 'zh-CN' ? `救援：现场救治 ${(recovery.treatmentProgress * 100).toFixed(0)}%` : `RESCUE: TREAT ${(recovery.treatmentProgress * 100).toFixed(0)}%`) : (locale === 'zh-CN' ? '医疗补给' : 'MEDICAL RESUPPLY');
  return <g>{rescuer !== null && downed !== null ? <g className="sim-rescue-link"><line x1={center(rescuer.position).x} y1={center(rescuer.position).y} x2={center(recovery.approachTarget ?? downed.position).x} y2={center(recovery.approachTarget ?? downed.position).y} /><circle cx={center(recovery.approachTarget ?? downed.position).x} cy={center(recovery.approachTarget ?? downed.position).y} r={10} /><text x={center(rescuer.position).x + 12} y={center(rescuer.position).y + 22}>{locale === 'zh-CN' ? '救治者' : 'MEDIC'}</text></g> : null}{coverer !== null ? <g className="sim-rescue-cover">{state.squad.sharedLastKnownPosition !== null ? <line x1={center(coverer.position).x} y1={center(coverer.position).y} x2={center(state.squad.sharedLastKnownPosition).x} y2={center(state.squad.sharedLastKnownPosition).y} /> : null}<text x={center(coverer.position).x + 12} y={center(coverer.position).y + 24}>{locale === 'zh-CN' ? '救援掩护' : 'RESCUE COVER'}</text></g> : null}{medicalRunner !== null && medicalSupply !== null ? <g className="sim-rescue-link"><line x1={center(medicalRunner.position).x} y1={center(medicalRunner.position).y} x2={center(medicalSupply.position).x} y2={center(medicalSupply.position).y} /><circle cx={center(medicalSupply.position).x} cy={center(medicalSupply.position).y} r={11} /><text x={(center(medicalRunner.position).x + center(medicalSupply.position).x) / 2 + 5} y={(center(medicalRunner.position).y + center(medicalSupply.position).y) / 2 - 5}>{locale === 'zh-CN' ? '补充医疗包' : 'FETCH MEDKIT'}</text></g> : null}<g className="sim-recovery-banner" transform={`translate(${Math.max(10, width - 244)} 42)`}><rect width={232} height={24} rx={5} /><text x={8} y={15}>{phaseLabel}</text></g></g>;
}

function center(point: GridPoint): GridPoint { return { x: point.x * CELL + CELL / 2, y: point.y * CELL + CELL / 2 }; }
