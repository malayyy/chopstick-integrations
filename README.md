# CHOPSTICK — Integrations · Scroll-Controlled Cinematic Experience

A single-page experience that opens with an immersive, full-screen,
scroll-controlled **cinematic film** built from the original 300-frame 4K UHD
sequence. Scroll down to advance the film; scroll up to reverse it; at the final
frame, the film lifts away to reveal the Chopstick Integrations homepage.

---

## Structure

```
index.html          the entire experience (engine, shaders, loader — one file, zero dependencies)
frames/             300 serving derivatives · 3840×2160 WebP q82 (~28 MB total)
frames-4k/          the 300 original PNG masters, preserved untouched (3840×2160, never modified)
tools/
  build-frames.mjs  offline encoder: frames-4k/*.png → frames/*.webp (sharp; run `npm run frames`)
  dev-server.mjs    tiny static server for local QA (`npm run dev` → http://localhost:4173)
  qa/run-qa.mjs     automated QA battery (puppeteer): viewports, frame accuracy, transition, console, memory
.github/workflows/  deploys ONLY index.html + frames/ to GitHub Pages
package.json        dev tooling only — nothing here ships to the browser
```

Precedence of assets: `frames-4k/` are the masters and the only source of truth.
Never edit PNG masters destructively; re-derive `frames/` with `npm run frames` if the
masters ever change.

## How the engine works

**Rendering — raw WebGL2, no libraries.** The scene is one fullscreen triangle
sampling up to two textures; Three.js/GSAP/Lenis were evaluated and rejected:
they add payload and indirection for zero visual benefit at this scene size.

- **Frame blending**: adjacent frames `A`/`B` are drawn as two passes — the base
  pass writes frame `A × (1−f)`, a second pass adds `B × f` — producing true GPU
  interpolation, so the film reads as a continuous movie rather than 300 stills.
  After an idle the rAF loop skips GPU work entirely (draw-on-demand).
- **Full-bleed composition — contain, never crop.** The plate is scaled to fit
  the viewport *without any cropping of the subject*: the film is contained, and
  a shader edge extension fills the margins that non-16:9 viewports leave over.
  The extension samples the plate's own edge (5-tap smear, gaussian) and fades
  it smoothly into a restrained procedural atmosphere — slow crimson mist graded
  by the plate's edge luminance, rare drifting embers (two parallax heights) and
  film grain — so composition reads as one continuous plate. This is why
  `object-fit: cover` was rejected: at portrait ratios it would decapitate the
  chopstick tips and crop the forearm tattoo (the plate spans ~11%–98% of source
  width in the early frames). Vertical placement is anchored to the subject
  (`BAND_ANCHOR_Y`), not letterboxed.
- **Texture memory**: frames decode straight to what the viewport can display
  (1:1 vs the backing store; ≤1800 px on touch devices, 3456 px on desktop;
  DPR capped at 2.5) into an LRU pool under a hard byte budget — sizes chosen
  to hold the prefetch window without evict-churn (~220 MB mobile / ~560 MB
  desktop). Mipmaps + anisotropy prevent shimmer; `bitmap.close()` frees CPU
  memory after upload.
- **Loading**: a 7-frame boot ring reveals the film instantly under a hairline
  progress bar; the rest loads in a bounded, direction-aware window from the
  playhead (12 ahead in the scroll direction, 8 behind — so reversing never
  waits), 2 decoder lanes, silent once the window is resident. The prefetcher
  must always be able to admit a frame: if the LRU is full it force-evicts the
  entry farthest from the playhead, so the cache can never deadlock. HTTP
  caching is the cache; failed frames are skipped and substituted by the
  nearest decoded neighbour.
- **Scroll**: native scrolling over a spacer track — no hijacking, native touch
  momentum and every device gesture work. `scrollY/trackRange` is the single
  source of truth, smoothed by a frame-rate-independent exponential approach
  (λ = 11/s): silent scroll → reversible, settles exactly, immune to scroll-step
  granularity. The track is sized `clientHeight + travel`, keeping the film's
  scroll range independent of the homepage and stable through iOS toolbar
  transitions. Once the final frame settles, the cinematic layer slides away;
  the track is removed and the homepage returns to normal document scrolling.
- **Power**: after 6 s idle the ambient clock freezes and GPU work stops
  altogether; `prefers-reduced-motion` freezes atmosphere drift permanently.
- **Resilience**: a lost GL context (mobile memory pressure) rebuilds the
  program, geometry and extension bindings, then re-warms the playhead
  neighbourhood; browsers without WebGL2 get a letterboxed, still
  scroll-driven `<img>` fallback instead of a dead screen.

## Tuning

All knobs live in the `CONFIG` object at the top of the engine in `index.html`:
scroll travel & smoothing, texture budget, upload caps, boot ring, band anchor,
edge-falloff distances, atmosphere amplitudes. Every behavior is one constant.

QA with debug introspection: open `http://localhost:4173/?debug` and inspect
`window.__film.snapshot()` (`decoded`, `textureMB`, `index`, `draws`,
`lanes`, composition, …). `?debug` also exposes `seek`, `readback`,
`loseContext`/`restoreContext` for tests.

## Development

```bash
npm install          # sharp + puppeteer-core (dev tooling only)
npm run frames       # (re)encode serving derivatives from the masters
npm run dev          # serve locally on :4173
npm run qa           # full browser battery (see below)
```

The QA battery (`tools/qa/run-qa.mjs`) runs 5 viewports (desktop, ultrawide,
phone portrait/landscape, tablet) through: boot, full-bleed composition,
frame accuracy at sampled indices against the raw 4K masters — measured by
same-task `readPixels` grid probes, which are the authoritative metric
(`page.screenshot` output is compositor-managed and only advisory) — plus
scroll reversal, rapid scroll, final-frame accuracy, the curtain transition and
normal homepage scrolling, texture budget bounds, idle GPU/network silence and
console cleanliness; then robustness runs
(`reduced-motion`, GL context loss/restore, no-WebGL2 fallback). Reports and
screenshots land in `qa/.artifacts/`.

## Deployment

GitHub Pages deploys `index.html` + `frames/*.webp` via the included workflow on
every push to `main`. Enable Pages once: **Settings → Pages → Source: GitHub
Actions**. `frames-4k/` and `tools/` are never deployed.
