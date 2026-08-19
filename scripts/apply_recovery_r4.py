from pathlib import Path

runtime_path = Path('Apps/Workbench/src/simulation/tacticalWizardRuntime.ts')
runtime = runtime_path.read_text()

def once(old: str, new: str) -> None:
    global runtime
    if old not in runtime:
        raise SystemExit(f'missing exact patch anchor:\n{old[:240]}')
    if runtime.count(old) != 1:
        raise SystemExit(f'patch anchor not unique ({runtime.count(old)}): {old[:160]}')
    runtime = runtime.replace(old, new, 1)

def block(start: str, end: str, replacement: str) -> None:
    global runtime
    i = runtime.find(start)
    if i < 0:
        raise SystemExit(f'missing block start: {start}')
    j = runtime.find(end, i)
    if j < 0:
        raise SystemExit(f'missing block end: {end}')
    runtime = runtime[:i] + replacement + runtime[j:]

once("} from './recoverySafety';\n", "} from './recoverySafety';\nimport { selectRecoveryRoleAssignment, type RecoveryRoleCandidate } from './recoveryArbitration';\n")

once("    readonly deferredUntilTick: number | null;\n    readonly security: {", "    readonly deferredUntilTick: number | null;\n    readonly ownershipMode: 'none' | 'active' | 'deferred';\n    readonly roleSwapCount: number;\n    readonly lastRoleSwapReason: string | null;\n    readonly geometryViability: 'unknown' | 'valid' | 'no_covered_treatment' | 'no_security_lane' | 'no_viable_geometry';\n    readonly livelockCount: number;\n    readonly security: {")

once("const RECOVERY_SECONDS = 2;\nconst SUPPORT_HANDOFF_COOLDOWN = 8;", "const RECOVERY_SECONDS = 2;\nconst RECOVERY_SECURITY_MIN_AMMO = AMMO_PER_BURST * 3;\nconst RECOVERY_SECURITY_RESERVE_ROUNDS = AMMO_PER_BURST * 2;\nconst RECOVERY_SECURITY_FIRE_INTERVAL_TICKS = 2;\nconst SUPPORT_HANDOFF_COOLDOWN = 8;")

once("  private recoveryLastSecurityFireTick = -1;\n  private recoveryLaneBlockedTicks = 0;", "  private recoveryLastSecurityFireTick = -1;\n  private recoveryLaneBlockedTicks = 0;\n  private recoveryOwnershipMode: 'active' | 'deferred' = 'active';\n  private recoveryRoleSwapCount = 0;\n  private recoveryLastRoleSwapReason: string | null = null;\n  private recoveryGeometryViability: 'unknown' | 'valid' | 'no_covered_treatment' | 'no_security_lane' | 'no_viable_geometry' = 'unknown';\n  private recoveryLastDeferredSignature: string | null = null;\n  private recoveryRepeatedDeferredCount = 0;")

once("    this.recoveryLastSecurityFireTick = -1;\n    this.recoveryLaneBlockedTicks = 0;\n    this.recoveryFailedSecurityPoints.clear();", "    this.recoveryLastSecurityFireTick = -1;\n    this.recoveryLaneBlockedTicks = 0;\n    this.recoveryOwnershipMode = 'active';\n    this.recoveryRoleSwapCount = 0;\n    this.recoveryLastRoleSwapReason = null;\n    this.recoveryGeometryViability = 'unknown';\n    this.recoveryLastDeferredSignature = null;\n    this.recoveryRepeatedDeferredCount = 0;\n    this.recoveryFailedSecurityPoints.clear();")

