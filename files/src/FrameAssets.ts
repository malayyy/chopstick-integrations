/**
 * Fetch and retain the compressed frames before the intro is shown.
 * The renderer can create viewport-sized ImageBitmaps from the original blobs,
 * avoiding full 4K decoded images on phones.
 */

const frameBlobs = new Map<number, Blob>();
const frameObjectUrls = new Map<number, string>();

export function getPreloadedFrameBlob(index: number): Blob | undefined {
  return frameBlobs.get(index);
}

export function getPreloadedFrameUrl(index: number): string | undefined {
  return frameObjectUrls.get(index);
}

export interface FramePreloadOptions {
  totalFrames: number;
  concurrency: number;
  signal: AbortSignal;
  onProgress: (completed: number, total: number) => void;
}

export async function preloadFrameSequence({
  totalFrames,
  concurrency,
  signal,
  onProgress,
}: FramePreloadOptions): Promise<number[]> {
  let nextFrame = 1;
  let completed = 0;
  const failures: number[] = [];

  const worker = async (): Promise<void> => {
    while (!signal.aborted) {
      const frame = nextFrame;
      nextFrame += 1;
      if (frame > totalFrames) return;

      let succeeded = frameBlobs.has(frame);
      if (!succeeded) {
        for (let attempt = 0; attempt < 3 && !signal.aborted; attempt += 1) {
          try {
            const filename = `/ezgif-frame-${String(frame).padStart(3, '0')}.jpg`;
            const response = await fetch(filename, {
              cache: 'force-cache',
              signal,
            });
            if (!response.ok) {
              throw new Error(`Frame ${frame} returned HTTP ${response.status}`);
            }

            const blob = await response.blob();
            if (signal.aborted) return;

            frameBlobs.set(frame, blob);
            const previousUrl = frameObjectUrls.get(frame);
            if (previousUrl) URL.revokeObjectURL(previousUrl);
            frameObjectUrls.set(frame, URL.createObjectURL(blob));
            succeeded = true;
            break;
          } catch (error) {
            if (signal.aborted) return;
            if (attempt === 2) {
              console.error('Unable to preload cinematic frame', frame, error);
            }
          }
        }
      }

      if (!succeeded) failures.push(frame);
      completed += 1;
      onProgress(completed, totalFrames);
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, totalFrames));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return failures;
}

/** Release retained blobs if the cinematic experience is deliberately torn down. */
export function releasePreloadedFrameSequence(): void {
  for (const objectUrl of frameObjectUrls.values()) URL.revokeObjectURL(objectUrl);
  frameObjectUrls.clear();
  frameBlobs.clear();
}
