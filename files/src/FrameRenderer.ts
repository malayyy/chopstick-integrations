/**
 * Scroll-driven frame renderer.
 * The ambient atmosphere is a separate CSS layer, so it keeps moving while
 * the sharp image sequence stays locked to the user's scroll position.
 */

import { PerformanceController } from './PerformanceController';

export class FrameRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly totalFrames: number;
  private readonly maxCacheSize: number;
  private readonly maxConcurrentLoads = 4;

  private cache = new Map<number, HTMLImageElement>();
  private inFlight = new Map<number, HTMLImageElement>();
  private failed = new Set<number>();
  private queue: number[] = [];
  private activeLoads = 0;
  private desiredFrame = 1;
  private renderedFrame = -1;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, totalFrames = 300, maxCacheSize = 12) {
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) throw new Error('This browser could not create a 2D canvas context.');

    this.canvas = canvas;
    this.ctx = ctx;
    this.totalFrames = totalFrames;
    this.maxCacheSize = Math.max(5, maxCacheSize);

    this.resize();
    this.render(1, true);
  }

  private frameUrl(index: number): string {
    return `/ezgif-frame-${String(index).padStart(3, '0')}.jpg`;
  }

  private touchCache(index: number): HTMLImageElement | undefined {
    const image = this.cache.get(index);
    if (!image) return undefined;
    this.cache.delete(index);
    this.cache.set(index, image);
    return image;
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.maxCacheSize) {
      const victim = [...this.cache.keys()].find((key) => key !== this.desiredFrame);
      if (victim === undefined) break;
      const image = this.cache.get(victim);
      this.cache.delete(victim);
      if (image) image.src = '';
    }
  }

  private enqueue(index: number, priority = false): void {
    if (this.destroyed || index < 1 || index > this.totalFrames) return;
    if (this.cache.has(index) || this.inFlight.has(index) || this.failed.has(index)) return;

    const queuedAt = this.queue.indexOf(index);
    if (queuedAt >= 0) {
      if (priority) {
        this.queue.splice(queuedAt, 1);
        this.queue.unshift(index);
      }
      return;
    }

    if (priority) this.queue.unshift(index);
    else this.queue.push(index);
    this.pumpQueue();
  }

  private pumpQueue(): void {
    while (!this.destroyed && this.activeLoads < this.maxConcurrentLoads && this.queue.length > 0) {
      const index = this.queue.shift()!;
      if (this.cache.has(index) || this.inFlight.has(index) || this.failed.has(index)) continue;

      const image = new Image();
      image.decoding = 'async';
      this.inFlight.set(index, image);
      this.activeLoads += 1;

      image.onload = () => {
        this.inFlight.delete(index);
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        if (this.destroyed) return;
        this.cache.set(index, image);
        this.evictIfNeeded();
        // A late request must never replace a newer frame target.
        if (index === this.desiredFrame) this.draw(index, true);
        this.pumpQueue();
      };

      image.onerror = () => {
        this.inFlight.delete(index);
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        this.failed.add(index);
        if (!this.destroyed && index === this.desiredFrame) this.drawNearestAvailable();
        this.pumpQueue();
      };

      image.src = this.frameUrl(index);
    }
  }

  private scheduleNeighborhood(center: number): void {
    const radius = PerformanceController.isMobile() ? 3 : 6;
    const start = Math.max(1, center - radius);
    const end = Math.min(this.totalFrames, center + radius);

    // Drop stale prefetch requests so fast scrolling prioritizes nearby frames.
    this.queue = this.queue.filter((index) => Math.abs(index - center) <= radius);
    for (let distance = 1; distance <= radius; distance += 1) {
      if (center + distance <= end) this.enqueue(center + distance);
      if (center - distance >= start) this.enqueue(center - distance);
    }
  }

  public resize(): void {
    if (this.destroyed) return;
    const dpr = PerformanceController.getDevicePixelRatioCap();
    const width = Math.max(1, Math.round(window.innerWidth * dpr));
    const height = Math.max(1, Math.round(window.innerHeight * dpr));
    if (this.canvas.width === width && this.canvas.height === height) return;

    this.canvas.width = width;
    this.canvas.height = height;

    const current = this.cache.get(this.desiredFrame);
    if (current) this.draw(this.desiredFrame, true);
    else this.enqueue(this.desiredFrame, true);
  }

  public render(frameIndex: number, force = false): boolean {
    if (this.destroyed) return false;
    const index = Math.max(1, Math.min(this.totalFrames, Math.round(frameIndex)));
    this.desiredFrame = index;
    const image = this.touchCache(index);

    if (image && image.complete && image.naturalWidth > 0) {
      if (force || index !== this.renderedFrame) this.draw(index, true);
      this.scheduleNeighborhood(index);
      return true;
    }

    this.enqueue(index, true);
    this.scheduleNeighborhood(index);
    if (this.renderedFrame < 0) this.drawNearestAvailable();
    return false;
  }

  private drawNearestAvailable(): void {
    if (this.destroyed || this.cache.size === 0) return;
    let nearestIndex: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const [index, image] of this.cache) {
      if (!image.complete || image.naturalWidth === 0) continue;
      const distance = Math.abs(index - this.desiredFrame);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    }
    if (nearestIndex !== null) this.draw(nearestIndex, true);
  }

  private draw(index: number, force = false): void {
    const image = this.cache.get(index);
    if (!image || !image.complete || image.naturalWidth === 0) return;
    if (!force && index === this.renderedFrame) return;
    this.drawFrame(image);
    this.renderedFrame = index;
  }

  private drawFrame(image: HTMLImageElement): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;
    const scale = Math.min(width / imageWidth, height / imageHeight);
    const drawWidth = Math.round(imageWidth * scale);
    const drawHeight = Math.round(imageHeight * scale);
    const drawX = Math.round((width - drawWidth) / 2);
    const drawY = Math.round((height - drawHeight) / 2);

    this.ctx.clearRect(0, 0, width, height);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  }

  public getRenderedFrame(): number {
    return this.renderedFrame;
  }

  public destroy(): void {
    this.destroyed = true;
    this.queue = [];

    for (const image of this.inFlight.values()) {
      image.onload = null;
      image.onerror = null;
      image.src = '';
    }
    for (const image of this.cache.values()) {
      image.onload = null;
      image.onerror = null;
      image.src = '';
    }

    this.inFlight.clear();
    this.cache.clear();
    this.failed.clear();
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}