block("  private startRecoveryIfNeeded(state: TacticalHostState): void {", "  private resetRecoverySafetyForOwnerChange(): void {", r'''  private startRecoveryIfNeeded(state: TacticalHostState): void {
    if (state.logicalTick < this.recoveryAbortUntilTick) return;
    if (this.recoveryPlan !== null) {
      this.validateRecoveryContract(state);
      if (this.recoveryPlan !== null) return;
    }
    const patient = state.agents.find((agent) => !this.isAlive(agent.id));
    if (patient === undefined) return;
    const assignment = this.selectRecoveryAssignment(state, patient, null, null);
    if (assignment === null) return;
    if (this.logistics?.agentId === assignment.rescuerId) this.finishLogistics('recovery preempted the only medically capable member');
    if (assignment.covererId !== null && this.logistics?.agentId === assignment.covererId) this.finishLogistics('recovery security preempted logistics');
    const rescuer = state.agents.find((agent) => agent.id === assignment.rescuerId);
    if (rescuer === undefined) return;
    this.recoveryFailedSecurityPoints.clear();
    this.recoveryFailedTreatmentPoints.clear();
    this.recoveryPlan = {
      patientId: patient.id,
      rescuerId: assignment.rescuerId,
      covererId: assignment.covererId,
      phase: assignment.covererId === null ? 'approach' : 'establish_cover',
      startedTick: state.logicalTick,
      treatmentProgress: 0,
      stagePoint: { ...rescuer.position },
      treatmentPoint: { ...patient.position },
      approachPoint: { ...rescuer.position },
      fallbackPoint: { ...rescuer.position },
      treatmentExposed: false,
      pathExposureCells: 0,
      securityPoint: null,
      lastProgressTick: state.logicalTick,
      lastTreatmentProgress: 0,
      lastRescuerDistance: distance(rescuer.position, patient.position),
      stalledTicks: 0,
      stallReplans: 0,
    };
    this.recoveryOwnershipMode = 'active';
    this.recoveryGeometryViability = 'unknown';
    this.recoveryLastDeferredSignature = null;
    this.recoveryRepeatedDeferredCount = 0;
    this.recoveryPressure = 0;
    this.recoverySafetyBand = 'stable';
    this.recoverySafetyDecision = 'continue';
    this.recoveryDeferredUntilTick = -1;
    this.recoveryPauseReason = null;
    this.recoveryWatchdogState = 'idle';
    this.recoveryUnsafeSinceTick = null;
    this.recoveryIneffectiveSinceTick = null;
    const geometryReady = this.replanRecoveryGeometry(state, 'recovery_started', false);
    this.hostAccess().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Recovery contract committed atomically through capability arbitration.', { patientId: patient.id, rescuerId: assignment.rescuerId, covererId: assignment.covererId, roleReason: assignment.reason, geometryReady });
    if (!geometryReady && this.recoveryThreatPoint(state) !== null) this.deferRecovery(state, 'no viable covered treatment geometry at recovery start');
  }

  private validateRecoveryContract(state: TacticalHostState): boolean {
    const plan = this.recoveryPlan;
    if (plan === null) return false;
    const patient = state.agents.find((agent) => agent.id === plan.patientId);
    if (patient === undefined || this.isAlive(plan.patientId)) {
      this.releaseRecoveryOwnership(state, 'patient no longer requires recovery');
      return false;
    }
    const living = state.agents.filter((agent) => this.isAlive(agent.id));
    if (living.length === 0) {
      this.releaseRecoveryOwnership(state, 'no_living_rescuer');
      return false;
    }
    if (this.recoveryOwnershipMode === 'deferred') {
      if (this.recoveryDeferredUntilTick >= 0 && state.logicalTick >= this.recoveryDeferredUntilTick) this.tryResumeDeferredRecovery(state);
      return this.recoveryPlan !== null;
    }

    const assignment = this.selectRecoveryAssignment(state, patient, plan.rescuerId, plan.covererId);
    if (assignment === null) {
      this.releaseRecoveryOwnership(state, 'no_capable_rescuer');
      return false;
    }
    if (assignment.rescuerId !== plan.rescuerId || assignment.covererId !== plan.covererId) {
      this.applyRecoveryAssignment(state, assignment, 'recovery_role_capability_changed');
    }
    return this.recoveryPlan !== null;
  }

  private recoveryRoleCandidates(state: TacticalHostState, patient: TacticalHostAgentView): RecoveryRoleCandidate[] {
    return state.agents.map((agent) => ({
      id: agent.id,
      alive: this.isAlive(agent.id),
      ammoRounds: this.equipment.get(agent.id)?.ammoRounds ?? 0,
      medkits: this.equipment.get(agent.id)?.medkits ?? 0,
      distanceToPatient: distance(agent.position, patient.position),
      targetVisible: agent.targetVisible,
      logisticsCommitted: this.logistics?.agentId === agent.id,
    }));
  }

  private selectRecoveryAssignment(state: TacticalHostState, patient: TacticalHostAgentView, currentRescuerId: string | null, currentCovererId: string | null) {
    return selectRecoveryRoleAssignment({
      candidates: this.recoveryRoleCandidates(state, patient),
      currentRescuerId,
      currentCovererId,
      minSecurityAmmo: RECOVERY_SECURITY_MIN_AMMO,
    });
  }

  private applyRecoveryAssignment(state: TacticalHostState, assignment: NonNullable<ReturnType<typeof selectRecoveryRoleAssignment>>, reason: string): boolean {
    const plan = this.recoveryPlan;
    if (plan === null) return false;
    const previousRescuerId = plan.rescuerId;
    const previousCovererId = plan.covererId;
    const changed = previousRescuerId !== assignment.rescuerId || previousCovererId !== assignment.covererId;
    if (this.logistics?.agentId === assignment.rescuerId) this.finishLogistics('recovery role arbitration preempted logistics');
    if (assignment.covererId !== null && this.logistics?.agentId === assignment.covererId) this.finishLogistics('recovery security arbitration preempted logistics');
    plan.rescuerId = assignment.rescuerId;
    plan.covererId = assignment.covererId;
    plan.phase = assignment.covererId === null ? 'approach' : 'establish_cover';
    plan.securityPoint = null;
    plan.stalledTicks = 0;
    plan.stallReplans = 0;
    plan.lastProgressTick = state.logicalTick;
    const rescuer = state.agents.find((agent) => agent.id === assignment.rescuerId);
    if (rescuer !== undefined) plan.lastRescuerDistance = distance(rescuer.position, plan.treatmentPoint);
    this.recoveryOwnershipMode = 'active';
    this.resetRecoverySafetyForOwnerChange();
    this.contracts.delete(previousRescuerId);
    if (previousCovererId !== null) this.contracts.delete(previousCovererId);
    this.contracts.delete(assignment.rescuerId);
    if (assignment.covererId !== null) this.contracts.delete(assignment.covererId);
    const geometryReady = this.replanRecoveryGeometry(state, changed ? 'recovery_role_swap' : 'recovery_role_revalidated', false);
    if (changed) {
      this.recoveryRoleSwapCount += 1;
      this.recoveryLastRoleSwapReason = reason;
      this.recoveryLastDeferredSignature = null;
      this.recoveryRepeatedDeferredCount = 0;
      this.hostAccess().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'roles', 'Recovery roles were atomically reassigned from current capabilities; casualty reservation and treatment progress were preserved.', {
        patientId: plan.patientId,
        previousRescuerId,
        previousCovererId,
        rescuerId: assignment.rescuerId,
        covererId: assignment.covererId,
        reason,
        treatmentProgressPreserved: Number(plan.treatmentProgress.toFixed(3)),
        roleSwapCount: this.recoveryRoleSwapCount,
        geometryReady,
      });
    }
    return geometryReady;
  }

  private tryResumeDeferredRecovery(state: TacticalHostState): boolean {
    const plan = this.recoveryPlan;
    if (plan === null || this.recoveryOwnershipMode !== 'deferred') return false;
    const patient = state.agents.find((agent) => agent.id === plan.patientId);
    if (patient === undefined || this.isAlive(plan.patientId)) {
      this.releaseRecoveryOwnership(state, 'deferred casualty no longer requires recovery');
      return false;
    }
    const assignment = this.selectRecoveryAssignment(state, patient, plan.rescuerId, plan.covererId);
    if (assignment === null) {
      this.recoveryDeferredUntilTick = state.logicalTick + 12;
      this.recoveryPauseReason = 'no_capable_recovery_pair';
      return false;
    }
    const geometryReady = this.applyRecoveryAssignment(state, assignment, 'deferred_recovery_capability_refresh');
    if (!geometryReady) {
      this.recoveryOwnershipMode = 'deferred';
      this.recoverySafetyDecision = 'none';
      this.recoveryPauseReason = this.recoveryGeometryViability;
      this.recoveryDeferredUntilTick = state.logicalTick + 10;
      this.contracts.delete(assignment.rescuerId);
      if (assignment.covererId !== null) this.contracts.delete(assignment.covererId);
      this.syncHostOperationalContext(state);
      return false;
    }
    this.recoveryOwnershipMode = 'active';
    this.recoveryDeferredUntilTick = -1;
    this.recoveryPauseReason = null;
    this.recoverySafetyDecision = 'continue';
    this.syncHostOperationalContext(state);
    this.hostAccess().applyRoles();
    this.hostAccess().refreshTacticalPlan();
    this.hostAccess().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Deferred Recovery reacquired execution ownership after capability and geometry validation.', { patientId: plan.patientId, rescuerId: plan.rescuerId, covererId: plan.covererId, treatmentProgress: Number(plan.treatmentProgress.toFixed(3)) });
    return true;
  }

''')

