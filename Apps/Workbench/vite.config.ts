import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VOLITION_BASE_PATH ?? '/',
  plugins: [react()],
  define: {
    __VOLITION_COMMIT__: JSON.stringify(process.env.VOLITION_COMMIT_SHA ?? 'local'),
    __VOLITION_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
