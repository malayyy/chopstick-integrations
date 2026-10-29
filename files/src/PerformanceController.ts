/** Small, bounded quality settings for desktop and mobile browser memory budgets. */
export class PerformanceController {
  public static isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.matchMedia('(max-width: 700px)').matches;
  }

  public static getOptimalCacheSize(): number {
    return this.isMobile() ? 22 : 42;
  }

  public static getDevicePixelRatioCap(): number {
    const dpr = window.devicePixelRatio || 1;
    return this.isMobile() ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  }
}
