import { mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const sourceDir = resolve(repoRoot, 'frames');
const outputDir = resolve(scriptDir, '../public/frames-mobile');
const framePattern = /^ezgif-frame-(\d{3})\.jpg$/;
const outputWidth = 400;
const quality = 76;

const names = (await readdir(sourceDir))
  .filter((name) => framePattern.test(name))
  .sort();

if (names.length !== 300) {
  throw new Error(`Expected 300 source frames in ${sourceDir}, found ${names.length}.`);
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

let next = 0;
let completed = 0;
const concurrency = 4;

async function worker() {
  while (next < names.length) {
    const index = next++;
    const name = names[index];
    const sourcePath = resolve(sourceDir, name);
    const outputName = name.replace(/\.jpg$/i, '.webp');
    const outputPath = resolve(outputDir, outputName);

    await sharp(sourcePath, { failOn: 'error', limitInputPixels: 20_000_000 })
      .resize({ width: outputWidth, height: 225, fit: 'fill', withoutEnlargement: true })
      .webp({ quality, effort: 4, smartSubsample: true })
      .toFile(outputPath);

    completed += 1;
    if (completed % 50 === 0 || completed === names.length) {
      console.log(`Prepared mobile frames: ${completed}/${names.length}`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`Generated ${completed} mobile WebP frames (400×225 max) in ${outputDir}`);
