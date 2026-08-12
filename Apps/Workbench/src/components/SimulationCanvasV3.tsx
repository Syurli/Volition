import type { MouseEvent } from 'react';
import type { Locale } from '../i18n';
import { localizedAssetName, localizedTactic } from '../assetLocalization';
import { tacticalWizardTestMap, type GrenadeVisual, type SimulationOverlaySettings, type TacticalWizardAgentView, type TacticalWizardSimulationState } from '../simulation/tacticalWizardSimulationV4';
import type { GridPoint } from '../simulation/navigation';

const CELL = 22;
interface Props { readonly state: TacticalWizardSimulationState; readonly overlays: SimulationOverlaySettings; readonly onSetPlayer: (point: GridPoint) => void; readonly locale: Locale; }

export function SimulationCanvas({ state, overlays, onSetPlayer, locale }: Props) {
  const width = tacticalWizardTestMap.width * CELL;
  const height = tacticalWizardTestMap.height * CELL;
  const player = center(state.player);
  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * tacticalWizardTestMap.width);
    const y = Math.floor((event.clientY - rect.top) / rect.height * tacticalWizardTestMap.height);
    onSetPlayer({ x, y });
  };

  return <svg className="simulation-canvas tactical-observer" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tactical Wizard squad AI tactical observer" onClick={handleClick}>
    <rect className="sim-floor" width={width} height={height} />

    {overlays.grid && Array.from({ length: tacticalWizardTestMap.width + 1 }, (_, x) => <line key={`gx-${x}`} className="sim-grid-line" x1={x * CELL} y1={0} x2={x * CELL} y2={height} />)}
    {overlays.grid && Array.from({ length: tacticalWizardTestMap.height + 1 }, (_, y) => <line key={`gy-${y}`} className="sim-grid-line" x1={0} y1={y * CELL} x2={width} y2={y * CELL} />)}

    {state.agents.map((agent) => overlays.hearing ? <circle key={`hearing-${agent.id}`} className="sim-hearing" cx={center(agent.position).x} cy={center(agent.position).y} r={state.hearingRadius * CELL} /> : null)}
    {state.agents.map((agent) => overlays.vision ? <VisionOverlay key={`vision-${agent.id}`} agent={agent} range={state.visionRange} fovDegrees={state.visionFovDegrees} /> : null)}

    {tacticalWizardTestMap.blocked.map((cell) => <rect key={`b-${cell.x}-${cell.y}`} className="sim-obstacle" x={cell.x * CELL + 1} y={cell.y * CELL + 1} width={CELL - 2} height={CELL - 2} rx={3} />)}

    {overlays.path && state.agents.map((agent) => agent.path.length > 1 ? <polyline key={`path-${agent.id}`} className={`sim-path agent-${agent.visualKey}`} points={agent.path.map((point) => `${center(point).x},${center(point).y}`).join(' ')} /> : null)}

    {overlays.memory && state.squad.sharedLastKnownPosition && <MemoryMarker point={state.squad.sharedLastKnownPosition} locale={locale} />}

    {overlays.cover && state.agents.map((agent) => agent.coverTarget ? <AssignedCover key={`cover-${agent.id}`} agent={agent} /> : null)}
    {state.agents.map((agent) => agent.tacticalTarget ? <TacticalTarget key={`target-${agent.id}`} agent={agent} /> : null)}

    {state.fireLanes.map((lane) => <line key={`lane-${lane.ownerId}`} className="sim-fire-lane" x1={center(lane.from).x} y1={center(lane.from).y} x2={center(lane.to).x} y2={center(lane.to).y} />)}
    {state.agents.map((agent) => agent.targetVisible ? <line key={`los-${agent.id}`} className="sim-los" x1={center(agent.position).x} y1={center(agent.position).y} x2={player.x} y2={player.y} /> : null)}

    {state.agents.map((agent) => agent.searchLookTarget ? <SearchLook key={`search-look-${agent.id}`} agent={agent} /> : null)}
    {state.grenadeEvents.map((grenade) => <GrenadeEvent key={`grenade-${grenade.id}`} grenade={grenade} locale={locale} />)}
    {state.agents.map((agent) => agent.firePulse > 0 && agent.fireTarget ? <line key={`fire-${agent.id}`} className="sim-fire" x1={center(agent.fireOrigin ?? agent.position).x} y1={center(agent.fireOrigin ?? agent.position).y} x2={center(agent.fireTarget).x} y2={center(agent.fireTarget).y} /> : null)}
    {state.agents.map((agent) => agent.meleePulse > 0 ? <MeleePulse key={`melee-${agent.id}`} agent={agent} /> : null)}

    {state.agents.map((agent) => <AgentShape key={agent.id} agent={agent} locale={locale} />)}
    <circle className="sim-player" cx={player.x} cy={player.y} r={9} />
    <circle className="sim-player-core" cx={player.x} cy={player.y} r={2.5} />
    <text className="sim-label player-label" x={player.x + 12} y={player.y - 12}>{locale === 'zh-CN' ? '玩家' : 'Player'}</text>

    <g className="sim-tactical-hud" transform="translate(12 12)">
      <rect width={300} height={27} rx={6} />
      <text x={9} y={17}>{localizedTactic(state.squad.tactic, locale)} · {locale === 'zh-CN' ? '安全枪线' : 'safe lanes'} {state.safeFireLanes} · {locale === 'zh-CN' ? '展开' : 'spread'} {state.squad.spread.toFixed(1)} · {locale === 'zh-CN' ? '投掷' : 'grenades'} {state.grenadeEvents.length}</text>
    </g>
  </svg>;
}

