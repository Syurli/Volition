import type { Locale } from '../i18n';
import type { GridPoint } from '../simulation/navigation';
import { tacticalWizardTestMap, type SimulationOverlaySettings, type SupplyCacheView, type TacticalWizardAgentView, type TacticalWizardSimulationState } from '../simulation/tacticalWizardSimulationV4';
import { SimulationCanvas as BaseSimulationCanvas } from './SimulationCanvasV3Base';

const CELL = 22;

interface Props {
  readonly state: TacticalWizardSimulationState;
  readonly overlays: SimulationOverlaySettings;
  readonly onSetPlayer: (point: GridPoint) => void;
  readonly locale: Locale;
}

export function SimulationCanvas(props: Props) {
  const { state, locale } = props;
  const width = tacticalWizardTestMap.width * CELL;
  const height = tacticalWizardTestMap.height * CELL;
  return <div className="simulation-canvas-wrap">
    <BaseSimulationCanvas {...props} />
    <svg className="simulation-v8-overlay" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {state.supplies.map((supply) => <SupplyMarker key={supply.id} supply={supply} locale={locale} />)}
      {state.agents.map((agent) => agent.commandRank === 'commander' ? <CommanderMarker key={`cmd-${agent.id}`} agent={agent} locale={locale} /> : null)}
      {state.agents.map((agent) => agent.logisticsTask !== 'none' && agent.resupplyTargetPosition !== null ? <ResupplyRoute key={`resupply-${agent.id}`} agent={agent} locale={locale} /> : null)}
    </svg>
  </div>;
}

function SupplyMarker({ supply, locale }: { readonly supply: SupplyCacheView; readonly locale: Locale }) {
  const p = center(supply.position);
  const label = supply.kind === 'ammo'
    ? (locale === 'zh-CN' ? '弹药' : 'AMMO')
    : supply.kind === 'grenade'
      ? (locale === 'zh-CN' ? '投掷物' : 'GREN')
      : (locale === 'zh-CN' ? '混合补给' : 'MIXED');
  return <g className={`sim-supply sim-supply-${supply.kind}${supply.depleted ? ' depleted' : ''}`} transform={`translate(${p.x} ${p.y})`}>
    <rect x={-9} y={-7} width={18} height={14} rx={3} />
    <path d="M -6 -3 L 6 -3 M -6 1 L 6 1 M 0 -5 L 0 5" />
    <text x={12} y={-2}>{supply.id} · {label}</text>
    <text x={12} y={8}>{locale === 'zh-CN' ? `弹 ${supply.ammoRounds} / 雷 ${supply.grenades}` : `A ${supply.ammoRounds} / G ${supply.grenades}`}</text>
  </g>;
}

function CommanderMarker({ agent, locale }: { readonly agent: TacticalWizardAgentView; readonly locale: Locale }) {
  const p = center(agent.position);
  return <g className="sim-commander-marker" transform={`translate(${p.x} ${p.y})`}>
    <circle r={14} />
    <path d="M -7 -15 L -4 -22 L 0 -17 L 4 -22 L 7 -15 Z" />
    <text x={12} y={-19}>{locale === 'zh-CN' ? '指挥官' : 'CMD'}</text>
  </g>;
}

function ResupplyRoute({ agent, locale }: { readonly agent: TacticalWizardAgentView; readonly locale: Locale }) {
  if (agent.resupplyTargetPosition === null) return null;
  const from = center(agent.position);
  const to = center(agent.resupplyTargetPosition);
  const label = agent.logisticsTask === 'resupply_ammo'
    ? (locale === 'zh-CN' ? '补弹' : 'RESUPPLY AMMO')
    : agent.logisticsTask === 'resupply_grenades'
      ? (locale === 'zh-CN' ? '补充投掷物' : 'RESUPPLY GRENADES')
      : (locale === 'zh-CN' ? '综合补给' : 'RESUPPLY');
  return <g className="sim-resupply-route">
    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
    <circle cx={to.x} cy={to.y} r={13} />
    <text x={(from.x + to.x) / 2 + 5} y={(from.y + to.y) / 2 - 5}>{label}</text>
  </g>;
}

function center(point: GridPoint): GridPoint {
  return { x: point.x * CELL + CELL / 2, y: point.y * CELL + CELL / 2 };
}
