export interface Env {
  reducedMotion: boolean
  mobile: boolean
  dpr: number
}

export function detectEnv(): Env {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const mobile =
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth < 900)
  return { reducedMotion, mobile, dpr: clampDpr() }
}

/** Rendering above 2.0 DPR only burns fill-rate (Revision 3.0 §6.2). */
export function currentDpr(): number {
  return Math.min(window.devicePixelRatio || 1, 2.0)
}

export const clampDpr = currentDpr
