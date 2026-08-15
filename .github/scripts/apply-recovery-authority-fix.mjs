import fs from 'node:fs';

const runtimePath = 'Apps/Workbench/src/simulation/tacticalWizardRuntime.ts';
const testPath = 'Tests/workbench/recoveryGeometryAndShotTrace.test.ts';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, content) { fs.writeFileSync(path, content); }
function replaceOnce(content, search, replacement, label) {
  const index = content.indexOf(search);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (content.indexOf(search, index + search.length) >= 0) throw new Error(`Ambiguous patch anchor: ${label}`);
  return content.slice(0, index) + replacement + content.slice(index + search.length);
}
function replaceSection(content, start, end, replacement, label) {
  const a = content.indexOf(start);
  if (a < 0) throw new Error(`Missing section start: ${label}`);
  const b = content.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`Missing section end: ${label}`);
  return content.slice(0, a) + replacement + content.slice(b);
}

let runtime = read(runtimePath);

runtime = replaceOnce(runtime,
`    readonly safetyAborts: number;\n    readonly lastReplanReason: string | null;\n    readonly security: {`,
`    readonly safetyAborts: number;\n    readonly safetyDeferrals: number;\n    readonly lastReplanReason: string | null;\n    readonly mode: 'none' | 'paired' | 'solo';\n    readonly pauseReason: string | null;\n    readonly threatSource: 'none' | 'visual' | 'recent_fire' | 'fresh_lkp';\n    readonly threatAgeTicks: number | null;\n    readonly watchdogState: 'idle' | 'active' | 'suspended_by_safety';\n    readonly distanceToTreatment: number | null;\n    readonly deferredUntilTick: number | null;\n    readonly security: {`,
'recovery safety state interface');

runtime = replaceOnce(runtime,
`interface RecoveryPlan {\n  readonly patientId: string;`,
`interface RecoveryThreatFact {\n  readonly point: GridPoint | null;\n  readonly source: 'none' | 'visual' | 'recent_fire' | 'fresh_lkp';\n  readonly ageTicks: number | null;\n}\n\ninterface RecoveryPlan {\n  readonly patientId: string;`,
'recovery threat fact');

runtime = replaceOnce(runtime,
`  private recoverySafetyReplans = 0;\n  private recoverySafetyAborts = 0;\n  private recoveryLastReplanTick = -999;`,
`  private recoverySafetyReplans = 0;\n  private recoverySafetyAborts = 0;\n  private recoverySafetyDeferrals = 0;\n  private recoveryDeferredUntilTick = -1;\n  private recoveryPauseReason: string | null = null;\n  private recoveryWatchdogState: 'idle' | 'active' | 'suspended_by_safety' = 'idle';\n  private recoveryLastReplanTick = -999;`,
'recovery runtime fields');

runtime = replaceOnce(runtime,
`    this.recoverySafetyReplans = 0;\n    this.recoverySafetyAborts = 0;\n    this.recoveryLastReplanTick = -999;`,
`    this.recoverySafetyReplans = 0;\n    this.recoverySafetyAborts = 0;\n    this.recoverySafetyDeferrals = 0;\n    this.recoveryDeferredUntilTick = -1;\n    this.recoveryPauseReason = null;\n    this.recoveryWatchdogState = 'idle';\n    this.recoveryLastReplanTick = -999;`,
'recovery reset fields');

runtime = replaceOnce(runtime,
`    const recoveryThreat = this.recoveryThreatPoint(base);\n    const recoverySecurityPoint = this.recoveryPlan?.securityPoint ?? null;`,
`    const recoveryThreatFact = this.recoveryThreatFact(base);\n    const recoveryThreat = clonePoint(recoveryThreatFact.point);\n    const recoverySecurityPoint = this.recoveryPlan?.securityPoint ?? null;\n    const recoveryRescuer = recovery.rescuerId === null ? null : agents.find((agent) => agent.id === recovery.rescuerId) ?? null;`,
'getState recovery threat fact');

