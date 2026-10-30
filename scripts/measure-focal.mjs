import sharp from 'sharp'
import path from 'node:path'
import fs from 'node:fs/promises'

/**
 * Measures core-subject focal keyframes directly from the recovered 4K PNG
 * masters (luminance threshold + percentile crop) and generates
 * src/utils/focal.ts. Committed alongside the build so the table is
 * reproducible and auditable.
 */
const SRC_DIR = './hd-frames'
const OUT_TS = './src/utils/focal.ts'

// The emotional subject is the hand + shattered glass cluster. Skin, tarred
// nails, chopstick highlights and the lockup type all clear L≈85, while most
// crimson smoke sits below it. Sampling the 2nd-party percentiles keeps the
// box tight on the subject instead of the smoke field.
const SAMPLES = [0, 15, 40, 70, 90, 110, 130, 150, 180, 210, 240, 270, 290, 299]
const TOTAL = 300

/**
 * Art-directed minimum window widths (fraction of source width) per sampled
 * beat, 0 = measured focus alone is sufficient. The p ≈ 0.13–0.50 beats
 * carry the forearm's INTEGRATIONS tattoo; a pure focus-crop at phone
 * aspects crops its leading letters, which is an unacceptable truncation of
 * a brand word (verified against simulated phone crops of the masters).
 * Interpolation between stops keeps the widening continuous.
 */
const ART_COVER = {
  0: 0,
  15: 0,
  40: 0.3,
  70: 0.36,
  90: 0.38,
  110: 0.4,
  130: 0.37,
  150: 0.3,
  180: 0,
  210: 0,
  240: 0,
  270: 0,
  290: 0,
  299: 0,
}
const TH = 85
const PCT_LO = 0.08
const PCT_HI = 0.92
const W = 384
const H = 216

function percentile(sorted, pct) {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(pct * (sorted.length - 1))))
  return sorted[idx]
}

const rows = []
for (const frame of SAMPLES) {
  const file = path.join(SRC_DIR, `ezgif-frame-${String(frame + 1).padStart(3, '0')}.png`)
  const raw = await sharp(file).resize(W, H).grayscale().raw().toBuffer()
  const xs = []
  const ys = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (raw[y * W + x] > TH) {
        xs.push(x)
        ys.push(y)
      }
    }
  }
  if (xs.length < 40) {
    console.warn(`frame ${frame}: too few lit pixels (${xs.length}) — skipping`)
    continue
  }
  xs.sort((a, b) => a - b)
  ys.sort((a, b) => a - b)
  const x0 = percentile(xs, PCT_LO) / W
  const x1 = percentile(xs, PCT_HI) / W
  const y0 = percentile(ys, PCT_LO) / H
  const y1 = percentile(ys, PCT_HI) / H
  rows.push({
    frame,
    p: frame / (TOTAL - 1),
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    w: x1 - x0,
    h: y1 - y0,
    lit: xs.length,
  })
  console.log(
    `f${String(frame).padStart(3, '0')}  p=${rows.at(-1).p.toFixed(3)}  ` +
      `cx=${rows.at(-1).cx.toFixed(3)} cy=${rows.at(-1).cy.toFixed(3)} ` +
      `w=${rows.at(-1).w.toFixed(3)} h=${rows.at(-1).h.toFixed(3)}  lit=${xs.length}`,
  )
}
// Smooth the sampled keyframes so the interpolated window never "breathes"
// between stops (simple ±1 neighbourhood mean per field).
const smooth = (key) =>
  rows.map((r, i) => {
    const a = rows[Math.max(0, i - 1)]
    const b = rows[Math.min(rows.length - 1, i + 1)]
    const vals = [a[key], r[key], b[key]]
    return vals.reduce((s, v) => s + v, 0) / vals.length
  })

const cx = smooth('cx')
const cy = smooth('cy')
const w = smooth('w')
const h = smooth('h')
const ps = rows.map((r) => r.p)

const keyframes = ps.map((p, i) => ({
  p,
  cx: cx[i],
  cy: cy[i],
  w: w[i],
  h: h[i],
  coverW: ART_COVER[rows[i].frame] ?? 0,
}))

