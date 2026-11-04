/**
 * One-shot logo analysis for the PoC handoff alignment:
 * finds the baked chopsticks' angle + centroid and the wordmark band in the
 * supplied 1920×1080 transparent logo plate.
 * Usage: node tools/logo-scan.mjs
 */
import sharp from 'sharp'

const SRC = new URL('../ref/logo.png', import.meta.url).pathname // copied asset, 1920×1080

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true })
const { width: W, height: H, channels: C } = info

const red = []
const chrome = []
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C
    const a = data[i + 3]
    if (a < 70) continue
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (r > 110 && r > 1.8 * g && r > 1.8 * b) red.push([x, y])
    else if (r > 100 && g > 90 && b > 90 && Math.abs(r - g) < 36 && Math.abs(g - b) < 36) chrome.push([x, y])
  }
}

// the sticks cross the "O" in the inner band; streaks/blooms elsewhere skew a
// global PCA, so restrict to the central stick window for the true axis.
const FOCUS = { x0: 0.32 * W, x1: 0.50 * W, y0: 0.20 * H, y1: 0.78 * H }
const redF = red.filter(p => p[0] > FOCUS.x0 && p[0] < FOCUS.x1 && p[1] > FOCUS.y0 && p[1] < FOCUS.y1)
const n = redF.length
const mx = redF.reduce((s, p) => s + p[0], 0) / n
const my = redF.reduce((s, p) => s + p[1], 0) / n
let sxx = 0, syy = 0, sxy = 0
for (const [x, y] of redF) {
  const dx = x - mx, dy = y - my
  sxx += dx * dx; syy += dy * dy; sxy += dx * dy
}
// principal axis angle (deg, screen coords, y down)
const ang = Math.atan2(sxy * 2, sxx - syy) * 180 / Math.PI

// wordmark band = robust chrome bbox (5–95 percentile rows)
const ys = chrome.map(p => p[1]).sort((a, b) => a - b)
const xys = chrome.filter(p => p[1] > ys[Math.floor(chrome.length * 0.05)] && p[1] < ys[Math.floor(chrome.length * 0.70)])
const cx = xys.reduce((s, p) => s + p[0], 0) / xys.length
const cy = xys.reduce((s, p) => s + p[1], 0) / xys.length

// the sticks' own centroid (red includes petals; sticks dominate the core)
const coreR = red.filter(p => Math.hypot(p[0] - W * 0.37, p[1] - H * 0.37) < W * 0.09)
const scx = coreR.length ? coreR.reduce((s, p) => s + p[0], 0) / coreR.length : NaN
const scy = coreR.length ? coreR.reduce((s, p) => s + p[1], 0) / coreR.length : NaN

console.log(JSON.stringify({
  imgW: W,
  imgH: H,
  redPixels: n,
  chromePixels: chrome.length,
  stickAngleDeg: +ang.toFixed(1),
  redCentroid: [Math.round(mx), Math.round(my)],
  stickCoreCentroid: [Math.round(scx), Math.round(scy)],
  wordmarkCentroid: [Math.round(cx), Math.round(cy)],
  redBBox: (() => {
    const xs = red.map(p => p[0]).sort((a, b) => a - b)
    const yr = red.map(p => p[1]).sort((a, b) => a - b)
    return [xs[Math.floor(n * 0.02)], yr[Math.floor(n * 0.02)], xs[Math.floor(n * 0.98)], yr[Math.floor(n * 0.98)]]
  })(),
}, null, 2))