function VisionOverlay({ agent, range, fovDegrees }: { readonly agent: TacticalWizardAgentView; readonly range: number; readonly fovDegrees: number }) {
  const origin = center(agent.position);
  const angle = Math.atan2(agent.facing.y, agent.facing.x) * 180 / Math.PI;
  const radius = range * CELL;
  const half = fovDegrees * Math.PI / 360;
  const a = { x: Math.cos(-half) * radius, y: Math.sin(-half) * radius };
  const b = { x: Math.cos(half) * radius, y: Math.sin(half) * radius };
  const d = `M 0 0 L ${a.x} ${a.y} A ${radius} ${radius} 0 0 1 ${b.x} ${b.y}`;
  return <g className="sim-vision-group" style={{ transform: `translate(${origin.x}px, ${origin.y}px) rotate(${angle}deg)` }}><path className="sim-vision" d={d} /></g>;
}

function MemoryMarker({ point, locale }: { readonly point: GridPoint; readonly locale: Locale }) {
  const p = center(point);
  return <g className="sim-memory squad-memory"><circle cx={p.x} cy={p.y} r={8} /><line x1={p.x - 5} y1={p.y - 5} x2={p.x + 5} y2={p.y + 5} /><line x1={p.x + 5} y1={p.y - 5} x2={p.x - 5} y2={p.y + 5} /><text x={p.x + 11} y={p.y + 3}>{locale === 'zh-CN' ? '最后确认' : 'LKP'}</text></g>;
}

function AssignedCover({ agent }: { readonly agent: TacticalWizardAgentView }) {
  if (agent.coverTarget === null) return null;
  const cover = center(agent.coverTarget);
  const peek = agent.peekTarget === null ? null : center(agent.peekTarget);
  return <g className={`sim-assigned-cover cover-${agent.coverState} agent-${agent.visualKey}`}>
    <rect x={cover.x - 6} y={cover.y - 6} width={12} height={12} rx={3} />
    {peek && <><line x1={cover.x} y1={cover.y} x2={peek.x} y2={peek.y} /><circle cx={peek.x} cy={peek.y} r={3} /></>}
  </g>;
}

function TacticalTarget({ agent }: { readonly agent: TacticalWizardAgentView }) {
  if (agent.tacticalTarget === null) return null;
  const target = center(agent.tacticalTarget);
  const from = center(agent.position);
  return <g className={`sim-task-target task-${agent.task}`}>
    <line x1={from.x} y1={from.y} x2={target.x} y2={target.y} />
    <circle cx={target.x} cy={target.y} r={4.5} />
  </g>;
}

function SearchLook({ agent }: { readonly agent: TacticalWizardAgentView }) {
  if (agent.searchLookTarget === null) return null;
  const from = center(agent.position);
  const to = center(agent.searchLookTarget);
  return <g className="sim-search-look"><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} /><circle cx={to.x} cy={to.y} r={2.5} /></g>;
}

