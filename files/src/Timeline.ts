/** Maps normalized scroll progress [0,1] to frame indices [1,300]. */
export interface TimelineState {
  targetFrame: number;
  progress: number;
}

export class Timeline {
  public static readonly TOTAL_FRAMES = 300;

  public static getState(progress: number): TimelineState {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    return {
      targetFrame: Math.round(1 + clamped * (this.TOTAL_FRAMES - 1)),
      progress: clamped,
    };
  }
}
