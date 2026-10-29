/**
 * Preloads the complete cinematic sequence into browser-managed Blob URLs.
 * Compressed frame bytes stay available for scrubbing, while FrameRenderer
 * decodes only its small active cache instead of keeping 300 decoded 4K images.
 */

const frameObjectUrls = new Map<number, string>();

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

      let succeeded = frameObjectUrls.has(frame);
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

            const objectUrl = URL.createObjectURL(blob);
            const previousUrl = frameObjectUrls.get(frame);
            if (previousUrl) URL.revokeObjectURL(previousUrl);
            frameObjectUrls.set(frame, objectUrl);
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

/** Release retained compressed blobs when deliberately leaving the experience. */
export function releasePreloadedFrameSequence(): void {
  for (const objectUrl of frameObjectUrls.values()) URL.revokeObjectURL(objectUrl);
  frameObjectUrls.clear();
}
