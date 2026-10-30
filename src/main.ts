import './styles/tokens.css'
import './styles/global.css'
import './styles/sections.css'
import './components/Hero/hero.css'
import './components/Navigation/navbar.css'

import manifest from './assets/frame-manifest.json'
import { clamp, frameIndexForProgress, REFRAME_START } from './utils/math'
import { detectEnv } from './utils/env'
import { initReveal } from './utils/reveal'
import { FrameCache } from './engine/FrameCache'
import { FrameLoader } from './engine/FrameLoader'
import { RenderEngine } from './engine/RenderEngine'
import { ScrollManager } from './engine/ScrollManager'
import { HeroStage } from './components/Hero/HeroStage'
import { Navbar } from './components/Navigation/Navbar'

const TOTAL_FRAMES = manifest.length

function run(): void {
  const env = detectEnv()
  const stage = new HeroStage()
  const runway = document.getElementById('hero-runway') as HTMLElement

  // ---------------------------------------------------------------
  // Reduced motion: runway collapses to 100dvh, engine stays dormant,
  // final lockup frame as the static hero (§13.1 / QA-ACC-01).
  // ---------------------------------------------------------------
  if (env.reducedMotion) {
    stage.setReducedMotion()
    stage.setPosterToFrame(TOTAL_FRAMES - 1, TOTAL_FRAMES)
    stage.setIntroProgress(1) // intro copy hidden under static lockup
    new Navbar().update(1)
    initReveal()
    return
  }

  const canvas = document.getElementById('hero-canvas') as HTMLCanvasElement
  const engine = new RenderEngine(canvas)
  const navbar = new Navbar()
  const cache = new FrameCache(TOTAL_FRAMES, env.mobile ? 14 : 48)
  const loader = new FrameLoader(cache, TOTAL_FRAMES)

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  let currentProgress = 0
  let targetIndex = 0
  let heroActive = true
  let dirty = true
  let requestedIndex = -1
  let paintedPortraitProgress = -1

  // Mid-page restore: the browser has already restored scrollY.
  const runwayTop = runway.getBoundingClientRect().top + window.scrollY
  const travel = Math.max(1, runway.offsetHeight - window.innerHeight)
  const initialProgress = clamp((window.scrollY - runwayTop) / travel, 0, 1)
  const initialIndex = frameIndexForProgress(initialProgress, TOTAL_FRAMES)

  // Poster must never flash frame 0 deep in the runway (QA-REL-01).
  stage.setPosterToFrame(initialIndex, TOTAL_FRAMES)
  const loaderStart = loader.start(initialIndex)

  // Resize: track the sticky stage's rendered box (dvh-safe) + DPR changes.
  const resizeObserver = new ResizeObserver(() => {
    engine.resize()
    dirty = true
  })
  resizeObserver.observe(canvas)

  const isPortrait = (): boolean => canvas.clientHeight > canvas.clientWidth

  // ---------------------------------------------------------------
  // Render loop — event-driven dirty rendering (§10.1): the loop spins
  // but paints only when the frame index moves, the portrait reframe
  // progresses, or the stage resizes. Idle at rest = zero repaints.
  // ---------------------------------------------------------------
  const tick = (): void => {
    requestAnimationFrame(tick)
    if (document.hidden || !heroActive) return

    if (requestedIndex !== targetIndex) {
      requestedIndex = targetIndex
      dirty = true
    }
    if (
      !dirty &&
      isPortrait() &&
      currentProgress >= REFRAME_START &&
      Math.abs(currentProgress - paintedPortraitProgress) > 0.0015
    ) {
      dirty = true // sub-frame crop easing inside the reframe band
    }
    if (!dirty) return
    dirty = false

    void cache.getFrame(targetIndex, targetIndex).then((bitmap) => {
      if (!bitmap) {
        dirty = true // frame not streamable yet: repoll cheaply until it is
        return // never clear the canvas before the next frame is ready
      }
      engine.draw(bitmap, currentProgress)
      stage.markPainted()
      paintedPortraitProgress = currentProgress
    })
  }

  // ---------------------------------------------------------------
  // Scroll wiring — single-pinning model, progress oracle
  // ---------------------------------------------------------------
  new ScrollManager({
    onProgress: (progress) => {
      currentProgress = progress
      targetIndex = frameIndexForProgress(progress, TOTAL_FRAMES)
      stage.setIntroProgress(progress)
      navbar.update(progress)
    },
    onActiveChange: (active) => {
      heroActive = active
      if (active) dirty = true
    },
  })

  // Post-hero content reveals (Capabilities / Protocol / Deployments / Contact).
  initReveal()

  // Boot paint at the restored position.
  currentProgress = initialProgress
  targetIndex = initialIndex
  stage.setIntroProgress(initialProgress)
  navbar.update(initialProgress)
  void loaderStart.then(() => {
    dirty = true
  })
  requestAnimationFrame(tick)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run, { once: true })
} else {
  run()
}
