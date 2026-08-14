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

console.log('Semantic migration compatibility fixes complete.');
