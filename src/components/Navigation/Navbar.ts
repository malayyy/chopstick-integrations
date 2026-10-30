/**
 * Fixed header controller — the deterministic logo handoff (§11.1).
 *
 * No FLIP morph: the canvas lockup completes on-screen, then the fixed
 * header fades in across the final 2% of runway. Hysteresis (activate ≥
 * 0.98, deactivate < 0.96) prevents flicker at the boundary.
 */
export class Navbar {
  private readonly element: HTMLElement
  private active = false

  constructor() {
    this.element = document.getElementById('site-header') as HTMLElement
  }

  update(progress: number): void {
    if (!this.active && progress >= 0.98) {
      this.set(true)
    } else if (this.active && progress < 0.96) {
      this.set(false)
    }
  }

  private set(active: boolean): void {
    this.active = active
    this.element.classList.toggle('is-active', active)
  }
}