runtime = replaceOnce(runtime,
`        safetyReplans: this.recoverySafetyReplans,\n        safetyAborts: this.recoverySafetyAborts,\n        lastReplanReason: this.recoveryLastReplanReason,\n        security: {`,
`        safetyReplans: this.recoverySafetyReplans,\n        safetyAborts: this.recoverySafetyAborts,\n        safetyDeferrals: this.recoverySafetyDeferrals,\n        lastReplanReason: this.recoveryLastReplanReason,\n        mode: recovery.phase === 'none' ? 'none' : recovery.covererId === null ? 'solo' : 'paired',\n        pauseReason: recovery.phase === 'none' ? null : this.recoveryPauseReason,\n        threatSource: recoveryThreatFact.source,\n        threatAgeTicks: recoveryThreatFact.ageTicks,\n        watchdogState: recovery.phase === 'none' ? 'idle' : this.recoveryWatchdogState,\n        distanceToTreatment: recoveryRescuer === null || this.recoveryPlan === null ? null : Number(distance(recoveryRescuer.position, this.recoveryPlan.treatmentPoint).toFixed(2)),\n        deferredUntilTick: this.recoveryDeferredUntilTick >= base.logicalTick ? this.recoveryDeferredUntilTick : null,\n        security: {`,
'getState recovery diagnostics');

runtime = replaceOnce(runtime,
`    this.recoveryPressure = 0;\n    this.recoverySafetyBand = 'stable';\n    this.recoverySafetyDecision = 'continue';\n    this.recoveryUnsafeSinceTick = null;`,
`    this.recoveryPressure = 0;\n    this.recoverySafetyBand = 'stable';\n    this.recoverySafetyDecision = 'continue';\n    this.recoveryDeferredUntilTick = -1;\n    this.recoveryPauseReason = null;\n    this.recoveryWatchdogState = 'idle';\n    this.recoveryUnsafeSinceTick = null;`,
'new recovery resets transient authority');

runtime = replaceOnce(runtime,
`    if (this.recoverySafetyDecision === 'abort') {\n      this.abortRecovery(state, 'recovery safety authority aborted an unsafe rescue');\n      return;\n    }`,
`    if (this.recoverySafetyDecision === 'abort') {\n      this.deferRecovery(state, 'recovery safety authority deferred an unsafe rescue');\n      return;\n    }`,
'progress recovery abort becomes deferral');

runtime = replaceOnce(runtime,
`      if (treatmentRange <= 0.65 && distance(plan.treatmentPoint, patient.position) <= RECOVERY_RANGE) plan.phase = 'treat';`,
`      if (treatmentRange <= 0.75 && distance(plan.treatmentPoint, patient.position) <= RECOVERY_RANGE) plan.phase = 'treat';`,
'treatment arrival hysteresis');

