import puppeteer from 'puppeteer-core'
import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Objective hero-composition QA harness.
 * Scrolls the real page (Lenis adopts native scrollTo) to exact progress
 * values, screenshots the sticky stage, and measures non-void pixel
 * coverage + letterbox band extents per shot.
 *
 * Usage:
 *   QA_OUT=qa/before node scripts/qa-shots.mjs
 *   QA_REDUCED=1 node scripts/qa-shots.mjs      # reduced-motion probe only
 */
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.QA_URL ?? 'http://localhost:8000/'
const OUT_ROOT = process.env.QA_OUT ?? 'qa/run'
const REDUCED = process.env.QA_REDUCED === '1'

const VIEWPORTS = [
  { name: '320x640', w: 320, h: 640 },
  { name: '375x812', w: 375, h: 812 },
  { name: '390x844', w: 390, h: 844 },
  { name: '430x932', w: 430, h: 932 },
  { name: '768x1024', w: 768, h: 1024 },
  { name: '1024x768', w: 1024, h: 768 },
  { name: '1440x900', w: 1440, h: 900 },
  { name: '1920x1080', w: 1920, h: 1080 },
  { name: '844x390', w: 844, h: 390 }, // phone landscape
]

// Thin target grid: <0.8 action phases, >0.8 reframe/lockup, plus release.
const TARGETS = [0, 0.3, 0.5, 0.7, 0.9, 0.95, 1.0]
const RELEASE_TARGETS = new Set(['390x844', '1920x1080']) // + scroll-past shot

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-first-run', '--hide-scrollbars'],
})

async function metrics(file) {
  const img = sharp(file)
  const { width: W, height: H } = await img.metadata()
  const raw = await img.raw().toBuffer()
  const ch = W * H
  let lit = 0
  let firstLitRow = -1
  let lastLitRow = -1
  const rowLit = new Array(H).fill(0)
  for (let i = 0; i < ch; i++) {
    const o = i * 3
    const d = Math.abs(raw[o] - 3) + Math.abs(raw[o + 1] - 3) + Math.abs(raw[o + 2] - 3)
    if (d > 24) {
      lit++
      rowLit[(i / ch) | 0]++
    }
  }
  for (let y = 0; y < H; y++) {
    if (rowLit[y] > W * 0.02) {
      if (firstLitRow < 0) firstLitRow = y
      lastLitRow = y
    }
  }
  const bandTop = firstLitRow < 0 ? 0 : firstLitRow / H
  const bandBottom = firstLitRow < 0 ? 0 : 1 - (lastLitRow + 1) / H
  return { coverage: (lit / ch) * 100, bandTop: bandTop * 100, bandBottom: bandBottom * 100 }
}

await fs.mkdir(OUT_ROOT, { recursive: true })

const browserViewports = REDUCED ? VIEWPORTS.slice(2, 3) : VIEWPORTS
const results = []

for (const vp of browserViewports) {
  const page = await browser.newPage()
  if (REDUCED) {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  }
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 })
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })

  const geo = await page.evaluate(() => {
    const runway = document.getElementById('hero-runway')
    if (!runway) return null
    const top = runway.getBoundingClientRect().top + window.scrollY
    const travel = Math.max(1, runway.offsetHeight - window.innerHeight)
    return { top, travel }
  })
  if (!geo) {
    console.error(`viewport ${vp.name}: #hero-runway missing?!`)
    await page.close()
    continue
  }

  const targets = REDUCED ? [0] : [...TARGETS, ...(RELEASE_TARGETS.has(vp.name) ? [1.15] : [])]
  for (const p of targets) {
    const y = Math.round(geo.top + p * geo.travel)
    await page.evaluate(
      (yy) => window.scrollTo({ top: yy, behavior: 'instant' }),
      y,
    )
    await new Promise((r) => setTimeout(r, 700)) // Lenis adopt + decode + paint
    const state = await page.evaluate(() => ({
      sy: window.scrollY,
      painted: document.getElementById('hero-sticky-stage').classList.contains('is-painted'),
    }))
    const label = `${vp.name}_p${String(p).replace('.', '_')}`
    const file = path.join(OUT_ROOT, `${label}.png`)
    await page.screenshot({ path: file })
    const m = await metrics(file)
    results.push({ vp: vp.name, p, ...m, painted: state.painted })
    process.stdout.write(
      `${label.padEnd(18)} covered=${m.coverage.toFixed(1).padStart(5)}%  bands(top/bot)=${m.bandTop.toFixed(0)}/${m.bandBottom.toFixed(0)}  painted=${state.painted}\n`,
    )
  }
  await page.close()
}

await browser.close()
await fs.writeFile(
  path.join(OUT_ROOT, 'metrics.json'),
  JSON.stringify(results, null, 2),
)
console.log(`\nSaved ${results.length} shots + metrics to ${OUT_ROOT}/`)
