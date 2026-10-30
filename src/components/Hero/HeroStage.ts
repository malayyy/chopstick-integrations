import { frameUrl } from '../../utils/math'
import { posterObjectPosition } from '../../utils/portrait'

/**
 * Hero stage DOM surface: poster handoff + intro copy fade control.
 *
 * The poster `<img>` is the LCP asset — it paints before any JS runs and
 * stays under the canvas until the first sequence frame is blitted, so the
 * canvas never flashes blank (QA-REL-01). Its `object-position` is aligned
 * to the same portrait window the canvas draws, so the first blit is a
 * composition-preserving fade rather than a visible re-frame.
 */
export class HeroStage {
  readonly element: HTMLElement
  private poster: HTMLImageElement
  private intro: HTMLElement
  private painted = false
  private reduced = false

  constructor() {
    this.element = document.getElementById('hero-sticky-stage') as HTMLElement
    this.poster = document.getElementById('hero-poster') as HTMLImageElement
    this.intro = document.getElementById('hero-intro') as HTMLElement
  }

  /**
   * For mid-page restores: poster must match the frame *and the portrait
   * window* the canvas will paint. `total` is the frame count so the
   * progress-aligned `object-position` can be derived without parsing the
   * frame URL. Landscape viewports get no override — centered cover is
   * already the canvas composition there.
   */
  setPosterToFrame(index: number, total: number): void {
    const url = frameUrl(index)
    if (this.poster.getAttribute('src') !== url) this.poster.src = url
    if (this.reduced) return // reduced-motion CSS pins contain/center

    const progress = total > 1 ? index / (total - 1) : 0
    const position = posterObjectPosition(progress, window.innerWidth / window.innerHeight)
    if (position) {
      this.poster.style.objectPosition = position
    } else {
      this.poster.style.removeProperty('object-position')
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

  /**
   * Reduced motion: the static final lockup poster (object-fit: contain)
   * is the whole hero. Inline `object-position` is cleared so the
   * reduced-motion CSS `contain/center` rule rules uncontested.
   */
  setReducedMotion(): void {
    this.reduced = true
    this.element.classList.add('reduced')
    this.poster.style.removeProperty('object-position')
  }
}