once("    this.recoveryIneffectiveSinceTick = null;\n  }\n\n  private releaseRecoveryOwnership", "    this.recoveryIneffectiveSinceTick = null;\n  }\n\n  private releaseRecoveryOwnership")

once("    this.recoveryPlan = null;\n    this.recoveryDeferredUntilTick = -1;", "    this.recoveryPlan = null;\n    this.recoveryOwnershipMode = 'active';\n    this.recoveryGeometryViability = 'unknown';\n    this.recoveryLastDeferredSignature = null;\n    this.recoveryRepeatedDeferredCount = 0;\n    this.recoveryDeferredUntilTick = -1;")

once("    if (!this.validateRecoveryContract(state) || this.recoveryPlan === null) return;\n    const plan = this.recoveryPlan;\n    if (this.recoverySafetyDecision === 'abort')", "    if (!this.validateRecoveryContract(state) || this.recoveryPlan === null) return;\n    if (this.recoveryOwnershipMode === 'deferred') return;\n    const plan = this.recoveryPlan;\n    if (this.recoverySafetyDecision === 'abort')")

once("    const plan = this.recoveryPlan;\n    if (plan === null) return { role: 'none', target: null, patientId: null };", "    const plan = this.recoveryPlan;\n    if (plan === null || this.recoveryOwnershipMode === 'deferred') return { role: 'none', target: null, patientId: plan?.patientId ?? null };")

