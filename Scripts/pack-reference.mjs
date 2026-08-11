import { mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const output = resolve('artifacts/reference-packages');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packages = [
  './Packages/Core',
  './Packages/Schema',
  './Packages/Protocol',
  './Bridges/Web',
];

for (const packagePath of packages) {
  const result = spawnSync(npmCommand, ['pack', packagePath, '--pack-destination', output], {
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Reference package tarballs written to ${output}`);
