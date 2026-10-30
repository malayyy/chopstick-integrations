import { clampDpr } from '../utils/env'
import { easeOutQuad, REFRAME_END, REFRAME_START } from '../utils/math'

/**
 * Canvas blit engine.
 *
 * - 2D context (no WebGL): deterministic frame mapping, no shader stalls.
 * - `alpha: false` for direct opaque blitting; `desynchronized: true` to
 *   bypass compositor queuing where supported (Chromium/Android).
 * - DPR clamped to 2.0.
 * - Portrait viewports get the dynamic action-crop → lockup-contain reframe
 *   (§7.2) so the wide CHOPSTICK INTEGRATIONS lockup is never truncated.
 */
export class RenderEngine {
  private readonly ctx: CanvasRenderingContext2D
  private dpr = clampDpr()
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
    const dpr = clampDpr()
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

    if (h > w) {
      // Portrait: animated source window, 55% action crop → 100% lockup
      let reframe = 0
      if (progress > REFRAME_START) {
        const rawT = (progress - REFRAME_START) / (REFRAME_END - REFRAME_START)
        reframe = easeOutQuad(Math.min(1, Math.max(0, rawT)))
      }
      const crop = 0.55 + 0.45 * reframe
      const sw = srcW * crop
      const sh = srcH
      const sx = (srcW - sw) / 2
      const scale = Math.min(w / sw, h / sh)
      const dw = sw * scale
      const dh = sh * scale
      this.ctx.drawImage(bitmap, sx, 0, sw, sh, (w - dw) / 2, (h - dh) / 2, dw, dh)
      return
    }

    // Landscape: standard aspect cover, centered
    const scale = Math.max(w / srcW, h / srcH)
    const dw = srcW * scale
    const dh = srcH * scale
    this.ctx.drawImage(bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh)
  }
}
