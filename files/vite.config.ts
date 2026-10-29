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
const mobileFramesDir = resolve(projectRoot, 'public/frames-mobile');
const desktopFramesDir = resolve(projectRoot, 'public/frames-desktop');
const outputDir = resolve(projectRoot, 'dist');
const framePattern = /^ezgif-frame-\d{3}\.webp$/;

function optimizedFramesPlugin(): Plugin {
  return {
    name: 'chopstick-optimized-frames',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '/').split('?')[0];
        const filename = basename(pathname);
        const isMobile = pathname.startsWith('/frames-mobile/') && framePattern.test(filename);
        const isDesktop = pathname.startsWith('/frames-desktop/') && framePattern.test(filename);
        if (!isMobile && !isDesktop) {
          next();
          return;
        }

        const baseDir = isMobile ? mobileFramesDir : desktopFramesDir;
        const filePath = resolve(baseDir, filename);
        if (!existsSync(filePath)) {
          res.statusCode = 404;
          res.end('Frame not found');
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        createReadStream(filePath).on('error', () => {
          if (!res.headersSent) res.statusCode = 500;
          res.end('Unable to read frame');
        }).pipe(res);
      });
    },
    closeBundle() {
      mkdirSync(outputDir, { recursive: true });
      for (const [source, folder] of [
        [mobileFramesDir, 'frames-mobile'],
        [desktopFramesDir, 'frames-desktop'],
      ] as const) {
        if (!existsSync(source)) continue;
        const destination = resolve(outputDir, folder);
        mkdirSync(destination, { recursive: true });
        for (const filename of readdirSync(source)) {
          if (framePattern.test(filename)) {
            copyFileSync(resolve(source, filename), resolve(destination, filename));
          }
        }
      }
    },
  };
}

export default defineConfig({
  root: projectRoot,
  plugins: [react(), optimizedFramesPlugin()],
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
