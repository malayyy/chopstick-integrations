import { currentDpr } from '../utils/env'
import { portraitSourceWindow } from '../utils/portrait'

/**
 * Canvas blit engine.
 *
 * - 2D context (no WebGL): deterministic frame mapping, no shader stalls.
 * - `alpha: false` for direct opaque blitting; `desynchronized: true` to
 *   bypass compositor queuing where supported (Chromium/Android).
 * - DPR clamped to 2.0.
 * - Landscape viewports: standard aspect cover centered — desktop framing,
 *   unchanged by the responsive work.
 * - Portrait viewports: art-directed sampling from `src/utils/portrait.ts`
 *   (single source of truth shared with the poster placeholder):
 *     Phase A — full-bleed, viewport-aspect window centered on the measured
 *     core-subject focus, so the phone fills with the subject instead of a
 *     contain-fit letterbox.
 *     Phase B (0.80 → 0.94) — the window eases onto the designed lockup
 *     framing, so the emerging CHOPSTICK INTEGRATIONS wordmark is never
 *     wider than the window (no mid-reveal truncation).
 *     Phase C — the lockup framing holds to the end of the runway.
 */
export class RenderEngine {
  private readonly ctx: CanvasRenderingContext2D
  private dpr = currentDpr()
  private pixelWidth = 0
  private pixelHeight = 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
      willReadFrequently: false,
    })
    if (!ctx) throw new Error('2D canvas context unavailable')
    this.ctx = ctx
    this.resize()
  }

  /** Recompute backbuffer size from the sticky stage's rendered box. */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = currentDpr()
    const wantW = Math.max(1, Math.round(rect.width * dpr))
    const wantH = Math.max(1, Math.round(rect.height * dpr))
    if (dpr !== this.dpr || wantW !== this.pixelWidth || wantH !== this.pixelHeight) {
      this.dpr = dpr
      this.pixelWidth = wantW
      this.pixelHeight = wantH
      this.canvas.width = wantW
      this.canvas.height = wantH
      // Setting width/height resets the transform — reapply device scale.
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
  }

  draw(bitmap: ImageBitmap, progress: number): void {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (w === 0 || h === 0) return

    // Clear to the exact sequence void color (§3.2 anti-seam)
    this.ctx.fillStyle = '#030303'
    this.ctx.fillRect(0, 0, w, h)

    const srcW = bitmap.width
    const srcH = bitmap.height

    this.ctx.imageSmoothingEnabled = true
    this.ctx.imageSmoothingQuality = 'high'

    if (h <= w) {
      // Landscape: standard aspect cover, centered (desktop framing, unchanged)
      const scale = Math.max(w / srcW, h / srcH)
      const dw = srcW * scale
      const dh = srcH * scale
      this.ctx.drawImage(bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh)
      return
    }

    this.drawPortrait(bitmap, progress, w, h, srcW, srcH)
  }

  private drawPortrait(
    bitmap: ImageBitmap,
    progress: number,
    w: number,
    h: number,
    srcW: number,
    srcH: number,
  ): void {
    const win = portraitSourceWindow(progress, w / h)
    const sw = win.sw * srcW
    const sh = win.sh * srcH
    const sx = win.sx * srcW
    const sy = win.sy * srcH

    const viewAspect = w / h
    const winAspect = sw / sh
    let scale: number
    let dx: number
    let dy: number
    if (Math.abs(winAspect - viewAspect) < 1e-4) {
      // Window aspect-matched to the viewport: true full-bleed, no bars.
      scale = w / sw
      dx = 0
      dy = 0
    } else if (winAspect < viewAspect) {
      scale = h / sh
      dx = (w - sw * scale) / 2
      dy = 0
    } else {
      // Phase B/C: full-height lockup window — vertical leftover area is
      // the frame's own in-scene smoke, not renderer void.
      scale = w / sw
      dx = 0
      dy = (h - sh * scale) / 2
    }
    this.ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, sw * scale, sh * scale)
  }
}
