/**
 * Beat map — ONE pure function of scroll progress p (0..1).
 *
 * Every module (camera, shards, smoke, logo) derives its state from these
 * envelopes, so scrubbing forward and backward is perfectly reversible:
 * no accumulated time/state anywhere in the scene.
 *
 * Windows (verified against reference beats):
 *   .00–.42  ornate pair alive in the crimson void            (≈ f_001–f_100)
 *   .44–.56  shatter: rigid burst + light flash               (≈ f_148–f_168)
 *   .56–.72  scatter chaos, smoke swirl peaks                 (≈ f_168–f_216)
 *   .68–.88  reconstruction into the sleek rest pose          (≈ f_204–f_264)
 *   .87–1.0  logo lockup handoff (3D pair → supplied plate)   (≈ f_261–f_300)
 */
export const WINDOW = {
  alive: [0.0, 0.42],
  burst: [0.44, 0.56],
  rest: [0.68, 0.88],
  logo: [0.87, 1.0],
}

/** Normalized, smooth-eased phase of p inside [a,b]; 0 before, 1 after. */
export function phase(p, [a, b]) {
  const t = (p - a) / (b - a)
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

export const local = (t, [a, b]) => Math.min(1, Math.max(0, (t - a) / (b - a)))

/** Cube-quadratic ease-out with slight overshoot (for fragment snap-in). */
export function snapEase(x) {
  const c = 1.70158 + 1.0
  const t = Math.min(1, Math.max(0, x)) - 1
  return 1 + (c + 1) * t * t * t + c * t * t
}

export const lerp = (a, b, t) => a + (b - a) * t
export const clamp01 = (x) => Math.min(1, Math.max(0, x))
export const smoothstep = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t) }

/** Beat label for the HUD / QA assertions. */
export function beatLabel(p) {
  if (p < WINDOW.alive[1]) return 'INTACT'
  if (p < WINDOW.burst[1]) return 'SHATTER'
  if (p < WINDOW.rest[0]) return 'SCATTER'
  if (p < WINDOW.logo[0]) return 'REBUILD'
  if (p < 1) return 'LOGO'
  return 'LOCKUP'
}
