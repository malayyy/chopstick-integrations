/** Small, device-appropriate budgets for scroll-scrubbed frames. */
export class PerformanceController {
  public static isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.matchMedia('(max-width: 700px)').matches;
  }

  public static getOptimalCacheSize(): number {
    return this.isMobile() ? 14 : 10;
  }

  public static getDevicePixelRatioCap(): number {
    const dpr = window.devicePixelRatio || 1;
    return this.isMobile() ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  }

  public static getFrameDecodeWidth(canvasPixelWidth: number): number {
    if (this.isMobile()) return 640;
    return Math.min(1600, Math.max(960, canvasPixelWidth));
  }
}
