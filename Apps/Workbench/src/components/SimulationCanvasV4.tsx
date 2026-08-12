import type { Locale } from '../i18n';
import type { GridPoint } from '../simulation/navigation';
import { tacticalWizardTestMap, type SimulationOverlaySettings, type SupplyCacheView, type TacticalWizardAgentView, type TacticalWizardSimulationState } from '../simulation/tacticalWizardSimulationV4';
import { SimulationCanvas as BaseSimulationCanvas } from './SimulationCanvasV3Base';

const CELL = 22;
const V8_STYLE = `.simulation-canvas-wrap{position:relative;line-height:0}.simulation-canvas-wrap>.simulation-canvas{position:relative;z-index:1}.simulation-v8-overlay{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none}.sim-supply rect{fill:#17231d;stroke:#8fc19e;stroke-width:1.4}.sim-supply path{fill:none;stroke:#b8d9c1;stroke-width:1.1}.sim-supply text{fill:#c5d8cb;font-size:7.5px;paint-order:stroke;stroke:#091019;stroke-width:2px}.sim-supply-grenade rect{fill:#282217;stroke:#d1b86f}.sim-supply-grenade path{stroke:#e1ca87}.sim-supply-mixed rect{fill:#1d2130;stroke:#9caed9}.sim-supply-mixed path{stroke:#bac7e4}.sim-supply.depleted{opacity:.25}.sim-commander-marker circle{fill:none;stroke:#f1d37b;stroke-width:1.8;stroke-dasharray:3 3}.sim-commander-marker path{fill:#f1d37b;stroke:#091019;stroke-width:1}.sim-commander-marker text{fill:#f3dc94;font-size:8px;font-weight:800;paint-order:stroke;stroke:#091019;stroke-width:2px}.sim-resupply-route line{stroke:#7ec89a;stroke-width:1.8;stroke-dasharray:6 5}.sim-resupply-route circle{fill:none;stroke:#7ec89a;stroke-width:1.8;stroke-dasharray:3 3}.sim-resupply-route text{fill:#9edbb3;font-size:8px;font-weight:700;paint-order:stroke;stroke:#091019;stroke-width:2px}`;

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
    <style>{V8_STYLE}</style>
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
