import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { clamp } from '../utils/math'

gsap.registerPlugin(ScrollTrigger)

export interface ScrollManagerOptions {
  /** Normalized hero progress [0..1], driven by the pinned runway. */
  onProgress: (progress: number) => void
  /** True while the sticky stage occupies (or is inside) the viewport. */
  onActiveChange: (active: boolean) => void
}

/**
 * Lenis ↔ ScrollTrigger wiring, with the single-pinning model:
 * pinning is pure CSS `position: sticky`; GSAP is strictly a progress
 * oracle (`pin: false`). `scrub: true` keeps progress 1:1 — Lenis already
 * provides the smoothing, so no second-order lag is layered on top.
 */
export class ScrollManager {
  readonly lenis: Lenis

  constructor(options: ScrollManagerOptions) {
    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      // In-page anchors (nav links, skip link) ride the same smoothed clock.
      anchors: true,
    })
    lenis.on('scroll', ScrollTrigger.update)

    // One clock drives everything (Lenis ↔ GSAP wiring)
    gsap.ticker.add((time) => {
      lenis.raf(time * 1000)
    })
    gsap.ticker.lagSmoothing(0)
    this.lenis = lenis

    ScrollTrigger.create({
      trigger: '#hero-runway',
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        options.onProgress(clamp(self.progress, 0, 1))
      },
      onToggle: (self) => {
        options.onActiveChange(self.isActive)
      },
    })

    // Battery: fully idle while the tab is hidden (§10.1)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        lenis.stop()
      } else {
        lenis.start()
      }
    })

    ScrollTrigger.refresh()
  }

  stop(): void {
    this.lenis.stop()
  }

  start(): void {
    this.lenis.start()
  }
}
