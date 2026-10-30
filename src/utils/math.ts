export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/**
 * Portrait reframe band (RenderEngine + the main.ts tick gate share it —
 * single source of truth so the crop-easing gate never drifts from the
 * draw math). Below the band: full-bleed, focal-anchored action crop.
 * The band eases the window onto the designed lockup framing so the
 * emerging CHOPSTICK INTEGRATIONS wordmark is never wider than the
 * window; from the band's end the lockup holds.
 */
export const REFRAME_START = 0.8
export const REFRAME_END = 0.94

/** Quadratic ease-out, retained for beta-scroll comparisons. */
export const easeOutQuad = (t: number): number => t * (2 - t)

/**
 * Symmetric quad ease-in-out for the Phase B reframe: the window leaves
 * Phase A accelerating and settles onto the lockup decelerating, so the
 * transition reads as a deliberate camera move rather than a snap.
 */
export const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)

/** Progress [0..1] → frame index [0..N-1]. */
export function frameIndexForProgress(progress: number, total: number): number {
  return clamp(Math.floor(progress * (total - 1)), 0, total - 1)
}

/**
 * Priority window for mid-page restores (§9.4):
 * [current - 2 … current + 5], nearest first.
 */
export function priorityWindow(start: number): number[] {
  const indices: number[] = []
  for (let i = start - 2; i <= start + 5; i++) {
    if (i >= 0) indices.push(i)
  }
  return indices.sort((a, b) => Math.abs(a - start) - Math.abs(b - start))
}

/** Whole-sequence expansion from the current index, nearest first. */
export function expansionOrder(start: number, total: number): number[] {
  const order: number[] = []
  const maxSpan = Math.max(start, total - 1 - start)
  for (let d = 0; d <= maxSpan; d++) {
    if (start + d < total) order.push(start + d)
    if (d > 0 && start - d >= 0) order.push(start - d)
  }
  return order
}

export function frameUrl(index: number): string {
  return `${import.meta.env.BASE_URL}assets/frames/f_${String(index).padStart(3, '0')}.webp`
}