once("    const plan = this.recoveryPlan;\n    if (plan === null) return 'none';", "    const plan = this.recoveryPlan;\n    if (plan === null || this.recoveryOwnershipMode === 'deferred') return 'none';")

once("    if (this.logistics?.agentId === agentId && equipment.ammoRounds > AMMO_LOW && member.grenadeCount > 1) this.finishLogistics('manual equipment update satisfied the commitment');\n    return true;", "    if (this.logistics?.agentId === agentId && equipment.ammoRounds > AMMO_LOW && member.grenadeCount > 1) this.finishLogistics('manual equipment update satisfied the commitment');\n    const state = this.hostState();\n    this.validateRecoveryContract(state);\n    this.syncHostOperationalContext(state);\n    return true;")

once("      .filter((agent) => this.recoveryPlan === null || (agent.id !== this.recoveryPlan.rescuerId && agent.id !== this.recoveryPlan.covererId))", "      .filter((agent) => this.recoveryPlan === null || this.recoveryOwnershipMode === 'deferred' || (agent.id !== this.recoveryPlan.rescuerId && agent.id !== this.recoveryPlan.covererId))")

# Deferred mode is an obligation reservation, not execution ownership.
once("    if (!this.validateRecoveryContract(state) || this.recoveryPlan === null) return;\n    if (this.recoveryLastEvaluatedTick === state.logicalTick) return;", "    if (!this.validateRecoveryContract(state) || this.recoveryPlan === null) return;\n    if (this.recoveryOwnershipMode === 'deferred') {\n      this.recoverySafetyDecision = 'none';\n      this.recoveryWatchdogState = 'idle';\n      return;\n    }\n    if (this.recoveryLastEvaluatedTick === state.logicalTick) return;")

