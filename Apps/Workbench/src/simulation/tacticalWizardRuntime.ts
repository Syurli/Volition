import { findPath, type GridPoint } from './navigation';
import { tacticalWizardNavigationGrid } from './tacticalWizardTestMapV7';
import {
  TacticalWizardSimulation as TacticalHost,
  tacticalWizardTestMap,
  type GrenadeKind,
  type SimulationOverlaySettings,
  type TacticalWizardAgentView as TacticalHostAgentView,
  type TacticalWizardSimulationState as TacticalHostState,
} from './tacticalWizardSimulationV7';
import {
  AMMO_CRITICAL,
  AMMO_LOW,
  AMMO_PER_BURST,
  capabilitySnapshot,
  emergencyResupplyOwner,
  logisticsMayCommit,
  resolveExecutionContract,
  type ExecutionContract,
  type LogisticsCommitment,
  type LogisticsTask,
  type ReactionCommitment,
  type ReactionState,
  type RecoveryRole,
} from './tacticalWizardHierarchy';

export type { SimulationOverlaySettings } from './tacticalWizardSimulationV7';
export type { LogisticsTask, ReactionState } from './tacticalWizardHierarchy';
export { tacticalWizardTestMap } from './tacticalWizardSimulationV7';

export type RecoveryTask = 'none' | 'self_treat' | 'rescue_cover' | 'rescue_wait_cover' | 'rescue_move' | 'rescue_treat' | 'resupply_medical';
export type TacticalEffectKind = 'none' | 'flash_push' | 'smoke_retreat' | 'frag_suppression';

export interface SpeedFactors {
  readonly base: number;
  readonly locomotion: number;
  readonly health: number;
  readonly firing: number;
  readonly task: number;
  readonly reaction: number;
  readonly recovery: number;
}

export interface TacticalWizardAgentView extends TacticalHostAgentView {
  readonly commandRank: 'commander' | 'subordinate';
  readonly commandTendency: string;
  readonly ammoRounds: number;
  readonly ammoCapacity: number;
  readonly burstsRemaining: number;
  readonly grenadeCapacity: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly alive: boolean;
  readonly moveSpeed: number;
  readonly speedFactors: SpeedFactors;
  readonly medkitCount: number;
  readonly medkitCapacity: number;
  readonly reactionState: ReactionState;
  readonly reactionTarget: GridPoint | null;
  readonly reactionTicks: number;
  readonly recoveryTask: RecoveryTask;
  readonly recoveryTargetId: string | null;
  readonly recoveryProgress: number;
  readonly logisticsTask: LogisticsTask;
  readonly resupplyTargetId: string | null;
  readonly resupplyTargetPosition: GridPoint | null;
  readonly aimThreatSeconds: number;
}

export interface SupplyCacheView {
  readonly id: string;
  readonly kind: 'ammo' | 'grenade' | 'mixed';
  readonly position: GridPoint;
  readonly ammoRounds: number;
  readonly grenades: number;
  readonly medkits: number;
  readonly depleted: boolean;
}

export interface ExecutionContractView extends ExecutionContract {
  readonly plannedRole: string;
  readonly plannedTask: string;
  readonly plannedTarget: GridPoint | null;
  readonly logisticsTask: LogisticsTask;
  readonly reactionState: ReactionState;
  readonly canFire: boolean;
  readonly canSuppress: boolean;
}

export interface TacticalWizardSimulationState extends Omit<TacticalHostState, 'agents'> {
  readonly agents: readonly TacticalWizardAgentView[];
  readonly commanderId: string;
  readonly command: {
    readonly commanderId: string;
    readonly order: string;
    readonly activeResupplyAgentId: string | null;
    readonly activeResupplySupplyId: string | null;
    readonly commanderStationarySeconds: number;
    readonly supportHandoffCount: number;
    readonly lastSupportHandoffTick: number | null;
  };
  readonly playerCombat: {
    readonly facing: GridPoint;
    readonly aimTarget: GridPoint;
    readonly selectedGrenade: GrenadeKind;
    readonly grenadeInventory: Readonly<Record<GrenadeKind, number>>;
    readonly shotPulse: number;
    readonly shotFrom: GridPoint | null;
    readonly shotTo: GridPoint | null;
    readonly shotsRecent: number;
    readonly firePressure: number;
  };
  readonly tacticalEffect: {
    readonly kind: TacticalEffectKind;
    readonly sourceGrenadeId: number | null;
    readonly center: GridPoint | null;
    readonly untilTick: number | null;
    readonly remainingTicks: number;
  };
  readonly supplies: readonly SupplyCacheView[];
  readonly recovery: {
    readonly phase: 'none' | 'establish_cover' | 'approach' | 'treat';
    readonly downedAgentId: string | null;
    readonly rescuerId: string | null;
    readonly covererId: string | null;
    readonly approachTarget: GridPoint | null;
    readonly treatmentProgress: number;
    readonly medicalResupplyAgentId: string | null;
    readonly medicalResupplySupplyId: string | null;
  };
  readonly recoverySafety: {
    readonly runtimeVersion: 'fixed-hierarchy';
    readonly active: boolean;
    readonly safetyReplans: number;
    readonly safetyAborts: number;
    readonly security: {
      readonly agentId: string | null;
      readonly weaponReady: boolean;
      readonly positionReady: boolean;
      readonly lineOfSightReady: boolean;
      readonly fireLaneReady: boolean;
      readonly reactionReady: boolean;
    };
  };
  readonly dynamicRecovery: {
    readonly active: boolean;
    readonly stagePoint: GridPoint | null;
    readonly treatmentPoint: GridPoint | null;
    readonly securityPoint: GridPoint | null;
  };
  readonly threatResponse: {
    readonly active: boolean;
    readonly phase: 'none' | 'break_contact' | 'search_sector';
    readonly sourceAgentId: string | null;
    readonly bearing: GridPoint | null;
    readonly estimatedSector: GridPoint | null;
    readonly startedTick: number | null;
    readonly lastHitTick: number | null;
    readonly smokeDeployed: boolean;
    readonly smokeOwnerId: string | null;
    readonly defensiveCoverTargets: Readonly<Record<string, GridPoint>>;
    readonly rescueCoverTarget: GridPoint | null;
    readonly rescueInterruptedCount: number;
    readonly lastRescueInterruptedTick: number | null;
  };
  readonly threatAwareness: {
    readonly level: 'none' | 'suspicious' | 'threatened' | 'confirmed';
    readonly confidence: number;
    readonly bearing: GridPoint | null;
    readonly estimatedSector: GridPoint | null;
    readonly lastEvidenceTick: number | null;
    readonly lastEvidenceKind: 'gunshot' | 'bullet_impact' | 'near_miss' | 'hit' | null;
    readonly evidenceCount: number;
    readonly evidenceCounts: Readonly<Record<'gunshot' | 'bullet_impact' | 'near_miss' | 'hit', number>>;
    readonly affectedAgentIds: readonly string[];
    readonly responseEscalations: number;
  };
  readonly cohesion: {
    readonly active: boolean;
    readonly patientId: string | null;
    readonly patientBand: 'healthy' | 'wounded' | 'critical' | 'downed' | null;
    readonly buddyId: string | null;
    readonly securityId: string | null;
    readonly reason: 'none' | 'critical_health' | 'wounded_isolation';
    readonly rallyPoint: GridPoint | null;
    readonly buddySupportPoint: GridPoint | null;
    readonly buddyDistance: number | null;
    readonly maxBuddyDistance: number;
  };
  readonly leadership: {
    readonly nominalCommanderId: string;
    readonly actingCommanderId: string | null;
    readonly livingCount: number;
    readonly capability: 'full_squad' | 'reduced_pair' | 'single_survivor' | 'combat_ineffective';
    readonly successionActive: boolean;
  };
  readonly contactTrack: {
    readonly episodeId: number;
    readonly status: 'none' | 'confirmed' | 'lost_fresh' | 'searching';
    readonly previousConfirmedPosition: GridPoint | null;
    readonly lastConfirmedPosition: GridPoint | null;
    readonly lastConfirmedTick: number | null;
    readonly egressDirection: GridPoint | null;
    readonly confidence: number;
    readonly uncertaintyRadius: number;
    readonly lkpCleared: boolean;
    readonly lkpClearedTick: number | null;
    readonly verifiedBy: readonly string[];
    readonly clearedSearchNodes: readonly GridPoint[];
    readonly frontier: readonly GridPoint[];
  };
  readonly combatAuthority: {
    readonly source: 'fixed_hierarchy';
    readonly searchPhase: 'none' | 'verify_lkp' | 'search_frontier' | 'reacquire';
    readonly confirmedVisualIds: readonly string[];
    readonly commitments: readonly {
      readonly agentId: string;
      readonly commitment: string;
      readonly priority: number;
      readonly reason: string;
    }[];
    readonly logisticsPreemptions: number;
    readonly rescueLaneReplans: number;
    readonly supplementalBursts: number;
    readonly grenadePolicy: 'purpose_gated';
  };
  readonly logisticsLifecycle: {
    readonly state: 'idle' | 'assigned';
    readonly agentId: string | null;
    readonly supplyId: string | null;
    readonly task: LogisticsTask | null;
    readonly suspendedUntilTick: number | null;
    readonly suppressedPlanningCalls: number;
  };
  readonly executionAuthority: {
    readonly runtimeVersion: 'fixed-hierarchy';
    readonly architecture: 'fixed_tactical_hierarchy';
    readonly layers: readonly ['perception', 'contact', 'tactical_planning', 'operational_arbitration', 'execution', 'host'];
    readonly finalMovementAuthority: 'execution_contract';
    readonly finalWeaponAuthority: 'execution_contract';
    readonly versionOverlayPolicy: 'forbidden';
    readonly contracts: readonly ExecutionContractView[];
  };
  readonly threatAuthority: {
    readonly bodyAttentionSeparated: true;
  };
}

