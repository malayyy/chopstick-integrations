import { mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const sourceDir = resolve(repoRoot, 'frames');
const mobileOutputDir = resolve(scriptDir, '../public/frames-mobile');
const desktopOutputDir = resolve(scriptDir, '../public/frames-desktop');
const framePattern = /^ezgif-frame-(\d{3})\.jpg$/;
const hdManifestPath = resolve(scriptDir, '../public/hd-frames-manifest.json');
const outputFramePattern = /^ezgif-frame-\d{3}\.webp$/;

// On branches with imported HD-PNG-derived WebP frames, use those audited assets
// instead of regenerating from the older JPEG sequence during Vercel's prebuild.
if (existsSync(hdManifestPath)) {
  const [mobileNames, desktopNames] = await Promise.all([
    readdir(mobileOutputDir),
    readdir(desktopOutputDir),
  ]);
  const mobileCount = mobileNames.filter((name) => outputFramePattern.test(name)).length;
  const desktopCount = desktopNames.filter((name) => outputFramePattern.test(name)).length;
  if (mobileCount !== 300 || desktopCount !== 300) {
    throw new Error(\`HD frame manifest exists but optimized assets are incomplete (mobile=\${mobileCount}, desktop=\${desktopCount}).\`);
  }
  console.log('Using 300 imported HD-PNG-derived desktop/mobile frames; skipped legacy JPEG re-export.');
  process.exit(0);
}

const names = (await readdir(sourceDir))
  .filter((name) => framePattern.test(name))
  .sort();

if (names.length !== 300) {
  throw new Error(`Expected 300 source frames in ${sourceDir}, found ${names.length}.`);
}

await Promise.all([
  rm(mobileOutputDir, { recursive: true, force: true }),
  rm(desktopOutputDir, { recursive: true, force: true }),
]);
await Promise.all([
  mkdir(mobileOutputDir, { recursive: true }),
  mkdir(desktopOutputDir, { recursive: true }),
]);

let next = 0;
let completed = 0;
const concurrency = 4;

async function worker() {
  while (next < names.length) {
    const index = next++;
    const sourcePath = resolve(sourceDir, names[index]);
    const outputName = names[index].replace(/\.jpg$/i, '.webp');

    await Promise.all([
      sharp(sourcePath, { failOn: 'error', limitInputPixels: 20_000_000 })
        .resize({ width: 960, height: 540, fit: 'fill', withoutEnlargement: true })
        .webp({ quality: 84, effort: 4, smartSubsample: true })
        .toFile(resolve(mobileOutputDir, outputName)),
      sharp(sourcePath, { failOn: 'error', limitInputPixels: 20_000_000 })
        .resize({ width: 2560, height: 1440, fit: 'fill', withoutEnlargement: true })
        .webp({ quality: 88, effort: 4, smartSubsample: true })
        .toFile(resolve(desktopOutputDir, outputName)),
    ]);

    completed += 1;
    if (completed % 50 === 0 || completed === names.length) {
      console.log(`Prepared high-quality frames: ${completed}/300`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log('Generated 300 mobile (960×540, quality 84) and 300 desktop (2560×1440, quality 88) WebP frames.');
