import { mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const sourceDir = resolve(repoRoot, 'frames');
const mobileOutputDir = resolve(scriptDir, '../public/frames-mobile');
const desktopOutputDir = resolve(scriptDir, '../public/frames-desktop');
const framePattern = /^ezgif-frame-(\d{3})\.jpg$/;

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

    // The Git-tracked frames are already 3840×2160 exports. Keep desktop
    // output at 3840×2160 so a fullscreen 4K canvas does not upscale 2560px.
    // Higher WebP quality reduces ringing/banding in the dark red particles.
    await Promise.all([
      sharp(sourcePath, { failOn: 'error', limitInputPixels: 20_000_000 })
        .resize({ width: 960, height: 540, fit: 'fill', withoutEnlargement: true })
        .webp({ quality: 86, effort: 5, smartSubsample: true })
        .toFile(resolve(mobileOutputDir, outputName)),
      sharp(sourcePath, { failOn: 'error', limitInputPixels: 20_000_000 })
        .resize({ width: 3840, height: 2160, fit: 'fill', withoutEnlargement: true })
        .webp({ quality: 94, effort: 5, smartSubsample: true })
        .toFile(resolve(desktopOutputDir, outputName)),
    ]);

    completed++;
    if (completed % 50 === 0 || completed === names.length) {
      console.log(`Prepared high-quality frames: ${completed}/300`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log('Generated 300 mobile (960×540, quality 86) and desktop (3840×2160, quality 94) WebP frames.');