old_retry = """    if (this.recoveryDeferredUntilTick >= 0 && state.logicalTick >= this.recoveryDeferredUntilTick) {\n      this.recoveryDeferredUntilTick = -1;\n      this.recoveryPauseReason = null;\n      this.replanRecoveryGeometry(state, 'deferred_recovery_retry', true);\n    }\n\n"""
once(old_retry, "")

old_wait = """    if (this.recoveryDeferredUntilTick > state.logicalTick) {\n      this.recoverySafetyDecision = 'pause';\n      this.recoveryPauseReason = 'deferred_safety_retry';\n      this.recoveryWatchdogState = 'suspended_by_safety';\n      plan.stalledTicks = 0;\n      if (rescuer !== undefined) plan.lastRescuerDistance = distance(rescuer.position, plan.treatmentPoint);\n      plan.lastTreatmentProgress = plan.treatmentProgress;\n      return;\n    }\n\n"""
once(old_wait, "")

once("    const securityIneffective = security !== null && threat !== null && (!weaponReady || !reactionReady || securityStalled || (positionReady && (!lineOfSightReady || !fireLaneReady)));", "    const securityIneffective = security !== null && threat !== null && (!reactionReady || securityStalled || (positionReady && (!lineOfSightReady || !fireLaneReady)));")

once("      this.replanRecoveryGeometry(state, 'incoming_fire_forced_reposition', true);\n    }", "      if (!this.replanRecoveryGeometry(state, 'incoming_fire_forced_reposition', true)) {\n        this.deferRecovery(state, 'incoming fire invalidated every viable treatment geometry');\n        return;\n      }\n    }")

once("      if (selectedSecurity === null) return false;", "      if (selectedSecurity === null) { this.recoveryGeometryViability = 'no_security_lane'; return false; }")
once("      plan.securityPoint = { ...selectedSecurity.point };", "      this.recoveryGeometryViability = 'valid';\n      plan.securityPoint = { ...selectedSecurity.point };")
once("      plan.treatmentExposed = false;\n      plan.pathExposureCells = 0;", "      this.recoveryGeometryViability = 'valid';\n      plan.treatmentExposed = false;\n      plan.pathExposureCells = 0;")
once("    if (selected === null) return false;\n    plan.treatmentPoint = { ...selected.treatmentPoint };", "    if (selected === null) { this.recoveryGeometryViability = 'no_viable_geometry'; return false; }\n    if (threat !== null && selected.treatmentExposed) {\n      this.recoveryGeometryViability = 'no_covered_treatment';\n      return false;\n    }\n    this.recoveryGeometryViability = 'valid';\n    plan.treatmentPoint = { ...selected.treatmentPoint };")

