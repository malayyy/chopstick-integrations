/**
 * Automated QA battery for the cinematic experience.
 *   node tools/qa/run-qa.mjs
 *
 * Frame accuracy protocol (authoritative): `window.__film.draw()` followed by
 * `readPixels` probes on a 240-point grid INSIDE THE SAME JS TASK (the default
 * framebuffer is only valid within the task that rendered it), compared
 * against the raw 4K masters. `page.screenshot` content is compositor-managed
 * and can lag/blend independently of the GL state, so screenshot-vs-master
 * diffs are recorded as advisory `shot_*` metrics only.
 *
 * Viewport matrix (desktop / ultrawide / phone portrait / phone landscape /
 * tablet) + robustness: idle freeze, reduced-motion, context-loss restore,
 * no-WebGL2 fallback. Artifacts land in qa/.artifacts/ (gitignored).
 */
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ART = 'qa/.artifacts';
mkdirSync(ART, { recursive: true });

const BASE = 'http://localhost:4173';
const N = 300;

/* Pass thresholds */
const GRID_ACCURACY_MAX = 8;      // mean abs channel diff /255, 240-pt grid
const BUDGET_TOLERANCE = 1.03;    // admits may overshoot the budget by ≤3%

const VIEWPORTS = [
  { name: 'desktop-1440x900-dpr2', w: 1440, h: 900, dpr: 2 },
  { name: 'ultrawide-3440x1440-dpr1', w: 3440, h: 1440, dpr: 1 },
  { name: 'phone-portrait-393x852-dpr3', w: 393, h: 852, dpr: 3, mobile: true },
  { name: 'phone-landscape-852x393-dpr3', w: 852, h: 393, dpr: 3, mobile: true },
  { name: 'tablet-820x1180-dpr2', w: 820, h: 1180, dpr: 2, mobile: true },
];

/* Frames sampled for pixel accuracy against the masters. */
const SAMPLE_INDICES = [0, 1, 60, 129, 160, 219, 240, 299];

const report = { startedAt: new Date().toISOString(), runs: [], robustness: [] };
let totalFails = 0;

/* ---- master raw buffers, decoded once (24.9MB each) ---- */
const MASTER_RAW = new Map();
async function masterRaw(idx) {
  if (!MASTER_RAW.has(idx)) {
    MASTER_RAW.set(idx, await sharp(
      `frames-4k/ezgif-frame-${String(idx + 1).padStart(3, '0')}.png`)
      .removeAlpha().raw().toBuffer({ resolveWithObject: true }));
  }
  return MASTER_RAW.get(idx);
}

const settle = (ms = 2200) => new Promise((r) => setTimeout(r, ms));
const scrollPos = (page, frac) =>
  page.evaluate((f) => {
    const el = document.documentElement;
    window.scrollTo(0, Math.round((el.scrollHeight - el.clientHeight) * f));
  }, frac);

/* Listener bundle shared by every page */
function wireLogging(page, run) {
  run.log = [];
  page.on('console', (m) => {
    const t = `[${m.type()}] ${m.text()}`;
    run.log.push(t);
    if (m.type() === 'error') (run.consoleIssues ||= []).push(t);
  });
  page.on('pageerror', (e) => {
    run.log.push(`[pageerror] ${e.message}`);
    (run.consoleIssues ||= []).push(`[pageerror] ${e.message}`);
    (run.errors ||= []).push(e.message);
  });
  page.on('requestfailed', (r) => {
    const t = `[reqfail] ${r.url()} ${r.failure()?.errorText}`;
    run.log.push(t);
    (run.consoleIssues ||= []).push(t);
    (run.errors ||= []).push('reqfail ' + r.url());
  });
}

/* 240-point readback grid straight from the GL framebuffer (ground truth).
   draw() must be called in the same task or readPixels returns a purged
   default-framebuffer (preserveDrawingBuffer: false). */
