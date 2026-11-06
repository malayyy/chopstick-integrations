/**
 * Visual-inspection montages for the extension zones (P4 review).
 *   node tools/qa/montage.mjs
 * Reads qa/.artifacts/<vp>-f<i>.png produced by run-qa and emits stacked
 * crops (top extension / band / bottom extension) to qa/.artifacts/view/.
 */
import sharp from 'sharp';
import { mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const ART = 'qa/.artifacts';
const OUT = join(ART, 'view');
mkdirSync(OUT, { recursive: true });

const jobs = [
  /* phone portrait: biggest extension zones (top + bottom) */
  { vp: 'phone-portrait-393x852-dpr3', frames: [0, 160, 299] },
  /* desktop: bottom/side margins lighter, still check the bottom fade */
  { vp: 'desktop-1440x900-dpr2', frames: [129] },
  /* tablet portrait */
  { vp: 'tablet-820x1180-dpr2', frames: [160] },
];

for (const { vp, frames } of jobs) {
  for (const f of frames) {
    const file = join(ART, `${vp}-f${f}.png`);
    let img;
    try { img = sharp(file); } catch { continue; }
    const meta = await img.metadata();
    const W = meta.width, H = meta.height;

    /* full view, downscaled */
    const fullScale = Math.min(1, 560 / W);
    await sharp(file).resize(Math.round(W * fullScale)).jpeg({ quality: 86 })
      .toFile(join(OUT, `${vp}-f${f}-full.jpg`));

    /* extension strips: top 18% and bottom 18%, at readable width */
    const stripH = Math.round(H * 0.18);
    const stripW = Math.min(1100, W);
    const sx = Math.round(W * 0.5 - stripW / 2);
    await sharp(file).extract({ left: Math.max(0, sx), top: 0, width: stripW, height: stripH })
      .resize(1100).jpeg({ quality: 86 }).toFile(join(OUT, `${vp}-f${f}-top.jpg`));
    await sharp(file).extract({ left: Math.max(0, sx), top: H - stripH, width: stripW, height: stripH })
      .resize(1100).jpeg({ quality: 86 }).toFile(join(OUT, `${vp}-f${f}-bottom.jpg`));

    /* side strips (X margins matter on portrait) */
    const sideW = Math.round(W * 0.22);
    const sideH = Math.min(1100, H);
    await sharp(file).extract({ left: 0, top: Math.round(H * 0.1), width: sideW, height: sideH })
      .resize(Math.round(1100 * sideW / sideH)).jpeg({ quality: 86 })
      .toFile(join(OUT, `${vp}-f${f}-left.jpg`));
    await sharp(file).extract({ left: W - sideW, top: Math.round(H * 0.1), width: sideW, height: sideH })
      .resize(Math.round(1100 * sideW / sideH)).jpeg({ quality: 86 })
      .toFile(join(OUT, `${vp}-f${f}-right.jpg`));
    console.log('built:', basename(join(OUT, `${vp}-f${f}`)), 'strips × (full|top|bottom|left|right)');
  }
}
console.log('→', OUT);
