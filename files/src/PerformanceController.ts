/** Device-aware budgets for high-quality scroll-scrubbed frames. */
export class PerformanceController {
  public static isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.matchMedia('(max-width: 700px)').matches;
  }

  public static getOptimalCacheSize(): number {
    // Desktop frames decode to 2560px-wide bitmaps. Keep a bounded neighbourhood
    // in memory rather than trading quality for an unbounded decoded-frame cache.
    return this.isMobile() ? 14 : 8;
  }

  public static getDevicePixelRatioCap(): number {
    const dpr = window.devicePixelRatio || 1;
    // Two device pixels per CSS pixel materially improves the hand edges while
    // keeping the canvas under a predictable memory/rendering budget.
    return Math.min(dpr, 2);
  }

  public static getFrameDecodeWidth(canvasPixelWidth: number): number {
    if (this.isMobile()) return Math.min(960, Math.max(640, canvasPixelWidth));
    // The exported desktop frames are 2560px wide. Decode close to the actual
    // canvas backing width when possible, but never enlarge the source asset.
    return Math.min(2560, Math.max(960, canvasPixelWidth));
  }
}
