import { clamp, easeInOutQuad, REFRAME_END, REFRAME_START } from './math'
import { FOCAL_KEYFRAME_BASELINE, LOCKUP_WINDOW, sampleFocal } from './focal'

/**
 * Shared portrait composition math — the single source of truth for the
 * 16:9 source-frame sampling window at a given scroll progress. The canvas
 * renderer draws exactly this window; the poster placeholder aligns itself
 * to it via `object-position`, so restoring mid-runway or the first-blit
 * handoff never jumps composition.
 */

/** A source-frame sampling window, as fractions of the source frame. */
export interface SourceWindow {
  sx: number
  sy: number
  sw: number
  sh: number
}

function bounded(sx: number, sy: number, sw: number, sh: number): SourceWindow {
  return {
    sw,
    sh,
    sx: clamp(sx, 0, Math.max(0, 1 - sw)),
    sy: clamp(sy, 0, Math.max(0, 1 - sh)),
  }
}

/**
 * Portrait source window at `progress` for a viewport of aspect
 * `viewAspect` (w/h < 1):
 *
 *   Phase A — full-bleed, viewport-aspect window scaled around the
 *   measured core-subject focus (mirrors a closeup on the hand / shatter;
 *   ambient smoke and stick excursions may exit frame).
 *   Phase B (REFRAME_START → REFRAME_END) — the window eases (symmetric
 *   quad) onto LOCKUP_WINDOW, so the emerging CHOPSTICK INTEGRATIONS
 *   wordmark is never wider than the window — no truncation mid-reveal.
 *   Phase C — the lockup framing holds to the end of the runway.
 */
export function portraitSourceWindow(progress: number, viewAspect: number): SourceWindow {
  const f = sampleFocal(progress)
  // Height-driven, with an optional art-directed width floor per beat
  // (`coverW`): beats that carry wide narrative details (the forearm's
  // INTEGRATIONS tattoo) widen the window. It is aspect-locked to the
  // viewport, so width follows from height and the window always fills
  // the screen exactly.
  const shA = clamp(
    Math.max(f.h * FOCAL_KEYFRAME_BASELINE.yMargin, (f.coverW ?? 0) / viewAspect),
    FOCAL_KEYFRAME_BASELINE.minHeightFraction,
    1,
  )
  const swA = shA * viewAspect
  const a = bounded(f.cx - swA / 2, f.cy - shA / 2, swA, shA)

  if (progress <= REFRAME_START) return a

  const t = clamp((progress - REFRAME_START) / (REFRAME_END - REFRAME_START), 0, 1)
  const e = easeInOutQuad(t)
  const l = bounded(
    LOCKUP_WINDOW.cx - LOCKUP_WINDOW.w / 2,
    LOCKUP_WINDOW.cy - LOCKUP_WINDOW.h / 2,
    LOCKUP_WINDOW.w,
    LOCKUP_WINDOW.h,
  )

  return bounded(
    a.sx + (l.sx - a.sx) * e,
    a.sy + (l.sy - a.sy) * e,
    a.sw + (l.sw - a.sw) * e,
    a.sh + (l.sh - a.sh) * e,
  )
}

/**
 * CSS `object-position` that makes a full-frame cover poster show the same
 * horizontal region the canvas would draw at this progress. Returns null on
 * landscape viewports (cover centered already matches the canvas there).
 */
export function posterObjectPosition(progress: number, viewAspect: number): string | null {
  if (viewAspect >= 1) return null
  const win = portraitSourceWindow(progress, viewAspect)
  // Overflow fraction across the source width, divided out to a percentage.
  const xPct = (win.sx / Math.max(1 - win.sw, 1e-6)) * 100
  return `${clamp(xPct, 0, 100).toFixed(1)}% 50%`
}