const GRID = (page) => page.evaluate(() => {
  const f = window.__film;
  f.draw();
  const st = f.snapshot();
  const [ox, oy] = st.off, [dw, dh] = st.disp, [cw, ch] = f.dims();
  const pts = [];
  for (let iy = 0; iy < 12; iy++) {
    for (let ix = 0; ix < 20; ix++) {
      const u = (ix + 0.5) / 20 * 0.94 + 0.03;
      const v = (iy + 0.5) / 12 * 0.94 + 0.03;
      const cx = Math.min(cw - 1, Math.round(ox + u * dw));
      const cy = Math.min(ch - 1, Math.round(oy + v * dh));
      pts.push({ u, v, rgb: f.readback(cx, ch - 1 - cy) });
    }
  }
  return pts;
});

const gridVsMaster = (grid, master) => {
  const M = master.info.width, H2 = master.info.height, data = master.data;
  let sum = 0;
  for (const pt of grid) {
    const mx = Math.round(pt.u * (M - 1)), my = Math.round(pt.v * (H2 - 1));
    const mi = (my * M + mx) * 3;
    sum += Math.abs(pt.rgb[0] - data[mi]) +
           Math.abs(pt.rgb[1] - data[mi + 1]) +
           Math.abs(pt.rgb[2] - data[mi + 2]);
  }
  return sum / grid.length / 3;
};

/* wait until the film has actually decoded `want` (bounded) — the engine
   displays the nearest decoded frame while chasing, which is correct UX but
   would pollute an accuracy probe */
async function waitForFrame(page, want, timeoutMs = 12000) {
  const t0 = Date.now();
  for (;;) {
    const s = await page.evaluate((w) => {
      const st = window.__film.snapshot();
      return { has: st.cached.includes(w), lanes: st.lanes, index: st.index };
    }, want);
    if (s.has || Date.now() - t0 > timeoutMs) return s;
    await settle(250);
  }
}

