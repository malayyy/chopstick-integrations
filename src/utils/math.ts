export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/**
 * Portrait reframe band (RenderEngine + the main.ts tick gate share it —
 * single source of truth so the crop-easing gate never drifts from the
 * draw math). Below the band: 55% action crop on the hand/shatter. Above
 * the band's end: full `contain` lockup for the CHOPSTICK INTEGRATIONS type.
 */
export const REFRAME_START = 0.82
export const REFRAME_END = 0.98

/** Quadratic ease-out, used by the portrait action-crop → lockup reframe. */
export const easeOutQuad = (t: number): number => t * (2 - t)

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
