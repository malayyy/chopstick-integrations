/** Device-aware budgets for high-quality scroll-scrubbed frames. */
export class PerformanceController {
  public static isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.matchMedia('(max-width: 700px)').matches;
  }

  public static getOptimalCacheSize(): number {
    // Desktop frames are delivered at 3840px and decoded near the viewport's
    // backing resolution. Keep a bounded neighbourhood for memory safety.
    return this.isMobile() ? 14 : 8;
  }

  public static getDevicePixelRatioCap(): number {
    const dpr = window.devicePixelRatio || 1;
    return Math.min(dpr, 2);
  }

  public static getFrameDecodeWidth(canvasPixelWidth: number): number {
    if (this.isMobile()) return Math.min(960, Math.max(640, canvasPixelWidth));
    // Preserve the 3840px source variant on high-resolution desktop canvases.
    return Math.min(3840, Math.max(960, canvasPixelWidth));
  }
}