/* ------------------------------ MAIN RUN -------------------------------- */
async function runViewport(browser, vp) {
  const run = { viewport: vp.name, checks: {}, artifacts: [] };
  const page = await browser.newPage();
  await page.setViewport({
    width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr,
    isMobile: !!vp.mobile, hasTouch: !!vp.mobile,
  });
  if (vp.mobile) {
    /* Engine reads `matchMedia('(pointer: coarse)')` at load; force it true
       so mobile viewports exercise the real mobile budget/caps. */
    await page.evaluateOnNewDocument(() => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (q) => {
        const m = orig(q);
        if (typeof q === 'string' && q.includes('(pointer: coarse)')) {
          try { Object.defineProperty(m, 'matches', { value: true }); } catch { /* ignore */ }
        }
        return m;
      };
    });
  }
  wireLogging(page, run);

  await page.goto(`${BASE}/?debug`, { waitUntil: 'networkidle2', timeout: 30000 });
  const booted = await page
    .waitForSelector('#boot', { hidden: true, timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  await settle(400);
  run.checks.boot = booted;
  if (!booted) { totalFails++; report.runs.push(run); await page.close(); return; }

  const snap = () => page.evaluate(() => window.__film.snapshot());

  /* full-bleed: canvas covers the viewport exactly */
  const s0 = await snap();
  run.checks.canvasFillsViewport =
    await page.evaluate(() => {
      const r = document.getElementById('stage').getBoundingClientRect();
      return Math.abs(r.width - innerWidth) < 1.5 && Math.abs(r.height - innerHeight) < 1.5 &&
             r.top === 0 && r.left === 0;
    });
  run.checks.canvasSize = s0.canvas;

  /* 1) frame accuracy at sampled indices */
  let maxGrid = 0, maxShot = 0;
  for (const want of SAMPLE_INDICES) {
    await scrollPos(page, want / (N - 1));
    await settle();
    await waitForFrame(page, want);
    const s = await snap();
    run.checks[`reflect_${want}`] = Math.abs(s.index - want) <= 1
      ? 'pass' : `got=${s.index.toFixed(3)}`;

    /* authoritative: same-task readback vs master */
    const grid = await GRID(page);
    const gridDiff = gridVsMaster(grid, await masterRaw(want));
    run.checks[`grid_${want}`] = +gridDiff.toFixed(2);
    maxGrid = Math.max(maxGrid, gridDiff);

    /* advisory: compositor screenshot band vs master */
    const shot = `${vp.name}-f${want}.png`;
    run.artifacts.push(shot);
    const shotBuf = await page.screenshot({ path: join(ART, shot) });
    const s2 = await snap();
    const meta = await sharp(shotBuf).metadata();
    const kx = meta.width / s2.canvas[0], ky = meta.height / s2.canvas[1];
    const refW = 480, refH = 270;
    const masterSmall = await sharp(
      `frames-4k/ezgif-frame-${String(want + 1).padStart(3, '0')}.png`)
      .resize(refW, refH, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const band = await sharp(shotBuf)
      .extract({
        left: Math.round(s2.off[0] * kx), top: Math.round(s2.off[1] * ky),
        width: Math.round(s2.disp[0] * kx), height: Math.round(s2.disp[1] * ky),
      })
      .resize(refW, refH, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    let diffSum = 0;
    for (let i = 0; i < masterSmall.length; i++) diffSum += Math.abs(masterSmall[i] - band[i]);
    const shotDiff = diffSum / masterSmall.length;
    run.checks[`shot_${want}`] = +shotDiff.toFixed(2);
    maxShot = Math.max(maxShot, shotDiff);
  }
  run.checks.frameAccuracy = maxGrid < GRID_ACCURACY_MAX
    ? `pass (grid max ${maxGrid.toFixed(2)})`
    : `FAIL grid max=${maxGrid.toFixed(1)}`;
  run.checks.shotAdvisory = `max ${maxShot.toFixed(1)} (compositor noise — not a pass criterion)`;
  if (maxGrid >= GRID_ACCURACY_MAX) totalFails++;

  /* 2) scroll-up reversal lands on the exact index for the new scrollY */
  await scrollPos(page, 0.33);
  await settle();
  const mid = (await snap()).index;
  await scrollPos(page, 0.31);
  await settle();
  const back = (await snap()).index;
  run.checks.reverse =
    Math.abs(back - 0.31 * (N - 1)) <= 1 ? 'pass' : `FAIL ${mid.toFixed(2)}->${back.toFixed(2)}`;

  /* 3) rapid scroll: burst of steps then settle on the final position */
  await scrollPos(page, 0.02);
  await settle(500);
  await page.evaluate(() => {
    const el = document.documentElement;
    for (let step = 1; step <= 14; step++) {
      window.scrollTo(0, (el.scrollHeight - el.clientHeight) * (0.02 + 0.63 * (step / 14)));
    }
  });
  await settle(1800);
  const afterBurst = (await snap()).index;
  const expected = Math.round((0.02 + 0.63) * (N - 1));
  run.checks.rapidScroll = Math.abs(afterBurst - expected) <= 2
    ? 'pass' : `got=${afterBurst.toFixed(1)} want=${expected}`;

  /* 4) exact endpoints */
  await scrollPos(page, 0);
  await settle();
  run.checks.head = Math.abs((await snap()).index) < 0.02 ? 'pass' : 'FAIL';
  await scrollPos(page, 1);
  await settle();
  run.checks.tail = Math.abs((await snap()).index - (N - 1)) < 0.02 ? 'pass' : 'FAIL';

  /* 5) memory: bounded, admission overshoot tolerated, tends back down */
  await settle(2500);   // let the window finish loading + trim
  const sEnd = await snap();
  const withinBudget = sEnd.textureMB <= sEnd.budgetMB * BUDGET_TOLERANCE && sEnd.textureMB > 0;
  run.checks.textureBudget = withinBudget
    ? `pass (${sEnd.textureMB}/${sEnd.budgetMB}MB, ${sEnd.decoded} frames, uploadW=${sEnd.uploadW})`
    : `FAIL ${sEnd.textureMB}/${sEnd.budgetMB}MB`;
  if (!withinBudget) totalFails++;
  run.checks.cachedRange = [sEnd.cached[0], sEnd.cached.at(-1)];
  const metrics = await page.metrics();
  run.checks.jsHeapMB = +(metrics.JSHeapUsedSize / 1048576).toFixed(1);

  /* 6) idle: ambient clock freezes → no redraws, no network while idle */
  await scrollPos(page, 0.45);
  await settle(3000);
  await awaitPageIdle(page);   // waits for prefetch lanes to drain
  const before = await snap();
  let fetched = 0;
  const counter = (r) => { if (r.url().includes('/frames/')) fetched++; };
  page.on('request', counter);
  await settle(6500);          // > IDLE_FREEZE_MS
  const after = await snap();
  page.off('request', counter);
  run.checks.idleNoGPU = after.draws - before.draws <= 1
    ? 'pass' : `FAIL ${before.draws}->${after.draws} draws while idle`;
  run.checks.idleNoNetwork = fetched === 0
    ? 'pass' : `FAIL ${fetched} frame fetches while idle`;
  if (after.draws - before.draws > 1 || fetched > 0) totalFails++;

  /* 7) console clean */
  run.checks.consoleIssues ||= [];
  run.checks.consoleClean = run.checks.consoleIssues.length === 0
    ? 'pass' : run.checks.consoleIssues;

  if (run.checks.reverse.startsWith('FAIL') || run.checks.rapidScroll.startsWith('FAIL') ||
      run.checks.head === 'FAIL' || run.checks.tail === 'FAIL') totalFails++;

  report.runs.push(run);
  const fails = Object.entries(run.checks).filter(([, v]) => String(v).startsWith('FAIL'));
  console.log(`  ${vp.name}: ${fails.length === 0 ? 'ALL PASS' : fails.map(([k, v]) => `${k} ${v}`).join(' | ')}`);
  await page.close();
}

/* wait until prefetch lanes drain (bounded) */
async function awaitPageIdle(page) {
  const snap = () => page.evaluate(() => window.__film.snapshot());
  for (let i = 0; i < 40; i++) {
    await settle(250);
    const s = await snap();
    if (s.lanes === 0) return;
  }
}

/* --------------------------- ROBUSTNESS RUNS ---------------------------- */
async function reducedMotionRun(browser) {
  const run = { name: 'reduced-motion (desktop viewport)', checks: {} };
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  wireLogging(page, run);
  await page.goto(`${BASE}/?debug`, { waitUntil: 'networkidle2', timeout: 30000 });
  const booted = await page.waitForSelector('#boot', { hidden: true, timeout: 20000 })
    .then(() => true).catch(() => false);
  run.checks.boot = booted;
  await settle(400);
  const s = await page.evaluate(() => window.__film.snapshot());
  run.checks.motionFlagFrozen = s.motion === 0 ? 'pass' : `FAIL motion=${s.motion}`;
  await scrollPos(page, 0.4);
  await settle(2000);
  const d0 = (await page.evaluate(() => window.__film.snapshot())).draws;
  await settle(6500);
  const d1 = (await page.evaluate(() => window.__film.snapshot())).draws;
  run.checks.frozenWhileIdle = d1 - d0 <= 1 ? 'pass' : `FAIL ${d0}->${d1} draws`;
  run.checks.consoleClean = (run.consoleIssues?.length ?? 0) === 0 ? 'pass' : run.consoleIssues;
  if (Object.values(run.checks).some((v) => String(v).startsWith('FAIL'))) totalFails++;
  report.robustness.push(run);
  console.log(`  ${run.name}: ${JSON.stringify(run.checks)}`);
  await page.close();
}

async function contextLossRun(browser) {
  const run = { name: 'context loss/restore (desktop viewport)', checks: {} };
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  wireLogging(page, run);
  await page.goto(`${BASE}/?debug`, { waitUntil: 'networkidle2', timeout: 30000 });
  const booted = await page.waitForSelector('#boot', { hidden: true, timeout: 20000 })
    .then(() => true).catch(() => false);
  run.checks.boot = booted;
  await settle(400);
  await scrollPos(page, 129 / (N - 1));
  await settle(2200);

  /* drop the context */
  await page.evaluate(() => window.__film.loseContext());
  await settle(900);
  const lost = await page.evaluate(() => window.__film.snapshot());
  run.checks.contextLost = lost.decoded === 0 ? 'pass' : `FAIL decoded=${lost.decoded}`;

  /* restore: engine must rebuild program/geometry, re-warm, keep tracking */
  await page.evaluate(() => window.__film.restoreContext());
  await settle(3000);
  await awaitPageIdle(page);
  await waitForFrame(page, 129);
  const restored = await page.evaluate(() => window.__film.snapshot());
  run.checks.rewarmed = restored.decoded >= 2 ? 'pass' : `FAIL decoded=${restored.decoded}`;
  const want = 129;
  run.checks.indexTracked = Math.abs(restored.index - want) <= 1
    ? 'pass' : `FAIL index=${restored.index.toFixed(2)}`;
  const grid = await GRID(page);
  const gridDiff = gridVsMaster(grid, await masterRaw(want));
  run.checks.renderedAccurate = gridDiff < GRID_ACCURACY_MAX
    ? `pass (grid ${gridDiff.toFixed(2)})` : `FAIL grid=${gridDiff.toFixed(2)}`;
  if (gridDiff >= GRID_ACCURACY_MAX) totalFails++;
  run.checks.consoleClean = (run.consoleIssues?.length ?? 0) === 0 ? 'pass' : run.consoleIssues;
  if (Object.values(run.checks).some((v) => String(v).startsWith('FAIL'))) totalFails++;
  report.robustness.push(run);
  console.log(`  ${run.name}: ${JSON.stringify(run.checks)}`);
  await page.close();
}

async function fallbackRun() {
  const run = { name: 'no-WebGL2 fallback (letterboxed img)', checks: {} };
  const browser2 = await puppeteer.launch({
    channel: 'chrome', headless: 'new',
    args: ['--disable-webgl', '--disable-webgl2'],
  });
  const page = await browser2.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  wireLogging(page, run);
  await page.goto(`${BASE}/?debug`, {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await settle(1500);
  const state = await page.evaluate(() => ({
    filmApi: !!window.__film,
    img: !(document.getElementById('stage-fallback') || {}).hidden,
    veilGone: !document.getElementById('boot') ||
              document.getElementById('boot').classList.contains('done'),
  }));
  if (state.filmApi) {
    /* WebGL wasn't disabled — cannot exercise the fallback path here */
    run.checks.status = 'skip (WebGL2 still available with these flags)';
    report.robustness.push(run);
    console.log(`  ${run.name}: ${run.checks.status}`);
    await page.close();
    return;
  }
  run.checks.fallbackShown = state.img ? 'pass' : 'FAIL';
  run.checks.veilRemoved = state.veilGone ? 'pass' : 'FAIL';
  await scrollPos(page, 0.5);
  await settle(1200);
  const src = await page.evaluate(() => document.getElementById('stage-fallback').src);
  const idx = /ezgif-frame-(\d{3})\.webp/.exec(src)?.[1];
  run.checks.scrollDriven = idx && Math.abs((+idx - 1) - Math.round(0.5 * (N - 1))) <= 2
    ? `pass (frame-${idx})` : `FAIL src frame=${idx} at p=0.5`;
  if (Object.values(run.checks).some((v) => String(v).startsWith('FAIL'))) totalFails++;
  report.robustness.push(run);
  console.log(`  ${run.name}: ${JSON.stringify(run.checks)}`);
  await page.close();
  await browser2.close();
}

/* -------------------------------- MAIN ---------------------------------- */
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;

async function main() {
  const browser = await puppeteer.launch({ channel: 'chrome', headless: 'new' });

  for (const vp of VIEWPORTS) {
    if (ONLY && !vp.name.startsWith(ONLY)) continue;
    console.log(`\n== ${vp.name} ==`);
    await runViewport(browser, vp);
  }

  if (!ONLY) {
    console.log('\n== robustness ==');
    await reducedMotionRun(browser);
    await contextLossRun(browser);
    await fallbackRun();
  }

  await browser.close();

  report.totalFails = totalFails;
  writeFileSync(join(ART, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nTOTAL FAILS: ${totalFails}   report → ${ART}/report.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
