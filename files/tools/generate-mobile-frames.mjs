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

    await Promise.all([
      sharp(sourcePath, { failOn: 'error', limitInputPixels: 20_000_000 })
        .resize({ width: 800, height: 450, fit: 'fill', withoutEnlargement: true })
        .webp({ quality: 78, effort: 4, smartSubsample: true })
        .toFile(resolve(mobileOutputDir, outputName)),
      sharp(sourcePath, { failOn: 'error', limitInputPixels: 20_000_000 })
        .resize({ width: 1600, height: 900, fit: 'fill', withoutEnlargement: true })
        .webp({ quality: 80, effort: 4, smartSubsample: true })
        .toFile(resolve(desktopOutputDir, outputName)),
    ]);

    completed += 1;
    if (completed % 50 === 0 || completed === names.length) {
      console.log(`Prepared optimized frames: ${completed}/300`);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log('Generated 300 mobile (800×450) and 300 desktop (1600×900) WebP frames.');