interface EquipmentState {
  ammoRounds: number;
  readonly ammoCapacity: number;
  health: number;
  readonly maxHealth: number;
  medkits: number;
  readonly medkitCapacity: number;
}

interface MutableSupply {
  readonly id: string;
  readonly kind: 'ammo' | 'grenade' | 'mixed';
  readonly position: GridPoint;
  ammoRounds: number;
  grenades: number;
  medkits: number;
}

interface HostMember {
  readonly id: string;
  readonly label: string;
  position: GridPoint;
  role: string;
  task: string;
  tacticalTarget: GridPoint | null;
  targetVisible: boolean;
  grenadeCount: number;
  firePulse: number;
}

interface HostAccess {
  members: HostMember[];
  logicalTick: number;
  motionFrame: number;
  alertState: 'idle' | 'pending' | 'active';
  tactic: string;
  suppressorId: string | null;
  moverId: string | null;
  observerId: string | null;
  sharedLastKnownPosition: GridPoint | null;
  movementTarget: (member: HostMember) => GridPoint | null;
  tryFire: (member: HostMember, target: GridPoint, reason: string) => void;
  tryGrenade: (member: HostMember) => boolean;
  tryMelee: (member: HostMember) => boolean;
  canSeePlayer: (member: HostMember) => boolean;
  safeFireLaneCount: () => number;
  applyRoles: () => void;
  refreshTacticalPlan: () => void;
  log: (...args: any[]) => void;
  pushEvent: (message: string) => void;
}

interface RecoveryPlan {
  readonly patientId: string;
  rescuerId: string;
  covererId: string | null;
  phase: 'establish_cover' | 'approach' | 'treat';
  readonly startedTick: number;
  treatmentProgress: number;
}

interface MutablePlayerCombat {
  facing: GridPoint;
  aimTarget: GridPoint;
  selectedGrenade: GrenadeKind;
  grenadeInventory: Record<GrenadeKind, number>;
  shotPulse: number;
  shotFrom: GridPoint | null;
  shotTo: GridPoint | null;
  shotsRecent: number;
  firePressure: number;
}

const NOMINAL_COMMANDER_ID = 'twr:rifle-squad:alpha';
const PLAYER_DAMAGE = 28;
const PLAYER_FRAG_DAMAGE = 38;
const AGENT_MOVE_SPEED = 4.8;
const RESUPPLY_RADIUS = 0.8;
const RECOVERY_RANGE = 1.45;
const RECOVERY_SECONDS = 2;
const SUPPORT_HANDOFF_COOLDOWN = 8;
const LAYERS = ['perception', 'contact', 'tactical_planning', 'operational_arbitration', 'execution', 'host'] as const;

/**
 * Production Tactical Wizard runtime with one fixed responsibility hierarchy.
 *
 * The standalone coordinated-position Tactical Host supplies perception-facing
 * agent state, tactics, roles and authored tactical targets. Every operational
 * override (reaction, logistics, recovery) is reconciled here through one
 * Execution Contract before the Host may move, fire, throw or melee.
 *
 * No V8+ inheritance layer or independent hook stack participates in production.
 */
export class TacticalWizardRuntime {
  private readonly tacticalHost = new TacticalHost();
  private readonly equipment = new Map<string, EquipmentState>();
  private supplies: MutableSupply[] = createSupplies();
  private logistics: LogisticsCommitment | null = null;
  private readonly reactions = new Map<string, ReactionCommitment>();
  private recoveryPlan: RecoveryPlan | null = null;
  private readonly contracts = new Map<string, ExecutionContract>();
  private readonly dryFireLogged = new Set<string>();
  private readonly lowAmmoLogged = new Set<string>();
  private playerCombat: MutablePlayerCombat = createPlayerCombat(tacticalWizardTestMap.playerStart);
  private tacticalEffectKind: TacticalEffectKind = 'none';
  private tacticalEffectCenter: GridPoint | null = null;
  private tacticalEffectUntilTick: number | null = null;
  private tacticalEffectSequence = 0;
  private supportHandoffCount = 0;
  private lastSupportHandoffTick = -999;
  private commanderStationarySeconds = 0;
  private commanderLastPosition: GridPoint | null = null;
  private lastConfirmedPosition: GridPoint | null = null;
  private previousConfirmedPosition: GridPoint | null = null;
  private lastConfirmedTick: number | null = null;
  private threatSourceAgentId: string | null = null;
  private threatBearing: GridPoint | null = null;
  private threatSector: GridPoint | null = null;
  private threatLastHitTick: number | null = null;
  private threatUntilTick = -1;
  private rescueInterruptedCount = 0;
  private lastRescueInterruptedTick: number | null = null;

  constructor() {
    this.initializeEquipment();
    this.installHostExecutionBoundary();
    this.commanderLastPosition = this.hostState().agents.find((agent) => agent.id === NOMINAL_COMMANDER_ID)?.position ?? null;
    this.hostAccess().log('system', 'simulation', 'Volition Simulation', 'session', 'Fixed tactical hierarchy runtime enabled.', {
      architecture: 'fixed_tactical_hierarchy',
      layers: LAYERS.join('>'),
      versionOverlayPolicy: 'forbidden',
      finalMovementAuthority: 'execution_contract',
      finalWeaponAuthority: 'execution_contract',
    });
  }

  get stepSeconds(): number { return this.tacticalHost.stepSeconds; }
  get agentMoveSpeed(): number { return this.tacticalHost.agentMoveSpeed; }

  reset(): TacticalWizardSimulationState {
    this.logistics = null;
    this.reactions.clear();
    this.recoveryPlan = null;
    this.contracts.clear();
    this.dryFireLogged.clear();
    this.lowAmmoLogged.clear();
    this.supplies = createSupplies();
    this.playerCombat = createPlayerCombat(tacticalWizardTestMap.playerStart);
    this.tacticalEffectKind = 'none';
    this.tacticalEffectCenter = null;
    this.tacticalEffectUntilTick = null;
    this.tacticalEffectSequence = 0;
    this.supportHandoffCount = 0;
    this.lastSupportHandoffTick = -999;
    this.commanderStationarySeconds = 0;
    this.commanderLastPosition = null;
    this.lastConfirmedPosition = null;
    this.previousConfirmedPosition = null;
    this.lastConfirmedTick = null;
    this.threatSourceAgentId = null;
    this.threatBearing = null;
    this.threatSector = null;
    this.threatLastHitTick = null;
    this.threatUntilTick = -1;
    this.rescueInterruptedCount = 0;
    this.lastRescueInterruptedTick = null;
    this.tacticalHost.reset();
    this.initializeEquipment();
    this.commanderLastPosition = this.hostState().agents.find((agent) => agent.id === NOMINAL_COMMANDER_ID)?.position ?? null;
    this.hostAccess().log('system', 'simulation', 'Volition Simulation', 'session', 'Fixed tactical hierarchy runtime reset.', {
      architecture: 'fixed_tactical_hierarchy',
      versionOverlayPolicy: 'forbidden',
    });
    return this.getState();
  }