const evaluateStart = `  private evaluateRecoverySafety(state: TacticalHostState): void {`;
const evaluateEnd = `  private replanRecoveryGeometry(state: TacticalHostState, reason: string, countReplan: boolean): boolean {`;
const evaluateReplacement = `  private evaluateRecoverySafety(state: TacticalHostState): void {\n    const plan = this.recoveryPlan;\n    if (plan === null) {\n      this.recoveryPressure = Math.max(0, this.recoveryPressure - 0.08);\n      this.recoverySafetyBand = 'stable';\n      this.recoverySafetyDecision = 'none';\n      this.recoveryPauseReason = null;\n      this.recoveryWatchdogState = 'idle';\n      this.recoveryUnsafeSinceTick = null;\n      this.recoveryIneffectiveSinceTick = null;\n      return;\n    }\n    if (this.recoveryLastEvaluatedTick === state.logicalTick) return;\n    this.recoveryLastEvaluatedTick = state.logicalTick;\n    this.recoveryPressure = Math.max(0, this.recoveryPressure - 0.055);\n\n    const patient = state.agents.find((agent) => agent.id === plan.patientId);\n    const rescuer = state.agents.find((agent) => agent.id === plan.rescuerId);\n    let security = plan.covererId === null ? null : state.agents.find((agent) => agent.id === plan.covererId) ?? null;\n    if (security !== null && !this.isAlive(security.id)) {\n      plan.covererId = null;\n      plan.securityPoint = null;\n      security = null;\n      this.replanRecoveryGeometry(state, 'security_became_downed_switch_to_solo', true);\n    }\n\n    if (this.recoveryDeferredUntilTick >= 0 && state.logicalTick >= this.recoveryDeferredUntilTick) {\n      this.recoveryDeferredUntilTick = -1;\n      this.recoveryPauseReason = null;\n      this.replanRecoveryGeometry(state, 'deferred_recovery_retry', true);\n    }\n\n    const threatFact = this.recoveryThreatFact(state);\n    const threat = threatFact.point;\n    const weaponReady = security !== null && (this.equipment.get(security.id)?.ammoRounds ?? 0) >= RECOVERY_WEAPON_READY_ROUNDS;\n    const positionReady = security !== null && plan.securityPoint !== null && distance(security.position, plan.securityPoint) <= RECOVERY_SECURITY_ARRIVAL;\n    const lineOfSightReady = security !== null && (threat === null ? security.targetVisible : hasLineOfSight(tacticalWizardNavigationGrid, navCell(security.position), navCell(threat)));\n    const friends = state.agents.filter((agent) => agent.id === plan.patientId || agent.id === plan.rescuerId).map((agent) => agent.position);\n    const fireLaneReady = security !== null && threat !== null ? recoveryFireLaneClear(security.position, threat, friends) : security !== null;\n    const reaction = security === null ? null : this.activeReaction(security.id, state.logicalTick);\n    const reactionReady = reaction === null || reaction.kind === 'grenade_suppress';\n    const securityStalled = security !== null && !positionReady && security.stalledTicks >= 45;\n    const securityIneffective = security !== null && threat !== null && (!weaponReady || !reactionReady || securityStalled || (positionReady && (!lineOfSightReady || !fireLaneReady)));\n\n    if (securityIneffective) {\n      this.recoveryIneffectiveSinceTick ??= state.logicalTick;\n      if (state.logicalTick - this.recoveryIneffectiveSinceTick >= 2) this.recoveryPressure = Math.max(this.recoveryPressure, 0.5);\n      if ((securityStalled || (positionReady && (!lineOfSightReady || !fireLaneReady))) && state.logicalTick - this.recoveryLastReplanTick >= 3) {\n        this.replanRecoveryGeometry(state, securityStalled ? 'security_path_stalled' : !lineOfSightReady ? 'security_lost_los' : 'security_fire_lane_blocked', true);\n      }\n    } else this.recoveryIneffectiveSinceTick = null;\n\n    this.recoverySafetyBand = classifyRecoveryPressure(this.recoveryPressure);\n    if (this.recoverySafetyBand === 'unsafe') this.recoveryUnsafeSinceTick ??= state.logicalTick;\n    else this.recoveryUnsafeSinceTick = null;\n    const unsafeTicks = this.recoveryUnsafeSinceTick === null ? 0 : state.logicalTick - this.recoveryUnsafeSinceTick + 1;\n\n    if (this.recoveryDeferredUntilTick > state.logicalTick) {\n      this.recoverySafetyDecision = 'pause';\n      this.recoveryPauseReason = 'deferred_safety_retry';\n      this.recoveryWatchdogState = 'suspended_by_safety';\n      plan.stalledTicks = 0;\n      if (rescuer !== undefined) plan.lastRescuerDistance = distance(rescuer.position, plan.treatmentPoint);\n      plan.lastTreatmentProgress = plan.treatmentProgress;\n      return;\n    }\n\n    let nextDecision = recoveryDecision(this.recoverySafetyBand, unsafeTicks);\n    if (this.recoverySafetyBand === 'pressured' && threat === null) nextDecision = 'continue';\n    else if (this.recoverySafetyBand === 'pressured' && plan.phase === 'approach' && !plan.treatmentExposed && plan.pathExposureCells === 0) nextDecision = 'continue';\n\n    if (nextDecision === 'reposition' && this.recoverySafetyDecision !== 'reposition') {\n      this.rescueInterruptedCount += 1;\n      this.lastRescueInterruptedTick = state.logicalTick;\n      this.replanRecoveryGeometry(state, 'incoming_fire_forced_reposition', true);\n    }\n\n    this.recoverySafetyDecision = nextDecision;\n    this.recoveryPauseReason = nextDecision === 'pause'\n      ? securityIneffective ? 'paired_security_ineffective' : 'incoming_fire_pressure'\n      : nextDecision === 'reposition' ? 'unsafe_pressure_fallback' : null;\n\n    if (nextDecision === 'abort' || unsafeTicks >= RECOVERY_UNSAFE_ABORT_TICKS) {\n      this.deferRecovery(state, 'sustained unsafe pressure exceeded rescue tolerance');\n      return;\n    }\n\n    if (patient !== undefined && rescuer !== undefined && plan.phase !== 'establish_cover') {\n      const rescuerDistance = distance(rescuer.position, plan.treatmentPoint);\n      if (nextDecision === 'pause' || nextDecision === 'reposition') {\n        this.recoveryWatchdogState = 'suspended_by_safety';\n        plan.stalledTicks = 0;\n        plan.lastTreatmentProgress = plan.treatmentProgress;\n        plan.lastRescuerDistance = rescuerDistance;\n        return;\n      }\n\n      this.recoveryWatchdogState = 'active';\n      const progressed = plan.treatmentProgress > plan.lastTreatmentProgress + 0.01 || rescuerDistance < plan.lastRescuerDistance - 0.15;\n      if (progressed) {\n        plan.lastProgressTick = state.logicalTick;\n        plan.stalledTicks = 0;\n        plan.stallReplans = 0;\n      } else plan.stalledTicks += 1;\n      plan.lastTreatmentProgress = plan.treatmentProgress;\n      plan.lastRescuerDistance = rescuerDistance;\n      if (plan.stalledTicks >= RECOVERY_DEADLOCK_TICKS) {\n        plan.stalledTicks = 0;\n        plan.stallReplans += 1;\n        if (plan.stallReplans > RECOVERY_MAX_STALL_REPLANS) {\n          this.deferRecovery(state, 'recovery progress watchdog exhausted geometry replans');\n          return;\n        }\n        this.replanRecoveryGeometry(state, 'recovery_progress_watchdog', true);\n        if (plan.phase === 'treat') this.recoverySafetyDecision = 'reposition';\n      }\n    } else this.recoveryWatchdogState = 'idle';\n  }\n\n`;
runtime = replaceSection(runtime, evaluateStart, evaluateEnd, evaluateReplacement, 'evaluateRecoverySafety');

