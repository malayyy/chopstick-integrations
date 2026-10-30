// GENERATED FILE — scripts/measure-focal.mjs (do not hand-edit)
// Core-subject focal keyframes, measured from the 4K PNG masters
// (luminance > 85, percentile band 0.08–0.92, ±1-sample smoothed).
// All values are fractions of the 16:9 source frame.

export interface FocalKeyframe {
  p: number
  cx: number
  cy: number
  w: number
  h: number
  /**
   * Art-directed minimum window width for this beat (fraction of source
   * width), 0 when the measured focus alone is sufficient. The beats at
   * p ≈ 0.13–0.50 carry the forearm's INTEGRATIONS tattoo whose span is
   * wider than a pure focus-crop shows at phone aspects; "coverW" widens
   * those beats' windows so the brand word stays legible end-to-end.
   */
  coverW?: number
}

export const FOCAL_KEYFRAMES: FocalKeyframe[] = [
  { p: 0.0000, cx: 0.3893, cy: 0.4043, w: 0.6623, h: 0.5093, coverW: 0.0000 },
  { p: 0.0502, cx: 0.4054, cy: 0.4190, w: 0.6215, h: 0.4923, coverW: 0.0000 },
  { p: 0.1338, cx: 0.4275, cy: 0.4460, w: 0.6085, h: 0.4753, coverW: 0.3000 },
  { p: 0.2341, cx: 0.4071, cy: 0.4583, w: 0.5434, h: 0.4321, coverW: 0.3600 },
  { p: 0.3010, cx: 0.4258, cy: 0.4900, w: 0.5443, h: 0.4491, coverW: 0.3800 },
  { p: 0.3679, cx: 0.4449, cy: 0.5131, w: 0.5234, h: 0.4738, coverW: 0.4000 },
  { p: 0.4348, cx: 0.4631, cy: 0.5239, w: 0.5425, h: 0.4861, coverW: 0.3700 },
  { p: 0.5017, cx: 0.4657, cy: 0.5278, w: 0.6068, h: 0.5154, coverW: 0.3000 },
  { p: 0.6020, cx: 0.4957, cy: 0.5525, w: 0.5920, h: 0.4938, coverW: 0.0000 },
  { p: 0.7023, cx: 0.5174, cy: 0.5316, w: 0.5052, h: 0.4985, coverW: 0.0000 },
  { p: 0.8027, cx: 0.5217, cy: 0.5170, w: 0.4115, h: 0.4167, coverW: 0.0000 },
  { p: 0.9030, cx: 0.5217, cy: 0.4776, w: 0.4514, h: 0.3565, coverW: 0.0000 },
  { p: 0.9699, cx: 0.5239, cy: 0.4823, w: 0.5616, h: 0.2762, coverW: 0.0000 },
  { p: 1.0000, cx: 0.5521, cy: 0.4807, w: 0.6250, h: 0.2546, coverW: 0.0000 },
]

/**
 * Rendering-baseline constants shared by the engine over the measured
 * subject box (kept next to the measurement so both live under the same
 * reproducible file):
 *
 * - yMargin — how much of the 16:9 frame the portrait action window keeps
 *   vertically, as a multiple of the measured subject height. The
 *   luminance table trims outliers and under-measures limb extremes, so
 *   1.3 lives between "subject breathing room" and "arm/nail/tattoo
 *   detail stays drawable". Windows get aspect-locked to the viewport
 *   after this, so window width always follows from window height.
 * - minHeightFraction — floor so compact subject boxes never over-zoom
 *   past a comfortable closeup.
 */
export const FOCAL_KEYFRAME_BASELINE = { yMargin: 1.3, minHeightFraction: 0.6 } as const

/**
 * Designed end-state framing for the portrait lockup (the reframe-band
 * target): the CHOPSTICK INTEGRATIONS wordmark actually spans
 * x ≈ 0.118–0.951 across the source frame (the luminance-derived table
 * under-measures the smoke-veiled type), and the type's centre of mass
 * sits at cx ≈ 0.53, cy ≈ 0.47. A 0.96-wide, full-height window centered
 * there keeps ≥ 16px drawn margin around the wordmark at every shipped
 * phone width (320 and 390 included) while the vertical space stays the
 * frame's own in-scene smoke.
 */
export const LOCKUP_WINDOW = { cx: 0.53, cy: 0.47, w: 0.96, h: 1.0 } as const


/** Piecewise-linear focal sample at progress p ∈ [0, 1]. */
export function sampleFocal(p: number): FocalKeyframe {
  const frames = FOCAL_KEYFRAMES
  if (p <= frames[0].p) return frames[0]
  if (p >= frames[frames.length - 1].p) return frames[frames.length - 1]
  for (let i = 1; i < frames.length; i++) {
    if (p <= frames[i].p) {
      const a = frames[i - 1]
      const b = frames[i]
      const t = (p - a.p) / (b.p - a.p)
      return {
        p,
        cx: a.cx + (b.cx - a.cx) * t,
        cy: a.cy + (b.cy - a.cy) * t,
        w: a.w + (b.w - a.w) * t,
        h: a.h + (b.h - a.h) * t,
        coverW: (a.coverW ?? 0) + ((b.coverW ?? 0) - (a.coverW ?? 0)) * t,
      }
    }
  }
  return frames[frames.length - 1]
}
