/** Per-device canvas and decoded-frame budgets. */
export class PerformanceController {
  public static isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.matchMedia('(max-width: 700px)').matches;
  }

  public static getOptimalCacheSize(): number {
    // ImageBitmaps are decoded to viewport-scale sizes, so a wider cache is
    // inexpensive enough to keep nearby scroll frames ready on mobile.
    return this.isMobile() ? 10 : 12;
  }

  public static getDevicePixelRatioCap(): number {
    const dpr = window.devicePixelRatio || 1;
    return this.isMobile() ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  }

  public static getFrameDecodeWidth(canvasPixelWidth: number): number {
    const minimum = this.isMobile() ? 960 : 1280;
    const target = Math.max(minimum, Math.ceil(canvasPixelWidth * 1.5));
    // The source sequence is 3840×2160 (16:9). Never decode larger than source.
    return Math.min(3840, target);
  }
}