function GrenadeEvent({ grenade, locale }: { readonly grenade: GrenadeVisual; readonly locale: Locale }) {
  const from = center(grenade.from);
  const to = center(grenade.to);
  const stroke = grenade.kind === 'flash' ? '#f7d76c' : grenade.kind === 'smoke' ? '#9ab4c4' : '#d97c54';
  const label = grenade.kind === 'flash' ? (locale === 'zh-CN' ? '震' : 'FLASH') : grenade.kind === 'smoke' ? (locale === 'zh-CN' ? '烟' : 'SMOKE') : (locale === 'zh-CN' ? '破' : 'FRAG');
  const opacity = Math.max(0.18, Math.min(0.72, grenade.remainingFrames / 30));
  return <g pointerEvents="none" opacity={opacity}>
    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={stroke} strokeWidth={1.5} strokeDasharray="4 6" />
    <circle cx={to.x} cy={to.y} r={grenade.radius * CELL} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray="7 7" />
    <circle cx={to.x} cy={to.y} r={5} fill={stroke} fillOpacity={0.22} stroke={stroke} strokeWidth={1.5} />
    <text x={to.x + 8} y={to.y - 8} fill={stroke} fontSize={9} fontWeight={700}>{label}</text>
  </g>;
}

function MeleePulse({ agent }: { readonly agent: TacticalWizardAgentView }) {
  const p = center(agent.position);
  const opacity = Math.max(0.25, Math.min(0.85, agent.meleePulse / 8));
  return <circle cx={p.x} cy={p.y} r={16} fill="none" stroke="#ef9d55" strokeWidth={2} strokeDasharray="3 3" opacity={opacity} pointerEvents="none" />;
}

function AgentShape({ agent, locale }: { readonly agent: TacticalWizardAgentView; readonly locale: Locale }) {
  const position = center(agent.position);
  const angle = Math.atan2(agent.facing.y, agent.facing.x) * 180 / Math.PI + 90;
  const label = localizedAssetName(agent.id, agent.label, locale);
  const special = agent.specialAction !== 'none' && agent.specialActionPulse > 0 ? localizedSpecial(agent.specialAction, locale) : null;
  return <g className={`sim-enemy agent-${agent.visualKey} role-${agent.role} cover-${agent.coverState}`} transform={`translate(${position.x} ${position.y})`}>
    <title>{`${label} · ${agent.task} · ${agent.coverState} · ${agent.locomotionMode} · ${agent.buddyRole} · ${agent.opportunityPurpose} · ${agent.selectedIntent}`}</title>
    <g transform={`rotate(${angle})`}><polygon points="0,-10 8,9 0,6 -8,9" /></g>
    <text className="sim-label" x={11} y={-9}>{label} · {shortTask(agent.task)}</text>
    {special && <text x={11} y={3} fontSize={8.5} fontWeight={700}>{special}</text>}
    {agent.fireBlockedByFriend && <text className="sim-fire-blocked" x={11} y={special ? 14 : 3}>{locale === 'zh-CN' ? '枪线阻挡' : 'NO FIRE'}</text>}
  </g>;
}

function localizedSpecial(action: TacticalWizardAgentView['specialAction'], locale: Locale): string {
  if (locale !== 'zh-CN') return action.replaceAll('_', ' ').toUpperCase();
  return { none: '', throw_flash: '震撼弹', throw_frag: '破片弹', throw_smoke: '烟幕', melee: '近战', surprise: '伏击机会' }[action];
}

function shortTask(task: TacticalWizardAgentView['task']): string {
  switch (task) {
    case 'suppress': return 'SUP';
    case 'bound_to_cover': return 'BOUND';
    case 'hold_cover': return 'HOLD';
    case 'flank_to_cover': return 'FLANK';
    case 'crossfire': return 'X-FIRE';
    case 'assault': return 'ASSAULT';
    case 'search_sector': return 'SEARCH';
    case 'overwatch': return 'WATCH';
    case 'regroup': return 'REGROUP';
    default: return 'PATROL';
  }
}

function center(point: GridPoint) { return { x: point.x * CELL + CELL / 2, y: point.y * CELL + CELL / 2 }; }
