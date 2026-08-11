import type { MouseEvent } from 'react';
import { tacticalWizardTestMap, type SimulationOverlaySettings, type TacticalWizardSimulationState } from '../simulation/tacticalWizardSimulation';
import type { GridPoint } from '../simulation/navigation';

const CELL = 32;

interface Props {
  readonly state: TacticalWizardSimulationState;
  readonly overlays: SimulationOverlaySettings;
  readonly onSetPlayer: (point: GridPoint) => void;
}

export function SimulationCanvas({ state, overlays, onSetPlayer }: Props) {
  const width = tacticalWizardTestMap.width * CELL;
  const height = tacticalWizardTestMap.height * CELL;
  const enemy = center(state.enemy);
  const player = center(state.player);
  const facingAngle = Math.atan2(state.enemyFacing.y, state.enemyFacing.x);
  const half = state.visionFovDegrees * Math.PI / 360;
  const visionRadius = state.visionRange * CELL;
  const coneA = { x: enemy.x + Math.cos(facingAngle - half) * visionRadius, y: enemy.y + Math.sin(facingAngle - half) * visionRadius };
  const coneB = { x: enemy.x + Math.cos(facingAngle + half) * visionRadius, y: enemy.y + Math.sin(facingAngle + half) * visionRadius };

  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * tacticalWizardTestMap.width);
    const y = Math.floor((event.clientY - rect.top) / rect.height * tacticalWizardTestMap.height);
    onSetPlayer({ x, y });
  };

  return (
    <svg className="simulation-canvas" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tactical Wizard 2D AI simulation test map" onClick={handleClick}>
      <rect className="sim-floor" width={width} height={height} />
      {overlays.grid && Array.from({ length: tacticalWizardTestMap.width + 1 }, (_, x) => (
        <line key={`gx-${x}`} className="sim-grid-line" x1={x * CELL} y1={0} x2={x * CELL} y2={height} />
      ))}
      {overlays.grid && Array.from({ length: tacticalWizardTestMap.height + 1 }, (_, y) => (
        <line key={`gy-${y}`} className="sim-grid-line" x1={0} y1={y * CELL} x2={width} y2={y * CELL} />
      ))}
      {overlays.hearing && <circle className="sim-hearing" cx={enemy.x} cy={enemy.y} r={state.hearingRadius * CELL} />}
      {overlays.vision && <path className="sim-vision" d={`M ${enemy.x} ${enemy.y} L ${coneA.x} ${coneA.y} A ${visionRadius} ${visionRadius} 0 0 1 ${coneB.x} ${coneB.y} Z`} />}
      {tacticalWizardTestMap.blocked.map((cell) => <rect key={`b-${cell.x}-${cell.y}`} className="sim-obstacle" x={cell.x * CELL + 1} y={cell.y * CELL + 1} width={CELL - 2} height={CELL - 2} rx={4} />)}
      {state.patrolPoints.map((point, index) => { const p = center(point); return <g key={`patrol-${index}`} className={index === state.patrolIndex ? 'sim-patrol active' : 'sim-patrol'}><rect x={p.x - 7} y={p.y - 7} width={14} height={14} transform={`rotate(45 ${p.x} ${p.y})`} /><text x={p.x + 10} y={p.y - 9}>P{index + 1}</text></g>; })}
      {overlays.path && state.path.length > 0 && <polyline className="sim-path" points={state.path.map((point) => `${center(point).x},${center(point).y}`).join(' ')} />}
      {overlays.memory && state.lastKnownPosition && (() => { const p = center(state.lastKnownPosition); return <g className="sim-memory"><line x1={p.x - 9} y1={p.y - 9} x2={p.x + 9} y2={p.y + 9} /><line x1={p.x + 9} y1={p.y - 9} x2={p.x - 9} y2={p.y + 9} /><text x={p.x + 12} y={p.y + 4}>LKP</text></g>; })()}
      {state.targetVisible && <line className="sim-los" x1={enemy.x} y1={enemy.y} x2={player.x} y2={player.y} />}
      {state.firePulse > 0 && <line className="sim-fire" x1={enemy.x} y1={enemy.y} x2={player.x} y2={player.y} />}
      {state.searchPulse > 0 && <circle className="sim-search" cx={enemy.x} cy={enemy.y} r={22 + state.searchPulse * 5} />}
      <g className="sim-enemy" transform={`translate(${enemy.x} ${enemy.y}) rotate(${facingAngle * 180 / Math.PI + 90})`}><polygon points="0,-13 10,11 0,7 -10,11" /></g>
      <text className="sim-label" x={enemy.x + 14} y={enemy.y - 14}>AI · {state.selectedIntent}</text>
      <circle className="sim-player" cx={player.x} cy={player.y} r={11} /><circle className="sim-player-core" cx={player.x} cy={player.y} r={3} /><text className="sim-label player-label" x={player.x + 14} y={player.y - 14}>Player</text>
    </svg>
  );
}
function center(point: GridPoint) { return { x: point.x * CELL + CELL / 2, y: point.y * CELL + CELL / 2 }; }
