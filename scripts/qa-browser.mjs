// Headless QA driver for Chopstick Integrations — Phase 5 verification.
// Drives a real Chrome via CDP through: hero scrub states, portrait reframe
// band, logo handoff, post-hero reveals, and the reduced-motion fallback.
import CDP from 'chrome-remote-interface'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:4173/'
const SHOTS = '/var/folders/t5/3knvjg712xd0fgq3gvnm4_zc0000gn/T/'

const results = []
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const chrome = spawn(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=0', '--window-size=1440,900',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  // wait for the DevToolsActive line on stderr
  const port = await new Promise((resolve, reject) => {
    let acc = ''
    chrome.stderr.on('data', (d) => {
      acc += d.toString()
      const m = acc.match(/ws:\/\/127\.0\.0\.1:(\d+)\//) ?? acc.match(/127\.0\.0\.1:(\d+)/)
      if (m) resolve(+m[1])
      if (acc.length > 4000) reject(new Error('no devtools port\n' + acc))
    })
    setTimeout(() => reject(new Error('timeout waiting for chrome\n' + acc)), 10000)
  })

  const client = await CDP({ port })
  const { Page, Runtime, Emulation, DOM } = client
  await Page.enable()
  await Runtime.enable()
  await DOM.enable()

  const evalJS = async (expression) => {
    const r = await Runtime.evaluate({ expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
    return r.result.value
  }

  const settle = () => sleep(2200) // lenis lerp + IO + paint

  const shot = async (name) => {
    const { data } = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: false })
    writeFileSync(`${SHOTS}qa-${name}.png`, Buffer.from(data, 'base64'))
  }

  const goto = async (url) => { await Page.navigate({ url }); await Page.loadEventFired(); await settle() }

  const setViewport = async (w, h) => {
    await Emulation.setDeviceMetricsOverride({ width: w, height: h, deviceScaleFactor: 2, mobile: w < 800 })
    await evalJS(`dispatchEvent(new Event('resize'))`)
  }

  const travel = () => evalJS(`
    (() => { const runway = document.getElementById('hero-runway');
      return Math.max(1, runway.offsetHeight - innerHeight) })()`)

  const scrollProgress = async (p) => {
    await evalJS(`scrollTo(0, ${Math.round(await travel() * p)})`)
    await settle()
  }

  // ================= 1 · LANDSCAPE FULL SEQUENCE =================
  await goto(BASE)
  await setViewport(1440, 900)

  let size
  size = await evalJS(`[innerWidth, innerHeight]`)
  ok('L viewport 1440×900', size[0] === 1440 && size[1] === 900, size.join('×'))

  let stats = await evalJS(`({
    painted: document.getElementById('hero-sticky-stage').classList.contains('is-painted'),
    header: document.getElementById('site-header').classList.contains('is-active'),
    progress: undefined
  })`)
  ok('L p=0 hero painted', stats.painted === true && stats.header === false, JSON.stringify(stats))
  await shot('L-p0')

  await scrollProgress(0.30)
  await shot('L-p30')
  await scrollProgress(0.50)
  await shot('L-p50')
  await scrollProgress(0.70)
  await shot('L-p70')
  await scrollProgress(0.90)
  await shot('L-p90')

  await scrollProgress(0.995)
  stats = await evalJS(`({
    header: document.getElementById('site-header').classList.contains('is-active'),
    painted: document.getElementById('hero-sticky-stage').classList.contains('is-painted')
  })`)
  ok('L p≈1 header handoff', stats.header === true && stats.painted === true, JSON.stringify(stats))
  await shot('L-p995')

  // intact DOM flow below the released hero: jump to bottom of page
  await evalJS(`scrollTo(0, document.body.scrollHeight)`)
  await settle()
  let revealed
  revealed = await evalJS(`({
    total: document.querySelectorAll('.reveal').length,
    hidden: document.querySelectorAll('.reveal:not(.is-visible)').length
  })`)
  ok('L bottom reveals visible', revealed.total === 24 && revealed.hidden === 0,
    JSON.stringify(revealed))
  await shot('L-bottom')

  const footerVisible = await evalJS(`
    (() => { const f = document.querySelector('.site-footer');
      const r = f.getBoundingClientRect(); return r.bottom <= innerHeight + 2 && r.top < innerHeight; })()`)
  ok('L footer reachable', footerVisible === true)
  await shot('L-footer')

  // ================= 2 · PORTRAIT REFRAME BAND =================
  await goto(BASE)
  await setViewport(390, 844)

  // scroll first (portrait has the dynamic reframe), then screenshot.
  await scrollProgress(0.5)
  await shot('P-p50')
  await scrollProgress(0.9) // mid reframe band (0.82 → 0.98)
  stats = await evalJS(`({
    painted: document.getElementById('hero-sticky-stage').classList.contains('is-painted'),
    portrait: innerHeight > innerWidth
  })`)
  ok('P reframe band painted', stats.painted && stats.portrait, JSON.stringify(stats))
  await shot('P-p90')
  await scrollProgress(0.995)
  await shot('P-lockup')

  // canvas CSS box matches layout box
  const containCheck = await evalJS(`
    (() => { const c = document.getElementById('hero-canvas');
      return Math.round(c.clientWidth) === Math.round(c.getBoundingClientRect().width); })()`)
  ok('P canvas sized', containCheck === true)

  // ================= 3 · REDUCED MOTION =================
  await Emulation.setEmulatedMedia({ features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await goto(BASE + '?rm=reduce-verified')
  stats = await evalJS(`({
    runwayH: document.getElementById('hero-runway').offsetHeight,
    innerH: innerHeight,
    posterIsLockup: document.getElementById('hero-poster').src.split('/').pop() === 'f_299.webp',
    header: document.getElementById('site-header').classList.contains('is-active')
  })`)
  ok('RM runway collapsed to 100vh', Math.abs(stats.runwayH - stats.innerH) < 64,
    `${stats.runwayH} vs ${stats.innerH}`)
  ok('RM static lockup + header', stats.posterIsLockup && stats.header, JSON.stringify(stats))
  const hasCanvas = await evalJS(`document.querySelector('canvas') !== null`)
  ok('RM page intact', hasCanvas === true)
  await shot('RM-static')
  await Emulation.setEmulatedMedia({ features: [] })

  // ================= 4 · MEMORY / STREAM SANITY =================
  const streamable = await evalJS(`(async () => {
    const res = await fetch('/assets/frames/f_150.webp', { cache: 'force-cache' });
    return res.ok; })()`)
  ok('stream frame accessible', streamable === true)

  await client.close()
  chrome.kill()
  const fails = results.filter(r => !r.pass).length
  console.log(`\nSUMMARY: ${results.length - fails}/${results.length} passed`)
  process.exit(fails ? 1 : 0)
}

main().catch((err) => { console.error('QA DRIVER ERROR:', err.message); process.exit(2) })
