/** Per-device canvas and decoded-frame budgets. */
export class PerformanceController {
  public static isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.matchMedia('(max-width: 700px)').matches;
  }

  public static getOptimalCacheSize(): number {
    // Mobile bitmaps are downscaled before they enter cache, allowing a wider
    // look-ahead window. Full 4K bitmaps are expensive on ultrawide desktops.
    if (this.isMobile()) return 24;
    return window.innerWidth >= 2560 ? 6 : 12;
  }

  public static getDevicePixelRatioCap(): number {
    const dpr = window.devicePixelRatio || 1;
    return this.isMobile() ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  }

  public static getFrameDecodeWidth(canvasPixelWidth: number): number {
    if (this.isMobile()) return 640;

    const target = Math.max(1280, Math.ceil(canvasPixelWidth * 1.5));
    // The desktop source sequence is 3840×2160; never decode above source size.
    return Math.min(3840, target);
  }}
