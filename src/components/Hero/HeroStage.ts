import { frameUrl } from '../../utils/math'

/**
 * Hero stage DOM surface: poster handoff + intro copy fade control.
 *
 * The poster `<img>` is the LCP asset — it paints before any JS runs and
 * stays under the canvas until the first sequence frame is blitted, so the
 * canvas never flashes blank (QA-REL-01).
 */
export class HeroStage {
  readonly element: HTMLElement
  private poster: HTMLImageElement
  private intro: HTMLElement
  private painted = false

  constructor() {
    this.element = document.getElementById('hero-sticky-stage') as HTMLElement
    this.poster = document.getElementById('hero-poster') as HTMLImageElement
    this.intro = document.getElementById('hero-intro') as HTMLElement
  }


  /** For mid-page restores: poster must match the frame the canvas will paint. */
  setPosterToFrame(index: number): void {
    if (index > 0 && this.poster.src !== frameUrl(index)) {
      this.poster.src = frameUrl(index)
    }
  }

  /** First successful canvas blit: fade the poster out under the canvas. */
  markPainted(): void {
    if (this.painted) return
    this.painted = true
    this.element.classList.add('is-painted')
  }

  /** Intro copy fades out across 0.00 → 0.15 progress (§5.2). */
  setIntroProgress(progress: number): void {
    const opacity = Math.max(0, 1 - progress / 0.15)
    this.intro.style.opacity = String(opacity)
    this.intro.style.visibility = opacity === 0 ? 'hidden' : 'visible'
  }

  setReducedMotion(): void {
    this.element.classList.add('reduced')
    // The runway must collapse too, otherwise reduced-motion users get a
    // 300vh dead scroll before the manifesto.
    document.getElementById('hero-runway')?.classList.add('reduced')
  }
}
