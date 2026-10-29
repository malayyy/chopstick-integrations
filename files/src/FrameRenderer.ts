/**
 * Canvas image-sequence renderer.
 * - Sharp foreground preserves the complete source frame.
 * - A low-resolution, darkened blurred copy fills ultrawide side areas.
 * - Only the most recently requested frame can be drawn after async loading.
 * - A bounded LRU cache and limited concurrent requests control memory/network use.
 */

import { PerformanceController } from './PerformanceController';

export class FrameRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bgCanvas: HTMLCanvasElement;
  private readonly bgCtx: CanvasRenderingContext2D;
  private readonly totalFrames: number;
  private readonly maxCacheSize: number;
  private readonly maxConcurrentLoads = 6;

  private cache = new Map<number, HTMLImageElement>();
  private inFlight = new Map<number, HTMLImageElement>();
  private failed = new Set<number>();
  private queue: number[] = [];
  private activeLoads = 0;
  private desiredFrame = 1;
  private renderedFrame = -1;
  private dpr = 1;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, totalFrames = 300, maxCacheSize = 42) {
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('This browser could not create a 2D canvas context.');

    this.canvas = canvas;
    this.ctx = ctx;
    this.totalFrames = totalFrames;
    this.maxCacheSize = Math.max(18, maxCacheSize);
    this.bgCanvas = document.createElement('canvas');
    const bgCtx = this.bgCanvas.getContext('2d', { alpha: false });
    if (!bgCtx) throw new Error('This browser could not create the background canvas context.');
    this.bgCtx = bgCtx;

    this.resize();
    this.render(1, true);
  }

  private frameUrl(index: number): string {
    // Vite's publicDir maps the sibling /frames folder to the URL root.
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
      // Protect the active frame first, then evict the least recently used image.
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
    if (this.queue.includes(index)) {
      if (priority) {
        this.queue = this.queue.filter((queued) => queued !== index);
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
        // Crucial: a late image load must not overwrite the frame the user currently wants.
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
    const radius = PerformanceController.isMobile() ? 4 : 8;
    const start = Math.max(1, center - radius);
    const end = Math.min(this.totalFrames, center + radius);

    // Discard obsolete, not-yet-started prefetch requests when the user scrolls quickly.
    this.queue = this.queue.filter((index) => Math.abs(index - center) <= radius);
    for (let distance = 1; distance <= radius; distance += 1) {
      const forward = center + distance;
      const backward = center - distance;
      if (forward <= end) this.enqueue(forward, false);
      if (backward >= start) this.enqueue(backward, false);
    }
  }

  public resize(): void {
    if (this.destroyed) return;
    this.dpr = PerformanceController.getDevicePixelRatioCap();
    const width = Math.max(1, Math.round(window.innerWidth * this.dpr));
    const height = Math.max(1, Math.round(window.innerHeight * this.dpr));

    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;

    // Render the atmospheric layer at reduced resolution to keep GPU/CPU costs sane.
    this.bgCanvas.width = Math.max(1, Math.round(width * 0.55));
    this.bgCanvas.height = Math.max(1, Math.round(height * 0.55));
    this.bgCtx.imageSmoothingEnabled = true;
    this.bgCtx.imageSmoothingQuality = 'high';

    const visible = this.cache.get(this.desiredFrame);
    if (visible) this.draw(this.desiredFrame, true);
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

    this.drawComposite(image);
    this.renderedFrame = index;
  }

  private drawComposite(image: HTMLImageElement): void {
    const ctx = this.ctx;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Background duplicate: cover the viewport, blur and darken it to extend the scene.
    const bgWidth = this.bgCanvas.width;
    const bgHeight = this.bgCanvas.height;
    const coverScale = Math.max(bgWidth / imageWidth, bgHeight / imageHeight);
    const coverWidth = imageWidth * coverScale;
    const coverHeight = imageHeight * coverScale;
    const coverX = (bgWidth - coverWidth) / 2;
    const coverY = (bgHeight - coverHeight) / 2;
    const blur = Math.max(8, Math.round(Math.max(bgWidth, bgHeight) * 0.018));

    this.bgCtx.fillStyle = '#000';
    this.bgCtx.fillRect(0, 0, bgWidth, bgHeight);
    this.bgCtx.save();
    this.bgCtx.filter = `blur(${blur}px) brightness(0.30) saturate(1.15)`;
    const pad = blur * 2;
    this.bgCtx.drawImage(
      image,
      coverX - pad,
      coverY - pad,
      coverWidth + pad * 2,
      coverHeight + pad * 2,
    );
    this.bgCtx.restore();
    ctx.drawImage(this.bgCanvas, 0, 0, canvasWidth, canvasHeight);

    // Foreground: contain the complete source composition without stretching/cropping.
    const containScale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
    const foregroundWidth = imageWidth * containScale;
    const foregroundHeight = imageHeight * containScale;
    const foregroundX = (canvasWidth - foregroundWidth) / 2;
    const foregroundY = (canvasHeight - foregroundHeight) / 2;
    ctx.drawImage(image, foregroundX, foregroundY, foregroundWidth, foregroundHeight);

    // A subtle edge blend only when the image leaves horizontal side space.
    if (foregroundX > 0) {
      const blendWidth = Math.min(foregroundX, Math.max(24, foregroundWidth * 0.07));
      const left = ctx.createLinearGradient(0, 0, foregroundX + blendWidth, 0);
      left.addColorStop(0, 'rgba(0,0,0,0.25)');
      left.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = left;
      ctx.fillRect(0, 0, foregroundX + blendWidth, canvasHeight);

      const right = ctx.createLinearGradient(canvasWidth, 0, foregroundX + foregroundWidth - blendWidth, 0);
      right.addColorStop(0, 'rgba(0,0,0,0.25)');
      right.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = right;
      ctx.fillRect(foregroundX + foregroundWidth - blendWidth, 0, canvasWidth - foregroundX - foregroundWidth + blendWidth, canvasHeight);
    }
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
    this.bgCanvas.width = 1;
    this.bgCanvas.height = 1;
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}
