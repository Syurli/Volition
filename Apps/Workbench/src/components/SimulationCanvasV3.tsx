import type { MouseEvent } from 'react';
import type { Locale } from '../i18n';
import { localizedAssetName, localizedIntent, localizedRole, localizedTactic } from '../assetLocalization';
import { tacticalWizardTestMap, type SimulationOverlaySettings, type TacticalWizardAgentView, type TacticalWizardSimulationState } from '../simulation/tacticalWizardSimulationV3';
import type { GridPoint } from '../simulation/navigation';

const CELL = 22;
interface Props { readonly state: TacticalWizardSimulationState; readonly overlays: SimulationOverlaySettings; readonly onSetPlayer: (point: GridPoint) => void; readonly locale: Locale; }

export function SimulationCanvas({ state, overlays, onSetPlayer, locale }: Props) {
  const width = tacticalWizardTestMap.width * CELL; const height = tacticalWizardTestMap.height * CELL; const player = center(state.player);
  const handleClick = (event: MouseEvent<SVGSVGElement>) => { const rect = event.currentTarget.getBoundingClientRect(); const x = Math.floor((event.clientX - rect.left) / rect.width * tacticalWizardTestMap.width); const y = Math.floor((event.clientY - rect.top) / rect.height * tacticalWizardTestMap.height); onSetPlayer({ x, y }); };
  return <svg className="simulation-canvas" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tactical Wizard squad AI simulation test map" onClick={handleClick}>
    <rect className="sim-floor" width={width} height={height} />
    {overlays.grid && Array.from({ length: tacticalWizardTestMap.width + 1 }, (_, x) => <line key={`gx-${x}`} className="sim-grid-line" x1={x * CELL} y1={0} x2={x * CELL} y2={height} />)}
    {overlays.grid && Array.from({ length: tacticalWizardTestMap.height + 1 }, (_, y) => <line key={`gy-${y}`} className="sim-grid-line" x1={0} y1={y * CELL} x2={width} y2={y * CELL} />)}
    {state.agents.map((agent) => overlays.hearing ? <circle key={`hearing-${agent.id}`} className="sim-hearing" cx={center(agent.position).x} cy={center(agent.position).y} r={state.hearingRadius * CELL} /> : null)}
    {state.agents.map((agent) => overlays.vision ? <path key={`vision-${agent.id}`} className="sim-vision" d={visionCone(agent, state.visionRange, state.visionFovDegrees)} /> : null)}
    {tacticalWizardTestMap.blocked.map((cell) => <rect key={`b-${cell.x}-${cell.y}`} className="sim-obstacle" x={cell.x * CELL + 1} y={cell.y * CELL + 1} width={CELL - 2} height={CELL - 2} rx={3} />)}
    {state.patrolPoints.map((point, index) => { const p = center(point); return <g key={`patrol-${index}`} className={index === state.patrolIndex ? 'sim-patrol active' : 'sim-patrol'}><rect x={p.x - 5} y={p.y - 5} width={10} height={10} transform={`rotate(45 ${p.x} ${p.y})`} /><text x={p.x + 8} y={p.y - 7}>P{index + 1}</text></g>; })}
    {overlays.cover && state.coverSlots.map((slot) => { const p = center(slot.position); const peek = center(slot.peekPosition); return <g key={slot.id} className="sim-cover-slot"><circle cx={p.x} cy={p.y} r={3.5} /><line x1={p.x} y1={p.y} x2={peek.x} y2={peek.y} /></g>; })}
    {state.agents.map((agent) => overlays.path && agent.path.length > 0 ? <polyline key={`path-${agent.id}`} className={`sim-path agent-${agent.visualKey}`} points={agent.path.map((point) => `${center(point).x},${center(point).y}`).join(' ')} /> : null)}
    {overlays.memory && state.squad.sharedLastKnownPosition && (() => { const p = center(state.squad.sharedLastKnownPosition); return <g className="sim-memory squad-memory"><line x1={p.x - 8} y1={p.y - 8} x2={p.x + 8} y2={p.y + 8} /><line x1={p.x + 8} y1={p.y - 8} x2={p.x - 8} y2={p.y + 8} /><text x={p.x + 10} y={p.y + 4}>{locale === 'zh-CN' ? '小队 LKP' : 'SQUAD LKP'}</text></g>; })()}
    {overlays.cover && state.agents.map((agent) => agent.tacticalTarget ? <TacticalTarget key={`target-${agent.id}`} agent={agent} locale={locale} /> : null)}
    {state.agents.map((agent) => agent.targetVisible ? <line key={`los-${agent.id}`} className={`sim-los agent-${agent.visualKey}`} x1={center(agent.position).x} y1={center(agent.position).y} x2={player.x} y2={player.y} /> : null)}
    {state.agents.map((agent) => agent.firePulse > 0 && agent.fireTarget ? <line key={`fire-${agent.id}`} className={`sim-fire agent-${agent.visualKey}`} x1={center(agent.position).x} y1={center(agent.position).y} x2={center(agent.fireTarget).x} y2={center(agent.fireTarget).y} /> : null)}
    {state.agents.map((agent) => agent.searchPulse > 0 ? <circle key={`search-${agent.id}`} className={`sim-search agent-${agent.visualKey}`} cx={center(agent.position).x} cy={center(agent.position).y} r={16 + agent.searchPulse * 3} /> : null)}
    {state.agents.map((agent) => <AgentShape key={agent.id} agent={agent} locale={locale} />)}
    <circle className="sim-player" cx={player.x} cy={player.y} r={9} /><circle className="sim-player-core" cx={player.x} cy={player.y} r={2.5} /><text className="sim-label player-label" x={player.x + 12} y={player.y - 12}>{locale === 'zh-CN' ? '玩家' : 'Player'}</text>
    <text className="sim-squad-banner" x={12} y={20}>{locale === 'zh-CN' ? '小队' : 'Squad'}: {state.squad.alertState} · {localizedTactic(state.squad.tactic, locale)} · cycle {state.squad.maneuverCycle}</text>
  </svg>;
}