  step(): TacticalWizardSimulationState { return this.advance(this.stepSeconds); }

  advance(deltaSeconds: number): TacticalWizardSimulationState {
    const before = this.hostState();
    this.expireTransientState(before.logicalTick);
    this.startRecoveryIfNeeded(before);
    this.completeLogisticsIfArrived(before);
    this.planLogistics(before);
    this.ensureFireSupportCapability(before);

    this.tacticalHost.advance(deltaSeconds);

    const after = this.hostState();
    this.observeCommander(after, deltaSeconds);
    this.observeContact(after);
    this.startRecoveryIfNeeded(after);
    this.progressRecovery(after, deltaSeconds);
    this.completeLogisticsIfArrived(after);
    this.planLogistics(after);
    this.ensureFireSupportCapability(after);
    this.decayPlayerCombat(deltaSeconds);
    return this.getState();
  }

  getState(): TacticalWizardSimulationState {
    const base = this.hostState();
    const agents = base.agents.map((agent) => this.agentView(agent, base));
    const actingCommander = agents.find((agent) => agent.id === NOMINAL_COMMANDER_ID && agent.alive)
      ?? agents.filter((agent) => agent.alive).sort((left, right) => left.id.localeCompare(right.id, 'en'))[0]
      ?? null;
    const contracts = agents.map((agent) => this.contractView(agent, base));
    const confirmedVisualIds = agents.filter((agent) => agent.alive && agent.targetVisible).map((agent) => agent.id);
    const livingCount = agents.filter((agent) => agent.alive).length;
    const recovery = this.recoveryView(base);
    const security = recovery.covererId === null ? null : agents.find((agent) => agent.id === recovery.covererId) ?? null;
    const threatActive = base.logicalTick < this.threatUntilTick;
    const effectRemaining = this.tacticalEffectUntilTick === null ? 0 : Math.max(0, this.tacticalEffectUntilTick - base.logicalTick);

    return {
      ...base,
      agents,
      commanderId: actingCommander?.id ?? NOMINAL_COMMANDER_ID,
      command: {
        commanderId: actingCommander?.id ?? NOMINAL_COMMANDER_ID,
        order: this.commandOrder(base),
        activeResupplyAgentId: this.logistics?.agentId ?? null,
        activeResupplySupplyId: this.logistics?.supplyId ?? null,
        commanderStationarySeconds: Number(this.commanderStationarySeconds.toFixed(2)),
        supportHandoffCount: this.supportHandoffCount,
        lastSupportHandoffTick: this.lastSupportHandoffTick < 0 ? null : this.lastSupportHandoffTick,
      },
      playerCombat: {
        ...this.playerCombat,
        facing: { ...this.playerCombat.facing },
        aimTarget: { ...this.playerCombat.aimTarget },
        grenadeInventory: { ...this.playerCombat.grenadeInventory },
        shotFrom: clonePoint(this.playerCombat.shotFrom),
        shotTo: clonePoint(this.playerCombat.shotTo),
      },
      tacticalEffect: {
        kind: effectRemaining > 0 ? this.tacticalEffectKind : 'none',
        sourceGrenadeId: effectRemaining > 0 ? this.tacticalEffectSequence : null,
        center: effectRemaining > 0 ? clonePoint(this.tacticalEffectCenter) : null,
        untilTick: effectRemaining > 0 ? this.tacticalEffectUntilTick : null,
        remainingTicks: effectRemaining,
      },
      supplies: this.supplies.map((supply) => ({ ...supply, position: { ...supply.position }, depleted: supply.ammoRounds <= 0 && supply.grenades <= 0 && supply.medkits <= 0 })),
      recovery,
      recoverySafety: {
        runtimeVersion: 'fixed-hierarchy',
        active: recovery.phase !== 'none',
        safetyReplans: 0,
        safetyAborts: 0,
        security: {
          agentId: security?.id ?? null,
          weaponReady: security?.ammoRounds !== undefined && security.ammoRounds >= AMMO_PER_BURST,
          positionReady: security !== null,
          lineOfSightReady: security?.targetVisible ?? false,
          fireLaneReady: security !== null && base.safeFireLanes > 0,
          reactionReady: security === null || security.reactionState === 'none' || security.reactionState === 'grenade_suppress',
        },
      },
      dynamicRecovery: {
        active: recovery.phase !== 'none',
        stagePoint: recovery.covererId === null ? null : clonePoint(agents.find((agent) => agent.id === recovery.covererId)?.position ?? null),
        treatmentPoint: clonePoint(recovery.approachTarget),
        securityPoint: recovery.covererId === null ? null : clonePoint(agents.find((agent) => agent.id === recovery.covererId)?.tacticalTarget ?? null),
      },
      threatResponse: {
        active: threatActive,
        phase: threatActive ? 'break_contact' : 'none',
        sourceAgentId: threatActive ? this.threatSourceAgentId : null,
        bearing: threatActive ? clonePoint(this.threatBearing) : null,
        estimatedSector: threatActive ? clonePoint(this.threatSector) : null,
        startedTick: threatActive && this.threatLastHitTick !== null ? this.threatLastHitTick : null,
        lastHitTick: this.threatLastHitTick,
        smokeDeployed: false,
        smokeOwnerId: null,
        defensiveCoverTargets: {},
        rescueCoverTarget: recovery.covererId === null ? null : clonePoint(agents.find((agent) => agent.id === recovery.covererId)?.tacticalTarget ?? null),
        rescueInterruptedCount: this.rescueInterruptedCount,
        lastRescueInterruptedTick: this.lastRescueInterruptedTick,
      },
      threatAwareness: {
        level: confirmedVisualIds.length > 0 ? 'confirmed' : threatActive ? 'threatened' : 'none',
        confidence: confirmedVisualIds.length > 0 ? 1 : threatActive ? 0.72 : 0,
        bearing: threatActive ? clonePoint(this.threatBearing) : null,
        estimatedSector: threatActive ? clonePoint(this.threatSector) : null,
        lastEvidenceTick: this.threatLastHitTick,
        lastEvidenceKind: this.threatLastHitTick === null ? null : 'hit',
        evidenceCount: this.threatLastHitTick === null ? 0 : 1,
        evidenceCounts: { gunshot: 0, bullet_impact: 0, near_miss: 0, hit: this.threatLastHitTick === null ? 0 : 1 },
        affectedAgentIds: this.threatSourceAgentId === null ? [] : [this.threatSourceAgentId],
        responseEscalations: this.threatLastHitTick === null ? 0 : 1,
      },
      cohesion: {
        active: recovery.phase !== 'none',
        patientId: recovery.downedAgentId,
        patientBand: recovery.downedAgentId === null ? null : 'downed',
        buddyId: recovery.rescuerId,
        securityId: recovery.covererId,
        reason: recovery.phase === 'none' ? 'none' : 'critical_health',
        rallyPoint: clonePoint(recovery.approachTarget),
        buddySupportPoint: clonePoint(recovery.approachTarget),
        buddyDistance: recovery.downedAgentId === null || recovery.rescuerId === null ? null : distanceBetween(agents, recovery.downedAgentId, recovery.rescuerId),
        maxBuddyDistance: 6.5,
      },
      leadership: {
        nominalCommanderId: NOMINAL_COMMANDER_ID,
        actingCommanderId: actingCommander?.id ?? null,
        livingCount,
        capability: livingCount >= 3 ? 'full_squad' : livingCount === 2 ? 'reduced_pair' : livingCount === 1 ? 'single_survivor' : 'combat_ineffective',
        successionActive: actingCommander !== null && actingCommander.id !== NOMINAL_COMMANDER_ID,
      },
      contactTrack: {
        episodeId: this.lastConfirmedTick === null ? 0 : 1,
        status: confirmedVisualIds.length > 0 ? 'confirmed' : base.squad.alertState === 'active' ? (base.squad.tactic === 'sweep' ? 'searching' : 'lost_fresh') : 'none',
        previousConfirmedPosition: clonePoint(this.previousConfirmedPosition),
        lastConfirmedPosition: clonePoint(this.lastConfirmedPosition ?? base.squad.sharedLastKnownPosition),
        lastConfirmedTick: this.lastConfirmedTick,
        egressDirection: this.previousConfirmedPosition === null || this.lastConfirmedPosition === null ? null : normalizedDelta(this.previousConfirmedPosition, this.lastConfirmedPosition),
        confidence: confirmedVisualIds.length > 0 ? 1 : base.squad.alertState === 'active' ? 0.72 : 0,
        uncertaintyRadius: confirmedVisualIds.length > 0 ? 1.5 : Math.min(12, 1.5 + base.squad.lostContactTicks * 0.4),
        lkpCleared: false,
        lkpClearedTick: null,
        verifiedBy: confirmedVisualIds,
        clearedSearchNodes: [],
        frontier: [],
      },
      combatAuthority: {
        source: 'fixed_hierarchy',
        searchPhase: base.squad.tactic === 'sweep' ? (confirmedVisualIds.length > 0 ? 'reacquire' : 'search_frontier') : 'none',
        confirmedVisualIds,
        commitments: contracts.map((contract) => ({ agentId: contract.agentId, commitment: contract.movementOwner, priority: commitmentPriority(contract.movementOwner), reason: contract.reason })),
        logisticsPreemptions: 0,
        rescueLaneReplans: 0,
        supplementalBursts: 0,
        grenadePolicy: 'purpose_gated',
      },
      logisticsLifecycle: {
        state: this.logistics === null ? 'idle' : 'assigned',
        agentId: this.logistics?.agentId ?? null,
        supplyId: this.logistics?.supplyId ?? null,
        task: this.logistics?.task ?? null,
        suspendedUntilTick: null,
        suppressedPlanningCalls: 0,
      },
      executionAuthority: {
        runtimeVersion: 'fixed-hierarchy',
        architecture: 'fixed_tactical_hierarchy',
        layers: LAYERS,
        finalMovementAuthority: 'execution_contract',
        finalWeaponAuthority: 'execution_contract',
        versionOverlayPolicy: 'forbidden',
        contracts,
      },
      threatAuthority: { bodyAttentionSeparated: true },
    };
  }