const ts = `// GENERATED FILE — scripts/measure-focal.mjs (do not hand-edit)
// Core-subject focal keyframes, measured from the 4K PNG masters
// (luminance > ${TH}, percentile band ${PCT_LO}–${PCT_HI}, ±1-sample smoothed).
// All values are fractions of the 16:9 source frame.

export interface FocalKeyframe {
  p: number
  cx: number
  cy: number
  w: number
  h: number
  /**
   * Art-directed minimum window width for this beat (fraction of source
   * width), 0 when the measured focus alone is sufficient. The beats at
   * p ≈ 0.13–0.50 carry the forearm's INTEGRATIONS tattoo whose span is
   * wider than a pure focus-crop shows at phone aspects; "coverW" widens
   * those beats' windows so the brand word stays legible end-to-end.
   */
  coverW?: number
}

export const FOCAL_KEYFRAMES: FocalKeyframe[] = [
${keyframes
  .map(
    (k) =>
      `  { p: ${k.p.toFixed(4)}, cx: ${k.cx.toFixed(4)}, cy: ${k.cy.toFixed(4)}, w: ${k.w.toFixed(4)}, h: ${k.h.toFixed(4)}, coverW: ${k.coverW.toFixed(4)} },`,
  )
  .join('\n')}
]

/**
 * Rendering-baseline constants shared by the engine over the measured
 * subject box (kept next to the measurement so both live under the same
 * reproducible file):
 *
 * - yMargin — how much of the 16:9 frame the portrait action window keeps
 *   vertically, as a multiple of the measured subject height. The
 *   luminance table trims outliers and under-measures limb extremes, so
 *   1.3 lives between "subject breathing room" and "arm/nail/tattoo
 *   detail stays drawable". Windows get aspect-locked to the viewport
 *   after this, so window width always follows from window height.
 * - minHeightFraction — floor so compact subject boxes never over-zoom
 *   past a comfortable closeup.
 */
export const FOCAL_KEYFRAME_BASELINE = { yMargin: 1.3, minHeightFraction: 0.6 } as const

/**
 * Designed end-state framing for the portrait lockup (the reframe-band
 * target): the CHOPSTICK INTEGRATIONS wordmark actually spans
 * x ≈ 0.118–0.951 across the source frame (the luminance-derived table
 * under-measures the smoke-veiled type), and the type's centre of mass
 * sits at cx ≈ 0.53, cy ≈ 0.47. A 0.96-wide, full-height window centered
 * there keeps ≥ 16px drawn margin around the wordmark at every shipped
 * phone width (320 and 390 included) while the vertical space stays the
 * frame's own in-scene smoke.
 */
export const LOCKUP_WINDOW = { cx: 0.53, cy: 0.47, w: 0.96, h: 1.0 } as const


/** Piecewise-linear focal sample at progress p ∈ [0, 1]. */
export function sampleFocal(p: number): FocalKeyframe {
  const frames = FOCAL_KEYFRAMES
  if (p <= frames[0].p) return frames[0]
  if (p >= frames[frames.length - 1].p) return frames[frames.length - 1]
  for (let i = 1; i < frames.length; i++) {
    if (p <= frames[i].p) {
      const a = frames[i - 1]
      const b = frames[i]
      const t = (p - a.p) / (b.p - a.p)
      return {
        p,
        cx: a.cx + (b.cx - a.cx) * t,
        cy: a.cy + (b.cy - a.cy) * t,
        w: a.w + (b.w - a.w) * t,
        h: a.h + (b.h - a.h) * t,
        coverW: (a.coverW ?? 0) + ((b.coverW ?? 0) - (a.coverW ?? 0)) * t,
      }
    }
  }
  return frames[frames.length - 1]
}
`

// ---------------------------------------------------------------------------
// Rendering-baseline constants — emitted verbatim so a regeneration never
// loses them (the template body above is the single source of truth).
// ---------------------------------------------------------------------------

await fs.writeFile(OUT_TS, ts)
console.log(`\nWrote ${OUT_TS} (${keyframes.length} keyframes)`)
