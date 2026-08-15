import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@willform/core': fileURLToPath(new URL('./Packages/Core/src/index.ts', import.meta.url)),
      '@willform/schema': fileURLToPath(new URL('./Packages/Schema/src/index.ts', import.meta.url)),
      '@willform/protocol': fileURLToPath(new URL('./Packages/Protocol/src/index.ts', import.meta.url)),
      '@willform/web-bridge': fileURLToPath(new URL('./Bridges/Web/src/index.ts', import.meta.url)),
      '@willform/example-tactical-wizard': fileURLToPath(new URL('./Examples/TacticalWizard/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['Tests/**/*.test.ts'],
    environment: 'node',
  },
});