  emitNoise(): void { this.tacticalHost.emitNoise(); }

  setPlayerPosition(point: GridPoint): boolean {
    const moved = this.tacticalHost.setPlayerPosition(point);
    if (moved) {
      const state = this.hostState();
      this.playerCombat.aimTarget = { ...state.player };
    }
    return moved;
  }

  nudgePlayer(dx: number, dy: number): boolean { return this.tacticalHost.nudgePlayer(dx, dy); }

  setPlayerAimTarget(point: GridPoint): boolean {
    const state = this.hostState();
    const dx = point.x - state.player.x;
    const dy = point.y - state.player.y;
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    this.playerCombat.aimTarget = { ...point };
    if (length > 1e-6) this.playerCombat.facing = { x: dx / length, y: dy / length };
    return true;
  }

  playerFireAt(point: GridPoint): boolean {
    if (!this.setPlayerAimTarget(point)) return false;
    const state = this.hostState();
    this.playerCombat.shotPulse = 4;
    this.playerCombat.shotFrom = { ...state.player };
    this.playerCombat.shotTo = { ...point };
    this.playerCombat.shotsRecent = Math.min(8, this.playerCombat.shotsRecent + 1);
    this.playerCombat.firePressure = Math.min(1, this.playerCombat.firePressure + 0.2);
    this.tacticalHost.emitNoise(1);

    const target = [...state.agents]
      .filter((agent) => this.equipment.get(agent.id)?.health !== undefined && this.equipment.get(agent.id)!.health > 0)
      .map((agent) => ({ agent, distance: Math.hypot(agent.position.x - point.x, agent.position.y - point.y) }))
      .filter((entry) => entry.distance <= 0.85)
      .sort((left, right) => left.distance - right.distance || left.agent.id.localeCompare(right.agent.id, 'en'))[0]?.agent ?? null;

    this.hostAccess().log('player', 'player', 'Player', 'fire', 'Player fired; fixed hierarchy evaluated hit and reaction.', {
      from: { ...state.player },
      to: { ...point },
      hitAgentId: target?.id ?? null,
      damage: target === null ? 0 : PLAYER_DAMAGE,
      shotsRecent: this.playerCombat.shotsRecent,
      firePressure: Number(this.playerCombat.firePressure.toFixed(2)),
    });
    if (target !== null) this.damageAgent(target.id, PLAYER_DAMAGE, state.player, 'player_rifle');
    return true;
  }

  playerThrowGrenadeAt(point: GridPoint): boolean {
    const kind = this.playerCombat.selectedGrenade;
    if (this.playerCombat.grenadeInventory[kind] <= 0) return false;
    this.playerCombat.grenadeInventory[kind] -= 1;
    this.tacticalEffectSequence += 1;
    this.tacticalEffectCenter = { ...point };
    const tick = this.hostState().logicalTick;
    if (kind === 'flash') {
      this.tacticalEffectKind = 'flash_push';
      this.tacticalEffectUntilTick = tick + 7;
    } else if (kind === 'smoke') {
      this.tacticalEffectKind = 'smoke_retreat';
      this.tacticalEffectUntilTick = tick + 9;
    } else {
      this.tacticalEffectKind = 'frag_suppression';
      this.tacticalEffectUntilTick = tick + 7;
    }
    this.applyGrenadeEffect(kind, point, 'player');
    this.hostAccess().log('player', 'player', 'Player', 'fire', `Player threw ${kind} grenade.`, { grenadeKind: kind, target: { ...point } });
    return true;
  }

  cyclePlayerGrenade(delta: number): GrenadeKind {
    const order: GrenadeKind[] = ['flash', 'frag', 'smoke'];
    const index = order.indexOf(this.playerCombat.selectedGrenade);
    const next = (index + Math.sign(delta) + order.length) % order.length;
    this.playerCombat.selectedGrenade = order[next]!;
    return this.playerCombat.selectedGrenade;
  }

  setAgentEquipment(agentId: string, values: { readonly ammoRounds?: number; readonly grenades?: number }): boolean {
    const equipment = this.equipment.get(agentId);
    const member = this.hostAccess().members.find((entry) => entry.id === agentId);
    if (equipment === undefined || member === undefined) return false;
    if (values.ammoRounds !== undefined) {
      equipment.ammoRounds = clamp(Math.round(values.ammoRounds), 0, equipment.ammoCapacity);
      if (equipment.ammoRounds > AMMO_LOW) this.lowAmmoLogged.delete(agentId);
      if (equipment.ammoRounds >= AMMO_PER_BURST) this.dryFireLogged.delete(agentId);
    }
    if (values.grenades !== undefined) member.grenadeCount = clamp(Math.round(values.grenades), 0, 5);
    if (this.logistics?.agentId === agentId && equipment.ammoRounds > AMMO_LOW && member.grenadeCount > 1) this.finishLogistics('manual equipment update satisfied the commitment');
    return true;
  }

  setAgentVitals(agentId: string, values: { readonly health?: number }): boolean {
    const equipment = this.equipment.get(agentId);
    if (equipment === undefined) return false;
    if (values.health !== undefined) {
      equipment.health = clamp(Math.round(values.health), 0, equipment.maxHealth);
      if (equipment.health <= 0) {
        const member = this.hostAccess().members.find((entry) => entry.id === agentId);
        this.reactions.set(agentId, { kind: 'downed', target: member === undefined ? null : { ...member.position }, untilTick: Number.MAX_SAFE_INTEGER });
      } else if (this.reactions.get(agentId)?.kind === 'downed') this.reactions.delete(agentId);
    }
    this.startRecoveryIfNeeded(this.hostState());
    return true;
  }

  applyGrenadeDoctrineForTest(kind: GrenadeKind, center: GridPoint, ownerId?: string): void {
    this.applyGrenadeEffect(kind, center, ownerId ?? 'test');
  }

  injectIncomingFireForTest(agentId: string, from: GridPoint): boolean {
    const member = this.hostAccess().members.find((entry) => entry.id === agentId);
    const equipment = this.equipment.get(agentId);
    if (member === undefined || equipment === undefined || equipment.health <= 0) return false;
    const away = normalizedDelta(from, member.position);
    const target = { x: member.position.x + away.x * 2.5, y: member.position.y + away.y * 2.5 };
    const tick = this.hostState().logicalTick;
    this.reactions.set(agentId, { kind: 'dodge', target, untilTick: tick + 4 });
    this.threatSourceAgentId = agentId;
    this.threatBearing = normalizedDelta(member.position, from);
    this.threatSector = { x: member.position.x + this.threatBearing.x * 8, y: member.position.y + this.threatBearing.y * 8 };
    this.threatLastHitTick = tick;
    this.threatUntilTick = tick + 10;
    if (this.recoveryPlan !== null && (this.recoveryPlan.rescuerId === agentId || this.recoveryPlan.covererId === agentId)) {
      this.rescueInterruptedCount += 1;
      this.lastRescueInterruptedTick = tick;
    }
    return true;
  }

