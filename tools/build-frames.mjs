/**
 * Offline frame pipeline — PNG masters -> serving WebP derivatives.
 *
 * Source : frames-4k/ezgif-frame-{001..300}.png   (original 4K UHD masters, NEVER modified)
 * Output : frames/ezgif-frame-{001..300}.webp     (serving derivatives, 3840x2160 WebP)
 *
 * q82 keeps the 4K master's grade intact for dark cinematic footage at ~1/12 the bytes
 * (~90-120 KB per frame, ~28 MB total). Re-run any time the masters change:
 *
 *   npm run frames
 */
import { readdirSync, statSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SRC_DIR = 'frames-4k';
const OUT_DIR = 'frames';
const PATTERN = /^ezgif-frame-(\d{3})\.png$/;

const SOURCE_W = 3840;
const SOURCE_H = 2160;
const QUALITY = 82;

const masters = readdirSync(SRC_DIR)
  .filter((f) => PATTERN.test(f))
  .sort();
if (masters.length === 0) {
  console.error(`No master frames found in ${SRC_DIR}/`);
  process.exit(1);
}

const log = createWriteStream('frames/.build-log.txt');
const t0 = Date.now();
let done = 0;

console.log(`Encoding ${masters.length} frames at ${SOURCE_W}x${SOURCE_H} q${QUALITY}...`);

for (const file of masters) {
  const inPath = join(SRC_DIR, file);
  const outPath = join(OUT_DIR, file.replace(/\.png$/, '.webp'));

  // Guard: derivatives are pure lossy conversions of the masters — no resize, no crop, no grade.
  const meta = await sharp(inPath, { limitInputPixels: false }).metadata();
  if (meta.width !== SOURCE_W || meta.height !== SOURCE_H) {
    throw new Error(`${file}: ${meta.width}x${meta.height}, expected ${SOURCE_W}x${SOURCE_H}`);
  }

  await sharp(inPath, { limitInputPixels: false })
    .webp({ quality: QUALITY, effort: 4, smartSubsample: true })
    .toFile(outPath);

  const kb = Math.round(statSync(outPath).size / 1024);
  log.write(`${file} -> ${outPath} ${kb}KB\n`);
  done++;
  if (done % 25 === 0) console.log(`  ${done}/${masters.length}`);
}

log.end();
console.log(`Done: ${done} frames in ${Math.round((Date.now() - t0) / 1000)}s`);