function AgentShape({ agent, locale }: { readonly agent: TacticalWizardAgentView; readonly locale: Locale }) {
  const position = center(agent.position); const angle = Math.atan2(agent.facing.y, agent.facing.x) * 180 / Math.PI + 90;
  const label = localizedAssetName(agent.id, agent.label, locale);
  return <g className={`sim-enemy agent-${agent.visualKey} role-${agent.role}`} transform={`translate(${position.x} ${position.y})`}><g transform={`rotate(${angle})`}><polygon points="0,-10 8,9 0,6 -8,9" /></g><text className="sim-label" x={11} y={-10}>{label} · {localizedRole(agent.role, locale)} · {localizedIntent(agent.selectedIntent, locale)}</text></g>;
}
function TacticalTarget({ agent, locale }: { readonly agent: TacticalWizardAgentView; readonly locale: Locale }) {
  if (agent.tacticalTarget === null) return null; const target = center(agent.tacticalTarget); const agentPoint = center(agent.position);
  return <g className={`sim-cover-assignment agent-${agent.visualKey} role-${agent.role}`}><line x1={agentPoint.x} y1={agentPoint.y} x2={target.x} y2={target.y} /><circle cx={target.x} cy={target.y} r={7} /><text x={target.x + 9} y={target.y + 3}>{localizedRole(agent.role, locale)}</text></g>;
}
function visionCone(agent: TacticalWizardAgentView, range: number, fovDegrees: number): string { const origin = center(agent.position); const facingAngle = Math.atan2(agent.facing.y, agent.facing.x); const half = fovDegrees * Math.PI / 360; const radius = range * CELL; const a = { x: origin.x + Math.cos(facingAngle - half) * radius, y: origin.y + Math.sin(facingAngle - half) * radius }; const b = { x: origin.x + Math.cos(facingAngle + half) * radius, y: origin.y + Math.sin(facingAngle + half) * radius }; return `M ${origin.x} ${origin.y} L ${a.x} ${a.y} A ${radius} ${radius} 0 0 1 ${b.x} ${b.y} Z`; }
function center(point: GridPoint) { return { x: point.x * CELL + CELL / 2, y: point.y * CELL + CELL / 2 }; }