  private installHostExecutionBoundary(): void {
    const host = this.hostAccess();
    const originalMovementTarget = host.movementTarget.bind(this.tacticalHost);
    const originalTryFire = host.tryFire.bind(this.tacticalHost);
    const originalTryGrenade = host.tryGrenade.bind(this.tacticalHost);
    const originalTryMelee = host.tryMelee.bind(this.tacticalHost);
    const originalCanSeePlayer = host.canSeePlayer.bind(this.tacticalHost);
    const originalSafeFireLaneCount = host.safeFireLaneCount.bind(this.tacticalHost);

    host.movementTarget = (member: HostMember): GridPoint | null => {
      const tacticalProposal = originalMovementTarget(member);
      const contract = this.resolveContract(member, tacticalProposal);
      this.contracts.set(member.id, contract);
      return clonePoint(contract.movementTarget);
    };

    host.tryFire = (member: HostMember, target: GridPoint, reason: string): void => {
      const tacticalProposal = originalMovementTarget(member);
      const contract = this.resolveContract(member, tacticalProposal);
      const equipment = this.equipment.get(member.id);
      if (equipment === undefined || !contract.weaponAuthorized || equipment.ammoRounds < AMMO_PER_BURST) {
        if (equipment !== undefined && equipment.ammoRounds < AMMO_PER_BURST && !this.dryFireLogged.has(member.id)) {
          this.dryFireLogged.add(member.id);
          host.log('agent', member.id, member.label, 'fire', `${member.label} withheld fire: ammunition exhausted.`, { blocked: true, reason: 'out_of_ammo', task: member.task, tactic: host.tactic, ammoRounds: equipment.ammoRounds });
        }
        return;
      }
      const beforePulse = member.firePulse;
      originalTryFire(member, target, reason);
      if (member.firePulse <= beforePulse) return;
      equipment.ammoRounds = Math.max(0, equipment.ammoRounds - AMMO_PER_BURST);
      if (equipment.ammoRounds <= AMMO_LOW && !this.lowAmmoLogged.has(member.id)) {
        this.lowAmmoLogged.add(member.id);
        host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', `${member.label} entered ammunition recovery planning reserve.`, { agentId: member.id, ammoRounds: equipment.ammoRounds, threshold: AMMO_LOW });
      }
    };

    host.tryGrenade = (member: HostMember): boolean => {
      const contract = this.resolveContract(member, originalMovementTarget(member));
      if (!contract.throwableAuthorized) return false;
      return originalTryGrenade(member);
    };

    host.tryMelee = (member: HostMember): boolean => {
      const contract = this.resolveContract(member, originalMovementTarget(member));
      if (contract.planOwner !== 'tactical' || !this.isAlive(member.id)) return false;
      return originalTryMelee(member);
    };

    host.canSeePlayer = (member: HostMember): boolean => this.isAlive(member.id) && originalCanSeePlayer(member);

    host.safeFireLaneCount = (): number => {
      const geometric = originalSafeFireLaneCount();
      if (geometric <= 0) return 0;
      const armedOwners = host.members.filter((member) => {
        const equipment = this.equipment.get(member.id);
        if (equipment === undefined || equipment.health <= 0 || equipment.ammoRounds < AMMO_PER_BURST) return false;
        if (this.logistics?.agentId === member.id) return false;
        if (this.recoveryPlan?.rescuerId === member.id) return false;
        return member.task === 'suppress' || member.task === 'crossfire' || member.task === 'hold_cover' || member.task === 'overwatch';
      }).length;
      return Math.min(geometric, armedOwners);
    };
  }

  private resolveContract(member: HostMember, tacticalProposal: GridPoint | null): ExecutionContract {
    const state = this.hostState();
    const agent = state.agents.find((entry) => entry.id === member.id);
    const equipment = this.equipment.get(member.id) ?? defaultEquipment(member.id);
    const reaction = this.activeReaction(member.id, state.logicalTick);
    const recovery = this.recoveryCommitment(member.id, state);
    return resolveExecutionContract({
      agentId: member.id,
      logicalTick: state.logicalTick,
      position: member.position,
      alertState: state.squad.alertState,
      tactic: state.squad.tactic,
      tacticalTask: member.task,
      tacticalTarget: clonePoint(member.tacticalTarget),
      tacticalProposal: clonePoint(tacticalProposal),
      capability: capabilitySnapshot(equipment.health > 0, equipment.ammoRounds, member.grenadeCount),
      logistics: this.logistics?.agentId === member.id ? this.logistics : null,
      reaction,
      recovery,
    });
  }

  private contractView(agent: TacticalWizardAgentView, state: TacticalHostState): ExecutionContractView {
    const member = this.hostAccess().members.find((entry) => entry.id === agent.id);
    const cached = this.contracts.get(agent.id);
    const contract = cached?.logicalTick === state.logicalTick
      ? cached
      : member === undefined
        ? resolveExecutionContract({ agentId: agent.id, logicalTick: state.logicalTick, position: agent.position, alertState: state.squad.alertState, tactic: state.squad.tactic, tacticalTask: agent.task, tacticalTarget: clonePoint(agent.tacticalTarget), tacticalProposal: clonePoint(agent.tacticalTarget), capability: capabilitySnapshot(agent.alive, agent.ammoRounds, agent.grenadeCount), logistics: null, reaction: null, recovery: { role: 'none', target: null, patientId: null } })
        : this.resolveContract(member, member.tacticalTarget);
    return {
      ...contract,
      movementTarget: clonePoint(contract.movementTarget),
      plannedRole: agent.role,
      plannedTask: agent.task,
      plannedTarget: clonePoint(agent.tacticalTarget),
      logisticsTask: agent.logisticsTask,
      reactionState: agent.reactionState,
      canFire: agent.ammoRounds >= AMMO_PER_BURST && agent.alive,
      canSuppress: agent.ammoRounds >= AMMO_PER_BURST && agent.alive,
    };
  }

  private agentView(agent: TacticalHostAgentView, state: TacticalHostState): TacticalWizardAgentView {
    const equipment = this.equipment.get(agent.id) ?? defaultEquipment(agent.id);
    const reaction = this.activeReaction(agent.id, state.logicalTick);
    const ownLogistics = this.logistics?.agentId === agent.id ? this.logistics : null;
    const recoveryTask = this.recoveryTaskFor(agent.id);
    const locomotionScale = agent.locomotionMode === 'backpedal' ? 0.58 : agent.locomotionMode === 'lateral' ? 0.78 : 1;
    const healthScale = equipment.health <= 0 ? 0 : equipment.health <= 25 ? 0.62 : equipment.health <= 50 ? 0.82 : 1;
    const reactionScale = reaction?.kind === 'stunned' || reaction?.kind === 'downed' || reaction?.kind === 'grenade_suppress' ? 0 : 1;
    const recoveryScale = recoveryTask === 'rescue_treat' ? 0 : 1;
    const taskScale = agent.task === 'suppress' || agent.task === 'hold_cover' ? 0.76 : 1;
    const firingScale = agent.firePulse > 0 ? 0.88 : 1;
    const moveSpeed = AGENT_MOVE_SPEED * locomotionScale * healthScale * reactionScale * recoveryScale * taskScale * firingScale;
    return {
      ...agent,
      selectedIntent: ownLogistics === null ? agent.selectedIntent : 'resupply',
      commandRank: agent.id === NOMINAL_COMMANDER_ID ? 'commander' : 'subordinate',
      commandTendency: agent.id === NOMINAL_COMMANDER_ID ? 'coordinate / maneuver / capability handoff' : 'maneuver / support / logistics',
      ammoRounds: equipment.ammoRounds,
      ammoCapacity: equipment.ammoCapacity,
      burstsRemaining: Math.floor(equipment.ammoRounds / AMMO_PER_BURST),
      grenadeCapacity: 5,
      health: equipment.health,
      maxHealth: equipment.maxHealth,
      alive: equipment.health > 0,
      moveSpeed: Number(moveSpeed.toFixed(2)),
      speedFactors: { base: AGENT_MOVE_SPEED, locomotion: locomotionScale, health: healthScale, firing: firingScale, task: taskScale, reaction: reactionScale, recovery: recoveryScale },
      medkitCount: equipment.medkits,
      medkitCapacity: equipment.medkitCapacity,
      reactionState: reaction?.kind ?? (equipment.health <= 0 ? 'downed' : 'none'),
      reactionTarget: clonePoint(reaction?.target ?? null),
      reactionTicks: reaction === null || reaction.untilTick === Number.MAX_SAFE_INTEGER ? 0 : Math.max(0, reaction.untilTick - state.logicalTick),
      recoveryTask,
      recoveryTargetId: this.recoveryPlan === null ? null : recoveryTask === 'rescue_cover' ? this.recoveryPlan.patientId : recoveryTask === 'rescue_move' || recoveryTask === 'rescue_treat' || recoveryTask === 'rescue_wait_cover' ? this.recoveryPlan.patientId : null,
      recoveryProgress: recoveryTask === 'rescue_treat' ? this.recoveryPlan?.treatmentProgress ?? 0 : 0,
      logisticsTask: ownLogistics?.task ?? 'none',
      resupplyTargetId: ownLogistics?.supplyId ?? null,
      resupplyTargetPosition: clonePoint(ownLogistics?.target ?? null),
      aimThreatSeconds: 0,
    };
  }

