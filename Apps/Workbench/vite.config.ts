import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.WILLFORM_BASE_PATH ?? '/',
  plugins: [react()],
  define: {
    __WILLFORM_COMMIT__: JSON.stringify(process.env.WILLFORM_COMMIT_SHA ?? 'local'),
    __WILLFORM_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
