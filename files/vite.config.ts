import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: projectRoot,
  plugins: [react()],
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: false,
  },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