runtime = replaceOnce(runtime,
`    plan.securityPoint = selected.security === null ? null : { ...selected.security.point };\n    const coverMember = plan.covererId === null ? undefined : this.hostAccess().members.find((entry) => entry.id === plan.covererId);`,
`    plan.securityPoint = selected.security === null ? null : { ...selected.security.point };\n    plan.stalledTicks = 0;\n    plan.lastTreatmentProgress = plan.treatmentProgress;\n    plan.lastRescuerDistance = distance(rescuer.position, selected.treatmentPoint);\n    const coverMember = plan.covererId === null ? undefined : this.hostAccess().members.find((entry) => entry.id === plan.covererId);`,
'replan resets watchdog sample');

runtime = replaceSection(runtime,
`  private recoveryThreatPoint(state: TacticalHostState): GridPoint | null {`,
`  private executeRecoverySecurity(state: TacticalHostState): void {`,
`  private recoveryThreatFact(state: TacticalHostState): RecoveryThreatFact {\n    const confirmedVisual = state.agents.some((agent) => this.isAlive(agent.id) && agent.targetVisible);\n    if (confirmedVisual) return { point: { ...state.player }, source: 'visual', ageTicks: 0 };\n\n    if (state.logicalTick < this.threatUntilTick && this.threatSector !== null) {\n      return {\n        point: { ...this.threatSector },\n        source: 'recent_fire',\n        ageTicks: this.threatLastHitTick === null ? 0 : Math.max(0, state.logicalTick - this.threatLastHitTick),\n      };\n    }\n\n    const confirmedAge = this.lastConfirmedTick === null ? null : Math.max(0, state.logicalTick - this.lastConfirmedTick);\n    const freshLkp = state.squad.alertState === 'active'\n      && state.squad.sharedLastKnownPosition !== null\n      && state.squad.lostContactTicks <= 12\n      && (confirmedAge === null || confirmedAge <= 12);\n    if (freshLkp) return { point: { ...state.squad.sharedLastKnownPosition! }, source: 'fresh_lkp', ageTicks: confirmedAge ?? state.squad.lostContactTicks };\n\n    return { point: null, source: 'none', ageTicks: null };\n  }\n\n  private recoveryThreatPoint(state: TacticalHostState): GridPoint | null {\n    return clonePoint(this.recoveryThreatFact(state).point);\n  }\n\n`,
'recovery threat authority');

