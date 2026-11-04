import { fileURLToPath, URL } from 'node:url'

/**
 * PoC-local Vite config. Never touched by production builds:
 * - the repo `npm run build` uses the root vite.config.ts + tsconfig("src")
 * - this file only exists so the sandbox can run via
 *     npx vite --root poc-vanish --port 8010
 *
 * `three` is vendored (copied from a sibling project, version 0.186.1) so the
 * canonical repo's package.json / package-lock.json stay untouched.
 */
export default {
  publicDir: false,
  resolve: {
    alias: [
      {
        find: 'three/addons/',
        replacement: fileURLToPath(new URL('./vendor/three/examples/jsm/', import.meta.url)),
      },
      {
        find: 'three',
        replacement: fileURLToPath(new URL('./vendor/three/build/three.module.js', import.meta.url)),
      },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
}
