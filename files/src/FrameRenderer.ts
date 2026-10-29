/**
 * Responsive scroll-sequence renderer.
 *
 * All compressed frames are preloaded before the intro appears. On mobile,
 * decode each JPEG into a viewport-sized ImageBitmap rather than a full 4K
 * bitmap; this avoids the heavy decode/cache bottleneck that makes scrubbing
 * appear frozen in mobile WebKit.
 */

import { getPreloadedFrameBlob, getPreloadedFrameUrl } from './FrameAssets';
import { PerformanceController } from './PerformanceController';

type FrameAsset = ImageBitmap | HTMLImageElement;

export class FrameRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly maskCtx: CanvasRenderingContext2D;
  private readonly totalFrames: number;
  private readonly maxCacheSize: number;
  private readonly maxConcurrentLoads = PerformanceController.isMobile() ? 8 : 6;

  private cache = new Map<number, FrameAsset>();
  private inFlight = new Map<number, { token: symbol; priority: boolean }>();
  private failed = new Set<number>();
  private queue: number[] = [];
  private priorityQueue = new Set<number>();
  private activeLoads = 0;
  private desiredFrame = 1;
  private renderedFrame = -1;
  private destroyed = false;
  private maskKey = '';

  constructor(canvas: HTMLCanvasElement, totalFrames = 300, maxCacheSize = 10) {
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) throw new Error('This browser could not create a 2D canvas context.');

    this.canvas = canvas;
    this.ctx = ctx;
    this.totalFrames = totalFrames;
    this.maxCacheSize = Math.max(6, maxCacheSize);
    this.maskCanvas = document.createElement('canvas');
    const maskCtx = this.maskCanvas.getContext('2d', { alpha: true });
    if (!maskCtx) throw new Error('This browser could not create the composition mask.');
    this.maskCtx = maskCtx;

    this.resize();
    this.render(1, true);
  }

  private frameUrl(index: number): string {
    return getPreloadedFrameUrl(index)
      ?? `/ezgif-frame-${String(index).padStart(3, '0')}.jpg`;
  }

  private isBitmap(asset: FrameAsset): asset is ImageBitmap {
    return typeof ImageBitmap !== 'undefined' && asset instanceof ImageBitmap;
  }

  private releaseAsset(asset: FrameAsset): void {
    if (this.isBitmap(asset)) {
      asset.close();
      return;
    }
    asset.onload = null;
    asset.onerror = null;
    asset.src = '';
  }

  private decodeWidth(): number {
    return PerformanceController.getFrameDecodeWidth(this.canvas.width);
  }

  private async loadFrameAsset(index: number): Promise<FrameAsset> {
    const blob = getPreloadedFrameBlob(index);
    const width = this.decodeWidth();
    const height = Math.round(width * 9 / 16);

    if (blob && typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(blob, {
          resizeWidth: width,
          resizeHeight: height,
          resizeQuality: 'high',
        });
      } catch (error) {
        // Older WebKit builds may reject resize options; retain a compatible path.
        console.warn('Resized frame decode unavailable; using image fallback.', error);
      }
    }

    const image = new Image();
    image.decoding = 'async';
    const src = this.frameUrl(index);

    if (typeof image.decode === 'function') {
      image.src = src;
      await image.decode();
      return image;
    }

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Frame ${index} failed to decode`));
      image.src = src;
    });
    return image;
  }

  private touchCache(index: number): FrameAsset | undefined {
    const asset = this.cache.get(index);
    if (!asset) return undefined;
    this.cache.delete(index);
    this.cache.set(index, asset);
    return asset;
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.maxCacheSize) {
      const victim = [...this.cache.keys()].find((key) => key !== this.desiredFrame);
      if (victim === undefined) break;
      const asset = this.cache.get(victim);
      this.cache.delete(victim);
      if (asset) this.releaseAsset(asset);
    }
  }

  private enqueue(index: number, priority = false): void {
    if (this.destroyed || index < 1 || index > this.totalFrames) return;
    if (this.cache.has(index) || this.failed.has(index)) return;

    const active = this.inFlight.get(index);
    if (active) {
      if (priority) active.priority = true;
      return;
    }

    const queuedAt = this.queue.indexOf(index);
    if (queuedAt >= 0) {
      if (priority) {
        this.queue.splice(queuedAt, 1);
        this.queue.unshift(index);
        this.priorityQueue.add(index);
      }
      return;
    }

    if (priority) {
      this.queue.unshift(index);
      this.priorityQueue.add(index);
    } else {
      this.queue.push(index);
    }
    this.pumpQueue();
  }

  private pumpQueue(): void {
    while (!this.destroyed && this.activeLoads < this.maxConcurrentLoads && this.queue.length > 0) {
      const index = this.queue.shift()!;
      const isPriority = this.priorityQueue.has(index) || index === this.desiredFrame;
      this.priorityQueue.delete(index);
      if (this.cache.has(index) || this.inFlight.has(index) || this.failed.has(index)) continue;

      const entry = { token: Symbol(`frame-${index}`), priority: isPriority };
      this.inFlight.set(index, entry);
      this.activeLoads += 1;

      void this.loadFrameAsset(index).then((asset) => {
        // If destroyed or deliberately cancelled, dispose the stale bitmap.
        if (this.destroyed || this.inFlight.get(index) !== entry) {
          this.releaseAsset(asset);
          return;
        }

        this.inFlight.delete(index);
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        this.cache.set(index, asset);
        this.evictIfNeeded();

        if (index === this.desiredFrame) this.draw(index, true);
        this.pumpQueue();
      }).catch((error: unknown) => {
        if (this.inFlight.get(index) !== entry) return;
        this.inFlight.delete(index);
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        this.failed.add(index);
        console.error('Unable to decode animation frame', index, error);
        if (!this.destroyed && index === this.desiredFrame) this.drawNearestAvailable();
        this.pumpQueue();
      });
    }
  }

  private scheduleNeighborhood(center: number): void {
    const mobile = PerformanceController.isMobile();
    const radius = mobile ? 14 : (window.innerWidth >= 2560 ? 6 : 8);
    const start = Math.max(1, center - radius);
    const end = Math.min(this.totalFrames, center + radius);

    // Keep active target decodes alive, but cancel stale prefetches. This leaves
    // capacity for the newest requested frame during continuous touch scrolling.
    for (const [index, entry] of this.inFlight) {
      if (entry.priority || Math.abs(index - center) <= radius) continue;
      this.inFlight.delete(index);
      this.activeLoads = Math.max(0, this.activeLoads - 1);
    }

    this.queue = this.queue.filter((index) => {
      const keep = Math.abs(index - center) <= radius;
      if (!keep) this.priorityQueue.delete(index);
      return keep;
    });
    for (let distance = 1; distance <= radius; distance += 1) {
      const forward = center + distance;
      const backward = center - distance;
      if (forward <= end) this.enqueue(forward);
      if (backward >= start) this.enqueue(backward);
    }
    this.pumpQueue();
  }

  public resize(): void {
    if (this.destroyed) return;
    const dpr = PerformanceController.getDevicePixelRatioCap();
    const width = Math.max(1, Math.round(window.innerWidth * dpr));
    const height = Math.max(1, Math.round(window.innerHeight * dpr));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.maskCanvas.width = Math.max(1, Math.ceil(width * 0.25));
      this.maskCanvas.height = Math.max(1, Math.ceil(height * 0.25));
      this.maskKey = '';
    }

    const visible = this.cache.get(this.desiredFrame);
    if (visible) this.draw(this.desiredFrame, true);
    else this.enqueue(this.desiredFrame, true);
  }

  public render(frameIndex: number, force = false): boolean {
    if (this.destroyed) return false;
    const index = Math.max(1, Math.min(this.totalFrames, Math.round(frameIndex)));
    if (index !== this.desiredFrame) {
      const previousTarget = this.inFlight.get(this.desiredFrame);
      if (previousTarget) previousTarget.priority = false;
    }
    this.desiredFrame = index;
    const asset = this.touchCache(index);

    if (asset) {
      if (force || index !== this.renderedFrame) this.draw(index, true);
      this.scheduleNeighborhood(index);
      return true;
    }

    this.enqueue(index, true);
    this.scheduleNeighborhood(index);
    // Keep the visual responding while the exact target bitmap is decoding.
    // The nearest ready frame is preferable to leaving an old frame frozen.
    if (this.cache.size > 0) this.drawNearestAvailable();
    return false;
  }

  private drawNearestAvailable(): void {
    if (this.destroyed || this.cache.size === 0) return;
    let nearestIndex: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const [index, asset] of this.cache) {
      const hasPixels = this.isBitmap(asset) || (asset.complete && asset.naturalWidth > 0);
      if (!hasPixels) continue;
      const distance = Math.abs(index - this.desiredFrame);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    }
    if (nearestIndex !== null && nearestIndex !== this.renderedFrame) {
      this.draw(nearestIndex, true);
    }
  }

  private draw(index: number, force = false): void {
    const asset = this.cache.get(index);
    if (!asset) return;
    if (!this.isBitmap(asset) && (!asset.complete || asset.naturalWidth === 0)) return;
    if (!force && index === this.renderedFrame) return;
    this.drawFrame(asset);
    this.renderedFrame = index;
  }

  private assetDimensions(asset: FrameAsset): { width: number; height: number } {
    return this.isBitmap(asset)
      ? { width: asset.width, height: asset.height }
      : { width: asset.naturalWidth, height: asset.naturalHeight };
  }

  private prepareFeatherMask(imageWidth: number, imageHeight: number): void {
    const maskWidth = this.maskCanvas.width;
    const maskHeight = this.maskCanvas.height;
    const key = `${maskWidth}x${maskHeight}:${imageWidth}x${imageHeight}`;
    if (key === this.maskKey) return;

    const scale = Math.min(maskWidth / imageWidth, maskHeight / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const left = (maskWidth - drawWidth) / 2;
    const top = (maskHeight - drawHeight) / 2;
    const fadeX = Math.max(2, Math.min(26, drawWidth * 0.045));
    const fadeY = Math.max(2, Math.min(22, drawHeight * 0.075));
    const pixels = this.maskCtx.createImageData(maskWidth, maskHeight);

    for (let y = 0; y < maskHeight; y += 1) {
      for (let x = 0; x < maskWidth; x += 1) {
        const offset = (y * maskWidth + x) * 4;
        const edgeX = Math.min(x - left, left + drawWidth - x);
        const edgeY = Math.min(y - top, top + drawHeight - y);
        const inFrame = edgeX >= 0 && edgeY >= 0;
        const alphaX = Math.max(0, Math.min(1, edgeX / fadeX));
        const alphaY = Math.max(0, Math.min(1, edgeY / fadeY));
        pixels.data[offset] = 255;
        pixels.data[offset + 1] = 255;
        pixels.data[offset + 2] = 255;
        pixels.data[offset + 3] = inFrame ? Math.round(255 * Math.min(alphaX, alphaY)) : 0;
      }
    }

    this.maskCtx.putImageData(pixels, 0, 0);
    this.maskKey = key;
  }

  private drawFrame(asset: FrameAsset): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const { width: imageWidth, height: imageHeight } = this.assetDimensions(asset);
    const scale = Math.min(width / imageWidth, height / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const drawX = (width - drawWidth) / 2;
    const drawY = (height - drawHeight) / 2;

    this.ctx.clearRect(0, 0, width, height);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.drawImage(asset, drawX, drawY, drawWidth, drawHeight);

    this.prepareFeatherMask(imageWidth, imageHeight);
    this.ctx.globalCompositeOperation = 'destination-in';
    this.ctx.drawImage(this.maskCanvas, 0, 0, width, height);
    this.ctx.globalCompositeOperation = 'source-over';
  }

  public getRenderedFrame(): number {
    return this.renderedFrame;
  }

  public destroy(): void {
    this.destroyed = true;
    this.queue = [];
    this.priorityQueue.clear();

    for (const asset of this.cache.values()) this.releaseAsset(asset);
    this.inFlight.clear();
    this.cache.clear();
    this.failed.clear();
    this.maskCanvas.width = 1;
    this.maskCanvas.height = 1;
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}