block("  private executeRecoverySecurity(state: TacticalHostState): void {", "  private deferRecovery(state: TacticalHostState, reason: string): void {", r'''  private executeRecoverySecurity(state: TacticalHostState): void {
    const plan = this.recoveryPlan;
    if (plan === null || this.recoveryOwnershipMode !== 'active' || plan.covererId === null) return;
    if (state.logicalTick - this.recoveryLastSecurityFireTick < RECOVERY_SECURITY_FIRE_INTERVAL_TICKS) return;
    const member = this.hostAccess().members.find((entry) => entry.id === plan.covererId);
    const equipment = member === undefined ? undefined : this.equipment.get(member.id);
    if (member === undefined || equipment === undefined || !this.isAlive(member.id)) return;
    if (equipment.ammoRounds < RECOVERY_SECURITY_MIN_AMMO) {
      this.validateRecoveryContract(state);
      return;
    }
    if (equipment.ammoRounds <= RECOVERY_SECURITY_RESERVE_ROUNDS) return;
    const visible = this.hostAccess().canSeePlayer(member);
    member.targetVisible = visible;
    if (!visible) return;
    const patient = state.agents.find((agent) => agent.id === plan.patientId);
    const rescuer = state.agents.find((agent) => agent.id === plan.rescuerId);
    const friends = [patient?.position, rescuer?.position].filter((point): point is GridPoint => point !== undefined);
    if (!recoveryFireLaneClear(member.position, state.player, friends)) {
      this.recoveryLaneBlockedTicks += 1;
      if (this.recoveryLaneBlockedTicks >= 2 && state.logicalTick - this.recoveryLastReplanTick >= 3) {
        this.recoveryLaneBlockedTicks = 0;
        this.replanRecoveryGeometry(state, 'friendly_fire_lane_blocked', true);
      }
      return;
    }
    this.recoveryLaneBlockedTicks = 0;
    this.recoveryLastSecurityFireTick = state.logicalTick;
    this.hostAccess().tryFire(member, state.player, 'recovery security confirmed visual');
  }

''')

block("  private deferRecovery(state: TacticalHostState, reason: string): void {", "  private abortRecovery(state: TacticalHostState, reason: string): void {", r'''  private deferRecovery(state: TacticalHostState, reason: string): void {
    const plan = this.recoveryPlan;
    if (plan === null) return;
    if (!this.validateRecoveryContract(state) || this.recoveryPlan === null) return;
    this.recoverySafetyDeferrals += 1;
    const signature = [plan.patientId, plan.rescuerId, plan.covererId ?? 'solo', gridKey(navCell(plan.treatmentPoint)), this.recoveryGeometryViability].join('|');
    if (signature === this.recoveryLastDeferredSignature) this.recoveryRepeatedDeferredCount += 1;
    else {
      this.recoveryLastDeferredSignature = signature;
      this.recoveryRepeatedDeferredCount = 1;
    }
    const retryDelay = this.recoveryRepeatedDeferredCount >= 3 ? 16 : 8;
    this.recoveryDeferredUntilTick = state.logicalTick + retryDelay;
    this.recoveryOwnershipMode = 'deferred';
    this.recoverySafetyDecision = 'none';
    this.recoveryPauseReason = 'deferred_survival_window';
    this.recoveryWatchdogState = 'idle';
    plan.phase = 'approach';
    plan.stalledTicks = 0;
    plan.stallReplans = 0;
    plan.lastTreatmentProgress = plan.treatmentProgress;
    const rescuer = state.agents.find((agent) => agent.id === plan.rescuerId);
    if (rescuer !== undefined) plan.lastRescuerDistance = distance(rescuer.position, plan.treatmentPoint);
    this.contracts.delete(plan.rescuerId);
    if (plan.covererId !== null) this.contracts.delete(plan.covererId);
    this.syncHostOperationalContext(state);
    if (this.hostAccess().alertState === 'active') {
      this.hostAccess().applyRoles();
      this.hostAccess().refreshTacticalPlan();
    }
    this.hostAccess().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Recovery entered Deferred Survival: casualty reservation and treatment progress are retained, but movement / weapon authority returned to normal survival and logistics systems.', {
      patientId: plan.patientId,
      rescuerId: plan.rescuerId,
      covererId: plan.covererId,
      reason,
      retryTick: this.recoveryDeferredUntilTick,
      treatmentProgress: Number(plan.treatmentProgress.toFixed(3)),
      safetyDeferrals: this.recoverySafetyDeferrals,
      livelockCount: this.recoveryRepeatedDeferredCount,
      geometryViability: this.recoveryGeometryViability,
    });
  }

''')

once("    this.recoverySafetyDecision = 'abort';\n    this.recoveryDeferredUntilTick = -1;", "    this.recoverySafetyDecision = 'abort';\n    this.recoveryOwnershipMode = 'active';\n    this.recoveryDeferredUntilTick = -1;")

