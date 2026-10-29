/**
 * Fetch and retain the complete, compressed frame sequence before the intro
 * appears. Phones use a generated 640px WebP sequence; larger displays retain
 * the original high-resolution JPG frames.
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
  useMobileFrames?: boolean;
  onProgress: (completed: number, total: number) => void;
}

function getFramePath(index: number, useMobileFrames: boolean): string {
  const filename = `ezgif-frame-${String(index).padStart(3, '0')}`;
  return useMobileFrames
    ? `/frames-mobile/${filename}.webp`
    : `/${filename}.jpg`;
}

export async function preloadFrameSequence({
  totalFrames,
  concurrency,
  signal,
  useMobileFrames = false,
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
            const response = await fetch(getFramePath(frame, useMobileFrames), {
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
            if (attempt === 2) console.error('Unable to preload cinematic frame', frame, error);
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

export function releasePreloadedFrameSequence(): void {
  for (const objectUrl of frameObjectUrls.values()) URL.revokeObjectURL(objectUrl);
  frameObjectUrls.clear();
  frameBlobs.clear();
}
