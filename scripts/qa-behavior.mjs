import puppeteer from 'puppeteer-core'
import fs from 'node:fs/promises'

/**
 * Behavioral probes beyond the fixed shot grid:
 *  1. reverse scrub: 1.0 -> 0.25 must repaint with the earlier frame
 *  2. mid-page reload at ~p 0.4: poster/canvas must restore that frame,
 *     never flash frame 0 (QA-REL-01)
 */
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:8000/'
const OUT = process.env.QA_OUT ?? 'qa/probe'
await fs.mkdir(OUT, { recursive: true })

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-first-run', '--hide-scrollbars'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })

const geo = await page.evaluate(() => {
  const runway = document.getElementById('hero-runway')
  const top = runway.getBoundingClientRect().top + window.scrollY
  return { top, travel: Math.max(1, runway.offsetHeight - window.innerHeight) }
})
const at = (p) => geo.top + p * geo.travel
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// --- 1. reverse scrub -------------------------------------------------------
await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), at(1.0))
await wait(900)
await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), at(0.25))
await wait(900)
let state = await page.evaluate(() => ({
  painted: document.getElementById('hero-sticky-stage').classList.contains('is-painted'),
  header: document.getElementById('site-header').classList.contains('is-active'),
}))
await page.screenshot({ path: `${OUT}/reverse_scrub_p0_25.png` })
console.log('reverse scrub -> painted:', state.painted, '| header still active? ', state.header, '(expect false)')

// --- 2. mid-page reload (QA-REL-01) ----------------------------------------
await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), at(0.4))
await wait(1200) // let the canvas paint frame ~119 first
await page.reload({ waitUntil: 'domcontentloaded' })
// measure time until the stage is painted after restore
const t0 = Date.now()
let restored = null
for (let i = 0; i < 40; i++) {
  await wait(50)
  restored = await page.evaluate(() => ({
    painted: document.getElementById('hero-sticky-stage').classList.contains('is-painted'),
  }))
  if (restored.painted) break
}
console.log('restore painted after', Date.now() - t0, 'ms | state:', JSON.stringify(restored))
// let a few more blits settle, then capture
await wait(800)
let flashCheck = await page.evaluate(() => ({
  src: document.getElementById('hero-poster')?.getAttribute('src') ?? '',
}))
console.log('poster src after restore:', flashCheck.src)
const y = await page.evaluate(() => ({ sy: window.scrollY }))
console.log('scrollY preserved:', y.sy, '≈', Math.round(at(0.4)), Math.abs(y.sy - Math.round(at(0.4))) < 4 ? 'OK' : 'MISMATCH')
await page.screenshot({ path: `${OUT}/reload_restore_p0_4.png` })
await browser.close()