once("    if (this.recoveryPlan !== null) return 'Recovery owns casualty geometry; normal maneuver doctrine is suspended until rescue completes or aborts.';", "    if (this.recoveryPlan !== null && this.recoveryOwnershipMode === 'active') return 'Recovery owns casualty geometry; normal maneuver doctrine is suspended until rescue completes or defers.';\n    if (this.recoveryPlan !== null && this.recoveryOwnershipMode === 'deferred') return 'Recovery obligation is deferred; survivors retain combat / logistics authority while waiting for a viable rescue window.';")
once("    this.hostAccess().setOperationalContext({ suspendTacticalClock: this.recoveryPlan !== null, excludedAgentIds, playerFacing: this.playerCombat.facing });", "    this.hostAccess().setOperationalContext({ suspendTacticalClock: this.recoveryPlan !== null && this.recoveryOwnershipMode === 'active', excludedAgentIds, playerFacing: this.playerCombat.facing });")

once("        active: recovery.phase !== 'none',\n        band: recovery.phase === 'none' ? 'stable' : this.recoverySafetyBand,\n        decision: recovery.phase === 'none' ? 'none' : this.recoverySafetyDecision,", "        active: recovery.phase !== 'none' && this.recoveryOwnershipMode === 'active',\n        band: recovery.phase === 'none' ? 'stable' : this.recoverySafetyBand,\n        decision: recovery.phase === 'none' || this.recoveryOwnershipMode === 'deferred' ? 'none' : this.recoverySafetyDecision,")
once("        deferredUntilTick: this.recoveryDeferredUntilTick >= base.logicalTick ? this.recoveryDeferredUntilTick : null,\n        security: {", "        deferredUntilTick: this.recoveryDeferredUntilTick >= base.logicalTick ? this.recoveryDeferredUntilTick : null,\n        ownershipMode: recovery.phase === 'none' ? 'none' : this.recoveryOwnershipMode,\n        roleSwapCount: this.recoveryRoleSwapCount,\n        lastRoleSwapReason: this.recoveryLastRoleSwapReason,\n        geometryViability: this.recoveryGeometryViability,\n        livelockCount: this.recoveryRepeatedDeferredCount,\n        security: {")
once("          weaponReady: security?.ammoRounds !== undefined && security.ammoRounds >= RECOVERY_WEAPON_READY_ROUNDS,", "          weaponReady: security?.ammoRounds !== undefined && security.ammoRounds >= RECOVERY_SECURITY_MIN_AMMO,")
once("        tacticalPlanningSuspended: this.recoveryPlan !== null,", "        tacticalPlanningSuspended: this.recoveryPlan !== null && this.recoveryOwnershipMode === 'active',")

runtime_path.write_text(runtime)

# Update current runtime documentation without creating a second architecture.
doc_path = Path('Apps/Workbench/src/simulation/CURRENT_RUNTIME.md')
doc = doc_path.read_text()
marker = '## Recovery R4 capability arbitration\n'
if marker not in doc:
    doc += '''\n\n## Recovery R4 capability arbitration\n\nRecovery remains an Operational Arbitration concern, but its contract is now capability-aware. A paired rescue requires a medically capable rescuer and a distinct security member with an armed reserve. If those capabilities change, ownership swaps atomically while casualty reservation and treatment progress remain intact.\n\n`deferred` Recovery is an obligation reservation rather than movement / weapon ownership: normal reduced-pair survival, tactical movement and emergency logistics resume until a new rescue window passes capability and geometry validation. A geometry solver may now reject all candidates (`no_covered_treatment`, `no_security_lane`, `no_viable_geometry`) instead of committing the least-bad exposed treatment point. Repeated identical deferrals increase the retry window rather than creating an execution livelock.\n'''
doc_path.write_text(doc)

changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text()
entry = '- Recovery R4: capability-aware rescuer/security arbitration, atomic role swap with progress preservation, Deferred Survival ownership release, emergency logistics interoperability, covered-geometry rejection, security ammo reserve discipline, and repeated-deferral livelock guards.\n'
if entry not in changelog:
    changelog = changelog.replace('# Changelog\n', '# Changelog\n\n' + entry, 1)
changelog_path.write_text(changelog)
