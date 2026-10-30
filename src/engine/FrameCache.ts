/**
 * Sliding-window LRU cache of decoded ImageBitmaps (§9.1–9.3).
 *
 * A decoded 1080p RGBA frame is ~8.3 MB. Caching all 300 frames = 2.49 GB,
 * which iOS WebKit terminates immediately — so only a bounded window of
 * bitmaps near the current scrub index is kept, and `bitmap.close()` is
 * called on every eviction to release the texture memory.
 */
export class FrameCache {
  readonly maxDecoded: number
  private readonly raw = new Map<number, ArrayBuffer>()
  private readonly decoded = new Map<number, ImageBitmap>()
  private readonly order: number[] = [] // LRU order, oldest first
  private readonly inFlight = new Map<number, Promise<ImageBitmap | null>>()

  constructor(
    private readonly total: number,
    maxDecoded: number,
  ) {
    this.maxDecoded = maxDecoded
  }

  storeRaw(index: number, buffer: ArrayBuffer): void {
    if (!this.raw.has(index)) this.raw.set(index, buffer)
  }

  hasRaw(index: number): boolean {
    return this.raw.has(index)
  }

  get rawCount(): number {
    return this.raw.size
  }

  /**
   * Resolve the decoded bitmap for `index`, decoding from the stored raw
   * buffer if needed. The in-flight promise is registered synchronously so
   * two concurrent requests never double-decode the same frame.
   */
  getFrame(index: number, targetIndex: number): Promise<ImageBitmap | null> {
    if (index < 0 || index >= this.total) return Promise.resolve(null)

    const cached = this.decoded.get(index)
    if (cached) {
      this.touch(index)
      return Promise.resolve(cached)
    }

    const pending = this.inFlight.get(index)
    if (pending) return pending

    const raw = this.raw.get(index)
    if (!raw) return Promise.resolve(null)

    let settle!: (bitmap: ImageBitmap | null) => void
    const promise = new Promise<ImageBitmap | null>((resolve) => {
      settle = resolve
    })
    this.inFlight.set(index, promise)

    void this.decode(index, targetIndex)
      .then(
        (bitmap) => settle(bitmap),
        () => settle(null),
      )

    return promise
  }

  private async decode(index: number, targetIndex: number): Promise<ImageBitmap | null> {
    const raw = this.raw.get(index)
    if (!raw) return null
    try {
      const blob = new Blob([raw], { type: 'image/webp' })
      const bitmap = await createImageBitmap(blob)
      // A stale decode that scrubs far outside the window is worthless:
      // discard it immediately rather than holding the texture.
      if (Math.abs(index - targetIndex) > this.maxDecoded) {
        bitmap.close()
        return null
      }
      this.insert(index, bitmap)
      return bitmap
    } catch (err) {
      console.warn(`Frame decode failed for index ${index}`, err)
      return null
    } finally {
      this.inFlight.delete(index)
    }
  }

  private insert(index: number, bitmap: ImageBitmap): void {
    this.evict()
    this.decoded.set(index, bitmap)
    this.touch(index)
  }

  private touch(index: number): void {
    const at = this.order.indexOf(index)
    if (at >= 0) this.order.splice(at, 1)
    this.order.push(index)
  }

  private evict(): void {
    while (this.decoded.size >= this.maxDecoded) {
      const victim = this.order.shift()
      if (victim === undefined) break
      const bitmap = this.decoded.get(victim)
      if (bitmap) bitmap.close() // immediate GPU texture release
      this.decoded.delete(victim)
    }
  }

  purge(): void {
    for (const bitmap of this.decoded.values()) bitmap.close()
    this.decoded.clear()
    this.order.length = 0
  }
}