  private planLogistics(state: TacticalHostState): void {
    if (this.logistics !== null) return;
    const living = state.agents.map((agent) => ({ id: agent.id, alive: this.isAlive(agent.id), ammoRounds: this.equipment.get(agent.id)?.ammoRounds ?? 0 }));
    const emergency = emergencyResupplyOwner(living);
    const candidates = state.agents
      .filter((agent) => this.isAlive(agent.id))
      .filter((agent) => this.recoveryPlan === null || (agent.id !== this.recoveryPlan.rescuerId && agent.id !== this.recoveryPlan.covererId))
      .map((agent) => {
        const equipment = this.equipment.get(agent.id)!;
        const score = (equipment.ammoRounds <= AMMO_CRITICAL ? 100 : equipment.ammoRounds <= AMMO_LOW ? 50 : 0)
          + (agent.grenadeCount <= 1 ? 8 : 0)
          + (emergency === agent.id ? 1000 : 0);
        return { agent, equipment, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.agent.id.localeCompare(right.agent.id, 'en'));

    for (const { agent, equipment } of candidates) {
      if (!logisticsMayCommit({ agentId: agent.id, alertState: state.squad.alertState, targetVisible: agent.targetVisible, isSuppressor: state.squad.suppressorId === agent.id, ammoRounds: equipment.ammoRounds, grenadeCount: agent.grenadeCount, livingAgents: living })) continue;
      const task = logisticsTaskFor(equipment.ammoRounds, agent.grenadeCount);
      const supply = this.selectSupply(agent.position, task);
      if (supply === null) continue;
      this.logistics = { agentId: agent.id, supplyId: supply.id, task, target: { ...supply.position }, startedTick: state.logicalTick, reason: emergency === agent.id ? 'all living members are dry; deterministic recovery owner restores squad fire capability' : 'approved capability recovery commitment' };
      this.handoffSupport(agent.id, `approved ${task} commitment`, true);
      this.hostAccess().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', `${agent.label} committed to field resupply; tactical lease released until completion.`, { agentId: agent.id, supplyId: supply.id, task, ammoRounds: equipment.ammoRounds, emergency: emergency === agent.id });
      return;
    }
  }

  private completeLogisticsIfArrived(state: TacticalHostState): void {
    const assignment = this.logistics;
    if (assignment === null) return;
    const agent = state.agents.find((entry) => entry.id === assignment.agentId);
    const member = this.hostAccess().members.find((entry) => entry.id === assignment.agentId);
    const supply = this.supplies.find((entry) => entry.id === assignment.supplyId);
    const equipment = this.equipment.get(assignment.agentId);
    if (agent === undefined || member === undefined || supply === undefined || equipment === undefined || !this.isAlive(assignment.agentId)) {
      this.finishLogistics('assignment became invalid');
      return;
    }
    if (Math.hypot(agent.position.x - supply.position.x, agent.position.y - supply.position.y) > RESUPPLY_RADIUS) return;
    const ammoTaken = Math.min(equipment.ammoCapacity - equipment.ammoRounds, supply.ammoRounds);
    const grenadeTaken = Math.min(5 - member.grenadeCount, supply.grenades);
    const medTaken = Math.min(equipment.medkitCapacity - equipment.medkits, supply.medkits);
    equipment.ammoRounds += ammoTaken;
    member.grenadeCount += grenadeTaken;
    equipment.medkits += medTaken;
    supply.ammoRounds -= ammoTaken;
    supply.grenades -= grenadeTaken;
    supply.medkits -= medTaken;
    this.dryFireLogged.delete(agent.id);
    if (equipment.ammoRounds > AMMO_LOW) this.lowAmmoLogged.delete(agent.id);
    this.hostAccess().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', `${agent.label} completed field resupply and returned the execution lease to Tactical Planning.`, { agentId: agent.id, supplyId: supply.id, ammoTaken, grenadesTaken: grenadeTaken, medkitsTaken: medTaken, ammoRounds: equipment.ammoRounds });
    this.finishLogistics('resupply completed');
  }

  private finishLogistics(reason: string): void {
    if (this.logistics === null) return;
    const agentId = this.logistics.agentId;
    this.logistics = null;
    this.contracts.delete(agentId);
    const host = this.hostAccess();
    if (host.alertState === 'active') {
      host.applyRoles();
      host.refreshTacticalPlan();
    }
    host.pushEvent(`T${host.logicalTick}: ${agentId.split(':').at(-1)} logistics commitment ended; ${reason}.`);
  }

  private selectSupply(from: GridPoint, task: Exclude<LogisticsTask, 'none'>): MutableSupply | null {
    const start = navCell(from);
    return this.supplies
      .filter((supply) => supplySatisfies(supply, task))
      .map((supply) => ({ supply, path: findPath(tacticalWizardNavigationGrid, start, supply.position) }))
      .filter((entry) => entry.path.length > 0)
      .sort((left, right) => left.path.length - right.path.length || left.supply.id.localeCompare(right.supply.id, 'en'))[0]?.supply ?? null;
  }

  private ensureFireSupportCapability(state: TacticalHostState): void {
    if (state.squad.alertState !== 'active' || state.squad.suppressorId === null) return;
    const suppressorEquipment = this.equipment.get(state.squad.suppressorId);
    const suppressorUnavailable = suppressorEquipment === undefined || suppressorEquipment.health <= 0 || suppressorEquipment.ammoRounds < AMMO_PER_BURST || this.logistics?.agentId === state.squad.suppressorId;
    if (!suppressorUnavailable) return;
    this.handoffSupport(state.squad.suppressorId, 'current suppressor is not fire-capable', false);
  }

  private handoffSupport(outgoingId: string, reason: string, urgent: boolean): boolean {
    const host = this.hostAccess();
    if (host.alertState !== 'active' || host.suppressorId !== outgoingId) return false;
    if (!urgent && host.logicalTick - this.lastSupportHandoffTick < SUPPORT_HANDOFF_COOLDOWN) return false;
    const candidate = host.members
      .filter((member) => member.id !== outgoingId && member.id !== this.logistics?.agentId && this.isAlive(member.id) && (this.equipment.get(member.id)?.ammoRounds ?? 0) >= AMMO_PER_BURST)
      .sort((left, right) => Number(right.targetVisible) - Number(left.targetVisible) || (this.equipment.get(right.id)?.ammoRounds ?? 0) - (this.equipment.get(left.id)?.ammoRounds ?? 0) || left.id.localeCompare(right.id, 'en'))[0];
    if (candidate === undefined) return false;
    if (host.moverId === candidate.id) host.moverId = outgoingId;
    else if (host.observerId === candidate.id) host.observerId = outgoingId;
    else return false;
    host.suppressorId = candidate.id;
    this.lastSupportHandoffTick = host.logicalTick;
    this.supportHandoffCount += 1;
    host.applyRoles();
    host.refreshTacticalPlan();
    host.log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'roles', 'Fire-support responsibility moved to a fire-capable member through Tactical Planning.', { from: outgoingId, to: candidate.id, reason, supportHandoffCount: this.supportHandoffCount });
    return true;
  }

  private startRecoveryIfNeeded(state: TacticalHostState): void {
    if (this.recoveryPlan !== null) {
      if (this.isAlive(this.recoveryPlan.patientId)) this.recoveryPlan = null;
      else return;
    }
    const patient = state.agents.find((agent) => !this.isAlive(agent.id));
    if (patient === undefined) return;
    const living = state.agents.filter((agent) => this.isAlive(agent.id));
    const rescuer = living
      .filter((agent) => (this.equipment.get(agent.id)?.medkits ?? 0) > 0 && agent.id !== this.logistics?.agentId)
      .sort((left, right) => distance(left.position, patient.position) - distance(right.position, patient.position) || left.id.localeCompare(right.id, 'en'))[0]
      ?? living.filter((agent) => (this.equipment.get(agent.id)?.medkits ?? 0) > 0).sort((left, right) => left.id.localeCompare(right.id, 'en'))[0];
    if (rescuer === undefined) return;
    const coverer = living
      .filter((agent) => agent.id !== rescuer.id && agent.id !== this.logistics?.agentId && (this.equipment.get(agent.id)?.ammoRounds ?? 0) >= AMMO_PER_BURST)
      .sort((left, right) => Number(right.targetVisible) - Number(left.targetVisible) || right.id.localeCompare(left.id, 'en'))[0]
      ?? living.filter((agent) => agent.id !== rescuer.id && agent.id !== this.logistics?.agentId).sort((left, right) => left.id.localeCompare(right.id, 'en'))[0]
      ?? null;
    this.recoveryPlan = { patientId: patient.id, rescuerId: rescuer.id, covererId: coverer?.id ?? null, phase: 'establish_cover', startedTick: state.logicalTick, treatmentProgress: 0 };
    this.handoffSupport(rescuer.id, 'rescuer released from fire-support duty', true);
    this.hostAccess().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Recovery contract committed atomically through the fixed hierarchy.', { patientId: patient.id, rescuerId: rescuer.id, covererId: coverer?.id ?? null });
  }

  private progressRecovery(state: TacticalHostState, deltaSeconds: number): void {
    const plan = this.recoveryPlan;
    if (plan === null) return;
    const patient = state.agents.find((agent) => agent.id === plan.patientId);
    const rescuer = state.agents.find((agent) => agent.id === plan.rescuerId);
    const equipment = this.equipment.get(plan.rescuerId);
    if (patient === undefined || rescuer === undefined || equipment === undefined || !this.isAlive(rescuer.id) || equipment.medkits <= 0) {
      this.recoveryPlan = null;
      this.startRecoveryIfNeeded(state);
      return;
    }
    if (plan.phase === 'establish_cover') {
      if (plan.covererId === null || state.logicalTick - plan.startedTick >= 2) plan.phase = 'approach';
      return;
    }
    const range = distance(rescuer.position, patient.position);
    if (plan.phase === 'approach') {
      if (range <= RECOVERY_RANGE) plan.phase = 'treat';
      return;
    }
    if (range > RECOVERY_RANGE + 0.35) {
      plan.phase = 'approach';
      plan.treatmentProgress = 0;
      return;
    }
    plan.treatmentProgress = Math.min(1, plan.treatmentProgress + Math.max(0, deltaSeconds) / RECOVERY_SECONDS);
    if (plan.treatmentProgress < 1) return;
    const patientEquipment = this.equipment.get(plan.patientId);
    if (patientEquipment === undefined) return;
    equipment.medkits = Math.max(0, equipment.medkits - 1);
    patientEquipment.health = Math.max(55, Math.round(patientEquipment.maxHealth * 0.55));
    this.reactions.delete(plan.patientId);
    this.hostAccess().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Recovery treatment completed; restored member returns to Tactical Planning.', { patientId: plan.patientId, rescuerId: plan.rescuerId, restoredHealth: patientEquipment.health });
    this.recoveryPlan = null;
    this.hostAccess().applyRoles();
    this.hostAccess().refreshTacticalPlan();
  }

  private recoveryCommitment(agentId: string, state: TacticalHostState): { readonly role: RecoveryRole; readonly target: GridPoint | null; readonly patientId: string | null } {
    const plan = this.recoveryPlan;
    if (plan === null) return { role: 'none', target: null, patientId: null };
    const patient = state.agents.find((agent) => agent.id === plan.patientId);
    if (agentId === plan.rescuerId) return { role: 'rescuer', target: clonePoint(patient?.position ?? null), patientId: plan.patientId };
    if (agentId === plan.covererId) {
      const member = state.agents.find((agent) => agent.id === agentId);
      return { role: 'security', target: clonePoint(member?.tacticalTarget ?? member?.position ?? null), patientId: plan.patientId };
    }
    return { role: 'none', target: null, patientId: plan.patientId };
  }

  private recoveryTaskFor(agentId: string): RecoveryTask {
    const plan = this.recoveryPlan;
    if (plan === null) return 'none';
    if (agentId === plan.covererId) return 'rescue_cover';
    if (agentId !== plan.rescuerId) return 'none';
    if (plan.phase === 'establish_cover') return 'rescue_wait_cover';
    if (plan.phase === 'approach') return 'rescue_move';
    return 'rescue_treat';
  }

  private recoveryView(state: TacticalHostState): TacticalWizardSimulationState['recovery'] {
    const plan = this.recoveryPlan;
    if (plan === null) return { phase: 'none', downedAgentId: null, rescuerId: null, covererId: null, approachTarget: null, treatmentProgress: 0, medicalResupplyAgentId: null, medicalResupplySupplyId: null };
    const patient = state.agents.find((agent) => agent.id === plan.patientId);
    return { phase: plan.phase, downedAgentId: plan.patientId, rescuerId: plan.rescuerId, covererId: plan.covererId, approachTarget: clonePoint(patient?.position ?? null), treatmentProgress: plan.treatmentProgress, medicalResupplyAgentId: null, medicalResupplySupplyId: null };
  }

  private activeReaction(agentId: string, tick: number): ReactionCommitment | null {
    const reaction = this.reactions.get(agentId);
    if (reaction === undefined) return null;
    if (reaction.untilTick <= tick && reaction.untilTick !== Number.MAX_SAFE_INTEGER) {
      this.reactions.delete(agentId);
      return null;
    }
    return reaction;
  }

  private expireTransientState(tick: number): void {
    for (const [agentId, reaction] of this.reactions) if (reaction.untilTick !== Number.MAX_SAFE_INTEGER && reaction.untilTick <= tick) this.reactions.delete(agentId);
    if (this.tacticalEffectUntilTick !== null && this.tacticalEffectUntilTick <= tick) {
      this.tacticalEffectKind = 'none';
      this.tacticalEffectCenter = null;
      this.tacticalEffectUntilTick = null;
    }
    if (this.threatUntilTick <= tick) {
      this.threatSourceAgentId = null;
      this.threatBearing = null;
      this.threatSector = null;
    }
  }

  private applyGrenadeEffect(kind: GrenadeKind, center: GridPoint, source: string): void {
    const state = this.hostState();
    for (const agent of state.agents) {
      if (!this.isAlive(agent.id)) continue;
      const range = distance(agent.position, center);
      if (kind === 'flash' && range <= 3.2) this.reactions.set(agent.id, { kind: 'stunned', target: { ...agent.position }, untilTick: state.logicalTick + 6 });
      else if (kind === 'smoke' && range <= 4.2) {
        const away = normalizedDelta(center, agent.position);
        this.reactions.set(agent.id, { kind: 'smoke_retreat', target: { x: agent.position.x + away.x * 3, y: agent.position.y + away.y * 3 }, untilTick: state.logicalTick + 8 });
      } else if (kind === 'frag') {
        if (range <= 2.6) this.damageAgent(agent.id, PLAYER_FRAG_DAMAGE, center, `${source}_frag`);
        if (this.isAlive(agent.id) && range <= 5.2) this.reactions.set(agent.id, { kind: 'grenade_suppress', target: { ...agent.position }, untilTick: state.logicalTick + 7 });
      }
    }
  }

  private damageAgent(agentId: string, damage: number, source: GridPoint, reason: string): void {
    const equipment = this.equipment.get(agentId);
    const member = this.hostAccess().members.find((entry) => entry.id === agentId);
    if (equipment === undefined || member === undefined || equipment.health <= 0) return;
    equipment.health = Math.max(0, equipment.health - Math.max(0, Math.round(damage)));
    const tick = this.hostState().logicalTick;
    if (equipment.health <= 0) {
      this.reactions.set(agentId, { kind: 'downed', target: { ...member.position }, untilTick: Number.MAX_SAFE_INTEGER });
      if (this.logistics?.agentId === agentId) this.finishLogistics('assigned member became downed');
    } else {
      const away = normalizedDelta(source, member.position);
      this.reactions.set(agentId, { kind: 'dodge', target: { x: member.position.x + away.x * 2.2, y: member.position.y + away.y * 2.2 }, untilTick: tick + 4 });
    }
    this.threatSourceAgentId = agentId;
    this.threatBearing = normalizedDelta(member.position, source);
    this.threatSector = { x: member.position.x + this.threatBearing.x * 8, y: member.position.y + this.threatBearing.y * 8 };
    this.threatLastHitTick = tick;
    this.threatUntilTick = tick + 10;
    this.hostAccess().log('agent', agentId, member.label, 'decision', `${member.label} health changed from incoming threat.`, { health: equipment.health, damage, reason });
    this.startRecoveryIfNeeded(this.hostState());
  }

  private observeCommander(state: TacticalHostState, deltaSeconds: number): void {
    const commander = state.agents.find((agent) => agent.id === NOMINAL_COMMANDER_ID);
    if (commander === undefined || !this.isAlive(commander.id)) return;
    if (this.commanderLastPosition === null) {
      this.commanderLastPosition = { ...commander.position };
      return;
    }
    if (distance(commander.position, this.commanderLastPosition) <= 0.03) this.commanderStationarySeconds += Math.max(0, deltaSeconds);
    else this.commanderStationarySeconds = 0;
    this.commanderLastPosition = { ...commander.position };
  }

  private observeContact(state: TacticalHostState): void {
    const confirmed = state.agents.some((agent) => this.isAlive(agent.id) && agent.targetVisible);
    const point = state.squad.sharedLastKnownPosition;
    if (!confirmed || point === null) return;
    if (this.lastConfirmedPosition === null || distance(this.lastConfirmedPosition, point) > 0.05) {
      this.previousConfirmedPosition = clonePoint(this.lastConfirmedPosition);
      this.lastConfirmedPosition = { ...point };
    }
    this.lastConfirmedTick = state.logicalTick;
  }

  private decayPlayerCombat(deltaSeconds: number): void {
    this.playerCombat.shotPulse = Math.max(0, this.playerCombat.shotPulse - Math.max(1, Math.round(deltaSeconds * 30)));
    if (this.playerCombat.shotPulse === 0) {
      this.playerCombat.shotFrom = null;
      this.playerCombat.shotTo = null;
    }
    this.playerCombat.firePressure = Math.max(0, this.playerCombat.firePressure - Math.max(0, deltaSeconds) * 0.12);
    if (this.playerCombat.firePressure <= 0.02) this.playerCombat.shotsRecent = 0;
  }

  private commandOrder(state: TacticalHostState): string {
    if (this.recoveryPlan !== null) return 'Recovery owns casualty approach/security; Tactical Planning keeps the remaining element coherent.';
    if (this.logistics !== null) return `${this.logistics.agentId.split(':').at(-1)} has an approved ${this.logistics.task} lease; remaining members retain the current tactical plan.`;
    if (state.squad.alertState !== 'active') return 'Patrol as a compact element; restore capability before contact when practical.';
    if (state.squad.tactic === 'bounding') return 'Bound under one fire-capable support lane; rotate roles only through Tactical Planning.';
    if (state.squad.tactic === 'flank') return 'Fix contact and move the committed flanker while preserving a fire-capable support element.';
    if (state.squad.tactic === 'crossfire') return 'Maintain separated sectors only while the assigned firing elements remain weapon-capable.';
    if (state.squad.tactic === 'assault') return 'Exploit the existing geometry only while fire capability remains valid.';
    if (state.squad.tactic === 'sweep') return 'Search through the existing lead/cover/overwatch contract.';
    return 'Recover spacing and capability before the next maneuver.';
  }

  private initializeEquipment(): void {
    this.equipment.clear();
    for (const agent of this.hostState().agents) this.equipment.set(agent.id, defaultEquipment(agent.id));
  }

  private isAlive(agentId: string): boolean { return (this.equipment.get(agentId)?.health ?? 0) > 0; }
  private hostState(): TacticalHostState { return this.tacticalHost.getState(); }
  private hostAccess(): HostAccess { return this.tacticalHost as unknown as HostAccess; }
}

function createPlayerCombat(player: GridPoint): MutablePlayerCombat {
  return { facing: { x: -1, y: 0 }, aimTarget: { ...player }, selectedGrenade: 'flash', grenadeInventory: { flash: 3, frag: 3, smoke: 3 }, shotPulse: 0, shotFrom: null, shotTo: null, shotsRecent: 0, firePressure: 0 };
}

function createSupplies(): MutableSupply[] {
  return [
    { id: 'SUP-01', kind: 'ammo', position: { x: 1, y: 31 }, ammoRounds: 90, grenades: 0, medkits: 2 },
    { id: 'SUP-02', kind: 'mixed', position: { x: 59, y: 28 }, ammoRounds: 60, grenades: 2, medkits: 2 },
    { id: 'SUP-03', kind: 'grenade', position: { x: 18, y: 18 }, ammoRounds: 0, grenades: 4, medkits: 1 },
    { id: 'SUP-04', kind: 'ammo', position: { x: 59, y: 21 }, ammoRounds: 90, grenades: 0, medkits: 2 },
    { id: 'SUP-05', kind: 'mixed', position: { x: 29, y: 36 }, ammoRounds: 60, grenades: 2, medkits: 2 },
    { id: 'SUP-06', kind: 'ammo', position: { x: 50, y: 30 }, ammoRounds: 90, grenades: 0, medkits: 2 },
    { id: 'SUP-07', kind: 'grenade', position: { x: 46, y: 3 }, ammoRounds: 0, grenades: 4, medkits: 2 },
    { id: 'SUP-08', kind: 'mixed', position: { x: 42, y: 35 }, ammoRounds: 60, grenades: 2, medkits: 2 },
  ];
}

function defaultEquipment(agentId: string): EquipmentState {
  return { ammoRounds: 96, ammoCapacity: 120, health: 100, maxHealth: 100, medkits: agentId === NOMINAL_COMMANDER_ID ? 2 : 1, medkitCapacity: 2 };
}

function logisticsTaskFor(ammoRounds: number, grenadeCount: number): Exclude<LogisticsTask, 'none'> {
  if (ammoRounds <= AMMO_LOW && grenadeCount <= 1) return 'resupply_mixed';
  if (ammoRounds <= AMMO_LOW) return 'resupply_ammo';
  return 'resupply_grenades';
}

function supplySatisfies(supply: MutableSupply, task: Exclude<LogisticsTask, 'none'>): boolean {
  if (task === 'resupply_ammo') return supply.ammoRounds > 0;
  if (task === 'resupply_grenades') return supply.grenades > 0;
  return supply.ammoRounds > 0 || supply.grenades > 0;
}

function commitmentPriority(owner: ExecutionContract['movementOwner']): number {
  return owner === 'reaction' ? 80 : owner === 'recovery_rescue' ? 95 : owner === 'recovery_security' ? 90 : owner === 'logistics' ? 70 : owner === 'tactical' ? 60 : 10;
}

function navCell(point: GridPoint): GridPoint { return { x: Math.round(point.x), y: Math.round(point.y) }; }
function clonePoint(point: GridPoint | null): GridPoint | null { return point === null ? null : { ...point }; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function distance(a: GridPoint, b: GridPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function normalizedDelta(from: GridPoint, to: GridPoint): GridPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length <= 1e-6 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length };
}
function distanceBetween(agents: readonly TacticalWizardAgentView[], leftId: string, rightId: string): number | null {
  const left = agents.find((agent) => agent.id === leftId);
  const right = agents.find((agent) => agent.id === rightId);
  return left === undefined || right === undefined ? null : Number(distance(left.position, right.position).toFixed(2));
}
