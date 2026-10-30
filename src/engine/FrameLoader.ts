import { expansionOrder, frameUrl, priorityWindow } from '../utils/math'
import type { FrameCache } from './FrameCache'

/**
 * Progressive frame streamer (§7.2 / §9.4).
 *
 * Stage 1 (awaited): the priority window around the current index so the
 * restored/paint frame renders immediately — never flash frame 0.
 * Stage 2 (background): nearest-first outward expansion with bounded
 * fetch concurrency, storing raw ArrayBuffers into the cache.
 */
export class FrameLoader {
  private readonly fetched = new Set<number>()
  private stopped = false

  constructor(
    private readonly cache: FrameCache,
    private readonly total: number,
  ) {}

  get progress(): number {
    return this.fetched.size / this.total
  }

  stop(): void {
    this.stopped = true
  }

  async start(startIndex: number): Promise<void> {
    await this.fetchList(priorityWindow(startIndex).filter((i) => i < this.total))
    // Not awaited: background expansion proceeds off the critical path.
    void this.fetchList(expansionOrder(startIndex, this.total))
  }

  private async fetchList(indices: number[]): Promise<void> {
    const CONCURRENCY = 10
    let cursor = 0

    const worker = async (): Promise<void> => {
      while (cursor < indices.length && !this.stopped) {
        const index = indices[cursor++]
        if (this.fetched.has(index)) continue
        this.fetched.add(index) // claim before fetch: no double-download
        try {
          const res = await fetch(frameUrl(index), { priority: 'low', cache: 'force-cache' })
          if (!res.ok) {
            this.fetched.delete(index)
            continue
          }
          this.cache.storeRaw(index, await res.arrayBuffer())
        } catch {
          this.fetched.delete(index) // allow retry on next expansion pass
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  }
}
