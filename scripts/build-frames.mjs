import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Phase 1 asset pipeline — Revision 3.0 §8 (input: recovered 4K PNG master, git-tracked)
const INPUT_DIR = './hd-frames';
const OUTPUT_DIR = './public/assets/frames';
const MANIFEST_PATH = './src/assets/frame-manifest.json';
const WEBP_QUALITY = 85; // raised from doc-default 78: pilot showed avg 41KB @ Q78,
// i.e. ~12MB total — budget headroom allows Q85 for safer smoke-gradient banding.

async function processPipeline() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });

  const rawFiles = (await fs.readdir(INPUT_DIR))
    .filter((f) => f.endsWith('.png'))
    .sort();

  if (rawFiles.length === 0) throw new Error('No source frames found in ' + INPUT_DIR);
  console.log(`Discovered ${rawFiles.length} source frames (4K PNG). Converting...`);

  const manifest = [];
  let totalBytes = 0;
  const t0 = Date.now();

  const concurrency = Math.max(1, os.cpus().length);
  for (let i = 0; i < rawFiles.length; i += concurrency) {
    const chunk = rawFiles.slice(i, i + concurrency);
    const processed = await Promise.all(
      chunk.map(async (file, j) => {
        const frameIndex = i + j;
        const outName = `f_${String(frameIndex).padStart(3, '0')}.webp`;
        const info = await sharp(path.join(INPUT_DIR, file))
          .resize(1920, 1080, { fit: 'cover', kernel: 'lanczos3' })
          .webp({ quality: WEBP_QUALITY, effort: 6 })
          .toFile(path.join(OUTPUT_DIR, outName));
        return { index: frameIndex, file: outName, bytes: info.size };
      })
    );
    for (const entry of processed) {
      manifest.push(entry);
      totalBytes += entry.bytes;
    }
  }

  manifest.sort((a, b) => a.index - b.index);
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Pipeline complete: ${manifest.length} frames in ${seconds}s`);
  console.log(`Total payload: ${(totalBytes / 1024 / 1024).toFixed(1)} MB (avg ${(totalBytes / manifest.length / 1024).toFixed(0)} KB/frame)`);
}

processPipeline().catch((err) => {
  console.error(err);
  process.exit(1);
});
