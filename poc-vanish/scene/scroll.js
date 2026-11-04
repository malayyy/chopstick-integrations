/**
 * Scroll manager — Lenis smooth wheel + a single scroll progress oracle
 * (mirrors the production ScrollManager: GSAP is a progress oracle, pinning
 * is pure CSS `position: sticky`, `scrub: true` keeps progress 1:1).
 * 
 * The PoC's runway is 480vh so the sticky stage has 4.8 viewport-heights of
 * travel to drive the 0..1 beat map. Reversible: scrubbing back is a
 * function of the same progress value.
 */
export class ScrollManager {
  constructor({ onProgress, onActiveChange }) {
    this.lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      anchors: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.2,
    })
    this.lenis.on('scroll', () => {
      this._computeProgress()
    })

    this.onProgress = onProgress || (() => {})
    this.onActiveChange = onActiveChange || (() => {})

    this._runway = null
    this._active = false
    this._progress = 0
    this._raf = null
    this._rafActive = false
  }

  /** Start after the DOM is laid out (runway offset is known). */
  start() {
    this._runway = document.getElementById('poc-runway')
    this.lenis.start()
    this._computeProgress()
    this._loop()
  }

  _computeProgress() {
    const r = this._runway
    const travel = Math.max(1, r.offsetHeight - window.innerHeight)
    const p = clamp01((window.scrollY - r.offsetTop) / travel)
    this._progress = p
    this.onProgress(p)

    const active = p < 1 || window.scrollY < r.bottom - window.innerHeight
    if (active !== this._active) {
      this._active = active
      this.onActiveChange(active)
    }
  }

  _loop() {
    if (this._rafActive) return
    this._rafActive = true
    const tick = () => {
      if (!this._rafActive) return
      this._computeProgress()
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  stop() {
    this._rafActive = false
    this.lenis.stop()
  }

  get progress() {
    return this._progress
  }
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x))
}