# Chopstick Integrations

Scroll-driven cinematic hero + agency homepage. Vanilla TypeScript + Vite, GSAP
ScrollTrigger (progress oracle only — pinning is pure CSS sticky), Lenis smooth
scroll, and a 300-frame 1080p WebP canvas sequence with an LRU-decoded bitmap
cache.

## Commands

```bash
npm install
npm run dev        # Vite dev server on :8000
npm run build      # type-check + production build
npm run preview    # serve the production build
npm run frames     # regenerate the WebP frame set from the recovered 4K PNGs
npm run pilot      # 5-frame compression benchmark (revision 3.0 §8.2)
npm run qa         # headless Chrome (CDP) QA battery: scrub states, portrait
                   # reframe, logo handoff, reveals, reduced-motion fallback
```

## Architecture (Revision 3.0)

- `#hero-runway` (400vh) → `.hero-sticky-stage` (`position: sticky; 100dvh`)
  holds the poster `<img>`, the render `<canvas>`, a seamless vignette overlay,
  and the intro copy. When runway scroll progress reaches 1.0, the stage
  releases into natural document flow.
- `src/engine/FrameCache.ts` — sliding-window LRU of decoded `ImageBitmap`s
  (48 desktop / 14 mobile), explicit `bitmap.close()` on eviction.
- `src/engine/FrameLoader.ts` — priority fetch: current-index window first
  (`±2/+5`), then nearest-first background expansion with bounded concurrency.
- `src/engine/RenderEngine.ts` — 2D canvas blit (`alpha: false`,
  `desynchronized: true`), DPR clamped to 2, portrait
  action-crop → lockup-contain reframe easing at 82–98% progress.
- `src/engine/ScrollManager.ts` — Lenis ↔ GSAP ticker wiring; ScrollTrigger is
  strictly a progress oracle (`pin: false`).
- Logo handoff: fixed header fades in at 98% progress (no FLIP morph).
- Reduced motion: runway collapses to 100dvh, canvas engine bypassed,
  lockup poster shown statically with `object-fit: contain` (matches the
  animated end-state — the wordmark is never cropped).
- `scripts/qa-browser.mjs` — 11-assertion CDP QA battery over the built
  site (requires Google Chrome; runs against `vite preview`).

## Asset notes

- Master 4K PNG source set lives in `hd-frames/` (git-tracked, restored from
  history; kept out of builds). Never ship raw 4K PNGs.
- Production frames: `public/assets/frames/f_000.webp → f_299.webp`
  (1920×1080, WebP Q85, ~14.5 MB total, measured via the Q-sweep pilot).
- `src/assets/frame-manifest.json` carries per-frame byte sizes for the loader
  budget.
