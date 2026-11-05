import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const input = path.join(root, 'frames');
const output = path.join(root, 'dist');
const outFrames = path.join(output, 'frames');
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(outFrames, { recursive: true });
const files = (await fs.readdir(input)).filter(f => /^ezgif-frame-\\d{3}\\.png$/i.test(f)).sort();
if (files.length !== 300) throw new Error(`Expected 300 source frames, found ${files.length}`);
let completed = 0;
const concurrency = 4;
for (let i = 0; i < files.length; i += concurrency) {
  await Promise.all(files.slice(i, i + concurrency).map(async (file) => {
    const match = file.match(/(\\d{3})/);
    const number = match[1];
    await sharp(path.join(input, file))
      .resize({ width: 1920, height: 1080, fit: 'contain', background: '#030303', kernel: 'lanczos3' })
      .webp({ quality: 84, effort: 5, smartSubsample: true })
      .toFile(path.join(outFrames, `frame-${number}.webp`));
    completed++;
  }));
  console.log(`Optimized ${completed}/300 frames`);
}
await fs.copyFile(path.join(root, 'index.html'), path.join(output, 'index.html'));
const stat = await Promise.all((await fs.readdir(outFrames)).map(f => fs.stat(path.join(outFrames, f))));
const bytes = stat.reduce((sum, s) => sum + s.size, 0);
console.log(`Built ${completed} frames — ${(bytes / 1024 / 1024).toFixed(1)} MB total WebP payload`);
