/**
 * Fetch the complete compressed sequence before the hero appears. On narrow
 * mobile devices, pre-decode the frames to a device-appropriate bitmap size so
 * scrolling does not trigger a new JPEG decode for every frame.
 */

const frameBlobs = new Map<number, Blob>();
const frameObjectUrls = new Map<number, string>();
const predecodedFrames = new Map<number, ImageBitmap>();
const sharedBitmaps = new WeakSet<ImageBitmap>();

export function getPreloadedFrameBlob(index: number): Blob | undefined {
  return frameBlobs.get(index);
}

export function getPreloadedFrameUrl(index: number): string | undefined {
  return frameObjectUrls.get(index);
}

export function getPredecodedFrameBitmap(index: number): ImageBitmap | undefined {
  return predecodedFrames.get(index);
}

export function isSharedPredecodedBitmap(bitmap: ImageBitmap): boolean {
  return sharedBitmaps.has(bitmap);
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

      let succeeded = frameBlobs.has(frame) || predecodedFrames.has(frame);
      if (!succeeded) {
        for (let attempt = 0; attempt < 3 && !signal.aborted; attempt += 1) {
          try {
            const filename = `/ezgif-frame-${String(frame).padStart(3, '0')}.jpg`;
            const response = await fetch(filename, { cache: 'force-cache', signal });
            if (!response.ok) {
              throw new Error(`Frame ${frame} returned HTTP ${response.status}`);
            }

            const blob = await response.blob();
            if (signal.aborted) return;

            frameBlobs.set(frame, blob);
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

export interface FrameDecodeOptions {
  totalFrames: number;
  concurrency: number;
  decodeWidth: number;
  signal: AbortSignal;
  onProgress: (completed: number, total: number) => void;
}

export async function predecodeFrameSequence({
  totalFrames,
  concurrency,
  decodeWidth,
  signal,
  onProgress,
}: FrameDecodeOptions): Promise<number[]> {
  let nextFrame = 1;
  let completed = 0;
  const failures: number[] = [];
  const decodeHeight = Math.round(decodeWidth * 9 / 16);

  const worker = async (): Promise<void> => {
    while (!signal.aborted) {
      const frame = nextFrame;
      nextFrame += 1;
      if (frame > totalFrames) return;

      let succeeded = predecodedFrames.has(frame);
      if (!succeeded) {
        const blob = frameBlobs.get(frame);
        if (!blob || typeof createImageBitmap !== 'function') {
          failures.push(frame);
        } else {
          try {
            const bitmap = await createImageBitmap(blob, {
              resizeWidth: decodeWidth,
              resizeHeight: decodeHeight,
              resizeQuality: 'high',
            });
            if (signal.aborted) {
              bitmap.close();
              return;
            }

            predecodedFrames.set(frame, bitmap);
            sharedBitmaps.add(bitmap);
            succeeded = true;

            // The decoded bitmap is now the source of truth for this frame.
            frameBlobs.delete(frame);
            const objectUrl = frameObjectUrls.get(frame);
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            frameObjectUrls.delete(frame);
          } catch (error) {
            console.error('Unable to pre-decode cinematic frame', frame, error);
            failures.push(frame);
          }
        }
      }

      completed += 1;
      onProgress(completed, totalFrames);
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, totalFrames));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return failures;
}

/** Release all retained assets if the experience is deliberately torn down. */
export function releasePreloadedFrameSequence(): void {
  for (const objectUrl of frameObjectUrls.values()) URL.revokeObjectURL(objectUrl);
  frameObjectUrls.clear();
  frameBlobs.clear();
  for (const bitmap of predecodedFrames.values()) bitmap.close();
  predecodedFrames.clear();
}
