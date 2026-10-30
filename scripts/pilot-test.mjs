import sharp from 'sharp';
import path from 'node:path';

// Phase 1 compression pilot — Revision 3.0 §8.2
// Measures WebP payload per representative frame across a quality sweep.
const INPUT_DIR = './hd-frames';
const PILOT_FRAMES = ['010', '090', '130', '200', '290'];
const QUALITY_SWEEP = [72, 75, 78, 82, 85];

const LABELS = {
  '010': 'static hand hold',
  '090': 'kinetic squeeze',
  '130': 'shatter peak',
  '200': 'particulate cloud',
  '290': 'logo lockup',
};

const results = [];

for (const frame of PILOT_FRAMES) {
  const src = path.join(INPUT_DIR, `ezgif-frame-${frame}.png`);
  const base = sharp(src).resize(1920, 1080, { fit: 'cover', kernel: 'lanczos3' });
  const row = { frame, label: LABELS[frame], sizes: {} };

  for (const q of QUALITY_SWEEP) {
    const buf = await base.clone().webp({ quality: q, effort: 6 }).toBuffer();
    row.sizes[q] = Math.round(buf.length / 1024); // KB
  }
  results.push(row);
}

console.log('frame | label            | ' + QUALITY_SWEEP.map((q) => `Q${q}`).join('    '));
console.log('-'.repeat(70));
const totals = Object.fromEntries(QUALITY_SWEEP.map((q) => [q, 0]));
for (const r of results) {
  const cells = QUALITY_SWEEP.map((q) => String(r.sizes[q]).padEnd(5));
  for (const q of QUALITY_SWEEP) totals[q] += r.sizes[q];
  console.log(`${r.frame}  | ${r.label.padEnd(16)} | ${cells.join(' ')}`);
}
console.log('-'.repeat(70));
console.log(
  'avg   |                  | ' +
    QUALITY_SWEEP.map((q) => (totals[q] / results.length).toFixed(0).padEnd(5)).join(' ')
);
