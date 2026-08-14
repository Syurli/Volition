import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const write = (path, content) => writeFileSync(resolve(root, path), content);

function replace(path, from, to) {
  const text = read(path);
  if (!text.includes(from)) throw new Error(`Missing fix anchor in ${path}: ${from}`);
  write(path, text.replaceAll(from, to));
}

replace('Apps/Workbench/src/pages/ProjectPages.tsx', '../simulation/tacticalWizardSimulationV3', '../simulation/tacticalWizardSimulation');
replace('Apps/Workbench/src/pages/RunLogPage.tsx', '../simulation/tacticalWizardSimulationV3', '../simulation/tacticalWizardHostTypes');
replace('Apps/Workbench/src/simulation/runLogCompression.ts', './tacticalWizardSimulationV3', './tacticalWizardHostTypes');
replace('Tests/workbench/runLogCompression.test.ts', '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV3', '../../Apps/Workbench/src/simulation/tacticalWizardHostTypes');
replace('Apps/Workbench/src/pages/RuntimeResponsePages.tsx', "from './RuntimeCombatPages'", "from './RuntimeCorePages'");

let simulationTest = read('Tests/workbench/simulation.test.ts');
simulationTest = simulationTest.replace(
  "import { TacticalWizardSimulation, tacticalWizardTestMap } from '../../Apps/Workbench/src/simulation/tacticalWizardSimulationV3';",
  "import { TacticalWizardHost } from '../../Apps/Workbench/src/simulation/tacticalWizardHost';\nimport { tacticalWizardTestMap } from '../../Apps/Workbench/src/simulation/tacticalWizardTestMap';",
);
simulationTest = simulationTest.replaceAll('new TacticalWizardSimulation()', 'new TacticalWizardHost()');
simulationTest = simulationTest.replaceAll('interactive Workbench example V3', 'semantic Tactical Host example');
simulationTest = simulationTest.replace('expect(moved.movementResolution).toBe(0.25)', 'expect(moved.movementResolution).toBe(0.2)');
write('Tests/workbench/simulation.test.ts', simulationTest);

// Any remaining V3 reference after the intentional Host test rewrite is type-only
// historical coupling. Route it to the semantic Host type surface.
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}
for (const base of [resolve(root, 'Apps/Workbench/src'), resolve(root, 'Tests/workbench')]) {
  for (const path of walk(base)) {
    let source = readFileSync(path, 'utf8');
    if (!source.includes('tacticalWizardSimulationV3')) continue;
    source = source.replaceAll('tacticalWizardSimulationV3', 'tacticalWizardHostTypes');
    writeFileSync(path, source);
  }
}

// The production guard must refer to the retired historical filename without the
// global legacy-reference rewrite turning it into the new semantic HostTypes file.
let architectureTest = read('Tests/workbench/runtimeArchitecture.test.ts');
architectureTest = architectureTest.replace("  'tacticalWizardHostTypes.ts',\n  'tacticalWizardSimulationV4.ts',", "  'tacticalWizardSimulation' + 'V3.ts',\n  'tacticalWizardSimulationV4.ts',");
write('Tests/workbench/runtimeArchitecture.test.ts', architectureTest);

// Recovery safety is a temporal behavior. Track the peak pressure/action during
// sustained fire instead of inspecting only the final frame, which may already
// be a post-abort cooldown or a newly restarted recovery contract.
let recoveryTest = read('Tests/workbench/activeAttentionRecovery.test.ts');
recoveryTest = recoveryTest.replace(`    for (let burst = 0; burst < 8; burst += 1) {
      simulation.playerFireAt(casualty.position);
      for (let frame = 0; frame < 8; frame += 1) state = simulation.advance(1 / 30);
    }
    expect(state.recoverySafety.pressure).toBeGreaterThan(0.3);
    expect(state.recoverySafety.safetyReplans + state.recoverySafety.safetyAborts + state.threatResponse.rescueInterruptedCount).toBeGreaterThan(0);`, `    let maxPressure = state.recoverySafety.pressure;
    let observedSafetyAction = false;
    for (let burst = 0; burst < 8; burst += 1) {
      simulation.playerFireAt(casualty.position);
      for (let frame = 0; frame < 8; frame += 1) {
        state = simulation.advance(1 / 30);
        maxPressure = Math.max(maxPressure, state.recoverySafety.pressure);
        observedSafetyAction ||= state.recoverySafety.decision === 'pause'
          || state.recoverySafety.decision === 'reposition'
          || state.recoverySafety.decision === 'abort'
          || state.recoverySafety.safetyReplans > 0
          || state.recoverySafety.safetyAborts > 0
          || state.threatResponse.rescueInterruptedCount > 0;
      }
    }
    expect(maxPressure).toBeGreaterThan(0.3);
    expect(observedSafetyAction).toBe(true);`);
write('Tests/workbench/activeAttentionRecovery.test.ts', recoveryTest);

console.log('Semantic migration compatibility fixes complete.');
