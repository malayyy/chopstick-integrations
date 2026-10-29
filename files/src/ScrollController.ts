/** Native scroll controller. Scroll position is the single source of truth. */
export interface ScrollControllerOptions {
  onProgress: (progress: number) => void;
}

export class ScrollController {
  private destroyed = false;
  private readonly onProgress: (progress: number) => void;
  private readonly onScroll: () => void;

  constructor(options: ScrollControllerOptions) {
    this.onProgress = options.onProgress;
    this.onScroll = () => {
      if (this.destroyed) return;
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const progress = maxScroll === 0 ? 0 : Math.max(0, Math.min(1, scrollTop / maxScroll));
      this.onProgress(progress);
    };

    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onScroll, { passive: true });
    window.addEventListener('pageshow', this.onScroll);
    this.onScroll();
  }

  public getProgress(): number {
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    return maxScroll === 0 ? 0 : Math.max(0, Math.min(1, scrollTop / maxScroll));
  }

  public destroy(): void {
    this.destroyed = true;
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onScroll);
    window.removeEventListener('pageshow', this.onScroll);
  }
}
