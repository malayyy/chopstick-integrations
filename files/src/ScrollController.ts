/** Native scroll controller scoped to the intro track. */
export interface ScrollControllerOptions {
  onProgress: (progress: number) => void;
}

export class ScrollController {
  private destroyed = false;
  private readonly onProgress: (progress: number) => void;
  private readonly track: HTMLElement;
  private readonly onScroll: () => void;

  constructor(options: ScrollControllerOptions, track: HTMLElement) {
    this.onProgress = options.onProgress;
    this.track = track;

    this.onScroll = () => {
      if (this.destroyed) return;
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      const trackStart = this.track.getBoundingClientRect().top + scrollTop;
      const scrollDistance = Math.max(1, this.track.offsetHeight);
      const progress = Math.max(0, Math.min(1, (scrollTop - trackStart) / scrollDistance));
      this.onProgress(progress);
    };

    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onScroll, { passive: true });
    window.addEventListener('pageshow', this.onScroll);
    this.onScroll();
  }

  public getProgress(): number {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const trackStart = this.track.getBoundingClientRect().top + scrollTop;
    const scrollDistance = Math.max(1, this.track.offsetHeight);
    return Math.max(0, Math.min(1, (scrollTop - trackStart) / scrollDistance));
  }

  public destroy(): void {
    this.destroyed = true;
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onScroll);
    window.removeEventListener('pageshow', this.onScroll);
  }
}