runtime = replaceOnce(runtime,
`  private abortRecovery(state: TacticalHostState, reason: string): void {`,
`  private deferRecovery(state: TacticalHostState, reason: string): void {\n    const plan = this.recoveryPlan;\n    if (plan === null) return;\n    this.recoverySafetyDeferrals += 1;\n    this.recoveryDeferredUntilTick = state.logicalTick + 8;\n    this.recoverySafetyDecision = 'pause';\n    this.recoveryPauseReason = 'deferred_safety_retry';\n    this.recoveryWatchdogState = 'suspended_by_safety';\n    plan.phase = 'approach';\n    plan.treatmentProgress = 0;\n    plan.stalledTicks = 0;\n    plan.stallReplans = 0;\n    plan.lastTreatmentProgress = 0;\n    const rescuer = state.agents.find((agent) => agent.id === plan.rescuerId);\n    if (rescuer !== undefined) plan.lastRescuerDistance = distance(rescuer.position, plan.treatmentPoint);\n    this.contracts.delete(plan.rescuerId);\n    if (plan.covererId !== null) this.contracts.delete(plan.covererId);\n    this.hostAccess().log('squad', 'twr:rifle-squad-01', 'Rifle Squad 01', 'plan', 'Recovery obligation deferred by safety authority; casualty ownership is retained for a bounded retry.', {\n      patientId: plan.patientId,\n      rescuerId: plan.rescuerId,\n      covererId: plan.covererId,\n      reason,\n      retryTick: this.recoveryDeferredUntilTick,\n      safetyDeferrals: this.recoverySafetyDeferrals,\n    });\n  }\n\n  private abortRecovery(state: TacticalHostState, reason: string): void {`,
'add deferred recovery authority');

runtime = replaceOnce(runtime,
`    this.recoverySafetyDecision = 'abort';\n    this.hostAccess().log`,
`    this.recoverySafetyDecision = 'abort';\n    this.recoveryDeferredUntilTick = -1;\n    this.recoveryPauseReason = null;\n    this.recoveryWatchdogState = 'idle';\n    this.hostAccess().log`,
'hard abort clears deferred state');

runtime = replaceOnce(runtime,
`    this.reactions.delete(plan.patientId);\n    this.hostAccess().log`,
`    this.reactions.delete(plan.patientId);\n    this.recoveryDeferredUntilTick = -1;\n    this.recoveryPauseReason = null;\n    this.recoveryWatchdogState = 'idle';\n    this.hostAccess().log`,
'completed treatment clears deferred state');

write(runtimePath, runtime);

let tests = read(testPath);
const insert = `\n\n  it('lets a solo rescuer keep casualty ownership and complete treatment after historical threat becomes stale', () => {\n    const simulation = new TacticalWizardSimulation();\n    expect(simulation.setPlayerPosition({ x: 8, y: 2 })).toBe(true);\n    for (let index = 0; index < 10; index += 1) simulation.step();\n    expect(simulation.setPlayerPosition({ x: 58, y: 35 })).toBe(true);\n    for (let index = 0; index < 24; index += 1) simulation.step();\n\n    expect(simulation.setAgentVitals('twr:rifle-squad:alpha', { health: 0 })).toBe(true);\n    expect(simulation.setAgentVitals('twr:rifle-squad:bravo', { health: 0 })).toBe(true);\n\n    let state = simulation.getState();\n    expect(state.leadership.capability).toBe('single_survivor');\n    for (let index = 0; index < 220 && state.leadership.livingCount === 1; index += 1) {\n      simulation.step();\n      state = simulation.getState();\n    }\n\n    expect(state.leadership.livingCount).toBeGreaterThan(1);\n    expect(state.agents.some((agent) => agent.id !== 'twr:rifle-squad:charlie' && agent.health > 0)).toBe(true);\n    expect(state.recoverySafety.threatSource === 'none' || state.recoverySafety.threatAgeTicks === 0).toBe(true);\n  });\n\n  it('does not treat an absent solo security role as ineffective fire support', () => {\n    const simulation = new TacticalWizardSimulation();\n    expect(simulation.setAgentVitals('twr:rifle-squad:alpha', { health: 0 })).toBe(true);\n    expect(simulation.setAgentVitals('twr:rifle-squad:bravo', { health: 0 })).toBe(true);\n    let state = simulation.getState();\n    for (let index = 0; index < 12; index += 1) { simulation.step(); state = simulation.getState(); }\n    expect(state.recoverySafety.mode === 'solo' || state.leadership.livingCount > 1).toBe(true);\n    if (state.recoverySafety.mode === 'solo') {\n      expect(state.recoverySafety.pauseReason).not.toBe('paired_security_ineffective');\n      expect(state.recoverySafety.security.agentId).toBeNull();\n    }\n  });\n`;
const closing = `\n});\n`;
if (!tests.endsWith(closing)) throw new Error('Unexpected recovery test file ending');
tests = tests.slice(0, -closing.length) + insert + closing;
write(testPath, tests);
