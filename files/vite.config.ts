import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const framesDir = resolve(projectRoot, '../frames');
const outputDir = resolve(projectRoot, 'dist');
const framePattern = /^ezgif-frame-\d{3}\.jpg$/;

/** Serve the sibling /frames directory in dev and copy it to dist on build. */
function siblingFramesPlugin(): Plugin {
  return {
    name: 'chopstick-sibling-frames',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '/').split('?')[0];
        const filename = basename(pathname);
        if (!framePattern.test(filename) || !pathname.endsWith(filename)) {
          next();
          return;
        }

        const filePath = resolve(framesDir, filename);
        if (!existsSync(filePath)) {
          res.statusCode = 404;
          res.end('Frame not found');
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'no-cache');
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        createReadStream(filePath)
          .on('error', () => {
            if (!res.headersSent) res.statusCode = 500;
            res.end('Unable to read frame');
          })
          .pipe(res);
      });
    },
    closeBundle() {
      mkdirSync(outputDir, { recursive: true });
      for (const filename of readdirSync(framesDir)) {
        if (framePattern.test(filename)) {
          copyFileSync(resolve(framesDir, filename), resolve(outputDir, filename));
        }
      }
    },
  };
}

export default defineConfig({
  root: projectRoot,
  plugins: [react(), siblingFramesPlugin()],
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: false,
    fs: { allow: [resolve(projectRoot, '..')] },
  },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    outDir: outputDir,
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
